# W2-S5a: субтитры → таблица + сегмент-караоке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь приносит субтитры видео (файлом `.vtt`/`.srt` или вставкой штатной
расшифровки YouTube) и получает билингвальную таблицу с сегмент-караоке по бесплатному точному
таймингу субтитров — с воспроизведением самого ролика в Студии там, где браузер это позволяет.

**Architecture:** Три источника реплик сходятся в новое pure-ядро `captions-parse.js`, которое
отдаёт `[{i,start,text}]` — формат, который уже принимает конвейер S4 (`validateSegments` →
seg-режим `/api/translate-table` → `buildRowTiming` → `StudioMediaKaraoke`). Воспроизведение —
три уровня по способностям браузера: локальный медиа-блоб (есть), YouTube через
`<iframe credentialless>` (новый адаптер), таймкоды со ссылкой на YouTube. **Сервер не меняется
ни строкой.**

**Tech Stack:** Vanilla JS (IIFE + dual-export `window.X` / `module.exports`, как
`asr-transcript.js`), `node --test`, Playwright для живых и UI-проверок, YouTube IFrame API.

**Канон:** `docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md` —
дизайн утверждён владельцем 2026-07-27; §5 содержит точные схемы. База: прод v3.11.248,
SW `CACHE_VERSION = "v3.11.249"`.

## Global Constraints

- **Сервер не трогать.** `server.js`, `ingest/*` не меняются ни в одной задаче. Ноль новых
  эндпоинтов, ноль новых внешних фетчей (R14/R12). Если задача требует серверной правки —
  СТОП и доклад владельцу.
- **COEP/COOP `index.html` не трогать.** `crossOriginIsolated` обязан оставаться `true`.
- **R11: только сегмент-уровень.** Пословные тайминги из авто-субтитров **отбрасываются**, хотя
  физически лежат в файле. Нет тайминга → нет караоке, никакой интерполяции.
- **R9: тип дорожки — свидетельство, не факт.** Заявление пользователя свидетельством не является.
- Коммит после каждой задачи; trailers `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` и
  `Claude-Session: https://claude.ai/code/session_01FTRJHvKHrnFRPoCbgGgaD5`.
  **Пуш в `main` = Coolify авто-деплой, поэтому пуш только в задаче 11**; до неё — локальные коммиты.
- Все новые UI-строки → **все три локали** `public/i18n/locales/{ru,en,he}.js`. `tt`-fallback
  недостижим при загруженном `t()`. Bump `CACHE_VERSION` в `public/sw.js` — в задаче 11.
- Новые контейнеры с кнопками: мобильная ловушка `button { width: 100% }` (`index.html` ~2117) →
  явное исключение `#<id> button { width: auto; }`.
- Перед каждым UI-коммитом — Playwright-скриншот @380×844, посмотреть глазами до `git add`.
- Капы клиента обязаны совпадать с серверными **по построению**: `MAX_SEGMENTS = 400`,
  `MAX_SEG_TEXT = 2000` (`ingest/segTable.js:8-9`, зеркало `index.html:32831-32832`).
- `renderTable`, `HE_RU_PROMPT`/`ANY_HE_PROMPT`, he-ru путь и Зал — не трогать
  (`smoke:reader-parity` обязан оставаться зелёным).

## File Structure (итог W2-S5a)

```
public/js/
  captions-parse.js          NEW  pure-ядро: VTT/SRT/вставка → [{i,start,text}] (dual-export)
  studio-yt-player.js        NEW  capability + parseVideoId + адаптер YT IFrame (dual-export pure-части)
  studio-media-karaoke.js    MOD  ensureRun принимает медиа-адаптер ИЛИ блоб (единственная правка)
  studio-import.js           MOD  приём субтитров (файл + вставка), классификация URL, ERROR_KEY
public/
  index.html                 MOD  passport-аксессор, seg-гейт, timing-attach, UI модала, медиа-бар, провенанс, CSS
  sw.js                      MOD  precache новых модулей + CACHE_VERSION (задача 11)
  i18n/locales/{ru,en,he}.js MOD  новые строки studio.import.captions* / studio.media.* / textMeta.*
tests/
  captionsParse.test.js      NEW  unit: VTT, SRT, катящиеся, вставка, сущности, капы, ошибки
  studioYtPlayer.test.js     NEW  unit: parseVideoId
  mediaKaraoke.test.js       MOD  + адаптерная ветка ensureRun
scripts/premium/
  captions-parse-smoke.js    NEW  independent-oracle гейт (VTT ↔ json3) + фикстуры вставки
  yt-player-live-smoke.mjs   NEW  живой Playwright-смоук плеера в Chrome и Edge
  fixtures/captions/         DONE закоммичено 8089beaf (README + 2 пары VTT/json3 + 2 вставки)
package.json                 MOD  smoke:captions-parse
docs/planning/               MOD  дизайн-док статус + decision-packet §7 (задача 12)
```

**Порядок:** pure-ядро парсера (1-3) → оракульный гейт (4) → плеер-адаптер (5) → караоке (6) →
glue (7) → UI (8) → провенанс (9) → живой смоук (10) → релиз (11) → owner-приёмка (12).

Транспорт-спайк, который в плане S4 был задачей №1, здесь **уже выполнен до дизайна** (дизайн §4):
серверная добыча — NO-GO, `credentialless` — GO на Chrome 150/Edge 150/Chromium 148, алгоритм
разбора валидирован на 100%. Поэтому план начинается сразу с ядра.

---

### Task 1: `captions-parse.js` — разбор VTT/SRT (не катящиеся)

**Files:**
- Create: `public/js/captions-parse.js`
- Test: `tests/captionsParse.test.js`

**Interfaces:**
- Produces: `CaptionsParse.parse(rawText, opts) → {ok, format, rolling, language, kindHint,
  segments:[{i,start,text}], droppedHeadings, warnings, error_code?}`;
  `CaptionsParse.detectFormat(rawText) → 'vtt'|'srt'|'youtube-panel'|null`;
  константы `MAX_SEGMENTS = 400`, `MAX_SEG_TEXT = 2000`.
  Dual-export: `window.CaptionsParse` + `module.exports`.
- Consumes: ничего.

- [ ] **Step 1: Write the failing test**

Создать `tests/captionsParse.test.js`:

```js
// tests/captionsParse.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const CP = require("../public/js/captions-parse.js");

test("detectFormat: vtt / srt / panel / null", () => {
  assert.equal(CP.detectFormat("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi"), "vtt");
  assert.equal(CP.detectFormat("1\n00:00:01,000 --> 00:00:02,000\nhi"), "srt");
  assert.equal(CP.detectFormat("0:27\nGood morning."), "youtube-panel");
  assert.equal(CP.detectFormat("просто текст без таймкодов"), null);
});

test("vtt: header language, multi-line cue joined, settings ignored", () => {
  const r = CP.parse([
    "WEBVTT", "Kind: captions", "Language: iw", "",
    "00:00:00.000 --> 00:00:07.000 align:start position:0%",
    "первая", "вторая", "",
    "00:00:09.200 --> 00:00:11.206",
    "третья", "",
  ].join("\n"));
  assert.equal(r.ok, true);
  assert.equal(r.format, "vtt");
  assert.equal(r.rolling, false);
  assert.equal(r.language, "iw");
  assert.deepEqual(r.segments, [
    { i: 0, start: 0, text: "первая вторая" },
    { i: 1, start: 9.2, text: "третья" },
  ]);
});

test("vtt: whitespace-only body line is CUE TEXT, not a block separator", () => {
  // Реальная ловушка YouTube: "\n \n" внутри кью. Разделитель — только пустая строка.
  const r = CP.parse([
    "WEBVTT", "",
    "00:00:01.964 --> 00:00:07.630 align:start position:100%",
    " ",
    "[מוזיקה]", "",
  ].join("\n"));
  assert.equal(r.segments.length, 1);
  assert.equal(r.segments[0].text, "[מוזיקה]");
  assert.equal(r.segments[0].start, 1.964);
});

test("vtt: HTML entities decoded, stray tags stripped", () => {
  const r = CP.parse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n&gt;&gt; <b>да</b> &amp; нет\n");
  assert.equal(r.segments[0].text, ">> да & нет");
});

test("srt: comma milliseconds, numeric index line, CRLF, BOM", () => {
  const r = CP.parse("﻿1\r\n00:00:01,500 --> 00:00:02,000\r\nпервая\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nвторая\r\n");
  assert.equal(r.format, "srt");
  assert.deepEqual(r.segments.map((s) => s.start), [1.5, 3]);
  assert.deepEqual(r.segments.map((s) => s.text), ["первая", "вторая"]);
});

test("hours form and non-decreasing starts", () => {
  const r = CP.parse("WEBVTT\n\n01:02:03.000 --> 01:02:04.000\nx\n");
  assert.equal(r.segments[0].start, 3723);
});

// Семантика кодов (единая на весь модуль, не пересматривать в задачах 2-3):
//   CAPTIONS_EMPTY        — вход пуст ИЛИ формат распознан, но реплик ноль
//   CAPTIONS_NO_TIMESTAMPS — таймкодов нет вовсе (пользователь вставил просто текст)
//   CAPTIONS_UNPARSEABLE  — на субтитры похоже (есть "-->"), но разобрать не вышло
//   CAPTIONS_TOO_MANY     — реплик > MAX_SEGMENTS ИЛИ реплика длиннее MAX_SEG_TEXT
test("errors: empty, no timestamps, unparseable, too many", () => {
  assert.equal(CP.parse("").error_code, "CAPTIONS_EMPTY");
  assert.equal(CP.parse("   \n  \n").error_code, "CAPTIONS_EMPTY");
  assert.equal(CP.parse("просто текст").error_code, "CAPTIONS_NO_TIMESTAMPS");
  assert.equal(CP.parse("00:00:0 --> хх\nтекст").error_code, "CAPTIONS_UNPARSEABLE");
  assert.equal(CP.parse("WEBVTT\n\n\n").error_code, "CAPTIONS_EMPTY");
  const many = ["WEBVTT", ""].concat(
    Array.from({ length: CP.MAX_SEGMENTS + 1 }, (_, k) =>
      `00:00:${String(k % 60).padStart(2, "0")}.000 --> 00:00:59.000\nx${k}\n`)).join("\n");
  assert.equal(CP.parse(many).error_code, "CAPTIONS_TOO_MANY");
});

test("segment text over MAX_SEG_TEXT is rejected honestly", () => {
  const long = "a".repeat(CP.MAX_SEG_TEXT + 1);
  const r = CP.parse(`WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n${long}\n`);
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "CAPTIONS_TOO_MANY");
});

test("i is dense and zero-based (contract of ingest/segTable.js)", () => {
  const r = CP.parse("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\na\n\n00:00:03.000 --> 00:00:04.000\nb\n");
  assert.deepEqual(r.segments.map((s) => s.i), [0, 1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/captionsParse.test.js`
