#!/usr/bin/env node
"use strict";
// scripts/premium/ingest-audio-cors-check.js
// W2-S4 SPIKE — BROWSER CORS check for the Gemini Files API resumable-upload
// protocol used by ingest-audio-live-smoke.js. The Node smoke proves the
// protocol works server-side; this proves the SAME protocol works from an
// in-browser `fetch` (the client-side transport Task 5 will actually ship),
// in particular that `x-goog-upload-url` is CORS-exposed
// (Access-Control-Expose-Headers) to page JS — without that, step 1 cannot
// hand off to step 2 in a browser at all.
//
// Usage (owner-run manual smoke, real Gemini quota, NEVER wired into npm test/CI):
//   npm start &  (or: node server.js)
//   INGEST_SMOKE_GEMINI_KEY=<GEMINI_KEY> node scripts/premium/ingest-audio-cors-check.js
//
// This script spawns its OWN server instance on PORT=3777 (does not depend on
// an already-running dev server) so it is self-contained and repeatable.
// Key resolution: env INGEST_SMOKE_GEMINI_KEY only (never logged, never put in
// a page URL — passed into page.evaluate() as a plain argument and used only
// in request headers/body inside the page).
//
// Output: exactly "CORS OK" on success, or "CORS FAIL: <step>" on failure
// (step ∈ start | start-header | upload | poll-active | asr | asr-timeout |
// server-boot | overall-timeout), then process.exit(0|1).

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3777;
const BASE = `http://localhost:${PORT}`;
const AUDIO_PATH = path.join(__dirname, "fixtures/ingest/audio/he-sample.mp3");
const MIME = "audio/mpeg";
const KEY = String(process.env.INGEST_SMOKE_GEMINI_KEY || "").trim();

const SERVER_READY_TIMEOUT_MS = 30000;
const OVERALL_TIMEOUT_MS = 5 * 60 * 1000; // whole-script budget (brief §Timeouts)
const ASR_TIMEOUT_MS = 120000; // in-page ASR call budget (brief §Timeouts)

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function redact(s) {
  const str = String(s == null ? "" : s);
  return KEY ? str.split(KEY).join("[REDACTED]") : str;
}

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT) },
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
    const tm = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tm); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}

async function waitForReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {}
    await sleep(300);
  }
  return false;
}

// Runs INSIDE the browser page via page.evaluate. Self-contained (no shared
// module — protocol-drift between this and ingest-audio-live-smoke.js is
// deliberately catchable by Task 13, per brief).
async function browserProtocolCheck({ audioBase64, mime, key, asrPrompt, asrModel, asrTimeoutMs }) {
  const GL = "https://generativelanguage.googleapis.com";
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error(label + " timeout (" + ms + "ms)")), ms)),
    ]);
  }

  const bytes = b64ToBytes(audioBase64);

  let start;
  try {
    start = await fetch(GL + "/upload/v1beta/files", {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": mime,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "s4-cors-check" } }),
    });
  } catch (e) {
    return { ok: false, step: "start", detail: String(e && e.message || e) };
  }
  if (!start.ok) {
    let bodyText = "";
    try { bodyText = await start.text(); } catch (_) {}
    return { ok: false, step: "start", detail: "HTTP " + start.status + ": " + bodyText };
  }

  // THE critical CORS assert — Access-Control-Expose-Headers must list
  // x-goog-upload-url or page JS cannot read it (browser hides it otherwise).
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (uploadUrl === null) {
    return { ok: false, step: "start-header", detail: "x-goog-upload-url not readable from page JS (CORS expose-headers?)" };
  }

  let up;
  try {
    up = await fetch(uploadUrl, {
      method: "POST",
      headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
      body: bytes,
    });
  } catch (e) {
    return { ok: false, step: "upload", detail: String(e && e.message || e) };
  }
  if (!up.ok) {
    let bodyText = "";
    try { bodyText = await up.text(); } catch (_) {}
    return { ok: false, step: "upload", detail: "HTTP " + up.status + ": " + bodyText };
  }
  let fileInfo;
  try { fileInfo = (await up.json()).file; } catch (e) {
    return { ok: false, step: "upload", detail: "bad JSON: " + String(e && e.message || e) };
  }

  let state = fileInfo.state, tries = 0;
  while (state !== "ACTIVE") {
    if (state === "FAILED") return { ok: false, step: "poll-active", detail: "file state FAILED" };
    if (++tries > 30) return { ok: false, step: "poll-active", detail: "ACTIVE timeout (60s)" };
    await new Promise((r) => setTimeout(r, 2000));
    let g;
    try { g = await fetch(GL + "/v1beta/" + fileInfo.name, { headers: { "x-goog-api-key": key } }); }
    catch (e) { return { ok: false, step: "poll-active", detail: String(e && e.message || e) }; }
    if (!g.ok) return { ok: false, step: "poll-active", detail: "files.get HTTP " + g.status };
    state = (await g.json()).state;
  }

  let gen;
  try {
    gen = await withTimeout(
      fetch(GL + "/v1beta/models/" + asrModel + ":generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { file_data: { file_uri: fileInfo.uri, mime_type: mime } },
            { text: asrPrompt },
          ] }],
          generationConfig: { temperature: 0 },
        }),
      }),
      asrTimeoutMs,
      "asr"
    );
  } catch (e) {
    const isTimeout = /^asr timeout/.test(String(e && e.message || ""));
    return { ok: false, step: isTimeout ? "asr-timeout" : "asr", detail: String(e && e.message || e) };
  }
  if (!gen.ok) {
    let bodyText = "";
    try { bodyText = await gen.text(); } catch (_) {}
    return { ok: false, step: "asr", detail: "HTTP " + gen.status + ": " + bodyText };
  }
  let data;
  try { data = await gen.json(); } catch (e) {
    return { ok: false, step: "asr", detail: "bad JSON: " + String(e && e.message || e) };
  }
  const raw = ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return { ok: true, uploadUrlHost: (() => { try { return new URL(uploadUrl).host; } catch (_) { return null; } })(), rawPreview: raw.slice(0, 200) };
}

