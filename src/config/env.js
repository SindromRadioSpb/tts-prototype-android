'use strict';

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return def;
}

function parseIntSafe(v, def) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseIntSafe(process.env.PORT, 3000),

  // Platform
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  requireAuth: parseBool(process.env.REQUIRE_AUTH, false),

  // Bootstrap teacher
  bootstrapTeacherEmail: (process.env.BOOTSTRAP_TEACHER_EMAIL || '').trim(),
  bootstrapTeacherPassword: process.env.BOOTSTRAP_TEACHER_PASSWORD || '',

  // Optional SSL toggle for Postgres
  databaseSsl: parseBool(process.env.DATABASE_SSL, false),
};

function assertPlatformEnv() {
  if (env.requireAuth) {
    if (!env.databaseUrl) {
      throw new Error('DATABASE_URL is required when REQUIRE_AUTH=1');
    }
    if (!env.sessionSecret) {
      throw new Error('SESSION_SECRET is required when REQUIRE_AUTH=1');
    }
  }
}

module.exports = { env, assertPlatformEnv, parseBool };
