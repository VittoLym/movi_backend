const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt')


// GET /api/users/me
async function getMe(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, avatar_url AS avatar, level_label AS level, region,
              to_char(member_since, 'YYYY') AS member_since_year,
              auto_sync_library, watch_history_sync
       FROM users WHERE id = $1`,
      [req.userId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    res.json({
      name: user.name,
      level: user.level,
      memberSince: `Miembro desde ${user.member_since_year}`,
      avatar: user.avatar,
      email: user.email,
      region: user.region,
      autoSyncLibrary: user.auto_sync_library,
      watchHistorySync: user.watch_history_sync,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/users/me
async function updateMe(req, res, next) {
  try {
    const { name, avatar, autoSyncLibrary, watchHistorySync, region } = req.body;
    const { rows } = await pool.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         avatar_url = COALESCE($2, avatar_url),
         auto_sync_library = COALESCE($3, auto_sync_library),
         watch_history_sync = COALESCE($4, watch_history_sync),
         region = COALESCE($5, region),
         updated_at = now()
       WHERE id = $6
       RETURNING name, avatar_url AS avatar, level_label AS level, region,
                 auto_sync_library AS "autoSyncLibrary", watch_history_sync AS "watchHistorySync"`,
      [name, avatar, autoSyncLibrary, watchHistorySync, region, req.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// POST /api/users/avatar
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
// PATCH /api/users/me/email  { newEmail, currentPassword }
async function changeEmail(req, res, next) {
  try {
    const { newEmail, currentPassword } = req.body;
    if (!newEmail || !currentPassword) {
      return res.status(400).json({ error: 'newEmail y currentPassword son requeridos.' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [newEmail, req.userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ese email ya está en uso por otra cuenta.' });
    }

    await pool.query('UPDATE users SET email = $1, updated_at = now() WHERE id = $2', [newEmail, req.userId]);
    res.json({ email: newEmail });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me/password  { currentPassword, newPassword }
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword y newPassword son requeridos.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [newHash, req.userId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/users/me  { currentPassword }
async function deleteAccount(req, res, next) {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ error: 'currentPassword es requerido para eliminar la cuenta.' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta.' });

    // ON DELETE CASCADE en el schema se encarga de reviews, user_genres,
    // user_streaming_services y notification_settings automáticamente.
    await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe, uploadMyAvatar, changeEmail, changePassword, deleteAccount };