Expected: FAIL — `Cannot find module '../public/js/captions-parse.js'`

- [ ] **Step 3: Write the implementation**

Создать `public/js/captions-parse.js`:

```js
// public/js/captions-parse.js
// W2-S5a · Разбор субтитров: WebVTT / SRT / вставка панели «Расшифровка видео» YouTube →
// [{i,start,text}] — формат, который уже принимает конвейер S4 (asr-transcript.js).
// Pure-ядро, dual-export по образцу asr-transcript.js.
// Канон: docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md §5.1.
// R11: пословные тайминги авто-субтитров ОТБРАСЫВАЮТСЯ — только сегмент-уровень.
(function () {
  "use strict";

  // Зеркало ingest/segTable.js:8-9 — расхождение ловится тестом в этом же файле.
  var MAX_SEGMENTS = 400;
  var MAX_SEG_TEXT = 2000;

  var CUE_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})(?:\s+(.*))?$/;
  var PANEL_TS_RE = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;
  var WORD_TAG_RE = /<\d{1,2}:\d{2}:\d{2}\.\d{1,3}>|<\/?c[^>]*>/;
  var ANY_TAG_RE = /<[^>]*>/g;
  var ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&quot;": '"',
                   "&#39;": "'", "&lrm;": "‎", "&rlm;": "‏" };
  var ENTITY_RE = /&(?:amp|lt|gt|nbsp|quot|#39|lrm|rlm);/g;

  function hmsToSec(h, m, s, ms) {
    return (Number(h) || 0) * 3600 + Number(m) * 60 + Number(s) + Number(String(ms).padEnd(3, "0")) / 1000;
  }

  function cleanText(line) {
    return String(line)
      .replace(ANY_TAG_RE, "")
      .replace(ENTITY_RE, function (m) { return ENTITIES[m]; })
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalise(raw) {
    return String(raw == null ? "" : raw).replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function detectFormat(raw) {
    var txt = normalise(raw);
    if (!txt.trim()) return null;
    if (/^WEBVTT/.test(txt.trim())) return "vtt";
    var lines = txt.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (CUE_RE.test(l)) return l.indexOf(",") >= 0 ? "srt" : "vtt";
      if (PANEL_TS_RE.test(l)) return "youtube-panel";
    }
    return null;
  }

  // ВАЖНО: блоки WEBVTT/SRT разделяются ТОЛЬКО по-настоящему пустой строкой.
  // YouTube кладёт в тело кью строки из одного пробела — "\n \n" это ТЕКСТ, не разделитель.
  function parseCueBlocks(txt) {
    var blocks = txt.split("\n\n");
    var cues = [];
    for (var b = 0; b < blocks.length; b++) {
      var lines = blocks[b].split("\n");
      var idx = -1;
      for (var i = 0; i < lines.length; i++) { if (CUE_RE.test(lines[i].trim())) { idx = i; break; } }
      if (idx < 0) continue;
      var m = lines[idx].trim().match(CUE_RE);
      cues.push({
        start: hmsToSec(m[1], m[2], m[3], m[4]),
        end: hmsToSec(m[5], m[6], m[7], m[8]),
        lines: lines.slice(idx + 1),
      });
    }
    return cues;
  }

  function languageFromHeader(txt) {
    var m = /^Language:\s*([A-Za-z-]+)\s*$/m.exec(txt.split("\n\n")[0] || "");
    return m ? m[1] : null;
  }

  function fail(code) {
    return { ok: false, format: null, rolling: false, language: null, kindHint: "unknown",
             segments: [], droppedHeadings: 0, warnings: [], error_code: code };
  }

  function finish(base) {
    var segs = base.segments;
    if (!segs.length) return fail("CAPTIONS_EMPTY");
    if (segs.length > MAX_SEGMENTS) return fail("CAPTIONS_TOO_MANY");
    for (var k = 0; k < segs.length; k++) {
      if (segs[k].text.length > MAX_SEG_TEXT) return fail("CAPTIONS_TOO_MANY");
      segs[k].i = k; // плотный 0-based индекс — контракт ingest/segTable.js
    }
    base.ok = true;
    return base;
  }

  function parse(raw, opts) {
    var txt = normalise(raw);
    if (!txt.trim()) return fail("CAPTIONS_EMPTY");
    var format = (opts && opts.hint) || detectFormat(txt);
    // Похоже на субтитры (есть стрелка кью), но не разобралось — это другой диагноз,
    // чем «вставили просто текст»: пользователю нужны разные подсказки.
    if (!format) return fail(txt.indexOf("-->") >= 0 ? "CAPTIONS_UNPARSEABLE" : "CAPTIONS_NO_TIMESTAMPS");
    if (format === "youtube-panel") return parsePanel(txt);        // Task 3
    var cues = parseCueBlocks(txt);
    if (!cues.length) return fail("CAPTIONS_EMPTY");
    if (isRolling(cues)) return finish(fromRollingCues(cues, txt)); // Task 2
    var segments = [];
    for (var c = 0; c < cues.length; c++) {
      var text = cleanText(cues[c].lines.join(" "));
      if (!text) continue;
      segments.push({ i: segments.length, start: cues[c].start, text: text });
    }
    return finish({ format: format, rolling: false, language: languageFromHeader(txt),
                    kindHint: "unknown", segments: segments, droppedHeadings: 0, warnings: [] });
  }

  // Заглушки задач 2 и 3 — заменяются в них целиком.
  function isRolling() { return false; }
  function fromRollingCues() { return null; }
  function parsePanel() { return fail("CAPTIONS_UNPARSEABLE"); }

  var API = { parse: parse, detectFormat: detectFormat, MAX_SEGMENTS: MAX_SEGMENTS, MAX_SEG_TEXT: MAX_SEG_TEXT };
  if (typeof window !== "undefined") window.CaptionsParse = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

- [ ] **Step 4: Run tests to verify VTT/SRT tests pass**

Run: `node --test tests/captionsParse.test.js`
Expected: PASS для всех тестов этой задачи (тесты вставки и катящихся ещё не написаны).

- [ ] **Step 5: Add the caps-parity test**

Дописать в `tests/captionsParse.test.js`:

```js
test("caps mirror the server contract by construction", () => {
  const seg = require("../ingest/segTable.js");
  // segTable не экспортирует константы — проверяем по исходнику, чтобы расхождение падало здесь,
  // а не превращалось в загадочный 400 от сервера.
  const src = require("node:fs").readFileSync(require.resolve("../ingest/segTable.js"), "utf8");
  assert.match(src, new RegExp(`MAX_SEGMENTS\\s*=\\s*${CP.MAX_SEGMENTS}\\b`));
  assert.match(src, new RegExp(`MAX_SEG_TEXT\\s*=\\s*${CP.MAX_SEG_TEXT}\\b`));
  assert.ok(seg);
});
```

- [ ] **Step 6: Run and commit**

Run: `node --test tests/captionsParse.test.js`
Expected: PASS

```bash
git add public/js/captions-parse.js tests/captionsParse.test.js
git commit -m "feat(ingest): W2-S5a T1 — captions parser core (VTT/SRT, entities, caps)"
```

---

### Task 2: разворачивание катящихся авто-субтитров

**Files:**
- Modify: `public/js/captions-parse.js` (заменить заглушки `isRolling` / `fromRollingCues`)
- Test: `tests/captionsParse.test.js` (дописать)

**Interfaces:**
- Consumes: `parseCueBlocks`, `cleanText`, `finish` из Task 1.
- Produces: `parse()` на катящемся входе возвращает `rolling:true`, `kindHint:"auto"` и
  развёрнутые сегменты; счётчик отброшенных повторов — в `warnings` не попадает (это норма формата).

- [ ] **Step 1: Write the failing test**

Дописать в `tests/captionsParse.test.js`:

```js
test("rolling auto-captions are de-rolled (real YouTube structure)", () => {
  // Точная структура из scripts/premium/fixtures/captions/hebrew-auto-rolling.vtt:
  // кью с пословными тегами = НОВЫЙ текст на старте кью; 10-мс кью = «доводка»;
  // первая строка следующей кью = перенос предыдущей.
  const raw = [
    "WEBVTT", "Kind: captions", "Language: iw", "",
    "00:00:01.964 --> 00:00:07.630 align:start position:100%",
    " ", "[музыка]", "",
    "00:00:07.630 --> 00:00:07.640 align:start position:100%",
    " ", " ", "",
    "00:00:07.640 --> 00:00:10.190 align:start position:100%",
    " ", "кто<00:00:07.919><c> вы</c><00:00:08.120><c> такие?</c>", "",
    "00:00:10.190 --> 00:00:10.200 align:start position:100%",
    "кто вы такие?", " ", "",
    "00:00:10.200 --> 00:00:13.230 align:start position:100%",
    "кто вы такие?", "и<00:00:10.280><c> зачем</c><00:00:10.400><c> пришли</c>", "",
  ].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.rolling, true);
  assert.equal(r.kindHint, "auto");
  assert.deepEqual(r.segments, [
    { i: 0, start: 1.964, text: "[музыка]" },
    { i: 1, start: 7.64, text: "кто вы такие?" },
    { i: 2, start: 10.2, text: "и зачем пришли" },
  ]);
});

test("rolling: word-level timings are DISCARDED, never surfaced (R11)", () => {
  const raw = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nа<00:00:02.000><c> б</c><00:00:03.000><c> в</c>\n\n" +
              "00:00:05.000 --> 00:00:09.000\nа б в\nг<00:00:06.000><c> д</c>\n\n" +
              "00:00:09.000 --> 00:00:12.000\nг д\nе<00:00:10.000><c> ж</c>\n";
  const r = CP.parse(raw);
  assert.equal(r.rolling, true);
  for (const s of r.segments) {
    assert.ok(!/<|\d{2}:\d{2}/.test(s.text), "no tags or timings leak into text: " + s.text);
    assert.equal(typeof s.start, "number");
  }
  assert.deepEqual(r.segments.map((s) => s.text), ["а б в", "г д", "е ж"]);
});

