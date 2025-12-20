'use strict';

require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

function parseBool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return def;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for bootstrap');

  const email = String(process.env.BOOTSTRAP_TEACHER_EMAIL || '').trim();
  const password = String(process.env.BOOTSTRAP_TEACHER_PASSWORD || '');

  if (!email) throw new Error('BOOTSTRAP_TEACHER_EMAIL is required');
  if (!password || password.length < 6) throw new Error('BOOTSTRAP_TEACHER_PASSWORD is required (min 6 chars)');

  const databaseSsl = parseBool(process.env.DATABASE_SSL, false);
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: false } : undefined
  });

  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT id, email, role FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );

    if (existing.rows.length) {
      const u = existing.rows[0];
      console.log(`[bootstrap] teacher already exists: ${u.email} (${u.id}), role=${u.role}`);
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const created = await client.query(
      `INSERT INTO users(email, role, password_hash)
       VALUES($1, 'teacher', $2)
       RETURNING id, email, role`,
      [email, hash]
    );

    const u = created.rows[0];
    console.log(`[bootstrap] teacher created: ${u.email} (${u.id}), role=${u.role}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[bootstrap] failed:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
