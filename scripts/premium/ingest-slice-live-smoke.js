#!/usr/bin/env node
"use strict";
// scripts/premium/ingest-slice-live-smoke.js
//
// W2-S12.5 T6 · ЖИВОЙ ГЕЙТ ЗАКРЫТИЯ СЛАЙСА (реальный ключ, реальное длинное аудио).
// Правило слайса: «без чистого прогона на реальном длинном аудио S12.5 не закрыт»
// (дизайн §7, docs/planning/STUDIO_INGEST_S12_5_AUDIO_SLICING_DESIGN_2026_07_29.md).
//
// ЧТО ЛОВИТ. Брак v3.11.264 (диагноз docs/research/studio-ingest-longmedia/2026-07-29/
// DIAGNOSIS_S12_LIVE_DEFECT_2026_07_29.md): при range-промте по ОДНОМУ длинному fileUri модель
// на глубоких офсетах отдавала ЧУЖОЙ звук с подделанными in-range метками. Все метко-ключёванные
// гейты (клип/швы/дыры/добор) были слепы: 47% таймлайна потерялось, а `coverageGaps` был пуст.
// Метка — свидетель, которого подкупили; поэтому здесь оракул ВНЕШНИЙ по отношению к меткам:
//   • дубль-6-шинглы итогового ТЕКСТА (реплей чужого куска виден как повтор дословных n-грамм);
//   • корзины покрытия против тайм-меченого ЭТАЛОНА владельца (--subs): пустая корзина = кусок
//     таймлайна не транскрибирован вообще, независимо от того, что модель написала в метках.
// Замер: брак 11.8–22.2% дублей / 14 нулевых корзин; проба A (нарезка звука) 0.4% / 0 (§6).
//
// КАК РАБОТАЕТ. Тот же путь, что прод-транспорт `sliced-mp3`, но собранный из ПРОДОВЫХ модулей
// (Node-ветки dual-export), а не скопированный: Mp3Slice.buildFrameMap/sliceChunks (нарезка mp3
// по фрейм-границам) → окна AsrTranscript.asrWindows → на КАЖДЫЙ чанк свой аплоад в Files API →
// ASR ПРОСТЫМ ASR_PROMPT (без range-промта: чанк сам себе диапазон) → метки чанка + его
// детерминированный офсет → stitchWindowSegments/mergeWindowSegments → findCoverageGaps.
//
// ЗАПУСК:
//   node scripts/premium/ingest-slice-live-smoke.js --file=<audio.mp3> --dry     # без сети и трат
//   node scripts/premium/ingest-slice-live-smoke.js --file=<audio.mp3> --subs=<эталон.txt>
//   npm run smoke:ingest-slice-live -- --file=<audio.mp3> --subs=<эталон.txt>
// Ключ: INGEST_SMOKE_GEMINI_KEY (фолбэк GEMINI_API_KEY из .env). В лог уходят только последние
// 4 символа. Free-tier даёт ~20 запросов/день — прогон РЕЗЮМИРУЕМЫЙ: результаты чанков лежат в
// <out>/slice-smoke-state.json, повторный запуск догоняет только невыполненные чанки. 429 с
// `PerDay` в теле = дневная квота: выходим сразу (exit 2), ретраи бессмысленны.
//
// ГЕЙТЫ (exit 0 — все PASS; exit 2 — квота; exit 3 — гейт провален; exit 1 — ошибка/аргументы):
//   G1 чанки       все чанки выполнены и дали сегменты (пропуск = дыра в таймлайне);
//   G2 дубли       доля повторных 6-словных шинглов итогового текста < 3%;
//   G3 корзины     (нужен --subs) нулевых корзин покрытия из 40 == 0;
//   G4 хвост       (нужен --subs) макс. сматченная минута эталона ≥ 95% длительности файла.
//   WARN coverageGaps — печатаются мм:сс, но гейт НЕ валят: «обрыв вывода чанка» — живой класс
//   (проба A: чанк 3 оборвался на rel 727с/930), его лечит heal, а smoke обязан его ПОКАЗАТЬ.
//
// ПРИВАТНОСТЬ: аудио владельца — личный контент. Скрипт печатает ТОЛЬКО числа и метаданные;
// транскрипт и резюм-состояние пишутся в --out (по умолчанию .tmp/slice-smoke/ = gitignored).
// НИЧЕГО из --out не коммитить и не пересылать.

