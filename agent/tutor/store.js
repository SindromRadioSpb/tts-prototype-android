"use strict";
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { createContext, assertContextAccess } = require("./context");
const { validateResponse, fail, closed } = require("./response");
const { withTxnLock } = require("../../db/txnLock");
const hash = value => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const ONLINE_MS = 20000, LEASE_MS = 30000, RUN_MS = 180000;

function createStore(getDb, clock = Date.now) {
  const run = (sql, p = []) => new Promise((resolve, reject) => getDb().run(sql, p, function (e) { e ? reject(e) : resolve(this); }));
  const get = (sql, p = []) => new Promise((resolve, reject) => getDb().get(sql, p, (e, r) => e ? reject(e) : resolve(r)));
  async function transaction(fn) {
    return withTxnLock(async () => {
      await run("BEGIN IMMEDIATE");
      try { const out = await fn(); await run("COMMIT"); return out; }
      catch (e) { await run("ROLLBACK"); throw e; }
    });
  }
  async function sweep() {
    const now = clock();
    await run("DELETE FROM tutor_pairings WHERE expires_at<=?", [now]);
    // Content expires even if nobody returns to the page; routes and periodic sweep call this.
    await run("DELETE FROM tutor_sessions WHERE expires_at<=?", [now]);
    await run("UPDATE tutor_sessions SET state='failed',error_code='agent_disconnected',version=version+1 WHERE state='running' AND (lease_until<=? OR run_deadline<=?)", [now, now]);
    await run("UPDATE tutor_sessions SET state='failed',error_code='agent_offline',version=version+1 WHERE state='queued' AND created_at<=?", [now - LEASE_MS]);
  }
  async function connectionForUser(userId) {
    return get("SELECT * FROM tutor_connections WHERE user_id=?", [String(userId)]);
  }
  async function authenticate(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail("connection_required");
    const conn = await get("SELECT * FROM tutor_connections WHERE token_hash=?", [hash(token)]);
    if (!conn) fail("connection_required");
    return conn;
  }
  function binding(conn, sessionId) {
    return { principal_id: conn.user_id, connection_id: conn.id, consent_revision: conn.consent_revision, session_id: sessionId };
  }
  function view(row) {
    return { id: row.id, version: row.version, state: row.state, error: row.error_code || null,
      expires_at: row.expires_at, context: JSON.parse(row.context_json), question: row.question, result: row.result_json ? JSON.parse(row.result_json) : null };
  }
  async function owned(userId, id) {
    const row = await get("SELECT * FROM tutor_sessions WHERE user_id=? AND id=?", [String(userId), id]);
    if (!row) fail("context_unavailable");
    const conn = await connectionForUser(userId);
    if (!conn || conn.id !== row.connection_id) fail("connection_required");
    assertContextAccess(JSON.parse(row.context_json), binding(conn, id), clock());
    return row;
  }
  return {
    sweep: () => transaction(sweep),
    pair: userId => transaction(async () => {
      await sweep();
      const code = secret(), expires_at = clock() + 300000;
      await run("INSERT INTO tutor_pairings(user_id,code_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at", [String(userId), hash(code), expires_at]);
      return { pairing_code: code, expires_at };
    }),
    claim: input => transaction(async () => {
      closed(input, ["pairing_code", "client_nonce"]);
      if (![input.pairing_code, input.client_nonce].every(v => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v))) fail("invalid_request");
      await sweep();
      const pair = await get("SELECT * FROM tutor_pairings WHERE code_hash=?", [hash(input.pairing_code)]);
      if (!pair) fail("pairing_expired");
      const token = secret(), id = randomUUID();
      // Atomic single-use claim; replacement revokes old jobs and credentials by cascade.
      await run("DELETE FROM tutor_connections WHERE user_id=?", [pair.user_id]);
      await run("DELETE FROM tutor_pairings WHERE user_id=?", [pair.user_id]);
      await run("INSERT INTO tutor_connections(id,user_id,token_hash,consent_revision,created_at,last_seen) VALUES(?,?,?,?,?,?)", [id, pair.user_id, hash(token), randomUUID(), clock(), 0]);
      return { connection_id: id, token, client_nonce: input.client_nonce };
    }),
    status: userId => transaction(async () => {
      await sweep(); const c = await connectionForUser(userId);
      return c ? { connection_id: c.id, status: c.last_seen > 0 && clock() - c.last_seen < ONLINE_MS ? "online" : "agent_offline" } : { status: "connection_required" };
    }),
    revoke: userId => transaction(async () => {
      await run("DELETE FROM tutor_connections WHERE user_id=?", [String(userId)]);
      await run("DELETE FROM tutor_pairings WHERE user_id=?", [String(userId)]);
      return { revoked: true };
    }),
    create: (userId, input) => transaction(async () => {
      closed(input, ["connection_id", "request_key", "context", "question", "consent"]);
      if (input.consent !== "selected_fragment_v1" || typeof input.question !== "string" || !input.question.trim() || input.question.length > 1000 ||
          typeof input.request_key !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(input.request_key)) fail("invalid_request");
      // M1 receives explicit browser snapshots only; it never trusts client corpus authority.
      if (input.context?.source?.kind !== "local_snapshot") fail("invalid_context");
      await sweep(); const conn = await connectionForUser(userId);
      if (!conn || conn.id !== input.connection_id) fail("connection_required");
      const requestHash = hash(JSON.stringify(input));
      const prior = await get("SELECT * FROM tutor_sessions WHERE user_id=? AND request_key=?", [String(userId), input.request_key]);
      if (prior) {
        if (prior.request_hash !== requestHash) fail("request_conflict");
        return view(await owned(userId, prior.id));
      }
      if (!conn.last_seen || clock() - conn.last_seen >= ONLINE_MS) fail("agent_offline");
      const active = await get("SELECT count(*) AS n FROM tutor_sessions WHERE connection_id=? AND state IN ('queued','running')", [conn.id]);
      if (active.n) fail("session_busy");
      const count = await get("SELECT count(*) AS n FROM tutor_sessions WHERE user_id=?", [String(userId)]);
      if (count.n >= 30) fail("session_limit");
      const id = randomUUID(), context = createContext(input.context, binding(conn, id), clock());
      await run("INSERT INTO tutor_sessions(id,user_id,connection_id,request_key,request_hash,context_json,question,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'queued',?,?)",
        [id, String(userId), conn.id, input.request_key, requestHash, JSON.stringify(context), input.question, clock(), context.expires_at]);
      return view(await owned(userId, id));
    }),
    read: (userId, id) => transaction(async () => { await sweep(); return view(await owned(userId, id)); }),
    cancel: (userId, id) => transaction(async () => {
      await sweep(); await owned(userId, id);
      await run("UPDATE tutor_sessions SET state='cancelled',version=version+1 WHERE id=? AND state IN ('queued','running')", [id]);
      return view(await owned(userId, id));
    }),
    next: token => transaction(async () => {
      await sweep(); const conn = await authenticate(token);
      await run("UPDATE tutor_connections SET last_seen=? WHERE id=?", [clock(), conn.id]);
      const active = await get("SELECT id FROM tutor_sessions WHERE connection_id=? AND state='running'", [conn.id]);
      if (active) return { job: null }; // never re-execute an uncertain inference after disconnect.
      const row = await get("SELECT * FROM tutor_sessions WHERE connection_id=? AND state='queued' ORDER BY created_at LIMIT 1", [conn.id]);
      if (!row) return { job: null };
      const context = assertContextAccess(JSON.parse(row.context_json), binding(conn, row.id), clock());
      const lease = secret();
      await run("UPDATE tutor_sessions SET state='running',version=version+1,lease_hash=?,lease_until=?,run_deadline=? WHERE id=?", [hash(lease), clock() + LEASE_MS, clock() + RUN_MS, row.id]);
      // Never deliver principal metadata to the model. Connector receives only these fields.
      const { principal_binding, consent_snapshot_ref, ...publicContext } = context;
      return { job: { session_id: row.id, lease, context: publicContext, question: row.question, deadline: clock() + RUN_MS } };
    }),
    heartbeat: (token, id, lease) => transaction(async () => {
      await sweep(); const conn = await authenticate(token);
      const row = await owned(conn.user_id, id);
      if (row.lease_hash !== hash(String(lease))) fail("lease_invalid");
      await run("UPDATE tutor_connections SET last_seen=? WHERE id=?", [clock(), conn.id]);
      if (row.state === "running") await run("UPDATE tutor_sessions SET lease_until=? WHERE id=?", [clock() + LEASE_MS, id]);
      return { state: row.state };
    }),
    complete: (token, id, lease, output) => transaction(async () => {
      await sweep(); const conn = await authenticate(token); const row = await owned(conn.user_id, id);
      if (row.lease_hash !== hash(String(lease))) fail("lease_invalid");
      const response = validateResponse(output, JSON.parse(row.context_json));
      const resultHash = hash(JSON.stringify(response));
      if (row.result_hash === resultHash) return { accepted: true, state: row.state };
      if (row.state !== "running") fail("result_rejected");
      const state = response.error ? "failed" : "completed";
      await run("UPDATE tutor_sessions SET state=?,version=version+1,result_json=?,result_hash=?,error_code=? WHERE id=?", [state, JSON.stringify(response), resultHash, response.error || null, id]);
      return { accepted: true, state };
    }),
  };
}
module.exports = { createStore, ONLINE_MS, LEASE_MS, RUN_MS };
