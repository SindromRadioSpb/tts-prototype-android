'use strict';

function getSessionUser(req) {
  // Основной ожидаемый формат (Week 7.5 обычно так и делает)
  if (req.session && req.session.user && req.session.user.id) return req.session.user;

  // На случай других форматов — не ломаемся, но требуем минимум id
  const id = req.session && (req.session.userId || req.session.uid);
  if (id) {
    return {
      id,
      email: req.session.email || null,
      role: req.session.role || null
    };
  }

  return null;
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  req.user = user;
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !user.role) return res.status(403).json({ error: 'FORBIDDEN' });
    if (user.role !== role) return res.status(403).json({ error: 'FORBIDDEN' });
    return next();
  };
}

module.exports = { requireAuth, requireRole };