async function main() {
  if (!/^(AIza|AQ\.)/.test(KEY)) {
    console.error("ERROR: env INGEST_SMOKE_GEMINI_KEY missing/malformed (expect AIza…|AQ.…)");
    console.log("CORS FAIL: no-key");
    process.exit(1);
  }
  if (!fs.existsSync(AUDIO_PATH)) {
    console.error("ERROR: fixture not found:", AUDIO_PATH);
    console.log("CORS FAIL: no-fixture");
    process.exit(1);
  }

  let playwright;
  try { playwright = require("playwright"); }
  catch (e) {
    console.error("ERROR: playwright not installed:", e.message);
    console.log("CORS FAIL: no-playwright");
    process.exit(1);
  }

  const A = require(path.join(REPO_ROOT, "public/js/asr-transcript.js"));
  const audioBase64 = fs.readFileSync(AUDIO_PATH).toString("base64");

  const srv = startServer();
  const overallDeadline = Date.now() + OVERALL_TIMEOUT_MS;

  const ready = await waitForReady(SERVER_READY_TIMEOUT_MS);
  if (!ready) {
    console.error("ERROR: server did not become healthy on", BASE, "within", SERVER_READY_TIMEOUT_MS, "ms");
    srv.logs.forEach((l) => console.error(redact(l)));
    await stopServer(srv.child);
    console.log("CORS FAIL: server-boot");
    process.exit(1);
  }
  console.log("[ingest-audio-cors-check] server up on", BASE);

  let browser;
  let result;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load" });

    const remainingMs = overallDeadline - Date.now();
    result = await Promise.race([
      page.evaluate(browserProtocolCheck, {
        audioBase64,
        mime: MIME,
        key: KEY,
        asrPrompt: A.ASR_PROMPT,
        asrModel: A.ASR_MODEL,
        asrTimeoutMs: ASR_TIMEOUT_MS,
      }),
      sleep(Math.max(1000, remainingMs)).then(() => ({ ok: false, step: "overall-timeout", detail: "script budget (" + OVERALL_TIMEOUT_MS + "ms) exceeded" })),
    ]);
  } catch (e) {
    result = { ok: false, step: "harness", detail: String(e && e.message || e) };
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    await stopServer(srv.child);
  }

  if (result && result.ok) {
    console.log("[ingest-audio-cors-check] upload host:", result.uploadUrlHost, "| raw preview:", redact(result.rawPreview));
    console.log("CORS OK");
    process.exit(0);
  } else {
    const step = (result && result.step) || "unknown";
    const detail = redact((result && result.detail) || "");
    console.error("[ingest-audio-cors-check] failure detail:", detail);
    console.log("CORS FAIL: " + step);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("ingest-audio-cors-check FAILED (unexpected):", e && e.stack ? e.stack : e);
  console.log("CORS FAIL: unexpected");
  process.exit(1);
});
