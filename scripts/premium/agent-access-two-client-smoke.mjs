#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { exportJWK, generateKeyPair, importJWK, jwtVerify, SignJWT } from 'jose';
import { chromium } from 'playwright';

import adapterModule from '../../agent/access/mcpAdapter.js';
import capabilities from '../../agent/access/capabilities.js';
import serviceModule from '../../agent/access/service.js';
import rateModule from '../../agent/access/mcpRateLimiter.js';

const { createMcpDefaultOffGate, MCP_PROTOCOL_VERSION } = adapterModule;
const { createAgentAccessService } = serviceModule;
const { createMcpRateLimiter } = rateModule;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS = capabilities.capabilityNames();
const SCOPES = Object.values(capabilities.CAPABILITIES).map((entry) => entry.scope);
const RESOURCE_PATH = '/agent-access';
const MCP_PATH = '/agent-access/mcp';
const INSPECTOR_CLIENT_ID = 'linguistpro-mcp-inspector-v0';
const HERMES_CLIENT_ID = 'linguistpro-hermes-owner-v0';
const CLIENTS = new Map([
  [HERMES_CLIENT_ID, { redirect: 'http://127.0.0.1:8765/callback', connection: 'aa2c2_hermes_conn', subject: 'aa2c2_hermes_sub', user: 'aa2c2_hermes_owner' }],
  [INSPECTOR_CLIENT_ID, { redirect: 'http://localhost:6274/oauth/callback', connection: 'aa2c2_inspector_conn', subject: 'aa2c2_inspector_sub', user: 'aa2c2_inspector_owner' }],
]);
const TOOL_ARGS = Object.freeze({
  get_learning_brief: {},
  get_review_summary: {},
  search_public_reading_catalog: { language: 'he', audio: 'ANY', ready: 'ANY', sort: 'RELEVANCE', limit: 1 },
  get_recent_explanation_metadata: { kinds: ['word'], limit: 1 },
  get_agent_connection: {},
});

function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address())); }); }
function close(server) { return new Promise((resolve) => server.close(() => resolve())); }
function sha(value) { return createHash('sha256').update(value).digest('base64url'); }
function form(req) { return new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on('data', (chunk) => { size += chunk.length; if (size > 64 * 1024) reject(new Error('FORM_TOO_LARGE')); else chunks.push(chunk); }); req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))); req.on('error', reject); }); }
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd || ROOT, env: options.env || process.env, windowsHide: true, shell: false });
    const stdout = []; const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk)); child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
  });
}
async function stop(child) { if (!child || child.killed) return; child.kill(); await new Promise((resolve) => { const timer = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); }); }