test("non-rolling plain captions keep every cue (no false de-roll)", () => {
  const raw = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nодно\n\n00:00:03.000 --> 00:00:04.000\nодно\n";
  const r = CP.parse(raw); // повтор текста БЕЗ тегов и не подряд-переносом — это законные две реплики
  assert.equal(r.rolling, false);
  assert.equal(r.segments.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/captionsParse.test.js`
Expected: FAIL — катящийся вход сейчас идёт по обычной ветке, сегментов больше и текст задублирован.

- [ ] **Step 3: Replace the stubs**

В `public/js/captions-parse.js` заменить заглушки `isRolling` / `fromRollingCues`:

```js
  // Катящиеся авто-субтитры YouTube: каждая реплика приходит трижды — как строка с пословными
  // тегами (новый текст), как 10-мс «доводочная» кью и как перенос в начале следующей кью.
  function isRolling(cues) {
    var tagged = 0;
    for (var i = 0; i < cues.length; i++) {
      for (var j = 0; j < cues[i].lines.length; j++) {
        if (WORD_TAG_RE.test(cues[i].lines[j])) { tagged++; break; }
      }
    }
    return tagged >= 3 && tagged >= cues.length * 0.2;
  }

  function fromRollingCues(cues, txt) {
    var segments = [], lastText = "";
    for (var c = 0; c < cues.length; c++) {
      if (cues[c].end - cues[c].start < 0.05) continue; // «доводочная» кью — всегда повтор
      for (var l = 0; l < cues[c].lines.length; l++) {
        var rawLine = cues[c].lines[l];
        var text = cleanText(rawLine); // теги (в т.ч. пословные тайминги) срезаются здесь — R11
        if (!text) continue;
        var isNew = WORD_TAG_RE.test(rawLine);
        if (!isNew && text === lastText) continue; // перенос предыдущей реплики
        segments.push({ i: segments.length, start: cues[c].start, text: text });
        lastText = text;
      }
    }
    return { format: "vtt", rolling: true, language: languageFromHeader(txt),
             kindHint: "auto", segments: segments, droppedHeadings: 0, warnings: [] };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/captionsParse.test.js`
Expected: PASS (все тесты задач 1 и 2)

- [ ] **Step 5: Commit**

```bash
git add public/js/captions-parse.js tests/captionsParse.test.js
git commit -m "feat(ingest): W2-S5a T2 — de-roll YouTube rolling auto-captions (word timings discarded, R11)"
```

---

### Task 3: разбор вставки панели «Расшифровка видео»

**Files:**
- Modify: `public/js/captions-parse.js` (заменить заглушку `parsePanel`)
- Test: `tests/captionsParse.test.js` (дописать)

**Interfaces:**
- Consumes: `PANEL_TS_RE`, `cleanText`, `finish`, `fail` из Task 1.
- Produces: `parse()` на вставке возвращает `format:"youtube-panel"`, `kindHint:"unknown"`,
  `droppedHeadings` — число отброшенных названий глав.

- [ ] **Step 1: Write the failing test**

Дописать в `tests/captionsParse.test.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const FIX = path.join(__dirname, "..", "scripts", "premium", "fixtures", "captions");

test("panel paste: timestamp line + one text line; chapter headings dropped", () => {
  const raw = ["Introduction", "0:27", "Good morning.", "0:29", "(Audience) Good.",
               "Three themes", "0:43", "There have been three themes,"].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.format, "youtube-panel");
  assert.equal(r.droppedHeadings, 2); // "Introduction" (до первого таймкода) + "Three themes"
  assert.deepEqual(r.segments, [
    { i: 0, start: 27, text: "Good morning." },
    { i: 1, start: 29, text: "(Audience) Good." },
    { i: 2, start: 43, text: "There have been three themes," },
  ]);
});

test("panel paste: heading sits BETWEEN cue text and the next timestamp (real RTL fixture)", () => {
  const raw = fs.readFileSync(path.join(FIX, "youtube-panel-he.txt"), "utf8");
  const r = CP.parse(raw);
  assert.equal(r.ok, true);
  assert.equal(r.format, "youtube-panel");
  assert.ok(r.droppedHeadings >= 2, "Introduction + Three themes dropped");
  // «Three themes» стоит между текстом реплики 0:41 и таймкодом 0:44 — не должно к ней прилипнуть
  const at41 = r.segments.find((s) => s.start === 41);
  assert.ok(at41 && !/Three themes/.test(at41.text), "heading leaked into cue text");
  const at44 = r.segments.find((s) => s.start === 44);
  assert.ok(at44 && at44.text.indexOf("מבחינת העתיד") === 0);
  assert.ok(r.segments.every((s) => s.start >= 0 && typeof s.text === "string" && s.text.length));
});

test("panel paste: english fixture parses with monotonic starts", () => {
  const r = CP.parse(fs.readFileSync(path.join(FIX, "youtube-panel-en.txt"), "utf8"));
  assert.equal(r.ok, true);
  assert.equal(r.segments[0].start, 27);
  for (let k = 1; k < r.segments.length; k++) {
    assert.ok(r.segments[k].start >= r.segments[k - 1].start, "starts must be non-decreasing");
  }
});

test("panel paste: H:MM:SS timestamps", () => {
  const r = CP.parse("1:02:03\nпоздняя реплика\n1:02:10\nследующая");
  assert.deepEqual(r.segments.map((s) => s.start), [3723, 3730]);
});

test("paste without timestamps is refused, not silently imported", () => {
  const r = CP.parse("Просто абзац текста\nещё один абзац");
  assert.equal(r.ok, false);
  assert.equal(r.error_code, "CAPTIONS_NO_TIMESTAMPS");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/captionsParse.test.js`
Expected: FAIL — `parsePanel` пока возвращает `CAPTIONS_UNPARSEABLE`.

- [ ] **Step 3: Replace the stub**

В `public/js/captions-parse.js` заменить заглушку `parsePanel`:

```js
  // Копия панели «Расшифровка видео»: [название главы?] таймкод \n одна строка текста.
  // Названия глав идут БЕЗ таймкода и вклиниваются между текстом реплики и следующим таймкодом —
  // поэтому «лишние» строки внутри реплики трактуем как главы и отбрасываем со счётчиком.
  function parsePanel(txt) {
    var lines = txt.split("\n");
    var segments = [], dropped = 0, curStart = null, curLines = [];
    function flush() {
      if (curStart === null) return;
      var text = cleanText(curLines[0] || "");
      dropped += Math.max(0, curLines.length - 1);
      if (text) segments.push({ i: segments.length, start: curStart, text: text });
      curStart = null; curLines = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = PANEL_TS_RE.exec(line);
      if (m) { flush(); curStart = hmsToSec(m[1], m[2], m[3], 0); continue; }
      if (curStart === null) { dropped++; continue; } // заголовок до первого таймкода
      curLines.push(line);
    }
    flush();
    if (!segments.length) return fail("CAPTIONS_NO_TIMESTAMPS");
    return finish({ format: "youtube-panel", rolling: false, language: null, kindHint: "unknown",
                    segments: segments, droppedHeadings: dropped, warnings: [] });
  }
```

⚠ `PANEL_TS_RE` из Task 1 требует двузначные секунды (`(\d{2})$`) — это отличает таймкод `0:27`
от строки текста вроде `1:2`. Не ослаблять.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/captionsParse.test.js`
Expected: PASS (все тесты задач 1-3)

- [ ] **Step 5: Commit**

```bash
git add public/js/captions-parse.js tests/captionsParse.test.js
git commit -m "feat(ingest): W2-S5a T3 — YouTube transcript-panel paste parser (chapter headings dropped)"
```

---

### Task 3B: слияние реплик в предложения

> Задача добавлена ПО ХОДУ реализации: замер на реальных фикстурах показал ≈21 реплику в минуту,
> из-за чего двадцатиминутный доклад (411 реплик) не проходит кап 400, а строка таблицы длиной
> 2,8 секунды — плохая единица для обучения. Решение владельца 2026-07-27, канон — дизайн §4.5.

**Files:**
- Modify: `public/js/captions-parse.js` (новая функция `mergeSegments` + опции `parse`)
- Test: `tests/captionsParse.test.js` (дописать)

**Interfaces:**
- Consumes: сегменты, которые уже строят ветки задач 1-3.
- Produces: `parse(raw, {merge = true, mergeMaxSec = 15})`; в результате появляются поля
  `cueCount` (реплик до слияния) и `merged` (булево). При `merge:false` поведение остаётся
  доreliзным — этим пользуется оракульный гейт задачи 4.

- [ ] **Step 1: Write the failing test**

Дописать в `tests/captionsParse.test.js`:

```js
test("merge: joins cues up to mergeMaxSec, breaks on sentence end", () => {
  const raw = [
    "WEBVTT", "",
    "00:00:00.000 --> 00:00:02.000", "первая часть", "",
    "00:00:02.000 --> 00:00:04.000", "вторая часть.", "",
    "00:00:04.000 --> 00:00:06.000", "новое предложение", "",
  ].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.merged, true);
  assert.equal(r.cueCount, 3);
  assert.deepEqual(r.segments, [
    { i: 0, start: 0, text: "первая часть вторая часть." },
    { i: 1, start: 4, text: "новое предложение" },
  ]);
});

test("merge: never exceeds mergeMaxSec", () => {
  const cues = [];
  for (let k = 0; k < 10; k++) {
    const s = String(k * 4).padStart(2, "0"), e = String(k * 4 + 4).padStart(2, "0");
    cues.push(`00:00:${s}.000 --> 00:00:${e}.000`, `кусок ${k}`, "");
  }
  const r = CP.parse(["WEBVTT", ""].concat(cues).join("\n"), { mergeMaxSec: 15 });
  for (let k = 1; k < r.segments.length; k++) {
    assert.ok(r.segments[k].start - r.segments[k - 1].start <= 16,
      "segment spans at most mergeMaxSec (+1 cue slack)");
  }
  assert.ok(r.segments.length >= 3 && r.segments.length < 10);
});

test("merge: a pause longer than 2s is a boundary (speaker change)", () => {
  const raw = ["WEBVTT", "",
    "00:00:00.000 --> 00:00:02.000", "до паузы", "",
    "00:00:09.000 --> 00:00:11.000", "после паузы", ""].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.segments.length, 2);
});

test("merge: loses no text — concatenation is preserved", () => {
  const fs2 = require("node:fs"), path2 = require("node:path");
  const file = path2.join(__dirname, "..", "scripts", "premium", "fixtures", "captions", "ted-hebrew-manual.vtt");
  const raw = fs2.readFileSync(file, "utf8");
  const unmerged = CP.parse(raw, { merge: false });
  const merged = CP.parse(raw);
  const flat = (r) => r.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  assert.equal(flat(merged), flat(unmerged), "merging must not drop or reorder a single character");
  assert.equal(merged.cueCount, unmerged.segments.length);
  assert.ok(merged.segments.length < unmerged.segments.length);
  assert.ok(merged.segments.length <= CP.MAX_SEGMENTS, "a 20-min talk must fit the cap after merging");
});

test("merge: segment start equals the start of its FIRST cue (no interpolation)", () => {
  const raw = ["WEBVTT", "",
    "00:00:03.500 --> 00:00:05.000", "раз", "",
    "00:00:05.000 --> 00:00:06.500", "два", ""].join("\n");
  const r = CP.parse(raw);
  assert.equal(r.segments.length, 1);
  assert.equal(r.segments[0].start, 3.5);
});

test("merge:false keeps one segment per cue (oracle-parity mode)", () => {
  const raw = ["WEBVTT", "",
    "00:00:00.000 --> 00:00:02.000", "а", "",
    "00:00:02.000 --> 00:00:04.000", "б", ""].join("\n");
  const r = CP.parse(raw, { merge: false });
  assert.equal(r.merged, false);
  assert.equal(r.segments.length, 2);
  assert.equal(r.cueCount, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/captionsParse.test.js`
Expected: FAIL — `merged`/`cueCount` не существуют, слияния нет.

- [ ] **Step 3: Implement merging**

В `public/js/captions-parse.js` добавить рядом с `finish`:

```js
  // §4.5: реплика субтитров — единица ПОКАЗА (нарезана под ширину экрана), а не единица языка.
  // Склеиваем соседние реплики до естественной границы предложения либо до mergeMaxSec, чтобы
  // строка таблицы была фразой, а не обрывком в 2,8 секунды. Старт сегмента = старт ПЕРВОЙ
  // реплики (никакой интерполяции, R11). Ни один символ не теряется.
  var SENTENCE_END_RE = /[.!?…:]["'»)\]]?\s*$/;
  var MERGE_PAUSE_SEC = 2;

  function mergeSegments(cues, maxSec) {
    var out = [], cur = null;
    for (var k = 0; k < cues.length; k++) {
      var c = cues[k];
      var breaks = !cur ||
        (c.start - cur.lastEnd) > MERGE_PAUSE_SEC ||         // пауза = смена реплики/мысли
        (c.end - cur.start) > maxSec ||                       // сегмент не длиннее maxSec
        SENTENCE_END_RE.test(cur.text);                       // предыдущая фраза закончена
      if (breaks) {
        if (cur) out.push({ i: out.length, start: cur.start, text: cur.text });
        cur = { start: c.start, lastEnd: c.end, text: c.text };
      } else {
        cur.text += " " + c.text;
        cur.lastEnd = c.end;
      }
    }
    if (cur) out.push({ i: out.length, start: cur.start, text: cur.text });
    return out;
  }
```

Ветки разбора должны собирать реплики с `end`, чтобы слияние знало длительность. Изменить обе
ветки так, чтобы они складывали промежуточный массив `{start, end, text}`, а `finish` получал
результат `mergeSegments(...)` либо, при `merge:false`, тот же массив без склейки — с полями
`cueCount` (длина исходного массива) и `merged`.

В `parse` прочитать опции:

```js
    var doMerge = !(opts && opts.merge === false);
    var maxSec = (opts && Number(opts.mergeMaxSec)) || 15;
```

и передать их в обе ветки; `finish` дополнить полями `cueCount` и `merged`.

⚠ Кап 400/2000 проверяется **после** слияния — именно это делает импортируемыми ролики длиннее
18 минут. Не переносить проверку до склейки.

- [ ] **Step 4: Run the whole suite**

Run: `node --test tests/captionsParse.test.js`
Expected: PASS, включая все тесты задач 1-3 (проверить, что число прежних тестов не уменьшилось;
тесты, где вход — 2-3 короткие реплики подряд без точки, могли начать склеиваться — если такой
тест сломался, чинить ТЕСТ через `{merge:false}`, а не логику слияния, и отметить это в отчёте).

- [ ] **Step 5: Commit**

```bash
git add public/js/captions-parse.js tests/captionsParse.test.js
git commit -m "feat(ingest): W2-S5a T3B — merge caption cues into sentence-length segments (owner decision)"
```

---

### Task 4: `smoke:captions-parse` — оракульный гейт

**Files:**
- Create: `scripts/premium/captions-parse-smoke.js`
- Modify: `package.json` (секция `scripts`)

**Interfaces:**
- Consumes: `public/js/captions-parse.js`, фикстуры `scripts/premium/fixtures/captions/*`.
- Produces: npm-скрипт `smoke:captions-parse`, ненулевой exit при просадке планки.

Гейт имеет силу только потому, что сверяет разбор `.vtt` с **другой сериализацией того же
источника** (`json3`), а не пересчитывает тем же кодом.

- [ ] **Step 1: Write the smoke script**

```js
// scripts/premium/captions-parse-smoke.js
// W2-S5a гейт: разбор .vtt сверяется с json3-сериализацией ТОЙ ЖЕ дорожки (independent oracle).
// Планка зафиксирована прототипом разведки 2026-07-27 и не должна падать.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const CP = require("../../public/js/captions-parse.js");

const FIX = path.join(__dirname, "fixtures", "captions");
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

function oracle(file) {
  const j = JSON.parse(fs.readFileSync(path.join(FIX, file), "utf8"));
  return (j.events || [])
    .filter((e) => e.segs)
    .map((e) => ({ start: (e.tStartMs || 0) / 1000, text: norm(e.segs.map((s) => s.utf8 || "").join("")) }))
    .filter((e) => e.text);
}

const CASES = [
  { label: "manual-hebrew", vtt: "ted-hebrew-manual.vtt", json: "ted-hebrew-manual.json3.json",
    expectRolling: false, minSegments: 411 },
  { label: "rolling-auto-hebrew", vtt: "hebrew-auto-rolling.vtt", json: "hebrew-auto-rolling.json3.json",
    expectRolling: true, minSegments: 65 },
];

let failed = 0;
for (const c of CASES) {
  const r = CP.parse(fs.readFileSync(path.join(FIX, c.vtt), "utf8"));
  const o = oracle(c.json);
  const problems = [];
  if (!r.ok) problems.push(`parse failed: ${r.error_code}`);
  if (r.rolling !== c.expectRolling) problems.push(`rolling=${r.rolling}, expected ${c.expectRolling}`);
  if (r.segments.length !== o.length) problems.push(`segments=${r.segments.length}, oracle=${o.length}`);
  if (r.segments.length < c.minSegments) problems.push(`segments < ${c.minSegments}`);
  let textOk = 0, startOk = 0;
  const n = Math.min(r.segments.length, o.length);
  for (let i = 0; i < n; i++) {
    if (norm(r.segments[i].text) === o[i].text) textOk++;
    if (Math.abs(r.segments[i].start - o[i].start) <= 0.05) startOk++;
  }
  if (textOk !== n) problems.push(`text parity ${textOk}/${n} (must be 100%)`);
  if (startOk !== n) problems.push(`start parity ${startOk}/${n} within 50ms (must be 100%)`);
  for (const s of r.segments) {
    if (/<[^>]*>|&[a-z]+;/i.test(s.text)) { problems.push(`tag/entity leaked: ${s.text.slice(0, 40)}`); break; }
  }
  console.log(`${problems.length ? "FAIL" : "ok  "} ${c.label}: segments=${r.segments.length} oracle=${o.length} text=${textOk}/${n} start=${startOk}/${n}`);
  problems.forEach((p) => console.log(`      - ${p}`));
  failed += problems.length ? 1 : 0;
}

for (const f of ["youtube-panel-en.txt", "youtube-panel-he.txt"]) {
  const r = CP.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
  const problems = [];
  if (!r.ok) problems.push(`parse failed: ${r.error_code}`);
  if (r.format !== "youtube-panel") problems.push(`format=${r.format}`);
  if (!r.segments.length) problems.push("no segments");
  if (r.droppedHeadings < 2) problems.push(`droppedHeadings=${r.droppedHeadings}, expected >= 2`);
  for (let i = 1; i < r.segments.length; i++) {
    if (r.segments[i].start < r.segments[i - 1].start) { problems.push(`non-monotonic at ${i}`); break; }
  }
  if (r.segments.some((s) => /Three themes|Introduction/.test(s.text))) problems.push("heading leaked into cue text");
  console.log(`${problems.length ? "FAIL" : "ok  "} ${f}: segments=${r.segments.length} droppedHeadings=${r.droppedHeadings}`);
  problems.forEach((p) => console.log(`      - ${p}`));
  failed += problems.length ? 1 : 0;
}

if (failed) { console.error(`\ncaptions-parse gate FAILED (${failed} case(s))`); process.exit(1); }
console.log("\ncaptions-parse gate OK");
```

- [ ] **Step 2: Register the npm script**

В `package.json` в секцию `scripts` рядом с `"smoke:media-karaoke"` добавить:

```json
    "smoke:captions-parse": "node scripts/premium/captions-parse-smoke.js",
```

- [ ] **Step 3: Run the gate**

Run: `npm run smoke:captions-parse`
Expected: `captions-parse gate OK`, exit 0. Планка: обе VTT-пары — паритет текста и стартов
**100%**, число сегментов равно оракульному (411 и 65).

- [ ] **Step 4: Verify the gate has teeth**

Временно сломать разделитель блоков в `captions-parse.js` (`txt.split("\n\n")` → `txt.split(/\n\s*\n/)`),
запустить `npm run smoke:captions-parse`, убедиться, что гейт **падает** (это ровно та ошибка,
которую поймала разведка), затем вернуть как было и перепроверить, что гейт зелёный.

- [ ] **Step 5: Commit**

```bash
git add scripts/premium/captions-parse-smoke.js package.json
git commit -m "test(ingest): W2-S5a T4 — captions-parse independent-oracle gate (VTT vs json3, 100% parity)"
```

---

### Task 5: `studio-yt-player.js` — capability, videoId и адаптер плеера

**Files:**
- Create: `public/js/studio-yt-player.js`
- Test: `tests/studioYtPlayer.test.js`

**Interfaces:**
- Produces: `StudioYtPlayer.parseVideoId(url) → string|null`;
  `StudioYtPlayer.capability() → {supported, reason}`;
  `StudioYtPlayer.create(mountEl, videoId) → Promise<adapter>`; `StudioYtPlayer.destroy(adapter)`.
  `adapter` = `{currentTime (get/set), play(), pause(), paused (get), addEventListener(ev,fn),
  removeEventListener(ev,fn), tracklist(), isYouTube: true, destroy()}` — минимум, который
  потребляет `studio-media-karaoke.js` (Task 6).
- Consumes: ничего из плана; снаружи — YouTube IFrame API.

- [ ] **Step 1: Write the failing test**

```js
// tests/studioYtPlayer.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const YT = require("../public/js/studio-yt-player.js");

test("parseVideoId: watch, youtu.be, embed, shorts, with extra params", () => {
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=iG9CE55wbtY&t=42s"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://youtu.be/iG9CE55wbtY?si=abc"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/embed/iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://www.youtube.com/shorts/iG9CE55wbtY"), "iG9CE55wbtY");
  assert.equal(YT.parseVideoId("https://m.youtube.com/watch?v=iG9CE55wbtY"), "iG9CE55wbtY");
});

test("parseVideoId: rejects non-YouTube and malformed ids", () => {
  assert.equal(YT.parseVideoId("https://vimeo.com/12345"), null);
  assert.equal(YT.parseVideoId("https://example.com/watch?v=iG9CE55wbtY"), null);
  assert.equal(YT.parseVideoId("https://www.youtube.com/watch?v=short"), null);
  assert.equal(YT.parseVideoId("не ссылка"), null);
  assert.equal(YT.parseVideoId(""), null);
  assert.equal(YT.parseVideoId(null), null);
});

test("capability() in Node reports unsupported without throwing", () => {
  const c = YT.capability();
  assert.equal(typeof c.supported, "boolean");
  assert.equal(c.supported, false);
  assert.equal(c.reason, "no-credentialless");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/studioYtPlayer.test.js`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Write the implementation**

```js
// public/js/studio-yt-player.js
// W2-S5a · Адаптер YouTube-плеера для Студии. index.html отдаётся с COEP: require-corp
// (cross-origin isolation нужна wa-sqlite/OPFS), поэтому ОБЫЧНЫЙ iframe YouTube не стартует —
// проверено разведкой 2026-07-27. Работает <iframe credentialless> (Chromium): плеер готов,
// часы идут, crossOriginIsolated остаётся true. Safari/Firefox — честная деградация.
// Канон: docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md §5.2.
(function () {
  "use strict";

  var ID_RE = /^[A-Za-z0-9_-]{11}$/;

  function parseVideoId(input) {
    if (typeof input !== "string" || !input.trim()) return null;
    var u;
    try { u = new URL(input.trim()); } catch (_) { return null; }
    var host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      var short = u.pathname.split("/")[1] || "";
      return ID_RE.test(short) ? short : null;
    }
    if (host !== "youtube.com" && host !== "music.youtube.com") return null;
    var v = u.searchParams.get("v");
    if (v && ID_RE.test(v)) return v;
    var parts = u.pathname.split("/").filter(Boolean);
    if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && ID_RE.test(parts[1] || "")) {
      return parts[1];
    }
    return null;
  }

  function capability() {
    if (typeof window === "undefined" || typeof HTMLIFrameElement === "undefined" ||
        !("credentialless" in HTMLIFrameElement.prototype)) {
      return { supported: false, reason: "no-credentialless" };
    }
    return { supported: true, reason: "ok" };
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = { parseVideoId: parseVideoId, capability: capability };
    }
    return;
  }

  var apiPromise = null;
  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject(new Error("YT_API_TIMEOUT")); }, 15000);
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        clearTimeout(to);
        if (typeof prev === "function") { try { prev(); } catch (_) {} }
        resolve();
      };
      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = function () { clearTimeout(to); reject(new Error("YT_API_FAILED")); };
      document.head.appendChild(s);
    });
    return apiPromise;
  }

  // Адаптер выставляет ровно тот минимум, который потребляет studio-media-karaoke.js.
  function makeAdapter(player, iframe) {
    var listeners = { play: [], pause: [], ended: [], error: [] };
    function emit(ev) { (listeners[ev] || []).forEach(function (fn) { try { fn(); } catch (_) {} }); }
    var adapter = {
      isYouTube: true,
      get currentTime() { try { return player.getCurrentTime() || 0; } catch (_) { return 0; } },
      set currentTime(t) { try { player.seekTo(Number(t) || 0, true); } catch (_) {} },
      get paused() { try { return player.getPlayerState() !== 1; } catch (_) { return true; } },
      play: function () { try { player.playVideo(); } catch (_) {} return Promise.resolve(); },
      pause: function () { try { player.pauseVideo(); } catch (_) {} },
      addEventListener: function (ev, fn) { if (listeners[ev]) listeners[ev].push(fn); },
      removeEventListener: function (ev, fn) {
        if (!listeners[ev]) return;
        var i = listeners[ev].indexOf(fn);
        if (i >= 0) listeners[ev].splice(i, 1);
      },
      tracklist: function () {
        try {
          var list = player.getOption("captions", "tracklist");
          return Array.isArray(list) ? list.map(function (t) {
            return { languageCode: t.languageCode, languageName: t.languageName,
                     kind: t.kind === "asr" ? "asr" : "manual", isDefault: !!t.is_default };
          }) : [];
        } catch (_) { return []; }
      },
      destroy: function () {
        try { player.destroy(); } catch (_) {}
        if (iframe && iframe.parentNode) { try { iframe.parentNode.removeChild(iframe); } catch (_) {} }
        Object.keys(listeners).forEach(function (k) { listeners[k] = []; });
      },
      _emit: emit,
    };
    return adapter;
  }

  function create(mountEl, videoId) {
    var cap = capability();
    if (!cap.supported) return Promise.reject(Object.assign(new Error(cap.reason), { code: "YT_UNSUPPORTED" }));
    if (!ID_RE.test(String(videoId || ""))) return Promise.reject(Object.assign(new Error("bad id"), { code: "YT_BAD_ID" }));
    return loadApi().then(function () {
      return new Promise(function (resolve, reject) {
        var iframe = document.createElement("iframe");
        iframe.setAttribute("credentialless", "");
        iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
        iframe.setAttribute("title", "YouTube");
        iframe.width = "100%"; iframe.height = "200"; iframe.style.border = "0";
        iframe.src = "https://www.youtube.com/embed/" + videoId +
                     "?enablejsapi=1&playsinline=1&rel=0&origin=" + encodeURIComponent(location.origin);
        mountEl.appendChild(iframe);
        var settled = false;
        var to = setTimeout(function () {
          if (settled) return;
          settled = true;
          try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch (_) {}
          reject(Object.assign(new Error("ready timeout"), { code: "YT_NOT_READY" }));
        }, 20000);
        var adapter = null;
        var player = new window.YT.Player(iframe, {
          events: {
            onReady: function () {
              if (settled) return;
              settled = true; clearTimeout(to);
              resolve(adapter);
            },
            onStateChange: function (e) {
              if (!adapter) return;
              if (e.data === 1) adapter._emit("play");
              else if (e.data === 2) adapter._emit("pause");
              else if (e.data === 0) adapter._emit("ended");
            },
            onError: function (e) {
              if (adapter) adapter._emit("error");
              if (settled) return;
              settled = true; clearTimeout(to);
              reject(Object.assign(new Error("yt error " + e.data), { code: "YT_EMBED_DENIED" }));
            },
          },
        });
        adapter = makeAdapter(player, iframe);
      });
    });
  }

  function destroy(adapter) { if (adapter && typeof adapter.destroy === "function") adapter.destroy(); }

  window.StudioYtPlayer = { parseVideoId: parseVideoId, capability: capability, create: create, destroy: destroy };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = window.StudioYtPlayer;
  }
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/studioYtPlayer.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/studio-yt-player.js tests/studioYtPlayer.test.js
git commit -m "feat(ingest): W2-S5a T5 — YouTube player adapter over <iframe credentialless>"
```

---

### Task 6: караоке принимает медиа-адаптер вместо блоба

**Files:**
- Modify: `public/js/studio-media-karaoke.js:76-114` (`ensureRun`, `start`, `stop`)
- Test: `tests/mediaKaraoke.test.js` (дописать)

**Interfaces:**
- Consumes: адаптер из Task 5 (утиный тип: `currentTime`, `play`, `pause`, `paused`,
  `addEventListener`, `removeEventListener`).
- Produces: `StudioMediaKaraoke.start({blob?, media?, entries, rowCount})` — ровно один из
  `blob`/`media`. Контракт ссылочного равенства `entries` сохраняется.

- [ ] **Step 1: Write the failing test**

Дописать в `tests/mediaKaraoke.test.js`:

```js
const K = require("../public/js/studio-media-karaoke.js");

test("module exports only the pure part in Node (no DOM)", () => {
  // В Node модуль отдаёт лишь activeSegmentRange — DOM-часть не инициализируется.
  assert.equal(typeof K.activeSegmentRange, "function");
  assert.equal(typeof K.start, "undefined");
});

test("activeSegmentRange is unchanged by the adapter work", () => {
  const e = [{ o: 0, t: 2 }, { o: 3, t: 10 }];
  assert.deepEqual(K.activeSegmentRange(e, 5, 10), { idx: 1, rowStart: 3, rowEnd: 5 });
});
```

Браузерная часть правки проверяется живым смоуком (Task 10) — в Node DOM-ветка модуля не грузится.

- [ ] **Step 2: Run test to verify current state**

Run: `node --test tests/mediaKaraoke.test.js`
Expected: PASS (это защита от регресса pure-части перед правкой)

- [ ] **Step 3: Modify `ensureRun` / `start` / `stop`**

В `public/js/studio-media-karaoke.js` заменить `ensureRun` (строка 76) и `start` (строка 108):

```js
  // W2-S5a: источник времени может быть локальным блобом (S4) ИЛИ внешним медиа-адаптером
  // (YouTube-плеер, studio-yt-player.js). Всё ниже работает с любым из них — нужен лишь
  // currentTime/play/pause/paused/addEventListener. Object-URL отзываем только свой.
  function ensureRun(source, entries, rowCount) {
    stop();
    if (typeof window.v3StopRowAudio === "function") { try { window.v3StopRowAudio(); } catch (_) {} }
    var url = null, audioEl;
    if (source && typeof source.addEventListener === "function" && !(source instanceof Blob)) {
      audioEl = source;                       // внешний адаптер — своего элемента не создаём
    } else {
      url = URL.createObjectURL(source);
      audioEl = new Audio(url);
      audioEl.preload = "auto";
    }
    var run = { audioEl: audioEl, url: url, entries: entries || null, rowCount: rowCount, rafId: 0, lastIdx: -2, stopAtT: null, listeners: null };
```

(остальное тело `ensureRun` — с `var onPause = ...` до `return run;` — не трогать).

`start` — принимать оба входа:

```js
  async function start(opts) {
    try {
      var source = opts.media || opts.blob;
      var run = (cur && cur.entries === (opts.entries || null)) ? cur : ensureRun(source, opts.entries || null, opts.rowCount || 0);
      run.stopAtT = null;
      await run.audioEl.play();
    } catch (_) { /* best-effort: никогда не ломаем Студию */ }
  }
```

`stop` (строка 63) уже отзывает URL условно (`if (cur.url)`) — правка не нужна, но добавить
комментарий, что `url === null` для внешнего адаптера, это норма.

- [ ] **Step 4: Run tests and the existing gate**

Run: `node --test tests/mediaKaraoke.test.js && npm run smoke:media-karaoke`
Expected: PASS / зелёный гейт

- [ ] **Step 5: Commit**

```bash
git add public/js/studio-media-karaoke.js tests/mediaKaraoke.test.js
git commit -m "feat(ingest): W2-S5a T6 — karaoke accepts an external media adapter, not only a blob"
```

---

### Task 7: glue в `index.html` — паспорт, seg-гейт, привязка тайминга

**Files:**
- Modify: `public/index.html:23294-23351` (`v3AttachImportSource`, `v3AttachAudioTiming`,
  `v3RestoreMediaFromMeta`), `public/index.html:32833-32844` (`v3AudioSegmentsForRequest`)

**Interfaces:**
- Consumes: `window.v3LastImportMeta` с новым `kind:"captions"` и слотом `captions` (Task 8
  его заполняет — согласовать имена ровно как здесь).
- Produces: `v3MediaPassport(objWithSlots) → passport|null` — ЕДИНСТВЕННЫЙ аксессор к паспорту
  медиа; все консьюмеры обязаны ходить через него (gate-consumers-sweep).

Паспорт субтитров имеет ту же внутреннюю форму, что и аудио-паспорт S4
(`{v, segments, timing, timingDropReason, media?}`) плюс блоки `captions` и `video`
(дизайн §5.3), поэтому вся арифметика тайминга переиспользуется без изменений.

- [ ] **Step 1: Add the accessor**

Перед `v3AttachImportSource` (`index.html:23294`) вставить:

```js
// W2-S5a: паспорт медиа лежит в слоте `audio` (импорт аудио/видео-файла, S4) или `captions`
// (импорт субтитров, S5a). Внутренняя форма одна и та же — {v, segments, timing,
// timingDropReason, media?}. ЕДИНСТВЕННАЯ точка доступа: любой новый консьюмер обязан
// ходить сюда, иначе одна из поверхностей молча потеряет тайминг (урок gate-consumers-sweep).
function v3MediaPassport(holder) {
  if (!holder || typeof holder !== "object") return null;
  return holder.audio || holder.captions || null;
}
```

- [ ] **Step 2: Route the three consumers through it**

`v3AttachImportSource` (строка 23303) — заменить:

```js
      if (im.kind === "audio" && im.audio) v3LastGeminiMeta.source.audio = im.audio;
```

на:

```js
      if (im.audio) v3LastGeminiMeta.source.audio = im.audio;
      if (im.captions) v3LastGeminiMeta.source.captions = im.captions;
```

`v3AttachAudioTiming` (строки 23312-23318) — заменить:

```js
    const src = v3LastGeminiMeta && v3LastGeminiMeta.source;
    if (!src || !src.audio) {
      window.v3ActiveMediaAudio = null;
      if (typeof v3MediaBarRefresh === "function") v3MediaBarRefresh();
      return;
    }
    const audio = src.audio;
```

на:

```js
    const src = v3LastGeminiMeta && v3LastGeminiMeta.source;
    const audio = v3MediaPassport(src);
    if (!audio) {
      window.v3ActiveMediaAudio = null;
      if (typeof v3MediaBarRefresh === "function") v3MediaBarRefresh();
      return;
    }
```

`v3RestoreMediaFromMeta` (строка 23346) — заменить:

```js
    const audio = meta && meta.source && meta.source.audio;
```

на:

```js
    const audio = v3MediaPassport(meta && meta.source);
```

- [ ] **Step 3: Widen the seg-request gate**

`v3AudioSegmentsForRequest` (строка 32836) — заменить:

```js
            const im = window.v3LastImportMeta;
            if (!im || im.kind !== "audio" || !im.audio || !Array.isArray(im.audio.segments)) return null;
            if (im.audio.timingDropReason) return null;
```

на:

```js
            const im = window.v3LastImportMeta;
            const p = v3MediaPassport(im);
            if (!im || !p || !Array.isArray(p.segments)) return null;
            if (p.timingDropReason) return null;
```

и ниже (строка 32840) `im.audio.segments.length` → `p.segments.length`.

- [ ] **Step 4: Sweep for remaining direct `.audio` reads**

Run:

```bash
grep -n "\.source\.audio\|im\.audio\|meta\.audio" public/index.html
```

Expected: остаться должны только (а) присвоения внутри `v3AttachImportSource`, (б) чтения
`audio.media.*` внутри провенанс-панели (Task 9 их обновит), (в) сам `v3MediaPassport`.
Любое ДРУГОЕ прямое чтение — переписать на аксессор.

- [ ] **Step 5: Verify nothing regressed**

Run: `npm run smoke:media-karaoke && npm run smoke:reader-parity && node --test`
Expected: всё зелёное (существующий аудио-путь работает через аксессор без изменения поведения).

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "refactor(studio): W2-S5a T7 — single media-passport accessor; seg gate accepts captions"
```

---

### Task 8: UI — приём субтитров, плеер, медиа-бар, локали

**Files:**
- Modify: `public/index.html` (разметка модала ~46366-46377; CSS рядом с `.v3-import-audio`;
  `v3MediaBarRefresh` 23370, `v3MediaPlayOriginal` 23386)
- Modify: `public/js/studio-import.js` (классификация URL, приём субтитров, `ERROR_KEY`, `showPreview`, `useText`)
- Modify: `public/i18n/locales/{ru,en,he}.js`

**Interfaces:**
- Consumes: `CaptionsParse.parse` (T1-3), `StudioYtPlayer` (T5), `v3MediaPassport` (T7).
- Produces: `window.v3LastImportMeta = {kind:"captions", …, captions:{v:1, captions:{…},
  video:{…}?, media:{…}?, segments, timing:null, timingDropReason}}` — имена слотов ровно
  как в Task 7 и дизайне §5.3.

- [ ] **Step 1: Add the markup**

В `public/index.html` после блока `.v3-import-audio` (после строки 46377) вставить:

```html
      <div class="v3-import-captions" id="v3ImportCaptionsBox">
        <div class="input-label" data-i18n="studio.import.captionsLabel">Субтитры видео</div>
        <div id="v3ImportYtMount" hidden></div>
        <div id="v3ImportYtHint" style="font-size:12px; color:#6c757d; margin:4px 0;"></div>
        <label class="v3-import-file-btn">
          <span data-i18n="studio.import.captionsFileBtn">Файл субтитров (.vtt / .srt)</span>
          <input type="file" id="v3ImportCaptionsFile" accept=".vtt,.srt,text/vtt" hidden
                 onchange="StudioImport.onCaptionsFileChosen(event)">
        </label>
        <textarea id="v3ImportCaptionsPaste" dir="auto" rows="3"
                  data-i18n-placeholder="studio.import.captionsPastePlaceholder"
                  placeholder="Вставьте расшифровку с таймкодами…"
                  style="width:100%; box-sizing:border-box; margin-top:6px;"></textarea>
        <button type="button" class="btn-secondary" id="v3ImportCaptionsPasteBtn"
                onclick="StudioImport.useCaptionsPaste()" data-i18n="studio.import.captionsPasteBtn">Разобрать вставку</button>
      </div>
```

- [ ] **Step 2: Add the CSS exception**

Рядом с существующими правилами `.v3-import-audio` добавить (мобильная ловушка
`button { width: 100% }`):

```css
#v3ImportCaptionsBox button, .v3-import-captions button { width: auto !important; }
#v3ImportYtMount iframe { width: 100%; max-width: 100%; border: 0; border-radius: 8px; }
```

- [ ] **Step 3: Implement the intake in `studio-import.js`**

В `public/js/studio-import.js` добавить рядом с `pendingAudio` (после строки 18):

```js
  var pendingCaptions = null; // {parsed, origin, fileName, video}
  var ytAdapter = null;       // адаптер плеера, если ролик встроен
```

Добавить функции (перед `window.StudioImport = …`):

```js
  // Классификация URL: ссылка на YouTube уходит в ветку S5a, а НЕ в /api/ingest/fetch-url —
  // тот вернул бы либо EXTRACT_EMPTY, либо мусор из SPA-шелла (разведка 2026-07-27).
  async function fetchUrlOrVideo() {
    var url = ($("v3ImportUrl").value || "").trim();
    if (!url) { setStatus("studio.import.errBadUrl"); return; }
    var vid = window.StudioYtPlayer && window.StudioYtPlayer.parseVideoId(url);
    if (!vid) return fetchUrl();
    await mountVideo(vid, url);
  }

  async function mountVideo(videoId, url) {
    var mount = $("v3ImportYtMount"), hint = $("v3ImportYtHint");
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.video = { platform: "youtube", videoId: videoId, url: url };
    if (ytAdapter) { window.StudioYtPlayer.destroy(ytAdapter); ytAdapter = null; }
    mount.innerHTML = "";
    var cap = window.StudioYtPlayer.capability();
    if (!cap.supported) { mount.hidden = true; hint.textContent = tr("studio.import.captionsNoPlayer"); return; }
    mount.hidden = false;
    hint.textContent = tr("studio.import.captionsPlayerLoading");
    try {
      ytAdapter = await window.StudioYtPlayer.create(mount, videoId);
      hint.textContent = describeTracks(ytAdapter.tracklist());
    } catch (e) {
      mount.hidden = true;
      hint.textContent = tr(e && e.code === "YT_EMBED_DENIED"
        ? "studio.import.captionsEmbedDenied" : "studio.import.captionsNoPlayer");
    }
  }

  // R9: сообщаем, ЧТО есть у ролика — это свидетельство о дорожках, а не о принесённом файле.
  function describeTracks(list) {
    if (!list || !list.length) return tr("studio.import.captionsTracksNone");
    var manual = list.filter(function (t) { return t.kind !== "asr"; });
    var langs = (manual.length ? manual : list).map(function (t) { return t.languageName || t.languageCode; });
    var uniq = langs.filter(function (v, i) { return langs.indexOf(v) === i; }).slice(0, 4).join(", ");
    return tr(manual.length ? "studio.import.captionsTracksManual" : "studio.import.captionsTracksAuto") + " " + uniq;
  }

  function acceptCaptions(parsed, origin, fileName) {
    if (!parsed.ok) { setStatus(errKey(parsed.error_code)); return; }
    pendingCaptions = pendingCaptions || {};
    pendingCaptions.parsed = parsed;
    pendingCaptions.origin = origin;
    pendingCaptions.fileName = fileName || null;
    var warn = [];
    if (parsed.kindHint === "auto") warn.push("AUTO_CAPTIONS");
    if (parsed.droppedHeadings > 0) warn.push("HEADINGS_DROPPED");
    showPreview({
      kind: "captions", source: fileName || tr("studio.import.captionsSourcePaste"),
      method: origin === "file" ? "captions-file" : "captions-panel", model: null,
      warnings: warn,
      text: parsed.segments.map(function (s) { return s.text; }).join("\n"),
    });
  }

  function onCaptionsFileChosen(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setStatus("studio.import.errTooLarge"); return; }
    var reader = new FileReader();
    reader.onerror = function () { setStatus("studio.import.errGeneric"); };
    reader.onload = function () {
      acceptCaptions(window.CaptionsParse.parse(String(reader.result || "")), "file", file.name);
    };
    reader.readAsText(file, "utf-8");
  }

  function useCaptionsPaste() {
    var raw = ($("v3ImportCaptionsPaste").value || "");
    if (!raw.trim()) { setStatus("studio.import.errCaptionsEmpty"); return; }
    acceptCaptions(window.CaptionsParse.parse(raw), "paste", null);
  }
```

В `showPreview` (строка 120) в карту `provKey` добавить `captions: "studio.import.provCaptions"`.

В `ERROR_KEY` (строка 141) добавить:

```js
    CAPTIONS_EMPTY: "studio.import.errCaptionsEmpty",
    CAPTIONS_NO_TIMESTAMPS: "studio.import.errCaptionsNoTimestamps",
    CAPTIONS_UNPARSEABLE: "studio.import.errCaptionsUnparseable",
    CAPTIONS_TOO_MANY: "studio.import.errCaptionsTooMany",
```

В `useText` (после аудио-ветки, перед `var input = $("inputText")`) добавить ветку субтитров:

```js
    var captionsMetaForImport = null;
    if (pending.kind === "captions" && pendingCaptions && pendingCaptions.parsed) {
      var cl = text.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      var ps = pendingCaptions.parsed.segments;
      var cEdited = cl.length !== ps.length;
      captionsMetaForImport = {
        v: 1,
        captions: { origin: pendingCaptions.origin, format: pendingCaptions.parsed.format,
                    kindHint: pendingCaptions.parsed.kindHint,
                    kindEvidence: pendingCaptions.parsed.rolling ? "vtt-rolling"
                                : (pendingCaptions.parsed.format === "vtt" || pendingCaptions.parsed.format === "srt" ? "vtt-plain" : "none"),
                    language: pendingCaptions.parsed.language, fileName: pendingCaptions.fileName,
                    at: new Date().toISOString(), droppedHeadings: pendingCaptions.parsed.droppedHeadings,
                    warnings: pending.warnings || [] },
        video: pendingCaptions.video || undefined,
        segments: cEdited ? cl.map(function (t2, k) { return { i: k, start: null, text: t2 }; })
                          : ps.map(function (s, k) { return { i: k, start: s.start, text: cl[k] }; }),
        timing: null,
        timingDropReason: cEdited ? "PREVIEW_EDITED" : null,
      };
      if (cEdited) toast("studio.import.audioTimingDropped", "warning");
    }
```

и в объект `window.v3LastImportMeta` добавить поле `captions: captionsMetaForImport || undefined,`.

В экспорт (строка 263) добавить `fetchUrlOrVideo`, `onCaptionsFileChosen`, `useCaptionsPaste`.
В разметке кнопки «Извлечь» (`index.html:46357`) заменить
`onclick="StudioImport.fetchUrl()"` на `onclick="StudioImport.fetchUrlOrVideo()"`.

- [ ] **Step 4: Wire the player into the media bar**

`v3MediaBarRefresh` (строка 23378) — не гасить кнопку, когда блоба нет, но есть встроенный ролик:

```js
  v3MediaResolveBlob(audio).then((blob) => {
    const btn = document.getElementById("v3MediaPlayBtn");
    const hasVideo = !!(audio.video && audio.video.videoId && window.StudioYtPlayer &&
                        window.StudioYtPlayer.capability().supported);
    if (btn) btn.disabled = !blob && !hasVideo;
    if (!blob && !hasVideo && note) note.textContent = t("studio.media.fileMissing");
    if (!blob && hasVideo && note) note.textContent = t("studio.media.viaYouTube");
    v3MediaAugmentRows();
  });
```

`v3MediaPlayOriginal` (строка 23386) — ветка внешнего плеера:

```js
async function v3MediaPlayOriginal() {
  const audio = window.v3ActiveMediaAudio;
  if (!audio) return;
  const rowCount = Array.isArray(currentTableData) ? currentTableData.length : 0;
  const entries = audio.timing ? audio.timing.entries : null; // ССЫЛОЧНОЕ равенство — не пересоздавать
  const blob = await v3MediaResolveBlob(audio);
  if (blob) { await StudioMediaKaraoke.start({ blob, entries, rowCount }); return; }
  if (!audio.video || !audio.video.videoId) return;
  if (!window.v3YtStageAdapter) {
    const mount = document.getElementById("v3MediaYtMount");
    if (!mount) return;
    mount.hidden = false;
    try { window.v3YtStageAdapter = await window.StudioYtPlayer.create(mount, audio.video.videoId); }
    catch (_) { mount.hidden = true; return; }
  }
  await StudioMediaKaraoke.start({ media: window.v3YtStageAdapter, entries, rowCount });
}
```

Рядом с разметкой `#v3MediaBar` (`index.html` ~10990) добавить контейнер сцены:
`<div id="v3MediaYtMount" hidden style="margin-top:8px;"></div>`.
В точках сброса медиа-состояния (`index.html` 13683-13690, 20874-20879, 25077-25082) добавить
`if (window.v3YtStageAdapter) { window.StudioYtPlayer.destroy(window.v3YtStageAdapter); window.v3YtStageAdapter = null; }`
рядом с существующим `StudioMediaKaraoke.stop()`.

- [ ] **Step 5: Add every new string to ALL THREE locales**

В `public/i18n/locales/ru.js`, `en.js`, `he.js` в блок `studio.import` добавить ключи (значения —
на языке файла; ниже русские): `captionsLabel` «Субтитры видео», `captionsFileBtn`
«Файл субтитров (.vtt / .srt)», `captionsPasteBtn` «Разобрать вставку», `captionsPastePlaceholder`
«Вставьте расшифровку с таймкодами…», `captionsSourcePaste` «вставка расшифровки»,
`captionsNoPlayer` «В этом браузере ролик не воспроизвести — таблица и таймкоды будут доступны»,
`captionsEmbedDenied` «Владелец запретил встраивание ролика — откройте его на YouTube»,
`captionsPlayerLoading` «Загружаю плеер…», `captionsTracksManual` «У ролика есть ручные субтитры:»,
`captionsTracksAuto` «У ролика только авто-субтитры:», `captionsTracksNone`
«У ролика нет субтитров — загрузите медиа-файл для распознавания речи»,
`provCaptions` «Субтитры → сегменты», `errCaptionsEmpty` «В субтитрах нет реплик»,
`errCaptionsNoTimestamps` «Нужна расшифровка с таймкодами, а не просто текст»,
`errCaptionsUnparseable` «Не удалось разобрать субтитры», `errCaptionsTooMany`
«Слишком много реплик — возьмите фрагмент покороче».
В блок `studio.media` добавить `viaYouTube` «Воспроизведение через YouTube».

Run: `npm run smoke:i18n`
Expected: PASS (гейт ловит ключ, которого нет в одной из локалей).

- [ ] **Step 6: Screenshot @380×844 and look at it**

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 380, height: 844 } })).newPage();
  await p.goto('http://localhost:3000/?v=s5a1', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => StudioImport.open());
  await p.waitForTimeout(600);
  await p.screenshot({ path: '.tmp/s5a-import-380.png', fullPage: false });
  await b.close();
})();
"
```

Открыть `.tmp/s5a-import-380.png` и убедиться: кнопки не растянуты на всю ширину, поле вставки
не ломает модал, подпись читается.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/js/studio-import.js public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js
git commit -m "feat(ingest): W2-S5a T8 — captions intake UI, URL classifier, YT player stage, i18n x3"
```

