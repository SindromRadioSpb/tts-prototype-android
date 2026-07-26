"use strict";

// ───────────────────────────────────────────────────────────────────────────
// Ingest smoke — Studio Ingest W1 (STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25)
// + W2-S4 (STUDIO_INGEST_W2_S4_IMPLEMENTATION_PLAN_2026_07_26, Task 6).
//
// Deterministic, offline validation matrix for POST /api/ingest/fetch-url
// (Task 4 — S1, checks 1-7), POST /api/ingest/extract-file (Task 6 — S2+S8,
// checks 8-14; 14 added in fix round 1 to cover the cache-hit response shape),
// POST /api/translate-table (Task 7 — S3, check 15: direction validation),
// and the same route's segments[] mode (W2-S4 Task 6, checks 16-18: BAD_SEGMENTS
// on non-he-ru direction, BAD_SEGMENTS on malformed segments, and the no-key
// GEMINI_KEY_REQUIRED path with valid segments).
// Every case uses a literal IP/syntactic reject, the local docx fixture, a
// synthetic cache file written directly into the smoke server's geminiCacheDir,
// or a request that 400s/401s before any Gemini call is reached: no DNS lookup,
// network call, or LLM call happens anywhere in this file — safe for CI, no
// flakiness.
// ───────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.INGEST_SMOKE_PORT || 3108);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FETCH_URL = `${BASE_URL}/api/ingest/fetch-url`;
const EXTRACT_FILE_URL = `${BASE_URL}/api/ingest/extract-file`;
const TRANSLATE_TABLE_URL = `${BASE_URL}/api/translate-table`;
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

// /api/translate-table is a separate route with no rate limiter attached
// (unlike fetch-url/extract-file, which share the "ingest" bucket) — plain
// 127.0.0.1 is fine, no X-Forwarded-For isolation needed for check 15.
async function postTranslateTable(body) {
  const res = await fetch(TRANSLATE_TABLE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { data, text } = await readBody(res);
  return { status: res.status, data, text };
}

// Unlike the ingest endpoints, /api/translate-table error responses have no
// `ok` field — just `error`/`error_code` (see GEMINI_KEY_REQUIRED/
// GEMINI_KEY_INVALID on this same route) — so this checks error_code only.
async function expectTranslateTableCase(label, body, expectedStatus, expectedCode) {
  const { status, data, text } = await postTranslateTable(body);
  if (status !== expectedStatus || !data || data.error_code !== expectedCode) {
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

// Check 14 — cache-hit response shape (fix round 1, Important finding). The route
// spreads the on-disk cache object into the response on a cache hit; the cache file
// also carries a `createdAt` bookkeeping field that must NEVER leak into the HTTP
// response (the brief's response shape is the fixed 7 keys below). This check writes
// a synthetic cache entry DIRECTLY into the smoke server's geminiCacheDir — derived
// the SAME way storage.js derives it (GEMINI_CACHE_DIR defaults to DATA_DIR/gemini-cache,
// and the smoke server only sets DATA_DIR, not GEMINI_CACHE_DIR) — so the whole check
// stays fully offline: the cache hit short-circuits before any Gemini call.
async function checkExtractCacheHitShape(label, geminiCacheDir) {
  const bytes = Buffer.from("smoke-pdf-bytes");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  fs.mkdirSync(geminiCacheDir, { recursive: true });
  const cacheFile = path.join(geminiCacheDir, `ingest-extract-v1-${hash}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify({
    text: "cached text",
    language: "he",
    warnings: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

  const { status, data, text } = await postExtractFile({
    kind: "pdf",
    mimeType: "application/pdf",
    dataBase64: bytes.toString("base64"),
    geminiApiKey: "AIza" + "x".repeat(30),
  });

  const expectedKeys = ["ok", "text", "language", "warnings", "method", "model", "fromCache"].sort();
  const actualKeys = data ? Object.keys(data).sort() : [];
  const exactShape = actualKeys.length === expectedKeys.length && actualKeys.every((k, i) => k === expectedKeys[i]);
  const shapeOk = status === 200 && data && data.ok === true && data.fromCache === true
    && data.text === "cached text"
    && !Object.prototype.hasOwnProperty.call(data, "createdAt")
    && exactShape;

  if (!shapeOk) {
    console.log(`FAIL ${label} -> expected 200 fromCache:true exact 7-key shape (no createdAt), got ${status} keys=[${actualKeys.join(",")}]: ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`PASS ${label} -> 200 fromCache:true, text "cached text", exact 7-key shape, no createdAt leak`);
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
  // storage.js: GEMINI_CACHE_DIR = process.env.GEMINI_CACHE_DIR || path.join(DATA_DIR, "gemini-cache").
  // startServer only sets DATA_DIR (below), so this mirrors the server's own derivation exactly.
  const geminiCacheDir = process.env.GEMINI_CACHE_DIR || path.join(tmpDataDir, "gemini-cache");
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

    {
      const ok = await checkExtractCacheHitShape(
        "14. synthetic cache-hit (pdf) -> 200 fromCache:true, exact 7-key shape, no createdAt leak",
        geminiCacheDir
      );
      allPassed = allPassed && ok;
    }

    {
      // direction validation runs BEFORE the BYOK key check — must 400
      // BAD_DIRECTION even though no geminiApiKey is supplied at all.
      const ok = await expectTranslateTableCase(
        "15. POST /api/translate-table {text:\"привет\", direction:\"nope\"} -> 400 BAD_DIRECTION (no key required)",
        { text: "привет", direction: "nope" },
        400,
        "BAD_DIRECTION"
      );
      allPassed = allPassed && ok;
    }

    // W2-S4: segments[] mode (he-ru-table-seg-v1) — deterministic 4xx cases,
    // no Gemini call reached in any of them (segMode validation runs before
    // the BYOK key check, except case 18 which is exactly the no-key path).
    {
      const ok = await expectTranslateTableCase(
        "16. POST /api/translate-table {direction:\"any-he\", segments:[...]} -> 400 BAD_SEGMENTS (segments only allowed with he-ru)",
        { direction: "any-he", segments: [{ i: 0, text: "x" }], geminiApiKey: "AIzaFake123456789012345" },
        400,
        "BAD_SEGMENTS"
      );
      allPassed = allPassed && ok;
    }

    {
      const ok = await expectTranslateTableCase(
        "17. POST /api/translate-table {direction:\"he-ru\", segments:[{i:5,...}]} -> 400 BAD_SEGMENTS (index != position)",
        { direction: "he-ru", segments: [{ i: 5, text: "x" }], geminiApiKey: "AIzaFake123456789012345" },
        400,
        "BAD_SEGMENTS"
      );
      allPassed = allPassed && ok;
    }

    {
      const ok = await expectTranslateTableCase(
        "18. POST /api/translate-table {direction:\"he-ru\", segments:[...]} (no key) -> 401 GEMINI_KEY_REQUIRED",
        { direction: "he-ru", segments: [{ i: 0, text: "שלום" }] },
        401,
        "GEMINI_KEY_REQUIRED"
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
