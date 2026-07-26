# Studio Ingest W2-S4 (аудио → транскрипт → таблица + сегмент-караоке) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь загружает аудио-файл с ивритской речью (≤20 мин) → BYOK Gemini ASR (Files API из браузера) → редактируемый транскрипт → билингвальная таблица с сохранением границ сегментов → честное посегментное караоке по реальному аудио («▶ Оригинал» с бегущей подсветкой строк, тап-seek, повтор сегмента у строки).

**Architecture:** Весь медиа-путь — клиент: браузер грузит аудио напрямую в Gemini Files API (raw REST resumable, BYOK-ключ), делает ASR-вызов сам и хранит файл в OPFS `media/<sha256>.<ext>`. Сервер получает ровно одно расширение: опциональный `segments[]` у `/api/translate-table` (prompt-вариант `he-ru-table-seg-v1`, существующие промпты не тронуты байт-в-байт). Тайминг `{unit:'row', entries:[{o,t}]}` едет в `source_meta_json.audio` существующим save-путём. Канон-дизайн: `docs/planning/STUDIO_INGEST_W2_S4_AUDIO_KARAOKE_DESIGN_2026_07_26.md` (решения S4-TRANSPORT/CAP/ROWPLAY/CACHE зафиксированы).

**Tech Stack:** vanilla JS (Studio live-код inline в `public/index.html`, модули `public/js/*.js` с dual-export по образцу `studio-karaoke.js`), Node/Express (`server.js` + `ingest/`), raw REST к `generativelanguage.googleapis.com` (без SDK), OPFS (`navigator.storage.getDirectory`), `node --test`, Playwright-скриншоты.

## Global Constraints

- **BYOK-only**: серверного GEMINI_API_KEY нет и не появляется; ключ per-request из браузера; формат `/^(AIza|AQ\.)/` (`ingest/geminiKey.js`).
- **R11 честность**: word-level alignment на реальном аудио ЗАПРЕЩЁН (анти-приоритет пакета); только сегмент-уровень; нет валидного тайминга → карооке честно выключено (`timing:null` + `timingDropReason`), НИКОГДА фейковая подсветка.
- **R9 derived≠asserted**: транскрипт и таблица из него — derived; провенанс-паспорт в `source_meta_json.audio` обязателен и виден в модале «Происхождение».
- **R16**: hard cap **20 минут** (1200 сек, отказ ДО upload); смета $ в UI до запуска; константы цен в одном месте (`asr-transcript.js`).
- **R12/R14**: ноль новых серверных эндпоинтов; ноль байтов медиа через сервер; серверного кэша транскриптов НЕТ (решение S4-CACHE).
- **R15**: медиа = данные пользователя, OPFS-first; у Google Files API — TTL 48ч.
- `HE_RU_PROMPT`/`ANY_HE_PROMPT` (server.js:6333/6373) и he-ru путь НЕ менять; `renderTable`/reader-ядро НЕ трогать (`smoke:reader-parity`); `library.html`/Зал не трогаем; per-row кнопки — только POST-render augmentation.
- Все новые UI-строки → ВСЕ ТРИ локали `public/i18n/locales/{ru,en,he}.js` (t() возвращает ключ при промахе) + bump `CACHE_VERSION` в `public/sw.js` в релиз-задаче.
- Новые контейнеры с кнопками: mobile-ловушка `button{width:100%}` → явное исключение `#<id> button { width: auto; }`.
- Перед каждым UI-коммитом — Playwright-скриншот @380×844.
- Ошибки — JSON/коды `error_code`, локализация через ERROR_KEY-паттерн `studio-import.js:54`.
- Коммит после каждой задачи; trailers Co-Authored-By/Claude-Session. Пуш в main = Coolify авто-деплой, поэтому пуш только в релиз-задаче 12 (до неё — локальные коммиты).
- **GO/NO-GO**: Задача 2 (live-spike транспорта) — гейт. Провал CORS/ключей → СТОП, доклад владельцу, фолбэк «инлайн ≤7МБ через прокси» — только с его решения.

## File Structure (итог W2-S4)

```
public/js/asr-transcript.js          # НОВЫЙ: ASR_PROMPT, parseAsrResponse, secondsFromTimestamp,
                                     #   validateSegments, buildRowTiming, estimateAsrCostUsd (pure, dual-export)
public/js/gemini-files.js            # НОВЫЙ: Files API resumable upload + waitActive + transcribeAudio (browser)
public/js/gemini-error.js            # НОВЫЙ: classifyGeminiError (переезд из ingest/, dual-export)
ingest/geminiError.js                # СТАНОВИТСЯ тонким re-export public/js/gemini-error.js
public/js/media-store.js             # НОВЫЙ: OPFS media/<sha256>.<ext> (sha256Hex, saveMedia, readMedia, mediaExists)
public/js/studio-media-karaoke.js    # НОВЫЙ: activeSegmentRange (pure) + плеер оригинала, row-range подсветка,
                                     #   seekToRow, playSegment; свой Audio(), НЕ rowAudioPlayer
public/js/studio-import.js           # MOD: вход «Аудио», проба длительности, смета, transcribe-флоу, превью
ingest/segTable.js                   # НОВЫЙ: validateSegmentsInput, buildSegInput, HE_RU_SEG_PROMPT, validateSegMapping
server.js                            # MOD: /api/translate-table + segments[] (promptId he-ru-table-seg-v1)
public/index.html                    # MOD: audio-вход в #v3ImportModal, #v3MediaBar, augmentation повтора сегмента,
                                     #   glue тайминга/persistence, панель провенанса, CSS
public/sw.js                         # MOD: precache новых js + bump CACHE_VERSION (релиз-задача)
public/i18n/locales/{ru,en,he}.js    # MOD: ключи studio.import.audio.* / studio.media.*
tests/asrTranscript.test.js          # НОВЫЙ unit
tests/segTable.test.js               # НОВЫЙ unit
tests/mediaKaraoke.test.js           # НОВЫЙ unit (pure activeSegmentRange)
tests/mediaStore.test.js             # НОВЫЙ unit (pure mediaFileName)
tests/geminiErrorShared.test.js      # НОВЫЙ unit (dual-export паритет)
tests/ingestGeminiError.test.js      # СУЩЕСТВУЮЩИЙ — должен остаться зелёным без правок
scripts/media-karaoke-smoke.js       # НОВЫЙ smoke:media-karaoke
scripts/ingest-smoke.js              # MOD: +3 детерминированных 4xx-кейса segments
scripts/premium/ingest-audio-live-smoke.js    # НОВЫЙ owner-keyed live smoke (Node, REST-протокол)
scripts/premium/ingest-audio-cors-check.js    # НОВЫЙ browser CORS-проверка (Playwright)
scripts/premium/fixtures/ingest/audio/        # make-he-sample.js + he-sample.mp3 + README.md
package.json                         # script smoke:media-karaoke
```

Порядок: pure-ядро (1) → live-spike GO/NO-GO (2) → клиент-кирпичи (3-5) → сервер (6) → караоке (7) → UI-флоу (8) → glue/persistence (9) → playback-UI (10) → провенанс (11) → релиз (12) → owner-приёмка (13).

---

### Task 1: `asr-transcript.js` — ASR-контракт, парсер, валидатор тайминга, смета (pure)

**Files:**
- Create: `public/js/asr-transcript.js`
- Test: `tests/asrTranscript.test.js`

**Interfaces:**
- Produces (dual-export `window.AsrTranscript` + `module.exports`):
  - `ASR_PROMPT: string`, `ASR_MODEL = "gemini-flash-latest"`
  - `secondsFromTimestamp(s: any) => number|null` — `"M:SS"`, `"H:MM:SS"`, опц. `.d`; null на мусоре
  - `parseAsrResponse(raw: string) => {language, segments:[{start:number|null, text:string}], warnings:[]}` — бросает `Error` с `.code="ASR_BAD_JSON"`
  - `validateSegments(segments, durationSec) => {segments:[{i,start:number|null,text}], timingOk:boolean, dropReason:string|null, warnings:[]}` — тексты НИКОГДА не выбрасываются, невалидный `start` → null
  - `buildRowTiming(segments, rowSegIdx:(int|null)[]) => {v:1,unit:'row',entries:[{o,t}]} | null`
  - `estimateAsrCostUsd(durationSec) => number`

- [ ] **Step 1: Write the failing test**

```js
// tests/asrTranscript.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../public/js/asr-transcript.js");

test("secondsFromTimestamp parses M:SS / H:MM:SS / fractional, rejects junk", () => {
  assert.equal(A.secondsFromTimestamp("0:03"), 3);
  assert.equal(A.secondsFromTimestamp("2:15"), 135);
  assert.equal(A.secondsFromTimestamp("1:02:05"), 3725);
  assert.equal(A.secondsFromTimestamp("0:03.5"), 3.5);
  for (const bad of [null, "", "abc", "1:75", "-1:00", "3", {}, "1:2:3:4"]) {
    assert.equal(A.secondsFromTimestamp(bad), null, String(bad));
  }
});

test("parseAsrResponse strips fences, normalizes, throws ASR_BAD_JSON", () => {
  const raw = '```json\n{"language":"he","segments":[{"start":"0:02","text":" שלום "}],"warnings":[]}\n```';
  const p = A.parseAsrResponse(raw);
  assert.equal(p.language, "he");
  assert.deepEqual(p.segments, [{ start: 2, text: "שלום" }]);
  assert.throws(() => A.parseAsrResponse("not json"), (e) => e.code === "ASR_BAD_JSON");
});

test("validateSegments: keeps texts, nulls bad starts, monotonic filter, thresholds", () => {
  const segs = [
    { start: 1, text: "א" }, { start: 5, text: "ב" }, { start: 3, text: "ג" }, // 3 < 5 → non-monotonic
    { start: 9999, text: "ד" },                                                // за пределами длительности
    { start: 12, text: "ה" },
  ];
  const v = A.validateSegments(segs, 60);
  assert.equal(v.segments.length, 5);                    // тексты не потеряны
  assert.deepEqual(v.segments.map((s) => s.start), [1, 5, null, null, 12]);
  assert.deepEqual(v.segments.map((s) => s.i), [0, 1, 2, 3, 4]);
  assert.equal(v.timingOk, false);                       // 3/5 = 60% < 80%
  assert.equal(v.dropReason, "ASR_TIMING_INVALID");
  const ok = A.validateSegments([{ start: 0, text: "א" }, { start: 4, text: "ב" }, { start: 8, text: "ג" }], 30);
  assert.equal(ok.timingOk, true);
  assert.equal(ok.dropReason, null);
  const late = A.validateSegments([{ start: 95, text: "א" }, { start: 100, text: "ב" }], 200);
  assert.equal(late.timingOk, true);                     // поздний первый сегмент — warning, не провал
  assert.ok(late.warnings.includes("LATE_FIRST_SEGMENT"));
  assert.equal(A.validateSegments([{ start: 1, text: "א" }], 60).timingOk, false); // < 2 валидных
});

test("buildRowTiming: first row per segment, needs >=2 entries", () => {
  const segs = [{ i: 0, start: 0, text: "a" }, { i: 1, start: 5, text: "b" }, { i: 2, start: null, text: "c" }];
  // 5 строк таблицы: сегмент0 → строки 0-1, сегмент1 → строки 2-3, сегмент2 → строка 4
  const t = A.buildRowTiming(segs, [0, 0, 1, 1, 2]);
  assert.deepEqual(t, { v: 1, unit: "row", entries: [{ o: 0, t: 0 }, { o: 2, t: 5 }] });
  assert.equal(A.buildRowTiming(segs, [null, null, null, null, null]), null);
  assert.equal(A.buildRowTiming([{ i: 0, start: 0, text: "a" }], [0]), null); // 1 entry < 2
});

test("estimateAsrCostUsd is positive and roughly linear", () => {
  const one = A.estimateAsrCostUsd(60), twenty = A.estimateAsrCostUsd(1200);
  assert.ok(one > 0 && twenty > one * 15 && twenty < 1); // 20 мин — центы, не доллары
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/asrTranscript.test.js`
Expected: FAIL — `Cannot find module '../public/js/asr-transcript.js'`

