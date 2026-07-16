"use strict";

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");
const C = require("../agent/access/oauthContracts");

const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
const opaque = (prefix) => prefix + crypto.randomBytes(10).toString("hex");
const nowIso = () => new Date().toISOString();
const hashOpaque = (value) => {
  const text = C.bounded(value, 8192, "AA_OAUTH_PROVIDER_ID_INVALID");
  return crypto.createHash("sha256").update(text).digest("hex");
};
const epochIso = (value) => new Date(Number(value) * 1000).toISOString();
const isoEpoch = (value) => Math.floor(Date.parse(value) / 1000);
function error(code) { const e = new Error(code); e.code = code; throw e; }
function requireDb() { const db = getDb(); if (!db) error("DB_NOT_AVAILABLE"); return db; }

async function transaction(fn) {
  const db = requireDb();
  return withTxnLock(async () => {
    await run(db, "BEGIN IMMEDIATE");
    try { const out = await fn(db); await run(db, "COMMIT"); return out; }
    catch (err) { try { await run(db, "ROLLBACK"); } catch (_) {} throw err; }
  });
}

function parseClient(row) { if (!row) return null; return { ...row, redirect_uris: C.parseJson(row.redirect_uris_json, []) }; }
function parseCode(row) { if (!row) return null; return { ...row, scopes: C.parseJson(row.scopes_json, []) }; }

async function loadClientForAuthorization(clientId) {
  const db = requireDb(), id = C.safeId(clientId);
  const row = parseClient(await get(db, `SELECT oauth_client_id,display_name,software_id,software_version,redirect_uris_json,status,registration_version,created_at,updated_at,revoked_at FROM agent_oauth_clients WHERE oauth_client_id=?`, [id]));
  if (!row) error("AA_OAUTH_CLIENT_NOT_FOUND");
  delete row.redirect_uris_json;
  return row;
}

async function registerClientFixture(input, at = nowIso()) {
  const db = requireDb(), x = C.validateClient(input), t = C.iso(at);
  await run(db, `INSERT INTO agent_oauth_clients (oauth_client_id,display_name,software_id,software_version,client_type,redirect_uris_json,status,registration_version,created_at,updated_at)
    VALUES (?,?,?,?,'PUBLIC',?,'ACTIVE',?,?,?)`, [x.oauth_client_id, x.display_name, x.software_id, x.software_version, C.canonicalJson(x.redirect_uris, 4096), x.registration_version, t, t]);
  return parseClient(await get(db, `SELECT * FROM agent_oauth_clients WHERE oauth_client_id=?`, [x.oauth_client_id]));
}

async function setClientStatus(clientId, status, at = nowIso()) {
  const id = C.safeId(clientId), next = String(status), t = C.iso(at);
  if (!new Set(["ACTIVE", "SUSPENDED", "REVOKED"]).has(next)) error("AA_OAUTH_BAD_CLIENT_STATUS");
  return transaction(async (db) => {
    const client = await get(db, `SELECT status FROM agent_oauth_clients WHERE oauth_client_id=?`, [id]);
    if (!client) error("AA_OAUTH_CLIENT_NOT_FOUND");
    await run(db, `UPDATE agent_oauth_clients SET status=?,updated_at=?,revoked_at=CASE WHEN ?='REVOKED' THEN ? ELSE revoked_at END WHERE oauth_client_id=?`, [next, t, next, t, id]);
    if (next !== "ACTIVE") {
      await run(db, `UPDATE agent_connections SET status='SUSPENDED',security_epoch=security_epoch+1,updated_at=? WHERE oauth_client_id=? AND status IN ('ACTIVE','SCOPE_REDUCED')`, [t, id]);
      await run(db, `UPDATE agent_authorization_codes SET status='REVOKED',revoked_at=? WHERE oauth_client_id=? AND status='ACTIVE'`, [t, id]);
      await run(db, `UPDATE agent_token_families SET status='REVOKED',revoked_at=?,revoke_reason='CLIENT_DISABLED' WHERE oauth_client_id=? AND status='ACTIVE'`, [t, id]);
      await run(db, `UPDATE agent_refresh_tokens SET status='REVOKED',revoked_at=? WHERE status='ACTIVE' AND token_family_id IN (SELECT token_family_id FROM agent_token_families WHERE oauth_client_id=?)`, [t, id]);
    }
    return { oauth_client_id: id, status: next };
  });
}

async function createSubjectMapping(userId, subjectId, subjectVersion = "aa-subject-v1", at = nowIso()) {
  const db = requireDb(), uid = C.safeId(userId), sid = C.safeId(subjectId), version = C.safeId(subjectVersion, 64), t = C.iso(at);
  if (uid === sid) error("AA_OAUTH_SUBJECT_MUST_BE_OPAQUE");
  await run(db, `INSERT INTO agent_subject_mappings (subject_id,user_id,subject_version,security_epoch,created_at,updated_at) VALUES (?,?,?,1,?,?)`, [sid, uid, version, t, t]);
  return { subject_id: sid, user_id: uid, subject_version: version, security_epoch: 1 };
}

async function bumpSubjectSecurityEpoch(userId, reason = "ACCOUNT_SECURITY_ACTION", at = nowIso()) {
  const uid = C.safeId(userId), why = C.safeId(reason, 64), t = C.iso(at);
  return transaction(async (db) => {
    const changed = await run(db, `UPDATE agent_subject_mappings SET security_epoch=security_epoch+1,updated_at=? WHERE user_id=?`, [t, uid]);
    if (changed.changes !== 1) error("AA_OAUTH_SUBJECT_NOT_FOUND");
    await run(db, `UPDATE agent_connections SET status='SUSPENDED',security_epoch=security_epoch+1,updated_at=? WHERE user_id=? AND status IN ('ACTIVE','SCOPE_REDUCED')`, [t, uid]);
    await run(db, `UPDATE agent_authorization_codes SET status='REVOKED',revoked_at=? WHERE user_id=? AND status='ACTIVE'`, [t, uid]);
    await run(db, `UPDATE agent_token_families SET status='REVOKED',revoked_at=?,revoke_reason=? WHERE user_id=? AND status='ACTIVE'`, [t, why, uid]);
    await run(db, `UPDATE agent_refresh_tokens SET status='REVOKED',revoked_at=? WHERE user_id=? AND status='ACTIVE'`, [t, uid]);
    return get(db, `SELECT user_id,security_epoch,updated_at FROM agent_subject_mappings WHERE user_id=?`, [uid]);
  });
}