---

### Task 9: провенанс субтитров

**Files:**
- Modify: `public/index.html:31964-31986` (`KIND` / `METHOD` / выбор метки)
- Modify: `public/i18n/locales/{ru,en,he}.js`

**Interfaces:**
- Consumes: `source.captions` (Task 8), `v3MediaPassport` (Task 7).
- Produces: строка происхождения для `kind:"captions"` с честным уровнем свидетельства.

- [ ] **Step 1: Extend the KIND / METHOD maps**

В `v3TextMetaRenderProvenance` в `KIND` (строка 31969) добавить:

```js
    captions: { icon: "💬", label: T("textMeta.provKindCaptions", "Субтитры") },
```

в `METHOD` (строка 31977) добавить:

```js
    "captions-file":  T("textMeta.provMethodCaptionsFile", "субтитры из файла (без ИИ)"),
    "captions-panel": T("textMeta.provMethodCaptionsPanel", "вставленная расшифровка YouTube (без ИИ)"),
```

- [ ] **Step 2: Add the honest evidence line**

Сразу после блока видео-метки (после строки 31986) вставить:

```js
  // R9: тип дорожки — СВИДЕТЕЛЬСТВО, а не факт. Заявление пользователя свидетельством не является;
  // панель YouTube предлагает и машинно-переведённые дорожки, отличить их по тексту нельзя.
  const capMeta = source.captions && source.captions.captions;
  if (source.kind === "captions" && capMeta) {
    const EV = {
      "vtt-rolling": T("textMeta.provCaptionsAuto", "похоже на авто-субтитры — качество не гарантировано"),
      "vtt-plain":   T("textMeta.provCaptionsFile", "субтитры из файла — источник не проверен"),
      "none":        T("textMeta.provCaptionsUnknown", "расшифровка YouTube — тип дорожки не проверен"),
    };
    rows.push('<div>🏷 ' + esc(EV[capMeta.kindEvidence] || EV.none) + '</div>');
    if (capMeta.droppedHeadings > 0) {
      rows.push('<div>' + esc(T("textMeta.provCaptionsHeadings", "Отброшено названий глав")) + ': ' +
                esc(String(capMeta.droppedHeadings)) + '</div>');
    }
    if (source.captions.video && source.captions.video.url) {
      rows.push('<div>▶ ' + esc(T("textMeta.provCaptionsVideo", "Ролик")) + ': ' + esc(source.captions.video.url) + '</div>');
    }
  }
```

