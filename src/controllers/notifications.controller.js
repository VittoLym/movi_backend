const pool = require('../config/db');

// GET /api/users/me/notifications
async function getMyNotificationSettings(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT enabled FROM notification_settings WHERE user_id = $1',
      [req.userId]
    );
    res.json({ enabled: rows[0]?.enabled ?? true });
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me/notifications  { enabled: true|false }
async function updateMyNotificationSettings(req, res, next) {
  try {
    const { enabled } = req.body;
    await pool.query(
      `INSERT INTO notification_settings (user_id, enabled)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [req.userId, enabled]
    );
    res.json({ enabled });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyNotificationSettings, updateMyNotificationSettings };
