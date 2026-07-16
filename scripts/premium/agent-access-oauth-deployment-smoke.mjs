import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

import { exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';

import deploymentContracts from '../../agent/access/oauthDeploymentContracts.js';
import boundary from '../../agent/access/oauthHttpBoundary.js';
import rateLimits from '../../agent/access/oauthRateLimiter.js';
import bridgeModule from '../../agent/access/oauthInteractionBridge.js';
import gateModule from '../../agent/access/oauthDefaultOffGate.js';
import auditModule from '../../agent/access/oauthAudit.js';
import { createFixtureAdapter } from '../../agent/access/oidcFixtureAdapter.mjs';
import { createOidcDeployment } from '../../agent/access/oidcDeployment.mjs';
import { validateInjectedSigningJwks, verifyAccessToken } from '../../agent/access/oauthSigningKeys.mjs';

const { FIXTURE_CLIENTS, RESOURCE, SCOPES } = deploymentContracts;
const SUBJECTS = new Map([
  [FIXTURE_CLIENTS[0].client_id, { subject: 'aa2b3_subject_hermes', connection_id: 'aa2b3_hermes_conn' }],
  [FIXTURE_CLIENTS[1].client_id, { subject: 'aa2b3_subject_inspector', connection_id: 'aa2b3_inspector_conn' }],
]);

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))); }
function challenge(verifier) { return createHash('sha256').update(verifier).digest('base64url'); }

