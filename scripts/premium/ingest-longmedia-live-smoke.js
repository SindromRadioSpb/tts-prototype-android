#!/usr/bin/env node
"use strict";
// scripts/premium/ingest-longmedia-live-smoke.js
// W2-S12 T8 live smoke (РЕАЛЬНЫЙ ключ; урок feedback_llm_path_test_before_ship + «живой смоук ловит
// то, что не видит ревью»). Ручной запуск:
//   node scripts/premium/ingest-longmedia-live-smoke.js --download-sample
//   node scripts/premium/ingest-longmedia-live-smoke.js --audio <файл ~60-75 мин> --duration-sec <сек>
// Полный путь БРАУЗЕРНЫМИ модулями (Node-ветки dual-export), эволюция
// docs/research/studio-ingest-longmedia/2026-07-28/m3-long-asr.js:
//   upload (gemini-files) → waitActive → runWindowedAsr (studio-import: окна+retry+добор)
//   → validateSegments → TableChunks.buildChunks → POST http://localhost:3000/api/translate-table
//   на кусок → offsetRows → asserts (окна/дыры/плотность/тайминг/mapping/coverage/караоке)
//   → R16-калибровка (estimateLongJob vs фактический wall-time).
// Ключ: INGEST_SMOKE_GEMINI_KEY, фолбэк GEMINI_API_KEY из .env проекта.
// Сервер поднимается сам (spawn, точечный SIGTERM), если /healthz не отвечает.
// Сырой транскрипт НЕ сохраняется (чужой подкаст-контент, репо готовится к публичности).
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
require("dotenv").config({ path: path.join(REPO, ".env") });

const A = require(path.join(REPO, "public", "js", "asr-transcript.js"));
const SI = require(path.join(REPO, "public", "js", "studio-import.js"));
const GF = require(path.join(REPO, "public", "js", "gemini-files.js"));
const TC = require(path.join(REPO, "public", "js", "table-chunks.js"));
const segTable = require(path.join(REPO, "ingest", "segTable.js"));

// ── args ──────────────────────────────────────────────────────────────────────────────────
function arg(name, dflt) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : dflt; }
function flag(name) { return process.argv.indexOf("--" + name) > -1; }

const KEY = process.env.INGEST_SMOKE_GEMINI_KEY || process.env.GEMINI_API_KEY || "";
if (!/^(AIza|AQ\.)/.test(KEY)) {
  console.error("ERROR: INGEST_SMOKE_GEMINI_KEY or GEMINI_API_KEY (.env) required (AIza…|AQ.…)");
  process.exit(1);
}

const SAMPLE_URL = "https://api.spreaker.com/download/episode/70984998/ep258_thermonuclear_world_war_draft_1.mp3";
const SAMPLE_PATH = path.join(REPO, ".tmp", "longmedia-sample.mp3");
// Известная длительность ep258 (НЕ доверяем RSS/mp3-метаданным — R11): замер
// docs/research/studio-ingest-longmedia/2026-07-28/README.md — "RSS врал '46 мин', реальная
// длительность ~74.8 мин"; m3-asr-results.json (clip258: coverage до 47:35 из "74:48",
// lastStart=2855). 4490s (74:50) — конкретное значение из брифа Task 8, с запасом на округление.
const SAMPLE_DURATION_SEC = 4490;

const SERVER_PORT = 3000;
const SERVER_BASE = "http://localhost:" + SERVER_PORT;

function fmtMB(bytes) { return (bytes / 1048576).toFixed(1) + "MB"; }
function fmtSec(ms) { return (ms / 1000).toFixed(0) + "s"; }
function guessMime(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".ogg") return "audio/ogg";
  return "audio/mpeg";
}

class SmokeFail extends Error {}
function must(cond, msg) { if (!cond) throw new SmokeFail(msg); }

