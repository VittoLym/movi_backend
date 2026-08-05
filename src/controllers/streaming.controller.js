const pool = require('../config/db');

// GET /api/users/me/streaming-services
// Formato calzado con streamingServices del front: [{ name, icon, color, active }]
async function listMyStreamingServices(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT sp.name,
              sp.icon_label AS icon,
              sp.color_hex  AS color,
              COALESCE(uss.active, false) AS active,
              uss.connected_at,
              uss.last_synced_at
       FROM streaming_providers sp
       LEFT JOIN user_streaming_services uss
         ON uss.provider_id = sp.id AND uss.user_id = $1
       ORDER BY sp.id`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me/streaming-services/:name  { active: true|false }
// Hoy solo persiste el toggle (como el front actual).
// Cuando haya integración real (OAuth/API), acá es donde se dispara
// el flujo de conexión real y se completa connected_at / last_synced_at.
async function setStreamingServiceActive(req, res, next) {
  try {
    const { name } = req.params;
    const { active } = req.body;

    const provider = await pool.query(
      'SELECT id FROM streaming_providers WHERE name = $1',
      [name]
    );
    if (provider.rows.length === 0) {
      return res.status(404).json({ error: `Proveedor "${name}" no existe en el catálogo.` });
    }
    const providerId = provider.rows[0].id;

    await pool.query(
      `INSERT INTO user_streaming_services (user_id, provider_id, active, connected_at)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END)
       ON CONFLICT (user_id, provider_id) DO UPDATE
         SET active = EXCLUDED.active,
             connected_at = CASE WHEN EXCLUDED.active THEN now() ELSE user_streaming_services.connected_at END`,
      [req.userId, providerId, active]
    );

    res.json({ name, active });
  } catch (err) {
    next(err);
  }
}

module.exports = { listMyStreamingServices, setStreamingServiceActive };
