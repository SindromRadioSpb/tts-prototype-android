#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function start(port, dataDir, enabled) {
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      AUTH_BOOTSTRAP_SECRET: "agent-access-boundary-smoke-secret-012345",
      AGENT_ACCESS_UI_ENABLED: enabled ? "1" : "0",
      AGENT_ACCESS_CANONICAL_ORIGIN: origin,
      AGENT_ACCESS_LOOPBACK_FIXTURE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (value) => logs.push(String(value)));
  child.stderr.on("data", (value) => logs.push(String(value)));
  return { child, logs, origin };
}
async function stop(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
  if (!exited && process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(origin, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(`${origin}/healthz`);
      const body = await response.json();
      if (response.status === 200 && body.db && body.db.ready && body.migrations && body.migrations.ready) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

(async () => {
  const dirs = [
    fs.mkdtempSync(path.join(os.tmpdir(), "lp-agent-boundary-off-")),
    fs.mkdtempSync(path.join(os.tmpdir(), "lp-agent-boundary-on-")),
  ];
  let current;
  let checks = 0;
  try {
    current = start(3347, dirs[0], false);
    assert.ok(await ready(current.origin), current.logs.join(""));
    assert.strictEqual((await fetch(`${current.origin}/agent-access.html`)).status, 404);
    assert.strictEqual((await fetch(`${current.origin}/api/agent-access/connections`)).status, 404);
    const mcpOff = await fetch(`${current.origin}/agent-access/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{invalid-json-that-must-not-be-parsed",
    });
    assert.strictEqual(mcpOff.status, 404);
    assert.deepStrictEqual(await mcpOff.json(), { error: "AGENT_ACCESS_MCP_DISABLED" });
    checks++;
    await stop(current.child); current = null;

    current = start(3348, dirs[1], true);
    assert.ok(await ready(current.origin), current.logs.join(""));
    const page = await fetch(`${current.origin}/agent-access.html`);
    assert.strictEqual(page.status, 200);
    assert.match(page.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.strictEqual(page.headers.get("x-frame-options"), "DENY");
    assert.match(page.headers.get("cache-control") || "", /no-store/);
    checks++;

    const unauthenticated = await fetch(`${current.origin}/api/agent-access/connections`);
    assert.strictEqual(unauthenticated.status, 401);
    const wrongOrigin = await fetch(`${current.origin}/api/agent-access/consent/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: "{}",
    });
    assert.strictEqual(wrongOrigin.status, 403);
    const preflight = await fetch(`${current.origin}/api/agent-access/connections`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "GET" },
    });
    assert.strictEqual(preflight.status, 403);
    assert.strictEqual(preflight.headers.get("access-control-allow-origin"), null);
    checks++;

    console.log(JSON.stringify({ ok: true, checks, default_off: true, strict_csp: true, unauthenticated_denied: true, cross_origin_denied: true, cors_preflight_denied: true }));
  } finally {
    if (current) await stop(current.child);
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
