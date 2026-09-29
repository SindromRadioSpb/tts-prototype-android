"use strict";

const { randomUUID } = require("node:crypto");
const { assertContextAccess } = require("../tutor/context");

const CONSENT_VERSION = "agent-access-consent-v6";
const SCOPES = Object.freeze([
  "tutor.capabilities.read", "tutor.context.read", "tutor.session.read", "tutor.artifact.propose",
]);
const MAX_CONTEXT_BYTES = 24 * 1024;
const iso = value => new Date(value).toISOString();
function byteSlice(value, maxBytes) { let out = String(value || ""); while (Buffer.byteLength(out, "utf8") > maxBytes) out = out.slice(0, -1); return out; }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function query(db, sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))); }
function run(db, sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve())); }
function id(value) { return typeof value === "string" && /^[A-Za-z0-9_.:@/-]{1,128}$/.test(value); }

function createTutorMcpStore({ getDb, oauthRepo, proposalsRepo, now = Date.now }) {
  if (typeof getDb !== "function" || typeof oauthRepo?.loadConnection !== "function" || typeof proposalsRepo?.create !== "function") throw new TypeError("AA_TUTOR_MCP_DEPENDENCY_INVALID");
  async function liveConnection(userId, connectionId, needed) {
    if (!id(userId) || !id(connectionId)) fail("AA_TUTOR_HANDOFF_INVALID");
    let connection;
    try { connection = await oauthRepo.loadConnection(userId, connectionId); }
    catch (_) { fail("AA_TUTOR_CONNECTION_REQUIRED"); }
    if (!connection || !["ACTIVE", "SCOPE_REDUCED"].includes(connection.status)) fail("AA_TUTOR_CONNECTION_REQUIRED");
    for (const scope of needed) {
      if (!connection.grants.some(grant => grant.scope === scope && grant.status === "ACTIVE" && grant.consent_version === CONSENT_VERSION)) fail("AA_TUTOR_SCOPE_REQUIRED");
    }
    return connection;
  }
  async function sessionRow(userId, sessionId) {
    const row = await query(getDb(), `SELECT s.*,c.consent_revision FROM tutor_sessions s
      JOIN tutor_connections c ON c.id=s.connection_id AND c.user_id=s.user_id
      WHERE s.user_id=? AND s.id=?`, [userId, sessionId]);
    if (!row || row.expires_at <= now()) fail("AA_TUTOR_SESSION_UNAVAILABLE");
    const context = JSON.parse(row.context_json);
    try { assertContextAccess(context, { principal_id: userId, connection_id: row.connection_id, consent_revision: row.consent_revision, session_id: row.id }, now()); }
    catch (_) { fail("AA_TUTOR_SESSION_UNAVAILABLE"); }
    return { row, context };
  }
  async function handoff(userId, connectionId, sessionId) {
    const record = await query(getDb(), `SELECT * FROM tutor_agent_handoffs
      WHERE user_id=? AND agent_connection_id=? AND tutor_session_id=?`, [userId, connectionId, sessionId]);
    if (!record || record.revoked_at != null || record.expires_at <= now()) fail("AA_TUTOR_HANDOFF_UNAVAILABLE");
    const { row, context } = await sessionRow(userId, sessionId);
    if (record.excerpt_digest !== context.excerpt_digest || record.context_json !== row.context_json) fail("AA_TUTOR_SOURCE_CHANGED");
    return { record, row, context };
  }
  async function issue(userId, connectionId, sessionId) {
    if (!id(sessionId)) fail("AA_TUTOR_HANDOFF_INVALID");
    await liveConnection(userId, connectionId, ["tutor.context.read"]);
    const { row, context } = await sessionRow(userId, sessionId);
    if (row.state !== "completed") fail("AA_TUTOR_SESSION_UNAVAILABLE");
    const publicContext = { schema_version: "aa.tutor_context.1.0.0", context_id: randomUUID(),
      session_id: row.id, surface: context.surface, locale: context.locale, source: context.source,
      excerpt_digest: context.excerpt_digest, authority: context.authority, expires_at: iso(context.expires_at) };
    if (Buffer.byteLength(JSON.stringify(publicContext), "utf8") > MAX_CONTEXT_BYTES) fail("AA_TUTOR_CONTEXT_TOO_LARGE");
    const existing = await query(getDb(), `SELECT context_id,expires_at,revoked_at FROM tutor_agent_handoffs WHERE agent_connection_id=? AND tutor_session_id=?`, [connectionId, sessionId]);
    if (existing && existing.expires_at > now() && existing.revoked_at == null) return { context_id: existing.context_id, session_id: row.id, expires_at: iso(existing.expires_at) };
    if (existing) await run(getDb(), `DELETE FROM tutor_agent_handoffs WHERE agent_connection_id=? AND tutor_session_id=?`, [connectionId, sessionId]);
    const handoffId = publicContext.context_id, expiresAt = Math.min(context.expires_at, now() + 15 * 60 * 1000);
    await run(getDb(), `INSERT INTO tutor_agent_handoffs(context_id,user_id,agent_connection_id,tutor_session_id,context_json,excerpt_digest,issued_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?)`, [handoffId, userId, connectionId, row.id, row.context_json, context.excerpt_digest, now(), expiresAt]);
    return { context_id: handoffId, session_id: row.id, expires_at: iso(expiresAt) };
  }
  async function capabilities(principal) {
    const connection = await liveConnection(principal.user_id, principal.connection_id, ["tutor.capabilities.read"]);
    return { schema_version: "aa.tutor_capabilities.1.0.0", supported_schema_versions: ["aa.tutor_context.1.0.0", "aa.tutor_session.1.0.0", "aa.tutor_artifact_proposal.1.0.0"],
      operations: SCOPES.map(scope => ({ scope, granted: connection.grants.some(grant => grant.scope === scope && grant.status === "ACTIVE" && grant.consent_version === CONSENT_VERSION) })), generated_at: iso(now()) };
  }
  async function context(principal, contextId) {
    await liveConnection(principal.user_id, principal.connection_id, ["tutor.context.read"]);
    const record = await query(getDb(), `SELECT tutor_session_id FROM tutor_agent_handoffs WHERE context_id=? AND user_id=? AND agent_connection_id=?`, [contextId, principal.user_id, principal.connection_id]);
    if (!record) fail("AA_TUTOR_HANDOFF_UNAVAILABLE");
    const bound = await handoff(principal.user_id, principal.connection_id, record.tutor_session_id);
    const c = bound.context;
    return { schema_version: "aa.tutor_context.1.0.0", context_id: bound.record.context_id, session_id: bound.row.id,
      surface: c.surface, locale: c.locale, source: c.source, excerpt_digest: c.excerpt_digest,
      authority: c.authority, expires_at: iso(bound.record.expires_at) };
  }
  async function session(principal, sessionId) {
    await liveConnection(principal.user_id, principal.connection_id, ["tutor.session.read"]);
    const { row, context: c, record } = await handoff(principal.user_id, principal.connection_id, sessionId);
    const result = row.result_json ? JSON.parse(row.result_json) : null;
    const proposal = await query(getDb(), `SELECT proposal_state FROM tutor_practice WHERE session_id=?`, [sessionId]);
    return { schema_version: "aa.tutor_session.1.0.0", session_id: row.id, context_id: record.context_id,
      state: row.state, question: row.question, answer: result?.text ? byteSlice(result.text, 4000) : null,
      answer_truncated: !!result?.text && Buffer.byteLength(result.text, "utf8") > 4000,
      practice_proposal_state: proposal?.proposal_state || null, excerpt_digest: c.excerpt_digest,
      expires_at: iso(row.expires_at) };
  }
  async function propose(principal, input) {
    await liveConnection(principal.user_id, principal.connection_id, ["tutor.artifact.propose"]);
    const { row, context: c, record } = await handoff(principal.user_id, principal.connection_id, input.session_id);
    if (row.state !== "completed" || input.source_digest !== c.excerpt_digest) fail("AA_TUTOR_SOURCE_CHANGED");
    const saved = await proposalsRepo.create(principal.user_id, {
      oauthClientId: principal.oauth_client_id, connectionId: principal.connection_id,
      kind: "note", payload: { title: input.title, body: input.body, source_digest: input.source_digest,
        session_id: input.session_id, context_id: record.context_id },
      displayTitle: input.title, idempotencyKey: input.idempotency_key, nowIso: iso(now()),
    });
    return { schema_version: "aa.tutor_artifact_proposal.1.0.0", proposal_id: saved.proposal_id,
      state: saved.status, expires_at: saved.expires_at };
  }
  return Object.freeze({ issue, capabilities, context, session, propose });
}

module.exports = { CONSENT_VERSION, SCOPES, createTutorMcpStore };
