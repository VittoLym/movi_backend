const pool = require('../config/db');

// GET /api/movies/:movieId/reviews
async function listReviewsForMovie(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
              u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.movie_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.movieId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/reviews
async function listMyReviews(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.updated_at,
              m.id AS movie_id, m.title AS movie_title, m.poster_url AS movie_poster
       FROM reviews r
       JOIN movies m ON m.id = r.movie_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/movies/:movieId/reviews  { rating, comment }
// Upsert: si el usuario ya reseñó esta película, actualiza en vez de duplicar
// (ver UNIQUE(user_id, movie_id) en el schema).
async function upsertReview(req, res, next) {
  try {
    const { movieId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating es requerido y debe estar entre 1 y 5.' });
    }

    const movieExists = await pool.query('SELECT id FROM movies WHERE id = $1', [movieId]);
    if (movieExists.rows.length === 0) {
      return res.status(404).json({ error: 'Película no encontrada.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO reviews (user_id, movie_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, movie_id) DO UPDATE
         SET rating = EXCLUDED.rating,
             comment = EXCLUDED.comment,
             updated_at = now()
       RETURNING id, rating, comment, created_at, updated_at`,
      [req.userId, movieId, rating, comment || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/reviews/:id  (solo el dueño de la review)
async function deleteReview(req, res, next) {
  try {
    const { rows } = await pool.query(
      'DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Review no encontrada o no te pertenece.' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listReviewsForMovie, listMyReviews, upsertReview, deleteReview };