const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = path.resolve(__dirname, "..", "..");
try { require("dotenv").config({ path: path.join(REPO, ".env") }); } catch (_) {}

const A = require(path.join(REPO, "public", "js", "asr-transcript.js"));
const GF = require(path.join(REPO, "public", "js", "gemini-files.js"));
const MS = require(path.join(REPO, "public", "js", "mp3-slice.js"));

// ── аргументы (поддержаны обе формы: --file=X и --file X) ─────────────────────────────────
function arg(name, dflt) {
  const pre = "--" + name;
  for (let i = 2; i < process.argv.length; i++) {
    const a = String(process.argv[i]);
    if (a === pre) {
      const nx = process.argv[i + 1];
      return nx != null && !String(nx).startsWith("--") ? String(nx) : "";
    }
    if (a.startsWith(pre + "=")) return a.slice(pre.length + 1);
  }
  return dflt;
}
function flag(name) { return arg(name, null) !== null; }

const USAGE = [
  "S12.5 live smoke — живой гейт закрытия слайса (нарезка звука вместо range-промта).",
  "",
  "  node scripts/premium/ingest-slice-live-smoke.js --file=<audio.mp3> [опции]",
  "",
  "  --file=<path.mp3>   ОБЯЗАТЕЛЕН. Длинное mp3 (проба слайса — 117 мин).",
  "  --subs=<path.txt>   Тайм-меченый эталон (тройки «метка / длительность / текст»).",
  "                      Без него гейты покрытия G3/G4 НЕ проверяются (слайс не закрыт).",
  "  --out=<dir>         Куда класть транскрипт и резюм-состояние (по умолчанию .tmp/slice-smoke).",
  "  --probed-duration-sec=<N>  Независимо измеренная длительность для isSliceable (см. ниже).",
  "  --dry               Только фрейм-карта и границы чанков: без сети, без ключа, без трат.",
  "  --help              Эта справка.",
  "",
  "  Ключ: INGEST_SMOKE_GEMINI_KEY (фолбэк GEMINI_API_KEY из .env). Free-tier = ~20 запросов/день;",
  "  прогон резюмируемый — повторный запуск догоняет невыполненные чанки.",
  "  Приватность: транскрипт остаётся в --out (.tmp = gitignored), в лог идут только числа.",
].join("\n");

if (flag("help")) { console.log(USAGE); process.exit(0); }

const FILE = arg("file", "");
const SUBS = arg("subs", "");
const OUT_DIR = path.resolve(arg("out", path.join(REPO, ".tmp", "slice-smoke")));
const DRY = flag("dry");
const PROBED_DUR = arg("probed-duration-sec", null);

if (!FILE) { console.error("ERROR: обязателен --file=<path.mp3>\n\n" + USAGE); process.exit(1); }
const AUDIO = path.resolve(FILE);
if (!fs.existsSync(AUDIO) || !fs.statSync(AUDIO).isFile()) {
  console.error("ERROR: файл не найден: " + AUDIO);
  process.exit(1);
}
if (SUBS && !fs.existsSync(SUBS)) { console.error("ERROR: эталон --subs не найден: " + path.resolve(SUBS)); process.exit(1); }

const KEY = process.env.INGEST_SMOKE_GEMINI_KEY || process.env.GEMINI_API_KEY || "";
if (!DRY && !/^(AIza|AQ\.)/.test(KEY)) {
  console.error([
    "ERROR: нужен реальный Gemini-ключ (AIza…|AQ.…).",
    "  set INGEST_SMOKE_GEMINI_KEY=<ключ>   (или GEMINI_API_KEY в .env проекта)",
    "  ключи выдаёт aistudio.google.com (консоли GCP-credentials дают 403 на generativelanguage)",
    "  для проверки нарезки без сети и трат: --dry",
  ].join("\n"));
  process.exit(1);
}