async function createPendingConnection(userId, input, at = nowIso()) {
  const db = requireDb(), uid = C.safeId(userId), t = C.iso(at);
  const x = C.closed(input, ["connection_id", "oauth_client_id", "display_label", "consent_version", "capability_version", "retention_notice_version"]);
  const connection = C.connectionId(x.connection_id), clientId = C.safeId(x.oauth_client_id);
  const client = await get(db, `SELECT status FROM agent_oauth_clients WHERE oauth_client_id=?`, [clientId]);
  if (!client || client.status !== "ACTIVE") error("AA_OAUTH_CLIENT_INACTIVE");
  await run(db, `INSERT INTO agent_connections (connection_id,user_id,oauth_client_id,display_label,status,consent_version,capability_version,retention_notice_version,security_epoch,created_at,updated_at)
    VALUES (?,?,?,?,'PENDING_AUTH',?,?,?,1,?,?)`, [connection, uid, clientId, C.bounded(x.display_label, 120), C.safeId(x.consent_version, 64), C.safeId(x.capability_version, 64), C.safeId(x.retention_notice_version, 64), t, t]);
  return loadConnection(uid, connection);
}

async function loadConnection(userId, connectionId) {
  const db = requireDb(), uid = C.safeId(userId), cid = C.connectionId(connectionId);
  const row = await get(db, `SELECT * FROM agent_connections WHERE user_id=? AND connection_id=?`, [uid, cid]);
  if (!row) error("AA_OAUTH_CONNECTION_NOT_FOUND");
  const grants = await all(db, `SELECT scope,status,consent_version,created_at,updated_at,revoked_at FROM agent_connection_grants WHERE user_id=? AND connection_id=? ORDER BY scope`, [uid, cid]);
  return { ...row, grants };
}

async function listConnectionsForUser(userId) {
  const db = requireDb(), uid = C.safeId(userId);
  const rows = await all(db, `SELECT c.connection_id,c.display_label,c.status,c.retention_notice_version,cl.display_name client_display_name
    FROM agent_connections c JOIN agent_oauth_clients cl ON cl.oauth_client_id=c.oauth_client_id
    WHERE c.user_id=? ORDER BY c.created_at,c.connection_id`, [uid]);
  const grants = await all(db, `SELECT connection_id,scope,status FROM agent_connection_grants WHERE user_id=? ORDER BY connection_id,scope`, [uid]);
  const byConnection = new Map();
  for (const grant of grants) {
    const list = byConnection.get(grant.connection_id) || [];
    list.push(Object.freeze({ ...grant }));
    byConnection.set(grant.connection_id, list);
  }
  return rows.map((row) => Object.freeze({
    ...row,
    grants: Object.freeze(byConnection.get(row.connection_id) || []),
    downstream_retention_notice: "EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO",
  }));
}

async function exactConsent(db, userId, connectionId, requestedScope, version) {
  const key = C.consentKey(connectionId, requestedScope);
  const row = await get(db, `SELECT id,granted,consent_version,created_at FROM consent_records WHERE user_id=? AND consent_key=? ORDER BY created_at DESC,id DESC LIMIT 1`, [userId, key]);
  if (!row || Number(row.granted) !== 1 || row.consent_version !== version) error("AA_OAUTH_CONSENT_REQUIRED");
  return row;
}

async function upsertGrantsTx(db, row, requestedScopes, t) {
  const requested = C.scopes(requestedScopes);
  for (const requestedScope of requested) {
    const consent = await exactConsent(db, row.user_id, row.connection_id, requestedScope, row.consent_version);
    const existing = await get(db, `SELECT grant_id FROM agent_connection_grants WHERE connection_id=? AND scope=?`, [row.connection_id, requestedScope]);
    if (existing) await run(db, `UPDATE agent_connection_grants SET status='ACTIVE',consent_record_id=?,consent_version=?,updated_at=?,revoked_at=NULL WHERE user_id=? AND connection_id=? AND scope=?`, [consent.id, consent.consent_version, t, row.user_id, row.connection_id, requestedScope]);
    else await run(db, `INSERT INTO agent_connection_grants (grant_id,user_id,connection_id,scope,status,consent_record_id,consent_version,created_at,updated_at) VALUES (?,?,?,?,'ACTIVE',?,?,?,?)`, [opaque("aag_"), row.user_id, row.connection_id, requestedScope, consent.id, consent.consent_version, t, t]);
  }
  return requested;
}

async function activateConnectionWithGrants(userId, connectionId, requestedScopes, at = nowIso()) {
  const uid = C.safeId(userId), cid = C.connectionId(connectionId), t = C.iso(at);
  await transaction(async (db) => {
    const row = await get(db, `SELECT * FROM agent_connections WHERE user_id=? AND connection_id=?`, [uid, cid]);
    if (!row) error("AA_OAUTH_CONNECTION_NOT_FOUND");
    if (row.status !== "PENDING_AUTH") error("AA_OAUTH_STATE_CONFLICT");
    await upsertGrantsTx(db, row, requestedScopes, t);
    await run(db, `UPDATE agent_connections SET status='ACTIVE',activated_at=?,updated_at=? WHERE user_id=? AND connection_id=? AND status='PENDING_AUTH'`, [t, t, uid, cid]);
  });
  return loadConnection(uid, cid);
}

async function addConnectionGrants(userId, connectionId, requestedScopes, at = nowIso()) {
  const uid = C.safeId(userId), cid = C.connectionId(connectionId), t = C.iso(at);
  await transaction(async (db) => {
    const row = await get(db, `SELECT * FROM agent_connections WHERE user_id=? AND connection_id=?`, [uid, cid]);
    if (!row) error("AA_OAUTH_CONNECTION_NOT_FOUND");
    if (!new Set(["ACTIVE", "SCOPE_REDUCED"]).has(row.status)) error("AA_OAUTH_STATE_CONFLICT");
    await upsertGrantsTx(db, row, requestedScopes, t);
    await run(db, `UPDATE agent_connections SET status='ACTIVE',security_epoch=security_epoch+1,updated_at=? WHERE user_id=? AND connection_id=?`, [t, uid, cid]);
    await revokeActiveCredentialsTx(db, uid, cid, t, "SCOPE_CHANGED");
  });
  return loadConnection(uid, cid);
}

