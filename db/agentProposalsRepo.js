"use strict";

// AA3 commit 3c — agent_proposals (W1 propose-then-confirm). The external agent
// creates PENDING rows; ONLY the owner (session+CSRF, first-party panel) can
// decide them; LinguistPro executes after confirm. This store is advisory and
// terminal — it never touches review_log/FSRS/word_status/grades (R17) and its
// rows are never re-served as mentor/explanation content.
//
// Adversarial-review invariants enforced here:
// - lazy-expire before every count/insert/list so expired-PENDING rows can
//   never wedge the dedupe slot or the PENDING cap (R14 zombie finding);
// - dedupe_key is SERVER-derived: sha256(connection|kind|canonicalJson(payload))
//   — the MCP input schema carries no dedupe field (R17 confusion primitive);
// - PENDING cap per user + deny-cooldown: an identical re-propose within
//   DENY_COOLDOWN_DAYS returns the denial instead of re-nagging the owner;
// - decide() re-asserts the authoring connection is still ACTIVE/SCOPE_REDUCED
//   (R14: a revoked agent's intent must not outlive its access);
// - confirm relabels authority to USER_CONFIRMED_AGENT_ASSERTED — never to a
//   user-authored class (R9 derived≠asserted).

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");
const POLICY = require("../agent/access/proposalPolicy");

const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r || null)));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const DAY_MS = 86400000;

function error(code) { const e = new Error(code); e.code = code; throw e; }
function requireDb() { const db = getDb(); if (!db) error("DB_NOT_AVAILABLE"); return db; }
function iso(ms) { return new Date(ms).toISOString(); }
function nowMsOf(nowIso) {
  const ms = nowIso != null ? Date.parse(String(nowIso)) : Date.now();
  if (!Number.isFinite(ms)) error("AA_PROPOSAL_CLOCK_INVALID");
  return ms;
}
// Canonical JSON with sorted keys so semantically-equal payloads dedupe.
function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function dedupeKeyFor(connectionId, kind, payload) {
  return crypto.createHash("sha256")
    .update(`${connectionId}|${kind}|${canonicalJson(payload)}`, "utf8").digest("hex");
}
// Byte-safe truncation (multi-byte Hebrew/Cyrillic; the column CHECK caps BYTES).
function byteSlice(value, maxBytes) {
  let s = String(value == null ? "" : value);
  while (Buffer.byteLength(s, "utf8") > maxBytes) s = s.slice(0, -1);
  return s;
}

async function transaction(fn) {
  const db = requireDb();
  return withTxnLock(async () => {
    await run(db, "BEGIN IMMEDIATE");
    try { const out = await fn(db); await run(db, "COMMIT"); return out; }
    catch (err) { try { await run(db, "ROLLBACK"); } catch (_) {} throw err; }
  });
}

async function lazyExpireTx(db, userId, at) {
  await run(db, `UPDATE agent_proposals SET status='EXPIRED', updated_at=? WHERE user_id=? AND status='PENDING' AND expires_at<=?`, [at, userId, at]);
}