const MIME = "audio/mpeg";
const ASR_CALL_TIMEOUT_MS = 600000; // прод-AbortController (360с) здесь не применяем: окно чанка
                                    // может идти дольше; свой предел — чтобы висяк не был вечным.
const DUP_SHINGLE_MAX_PCT = 3;      // §6: брак 11.8–22.2%, проба A 0.4%
const COVER_BINS = 40;              // §6: 40 корзин по всей длительности; брак 14 нулевых, проба 0
const TAIL_MATCH_MIN_FRAC = 0.95;   // макс. сматченная минута эталона / длительность файла

// ── утилиты вывода ────────────────────────────────────────────────────────────────────────
function mb(bytes) { return (bytes / 1048576).toFixed(1) + "MB"; }
function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
  return h ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── HTTP ASR-вызов (plain ASR_PROMPT — чанк сам себе диапазон) ────────────────────────────
function asrCall(fileUri) {
  const r = GF.buildAsrRequest(KEY, fileUri, MIME, A.ASR_PROMPT);
  const u = new URL(r.url);
  return new Promise((resolve, reject) => {
    let settled = false;
    let wall = null;
    const finish = (fn, v) => { if (settled) return; settled = true; if (wall) clearTimeout(wall); fn(v); };
    const req = https.request(
      { host: u.host, path: u.pathname + u.search, method: "POST", headers: r.init.headers },
      (res) => {
        const parts = [];
        res.on("data", (c) => parts.push(c));
        res.on("end", () => {
          const body = Buffer.concat(parts).toString("utf8");
          if (res.statusCode !== 200) {
            const e = new Error("HTTP " + res.statusCode + ": " + body.slice(0, 300));
            e.status = res.statusCode;
            e.body = body;
            return finish(reject, e);
          }
          try {
            const data = JSON.parse(body);
            const content = ((data.candidates || [])[0] || {}).content;
            finish(resolve, ((content && content.parts) || []).map((p) => p.text || "").join(""));
          } catch (e) { finish(reject, e); }
        });
      }
    );
    wall = setTimeout(() => { req.destroy(new Error("ASR_CALL_TIMEOUT: один вызов вышел за 600с")); }, ASR_CALL_TIMEOUT_MS);
    req.on("error", (e) => finish(reject, e));
    req.setTimeout(0); // сокет-таймаут снят: молчание во время генерации — норма, предел выше свой
    req.write(r.init.body);
    req.end();
  });
}

// ── ретраи: дневная квота — мгновенный честный выход, остальное ×2 с паузой ───────────────
class QuotaExhausted extends Error {}
function isDailyQuota(e) {
  const s = String((e && e.message) || "") + "|" + String((e && e.body) || "");
  return /PerDay/i.test(s);
}
function retryDelaySec(e) {
  const raw = String((e && e.body) || (e && e.message) || "");
  const m = /"retryDelay"\s*:\s*"(\d+)/.exec(raw);
  return m ? Number(m[1]) : null;
}
// Проба 2026-07-29 умерла вслепую: тело 429 резалось на 160 символах, и `quotaId` (единственное
// место, где видно «в минуту» vs «в сутки») в лог не попадал. Классификацию делаем по ПОЛНОМУ телу
// (e.body), а в лог кладём сам quotaId — чтобы человек видел, какая именно квота стрельнула.
function quotaIdOf(e) {
  const m = /"quotaId"\s*:\s*"([^"]+)"/.exec(String((e && e.body) || (e && e.message) || ""));
  return m ? m[1] : null;
}
async function withRetry(fn, label, retries) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (e) {
      if (isDailyQuota(e)) {
        throw new QuotaExhausted(label + ": дневная квота Gemini исчерпана (" + (quotaIdOf(e) || "PerDay") +
          ") — ретраи бессмысленны. " +
          "Резюм-состояние сохранено: повторите запуск завтра/на другом ключе, чанки догонятся.");
      }
      last = e;
      if (attempt === retries) break;
      let waitSec = retryDelaySec(e);
      if (!(waitSec > 0) || waitSec > 120) waitSec = 20;
      const qid = quotaIdOf(e);
      console.log("  " + label + ": попытка " + (attempt + 1) + "/" + (retries + 1) + " упала (" +
        String(e && e.message).replace(/\s+/g, " ").slice(0, 140) + (qid ? " · quotaId=" + qid : "") +
        ") — пауза " + waitSec + "с");
      await sleep(waitSec * 1000);
    }
  }
  throw last;
}