async function reduceConnectionScopes(userId, connectionId, keepScopes, at = nowIso()) {
  const uid = C.safeId(userId), cid = C.connectionId(connectionId), keep = C.scopes(keepScopes, { allowEmpty: true }), t = C.iso(at);
  await transaction(async (db) => {
    const row = await get(db, `SELECT status FROM agent_connections WHERE user_id=? AND connection_id=?`, [uid, cid]);
    if (!row) error("AA_OAUTH_CONNECTION_NOT_FOUND");
    if (!new Set(["ACTIVE", "SCOPE_REDUCED"]).has(row.status)) error("AA_OAUTH_STATE_CONFLICT");
    const active = (await all(db, `SELECT scope FROM agent_connection_grants WHERE user_id=? AND connection_id=? AND status='ACTIVE'`, [uid, cid])).map((x) => x.scope);
    if (keep.some((s) => !active.includes(s))) error("AA_OAUTH_SCOPE_NOT_GRANTED");
    const revoke = active.filter((s) => !keep.includes(s));
    for (const s of revoke) await run(db, `UPDATE agent_connection_grants SET status='REVOKED',updated_at=?,revoked_at=? WHERE user_id=? AND connection_id=? AND scope=? AND status='ACTIVE'`, [t, t, uid, cid, s]);
    if (revoke.length) {
      await run(db, `UPDATE agent_connections SET status='SCOPE_REDUCED',security_epoch=security_epoch+1,updated_at=? WHERE user_id=? AND connection_id=?`, [t, uid, cid]);
      await revokeActiveCredentialsTx(db, uid, cid, t, "SCOPE_CHANGED");
    }
  });
  return loadConnection(uid, cid);
}

async function revokeActiveCredentialsTx(db, userId, connectionId, t, reason) {
  await run(db, `UPDATE agent_authorization_codes SET status='REVOKED',revoked_at=? WHERE user_id=? AND connection_id=? AND status='ACTIVE'`, [t, userId, connectionId]);
  await run(db, `UPDATE agent_token_families SET status='REVOKED',revoked_at=?,revoke_reason=? WHERE user_id=? AND connection_id=? AND status='ACTIVE'`, [t, reason, userId, connectionId]);
  await run(db, `UPDATE agent_refresh_tokens SET status='REVOKED',revoked_at=? WHERE user_id=? AND connection_id=? AND status='ACTIVE'`, [t, userId, connectionId]);
}

async function suspendConnection(userId, connectionId, reason = "OWNER_SUSPEND", at = nowIso()) {
  return changeConnectionTerminal(userId, connectionId, "SUSPENDED", reason, at);
}
async function revokeConnection(userId, connectionId, reason = "OWNER_REVOKE", at = nowIso()) {
  return changeConnectionTerminal(userId, connectionId, "REVOKED", reason, at);
}
async function changeConnectionTerminal(userId, connectionId, status, reason, at) {
  const uid = C.safeId(userId), cid = C.connectionId(connectionId), t = C.iso(at), why = C.safeId(reason, 64);
  await transaction(async (db) => {
    const row = await get(db, `SELECT status FROM agent_connections WHERE user_id=? AND connection_id=?`, [uid, cid]);
    if (!row) error("AA_OAUTH_CONNECTION_NOT_FOUND");
    if (new Set(["REVOKED", "DELETED"]).has(row.status)) error("AA_OAUTH_STATE_CONFLICT");
    await run(db, `UPDATE agent_connections SET status=?,security_epoch=security_epoch+1,updated_at=?,revoked_at=CASE WHEN ?='REVOKED' THEN ? ELSE revoked_at END WHERE user_id=? AND connection_id=?`, [status, t, status, t, uid, cid]);
    await revokeActiveCredentialsTx(db, uid, cid, t, why);
  });
  return loadConnection(uid, cid);
}

async function storeAuthorizationCodeHash(userId, input) {
  const db = requireDb(), uid = C.safeId(userId);
  const keys = ["authorization_code_id", "oauth_client_id", "connection_id", "code_hash", "redirect_uri", "resource_uri", "pkce_method", "pkce_challenge", "scopes", "issued_at", "expires_at"];
  const x = C.closed(input, keys), cid = C.connectionId(x.connection_id), clientId = C.safeId(x.oauth_client_id), issued = C.iso(x.issued_at), expires = C.iso(x.expires_at);
  if (x.pkce_method !== "S256") error("AA_OAUTH_BAD_PKCE");
  if (Date.parse(expires) <= Date.parse(issued) || Date.parse(expires) - Date.parse(issued) > 600000) error("AA_OAUTH_BAD_CODE_TTL");
  const client = parseClient(await get(db, `SELECT * FROM agent_oauth_clients WHERE oauth_client_id=? AND status='ACTIVE'`, [clientId]));
  if (!client || !client.redirect_uris.includes(C.redirectUri(x.redirect_uri))) error("AA_OAUTH_REDIRECT_MISMATCH");
  const conn = await get(db, `SELECT status FROM agent_connections WHERE user_id=? AND connection_id=? AND oauth_client_id=?`, [uid, cid, clientId]);
  if (!conn || !new Set(["ACTIVE", "SCOPE_REDUCED"]).has(conn.status)) error("AA_OAUTH_CONNECTION_INACTIVE");
  const requested = C.scopes(x.scopes), granted = (await all(db, `SELECT scope FROM agent_connection_grants WHERE user_id=? AND connection_id=? AND status='ACTIVE'`, [uid, cid])).map((r) => r.scope);
  if (requested.some((s) => !granted.includes(s))) error("AA_OAUTH_SCOPE_NOT_GRANTED");
  await run(db, `INSERT INTO agent_authorization_codes (authorization_code_id,user_id,oauth_client_id,connection_id,code_hash,redirect_uri,resource_uri,pkce_method,pkce_challenge,scopes_json,status,issued_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?)`, [C.safeId(x.authorization_code_id), uid, clientId, cid, C.digest(x.code_hash), x.redirect_uri, C.resourceUri(x.resource_uri), "S256", C.pkceChallenge(x.pkce_challenge), C.canonicalJson(requested, 512), issued, expires]);
  return { authorization_code_id: x.authorization_code_id, status: "ACTIVE", expires_at: expires };
}

