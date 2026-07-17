#!/usr/bin/env node
"use strict";

// AA2-CP1 smoke — runtime control plane.
// Covers the adversarial-critique cases: resolver precedence (emergency >
// env-pin > plane-off > journal TTL), fail-closed on DB error / rejection /
// malformed expiry, literal "0"/"1" output, gate integration with env "0" +
// journal "1" (request must clear the boundary and reach the bearer
// challenge), memo-heal (a failed runtime build retries without restart),
// control-plane guards (step-up, env-pin 409, REVOKED terminal, TTL bounds),
// in-transaction client-status journaling, and restore fail-closed.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";

const { initDb, closeDb } = require("../../db/sqlite");
const { runMigrations, getMigrationsHealth } = require("../../db/migrate");
const controlRepo = require("../../db/agentAccessControlRepo");
const oauthRepo = require("../../db/agentAccessOAuthRepo");
const { createRuntimeFlagResolver, journalGrantsOn } = require("../../agent/access/runtimeControl");
const { createControlPlane } = require("../../agent/access/controlPlane");
const { createMcpDefaultOffGate } = require("../../agent/access/mcpAdapter");
const { agentAccessControlFailClosed } = require("../../db/restoreErasureReplay");

let checks = 0;
function ok(cond, label) { assert.ok(cond, label); checks += 1; }
function eq(a, b, label) { assert.deepStrictEqual(a, b, label); checks += 1; }
async function expectCode(promise, code) {
  await Promise.resolve(promise).then(
    () => assert.fail(`expected ${code}`),
    (err) => assert.strictEqual(err.code || err.message, code),
  );
  checks += 1;
}

