const jwt = require('jsonwebtoken');

// A diferencia de requireAuth, esta NO rechaza el request si no hay token.
// Se usa en endpoints públicos que se pueden "personalizar" si el usuario
// está logueado (ej: recomendación random según sus géneros/plataformas).
function softAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    req.userId = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
  } catch (err) {
    req.userId = null; // token inválido/expirado -> tratamos como anónimo
  }
  next();
}

module.exports = { softAuth };