// ── метрики против тайм-меченого эталона ──────────────────────────────────────────────────
// Эталон: тройки строк «0:03 / 3 секунды / <текст>» (экспорт субтитров владельца).
function parseTs(s) {
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(String(s).trim());
  if (!m) return null;
  return m[3] !== undefined ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
}
function normWords(t) {
  return String(t)
    .replace(/[֑-ׇ]/g, "")     // огласовки
    .replace(/[^א-ת\s]/g, " ") // только ивритские буквы
    .split(/\s+/).filter((w) => w.length >= 2);
}
function parseSubs(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = parseTs(lines[i]);
    if (t === null) continue;
    const isDur = /секунд|минут|час/.test(lines[i + 1] || "");
    const txt = isDur && lines[i + 2] && parseTs(lines[i + 2]) === null ? lines[i + 2] : null;
    if (txt) out.push({ t, text: txt });
  }
  return out;
}
// Индекс 4-словных шинглов эталона → время; неоднозначный шингл (встречается в разных местах)
// помечается -1 и в матчинге не участвует (иначе рефрен создаёт ложное покрытие).
function buildSubsIndex(entries) {
  const K = 4, idx = new Map();
  for (const e of entries) {
    const ws = normWords(e.text);
    for (let i = 0; i + K <= ws.length; i++) {
      const sh = ws.slice(i, i + K).join(" ");
      if (idx.has(sh)) { if (idx.get(sh) !== e.t) idx.set(sh, -1); } else idx.set(sh, e.t);
    }
  }
  return { K, idx };
}
function coverageMetrics(lines, subsIdx, durationSec) {
  const { K, idx } = subsIdx;
  const bins = new Array(COVER_BINS).fill(0);
  const matched = [];
  for (const l of lines) {
    const ws = normWords(l), ts = [];
    for (let j = 0; j + K <= ws.length; j++) {
      const t = idx.get(ws.slice(j, j + K).join(" "));
      if (t !== undefined && t >= 0) ts.push(t);
    }
    if (!ts.length) continue;
    ts.sort((x, y) => x - y);
    const med = ts[Math.floor(ts.length / 2)];   // медиана устойчива к одиночному ложному матчу
    matched.push(med);
    bins[Math.min(COVER_BINS - 1, Math.floor(COVER_BINS * med / Math.max(1, durationSec)))]++;
  }
  let rollbacks = 0, prev = -1;
  for (const t of matched) { if (t < prev - 120) rollbacks++; prev = Math.max(prev, t); }
  return {
    bins,
    zeroBins: bins.filter((v) => v === 0).length,
    maxMatchedSec: matched.length ? Math.max(...matched) : 0,
    matchedLines: matched.length,
    rollbacks,
  };
}
function dupShinglePct(text) {
  const w = String(text).replace(/[^֐-׿\s]/g, " ").split(/\s+/).filter(Boolean);
  const seen = new Set();
  let dup = 0, tot = 0;
  for (let i = 0; i + 6 <= w.length; i++) {
    const sh = w.slice(i, i + 6).join(" ");
    tot++;
    if (seen.has(sh)) dup++; else seen.add(sh);
  }
  return { words: w.length, pct: 100 * dup / Math.max(1, tot) };
}

