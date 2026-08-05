const pool = require('../config/db');
const { getMovieDetails } = require('../services/tmdb.service');

// Trae géneros, plataformas y rating agregado de una película ya seleccionada
async function hydrateMovie(movie) {
  const [genres, providers, ratingAgg, tmdbData] = await Promise.all([
    pool.query(
      `SELECT g.name
       FROM movie_genres mg
       JOIN genres g ON g.id = mg.genre_id
       WHERE mg.movie_id = $1`,
      [movie.id]
    ),
    pool.query(
      `SELECT sp.name,
              sp.icon_label AS icon,
              sp.color_hex AS color,
              sp.logo_url
       FROM movie_providers mp
       JOIN streaming_providers sp ON sp.id = mp.provider_id
       WHERE mp.movie_id = $1`,
      [movie.id]
    ),
    pool.query(
      `SELECT
          COALESCE(AVG(rating), 0)::float AS avg_rating,
          COUNT(*)::int AS review_count
       FROM reviews
       WHERE movie_id = $1`,
      [movie.id]
    ),
    movie.tmdb_id
      ? getMovieDetails(movie.tmdb_id)
      : Promise.resolve(null),
  ]);
  console.log(tmdbData);
  console.log('Monotributo')
  console.log(movie)
  return {
    ...movie,

    genres: genres.rows.map(g => g.name),

    providers:
      providers.rows.length > 0
        ? providers.rows
        : (tmdbData?.watchProviders ?? []),

    avgRating:
      Math.round(
        Number(ratingAgg.rows[0].avg_rating) * 10
      ) / 10,

    reviewCount:
      Number(ratingAgg.rows[0].review_count),

    // imágenes
    poster_url:
      tmdbData?.poster_url || movie.poster_url,

    backdrop_url:
      tmdbData?.backdrop_url || movie.backdrop_url,

    // metadata
    duration_min:
      tmdbData?.runtime || movie.duration_min,

    director:
      tmdbData?.director || null,

    cast:
      tmdbData?.cast || [],

    trailerUrl:
      tmdbData?.trailerUrl || null,

    similarMovies:
      tmdbData?.similarMovies || [],
  };
}

