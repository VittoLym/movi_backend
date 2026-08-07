const pool = require('../config/db');
const fs = require('fs');
const path = require('path');


// GET /api/users/me
async function getMe(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, avatar_url AS avatar, level_label AS level,
              to_char(member_since, 'YYYY') AS member_since_year
       FROM users WHERE id = $1`,
      [req.userId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Formato pensado para calzar directo con userData del front:
    // { name, level, memberSince, avatar }
    res.json({
      name: user.name,
      level: user.level,
      memberSince: `Miembro desde ${user.member_since_year}`,
      avatar: user.avatar,
      email: user.email,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/users/me
async function updateMe(req, res, next) {
  try {
    const { name, avatar } = req.body;
    const { rows } = await pool.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         avatar_url = COALESCE($2, avatar_url),
         updated_at = now()
       WHERE id = $3
       RETURNING name, avatar_url AS avatar, level_label AS level`,
      [name, avatar, req.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function uploadMyAvatar(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const publicUrl = `/uploads/avatars/${req.file.filename}`;

    // Traer el avatar viejo para borrarlo si era un upload local (no un default)
    const { rows: prevRows } = await pool.query(
      'SELECT avatar_url FROM users WHERE id = $1', [req.userId]
    );
    const prevAvatar = prevRows[0]?.avatar_url;

    const { rows } = await pool.query(
      `UPDATE users SET avatar_url = $1, updated_at = now()
       WHERE id = $2 RETURNING avatar_url AS avatar`,
      [publicUrl, req.userId]
    );

    // Limpieza: si el avatar anterior era un upload nuestro, lo borramos
    if (prevAvatar && prevAvatar.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(__dirname, '..', '..', prevAvatar);
      fs.unlink(oldPath, () => {}); // best-effort, no bloquea la respuesta
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}
module.exports = { getMe, updateMe, uploadMyAvatar };