class Cookies {
  #values = new Map();
  absorb(response) { for (const header of response.headers.getSetCookie()) { const [pair] = header.split(';', 1); const at = pair.indexOf('='); this.#values.set(pair.slice(0, at), pair.slice(at + 1)); } }
  header() { return [...this.#values].map(([key, value]) => `${key}=${value}`).join('; '); }
}

async function request(url, cookies, init = {}) {
  const headers = new Headers(init.headers);
  if (cookies?.header()) headers.set('cookie', cookies.header());
  const response = await fetch(url, { ...init, headers, redirect: 'manual' });
  cookies?.absorb(response);
  return response;
}

async function authorize(metadata, client, requestedScopes) {
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(16).toString('hex');
  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: client.client_id,
    code_challenge: challenge(verifier),
    code_challenge_method: 'S256',
    redirect_uri: client.redirect_uris[0],
    resource: RESOURCE,
    response_type: 'code',
    scope: requestedScopes.join(' '),
    state,
  });
  const cookies = new Cookies();
  let response = await request(url, cookies);
  for (let step = 0; step < 6; step += 1) {
    if (![302, 303].includes(response.status)) {
      throw new Error(`authorization returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    const location = new URL(response.headers.get('location'), metadata.issuer);
    if (location.href.startsWith(client.redirect_uris[0])) {
      assert.equal(location.searchParams.get('state'), state);
      return { code: location.searchParams.get('code'), verifier };
    }
    response = await request(location, cookies);
  }
  throw new Error('interaction did not finish');
}

async function tokenRequest(metadata, form) {
  return fetch(metadata.token_endpoint, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
}

const metadata = deploymentContracts.authorizationServerMetadata();
assert.equal(metadata.issuer, deploymentContracts.ISSUER);
assert.equal(deploymentContracts.protectedResourceMetadata().resource, RESOURCE);
assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
assert.equal(metadata.grant_types_supported.includes('client_credentials'), false);
assert.throws(() => deploymentContracts.validateFixtureClient({ ...FIXTURE_CLIENTS[0], redirect_uris: ['http://127.0.0.1:9999/callback'] }), /AA_OAUTH_CLIENT_PROFILE_MISMATCH/);

const productionBoundary = boundary.validateOAuthHttpRequest({ enabled: '1', agent_access_enabled: '1', host: 'linguistpro.kolosei.com', socket_protocol: 'https', route_class: 'discovery', method: 'GET' });
assert.equal(productionBoundary.ok, true);
for (const input of [
  { enabled: '0', agent_access_enabled: '1', host: 'linguistpro.kolosei.com', socket_protocol: 'https', route_class: 'discovery' },
  { enabled: '1', agent_access_enabled: '1', host: 'evil.linguistpro.kolosei.com', socket_protocol: 'https', route_class: 'discovery' },
  { enabled: '1', agent_access_enabled: '1', host: 'linguistpro.kolosei.com', socket_protocol: 'http', forwarded_host: 'linguistpro.kolosei.com,evil.example', forwarded_proto: 'https', trust_proxy: true, route_class: 'token', method: 'POST', content_type: 'application/x-www-form-urlencoded' },
  { enabled: '1', agent_access_enabled: '1', host: 'linguistpro.kolosei.com', socket_protocol: 'https', route_class: 'token', method: 'POST', content_type: 'application/x-www-form-urlencoded', cookie: 'lp_session=forbidden' },
]) assert.equal(boundary.validateOAuthHttpRequest(input).ok, false);

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
const oldOauthFlag = process.env.AGENT_ACCESS_OAUTH_ENABLED;
const oldUiFlag = process.env.AGENT_ACCESS_UI_ENABLED;
try {
  const gate = gateModule.createOAuthDefaultOffGate();
  const requestShape = { method: 'GET', originalUrl: '/oauth/.well-known/openid-configuration', headers: { host: 'linguistpro.kolosei.com' }, socket: { encrypted: true } };
  delete process.env.AGENT_ACCESS_OAUTH_ENABLED;
  delete process.env.AGENT_ACCESS_UI_ENABLED;
  let response = mockResponse();
  await gate(requestShape, response);
  assert.equal(response.statusCode, 404);
  process.env.AGENT_ACCESS_OAUTH_ENABLED = 'true';
  process.env.AGENT_ACCESS_UI_ENABLED = '1';
  response = mockResponse();
  await gate(requestShape, response);
  assert.equal(response.statusCode, 404);
  process.env.AGENT_ACCESS_OAUTH_ENABLED = '1';
  response = mockResponse();
  await gate(requestShape, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, 'AA_OAUTH_RUNTIME_NOT_CONFIGURED');
} finally {
  if (oldOauthFlag === undefined) delete process.env.AGENT_ACCESS_OAUTH_ENABLED; else process.env.AGENT_ACCESS_OAUTH_ENABLED = oldOauthFlag;
  if (oldUiFlag === undefined) delete process.env.AGENT_ACCESS_UI_ENABLED; else process.env.AGENT_ACCESS_UI_ENABLED = oldUiFlag;
}

const auditRows = [];
const audit = auditModule.createContentSafeOAuthAudit({ key: 'fixture-audit-key-32-bytes-minimum-value', emit: (row) => auditRows.push(row) });
const auditRow = audit.record({ event_type: 'token_denied', route_class: 'token', result_code: 'invalid_grant', oauth_client_id: FIXTURE_CLIENTS[0].client_id, scopes: [SCOPES[0]], connection_id: 'private-connection', request_id: 'private-request', jti: 'private-jti', security_epoch: 2, rate_dimension: 'connection', kid: 'aa2b3-active-fixture', deployment_revision: 'fixture' });
assert.equal(auditRow.connection_digest.includes('private-connection'), false);
assert.equal(JSON.stringify(auditRow).includes('private-request'), false);
assert.equal(JSON.stringify(auditRow).includes('private-jti'), false);
assert.equal(auditRow.cp0_eligible, false);
assert.throws(() => audit.record({ event_type: 'bad', route_class: 'token', result_code: 'bad', token: 'must-not-enter-audit' }), /AA_OAUTH_UNKNOWN_FIELD/);

let time = 1_000_000;
const limiter = rateLimits.createOAuthRateLimiter({ now: () => time, maxBuckets: 10 });
for (let index = 0; index < 20; index += 1) assert.equal(limiter.take('token', { connection: 'conn-a' }).ok, true);
assert.deepEqual(limiter.take('token', { connection: 'conn-a' }).error, 'AA_OAUTH_RATE_LIMITED');
time += 60001; limiter.prune(); assert.equal(limiter.size(), 0);

const staged = [];
const interactionBridge = bridgeModule.createOAuthInteractionBridge({ consentCeremony: { async stageTrustedRequest(userId, request) { staged.push({ userId, request }); } }, now: () => time });
const consentRequest = { request_id: 'aar_fixture_1', oauth_client_id: FIXTURE_CLIENTS[0].client_id, connection_id: 'fixture_bridge_conn', requested_scopes: [SCOPES[0]], expires_at: new Date(time + 600000).toISOString() };
assert.equal((await interactionBridge.stage('fixture_user', { request_id: consentRequest.request_id, interaction_uid: 'interaction_1', pair_key: 'pair_fixture_1', consent_request: consentRequest })).consent_path, '/agent-access.html?request_id=aar_fixture_1');
assert.equal(interactionBridge.complete('fixture_user', 'aar_fixture_1', 'approved').interaction_uid, 'interaction_1');
assert.throws(() => interactionBridge.complete('fixture_user', 'aar_fixture_1', 'approved'), /AA_OAUTH_BRIDGE_NOT_FOUND|AA_OAUTH_BRIDGE_REPLAY/);
assert.equal(staged.length, 1);

async function fixtureJwk(kid) {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  return { ...jwk, kid, alg: 'ES256', use: 'sig' };
}
const oldKey = await fixtureJwk('aa2b3-old-fixture');
const activeKey = await fixtureJwk('aa2b3-active-fixture');
const keyset = await validateInjectedSigningJwks({ keys: [activeKey, oldKey] });
assert.deepEqual(keyset.public_jwks.keys.map((key) => key.kid), ['aa2b3-active-fixture', 'aa2b3-old-fixture']);
assert.equal(keyset.public_jwks.keys.some((key) => key.d), false);
const overlapToken = await new SignJWT({ client_id: FIXTURE_CLIENTS[0].client_id, connection_id: 'rotation_overlap_conn', scope: SCOPES[0] })
  .setProtectedHeader({ alg: 'ES256', kid: oldKey.kid })
  .setIssuer('https://rotation.fixture.invalid/oauth')
  .setAudience(RESOURCE)
  .setSubject('rotation_overlap_subject')
  .setJti('rotation_overlap_jti')
  .setIssuedAt()
  .setExpirationTime('10m')
  .sign(await importJWK(oldKey, 'ES256'));
assert.equal((await verifyAccessToken(overlapToken, keyset, { issuer: 'https://rotation.fixture.invalid/oauth', audience: RESOURCE, subject: 'rotation_overlap_subject', client_id: FIXTURE_CLIENTS[0].client_id, connection_id: 'rotation_overlap_conn', scopes: [SCOPES[0]] })).protectedHeader.kid, oldKey.kid);
await assert.rejects(validateInjectedSigningJwks({ keys: [{ ...activeKey, alg: 'RS256' }] }), /AA_OAUTH_KEY_POLICY_INVALID/);

let dispatch = (req, res) => res.writeHead(503).end();
const server = http.createServer((req, res) => dispatch(req, res));
const address = await listen(server);
const origin = `http://127.0.0.1:${address.port}`;
const issuer = `${origin}/oauth`;
const store = createFixtureAdapter();
let deployment;

try {
  deployment = createOidcDeployment({
    issuer,
    privateJwks: keyset.private_jwks,
    cookieKeys: [randomBytes(32).toString('base64url')],
    Adapter: store.Adapter,
    clients: FIXTURE_CLIENTS,
    findAccount: async (ctx, accountId) => [...SUBJECTS.values()].some((value) => value.subject === accountId) ? { accountId, async claims() { return { sub: accountId }; } } : undefined,
    interactionUrl: (ctx, interaction) => `${issuer}/interaction/${interaction.uid}`,
    principalForToken: async (token) => ({ ...SUBJECTS.get(token.clientId), client_id: token.clientId, security_epoch: 1, subject_epoch: 1 }),
  });
  dispatch = async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/oauth/interaction/')) {
        const details = await deployment.provider.interactionDetails(req, res);
        const principal = SUBJECTS.get(details.params.client_id);
        if (details.prompt.name === 'login') {
          await deployment.provider.interactionFinished(req, res, { login: { accountId: principal.subject } }, { mergeWithLastSubmission: false });
          return;
        }
        const grant = new deployment.provider.Grant({ accountId: principal.subject, clientId: details.params.client_id });
        grant.addResourceScope(RESOURCE, details.params.scope);
        await deployment.provider.interactionFinished(req, res, { consent: { grantId: await grant.save() } }, { mergeWithLastSubmission: true });
        return;
      }
      if (!url.pathname.startsWith('/oauth/')) return res.writeHead(404).end();
      req.originalUrl = req.url;
      req.url = req.url.slice('/oauth'.length) || '/';
      await deployment.nodeHandler(req, res);
    } catch (error) {
      res.writeHead(error.statusCode || 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.error || error.code || 'fixture_failure' }));
    }
  };

  const discovered = await (await fetch(`${issuer}/.well-known/oauth-authorization-server`)).json();
  assert.equal(discovered.issuer, issuer);
  assert.deepEqual(discovered.code_challenge_methods_supported, ['S256']);
  const principals = [];
  for (let clientIndex = 0; clientIndex < FIXTURE_CLIENTS.length; clientIndex += 1) {
    const client = FIXTURE_CLIENTS[clientIndex];
    const scope = client === FIXTURE_CLIENTS[0] ? [SCOPES[0]] : [SCOPES[2], SCOPES[4]];
    const auth = await authorize(discovered, client, scope);
    const response = await tokenRequest(discovered, { client_id: client.client_id, code: auth.code, code_verifier: auth.verifier, grant_type: 'authorization_code', redirect_uri: client.redirect_uris[0], resource: RESOURCE });
    if (response.status !== 200) throw new Error(`token returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const tokens = await response.json();
    assert.equal(typeof tokens.refresh_token, 'string');
    const principal = SUBJECTS.get(client.client_id);
    const verified = await verifyAccessToken(tokens.access_token, keyset, { issuer, audience: RESOURCE, subject: principal.subject, client_id: client.client_id, connection_id: principal.connection_id, scopes: scope });
    assert.equal(verified.protectedHeader.kid, 'aa2b3-active-fixture');
    const refresh = await tokenRequest(discovered, { client_id: client.client_id, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: RESOURCE });
    assert.equal(refresh.status, 200);
    const refreshed = await refresh.json();
    assert.equal(typeof refreshed.refresh_token, 'string');
    assert.notEqual(refreshed.refresh_token, tokens.refresh_token);
    if (clientIndex === 0) {
      const replay = await tokenRequest(discovered, { client_id: client.client_id, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: RESOURCE });
      assert.equal(replay.status, 400);
      assert.equal((await replay.json()).error, 'invalid_grant');
      const familyAfterReuse = await tokenRequest(discovered, { client_id: client.client_id, grant_type: 'refresh_token', refresh_token: refreshed.refresh_token, resource: RESOURCE });
      assert.equal(familyAfterReuse.status, 400);
      assert.equal((await familyAfterReuse.json()).error, 'invalid_grant');
    }
    principals.push({ client: client.client_id, subject: verified.payload.sub, connection: verified.payload.connection_id });
  }
  assert.notEqual(principals[0].subject, principals[1].subject);
  assert.notEqual(principals[0].connection, principals[1].connection);
  for (const prohibitedPath of ['/reg', '/me', '/token/introspection', '/device/auth', '/backchannel']) {
    const response = await fetch(`${issuer}${prohibitedPath}`, { redirect: 'manual' });
    assert.equal(response.status, 404);
  }
  const inventory = store.snapshot();
  assert.ok(inventory.models.includes('RefreshToken'));
  assert.equal(inventory.models.includes('RegistrationAccessToken'), false);
  console.log(JSON.stringify({ status: 'PASS', deployment: 'default-off-fixture', clients: principals, refresh_rotation: true, key_overlap: keyset.public_jwks.keys.length, bounded_rate_limit: true, adapter_schema: store.schema(), external_connection: false, mcp: false }));
} finally {
  store.clear();
  await close(server);
}