⚠ `source.captions.video.url` приходит от пользователя → только `esc()`, как и `originalName`
в аудио-подпанели (комментарий `index.html:32011-32015`).

- [ ] **Step 3: Add the new keys to ALL THREE locales**

`textMeta.provKindCaptions`, `provMethodCaptionsFile`, `provMethodCaptionsPanel`,
`provCaptionsAuto`, `provCaptionsFile`, `provCaptionsUnknown`, `provCaptionsHeadings`,
`provCaptionsVideo` — в `ru.js`, `en.js`, `he.js`.

Run: `npm run smoke:i18n`
Expected: PASS

- [ ] **Step 4: Verify visually**

Импортировать субтитры-фикстуру, сохранить текст, открыть «Метаданные текста» → блок
«Происхождение» показывает: 💬 Субтитры, способ, строку свидетельства, ссылку на ролик.
Скриншот @380×844, посмотреть.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js
git commit -m "feat(studio): W2-S5a T9 — captions provenance with honest evidence level (R9)"
```

---

### Task 10: живой смоук плеера (Chrome + Edge)

**Files:**
- Create: `scripts/premium/yt-player-live-smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: развёрнутое приложение (по умолчанию `http://localhost:3000`, `--url` для прода).
- Produces: `smoke:yt-player` — падает, если плеер не стартует или изоляция ломается.

