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
//   4) (ревью K1, 2026-07-30) ПРЕМИУМ-перевод медиа-импорта + переключение на Gemini:
//      4a — /api/translate-table-v2 отдаёт rows[].segment_index-однофамильца (1-based номер
//      предложения премиум-сегментатора) → караоке обязано ЧЕСТНО отсутствовать
//      (timingDropReason=NO_SEGMENT_MAPPING, detail=NO_INDEX, заметка в медиа-баре видна), а не
//      строиться 1:1 по чужому полю; 4b — следующий перевод Gemini восстанавливает seg-режим,
//      чанкование и полный тайминг (производный вердикт не переживает свой ответ).
//   5) (ревью K1) КАРАНТИН уже сохранённого вырожденного тайминга при открытии текста
//      (v3RestoreMediaFromMeta): выключается караоке у карточек, сохранённых ДО фикса, и
//      НЕ трогается честный 1:N-тайминг.
//   6) (K2, 2026-07-30) ПРЕМИУМ С `source_line_index` → караоке ЕСТЬ и оно ВЕРНОЕ. Ответ
//      фейка строится НАСТОЯЩИМ db/premium/segmenter.js (не выдуманной формой), строк таблицы
//      заметно больше сегментов; независимый оракул проверяет, что каждая запись тайминга
//      указывает на строку СВОЕГО сегмента, а не на соседнюю.
//   7) (K2) тот же премиум-ответ, но текст переразбит (строк больше, чем сегментов) —
//      идентичность «строка = сегмент» больше не выполняется ⇒ караоке честно исчезает,
//      а прошлый (верный) тайминг не остаётся висеть на паспорте (R11).
//   8) (ревью K2) seg-режим Gemini НЕ ЗАПУСКАЕТСЯ на переразбитом тексте. v3MediaLineIdentity() —
//      единственная проверка идентичности «строка = ASR-сегмент», и у неё ДВА потребителя;
//      премиум-ветку страхует повторная сверка в v3AttachAudioTiming (сценарий 7), seg-режим —
//      НЕ страхует ничто. Строк МЕНЬШЕ, чем сегментов (худший случай: индексы остаются в
//      диапазоне и монотонны, validateRowSegMapping такой сдвиг поймать не может).
//   9) (ревью K2) window.AsrTranscript не загрузился (offline после бампа CACHE_VERSION) —
//      тайминг ПРОШЛОГО ответа обязан уйти с паспорта, а не остаться подсвечивать новую таблицу.
//  10) (K3, 2026-07-30) УЖЕ СОХРАНЁННАЯ карточка: строки восстановлены из Библиотеки без запроса,
//      индексов у них нет (segment_index в sentences не хранится), сохранённый тайминг вырожден
//      (живой отпечаток владельца o = segIdx − 1). v3RestoreMediaFromMeta обязана восстановить
//      караоке ОФЛАЙН выравниванием по тексту — 0 сетевых вызовов; независимый оракул проверяет,
//      что каждая запись указывает на строку СВОЕГО сегмента; подделанная строка → честный отказ.
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

// ── K2 fixture: премиум-ответ, построенный НАСТОЯЩИМ премиум-сегментатором ──────────────────
// Форму ответа не выдумываем: гоняем db/premium/segmenter.js ровно так, как это делает
// db/premium/pipeline.js (segment(normalizeForDisplay(text))), и превращаем сегменты в строки
// ответа теми же двумя полями. Каждая 3-я строка текста содержит ДВА предложения — значит,
// строк таблицы заметно больше сегментов, и вырожденный 1:1 физически невозможен.
const premiumSegmenter = require(path.join(REPO, "db", "premium", "segmenter.js"));
const { normalizeForDisplay } = require(path.join(REPO, "db", "premium", "normalize.js"));

const K2_LINES = Array.from({ length: N_SEGS }, (_, i) =>
  (i % 3 === 0) ? ("שורה " + i + ". עוד משפט " + i + ".") : ("שורה " + i));
