'use strict';

const { Pool } = require('pg');
const { env } = require('../../config/env');

let pool = null;

function makePool() {
  if (!env.databaseUrl) return null;

  const ssl = env.databaseSsl ? { rejectUnauthorized: false } : undefined;

  return new Pool({
    connectionString: env.databaseUrl,
    ssl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
}

pool = makePool();

if (pool) {
  pool.on('error', (err) => {
    console.error('[pg] pool error:', err && err.message ? err.message : err);
  });
} else {
  console.warn('[pg] DATABASE_URL is not set — db features are disabled');
}

function hasDb() {
  return !!pool;
}

async function query(text, params) {
  if (!pool) throw new Error('DB_NOT_CONFIGURED');
  return pool.query(text, params);
}

module.exports = { pool, hasDb, query };