- [ ] **Step 1: Write the live smoke**

```js
// scripts/premium/yt-player-live-smoke.mjs
// W2-S5a: живая проверка, что <iframe credentialless> действительно даёт рабочий YouTube-плеер
// на странице с COEP: require-corp, и что cross-origin isolation при этом НЕ ломается.
// Обычный iframe там не стартует (разведка 2026-07-27) — контроль включён в проверку.
import { chromium } from "playwright";

const url = (process.argv.find((a) => a.startsWith("--url=")) || "--url=http://localhost:3000").slice(6);
const VIDEO = "dQw4w9WgXcQ";

const PROBE = (credentialless) => `(() => new Promise(res => {
  const out = { isolatedBefore: window.crossOriginIsolated, credentialless: ${credentialless} };
  const ifr = document.createElement('iframe');
  ${credentialless ? "ifr.setAttribute('credentialless','');" : ""}
  ifr.width = 320; ifr.height = 180; ifr.allow = 'autoplay';
  ifr.src = 'https://www.youtube.com/embed/${VIDEO}?enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  document.body.appendChild(ifr);
  const boot = () => new window.YT.Player(ifr, { events: {
    onReady: e => { const p = e.target; try { p.mute(); p.playVideo(); } catch (_) {}
      setTimeout(() => { let t1 = 0, t2 = 0, d = 0;
        try { d = p.getDuration(); t1 = p.getCurrentTime(); } catch (_) {}
        setTimeout(() => { try { t2 = p.getCurrentTime(); } catch (_) {}
          out.ready = true; out.duration = d; out.clockAdvances = t2 > t1;
          out.isolatedAfter = window.crossOriginIsolated; res(out); }, 2200); }, 2200); },
    onError: e => { out.ready = false; out.ytError = e.data; res(out); } } });
  if (window.YT && window.YT.Player) boot();
  else { window.onYouTubeIframeAPIReady = boot;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { out.apiErr = true; res(out); }; document.head.appendChild(s); }
  setTimeout(() => { out.timeout = true; out.isolatedAfter = window.crossOriginIsolated; res(out); }, 25000);
}))()`;

let failed = 0;
for (const channel of [undefined, "chrome", "msedge"]) {
  const label = channel || "bundled-chromium";
  let browser;
  try { browser = await chromium.launch(channel ? { channel } : {}); }
  catch (e) { console.log(`skip ${label}: not installed`); continue; }
  const page = await (await browser.newContext()).newPage();
  const resp = await page.goto(`${url}/?v=s5asmoke`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const coep = resp.headers()["cross-origin-embedder-policy"];
  const good = await page.evaluate(PROBE(true));
  const control = await page.evaluate(PROBE(false));
  const problems = [];
  if (coep !== "require-corp") problems.push(`COEP is "${coep}" — the isolation this slice depends on changed`);
  if (!good.ready) problems.push(`credentialless player not ready (${good.ytError ?? (good.timeout ? "timeout" : "?")})`);
  if (!good.clockAdvances) problems.push("credentialless player clock does not advance");
  if (good.isolatedAfter !== true) problems.push("crossOriginIsolated lost after embedding");
  if (control.ready) problems.push("control: plain iframe now works — re-check whether credentialless is still needed");
  console.log(`${problems.length ? "FAIL" : "ok  "} ${label} v${browser.version()}: ready=${good.ready} clock=${good.clockAdvances} isolated=${good.isolatedAfter} control.ready=${control.ready}`);
  problems.forEach((p) => console.log(`      - ${p}`));
  failed += problems.length ? 1 : 0;
  await browser.close();
}
if (failed) { console.error(`\nyt-player live smoke FAILED (${failed} browser(s))`); process.exit(1); }
console.log("\nyt-player live smoke OK");
```

