'use strict';

require('dotenv').config();

const cookieParser = require('cookie-parser');
const session = require('express-session');
const PgSessionFactory = require('connect-pg-simple');

const { env, assertPlatformEnv } = require('../config/env');
const { hasDb, pool, query } = require('./db/pool');
const { authRouter } = require('./routes/auth.routes');

const { groupsRouter } = require('./routes/groups.routes');
const { invitesRouter } = require('./routes/invites.routes');

function getSessionSecret() {
  if (env.sessionSecret) return env.sessionSecret;

  // В production / REQUIRE_AUTH=1 — секрет обязателен
  if (env.requireAuth) {
    throw new Error('SESSION_SECRET is required when REQUIRE_AUTH=1');
  }

  // В dev при REQUIRE_AUTH=0 допускаем временный (чтобы не блокировать старый UX)
  console.warn('[platform] SESSION_SECRET is missing; using an insecure dev fallback (REQUIRE_AUTH=0)');
  return 'dev-insecure-fallback-secret-change-me';
}

function mountPlatform(app) {
  // Если вы за прокси (Railway), secure cookies корректно работают при trust proxy
  if (env.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  // Healthcheck: если DB настроена — проверяем SELECT 1
  app.get('/healthz', async (req, res) => {
    if (!env.databaseUrl || !hasDb()) {
      return res.status(200).json({ ok: true, db: 'skip' });
    }
    try {
      await query('SELECT 1;');
      return res.status(200).json({ ok: true, db: 'ok' });
    } catch (e) {
      console.error('[healthz] db fail:', e && e.message ? e.message : e);
      return res.status(503).json({ ok: false, db: 'fail' });
    }
  });

  // Платформенные переменные проверяем только когда платформа реально включена
  // (иначе Week 6/7 должен работать без DB/SESSION_SECRET)
  if (env.requireAuth) {
    assertPlatformEnv();
  }

  // Если DB не настроена — platform endpoints должны говорить “service unavailable”
  if (!env.databaseUrl || !hasDb()) {
    const dbNotConfigured = (req, res) => {
      res.status(503).json({ error: 'DB_NOT_CONFIGURED', message: 'DATABASE_URL is not set' });
    };

    app.use('/api/auth', dbNotConfigured);
    app.use('/api/groups', dbNotConfigured);
    app.use('/api/invites', dbNotConfigured);

    return;
  }


  // Sessions (PG store)
  const PgSession = PgSessionFactory(session);

  app.use(cookieParser());

  app.use(session({
    store: new PgSession({
      pool,
      tableName: 'sessions',
      createTableIfMissing: true
    }),
    name: 'sid',
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));

  // Auth routes (не трогают старые /api/... Week 6/7)
  app.use('/api/auth', authRouter());
  
  app.use('/api/groups', groupsRouter());
  app.use('/api/invites', invitesRouter());

}

module.exports = { mountPlatform };
