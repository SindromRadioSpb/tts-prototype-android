"use strict";

// ───────────────────────────────────────────────────────────────────────────
// API smoke — Phase 6 aware.
//
// After the localMode default-on flip (2026-05-08, OPFS migration) every
// stateful API that touched the server's SQLite DB was permanently removed:
// library, SRS, progress, history, search, nav/resolve — all now run
// client-side from OPFS and the server returns 410 GONE_PHASE6 for them.
//
// This smoke therefore checks two things the server IS still responsible for:
//   1. Liveness: /healthz boots and the last-mile data-recovery export works.
//   2. A Phase-6 tripwire: the removed stateful endpoints MUST keep returning
//      410 GONE_PHASE6. If one ever 200s again, a stateful route was
//      resurrected by accident — fail loudly.
//
// It deliberately does NOT exercise TTS / transliterate / Gemini paths: those
// need GCP/Gemini keys and would make the smoke non-deterministic in CI.
// ───────────────────────────────────────────────────────────────────────────

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(REPO_ROOT, "data", "app.db");
const PORT = Number(process.env.API_SMOKE_PORT || 3107);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Representative sample of the stateful endpoints removed in Phase 6. Each must
// answer 410 with { ok:false, error:"GONE_PHASE6" } via the gone410 middleware.
const GONE_ENDPOINTS = [
  "/api/nav/resolve?type=sentence&id=00000000-0000-0000-0000-000000000000",
  "/api/library/texts/00000000-0000-0000-0000-000000000000",
  "/api/notes/search?q=x&limit=10",
  "/api/sentences/search?q=x&limit=10",
  "/api/srs/templates",
  "/api/srs/today?limit=10",
];

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

function startServer(dbPath, port) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(port),
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

async function run() {
  const { child, logs } = startServer(DB_PATH, PORT);

  try {
    await waitForHealth(BASE_URL);
    console.log(`PASS /healthz -> server booted on ${BASE_URL}`);

    // 1. Phase-6 tripwire: removed stateful endpoints must stay 410 GONE_PHASE6.
    for (const ep of GONE_ENDPOINTS) {
      const res = await fetch(`${BASE_URL}${ep}`);
      const { data, text } = await readBody(res);
      if (res.status !== 410) {
        throw new Error(
          `Phase-6 endpoint resurrected: ${ep} answered ${res.status} (expected 410). Body: ${text}`
        );
      }
      if (!data || data.error !== "GONE_PHASE6") {
        throw new Error(`Unexpected 410 body for ${ep}: ${text}`);
      }
    }
    console.log(`PASS Phase-6 tripwire -> ${GONE_ENDPOINTS.length} removed endpoints still 410 GONE_PHASE6`);

    // 2. Liveness of the kept last-mile data-recovery export.
    const exportRes = await fetch(`${BASE_URL}/api/library/export`);
    const { data: exportData, text: exportText } = await readBody(exportRes);
    if (!exportRes.ok) {
      throw new Error(`/api/library/export failed ${exportRes.status}: ${exportText.slice(0, 300)}`);
    }
    if (!exportData || exportData.exportType !== "linguist-pro-library" || !Array.isArray(exportData.texts)) {
      throw new Error(`Unexpected /api/library/export payload: ${exportText.slice(0, 300)}`);
    }
    console.log("PASS /api/library/export -> data-recovery export still served");

    console.log("API smoke: OK");
  } catch (error) {
    const tail = logs.length ? `\nServer log tail:\n${logs.join("\n")}` : "";
    throw new Error(`${error.message}${tail}`);
  } finally {
    await stopServer(child);
  }
}

run().catch((error) => {
  console.error(`API smoke FAILED: ${error.message}`);
  process.exitCode = 1;
});
