"use strict";

// ───────────────────────────────────────────────────────────────────────────
// Ingest smoke — Studio Ingest W1 (STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25).
//
// Deterministic, offline validation matrix for POST /api/ingest/fetch-url
// (Task 4 — S1). Every case below uses a literal IP or a syntactic reject, so
// no DNS lookup or network call happens: safe for CI, no flakiness.
//
// (Task 6 will add extract-file cases here, Task 7 a direction case.)
// ───────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(REPO_ROOT, "data", "app.db");
const PORT = Number(process.env.INGEST_SMOKE_PORT || 3108);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FETCH_URL = `${BASE_URL}/api/ingest/fetch-url`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) return;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error(`Server did not become healthy within ${timeoutMs} ms`);
}

async function readBody(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  return { text, data };
}

function startServer(dbPath, port, dataDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(port),
      DATA_DIR: dataDir,
      MINI_APP_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  const pushLog = (prefix) => (chunk) => {
    const text = String(chunk || "").trim();
    if (!text) return;
    logs.push(`${prefix}${text}`);
    if (logs.length > 50) logs.shift();
  };

  child.stdout.on("data", pushLog("[stdout] "));
  child.stderr.on("data", pushLog("[stderr] "));

  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;

  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

  if (exited) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

async function postFetchUrl(body) {
  const res = await fetch(FETCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { data, text } = await readBody(res);
  return { status: res.status, data, text };
}

async function expectCase(label, body, expectedStatus, expectedCode) {
  const { status, data, text } = await postFetchUrl(body);
  if (status !== expectedStatus || !data || data.ok !== false || data.error_code !== expectedCode) {
    console.log(`FAIL ${label} -> expected ${expectedStatus} ${expectedCode}, got ${status}: ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`PASS ${label} -> ${expectedStatus} ${expectedCode}`);
  return true;
}

async function run() {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-ingestsmoke-"));
  const { child, logs } = startServer(DB_PATH, PORT, tmpDataDir);
  let allPassed = true;

  try {
    await waitForHealth(BASE_URL);
    console.log(`PASS /healthz -> server booted on ${BASE_URL}`);

    const cases = [
      ["1. {} -> 400 BAD_URL", {}, 400, "BAD_URL"],
      ["2. file:///etc/passwd -> 400 BAD_SCHEME", { url: "file:///etc/passwd" }, 400, "BAD_SCHEME"],
      ["3. http://127.0.0.1/ -> 400 PRIVATE_ADDR", { url: "http://127.0.0.1/" }, 400, "PRIVATE_ADDR"],
      ["4. http://10.0.0.1/ -> 400 PRIVATE_ADDR", { url: "http://10.0.0.1/" }, 400, "PRIVATE_ADDR"],
      ["5. http://[::1]/ -> 400 PRIVATE_ADDR", { url: "http://[::1]/" }, 400, "PRIVATE_ADDR"],
      ["6. http://localhost/ -> 400 PRIVATE_ADDR", { url: "http://localhost/" }, 400, "PRIVATE_ADDR"],
      ["7. http://example.com:8080/ -> 400 BAD_PORT", { url: "http://example.com:8080/" }, 400, "BAD_PORT"],
    ];

    for (const [label, body, expectedStatus, expectedCode] of cases) {
      const ok = await expectCase(label, body, expectedStatus, expectedCode);
      allPassed = allPassed && ok;
    }

    if (!allPassed) {
      throw new Error("One or more ingest smoke checks FAILED (see log above)");
    }

    console.log("Ingest smoke: OK");
  } catch (error) {
    const tail = logs.length ? `\nServer log tail:\n${logs.join("\n")}` : "";
    throw new Error(`${error.message}${tail}`);
  } finally {
    await stopServer(child);
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((error) => {
  console.error(`Ingest smoke FAILED: ${error.message}`);
  process.exitCode = 1;
});
