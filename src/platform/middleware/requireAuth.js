'use strict';

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required' });
}

module.exports = { requireAuth };
