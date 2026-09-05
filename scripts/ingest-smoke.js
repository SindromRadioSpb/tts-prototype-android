"use strict";

// ───────────────────────────────────────────────────────────────────────────
// Ingest smoke — Studio Ingest W1 (STUDIO_INGEST_W1_IMPLEMENTATION_PLAN_2026_07_25)
// + W2-S4 (STUDIO_INGEST_W2_S4_IMPLEMENTATION_PLAN_2026_07_26, Task 6).
//
// Deterministic, offline validation matrix for POST /api/ingest/fetch-url
// (Task 4 — S1, checks 1-7), POST /api/ingest/extract-file (Task 6 — S2+S8,
// checks 8-14; 14 added in fix round 1 to cover the cache-hit response shape),
// POST /api/translate-table (Task 7 — S3, check 15: direction validation),
// the same route's segments[] mode (W2-S4 Task 6, checks 16-18: BAD_SEGMENTS
// on non-he-ru direction, BAD_SEGMENTS on malformed segments, and the no-key
// GEMINI_KEY_REQUIRED path with valid segments), and POST /api/ingest/retell
// (W2-S11 Task 2, checks 19-22: no-key GEMINI_KEY_REQUIRED, BAD_LEVEL,
// RETELL_TOO_LONG, and a synthetic cache-hit).
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
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require("./smoke-server-env");

const REPO_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.INGEST_SMOKE_PORT || 0);
let BASE_URL, FETCH_URL, EXTRACT_FILE_URL, TRANSLATE_TABLE_URL, RETELL_URL;
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

