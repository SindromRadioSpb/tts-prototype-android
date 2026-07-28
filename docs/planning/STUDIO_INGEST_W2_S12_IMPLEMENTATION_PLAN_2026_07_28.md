# W2-S12 «Длинные медиа» — план имплементации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Снять потолок 20 минут: чанк-ASR окнами 15 мин + чанк-таблица по 120 сегментов с
прогрессивной отрисовкой, потолок 3 часа, смета до траты, сервер без изменений.

**Architecture:** Всё в клиенте. ASR: один upload в Gemini Files API → последовательные
range-промт окна → merge → валидация непрерывности покрытия → добор дыр. Таблица:
последовательные куски ≤120 сегментов через СУЩЕСТВУЮЩИЙ `/api/translate-table` (seg-режим),
`segment_index` глобализуется оффсетом, прогрессив = повторный `renderTable(префикс)`.
Серверный sha256-кэш куска даёт возобновление бесплатно.

**Tech Stack:** vanilla JS (dual-export pure-модули + inline Студия), node --test, Playwright-смоуки.

**Дизайн (утверждён владельцем 2026-07-28):** `docs/planning/STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md`
**Замеры:** `docs/research/studio-ingest-longmedia/2026-07-28/README.md`

## Global Constraints

- **Сервер НЕ меняется.** Ни одного файла вне `public/`, `tests/`, `scripts/premium/`,
  `docs/`, `package.json` (скрипт смоука). Нужда в серверной правке = стоп + вопрос владельцу.
- **`renderTable` НЕ редактировать** (byte-parity гейт `npm run smoke:reader-parity`).
- **browser-first BYOK:** ключ только из `geminiKeyGet()` в браузере; серверного ключа нет.
- **Локали:** каждая новая строка → `public/i18n/locales/{ru,en,he}.js` СРАЗУ в той же задаче;
  задача, тронувшая локали, бампает `?v=` у ВСЕХ locale-тегов в `index.html` (+1), `CACHE_VERSION`
  в `public/sw.js` (patch +1) и запускает `node tests/i18n.smoke.js --write-lock`.
- **R11:** только сегмент-уровень; дыры покрытия не маскировать (warning, без псевдо-сегментов);
  немонотонный стык → `start=null`; деградация куска локальна. **R9:** окна/доборы/куски/кэш-ключи —
  в провенанс. **R16:** смета ($ + минуты) до траты; для >1 куска — подтверждение.
- **Git: стейджить ТОЛЬКО явными путями** (`git add <file> <file>`), никогда `-A`/каталогом.
- **Пуш — ТОЛЬКО в Task 9.** Коммиты локальные после каждой задачи.
- **UI-коммит = скриншот 380×844 до него** (Playwright); ловушка `button{width:100%}` в
  `@media (max-width:600px)` — новым контейнерам нужны исключения `#id button {width:auto}`.
- Числовые константы из замеров НЕ менять без новых замеров: окно 900 с, дыра 90 с, кусок 120,
  220 ток/строка, потолок 10 800 с.

---

### Task 1: pure-ядро окон ASR в `asr-transcript.js`

**Files:**
- Modify: `public/js/asr-transcript.js` (добавить функции перед `var API`; API расширить)
- Test: `tests/asrTranscript.test.js` (дописать в конец)

**Interfaces:**
- Consumes: существующие `ASR_PROMPT`, `estimateAsrCostUsd`.
- Produces (для Task 3/4/6): `ASR_WINDOW_SEC=900`, `ASR_GAP_MAX_SEC=90`, `ASR_TAIL_GAP_SEC=180`,
  `asrWindows(durationSec) → [{startSec,endSec}]`,
  `ASR_RANGE_PROMPT(startSec,endSec) → string`,
  `mergeWindowSegments(perWindow: Array<Array<{start,text}>>) → [{start,text}]`,
  `findCoverageGaps(segments, durationSec) → [{fromSec,toSec}]`,
  `estimateLongJob(durationSec, {video, segmentsKnown, chunkSize}) → {asrUsd,tableUsd,totalUsd,minutes,expRows,chunks,windows}`.

- [ ] **Step 1: Написать падающие тесты** — дописать в `tests/asrTranscript.test.js`:

```js
test("asrWindows: нарезка встык, хвост короче окна, нулевая длительность", () => {
  assert.deepEqual(A.asrWindows(0), [{ startSec: 0, endSec: 0 }]);
  assert.deepEqual(A.asrWindows(900), [{ startSec: 0, endSec: 900 }]);
  assert.deepEqual(A.asrWindows(2000), [
    { startSec: 0, endSec: 900 }, { startSec: 900, endSec: 1800 }, { startSec: 1800, endSec: 2000 },
  ]);
});

test("ASR_RANGE_PROMPT: содержит базовый промт, диапазон в M:SS/H:MM:SS и ABSOLUTE", () => {
  const p = A.ASR_RANGE_PROMPT(1920, 2400);
  assert.ok(p.startsWith(A.ASR_PROMPT));
  assert.match(p, /from 32:00 to 40:00/);
  assert.match(p, /ABSOLUTE/);
  assert.match(A.ASR_RANGE_PROMPT(3600, 4500), /from 1:00:00 to 1:15:00/);
});

test("mergeWindowSegments: конкатенация, немонотонный стык → start=null", () => {
  const m = A.mergeWindowSegments([
    [{ start: 10, text: "א" }, { start: 890, text: "ב" }],
    [{ start: 870, text: "ג" }, { start: 910, text: "ד" }], // 870 < 890 — залез в прошлое окно
  ]);
  assert.deepEqual(m.map((s) => s.start), [10, 890, null, 910]);
  assert.equal(m.length, 4); // тексты не теряются
});

test("findCoverageGaps: дыра середины >90с, хвост >180с; интро НЕ дыра; null-старты прозрачны", () => {
  const segs = [{ start: 200, text: "а" }, { start: 260, text: "б" }, { start: null, text: "х" },
                { start: 500, text: "в" }];
  // интро 0..200 НЕ дыра (LATE_FIRST_SEGMENT уже флагует); 260→500 = 240с > 90 — дыра;
  // хвост 500..1000 = 500с > 180 — дыра.
  assert.deepEqual(A.findCoverageGaps(segs, 1000), [
    { fromSec: 260, toSec: 500 }, { fromSec: 500, toSec: 1000 },
  ]);
  assert.deepEqual(A.findCoverageGaps([{ start: 5, text: "а" }, { start: 80, text: "б" }], 200), []);
  assert.deepEqual(A.findCoverageGaps([], 600), []); // пусто — NO_SPEECH-путь, не дыры
});

test("estimateLongJob: 2ч подкаст в замеренных рамках; chunkSize обязателен", () => {
  const e = A.estimateLongJob(7200, { video: false, chunkSize: 120 });
  assert.ok(e.asrUsd > 0.15 && e.asrUsd < 0.5, "asrUsd=" + e.asrUsd);
  assert.ok(e.totalUsd > 0.4 && e.totalUsd < 1.5, "totalUsd=" + e.totalUsd);
  assert.ok(e.minutes >= 10 && e.minutes <= 35, "minutes=" + e.minutes);
  assert.equal(e.windows, 8);
  assert.ok(e.chunks >= 5 && e.chunks <= 8);
  assert.throws(() => A.estimateLongJob(7200, {}), /chunkSize/);
  const known = A.estimateLongJob(7200, { chunkSize: 120, segmentsKnown: 1700 });
  assert.equal(known.chunks, Math.ceil(1700 / 120));
});
```

- [ ] **Step 2: Прогнать — убедиться, что падают**: `node --test tests/asrTranscript.test.js`
  Expected: FAIL (`A.asrWindows is not a function`).