async function consumeAuthorizationCodeHash(userId, input, at = nowIso()) {
  const uid = C.safeId(userId), t = C.iso(at);
  const x = C.closed(input, ["code_hash", "oauth_client_id", "connection_id", "redirect_uri", "resource_uri"]);
  let expired = false;
  const result = await transaction(async (db) => {
    const row = parseCode(await get(db, `SELECT * FROM agent_authorization_codes WHERE user_id=? AND code_hash=?`, [uid, C.digest(x.code_hash)]));
    if (!row) error("AA_OAUTH_CODE_INVALID");
    if (row.oauth_client_id !== C.safeId(x.oauth_client_id) || row.connection_id !== C.connectionId(x.connection_id) || row.redirect_uri !== C.redirectUri(x.redirect_uri) || row.resource_uri !== C.resourceUri(x.resource_uri)) error("AA_OAUTH_CODE_BINDING_INVALID");
    if (row.status !== "ACTIVE") error("AA_OAUTH_CODE_REPLAYED");
    if (Date.parse(row.expires_at) <= Date.parse(t)) { await run(db, `UPDATE agent_authorization_codes SET status='EXPIRED' WHERE authorization_code_id=? AND status='ACTIVE'`, [row.authorization_code_id]); expired = true; return null; }
    const updated = await run(db, `UPDATE agent_authorization_codes SET status='CONSUMED',consumed_at=? WHERE authorization_code_id=? AND user_id=? AND status='ACTIVE'`, [t, row.authorization_code_id, uid]);
    if (updated.changes !== 1) error("AA_OAUTH_CODE_REPLAYED");
    return { authorization_code_id: row.authorization_code_id, connection_id: row.connection_id, oauth_client_id: row.oauth_client_id, scopes: row.scopes, status: "CONSUMED" };
  });
  if (expired) error("AA_OAUTH_CODE_EXPIRED");
  return result;
}

async function createTokenFamily(userId, input) {
  const uid = C.safeId(userId), keys = ["token_family_id", "refresh_token_id", "oauth_client_id", "connection_id", "token_hash", "issued_at", "expires_at", "idle_expires_at", "absolute_expires_at"], x = C.closed(input, keys);
  const cid = C.connectionId(x.connection_id), clientId = C.safeId(x.oauth_client_id), issued = C.iso(x.issued_at), expires = C.iso(x.expires_at), idle = C.iso(x.idle_expires_at), absolute = C.iso(x.absolute_expires_at);
  if (Date.parse(expires) <= Date.parse(issued) || Date.parse(idle) <= Date.parse(issued) || Date.parse(absolute) <= Date.parse(issued) || Date.parse(expires) > Date.parse(absolute) || Date.parse(idle) > Date.parse(absolute) || Date.parse(absolute) - Date.parse(issued) > 90 * 86400000 || Date.parse(idle) - Date.parse(issued) > 30 * 86400000) error("AA_OAUTH_BAD_FAMILY_TTL");
  await transaction(async (db) => {
    const conn = await get(db, `SELECT status,security_epoch FROM agent_connections WHERE user_id=? AND connection_id=? AND oauth_client_id=?`, [uid, cid, clientId]);
    if (!conn || !new Set(["ACTIVE", "SCOPE_REDUCED"]).has(conn.status)) error("AA_OAUTH_CONNECTION_INACTIVE");
    await run(db, `INSERT INTO agent_token_families (token_family_id,user_id,oauth_client_id,connection_id,status,security_epoch,created_at,last_rotated_at,idle_expires_at,absolute_expires_at) VALUES (?,?,?,?,'ACTIVE',?,?,?,?,?)`, [C.safeId(x.token_family_id), uid, clientId, cid, conn.security_epoch, issued, issued, idle, absolute]);
    await run(db, `INSERT INTO agent_refresh_tokens (refresh_token_id,user_id,connection_id,token_family_id,token_hash,status,issued_at,expires_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)`, [C.safeId(x.refresh_token_id), uid, cid, x.token_family_id, C.digest(x.token_hash), issued, expires]);
  });
  return { token_family_id: x.token_family_id, status: "ACTIVE", security_epoch: (await loadConnection(uid, cid)).security_epoch };
}