// ── прогон ────────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log("=== S12.5 live smoke (нарезка звука) ===");
  console.log("файл:", AUDIO);
  const u8 = fs.readFileSync(AUDIO);
  console.log("размер:", mb(u8.length), "— парсинг mp3-фреймов…");

  const tMap = Date.now();
  const map = MS.buildFrameMap(u8);
  console.log("фреймов " + map.frames + ", длительность по фреймам " + map.totalSec.toFixed(2) + "с (" +
    (map.totalSec / 60).toFixed(2) + " мин), badResync " + map.badResync + " байт, парс " +
    ((Date.now() - tMap) / 1000).toFixed(1) + "с");

  const DUR = map.totalSec;
  // isSliceable сравнивает карту с НЕЗАВИСИМО измеренной длительностью (в браузере — <audio>
  // metadata). В Node такого источника нет: без --probed-duration-sec сверка вырождается в
  // «карта равна себе» — говорим об этом честно, а не выдаём самопроверку за оракул (R11).
  const probed = PROBED_DUR != null && PROBED_DUR !== "" ? Number(PROBED_DUR) : DUR;
  const probedIndependent = PROBED_DUR != null && PROBED_DUR !== "";
  const sliceable = MS.isSliceable(map, probed);
  console.log("isSliceable: " + sliceable + " (probedDuration " + probed.toFixed(2) + "с, " +
    (probedIndependent ? "независимый замер" : "= карта, независимого замера нет — проверены только фреймы") + ")");
  if (!sliceable) {
    console.error("\nГЕЙТ ПРОВАЛЕН: файл не проходит isSliceable — транспорт sliced-mp3 к нему неприменим " +
      "(прод ушёл бы в fallback ranged-file). Живой гейт S12.5 требует sliceable-материал.");
    return 3;
  }

  const windows = A.asrWindows(DUR);
  const seams = A.asrSeams(windows);
  const chunks = MS.sliceChunks(u8, windows, map);
  console.log("окон/чанков " + chunks.length + " (окно " + A.ASR_WINDOW_SEC + "с, перекрытие " +
    A.ASR_WINDOW_OVERLAP_SEC + "с), швы: " + seams.map((s) => clock(s)).join(", "));
  for (const c of chunks) {
    console.log("  чанк " + (c.k + 1) + ": байты " + c.byteFrom + ".." + c.byteTo + " (" + mb(c.bytes.length) +
      ") время " + clock(c.startSec) + ".." + clock(c.endSec) + " (" + Math.round(c.endSec - c.startSec) + "с)");
  }

  if (DRY) {
    console.log("\nDRY OK — сеть не трогали, трат нет. Для живого гейта: убрать --dry и добавить --subs=<эталон>.");
    return 0;
  }

  console.log("ключ: …" + KEY.slice(-4));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const STATE_FILE = path.join(OUT_DIR, "slice-smoke-state.json");
  // Подпись состояния: то же состояние нельзя переиспользовать для другого файла/нарезки.
  const sig = [path.basename(AUDIO), u8.length, map.frames, chunks.length].join("|");
  let state = { sig, chunks: {} };
  if (fs.existsSync(STATE_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (prev && prev.sig === sig) {
        state = prev;
        console.log("резюм-состояние: " + Object.keys(state.chunks).length + "/" + chunks.length + " чанков уже выполнены");
      } else {
        console.log("резюм-состояние относится к другому файлу/нарезке — начинаем заново");
      }
    } catch (_) { console.log("резюм-состояние нечитаемо — начинаем заново"); }
  }

  const perWindow = [], chunkStats = [], failed = [];
  for (const c of chunks) {
    const key = String(c.k);
    if (state.chunks[key]) {
      const s = state.chunks[key];
      console.log("чанк " + (c.k + 1) + "/" + chunks.length + ": из резюм-состояния (" + s.stats.segments + " сегм.)");
      perWindow.push(s.segs);
      chunkStats.push(s.stats);
      continue;
    }
    console.log("чанк " + (c.k + 1) + "/" + chunks.length + ": [" + clock(c.startSec) + ".." + clock(c.endSec) + "] " +
      mb(c.bytes.length) + " — аплоад…");
    const ab = c.bytes.buffer.slice(c.bytes.byteOffset, c.bytes.byteOffset + c.bytes.byteLength);
    const t0 = Date.now();
    let stats = null, segs = null;
    try {
      const up = await withRetry(() => GF.uploadFile(KEY, ab, MIME), "чанк" + (c.k + 1) + "-upload", 2);
      if (!up || !up.fileUri) throw new Error("uploadFile не вернул fileUri");
      if (up.state !== "ACTIVE") {
        await withRetry(() => GF.waitActive(KEY, up.name, { timeoutMs: 60000 + Math.ceil(c.bytes.length / 1048576) * 1000 }),
          "чанк" + (c.k + 1) + "-active", 2);
      }
      const t1 = Date.now();
      let parsed = null;
      try {
        parsed = A.parseAsrResponse(await withRetry(() => asrCall(up.fileUri), "чанк" + (c.k + 1) + "-asr", 2));
      } catch (e) {
        // ASR_BAD_JSON — недетерминизм на длинном выводе (известный класс, проба поймала его дважды):
        // ЕЩЁ один заход тем же звуком. Транспортные ошибки сюда не попадают — их уже отретраил
        // withRetry, и повторять их второй лестницей значит жечь квоту впустую.
        if (!(e && e.code === "ASR_BAD_JSON")) throw e;
        console.log("  чанк " + (c.k + 1) + ": ответ не разобран (ASR_BAD_JSON) — повтор ×1");
        parsed = A.parseAsrResponse(await withRetry(() => asrCall(up.fileUri), "чанк" + (c.k + 1) + "-asr-retry", 1));
      }
      const t2 = Date.now();
      const chunkDur = c.endSec - c.startSec;
      const rel = parsed.segments.filter((s) => typeof s.start === "number" && isFinite(s.start));
      // Метки модели ОБЯЗАНЫ быть chunk-relative: чанк — физический диапазон, чужого звука в нём
      // нет. Заезд считаем и печатаем, но НЕ правим: smoke — независимый оракул над сырым выводом.
      const outOfChunk = rel.filter((s) => s.start < -60 || s.start > chunkDur + 60).length;
      // Абсолютное время = метка чанка + детерминированный офсет (время первого байта чанка).
      segs = parsed.segments.map((s) => ({
        start: (typeof s.start === "number" && isFinite(s.start)) ? s.start + c.startSec : null,
        text: s.text,
      }));
      stats = {
        k: c.k + 1,
        mb: +(c.bytes.length / 1048576).toFixed(1),
        chunkDurSec: Math.round(chunkDur),
        uploadSec: Math.round((t1 - t0) / 1000),
        asrSec: Math.round((t2 - t1) / 1000),
        segments: parsed.segments.length,
        relFirstSec: rel.length ? Math.round(rel[0].start) : null,
        relLastSec: rel.length ? Math.round(rel[rel.length - 1].start) : null,
        outOfChunkMarks: outOfChunk,
        words: parsed.segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0),
        warnings: parsed.warnings,
      };
      console.log("  ok: сегментов " + stats.segments + ", rel-метки " + stats.relFirstSec + ".." + stats.relLastSec +
        " (чанк " + stats.chunkDurSec + "с), заезд за чанк " + outOfChunk + ", аплоад " + stats.uploadSec +
        "с, asr " + stats.asrSec + "с");
    } catch (e) {
      if (e instanceof QuotaExhausted) throw e;
      // Per-item best-effort: одна упавшая часть не отменяет остальные — но чанк уходит в failed[]
      // и валит гейт G1 (тихого «успеха» с дырой в таймлайне быть не может, R11).
      const why = String(e && e.message).replace(/\s+/g, " ").slice(0, 200) + (quotaIdOf(e) ? " · quotaId=" + quotaIdOf(e) : "");
      console.log("  ЧАНК ПРОВАЛЕН: " + why);
      failed.push({ k: c.k + 1, from: clock(c.startSec), to: clock(c.endSec), reason: why });
      perWindow.push([]);
      chunkStats.push({ k: c.k + 1, failed: true });
      continue;
    }
    perWindow.push(segs);
    chunkStats.push(stats);
    state.chunks[key] = { segs, stats };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  }

  console.log("\n=== ЧАНКИ ===");
  chunkStats.forEach((s) => console.log(" " + JSON.stringify(s)));

  // Штатный прод-шов: текстовый якорь в зоне перекрытия + монотонное слияние.
  const stitched = A.stitchWindowSegments(perWindow, seams);
  const merged = A.mergeWindowSegments([stitched.segments]);
  // S12.6: разрыв меток внутри чанка, выдавшего ожидаемый ОБЪЁМ текста, — не потеря речи, а
  // сжатые метки (живая приёмка владельца 2026-07-29: окно 5 отдало полный текст 15 минут,
  // разметив только первые 9.3). Печатаем ДВА разных факта, а не один список «дыр».
  const classified = A.classifyCoverageGaps(merged, DUR, perWindow,
    chunks.map((c) => ({ startSec: c.startSec, endSec: c.endSec })));
  const gaps = classified.gaps;
  const unreliable = classified.unreliableMarkRanges;
  const anchored = stitched.seamsMeta.filter((m) => m.anchored).length;
  console.log("\n=== ШОВ ===");
  console.log("якорь на швах: " + anchored + "/" + stitched.seamsMeta.length);
  console.log("seamsMeta: " + JSON.stringify(stitched.seamsMeta));

  const text = merged.map((s) => s.text).join("\n");
  const transcriptPath = path.join(OUT_DIR, "slice-smoke-transcript.txt");
  fs.writeFileSync(transcriptPath, text, "utf8");

  const dup = dupShinglePct(text);
  console.log("\n=== МЕТРИКИ ===");
  console.log("сегментов " + merged.length + ", слов " + dup.words);
  console.log("дубль-6-шинглов " + dup.pct.toFixed(1) + "%");

  let cov = null;
  if (SUBS) {
    const entries = parseSubs(SUBS);
    console.log("эталон --subs: реплик " + entries.length);
    if (!entries.length) {
      console.error("ERROR: эталон не разобран (ожидались тройки «метка / длительность / текст»)");
      return 1;
    }
    cov = coverageMetrics(merged.map((s) => s.text), buildSubsIndex(entries), DUR);
    console.log("корзины покрытия (" + COVER_BINS + " по ~" + (DUR / COVER_BINS / 60).toFixed(1) + " мин): " + cov.bins.join(" "));
    console.log("нулевых корзин " + cov.zeroBins + "; сматченных строк " + cov.matchedLines +
      "; макс. минута эталона " + (cov.maxMatchedSec / 60).toFixed(1) + " (" +
      (100 * cov.maxMatchedSec / Math.max(1, DUR)).toFixed(1) + "% длительности)");
    console.log("больших откатов времени эталона " + cov.rollbacks + " (справочно: при низких дублях это шум неоднозначных матчей, §6)");
  }

  // ── гейты ───────────────────────────────────────────────────────────────────────────────
  const gateRows = [];
  const addGate = (status, name, detail) => gateRows.push({ status, name, detail });
  const doneChunks = chunkStats.filter((s) => !s.failed).length;

  addGate(failed.length ? "FAIL" : "PASS", "G1 чанки выполнены",
    doneChunks + "/" + chunks.length + (failed.length ? " · провалены: " + failed.map((f) => f.k + " (" + f.from + "–" + f.to + ")").join(", ") : ""));
  addGate(dup.pct < DUP_SHINGLE_MAX_PCT ? "PASS" : "FAIL", "G2 дубль-6-шинглы",
    dup.pct.toFixed(1) + "% (порог <" + DUP_SHINGLE_MAX_PCT + "%; брак был 11.8–22.2%)");
  if (cov) {
    addGate(cov.zeroBins === 0 ? "PASS" : "FAIL", "G3 нулевые корзины",
      cov.zeroBins + " из " + COVER_BINS + " (порог 0; брак был 14)");
    const tailFrac = cov.maxMatchedSec / Math.max(1, DUR);
    addGate(tailFrac >= TAIL_MATCH_MIN_FRAC ? "PASS" : "FAIL", "G4 хвост эталона",
      (100 * tailFrac).toFixed(1) + "% длительности (порог ≥" + (100 * TAIL_MATCH_MIN_FRAC) + "%)");
  } else {
    addGate("SKIP", "G3 нулевые корзины", "нет --subs — покрытие НЕ проверено");
    addGate("SKIP", "G4 хвост эталона", "нет --subs — покрытие НЕ проверено");
  }
  addGate(gaps.length ? "WARN" : "PASS", "coverageGaps (не гейт)",
    gaps.length ? gaps.map((g) => clock(g.fromSec) + "–" + clock(g.toSec)).join(", ") : "нет");
  addGate(unreliable.length ? "WARN" : "PASS", "сжатые метки (не гейт)",
    unreliable.length
      ? unreliable.map((g) => clock(g.fromSec) + "–" + clock(g.toSec) + " (чанк " + (g.windowIdx + 1) + ", объём ×" + g.densityRatio + ")").join(", ") +
        " · база " + (classified.density.baselineWordsPerSec || 0).toFixed(2) + " сл/с"
      : "нет");

  console.log("\n=== ГЕЙТЫ ===");
  for (const g of gateRows) console.log(" " + g.status.padEnd(5) + " " + g.name.padEnd(24) + " " + g.detail);

  const report = {
    file: path.basename(AUDIO), sizeBytes: u8.length,
    frames: map.frames, durationSec: +DUR.toFixed(2), badResync: map.badResync,
    chunks: chunks.length, chunksDone: doneChunks, chunksFailed: failed,
    segments: merged.length, words: dup.words, dupShingle6Pct: +dup.pct.toFixed(2),
    anchoredSeams: anchored, seams: stitched.seamsMeta.length,
    coverageGaps: gaps.map((g) => ({ from: clock(g.fromSec), to: clock(g.toSec) })),
    unreliableMarkRanges: unreliable.map((g) => ({ from: clock(g.fromSec), to: clock(g.toSec),
      chunk: g.windowIdx + 1, densityRatio: g.densityRatio })),
    speechDensity: { baselineWordsPerSec: classified.density.baselineWordsPerSec,
      baselineWindows: classified.density.baselineWindows, usable: classified.density.usable },
    subs: cov ? { zeroBins: cov.zeroBins, bins: cov.bins, matchedLines: cov.matchedLines,
                  maxMatchedSec: Math.round(cov.maxMatchedSec), rollbacks: cov.rollbacks } : null,
    chunkStats,
    gates: gateRows,
    ranAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT_DIR, "slice-smoke-report.json"), JSON.stringify(report, null, 1), "utf8");

  console.log("\nтранскрипт: " + transcriptPath);
  console.log("отчёт (только числа): " + path.join(OUT_DIR, "slice-smoke-report.json"));
  console.log("ЛИЧНЫЙ КОНТЕНТ: транскрипт и резюм-состояние в " + OUT_DIR + " — не коммитить и не пересылать.");

  const failedGates = gateRows.filter((g) => g.status === "FAIL");
  if (failedGates.length) {
    console.error("\nГЕЙТ ПРОВАЛЕН (" + failedGates.length + "): " + failedGates.map((g) => g.name).join(", ") +
      " — слайс S12.5 НЕ закрыт.");
    return 3;
  }
  if (!cov) {
    console.log("\nOK по проверенным гейтам, НО без --subs покрытие не измерено — для закрытия слайса нужен прогон с эталоном.");
    return 0;
  }
  console.log("\nLIVE SMOKE OK — все гейты S12.5 зелёные" + (gaps.length ? " (при " + gaps.length + " честно показанных дырах — лечит heal)" : "") + ".");
  return 0;
})().then((code) => process.exit(code || 0)).catch((e) => {
  if (e instanceof QuotaExhausted) {
    console.error("\nКВОТА: " + e.message);
    process.exit(2);
  }
  console.error("\nLIVE SMOKE FAIL:", (e && e.stack) || e);
  process.exit(1);
});