Контроль «обычный iframe не работает» — намеренно: если YouTube когда-нибудь начнёт работать без
`credentialless`, смоук об этом скажет, а не промолчит.

- [ ] **Step 2: Register the npm script**

```json
    "smoke:yt-player": "node scripts/premium/yt-player-live-smoke.mjs",
```

- [ ] **Step 3: Run against a local server**

Run: `npm start &` затем `npm run smoke:yt-player`
Expected: `yt-player live smoke OK` для установленных каналов.

⚠ Если локальный сервер отдаёт `index.html` БЕЗ `COEP: require-corp` — смоук честно упадёт на
первой проверке. Тогда прогнать против прода: `npm run smoke:yt-player -- --url=https://linguistpro.kolosei.com`.

- [ ] **Step 4: Commit**

```bash
git add scripts/premium/yt-player-live-smoke.mjs package.json
git commit -m "test(ingest): W2-S5a T10 — live YT player smoke (credentialless + isolation, Chrome/Edge)"
```

---

### Task 11: релиз — SW, полный прогон гейтов, единственный пуш, прод-верификация

**Files:**
- Modify: `public/sw.js:32` (`CACHE_VERSION`), `public/sw.js:121-129` (`PRECACHE_URLS`)

- [ ] **Step 1: Precache the new modules**

