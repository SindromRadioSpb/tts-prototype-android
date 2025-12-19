'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function mustGetDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run migrations');
  return url;
}

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return def;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function listSqlFiles(migrationsDir) {
  return fs.readdirSync(migrationsDir)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function getApplied(client) {
  const r = await client.query('SELECT filename FROM schema_migrations ORDER BY filename ASC;');
  return new Set(r.rows.map((x) => x.filename));
}

async function applyMigration(client, filename, sql) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(filename) VALUES($1);', [filename]);
    await client.query('COMMIT');
    console.log(`[migrate] applied ${filename}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function main() {
  const databaseUrl = mustGetDatabaseUrl();
  const databaseSsl = parseBool(process.env.DATABASE_SSL, false);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: false } : undefined
  });

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = listSqlFiles(migrationsDir);

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);

    for (const f of files) {
      if (applied.has(f)) {
        console.log(`[migrate] skip ${f}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      await applyMigration(client, f, sql);
    }

    console.log('[migrate] done');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
