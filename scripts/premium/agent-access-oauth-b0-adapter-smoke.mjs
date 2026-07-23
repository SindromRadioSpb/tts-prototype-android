import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

import { exportJWK, generateKeyPair } from 'jose';

import testDb from './lib/cp0-test-db.js';
import identity from '../../db/identityRepo.js';
import repo from '../../db/agentAccessOAuthRepo.js';
import consentConstants from '../../agent/access/consentCeremony.js';
import capabilities from '../../agent/access/capabilities.js';
import contracts from '../../agent/access/oauthDeploymentContracts.js';
import { createB0ProviderAdapter } from '../../agent/access/oidcB0Adapter.mjs';
import { createOidcDeployment } from '../../agent/access/oidcDeployment.mjs';
import { validateInjectedSigningJwks, verifyAccessToken } from '../../agent/access/oauthSigningKeys.mjs';

const { FIXTURE_CLIENTS, RESOURCE, SCOPES } = contracts;
const PROFILES = [
  { user: 'u1', subject: 'b0_subject_owner_opaque', connection: 'b0_hermes_conn', client: FIXTURE_CLIENTS[0], scopes: [...SCOPES] },
  { user: 'u2', subject: 'b0_subject_other_opaque', connection: 'b0_inspector_conn', client: FIXTURE_CLIENTS[1], scopes: ['agent.connection.read', 'reading.public.search'] },
];
const byClient = new Map(PROFILES.map((profile) => [profile.client.client_id, profile]));

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
function challenge(value) { return createHash('sha256').update(value).digest('base64url'); }
class Cookies {
  values = new Map();
  absorb(response) { for (const header of response.headers.getSetCookie()) { const [pair] = header.split(';', 1); const at = pair.indexOf('='); this.values.set(pair.slice(0, at), pair.slice(at + 1)); } }
  header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join('; '); }
}
async function request(url, cookies, init = {}) { const headers = new Headers(init.headers); if (cookies.header()) headers.set('cookie', cookies.header()); const response = await fetch(url, { ...init, headers, redirect: 'manual' }); cookies.absorb(response); return response; }
async function authorize(metadata, profile) {
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(12).toString('hex');
  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({ client_id: profile.client.client_id, redirect_uri: profile.client.redirect_uris[0], response_type: 'code', scope: profile.scopes.join(' '), resource: RESOURCE, code_challenge: challenge(verifier), code_challenge_method: 'S256', state });
  const cookies = new Cookies(); let response = await request(url, cookies);
  for (let step = 0; step < 6; step += 1) {
    if (![302, 303].includes(response.status)) throw new Error(`authorization failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const location = new URL(response.headers.get('location'), metadata.issuer);
    if (location.href.startsWith(profile.client.redirect_uris[0])) return { code: location.searchParams.get('code'), verifier };
    response = await request(location, cookies);
  }
  throw new Error('authorization did not finish');
}
async function token(metadata, form) { return fetch(metadata.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) }); }

const ctx = await testDb.setup('cp0-aa2-b3-adapter');
let server;
try {
  for (const profile of PROFILES) {
    await repo.registerClientFixture({ oauth_client_id: profile.client.client_id, display_name: profile.client.client_name, software_id: profile.client.software_id, software_version: profile.client.software_version, redirect_uris: [...profile.client.redirect_uris], registration_version: 'aa2-b3-fixture-v1' });
    await repo.createSubjectMapping(profile.user, profile.subject, 'aa2-b3-subject-v1');
    await repo.createPendingConnection(profile.user, { connection_id: profile.connection, oauth_client_id: profile.client.client_id, display_label: profile.client.client_name, consent_version: consentConstants.CONSENT_VERSION, capability_version: capabilities.CAPABILITY_VERSION, retention_notice_version: consentConstants.RETENTION_NOTICE_VERSION });
    for (const scope of profile.scopes) await identity.recordConsent(profile.user, `external_agent_access:${profile.connection}:${scope}`, true, consentConstants.CONSENT_VERSION);
    await repo.activateConnectionWithGrants(profile.user, profile.connection, profile.scopes);
  }

  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...await exportJWK(privateKey), kid: 'aa2b3-b0-fixture', alg: 'ES256', use: 'sig' };
  const keyset = await validateInjectedSigningJwks({ keys: [jwk] });
  const b0 = createB0ProviderAdapter({ repo });
  assert.throws(() => new b0.Adapter('UnknownProviderModel'), /AA_OAUTH_PROVIDER_MODEL_UNAPPROVED/);

  let dispatch = (req, res) => res.writeHead(503).end();
  server = http.createServer((req, res) => dispatch(req, res));
  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;
  const issuer = `${origin}/oauth`;
  const deployment = createOidcDeployment({
    issuer, privateJwks: keyset.private_jwks, cookieKeys: [randomBytes(32).toString('base64url')],
    Adapter: b0.Adapter, clients: FIXTURE_CLIENTS,
    findAccount: async (requestContext, accountId) => PROFILES.some((profile) => profile.subject === accountId) ? { accountId, async claims() { return { sub: accountId }; } } : undefined,
    interactionUrl: (requestContext, interaction) => `${issuer}/interaction/${interaction.uid}`,
    principalForToken: async (value) => {
      const profile = byClient.get(value.clientId);
      const snapshot = await repo.validateConnectionSnapshot(profile.user, profile.connection, { oauth_client_id: profile.client.client_id, scopes: profile.scopes });
      return { subject: snapshot.subject_id, client_id: snapshot.oauth_client_id, connection_id: snapshot.connection_id, security_epoch: snapshot.security_epoch, subject_epoch: snapshot.subject_epoch };
    },
  });
  dispatch = async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/oauth/interaction/')) {
        const details = await deployment.provider.interactionDetails(req, res);
        const profile = byClient.get(details.params.client_id);
        if (details.prompt.name === 'login') return deployment.provider.interactionFinished(req, res, { login: { accountId: profile.subject } }, { mergeWithLastSubmission: false });
        const grant = new deployment.provider.Grant({ accountId: profile.subject, clientId: profile.client.client_id, jti: profile.connection });
        grant.addResourceScope(RESOURCE, profile.scopes.join(' '));
        await deployment.provider.interactionFinished(req, res, { consent: { grantId: await grant.save() } }, { mergeWithLastSubmission: true });
        return;
      }
      req.originalUrl = req.url; req.url = req.url.slice('/oauth'.length) || '/';
      return deployment.nodeHandler(req, res);
    } catch (error) { console.error(error); res.writeHead(error.statusCode || 500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.error || error.code || error.message || 'fixture_failure' })); }
  };
  const metadata = await (await fetch(`${issuer}/.well-known/oauth-authorization-server`)).json();
  const issued = [];
  for (const profile of PROFILES) {
    const auth = await authorize(metadata, profile);
    const response = await token(metadata, { client_id: profile.client.client_id, code: auth.code, code_verifier: auth.verifier, grant_type: 'authorization_code', redirect_uri: profile.client.redirect_uris[0], resource: RESOURCE });
    if (response.status !== 200) throw new Error(`token failed ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const tokens = await response.json();
    await verifyAccessToken(tokens.access_token, keyset, { issuer, audience: RESOURCE, subject: profile.subject, client_id: profile.client.client_id, connection_id: profile.connection, scopes: profile.scopes });
    issued.push({ profile, refresh: tokens.refresh_token });
  }
  const first = issued[0];
  const rotatedResponse = await token(metadata, { client_id: first.profile.client.client_id, grant_type: 'refresh_token', refresh_token: first.refresh, resource: RESOURCE });
  assert.equal(rotatedResponse.status, 200);
  const rotated = await rotatedResponse.json();
  assert.notEqual(rotated.refresh_token, first.refresh);
  assert.equal((await repo.exportAgentAccess('u1')).token_families.length, 1);

  const restarted = createB0ProviderAdapter({ repo });
  assert.equal((await new restarted.Adapter('RefreshToken').find(rotated.refresh_token)).clientId, first.profile.client.client_id);
  assert.equal(restarted.ephemeralSize(), 0);
  const replay = await token(metadata, { client_id: first.profile.client.client_id, grant_type: 'refresh_token', refresh_token: first.refresh, resource: RESOURCE });
  if (replay.status !== 400) throw new Error(`refresh replay returned ${replay.status}: ${(await replay.text()).slice(0, 500)}`);
  assert.equal((await repo.loadConnection('u1', first.profile.connection)).status, 'SUSPENDED');
  assert.equal((await repo.loadConnection('u2', PROFILES[1].connection)).status, 'ACTIVE');
  const second = issued[1];
  const wrongClientRevoke = await fetch(metadata.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: first.profile.client.client_id, token: second.refresh, token_type_hint: 'refresh_token' }) });
  assert.equal(wrongClientRevoke.status, 200);
  const stillUsable = await token(metadata, { client_id: second.profile.client.client_id, grant_type: 'refresh_token', refresh_token: second.refresh, resource: RESOURCE });
  assert.equal(stillUsable.status, 200);
  const secondRotated = await stillUsable.json();
  const revoked = await fetch(metadata.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: second.profile.client.client_id, token: secondRotated.refresh_token, token_type_hint: 'refresh_token' }) });
  assert.equal(revoked.status, 200);
  const afterRevoke = await token(metadata, { client_id: second.profile.client.client_id, grant_type: 'refresh_token', refresh_token: secondRotated.refresh_token, resource: RESOURCE });
  assert.equal(afterRevoke.status, 400);
  assert.equal((await repo.loadConnection('u2', second.profile.connection)).status, 'SUSPENDED');
  const exported = JSON.stringify(await repo.exportAgentAccess('u1'));
  for (const secret of [first.refresh, rotated.refresh_token, PROFILES[0].subject]) assert.equal(exported.includes(secret), false);

  console.log(JSON.stringify({ status: 'PASS', adapter: 'B0_EXACT', durable_models: ['Client', 'Grant', 'AuthorizationCode', 'RefreshToken'], ephemeral_models: ['Interaction', 'Session'], generic_json_store: false, restart_refresh_found: true, refresh_reuse_suspended_bound_connection: true, wrong_client_revoke_isolated: true, explicit_revoke_suspended_bound_connection: true, secret_export_leaks: 0 }));
} finally {
  if (server?.listening) await close(server);
  await testDb.cleanup(ctx);
}