В `public/sw.js` в блок W2-S4 (строки 121-129) добавить:

```js
  // Studio Ingest W2-S5a — captions ingest (parser core + YouTube player adapter).
  "/js/captions-parse.js",
  "/js/studio-yt-player.js",
```

- [ ] **Step 2: Bump CACHE_VERSION**

`public/sw.js:32`: `const CACHE_VERSION = "v3.11.249";` → `"v3.11.250"`.
Проверить, что версия в остальных местах, где она встречается, согласована:

Run: `grep -rn "3\.11\.249" public/ server.js package.json | head`
Expected: не осталось расхождений (bump там, где версия обязана совпадать).

- [ ] **Step 3: Run the FULL gate set**

```bash
node --test && \
npm run smoke:captions-parse && \
npm run smoke:media-karaoke && \
npm run smoke:ingest && \
npm run smoke:reader-parity && \
npm run smoke:studio-karaoke && \
npm run smoke:i18n && \
npm run test:api-smoke && \
npm run smoke:yt-player
```

Expected: всё зелёное. Любой красный — СТОП, чинить до пуша.

- [ ] **Step 4: Whole-branch review BEFORE the push**

Прогнать ревью всей ветки слайса (`git diff` от коммита-базы до HEAD) — как в S4, где финальное
ревью дало SHIP-WITH-FIXES. Проверять прежде всего:
инварианты §9 дизайна; отсутствие серверных правок (`git diff --stat server.js ingest/` обязан быть
пустым); полноту gate-consumers-sweep из Task 7; наличие всех новых ключей в трёх локалях;
отсутствие утечки пословных таймингов; корректность `esc()` на пользовательских строках.
Найденные дефекты чинить отдельными коммитами до пуша.

- [ ] **Step 5: Single push**

```bash
git add public/sw.js && git commit -m "chore(pwa): W2-S5a release — precache captions modules, SW v3.11.250"
git push origin main
```

Единственный пуш серии → один деплой Coolify.

- [ ] **Step 6: Prod-verify**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://linguistpro.kolosei.com/healthz
curl -sS -o /dev/null -w "%{http_code}\n" https://linguistpro.kolosei.com/js/captions-parse.js
curl -sS -o /dev/null -w "%{http_code}\n" https://linguistpro.kolosei.com/js/studio-yt-player.js
curl -sSI https://linguistpro.kolosei.com/ | grep -i "cross-origin-embedder-policy"
npm run smoke:yt-player -- --url=https://linguistpro.kolosei.com
```

Expected: `200`, `200`, `200`, `require-corp`, живой смоук зелёный.
Если деплой завис на старом коммите — отменить в UI Coolify и перезапустить; при нехватке места на
диске прода сначала почистить builder-кэш (повторяющаяся ловушка).

---

### Task 12: owner-приёмка на реальном контенте + закрытие докой

- [ ] **Step 1: Owner runs three real cases on prod**

1. Ролик с **ручными** ивритскими субтитрами: вставить ссылку → плеер встроился → скачать
   субтитры файлом и загрузить → таблица → «▶ Оригинал» → бегущая подсветка совпадает с речью.
2. Ролик с **авто**-субтитрами: вставка расшифровки из панели → таблица → провенанс показывает
   «похоже на авто-субтитры» / «тип дорожки не проверен».
3. **Деградация:** тот же ролик на iPhone/Safari → плеера нет, таблица и таймкоды есть,
   объяснение показано, тупика нет.

- [ ] **Step 2: Fix each finding with its own test**

Каждый дефект приёмки — отдельный коммит: сначала падающий тест/гейт, потом починка.

- [ ] **Step 3: Close the docs**

Обновить:
- `docs/planning/STUDIO_INGEST_W2_S5A_CAPTIONS_KARAOKE_DESIGN_2026_07_27.md` — строку статуса
  на `SHIPPED v3.11.250 + OWNER-ACCEPTED <дата>` с фактами приёмки;
- `docs/planning/STUDIO_INGEST_MULTIMODAL_DECISION_PACKET_2026_07_25.md` §4 и §7 — S5a закрыт,
  зафиксировать NO-GO серверной добычи субтитров как решённый вопрос (чтобы не переоткрывали),
  и что S5A-EXT (расширение) отложено;
- память проекта `project_studio_ingest_multimodal`.

- [ ] **Step 4: Commit and push**

```bash
git add docs/planning/
git commit -m "docs(ingest): W2-S5a OWNER-ACCEPTED — captions → table + karaoke"
git push origin main
```

---

## Self-Review (выполнен при написании)

**Spec coverage.** §5.1 парсер → задачи 1-3; §4.3 планка оракула → задача 4; §5.2 адаптер плеера →
задача 5; §5.4 правка караоке → задача 6; §5.3 паспорт + §3 поток → задачи 7-8; §6 уровни
свидетельства → задача 9; §7 UI-поток → задача 8; §8 таблица ошибок → `ERROR_KEY` в задаче 8 +
ветки в 1-3; §9 инварианты → Global Constraints + ревью в задаче 11; §10 гейты → задачи 4, 10, 11;
§12 риски → контроль «обычный iframe» в задаче 10, capability-ветки в задаче 8.

**Типы сквозь задачи.** `CaptionsParse.parse` (T1) → `acceptCaptions` (T8); слот `captions`
паспорта задан в T7 (аксессор) и заполняется ровно этими именами в T8; `adapter` (T5) потребляется
`ensureRun` (T6) и `v3MediaPlayOriginal` (T8) — везде утиный тип `currentTime/play/pause/paused/
addEventListener`; `v3MediaPassport` (T7) — единственный аксессор, консьюмеры перечислены.

**Сознательные ослабления.** (1) Браузерная часть правки караоке (T6) не покрыта Node-тестом —
в Node DOM-ветка модуля не грузится; покрывается живым смоуком T10 и приёмкой T12.
(2) Chrome Android проверен эмуляцией, не реальным устройством — вынесено в приёмку T12.
(3) `H:MM:SS` во вставке покрыт синтетическим тестом, реальной фикстуры нет (оба ролика короче
часа) — отмечено в README фикстур.
