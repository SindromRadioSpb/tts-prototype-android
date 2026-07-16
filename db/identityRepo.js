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
  // Audience separation (CLG-P8.1): the PWA validator accepts ONLY 'pwa'-kind sessions, so a
  // Mini App session secret can never authorize a PWA route. Pre-034 rows have no column (undefined
  // → treated as pwa). Mini App sessions go through validateMiniappSession instead.
  if (s.session_kind && s.session_kind !== "pwa") return null;
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

// ── CLG-P8.1 Mini App scoped sessions ─────────────────────────────────────────
// One user_sessions table, fixed session_kind. Mint sets a SHORT idle expiry + a hard absolute cap,
// binds channel_link_id + a snapshot of the user's auth_context_version (structural revoke).
const MINIAPP_IDLE_MS_DEFAULT = 2 * 3600 * 1000;        // 2h
const MINIAPP_ABSOLUTE_MS_DEFAULT = 24 * 3600 * 1000;   // 24h first launch (configurable at call site)

async function createMiniappSession(userId, opts = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const idleMs = Number(opts.idleMs) > 0 ? Number(opts.idleMs) : MINIAPP_IDLE_MS_DEFAULT;
  const absoluteMs = Number(opts.absoluteMs) > 0 ? Number(opts.absoluteMs) : MINIAPP_ABSOLUTE_MS_DEFAULT;
  const deviceId = rndId("d_", 8);
  await dbRun(db, `INSERT INTO devices (id, user_id, label, last_seen_at) VALUES (?,?,?,?)`,
    [deviceId, userId, "telegram_miniapp", nowIso()]);
  const sessionId = rndId("s_", 8);
  const secret = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const expiresAt = new Date(now + idleMs).toISOString();            // idle (slid on each validate)
  const absoluteExpiresAt = new Date(now + absoluteMs).toISOString();// hard cap
  await dbRun(db,
    `INSERT INTO user_sessions
       (id, user_id, device_id, token_hash, csrf_token, expires_at, ip, user_agent,
        session_kind, auth_method, channel_link_id, auth_context_version, absolute_expires_at)
     VALUES (?,?,?,?,?,?,?,?, 'telegram_miniapp','telegram_init_data', ?, ?, ?)`,
    [sessionId, userId, deviceId, sha256Hex(secret), csrf, expiresAt,
     opts.ip ? String(opts.ip).slice(0, 64) : null, opts.userAgent ? String(opts.userAgent).slice(0, 200) : null,
     opts.channelLinkId ? String(opts.channelLinkId) : null, Number(opts.authContextVersion) || 0, absoluteExpiresAt]);
  return { cookieValue: sessionId + "." + secret, sessionId, deviceId, csrf, expiresAt, absoluteExpiresAt };
}

