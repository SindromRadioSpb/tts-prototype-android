"use strict";

// CLG-P1 Identity & Account repo (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P1, §13.1).
// Owner-only bootstrap on a full multi-tenant schema. Invariants owned here:
//   • session secret never stored (sha256 hash only); cookie value = "<sessionId>.<secret>";
//   • user_id is derived ONLY from a validated session (recon §6 B2) — no API in this repo
//     accepts a caller-supplied user_id for authorization;
//   • account delete = forget-the-stream (recon §1.3 carve-out (а)): a DYNAMIC sweep of every
//     table carrying a user_id column (sqlite_master + PRAGMA table_info), so a table added in a
//     later CLG phase is deleted/exported automatically — the §10 completeness invariant is
//     structural, not a hand-kept list. deletion_journal is the one documented exemption.

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}
function nowIso() { return new Date().toISOString(); }
function rndId(prefix, bytes = 16) { return prefix + crypto.randomBytes(bytes).toString("hex"); }
function sha256Hex(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }

const SESSION_TTL_MS = 90 * 24 * 3600 * 1000;   // 90 days; sliding via last_used bump on validate

// ── owner bootstrap ───────────────────────────────────────────────────────────
// Idempotent: the FIRST owner user is created on first successful bootstrap login.
async function ensureOwnerUser() {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db, `SELECT id, role, display_name FROM users WHERE role='owner' ORDER BY created_at ASC LIMIT 1`);
  if (row) return row;
  const id = rndId("u_");
  await dbRun(db, `INSERT INTO users (id, role, display_name) VALUES (?, 'owner', 'Owner')`, [id]);
  return { id, role: "owner", display_name: "Owner" };
}

// ── sessions ──────────────────────────────────────────────────────────────────
async function createSession(userId, { deviceLabel, ip, userAgent } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const deviceId = rndId("d_", 8);
  await dbRun(db, `INSERT INTO devices (id, user_id, label, last_seen_at) VALUES (?,?,?,?)`,
    [deviceId, userId, deviceLabel ? String(deviceLabel).slice(0, 120) : null, nowIso()]);
  const sessionId = rndId("s_", 8);
  const secret = crypto.randomBytes(32).toString("hex");          // 256 bits, never stored
  const csrf = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await dbRun(db,
    `INSERT INTO user_sessions (id, user_id, device_id, token_hash, csrf_token, expires_at, ip, user_agent)
     VALUES (?,?,?,?,?,?,?,?)`,
    [sessionId, userId, deviceId, sha256Hex(secret), csrf, expiresAt,
     ip ? String(ip).slice(0, 64) : null, userAgent ? String(userAgent).slice(0, 200) : null]);
  return { cookieValue: sessionId + "." + secret, sessionId, deviceId, csrf, expiresAt };
}

