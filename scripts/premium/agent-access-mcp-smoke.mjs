#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import express from 'express';

import adapterModule from '../../agent/access/mcpAdapter.js';
import capabilities from '../../agent/access/capabilities.js';
import serviceModule from '../../agent/access/service.js';
import rateModule from '../../agent/access/mcpRateLimiter.js';
import { createMcpResourceValidator } from '../../agent/access/mcpResourceValidator.mjs';

const { MCP_PATH, MCP_PROTOCOL_VERSION, createMcpDefaultOffGate } = adapterModule;
const { createAgentAccessService } = serviceModule;
const { createMcpRateLimiter } = rateModule;
const issuer = 'https://linguistpro.kolosei.com/oauth';
const resource = 'https://linguistpro.kolosei.com/agent-access';
const subject = 'aas_fixture_subject';
const otherSubject = 'aas_other_owner_subject';
const userId = 'owner-fixture';
const clientId = 'linguistpro-hermes-owner-v0';
const connectionId = 'ac_fixture_connection';
const allScopes = Object.values(capabilities.CAPABILITIES).map((entry) => entry.scope);
const nowSeconds = Math.floor(Date.now() / 1000);
const expiresAt = new Date((nowSeconds + 600) * 1000).toISOString();

const fixtures = Object.freeze({
  get_learning_brief: Object.freeze({ schema_version: 'aa.learning_brief.1.0.0', due_total: 12, urgent_total: 4, scheduled_total: 31, estimated_minutes: 9, priority_code: 'REVIEW_DUE', unfinished_action_code: 'REVIEW_AVAILABLE', generated_at: new Date(nowSeconds * 1000).toISOString(), expires_at: new Date((nowSeconds + 300) * 1000).toISOString() }),
  get_review_summary: Object.freeze({ schema_version: 'aa.review_summary.1.0.0', due_total: 12, urgent_total: 4, estimated_minutes: 9, handoff_eligible: false, handoff_scope_available: false, generated_at: new Date(nowSeconds * 1000).toISOString(), expires_at: new Date((nowSeconds + 120) * 1000).toISOString() }),
  search_public_reading_catalog: Object.freeze({ schema_version: 'aa.public_reading_search.1.0.0', catalog_version: 'catalog-fixture', results: Object.freeze([{ work_id: 'work-fixture', title: 'Public fixture work', author: 'Public fixture author', era: 'REVIVAL', genre: 'PROSE', language: 'he', sentence_count: 120, audio_available: false, ready_state: 'READY', first_party_path: '/library.html' }]), next_cursor: null, generated_at: new Date(nowSeconds * 1000).toISOString() }),
  get_recent_explanation_metadata: Object.freeze({ schema_version: 'aa.explanation_metadata.1.0.0', items: Object.freeze([{ explanation_id: 'explanation-fixture', created_at: new Date(nowSeconds * 1000).toISOString(), kind: 'word', construct_ids: Object.freeze(['construct-fixture']), purge_state: 'AVAILABLE' }]), next_before: null, generated_at: new Date(nowSeconds * 1000).toISOString() }),
  get_agent_connection: Object.freeze({ schema_version: 'aa.connection.1.0.0', connection_id: connectionId, oauth_client_id: clientId, client_display_name: 'Fixture client', connection_status: 'ACTIVE', granted_scopes: Object.freeze(allScopes), access_expires_at: expiresAt, consent_version: 'consent-fixture', capability_version: 'aa-v0.1', downstream_retention_notice: 'EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO', generated_at: new Date(nowSeconds * 1000).toISOString() }),
});
const args = Object.freeze({
  get_learning_brief: {}, get_review_summary: {}, get_agent_connection: {},
  search_public_reading_catalog: { language: 'he', audio: 'ANY', ready: 'ANY', sort: 'RELEVANCE', limit: 10 },
  get_recent_explanation_metadata: { kinds: ['word'], limit: 10 },
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
function handlers(overrides = {}) { return Object.fromEntries(capabilities.capabilityNames().map((name) => [name, overrides[name] || (async () => fixtures[name])])); }

const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
const publicJwk = await exportJWK(publicKey);
const privateJwk = await exportJWK(privateKey);
Object.assign(publicJwk, { alg: 'ES256', use: 'sig', kid: 'mcp-fixture-kid' });
Object.assign(privateJwk, { alg: 'ES256', use: 'sig', kid: 'mcp-fixture-kid' });
const keyset = Object.freeze({ public_jwks: Object.freeze({ keys: Object.freeze([Object.freeze(publicJwk)]) }), private_jwks: Object.freeze({ keys: Object.freeze([Object.freeze(privateJwk)]) }), active_kid: 'mcp-fixture-kid' });

let denied = false;
let connectionActive = true;
let expectedSecurityEpoch = 7;
let validationCalls = 0;
const repo = {
  async userForSubject(value) {
    if (value === subject) return { subject_id: subject, user_id: userId, security_epoch: 11 };
    if (value === otherSubject) return { subject_id: otherSubject, user_id: 'other-owner', security_epoch: 11 };
    return null;
  },
  async isAccessTokenDenied(uid, cid) { assert.equal(uid, userId); assert.equal(cid, connectionId); return denied; },
  async validateConnectionSnapshot(uid, cid, expected) {
    validationCalls += 1;
    assert.equal(uid, userId); assert.equal(cid, connectionId);
    if (!connectionActive) throw new Error('AA_OAUTH_CONNECTION_INACTIVE');
    if (expected.oauth_client_id !== clientId || expected.security_epoch !== expectedSecurityEpoch || expected.subject_epoch !== 11) throw new Error('AA_OAUTH_EPOCH_OR_BINDING_INVALID');
    if (expected.scopes.some((scope) => !allScopes.includes(scope))) throw new Error('AA_OAUTH_SCOPE_NOT_GRANTED');
    return { user_id: userId, subject_id: subject, oauth_client_id: clientId, connection_id: connectionId, connection_status: 'ACTIVE', security_epoch: 7, subject_epoch: 11, scopes: allScopes, capability_version: 'aa-v0.1' };
  },
};

async function token(overrides = {}, signingKey = privateKey) {
  const claims = {
    sub: subject, client_id: clientId, connection_id: connectionId, jti: `jti_${Math.random().toString(16).slice(2)}`,
    scope: allScopes.join(' '), security_epoch: 7, subject_epoch: 11,
    ...overrides,
  };
  const builder = new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'mcp-fixture-kid', typ: 'at+jwt' })
    .setIssuer(overrides.iss || issuer).setAudience(overrides.aud || resource)
    .setIssuedAt(overrides.iat ?? nowSeconds).setExpirationTime(overrides.exp ?? nowSeconds + 600);
  return builder.sign(signingKey);
}

