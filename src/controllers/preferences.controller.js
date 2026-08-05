const pool = require('../config/db');

// GET /api/users/me/genres
// Devuelve TODOS los géneros del catálogo con su estado "active" para este usuario,
// en el mismo formato que consume el v-for de <SettingsView>: [{ name, active }]
async function listMyGenres(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT g.name,
              COALESCE(ug.active, false) AS active
       FROM genres g
       LEFT JOIN user_genres ug
         ON ug.genre_id = g.id AND ug.user_id = $1
       ORDER BY g.id`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me/genres/:name  { active: true|false }
// Toggle individual, pensado para llamarse directo desde toggleGenre() del front
async function setGenreActive(req, res, next) {
  try {
    const { name } = req.params;
    const { active } = req.body;

    const genre = await pool.query('SELECT id FROM genres WHERE name = $1', [name]);
    if (genre.rows.length === 0) {
      return res.status(404).json({ error: `Género "${name}" no existe en el catálogo.` });
    }
    const genreId = genre.rows[0].id;

    await pool.query(
      `INSERT INTO user_genres (user_id, genre_id, active)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, genre_id) DO UPDATE SET active = EXCLUDED.active`,
      [req.userId, genreId, active]
    );

    res.json({ name, active });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyGenres, setGenreActive };
