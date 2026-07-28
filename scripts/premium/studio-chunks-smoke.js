#!/usr/bin/env node
"use strict";
// W2-S12 · Task 7 — детерминированный смоук чанк-цикла таблицы (`smoke:studio-chunks`).
// Канон: .superpowers/sdd/STUDIO_INGEST_W2_S12_IMPLEMENTATION_PLAN_2026_07_28/task-7-brief.md
//        + docs/planning/STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md §4.4.
//
// Тестирует живое поведение Task 5/6 в public/index.html БЕЗ реального Gemini (урок S5a —
// фейк-fetch, не «нажми и посмотри»): translateTable() → segsForChunks.length>CHUNK_SIZE(120)
// → v3TranslateTableChunked(segs). window.fetch подменён ТОЛЬКО для "/api/translate-table"
// (не "-v2"); всё остальное (locale JSON, healthz, статика) идёт через настоящий fetch.
//
// Сценарии:
//   1) success: 300 сегментов → 3 куска [120,120,60], прогрессив-рендер между кусками,
//      глобальные segment_index, полный v3LastGeminiMeta.
//   2a) S12.1 (task-8) — ОДИНОЧНЫЙ сбой куска 2 (500 «Ошибка JSON»-подобный): авто-ретрай
//      внутри v3TranslateTableChunked поглощает его МОЛЧА — один лишний fetch-вызов (ретрай
//      того же куска), итог 300 строк БЕЗ баннера, v3LastGeminiMeta.chunks[1].retried===true,
//      partial НЕ выставлен.
//   2b) ДВОЙНОЙ сбой того же куска (и исходная попытка, И авто-ретрай) — авто-ретрай не
//      спасает, срабатывает существующий путь: баннер ошибки + честная partial-таблица
//      (120 строк); повторный клик «Перевести» докачивает — кусок 1 приходит из фейкового
//      server-side-подобного кэша (Map по JSON.stringify(segments), эмулирует реальный
//      sha256-кэш кусков на сервере), кусок 2 генерируется заново, кусок 3 — впервые.
//      Счётчик см. комментарий у asserts.
//   2c) 429 (rate-limit) на куске 2 — НИКОГДА не ретраится авто-ретраем (немедленный повтор
//      бессмыслен и жжёт квоту): сразу баннер, БЕЗ лишнего fetch-вызова.
//   3) SEG_MAPPING_LOST локально на куске 2: фейк отдаёт rows БЕЗ segment_index (+ warnings
//      ["SEG_MAPPING_LOST"], как это делает настоящий сервер — честно смоделировано, не
//      придумано: ingest/segTable.js эмитит этот warning когда модель не вернула индексы) —
//      деградация тайминга остаётся ЛОКАЛЬНОЙ этому куску, куски 1/3 сохраняют индексы.
//
// Run: node scripts/premium/studio-chunks-smoke.js

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3341, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── server lifecycle (pattern: scripts/premium/reader-parity-smoke.js) ──────────────────────
function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return; c.kill("SIGTERM"); // point-kill by PID — never taskkill /IM node.exe
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

// ── deterministic fixture: 300-line captions import, 1:1 with segment i ────────────────────
const N_SEGS = 300;
const CHUNK_SIZE = 120; // must mirror public/js/table-chunks.js CHUNK_SIZE
const LINES = Array.from({ length: N_SEGS }, (_, i) => "שורה " + i);
const TEXT = LINES.join("\n");
const IMPORT_SEGMENTS = LINES.map((t, i) => ({ i, start: i * 5, text: t }));

const GEMINI_KEY_LS_KEY = "v3.geminiApiKey";       // index.html geminiKeyGet()
const TABLE_CACHE_LS_KEY = "ttsDashboard_table_cache_v1"; // index.html TABLE_CACHE_KEY
const PROVIDER_LS_KEY = "v3.translateProvider";     // index.html PROVIDER_LS_KEY — default
                                                     // option is "google-free" (premium!) —
                                                     // MUST force "gemini" or segsForChunks
                                                     // never triggers (usePremium short-circuits it).