- [ ] **Step 3: Реализация** — в `public/js/asr-transcript.js` после `estimateAsrCostUsd`:

```js
  // ── W2-S12: окна ASR + покрытие + смета длинного прогона ──
  // Все числа — замер 2026-07-28 (docs/research/studio-ingest-longmedia/2026-07-28/):
  // одновызовный ASR длинных файлов молча теряет куски и упирается в 65,536 ток. вывода
  // (thinking делит бюджет с ответом); range-промт по одному fileUri работает точно.
  var ASR_WINDOW_SEC = 900;    // 15 мин — внутри доказанного прод-режима ≤20 мин
  var ASR_GAP_MAX_SEC = 90;    // дыра покрытия внутри записи, требующая добора
  var ASR_TAIL_GAP_SEC = 180;  // молчание хвоста, считающееся дырой

  function asrWindows(durationSec) {
    var d = Math.max(0, Number(durationSec) || 0);
    var out = [];
    for (var t = 0; t < d; t += ASR_WINDOW_SEC) {
      out.push({ startSec: t, endSec: Math.min(d, t + ASR_WINDOW_SEC) });
    }
    if (!out.length) out.push({ startSec: 0, endSec: 0 });
    return out;
  }

  function fmtClock(sec) { // форматы, которые secondsFromTimestamp умеет парсить
    var s = Math.max(0, Math.round(sec));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
  }

  // Дословно проверенная формулировка (research m3, фаза range258): точное окно, абсолютные метки.
  function ASR_RANGE_PROMPT(startSec, endSec) {
    var a = fmtClock(startSec), b = fmtClock(endSec);
    return ASR_PROMPT +
      "\nIMPORTANT SCOPE: transcribe ONLY the region of the recording from " + a + " to " + b +
      " (minutes:seconds from the very beginning of the file). Output NOTHING from outside this region." +
      " Timestamps must remain ABSOLUTE (measured from the very beginning of the file, i.e. within " +
      a + "-" + b + ").";
  }

  function mergeWindowSegments(perWindow) {
    var out = [], lastT = -Infinity;
    for (var w = 0; w < (perWindow || []).length; w++) {
      var segs = perWindow[w] || [];
      for (var k = 0; k < segs.length; k++) {
        var t = (typeof segs[k].start === "number" && isFinite(segs[k].start)) ? segs[k].start : null;
        if (t !== null && t < lastT) t = null; // немонотонный стык окон → честный null (R11)
        if (t !== null) lastT = t;
        out.push({ start: t, text: segs[k].text });
      }
    }
    return out;
  }

  // Интро-дыра НЕ считается: поздний первый сегмент легитимен (музыка) и уже флагуется
  // LATE_FIRST_SEGMENT в validateSegments. null-старты прозрачны (не рвут отрезок).
  function findCoverageGaps(segments, durationSec) {
    var dur = Math.max(0, Number(durationSec) || 0);
    var gaps = [], prev = null;
    for (var k = 0; k < (segments || []).length; k++) {
      var t = segments[k] && typeof segments[k].start === "number" ? segments[k].start : null;
      if (t === null) continue;
      if (prev !== null && t - prev > ASR_GAP_MAX_SEC) gaps.push({ fromSec: prev, toSec: t });
      prev = t;
    }
    if (prev !== null && dur > 0 && dur - prev > ASR_TAIL_GAP_SEC) gaps.push({ fromSec: prev, toSec: dur });
    return gaps;
  }

  // R16: ЕДИНСТВЕННОЕ место цен длинного прогона (вместе с ASR-константами выше).
  // Замер: строка таблицы ≈205–219 out-ток (берём 220); ASR-выход с thinking ≈8 ток/с;
  // кусок таблицы 147–224 с (берём 140 с консервативно на 120 сегм); окно ASR 21–139 с (берём 45).
  var TABLE_OUT_TOKENS_PER_ROW = 220;
  var TABLE_IN_TOKENS_PER_SEG = 40;
  var USD_PER_MTOK_TEXT_IN = 0.30;
  var ASR_OUT_TOKENS_PER_SEC_TOTAL = 8; // candidates+thinking, замер 75-мин прогона
  var TABLE_SEC_PER_CHUNK = 140;
  var ASR_SEC_PER_WINDOW = 45;
  var SEGS_PER_MIN_ASR = 6; // подкаст-монолог 4.8–8/мин

  function estimateLongJob(durationSec, opts) {
    if (!opts || !Number.isInteger(opts.chunkSize) || opts.chunkSize <= 0) {
      throw new Error("estimateLongJob: chunkSize обязателен (TableChunks.CHUNK_SIZE)");
    }
    var d = Math.max(0, Number(durationSec) || 0);
    var inRate = ASR_TOKENS_PER_SEC + ((opts.video) ? VIDEO_FRAME_TOKENS_PER_SEC_LOW : 0);
    var asrUsd = (d * inRate / 1e6) * USD_PER_MTOK_AUDIO_IN +
                 (d * ASR_OUT_TOKENS_PER_SEC_TOTAL / 1e6) * USD_PER_MTOK_OUT;
    var segs = Number.isInteger(opts.segmentsKnown) ? opts.segmentsKnown
             : Math.ceil((d / 60) * SEGS_PER_MIN_ASR);
    var expRows = Math.ceil(segs * 1.05); // модель может дробить сегмент на строки
    var chunks = Math.max(1, Math.ceil(segs / opts.chunkSize));
    var tableUsd = (expRows * TABLE_OUT_TOKENS_PER_ROW / 1e6) * USD_PER_MTOK_OUT +
                   (segs * TABLE_IN_TOKENS_PER_SEG / 1e6) * USD_PER_MTOK_TEXT_IN;
    var windows = asrWindows(d).length;
    var minutes = Math.ceil((windows * ASR_SEC_PER_WINDOW + chunks * TABLE_SEC_PER_CHUNK) / 60) + 1;
    return { asrUsd: asrUsd, tableUsd: tableUsd, totalUsd: asrUsd + tableUsd,
             minutes: minutes, expRows: expRows, chunks: chunks, windows: windows };
  }
```

и в `var API = {...}` добавить:
`ASR_WINDOW_SEC, ASR_GAP_MAX_SEC, ASR_TAIL_GAP_SEC, asrWindows, ASR_RANGE_PROMPT, mergeWindowSegments, findCoverageGaps, estimateLongJob` (тем же стилем `key: value`).

- [ ] **Step 4: Прогнать тесты**: `node --test tests/asrTranscript.test.js` → PASS (все, включая старые).
- [ ] **Step 5: Коммит**:
```bash
git add public/js/asr-transcript.js tests/asrTranscript.test.js
git commit -m "feat(ingest): S12 T1 — окна ASR, range-промт, merge, coverage-дыры, смета длинного прогона (pure)"
```

---

### Task 2: pure чанк-математика таблицы `table-chunks.js`

**Files:**
- Create: `public/js/table-chunks.js`
- Test: `tests/tableChunks.test.js` (новый)
- Modify: `public/index.html` — подключить `<script src="/js/table-chunks.js"></script>`
  РЯДОМ с существующим тегом `asr-transcript.js` (искать `js/asr-transcript.js` в index.html;
  вставить СЛЕДУЮЩЕЙ строкой — до studio-import.js, который идёт позже).

**Interfaces:**
- Produces (для Task 5/6 и Task 1-потребителей): `window.TableChunks` / `module.exports` c
  `CHUNK_SIZE=120`, `buildChunks(segments) → [{base, segs:[{i,text}]}]`,
  `offsetRows(rows, base) → rows'`, `coverageForChunk(rows, chunkLen) → {missing:[локальные]}`,
  `aggregateMissing(perChunk:[{base,missing}]) → [глобальные]`,
  `estimatePlainRows(text) → number` (для guard плоского пути).