function startServer(port, dataDir) {
  const child = spawn(process.execPath, ["-e", SMOKE_SERVER_BOOTSTRAP], {
    cwd: REPO_ROOT,
    env: {
      ...smokeServerEnv(dataDir, port),
      MINI_APP_ENABLED: "0",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
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

  return { child, logs, ready: waitForSmokeServer(child) };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

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
// response. This check writes
// a synthetic cache entry DIRECTLY into the smoke server's geminiCacheDir — derived
// the SAME way storage.js derives it (GEMINI_CACHE_DIR defaults to DATA_DIR/gemini-cache,
// and the smoke server only sets DATA_DIR, not GEMINI_CACHE_DIR) — so the whole check
// stays fully offline: the cache hit short-circuits before any Gemini call.
async function checkExtractCacheHitShape(label, geminiCacheDir) {
  const bytes = Buffer.from("smoke-pdf-bytes");
  const fileSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const policy = require(path.join(REPO_ROOT, "ingest", "geminiPolicy.js"));
  const scenario = policy.getGeminiScenario("ocr");
  const hash = policy.buildGeminiCacheKey({ ...scenario, contentSha256: fileSha256 });
  fs.mkdirSync(geminiCacheDir, { recursive: true });
  const cacheFile = path.join(geminiCacheDir, `ingest-extract-v2-${hash}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify({
    pages: [{ pageIndex: 1, text: "cached text" }],
    language: "he",
    warnings: [],
    model: scenario.model,
    modelVersion: "gemini-3.7-flash-smoke",
    promptId: scenario.promptId,
    schemaId: scenario.schemaId,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

  const { status, data, text } = await postExtractFile({
    kind: "pdf",
    mimeType: "application/pdf",
    dataBase64: bytes.toString("base64"),
    geminiApiKey: "AIza" + "x".repeat(30),
  });

  const expectedKeys = ["ok", "text", "pages", "fileSha256", "language", "warnings", "method",
    "model", "requestedModel", "modelVersion", "promptId", "schemaId", "fromCache", "cacheKey"].sort();
  const actualKeys = data ? Object.keys(data).sort() : [];
  const exactShape = actualKeys.length === expectedKeys.length && actualKeys.every((k, i) => k === expectedKeys[i]);
  const shapeOk = status === 200 && data && data.ok === true && data.fromCache === true
    && data.text === "cached text"
    && !Object.prototype.hasOwnProperty.call(data, "createdAt")
    && exactShape;

  if (!shapeOk) {
    console.log(`FAIL ${label} -> expected 200 model-aware fromCache:true exact response shape (no createdAt), got ${status} keys=[${actualKeys.join(",")}]: ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`PASS ${label} -> 200 model-aware fromCache:true, text "cached text", no createdAt leak`);
  return true;
}

// /api/ingest/retell (S11 Task 2) is registered inside registerIngestRoutes and
// shares the SAME "ingest" limiter instance (max 10/60s per IP) as fetch-url and
// extract-file above — checks 1-7 already spend 7/10 of the default-IP budget,
// so retell gets its own X-Forwarded-For test IP (mirrors the EXTRACT_TEST_IP
// pattern) to stay independent rather than risking a spurious 429.
const RETELL_TEST_IP = "198.51.100.60"; // TEST-NET-2 (RFC 5737), non-routable
async function postRetell(body) {
  const res = await fetch(RETELL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": RETELL_TEST_IP },
    body: JSON.stringify(body),
  });
  const { data, text } = await readBody(res);
  return { status: res.status, data, text };
}

async function expectRetellCase(label, body, expectedStatus, expectedCode) {
  const { status, data, text } = await postRetell(body);
  if (status !== expectedStatus || !data || data.ok !== false || data.error_code !== expectedCode) {
    console.log(`FAIL ${label} -> expected ${expectedStatus} ${expectedCode}, got ${status}: ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`PASS ${label} -> ${expectedStatus} ${expectedCode}`);
  return true;
}

// Check 22 — retell cache-hit (mirrors check 14's mechanics exactly): derive the
// SAME sha256 key ingest/retell.js::cacheKeyInput produces (promptId|level||text.trim()),
// write it directly into the smoke server's geminiCacheDir, and confirm the route
// answers fromCache:true with NO Gemini call reached (fully offline).
async function checkRetellCacheHit(label, geminiCacheDir) {
  const retellMod = require(path.join(REPO_ROOT, "ingest", "retell.js"));
  const policy = require(path.join(REPO_ROOT, "ingest", "geminiPolicy.js"));
  const scenario = policy.getGeminiScenario("retell");
  const contentSha256 = crypto.createHash("sha256").update(retellMod.cacheKeyInput("טקסט קטן לבדיקה.", "A2")).digest("hex");
  const key = policy.buildGeminiCacheKey({ ...scenario, contentSha256 });
  fs.mkdirSync(geminiCacheDir, { recursive: true });
  const cacheFile = path.join(geminiCacheDir, `retell-v2-${key}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify({
    retell: "משפט פשוט.",
    level: "A2",
    model: scenario.model,
    modelVersion: "gemini-3.7-flash-smoke",
    promptId: scenario.promptId,
    schemaId: scenario.schemaId,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

  const { status, data, text } = await postRetell({
    text: "טקסט קטן לבדיקה.",
    level: "A2",
    geminiApiKey: "AIza" + "x".repeat(30),
  });

  const shapeOk = status === 200 && data && data.ok === true && data.fromCache === true
    && data.retell === "משפט פשוט." && data.promptId === "retell-he-v1" && data.cacheKey === key;
  if (!shapeOk) {
    console.log(`FAIL ${label} -> expected 200 fromCache:true retell:"משפט פשוט." promptId:retell-he-v1 cacheKey:${key}, got ${status}: ${text.slice(0, 300)}`);
    return false;
  }
  console.log(`PASS ${label} -> 200 fromCache:true, retell matches cached value, promptId retell-he-v1`);
  return true;
}

async function run() {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-ingestsmoke-"));
  const geminiCacheDir = path.join(tmpDataDir, "gemini-cache");
  const { child, logs, ready } = startServer(PORT, tmpDataDir);
  let allPassed = true;

  try {
    BASE_URL = `http://127.0.0.1:${await ready}`;
    FETCH_URL = `${BASE_URL}/api/ingest/fetch-url`;
    EXTRACT_FILE_URL = `${BASE_URL}/api/ingest/extract-file`;
    TRANSLATE_TABLE_URL = `${BASE_URL}/api/translate-table`;
    RETELL_URL = `${BASE_URL}/api/ingest/retell`;
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

    // S11 Task 2 — POST /api/ingest/retell: validation runs BEFORE any Gemini
    // call is reached (offline guarantee), same as extract-file above.
    {
      const ok = await expectRetellCase(
        "19. POST /api/ingest/retell {text, level:\"B1\"} (no key) -> 401 GEMINI_KEY_REQUIRED",
        { text: "שלום עולם.", level: "B1" },
        401,
        "GEMINI_KEY_REQUIRED"
      );
      allPassed = allPassed && ok;
    }

    {
      // Input validation (level) runs BEFORE the BYOK key check — must 400
      // BAD_LEVEL even though a plausible-shaped geminiApiKey is supplied.
      const ok = await expectRetellCase(
        "20. POST /api/ingest/retell {text, level:\"C2\", geminiApiKey} -> 400 BAD_LEVEL",
        { text: "שלום עולם.", level: "C2", geminiApiKey: "AIzaFakeKeyForSmokeOnly123456789" },
        400,
        "BAD_LEVEL"
      );
      allPassed = allPassed && ok;
    }

    {
      const ok = await expectRetellCase(
        "21. POST /api/ingest/retell {text: 100001 chars, level:\"B1\", geminiApiKey} -> 400 RETELL_TOO_LONG",
        { text: "א".repeat(100001), level: "B1", geminiApiKey: "AIzaFakeKeyForSmokeOnly123456789" },
        400,
        "RETELL_TOO_LONG"
      );
      allPassed = allPassed && ok;
    }

    {
      const ok = await checkRetellCacheHit(
        "22. synthetic cache-hit (retell) -> 200 fromCache:true без сети",
        geminiCacheDir
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