// ── sample download (reused across runs — 108MB) ────────────────────────────────────────────
async function downloadSample() {
  if (fs.existsSync(SAMPLE_PATH) && fs.statSync(SAMPLE_PATH).size > 10 * 1024 * 1024) {
    console.log("sample already downloaded:", SAMPLE_PATH, fmtMB(fs.statSync(SAMPLE_PATH).size), "(reuse)");
    return SAMPLE_PATH;
  }
  fs.mkdirSync(path.dirname(SAMPLE_PATH), { recursive: true });
  console.log("downloading sample…", SAMPLE_URL);
  const t0 = Date.now();
  const resp = await fetch(SAMPLE_URL, { redirect: "follow" });
  if (!resp.ok) throw new Error("sample download HTTP " + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  const tmp = SAMPLE_PATH + ".part";
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, SAMPLE_PATH);
  console.log("downloaded:", SAMPLE_PATH, fmtMB(buf.length), "in", fmtSec(Date.now() - t0));
  return SAMPLE_PATH;
}

// ── local server lifecycle (pattern: scripts/premium/studio-chunks-smoke.js) ───────────────
async function healthzOk() {
  try { const r = await fetch(SERVER_BASE + "/healthz"); return r.status === 200; } catch (_) { return false; }
}
let spawnedServer = null;
async function ensureServer() {
  if (await healthzOk()) { console.log("local server already up on", SERVER_BASE, "(reused, will NOT be stopped)"); return; }
  console.log("local server not responding — spawning `node server.js`…");
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(SERVER_PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  spawnedServer = c;
  const logs = [];
  c.stdout.on("data", (x) => logs.push(String(x)));
  c.stderr.on("data", (x) => logs.push(String(x)));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await healthzOk()) { console.log("local server up, pid", c.pid); return; }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(logs.join(""));
  throw new Error("local server failed to start within 20s");
}
async function stopServerIfSpawned() {
  if (!spawnedServer || spawnedServer.killed) return;
  spawnedServer.kill("SIGTERM"); // point-kill by PID — never taskkill /IM node.exe
  const ok = await new Promise((r) => {
    const t = setTimeout(() => r(false), 5000);
    spawnedServer.once("exit", () => { clearTimeout(t); r(true); });
  });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(spawnedServer.pid), "/T", "/F"], { stdio: "ignore" });
  console.log("spawned local server stopped");
}

// ── Gemini 429 handling: not a code failure — wait retryDelay once, retry; hard/daily quota
// (no delay hint or delay >120s, or 429 persists after the one retry) → quotaExhausted (caller
// surfaces DONE_WITH_CONCERNS, not FAIL). ──────────────────────────────────────────────────
function extractRetryDelaySec(message) {
  try {
    const parsed = JSON.parse(message);
    const details = (parsed && parsed.error && parsed.error.details) || [];
    for (const d of details) {
      if (d && typeof d["@type"] === "string" && d["@type"].includes("RetryInfo") && d.retryDelay) {
        const m = String(d.retryDelay).match(/(\d+)/);
        if (m) return Number(m[1]);
      }
    }
  } catch (_) {}
  return null;
}
async function withOnce429Retry(fn, label) {
  try {
    return await fn();
  } catch (e) {
    if (!(e && e.status === 429)) throw e;
    const waitSec = extractRetryDelaySec(e.message);
    if (waitSec == null || waitSec > 120) {
      const err = new Error(label + ": Gemini 429 (hard/daily quota, retryDelay=" + waitSec + "s) — not auto-retrying");
      err.quotaExhausted = true;
      throw err;
    }
    console.warn("  " + label + ": 429 — waiting " + waitSec + "s then retrying once (quota, not a code failure)");
    await new Promise((r) => setTimeout(r, waitSec * 1000));
    try {
      return await fn();
    } catch (e2) {
      if (e2 && e2.status === 429) {
        const err = new Error(label + ": Gemini 429 persisted after retry — hard quota");
        err.quotaExhausted = true;
        throw err;
      }
      throw e2;
    }
  }
}

// ── mapping-equivalent (tolerant of a locally-degraded chunk, per §5.4 design): filter to rows
// that DO carry segment_index, then require non-decreasing + in-bounds across the WHOLE merge
// (segTable.validateSegMapping itself fails hard on any row missing the index — too strict here,
// a SEG_MAPPING_LOST chunk is an accepted local degradation, not a run failure). ───────────────
function mappingEquivalent(rows, segCount) {
  let last = -1;
  for (const r of rows) {
    const si = r && r.segment_index;
    if (!Number.isInteger(si)) continue;
    if (si < 0 || si >= segCount || si < last) return { ok: false, bad: si, prev: last };
    last = si;
  }
  return { ok: true };
}