async function rotateRefreshTokenHash(userId, input, at = nowIso()) {
  const uid = C.safeId(userId), t = C.iso(at), keys = ["connection_id", "presented_token_hash", "new_refresh_token_id", "new_token_hash", "new_expires_at", "new_idle_expires_at"], x = C.closed(input, keys), cid = C.connectionId(x.connection_id);
  const presented = C.digest(x.presented_token_hash), nextHash = C.digest(x.new_token_hash), nextExpires = C.iso(x.new_expires_at), nextIdle = C.iso(x.new_idle_expires_at);
  let reuse = false, result;
  await transaction(async (db) => {
    const token = await get(db, `SELECT r.*,f.status family_status,f.security_epoch family_epoch,f.absolute_expires_at,c.status connection_status,c.security_epoch connection_epoch FROM agent_refresh_tokens r JOIN agent_token_families f ON f.token_family_id=r.token_family_id AND f.user_id=r.user_id JOIN agent_connections c ON c.connection_id=r.connection_id AND c.user_id=r.user_id WHERE r.user_id=? AND r.connection_id=? AND r.token_hash=?`, [uid, cid, presented]);
    if (!token) error("AA_OAUTH_REFRESH_INVALID");
    if (token.status !== "ACTIVE") {
      reuse = true;
      await run(db, `UPDATE agent_refresh_tokens SET status=CASE WHEN refresh_token_id=? AND status='ROTATED' THEN 'REUSE_DETECTED' WHEN status='ACTIVE' THEN 'REVOKED' ELSE status END,revoked_at=CASE WHEN status IN ('ACTIVE','ROTATED') THEN COALESCE(revoked_at,?) ELSE revoked_at END WHERE user_id=? AND token_family_id=?`, [token.refresh_token_id, t, uid, token.token_family_id]);
      await run(db, `UPDATE agent_token_families SET status='REUSE_DETECTED',reuse_detected_at=?,revoked_at=?,revoke_reason='REFRESH_REUSE' WHERE user_id=? AND token_family_id=?`, [t, t, uid, token.token_family_id]);
      await run(db, `UPDATE agent_connections SET status='SUSPENDED',security_epoch=security_epoch+1,updated_at=? WHERE user_id=? AND connection_id=? AND status IN ('ACTIVE','SCOPE_REDUCED')`, [t, uid, cid]);
      result = { token_family_id: token.token_family_id, status: "REUSE_DETECTED" };
      return;
    }
    if (token.family_status !== "ACTIVE" || !new Set(["ACTIVE", "SCOPE_REDUCED"]).has(token.connection_status) || token.family_epoch !== token.connection_epoch) error("AA_OAUTH_REFRESH_REVOKED");
    if (Date.parse(token.expires_at) <= Date.parse(t) || Date.parse(token.absolute_expires_at) <= Date.parse(t) || Date.parse(nextExpires) <= Date.parse(t) || Date.parse(nextIdle) <= Date.parse(t) || Date.parse(nextExpires) > Date.parse(token.absolute_expires_at) || Date.parse(nextIdle) > Date.parse(token.absolute_expires_at)) error("AA_OAUTH_REFRESH_EXPIRED");
    const nextId = C.safeId(x.new_refresh_token_id);
    await run(db, `UPDATE agent_refresh_tokens SET status='ROTATED',used_at=? WHERE user_id=? AND refresh_token_id=? AND status='ACTIVE'`, [t, uid, token.refresh_token_id]);
    await run(db, `INSERT INTO agent_refresh_tokens (refresh_token_id,user_id,connection_id,token_family_id,token_hash,status,issued_at,expires_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)`, [nextId, uid, cid, token.token_family_id, nextHash, t, nextExpires]);
    await run(db, `UPDATE agent_refresh_tokens SET replaced_by_id=? WHERE user_id=? AND refresh_token_id=?`, [nextId, uid, token.refresh_token_id]);
    await run(db, `UPDATE agent_token_families SET last_rotated_at=?,idle_expires_at=? WHERE user_id=? AND token_family_id=? AND status='ACTIVE'`, [t, nextIdle, uid, token.token_family_id]);
    result = { token_family_id: token.token_family_id, refresh_token_id: nextId, status: "ACTIVE" };
  });
  if (reuse) error("AA_OAUTH_REFRESH_REUSE_DETECTED");
  return result;
}

async function denyAccessTokenHash(userId, input, at = nowIso()) {
  const db = requireDb(), uid = C.safeId(userId), t = C.iso(at), x = C.closed(input, ["denial_id", "connection_id", "token_family_id", "jti_hash", "reason_code", "expires_at"]);
  const cid = C.connectionId(x.connection_id); await loadConnection(uid, cid);
  await run(db, `INSERT INTO agent_access_token_denials (denial_id,user_id,connection_id,token_family_id,jti_hash,reason_code,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)`, [C.safeId(x.denial_id), uid, cid, x.token_family_id ? C.safeId(x.token_family_id) : null, C.digest(x.jti_hash), C.safeId(x.reason_code, 64), t, C.iso(x.expires_at)]);
  return { denial_id: x.denial_id, expires_at: x.expires_at };
}

async function validateConnectionSnapshot(userId, connectionId, expected = {}, at = nowIso()) {
  const db = requireDb(), uid = C.safeId(userId), cid = C.connectionId(connectionId), t = C.iso(at);
  const row = await get(db, `SELECT c.*,cl.status client_status,s.subject_id,s.security_epoch subject_epoch FROM agent_connections c JOIN agent_oauth_clients cl ON cl.oauth_client_id=c.oauth_client_id JOIN agent_subject_mappings s ON s.user_id=c.user_id WHERE c.user_id=? AND c.connection_id=?`, [uid, cid]);
  if (!row) error("AA_OAUTH_CONNECTION_NOT_FOUND");
  if (row.client_status !== "ACTIVE" || !new Set(["ACTIVE", "SCOPE_REDUCED"]).has(row.status)) error("AA_OAUTH_CONNECTION_INACTIVE");
  if (expected.oauth_client_id && row.oauth_client_id !== C.safeId(expected.oauth_client_id)) error("AA_OAUTH_CONNECTION_BINDING_INVALID");
  if (expected.security_epoch != null && row.security_epoch !== Number(expected.security_epoch)) error("AA_OAUTH_SECURITY_EPOCH_INVALID");
  if (expected.subject_epoch != null && row.subject_epoch !== Number(expected.subject_epoch)) error("AA_OAUTH_SUBJECT_EPOCH_INVALID");
  const grants = (await all(db, `SELECT scope FROM agent_connection_grants WHERE user_id=? AND connection_id=? AND status='ACTIVE' ORDER BY scope`, [uid, cid])).map((x) => x.scope);
  if (expected.scopes && C.scopes(expected.scopes).some((s) => !grants.includes(s))) error("AA_OAUTH_SCOPE_NOT_GRANTED");
  await run(db, `UPDATE agent_connections SET last_used_at=?,updated_at=? WHERE user_id=? AND connection_id=?`, [t, t, uid, cid]);
  return { user_id: uid, subject_id: row.subject_id, oauth_client_id: row.oauth_client_id, connection_id: cid, connection_status: row.status, security_epoch: row.security_epoch, subject_epoch: row.subject_epoch, scopes: grants, capability_version: row.capability_version };
}