- [ ] **Step 1: Тесты** — `tests/tableChunks.test.js` (новый файл целиком):

```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const TC = require("../public/js/table-chunks.js");

function segs(n, from) {
  return Array.from({ length: n }, (_, k) => ({ i: (from || 0) + k, text: "s" + ((from || 0) + k) }));
}

test("buildChunks: нарезка по 120, локальный renumber 0..n-1, base глобальный", () => {
  const chunks = TC.buildChunks(segs(300));
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.base), [0, 120, 240]);
  assert.equal(chunks[1].segs.length, 120);
  assert.equal(chunks[2].segs.length, 60);
  assert.deepEqual(chunks[1].segs[0], { i: 0, text: "s120" }); // локальный i, глобальный текст
  assert.equal(TC.buildChunks(segs(120)).length, 1);
});

test("offsetRows: сдвигает только целочисленные segment_index, не мутирует вход", () => {
  const rows = [{ he: "א", segment_index: 0 }, { he: "ב" }, { he: "ג", segment_index: 2 }];
  const out = TC.offsetRows(rows, 120);
  assert.deepEqual(out.map((r) => r.segment_index), [120, undefined, 122]);
  assert.equal(rows[0].segment_index, 0); // вход не тронут
});

test("coverageForChunk + aggregateMissing: локальные пропуски → глобальные", () => {
  const rows = [{ segment_index: 0 }, { segment_index: 0 }, { segment_index: 2 }];
  assert.deepEqual(TC.coverageForChunk(rows, 4), { missing: [1, 3] });
  assert.deepEqual(TC.coverageForChunk([{}, {}], 2), { missing: [0, 1] }); // строки без индексов
  assert.deepEqual(
    TC.aggregateMissing([{ base: 0, missing: [1] }, { base: 120, missing: [0, 5] }]),
    [1, 120, 125]);
});

test("estimatePlainRows: max(строки, символы/100)", () => {
  assert.equal(TC.estimatePlainRows("а\nб\nв"), 3);
  assert.equal(TC.estimatePlainRows("x".repeat(1000)), 10);
  assert.equal(TC.estimatePlainRows("  \n \n"), 0);
});
```

- [ ] **Step 2:** `node --test tests/tableChunks.test.js` → FAIL (module not found).
- [ ] **Step 3: Реализация** — `public/js/table-chunks.js` целиком:

```js
// public/js/table-chunks.js
// W2-S12 · Pure чанк-математика таблицы (dual-export по образцу asr-transcript.js).
// Канон: docs/planning/STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md §4.4.
// Стена: 65,536 out-ток/вызов при ~220 ток/строку ≈ 287 строк (замер 2026-07-28).
(function () {
  "use strict";

  // ~26k out-ток на кусок ≈ 2.4× запас до лимита. Смена размера инвалидирует серверный
  // кэш кусков (другой cleanText) — менять только осознанно, с новым замером.
  var CHUNK_SIZE = 120;

  function buildChunks(segments) {
    var out = [];
    var list = Array.isArray(segments) ? segments : [];
    for (var a = 0; a < list.length; a += CHUNK_SIZE) {
      var slice = list.slice(a, a + CHUNK_SIZE);
      out.push({ base: a, segs: slice.map(function (s, j) { return { i: j, text: s.text }; }) });
    }
    return out;
  }

  function offsetRows(rows, base) {
    return (rows || []).map(function (r) {
      if (r && Number.isInteger(r.segment_index)) {
        var c = Object.assign({}, r);
        c.segment_index = r.segment_index + base;
        return c;
      }
      return r;
    });
  }

  // Серверный warning SEG_COVERAGE_PARTIAL не несёт списка пропусков — клиент считает сам
  // (independent-oracle: по фактическим строкам, не по чужому флагу).
  function coverageForChunk(rows, chunkLen) {
    var seen = new Set();
    (rows || []).forEach(function (r) {
      if (r && Number.isInteger(r.segment_index)) seen.add(r.segment_index);
    });
    var missing = [];
    for (var i = 0; i < chunkLen; i++) if (!seen.has(i)) missing.push(i);
    return { missing: missing };
  }

  function aggregateMissing(perChunk) {
    var out = [];
    (perChunk || []).forEach(function (c) {
      (c.missing || []).forEach(function (m) { out.push(m + c.base); });
    });
    return out;
  }

  // Guard плоского пути (без сегментов): оценка строк будущей таблицы.
  // ~100 символов на строку — консервативно к замеренным 58 символам субтитровой реплики.
  function estimatePlainRows(text) {
    var t = String(text == null ? "" : text);
    var lines = t.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).length;
    var chars = t.replace(/\s+/g, " ").trim().length;
    return Math.max(lines, Math.ceil(chars / 100));
  }

  var API = { CHUNK_SIZE: CHUNK_SIZE, buildChunks: buildChunks, offsetRows: offsetRows,
              coverageForChunk: coverageForChunk, aggregateMissing: aggregateMissing,
              estimatePlainRows: estimatePlainRows };
  if (typeof window !== "undefined") window.TableChunks = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

- [ ] **Step 4:** `node --test tests/tableChunks.test.js` → PASS.
- [ ] **Step 5:** Подключить в `index.html` рядом с `asr-transcript.js` (см. Files) и проверить
  загрузку: `node server.js` + открыть страницу Playwright'ом, `typeof window.TableChunks` → "object".
- [ ] **Step 6: Коммит**:
```bash
git add public/js/table-chunks.js tests/tableChunks.test.js public/index.html
git commit -m "feat(ingest): S12 T2 — pure чанк-математика таблицы (CHUNK_SIZE=120, offset/coverage/guard)"
```

---

### Task 3: оркестратор окон `runWindowedAsr` + range-плумбинг в `gemini-files.js`

**Files:**
- Modify: `public/js/gemini-files.js` (`transcribeAudio` + `waitActive`)
- Modify: `public/js/studio-import.js` (pure-секция до `if (typeof window === "undefined")`)
- Test: `tests/runWindowedAsr.test.js` (новый)

**Interfaces:**
- Consumes: Task 1 (`asrWindows`, `ASR_RANGE_PROMPT`, `mergeWindowSegments`, `findCoverageGaps`).
- Produces (для Task 4):
  - `GeminiFiles.transcribeAudio(apiKey, fileUri, mimeType, opts?)`, где `opts.promptText`
    переопределяет промт (обратная совместимость: без opts — прежнее поведение);
  - `GeminiFiles.waitActive(apiKey, name, opts?)` — уже принимает `opts.timeoutMs` (не менять,
    только ПЕРЕДАВАТЬ из Task 4);
  - `StudioImport.runWindowedAsr(deps) → Promise<Result>` (dual-export из studio-import.js):
    `deps = { durationSec, transcribe(startSec|null, endSec|null) → Promise<raw>,
              parse(raw) → {language,segments:[{start,text}],warnings}, onProgress(k, m),
              maxHeals=3, startWindow=0, priorWindows=[] }`
    `Result = { segments:[{start,text}], language, warnings:[], windows:[{startSec,endSec,retries}],
                coverageGaps:[{fromSec,toSec}], healedGaps:[{fromSec,toSec}], windowSegments:[[...]] }`
    Ошибка окна после ретрая → `throw e` c `e.windowIndex` и `e.windowSegments`
    (частичные результаты для резюма).

- [ ] **Step 1: Тесты** — `tests/runWindowedAsr.test.js` (новый файл целиком):

```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SI = require("../public/js/studio-import.js"); // node-ветка dual-export
const A = require("../public/js/asr-transcript.js");

function fakeParse(raw) { return JSON.parse(raw); }
function seg(start, text) { return { start, text }; }
const R = (o) => JSON.stringify(Object.assign({ language: "he", warnings: [] }, o));