const now = () => Math.floor(Date.now() / 1000);
const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
const publicJwk = await exportJWK(publicKey); Object.assign(publicJwk, { alg: 'ES256', use: 'sig', kid: 'aa2c2-fixture-kid' });
const verifyKey = await importJWK(publicJwk, 'ES256');
const state = {
  origin: '', registration: 0, production: 0, provider: 0, dcr: 0, cimd: 0,
  routes: new Map(), codes: new Map(), refresh: new Map(), revoked: new Set(),
  tokenByClient: new Map(), toolCalls: new Map(), initialized: new Map(),
};
function count(route) { state.routes.set(route, (state.routes.get(route) || 0) + 1); }
function clientForId(id) { const value = CLIENTS.get(id); if (!value) throw new Error('UNKNOWN_CLIENT'); return value; }
function fixtures(clientId) {
  const client = clientForId(clientId); const generated = new Date().toISOString();
  return {
    get_learning_brief: { schema_version: 'aa.learning_brief.1.0.0', due_total: 2, urgent_total: 1, scheduled_total: 4, estimated_minutes: 3, priority_code: 'REVIEW_DUE', unfinished_action_code: 'REVIEW_AVAILABLE', generated_at: generated, expires_at: new Date(Date.now() + 300000).toISOString() },
    get_review_summary: { schema_version: 'aa.review_summary.1.0.0', due_total: 2, urgent_total: 1, estimated_minutes: 3, handoff_eligible: false, handoff_scope_available: false, generated_at: generated, expires_at: new Date(Date.now() + 120000).toISOString() },
    search_public_reading_catalog: { schema_version: 'aa.public_reading_search.1.0.0', catalog_version: 'aa2c2-synthetic', results: [{ work_id: 'synthetic-work', title: 'Synthetic public work', author: 'Synthetic author', era: 'REVIVAL', genre: 'PROSE', language: 'he', sentence_count: 20, audio_available: false, ready_state: 'READY', first_party_path: '/library.html' }], next_cursor: null, generated_at: generated },
    get_recent_explanation_metadata: { schema_version: 'aa.explanation_metadata.1.0.0', items: [{ explanation_id: 'synthetic-explanation', created_at: generated, kind: 'word', construct_ids: ['synthetic-construct'], purge_state: 'AVAILABLE' }], next_before: null, generated_at: generated },
    get_agent_connection: { schema_version: 'aa.connection.1.0.0', connection_id: client.connection, oauth_client_id: clientId, client_display_name: clientId === HERMES_CLIENT_ID ? 'Hermes synthetic fixture' : 'Inspector synthetic fixture', connection_status: 'ACTIVE', granted_scopes: SCOPES, access_expires_at: new Date(Date.now() + 600000).toISOString(), consent_version: 'aa2c2-synthetic', capability_version: 'aa-v0.1', downstream_retention_notice: 'EXTERNAL_STORAGE_OUTSIDE_LINGUISTPRO', generated_at: generated },
  };
}
async function accessToken(clientId, jti = randomBytes(12).toString('hex')) {
  const client = clientForId(clientId);
  return new SignJWT({ client_id: clientId, connection_id: client.connection, scope: SCOPES.join(' '), security_epoch: 1, subject_epoch: 1 })
    .setProtectedHeader({ alg: 'ES256', kid: publicJwk.kid, typ: 'at+jwt' }).setIssuer(`${state.origin}/oauth`).setAudience(`${state.origin}${RESOURCE_PATH}`)
    .setSubject(client.subject).setJti(jti).setIssuedAt().setExpirationTime(clientId === HERMES_CLIENT_ID ? '2s' : '120s').sign(privateKey);
}
const validator = {
  async validate(authorization, requestId) {
    const match = String(authorization || '').match(/^Bearer (.+)$/); if (!match) throw new Error('BAD_BEARER');
    const { payload, protectedHeader } = await jwtVerify(match[1], verifyKey, { issuer: `${state.origin}/oauth`, audience: `${state.origin}${RESOURCE_PATH}`, algorithms: ['ES256'] });
    const client = clientForId(payload.client_id); if (client.subject !== payload.sub || client.connection !== payload.connection_id || state.revoked.has(payload.connection_id)) throw new Error('BAD_BINDING');
    const scopes = String(payload.scope || '').split(' ').filter(Boolean).sort();
    return { principal: Object.freeze({ user_id: client.user, oauth_client_id: payload.client_id, connection_id: client.connection, external_actor_id: `synthetic-${payload.client_id}`, request_id: requestId, scopes, connection_status: 'ACTIVE', access_expires_at: new Date(payload.exp * 1000).toISOString() }), audit: Object.freeze({ oauth_client_id: payload.client_id, connection_id: client.connection, scopes, jti: payload.jti, security_epoch: 1, kid: protectedHeader.kid }) };
  },
};
const service = createAgentAccessService({ enabled: true, ownerIds: [...CLIENTS.values()].map((entry) => entry.user), handlers: Object.fromEntries(TOOLS.map((name) => [name, async (principal) => { state.toolCalls.set(principal.oauth_client_id, (state.toolCalls.get(principal.oauth_client_id) || 0) + 1); return fixtures(principal.oauth_client_id)[name]; }])) });
const runtime = { validator, service, limiter: createMcpRateLimiter(), audit: { record() {} } };