// Idempotent create. Returns { proposal_id, status, expires_at, reused }.
// status is 'PENDING' or (deny-cooldown) 'DENIED' — never CONFIRMED: the agent
// must not learn confirmation state through the propose channel.
async function create(userId, { oauthClientId, connectionId, kind, payload, displayTitle, nowIso } = {}) {
  if (!userId || !oauthClientId || !connectionId) error("AA_PROPOSAL_PRINCIPAL_INVALID");
  if (!POLICY.PROPOSAL_KINDS.includes(kind)) error("AA_PROPOSAL_KIND_INVALID");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) error("AA_PROPOSAL_PAYLOAD_INVALID");
  const nowMs = nowMsOf(nowIso);
  const at = iso(nowMs);
  const dedupeKey = dedupeKeyFor(connectionId, kind, payload);
  const payloadJson = JSON.stringify(payload);
  if (Buffer.byteLength(payloadJson, "utf8") > 16384) error("AA_PROPOSAL_PAYLOAD_TOO_LARGE");
  return transaction(async (db) => {
    await lazyExpireTx(db, String(userId), at);
    // Deny-cooldown: same connection+payload recently denied → return the denial.
    const denied = await get(db,
      `SELECT proposal_id, status, expires_at FROM agent_proposals
        WHERE user_id=? AND connection_id=? AND dedupe_key=? AND status IN ('DENIED','REJECTED') AND decided_at>? ORDER BY decided_at DESC LIMIT 1`,
      [String(userId), String(connectionId), dedupeKey, iso(nowMs - POLICY.DENY_COOLDOWN_DAYS * DAY_MS)]);
    if (denied) return { proposal_id: denied.proposal_id, status: "DENIED", expires_at: denied.expires_at, reused: true };
    // Idempotency: live PENDING with the same dedupe slot → same proposal_id.
    const existing = await get(db,
      `SELECT proposal_id, expires_at FROM agent_proposals
        WHERE user_id=? AND connection_id=? AND dedupe_key=? AND status='PENDING' LIMIT 1`,
      [String(userId), String(connectionId), dedupeKey]);
    if (existing) return { proposal_id: existing.proposal_id, status: "PENDING", expires_at: existing.expires_at, reused: true };
    const live = await get(db, `SELECT COUNT(*) c FROM agent_proposals WHERE user_id=? AND status='PENDING'`, [String(userId)]);
    if (Number(live && live.c) >= POLICY.PENDING_CAP) error("AA_PROPOSAL_PENDING_LIMIT");
    const proposalId = "ap_" + crypto.randomBytes(16).toString("hex");
    const expiresAt = iso(nowMs + POLICY.ttlDaysForKind(kind) * DAY_MS);
    await run(db,
      `INSERT INTO agent_proposals
         (proposal_id,user_id,oauth_client_id,connection_id,kind,payload_json,display_title,authority,dedupe_key,status,created_at,updated_at,expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,'PENDING',?,?,?)`,
      [proposalId, String(userId), String(oauthClientId), String(connectionId), kind, payloadJson,
       displayTitle != null ? byteSlice(displayTitle, 200) : null, "AGENT_ASSERTED", dedupeKey, at, at, expiresAt]);
    return { proposal_id: proposalId, status: "PENDING", expires_at: expiresAt, reused: false };
  });
}

function parseRow(row) {
  if (!row) return null;
  let payload = null;
  try { payload = JSON.parse(row.payload_json); } catch (_) { payload = null; }
  return { ...row, payload };
}

// Owner panel list: live PENDING only, and ONLY proposals whose authoring
// connection is still ACTIVE/SCOPE_REDUCED (revocation kills agent influence).
async function listPending(userId, { nowIso } = {}) {
  const db = requireDb();
  const at = iso(nowMsOf(nowIso));
  await withTxnLock(() => run(db,
    `UPDATE agent_proposals SET status='EXPIRED', updated_at=? WHERE user_id=? AND status='PENDING' AND expires_at<=?`, [at, String(userId), at]));
  const rows = await all(db,
    `SELECT p.proposal_id, p.kind, p.payload_json, p.display_title, p.authority, p.status,
            p.created_at, p.expires_at, p.oauth_client_id, c.display_label,
            COALESCE(o.display_name, p.oauth_client_id) AS client_display_name
       FROM agent_proposals p
       JOIN agent_connections c ON c.connection_id = p.connection_id AND c.user_id = p.user_id
       LEFT JOIN agent_oauth_clients o ON o.oauth_client_id = p.oauth_client_id
      WHERE p.user_id=? AND p.status='PENDING' AND c.status IN ('ACTIVE','SCOPE_REDUCED')
      ORDER BY p.created_at DESC LIMIT 50`, [String(userId)]);
  return rows.map(parseRow);
}

// Load one live PENDING proposal for the decision route (validates connection
// status). Throws typed errors; never returns another user's row.
async function getPending(userId, proposalId, { nowIso } = {}) {
  const db = requireDb();
  const at = iso(nowMsOf(nowIso));
  const row = await get(db,
    `SELECT p.*, c.status AS connection_status FROM agent_proposals p
       JOIN agent_connections c ON c.connection_id = p.connection_id AND c.user_id = p.user_id
      WHERE p.user_id=? AND p.proposal_id=?`, [String(userId), String(proposalId)]);
  if (!row) error("AA_PROPOSAL_NOT_FOUND");
  if (row.status !== "PENDING" || row.expires_at <= at) error("AA_PROPOSAL_NOT_PENDING");
  if (!["ACTIVE", "SCOPE_REDUCED"].includes(row.connection_status)) error("AA_PROPOSAL_CONNECTION_INACTIVE");
  return parseRow(row);
}