// Validate a Mini App session cookie. Returns { user, session, channelLinkId } | null.
// Enforces (in order): kind='telegram_miniapp', not revoked, idle not passed, absolute not passed,
// constant-time secret match, auth_context_version snapshot == user's current (structural revoke).
// On success slides the idle window: expires_at = min(now+idle, absolute).
async function validateMiniappSession(cookieValue, opts = {}) {
  const db = getDb(); if (!db) return null;
  const v = String(cookieValue || "");
  const dot = v.indexOf(".");
  if (dot <= 0) return null;
  const sessionId = v.slice(0, dot), secret = v.slice(dot + 1);
  if (!sessionId || !secret) return null;
  let s;
  try { s = await dbGet(db, `SELECT * FROM user_sessions WHERE id = ?`, [sessionId]); } catch (_) { return null; }
  if (!s || s.revoked_at) return null;
  if (s.session_kind !== "telegram_miniapp") return null;
  const now = Date.now();
  if (Date.parse(s.expires_at) < now) return null;                                  // idle expired
  if (s.absolute_expires_at && Date.parse(s.absolute_expires_at) < now) return null; // absolute cap
  const a = Buffer.from(sha256Hex(secret)), b = Buffer.from(String(s.token_hash || ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const user = await dbGet(db, `SELECT id, role, display_name, email, created_at, auth_context_version FROM users WHERE id = ?`, [s.user_id]);
  if (!user) return null;
  if (Number(s.auth_context_version || 0) !== Number(user.auth_context_version || 0)) return null; // structural revoke
  const idleMs = Number(opts.idleMs) > 0 ? Number(opts.idleMs) : MINIAPP_IDLE_MS_DEFAULT;
  const absMs = s.absolute_expires_at ? Date.parse(s.absolute_expires_at) : Infinity;
  const newExpires = new Date(Math.min(now + idleMs, absMs)).toISOString();
  try {
    await dbRun(db, `UPDATE user_sessions SET last_used_at = ?, expires_at = ? WHERE id = ?`, [nowIso(), newExpires, sessionId]);
    if (s.device_id) await dbRun(db, `UPDATE devices SET last_seen_at = ? WHERE id = ?`, [nowIso(), s.device_id]);
  } catch (_) {}
  return {
    user: { id: user.id, role: user.role, display_name: user.display_name, email: user.email, created_at: user.created_at },
    session: { id: s.id, deviceId: s.device_id, csrf: s.csrf_token, kind: s.session_kind, expiresAt: newExpires, absoluteExpiresAt: s.absolute_expires_at },
    channelLinkId: s.channel_link_id || null,
  };
}

async function getUserAuthContextVersion(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbGet(db, `SELECT auth_context_version FROM users WHERE id = ?`, [userId]);
  return Number(r && r.auth_context_version) || 0;
}

// Bump = invalidate every session whose snapshot differs (structural revoke; no row sweep). Called by
// unlink / consent revoke / consent-version bump / channel-link deactivation / security logout.
async function bumpUserAuthContextVersion(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db, `UPDATE users SET auth_context_version = auth_context_version + 1 WHERE id = ?`, [userId]);
  return r.changes > 0;
}

// Replay ledger: returns { fresh:true } on first sight of this (user, initData-hash), { fresh:false } on replay.
async function recordMiniappInitDataSeen(userId, dedupKey, authDate) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db, `INSERT OR IGNORE INTO miniapp_initdata_seen (user_id, auth_hash, auth_date) VALUES (?,?,?)`,
    [userId, String(dedupKey), Number(authDate) || 0]);
  return { fresh: r.changes > 0 };
}

// ── P8.6 ops-sweep: TTL-гигиена auth-таблиц (каждый вызов = ОДИН autocommit-стейтмент,
// без явных транзакций — txnLock-инвариант; таймер в server.js оборачивает пачку в withTxnLock).
// Grace 7d: lazy-отказ validate*Session наступает СТРОГО раньше физического удаления
// (PWA expires_at фиксированный с минта, НЕ sliding — бампается только last_used_at;
// miniapp: sliding idle ≤ absolute cap), так что purge никогда не убивает живую сессию.
async function purgeStaleSessions(graceMs = 7 * 86400e3) {
  const db = getDb(); if (!db) return 0;
  const cutoff = new Date(Date.now() - graceMs).toISOString();
  const r = await dbRun(db,
    `DELETE FROM user_sessions
      WHERE (revoked_at IS NOT NULL AND revoked_at < ?)
         OR (COALESCE(absolute_expires_at, expires_at) < ?)`, [cutoff, cutoff]);
  return r.changes;
}

// initData replay-ledger: реальная replay-граница = короткий auth_date TTL (1ч); строки
// старше окна наблюдаемости — чистый рост.
async function purgeStaleInitDataSeen(maxAgeMs = 7 * 86400e3) {
  const db = getDb(); if (!db) return 0;
  const r = await dbRun(db, `DELETE FROM miniapp_initdata_seen WHERE seen_at < ?`,
    [new Date(Date.now() - maxAgeMs).toISOString()]);
  return r.changes;
}