async function exportAgentAccess(userId) {
  const db = requireDb(), uid = C.safeId(userId);
  const connections = await all(db, `SELECT connection_id,oauth_client_id,display_label,status,consent_version,capability_version,retention_notice_version,security_epoch,created_at,activated_at,updated_at,last_used_at,revoked_at,deleted_at FROM agent_connections WHERE user_id=? ORDER BY created_at,connection_id`, [uid]);
  const grants = await all(db, `SELECT connection_id,scope,status,consent_version,created_at,updated_at,revoked_at FROM agent_connection_grants WHERE user_id=? ORDER BY connection_id,scope`, [uid]);
  const codes = await all(db, `SELECT authorization_code_id,oauth_client_id,connection_id,status,issued_at,expires_at,consumed_at,revoked_at FROM agent_authorization_codes WHERE user_id=? ORDER BY issued_at`, [uid]);
  const families = await all(db, `SELECT token_family_id,oauth_client_id,connection_id,status,security_epoch,created_at,last_rotated_at,idle_expires_at,absolute_expires_at,revoked_at,reuse_detected_at,revoke_reason FROM agent_token_families WHERE user_id=? ORDER BY created_at`, [uid]);
  const erasures = await all(db, `SELECT connection_id,deleted_at,reason_code FROM agent_access_erasure_journal WHERE user_id=? ORDER BY deleted_at,connection_id`, [uid]);
  return { schema_version: C.OAUTH_LIFECYCLE_VERSION, exported_at: nowIso(), connections, grants, authorization_codes: codes, token_families: families, erasures };
}

async function deleteConnection(userId, connectionId, reason = "USER_DELETE", at = nowIso()) {
  const uid = C.safeId(userId), cid = C.connectionId(connectionId), why = C.safeId(reason, 64), t = C.iso(at);
  await transaction(async (db) => {
    const row = await get(db, `SELECT connection_id FROM agent_connections WHERE user_id=? AND connection_id=?`, [uid, cid]);
    if (!row) error("AA_OAUTH_CONNECTION_NOT_FOUND");
    await run(db, `INSERT INTO agent_access_erasure_journal (user_id,connection_id,deleted_at,reason_code) VALUES (?,?,?,?)`, [uid, cid, t, why]);
    await run(db, `DELETE FROM agent_connections WHERE user_id=? AND connection_id=?`, [uid, cid]);
  });
  return { deleted: true, connection_id: cid };
}

async function purgeExpiredSecurityArtifacts(at = nowIso()) {
  const t = C.iso(at);
  return transaction(async (db) => {
    await run(db, `UPDATE agent_authorization_codes SET status='EXPIRED' WHERE expires_at<=? AND status='ACTIVE'`, [t]);
    await run(db, `UPDATE agent_refresh_tokens SET status='EXPIRED' WHERE expires_at<=? AND status='ACTIVE'`, [t]);
    await run(db, `UPDATE agent_token_families SET status='EXPIRED',revoke_reason='TTL_EXPIRED' WHERE status='ACTIVE' AND (idle_expires_at<=? OR absolute_expires_at<=?)`, [t, t]);
    const codes = await run(db, `DELETE FROM agent_authorization_codes WHERE expires_at<=? AND status IN ('CONSUMED','REVOKED','EXPIRED')`, [t]);
    const refresh = await run(db, `DELETE FROM agent_refresh_tokens WHERE expires_at<=? AND status IN ('ROTATED','REVOKED','REUSE_DETECTED','EXPIRED')`, [t]);
    const denials = await run(db, `DELETE FROM agent_access_token_denials WHERE expires_at<=?`, [t]);
    const families = await run(db, `DELETE FROM agent_token_families WHERE absolute_expires_at<=? AND status IN ('REVOKED','REUSE_DETECTED','EXPIRED') AND NOT EXISTS (SELECT 1 FROM agent_refresh_tokens r WHERE r.token_family_id=agent_token_families.token_family_id)`, [t]);
    return { authorization_codes: codes.changes, refresh_tokens: refresh.changes, token_families: families.changes, access_denials: denials.changes };
  });
}

async function providerClientMetadata(clientId) {
  const client = await loadClientForAuthorization(clientId);
  if (client.status !== "ACTIVE") error("AA_OAUTH_CLIENT_INACTIVE");
  return {
    clientId: client.oauth_client_id,
    clientName: client.display_name,
    redirectUris: client.redirect_uris,
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    idTokenSignedResponseAlg: "ES256",
  };
}

async function subjectForUser(userId) {
  const db = requireDb(), uid = C.safeId(userId);
  return get(db, `SELECT subject_id,user_id,subject_version,security_epoch FROM agent_subject_mappings WHERE user_id=?`, [uid]);
}

async function userForSubject(subjectId) {
  const db = requireDb(), sid = C.safeId(subjectId);
  return get(db, `SELECT subject_id,user_id,subject_version,security_epoch FROM agent_subject_mappings WHERE subject_id=?`, [sid]);
}

async function ensureSubjectForUser(userId, at = nowIso()) {
  const existing = await subjectForUser(userId);
  if (existing) return existing;
  const subjectId = `aas_${crypto.randomBytes(12).toString("hex")}`;
  try { await createSubjectMapping(userId, subjectId, "aa-subject-v1", at); }
  catch (e) { if (!String(e && e.message).includes("UNIQUE")) throw e; }
  const created = await subjectForUser(userId);
  if (!created) error("AA_OAUTH_SUBJECT_NOT_FOUND");
  return created;
}

async function providerPrincipal(subjectId, clientId, connectionId, requestedScopes) {
  const subject = await userForSubject(subjectId);
  if (!subject) error("AA_OAUTH_SUBJECT_NOT_FOUND");
  const snapshot = await validateConnectionSnapshot(subject.user_id, connectionId, { oauth_client_id: clientId, scopes: requestedScopes });
  if (snapshot.subject_id !== subject.subject_id) error("AA_OAUTH_SUBJECT_BINDING_INVALID");
  return snapshot;
}

