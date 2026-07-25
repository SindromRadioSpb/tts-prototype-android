"use strict";

// ───────────────────────────────────────────────────────────────────────────
// Ingest smoke — Studio Ingest W1 (STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25).
//
// Deterministic, offline validation matrix for POST /api/ingest/fetch-url
// (Task 4 — S1, checks 1-7) and POST /api/ingest/extract-file (Task 6 — S2+S8,
// checks 8-13). Every case uses a literal IP/syntactic reject or the local
// docx fixture: no DNS lookup, network call, or LLM call happens anywhere in
// this file — safe for CI, no flakiness.
//
// (Task 7 will add a direction case.)
// ───────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.INGEST_SMOKE_PORT || 3108);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FETCH_URL = `${BASE_URL}/api/ingest/fetch-url`;
const EXTRACT_FILE_URL = `${BASE_URL}/api/ingest/extract-file`;
const SAMPLE_DOCX_PATH = path.join(REPO_ROOT, "scripts", "premium", "fixtures", "ingest", "sample-he.docx");

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

// extract-file shares its rate limiter INSTANCE with fetch-url (same "ingest"
// bucket, max 10/60s — see ingest/routes.js). Checks 1-7 already spend most of
// that per-IP budget, and checks 8-13 are validating request-shape logic, not
// rate limiting — so give them their own simulated client IP via X-Forwarded-For
// (server.js sets `trust proxy`, so Express honours it) to keep the two check
// groups independent. Still fully local/offline: no real network hop.
const EXTRACT_TEST_IP = "203.0.113.50"; // TEST-NET-3 (RFC 5737), non-routable
async function postExtractFile(body) {
  const res = await fetch(EXTRACT_FILE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": EXTRACT_TEST_IP },
    body: JSON.stringify(body),
  });
  const { data, text } = await readBody(res);
  return { status: res.status, data, text };
}

async function expectExtractCase(label, body, expectedStatus, expectedCode) {
  const { status, data, text } = await postExtractFile(body);
  if (status !== expectedStatus || !data || data.ok !== false || data.error_code !== expectedCode) {
    console.log(`FAIL ${label} -> expected ${expectedStatus} ${expectedCode}, got ${status}: ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`PASS ${label} -> ${expectedStatus} ${expectedCode}`);
  return true;
}

// Check 12 — the only e2e-positive case: fully offline (docx branch has no LLM).
async function checkExtractDocxSuccess(label) {
  const dataBase64 = fs.readFileSync(SAMPLE_DOCX_PATH).toString("base64");
  const { status, data, text } = await postExtractFile({ kind: "docx", dataBase64 });
  const shapeOk = status === 200 && data && data.ok === true && typeof data.text === "string"
    && data.text.includes("שלום עולם") && data.method === "docx-xml" && data.model === null && data.fromCache === false;
  if (!shapeOk) {
    console.log(`FAIL ${label} -> expected 200 ok:true text~"שלום עולם" method:docx-xml model:null, got ${status}: ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`PASS ${label} -> 200 text contains "שלום עולם", method docx-xml, model null, fromCache false`);
  return true;
}

async function run() {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-ingestsmoke-"));
  // Hermetic by default: a fresh SQLite file inside the SAME per-run temp dir
  // as DATA_DIR. Never fall back to the real project DB (data/app.db) — the
  // server auto-creates the dir/file and runs migrations on boot (db/sqlite.js
  // initDb -> ensureDirForFile + PRAGMA/migrate), so no template copy is
  // needed. process.env.DB_PATH still wins if explicitly set.
  const dbPath = process.env.DB_PATH || path.join(tmpDataDir, "smoke-app.db");
  const { child, logs } = startServer(dbPath, PORT, tmpDataDir);
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

    const extractCasesBefore12 = [
      ["8. {kind:\"weird\", dataBase64:\"AA==\"} -> 400 BAD_KIND", { kind: "weird", dataBase64: "AA==" }, 400, "BAD_KIND"],
      ["9. {kind:\"pdf\", mimeType:\"application/pdf\", dataBase64:\"AA==\"} (no key) -> 401 GEMINI_KEY_REQUIRED",
        { kind: "pdf", mimeType: "application/pdf", dataBase64: "AA==" }, 401, "GEMINI_KEY_REQUIRED"],
      ["10. {kind:\"pdf\", mimeType:\"text/plain\", dataBase64:\"AA==\", geminiApiKey:\"AIza...\"} -> 400 BAD_MIME",
        { kind: "pdf", mimeType: "text/plain", dataBase64: "AA==", geminiApiKey: "AIza" + "x".repeat(30) }, 400, "BAD_MIME"],
      ["11. {kind:\"image\", dataBase64: \"A\".repeat(8_400_001)} -> 400 FILE_TOO_LARGE",
        { kind: "image", dataBase64: "A".repeat(8_400_001) }, 400, "FILE_TOO_LARGE"],
    ];
    for (const [label, body, expectedStatus, expectedCode] of extractCasesBefore12) {
      const ok = await expectExtractCase(label, body, expectedStatus, expectedCode);
      allPassed = allPassed && ok;
    }

    {
      const ok = await checkExtractDocxSuccess(
        "12. {kind:\"docx\", dataBase64: base64(fixture sample-he.docx)} -> 200 docx-xml"
      );
      allPassed = allPassed && ok;
    }

    {
      const ok = await expectExtractCase(
        "13. {kind:\"docx\", dataBase64: base64(\"garbage\")} -> 400 BAD_DOCX",
        { kind: "docx", dataBase64: Buffer.from("garbage").toString("base64") },
        400,
        "BAD_DOCX"
      );
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