const app = express();
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.origin === 'http://localhost:6274') {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:6274');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,mcp-protocol-version');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
function protectedResourceMetadata() { return { resource: `${state.origin}${RESOURCE_PATH}`, authorization_servers: [`${state.origin}/oauth`], bearer_methods_supported: ['header'], scopes_supported: SCOPES }; }
app.get('/.well-known/oauth-protected-resource/agent-access', (_req, res) => { count('prm-canonical'); res.json(protectedResourceMetadata()); });
app.get('/.well-known/oauth-protected-resource/agent-access/mcp', (_req, res) => { count('prm-compatibility'); res.json(protectedResourceMetadata()); });
app.get('/.well-known/oauth-protected-resource', (_req, res) => { count('prm-root-fallback'); res.json(protectedResourceMetadata()); });
app.all('/authorize', (_req, res) => { count('authorize-root-fallback'); res.status(404).json({ error: 'not_found' }); });
function metadata(_req, res) { count('metadata'); res.json({ issuer: `${state.origin}/oauth`, authorization_endpoint: `${state.origin}/oauth/auth`, token_endpoint: `${state.origin}/oauth/token`, revocation_endpoint: `${state.origin}/oauth/revoke`, jwks_uri: `${state.origin}/oauth/jwks`, response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: SCOPES }); }
app.get('/.well-known/oauth-authorization-server/oauth', metadata); app.get('/.well-known/oauth-authorization-server', metadata); app.get('/oauth/.well-known/openid-configuration', metadata);
app.get('/oauth/jwks', (_req, res) => { count('jwks'); res.json({ keys: [publicJwk] }); });
app.get('/oauth/auth', (req, res) => {
  count('authorize');
  try {
    const clientId = String(req.query.client_id || ''); const client = clientForId(clientId);
    assert.equal(req.query.redirect_uri, client.redirect); assert.equal(req.query.resource, `${state.origin}${RESOURCE_PATH}`); assert.equal(req.query.response_type, 'code'); assert.equal(req.query.code_challenge_method, 'S256');
    assert.deepEqual(String(req.query.scope || '').split(' ').filter(Boolean).sort(), [...SCOPES].sort());
    const code = randomBytes(24).toString('base64url'); state.codes.set(sha(code), { clientId, challenge: req.query.code_challenge, used: false });
    const redirect = new URL(client.redirect); redirect.searchParams.set('code', code); redirect.searchParams.set('state', String(req.query.state || '')); res.redirect(302, redirect.href);
  } catch { res.status(400).json({ error: 'invalid_request' }); }
});
app.post('/oauth/token', async (req, res) => {
  count('token');
  try {
    const data = await form(req); assert.equal(data.get('resource'), `${state.origin}${RESOURCE_PATH}`); assert.equal(data.has('client_secret'), false);
    const clientId = data.get('client_id'); const client = clientForId(clientId); let family;
    if (data.get('grant_type') === 'authorization_code') {
      const record = state.codes.get(sha(data.get('code') || '')); assert.ok(record && !record.used && record.clientId === clientId); assert.equal(sha(data.get('code_verifier') || ''), record.challenge); record.used = true; family = randomBytes(24).toString('base64url');
    } else {
      assert.equal(data.get('grant_type'), 'refresh_token'); const old = state.refresh.get(sha(data.get('refresh_token') || '')); assert.ok(old && old.clientId === clientId);
      if (!old.active) { state.revoked.add(client.connection); throw new Error('REFRESH_REUSE'); }
      old.active = false; family = old.family;
    }
    const refresh = randomBytes(32).toString('base64url'); state.refresh.set(sha(refresh), { active: true, clientId, family });
    const token = await accessToken(clientId); state.tokenByClient.set(clientId, token);
    res.json({ access_token: token, token_type: 'Bearer', expires_in: clientId === HERMES_CLIENT_ID ? 2 : 120, refresh_token: refresh, scope: SCOPES.join(' ') });
  } catch { res.status(400).json({ error: 'invalid_grant' }); }
});
app.post('/oauth/revoke', async (req, res) => { count('revoke'); try { const data = await form(req); const record = state.refresh.get(sha(data.get('token') || '')); if (record) { record.active = false; state.revoked.add(clientForId(record.clientId).connection); } res.status(200).end(); } catch { res.status(400).end(); } });
app.all(['/register', '/oauth/register', '/.well-known/oauth-client', '/oauth/client-metadata'], (req, res) => { state.registration += 1; if (req.path.includes('metadata')) state.cimd += 1; else state.dcr += 1; res.status(404).json({ error: 'not_found' }); });
app.all(MCP_PATH, async (req, res, next) => { count('mcp'); const auth = String(req.headers.authorization || ''); if (!auth) return res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="${state.origin}/.well-known/oauth-protected-resource/agent-access"`).json({ error: 'missing_bearer' }); return createMcpDefaultOffGate({ getRuntime: async () => runtime })(req, res, next); });

const server = http.createServer(app); const address = await listen(server); state.origin = `http://127.0.0.1:${address.port}`;
Object.assign(process.env, { NODE_ENV: 'test', AGENT_ACCESS_LOOPBACK_FIXTURE: '1', AGENT_ACCESS_CANONICAL_ORIGIN: state.origin, AGENT_ACCESS_UI_ENABLED: '1', AGENT_ACCESS_OAUTH_ENABLED: '1', AGENT_ACCESS_OAUTH_CLIENTS_ENABLED: '1', AGENT_ACCESS_MCP_ENABLED: '1', AGENT_ACCESS_OAUTH_TRUST_PROXY: '0' });

const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'lp-aa2c2-'));
const hermesHome = path.join(scratch, 'hermes-home'); await fsp.mkdir(hermesHome, { recursive: true });
const inspectorRoot = path.join(ROOT, '.tmp', 'agent-access-aa2c2', 'inspector');
const inspectorCli = path.join(inspectorRoot, 'node_modules', '@modelcontextprotocol', 'inspector', 'cli', 'build', 'cli.js');
assert.equal(JSON.parse(await fsp.readFile(path.join(inspectorRoot, 'node_modules', '@modelcontextprotocol', 'inspector', 'package.json'), 'utf8')).version, '0.22.0');
let inspectorProcess; let browser;
try {
  const hermesRepo = process.env.AA2C2_HERMES_REPO; assert.ok(hermesRepo && fs.existsSync(path.join(hermesRepo, 'uv.lock')));
  const hermes = await run('uv', ['run', '--frozen', '--project', hermesRepo, 'python', path.join(ROOT, 'scripts', 'premium', 'agent-access-hermes-client-fixture.py'), `${state.origin}${MCP_PATH}`], { env: { ...process.env, HERMES_HOME: hermesHome, PYTHONUTF8: '1' } });
  assert.equal(hermes.code, 0, `Hermes fixture failed: ${hermes.stderr.replace(/https?:\/\/\S+/g, '[url-redacted]').slice(0, 500)}`);
  const hermesResult = JSON.parse(hermes.stdout.trim().split(/\r?\n/).at(-1)); assert.equal(hermesResult.version, '0.18.2'); assert.equal(hermesResult.tools, 5); assert.equal(hermesResult.protocol, MCP_PROTOCOL_VERSION);

  const proxyAuth = randomBytes(32).toString('hex');
  const inspectorDiscoveryBaseline = {
    compatibility: state.routes.get('prm-compatibility') || 0,
    rootFallback: state.routes.get('prm-root-fallback') || 0,
    authorizeRootFallback: state.routes.get('authorize-root-fallback') || 0,
  };
  inspectorProcess = spawn('node', [inspectorCli], { cwd: inspectorRoot, env: { ...process.env, MCP_PROXY_AUTH_TOKEN: proxyAuth, MCP_AUTO_OPEN_ENABLED: 'false', CLIENT_PORT: '6274', SERVER_PORT: '6277' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const inspectorOutput = []; inspectorProcess.stdout.on('data', (chunk) => inspectorOutput.push(chunk)); inspectorProcess.stderr.on('data', (chunk) => inspectorOutput.push(chunk));
  for (let attempt = 0; attempt < 60; attempt += 1) { try { const response = await fetch('http://localhost:6274'); if (response.ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); if (attempt === 59) throw new Error('INSPECTOR_START_TIMEOUT'); }
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
  let externalNetworkCalls = 0;
  page.on('request', (request) => { try { if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) externalNetworkCalls += 1; } catch { externalNetworkCalls += 1; } });
  await page.goto(`http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=${proxyAuth}`, { waitUntil: 'networkidle' });
  await page.getByRole('combobox').first().click(); await page.getByRole('option', { name: 'Streamable HTTP' }).click();
  await page.locator('input[placeholder="URL"]').fill(`${state.origin}${MCP_PATH}`);
  await page.getByRole('button', { name: 'Authentication' }).click();
  await page.locator('input[placeholder="Client ID"]').fill(INSPECTOR_CLIENT_ID);
  await page.locator('input[placeholder="Scope (space-separated)"]').fill(SCOPES.join(' '));
  await page.getByRole('button', { name: 'Connect' }).click();
  let inspectorToken = null;
  for (let attempt = 0; attempt < 120 && !inspectorToken; attempt += 1) {
    inspectorToken = await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) { const value = sessionStorage.getItem(key); if (!value) continue; try { const parsed = JSON.parse(value); if (parsed?.access_token) return parsed; } catch {} } return null; });
    if (!inspectorToken) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(inspectorToken?.access_token && inspectorToken?.refresh_token && !inspectorOutput.some((chunk) => chunk.toString('utf8').includes(inspectorToken.access_token)));
  assert.ok((state.routes.get('prm-compatibility') || 0) > inspectorDiscoveryBaseline.compatibility);
  assert.equal(state.routes.get('prm-root-fallback') || 0, inspectorDiscoveryBaseline.rootFallback);
  assert.equal(state.routes.get('authorize-root-fallback') || 0, inspectorDiscoveryBaseline.authorizeRootFallback);
  const inspectorStorage = await page.evaluate((accessToken) => ({
    sessionHasToken: Object.values(sessionStorage).some((value) => value?.includes(accessToken)),
    localHasToken: Object.values(localStorage).some((value) => value?.includes(accessToken)),
  }), inspectorToken.access_token);
  assert.deepEqual(inspectorStorage, { sessionHasToken: true, localHasToken: false });
  const inspectorList = await run('node', [inspectorCli, '--cli', `${state.origin}${MCP_PATH}`, '--transport', 'http', '--method', 'tools/list', '--header', `Authorization: Bearer ${inspectorToken.access_token}`], { cwd: inspectorRoot });
  assert.equal(inspectorList.code, 0, 'Inspector tools/list failed');
  assert.equal(inspectorList.stdout.includes(inspectorToken.access_token) || inspectorList.stderr.includes(inspectorToken.access_token), false);
  const listStart = inspectorList.stdout.indexOf('{'); const listEnd = inspectorList.stdout.lastIndexOf('}');
  assert.ok(listStart >= 0 && listEnd > listStart, 'Inspector tools/list JSON missing');
  const listedTools = JSON.parse(inspectorList.stdout.slice(listStart, listEnd + 1)).tools;
  assert.deepEqual(listedTools.map((tool) => tool.name).sort(), [...TOOLS].sort());
  assert.ok(listedTools.every((tool) => tool.inputSchema?.additionalProperties === false));
  for (const name of TOOLS) {
    const args = ['--cli', `${state.origin}${MCP_PATH}`, '--transport', 'http', '--method', 'tools/call', '--tool-name', name, '--header', `Authorization: Bearer ${inspectorToken.access_token}`];
    for (const [key, value] of Object.entries(TOOL_ARGS[name])) args.push('--tool-arg', `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
    const result = await run('node', [inspectorCli, ...args], { cwd: inspectorRoot }); assert.equal(result.code, 0, `Inspector tool failed: ${name}`); assert.equal(result.stdout.includes(inspectorToken.access_token) || result.stderr.includes(inspectorToken.access_token), false);
  }

  const tokenFiles = (await fsp.readdir(path.join(hermesHome, 'mcp-tokens'))).filter((name) => name.endsWith('.json'));
  assert.ok(tokenFiles.length >= 2); const modes = [];
  for (const name of tokenFiles) modes.push((await fsp.stat(path.join(hermesHome, 'mcp-tokens', name))).mode & 0o777);
  let hermesRefresh = null;
  for (const name of tokenFiles) { const value = JSON.parse(await fsp.readFile(path.join(hermesHome, 'mcp-tokens', name), 'utf8')); if (value.refresh_token) hermesRefresh = value.refresh_token; }
  assert.ok(hermesRefresh);
  let tokenStoreProtection;
  if (process.platform === 'win32') {
    const aclScript = [
      '$acl = Get-Acl -LiteralPath $env:AA2C2_ACL_TARGET',
      '$forbidden = @("S-1-1-0", "S-1-5-11", "S-1-5-32-545", "S-1-5-32-546")',
      '$bad = $acl.Access | Where-Object { if ($_.AccessControlType -ne "Allow") { return $false }; try { $sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; return $forbidden -contains $sid } catch { return $true } }',
      'if ($bad) { "NTFS_ACL_BROAD"; exit 7 }',
      '"NTFS_ACL_PROTECTED"',
    ].join('; ');
    for (const name of tokenFiles) {
      const acl = await run('powershell', ['-NoProfile', '-Command', aclScript], { env: { ...process.env, AA2C2_ACL_TARGET: path.join(hermesHome, 'mcp-tokens', name) } });
      assert.equal(acl.code, 0, `Hermes token file ACL gate failed: ${acl.stdout.trim() || 'ACL_CHECK_ERROR'}`);
    }
    tokenStoreProtection = 'NTFS_ACL_PROTECTED';
  } else {
    assert.ok(modes.every((mode) => mode === 0o600), `Hermes token file mode mismatch: ${modes.join(',')}`);
    tokenStoreProtection = 'POSIX_0600';
  }

  const hermesRefreshForm = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: hermesRefresh, client_id: HERMES_CLIENT_ID, resource: `${state.origin}${RESOURCE_PATH}` });
  let lifecycle = await fetch(`${state.origin}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: hermesRefreshForm });
  assert.equal(lifecycle.status, 200);
  const rotatedHermes = await lifecycle.json();
  lifecycle = await fetch(`${state.origin}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: hermesRefreshForm });
  assert.equal(lifecycle.status, 400);
  assert.equal(state.revoked.has(clientForId(HERMES_CLIENT_ID).connection), true);
  const mcpProbe = (accessToken) => fetch(`${state.origin}${MCP_PATH}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-protocol-version': MCP_PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: '2.0', id: 901, method: 'tools/list', params: {} }),
  });
  lifecycle = await mcpProbe(rotatedHermes.access_token); assert.equal(lifecycle.status, 401);
  lifecycle = await mcpProbe(inspectorToken.access_token); assert.equal(lifecycle.status, 200);
  const inspectorRefreshForm = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: inspectorToken.refresh_token, client_id: INSPECTOR_CLIENT_ID, resource: `${state.origin}${RESOURCE_PATH}` });
  lifecycle = await fetch(`${state.origin}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: inspectorRefreshForm });
  assert.equal(lifecycle.status, 200);
  const rotatedInspector = await lifecycle.json();
  assert.equal(typeof rotatedInspector.refresh_token, 'string');
  assert.notEqual(rotatedInspector.refresh_token, inspectorToken.refresh_token);
  lifecycle = await mcpProbe(rotatedInspector.access_token); assert.equal(lifecycle.status, 200);
  const inspectorRevokeForm = new URLSearchParams({ token: rotatedInspector.refresh_token, client_id: INSPECTOR_CLIENT_ID });
  lifecycle = await fetch(`${state.origin}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: inspectorRevokeForm });
  assert.equal(lifecycle.status, 200);
  lifecycle = await mcpProbe(inspectorToken.access_token); assert.equal(lifecycle.status, 401);
  lifecycle = await mcpProbe(rotatedInspector.access_token); assert.equal(lifecycle.status, 401);

  assert.equal(state.dcr, 0); assert.equal(state.cimd, 0); assert.equal(state.registration, 0); assert.equal(state.production, 0); assert.equal(state.provider, 0); assert.equal(externalNetworkCalls, 0);
  assert.equal(state.toolCalls.get(HERMES_CLIENT_ID), 5); assert.equal(state.toolCalls.get(INSPECTOR_CLIENT_ID) || 0, 5);
  assert.ok((state.routes.get('token') || 0) >= 3); assert.ok((state.routes.get('mcp') || 0) >= 12);
  console.log(JSON.stringify({ ok: true, status: 'TWO_CLIENT_FIXTURE_PASS', protocol: MCP_PROTOCOL_VERSION, hermes: '0.18.2', inspector: '0.22.0', tools_per_client: 5, inspector_prm_alias_discovered: true, inspector_root_authorize_fallbacks: 0, inspector_refresh_rotation: true, refresh_rotation: true, refresh_reuse_isolated: true, revoke_isolated: true, dcr_requests: 0, cimd_requests: 0, registration_requests: 0, hermes_token_store: tokenStoreProtection, inspector_token_store: 'SESSION_STORAGE_ONLY', token_store_values_logged: 0, external_network_calls: 0, production_requests: 0, provider_calls: 0, live_data_reads: 0 }));
} finally {
  await browser?.close().catch(() => {}); await stop(inspectorProcess); await close(server); await fsp.rm(scratch, { recursive: true, force: true });
}
