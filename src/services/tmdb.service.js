const pool = require('../config/db');

const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const TMDB_LANGUAGE = process.env.TMDB_LANGUAGE || 'es-ES';
const TMDB_REGION = process.env.TMDB_REGION || 'AR';

function assertConfigured() {
  if (!process.env.TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY no configurada en .env');
  }
}

async function tmdbFetch(path, params = {}) {
  assertConfigured();
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('language', TMDB_LANGUAGE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Nombres de TMDB que ya existen en tu seed pero con otro texto.
// Sin esto, la sync crearía "Ciencia ficción" al lado de tu "Sci-Fi" ya existente.
const GENRE_NAME_ALIASES = {
  'Ciencia ficción': 'Sci-Fi',
  'Suspense': 'Thriller',
};

const PROVIDER_NAME_ALIASES = {
  'Amazon Prime Video': 'Prime',
  'Disney Plus': 'Disney+',
};

// -------- Géneros --------
async function syncGenresFromTMDB() {
  const { genres } = await tmdbFetch('/genre/movie/list');
  let created = 0, updated = 0;

  for (const g of genres) {
    const localName = GENRE_NAME_ALIASES[g.name] || g.name;

    // 1) ¿ya existe por tmdb_genre_id?
    const byTmdbId = await pool.query('SELECT id FROM genres WHERE tmdb_genre_id = $1', [g.id]);
    if (byTmdbId.rows.length > 0) { updated++; continue; }

    // 2) ¿existe por nombre (tu seed manual) pero sin tmdb_genre_id todavía?
    const byName = await pool.query('SELECT id FROM genres WHERE name = $1', [localName]);
    if (byName.rows.length > 0) {
      await pool.query('UPDATE genres SET tmdb_genre_id = $1 WHERE id = $2', [g.id, byName.rows[0].id]);
      updated++;
      continue;
    }

    // 3) no existe -> lo creamos
    await pool.query(
      'INSERT INTO genres (name, tmdb_genre_id) VALUES ($1, $2)',
      [localName, g.id]
    );
    created++;
  }

  return { created, updated };
}

// -------- Plataformas --------
async function syncProvidersFromTMDB(region = TMDB_REGION) {
  const { results } = await tmdbFetch('/watch/providers/movie', { watch_region: region });
  let created = 0, updated = 0;

  for (const p of results) {
    const localName = PROVIDER_NAME_ALIASES[p.provider_name] || p.provider_name;
    const logoUrl = p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : null;

    const byTmdbId = await pool.query(
      'SELECT id FROM streaming_providers WHERE tmdb_provider_id = $1', [p.provider_id]
    );
    if (byTmdbId.rows.length > 0) { updated++; continue; }

    const byName = await pool.query('SELECT id FROM streaming_providers WHERE name = $1', [localName]);
    if (byName.rows.length > 0) {
      await pool.query(
        'UPDATE streaming_providers SET tmdb_provider_id = $1, logo_url = COALESCE(logo_url, $2) WHERE id = $3',
        [p.provider_id, logoUrl, byName.rows[0].id]
      );
      updated++;
      continue;
    }

    // Placeholder de icon/color para providers nuevos que vos no habías sembrado
    await pool.query(
      `INSERT INTO streaming_providers (name, icon_label, color_hex, tmdb_provider_id, logo_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [localName, localName.slice(0, 2).toUpperCase(), '#5f5e5e', p.provider_id, logoUrl]
    );
    created++;
  }

  return { created, updated };
}

// -------- Películas populares (requiere que ya se haya corrido el sync de arriba) --------
async function importPopularMovies({ pages = 1, region = TMDB_REGION } = {}) {
  const genreRows = await pool.query('SELECT id, tmdb_genre_id FROM genres WHERE tmdb_genre_id IS NOT NULL');
  const genreMap = new Map(genreRows.rows.map((r) => [r.tmdb_genre_id, r.id]));

  const providerRows = await pool.query('SELECT id, tmdb_provider_id FROM streaming_providers WHERE tmdb_provider_id IS NOT NULL');
  const providerMap = new Map(providerRows.rows.map((r) => [r.tmdb_provider_id, r.id]));

  let imported = 0;

  for (let page = 1; page <= pages; page++) {
    const { results } = await tmdbFetch('/movie/popular', { page, region });

    for (const item of results) {
      // Detalle con runtime + watch/providers en una sola llamada extra
      const detail = await tmdbFetch(`/movie/${item.id}`, { append_to_response: 'watch/providers' });
      await sleep(250); // margen de rate-limit

      const posterUrl = detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null;
      const releaseYear = detail.release_date ? parseInt(detail.release_date.slice(0, 4), 10) : null;

      const { rows } = await pool.query(
        `INSERT INTO movies (title, overview, poster_url, release_year, duration_min, tmdb_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tmdb_id) DO UPDATE SET
           title = EXCLUDED.title,
           overview = EXCLUDED.overview,
           poster_url = EXCLUDED.poster_url,
           release_year = EXCLUDED.release_year,
           duration_min = EXCLUDED.duration_min
         RETURNING id`,
        [detail.title, detail.overview, posterUrl, releaseYear, detail.runtime || null, detail.id]
      );
      const movieId = rows[0].id;

      // Géneros
      for (const g of detail.genres || []) {
        const genreId = genreMap.get(g.id);
        if (genreId) {
          await pool.query(
            'INSERT INTO movie_genres (movie_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [movieId, genreId]
          );
        }
      }

      // Plataformas (flatrate = suscripción, que es lo que suele importar)
      const regionProviders = detail['watch/providers']?.results?.[region]?.flatrate || [];
      for (const p of regionProviders) {
        const providerId = providerMap.get(p.provider_id);
        if (providerId) {
          await pool.query(
            'INSERT INTO movie_providers (movie_id, provider_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [movieId, providerId]
          );
        }
      }

      imported++;
    }
  }

  return { imported };
}

async function getMovieDetails(tmdbId) {
  const [
    details,
    credits,
    videos,
    similar,
    providers
  ] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}`),
    tmdbFetch(`/movie/${tmdbId}/credits`),
    tmdbFetch(`/movie/${tmdbId}/videos`),
    tmdbFetch(`/movie/${tmdbId}/similar`),
    tmdbFetch(`/movie/${tmdbId}/watch/providers`)
  ]);

  const director =
    credits.crew.find(
      person => person.job === 'Director'
    )?.name ?? null;

  const cast =
    credits.cast
      .slice(0, 8)
      .map(actor => ({
        name: actor.name,
        character: actor.character,
        profilePath: actor.profile_path
          ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
          : null
      }));

  const trailer =
    videos.results.find(
      video =>
        video.site === 'YouTube' &&
        video.type === 'Trailer'
    );

  const trailerUrl =
    trailer
      ? `https://youtube.com/watch?v=${trailer.key}`
      : null;

  const similarMovies =
    similar.results
      .slice(0, 4)
      .map(movie => ({
        id: movie.id,
        title: movie.title,
        poster_url: movie.poster_path
          ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
          : null
      }));

  const regionProviders =
    providers.results?.[TMDB_REGION]?.flatrate ?? [];

  return {
    backdrop_url: details.backdrop_path
      ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
      : null,

    poster_url: details.poster_path
      ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
      : null,

    runtime: details.runtime,

    director,

    cast,

    trailerUrl,

    similarMovies,

    watchProviders: regionProviders.map(p => ({
      name: p.provider_name,
      logo_url: p.logo_path
        ? `https://image.tmdb.org/t/p/w92${p.logo_path}`
        : null
    }))
  };
}
module.exports = { syncGenresFromTMDB, syncProvidersFromTMDB, importPopularMovies, TMDB_BASE_URL, getMovieDetails };