function makeRes() {
  const res = { statusCode: 0, headers: {}, body: null, done: false };
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; };
  res.getHeader = (k) => res.headers[String(k).toLowerCase()];
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => { res.body = JSON.stringify(value); res.done = true; return res; };
  res.writeHead = (status, headers) => { res.statusCode = status; Object.assign(res.headers, Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]))); return res; };
  res.end = (chunk) => { res.body = chunk === undefined ? res.body : String(chunk); res.done = true; return res; };
  return res;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-cp1-"));
  const dbPath = path.join(dir, "app.db");
  await initDb(dbPath);
  await runMigrations({ migrationsDir: path.join(__dirname, "..", "..", "migrations") });
  ok(getMigrationsHealth().ok === true, "migrations apply cleanly incl. 043");

  const T0 = Date.parse("2026-07-18T12:00:00.000Z");
  let nowMs = T0;
  const now = () => nowMs;

  // ---- 1. journalGrantsOn semantics -------------------------------------
  eq(journalGrantsOn(null, T0).on, false, "no row => off");
  eq(journalGrantsOn({ value: "1", expires_at: null }, T0), { on: true, source: "db_permanent", expires_at: null }, "null expiry => permanent");
  eq(journalGrantsOn({ value: "1", expires_at: "" }, T0).on, false, "empty-string expiry fails CLOSED, never permanent");
  eq(journalGrantsOn({ value: "1", expires_at: "not-a-date" }, T0).on, false, "unparseable expiry fails closed");
  eq(journalGrantsOn({ value: "1", expires_at: new Date(T0 + 60_000).toISOString() }, T0).on, true, "future TTL on");
  eq(journalGrantsOn({ value: "1", expires_at: new Date(T0 - 1).toISOString() }, T0).on, false, "past TTL off");
  eq(journalGrantsOn({ value: "0", expires_at: null }, T0).on, false, "value 0 off");

  // ---- 2. resolver precedence + fail-closed -----------------------------
  const mkEnv = (over = {}) => ({ AGENT_ACCESS_UI_ENABLED: "1", AGENT_ACCESS_OAUTH_ENABLED: "1", ...over });
  const journal = { clients: null, mcp: null };
  let journalReads = 0;
  let journalThrow = null;
  const readLatest = async () => { journalReads += 1; if (journalThrow) throw journalThrow; return { ...journal }; };

  let env = mkEnv({ AGENT_ACCESS_RUNTIME_FLAGS_ENABLED: "1" });
  let resolver = createRuntimeFlagResolver({ readLatest, env, now, cacheMs: 2000 });
  let flags = await resolver.resolve();
  eq({ ui: flags.ui, oauth: flags.oauth, clients: flags.clients, mcp: flags.mcp }, { ui: "1", oauth: "1", clients: "0", mcp: "0" }, "empty journal => off, literal strings");
  ok(Object.values(flags).every((v) => v === "0" || v === "1"), "resolver emits ONLY literal 0/1 strings");

  journal.clients = { value: "1", expires_at: new Date(T0 + 600_000).toISOString() };
  journal.mcp = { value: "1", expires_at: new Date(T0 + 600_000).toISOString() };
  resolver.invalidate();
  flags = await resolver.resolve();
  eq([flags.clients, flags.mcp], ["1", "1"], "journal window opens both flags");

  nowMs = T0 + 601_000;
  resolver.invalidate();
  flags = await resolver.resolve();
  eq([flags.clients, flags.mcp], ["0", "0"], "TTL expiry auto-closes with no write");
  nowMs = T0;

  env.AGENT_ACCESS_EMERGENCY_OFF = "1";
  resolver.invalidate();
  flags = await resolver.resolve();
  eq([flags.clients, flags.mcp], ["0", "0"], "emergency kill beats an open journal window");
  delete env.AGENT_ACCESS_EMERGENCY_OFF;

  env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED = "1";
  journal.clients = { value: "0", expires_at: null };
  resolver.invalidate();
  flags = await resolver.resolve(true);
  eq(flags.clients, "1", "env pin 1 beats journal 0");
  eq(flags.detail.clients.env_pinned, true, "env pin surfaced for the UI");
  delete env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED;

  // plane off => DB never touched
  const reads0 = journalReads;
  env = mkEnv();
  resolver = createRuntimeFlagResolver({ readLatest, env, now, cacheMs: 2000 });
  flags = await resolver.resolve();
  eq([flags.clients, flags.mcp], ["0", "0"], "plane disabled => off");
  eq(journalReads, reads0, "plane disabled => zero DB reads");

  // DB error => fail closed, and the error itself is cached for the TTL
  env = mkEnv({ AGENT_ACCESS_RUNTIME_FLAGS_ENABLED: "1" });
  resolver = createRuntimeFlagResolver({ readLatest, env, now, cacheMs: 2000 });
  journalThrow = new Error("boom");
  const reads1 = journalReads;
  flags = await resolver.resolve(true);
  eq([flags.clients, flags.mcp], ["0", "0"], "DB error fails closed");
  eq(flags.detail.clients.source, "error", "error source is distinguishable from honest off");
  await resolver.resolve();
  eq(journalReads, reads1 + 1, "error result is cached (no probe-storm)");
  journalThrow = null;

  // ---- 3. MCP gate integration: env 0 + journal 1 reaches bearer challenge
  journal.clients = { value: "1", expires_at: null };
  journal.mcp = { value: "1", expires_at: null };
  resolver.invalidate();
  env.AGENT_ACCESS_LOOPBACK_FIXTURE = "1";
  env.AGENT_ACCESS_CANONICAL_ORIGIN = "http://127.0.0.1:8080";
  process.env.AGENT_ACCESS_LOOPBACK_FIXTURE = "1";
  process.env.AGENT_ACCESS_CANONICAL_ORIGIN = "http://127.0.0.1:8080";
  const gate = createMcpDefaultOffGate({
    getRuntime: async (snapshot) => {
      ok(snapshot && snapshot.mcp === "1", "gate passes the SAME resolved snapshot to getRuntime");
      return null; // 503 path is fine: we only need to get past the flag+boundary checks
    },
    resolveFlags: () => resolver.resolve(),
  });
  const req = {
    method: "POST",
    originalUrl: "/agent-access/mcp",
    url: "/agent-access/mcp",
    headers: { host: "127.0.0.1:8080", accept: "application/json, text/event-stream", "content-type": "application/json" },
    socket: { encrypted: false, remoteAddress: "127.0.0.1" },
  };
  let res = makeRes();
  await gate(req, res);
  eq(res.statusCode, 503, "env-0 + journal-1 request clears flag gate AND boundary (503 = null runtime, NOT 404 disabled)");
  ok(String(res.body).includes("AA_MCP_RUNTIME_NOT_CONFIGURED"), "reached runtime stage");

  // resolver returning off => 404 before anything else
  journal.mcp = { value: "0", expires_at: null };
  resolver.invalidate();
  res = makeRes();
  await gate(req, res);
  eq(res.statusCode, 404, "journal 0 => 404 disabled");

  // rejecting resolver must fail closed as 404, never throw out of the gate
  const rejectingGate = createMcpDefaultOffGate({ getRuntime: async () => null, resolveFlags: async () => { throw new Error("resolver-crash"); } });
  res = makeRes();
  await rejectingGate(req, res);
  eq(res.statusCode, 404, "rejecting resolver fails closed (no process crash)");

  // default (no resolver): per-request env reads — flips take effect instantly
  const envGate = createMcpDefaultOffGate({ getRuntime: async () => null });
  delete process.env.AGENT_ACCESS_MCP_ENABLED;
  res = makeRes();
  await envGate(req, res);
  eq(res.statusCode, 404, "default gate: env off => 404");
  process.env.AGENT_ACCESS_MCP_ENABLED = "1";
  process.env.AGENT_ACCESS_UI_ENABLED = "1";
  process.env.AGENT_ACCESS_OAUTH_ENABLED = "1";
  process.env.AGENT_ACCESS_OAUTH_CLIENTS_ENABLED = "1";
  res = makeRes();
  await envGate(req, res);
  eq(res.statusCode, 503, "default gate: env flip observed on the very next request (no cache)");
  for (const name of ["AGENT_ACCESS_MCP_ENABLED", "AGENT_ACCESS_UI_ENABLED", "AGENT_ACCESS_OAUTH_ENABLED", "AGENT_ACCESS_OAUTH_CLIENTS_ENABLED"]) delete process.env[name];

  // ---- 4. memo-heal behavior (simulated): a getRuntime that throws once
  let attempts = 0;
  let memo = null;
  const getRuntimeHealing = () => {
    if (!memo) {
      memo = (async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("first-build-fails");
        return null;
      })().catch((err) => { memo = null; throw err; });
    }
    return memo;
  };
  journal.mcp = { value: "1", expires_at: null };
  resolver.invalidate();
  const healGate = createMcpDefaultOffGate({ getRuntime: getRuntimeHealing, resolveFlags: () => resolver.resolve() });
  res = makeRes();
  await healGate(req, res);
  eq(res.statusCode, 503, "first build failure => 503");
  res = makeRes();
  await healGate(req, res);
  eq(attempts, 2, "second request RETRIES the build (rejection not memoized)");
  for (const name of ["AGENT_ACCESS_LOOPBACK_FIXTURE", "AGENT_ACCESS_CANONICAL_ORIGIN"]) delete process.env[name];

  // ---- 5. journal repo validation ---------------------------------------
  await expectCode(controlRepo.appendEvent({ actor_user_id: "u1", action: "FLAG_SET", subject: "clients", value: "1", expires_at: "2026-07-18T13:00:00+03:00", reason: "x" }), "AA_CP_EVENT_BAD_EXPIRY");
  await expectCode(controlRepo.appendEvent({ actor_user_id: "u1", action: "FLAG_SET", subject: "clients", value: "1", expires_at: "", reason: "x" }), "AA_CP_EVENT_BAD_EXPIRY");
  await expectCode(controlRepo.appendEvent({ actor_user_id: "u1", action: "NOPE", subject: "clients", value: "1", expires_at: null, reason: "x" }), "AA_CP_EVENT_BAD_ACTION");
  await controlRepo.appendEvent({ actor_user_id: "u1", action: "FLAG_SET", subject: "clients", value: "1", expires_at: "2026-07-18T13:00:00.000Z", reason: "smoke" });
  const states = await controlRepo.latestFlagStates();
  eq(states.clients.value, "1", "latestFlagStates reads back");
  eq(states.mcp, null, "untouched subject null");

  // ---- 6. control plane guards ------------------------------------------
  const SECRET = "0123456789abcdefghijklmn";
  const cpEnv = { AGENT_ACCESS_RUNTIME_FLAGS_ENABLED: "1", AUTH_BOOTSTRAP_SECRET: SECRET };
  const dbResolver = createRuntimeFlagResolver({ readLatest: controlRepo.latestFlagStates, env: cpEnv, now, cacheMs: 0 });
  const plane = createControlPlane({ controlRepo, oauthRepo, resolver: dbResolver, env: cpEnv, now });

  await expectCode(plane.transition("owner", { type: "flag_set", flag: "mcp", value: "1", ttl_minutes: 60, reason: "no step-up" }), "AA_CP_STEP_UP_REQUIRED");
  await expectCode(plane.transition("owner", { type: "flag_set", flag: "mcp", value: "1", ttl_minutes: 3, reason: "bad ttl", step_up_secret: SECRET }), "AA_CP_BAD_TTL");
  await expectCode(plane.transition("owner", { type: "flag_set", flag: "mcp", value: "1", ttl_minutes: 2000, reason: "bad ttl", step_up_secret: SECRET }), "AA_CP_BAD_TTL");
  const opened = await plane.transition("owner", { type: "flag_set", flag: "mcp", value: "1", ttl_minutes: 60, reason: "open", step_up_secret: SECRET });
  ok(opened.ok === true && opened.applied.expires_at !== null, "TTL open works with step-up");
  const closed = await plane.transition("owner", { type: "flag_set", flag: "mcp", value: "0", reason: "close" });
  ok(closed.ok === true, "close needs NO step-up (fail-safe direction)");

  cpEnv.AGENT_ACCESS_MCP_ENABLED = "1";
  await expectCode(plane.transition("owner", { type: "flag_set", flag: "mcp", value: "0", reason: "pinned" }), "AA_CP_FLAG_ENV_PINNED");
  await expectCode(plane.transition("owner", { type: "window_close", reason: "pinned close" }), "AA_CP_FLAG_ENV_PINNED");
  delete cpEnv.AGENT_ACCESS_MCP_ENABLED;

  cpEnv.AGENT_ACCESS_RUNTIME_FLAGS_ENABLED = "0";
  await expectCode(plane.transition("owner", { type: "window_close", reason: "disabled" }), "AA_CP_DISABLED");
  cpEnv.AGENT_ACCESS_RUNTIME_FLAGS_ENABLED = "1";

  // clients: fixture -> suspend (in-txn journal) -> reactivate -> revoke terminal
  await oauthRepo.registerClientFixture({
    oauth_client_id: "cp-smoke-client", display_name: "CP Smoke", software_id: "cp-smoke", software_version: "1.0",
    redirect_uris: ["http://127.0.0.1:8765/callback"], registration_version: "v1",
  });
  const suspended = await plane.transition("owner", { type: "client_status_set", client_id: "cp-smoke-client", status: "SUSPENDED", reason: "smoke suspend" });
  eq(suspended.applied.status, "SUSPENDED", "runtime suspend works without step-up");
  const clientEvents = (await controlRepo.listRecentEvents(10)).filter((e) => e.subject === "cp-smoke-client");
  eq(clientEvents.length, 1, "client status change journaled IN the same transaction");
  await expectCode(plane.transition("owner", { type: "client_status_set", client_id: "cp-smoke-client", status: "ACTIVE", reason: "no stepup" }), "AA_CP_STEP_UP_REQUIRED");
  const reactivated = await plane.transition("owner", { type: "client_status_set", client_id: "cp-smoke-client", status: "ACTIVE", reason: "reopen", step_up_secret: SECRET });
  eq(reactivated.applied.status, "ACTIVE", "reactivate with step-up");
  await oauthRepo.setClientStatus("cp-smoke-client", "REVOKED");
  await expectCode(plane.transition("owner", { type: "client_status_set", client_id: "cp-smoke-client", status: "ACTIVE", reason: "resurrect", step_up_secret: SECRET }), "AA_CP_CLIENT_REVOKED_TERMINAL");

  // window presets: open (flags-only close preserves credentials)
  const win = await plane.transition("owner", { type: "window_open", ttl_minutes: 30, client_ids: [], reason: "test window", step_up_secret: SECRET });
  ok(win.ok === true && win.steps.every((s) => s.ok), "window_open all steps ok");
  const winClose = await plane.transition("owner", { type: "window_close", reason: "test close" });
  ok(winClose.ok === true, "window_close ok");
  const closeEvents = (await controlRepo.listRecentEvents(4)).filter((e) => e.action === "WINDOW_CLOSE");
  eq(closeEvents.length, 2, "close touches exactly the two flags — never client status");

  const stateView = await plane.state();
  ok(stateView.ok === true && stateView.control_plane_enabled === true && Array.isArray(stateView.events), "state endpoint payload");

  // ---- 7. restore fail-closed -------------------------------------------
  await plane.transition("owner", { type: "window_open", ttl_minutes: 30, client_ids: [], reason: "pre-restore window", step_up_secret: SECRET });
  // agentAccessControlFailClosed opens its own connection (WAL allows both).
  const restored = await agentAccessControlFailClosed(dbPath);
  ok(restored.ok === true && restored.flags_closed === 2, "restore appends fail-closed flag rows");
  const postRestore = await controlRepo.latestFlagStates();
  eq([postRestore.clients.value, postRestore.mcp.value], ["0", "0"], "post-restore journal reads CLOSED");
  eq(postRestore.clients.action, "RESTORE_FAIL_CLOSED", "restore rows are attributable");

  await closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, checks, external_network_calls: 0, provider_calls: 0 }));
}

main().catch((err) => { console.error(err); process.exit(1); });