// Race-safe decision: single conditional UPDATE flips exactly one live PENDING
// row. Confirm relabels authority; deny keeps AGENT_ASSERTED.
async function decide(userId, proposalId, decision, { nowIso } = {}) {
  if (!["CONFIRMED", "DENIED", "REJECTED"].includes(decision)) error("AA_PROPOSAL_BAD_DECISION");
  const at = iso(nowMsOf(nowIso));
  return transaction(async (db) => {
    const row = await get(db,
      `SELECT p.proposal_id, p.kind, p.status, p.expires_at, c.status AS connection_status
         FROM agent_proposals p
         JOIN agent_connections c ON c.connection_id = p.connection_id AND c.user_id = p.user_id
        WHERE p.user_id=? AND p.proposal_id=?`, [String(userId), String(proposalId)]);
    if (!row) error("AA_PROPOSAL_NOT_FOUND");
    if (row.status !== "PENDING" || row.expires_at <= at) error("AA_PROPOSAL_NOT_PENDING");
    if (!["ACTIVE", "SCOPE_REDUCED"].includes(row.connection_status)) error("AA_PROPOSAL_CONNECTION_INACTIVE");
    const r = await run(db,
      `UPDATE agent_proposals
          SET status=?, authority=CASE WHEN ?='CONFIRMED' THEN 'USER_CONFIRMED_AGENT_ASSERTED' ELSE authority END,
              decided_at=?, updated_at=?
        WHERE user_id=? AND proposal_id=? AND status='PENDING'`,
      [decision, decision, at, at, String(userId), String(proposalId)]);
    if (r.changes !== 1) error("AA_PROPOSAL_NOT_PENDING");
    return { proposal_id: String(proposalId), kind: row.kind, status: decision, decided_at: at };
  });
}

// Owner-initiated hard delete of any own proposal (R15 per-row control).
// Advisory data → no erasure journal; a restore from an older backup can
// resurrect the row (documented, accepted for this class).
async function deleteProposal(userId, proposalId) {
  const db = requireDb();
  const r = await withTxnLock(() => run(db,
    `DELETE FROM agent_proposals WHERE user_id=? AND proposal_id=?`, [String(userId), String(proposalId)]));
  if (r.changes !== 1) error("AA_PROPOSAL_NOT_FOUND");
  return { proposal_id: String(proposalId), deleted: true };
}

// Retention sweep (ops-sweep cadence). Bounds mirror proposalPolicy — the same
// constants shown in the intent.propose consent card.
async function pruneOld(nowIso) {
  const db = getDb(); if (!db) return { expired: 0, purged: 0, blanked: 0 };
  const nowMs = nowMsOf(nowIso);
  const at = iso(nowMs);
  const out = { expired: 0, purged: 0, blanked: 0 };
  try {
    const e = await run(db, `UPDATE agent_proposals SET status='EXPIRED', updated_at=? WHERE status='PENDING' AND expires_at<=?`, [at, at]);
    out.expired = e.changes || 0;
    const p1 = await run(db, `DELETE FROM agent_proposals WHERE status IN ('DENIED','REJECTED','EXPIRED') AND COALESCE(decided_at, expires_at) <= ?`, [iso(nowMs - POLICY.PURGE_DECIDED_DAYS * DAY_MS)]);
    const p2 = await run(db, `DELETE FROM agent_proposals WHERE status='CONFIRMED' AND decided_at <= ?`, [iso(nowMs - POLICY.PURGE_CONFIRMED_DAYS * DAY_MS)]);
    out.purged = (p1.changes || 0) + (p2.changes || 0);
    const b = await run(db,
      `UPDATE agent_proposals SET payload_json='{"purged":true}', dedupe_key=NULL, updated_at=?
        WHERE status='CONFIRMED' AND decided_at <= ? AND payload_json != '{"purged":true}'`,
      [at, iso(nowMs - POLICY.BLANK_CONFIRMED_DAYS * DAY_MS)]);
    out.blanked = b.changes || 0;
  } catch (_) {}
  return out;
}

module.exports = { create, listPending, getPending, decide, deleteProposal, pruneOld, dedupeKeyFor, canonicalJson };