const BYOK_TOUR_LS_KEY = "v3.byokTourCompleted";
const FAKE_GEMINI_KEY = "AIzaFAKEKEYFORSTUDIOCHUNKSMOKE7";

function range(a, b) { const out = []; for (let i = a; i < b; i++) out.push(i); return out; }

// ── fake fetch: installed via addInitScript so it re-applies on every navigation/reload ─────
async function installFakeFetch(ctx) {
  await ctx.addInitScript(({ geminiKeyLsKey, tableCacheLsKey, providerLsKey, byokTourLsKey, fakeKey }) => {
    try { localStorage.setItem(geminiKeyLsKey, fakeKey); } catch (_) {}
    try { localStorage.removeItem(tableCacheLsKey); } catch (_) {} // never let a prior scenario's local-cache short-circuit this one
    try { localStorage.setItem(providerLsKey, "gemini"); } catch (_) {}
    try { localStorage.setItem(byokTourLsKey, "1"); } catch (_) {} // suppress first-visit BYOK tour overlay

    // Task 6: v3TranslateTableChunked() opens with window.confirm(smeta) BEFORE any state
    // mutation. Playwright auto-dismisses (confirm=false) unless stubbed — the brief's
    // documented gotcha. Stub true unconditionally; message content is irrelevant here.
    window.confirm = () => true;

    const REAL_FETCH = window.fetch.bind(window);
    window.__chunkCalls = [];          // segments.length per intercepted call, call order
    window.__callCount = 0;            // 1-indexed, monotonic for the lifetime of THIS page load
    window.__cacheHits = 0;            // calls served from the fake per-chunk cache (not a "real generation")
    window.__failPlan = null;          // { failAtCall: N, times: 1|2, status?: 429 } — starting at
                                        // call N, fails `times` CONSECUTIVE calls (S12.1: attempt +
                                        // auto-retry are separate calls/ticks), then lets subsequent
                                        // calls through normally. status defaults to 500 ("boom");
                                        // 429 returns {error:"Лимит"} (mirrors handleGeminiLimitError).
    window.__mappingLostAtCall = null; // that call's rows omit segment_index (+ SEG_MAPPING_LOST warning)
    window.__fakeCache = new Map();    // JSON.stringify(segments) -> {rows, key, warnings} — emulates
                                        // the server's sha256(cleanText) chunk cache (design doc §4.4):
                                        // an identical chunk re-request is free/instant on retry.
    let seq = 0;

    window.fetch = async (url, init) => {
      const u = String(url);
      const isChunkReq = u.indexOf("/api/translate-table") !== -1 && u.indexOf("/api/translate-table-v2") === -1;
      if (!isChunkReq) return REAL_FETCH(url, init);

      let body = {};
      try { body = JSON.parse((init && init.body) || "{}"); } catch (_) {}
      const segments = Array.isArray(body.segments) ? body.segments : [];
      window.__callCount += 1;
      const callNo = window.__callCount;
      window.__chunkCalls.push(segments.length); // logged for EVERY call reaching here, cache-hit or not

      // Small deterministic delay so an external Node-side poller can observe the intermediate
      // (progressive) table state between chunks — a real Gemini call takes seconds; this only
      // needs to outlast one ~50ms poll tick.
      await new Promise((r) => setTimeout(r, 180));

      const cacheKey = JSON.stringify(segments);
      if (window.__fakeCache.has(cacheKey)) {
        window.__cacheHits += 1;
        const hit = window.__fakeCache.get(cacheKey);
        return new Response(JSON.stringify({ rows: hit.rows, fromCache: true, cacheKey: hit.key, warnings: hit.warnings }),
          { status: 200, headers: { "content-type": "application/json" } });
      }

      if (window.__failPlan) {
        // Sticky failure streak: latches on when callNo first reaches failAtCall, then stays
        // latched across however many calls it takes to exhaust `times` — this is what lets a
        // single plan cover BOTH the original attempt (call failAtCall) AND the S12.1 auto-retry
        // (the NEXT call, whatever its callNo happens to be) without knowing that call number
        // ahead of time. Once `times` is exhausted the plan goes quiet and all further calls
        // (including a later resume click) succeed normally.
        const plan = window.__failPlan;
        if (!plan._active && callNo === plan.failAtCall) plan._active = true;
        if (plan._active && plan.times > 0) {
          plan.times -= 1;
          if (plan.times <= 0) plan._active = false; // exhausted — next call succeeds
          const status = plan.status === 429 ? 429 : 500;
          const errBody = status === 429 ? { error: "Лимит" } : { error: "boom" };
          // Failed calls are NEVER cached (mirrors a real 500/429 — nothing to remember).
          return new Response(JSON.stringify(errBody), { status, headers: { "content-type": "application/json" } });
        }
      }

      const mappingLost = window.__mappingLostAtCall === callNo;
      const rows = segments.map((s) => {
        const row = { he: s.text, he_niqqud: s.text, translit: "t" + s.i, ru: "r" + s.i };
        if (!mappingLost) row.segment_index = s.i; // omitted entirely when mapping-lost (honest: no guessed index)
        return row;
      });
      const warnings = mappingLost ? ["SEG_MAPPING_LOST"] : [];
      const key = "fake" + (++seq);
      window.__fakeCache.set(cacheKey, { rows, key, warnings });
      return new Response(JSON.stringify({ rows, fromCache: false, cacheKey: key, warnings }),
        { status: 200, headers: { "content-type": "application/json" } });
    };
  }, { geminiKeyLsKey: GEMINI_KEY_LS_KEY, tableCacheLsKey: TABLE_CACHE_LS_KEY, providerLsKey: PROVIDER_LS_KEY, byokTourLsKey: BYOK_TOUR_LS_KEY, fakeKey: FAKE_GEMINI_KEY });
}

