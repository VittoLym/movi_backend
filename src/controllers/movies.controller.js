const pool = require('../config/db');

// Trae géneros, plataformas y rating agregado de una película ya seleccionada
async function hydrateMovie(movie) {
  const [genres, providers, ratingAgg] = await Promise.all([
    pool.query(
      `SELECT g.name FROM movie_genres mg
       JOIN genres g ON g.id = mg.genre_id
       WHERE mg.movie_id = $1`,
      [movie.id]
    ),
    pool.query(
      `SELECT sp.name, sp.icon_label AS icon, sp.color_hex AS color
       FROM movie_providers mp
       JOIN streaming_providers sp ON sp.id = mp.provider_id
       WHERE mp.movie_id = $1`,
      [movie.id]
    ),
    pool.query(
      `SELECT COALESCE(AVG(rating), 0)::float AS avg_rating, COUNT(*)::int AS review_count
       FROM reviews WHERE movie_id = $1`,
      [movie.id]
    ),
  ]);

  return {
    ...movie,
    genres: genres.rows.map((g) => g.name),
    providers: providers.rows,
    avgRating: Math.round(ratingAgg.rows[0].avg_rating * 10) / 10,
    reviewCount: ratingAgg.rows[0].review_count,
  };
}

// GET /api/movies/random
// Si hay usuario logueado (softAuth), intenta priorizar películas que matcheen
// sus géneros o plataformas activas. Si no matchea nada (o es anónimo), cae a
// random puro sobre toda la tabla.
async function getRandomMovie(req, res, next) {
  try {
    let movie = null;

    if (req.userId) {
      const { rows } = await pool.query(
        `WITH active_genres AS (
          SELECT genre_id FROM user_genres WHERE user_id = $1 AND active = true
        ), active_providers AS (
          SELECT provider_id FROM user_streaming_services WHERE user_id = $1 AND active = true
        ), matching_ids AS (
          SELECT DISTINCT m.id
          FROM movies m
          LEFT JOIN movie_genres mg ON mg.movie_id = m.id
          LEFT JOIN movie_providers mp ON mp.movie_id = m.id
          WHERE mg.genre_id IN (SELECT genre_id FROM active_genres)
              OR mp.provider_id IN (SELECT provider_id FROM active_providers)
        )
        SELECT m.*
        FROM movies m
        JOIN matching_ids ON matching_ids.id = m.id
        ORDER BY random()
        LIMIT 1`,
        [req.userId]
      );
      movie = rows[0] || null;
    }

    // Fallback: anónimo, o el usuario no tiene preferencias que matcheen nada
    if (!movie) {
      const { rows } = await pool.query('SELECT * FROM movies ORDER BY random() LIMIT 1');
      movie = rows[0] || null;
    }

    if (!movie) {
      return res.status(404).json({ error: 'No hay películas cargadas todavía.' });
    }

    const hydrated = await hydrateMovie(movie);
    res.json({ ...hydrated, personalized: Boolean(req.userId) });
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

module.exports = { getRandomMovie, getMovieById, listMovies, createMovie };
