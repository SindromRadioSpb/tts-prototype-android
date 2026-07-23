import { createHash, randomBytes } from 'node:crypto';

import { verifyAccessToken } from './oauthSigningKeys.mjs';
// S1 (критика R14): версия capability — ОДНА константа, не литерал-пин: наивный бамп
// CAPABILITY_VERSION при добавлении инструментов молча клал либо все новые подключения
// (строка ≠ 'aa-v0.1'), либо старое Hermes (обновлённый литерал ≠ строка). Политика:
// version НЕ бампится при additive-инструментах (AA3/AA4/S1 — прецеденты).
import capabilitiesRegistry from './capabilities.js';
const { CAPABILITY_VERSION } = capabilitiesRegistry;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function exactBearer(value) {
  if (typeof value !== 'string' || value.length < 72 || value.length > 8200 || value.includes(',')) fail('AA_MCP_BEARER_INVALID');
  const match = value.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
  if (!match) fail('AA_MCP_BEARER_INVALID');
  return match[1];
}
function scopes(value) {
  if (typeof value !== 'string') fail('AA_MCP_TOKEN_CLAIMS_INVALID');
  const out = value.split(' ').filter(Boolean);
  if (!out.length || out.length > 17 || new Set(out).size !== out.length) fail('AA_MCP_TOKEN_CLAIMS_INVALID');
  return Object.freeze(out.sort());
}
function epoch(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('AA_MCP_TOKEN_CLAIMS_INVALID');
  return value;
}
function digestId(prefix, value) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export function createMcpResourceValidator({ keyset, repo, issuer, resource, allowedClientIds, allowedOwnerIds, now = () => Date.now() } = {}) {
  if (!keyset?.public_jwks?.keys?.length || !repo || typeof repo.userForSubject !== 'function'
    || typeof repo.validateConnectionSnapshot !== 'function' || typeof repo.isAccessTokenDenied !== 'function') fail('AA_MCP_VALIDATOR_CONFIG_INVALID');
  if (typeof issuer !== 'string' || !issuer || typeof resource !== 'string' || !resource) fail('AA_MCP_VALIDATOR_CONFIG_INVALID');
  const allowed = new Set(Array.isArray(allowedClientIds) ? allowedClientIds.map(String) : []);
  if (!allowed.size || allowed.has('*')) fail('AA_MCP_CLIENT_ALLOWLIST_INVALID');
  const owners = new Set(Array.isArray(allowedOwnerIds) ? allowedOwnerIds.map(String) : []);
  if (!owners.size || owners.has('*')) fail('AA_MCP_OWNER_ALLOWLIST_INVALID');

  async function validate(authorization, requestId = `mcp_${randomBytes(12).toString('hex')}`) {
    const token = exactBearer(authorization);
    const { payload, protectedHeader } = await verifyAccessToken(token, keyset, { issuer, audience: resource });
    const tokenScopes = scopes(payload.scope);
    const securityEpoch = epoch(payload.security_epoch);
    const subjectEpoch = epoch(payload.subject_epoch);
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat < 0 || payload.exp <= payload.iat) fail('AA_MCP_TOKEN_CLAIMS_INVALID');
    if (!allowed.has(payload.client_id)) fail('AA_MCP_CLIENT_NOT_ALLOWED');

    const subject = await repo.userForSubject(payload.sub);
    if (!subject || subject.subject_id !== payload.sub) fail('AA_MCP_SUBJECT_INVALID');
    if (!owners.has(subject.user_id)) fail('AA_MCP_OWNER_NOT_ALLOWED');
    if (await repo.isAccessTokenDenied(subject.user_id, payload.connection_id, payload.jti, new Date(now()).toISOString())) fail('AA_MCP_TOKEN_REVOKED');
    const snapshot = await repo.validateConnectionSnapshot(subject.user_id, payload.connection_id, {
      oauth_client_id: payload.client_id,
      security_epoch: securityEpoch,
      subject_epoch: subjectEpoch,
      scopes: tokenScopes,
    }, new Date(now()).toISOString());
    if (snapshot.subject_id !== payload.sub || snapshot.user_id !== subject.user_id || snapshot.oauth_client_id !== payload.client_id) fail('AA_MCP_PRINCIPAL_BINDING_INVALID');
    if (snapshot.capability_version !== CAPABILITY_VERSION) fail('AA_MCP_CAPABILITY_VERSION_INVALID');

    const principal = Object.freeze({
      user_id: snapshot.user_id,
      oauth_client_id: snapshot.oauth_client_id,
      connection_id: snapshot.connection_id,
      external_actor_id: digestId('actor', `${payload.sub}\0${payload.client_id}`),
      request_id: requestId,
      scopes: tokenScopes,
      connection_status: snapshot.connection_status,
      access_expires_at: new Date(Number(payload.exp) * 1000).toISOString(),
    });
    return Object.freeze({
      principal,
      audit: Object.freeze({
        oauth_client_id: snapshot.oauth_client_id,
        connection_id: snapshot.connection_id,
        scopes: tokenScopes,
        jti: payload.jti,
        security_epoch: securityEpoch,
        kid: protectedHeader.kid,
      }),
    });
  }

  return Object.freeze({ validate });
}