test("короткий файл (одно окно): transcribe вызывается с null-диапазоном, plain-путь", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 600,
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: [seg(1, "א"), seg(5, "ב")] }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null]]); // без range — байт-в-байт прежний промт
  assert.equal(res.segments.length, 2);
  assert.deepEqual(res.coverageGaps, []);
});

test("два окна: последовательность, merge, прогресс, язык/warnings агрегируются", async () => {
  const calls = [], progress = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1400,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      return a === 0 ? R({ segments: [seg(3, "א"), seg(890, "ב")], warnings: ["PARTIALLY_UNCLEAR"] })
                     : R({ segments: [seg(905, "ג"), seg(1395, "ד")] });
    },
    parse: fakeParse, onProgress: (k, m) => progress.push([k, m]),
  });
  assert.deepEqual(calls, [[0, 900], [900, 1400]]);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.deepEqual(res.segments.map((s) => s.start), [3, 890, 905, 1395]);
  assert.deepEqual(res.warnings, ["PARTIALLY_UNCLEAR"]);
  assert.equal(res.language, "he");
});

test("BAD_JSON окна: retry ×1 и успех; счётчик retries в windows", async () => {
  let first = true;
  const res = await SI.runWindowedAsr({
    durationSec: 600,
    transcribe: async () => {
      if (first) { first = false; return "мусор"; }
      return R({ segments: [seg(1, "א"), seg(2, "ב")] });
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.equal(res.windows[0].retries, 1);
  assert.equal(res.segments.length, 2);
});

test("BAD_JSON дважды: throw c windowIndex и частичными windowSegments", async () => {
  await assert.rejects(
    SI.runWindowedAsr({
      durationSec: 1400,
      transcribe: async (a) => {
        if (a === 0) return R({ segments: [seg(1, "א"), seg(2, "б")] });
        return "мусор";
      },
      parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                        return fakeParse(raw); },
      onProgress: () => {},
    }),
    (e) => e.code === "ASR_BAD_JSON" && e.windowIndex === 1 && e.windowSegments.length === 1);
});

test("резюм: startWindow/priorWindows продолжают без повторного вызова готовых окон", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1400, startWindow: 1,
    priorWindows: [[seg(1, "א"), seg(2, "б")]],
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: [seg(905, "ג")] }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[900, 1400]]);
  assert.deepEqual(res.segments.map((s) => s.text), ["א", "б", "ג"]);
});

test("дыра >90с внутри → добор range-вызовом ровно дыры; merge упорядочен; healedGaps в провенанс", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 900, // одно окно
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return R({ segments: [seg(10, "א"), seg(700, "ב"), seg(880, "ג")] }); // дыра 10→700
      return R({ segments: [seg(300, "д1"), seg(500, "д2")] }); // добор
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null], [10, 700]]);
  assert.deepEqual(res.segments.map((s) => s.start), [10, 300, 500, 700, 880]);
  assert.deepEqual(res.healedGaps, [{ fromSec: 10, toSec: 700 }]);
  assert.deepEqual(res.coverageGaps, []); // после добора дыр нет
});