// Каждый минт сессии создаёт СВОЮ devices-строку (miniapp: каждый launch) — без этой чистки
// devices растут 1:1 с purged-сессиями. Удаляем только осиротевшие И давно не виденные.
async function purgeOrphanDevices(graceMs = 7 * 86400e3) {
  const db = getDb(); if (!db) return 0;
  const r = await dbRun(db,
    `DELETE FROM devices
      WHERE (last_seen_at IS NULL OR last_seen_at < ?)
        AND id NOT IN (SELECT device_id FROM user_sessions WHERE device_id IS NOT NULL)`,
    [new Date(Date.now() - graceMs).toISOString()]);
  return r.changes;
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
const SWEEP_EXEMPT = { deletion_journal: 1, memory_erasure_journal: 1, f2_erasure_journal: 1, sqlite_sequence: 1 };
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
  // CLG-P7.1a: pairing-token hashes get the same treatment (secret hashes have no place in export)
  if (out.tables.channel_pairing_tokens) for (const t of out.tables.channel_pairing_tokens) { delete t.token_hash; }
  // CLG-P8.5: reading-handoff tokens — тот же принцип
  if (out.tables.handoff_tokens) for (const t of out.tables.handoff_tokens) { delete t.token_hash; }
  if (out.tables.learner_memory_records) for (const r of out.tables.learner_memory_records) delete r.dedupe_key;
  if (out.tables.learner_memory_revisions) for (const r of out.tables.learner_memory_revisions) delete r.payload_digest;
  if (out.tables.learner_memory_source_links) for (const r of out.tables.learner_memory_source_links) delete r.keyed_digest;
  if (out.tables.f2_requests) for (const r of out.tables.f2_requests) { delete r.expected_digest; delete r.expected_json; }
  if (out.tables.f2_attempts) for (const r of out.tables.f2_attempts) delete r.answer_digest;
  if (out.tables.f2_source_links) for (const r of out.tables.f2_source_links) delete r.keyed_digest;
  // F1 per-memory erasure journal is deliberately outside the structural sweep so an old
  // backup cannot resurrect a deleted record. It is content-free and exported explicitly.
  try { out.memory_erasures = await dbAll(db, `SELECT memory_id,deleted_at,reason_code FROM memory_erasure_journal WHERE user_id=? ORDER BY deleted_at,memory_id`, [userId]); }
  catch (_) { out.memory_erasures = []; }
  try { out.f2_erasures = await dbAll(db, `SELECT chain_id,deleted_at,reason_code FROM f2_erasure_journal WHERE user_id=? ORDER BY deleted_at,chain_id`, [userId]); }
  catch (_) { out.f2_erasures = []; }
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
    try { await dbRun(db, `DELETE FROM memory_erasure_journal WHERE user_id = ?`, [userId]); } catch (_) {}
    try { await dbRun(db, `DELETE FROM f2_erasure_journal WHERE user_id = ?`, [userId]); } catch (_) {}
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
  try { const m = await dbGet(db, `SELECT COUNT(*) c FROM memory_erasure_journal WHERE user_id=?`, [userId]); if(Number(m&&m.c)){perTable.memory_erasure_journal=Number(m.c);total+=Number(m.c);} } catch (_) {}
  try { const f = await dbGet(db, `SELECT COUNT(*) c FROM f2_erasure_journal WHERE user_id=?`, [userId]); if(Number(f&&f.c)){perTable.f2_erasure_journal=Number(f.c);total+=Number(f.c);} } catch (_) {}
  return { total, perTable };
}

module.exports = {
  ensureOwnerUser, createSession, validateSession, revokeSession, listSessions,
  createMiniappSession, validateMiniappSession, getUserAuthContextVersion,
  bumpUserAuthContextVersion, recordMiniappInitDataSeen,
  purgeStaleSessions, purgeStaleInitDataSeen, purgeOrphanDevices,
  recordConsent, listConsents, audit,
  listUserScopedTables, exportUserData, deleteUserData, countUserRows,
  SESSION_TTL_MS,
};