async function providerGrant(grantId) {
  const db = requireDb(), cid = C.connectionId(grantId);
  const row = await get(db, `SELECT c.connection_id,c.user_id,c.oauth_client_id,c.status,c.created_at,c.updated_at,s.subject_id
    FROM agent_connections c JOIN agent_subject_mappings s ON s.user_id=c.user_id
    WHERE c.connection_id=?`, [cid]);
  if (!row || !new Set(["ACTIVE", "SCOPE_REDUCED"]).has(row.status)) return null;
  const scopes = (await all(db, `SELECT scope FROM agent_connection_grants WHERE connection_id=? AND status='ACTIVE' ORDER BY scope`, [cid])).map((x) => x.scope);
  if (!scopes.length) return null;
  return {
    accountId: row.subject_id,
    clientId: row.oauth_client_id,
    resources: { [C.RESOURCE_URI]: scopes.join(" ") },
    iat: isoEpoch(row.created_at),
    exp: isoEpoch(row.updated_at) + 90 * 86400,
    jti: cid,
    kind: "Grant",
  };
}

async function validateProviderGrant(grantId, payload) {
  const grant = await providerGrant(grantId);
  if (!grant || grant.accountId !== payload.accountId || grant.clientId !== payload.clientId) error("AA_OAUTH_PROVIDER_GRANT_BINDING");
  const requested = String(payload.resources && payload.resources[C.RESOURCE_URI] || "").split(" ").filter(Boolean).sort();
  const active = String(grant.resources[C.RESOURCE_URI]).split(" ").filter(Boolean).sort();
  if (JSON.stringify(requested) !== JSON.stringify(active)) error("AA_OAUTH_PROVIDER_GRANT_SCOPE");
  return grant;
}

async function revokeProviderGrant(grantId, reason = "PROVIDER_GRANT_REVOKE", at = nowIso()) {
  const db = requireDb(), cid = C.connectionId(grantId);
  const row = await get(db, `SELECT user_id,status FROM agent_connections WHERE connection_id=?`, [cid]);
  if (!row) return;
  if (new Set(["ACTIVE", "SCOPE_REDUCED", "PENDING_AUTH"]).has(row.status)) await suspendConnection(row.user_id, cid, reason, at);
}

async function storeProviderAuthorizationCode(code, payload) {
  const db = requireDb();
  const subject = await get(db, `SELECT user_id FROM agent_subject_mappings WHERE subject_id=?`, [C.safeId(payload.accountId)]);
  if (!subject) error("AA_OAUTH_SUBJECT_NOT_FOUND");
  const scopes = String(payload.scope || "").split(" ").filter(Boolean);
  return storeAuthorizationCodeHash(subject.user_id, {
    authorization_code_id: opaque("aac_"), oauth_client_id: payload.clientId,
    connection_id: payload.grantId, code_hash: hashOpaque(code), redirect_uri: payload.redirectUri,
    resource_uri: payload.resource, pkce_method: payload.codeChallengeMethod,
    pkce_challenge: payload.codeChallenge, scopes,
    issued_at: epochIso(payload.iat), expires_at: epochIso(payload.exp),
  });
}

async function findProviderAuthorizationCode(code) {
  const db = requireDb();
  const row = parseCode(await get(db, `SELECT a.*,s.subject_id FROM agent_authorization_codes a
    JOIN agent_subject_mappings s ON s.user_id=a.user_id WHERE a.code_hash=?`, [hashOpaque(code)]));
  if (!row || row.status === "REVOKED") return null;
  return {
    accountId: row.subject_id, authTime: isoEpoch(row.issued_at), clientId: row.oauth_client_id,
    codeChallenge: row.pkce_challenge, codeChallengeMethod: row.pkce_method,
    exp: isoEpoch(row.expires_at), grantId: row.connection_id, iat: isoEpoch(row.issued_at),
    jti: code, kind: "AuthorizationCode", redirectUri: row.redirect_uri,
    resource: row.resource_uri, scope: row.scopes.join(" "),
    ...(row.consumed_at ? { consumed: isoEpoch(row.consumed_at) } : {}),
  };
}

async function consumeProviderAuthorizationCode(code, at = nowIso()) {
  const t = C.iso(at), hash = hashOpaque(code);
  return transaction(async (db) => {
    const row = await get(db, `SELECT status FROM agent_authorization_codes WHERE code_hash=?`, [hash]);
    if (!row) error("AA_OAUTH_CODE_INVALID");
    if (row.status !== "ACTIVE") return;
    await run(db, `UPDATE agent_authorization_codes SET status='CONSUMED',consumed_at=? WHERE code_hash=? AND status='ACTIVE'`, [t, hash]);
  });
}

async function destroyProviderAuthorizationCode(code, at = nowIso()) {
  const db = requireDb(), t = C.iso(at);
  await run(db, `UPDATE agent_authorization_codes SET status='REVOKED',revoked_at=? WHERE code_hash=? AND status='ACTIVE'`, [t, hashOpaque(code)]);
}

async function storeInitialProviderRefreshToken(token, payload) {
  const db = requireDb();
  const subject = await get(db, `SELECT user_id FROM agent_subject_mappings WHERE subject_id=?`, [C.safeId(payload.accountId)]);
  if (!subject) error("AA_OAUTH_SUBJECT_NOT_FOUND");
  const issued = epochIso(payload.iat), expires = epochIso(payload.exp);
  const absolute = epochIso((payload.iiat || payload.iat) + 90 * 86400);
  return createTokenFamily(subject.user_id, {
    token_family_id: opaque("aatf_"), refresh_token_id: opaque("aart_"), oauth_client_id: payload.clientId,
    connection_id: payload.grantId, token_hash: hashOpaque(token), issued_at: issued,
    expires_at: expires, idle_expires_at: expires, absolute_expires_at: absolute,
  });
}

async function prepareProviderRefreshRotation(token, at = nowIso()) {
  const t = C.iso(at), hash = hashOpaque(token);
  return transaction(async (db) => {
    const row = await get(db, `SELECT r.*,f.oauth_client_id,f.absolute_expires_at,f.status family_status,s.subject_id
      FROM agent_refresh_tokens r JOIN agent_token_families f ON f.token_family_id=r.token_family_id
      JOIN agent_subject_mappings s ON s.user_id=r.user_id WHERE r.token_hash=?`, [hash]);
    if (!row) error("AA_OAUTH_REFRESH_INVALID");
    if (row.status !== "ACTIVE" || row.family_status !== "ACTIVE") error("AA_OAUTH_REFRESH_REVOKED");
    const changed = await run(db, `UPDATE agent_refresh_tokens SET status='ROTATED',used_at=? WHERE refresh_token_id=? AND status='ACTIVE'`, [t, row.refresh_token_id]);
    if (changed.changes !== 1) error("AA_OAUTH_REFRESH_REVOKED");
    return row;
  });
}