// GET /api/movies/random
// Si hay usuario logueado (softAuth), intenta priorizar películas que matcheen
// sus géneros o plataformas activas. Si no matchea nada (o es anónimo), cae a
// random puro sobre toda la tabla.
async function getUserActivePreferenceNames(userId) {
  const [genreRows, providerRows] = await Promise.all([
    pool.query(
      `SELECT g.name FROM user_genres ug
       JOIN genres g ON g.id = ug.genre_id
       WHERE ug.user_id = $1 AND ug.active = true`,
      [userId]
    ),
    pool.query(
      `SELECT sp.name FROM user_streaming_services uss
       JOIN streaming_providers sp ON sp.id = uss.provider_id
       WHERE uss.user_id = $1 AND uss.active = true`,
      [userId]
    ),
  ]);
  return {
    genres: genreRows.rows.map((r) => r.name),
    providers: providerRows.rows.map((r) => r.name),
  };
}
async function getRandomMovie(req, res, next) {
  try {
    let movie = null;

    if (req.userId) {
      const { rows } = await pool.query(
        `WITH active_genres AS (
          SELECT genre_id
          FROM user_genres
          WHERE user_id = $1
          AND active = true
        ),
        active_providers AS (
          SELECT provider_id
          FROM user_streaming_services
          WHERE user_id = $1
          AND active = true
        ),
        matching_ids AS (
          SELECT DISTINCT m.id
          FROM movies m
          LEFT JOIN movie_genres mg ON mg.movie_id = m.id
          LEFT JOIN movie_providers mp ON mp.movie_id = m.id
          WHERE mg.genre_id IN (SELECT genre_id FROM active_genres)
             OR mp.provider_id IN (SELECT provider_id FROM active_providers)
        )
        SELECT m.*
        FROM movies m
        JOIN matching_ids mi ON mi.id = m.id
        ORDER BY random()
        LIMIT 1`,
        [req.userId]
      );

      movie = rows[0] || null;
    }

    if (!movie) {
      const { rows } = await pool.query(`
        SELECT *
        FROM movies
        ORDER BY random()
        LIMIT 1
      `);

      movie = rows[0] || null;
    }

    if (!movie) {
      return res.status(404).json({
        error: 'No hay películas cargadas todavía.',
      });
    }

    const hydrated = await hydrateMovie(movie);

    let matchReasons = null;
    let matchPercent = null;

    if (req.userId) {
      const prefs = await getUserActivePreferenceNames(req.userId);

      const matchedGenres = hydrated.genres.filter(
        (g) => prefs.genres.includes(g)
      );

      const matchedProviders = hydrated.providers
        .map((p) => p.name)
        .filter((p) => prefs.providers.includes(p));

      matchReasons = {
        genres: matchedGenres,
        providers: matchedProviders,
      };

      const genreScore =
        matchedGenres.length > 0
          ? Math.min(70, matchedGenres.length * 20)
          : 0;

      const providerScore =
        matchedProviders.length > 0
          ? Math.min(30, matchedProviders.length * 15)
          : 0;

      matchPercent = Math.min(
        100,
        genreScore + providerScore
      );
    }

    return res.json({
      id: hydrated.id,

      title: hydrated.title,
      overview: hydrated.overview,

      release_year: hydrated.release_year,
      duration_min: hydrated.duration_min,

      avgRating: hydrated.avgRating,
      reviewCount: hydrated.reviewCount,

      poster_url: hydrated.poster_url,
      backdrop_url: hydrated.backdrop_url,

      genres: hydrated.genres,

      providers: hydrated.providers,

      trailerUrl: hydrated.trailerUrl,

      director: hydrated.director,

      cast: hydrated.cast,

      similarMovies: hydrated.similarMovies,

      personalized: Boolean(req.userId),

      matchPercent,

      matchReasons,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/movies/:id
async function getMovieById(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM movies WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Película no encontrada.' });
    const hydrated = await hydrateMovie(rows[0]);
    res.json(hydrated);
  } catch (err) {
    next(err);
  }
}

// GET /api/movies?genre=Drama&provider=Netflix
async function listMovies(req, res, next) {
  try {
    const { genre, provider } = req.query;
    const conditions = [];
    const values = [];

    let query = `SELECT DISTINCT m.* FROM movies m`;
    if (genre) {
      query += ` JOIN movie_genres mg ON mg.movie_id = m.id JOIN genres g ON g.id = mg.genre_id`;
      values.push(genre);
      conditions.push(`g.name = $${values.length}`);
    }
    if (provider) {
      query += ` JOIN movie_providers mp ON mp.movie_id = m.id JOIN streaming_providers sp ON sp.id = mp.provider_id`;
      values.push(provider);
      conditions.push(`sp.name = $${values.length}`);
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ` ORDER BY m.created_at DESC`;

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/movies  (carga manual/seed - sin control de rol admin por ahora)
async function createMovie(req, res, next) {
  try {
    const { title, overview, posterUrl, releaseYear, durationMin, genreNames = [], providerNames = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido.' });

    const { rows } = await pool.query(
      `INSERT INTO movies (title, overview, poster_url, release_year, duration_min)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, overview || null, posterUrl || null, releaseYear || null, durationMin || null]
    );
    const movie = rows[0];

    if (genreNames.length > 0) {
      await pool.query(
        `INSERT INTO movie_genres (movie_id, genre_id)
         SELECT $1, id FROM genres WHERE name = ANY($2::text[])`,
        [movie.id, genreNames]
      );
    }
    if (providerNames.length > 0) {
      await pool.query(
        `INSERT INTO movie_providers (movie_id, provider_id)
         SELECT $1, id FROM streaming_providers WHERE name = ANY($2::text[])`,
        [movie.id, providerNames]
      );
    }

    const hydrated = await hydrateMovie(movie);
    res.status(201).json(hydrated);
  } catch (err) {
    next(err);
  }
}
async function getSimilarMovies(req, res, next) {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 3, 10);

    const { rows } = await pool.query(
      `SELECT m.*, COUNT(mg2.genre_id)::int AS shared_genres
       FROM movies m
       JOIN movie_genres mg2 ON mg2.movie_id = m.id
       WHERE mg2.genre_id IN (SELECT genre_id FROM movie_genres WHERE movie_id = $1)
         AND m.id != $1
       GROUP BY m.id
       ORDER BY shared_genres DESC, random()
       LIMIT $2`,
      [id, limit]
    );

    const hydrated = await Promise.all(rows.map(hydrateMovie));
    res.json(hydrated);
  } catch (err) {
    next(err);
  }
}
module.exports = { getRandomMovie, getMovieById, listMovies, createMovie, getSimilarMovies };