const auditRows = [];
const audit = { record(row) { auditRows.push(structuredClone(row)); } };
const limiter = createMcpRateLimiter();
const validator = createMcpResourceValidator({ keyset, repo, issuer, resource, allowedClientIds: [clientId], allowedOwnerIds: [userId] });
const service = createAgentAccessService({ enabled: true, ownerIds: [userId], handlers: handlers() });
const runtime = Object.freeze({ validator, service, limiter, audit });
let runtimeCalls = 0;
const app = express();
app.set('trust proxy', 1);
app.all(MCP_PATH, createMcpDefaultOffGate({ getRuntime: async () => { runtimeCalls += 1; return runtime; } }));
const server = http.createServer(app);
const address = await listen(server);
const origin = `http://127.0.0.1:${address.port}`;

function baseHeaders(bearer) {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${bearer}`,
  };
}
async function post(body, options = {}) {
  const bearer = options.token || await token();
  post.sequence = (post.sequence || 0) + 1;
  const headers = { ...baseHeaders(bearer), 'x-forwarded-for': `198.51.100.${(post.sequence % 200) + 1}`, ...(options.headers || {}) };
  if (options.protocol !== false && body?.method !== 'initialize') headers['mcp-protocol-version'] = options.protocol || MCP_PROTOCOL_VERSION;
  const method = options.method || 'POST';
  const init = { method, headers };
  if (!['GET', 'HEAD'].includes(method)) init.body = options.rawBody ?? JSON.stringify(body);
  return fetch(`${origin}${MCP_PATH}${options.query || ''}`, init);
}
async function json(response) { const text = await response.text(); return text ? JSON.parse(text) : null; }
function rpc(method, params, id = 1) { return { jsonrpc: '2.0', id, method, params }; }

let checks = 0;
try {
  Object.assign(process.env, { NODE_ENV: 'test', AGENT_ACCESS_LOOPBACK_FIXTURE: '1', AGENT_ACCESS_CANONICAL_ORIGIN: origin, AGENT_ACCESS_UI_ENABLED: '1', AGENT_ACCESS_OAUTH_ENABLED: '1', AGENT_ACCESS_OAUTH_CLIENTS_ENABLED: '1', AGENT_ACCESS_MCP_ENABLED: '0', AGENT_ACCESS_OAUTH_TRUST_PROXY: '0' });
  let response = await post(rpc('tools/list', {}), { token: 'synthetic.invalid.token', rawBody: '{not-json' });
  assert.equal(response.status, 404); assert.deepEqual(await json(response), { error: 'AGENT_ACCESS_MCP_DISABLED' });
  assert.equal(runtimeCalls, 0); assert.equal(validationCalls, 0); assert.equal(limiter.size(), 0); assert.equal(auditRows.length, 0); checks++;

  process.env.AGENT_ACCESS_MCP_ENABLED = '1'; process.env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED = '0';
  response = await post(rpc('tools/list', {}));
  assert.equal(response.status, 404); assert.deepEqual(await json(response), { error: 'AGENT_ACCESS_OAUTH_CLIENTS_DISABLED' }); assert.equal(runtimeCalls, 0); checks++;
  process.env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED = '1';

  response = await post(rpc('initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'fixture-client', version: '1.0.0' } }));
  assert.equal(response.status, 200); let body = await json(response);
  assert.equal(body.result.protocolVersion, MCP_PROTOCOL_VERSION); assert.deepEqual(Object.keys(body.result.capabilities), ['tools']); assert.equal(body.result.capabilities.resources, undefined); checks++;

  response = await post(rpc('initialize', { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'fixture-client', version: '1.0.0' } }));
  assert.equal(response.status, 400); assert.equal((await json(response)).error.message, 'Unsupported MCP protocol version.'); checks++;
  response = await post(rpc('tools/list', {}), { protocol: '2025-06-18' }); assert.equal(response.status, 400); checks++;

  response = await post(rpc('tools/list', {})); assert.equal(response.status, 200); body = await json(response);
  assert.deepEqual(body.result.tools.map((tool) => tool.name), capabilities.capabilityNames());
  for (const tool of body.result.tools) { assert.equal(tool.inputSchema.additionalProperties, false); assert.equal(tool.outputSchema.additionalProperties, false); }
  checks++;

  for (const name of capabilities.capabilityNames()) {
    response = await post(rpc('tools/call', { name, arguments: args[name] })); assert.equal(response.status, 200, name);
    body = await json(response); assert.equal(body.result.isError, undefined, JSON.stringify(body)); assert.deepEqual(body.result.structuredContent, fixtures[name]); checks++;
  }

  response = await post(rpc('tools/call', { name: 'not_a_tool', arguments: {} })); body = await json(response);
  assert.equal(body.result.isError, true); assert.equal(JSON.parse(body.result.content[0].text).error.code, 'UNKNOWN_TOOL'); checks++;
  response = await post(rpc('tools/call', { name: 'get_learning_brief', arguments: { access_token: 'synthetic-sentinel' } })); body = await json(response);
  assert.equal(body.result.isError, true); assert.equal(JSON.parse(body.result.content[0].text).error.code, 'UNKNOWN_FIELD'); checks++;

  const narrow = await token({ scope: 'review.summary.read' });
  response = await post(rpc('tools/call', { name: 'get_learning_brief', arguments: {} }), { token: narrow }); body = await json(response);
  assert.equal(JSON.parse(body.result.content[0].text).error.code, 'INSUFFICIENT_SCOPE'); checks++;

  for (const badToken of [
    await token({ iss: 'https://wrong.invalid/oauth' }), await token({ aud: 'https://wrong.invalid/resource' }),
    await token({ exp: nowSeconds - 120, iat: nowSeconds - 600 }), await token({ sub: 'aas_wrong_subject' }), await token({ sub: otherSubject }),
    await token({ client_id: 'unlisted-client' }), await token({ connection_id: 'ac_wrong_connection' }),
  ]) {
    response = await post(rpc('tools/list', {}), { token: badToken }); assert.equal(response.status, 401); assert.deepEqual(await json(response), { error: 'AA_MCP_BEARER_INVALID' }); checks++;
  }
  const wrongPair = await generateKeyPair('ES256');
  response = await post(rpc('tools/list', {}), { token: await token({}, wrongPair.privateKey) }); assert.equal(response.status, 401); checks++;
  expectedSecurityEpoch = 8; response = await post(rpc('tools/list', {})); assert.equal(response.status, 401); expectedSecurityEpoch = 7; checks++;
  connectionActive = false; response = await post(rpc('tools/list', {})); assert.equal(response.status, 401); connectionActive = true; checks++;
  denied = true; const beforeDeniedValidation = validationCalls; response = await post(rpc('tools/list', {})); assert.equal(response.status, 401); assert.equal(validationCalls, beforeDeniedValidation); denied = false; checks++;

  response = await post(rpc('tools/list', {}), { query: '?access_token=synthetic-sentinel' }); assert.equal(response.status, 400); assert.equal(runtimeCalls > 0, true); checks++;
  response = await post(rpc('tools/list', {}), { headers: { cookie: 'access_token=synthetic-sentinel' } }); assert.equal(response.status, 400); checks++;
  response = await post(rpc('tools/list', {}), { headers: { origin: 'https://evil.invalid' } }); assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null); checks++;
  response = await post(rpc('tools/list', {}), { headers: { origin: 'null' } }); assert.equal(response.status, 403); checks++;
  response = await post(rpc('tools/list', {}), { method: 'OPTIONS' }); assert.equal(response.status, 404); assert.equal(response.headers.get('access-control-allow-origin'), null); checks++;
  response = await post(rpc('tools/list', {}), { headers: { 'x-forwarded-host': 'evil.invalid', 'x-forwarded-proto': 'https' } }); assert.equal(response.status, 400); checks++;
  process.env.AGENT_ACCESS_CANONICAL_ORIGIN = `http://localhost:${address.port}`;
  response = await post(rpc('tools/list', {})); assert.equal(response.status, 400); process.env.AGENT_ACCESS_CANONICAL_ORIGIN = origin; checks++;
  response = await post(rpc('tools/list', {}), { headers: { 'mcp-session-id': 'synthetic-session-token' } }); assert.equal(response.status, 400); checks++;
  response = await post(rpc('tools/list', {}), { headers: { accept: 'application/json' } }); assert.equal(response.status, 406); checks++;
  response = await post(rpc('tools/list', {}), { headers: { 'content-type': 'text/plain' } }); assert.equal(response.status, 415); checks++;
  response = await post(rpc('tools/list', {}), { method: 'GET', rawBody: undefined }); assert.equal(response.status, 405); checks++;
  response = await post(rpc('tools/list', {}), { method: 'DELETE', rawBody: undefined }); assert.equal(response.status, 405); checks++;
  response = await post([rpc('tools/list', {})], { rawBody: JSON.stringify([rpc('tools/list', {})]) }); assert.equal(response.status, 400); checks++;
  response = await post(rpc('tools/list', {}), { rawBody: JSON.stringify({ padding: 'x'.repeat(17 * 1024) }) }); assert.equal(response.status, 413); checks++;

  for (const method of ['resources/list', 'prompts/list', 'tasks/list', 'sampling/createMessage']) {
    response = await post(rpc(method, {})); body = await json(response); assert.equal(body.error.code, -32601, method); checks++;
  }

  const rateFixture = createMcpRateLimiter({ now: () => 1_000_000 });
  const ratePrincipal = { user_id: userId, oauth_client_id: clientId, connection_id: connectionId };
  for (let index = 0; index < 12; index += 1) assert.equal(rateFixture.takeRequest(ratePrincipal, '127.0.0.1', 'get_learning_brief').ok, true);
  assert.equal(rateFixture.takeRequest(ratePrincipal, '127.0.0.1', 'get_learning_brief').ok, false);
  for (let index = 0; index < 10; index += 1) assert.equal(rateFixture.takeAuthFailure('127.0.0.2').ok, true);
  assert.equal(rateFixture.takeAuthFailure('127.0.0.2').ok, false); checks++;

  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../../agent/access/mcpAdapter.js', import.meta.url), 'utf8'));
  for (const forbidden of ['createMessage(', 'registerResource', 'registerPrompt', 'setInterval(', 'setTimeout(', 'fetch(']) assert.equal(source.includes(forbidden), false, forbidden);
  assert.ok(auditRows.length > 0); assert.ok(auditRows.every((row) => !('token' in row) && !('user_id' in row))); checks++;

  console.log(JSON.stringify({ ok: true, checks, tools: capabilities.capabilityNames().length, protocol: MCP_PROTOCOL_VERSION, stateless: true, sessions: 0, external_network_calls: 0, provider_calls: 0, live_data_reads: 0 }));
} finally {
  await close(server);
}