async function waitReady(page) {
  await page.waitForFunction(() =>
    typeof window.translateTable === "function" &&
    typeof window.TableChunks === "object" && !!window.TableChunks &&
    typeof window.AsrTranscript === "object" && !!window.AsrTranscript &&
    !!document.getElementById("inputText") &&
    !!document.getElementById("providerSelect") &&
    !!document.getElementById("tableDirectionSelect") &&
    !!document.getElementById("errorMsg") &&
    !!document.getElementById("tableContainer"),
    { timeout: 20000 });
}

// Prepares a freshly-loaded/reloaded page for the chunk-cycle: forces provider=gemini
// (segsForChunks is only computed on the non-premium path) + direction=he-ru, seeds
// #inputText with the 300-line fixture, and publishes window.v3LastImportMeta with a
// captions passport shaped exactly like studio-import.js useText()'s captions branch
// (public/js/studio-import.js:505-525) — v3MediaPassport() reads holder.audio||holder.captions.
async function preparePage(page) {
  await waitReady(page);
  await page.evaluate(({ text, segments }) => {
    const providerEl = document.getElementById("providerSelect");
    if (providerEl) providerEl.value = "gemini";
    const dirEl = document.getElementById("tableDirectionSelect");
    if (dirEl) dirEl.value = "he-ru";

    const input = document.getElementById("inputText");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const now = new Date().toISOString();
    window.v3LastImportMeta = {
      kind: "captions", source: "smoke.vtt", method: "paste", model: null,
      warnings: [], at: now, textSnapshot: text,
      captions: {
        v: 1,
        captions: { origin: "paste", format: "vtt", kindHint: null, kindEvidence: "vtt-plain",
                    language: "he", fileName: "smoke.vtt", at: now, droppedHeadings: 0, warnings: [] },
        segments, timing: null, timingDropReason: null,
      },
    };
  }, { text: TEXT, segments: IMPORT_SEGMENTS });
}