// cookieValue "<sessionId>.<secret>" → { user, session } | null. Constant-time hash compare;
// expired/revoked → null. Bumps last_used_at/last_seen_at (cheap sliding signal, TTL fixed).
async function validateSession(cookieValue) {
  const db = getDb(); if (!db) return null;
  const v = String(cookieValue || "");
  const dot = v.indexOf(".");
  if (dot <= 0) return null;
  const sessionId = v.slice(0, dot), secret = v.slice(dot + 1);
  if (!sessionId || !secret) return null;
  let s;
  try { s = await dbGet(db, `SELECT * FROM user_sessions WHERE id = ?`, [sessionId]); } catch (_) { return null; }
  if (!s || s.revoked_at) return null;
  if (Date.parse(s.expires_at) < Date.now()) return null;
  const a = Buffer.from(sha256Hex(secret)), b = Buffer.from(String(s.token_hash || ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const user = await dbGet(db, `SELECT id, role, display_name, email, created_at FROM users WHERE id = ?`, [s.user_id]);
  if (!user) return null;
  try {
    await dbRun(db, `UPDATE user_sessions SET last_used_at = ? WHERE id = ?`, [nowIso(), sessionId]);
    if (s.device_id) await dbRun(db, `UPDATE devices SET last_seen_at = ? WHERE id = ?`, [nowIso(), s.device_id]);
  } catch (_) {}
  return { user, session: { id: s.id, deviceId: s.device_id, csrf: s.csrf_token, createdAt: s.created_at, expiresAt: s.expires_at } };
}

async function revokeSession(userId, sessionId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db, `UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    [nowIso(), String(sessionId), userId]);
  return r.changes > 0;
}

async function listSessions(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT s.id, s.device_id, s.created_at, s.expires_at, s.last_used_at, s.revoked_at, s.ip, s.user_agent, d.label AS device_label
       FROM user_sessions s LEFT JOIN devices d ON d.id = s.device_id
      WHERE s.user_id = ? ORDER BY s.created_at DESC`, [userId]);
  return rows || [];
}

// ── consent (append-only history) ────────────────────────────────────────────
async function recordConsent(userId, consentKey, granted, consentVersion) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const key = String(consentKey || "").trim().slice(0, 80);
  if (!key) throw new Error("BAD_CONSENT_KEY");
  const id = rndId("c_", 8);
  await dbRun(db, `INSERT INTO consent_records (id, user_id, consent_key, granted, consent_version) VALUES (?,?,?,?,?)`,
    [id, userId, key, granted ? 1 : 0, String(consentVersion || "v1").slice(0, 40)]);
  return id;
}
async function listConsents(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT consent_key, granted, consent_version, created_at, purged_at FROM consent_records
      WHERE user_id = ? ORDER BY created_at ASC`, [userId]);
  // current view = last row per key; full history stays in the table
  const current = {};
  for (const r of (rows || [])) current[r.consent_key] = { granted: !!r.granted, version: r.consent_version, at: r.created_at };
  return { current, history: rows || [] };
}

// ── audit ─────────────────────────────────────────────────────────────────────
async function audit(action, userId, detail, ip) {
  try {
    const db = getDb(); if (!db) return;
    await dbRun(db, `INSERT INTO audit_log (user_id, action, detail_json, ip) VALUES (?,?,?,?)`,
      [userId || null, String(action).slice(0, 60), JSON.stringify(detail || {}), ip ? String(ip).slice(0, 64) : null]);
  } catch (_) { /* audit must never break the action */ }
}

// ── dynamic user_id-table sweep (the §10 completeness invariant, structural) ──
// Every table with a user_id column is in scope for export AND delete automatically.
// deletion_journal is the one documented exemption (erasure record, survives delete).
const SWEEP_EXEMPT = { deletion_journal: 1, sqlite_sequence: 1 };
async function listUserScopedTables() {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const tables = await dbAll(db, `SELECT name FROM sqlite_master WHERE type='table'`);
  const out = [];
  for (const t of (tables || [])) {
    const name = String(t.name);
    if (SWEEP_EXEMPT[name]) continue;
    let cols;
    try { cols = await dbAll(db, `PRAGMA table_info(${JSON.stringify(name)})`); } catch (_) { continue; }
    if ((cols || []).some((c) => String(c.name) === "user_id")) out.push(name);
  }
  return out;
}

// Full JSON export of the user's stream: users row + every user_id-scoped table (recon §5 export).
async function exportUserData(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const tables = await listUserScopedTables();
  const out = { exported_at: nowIso(), user: null, tables: {}, table_list: tables };
  out.user = await dbGet(db, `SELECT * FROM users WHERE id = ?`, [userId]);
  for (const name of tables) {
    try { out.tables[name] = await dbAll(db, `SELECT * FROM ${JSON.stringify(name)} WHERE user_id = ?`, [userId]); }
    catch (_) { out.tables[name] = []; }
  }
  // never export another user's data or secrets: strip session token hashes (defense in depth —
  // hashes are already non-reversible, but they have no business in a user export)
  if (out.tables.user_sessions) for (const s of out.tables.user_sessions) { delete s.token_hash; delete s.csrf_token; }
  return out;
}

// forget-the-stream: physical deletion of every row carrying this user_id + the users row itself,
// in ONE transaction; writes the deletion_journal record (survives; replayed after restores).
async function deleteUserData(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const tables = await listUserScopedTables();
  // Explicit transaction → must hold the process txn-lock (db/txnLock.js): a concurrent learner
  // ingest would otherwise nest BEGINs on the shared connection.
  await withTxnLock(async () => {
  await dbRun(db, `BEGIN IMMEDIATE`);
  try {
    for (const name of tables) {
      try { await dbRun(db, `DELETE FROM ${JSON.stringify(name)} WHERE user_id = ?`, [userId]); } catch (_) {}
    }
    await dbRun(db, `DELETE FROM users WHERE id = ?`, [userId]);
    await dbRun(db, `INSERT INTO deletion_journal (user_id, tables_purged_json) VALUES (?, ?)`,
      [userId, JSON.stringify(tables)]);
    await dbRun(db, `COMMIT`);
  } catch (e) {
    try { await dbRun(db, `ROLLBACK`); } catch (_) {}
    throw e;
  }
  });
  return { tables };
}

// Post-delete completeness check (the CLG-P1 gate: "ни одна таблица не содержит его строк").
async function countUserRows(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const tables = await listUserScopedTables();
  let total = 0; const perTable = {};
  for (const name of tables) {
    try {
      const r = await dbGet(db, `SELECT COUNT(*) c FROM ${JSON.stringify(name)} WHERE user_id = ?`, [userId]);
      const c = Number(r && r.c) || 0;
      if (c) perTable[name] = c;
      total += c;
    } catch (_) {}
  }
  const u = await dbGet(db, `SELECT COUNT(*) c FROM users WHERE id = ?`, [userId]);
  if (Number(u && u.c)) { perTable.users = Number(u.c); total += Number(u.c); }
  return { total, perTable };
}

module.exports = {
  ensureOwnerUser, createSession, validateSession, revokeSession, listSessions,
  recordConsent, listConsents, audit,
  listUserScopedTables, exportUserData, deleteUserData, countUserRows,
  SESSION_TTL_MS,
};
