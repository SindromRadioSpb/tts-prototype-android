#!/usr/bin/env node
// scripts/docs-route-smoke.js — P0-3 regression.
//
// The footer "Приватность" / "Документация" links 404'd raw because
// express.static only serves public/. We now serve a STRICT WHITELIST of
// the two user docs from repo-root docs/. This smoke pins:
//   1. /docs/PRIVACY.md         → 200, HTML, non-empty
//   2. /docs/OPFS_USER_GUIDE.md → 200, HTML
//   3. /docs/SMOKE-CHECK.md     → 404 (NOT whitelisted — no internal leak)
//   4. /docs/../server.js       → 404 (no path traversal)
//   5. /docs/PRIVACY.js         → 404 (whitelist is exact, not by ext)

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.DOCS_SMOKE_PORT || 3219);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const tmr = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tmr); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; }
    catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[docs-route-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child);
    process.exit(1);
  }
  console.log("[docs-route-smoke] server up");

  try {
    const privacy = await fetch(`${BASE}/docs/PRIVACY.md`);
    const privacyBody = await privacy.text();
    test("GET /docs/PRIVACY.md → 200", privacy.status === 200, `status ${privacy.status}`);
    test("PRIVACY.md is HTML", (privacy.headers.get("content-type") || "").includes("html"));
    test("PRIVACY.md non-empty", privacyBody.length > 200, `len ${privacyBody.length}`);
    test("PRIVACY.md has no raw 'Cannot GET'", !/Cannot GET/i.test(privacyBody));

    const guide = await fetch(`${BASE}/docs/OPFS_USER_GUIDE.md`);
    test("GET /docs/OPFS_USER_GUIDE.md → 200", guide.status === 200, `status ${guide.status}`);

    const internal = await fetch(`${BASE}/docs/SMOKE-CHECK.md`);
    test("GET /docs/SMOKE-CHECK.md → 404 (not whitelisted)", internal.status === 404, `status ${internal.status}`);

    const trav = await fetch(`${BASE}/docs/..%2Fserver.js`);
    test("path-traversal /docs/..%2Fserver.js → not 200", trav.status !== 200, `status ${trav.status}`);

    const wrongExt = await fetch(`${BASE}/docs/PRIVACY.js`);
    test("GET /docs/PRIVACY.js → 404 (exact whitelist)", wrongExt.status === 404, `status ${wrongExt.status}`);
  } finally {
    await stopServer(srv.child);
  }

  console.log(`\n[docs-route-smoke] ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
