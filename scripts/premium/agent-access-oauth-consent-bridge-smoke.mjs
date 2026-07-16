import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

import { exportJWK, generateKeyPair } from 'jose';

import testDb from './lib/cp0-test-db.js';
import identity from '../../db/identityRepo.js';
import repo from '../../db/agentAccessOAuthRepo.js';
import consentModule from '../../agent/access/consentCeremony.js';
import bridgeModule from '../../agent/access/oauthInteractionBridge.js';
import auditModule from '../../agent/access/oauthAudit.js';
import limiterModule from '../../agent/access/oauthRateLimiter.js';
import contracts from '../../agent/access/oauthDeploymentContracts.js';
import { createDefaultOffOAuthRuntime } from '../../agent/access/oauthRuntime.mjs';

const client = contracts.FIXTURE_CLIENTS[0];
const scope = 'learning.brief.read';
function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
class Cookies {
  values = new Map();
  absorb(response) { for (const header of response.headers.getSetCookie()) { const [pair] = header.split(';', 1); const at = pair.indexOf('='); this.values.set(pair.slice(0, at), pair.slice(at + 1)); } }
  header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join('; '); }
}
async function request(url, cookies, init = {}) { const headers = new Headers(init.headers); if (cookies.header()) headers.set('cookie', cookies.header()); const response = await fetch(url, { ...init, headers, redirect: 'manual' }); cookies.absorb(response); return response; }

const ctx = await testDb.setup('cp0-aa2-b3-consent-bridge');
let server;
try {
  for (const profile of contracts.FIXTURE_CLIENTS) await repo.registerClientFixture({ oauth_client_id: profile.client_id, display_name: profile.client_name, software_id: profile.software_id, software_version: profile.software_version, redirect_uris: [...profile.redirect_uris], registration_version: 'aa2-b3-fixture-v1' });
  const ceremony = consentModule.createConsentCeremony({ oauthRepo: repo, recordConsent: identity.recordConsent });
  const bridge = bridgeModule.createOAuthInteractionBridge({ consentCeremony: ceremony });
  const auditRows = [];
  const audit = auditModule.createContentSafeOAuthAudit({ key: 'bridge-fixture-audit-key-minimum-32-bytes', emit: (row) => auditRows.push(row) });
  const limiter = limiterModule.createOAuthRateLimiter();
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = { ...await exportJWK(privateKey), kid: 'aa2b3-bridge-fixture', alg: 'ES256', use: 'sig' };

  let runtime;
  let dispatch = (req, res) => res.writeHead(503).end();
  server = http.createServer((req, res) => dispatch(req, res));
  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;
  const issuer = `${origin}/oauth`;
  runtime = await createDefaultOffOAuthRuntime({
    repo, consentCeremony: ceremony, interactionBridge: bridge,
    resolveUser: async () => ({ id: 'u1' }),
    privateJwksJson: JSON.stringify({ keys: [privateJwk] }),
    cookieKeys: [randomBytes(32).toString('base64url')], audit, limiter,
    allowLoopbackFixture: true, fixtureIssuer: issuer,
  });
  dispatch = async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (!url.pathname.startsWith('/oauth/')) { res.writeHead(404).end(); return; }
      req.originalUrl = req.url;
      req.url = req.url.slice('/oauth'.length) || '/';
      await runtime.nodeHandler(req, res);
    } catch (error) {
      res.writeHead(error.statusCode || 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.error || error.code || 'fixture_failure' }));
    }
  };

  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(12).toString('hex');
  const authUrl = new URL(`${issuer}/auth`);
  authUrl.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', scope, resource: contracts.RESOURCE, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state });
  const cookies = new Cookies();
  let response = await request(authUrl, cookies);
  let requestId;
  for (let step = 0; step < 8; step += 1) {
    if (![302, 303].includes(response.status)) throw new Error(`authorization bridge returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const location = new URL(response.headers.get('location'), issuer);
    if (location.pathname === '/agent-access.html') { requestId = location.searchParams.get('request_id'); break; }
    response = await request(location, cookies);
  }
  assert.ok(requestId);
  const preview = ceremony.preview('u1', requestId);
  assert.equal(preview.client_display_name, client.client_name);
  assert.deepEqual(preview.requested_scopes.map((item) => item.scope), [scope]);
  assert.equal(JSON.stringify(preview).includes('code_challenge'), false);
  const connections = await repo.listConnectionsForUser('u1');
  assert.equal(connections.length, 1);
  assert.equal(connections[0].status, 'PENDING_AUTH');
  const decision = await ceremony.decide('u1', { request_id: requestId, decision: 'approve', selected_scopes: [scope], retention_ack: true });
  const continuation = bridge.complete('u1', requestId, decision.decision);
  response = await request(`${issuer}/interaction/${continuation.interaction_uid}/complete?request_id=${encodeURIComponent(requestId)}`, cookies);
  let code;
  for (let step = 0; step < 8; step += 1) {
    if (![302, 303].includes(response.status)) throw new Error(`continuation step ${step} at ${response.url} returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const location = new URL(response.headers.get('location'), issuer);
    if (location.href.startsWith(client.redirect_uris[0])) { code = location.searchParams.get('code'); assert.equal(location.searchParams.get('state'), state); break; }
    response = await request(location, cookies);
  }
  assert.ok(code);
  const tokenResponse = await fetch(`${issuer}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: client.redirect_uris[0], resource: contracts.RESOURCE }) });
  assert.equal(tokenResponse.status, 200);
  const tokens = await tokenResponse.json();
  assert.equal(typeof tokens.access_token, 'string');
  assert.equal(typeof tokens.refresh_token, 'string');
  assert.equal((await repo.listConnectionsForUser('u1'))[0].status, 'ACTIVE');
  assert.equal(bridge.size(), 0);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].cp0_eligible, false);
  assert.equal(JSON.stringify(auditRows).includes(requestId), false);

  console.log(JSON.stringify({ status: 'PASS', bridge: 'B2_TRUSTED_INTERACTION', browser_authority_fields: 0, first_party_user_bound: true, continuation_single_use: true, connection_status: 'ACTIVE', raw_secret_audit_leaks: 0, cp0_eligible: false }));
} finally {
  if (server?.listening) await close(server);
  await testDb.cleanup(ctx);
}