- [ ] **Step 3: Write implementation**

```js
// public/js/asr-transcript.js
// W2-S4 · ASR-контракт (Gemini аудио) + валидация сегмент-тайминга (R11: honest) + смета (R16).
// Pure-ядро, dual-export (browser window.AsrTranscript + Node module.exports) по образцу studio-karaoke.js.
// Канон: docs/planning/STUDIO_INGEST_W2_S4_AUDIO_KARAOKE_DESIGN_2026_07_26.md §3.1-3.2.
(function () {
  "use strict";

  var ASR_MODEL = "gemini-flash-latest";

  var ASR_PROMPT = [
    "You are a strict JSON generator performing SPEECH TRANSCRIPTION of the attached audio (Hebrew speech expected).",
    "Rules:",
    "- Split the transcript into natural sentence/phrase segments of at most ~15 seconds each.",
    '- Each segment gets "start" — the timestamp where the segment begins, format "M:SS" or "H:MM:SS" (from audio start).',
    "- Timestamps MUST be non-decreasing and within the audio duration.",
    "- Transcribe Hebrew WITHOUT niqqud (do not add vocalization).",
    "- Do NOT translate, summarize, correct or invent anything.",
    '- If a region is unintelligible, insert "[…]" there and add "PARTIALLY_UNCLEAR" to warnings.',
    '- If the dominant language is not Hebrew, still transcribe and add "NOT_HEBREW" to warnings.',
    '- If there is no speech at all, return {"language":null,"segments":[],"warnings":["NO_SPEECH"]}.',
    "Output ONLY JSON, no markdown fences:",
    '{"language":"he|mixed|other","segments":[{"start":"M:SS","text":"..."}],"warnings":[]}',
  ].join("\n");

  // R16: константы сметы — ЕДИНСТВЕННОЕ место цен ASR. Gemini Flash: аудио-вход ≈32 ток/сек
  // ($1.00/1M ток), выход-транскрипт ≈4 ток/сек речи ($2.50/1M). Пересмотреть при смене модели.
  var ASR_TOKENS_PER_SEC = 32;
  var USD_PER_MTOK_AUDIO_IN = 1.0;
  var OUT_TOKENS_PER_SEC = 4;
  var USD_PER_MTOK_OUT = 2.5;

  function estimateAsrCostUsd(durationSec) {
    var d = Math.max(0, Number(durationSec) || 0);
    return (d * ASR_TOKENS_PER_SEC / 1e6) * USD_PER_MTOK_AUDIO_IN +
           (d * OUT_TOKENS_PER_SEC / 1e6) * USD_PER_MTOK_OUT;
  }

  function secondsFromTimestamp(s) {
    if (typeof s !== "string") return null;
    var m = /^(\d+):([0-5]?\d)(?:\.(\d+))?$/.exec(s.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number("0." + m[3]) : 0);
    var h = /^(\d+):([0-5]?\d):([0-5]?\d)(?:\.(\d+))?$/.exec(s.trim());
    if (h) return Number(h[1]) * 3600 + Number(h[2]) * 60 + Number(h[3]) + (h[4] ? Number("0." + h[4]) : 0);
    return null;
  }

  // Ответ модели → нормализованный объект. Фенсы срезаем тем же приёмом, что ingest/routes.js.
  function parseAsrResponse(raw) {
    var cleaned = String(raw == null ? "" : raw)
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    var parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (_) { var e = new Error("ASR returned non-JSON"); e.code = "ASR_BAD_JSON"; throw e; }
    var segs = Array.isArray(parsed.segments) ? parsed.segments : [];
    var out = [];
    for (var k = 0; k < segs.length; k++) {
      var text = String((segs[k] && segs[k].text) || "").trim();
      if (!text) continue; // пустой сегмент бесполезен и для текста, и для тайминга
      out.push({ start: secondsFromTimestamp(segs[k].start), text: text });
    }
    return {
      language: parsed.language || null,
      segments: out,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter(function (w) { return typeof w === "string"; }) : [],
    };
  }

  // R11: тексты сохраняются ВСЕГДА; тайминг — только честный. Невалидный/немонотонный start → null.
  // timingOk = валидных ≥2 И ≥80% сегментов. Поздний первый сегмент (>60с) — warning, не провал
  // (легитимно: музыкальное интро).
  function validateSegments(segments, durationSec) {
    var input = Array.isArray(segments) ? segments : [];
    var dur = Math.max(0, Number(durationSec) || 0);
    var out = [], warnings = [], lastT = -Infinity, valid = 0;
    for (var k = 0; k < input.length; k++) {
      var text = String((input[k] && input[k].text) || "").trim();
      var t = input[k] && typeof input[k].start === "number" && isFinite(input[k].start) ? input[k].start : null;
      if (t !== null) {
        if (t < 0) t = 0;
        if (dur > 0 && t > dur + 2) t = null;        // за пределами аудио — фейк
        else if (t < lastT) t = null;                // немонотонность — фейк
      }
      if (t !== null) { lastT = t; valid++; }
      out.push({ i: k, start: t, text: text });
    }
    var firstValid = null;
    for (var j = 0; j < out.length; j++) { if (out[j].start !== null) { firstValid = out[j].start; break; } }
    if (firstValid !== null && firstValid > 60) warnings.push("LATE_FIRST_SEGMENT");
    var timingOk = valid >= 2 && (input.length === 0 ? false : valid / input.length >= 0.8);
    return {
      segments: out,
      timingOk: timingOk,
      dropReason: timingOk ? null : "ASR_TIMING_INVALID",
      warnings: warnings,
    };
  }

  // segments (после validateSegments) + segment_index каждой строки таблицы → [{o,t}]:
  // o = ПЕРВАЯ строка сегмента, t = его start. <2 записей → null (караоке честно выключено).
  function buildRowTiming(segments, rowSegIdx) {
    var firstRow = new Map();
    var rows = Array.isArray(rowSegIdx) ? rowSegIdx : [];
    for (var r = 0; r < rows.length; r++) {
      var si = rows[r];
      if (Number.isInteger(si) && !firstRow.has(si)) firstRow.set(si, r);
    }
    var entries = [], lastT = -Infinity;
    var segs = Array.isArray(segments) ? segments : [];
    for (var k = 0; k < segs.length; k++) {
      var st = segs[k] && segs[k].start;
      if (typeof st !== "number" || !isFinite(st)) continue;
      var row = firstRow.get(segs[k].i != null ? segs[k].i : k);
      if (row == null) continue;
      if (st < lastT) continue; // страховка (validateSegments уже отфильтровал)
      entries.push({ o: row, t: st });
      lastT = st;
    }
    return entries.length >= 2 ? { v: 1, unit: "row", entries: entries } : null;
  }

  var API = {
    ASR_MODEL: ASR_MODEL, ASR_PROMPT: ASR_PROMPT,
    secondsFromTimestamp: secondsFromTimestamp, parseAsrResponse: parseAsrResponse,
    validateSegments: validateSegments, buildRowTiming: buildRowTiming,
    estimateAsrCostUsd: estimateAsrCostUsd,
  };
  if (typeof window !== "undefined") window.AsrTranscript = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/asrTranscript.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add public/js/asr-transcript.js tests/asrTranscript.test.js
git commit -m "feat(ingest): W2-S4 ASR contract + honest segment-timing validator (pure core)"
```

---

### Task 2: SPIKE — live-транспорт Files API (Node + browser CORS) — GO/NO-GO

**Files:**
- Create: `scripts/premium/fixtures/ingest/audio/make-he-sample.js`
- Create: `scripts/premium/fixtures/ingest/audio/README.md`
- Create: `scripts/premium/fixtures/ingest/audio/he-sample.mp3` (сгенерированный, ~30-60КБ, коммитится)
- Create: `scripts/premium/ingest-audio-live-smoke.js`
- Create: `scripts/premium/ingest-audio-cors-check.js`

**Interfaces:**
- Consumes: `ASR_PROMPT`, `ASR_MODEL`, `parseAsrResponse`, `validateSegments` из `public/js/asr-transcript.js` (Task 1).
- Produces: подтверждённый REST-протокол (заголовки/URL), который Task 5 реализует в `gemini-files.js`. Никакого переиспользуемого кода — скрипты самодостаточны.

- [ ] **Step 1: Генератор фикстуры** — `make-he-sample.js`: синтез ~8-сек ивритской фразы из 3 предложений через `scripts/premium/lib/ttsBake.js` (`synthesizeMp3`), ключ `--key` или env `GCP_TTS_SMOKE_KEY`:

```js
// scripts/premium/fixtures/ingest/audio/make-he-sample.js
// Генерация he-sample.mp3 (фикстура live-smoke W2-S4). Запуск (однократно):
//   node scripts/premium/fixtures/ingest/audio/make-he-sample.js --key <GCP_TTS_KEY>
"use strict";
const fs = require("fs");
const path = require("path");
const { synthesizeMp3, defaultProfile } = require("../../../lib/ttsBake.js");

const TEXT = "שלום, קוראים לי דוד. אני גר בתל אביב. היום מזג האוויר יפה מאוד.";
const keyArgIdx = process.argv.indexOf("--key");
const KEY = keyArgIdx > -1 ? process.argv[keyArgIdx + 1] : process.env.GCP_TTS_SMOKE_KEY;
if (!KEY) { console.error("ERROR: pass --key <GCP_TTS_KEY> or set GCP_TTS_SMOKE_KEY"); process.exit(1); }

(async () => {
  const mp3 = await synthesizeMp3(KEY, TEXT, defaultProfile("he-IL-Wavenet-B"));
  const out = path.join(__dirname, "he-sample.mp3");
  fs.writeFileSync(out, mp3);
  console.log("OK wrote", out, mp3.length, "bytes; text:", TEXT);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
```

- [ ] **Step 2: README фикстуры** (Artifact-storage rule):

```markdown
# fixtures/ingest/audio — W2-S4 live-smoke фикстура

- `he-sample.mp3` — ~8 сек ивритской речи (3 предложения), синтез GCP TTS he-IL-Wavenet-B.
  Сгенерирован `make-he-sample.js` (см. текст фразы внутри). Артефакт КОММИТИТСЯ (мал, детерминированная роль).
- `make-he-sample.js` — генератор; нужен GCP TTS ключ (env GCP_TTS_SMOKE_KEY, НЕ коммитить).
- Потребители: scripts/premium/ingest-audio-live-smoke.js, ingest-audio-cors-check.js.
```

- [ ] **Step 3: Node live-smoke** — `ingest-audio-live-smoke.js`. Ключ: `--key` или env `INGEST_SMOKE_GEMINI_KEY` (конвенция `ingest-live-smoke.js`). Протокол (канон §3.1 дизайна):

