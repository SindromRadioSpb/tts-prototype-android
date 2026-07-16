import { createLocalJWKSet, exportJWK, importJWK, jwtVerify } from 'jose';

function fail(code) { const error = new Error(code); error.code = code; throw error; }

export async function loadSigningJwksFromJson(text) {
  if (typeof text !== 'string' || text.length < 64 || text.length > 16384) fail('AA_OAUTH_KEYSET_INVALID');
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { fail('AA_OAUTH_KEYSET_INVALID'); }
  return validateInjectedSigningJwks(parsed);
}

export async function validateInjectedSigningJwks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.keys)) fail('AA_OAUTH_KEYSET_INVALID');
  if (value.keys.length < 1 || value.keys.length > 2) fail('AA_OAUTH_KEYSET_INVALID');
  const seen = new Set();
  const privateKeys = [];
  const publicKeys = [];
  for (const key of value.keys) {
    if (!key || typeof key !== 'object' || Array.isArray(key)) fail('AA_OAUTH_KEY_INVALID');
    const allowed = new Set(['kty', 'crv', 'x', 'y', 'd', 'use', 'alg', 'kid']);
    if (Object.keys(key).some((name) => !allowed.has(name))) fail('AA_OAUTH_KEY_FIELD_INVALID');
    if (key.kty !== 'EC' || key.crv !== 'P-256' || key.alg !== 'ES256' || key.use !== 'sig') fail('AA_OAUTH_KEY_POLICY_INVALID');
    if (typeof key.kid !== 'string' || !/^[A-Za-z0-9_.-]{8,64}$/.test(key.kid) || seen.has(key.kid)) fail('AA_OAUTH_KEY_ID_INVALID');
    if (typeof key.d !== 'string' || !key.d) fail('AA_OAUTH_PRIVATE_KEY_REQUIRED');
    seen.add(key.kid);
    await importJWK(key, 'ES256');
    const publicJwk = await exportJWK(await importJWK({ ...key, d: undefined }, 'ES256'));
    Object.assign(publicJwk, { kid: key.kid, alg: 'ES256', use: 'sig' });
    if ('d' in publicJwk) fail('AA_OAUTH_PUBLIC_KEY_LEAK');
    privateKeys.push(Object.freeze({ ...key }));
    publicKeys.push(Object.freeze(publicJwk));
  }
  return Object.freeze({
    private_jwks: Object.freeze({ keys: Object.freeze(privateKeys) }),
    public_jwks: Object.freeze({ keys: Object.freeze(publicKeys) }),
    active_kid: privateKeys[0].kid,
  });
}

export async function verifyAccessToken(token, keyset, expected) {
  if (typeof token !== 'string' || token.length < 64 || token.length > 8192) fail('AA_OAUTH_TOKEN_INVALID');
  if (!expected || typeof expected !== 'object') fail('AA_OAUTH_EXPECTATION_INVALID');
  const verified = await jwtVerify(token, createLocalJWKSet(keyset.public_jwks), {
    issuer: expected.issuer,
    audience: expected.audience,
    algorithms: ['ES256'],
    clockTolerance: 60,
  });
  const header = verified.protectedHeader;
  if (header.alg !== 'ES256' || typeof header.kid !== 'string' || !keyset.public_jwks.keys.some((key) => key.kid === header.kid)) fail('AA_OAUTH_TOKEN_KEY_INVALID');
  const payload = verified.payload;
  for (const name of ['sub', 'client_id', 'connection_id', 'jti', 'scope']) if (typeof payload[name] !== 'string' || !payload[name]) fail('AA_OAUTH_TOKEN_CLAIMS_INVALID');
  if (expected.subject && payload.sub !== expected.subject) fail('AA_OAUTH_SUBJECT_BINDING_INVALID');
  if (expected.client_id && payload.client_id !== expected.client_id) fail('AA_OAUTH_CLIENT_BINDING_INVALID');
  if (expected.connection_id && payload.connection_id !== expected.connection_id) fail('AA_OAUTH_CONNECTION_BINDING_INVALID');
  const scopes = payload.scope.split(' ').filter(Boolean).sort();
  if (expected.scopes && (scopes.length !== expected.scopes.length || scopes.some((scope, index) => scope !== [...expected.scopes].sort()[index]))) fail('AA_OAUTH_SCOPE_BINDING_INVALID');
  return verified;
}
