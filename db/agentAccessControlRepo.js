"use strict";

// AA2-CP1 — append-only runtime-control journal for Agent Access.
// The journal is the single source of truth for the two window flags
// (subjects "clients"/"mcp"); client status stays canonical in
// agent_oauth_clients and its transitions journal here inside the same
// transaction (see agentAccessOAuthRepo.setClientStatus).

const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");

const FLAG_SUBJECTS = Object.freeze(["clients", "mcp"]);
const ACTIONS = new Set(["FLAG_SET", "CLIENT_STATUS_SET", "WINDOW_OPEN", "WINDOW_CLOSE", "RESTORE_FAIL_CLOSED"]);
const VALUES = new Set(["0", "1", "ACTIVE", "SUSPENDED"]);
const MAX_REASON = 240;

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
function error(code) { const e = new Error(code); e.code = code; throw e; }
function requireDb() { const db = getDb(); if (!db) error("DB_NOT_AVAILABLE"); return db; }

function validateEvent(input) {
  const x = input && typeof input === "object" ? input : {};
  const actor = String(x.actor_user_id || "");
  if (!actor || actor.length > 128) error("AA_CP_EVENT_BAD_ACTOR");
  const action = String(x.action || "");
  if (!ACTIONS.has(action)) error("AA_CP_EVENT_BAD_ACTION");
  const subject = String(x.subject || "");
  if (!subject || subject.length > 128) error("AA_CP_EVENT_BAD_SUBJECT");
  const value = String(x.value || "");
  if (!VALUES.has(value)) error("AA_CP_EVENT_BAD_VALUE");
  let expiresAt = null;
  if (x.expires_at !== null && x.expires_at !== undefined) {
    expiresAt = String(x.expires_at);
    const parsed = Date.parse(expiresAt);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(expiresAt) || Number.isNaN(parsed)) {
      error("AA_CP_EVENT_BAD_EXPIRY");
    }
  }
  const reason = String(x.reason || "").trim();
  if (!reason || reason.length > MAX_REASON) error("AA_CP_EVENT_BAD_REASON");
  return { actor_user_id: actor, action, subject, value, expires_at: expiresAt, reason };
}

// Insert one journal row using an ALREADY OPEN transaction handle. Used by
// setClientStatus to keep status change + journal in one transaction.
async function appendEventTx(db, input, at) {
  const x = validateEvent(input);
  const t = String(at || new Date().toISOString());
  await run(db, `INSERT INTO agent_access_control_events (created_at,actor_user_id,action,subject,value,expires_at,reason)
    VALUES (?,?,?,?,?,?,?)`, [t, x.actor_user_id, x.action, x.subject, x.value, x.expires_at, x.reason]);
  return { ...x, created_at: t };
}

async function appendEvent(input, at) {
  const db = requireDb();
  return withTxnLock(async () => {
    await run(db, "BEGIN IMMEDIATE");
    try { const out = await appendEventTx(db, input, at); await run(db, "COMMIT"); return out; }
    catch (err) { try { await run(db, "ROLLBACK"); } catch (_) {} throw err; }
  });
}

// Latest journal row per flag subject. Throws on any DB problem — the caller
// (resolver) is the fail-closed boundary, not this repo.
async function latestFlagStates() {
  const db = requireDb();
  const out = {};
  for (const subject of FLAG_SUBJECTS) {
    out[subject] = await get(db, `SELECT event_id,created_at,actor_user_id,action,subject,value,expires_at,reason
      FROM agent_access_control_events WHERE subject=? ORDER BY event_id DESC LIMIT 1`, [subject]);
  }
  return out;
}

async function listRecentEvents(limit = 50) {
  const db = requireDb();
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  return all(db, `SELECT event_id,created_at,actor_user_id,action,subject,value,expires_at,reason
    FROM agent_access_control_events ORDER BY event_id DESC LIMIT ?`, [n]);
}

async function listClients() {
  const db = requireDb();
  return all(db, `SELECT oauth_client_id,display_name,software_version,status,updated_at,revoked_at
    FROM agent_oauth_clients ORDER BY oauth_client_id`);
}

module.exports = { FLAG_SUBJECTS, validateEvent, appendEvent, appendEventTx, latestFlagStates, listRecentEvents, listClients };
