'use strict';

const rateLimit = require('express-rate-limit');

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const {
  createUser,
  getUserByEmail,
  verifyPassword
} = require('../services/auth.service');

function safeError(res, status, error, message) {
  return res.status(status).json({ error, message });
}

function authRouter() {
  const router = express.Router();
  
  const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  limit: 30,                // 30 попыток на IP за окно
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT', message: 'Too many requests' }
});


  // Register: по умолчанию создаём только student.
  // Teacher создаётся через bootstrap:teacher (безопаснее).
  router.post('/register', authLimiter, async (req, res) => {
    try {
      const { email, password, role } = req.body || {};

      if (role && role !== 'student') {
        return safeError(res, 403, 'ROLE_FORBIDDEN', 'Only student registration is allowed');
      }

      const user = await createUser({ email, password, role: 'student' });

      // Автологин после регистрации
      req.session.user = { id: user.id, email: user.email, role: user.role };
      return res.status(201).json({ ok: true, user: req.session.user });
    } catch (e) {
      const status = e.status || 500;
      if (e.message === 'INVALID_EMAIL') return safeError(res, status, 'INVALID_EMAIL', 'Invalid email');
      if (e.message === 'WEAK_PASSWORD') return safeError(res, status, 'WEAK_PASSWORD', 'Password must be at least 6 chars');
      if (e.message === 'EMAIL_ALREADY_EXISTS') return safeError(res, status, 'EMAIL_ALREADY_EXISTS', 'Email already registered');
      console.error('[auth/register] error:', e && e.message ? e.message : e);
      return safeError(res, 500, 'INTERNAL', 'Internal error');
    }
  });

  router.post('/login', authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const user = await getUserByEmail(email);

      const ok = await verifyPassword(user, password);
      if (!ok) {
        return safeError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }

      req.session.user = { id: user.id, email: user.email, role: user.role };
      return res.status(200).json({ ok: true, user: req.session.user });
    } catch (e) {
      console.error('[auth/login] error:', e && e.message ? e.message : e);
      return safeError(res, 500, 'INTERNAL', 'Internal error');
    }
  });

  router.post('/logout', (req, res) => {
    try {
      // destroy session (async)
      req.session.destroy(() => {
        res.status(200).json({ ok: true });
      });
    } catch (e) {
      console.error('[auth/logout] error:', e && e.message ? e.message : e);
      res.status(200).json({ ok: true });
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({ ok: true, user: req.session.user });
  });

  return router;
}

module.exports = { authRouter };