```js
// scripts/premium/ingest-audio-live-smoke.js
// W2-S4 live smoke (РЕАЛЬНЫЙ Gemini-ключ, ручной запуск; урок feedback_llm_path_test_before_ship):
//   node scripts/premium/ingest-audio-live-smoke.js --key <GEMINI_KEY> [--audio <path>] [--mime audio/mpeg]
// Прогоняет ПОЛНЫЙ протокол: resumable start → upload+finalize → poll ACTIVE → ASR → контракт-asserts.
// Для проверки iPhone-формата: --audio memo.m4a --mime audio/mp4 (и повторить с audio/x-m4a).
"use strict";
const fs = require("fs");
const path = require("path");
const A = require("../../public/js/asr-transcript.js");

const GL = "https://generativelanguage.googleapis.com";
function arg(name, dflt) { const i = process.argv.indexOf("--" + name); return i > -1 ? process.argv[i + 1] : dflt; }
const KEY = arg("key", process.env.INGEST_SMOKE_GEMINI_KEY || "");
const AUDIO = arg("audio", path.join(__dirname, "fixtures/ingest/audio/he-sample.mp3"));
const MIME = arg("mime", "audio/mpeg");
if (!/^(AIza|AQ\.)/.test(KEY)) { console.error("ERROR: --key or INGEST_SMOKE_GEMINI_KEY (AIza…|AQ.…)"); process.exit(1); }

(async () => {
  const bytes = fs.readFileSync(AUDIO);
  console.log("1) start resumable…", AUDIO, bytes.length, "bytes", MIME);
  const start = await fetch(GL + "/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": KEY,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": MIME,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "s4-live-smoke" } }),
  });
  if (!start.ok) throw new Error("start HTTP " + start.status + ": " + (await start.text()));
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("no x-goog-upload-url header (протокол изменился?)");

  console.log("2) upload+finalize…");
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
    body: bytes,
  });
  if (!up.ok) throw new Error("upload HTTP " + up.status + ": " + (await up.text()));
  const fileInfo = (await up.json()).file;
  console.log("   file:", fileInfo.name, fileInfo.state, fileInfo.uri);

  console.log("3) poll ACTIVE…");
  let state = fileInfo.state, tries = 0;
  while (state !== "ACTIVE") {
    if (state === "FAILED") throw new Error("file state FAILED");
    if (++tries > 30) throw new Error("ACTIVE timeout (60s)");
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch(GL + "/v1beta/" + fileInfo.name, { headers: { "x-goog-api-key": KEY } });
    if (!g.ok) throw new Error("files.get HTTP " + g.status);
    state = (await g.json()).state;
  }

  console.log("4) ASR generateContent…");
  const gen = await fetch(GL + "/v1beta/models/" + A.ASR_MODEL + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { file_data: { file_uri: fileInfo.uri, mime_type: MIME } },
        { text: A.ASR_PROMPT },
      ] }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!gen.ok) throw new Error("generateContent HTTP " + gen.status + ": " + (await gen.text()));
  const data = await gen.json();
  const raw = ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("");
  console.log("   raw:", raw.slice(0, 300));

  const parsed = A.parseAsrResponse(raw);
  const v = A.validateSegments(parsed.segments, 10);
  console.log("5) contract:", JSON.stringify({ language: parsed.language, n: parsed.segments.length, timingOk: v.timingOk, warnings: parsed.warnings }));
  if (!parsed.segments.length) throw new Error("ASSERT: no segments on speech fixture");
  if (!parsed.segments.some((s) => /[֐-׿]/.test(s.text))) throw new Error("ASSERT: no Hebrew in transcript");
  if (!v.timingOk) console.warn("WARN: timing failed honest validation on fixture — inspect starts:", parsed.segments.map((s) => s.start));
  console.log("LIVE SMOKE OK");
})().catch((e) => { console.error("LIVE SMOKE FAIL:", e.message); process.exit(1); });
```

- [ ] **Step 4: Browser CORS-check** — `ingest-audio-cors-check.js` (Playwright chromium): открыть `http://localhost:3000` (сервер должен бежать: `npm start`), `page.evaluate` тех же 4 шагов через браузерный `fetch` (fixture-байты передать в страницу как base64 через аргумент evaluate; ключ из env `INGEST_SMOKE_GEMINI_KEY`). Критичный assert: `startResp.headers.get("x-goog-upload-url") !== null` ИМЕННО в браузере (CORS `Access-Control-Expose-Headers`). Вывод: `CORS OK` / `CORS FAIL: <какой шаг>`. Скрипт ~80 строк, структура повторяет Node-smoke (без переиспользования — самодостаточен, protokol-drift ловится Task 13).

- [ ] **Step 5: Прогнать оба скрипта с реальным ключом**

Run: `node scripts/premium/ingest-audio-live-smoke.js --key <KEY>` (оба формата ключа, если доступны: AIza и AQ.)
Run: `npm start` (фон) → `INGEST_SMOKE_GEMINI_KEY=<KEY> node scripts/premium/ingest-audio-cors-check.js`
Expected: `LIVE SMOKE OK` + `CORS OK`.
**НЕТ ключа в окружении → СТОП, запросить у владельца прогон/ключ. `CORS FAIL` → СТОП, доклад владельцу (фолбэк-развилка «инлайн ≤7МБ» — решение владельца), задачи 5+ НЕ начинать.**

- [ ] **Step 6: Commit**

```bash
git add scripts/premium/ingest-audio-live-smoke.js scripts/premium/ingest-audio-cors-check.js scripts/premium/fixtures/ingest/audio/
git commit -m "feat(ingest): W2-S4 transport spike — Files API live smoke + browser CORS check + he fixture"
```

---

### Task 3: `gemini-error.js` — переезд классификатора в shared dual-export

**Files:**
- Create: `public/js/gemini-error.js`
- Modify: `ingest/geminiError.js` (становится re-export)
- Test: `tests/geminiErrorShared.test.js`; существующий `tests/ingestGeminiError.test.js` — зелёный БЕЗ правок

**Interfaces:**
- Produces: `window.GeminiError.classifyGeminiError(err) => {status, error_code, error}` (browser) и прежний `require("./ingest/geminiError.js").classifyGeminiError` (server) — ОДНА реализация (урок config-string-match-by-construction).

- [ ] **Step 1: Write the failing test**

```js
// tests/geminiErrorShared.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("ingest/geminiError re-exports the SAME function object as public/js/gemini-error", () => {
  const a = require("../ingest/geminiError.js").classifyGeminiError;
  const b = require("../public/js/gemini-error.js").classifyGeminiError;
  assert.equal(a, b); // идентичность, не эквивалентность — один источник
});

test("classify works on browser-style err {status, message}", () => {
  const c = require("../public/js/gemini-error.js").classifyGeminiError(
    { status: 400, message: "API key not valid. reason API_KEY_INVALID" });
  assert.equal(c.error_code, "GEMINI_KEY_REJECTED");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/geminiErrorShared.test.js`
Expected: FAIL — `Cannot find module '../public/js/gemini-error.js'`

- [ ] **Step 3: Implementation** — перенести тело `classifyGeminiError` из `ingest/geminiError.js` в `public/js/gemini-error.js` ДОСЛОВНО (комментарий-шапку сохранить, добавить строку про W2-S4 переезд), обернув в dual-export IIFE:

```js
// public/js/gemini-error.js
// (шапка-комментарий из ingest/geminiError.js — дословно)
// W2-S4: переезд в public/js для клиентского ASR-пути (браузер→Google напрямую);
// сервер продолжает require через ingest/geminiError.js (тонкий re-export) — один источник.
(function () {
  "use strict";
  function classifyGeminiError(err) {
    /* … тело функции из ingest/geminiError.js:13-35 БЕЗ ИЗМЕНЕНИЙ … */
  }
  var API = { classifyGeminiError: classifyGeminiError };
  if (typeof window !== "undefined") window.GeminiError = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

`ingest/geminiError.js` целиком заменить на:

```js
// ingest/geminiError.js
// W2-S4: реализация переехала в public/js/gemini-error.js (нужна и браузеру — ASR-путь
// идёт браузер→Google напрямую). Этот файл — тонкий re-export, чтобы серверные require
// и существующие тесты не менялись. Прецедент require из public/: ttsBake ← reader-morph.js.
"use strict";
module.exports = require("../public/js/gemini-error.js");
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/geminiErrorShared.test.js tests/ingestGeminiError.test.js`
Expected: PASS (старые 7 тестов классификатора зелёные без правок)

- [ ] **Step 5: Commit**

```bash
git add public/js/gemini-error.js ingest/geminiError.js tests/geminiErrorShared.test.js
git commit -m "refactor(ingest): move classifyGeminiError to shared public/js/gemini-error.js (dual-export)"
```

---

### Task 4: `media-store.js` — OPFS-хранилище медиа

**Files:**
- Create: `public/js/media-store.js`
- Test: `tests/mediaStore.test.js` (pure-часть)

**Interfaces:**
- Produces (`window.MediaStore` + Node-export pure-части):
  - `mediaFileName(sha256Hex, mimeType, originalName) => "media/<sha>.<ext>"` (pure)
  - `async sha256Hex(arrayBuffer) => hex` (crypto.subtle; в Node — `node:crypto` webcrypto)
  - `canWrite() => boolean` (feature-detect `FileSystemFileHandle.prototype.createWritable` — старые iOS Safari без него → honest session-only деградация)
  - `async saveMedia(arrayBuffer, fileName) => {ok:boolean, reason?:string}`
  - `async readMedia(fileName) => Blob|null`, `async mediaExists(fileName) => boolean`

- [ ] **Step 1: Write the failing test**

```js
// tests/mediaStore.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../public/js/media-store.js");

test("mediaFileName: ext from mime, fallback from name, fallback bin", () => {
  const sha = "ab".repeat(32);
  assert.equal(M.mediaFileName(sha, "audio/mpeg", "x.mp3"), "media/" + sha + ".mp3");
  assert.equal(M.mediaFileName(sha, "audio/ogg", "voice.oga"), "media/" + sha + ".ogg");
  assert.equal(M.mediaFileName(sha, "audio/mp4", "Memo.m4a"), "media/" + sha + ".m4a");
  assert.equal(M.mediaFileName(sha, "", "Memo.M4A"), "media/" + sha + ".m4a");   // из имени, lower-case
  assert.equal(M.mediaFileName(sha, "application/x-junk", "noext"), "media/" + sha + ".bin");
});

