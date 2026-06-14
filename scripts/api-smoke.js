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

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(REPO_ROOT, "data", "app.db");
const PORT = Number(process.env.API_SMOKE_PORT || 3107);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// BRR-P0-010: a known token injected into the test server so the upload lock can be
// proven from loopback (the revised gate requires the token even locally once a
// secret is set, so X-Local-Mode / no-token must be rejected even here).
const SMOKE_AUDIO_TOKEN = "smoke-only-audio-upload-token-do-not-use-in-prod-0123456789";

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

function startServer(dbPath, port, dataDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(port),
      // Isolate the volume to a throwaway dir so BRR-P1-014 works uploads (and any audio
      // writes) never touch the dev/prod data dir; run() removes it afterwards.
      DATA_DIR: dataDir,
      AUDIO_UPLOAD_TOKEN: SMOKE_AUDIO_TOKEN, // BRR-P0-010 — exercise the upload lock
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
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lp-apismoke-"));
  const { child, logs } = startServer(DB_PATH, PORT, tmpDataDir);

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

    // 3. BRR-P0-010: /api/audio/cache/upload is owner-token gated. With
    //    AUDIO_UPLOAD_TOKEN set on the server, even a loopback request must present
    //    the token and X-Local-Mode must NOT authorize a write. A deliberately bad
    //    assetKey is used so the AUTHORIZED case stops at validation (400) and never
    //    writes a file to disk.
    const UPLOAD_URL = `${BASE_URL}/api/audio/cache/upload`;
    const badKeyBody = JSON.stringify({ assetKey: "not-a-valid-key", mp3Base64: "AAAA" });

    {
      const res = await fetch(UPLOAD_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: badKeyBody });
      const { data, text } = await readBody(res);
      if (res.status !== 403 || !data || data.error !== "BAD_UPLOAD_TOKEN") {
        throw new Error(`audio upload lock: no-token expected 403 BAD_UPLOAD_TOKEN, got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    {
      const res = await fetch(UPLOAD_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Local-Mode": "1" }, body: badKeyBody });
      const { data, text } = await readBody(res);
      if (res.status !== 403 || !data || data.error !== "BAD_UPLOAD_TOKEN") {
        throw new Error(`audio upload lock: X-Local-Mode alone expected 403 BAD_UPLOAD_TOKEN (header must not authorize), got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    {
      const res = await fetch(UPLOAD_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Audio-Upload-Token": SMOKE_AUDIO_TOKEN }, body: badKeyBody });
      const { data, text } = await readBody(res);
      if (res.status !== 400 || !data || data.error !== "BAD_ASSET_KEY") {
        throw new Error(`audio upload lock: valid token expected 400 BAD_ASSET_KEY (auth passed → reached validation), got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    console.log("PASS /api/audio/cache/upload -> owner-token gated (X-Local-Mode rejected; valid token reaches validation)");

    // 4. BRR-P1-014 A4: /api/benyehuda/works/upload reuses the SAME owner-token gate
    //    (AUDIO_UPLOAD_TOKEN). Prove: no-token→403, X-Local-Mode→403, traversal id→400,
    //    bad payload→400, valid→200 atomic-write, then the body is served back from the
    //    volume at /data/benyehuda/works/<id>.json (static mount wins over public).
    const WORKS_URL = `${BASE_URL}/api/benyehuda/works/upload`;
    const goodWork = {
      id: "__smoke_work__",
      json: { library: { schema_version: 1, texts: [{ text_id: "x", text_key: "k", title: "t", rows: [] }], shelves: [], audio_assets: [] } },
    };
    const worksAuth = { "Content-Type": "application/json", "X-Audio-Upload-Token": SMOKE_AUDIO_TOKEN };
    {
      const res = await fetch(WORKS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(goodWork) });
      const { data, text } = await readBody(res);
      if (res.status !== 403 || !data || data.error !== "BAD_UPLOAD_TOKEN") {
        throw new Error(`works upload lock: no-token expected 403 BAD_UPLOAD_TOKEN, got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    {
      const res = await fetch(WORKS_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Local-Mode": "1" }, body: JSON.stringify(goodWork) });
      const { data, text } = await readBody(res);
      if (res.status !== 403 || !data || data.error !== "BAD_UPLOAD_TOKEN") {
        throw new Error(`works upload lock: X-Local-Mode alone expected 403 BAD_UPLOAD_TOKEN (header must not authorize), got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    {
      const res = await fetch(WORKS_URL, { method: "POST", headers: worksAuth, body: JSON.stringify({ id: "../evil", json: goodWork.json }) });
      const { data, text } = await readBody(res);
      if (res.status !== 400 || !data || data.error !== "BAD_WORK_ID") {
        throw new Error(`works upload: traversal id expected 400 BAD_WORK_ID, got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    {
      const res = await fetch(WORKS_URL, { method: "POST", headers: worksAuth, body: JSON.stringify({ id: "__smoke_work__", json: { nope: true } }) });
      const { data, text } = await readBody(res);
      if (res.status !== 400 || !data || data.error !== "BAD_WORK_PAYLOAD") {
        throw new Error(`works upload: bad payload expected 400 BAD_WORK_PAYLOAD, got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    {
      const res = await fetch(WORKS_URL, { method: "POST", headers: worksAuth, body: JSON.stringify(goodWork) });
      const { data, text } = await readBody(res);
      if (res.status !== 200 || !data || !data.ok || data.id !== "__smoke_work__") {
        throw new Error(`works upload: valid token expected 200 ok, got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    {
      const res = await fetch(`${BASE_URL}/data/benyehuda/works/__smoke_work__.json`);
      const { data, text } = await readBody(res);
      if (!res.ok || !data || !data.library || !Array.isArray(data.library.texts)) {
        throw new Error(`works serve: expected the uploaded body back from the volume, got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    console.log("PASS /api/benyehuda/works/upload -> owner-token gated + atomic write served from volume");

    // 5. BRR-P1-008c: /api/tts honours withTimepoints (routes to ensureAudioAssetWithTiming)
    //    but a BYOK key missing must still surface as a structured 401 TTS_KEY_REQUIRED —
    //    never a 500. byokKey has no server-env fallback, so this is hermetic (no network).
    //    Without the flag, the contract is identical (regression guard for the shared path).
    const TTS_URL = `${BASE_URL}/api/tts`;
    const ttsBody = (extra) => JSON.stringify({
      text: "שלום עולם", language: "he-IL", voiceId: "he-IL-Wavenet-A",
      sentenceId: "00000000-0000-0000-0000-000000000001",
      textId: "00000000-0000-0000-0000-000000000002",
      ...extra,
    });
    for (const [label, extra] of [["withTimepoints:true", { withTimepoints: true }], ["no flag", {}]]) {
      const res = await fetch(TTS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: ttsBody(extra) });
      const { data, text } = await readBody(res);
      if (res.status !== 401 || !data || data.error_code !== "TTS_KEY_REQUIRED") {
        throw new Error(`/api/tts ${label} without key expected 401 TTS_KEY_REQUIRED (not 500), got ${res.status}: ${text.slice(0, 200)}`);
      }
    }
    console.log("PASS /api/tts -> withTimepoints routes to timing path; missing BYOK key still honest 401 (not 500)");

    // 6. BRR-P1-008c self-cache guarantee: once a clip's mp3 + <key>.timing.json exist on the
    //    volume, /api/tts {withTimepoints:true} serves it WITHOUT a BYOK key (keyless tier-1 for
    //    everyone after the first paid bake), returns the matching assetKey + fromCache, and
    //    GET /api/audio/<key>/timing returns the word array. Hermetic: we seed the cache, no synth.
    {
      const { computeAssetKey } = require(path.join(REPO_ROOT, "db/premium/ttsAssetKey"));
      const seedText = "שלום עולם";
      const seedProfile = { language: "he-IL", voiceName: "he-IL-Wavenet-A", speakingRate: 1.0, pitch: 0.0 };
      const seedKey = computeAssetKey({ text: seedText, ttsProfile: seedProfile, assetType: "row" });
      const cacheDir = path.join(tmpDataDir, "audio-cache");
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, `${seedKey}.mp3`), Buffer.from("ID3-smoke-fake-mp3"));
      const seedTiming = { v: 1, n: 2, got: 2, words: [{ o: 0, t: 0.0 }, { o: 1, t: 0.42 }] };
      fs.writeFileSync(path.join(cacheDir, `${seedKey}.timing.json`), JSON.stringify(seedTiming));

      const res = await fetch(TTS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: ttsBody({ withTimepoints: true }) });
      const { data, text } = await readBody(res);
      if (res.status !== 200 || !data || data.assetKey !== seedKey || data.fromCache !== true) {
        throw new Error(`/api/tts withTimepoints cache-hit expected 200 fromCache=true assetKey=${seedKey} (no key needed), got ${res.status}: ${text.slice(0, 200)}`);
      }
      const tRes = await fetch(`${BASE_URL}/api/audio/${seedKey}/timing`);
      const { data: tData, text: tText } = await readBody(tRes);
      if (!tRes.ok || !tData || !Array.isArray(tData.words) || tData.words.length !== 2) {
        throw new Error(`/api/audio/<key>/timing expected the seeded word array, got ${tRes.status}: ${tText.slice(0, 200)}`);
      }
    }
    console.log("PASS /api/tts -> self-cache: seeded mp3+timing served keyless; /timing returns words[]");

    console.log("API smoke: OK");
  } catch (error) {
    const tail = logs.length ? `\nServer log tail:\n${logs.join("\n")}` : "";
    throw new Error(`${error.message}${tail}`);
  } finally {
    await stopServer(child);
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((error) => {
  console.error(`API smoke FAILED: ${error.message}`);
  process.exitCode = 1;
});