// currentTableData/v3LastGeminiMeta are top-level `let` bindings inside index.html's classic
// <script> (not window.* properties) — but classic-script top-level let/const share the page's
// global lexical environment, so a bare identifier reference from page.evaluate() resolves them
// correctly (same mechanism DevTools console relies on).
async function snapshot(page) {
  return page.evaluate(() => {
    const tbody = document.querySelector("#proTable tbody");
    const rows = tbody ? tbody.querySelectorAll("tr").length : 0;
    let meta = null;
    try { meta = (typeof v3LastGeminiMeta !== "undefined") ? v3LastGeminiMeta : null; } catch (_) {}
    const errEl = document.getElementById("errorMsg");
    const err = errEl ? (errEl.textContent || "").trim() : "";
    return {
      rows, err,
      chunksLen: (meta && Array.isArray(meta.chunks)) ? meta.chunks.length : 0,
      partial: !!(meta && meta.partial),
    };
  });
}

async function pollUntil(page, predicate, timeoutMs, intervalMs) {
  const start = Date.now();
  let intermediateMax = 0, last = null;
  while (Date.now() - start < timeoutMs) {
    const snap = await snapshot(page);
    last = snap;
    if (predicate(snap)) return { ok: true, snap, intermediateMax };
    // Only counts PRE-completion states (predicate already checked above) — the final
    // completing snapshot (rows===N_SEGS) must never be mistaken for a progressive step.
    if (snap.rows > intermediateMax && snap.rows < N_SEGS) intermediateMax = snap.rows;
    await sleep(intervalMs);
  }
  return { ok: false, snap: last, intermediateMax };
}

class SmokeFail extends Error {}
function must(cond, msg) { if (!cond) throw new SmokeFail(msg); }