test("sha256Hex works in Node via webcrypto", async () => {
  const hex = await M.sha256Hex(new TextEncoder().encode("abc").buffer);
  assert.equal(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mediaStore.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implementation**

```js
// public/js/media-store.js
// W2-S4 · OPFS-хранилище импортированных медиа: media/<sha256>.<ext> (R15: данные пользователя,
// OPFS-first; имя = хэш содержимого → идемпотентный повтор-импорт). Dual-export: pure-часть
// (mediaFileName, sha256Hex) тестируется в Node; файловые операции — только браузер.
// НЕ пишет в audio_assets/sentence_audio (консьюмеры ждут серверные TTS-ассеты — gate-consumers).
(function () {
  "use strict";

  var DIR = "media";
  var EXT_BY_MIME = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/aac": "aac", "audio/mp4": "m4a",
    "audio/x-m4a": "m4a", "audio/flac": "flac", "audio/aiff": "aiff",
  };

  function mediaFileName(sha256, mimeType, originalName) {
    var ext = EXT_BY_MIME[String(mimeType || "").toLowerCase()];
    if (!ext) {
      var m = /\.([a-z0-9]{1,5})$/i.exec(String(originalName || ""));
      ext = m ? m[1].toLowerCase() : "bin";
    }
    return DIR + "/" + String(sha256) + "." + ext;
  }

  function cryptoObj() {
    if (typeof crypto !== "undefined" && crypto.subtle) return crypto;
    return require("node:crypto").webcrypto; // Node-тесты
  }
  async function sha256Hex(buf) {
    var digest = await cryptoObj().subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function canWrite() {
    try { return typeof FileSystemFileHandle !== "undefined" && !!FileSystemFileHandle.prototype.createWritable; }
    catch (_) { return false; }
  }
  function baseName(fileName) { return String(fileName).replace(/^media\//, ""); }
  async function dirHandle(create) {
    var root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DIR, { create: !!create });
  }
  async function saveMedia(buf, fileName) {
    if (!canWrite()) return { ok: false, reason: "NO_CREATE_WRITABLE" };
    try {
      var dir = await dirHandle(true);
      var fh = await dir.getFileHandle(baseName(fileName), { create: true });
      var w = await fh.createWritable();
      await w.write(buf);
      await w.close();
      return { ok: true };
    } catch (e) { return { ok: false, reason: (e && e.name) || "WRITE_FAILED" }; }
  }
  async function readMedia(fileName) {
    try {
      var dir = await dirHandle(false);
      var fh = await dir.getFileHandle(baseName(fileName));
      return await fh.getFile();
    } catch (_) { return null; }
  }
  async function mediaExists(fileName) { return (await readMedia(fileName)) !== null; }

  var API = { mediaFileName: mediaFileName, sha256Hex: sha256Hex, canWrite: canWrite,
              saveMedia: saveMedia, readMedia: readMedia, mediaExists: mediaExists };
  if (typeof window !== "undefined") window.MediaStore = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

- [ ] **Step 4: Run test** — Expected: PASS
- [ ] **Step 5: Commit** — `git add public/js/media-store.js tests/mediaStore.test.js && git commit -m "feat(ingest): W2-S4 OPFS media store (sha256-named, honest no-write degradation)"`

---

### Task 5: `gemini-files.js` — браузерный клиент Files API + ASR

**Files:**
- Create: `public/js/gemini-files.js`
- Test: добавить блок в `tests/asrTranscript.test.js`? НЕТ — Create: `tests/geminiFiles.test.js` (pure request-builders)

**Interfaces:**
- Consumes: `window.AsrTranscript.ASR_MODEL/ASR_PROMPT` (Task 1), `window.GeminiError.classifyGeminiError` (Task 3).
- Produces (`window.GeminiFiles` + Node-export pure-части):
  - `buildStartUploadRequest(apiKey, {sizeBytes, mimeType, displayName}) => {url, init}` (pure)
  - `buildAsrRequest(apiKey, fileUri, mimeType, promptText) => {url, init}` (pure)
  - `async uploadFile(apiKey, blobOrBuf, mimeType, onPhase?) => {fileUri, name, state}`
  - `async waitActive(apiKey, name, {intervalMs=2000, timeoutMs=60000}?) => void` — throw `.code="FILE_FAILED"|"FILE_TIMEOUT"`
  - `async transcribeAudio(apiKey, fileUri, mimeType) => rawText` — AbortController 180с; на `!resp.ok` бросает Error с `.status` и `.message=body` (для `classifyGeminiError` у вызывающего); `.code="ASR_TIMEOUT"` на аборте

- [ ] **Step 1: Write the failing test**

```js
// tests/geminiFiles.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../public/js/gemini-files.js");

test("buildStartUploadRequest: resumable headers + key header, no key in URL", () => {
  const r = G.buildStartUploadRequest("AIzaTest", { sizeBytes: 123, mimeType: "audio/mpeg", displayName: "x" });
  assert.equal(r.url, "https://generativelanguage.googleapis.com/upload/v1beta/files");
  assert.equal(r.init.headers["x-goog-api-key"], "AIzaTest");
  assert.equal(r.init.headers["X-Goog-Upload-Command"], "start");
  assert.equal(r.init.headers["X-Goog-Upload-Header-Content-Length"], "123");
  assert.equal(r.init.headers["X-Goog-Upload-Header-Content-Type"], "audio/mpeg");
  assert.ok(!r.url.includes("AIzaTest")); // ключ НЕ в URL (не светится в логах прокси)
  assert.equal(JSON.parse(r.init.body).file.display_name, "x");
});

test("buildAsrRequest: file_data + prompt + temperature 0", () => {
  const r = G.buildAsrRequest("AQ.k", "https://gl/files/abc", "audio/mp4", "PROMPT");
  const body = JSON.parse(r.init.body);
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.contents[0].parts[0].file_data.file_uri, "https://gl/files/abc");
  assert.equal(body.contents[0].parts[0].file_data.mime_type, "audio/mp4");
  assert.equal(body.contents[0].parts[1].text, "PROMPT");
  assert.ok(r.url.endsWith(":generateContent"));
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: module not found

- [ ] **Step 3: Implementation** — протокол ИЗ SPIKE Task 2 (он уже прошёл live):

```js
// public/js/gemini-files.js
// W2-S4 · Браузер→Google Gemini Files API (BYOK): resumable upload + poll ACTIVE + ASR-вызов.
// Raw REST без SDK (прецедент: ttsBake → GCP TTS REST). Сервер НЕ участвует (архитектура A,
// решение S4-TRANSPORT): ни байта медиа и ни ASR-вызова через CX23. Протокол верифицирован
// scripts/premium/ingest-audio-live-smoke.js + ingest-audio-cors-check.js (spike Task 2).
(function () {
  "use strict";
  var GL = "https://generativelanguage.googleapis.com";
  var MODEL = (typeof window !== "undefined" && window.AsrTranscript) ? window.AsrTranscript.ASR_MODEL
            : (typeof module !== "undefined" ? require("./asr-transcript.js").ASR_MODEL : "gemini-flash-latest");

  function buildStartUploadRequest(apiKey, meta) {
    return {
      url: GL + "/upload/v1beta/files",
      init: {
        method: "POST",
        headers: {
          "x-goog-api-key": String(apiKey),
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(meta.sizeBytes),
          "X-Goog-Upload-Header-Content-Type": String(meta.mimeType),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: String(meta.displayName || "audio") } }),
      },
    };
  }

  function buildAsrRequest(apiKey, fileUri, mimeType, promptText) {
    return {
      url: GL + "/v1beta/models/" + MODEL + ":generateContent",
      init: {
        method: "POST",
        headers: { "x-goog-api-key": String(apiKey), "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { file_data: { file_uri: String(fileUri), mime_type: String(mimeType) } },
            { text: String(promptText) },
          ] }],
          generationConfig: { temperature: 0 },
        }),
      },
    };
  }

  async function httpErr(resp, fallback) {
    var body = ""; try { body = await resp.text(); } catch (_) {}
    var e = new Error(body || fallback); e.status = resp.status; return e;
  }

  async function uploadFile(apiKey, blob, mimeType, onPhase) {
    if (onPhase) onPhase("upload-start");
    var size = blob.byteLength != null ? blob.byteLength : blob.size;
    var r = buildStartUploadRequest(apiKey, { sizeBytes: size, mimeType: mimeType, displayName: "studio-import" });
    var start = await fetch(r.url, r.init);
    if (!start.ok) throw await httpErr(start, "upload start failed");
    var uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl) { var e = new Error("no x-goog-upload-url"); e.code = "UPLOAD_FAILED"; throw e; }
    if (onPhase) onPhase("upload-bytes");
    var up = await fetch(uploadUrl, {
      method: "POST",
      headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
      body: blob,
    });
    if (!up.ok) throw await httpErr(up, "upload failed");
    var file = (await up.json()).file || {};
    return { fileUri: file.uri, name: file.name, state: file.state };
  }

  async function waitActive(apiKey, name, opts) {
    var interval = (opts && opts.intervalMs) || 2000;
    var deadline = Date.now() + ((opts && opts.timeoutMs) || 60000);
    for (;;) {
      var g = await fetch(GL + "/v1beta/" + name, { headers: { "x-goog-api-key": String(apiKey) } });
      if (!g.ok) throw await httpErr(g, "files.get failed");
      var state = (await g.json()).state;
      if (state === "ACTIVE") return;
      if (state === "FAILED") { var e = new Error("file processing failed"); e.code = "FILE_FAILED"; throw e; }
      if (Date.now() > deadline) { var t = new Error("file processing timeout"); t.code = "FILE_TIMEOUT"; throw t; }
      await new Promise(function (res) { setTimeout(res, interval); });
    }
  }

  async function transcribeAudio(apiKey, fileUri, mimeType) {
    var prompt = (typeof window !== "undefined" && window.AsrTranscript) ? window.AsrTranscript.ASR_PROMPT
               : require("./asr-transcript.js").ASR_PROMPT;
    var r = buildAsrRequest(apiKey, fileUri, mimeType, prompt);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 180000) : null;
    var resp;
    try { resp = await fetch(r.url, Object.assign({}, r.init, ctrl ? { signal: ctrl.signal } : {})); }
    catch (e) {
      if (e && e.name === "AbortError") { var t = new Error("ASR timeout"); t.code = "ASR_TIMEOUT"; throw t; }
      throw e;
    } finally { if (timer) clearTimeout(timer); }
    if (!resp.ok) throw await httpErr(resp, "generateContent failed");
    var data = await resp.json();
    var parts = ((data.candidates || [])[0] || {}).content;
    return ((parts && parts.parts) || []).map(function (p) { return p.text || ""; }).join("");
  }

  var API = { buildStartUploadRequest: buildStartUploadRequest, buildAsrRequest: buildAsrRequest,
              uploadFile: uploadFile, waitActive: waitActive, transcribeAudio: transcribeAudio };
  if (typeof window !== "undefined") window.GeminiFiles = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

- [ ] **Step 4: Run tests** — `node --test tests/geminiFiles.test.js` → PASS; повторно `node scripts/premium/ingest-audio-live-smoke.js` НЕ нужен (протокол не менялся).
- [ ] **Step 5: Commit** — `git add public/js/gemini-files.js tests/geminiFiles.test.js && git commit -m "feat(ingest): W2-S4 browser Files API client (resumable upload + ACTIVE poll + ASR)"`

---

### Task 6: сервер — `segments[]` у `/api/translate-table` (`ingest/segTable.js`)

**Files:**
- Create: `ingest/segTable.js`
- Modify: `server.js` — handler `/api/translate-table` (строки ~6419-6530) + `buildRowsFromGeminiPayload` (~6243-6326)
- Test: `tests/segTable.test.js`; Modify: `scripts/ingest-smoke.js` (+3 кейса 4xx)

**Interfaces:**
- Consumes: существующие `HE_RU_PROMPT`-инфраструктуру НЕ трогает; `isPlausibleGeminiKey` — без изменений.
- Produces:
  - `validateSegmentsInput(segments) => {ok, error_code?}` — массив 1..400 элементов `{i:k, text:непустая строка ≤2000}`
  - `buildSegInput(segments) => "[0] text\n[1] text…"`
  - `HE_RU_SEG_PROMPT(segInput) => string`
  - `validateSegMapping(rows, segCount) => boolean` — `segment_index` целые, в диапазоне, неубывающие
  - API-контракт: запрос `+ segments?: [{i,text}]` (только `direction:"he-ru"`); ответ `+ rows[].segment_index?`, `+ warnings: string[]` (`["SEG_MAPPING_LOST"]` при провале валидации); `error_code:"BAD_SEGMENTS"` на кривом входе; `promptId="he-ru-table-seg-v1"` (кэш-неймспейс отдельный).

- [ ] **Step 1: Write the failing test**

```js
// tests/segTable.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../ingest/segTable.js");

test("validateSegmentsInput: shape, count, index-parity", () => {
  assert.equal(S.validateSegmentsInput([{ i: 0, text: "שלום" }, { i: 1, text: "עולם" }]).ok, true);
  for (const bad of [null, [], "x",
    [{ i: 1, text: "a" }],                       // i != позиции
    [{ i: 0, text: "" }],                        // пустой текст
    [{ i: 0, text: "x".repeat(2001) }],          // слишком длинный
    Array.from({ length: 401 }, (_, k) => ({ i: k, text: "a" })),
  ]) assert.equal(S.validateSegmentsInput(bad).ok, false);
});

test("buildSegInput numbers lines and collapses inner whitespace", () => {
  assert.equal(S.buildSegInput([{ i: 0, text: " שלום  לך " }, { i: 1, text: "טוב" }]), "[0] שלום לך\n[1] טוב");
});

test("HE_RU_SEG_PROMPT embeds input and demands segment_index JSON", () => {
  const p = S.HE_RU_SEG_PROMPT("[0] שלום");
  assert.ok(p.includes("[0] שלום") && p.includes("segment_index") && p.includes("NEVER merge"));
});

test("validateSegMapping: in-range non-decreasing ints", () => {
  assert.equal(S.validateSegMapping([{ segment_index: 0 }, { segment_index: 0 }, { segment_index: 1 }], 2), true);
  assert.equal(S.validateSegMapping([{ segment_index: 1 }, { segment_index: 0 }], 2), false); // убывание
  assert.equal(S.validateSegMapping([{ segment_index: 2 }], 2), false);                        // вне диапазона
  assert.equal(S.validateSegMapping([{}], 1), false);
  assert.equal(S.validateSegMapping([], 1), false);
});
```

- [ ] **Step 2: Run test to verify it fails** — module not found

- [ ] **Step 3: `ingest/segTable.js`**

```js
// ingest/segTable.js
// W2-S4 · Сегмент-режим /api/translate-table: транскрипт приходит ПРЕ-сегментированным (ASR),
// модель обязана сохранить границы (1 сегмент → ≥1 строк, segment_index на каждой строке) —
// структурная привязка тайминга к строкам вместо текст-матчинга (R11). Существующие
// HE_RU_PROMPT/ANY_HE_PROMPT не тронуты; promptId he-ru-table-seg-v1 = отдельный кэш-неймспейс.
"use strict";

const MAX_SEGMENTS = 400;
const MAX_SEG_TEXT = 2000;

function validateSegmentsInput(segments) {
  if (!Array.isArray(segments) || !segments.length || segments.length > MAX_SEGMENTS) {
    return { ok: false, error_code: "BAD_SEGMENTS" };
  }
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k];
    if (!s || s.i !== k || typeof s.text !== "string" || !s.text.trim() || s.text.length > MAX_SEG_TEXT) {
      return { ok: false, error_code: "BAD_SEGMENTS" };
    }
  }
  return { ok: true };
}

function buildSegInput(segments) {
  return segments.map((s) => "[" + s.i + "] " + s.text.trim().replace(/\s+/g, " ")).join("\n");
}

function HE_RU_SEG_PROMPT(segInput) {
  return `You are a strict JSON generator for a Hebrew learning app.
INPUT: a numbered list of Hebrew transcript segments, one per line, in the form "[k] text".
TASK:
1) Keep the given segmentation: NEVER merge text from two different input segments into one row.
2) You MAY split one long input segment into several rows (in original order).
3) Every row MUST carry "segment_index" = the k of the input segment the row came from.
4) For each row produce: "he" (Hebrew as in the input, cleaned, WITHOUT niqqud), "he_niqqud" (the same Hebrew fully vocalized), "translit" (Latin transliteration of the vocalized Hebrew), "ru" (Russian translation).
5) Echo the input segments as "segments": [{"index": k, "he": "<input segment text>"}].
Rules:
- Preserve the original order; "segment_index" values must be non-decreasing, starting at 0.
- Do NOT invent, drop or reorder content; do NOT translate the Hebrew column.
- The input is a speech transcript and may contain fillers or "[…]" for unclear regions — keep them as-is.
Output ONLY JSON, no markdown fences:
{"segments":[{"index":0,"he":"..."}],"rows":[{"segment_index":0,"he":"...","he_niqqud":"...","translit":"...","ru":"..."}]}
INPUT SEGMENTS:
${segInput}`;
}

function validateSegMapping(rows, segCount) {
  if (!Array.isArray(rows) || !rows.length) return false;
  let last = -1;
  for (const r of rows) {
    const si = r && r.segment_index;
    if (!Number.isInteger(si) || si < 0 || si >= segCount || si < last) return false;
    last = si;
  }
  return true;
}

module.exports = { MAX_SEGMENTS, validateSegmentsInput, buildSegInput, HE_RU_SEG_PROMPT, validateSegMapping };
```

- [ ] **Step 4: Run unit** — `node --test tests/segTable.test.js` → PASS

- [ ] **Step 5: Wiring в server.js.** Точки (номера строк — ориентиры v3.11.245, сверить grep-ом `grep -n "api/translate-table" server.js`):
  1. Рядом с `require("./ingest/geminiKey.js")` (server.js:25): `const segTable = require("./ingest/segTable.js");`
  2. В handler после whitelist `direction` (~6423-6428):

```js
    // W2-S4: сегмент-режим (пре-сегментированный ASR-транскрипт). Только he-ru.
    const segMode = req.body && req.body.segments != null;
    if (segMode) {
      if (direction !== "he-ru") {
        return res.status(400).json({ error: "segments допустим только с direction he-ru", error_code: "BAD_SEGMENTS" });
      }
      const sv = segTable.validateSegmentsInput(req.body.segments);
      if (!sv.ok) return res.status(400).json({ error: "Некорректные segments", error_code: sv.error_code });
    }
```

  3. Требование непустого `text` (существующая проверка перед ~6451) — в segMode НЕ требовать `text`; `cleanText`:

```js
    const cleanText = segMode ? segTable.buildSegInput(req.body.segments) : text.trim();
```

  4. `promptId` (~6453): `const promptId = segMode ? "he-ru-table-seg-v1" : (direction === "any-he" ? "any-he-table-v1" : "he-ru-table-v1");`
  5. Выбор промпта (~6477): `segMode ? segTable.HE_RU_SEG_PROMPT(cleanText) : (direction === "any-he" ? ANY_HE_PROMPT(cleanText) : HE_RU_PROMPT(cleanText))`
  6. `buildRowsFromGeminiPayload` (~6243): добавить 3-й параметр `opts = {}`; в нормализации строки — `if (opts.keepSegmentIndex && Number.isInteger(row.segment_index)) out.segment_index = row.segment_index;` (существующие вызовы без opts не меняют поведение).
  7. После нормализации rows в segMode:

```js
    let warnings = [];
    if (segMode) {
      if (!segTable.validateSegMapping(rows, req.body.segments.length)) {
        rows.forEach((r) => { delete r.segment_index; });
        warnings.push("SEG_MAPPING_LOST"); // честная деградация: таблица есть, тайминг клиент отбросит
      }
    }
```

  8. В оба response-пути (fresh ~6525-6530 и cache-hit ~6463-6468) добавить `warnings` (для кэша — сохранять их в кэш-объекте при записи ~6512-6521 и возвращать при чтении; отсутствуют в старых кэш-файлах → `[]`).

- [ ] **Step 6: Детерминированные кейсы в `scripts/ingest-smoke.js`** (харнесс уже спавнит сервер): POST `/api/translate-table`:
  - `{direction:"any-he", segments:[{i:0,text:"x"}], geminiApiKey:"AIzaFake123456789012345"}` → 400 `BAD_SEGMENTS`
  - `{direction:"he-ru", segments:[{i:5,text:"x"}], geminiApiKey:"AIzaFake123456789012345"}` → 400 `BAD_SEGMENTS`
  - `{direction:"he-ru", segments:[{i:0,text:"שלום"}]}` (без ключа) → 401 `GEMINI_KEY_REQUIRED`

- [ ] **Step 7: Run** — `node --test tests/segTable.test.js && npm run smoke:ingest && npm run test:api-smoke` → PASS/зелёные
- [ ] **Step 8: Commit** — `git add ingest/segTable.js tests/segTable.test.js server.js scripts/ingest-smoke.js && git commit -m "feat(ingest): W2-S4 segment-preserving table mode (he-ru-table-seg-v1, honest SEG_MAPPING_LOST)"`

---

### Task 7: `studio-media-karaoke.js` — плеер оригинала + row-range подсветка

**Files:**
- Create: `public/js/studio-media-karaoke.js`
- Test: `tests/mediaKaraoke.test.js`
- Create: `scripts/media-karaoke-smoke.js`; Modify: `package.json` (`"smoke:media-karaoke": "node scripts/media-karaoke-smoke.js"`)

**Interfaces:**
- Consumes: `#proTable tbody tr[data-row-idx]` (структура как в `studio-karaoke.js:100-106`); `window.v3StopRowAudio` (глобальный hook, создаётся в Task 10).
- Produces (`window.StudioMediaKaraoke` + Node-export):
  - `activeSegmentRange(entries, rowCount, t) => {idx, rowStart, rowEnd}|null` (pure)
  - `start({blob, entries, rowCount}) => Promise<void>` — свой `new Audio()` (blob-URL), rAF-подсветка класса `smk-row-active` на `tr` диапазона; `entries` может быть `null` → просто плеер без подсветки (честно)
  - `stop()` (идемпотентен, revoke URL), `isActive() => boolean`
  - `seekToRow(rowIdx)`, `playSegment(rowIdx) => Promise<void>` (играет `[t_k, t_{k+1})`, авто-пауза)
  - `getAudioEl() => HTMLAudioElement|null` (для UI-позиции)

- [ ] **Step 1: Write the failing test**

```js
// tests/mediaKaraoke.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activeSegmentRange } = require("../public/js/studio-media-karaoke.js");

test("activeSegmentRange: before first → null, ranges, tail to rowCount", () => {
  const e = [{ o: 0, t: 2 }, { o: 3, t: 10 }, { o: 4, t: 20 }];
  assert.equal(activeSegmentRange(e, 6, 0), null);
  assert.deepEqual(activeSegmentRange(e, 6, 2), { idx: 0, rowStart: 0, rowEnd: 3 });
  assert.deepEqual(activeSegmentRange(e, 6, 11.5), { idx: 1, rowStart: 3, rowEnd: 4 });
  assert.deepEqual(activeSegmentRange(e, 6, 999), { idx: 2, rowStart: 4, rowEnd: 6 });
  assert.equal(activeSegmentRange([], 6, 5), null);
  assert.equal(activeSegmentRange(null, 6, 5), null);
});
```

- [ ] **Step 2: Run to verify FAIL**, then **Step 3: Implementation** (лекала `studio-karaoke.js`: rAF-loop, самоуправляемый stop по `ended/pause/error`, best-effort try/catch, `?wkdebug=1`-оверлей не нужен):

```js
// public/js/studio-media-karaoke.js
// W2-S4 · Караоке по РЕАЛЬНОМУ импортированному аудио: сегмент-уровень (R11 — никакого
// word-level), подсветка ДИАПАЗОНА строк активного сегмента [entries[k].o, entries[k+1].o).
// Собственный new Audio() на blob-URL из OPFS: rowAudioPlayer (index.html:18522) НЕ трогаем —
// его ended-хендлер двигает TTS-плейлист (чужой инвариант). Взаимное исключение: start()
// зовёт window.v3StopRowAudio (hook в index.html), а row-tts обработчик зовёт наш stop().
(function () {
  "use strict";

  function activeSegmentRange(entries, rowCount, currentTime) {
    if (!Array.isArray(entries) || !entries.length) return null;
    var t = Number(currentTime) || 0, k = -1;
    for (var i = 0; i < entries.length; i++) {
      if (t >= (Number(entries[i].t) || 0)) k = i; else break;
    }
    if (k < 0) return null;
    var rowStart = entries[k].o;
    var rowEnd = k + 1 < entries.length ? entries[k + 1].o : Math.max(Number(rowCount) || 0, rowStart + 1);
    return { idx: k, rowStart: rowStart, rowEnd: rowEnd };
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) module.exports = { activeSegmentRange: activeSegmentRange };
    return;
  }

  var CLS = "smk-row-active";
  var cur = null; // {audioEl, url, entries, rowCount, rafId, lastIdx, stopAtT, listeners}

  function paintRange(range) {
    var table = document.getElementById("proTable");
    if (!table) return;
    var hot = table.querySelectorAll("tr." + CLS);
    for (var i = 0; i < hot.length; i++) hot[i].classList.remove(CLS);
    if (!range) return;
    for (var r = range.rowStart; r < range.rowEnd; r++) {
      var tr = table.querySelector('tbody tr[data-row-idx="' + String(r) + '"]');
      if (tr) tr.classList.add(CLS);
    }
  }

  function tick() {
    if (!cur) return;
    var t = cur.audioEl ? cur.audioEl.currentTime : 0;
    if (cur.stopAtT != null && t >= cur.stopAtT) { try { cur.audioEl.pause(); } catch (_) {} cur.stopAtT = null; }
    var range = activeSegmentRange(cur.entries, cur.rowCount, t);
    var idx = range ? range.idx : -1;
    if (idx !== cur.lastIdx) { paintRange(range); cur.lastIdx = idx; }
    cur.rafId = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (!cur) { paintRange(null); return; }
    if (cur.rafId) { try { window.cancelAnimationFrame(cur.rafId); } catch (_) {} }
    if (cur.audioEl) {
      try { cur.audioEl.pause(); } catch (_) {}
      if (cur.listeners) for (var ev in cur.listeners) {
        if (Object.prototype.hasOwnProperty.call(cur.listeners, ev)) {
          try { cur.audioEl.removeEventListener(ev, cur.listeners[ev]); } catch (_) {}
        }
      }
    }
    if (cur.url) { try { URL.revokeObjectURL(cur.url); } catch (_) {} }
    paintRange(null);
    cur = null;
  }

  // segIdxForRow: последний entry с o <= rowIdx (строка внутри его диапазона)
  function segIdxForRow(entries, rowIdx) {
    if (!Array.isArray(entries)) return -1;
    var k = -1;
    for (var i = 0; i < entries.length; i++) { if (entries[i].o <= rowIdx) k = i; else break; }
    return k;
  }

  function ensureRun(blob, entries, rowCount) {
    stop();
    if (typeof window.v3StopRowAudio === "function") { try { window.v3StopRowAudio(); } catch (_) {} }
    var url = URL.createObjectURL(blob);
    var audioEl = new Audio(url);
    audioEl.preload = "auto";
    var run = { audioEl: audioEl, url: url, entries: entries || null, rowCount: rowCount, rafId: 0, lastIdx: -2, stopAtT: null, listeners: null };
    var onEnd = function () { if (cur === run) { paintRange(null); cur.lastIdx = -2; } }; // пауза ≠ teardown: позиция сохраняется
    var onGone = function () { if (cur === run) stop(); };
    run.listeners = { pause: onEnd, ended: onGone, error: onGone };
    for (var ev in run.listeners) {
      if (Object.prototype.hasOwnProperty.call(run.listeners, ev)) audioEl.addEventListener(ev, run.listeners[ev]);
    }
    cur = run;
    run.rafId = window.requestAnimationFrame(tick);
    return run;
  }

  async function start(opts) {
    try {
      var run = (cur && cur.entries === (opts.entries || null)) ? cur : ensureRun(opts.blob, opts.entries || null, opts.rowCount || 0);
      run.stopAtT = null;
      await run.audioEl.play();
    } catch (_) { /* best-effort: никогда не ломаем Студию */ }
  }

  function seekToRow(rowIdx) {
    if (!cur || !cur.entries) return;
    var k = segIdxForRow(cur.entries, Number(rowIdx));
    if (k < 0) return;
    try { cur.audioEl.currentTime = Number(cur.entries[k].t) || 0; } catch (_) {}
  }

  async function playSegment(rowIdx) {
    if (!cur || !cur.entries) return;
    var k = segIdxForRow(cur.entries, Number(rowIdx));
    if (k < 0) return;
    if (typeof window.v3StopRowAudio === "function") { try { window.v3StopRowAudio(); } catch (_) {} }
    try {
      cur.audioEl.currentTime = Number(cur.entries[k].t) || 0;
      cur.stopAtT = k + 1 < cur.entries.length ? Number(cur.entries[k + 1].t) : null;
      await cur.audioEl.play();
    } catch (_) {}
  }

  function isActive() { return !!(cur && cur.audioEl && !cur.audioEl.paused); }
  function getAudioEl() { return cur ? cur.audioEl : null; }

  var API = { activeSegmentRange: activeSegmentRange, start: start, stop: stop, isActive: isActive,
              seekToRow: seekToRow, playSegment: playSegment, getAudioEl: getAudioEl,
              _ensureRun: ensureRun };
  window.StudioMediaKaraoke = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

⚠ Нюанс `start`: повторное нажатие «▶» после паузы должно ПРОДОЛЖАТЬ (не пересоздавать blob-URL). Реализация выше пересоздаёт run только если `cur` нет; UI-glue (Task 10) хранит blob и вызывает `start` с теми же entries.

- [ ] **Step 4: smoke-скрипт** — `scripts/media-karaoke-smoke.js`: Node-прогон `activeSegmentRange` на 6 кейсах из unit-теста + кейс `entries=null` (нет тайминга → всегда null → «no fake highlight»); печать `MEDIA-KARAOKE SMOKE OK`. Добавить в `package.json` scripts: `"smoke:media-karaoke": "node scripts/media-karaoke-smoke.js"`.
- [ ] **Step 5: Run** — `node --test tests/mediaKaraoke.test.js && npm run smoke:media-karaoke` → PASS/OK
- [ ] **Step 6: Commit** — `git add public/js/studio-media-karaoke.js tests/mediaKaraoke.test.js scripts/media-karaoke-smoke.js package.json && git commit -m "feat(studio): W2-S4 media karaoke module (segment row-range highlight, own audio element)"`

---

### Task 8: UI-флоу «Импорт → Аудио» (`studio-import.js` + модал + локали)

**Files:**
- Modify: `public/js/studio-import.js`
- Modify: `public/index.html` — `#v3ImportModal` (audio-вход; найти по `id="v3ImportModal"`) + `<script src>` подключение 5 новых js ПЕРЕД `studio-import.js`
- Modify: `public/i18n/locales/{ru,en,he}.js`

**Interfaces:**
- Consumes: `AsrTranscript` (T1), `GeminiError` (T3), `MediaStore` (T4), `GeminiFiles` (T5); `geminiKeyGet()` (глобал Студии).
- Produces:
  - `StudioImport.onAudioChosen(ev)`, `StudioImport.transcribeAudio()` — публикуются в `window.StudioImport`
  - `window.v3LastImportMeta.audio` со схемой §3.4 дизайна (`{v:1, media:{opfsPath|null, sessionOnly?, sha256, mime, sizeBytes, durationSec, originalName}, asr:{method:'gemini-asr', model, at, language, filesApi:true, warnings}, segments:[{i,start,text}], timing:null, timingDropReason:string|null}`)
  - `window.v3SessionMediaBlob: Blob|null` — фолбэк, когда OPFS-запись недоступна (`sessionOnly:true`)

- [ ] **Step 1: HTML** — в `#v3ImportModal` после файлового входа добавить блок:

```html
<div class="v3-import-audio">
  <label class="v3-import-file-btn">
    <span data-i18n="studio.import.audioBtn">Аудио (иврит) → транскрипт</span>
    <input type="file" id="v3ImportAudio" accept="audio/*,.m4a,.oga,.opus" hidden
           onchange="StudioImport.onAudioChosen(event)">
  </label>
  <div id="v3ImportAudioInfo" hidden>
    <span id="v3ImportAudioMeta"></span>
    <button type="button" id="v3ImportAudioGo" class="btn-secondary"
            onclick="StudioImport.transcribeAudio()"></button>
  </div>
</div>
```

CSS-исключение mobile-ловушки: `.v3-import-audio button, #v3ImportAudioInfo button { width: auto; }` (в блок стилей `.v3-modal`).

- [ ] **Step 2: `studio-import.js`** — добавить (константы вверху, функции перед `window.StudioImport`, экспорт расширить):

```js
  var MAX_AUDIO_SEC = 20 * 60;           // решение S4-CAP: 20 минут hard cap (R16)
  var MAX_AUDIO_BYTES = 300 * 1024 * 1024; // sanity
  var pendingAudio = null; // {file, buf, sha256, mime, durationSec, name, parsed, validation}

  function probeAudioDuration(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var a = new Audio();
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; URL.revokeObjectURL(url); reject(new Error("AUDIO_BAD_FILE")); } }, 10000);
      a.onloadedmetadata = function () {
        if (done) return; done = true; clearTimeout(to); URL.revokeObjectURL(url);
        (isFinite(a.duration) && a.duration > 0) ? resolve(a.duration) : reject(new Error("AUDIO_BAD_FILE"));
      };
      a.onerror = function () { if (!done) { done = true; clearTimeout(to); URL.revokeObjectURL(url); reject(new Error("AUDIO_BAD_FILE")); } };
      a.src = url;
    });
  }

  async function onAudioChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    $("v3ImportAudioInfo").hidden = true;
    pendingAudio = null;
    if (file.size > MAX_AUDIO_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    var dur;
    try { dur = await probeAudioDuration(file); }
    catch (_) { setStatus("studio.import.errAudioBadFile"); return; }
    if (dur > MAX_AUDIO_SEC + 1) { setStatus("studio.import.errAudioTooLong"); return; }
    var mime = file.type || "audio/mpeg";
    pendingAudio = { file: file, buf: null, sha256: null, mime: mime, durationSec: dur, name: file.name, parsed: null, validation: null };
    var est = window.AsrTranscript.estimateAsrCostUsd(dur);
    var mm = Math.floor(dur / 60), ss = String(Math.round(dur % 60)).padStart(2, "0");
    $("v3ImportAudioMeta").textContent = mm + ":" + ss + " · " + (file.size / (1024 * 1024)).toFixed(1) + "MB";
    $("v3ImportAudioGo").textContent = tr("studio.import.audioGo") + " (≈$" + Math.max(0.01, est).toFixed(2) + ")";
    $("v3ImportAudioInfo").hidden = false;
    setStatus(null);
  }

  async function transcribeAudio() {
    if (!pendingAudio) return;
    var key = typeof window.geminiKeyGet === "function" ? window.geminiKeyGet() : "";
    if (!key) { setStatus("studio.import.errNoKey"); return; }
    setBusy(true);
    try {
      setStatus("studio.import.audioUploading");
      pendingAudio.buf = await pendingAudio.file.arrayBuffer();
      pendingAudio.sha256 = await window.MediaStore.sha256Hex(pendingAudio.buf);
      var up = await window.GeminiFiles.uploadFile(key, pendingAudio.file, pendingAudio.mime);
      setStatus("studio.import.audioProcessing");
      if (up.state !== "ACTIVE") await window.GeminiFiles.waitActive(key, up.name);
      setStatus("studio.import.audioTranscribing");
      var raw = await window.GeminiFiles.transcribeAudio(key, up.fileUri, pendingAudio.mime);
      var parsed;
      try { parsed = window.AsrTranscript.parseAsrResponse(raw); }
      catch (e1) {
        if (e1.code !== "ASR_BAD_JSON") throw e1;
        raw = await window.GeminiFiles.transcribeAudio(key, up.fileUri, pendingAudio.mime); // 1 повтор
        parsed = window.AsrTranscript.parseAsrResponse(raw);
      }
      if (!parsed.segments.length || parsed.warnings.includes("NO_SPEECH")) { setStatus("studio.import.errNoSpeech"); return; }
      pendingAudio.parsed = parsed;
      pendingAudio.validation = window.AsrTranscript.validateSegments(parsed.segments, pendingAudio.durationSec);
      showPreview({
        kind: "audio", source: pendingAudio.name, method: "gemini-asr",
        model: window.AsrTranscript.ASR_MODEL,
        warnings: parsed.warnings.concat(pendingAudio.validation.timingOk ? [] : ["ASR_TIMING_INVALID"]),
        text: pendingAudio.validation.segments.map(function (s) { return s.text; }).join("\n"),
      });
    } catch (e) {
      var code = e && e.code;
      if (!code && e && (e.status != null)) code = window.GeminiError.classifyGeminiError(e).error_code;
      setStatus(errKey(code || "UPLOAD_FAILED"));
    } finally { setBusy(false); }
  }
```

Расширить `useText()` (после существующей проверки text) веткой аудио:

```js
    if (pending && pending.kind === "audio" && pendingAudio && pendingAudio.validation) {
      var lines = text.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var v = pendingAudio.validation;
      var editedAway = lines.length !== v.segments.length;
      var segs = editedAway
        ? lines.map(function (t2, k) { return { i: k, start: null, text: t2 }; })
        : v.segments.map(function (s, k) { return { i: k, start: s.start, text: lines[k] }; });
      var dropReason = editedAway ? "PREVIEW_EDITED" : (v.timingOk ? null : v.dropReason);
      var fileName = window.MediaStore.mediaFileName(pendingAudio.sha256, pendingAudio.mime, pendingAudio.name);
      // OPFS-запись; недоступна (старый Safari) → session-only blob + честный warning
      window.v3SessionMediaBlob = null;
      var saved = { ok: false, reason: "SKIPPED" };
      // (await внутри useText: сделать useText async — вызовы onclick это терпят)
      saved = window.MediaStore.canWrite() ? (/* await */ null) : { ok: false, reason: "NO_CREATE_WRITABLE" };
      // РЕАЛИЗАЦИЯ: см. примечание ниже — useText становится async, saved = await MediaStore.saveMedia(...)
      audioMetaForImport = {
        v: 1,
        media: { opfsPath: saved.ok ? fileName : null, sessionOnly: !saved.ok, sha256: pendingAudio.sha256,
                 mime: pendingAudio.mime, sizeBytes: pendingAudio.file.size,
                 durationSec: pendingAudio.durationSec, originalName: pendingAudio.name },
        asr: { method: "gemini-asr", model: window.AsrTranscript.ASR_MODEL, at: new Date().toISOString(),
               language: pendingAudio.parsed.language, filesApi: true, warnings: pendingAudio.parsed.warnings },
        segments: segs, timing: null, timingDropReason: dropReason,
      };
      if (!saved.ok) window.v3SessionMediaBlob = pendingAudio.file;
    }
```

и в присвоение `window.v3LastImportMeta` добавить `audio: audioMetaForImport || undefined`. **Примечание исполнителю:** `useText` становится `async function`; `saved = await window.MediaStore.saveMedia(pendingAudio.buf, fileName)` вызывается только в аудио-ветке; при `editedAway` показать `toast("studio.import.audioTimingDropped","warning")`.

ERROR_KEY добавить: `AUDIO_BAD_FILE→errAudioBadFile, AUDIO_TOO_LONG→errAudioTooLong, UPLOAD_FAILED→errUpload, FILE_FAILED→errUpload, FILE_TIMEOUT→errUpload, ASR_TIMEOUT→errOverloaded, ASR_BAD_JSON→errExtractBadJson, NO_SPEECH→errNoSpeech` (+ существующие GEMINI_*).

- [ ] **Step 3: Локали** — во все ТРИ файла `public/i18n/locales/{ru,en,he}.js`, секция `studio.import` (по образцу W1-ключей):

| key | ru | en | he |
|---|---|---|---|
| audioBtn | Аудио (иврит) → транскрипт | Audio (Hebrew) → transcript | אודיו (עברית) → תמלול |
| audioGo | Транскрибировать | Transcribe | תמלל |
| audioUploading | Загрузка аудио в Google… | Uploading audio to Google… | מעלה אודיו ל-Google… |
| audioProcessing | Google обрабатывает файл… | Google is processing the file… | Google מעבד את הקובץ… |
| audioTranscribing | Транскрибирование… (до 2–3 мин) | Transcribing… (up to 2–3 min) | מתמלל… (עד 2–3 דק׳) |
| errAudioBadFile | Не удалось прочитать аудио-файл | Could not read the audio file | לא ניתן לקרוא את קובץ האודיו |
| errAudioTooLong | Аудио длиннее 20 минут — лимит v1 | Audio longer than 20 min — v1 limit | האודיו ארוך מ-20 דקות — מגבלת גרסה זו |
| errUpload | Не удалось загрузить аудио в Google — повторите | Upload to Google failed — retry | ההעלאה ל-Google נכשלה — נסו שוב |
| errNoSpeech | Речь в аудио не найдена | No speech found in the audio | לא נמצא דיבור באודיו |
| audioTimingDropped | Правки изменили число строк — караоке отключено | Edits changed line count — karaoke disabled | העריכות שינו את מספר השורות — הקריוקי כובה |
| provAudio | Аудио → ASR-транскрипт (Gemini) | Audio → ASR transcript (Gemini) | אודיו → תמלול ASR (Gemini) |

`showPreview` prov-map: добавить `audio: "studio.import.provAudio"`.

- [ ] **Step 4: `<script src>`** — в `index.html` рядом с подключением `studio-import.js` добавить ПЕРЕД ним (порядок: зависимости раньше потребителя):

```html
<script src="js/gemini-error.js"></script>
<script src="js/asr-transcript.js"></script>
<script src="js/media-store.js"></script>
<script src="js/gemini-files.js"></script>
<script src="js/studio-media-karaoke.js"></script>
```

- [ ] **Step 5: Verify** — `node --test` (все юниты зелёные); Playwright: открыть Студию, `browser_resize(380, 844)` → открыть «Импорт» → скриншот (кнопка аудио видна, ширины auto); прогнать `npm run smoke:i18n`.
- [ ] **Step 6: Commit** — `git add public/js/studio-import.js public/index.html public/i18n/locales/*.js && git commit -m "feat(studio): W2-S4 audio import flow (duration cap, cost estimate, ASR, honest preview)"`

---

### Task 9: glue — сегмент-режим перевода, тайминг, persistence

**Files:**
- Modify: `public/index.html` — сборка payload (`:32596`), success-handler (`:32610-32632`), `v3AttachImportSource` (`:23194`), открытие текста из библиотеки (парсинг meta `:13604` / `:24820`), сбросы `v3LastImportMeta` (`:13611`, `:20779`, `:24827`)

**Interfaces:**
- Consumes: `AsrTranscript.buildRowTiming` (T1); ответ translate-table `rows[].segment_index` + `warnings` (T6); `window.v3LastImportMeta.audio` (T8).
- Produces:
  - `v3AudioSegmentsForRequest() => [{i,text}]|null` — сегменты для запроса, если текст не разъехался
  - `v3AttachAudioTiming(res) => void` — после ответа: `v3LastGeminiMeta.source.audio.timing`
  - `window.v3ActiveMediaAudio` — активный аудио-паспорт открытого/построенного текста (или null)
  - `v3RestoreMediaFromMeta(parsedMeta) => void` — при открытии сохранённого текста

- [ ] **Step 1: Запрос.** В `index.html` перед `translateTable` (рядом с `getTableDirection`, `:32711`) добавить:

```js
    // W2-S4: сегменты для сегмент-режима — только если импорт был аудио, направление he-ru
    // и текущий текст построчно совпадает по числу строк с ASR-сегментами (иначе честно без тайминга).
    function v3AudioSegmentsForRequest() {
        try {
            const im = window.v3LastImportMeta;
            if (!im || im.kind !== "audio" || !im.audio || !Array.isArray(im.audio.segments)) return null;
            if (im.audio.timingDropReason) return null;
            if (getTableDirection() !== "he-ru") return null;
            const lines = getText().split("\n").map((s) => s.trim()).filter(Boolean);
            if (lines.length !== im.audio.segments.length) return null;
            return lines.map((t2, k) => ({ i: k, text: t2 }));
        } catch (_) { return null; }
    }
```

Payload `:32596` дополнить:

```js
            : (() => {
                const segs = v3AudioSegmentsForRequest();
                return { text: getText(), geminiApiKey: geminiKeyGet(), direction: getTableDirection(),
                         ...(segs ? { segments: segs } : {}) };
              })();
```

- [ ] **Step 2: Ответ.** В `v3AttachImportSource` (`:23194`) после копирования полей source добавить `if (im.kind === "audio" && im.audio) src.audio = im.audio;` (сверить имя локальной переменной source-объекта по месту). Сразу после обоих вызовов `v3AttachImportSource()` (`:32621`, `:32631`) вызвать:

```js
    v3AttachAudioTiming(res);
```

и определить рядом с `v3AttachImportSource`:

```js
function v3AttachAudioTiming(res) {
  try {
    const src = v3LastGeminiMeta && v3LastGeminiMeta.source;
    if (!src || !src.audio) { window.v3ActiveMediaAudio = null; return; }
    const audio = src.audio;
    const rows = (res && res.rows) || [];
    const lost = ((res && res.warnings) || []).includes("SEG_MAPPING_LOST");
    const anyIdx = rows.some((r) => Number.isInteger(r.segment_index));
    if (!audio.timingDropReason && anyIdx && !lost) {
      audio.timing = window.AsrTranscript.buildRowTiming(
        audio.segments, rows.map((r) => (Number.isInteger(r.segment_index) ? r.segment_index : null)));
      if (!audio.timing) audio.timingDropReason = "SEG_MAPPING_LOST";
    } else if (!audio.timing) {
      audio.timingDropReason = audio.timingDropReason || (lost ? "SEG_MAPPING_LOST" : audio.timingDropReason);
    }
    window.v3ActiveMediaAudio = audio;
    if (typeof v3MediaBarRefresh === "function") v3MediaBarRefresh(); // Task 10
  } catch (_) {}
}
```

- [ ] **Step 3: Restore при открытии из библиотеки.** В обоих местах парсинга meta открытого текста (`:13604`, `:24820` — `table_model_meta_json || tableModelMetaJson`; для LOCAL_MODE fallback `source_meta_json` — как в `v3TextMetaOpen:31770-31782`) после установки `v3LastGeminiMeta` вызвать:

```js
function v3RestoreMediaFromMeta(meta) {
  try {
    const audio = meta && meta.source && meta.source.audio;
    window.v3ActiveMediaAudio = audio || null;
    if (typeof StudioMediaKaraoke !== "undefined") StudioMediaKaraoke.stop();
    if (typeof v3MediaBarRefresh === "function") v3MediaBarRefresh();
  } catch (_) {}
}
```

- [ ] **Step 4: Сбросы.** Во всех трёх точках `window.v3LastImportMeta = null` (`:13611`, `:20779`, `:24827`) добавить `window.v3ActiveMediaAudio = null; window.v3SessionMediaBlob = null; if (typeof StudioMediaKaraoke !== "undefined") StudioMediaKaraoke.stop(); if (typeof v3MediaBarRefresh === "function") v3MediaBarRefresh();`

- [ ] **Step 5: Verify** — ручной сценарий в браузере (dev, cache-bust `?v=N`): импорт `he-sample.mp3` с реальным ключом → превью → использовать → перевести → в консоли `v3ActiveMediaAudio.timing` не null, `entries.length >= 2`; сохранить в библиотеку → перезагрузить → открыть текст → `v3ActiveMediaAudio` восстановлен. Юниты/смоуки зелёные.
- [ ] **Step 6: Commit** — `git add public/index.html && git commit -m "feat(studio): W2-S4 segment-mode translate glue + row timing + media meta persistence"`

---

### Task 10: playback-UI — медиа-бар, повтор сегмента, tap-seek, mutual exclusion

**Files:**
- Modify: `public/index.html` — `#v3MediaBar` (HTML+CSS), `v3MediaBarRefresh`, augmentation кнопок повтора, hook в row-tts обработчике (`:37523+`), `window.v3StopRowAudio` рядом с `ensureRowAudioPlayer` (`:18522`)

**Interfaces:**
- Consumes: `StudioMediaKaraoke` (T7), `MediaStore.readMedia` (T4), `window.v3ActiveMediaAudio` + `window.v3SessionMediaBlob` (T8/T9).
- Produces: `v3MediaBarRefresh()`, `v3MediaPlayOriginal()`, `v3MediaAugmentRows()` (глобальные функции index.html).

- [ ] **Step 1: HTML+CSS.** Над таблицей (рядом с `.table-autonext` блоком `:10889`):

```html
<div id="v3MediaBar" hidden>
  <button type="button" id="v3MediaPlayBtn" onclick="v3MediaPlayOriginal()">▶ <span data-i18n="studio.media.playOriginal">Оригинал</span></button>
  <span id="v3MediaBarNote" class="v3-media-note"></span>
</div>
```

CSS (в основной блок стилей + НЕ забыть mobile-ловушку):

```css
#v3MediaBar { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
#v3MediaBar button { width: auto; }
#v3MediaBar[hidden] { display: none; }        /* [hidden] vs display-ловушка */
.smk-row-active td { background: rgba(255, 193, 7, 0.18); }
.smk-row-replay { width: auto; padding: 0 6px; margin-inline-start: 4px; font-size: 12px; }
```

- [ ] **Step 2: Логика бара** (рядом с v3AttachAudioTiming):

```js
let v3MediaBlobCache = null; // {sha256, blob}
async function v3MediaResolveBlob(audio) {
  if (!audio || !audio.media) return null;
  if (v3MediaBlobCache && v3MediaBlobCache.sha256 === audio.media.sha256) return v3MediaBlobCache.blob;
  let blob = null;
  if (audio.media.sessionOnly) blob = window.v3SessionMediaBlob || null;
  else if (audio.media.opfsPath && typeof MediaStore !== "undefined") blob = await MediaStore.readMedia(audio.media.opfsPath);
  if (blob) v3MediaBlobCache = { sha256: audio.media.sha256, blob };
  return blob;
}
function v3MediaBarRefresh() {
  const bar = document.getElementById("v3MediaBar");
  if (!bar) return;
  const audio = window.v3ActiveMediaAudio;
  bar.hidden = !audio;
  if (!audio) { v3MediaBlobCache = null; return; }
  const note = document.getElementById("v3MediaBarNote");
  if (note) note.textContent = audio.timing ? "" : t("studio.media.noTiming");
  v3MediaResolveBlob(audio).then((blob) => {
    const btn = document.getElementById("v3MediaPlayBtn");
    if (btn) btn.disabled = !blob;
    if (!blob && note) note.textContent = t("studio.media.fileMissing");
    v3MediaAugmentRows();
  });
}
async function v3MediaPlayOriginal() {
  const audio = window.v3ActiveMediaAudio;
  if (!audio) return;
  const blob = await v3MediaResolveBlob(audio);
  if (!blob) return;
  await StudioMediaKaraoke.start({
    blob, entries: audio.timing ? audio.timing.entries : null,
    rowCount: Array.isArray(currentTableData) ? currentTableData.length : 0,
  });
}
```

- [ ] **Step 3: Augmentation повтора сегмента** (решение S4-ROWPLAY; POST-render, `renderTable` не тронут):

```js
function v3MediaAugmentRows() {
  try {
    const audio = window.v3ActiveMediaAudio;
    const table = document.getElementById("proTable");
    if (!table) return;
    // снять старые кнопки (текст сменился / караоке недоступно)
    table.querySelectorAll(".smk-row-replay").forEach((b) => b.remove());
    if (!audio || !audio.timing) return;
    table.querySelectorAll("tbody tr[data-row-idx]").forEach((tr) => {
      const cell = tr.querySelector("td:last-child") || tr.lastElementChild;
      if (!cell) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "smk-row-replay";
      btn.textContent = "▶︎";
      btn.title = t("studio.media.replaySegment");
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = Number(tr.getAttribute("data-row-idx"));
        const blob = await v3MediaResolveBlob(audio);
        if (!blob) return;
        if (!StudioMediaKaraoke.getAudioEl()) await StudioMediaKaraoke.start({ blob, entries: audio.timing.entries, rowCount: currentTableData.length });
        StudioMediaKaraoke.playSegment(idx);
      });
      cell.appendChild(btn);
    });
  } catch (_) {}
}
// Пере-augment при перерисовке таблицы (без правок renderTable): observer на tbody
(function v3MediaObserveTable() {
  const tbody = document.querySelector("#proTable tbody");
  if (!tbody || !window.MutationObserver) return;
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false;
      if (!document.querySelector("#proTable .smk-row-replay")) v3MediaAugmentRows(); });
  }).observe(tbody, { childList: true });
})();
```

⚠ Если `#proTable tbody` создаётся позже DOMContentLoaded — обернуть `v3MediaObserveTable` в вызов после первой отрисовки (место инициализации Студии; наблюдать за `#proTable` появлением через тот же observer на контейнере).

- [ ] **Step 4: Tap-seek** — делегированный слушатель на `#proTable`: `if (StudioMediaKaraoke.isActive())` и клик по `tr[data-row-idx]` НЕ по кнопке → `StudioMediaKaraoke.seekToRow(idx)` (не `preventDefault` — существующее выделение строки работает как раньше).

- [ ] **Step 5: Mutual exclusion.** Рядом с `ensureRowAudioPlayer()` (`:18522`): `window.v3StopRowAudio = function () { try { if (rowAudioPlayer) rowAudioPlayer.pause(); } catch (_) {} };` В обработчике `button.row-tts-btn` (`:37523`, в начале ветки запуска): `try { if (window.StudioMediaKaraoke) StudioMediaKaraoke.stop(); } catch (_) {}`.

- [ ] **Step 6: Локали** — `studio.media.playOriginal` (Оригинал / Original / מקור), `studio.media.replaySegment` (Повторить сегмент оригинала / Replay original segment / חזרה על קטע המקור), `studio.media.noTiming` (Караоке недоступно для этого импорта / Karaoke unavailable for this import / קריוקי אינו זמין לייבוא זה), `studio.media.fileMissing` (Аудио-файл не найден в этом браузере / Audio file not found in this browser / קובץ האודיו לא נמצא בדפדפן זה) — все ТРИ файла.

- [ ] **Step 7: Verify** — браузер (`?v=N+1`, 380×844): импорт фикстуры → перевод → «▶ Оригинал» бежит подсветка диапазона строк; тап по строке — seek; кнопка ▶︎ у строки играет один сегмент и замолкает; запуск TTS-строки глушит медиа и наоборот; Playwright-скриншот с активной подсветкой. `npm run smoke:i18n` зелёный.
- [ ] **Step 8: Commit** — `git add public/index.html public/i18n/locales/*.js && git commit -m "feat(studio): W2-S4 media bar + segment replay + tap-seek + player mutual exclusion"`

---

### Task 11: панель провенанса аудио в «Метаданные текста»

**Files:**
- Modify: `public/index.html` — `v3TextMetaRenderProvenance` (`:31699+`)
- Modify: `public/i18n/locales/{ru,en,he}.js`

**Interfaces:**
- Consumes: `sm.source.audio` из `source_meta_json`/`table_model_meta_json` (уже парсится `:31770-31782`).

- [ ] **Step 1:** В `v3TextMetaRenderProvenance(source)` после существующего рендера, при `source && source.audio` добавить в янтарную (ИИ-derived) часть блок строк: `t("studio.meta.audioFile") + ": " + audio.media.originalName` · `mm:ss` из `durationSec` · `audio.asr.model` · дата `audio.asr.at` (как соседние даты) · `t("studio.meta.audioSegments") + ": " + audio.segments.length` · караоке: `audio.timing ? "✓" : "✗ (" + t("studio.meta.timingDrop." + (audio.timingDropReason || "UNKNOWN")) + ")"`. Разметку строить DOM-методами в стиле соседнего кода функции (не innerHTML-конкатенация пользовательских строк — `originalName` внешний).
- [ ] **Step 2: Локали** ×3: `studio.meta.audioFile` (Аудио-источник / Audio source / מקור אודיו), `studio.meta.audioSegments` (Сегментов / Segments / קטעים), `studio.meta.karaoke` (Караоке / Karaoke / קריוקי), `studio.meta.timingDrop.ASR_TIMING_INVALID` (тайминг ASR не прошёл проверку / ASR timing failed validation / תזמון ה-ASR לא עבר אימות), `studio.meta.timingDrop.PREVIEW_EDITED` (правки изменили сегменты / edits changed segments / עריכות שינו את הקטעים), `studio.meta.timingDrop.SEG_MAPPING_LOST` (модель не сохранила границы / model lost segment bounds / המודל איבד את גבולות הקטעים), `studio.meta.timingDrop.UNKNOWN` (недоступно / unavailable / לא זמין).
- [ ] **Step 3: Verify** — открыть «Метаданные» сохранённого аудио-текста: блок виден, для обычных текстов НЕ виден; скриншот 380px.
- [ ] **Step 4: Commit** — `git add public/index.html public/i18n/locales/*.js && git commit -m "feat(studio): W2-S4 audio provenance panel in text metadata (R9 derived)"`

---

### Task 12: релиз — SW precache, гейты, push, prod-верифай

**Files:**
- Modify: `public/sw.js` — precache `js/gemini-error.js, js/asr-transcript.js, js/media-store.js, js/gemini-files.js, js/studio-media-karaoke.js` (в список рядом с `js/studio-import.js`) + bump `CACHE_VERSION` (текущий +1 на момент коммита)

- [ ] **Step 1:** SW-правки.
- [ ] **Step 2: Полные гейты:**

Run: `node --test && npm run smoke:ingest && npm run smoke:media-karaoke && npm run smoke:reader-parity && npm run test:api-smoke && npm run smoke:i18n && npm run smoke:studio-karaoke`
Expected: всё зелёное (в т.ч. НЕтронутость reader-парити и старого караоке).

- [ ] **Step 3:** `git add public/sw.js && git commit -m "feat(studio): W2-S4 ship — SW precache + CACHE_VERSION bump"` → `git push` (единственный пуш серии → один Coolify-деплой).
- [ ] **Step 4: Prod-верифай** (после деплоя, ~3-5 мин; ловушки Coolify — память feedback_coolify_deploy_ops): `https://linguistpro.kolosei.com/healthz` 200; `GET /js/asr-transcript.js` 200; POST `/api/translate-table` `{direction:"any-he",segments:[…],geminiApiKey:"AIzaFake…"}` → 400 `BAD_SEGMENTS` (безопасный не-LLM путь). Хвост `sudo docker logs` при аномалиях.
- [ ] **Step 5:** Отчёт владельцу: версия, что вошло, что проверено.

---

### Task 13: owner-приёмка на реальном контенте + закрытие докой

**Files:**
- Modify: `docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` (§4 Wave 2 п.6 — статус S4; §7 — запись о ship)
- Modify: `docs/planning/STUDIO_INGEST_W2_S4_AUDIO_KARAOKE_DESIGN_2026_07_26.md` (статус-строка → SHIPPED vX)

- [ ] **Step 1:** Попросить владельца на проде: (а) голосовое WhatsApp/Telegram (ogg/opus), (б) iPhone voice memo (.m4a — живая проверка mime!), (в) фрагмент подкаста/урока ближе к 20 мин. Проверить: смета до запуска; транскрипт; таблица; «▶ Оригинал» бежит по строкам; повтор сегмента; переоткрытие после перезагрузки; панель «Происхождение».
- [ ] **Step 2:** По результатам — фиксы (каждый со своим тестом) либо приёмка.
- [ ] **Step 3:** Обновить оба дока (статусы, номер версии, известные ограничения), закоммитить+запушить; обновить память проекта (`project_studio_ingest_multimodal`).

---

## Self-Review (выполнен при написании)

- **Spec coverage:** транспорт/капы/кэш/row-replay (§1 дизайна) → T2/T5/T8/T10; ASR-контракт §3.1 → T1/T2; валидация §3.2 → T1; сервер §3.3 → T6; хранение §3.4 → T4/T8/T9; караоке §3.5 → T7/T10; UI §3.6 → T8; ошибки §4 → T3/T5/T8; тесты §6 → T1-T7/T12; live-smoke до релиза → T2 (spike) + T13 (owner). Провенанс-панель §3.4/§5 → T11.
- **Types:** `{i,start,text}` сегменты и `{o,t}` entries сквозные T1→T6→T7→T9; `error_code`-строки T3/T5/T8 согласованы с ERROR_KEY.
- **Известные ослабления (сознательно):** cost-констант точность (цены Gemini меняются — константы в одном месте с комментарием); `v3MediaObserveTable` зависит от момента появления tbody (шаг с явным ⚠).