const K2_TEXT = K2_LINES.join("\n");
const K2_IMPORT_SEGMENTS = K2_LINES.map((t, i) => ({ i, start: i * 5, text: t }));
const K2_SEGS = premiumSegmenter.segment(normalizeForDisplay(K2_TEXT));
const K2_ROWS = K2_SEGS.map((s) => ({
  segment_index: s.index,            // 1-based порядковый номер строки премиум-таблицы
  source_line_index: s.line_index,   // 0-based номер ИСХОДНОЙ строки = индекс ASR-сегмента
  he: s.he, he_niqqud: s.he, translit: "t" + s.index, ru: "r" + s.index,
}));

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
      // Scenario 4 (ревью K1): ПРЕМИУМ-ответ. Форма — как у db/premium/pipeline.js: строки несут
      // СВОЙ `segment_index` = 1-based порядковый номер предложения премиум-сегментатора. Это
      // поле-однофамилец, а не индекс ASR/субтитр-сегмента; именно оно давало вырожденное
      // караоке (STUDIO_KARAOKE_ROW_TIMING_MISMAP_2026_07_30).
      if (u.indexOf("/api/translate-table-v2") !== -1) {
        let pBody = {};
        try { pBody = JSON.parse((init && init.body) || "{}"); } catch (_) {}
        const pLines = String(pBody.text || "").split("\n").map((s) => s.trim()).filter(Boolean);
        window.__premiumCalls = (window.__premiumCalls || 0) + 1;
        window.__premiumSentText = pBody.text || "";
        // K2 (сценарии 6/7): готовые строки НАСТОЯЩЕГО премиум-сегментатора с source_line_index.
        // Без override остаётся до-K2-форма (сценарий 4a): только чужой 1-based segment_index.
        const pRows = Array.isArray(window.__premiumRows)
          ? window.__premiumRows
          : pLines.map((t, k) => ({ segment_index: k + 1, he: t, he_niqqud: t, translit: "t" + k, ru: "r" + k }));
        return new Response(JSON.stringify({ rows: pRows, fromCache: false, cacheKey: "premium-fake",
          provenance: { provider: "google-free", actual_provider: "google-free", cache_level: "none",
                        translator_version: "fake-premium", nikud_provider: "fake", nikud_degraded: false } }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      const isChunkReq = u.indexOf("/api/translate-table") !== -1;
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
async function preparePage(page, fixture) {
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
  }, { text: (fixture && fixture.text) || TEXT,
       segments: (fixture && fixture.segments) || IMPORT_SEGMENTS });
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

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 4 (ревью K1, 2026-07-30): ПРЕМИУМ-перевод импортированного медиа, затем
    // переключение на Gemini. Ровно путь владельца: google-free — ДЕФОЛТНЫЙ провайдер, импорт
    // его не переключает (только мягкая подсказка «для караоке включите Gemini»).
    //   4a — премиум-ответ несёт segment_index-однофамилец (1-based номер предложения СВОЕГО
    //        сегментатора). Караоке обязано честно отсутствовать, а не строиться 1:1 по чужому
    //        полю (до фикса K1 здесь возникал тайминг со сдвигом — живой брак: медиана 9 мин).
    //   4b — после подсказки владелец переключается на Gemini и переводит ещё раз: seg-режим и
    //        чанкование ОБЯЗАНЫ ожить. Производный вердикт премиум-прогона живёт ровно один
    //        ответ (V3_DERIVED_TIMING_DROPS) — иначе один премиум-перевод навсегда убивал бы
    //        караоке для этого импорта, а на длинном материале ещё и упирал бы в
    //        «текст слишком длинный для одной таблицы».
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.reload({ waitUntil: "load" });
    await preparePage(page);
    await page.evaluate(() => { document.getElementById("providerSelect").value = "google-free"; });
    await page.evaluate(() => { translateTable(); });

    const r4a = await pollUntil(page, (s) => s.rows === N_SEGS || !!s.err, 30000, 50);
    must(r4a.ok, "scenario4a: timed out waiting for the premium table; last=" + JSON.stringify(r4a.snap));
    must(!r4a.snap.err, "scenario4a: unexpected error banner: " + r4a.snap.err);

    const s4a = await page.evaluate(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      return { premiumCalls: window.__premiumCalls || 0, chunkCalls: window.__chunkCalls.length,
               tableLen: currentTableData.length,
               hasPassport: !!p, entries: p && p.timing ? p.timing.entries.length : 0,
               drop: p ? p.timingDropReason : null, detail: p ? p.timingDropDetail : null,
               barNote: (document.getElementById("v3MediaBarNote") || {}).textContent || "" };
    });
    must(s4a.premiumCalls === 1, "scenario4a: premium calls=" + s4a.premiumCalls + " expected 1");
    must(s4a.chunkCalls === 0, "scenario4a: /api/translate-table calls=" + s4a.chunkCalls + " expected 0 (premium path must not touch the seg endpoint)");
    must(s4a.tableLen === N_SEGS, "scenario4a: currentTableData.length=" + s4a.tableLen + " expected " + N_SEGS);
    must(s4a.hasPassport, "scenario4a: media passport lost — the rest of the scenario proves nothing");
    must(s4a.entries === 0, "scenario4a: karaoke timing was built from the PREMIUM response (" + s4a.entries + " entries) — premium rows[].segment_index is a foreign 1-based row ordinal, timing MUST be absent");
    must(s4a.drop === "NO_SEGMENT_MAPPING", "scenario4a: timingDropReason=" + JSON.stringify(s4a.drop) + " expected NO_SEGMENT_MAPPING (honest 'no mapping at all', R11)");
    must(s4a.detail === "NO_INDEX", "scenario4a: timingDropDetail=" + JSON.stringify(s4a.detail) + " expected NO_INDEX (R9 provenance of the refusal)");
    must(s4a.barNote && s4a.barNote.trim().length > 0, "scenario4a: media bar note is empty — the user must SEE that karaoke is off, not just silence");

    // 4b — переключение на Gemini (и сброс локального кэша таблицы: тот же текст иначе
    // короткозамкнётся в translateTable() до всякого запроса).
    await page.evaluate((k) => { try { localStorage.removeItem(k); } catch (_) {}
      document.getElementById("providerSelect").value = "gemini"; }, TABLE_CACHE_LS_KEY);
    await page.evaluate(() => { translateTable(); });

    const r4b = await pollUntil(page, (s) => s.chunksLen === 3 || !!s.err, 30000, 50);
    must(r4b.ok, "scenario4b: timed out; last=" + JSON.stringify(r4b.snap) +
      " — a premium translate must NOT permanently disable seg-mode/chunking for this import");
    must(!r4b.snap.err, "scenario4b: error banner after switching to Gemini: " + r4b.snap.err +
      " ('текст слишком длинный для одной таблицы' here = seg-mode was latched off by the premium run)");

    const s4b = await page.evaluate(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      return { tableLen: currentTableData.length, chunkCalls: window.__chunkCalls.slice(),
               entries: p && p.timing ? p.timing.entries.length : 0,
               drop: p ? p.timingDropReason : null, detail: p ? p.timingDropDetail : null,
               firstO: p && p.timing ? p.timing.entries[0].o : null,
               lastO: p && p.timing ? p.timing.entries[p.timing.entries.length - 1].o : null };
    });
    must(s4b.tableLen === N_SEGS, "scenario4b: currentTableData.length=" + s4b.tableLen + " expected " + N_SEGS);
    must(JSON.stringify(s4b.chunkCalls) === JSON.stringify([120, 120, 60]),
      "scenario4b: __chunkCalls=" + JSON.stringify(s4b.chunkCalls) + " expected [120,120,60]");
    must(s4b.entries === N_SEGS, "scenario4b: karaoke entries=" + s4b.entries + " expected " + N_SEGS +
      " — the Gemini retry after a premium translate MUST restore timing (derived drop-reason outlived its response)");
    must(s4b.drop === null || s4b.drop === undefined, "scenario4b: timingDropReason=" + JSON.stringify(s4b.drop) + " expected cleared");
    must(!s4b.detail, "scenario4b: timingDropDetail=" + JSON.stringify(s4b.detail) + " expected cleared — a successful timing must not carry a stale refusal diagnosis (R9)");
    must(s4b.firstO === 0 && s4b.lastO === N_SEGS - 1, "scenario4b: entries span o=" + s4b.firstO + ".." + s4b.lastO + " expected 0.." + (N_SEGS - 1));

    console.log("scenario4 OK — premium: no timing (" + s4a.drop + "/" + s4a.detail +
                "), Gemini retry: " + s4b.entries + " entries restored");

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 5 (ревью K1): КАРАНТИН уже сохранённого вырожденного тайминга. Фикс защищает
    // только новые ответы, а карточка владельца (та самая, 117 мин) уже лежит в Библиотеке с
    // вырожденным timing внутри table_model_meta_json — открытие такого текста обязано честно
    // выключить караоке, а не подсвечивать не ту строку (R11). Гоняем НАСТОЯЩУЮ
    // v3RestoreMediaFromMeta() живой страницы: currentTableData здесь = 300 строк из sc.4.
    // ══════════════════════════════════════════════════════════════════════════════════════
    const s5 = await page.evaluate((n) => {
      const mkSegs = (m) => Array.from({ length: m }, (_, i) => ({ i, start: i * 6.5, text: "s" + i }));
      // (a) вырожденный: 200 сегментов на 300 строк, o === индексу своего сегмента
      const segsA = mkSegs(200);
      const metaA = { source: { audio: { v: 1, segments: segsA, timingDropReason: null,
        timing: { v: 1, unit: "row", entries: segsA.map((s) => ({ o: s.i, t: s.start })) } } } };
      v3RestoreMediaFromMeta(metaA);
      const a = metaA.source.audio;
      // (b) честный 1:N на тех же 300 строках: 150 сегментов, по 2 строки на сегмент
      const segsB = mkSegs(150);
      const rowSegIdx = [];
      segsB.forEach((s) => { rowSegIdx.push(s.i, s.i); });
      const metaB = { source: { audio: { v: 1, segments: segsB, timingDropReason: null,
        timing: window.AsrTranscript.buildRowTiming(segsB, rowSegIdx) } } };
      v3RestoreMediaFromMeta(metaB);
      const b = metaB.source.audio;
      return { rowCount: currentTableData.length,
               aTiming: !!a.timing, aDrop: a.timingDropReason, aDetail: a.timingDropDetail,
               bEntries: b.timing ? b.timing.entries.length : 0, bDrop: b.timingDropReason };
    }, N_SEGS);
    must(s5.rowCount === N_SEGS, "scenario5: currentTableData.length=" + s5.rowCount + " expected " + N_SEGS);
    must(s5.aTiming === false, "scenario5a: a saved DEGENERATE timing survived text open — karaoke would confidently light the wrong row (R11)");
    must(s5.aDrop === "SEG_MAPPING_LOST", "scenario5a: timingDropReason=" + JSON.stringify(s5.aDrop) + " expected SEG_MAPPING_LOST (localized key exists)");
    must(s5.aDetail === "DEGENERATE_1_TO_1", "scenario5a: timingDropDetail=" + JSON.stringify(s5.aDetail) + " expected DEGENERATE_1_TO_1");
    must(s5.bEntries === 150, "scenario5b: an HONEST saved 1:N timing was quarantined (entries=" + s5.bEntries + ") — the quarantine must never eat good data");
    must(!s5.bDrop, "scenario5b: timingDropReason=" + JSON.stringify(s5.bDrop) + " expected untouched");

    console.log("scenario5 OK — degenerate saved timing quarantined (" + s5.aDrop + "/" + s5.aDetail +
                "), honest saved timing kept (" + s5.bEntries + " entries)");

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 6 (K2, 2026-07-30): ПРЕМИУМ С `source_line_index` — караоке ЕСТЬ и оно ВЕРНОЕ.
    // Это возврат моат-функции дефолтному провайдеру владельца (google-free) после того, как K1
    // честно её отключил. Ответ фейка построен НАСТОЯЩИМ db/premium/segmenter.js: 300 исходных
    // строк, каждая 3-я — из двух предложений, поэтому строк таблицы 400, а сегментов 300, и
    // вырожденный 1:1 невозможен by construction. Проверяем не «тайминг появился», а КУДА он
    // показывает (независимый оракул — тот же принцип, что в сценарии 4/5).
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.reload({ waitUntil: "load" });
    await preparePage(page, { text: K2_TEXT, segments: K2_IMPORT_SEGMENTS });
    await page.evaluate(({ rows }) => {
      window.__premiumRows = rows;
      document.getElementById("providerSelect").value = "google-free";
    }, { rows: K2_ROWS });
    await page.evaluate(() => { translateTable(); });

    const r6 = await pollUntil(page, (s) => s.rows === K2_ROWS.length || !!s.err, 30000, 50);
    must(r6.ok, "scenario6: timed out waiting for the premium table; last=" + JSON.stringify(r6.snap));
    must(!r6.snap.err, "scenario6: unexpected error banner: " + r6.snap.err);

    const s6 = await page.evaluate(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      const t = p && p.timing ? p.timing : null;
      // Независимый оракул, считается ЗДЕСЬ по факту отрисованной таблицы и паспорта:
      // сегмент восстанавливаем по его start (t), строку — по o, и требуем, чтобы строка
      // ссылалась ИМЕННО на этот сегмент. Ровно это врало в живом браке владельца.
      const bad = [];
      if (t) {
        const segByStart = new Map(p.segments.map((s) => [s.start, s.i]));
        t.entries.forEach((e) => {
          const segIdx = segByStart.get(e.t);
          const row = currentTableData[e.o];
          if (segIdx === undefined || !row || row.source_line_index !== segIdx) {
            bad.push({ o: e.o, t: e.t, segIdx: segIdx, rowLine: row ? row.source_line_index : "NO_ROW" });
          }
        });
      }
      return {
        premiumCalls: window.__premiumCalls || 0, chunkCalls: window.__chunkCalls.length,
        tableLen: currentTableData.length, segCount: p ? p.segments.length : 0,
        entries: t ? t.entries.length : 0, drop: p ? p.timingDropReason : null,
        detail: p ? p.timingDropDetail : null,
        firstOs: t ? t.entries.slice(0, 6).map((e) => e.o) : [],
        lastO: t ? t.entries[t.entries.length - 1].o : null,
        monotonic: t ? t.entries.every((e, i, a) => i === 0 || (e.o > a[i - 1].o && e.t >= a[i - 1].t)) : false,
        bad: bad.slice(0, 5), badCount: bad.length,
      };
    });
    must(s6.premiumCalls === 1, "scenario6: premium calls=" + s6.premiumCalls + " expected 1");
    must(s6.chunkCalls === 0, "scenario6: /api/translate-table calls=" + s6.chunkCalls + " expected 0");
    must(s6.tableLen === K2_ROWS.length, "scenario6: currentTableData.length=" + s6.tableLen + " expected " + K2_ROWS.length);
    must(s6.tableLen > s6.segCount, "scenario6: fixture is degenerate-proof only when rows(" + s6.tableLen + ") > segments(" + s6.segCount + ")");
    must(!s6.drop && !s6.detail, "scenario6: timing refused (" + s6.drop + "/" + s6.detail +
      ") — premium rows carry source_line_index, karaoke MUST be back on the owner's default provider");
    must(s6.entries === N_SEGS, "scenario6: karaoke entries=" + s6.entries + " expected " + N_SEGS + " (one per ASR segment)");
    must(s6.badCount === 0, "scenario6: " + s6.badCount + " timing entries point at a row that belongs to ANOTHER segment — " +
      JSON.stringify(s6.bad) + " (this is exactly the live defect)");
    must(s6.monotonic, "scenario6: timing entries are not strictly increasing in o / non-decreasing in t");
    // фингерпринт брака: o = 0,1,2,3,… подряд. Здесь каждая 3-я строка удваивается, поэтому
    // честные o = 0,2,3,4,6,7,… — если увидим 0,1,2,3,4,5, значит маппинг снова вырожден.
    must(JSON.stringify(s6.firstOs) === JSON.stringify([0, 2, 3, 4, 6, 7]),
      "scenario6: first entries o=" + JSON.stringify(s6.firstOs) + " expected [0,2,3,4,6,7] (degenerate would be [0,1,2,3,4,5])");
    must(s6.lastO === K2_ROWS.length - 1, "scenario6: last entry o=" + s6.lastO + " expected " + (K2_ROWS.length - 1));

    console.log("scenario6 OK — premium karaoke restored: " + s6.entries + " entries over " +
                s6.tableLen + " rows / " + s6.segCount + " segments, 0 cross-segment entries");

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 7 (K2): текст переразбит — «строка = ASR-сегмент» больше не выполняется.
    // source_line_index в ответе всё ещё есть, и все проверки формы он проходит — но означает
    // уже НЕ то. Единственный честный исход: караоке нет, а верный тайминг прошлого ответа
    // НЕ остаётся висеть на паспорте (R11: устаревший тайминг = уверенно неверная подсветка).
    // ══════════════════════════════════════════════════════════════════════════════════════
    await page.evaluate((k) => {
      try { localStorage.removeItem(k); } catch (_) {}
      const input = document.getElementById("inputText");
      input.value = input.value + "\nשורה נוספת שלא הייתה בייבוא";   // 301 строка на 300 сегментов
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, TABLE_CACHE_LS_KEY);
    await page.evaluate(() => { translateTable(); });

    // Число строк здесь НЕ признак завершения (таблица сценария 6 уже отрисована ровно такой
    // длины) — ждём второй премиум-вызов И снятый тайминг, т.е. факт вынесенного вердикта.
    try {
      await page.waitForFunction(() => {
        const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
        return (window.__premiumCalls || 0) >= 2 && !!p && !p.timing;
      }, { timeout: 30000 });
    } catch (_) {
      const st = await page.evaluate(() => {
        const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
        return { calls: window.__premiumCalls || 0, entries: p && p.timing ? p.timing.entries.length : 0,
                 drop: p ? p.timingDropReason : null, err: (document.getElementById("errorMsg") || {}).textContent || "" };
      });
      throw new SmokeFail("scenario7: timed out waiting for the honest verdict; state=" + JSON.stringify(st) +
        " — a re-split text must drop karaoke, not keep the previous response's timing (R11)");
    }
    const err7 = await page.evaluate(() => (document.getElementById("errorMsg").textContent || "").trim());
    must(!err7, "scenario7: unexpected error banner: " + err7);

    const s7 = await page.evaluate(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      return { premiumCalls: window.__premiumCalls || 0,
               entries: p && p.timing ? p.timing.entries.length : 0,
               drop: p ? p.timingDropReason : null, detail: p ? p.timingDropDetail : null };
    });
    must(s7.premiumCalls === 2, "scenario7: premium calls=" + s7.premiumCalls + " expected 2 (the edited text was actually re-translated)");
    must(s7.entries === 0, "scenario7: karaoke kept " + s7.entries + " entries after the text was re-split — " +
      "line index no longer means segment index, timing MUST be dropped (R11)");
    must(s7.drop === "NO_SEGMENT_MAPPING", "scenario7: timingDropReason=" + JSON.stringify(s7.drop) + " expected NO_SEGMENT_MAPPING");

    console.log("scenario7 OK — re-split text: karaoke honestly dropped (" + s7.drop + "/" + s7.detail + ")");

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 8 (ревью K2, 2026-07-30): seg-режим Gemini НЕ ЗАПУСКАЕТСЯ на переразбитом тексте.
    //
    // v3MediaLineIdentity() — единственное место, где проверяется идентичность «одна строка =
    // один ASR-сегмент», и у неё ДВА потребителя. Премиум-ветку страхует повторная сверка в
    // v3AttachAudioTiming (сценарий 7), а seg-режим Gemini — НЕТ, и застраховать её там нечем:
    // v3AudioSegmentsForRequest() отправляет ТЕКУЩИЕ строки как `segments`, модель возвращает
    // индексы в ИХ нумерации, а buildRowTiming кладёт их на сегменты ИМПОРТА.
    //
    // Строк здесь МЕНЬШЕ, чем сегментов (удалена первая строка) — это худший случай: все индексы
    // остаются в диапазоне [0,segCount), не убывают и непрерывны, значит validateRowSegMapping
    // проходит, а тайминг оказывается СДВИНУТ на удалённую строку. Молчаливо неверная подсветка —
    // ровно живой брак владельца (STUDIO_KARAOKE_ROW_TIMING_MISMAP), только с другого входа.
    // Мутационная проверка: удаление строки `lines.length !== p.segments.length` из
    // v3MediaLineIdentity() оставляло ВЕСЬ набор гейтов зелёным — этот сценарий закрывает дыру.
    //
    // Фикстура намеренно маленькая (10 строк): на 300 строках сработал бы гейт
    // «текст слишком длинный для одной таблицы» и путь до отправки просто не дошёл бы.
    // ══════════════════════════════════════════════════════════════════════════════════════
    const S8_N = 10;
    const S8_LINES = Array.from({ length: S8_N }, (_, i) => "משפט מספר " + i + " לבדיקה");
    const S8_TEXT = S8_LINES.join("\n");
    const S8_SEGMENTS = S8_LINES.map((t, i) => ({ i, start: i * 7, text: t }));

    await page.reload({ waitUntil: "load" });   // сбрасывает __fakeCache/__chunkCalls этой страницы
    await preparePage(page, { text: S8_TEXT, segments: S8_SEGMENTS });
    await page.evaluate(() => { translateTable(); });

    // 8a — базлайн: нетронутый импорт ⇒ seg-режим работает и караоке строится.
    await page.waitForFunction((n) => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      return (window.__chunkCalls || []).length >= 1 && !!p && !!p.timing && p.timing.entries.length === n;
    }, S8_N, { timeout: 30000 }).catch(() => {});
    const s8a = await page.evaluate(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      return { calls: (window.__chunkCalls || []).slice(), entries: p && p.timing ? p.timing.entries.length : 0,
               drop: p ? p.timingDropReason : null, err: (document.getElementById("errorMsg").textContent || "").trim() };
    });
    must(!s8a.err, "scenario8a: unexpected error banner: " + s8a.err);
    must(JSON.stringify(s8a.calls) === JSON.stringify([S8_N]),
      "scenario8a: __chunkCalls=" + JSON.stringify(s8a.calls) + " expected [" + S8_N + "] (seg-режим обязан был отправить сегменты)");
    must(s8a.entries === S8_N, "scenario8a: karaoke entries=" + s8a.entries + " expected " + S8_N +
      " — базлайн сценария обязан быть рабочим seg-режимом, иначе 8b ничего не доказывает");

    // 8b — удаляем ПЕРВУЮ строку: строк 9, сегментов 10. Идентичность нарушена.
    await page.evaluate((k) => {
      try { localStorage.removeItem(k); } catch (_) {}
      const input = document.getElementById("inputText");
      input.value = input.value.split("\n").slice(1).join("\n");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, TABLE_CACHE_LS_KEY);
    await page.evaluate(() => { translateTable(); });

    await page.waitForFunction(() => (window.__chunkCalls || []).length >= 2, { timeout: 30000 }).catch(() => {});
    // Вердикт выносится в том же тике, что и ответ; дождёмся снятого тайминга ИЛИ таймаута.
    await page.waitForFunction(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      return (window.__chunkCalls || []).length >= 2 && !!p && !p.timing;
    }, { timeout: 15000 }).catch(() => {});

    const s8b = await page.evaluate(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      const t = p && p.timing ? p.timing : null;
      return { calls: (window.__chunkCalls || []).slice(),
               entries: t ? t.entries.length : 0, firstEntries: t ? t.entries.slice(0, 3) : [],
               drop: p ? p.timingDropReason : null, detail: p ? p.timingDropDetail : null,
               rows: (typeof currentTableData !== "undefined" && currentTableData) ? currentTableData.length : 0,
               err: (document.getElementById("errorMsg").textContent || "").trim() };
    });
    must(!s8b.err, "scenario8b: unexpected error banner: " + s8b.err);
    must(s8b.calls.length === 2, "scenario8b: fetch-вызовов " + s8b.calls.length + ", ожидался 2-й перевод; calls=" + JSON.stringify(s8b.calls));
    must(s8b.calls[1] === 0, "scenario8b: второй запрос ушёл с " + s8b.calls[1] + " сегментами — текст переразбит " +
      "(строк 9, сегментов " + S8_N + "), «строка = ASR-сегмент» больше НЕ выполняется, seg-режим слать НЕЛЬЗЯ: " +
      "индексы придут в нумерации новых строк, а тайминг ляжет на сегменты импорта (сдвиг = молчаливо неверное караоке)");
    must(s8b.entries === 0, "scenario8b: караоке построено (" + s8b.entries + " записей, первые " +
      JSON.stringify(s8b.firstEntries) + ") на переразбитом тексте — сдвинутый тайминг хуже его отсутствия (R11)");
    must(s8b.drop === "NO_SEGMENT_MAPPING" || s8b.drop === "SEG_MAPPING_LOST",
      "scenario8b: timingDropReason=" + JSON.stringify(s8b.drop) + " — отказ обязан быть виден в паспорте");

    console.log("scenario8 OK — re-split text (lines " + (S8_N - 1) + " < segments " + S8_N + "): " +
                "seg-mode not sent (" + JSON.stringify(s8b.calls) + "), karaoke honestly absent (" + s8b.drop + "/" + s8b.detail + ")");

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 9 (ревью K2): window.AsrTranscript не загрузился ⇒ СТАРЫЙ тайминг обязан УЙТИ.
    //
    // «Модуль не подъехал» — не гипотетика: рядом в этом же файле живёт явный guard
    // `window.TableChunks` с комментарием «offline right after a CACHE_VERSION bump before it's
    // precached» (а K2 как раз бампит CACHE_VERSION). До фикса v3AttachAudioTiming честно
    // обнулял тайминг в else-ветке, НЕ трогая AsrTranscript; K1/K2 подняли вызов
    // validateRowSegMapping() ВЫШЕ развилки, поэтому отсутствие модуля стало бросать ДО
    // `audio.timing = null`. Внешний try/catch глотает исключение — и на паспорте остаётся
    // тайминг ПРОШЛОГО ответа, который StudioMediaKaraoke с удовольствием проиграет поверх
    // новой таблицы. Это ровно запрещённый путь «молчаливо неверная подсветка» (R11).
    // ══════════════════════════════════════════════════════════════════════════════════════
    const S9_LINES = Array.from({ length: 8 }, (_, i) => "פסקה " + i + " לבדיקת מודול");
    const S9_TEXT = S9_LINES.join("\n");
    const S9_SEGMENTS = S9_LINES.map((t, i) => ({ i, start: i * 4, text: t }));

    await page.reload({ waitUntil: "load" });
    await preparePage(page, { text: S9_TEXT, segments: S9_SEGMENTS });
    await page.evaluate(() => { translateTable(); });
    await page.waitForFunction((n) => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      return !!p && !!p.timing && p.timing.entries.length === n;
    }, S9_LINES.length, { timeout: 30000 });

    // Модуль «пропадает» ПОСЛЕ того, как тайминг уже лёг на паспорт.
    await page.evaluate((k) => {
      try { localStorage.removeItem(k); } catch (_) {}
      window.__asrBackup = window.AsrTranscript;
      try { delete window.AsrTranscript; } catch (_) { window.AsrTranscript = undefined; }
    }, TABLE_CACHE_LS_KEY);
    await page.evaluate(() => { translateTable(); });
    await page.waitForFunction(() => (window.__chunkCalls || []).length >= 2, { timeout: 30000 });
    await sleep(400); // ответ обработан в этом же тике; даём success-handler'у добежать

    const s9 = await page.evaluate(() => {
      const p = v3MediaPassport(v3LastGeminiMeta && v3LastGeminiMeta.source);
      const t = p && p.timing ? p.timing : null;
      const active = window.v3ActiveMediaAudio;
      return { entries: t ? t.entries.length : 0, drop: p ? p.timingDropReason : null,
               activeHasTiming: !!(active && active.timing),
               calls: (window.__chunkCalls || []).length };
    });
    await page.evaluate(() => { if (window.__asrBackup) window.AsrTranscript = window.__asrBackup; });

    must(s9.calls >= 2, "scenario9: второй перевод не состоялся (calls=" + s9.calls + ")");
    must(s9.entries === 0, "scenario9: на паспорте остался тайминг ПРОШЛОГО ответа (" + s9.entries +
      " записей) после того, как window.AsrTranscript не загрузился — StudioMediaKaraoke проиграет его " +
      "поверх новой таблицы. Устаревший тайминг = уверенно неверная подсветка (R11): обнулять ДО " +
      "любого обращения к модулю, как это делала else-ветка до K1/K2");
    must(!s9.activeHasTiming, "scenario9: window.v3ActiveMediaAudio всё ещё несёт тайминг — медиа-бар покажет «Караоке ✓»");
    must(!!s9.drop, "scenario9: отказ не отражён в паспорте (timingDropReason=" + JSON.stringify(s9.drop) + ") — R11: причина обязана быть видна");

    console.log("scenario9 OK — AsrTranscript missing: stale timing dropped honestly (" + s9.drop + ")");

    // ══════════════════════════════════════════════════════════════════════════════════════
    // Scenario 10 (K3, 2026-07-30): УЖЕ СОХРАНЁННАЯ КАРТОЧКА чинится ОФЛАЙН, без запросов.
    //
    // K1/K2 живут только в сессии импорта: у сохранённой карточки строки восстанавливаются из
    // Библиотеки вообще без запроса, а v3LastImportMeta при открытии текста обнулён. Единственное,
    // что осталось в карточке, — сегменты в паспорте и строки таблицы; связь между ними
    // восстанавливается ПО ТЕКСТУ (AsrTranscript.alignRowsToSegments) прямо в v3RestoreMediaFromMeta.
    //
    // Гоняем НАСТОЯЩУЮ v3RestoreMediaFromMeta() живой страницы на паспорте формы владельца:
    // строк заметно больше сегментов (каждая 3-я строка = два предложения — фикстура сценария 6,
    // построенная НАСТОЯЩИМ db/premium/segmenter.js), сохранённый тайминг вырожден ровно так, как
    // на живой карточке (o = индекс сегмента − 1, 1-based премиумный segment_index).
    //   10a — караоке восстановлено, независимый оракул: каждая запись указывает на строку СВОЕГО
    //         сегмента (сегмент восстанавливаем по метке t, принадлежность — по ТЕКСТУ строки);
    //   10b — ни одного сетевого вызова за время сценария (офлайн И бесплатно);
    //   10c — подделана ОДНА строка → честный отказ, караоке нет, карантин остаётся.
    // ══════════════════════════════════════════════════════════════════════════════════════
    const s10 = await page.evaluate(({ lines, rows }) => {
      // Паспорт как в сохранённой карточке: сегменты = строки импорта (одна строка = один
      // ASR-сегмент), timing — ВЫРОЖДЕННЫЙ (живой отпечаток владельца: o = segIdx − 1).
      const segs = lines.map((t, i) => ({ i, start: i * 5, text: t }));
      const degenerate = { v: 1, unit: "row",
        entries: segs.filter((s) => s.i >= 1).map((s) => ({ o: s.i - 1, t: s.start })) };
      const mkMeta = () => ({ source: { audio: { v: 1, segments: segs.map((s) => ({ ...s })),
        timing: { v: 1, unit: "row", entries: degenerate.entries.map((e) => ({ ...e })) },
        timingDropReason: null } } });
      const table = rows.map((r) => ({ he: r.he, he_niqqud: r.he_niqqud, translit: r.translit, ru: r.ru }));
      // строки таблицы БЕЗ каких-либо индексов — ровно то, что лежит в sentences (segment_index
      // там не хранится вовсе); currentTableData подменяем на них, как это делает открытие текста.
      currentTableData = table;

      const netBefore = window.__chunkCalls.length + (window.__premiumCalls || 0);
      const metaA = mkMeta();
      const t0 = performance.now();
      v3RestoreMediaFromMeta(metaA, table);
      const ms = Math.round(performance.now() - t0);
      const a = metaA.source.audio;
      const netAfter = window.__chunkCalls.length + (window.__premiumCalls || 0);

      // ── независимый оракул (считается ЗДЕСЬ, из паспорта и отрисованных строк) ──
      const norm = (s) => String(s == null ? "" : s).normalize("NFKC")
        .replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
      const bad = [];
      if (a.timing) {
        const byStart = new Map(a.segments.map((s) => [s.start, s.i]));
        a.timing.entries.forEach((e) => {
          const segIdx = byStart.get(e.t);
          const row = table[e.o];
          const segText = segIdx === undefined ? null : norm(a.segments[segIdx].text);
          // строка записи обязана быть НАЧАЛОМ текста своего сегмента — иначе запись указывает
          // на строку чужого сегмента (ровно живой брак владельца)
          if (!row || segText === null || segText.indexOf(norm(row.he)) !== 0) {
            bad.push({ o: e.o, t: e.t, segIdx });
          }
        });
      }

      // 10c — подделана одна строка (владелец поправил текст / модель переписала)
      const tampered = table.map((r, i) => (i === 5 ? { ...r, he: r.he + " מילה נוספת" } : r));
      const metaB = mkMeta();
      v3RestoreMediaFromMeta(metaB, tampered);
      const b = metaB.source.audio;
      // 10d — тот же отказ, но паспорт БЕЗ прежнего тайминга и без диагноза: тогда причина
      // отказа выравнивания обязана попасть в timingDropDetail (иначе владелец нем).
      const metaC = mkMeta();
      metaC.source.audio.timing = null;
      v3RestoreMediaFromMeta(metaC, tampered);
      const c = metaC.source.audio;
      // 10e — сохранённый тайминг, который карантин K1 НЕ ловит (сдвиг на 3, не локстеп 0/−1), но
      // проверить его нечем. Доказанный текстом маппинг обязан его ЗАМЕНИТЬ: доказательство
      // сильнее утверждения (R11 «источник-истины > самоотчёт»).
      const metaD = mkMeta();
      metaD.source.audio.timing = { v: 1, unit: "row",
        entries: segs.filter((s) => s.i >= 3).map((s) => ({ o: s.i + 3, t: s.start })) };
      const dQuarantined = window.AsrTranscript.timingLooksDegenerate(
        metaD.source.audio.timing, metaD.source.audio.segments, table.length);
      v3RestoreMediaFromMeta(metaD, table);
      const d = metaD.source.audio;

      return {
        ms, net: netAfter - netBefore,
        rows: table.length, segs: segs.length,
        savedEntries: degenerate.entries.length,
        entries: a.timing ? a.timing.entries.length : 0,
        firstOs: a.timing ? a.timing.entries.slice(0, 6).map((e) => e.o) : [],
        lastO: a.timing ? a.timing.entries[a.timing.entries.length - 1].o : null,
        source: a.timingSource || null, align: a.timingAlign || null,
        drop: a.timingDropReason, detail: a.timingDropDetail,
        badCount: bad.length, bad: bad.slice(0, 5),
        activeHasTiming: !!(window.v3ActiveMediaAudio && window.v3ActiveMediaAudio.timing),
        tamperedEntries: b.timing ? b.timing.entries.length : 0,
        tamperedDrop: b.timingDropReason, tamperedDetail: b.timingDropDetail,
        tamperedAlignOk: b.timingAlign ? b.timingAlign.ok : null,
        tamperedAlignReason: b.timingAlign ? b.timingAlign.reason : null,
        noTimingEntries: c.timing ? c.timing.entries.length : 0,
        noTimingDrop: c.timingDropReason, noTimingDetail: c.timingDropDetail,
        shiftQuarantined: dQuarantined,
        shiftEntries: d.timing ? d.timing.entries.length : 0,
        shiftFirstOs: d.timing ? d.timing.entries.slice(0, 6).map((e) => e.o) : [],
        shiftSource: d.timingSource || null,
        shiftReplaced: d.timingAlign ? d.timingAlign.replaced : null,
      };
    }, { lines: K2_LINES, rows: K2_ROWS });

    must(s10.rows > s10.segs, "scenario10: фикстура доказательна только при строках(" + s10.rows + ") > сегментов(" + s10.segs + ")");
    must(s10.net === 0, "scenario10b: за восстановление ушло " + s10.net + " сетевых вызовов — оживление обязано быть ОФЛАЙН и бесплатным (ASR уже оплачен)");
    must(s10.entries === s10.segs, "scenario10a: записей караоке " + s10.entries + ", ожидалось " + s10.segs +
      " (по одной на сегмент) — сохранённая карточка обязана получить караоке БЕЗ повторного импорта");
    must(s10.badCount === 0, "scenario10a: " + s10.badCount + " записей указывают на строку ЧУЖОГО сегмента: " +
      JSON.stringify(s10.bad) + " — это ровно живой брак владельца, только восстановленный офлайн");
    must(JSON.stringify(s10.firstOs) === JSON.stringify([0, 2, 3, 4, 6, 7]),
      "scenario10a: первые o=" + JSON.stringify(s10.firstOs) + " ожидались [0,2,3,4,6,7] (вырожденный локстеп дал бы [0,1,2,3,4,5])");
    must(s10.lastO === s10.rows - 1, "scenario10a: последняя запись o=" + s10.lastO + " ожидалась " + (s10.rows - 1) +
      " — сохранённый вырожденный тайминг обрывался на " + s10.savedEntries + " записях, хвост таблицы не подсвечивался вовсе");
    must(!s10.drop && !s10.detail, "scenario10a: тайминг восстановлен, но паспорт всё ещё несёт отказ (" + s10.drop + "/" + s10.detail + ")");
    must(s10.source === "aligned-offline", "scenario10a: timingSource=" + JSON.stringify(s10.source) +
      " — R9: восстановленный тайминг ОБЯЗАН быть помечен как выведенный, а не как присланный переводчиком");
    must(s10.align && s10.align.ok === true && s10.align.alignedRows === s10.rows &&
         s10.align.alignedSegments === s10.segs && s10.align.entries === s10.segs,
      "scenario10a: провенанс выравнивания неполон: " + JSON.stringify(s10.align));
    must(s10.activeHasTiming, "scenario10a: window.v3ActiveMediaAudio без тайминга — медиа-бар не покажет караоке");
    must(s10.tamperedEntries === 0, "scenario10c: строка подделана, а караоке построено (" + s10.tamperedEntries +
      " записей) — маппинг принят на веру вместо доказательства текстом (R11)");
    must(s10.tamperedAlignOk === false &&
         (s10.tamperedAlignReason === "ROW_NOT_IN_SEGMENT" || s10.tamperedAlignReason === "SEGMENT_UNCOVERED"),
      "scenario10c: отказ выравнивания не отражён в провенансе (ok=" + s10.tamperedAlignOk +
      ", reason=" + JSON.stringify(s10.tamperedAlignReason) + ")");
    must(s10.tamperedDrop === "SEG_MAPPING_LOST", "scenario10c: timingDropReason=" + JSON.stringify(s10.tamperedDrop) + " ожидался SEG_MAPPING_LOST");
    must(s10.tamperedDetail === "DEGENERATE_1_TO_1",
      "scenario10c: диагноз карантина K1 затёрт диагнозом выравнивания (detail=" + JSON.stringify(s10.tamperedDetail) +
      ") — он первичен: объясняет, почему СОХРАНЁННЫЙ тайминг снят");
    // 10d — паспорт без прежнего диагноза: причина отказа выравнивания обязана быть видна
    must(s10.noTimingEntries === 0, "scenario10d: караоке построено на подделанных строках");
    must(s10.noTimingDrop === "SEG_MAPPING_LOST" && /^ALIGN_/.test(String(s10.noTimingDetail || "")),
      "scenario10d: отказ немой (" + s10.noTimingDrop + "/" + s10.noTimingDetail + ") — владелец обязан видеть причину");
    // 10e — непроверяемое утверждение против доказательства
    must(s10.shiftQuarantined === false,
      "scenario10e: фикстура бессмысленна — сдвинутый тайминг обязан ПЕРЕЖИТЬ карантин K1, иначе замена не проверяется");
    must(s10.shiftEntries === s10.segs && JSON.stringify(s10.shiftFirstOs) === JSON.stringify(s10.firstOs),
      "scenario10e: сохранённый сдвинутый тайминг пережил доказанное выравнивание (entries=" + s10.shiftEntries +
      ", первые o=" + JSON.stringify(s10.shiftFirstOs) + ") — доказательство обязано побеждать самоотчёт (R11)");
    must(s10.shiftSource === "aligned-offline" && s10.shiftReplaced === true,
      "scenario10e: замена не помечена в провенансе (source=" + JSON.stringify(s10.shiftSource) + ", replaced=" + s10.shiftReplaced + ")");

    console.log("scenario10 OK — saved card revived offline: " + s10.entries + " entries over " + s10.rows +
                " rows / " + s10.segs + " segments, 0 cross-segment, " + s10.net + " network calls, " + s10.ms + " ms; " +
                "tampered row → honest refusal (" + s10.tamperedAlignReason + "), unverifiable saved timing replaced");

    console.log("SMOKE OK");
  } finally {
    await browser.close();
    await stop(srv.c);
  }
})().catch((e) => {
  console.error("FAIL: " + (e && e.message ? e.message : e));
  process.exit(1);
});