(async () => {
  let pw;
  try { pw = require("playwright"); } catch (e) { console.error("no playwright — `npm i -D playwright` first"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed to start"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await installFakeFetch(ctx);
    const page = await ctx.newPage();

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 1: success — 300 segments → 3 chunks [120,120,60], progressive render,
    // global segment_index, full success meta.
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.goto(BASE + "/?v=s12smoke", { waitUntil: "load" });
    await preparePage(page);
    await page.evaluate(() => { translateTable(); }); // fire-and-forget — polled below

    const r1 = await pollUntil(page, (s) => s.chunksLen === 3 || !!s.err, 30000, 50);
    must(r1.ok, "scenario1: timed out waiting for completion; last=" + JSON.stringify(r1.snap));
    must(!r1.snap.err, "scenario1: unexpected error banner: " + r1.snap.err);
    must(r1.intermediateMax >= CHUNK_SIZE, "scenario1: no progressive intermediate state >= " + CHUNK_SIZE + " observed before completion (max seen=" + r1.intermediateMax + ") — progressive render not proven");

    const final1 = await snapshot(page);
    must(final1.rows === N_SEGS, "scenario1: final tbody row count=" + final1.rows + " expected " + N_SEGS);

    const calls1 = await page.evaluate(() => window.__chunkCalls.slice());
    must(JSON.stringify(calls1) === JSON.stringify([120, 120, 60]), "scenario1: __chunkCalls=" + JSON.stringify(calls1) + " expected [120,120,60]");

    const s1 = await page.evaluate(() => ({
      tableLen: currentTableData.length,
      row150: currentTableData[150] ? currentTableData[150].segment_index : "MISSING_ROW",
      chunksLen: v3LastGeminiMeta.chunks.length,
      promptId: v3LastGeminiMeta.promptId,
    }));
    must(s1.tableLen === N_SEGS, "scenario1: currentTableData.length=" + s1.tableLen + " expected " + N_SEGS);
    must(s1.row150 === 150, "scenario1: currentTableData[150].segment_index=" + s1.row150 + " expected 150");
    must(s1.chunksLen === 3, "scenario1: v3LastGeminiMeta.chunks.length=" + s1.chunksLen + " expected 3");
    must(s1.promptId === "he-ru-table-seg-v1+chunked", "scenario1: v3LastGeminiMeta.promptId=" + s1.promptId + " expected he-ru-table-seg-v1+chunked");

    console.log("scenario1 OK — chunkCalls=" + JSON.stringify(calls1) + " progressiveMax=" + r1.intermediateMax + " final=" + s1.tableLen);

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 2a (S12.1): SINGLE chunk-2 failure — the auto-retry inside
    // v3TranslateTableChunked silently recovers it. No banner, no partial table.
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.reload({ waitUntil: "load" }); // resets ALL page JS state + fake-fetch counters
    await preparePage(page);
    await page.evaluate(() => { window.__failPlan = { failAtCall: 2, times: 1 }; }); // 1 failure only — auto-retry absorbs it
    await page.evaluate(() => { translateTable(); });

    const r2a = await pollUntil(page, (s) => s.chunksLen === 3 || !!s.err, 30000, 50);
    must(r2a.ok, "scenario2a: timed out waiting for completion; last=" + JSON.stringify(r2a.snap));
    must(!r2a.snap.err, "scenario2a: unexpected error banner — a single chunk failure must be silently absorbed by the S12.1 auto-retry: " + r2a.snap.err);

    const s2a = await page.evaluate(() => ({
      tableLen: currentTableData.length,
      chunkCalls: window.__chunkCalls.slice(),
      cacheHits: window.__cacheHits,
      chunk2Retried: v3LastGeminiMeta.chunks[1] ? v3LastGeminiMeta.chunks[1].retried === true : false,
      partial: !!(v3LastGeminiMeta && v3LastGeminiMeta.partial),
    }));
    must(s2a.tableLen === N_SEGS, "scenario2a: currentTableData.length=" + s2a.tableLen + " expected " + N_SEGS);
    // 4 calls total (1 MORE than scenario1's [120,120,60]): chunk1(#1,120,success) + chunk2
    // attempt1(#2,120,FAIL — failAtCall=2,times:1) + chunk2 auto-retry(#3,120,SUCCESS — plan
    // exhausted after 1 failure) + chunk3(#4,60,success). The extra call IS the retry.
    must(JSON.stringify(s2a.chunkCalls) === JSON.stringify([120, 120, 120, 60]),
      "scenario2a: __chunkCalls=" + JSON.stringify(s2a.chunkCalls) + " expected [120,120,120,60] (extra call = the auto-retry)");
    must(s2a.cacheHits === 0, "scenario2a: __cacheHits=" + s2a.cacheHits + " expected 0 (fresh page — nothing was ever cached before the retry ran)");
    must(s2a.chunk2Retried === true, "scenario2a: v3LastGeminiMeta.chunks[1].retried expected true (chunk2 succeeded on its 2nd attempt)");
    must(s2a.partial === false, "scenario2a: v3LastGeminiMeta.partial=" + s2a.partial + " expected false/undefined — auto-retry succeeded, this IS a full success");

    console.log("scenario2a OK — chunkCalls=" + JSON.stringify(s2a.chunkCalls) + " chunk2.retried=" + s2a.chunk2Retried + " final=" + s2a.tableLen);

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 2b: DOUBLE chunk-2 failure (original attempt AND the auto-retry both fail) —
    // the auto-retry cannot save it; existing banner + honest partial-table path fires exactly
    // as before S12.1. Resume docks the rest via the fake per-chunk cache.
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.reload({ waitUntil: "load" });
    await preparePage(page);
    await page.evaluate(() => { window.__failPlan = { failAtCall: 2, times: 2 }; }); // both attempts fail
    await page.evaluate(() => { translateTable(); });

    const r2b1 = await pollUntil(page, (s) => !!s.err, 30000, 50);
    must(r2b1.ok, "scenario2b attempt1: timed out waiting for error banner");
    const s2b1 = await page.evaluate(() => ({
      tableLen: currentTableData.length,
      partial: !!(v3LastGeminiMeta && v3LastGeminiMeta.partial),
      chunkCalls: window.__chunkCalls.slice(),
    }));
    must(s2b1.tableLen === CHUNK_SIZE, "scenario2b attempt1: currentTableData.length=" + s2b1.tableLen + " expected " + CHUNK_SIZE + " (only chunk1 landed — chunk2 failed twice)");
    must(s2b1.partial === true, "scenario2b attempt1: v3LastGeminiMeta.partial=" + s2b1.partial + " expected true");
    // 3 calls: chunk1(#1,120,success) + chunk2 attempt1(#2,120,FAIL) + chunk2 auto-retry(#3,120,
    // FAIL — plan.times:2 is exhausted on this call too). The retry's OWN failure is what
    // propagates to the existing catch/banner path (unchanged since before S12.1).
    must(JSON.stringify(s2b1.chunkCalls) === JSON.stringify([120, 120, 120]),
      "scenario2b attempt1: __chunkCalls=" + JSON.stringify(s2b1.chunkCalls) + " expected [120,120,120] (original attempt + auto-retry, both failed)");

    // Resume: same page (no reload) — the fake per-chunk cache from attempt1 persists,
    // exactly like the server's real sha256 chunk cache would across two HTTP requests.
    await page.evaluate(() => { window.__failPlan = null; });
    await page.evaluate(() => { translateTable(); });

    const r2b2 = await pollUntil(page, (s) => (s.chunksLen === 3 && !s.partial) || !!s.err, 30000, 50);
    must(r2b2.ok, "scenario2b attempt2: timed out waiting for completion; last=" + JSON.stringify(r2b2.snap));
    must(!r2b2.snap.err, "scenario2b attempt2: unexpected error banner on resume: " + r2b2.snap.err);

    const s2b2 = await page.evaluate(() => ({
      tableLen: currentTableData.length,
      chunkCalls: window.__chunkCalls.slice(),
      cacheHits: window.__cacheHits,
    }));
    must(s2b2.tableLen === N_SEGS, "scenario2b attempt2: currentTableData.length=" + s2b2.tableLen + " expected " + N_SEGS);

    // ── call-count accounting (asked-for-in-brief: "зафиксируй счёт и обоснуй") ────────────
    // __chunkCalls logs EVERY call that reaches the fake fetch handler, cache-hit or not — 6
    // total on this page: attempt1 = chunk1(#1,120,success) + chunk2 attempt1(#2,120,FAIL) +
    // chunk2 auto-retry(#3,120,FAIL, plan.times exhausted); attempt2(resume) = chunk1(#4,120,
    // CACHE HIT — identical segments-JSON already cached from #1's success) + chunk2(#5,120,
    // real,succeeds now __failPlan=null) + chunk3(#6,60,real,new).
    must(JSON.stringify(s2b2.chunkCalls) === JSON.stringify([120, 120, 120, 120, 120, 60]),
      "scenario2b: __chunkCalls=" + JSON.stringify(s2b2.chunkCalls) + " expected [120,120,120,120,120,60] (3 attempt1 + 3 attempt2)");
    must(s2b2.cacheHits === 1, "scenario2b: __cacheHits=" + s2b2.cacheHits + " expected 1 (only attempt2's chunk1 was ever previously cached)");
    // "real generations" = calls NOT served from the fake cache — 5: attempt1's chunk1(success) +
    // chunk2 attempt1(fail, not cached) + chunk2 auto-retry(fail, not cached) + attempt2's chunk2
    // (real,success) + chunk3(real,success).
    const realGenerations2b = s2b2.chunkCalls.length - s2b2.cacheHits;
    must(realGenerations2b === 5, "scenario2b: real generations=" + realGenerations2b + " expected 5 (1 success + 2 failures in attempt1, 2 successes in attempt2)");

    console.log("scenario2b OK — chunkCalls=" + JSON.stringify(s2b2.chunkCalls) + " cacheHits=" + s2b2.cacheHits + " realGenerations=" + realGenerations2b + " final=" + s2b2.tableLen);

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 2c: 429 (rate-limit) on chunk 2 — NEVER auto-retried (an immediate re-request
    // would just burn quota for what's supposed to be an honest countdown banner). Immediate
    // banner, NO extra fetch call. Runs LAST of the 2-family + reloads before/after so a
    // handleGeminiLimitError() lock from this scenario can never bleed into scenario 3.
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.reload({ waitUntil: "load" });
    await preparePage(page);
    await page.evaluate(() => { window.__failPlan = { failAtCall: 2, times: 1, status: 429 }; });
    await page.evaluate(() => { translateTable(); });

    const r2c = await pollUntil(page, (s) => !!s.err, 30000, 50);
    must(r2c.ok, "scenario2c: timed out waiting for error banner");
    const s2c = await page.evaluate(() => ({
      tableLen: currentTableData.length,
      partial: !!(v3LastGeminiMeta && v3LastGeminiMeta.partial),
      chunkCalls: window.__chunkCalls.slice(),
    }));
    must(s2c.tableLen === CHUNK_SIZE, "scenario2c: currentTableData.length=" + s2c.tableLen + " expected " + CHUNK_SIZE + " (only chunk1 landed before chunk2's 429)");
    must(s2c.partial === true, "scenario2c: v3LastGeminiMeta.partial=" + s2c.partial + " expected true");
    // 2 calls only: chunk1(#1,120,success) + chunk2(#2,120,429). NO retry call — 429 goes
    // straight to the existing banner path (honest rate-limit countdown, never silently retried).
    must(JSON.stringify(s2c.chunkCalls) === JSON.stringify([120, 120]),
      "scenario2c: __chunkCalls=" + JSON.stringify(s2c.chunkCalls) + " expected [120,120] (no retry on 429)");

    console.log("scenario2c OK — chunkCalls=" + JSON.stringify(s2c.chunkCalls) + " (429 not retried)");

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 3: SEG_MAPPING_LOST on chunk 2 — degradation stays local to that chunk.
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.reload({ waitUntil: "load" });
    await preparePage(page);
    await page.evaluate(() => { window.__mappingLostAtCall = 2; }); // chunk 2 = 2nd call on this fresh page
    await page.evaluate(() => { translateTable(); });

    const r3 = await pollUntil(page, (s) => s.chunksLen === 3 || !!s.err, 30000, 50);
    must(r3.ok, "scenario3: timed out waiting for completion; last=" + JSON.stringify(r3.snap));
    must(!r3.snap.err, "scenario3: unexpected error banner: " + r3.snap.err + " (a mapping-lost chunk is still an HTTP 200 — must NOT be treated as a chunk failure)");

    const s3 = await page.evaluate(() => {
      const withIdx = [], withoutIdx = [];
      for (let i = 0; i < currentTableData.length; i++) {
        (Number.isInteger(currentTableData[i].segment_index) ? withIdx : withoutIdx).push(i);
      }
      return { total: currentTableData.length, withIdx, withoutIdx,
                chunksLen: v3LastGeminiMeta.chunks.length, partial: !!v3LastGeminiMeta.partial };
    });
    must(s3.total === N_SEGS, "scenario3: currentTableData.length=" + s3.total + " expected " + N_SEGS);
    must(s3.partial === false, "scenario3: v3LastGeminiMeta.partial=" + s3.partial + " expected false — a 200 response with degraded mapping is a SUCCESS, not a chunk failure");
    must(s3.chunksLen === 3, "scenario3: v3LastGeminiMeta.chunks.length=" + s3.chunksLen + " expected 3");

    const expectWithIdx = range(0, CHUNK_SIZE).concat(range(N_SEGS - 60, N_SEGS)); // chunk1 (0-119) + chunk3 (240-299)
    const expectWithoutIdx = range(CHUNK_SIZE, N_SEGS - 60); // chunk2 (120-239) — mapping lost
    must(JSON.stringify(s3.withIdx) === JSON.stringify(expectWithIdx),
      "scenario3: rows WITH segment_index = " + s3.withIdx.length + " entries, expected chunk1+chunk3 (0-119,240-299)");
    must(JSON.stringify(s3.withoutIdx) === JSON.stringify(expectWithoutIdx),
      "scenario3: rows WITHOUT segment_index = " + s3.withoutIdx.length + " entries, expected chunk2 only (120-239)");

    console.log("scenario3 OK — withIdx=" + s3.withIdx.length + " withoutIdx=" + s3.withoutIdx.length + " (chunk2 locally degraded, chunks 1/3 intact)");

    console.log("SMOKE OK");
  } finally {
    await browser.close();
    await stop(srv.c);
  }
})().catch((e) => {
  console.error("FAIL: " + (e && e.message ? e.message : e));
  process.exit(1);
});