(async () => {
  const failures = [];
  const t0All = Date.now();
  const phaseWall = {};

  // ── input selection ────────────────────────────────────────────────────────────────────
  const audioArg = arg("audio", null);
  const useSample = flag("download-sample");
  if (!audioArg && !useSample) { console.error("ERROR: pass --audio <path> or --download-sample"); process.exit(1); }

  let audioPath;
  if (useSample) { audioPath = await downloadSample(); }
  else {
    audioPath = path.resolve(audioArg);
    must(fs.existsSync(audioPath), "audio file not found: " + audioPath);
  }
  const MIME = arg("mime", guessMime(audioPath));

  const durationArg = arg("duration-sec", null);
  let planDurationSec;
  if (durationArg != null) planDurationSec = Number(durationArg);
  else if (useSample) planDurationSec = SAMPLE_DURATION_SEC;
  else { console.error("ERROR: --duration-sec required for custom --audio (no file-metadata trust — R11)"); process.exit(1); }
  must(planDurationSec > 0, "bad --duration-sec: " + durationArg);

  console.log("=== W2-S12 T8 live smoke ===");
  console.log("audio:", audioPath, MIME, "planDurationSec:", planDurationSec, "(" + (planDurationSec / 60).toFixed(1) + " min)");

  try {
    // ensureServer() INSIDE the try: it assigns spawnedServer and can itself throw (healthz
    // poll timeout after spawn) — if it were called before this try/finally, that throw would
    // skip stopServerIfSpawned() entirely and leak the spawned `node server.js` child (caught
    // in review; pattern fixed to match studio-chunks-smoke.js's explicit stop-on-error path).
    await ensureServer();

    // ── Phase 1: upload + waitActive ───────────────────────────────────────────────────────
    console.log("\n--- Phase 1: upload ---");
    const bytes = fs.readFileSync(audioPath);
    console.log("upload:", fmtMB(bytes.length));
    const tUp0 = Date.now();
    const uploaded = await withOnce429Retry(
      () => GF.uploadFile(KEY, bytes, MIME, (phase) => console.log("  ", phase)),
      "uploadFile"
    );
    must(uploaded && uploaded.fileUri, "uploadFile: no fileUri returned");
    const timeoutMs = 60000 + Math.round(bytes.length / 1048576) * 1000;
    await withOnce429Retry(() => GF.waitActive(KEY, uploaded.name, { timeoutMs }), "waitActive");
    phaseWall.upload = Date.now() - tUp0;
    console.log("uploaded+ACTIVE:", uploaded.fileUri, "in", fmtSec(phaseWall.upload), "(timeout budget " + fmtSec(timeoutMs) + ")");

    // ── Phase 2: windowed ASR ──────────────────────────────────────────────────────────────
    console.log("\n--- Phase 2: windowed ASR ---");
    const tAsr0 = Date.now();
    async function transcribeWindow(a, b) {
      const label = a === null ? "single" : (Math.round(a) + "-" + Math.round(b));
      const tw0 = Date.now();
      const raw = await withOnce429Retry(
        () => GF.transcribeAudio(KEY, uploaded.fileUri, MIME, a === null ? undefined : { promptText: A.ASR_RANGE_PROMPT(a, b) }),
        "ASR window " + label
      );
      console.log("  ASR window", label, "wall", fmtSec(Date.now() - tw0), "rawChars", raw.length);
      return raw;
    }
    const result = await SI.runWindowedAsr({
      durationSec: planDurationSec,
      transcribe: transcribeWindow,
      parse: A.parseAsrResponse,
      onProgress: (k, m) => console.log("ASR window " + k + "/" + m + " …"),
      maxHeals: 3,
    });
    phaseWall.asr = Date.now() - tAsr0;
    console.log("ASR done: windows=" + result.windows.length, "segments=" + result.segments.length,
      "healedGaps=" + result.healedGaps.length, "remainingGaps=" + result.coverageGaps.length,
      "warnings=" + JSON.stringify(result.warnings), "in", fmtSec(phaseWall.asr));

    // ── Step 3: honesty asserts on the ASR result ──────────────────────────────────────────
    console.log("\n--- Step 3: ASR asserts ---");
    if (!(result.windows.length >= 4)) failures.push("windows=" + result.windows.length + " expected >=4 (75min material)");
    const badRetry = result.windows.filter((w) => w.retries > 1);
    if (badRetry.length) failures.push("windows with retries>1: " + JSON.stringify(badRetry));

    // independent-oracle cross-check: recompute gaps from the raw merged segments ourselves
    // (not just trust runWindowedAsr's own internal bookkeeping — feedback_independent_oracle_gate).
    const gapsRecomputed = A.findCoverageGaps(result.segments, planDurationSec);
    must(gapsRecomputed.length === result.coverageGaps.length,
      "independent-oracle mismatch: findCoverageGaps recompute=" + gapsRecomputed.length + " vs runWindowedAsr.coverageGaps=" + result.coverageGaps.length);
    const gapsOk = result.coverageGaps.length === 0 || result.warnings.indexOf("ASR_COVERAGE_GAP") > -1;
    if (!gapsOk) failures.push("residual coverage gaps=" + result.coverageGaps.length + " but warnings missing ASR_COVERAGE_GAP: " + JSON.stringify(result.warnings));

    const densityFloor = (planDurationSec / 60) * 3;
    if (!(result.segments.length >= densityFloor)) failures.push("segments=" + result.segments.length + " expected >= durationMin*3=" + densityFloor.toFixed(0));

    const v = A.validateSegments(result.segments, planDurationSec);
    const validStarts = v.segments.filter((s) => s.start !== null).length;
    const observedLastStart = validStarts ? v.segments.filter((s) => s.start !== null).slice(-1)[0].start : null;
    console.log("validateSegments: timingOk=" + v.timingOk, "dropReason=" + v.dropReason, "validStarts=" + validStarts + "/" + v.segments.length,
      "warnings=" + JSON.stringify(v.warnings), "observedLastStart=" + observedLastStart + "s (vs planDurationSec=" + planDurationSec + "s — sanity cross-check, metadata never trusted)");
    if (!v.timingOk) failures.push("timingOk=false, dropReason=" + v.dropReason + " — for this known-good material timing MUST be valid (not an accepted honest degradation for this gate)");

    console.log("ASR asserts: windows>=4 " + (result.windows.length >= 4) + ", retries<=1 " + (!badRetry.length) +
      ", coverage " + gapsOk + ", density " + (result.segments.length >= densityFloor) + ", timingOk " + v.timingOk);

    // ── Phase 4: table chunks via local server ─────────────────────────────────────────────
    console.log("\n--- Phase 4: table chunks ---");
    const chunkInput = result.segments.map((s, k) => ({ i: k, text: s.text }));
    const chunks = TC.buildChunks(chunkInput);
    console.log("table chunks:", chunks.length, "(CHUNK_SIZE=" + TC.CHUNK_SIZE + ", segments=" + result.segments.length + ")");

    const tTable0 = Date.now();
    const allRows = [];
    let anyFromCache = false;
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const sv = segTable.validateSegmentsInput(chunk.segs);
      if (!sv.ok) { failures.push("chunk " + ci + " failed local validateSegmentsInput: " + sv.error_code); continue; }

      const doPost = async () => {
        const tC0 = Date.now();
        const resp = await fetch(SERVER_BASE + "/api/translate-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geminiApiKey: KEY, direction: "he-ru", segments: chunk.segs }),
        });
        const body = await resp.json().catch(() => ({}));
        return { resp, body, wallMs: Date.now() - tC0 };
      };
      let r = await doPost();
      // Retry ONCE on any non-200 — not just 429. Rationale (documented, not ad hoc): the M2
      // research (docs/research/studio-ingest-longmedia/2026-07-28/README.md) recorded exactly
      // this failure mode independently ("первый прогон... дал ASR_BAD_JSON — недетерминизм на
      // длинном выводе") on a comparable long-JSON generateContent call; production's own design
      // for this exact situation is the "Продолжить" resume button (design §1.5/§6) — a single
      // transient per-chunk generation failure is NOT supposed to fail the whole job. A second
      // consecutive failure on the SAME chunk is a real problem and is surfaced honestly below.
      if (r.resp.status !== 200) {
        if (r.resp.status === 429) {
          const waitSec = r.body && r.body.retryAfterSec;
          if (waitSec == null || waitSec > 120) {
            const err = new Error("chunk " + ci + ": HTTP 429 (hard/daily quota, retryAfterSec=" + waitSec + ") — not auto-retrying");
            err.quotaExhausted = true;
            throw err;
          }
          console.warn("  chunk " + (ci + 1) + "/" + chunks.length + ": 429 — waiting " + waitSec + "s then retrying once (quota, not a code failure)");
          await new Promise((res) => setTimeout(res, waitSec * 1000));
        } else {
          console.warn("  chunk " + (ci + 1) + "/" + chunks.length + ": HTTP " + r.resp.status +
            " — " + JSON.stringify(r.body).slice(0, 300) + " — retrying once (transient generation failure, not code)");
        }
        r = await doPost();
        if (r.resp.status === 429) {
          const err = new Error("chunk " + ci + ": HTTP 429 persisted after retry — hard quota");
          err.quotaExhausted = true;
          throw err;
        }
      }

      const rowsLen = Array.isArray(r.body.rows) ? r.body.rows.length : 0;
      console.log("  chunk " + (ci + 1) + "/" + chunks.length, "HTTP", r.resp.status, "wall", fmtSec(r.wallMs),
        "rows", rowsLen, "fromCache", !!r.body.fromCache, "warnings", JSON.stringify(r.body.warnings || []));
      if (r.resp.status !== 200) { failures.push("chunk " + ci + " HTTP " + r.resp.status + ": " + JSON.stringify(r.body)); continue; }
      if (!rowsLen) { failures.push("chunk " + ci + " returned 0 rows"); continue; }

      // Independent-oracle (per brief): run the PRODUCTION validateSegMapping on the RAW,
      // pre-offset, chunk-local rows — not just our own post-merge mappingEquivalent() below
      // (which only re-checks the already-offset, already-merged result). This calls the actual
      // prod code path (ingest/segTable.js) against this chunk's raw response, exactly as the
      // server itself would (chunk.segs.length is the chunk-local segCount, same as the server
      // saw when it decided whether to strip segment_index). Skipped when the server itself
      // already reported SEG_MAPPING_LOST — it already stripped every segment_index in that
      // case, so validateSegMapping would trivially fail on an accepted, honest degradation
      // (§5.4 design) rather than a real bug; logged instead of asserted.
      const chunkWarnings = Array.isArray(r.body.warnings) ? r.body.warnings : [];
      if (chunkWarnings.indexOf("SEG_MAPPING_LOST") > -1) {
        console.log("  chunk " + (ci + 1) + "/" + chunks.length + ": SEG_MAPPING_LOST — server already stripped segment_index (accepted local degradation); validateSegMapping oracle not applicable");
      } else {
        const mapOk = segTable.validateSegMapping(r.body.rows, chunk.segs.length);
        if (!mapOk) failures.push("chunk " + ci + ": segTable.validateSegMapping (prod oracle, pre-offset, chunk-local) failed on raw rows");
      }

      if (r.body.fromCache) anyFromCache = true;
      allRows.push(...TC.offsetRows(r.body.rows, chunk.base));
    }
    phaseWall.table = Date.now() - tTable0;
    console.log("table done: chunks=" + chunks.length, "rows=" + allRows.length, "anyFromCache=" + anyFromCache, "in", fmtSec(phaseWall.table));

    // ── Step 5: final asserts ──────────────────────────────────────────────────────────────
    console.log("\n--- Step 5: final asserts ---");
    const totalSegs = result.segments.length;
    const rowsFloor = totalSegs * 0.95;
    if (!(allRows.length >= rowsFloor)) failures.push("rows=" + allRows.length + " expected >= segments*0.95=" + rowsFloor.toFixed(0));

    const mapCheck = mappingEquivalent(allRows, totalSegs);
    if (!mapCheck.ok) failures.push("segment_index mapping not non-decreasing/in-bounds at value=" + mapCheck.bad + " (prev=" + mapCheck.prev + ")");

    const covered = new Set(allRows.filter((r) => Number.isInteger(r.segment_index)).map((r) => r.segment_index));
    const missing = [];
    for (let i = 0; i < totalSegs; i++) if (!covered.has(i)) missing.push(i);
    const coverageFrac = totalSegs ? 1 - missing.length / totalSegs : 0;
    if (missing.length) console.log("missing segment indices (" + missing.length + "):", JSON.stringify(missing));
    if (!(coverageFrac >= 0.90)) failures.push("coverage=" + (coverageFrac * 100).toFixed(1) + "% expected >=90%");

    // Фикс 2026-07-30 (STUDIO_KARAOKE_ROW_TIMING_MISMAP): тайминг строится ТОЛЬКО на осмысленном
    // маппинге — тот же гейт, что стоит в v3AttachAudioTiming. Вырожденный 1:1 (строк заметно
    // больше сегментов, а индексы идут подряд) обязан валить прогон, а не рисовать караоке.
    const rowSegIdx = allRows.map((r) => (Number.isInteger(r.segment_index) ? r.segment_index : null));
    const mapMeaning = A.validateRowSegMapping(rowSegIdx, v.segments.length);
    if (!mapMeaning.ok) failures.push("validateRowSegMapping failed: " + JSON.stringify(mapMeaning));
    const timing = A.buildRowTiming(v.segments, rowSegIdx);
    const timingEntries = timing ? timing.entries.length : 0;
    if (!(timingEntries >= 2)) failures.push("buildRowTiming entries=" + timingEntries + " expected >=2 (karaoke alive)");
    // Независимый оракул (ревью K1): предыдущая проверка судит ВХОД (индексы строк), эта —
    // ВЫХОД (сами записи тайминга). Отпечаток живого брака — o каждой записи равен индексу её
    // сегмента при том, что строк больше сегментов; если он проступил на живом прогоне, гейт
    // обязан упасть, даже если вход почему-то признан осмысленным.
    if (A.timingLooksDegenerate(timing, v.segments, allRows.length)) {
      failures.push("timing looks DEGENERATE 1:1 (o === segment index while rows=" + allRows.length +
        " > segments=" + v.segments.length + ") — karaoke would light the wrong row");
    }

    console.log("final asserts: rows " + (allRows.length >= rowsFloor) + ", mapping " + mapCheck.ok +
      ", coverage " + (coverageFrac >= 0.90) + " (" + (coverageFrac * 100).toFixed(1) + "%)" +
      ", timingEntries " + (timingEntries >= 2) + " (" + timingEntries + ")");

    // ── Step 6: R16 cost calibration (transcribeAudio doesn't surface usageMetadata — estimate
    // via estimateLongJob, printed next to actual wall-time; simplification documented in report) ──
    console.log("\n--- Step 6: R16 cost calibration ---");
    const estimate = A.estimateLongJob(planDurationSec, { chunkSize: TC.CHUNK_SIZE });
    const totalWallMs = Date.now() - t0All;
    console.log("estimateLongJob (pre-run, density-based):", JSON.stringify(estimate));
    console.log("actual wall: upload=" + fmtSec(phaseWall.upload) + " asr=" + fmtSec(phaseWall.asr) +
      " table=" + fmtSec(phaseWall.table) + " total=" + fmtSec(totalWallMs) +
      " (" + (totalWallMs / 60000).toFixed(1) + " min) vs estimate.minutes=" + estimate.minutes);
    console.log("estimate.totalUsd=$" + estimate.totalUsd.toFixed(3) + " (actual token usage not available from transcribeAudio() — see report simplification)");

    // ── Step 7: summary ─────────────────────────────────────────────────────────────────────
    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify({
      windows: result.windows.length, healedGaps: result.healedGaps.length, remainingGaps: result.coverageGaps.length,
      segments: result.segments.length, chunks: chunks.length, rows: allRows.length,
      coveragePct: Number((coverageFrac * 100).toFixed(1)), timingEntries, anyFromCache,
      wallSec: { upload: Math.round(phaseWall.upload / 1000), asr: Math.round(phaseWall.asr / 1000), table: Math.round(phaseWall.table / 1000), total: Math.round(totalWallMs / 1000) },
      estimateUsd: Number(estimate.totalUsd.toFixed(3)), estimateMinutes: estimate.minutes,
    }, null, 1));

    if (failures.length) {
      console.error("\nFAILURES:\n - " + failures.join("\n - "));
      throw new SmokeFail(failures.length + " assertion(s) failed: " + failures.join(" | "));
    }
    console.log("\nLIVE SMOKE OK");
  } finally {
    await stopServerIfSpawned();
  }
})().catch((e) => {
  if (e && e.quotaExhausted) {
    console.error("\nDONE_WITH_CONCERNS:", e.message);
    process.exit(2);
  }
  console.error("\nLIVE SMOKE FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});
