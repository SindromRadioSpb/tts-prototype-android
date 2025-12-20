'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');

const BCRYPT_ROUNDS = 10;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const e = normalizeEmail(email);
  return e.length >= 5 && e.includes('@');
}

async function getUserByEmail(email) {
  const e = normalizeEmail(email);
  const r = await query(
    `SELECT id, email, role, password_hash
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [e]
  );
  return r.rows[0] || null;
}

async function createUser({ email, password, role }) {
  const e = normalizeEmail(email);
  if (!isValidEmail(e)) {
    const err = new Error('INVALID_EMAIL');
    err.status = 400;
    throw err;
  }
  if (typeof password !== 'string' || password.length < 6) {
    const err = new Error('WEAK_PASSWORD');
    err.status = 400;
    throw err;
  }
  if (role !== 'teacher' && role !== 'student') {
    const err = new Error('INVALID_ROLE');
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const r = await query(
      `INSERT INTO users(email, role, password_hash)
       VALUES($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [e, role, passwordHash]
    );
    return r.rows[0];
  } catch (e2) {
    // unique violation (users_email_unique)
    if (e2 && e2.code === '23505') {
      const err = new Error('EMAIL_ALREADY_EXISTS');
      err.status = 409;
      throw err;
    }
    throw e2;
  }
}

async function verifyPassword(user, password) {
  if (!user || !user.password_hash) return false;
  return bcrypt.compare(String(password || ''), user.password_hash);
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  getUserByEmail,
  createUser,
  verifyPassword
};