test("остаточная дыра после добора → coverageGaps + warning ASR_COVERAGE_GAP, максимум 3 добора", async () => {
  let healCalls = 0;
  const res = await SI.runWindowedAsr({
    durationSec: 900,
    transcribe: async (a) => {
      if (a === null) return R({ segments: [seg(10, "א"), seg(700, "ב"), seg(880, "ג")] });
      healCalls++;
      return R({ segments: [], warnings: ["NO_SPEECH"] }); // добор ничего не нашёл
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.equal(healCalls, 1); // на одну дыру — один добор, не цикл
  assert.deepEqual(res.coverageGaps, [{ fromSec: 10, toSec: 700 }]);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

test("все окна пустые → NO_SPEECH в warnings, segments []", async () => {
  const res = await SI.runWindowedAsr({
    durationSec: 1200,
    transcribe: async () => R({ language: null, segments: [], warnings: ["NO_SPEECH"] }),
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(res.segments, []);
  assert.ok(res.warnings.includes("NO_SPEECH"));
});
```

- [ ] **Step 2:** `node --test tests/runWindowedAsr.test.js` → FAIL (`runWindowedAsr` не экспортирован).
- [ ] **Step 3: Реализация.**
  **(а)** `gemini-files.js` — `transcribeAudio` принимает `opts`:

```js
  async function transcribeAudio(apiKey, fileUri, mimeType, opts) {
    var prompt = (opts && opts.promptText) ||
                 ((typeof window !== "undefined" && window.AsrTranscript) ? window.AsrTranscript.ASR_PROMPT
               : require("./asr-transcript.js").ASR_PROMPT);
    // ... остальное тело БЕЗ изменений (isVideo/mediaResolution/timeout 180s) ...
```

  **(б)** `studio-import.js` — в pure-секцию (рядом с `chooseTrackHint`) добавить
  `runWindowedAsr` и экспортировать в ОБЕ ветки (node `module.exports` И `window.StudioImport`):

```js
  // W2-S12: оркестратор окон ASR. Pure-логика с инъекцией transcribe/parse — тестируется в Node
  // фейками (tests/runWindowedAsr.test.js); сетевые вызовы даёт Task 4. Дизайн §4.3.
  // ВАЖНО (R11): добор дыры — ×1 на дыру, максимум maxHeals доборов на прогон; остаток дыр
  // никогда не маскируется — уходит в coverageGaps + warning ASR_COVERAGE_GAP.
  async function runWindowedAsr(deps) {
    var A2 = (typeof window !== "undefined") ? window.AsrTranscript : require("./asr-transcript.js");
    var wins = A2.asrWindows(deps.durationSec);
    var single = wins.length === 1;
    var windowSegments = (deps.priorWindows || []).slice();
    var windowsMeta = windowSegments.map(function (_, i) {
      return { startSec: wins[i].startSec, endSec: wins[i].endSec, retries: 0 };
    });
    var warnings = [], language = null;
    var startAt = deps.startWindow || windowSegments.length;

    async function oneCall(startSec, endSec) { // parse c retry ×1 на ASR_BAD_JSON
      var raw = await deps.transcribe(startSec, endSec);
      try { return { parsed: deps.parse(raw), retries: 0 }; }
      catch (e1) {
        if (e1.code !== "ASR_BAD_JSON") throw e1;
        raw = await deps.transcribe(startSec, endSec);
        return { parsed: deps.parse(raw), retries: 1 };
      }
    }

    for (var k = startAt; k < wins.length; k++) {
      deps.onProgress(k + 1, wins.length);
      var r;
      try {
        r = single ? await oneCall(null, null) : await oneCall(wins[k].startSec, wins[k].endSec);
      } catch (e) {
        e.windowIndex = k;
        e.windowSegments = windowSegments;
        throw e;
      }
      windowsMeta.push({ startSec: wins[k].startSec, endSec: wins[k].endSec, retries: r.retries });
      windowSegments.push(r.parsed.segments);
      if (!language && r.parsed.language) language = r.parsed.language;
      (r.parsed.warnings || []).forEach(function (w) {
        if (w !== "NO_SPEECH" && warnings.indexOf(w) < 0) warnings.push(w);
      });
    }

    var merged = A2.mergeWindowSegments(windowSegments);
    var gaps = A2.findCoverageGaps(merged, deps.durationSec);
    var healedGaps = [], maxHeals = deps.maxHeals == null ? 3 : deps.maxHeals;
    for (var g = 0; g < gaps.length && healedGaps.length < maxHeals; g++) {
      var gap = gaps[g];
      var heal;
      try { heal = await oneCall(gap.fromSec, gap.toSec); }
      catch (_) { continue; } // добор best-effort: неудача = дыра остаётся честной
      if (heal.parsed.segments.length) {
        // вставляем сегменты добора В ПОЗИЦИЮ дыры и пересобираем merge
        var byWindows = [];
        windowSegments.forEach(function (ws) { byWindows.push(ws); });
        // плоская пересборка: merged-до-дыры + добор + merged-после (по времени)
        var flat = [];
        merged.forEach(function (s) { if (s.start === null || s.start <= gap.fromSec) flat.push(s); });
        heal.parsed.segments.forEach(function (s) { flat.push(s); });
        merged.forEach(function (s) { if (s.start !== null && s.start > gap.fromSec) flat.push(s); });
        merged = A2.mergeWindowSegments([flat]);
        healedGaps.push(gap);
      }
    }
    var remaining = A2.findCoverageGaps(merged, deps.durationSec);
    if (remaining.length && warnings.indexOf("ASR_COVERAGE_GAP") < 0) warnings.push("ASR_COVERAGE_GAP");
    if (!merged.length && warnings.indexOf("NO_SPEECH") < 0) warnings.push("NO_SPEECH");
    return { segments: merged, language: language, warnings: warnings, windows: windowsMeta,
             coverageGaps: remaining, healedGaps: healedGaps, windowSegments: windowSegments };
  }
```

  В node-ветку экспорта добавить `runWindowedAsr`, в `window.StudioImport` — тоже.

- [ ] **Step 4:** `node --test tests/runWindowedAsr.test.js tests/asrTranscript.test.js tests/importTrackHint.test.js` → PASS.
- [ ] **Step 5: Коммит**:
```bash
git add public/js/gemini-files.js public/js/studio-import.js tests/runWindowedAsr.test.js
git commit -m "feat(ingest): S12 T3 — оркестратор окон ASR (retry, добор дыр, резюм) + promptText-плумбинг"
```

---

### Task 4: проводка окон в UI импорта (`studio-import.js`) + потолок 3 ч + смета

**Files:**
- Modify: `public/js/studio-import.js` (`MAX_AUDIO_SEC`, `onAudioChosen`, `transcribeAudio`, `useText`)
- Modify: `public/i18n/locales/ru.js`, `en.js`, `he.js` (+ бамп `?v=` в `index.html`,
  `CACHE_VERSION` в `sw.js`, `node tests/i18n.smoke.js --write-lock`)

**Interfaces:**
- Consumes: Task 1 (`estimateLongJob`), Task 2 (`TableChunks.CHUNK_SIZE`), Task 3
  (`runWindowedAsr`, `transcribeAudio(.., opts.promptText)`).
- Produces (для Task 5): паспорт `audioMetaForImport.asr` расширен:
  `windows: [{startSec,endSec,retries}], coverageGaps: [{fromSec,toSec}], healedGaps: [...]`.

- [ ] **Step 1:** `MAX_AUDIO_SEC = 3 * 3600;` (комментарий: `решение S12 2026-07-28: 3 часа;
  байт-кап 300МБ остаётся предохранителем`).
- [ ] **Step 2:** `onAudioChosen`: заменить строку с `estimateAsrCostUsd` на:

```js
    var est = window.AsrTranscript.estimateLongJob(dur, {
      video: isVideo, chunkSize: window.TableChunks.CHUNK_SIZE });
    // ...
    $("v3ImportAudioGo").textContent = tr("studio.import.audioGo") +
      " (≈$" + Math.max(0.01, est.totalUsd).toFixed(2) + " · ~" + est.minutes + " " + tr("studio.import.minShort") + ")";
```

- [ ] **Step 3:** `transcribeAudio()`: заменить одиночный вызов (строки с
  `setStatus("studio.import.audioTranscribing")` по `parsed = ...` включительно, включая
  существующий retry) на оркестратор с резюмом:

```js
      setStatus("studio.import.audioTranscribing");
      var A2 = window.AsrTranscript;
      var resumeFrom = (pendingAudio.windowResults && pendingAudio.windowResults.length) || 0;
      var result;
      try {
        result = await window.StudioImport.runWindowedAsr({
          durationSec: pendingAudio.durationSec,
          startWindow: resumeFrom,
          priorWindows: pendingAudio.windowResults || [],
          transcribe: function (a, b) {
            return window.GeminiFiles.transcribeAudio(key, up.fileUri, pendingAudio.mime,
              a === null ? undefined : { promptText: A2.ASR_RANGE_PROMPT(a, b) });
          },
          parse: A2.parseAsrResponse,
          onProgress: function (k, m) {
            if (m > 1) setStatus("studio.import.audioWindowProgress", k + "/" + m);
          },
        });
      } catch (e2) {
        if (e2.windowSegments) pendingAudio.windowResults = e2.windowSegments; // резюм со след. клика
        throw e2;
      }
      pendingAudio.windowResults = null; // успех — резюм-состояние отработано
      var parsed = { language: result.language, segments: result.segments, warnings: result.warnings };
      pendingAudio.asrWindows = result.windows;
      pendingAudio.coverageGaps = result.coverageGaps;
      pendingAudio.healedGaps = result.healedGaps;
```

  ВАЖНО: `up` (upload) выполняется до этого блока как сейчас; при повторном клике «Распознать»
  после сбоя окна upload происходит заново (файл уже в Files API 48 ч, но `up` в замыкании
  потерян) — это приемлемо: resumable upload 108МБ = 12 с (замер). `waitActive` вызов дополнить:
  `await window.GeminiFiles.waitActive(key, up.name, { timeoutMs: 60000 + Math.ceil(pendingAudio.file.size / 1048576) * 1000 })`.
- [ ] **Step 4:** превью-бейдж дыр: в `showPreview`-вызове `transcribeAudio()` в `warnings`
  добавить `ASR_COVERAGE_GAP` уже приходит из result.warnings (ничего не делать — только
  проверить, что `warnCheck` показывается). В `useText()` паспорт:

```js
        asr: { method: "gemini-asr", model: window.AsrTranscript.ASR_MODEL, at: new Date().toISOString(),
               language: pendingAudio.parsed.language, filesApi: true, warnings: pendingAudio.parsed.warnings,
               windows: pendingAudio.asrWindows || null,
               coverageGaps: pendingAudio.coverageGaps || [],
               healedGaps: pendingAudio.healedGaps || [] },
```

- [ ] **Step 5: Локали** (все ×3, ru показан; en/he — перевести по смыслу):

```js
      audioWindowProgress: "Распознавание: окно {x}",   // подставляется "k/m" вторым аргументом setStatus
      minShort: "мин",
      errAudioTooLong: "Аудио длиннее 3 часов — текущий лимит",
```

  (setStatus(key, extra) конкатенирует extra — использовать как сейчас `setStatus(key, "2/8")`.)
  Бамп: `?v=69 → 70` у всех трёх locale-тегов `index.html`; `CACHE_VERSION v3.11.253 → v3.11.254`;
  `node tests/i18n.smoke.js --write-lock`.
- [ ] **Step 6: Гейты**: `npm run smoke:i18n` → PASS; `node --test tests/` → PASS;
  скриншот диалога импорта 380×844 (Playwright: open `/?v=t4`, `StudioImport.open()`,
  вкладка «Файл») — глазами проверить кнопку со сметой.
- [ ] **Step 7: Коммит**:
```bash
git add public/js/studio-import.js public/js/gemini-files.js public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js public/index.html public/sw.js tests/i18n.locale-version.lock.json
git commit -m "feat(ingest): S12 T4 — окна ASR в UI импорта, потолок 3ч, полная смета на кнопке, паспорт окон/дыр"
```

---

### Task 5: чанк-цикл таблицы + прогрессив в `index.html`

**Files:**
- Modify: `public/index.html` — блок TRANSLATE TABLE (~строки 33010–33240:
  `v3AudioSegmentsForRequest`, `translateTable`); НЕ трогать `renderTable`.
- Modify: локали ×3 (+ бампы + lock, как в Task 4; `?v=70→71`, `v3.11.254→255`).

**Interfaces:**
- Consumes: Task 2 (`TableChunks.*`), существующие `apiCall`, `renderTable`, `v3AttachAudioTiming`,
  `v3SessionMarkDraft`, `setResultsMeta`, `showError`.
- Produces: `v3TranslateTableChunked(segs)` (внутренняя); `v3LastGeminiMeta.chunks`
  `= [{cacheKey, fromCache, rows}]`; поведение «Продолжить» = повторный клик AI Перевод.

- [ ] **Step 1:** `v3AudioSegmentsForRequest()`: удалить проверку
  `lines.length > V3_SEG_MAX_SEGMENTS ||` (кап длины сегмента `V3_SEG_MAX_TEXT` ОСТАВИТЬ);
  константу `V3_SEG_MAX_SEGMENTS` удалить; комментарий обновить: превышение размера куска
  режет чанк-цикл (`TableChunks.CHUNK_SIZE`), сервер видит ≤120 сегментов на запрос.
- [ ] **Step 2:** в `translateTable()` в seg-ветке payload (строка ~33134) — ПЕРЕД
  `const payload =` добавить развилку чанк-пути:

```js
        const segsForChunks = !usePremium ? v3AudioSegmentsForRequest() : null;
        if (segsForChunks && segsForChunks.length > TableChunks.CHUNK_SIZE) {
            await v3TranslateTableChunked(segsForChunks);
            return;
        }
```

  (существующий одиночный путь для ≤120 сегментов остаётся байт-в-байт.)
- [ ] **Step 3:** новая функция `v3TranslateTableChunked` рядом с `translateTable` (код целиком):

```js
    // W2-S12: чанк-цикл длинной таблицы. Дизайн: docs/planning/STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md §4.4.
    // Сервер не менялся: каждый кусок — обычный seg-запрос ≤CHUNK_SIZE; серверный sha256-кэш куска
    // делает повторный прогон бесплатным (готовые куски возвращаются fromCache мгновенно) —
    // поэтому «Продолжить» после сбоя = просто нажать «AI Перевод» ещё раз.
    async function v3TranslateTableChunked(segs) {
        const chunks = TableChunks.buildChunks(segs);
        const accum = [];
        const chunkMeta = [];
        const missingPerChunk = [];
        let anyMappingLost = false;
        setLoading(true);
        setAiButtonDisabled(true);
        try {
            for (let k = 0; k < chunks.length; k++) {
                setResultsMeta("table", t("classic.tableChunkProgress")
                    .replace("{k}", String(k + 1)).replace("{m}", String(chunks.length)));
                let res;
                try {
                    res = await apiCall("/api/translate-table", {
                        geminiApiKey: geminiKeyGet(), direction: "he-ru", segments: chunks[k].segs,
                    });
                } catch (e) {
                    // Готовое остаётся на экране; повторный клик докачает по кэшу (см. шапку).
                    if (e.httpStatus === 429) handleGeminiLimitError(e);
                    showError(t("classic.tableChunkFailed")
                        .replace("{k}", String(k + 1)).replace("{m}", String(chunks.length)));
                    return;
                }
                const rows = TableChunks.offsetRows(res.rows || [], chunks[k].base);
                accum.push(...rows);
                const resW = res.warnings || [];
                if (resW.includes("SEG_MAPPING_LOST")) anyMappingLost = true; // строки куска уже без индексов (сервер)
                missingPerChunk.push({ base: chunks[k].base,
                    missing: TableChunks.coverageForChunk(res.rows || [], chunks[k].segs.length).missing });
                chunkMeta.push({ cacheKey: res.cacheKey || null, fromCache: res.fromCache === true,
                                 rows: (res.rows || []).length });
                // Прогрессив: renderTable НЕ редактировался — просто перерисовка префиксом.
                clearRowSelectedUI();
                currentTableData = accum.slice();
                renderTable(currentTableData);
            }
        } finally {
            setLoading(false);
            updateAiButtonState();
        }
        // ── все куски готовы: полный success-блок (зеркалит одиночный путь) ──
        const missingGlobal = TableChunks.aggregateMissing(missingPerChunk);
        v3LastGeminiMeta = {
            promptId: "he-ru-table-seg-v1+chunked", model: "gemini-flash-latest",
            cacheKey: null, fromCache: chunkMeta.every((c) => c.fromCache),
            provider: "gemini", chunks: chunkMeta, generatedAt: new Date().toISOString(),
        };
        v3AttachImportSource();
        v3AttachAudioTiming({ rows: currentTableData,
            warnings: missingGlobal.length ? ["SEG_COVERAGE_PARTIAL"] : [] });
        if (missingGlobal.length && typeof showToast === "function") {
            showToast(t("studio.import.warnCoverage"), "warning");
        }
        clearTableStale();
        tableIsStale = false;
        lastDocxFilename = generateDocxFileName();
        try {
            localStorage.setItem(TABLE_CACHE_KEY, JSON.stringify({
                text: getText().trim(), rows: currentTableData,
                createdAt: new Date().toISOString(), lastDocxFilename: lastDocxFilename,
            }));
        } catch (e) { console.error("Table cache save error", e); }
        setResultsMeta("table", t("classic.tableChunkedDone").replace("{m}", String(chunks.length)));
        loadStats();
        clearGeminiLock();
        try { classicSyncMainPanels({ force: true }); } catch (_) {}
    }
```

  ПРИМЕЧАНИЯ имплементеру: (1) `v3SessionMarkDraft()`/скелет/isGeminiLocked уже выполнены
  `translateTable()` ДО развилки — не дублировать; (2) `anyMappingLost` НЕ используется для
  глобального дропа — деградация куска локальна по строкам (R11, дизайн §5.4), переменная
  нужна только чтобы НЕ считать пропуски куска покрытием (строки без индексов дают
  missing всего куска — это уже честно отражено в missingPerChunk); (3) сохранение/экспорт
  разблокируются существующим механизмом только после полного success-блока.
- [ ] **Step 4: Локали ×3** (ru показан):

```js
      tableChunkProgress: "Кусок {k} из {m} — таблица дополняется по мере готовности",
      tableChunkFailed: "Кусок {k} из {m} не получился. Готовые куски сохранены — нажмите «AI Перевод» ещё раз: готовое вернётся из кэша мгновенно, докачается только упавшее.",
      tableChunkedDone: "Готово: собрано из {m} кусков",
```

  + бампы `?v=71`, `CACHE_VERSION v3.11.255`, `--write-lock`.
- [ ] **Step 5: Гейты**: `npm run smoke:reader-parity` (renderTable не тронут) → PASS;
  `npm run smoke:i18n` → PASS; `node --test tests/` → PASS.
- [ ] **Step 6:** скриншот 380×844: Playwright, синтетическая таблица 300 строк через
  `page.evaluate(() => { currentTableData = [...]; renderTable(currentTableData); })` — глазами.
- [ ] **Step 7: Коммит**:
```bash
git add public/index.html public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js public/sw.js tests/i18n.locale-version.lock.json
git commit -m "feat(ingest): S12 T5 — чанк-цикл таблицы с прогрессивной отрисовкой, провенанс кусков, кэш-резюм"
```

---

### Task 6: смета-подтверждение, guard плоского текста, кап субтитров 2800

**Files:**
- Modify: `public/index.html` (`v3TranslateTableChunked` — подтверждение; `translateTable` — guard)
- Modify: `public/js/captions-parse.js` (`MAX_SEGMENTS`)
- Modify: локали ×3 (+ бампы `?v=72`, `v3.11.256`, lock)
- Test: `tests/captionsParse.test.js` (проверить самосинхронизацию), `tests/tableChunks.test.js` (guard уже покрыт)

**Interfaces:**
- Consumes: Task 1 (`estimateLongJob`), Task 2 (`estimatePlainRows`, `CHUNK_SIZE`), Task 5 (`v3TranslateTableChunked`).

- [ ] **Step 1: Смета-подтверждение** — в начале `v3TranslateTableChunked(segs)` (до цикла):

```js
        const est = window.AsrTranscript.estimateLongJob(0, {
            chunkSize: TableChunks.CHUNK_SIZE, segmentsKnown: segs.length });
        // durationSec=0: ASR уже оплачен на импорте; здесь только стоимость таблицы.
        const msg = t("classic.tableCostConfirm")
            .replace("{rows}", String(est.expRows)).replace("{usd}", est.tableUsd.toFixed(2))
            .replace("{min}", String(Math.ceil(est.chunks * 140 / 60)));
        if (!window.confirm(msg)) return;
```

  (`window.confirm` — осознанный v1: нативный, честный, локализуемый; премиум-модал — follow-up.)
  Проверить: `estimateLongJob(0, ...)` с `segmentsKnown` даёт `windows:1, asrUsd:0` — да
  (d=0 → asrUsd 0; окна не используются).
- [ ] **Step 2: Guard плоского пути** — в `translateTable()` ПОСЛЕ развилки чанк-пути
  (плоский he-ru/any-he длинный текст сегодня молча падает 500 с потерей — R11-починка):

```js
        if (!usePremium && !segsForChunks
            && TableChunks.estimatePlainRows(getText()) > 250) {
            showError(t("classic.textTooLongForSingleTable"));
            return;
        }
```

  Разместить ДО `setLoading(true)` (как isGeminiLocked-ранние выходы). ВАЖНО: `segsForChunks`
  вычислен выше в Step 2 Task 5; для any-he он null → guard работает и там.
- [ ] **Step 3: Кап субтитров** — `public/js/captions-parse.js`: `MAX_SEGMENTS = 400 → 2800`
  (комментарий: `3 ч × ~14 репл/мин + запас; таблица режется чанками ≤120 — серверный кап 400
  на запрос не задевается (S12)`). Прогнать `node --test tests/captionsParse.test.js` —
  тесты самосинхронизируются через `CP.MAX_SEGMENTS`; проверить, что :339
  («20-min talk must fit») остался осмысленным (остался — 267 < 2800).
- [ ] **Step 4: Локали ×3** (ru):

```js
      tableCostConfirm: "Длинная таблица: ≈{rows} строк, ≈${usd}, ~{min} мин. Строки будут появляться по мере готовности. Продолжить?",
      textTooLongForSingleTable: "Текст слишком длинный для одной таблицы (>250 строк). Импортируйте его через «Импорт» (аудио/субтитры дают сегменты и караоке) или разбейте на части.",
```

  + `?v=72`, `CACHE_VERSION v3.11.256`, `--write-lock`.
- [ ] **Step 5: Гейты**: `node --test tests/` → PASS; `npm run smoke:i18n` → PASS;
  `npm run smoke:reader-parity` → PASS. Скриншот 380×844 confirm-диалога не нужен (нативный),
  но снять ошибку guard (плоский текст 400 строк → showError) — глазами.
- [ ] **Step 6: Коммит**:
```bash
git add public/index.html public/js/captions-parse.js public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js public/sw.js tests/i18n.locale-version.lock.json
git commit -m "feat(ingest): S12 T6 — смета-подтверждение мультичанка (R16), guard плоского текста, кап субтитров 2800"
```

---

### Task 7: детерминированный смоук `smoke:studio-chunks`

**Files:**
- Create: `scripts/premium/studio-chunks-smoke.js`
- Modify: `package.json` — `"smoke:studio-chunks": "node scripts/premium/studio-chunks-smoke.js"`

**Interfaces:**
- Consumes: Tasks 2/5/6 (браузерное поведение чанк-цикла).
- Produces: гейт для Task 9.

- [ ] **Step 1: Скрипт** — Playwright Chromium headless против локального сервера
  (поднимать `node server.js` изнутри скрипта, паттерн — `scripts/premium/reader-parity-smoke.js`;
  если тот использует уже-поднятый сервер, повторить его подход). Каркас:

```js
// scripts/premium/studio-chunks-smoke.js
// W2-S12 · Детерминированный смоук чанк-цикла: фейк-fetch вместо Gemini (урок S5a — фейк, не «нажми
// и посмотри»). Сценарии: (1) 300 сегм → 3 куска, прогрессив, глобальные segment_index, полный
// success; (2) сбой куска 2 → баннер, частичная таблица, save-draft; повторный запуск —
// куски 1 отдаётся fromCache (счётчик реальных вызовов), докачка; (3) SEG_MAPPING_LOST куска 2 —
// деградация локальна (куски 1/3 с индексами).
"use strict";
const { chromium } = require("playwright");
// ... поднять сервер / дождаться :3000 ...
// В page.addInitScript: подменить window.fetch ТОЛЬКО для /api/translate-table:
//   const REAL = window.fetch;
//   window.__chunkCalls = [];
//   window.__failPlan = null; // {failAtChunk: 2} и т.п. — задаётся тестом
//   window.fetch = async (url, init) => {
//     if (String(url).includes("/api/translate-table")) {
//       const body = JSON.parse(init.body);
//       window.__chunkCalls.push(body.segments.length);
//       ... по __failPlan вернуть Response 500 / rows с segment_index / rows без индексов /
//           fromCache-ответ (кэш эмулируется по JSON.stringify(body.segments) в Map) ...
//     }
//     return REAL(url, init);
//   };
// Подготовка страницы: localStorage геминиевый ключ-заглушка "AIzaFAKE..." (формат проходит
//   isPlausible на клиенте; до сервера запрос не доходит — fetch подменён);
//   #inputText = 300 строк "שורה N"; window.v3LastImportMeta = { kind:"captions", textSnapshot:<текст>,
//     captions: { v:1, captions:{...}, segments: [{i,start:i*5,text:"שורה "+i}], timing:null } };
//   ВАЖНО: структуру v3LastImportMeta снять с useText() в studio-import.js (captions-ветка) —
//   поле .captions.segments читает v3MediaPassport → v3AudioSegmentsForRequest.
// Сценарий 1: page.evaluate(() => translateTable()); дождаться завершения;
//   asserts: __chunkCalls == [120,120,60]; во время цикла (poll) размер #proTable tbody рос;
//   currentTableData.length >= 300; строка с data-row-idx=150 существует;
//   currentTableData[150].segment_index === 150±(дробление нет в фейке → ровно);
//   v3LastGeminiMeta.chunks.length === 3.
// Сценарий 2: reload, __failPlan={failAtChunk:2}; translateTable();
//   asserts: таблица 120 строк, #errorMsg содержит текст tableChunkFailed;
//   __failPlan=null; повторно translateTable(); asserts: __chunkCalls шёл с fromCache для
//   куска 1 (эмулированный Map-кэш), финально 300 строк.
// Сценарий 3: reload, план "куску 2 отдать rows без segment_index";
//   asserts: в currentTableData строки 0..119 и 240..299 с индексами, 120..239 — без.
```

  Все asserts — явные `if (!cond) { console.error(...); process.exit(1); }`; финал `console.log("SMOKE OK")`.
- [ ] **Step 2:** Прогнать: `npm run smoke:studio-chunks` → SMOKE OK (реального ключа/сети НЕТ).
- [ ] **Step 3:** Прогнать дважды подряд (детерминизм) и с чистым профилем.
- [ ] **Step 4: Коммит**:
```bash
git add scripts/premium/studio-chunks-smoke.js package.json
git commit -m "test(ingest): S12 T7 — детерминированный смоук чанк-цикла (прогрессив, сбой+резюм, локальная деградация)"
```

---

### Task 8: живой смоук на реальном длинном подкасте

**Files:**
- Create: `scripts/premium/ingest-longmedia-live-smoke.js`

**Interfaces:**
- Consumes: Tasks 1–3 (те же модули, что браузер: `asr-transcript`, `studio-import`
  `runWindowedAsr`, `gemini-files` — из Node), локальный `server.js` для чанков таблицы.
- Produces: релиз-гейт (ручной запуск, реальный ключ `INGEST_SMOKE_GEMINI_KEY`, ≈$0.4).

- [ ] **Step 1: Скрипт** — эволюция `docs/research/studio-ingest-longmedia/2026-07-28/m3-long-asr.js`:

```js
// scripts/premium/ingest-longmedia-live-smoke.js
// W2-S12 live smoke (РЕАЛЬНЫЙ ключ; урок feedback_llm_path_test_before_ship + «живой смоук ловит
// то, что не видит ревью»). Ручной запуск:
//   INGEST_SMOKE_GEMINI_KEY=... node scripts/premium/ingest-longmedia-live-smoke.js --audio <файл ~60-75 мин>
// Полный путь БРАУЗЕРНЫМИ модулями (Node-ветки dual-export):
//   upload (gemini-files) → runWindowedAsr (studio-import: окна+retry+добор) → validateSegments
//   → TableChunks.buildChunks → POST http://localhost:3000/api/translate-table на кусок
//   → offsetRows/coverageForChunk → asserts:
//   1) окон >= 4 (для 60+ мин), у каждого retries <= 1;
//   2) findCoverageGaps(итог) — остаточных дыр 0 ЛИБО warnings содержит ASR_COVERAGE_GAP (честно);
//   3) сегментов >= durationMin*3 (нижняя граница плотности);
//   4) каждый кусок: JSON ok, validateSegMapping-эквивалент (индексы в границах куска до оффсета);
//   5) buildRowTiming(сегменты, rows.segment_index) даёт >= 2 entries (караоке живо);
//   6) стоимость: напечатать фактические usageMetadata-суммы против estimateLongJob (R16-калибровка).
// Сервер поднять заранее: node server.js (скрипт проверяет /healthz и падает с подсказкой).
```

  Реализация — перенос кода из research-скрипта (upload/httpsJson без таймаута; НЕ забыть
  Buffer.concat для UTF-8) + вызовы модулей вместо копий логики.
- [ ] **Step 2: Прогон** на реальном эпизоде (свободный вариант — материал research:
  `https://api.spreaker.com/download/episode/70984998/ep258_thermonuclear_world_war_draft_1.mp3`,
  ~75 мин; скрипт скачивает во временную папку при `--download-sample`). Зафиксировать вывод
  (окна/дыры/доборы/куски/фактическая стоимость) в комментарий коммита.
- [ ] **Step 3: Коммит**:
```bash
git add scripts/premium/ingest-longmedia-live-smoke.js
git commit -m "test(ingest): S12 T8 — живой смоук длинного пути (окна+добор+чанки, реальный ключ): <строка фактов из прогона>"
```

---

### Task 9: релиз — whole-branch ревью, гейты, единственный пуш, прод-верификация

**Files:**
- Modify: `public/sw.js` (`CACHE_VERSION` → финальный релизный номер),
  `public/index.html` (если менялся шелл после последнего бампа — `?v=` синхронно),
  `tests/i18n.locale-version.lock.json` (`--write-lock` при финальном бампе)

- [ ] **Step 1: Полный прогон гейтов** (все обязаны быть зелёными):
```bash
node --test tests/
npm run smoke:i18n
npm run smoke:reader-parity
npm run smoke:ingest
npm run smoke:studio-chunks
npm run test:api-smoke
```
- [ ] **Step 2: Whole-branch ревью ДО пуша** — диапазон от последнего запушенного коммита до
  HEAD; ревьюер ищет: расхождения план↔код, дубли констант (120/900/90 должны жить в одном
  месте каждая), рассинхрон промта range с замером, утечки ключа в логи, i18n-пропуски,
  необновлённые комментарии. Найденное — фикс-коммиты до пуша.
- [ ] **Step 3: Финальный бамп** (если ревью-фиксы трогали index.html/локали — `?v=`+1,
  `CACHE_VERSION`+1, `--write-lock`, повторить smoke:i18n).
- [ ] **Step 4: ЕДИНСТВЕННЫЙ ПУШ** `git push origin main` → Coolify автодеплой.
  Ловушки деплоя: может зависнуть на старом коммите (отменить в UI и перезапустить);
  rolling-update даёт транзиентные 404 — подождать и перепроверить.
- [ ] **Step 5: Прод-верификация** `https://linguistpro.kolosei.com`:
  - `/healthz` 200; `/api/client-config` (версия);
  - главная: диалог «Импорт» открывается, вкладки живы, локали без сырых ключей (ru/en/he);
  - hard-reload + проверка `CACHE_VERSION` в приложении (SW обновился);
  - `/api/translate-table` seg-режим — лёгкий запрос с 2 сегментами (BYOK-ключ смоука) → rows.
- [ ] **Step 6: Коммит статуса** (канон-док, см. Task 10 — можно объединить).

---

### Task 10: owner-приёмка + канон

**Files:**
- Modify: `docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` (§4 п.8 → ✅
  с фактами; §7 п.3 → SHIPPED-запись с номером версии и коммит-диапазоном)
- Modify: `docs/planning/STUDIO_INGEST_W2_S12_LONGMEDIA_DESIGN_2026_07_28.md` (шапка: статус → SHIPPED)

- [ ] **Step 1:** Обновить канон (образец — запись W2-S4 в §7 п.2 того же файла): версия,
  диапазон коммитов, число задач, замеры-ссылка, известные ограничения
  (плоский текст = guard; параллель — follow-up).
- [ ] **Step 2: Owner-приёмка** (сформулировать владельцу в конце сессии):
  - реальный подкаст ≥60 мин со своего устройства: импорт → смета → окна → превью → перевод
    кусками (прогрессив виден) → караоке по строке из СЕРЕДИНЫ записи (честность тайминга);
  - длинные YouTube-субтитры (>30 мин, >400 реплик): вставка → перевод → прогрессив;
  - iPhone: короткий файл — прежнее поведение не сломано (регресс-чек).
- [ ] **Step 3:** Коммит канона + пуш (docs-only, разрешён вне Task 9 как обычная практика
  проекта для planning-доков).

---

## Self-review (выполнен при написании)

- **Spec coverage:** дизайн §4.1→T1, §4.2→T3, §4.3→T3+T4, §4.4→T5+T6, §4.5→T6, §4.6→T4/T5/T6,
  §5→T1/T3/T5 (правила в коде и тестах), §6→T3/T5, §7→T1/T2/T3/T7/T8, §8 (анти-скоуп) — не
  реализуется, §10→T9/T10. Потолок 3ч→T4. Сохранение только полной→T5 (success-блок в конце). ✓
- **Placeholders:** каркасы T7/T8 — это комментарий-спека скрипта с полным перечнем сценариев и
  asserts (не «TBD»); вся доменная логика дана кодом в T1–T6. ✓
- **Type consistency:** `runWindowedAsr` возвращает `windowSegments` — T4 кладёт его в
  `pendingAudio.windowResults` и передаёт как `priorWindows` (типы совпадают:
  `Array<Array<{start,text}>>`); `estimateLongJob` — `chunkSize` обязателен, оба вызова (T4, T6)
  передают `TableChunks.CHUNK_SIZE`; `offsetRows` не мутирует вход (тест). ✓