async function completeProviderRefreshRotation(previous, token, payload, at = nowIso()) {
  const t = C.iso(at), expires = epochIso(payload.exp);
  return transaction(async (db) => {
    if (payload.grantId !== previous.connection_id || payload.clientId !== previous.oauth_client_id || payload.accountId !== previous.subject_id) error("AA_OAUTH_REFRESH_BINDING_INVALID");
    if (Date.parse(expires) > Date.parse(previous.absolute_expires_at)) error("AA_OAUTH_REFRESH_EXPIRED");
    const nextId = opaque("aart_");
    await run(db, `INSERT INTO agent_refresh_tokens (refresh_token_id,user_id,connection_id,token_family_id,token_hash,status,issued_at,expires_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)`, [nextId, previous.user_id, previous.connection_id, previous.token_family_id, hashOpaque(token), t, expires]);
    await run(db, `UPDATE agent_refresh_tokens SET replaced_by_id=? WHERE refresh_token_id=?`, [nextId, previous.refresh_token_id]);
    await run(db, `UPDATE agent_token_families SET last_rotated_at=?,idle_expires_at=? WHERE token_family_id=? AND status='ACTIVE'`, [t, expires, previous.token_family_id]);
    return { refresh_token_id: nextId, token_family_id: previous.token_family_id };
  });
}

async function findProviderRefreshToken(token) {
  const db = requireDb();
  const row = await get(db, `SELECT r.*,f.oauth_client_id,f.status family_status,f.created_at family_created,f.absolute_expires_at,s.subject_id,
      (SELECT COUNT(*) FROM agent_refresh_tokens q WHERE q.token_family_id=r.token_family_id AND q.issued_at<=r.issued_at) rotations
    FROM agent_refresh_tokens r JOIN agent_token_families f ON f.token_family_id=r.token_family_id
    JOIN agent_subject_mappings s ON s.user_id=r.user_id WHERE r.token_hash=?`, [hashOpaque(token)]);
  if (!row || !new Set(["ACTIVE", "ROTATED"]).has(row.status) || row.family_status !== "ACTIVE") return null;
  const scopes = (await all(db, `SELECT scope FROM agent_connection_grants WHERE connection_id=? AND status='ACTIVE' ORDER BY scope`, [row.connection_id])).map((x) => x.scope);
  return {
    accountId: row.subject_id, authTime: isoEpoch(row.family_created), clientId: row.oauth_client_id,
    exp: isoEpoch(row.expires_at), grantId: row.connection_id,
    gty: Number(row.rotations) > 1 ? "authorization_code refresh_token" : "authorization_code",
    iat: isoEpoch(row.issued_at), iiat: isoEpoch(row.family_created), jti: token, kind: "RefreshToken",
    resource: C.RESOURCE_URI, rotations: Math.max(0, Number(row.rotations) - 1), scope: scopes.join(" "),
    ...(row.used_at ? { consumed: isoEpoch(row.used_at) } : {}),
  };
}

async function revokeProviderRefreshByGrant(grantId, reason = "PROVIDER_GRANT_REVOKE", at = nowIso()) {
  const db = requireDb(), cid = C.connectionId(grantId), t = C.iso(at), why = C.safeId(reason, 64);
  await transaction(async (tx) => {
    await run(tx, `UPDATE agent_token_families SET status='REVOKED',revoked_at=?,revoke_reason=? WHERE connection_id=? AND status='ACTIVE'`, [t, why, cid]);
    await run(tx, `UPDATE agent_refresh_tokens SET status='REVOKED',revoked_at=? WHERE connection_id=? AND status='ACTIVE'`, [t, cid]);
  });
}

async function revokeProviderRefreshToken(token, at = nowIso()) {
  const db = requireDb(), row = await get(db, `SELECT connection_id FROM agent_refresh_tokens WHERE token_hash=?`, [hashOpaque(token)]);
  if (row) await revokeProviderRefreshByGrant(row.connection_id, "REFRESH_REUSE", at);
}

async function providerCredentialContext(input) {
  const db = requireDb();
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (typeof input.code === "string" && input.code) {
    return get(db, `SELECT user_id,oauth_client_id,connection_id FROM agent_authorization_codes WHERE code_hash=?`, [hashOpaque(input.code)]);
  }
  const refresh = typeof input.refresh_token === "string" ? input.refresh_token : typeof input.token === "string" ? input.token : null;
  if (refresh) return get(db, `SELECT r.user_id,f.oauth_client_id,r.connection_id FROM agent_refresh_tokens r JOIN agent_token_families f ON f.token_family_id=r.token_family_id WHERE r.token_hash=?`, [hashOpaque(refresh)]);
  return null;
}

module.exports = {
  registerClientFixture, loadClientForAuthorization, setClientStatus, createSubjectMapping, bumpSubjectSecurityEpoch, createPendingConnection, loadConnection, listConnectionsForUser,
  activateConnectionWithGrants, addConnectionGrants, reduceConnectionScopes, suspendConnection,
  revokeConnection, storeAuthorizationCodeHash, consumeAuthorizationCodeHash, createTokenFamily,
  rotateRefreshTokenHash, denyAccessTokenHash, validateConnectionSnapshot, exportAgentAccess,
  deleteConnection, purgeExpiredSecurityArtifacts,
  providerClientMetadata, providerGrant, validateProviderGrant, revokeProviderGrant,
  subjectForUser, userForSubject, ensureSubjectForUser, providerPrincipal,
  storeProviderAuthorizationCode, findProviderAuthorizationCode, consumeProviderAuthorizationCode,
  destroyProviderAuthorizationCode, storeInitialProviderRefreshToken,
  prepareProviderRefreshRotation, completeProviderRefreshRotation, findProviderRefreshToken,
  revokeProviderRefreshByGrant, revokeProviderRefreshToken,
  providerCredentialContext,
};
