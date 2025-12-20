'use strict';

function requireRole(role) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required' });
    }
    if (user.role !== role) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
    }
    return next();
  };
}

module.exports = { requireRole };
