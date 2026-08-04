# Room Media Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Премиум медиа-плеер (караоке-подсветка + tap-seek + per-row replay оригинала) для медиа-импортированных учебных материалов в Читальном зале, через общий модуль `media-host.js` (подход A спеки `docs/superpowers/specs/2026-08-04-room-media-player-design.md`).

**Architecture:** Извлечь паспорт-пайплайн и DOM-хелперы плеера из inline-кода `index.html:24103-24736` в общий `public/js/media-host.js` (Студия становится тонкими обёртками); ядро `studio-media-karaoke.js` получает хук `stopOtherAudio`; Зал получает `#roomMediaBar` + ~170 строк хоста в `library-ui.js`. Билдер таблицы (`reader-core.js` / `renderTable`) НЕ трогается — parity-гейт зелёный by construction.

**Tech Stack:** vanilla JS (window-глобалы + dual-export для Node-тестов, как `studio-media-karaoke.js`), `node --test`, Playwright-смоуки по образцу `scripts/premium/room-smoke.js`.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-04-room-media-player-design.md` — все ловушки §6 обязательны.
- НЕ менять: `public/js/reader-core.js` (весь), `renderTable` в index.html, `buildBilingualTableHtml`.
- Reference-equality контракт: `audio.timing.entries` — один и тот же массив между вызовами; никаких `.map()/.slice()`.
- R11: `blind`-записи, `timingDropReason`, fileMissing — честные состояния, не обходить.
- Существующие тесты `tests/mediaKaraoke.test.js` (кроме добавляемых) и `tests/asrTranscript.test.js` должны пройти БЕЗ правок существующих ассертов.
- YouTube: per-row replay НЕ подключать (ловушка `studio-media-karaoke.js:177-192`).
- Каждая новая i18n-строка → все три локали `public/i18n/locales/{ru,en,he}.js`.
- Коммитить только файлы этой фичи (в рабочей копии есть чужие незакоммиченные правки ai-local/* — не трогать).
- Версии:財 финальном таске bump `CACHE_VERSION` (`public/sw.js:32`, сейчас v3.11.304) и `window.APP_VERSION` (`public/index.html:13082`, сейчас 3.11.304) → 3.11.305.

---

### Task 1: `public/js/media-host.js` — общий паспорт-пайплайн (pure, Node-tested)

**Files:**
- Create: `public/js/media-host.js`
- Test: `tests/mediaHost.test.js`

**Interfaces (Produces):** `window.MediaHost` + `module.exports` (dual-export по образцу `media-store.js`):
- `passport(holder)` → `holder.audio || holder.captions || null`
- `DERIVED_TIMING_DROPS`, `isDerivedTimingDrop(reason)`
- `clockBlindRanges(audio)` → `[{fromSec,toSec}]`
- `passportFromTextRow(textRow)` → passport|null — `table_model_meta_json` (+camelCase) → фолбэк `source_meta_json` ТОЛЬКО если в ней есть паспорт
- `alignSavedTimingOffline(audio, rows, deps)` — перенос `v3AlignSavedTimingOffline` (index.html:24368-24425) c `deps={AT,appVersion}` (дефолты `window.AsrTranscript`/`window.APP_VERSION`); idempotency-guard сохранён дословно
- `restoreForRows(audio, rows, deps)` — K1-карантин (`AT.timingLooksDegenerate`, дословно из `v3RestoreMediaFromMeta` 24436-24445: timing=null + `SEG_MAPPING_LOST`/`DEGENERATE_1_TO_1`) + вызов `alignSavedTimingOffline`
- Браузерная часть (после `if (typeof window === "undefined") { module.exports = {pure}; return; }` — как в karaoke-ядре) — добавляется в Task 3: `createBlobResolver`, `createStage`, `augmentRows`. В этом таске файл содержит только pure-часть.

**Steps:**

- [ ] **1.1 Написать падающий тест** `tests/mediaHost.test.js` (харнесс — `node:test` + `assert/strict`, образец `tests/mediaKaraoke.test.js`):

```js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const MH = require("../public/js/media-host.js");
const AT = require("../public/js/asr-transcript.js");

const deps = { AT, appVersion: "test" };

test("passport: audio | captions | null", () => {
  assert.equal(MH.passport({ audio: { v: 1 } }).v, 1);
  assert.equal(MH.passport({ captions: { v: 2 } }).v, 2);
  assert.equal(MH.passport({}), null);
  assert.equal(MH.passport(null), null);
});

test("isDerivedTimingDrop", () => {
  assert.equal(MH.isDerivedTimingDrop("NO_SEGMENT_MAPPING"), true);
  assert.equal(MH.isDerivedTimingDrop("SEG_MAPPING_LOST"), true);
  assert.equal(MH.isDerivedTimingDrop("PREVIEW_EDITED"), false);
});

test("clockBlindRanges: filters invalid", () => {
  const a = { asr: { clockCompressedRanges: [{ fromSec: 1, toSec: 5 }, { fromSec: 5, toSec: 5 }, null] } };
  assert.deepEqual(MH.clockBlindRanges(a), [{ fromSec: 1, toSec: 5 }]);
  assert.deepEqual(MH.clockBlindRanges({}), []);
});

test("passportFromTextRow: table_model wins, source_meta only WITH passport", () => {
  const p = { v: 1, media: { opfsPath: "media/x.mp3" } };
  assert.equal(MH.passportFromTextRow({ table_model_meta_json: JSON.stringify({ source: { audio: p } }) }).media.opfsPath, "media/x.mp3");
  assert.equal(MH.passportFromTextRow({ source_meta_json: JSON.stringify({ source: { audio: p } }) }).media.opfsPath, "media/x.mp3");
  assert.equal(MH.passportFromTextRow({ source_meta_json: JSON.stringify({ corpus: { byehuda_id: "1" } }) }), null);
  assert.equal(MH.passportFromTextRow({ table_model_meta_json: "{broken", source_meta_json: "{broken" }), null);
  assert.equal(MH.passportFromTextRow(null), null);
});

// 2 строки ↔ 2 сегмента, тексты пословно совпадают → align сходится, тайминг строится
function freshAudio() {
  return {
    v: 1,
    segments: [ { i: 0, start: 0, end: 10, text: "שלום עולם" }, { i: 1, start: 10, end: 20, text: "מה קורה היום" } ],
    timing: null,
  };
}
const rows2 = [ { he: "שלום עולם" }, { he: "מה קורה היום" } ];

test("restoreForRows: offline align builds timing + provenance", () => {
  const a = freshAudio();
  MH.restoreForRows(a, rows2, deps);
  assert.ok(a.timing && a.timing.entries.length === 2);
  assert.equal(a.timingSource, "aligned-offline");
  assert.equal(a.timingAlign.ok, true);
  assert.equal(a.timingDropReason, null);
});

test("restoreForRows: idempotent — entries reference preserved on 2nd call", () => {
  const a = freshAudio();
  MH.restoreForRows(a, rows2, deps);
  const ref = a.timing.entries;
  MH.restoreForRows(a, rows2, deps);
  assert.equal(a.timing.entries, ref);   // строгое ссылочное равенство (контракт karaoke resume)
});

test("restoreForRows: degenerate saved timing is quarantined (K1)", () => {
  // rowCount(5) > segments(3); все записи o === i сегмента → отпечаток DEGENERATE
  const a = {
    v: 1,
    segments: [ { i: 0, start: 0, text: "אחת" }, { i: 1, start: 10, text: "שתיים" }, { i: 2, start: 20, text: "שלוש" } ],
    timing: { v: 1, unit: "row", entries: [ { o: 0, t: 0 }, { o: 1, t: 10 }, { o: 2, t: 20 } ] },
  };
  const rows5 = [ { he: "x" }, { he: "y" }, { he: "z" }, { he: "w" }, { he: "v" } ];   // align не сойдётся
  MH.restoreForRows(a, rows5, deps);
  assert.equal(a.timing, null);
  assert.equal(a.timingDropReason, "SEG_MAPPING_LOST");
  assert.equal(a.timingDropDetail, "DEGENERATE_1_TO_1");   // диагноз K1 первичнее ALIGN_*
  assert.equal(a.timingAlign.ok, false);                   // вердикт выравнивания записан рядом (R9)
});

test("alignSavedTimingOffline: asserted drop reason → untouched", () => {
  const a = freshAudio();
  a.timingDropReason = "PREVIEW_EDITED";
  MH.alignSavedTimingOffline(a, rows2, deps);
  assert.equal(a.timing, null);
  assert.equal(a.timingDropReason, "PREVIEW_EDITED");
});
```

- [ ] **1.2 Прогнать — убедиться, что падает:** `node --test tests/mediaHost.test.js` → FAIL (Cannot find module media-host.js)
- [ ] **1.3 Реализовать** `public/js/media-host.js`: IIFE, pure-функции — **дословный перенос** из index.html (24103-24106, 24120-24121, 24165-24170, 24368-24425, карантин из 24431-24445, фолбэк-логика 24463-24471 в форме `passportFromTextRow`), с заменой `window.AsrTranscript`→`deps.AT`, `window.APP_VERSION`→`deps.appVersion`, `v3MediaPassport`→`passport`, `v3IsDerivedTimingDrop`→`isDerivedTimingDrop`, `v3ClockBlindRanges`→`clockBlindRanges`. Комментарии-обоснования (K1/K3/R9/R11) ПЕРЕНОСЯТСЯ с кодом — они и есть документация инвариантов. `passportFromTextRow`:

```js
function passportFromTextRow(textRow) {
  if (!textRow || typeof textRow !== "object") return null;
  for (var key of ["table_model_meta_json", "tableModelMetaJson", "source_meta_json", "sourceMetaJson"]) {
    var raw = textRow[key];
    if (!raw) continue;
    try {
      var p = passport(JSON.parse(String(raw)).source);
      if (p) return p;
    } catch (_) {}
  }
  return null;
}
```
`restoreForRows(audio, rows, deps)`: guard `if (!audio) return;` → K1-карантин (только при `audio.timing` и наличии `AT.timingLooksDegenerate`) → `alignSavedTimingOffline(audio, rows, deps)` в try/catch.
- [ ] **1.4 Прогнать:** `node --test tests/mediaHost.test.js` → все PASS. Также `node --test tests/asrTranscript.test.js` (не сломан).
- [ ] **1.5 Commit:** `feat(media-host): shared media passport pipeline (extracted from Studio inline)`

---

### Task 2: `studio-media-karaoke.js` — хук `stopOtherAudio`

**Files:**
- Modify: `public/js/studio-media-karaoke.js:107-118` (ensureRun), `:149-168` (bind/start), `:193-206` (playSegment)
- Test: `tests/mediaKaraoke.test.js` (добавить, существующие ассерты не менять)

**Interfaces (Produces):** `bind/start({..., stopOtherAudio?})`; при отсутствии — прежний фолбэк `window.v3StopRowAudio` (Студия не меняется поведенчески).

- [ ] **2.1 Тест** (в браузер-шим секции `tests/mediaKaraoke.test.js` — использовать её существующие хелперы загрузки модуля с fake window/document, `makeFakeAudioEl`):

```js
test("stopOtherAudio hook: used when provided, window fallback otherwise", () => {
  const { api, win } = loadBrowserModule();   // существующий хелпер шим-секции (имя сверить по файлу)
  let hookCalls = 0, winCalls = 0;
  win.v3StopRowAudio = () => { winCalls++; };
  const el = makeFakeAudioEl();
  api.bind({ media: el, entries: [{ o: 0, t: 0 }], rowCount: 1, stopOtherAudio: () => { hookCalls++; } });
  assert.equal(hookCalls, 1);
  assert.equal(winCalls, 0);
  api.stop();
  api.bind({ media: el, entries: [{ o: 0, t: 0 }], rowCount: 1 });
  assert.equal(winCalls, 1);   // без хука — прежний фолбэк
});
```
(Если хелпер шим-секции называется иначе — использовать фактический; суть ассертов не менять.)
- [ ] **2.2 Прогнать** `node --test tests/mediaKaraoke.test.js` → новый тест FAIL.
- [ ] **2.3 Реализация:** `ensureRun(source, entries, rowCount, onRangeChange, persistent, stopOtherAudio)`; строка 109 →

```js
var stopHook = stopOtherAudio || window.v3StopRowAudio;
if (typeof stopHook === "function") { try { stopHook(); } catch (_) {} }
```
`run.stopOtherAudio = stopOtherAudio || null;` в объекте run (118). `bind`: в resume-ветке (153-156) добавить `cur.stopOtherAudio = opts.stopOtherAudio || null;`; в fresh-ветке передать `opts.stopOtherAudio` шестым аргументом. `start` (163): аналогично передать. `playSegment` (197) →

```js
var stopHook = (cur && cur.stopOtherAudio) || window.v3StopRowAudio;
if (typeof stopHook === "function") { try { stopHook(); } catch (_) {} }
```
- [ ] **2.4 Прогнать:** `node --test tests/mediaKaraoke.test.js` и `npm run smoke:media-karaoke` → PASS.
- [ ] **2.5 Commit:** `feat(media-karaoke): stopOtherAudio hook (surface-agnostic mutual exclusion)`

---

### Task 3: DOM-хелперы в media-host.js + Студия переходит на общий модуль

**Files:**
- Modify: `public/js/media-host.js` (браузерная секция)
- Modify: `public/index.html` — участки 24103-24121, 24165-24170, 24368-24471, 24479-24500, 24534-24560, 24656-24714; включение `<script src="/js/media-host.js">` рядом с включением `studio-media-karaoke.js` (grep `studio-media-karaoke.js` в index.html, вставить строкой выше); замены `v3MediaBlobCache = null` (grep все вхождения: ~24479, 24492, 24498, 24567, 14387 и твин ~265xx)
- Modify: `public/sw.js` — precache `"/js/media-host.js"` (рядом со строкой 144 `"/js/media-store.js"`)

**Interfaces (Produces, браузерная секция MediaHost):**
- `createBlobResolver({getSessionBlob})` → `{resolve(audio)→Promise<Blob|null>, clear()}` — перенос `v3MediaResolveBlob`+`v3MediaCompat`+`v3MediaIdentity` (24482-24500); кэш по identity — состояние инстанса; `sessionOnly` → `getSessionBlob()`
- `createStage({stageId, playerId, t, ariaKey, getRowCount, onRangeChange, stopOtherAudio})` → `{ensure(audio, blob)→playerEl|null, destroy(), getPlayer()}` — перенос `v3MediaEnsureLocalStage`/`v3MediaDestroyLocalStage` (24522-24560): audio↔video своп по MIME (id сохраняется), objectURL-менеджмент (state инстанса вместо `v3MediaStageUrl/v3MediaStageIdentity`), `StudioMediaKaraoke.bind({media, entries: audio.timing ? audio.timing.entries : null, rowCount: getRowCount(), onRangeChange, stopOtherAudio})`, `player.onseeked → syncCurrent()`; guard'ы `getAudioEl() === player → stop()` — дословно
- `augmentRows({table, audio, resolveBlob, t, onReplay})` — перенос `v3MediaAugmentRows`+`v3MediaRenderRowReplay` (24656-24714): снятие старых кнопок, гейт `audio && audio.timing && audio.media`, async-резолв блоба (с проверкой, что audio не сменился: сравнение через замыкание), инъекция в последнюю ячейку, дедуп, exact-map suppression (24692-24695), клик → `e.stopPropagation()` + `await resolveBlob(audio)` + `if (blob) onReplay(idx, audio, blob)`

**Steps:**

- [ ] **3.1** Дописать браузерную секцию media-host.js (перенос дословный, комментарии с кодом).
- [ ] **3.2** index.html: функции → тонкие обёртки (поведение при отсутствии `window.MediaHost` = фича молча выключена,媒 бар скрыт — тот же класс деградации, что guard `window.TableChunks`):

```js
function v3MediaPassport(holder) { return window.MediaHost ? MediaHost.passport(holder) : null; }
function v3IsDerivedTimingDrop(reason) { return !!(window.MediaHost && MediaHost.isDerivedTimingDrop(reason)); }
function v3ClockBlindRanges(audio) { return window.MediaHost ? MediaHost.clockBlindRanges(audio) : []; }
function v3AlignSavedTimingOffline(audio, rows) { if (window.MediaHost) MediaHost.alignSavedTimingOffline(audio, rows); }
```
`V3_DERIVED_TIMING_DROPS` удалить ПОСЛЕ grep-проверки консьюмеров (gate-consumers-sweep: `grep -n "V3_DERIVED_TIMING_DROPS" public/index.html` — если есть другие использования, оставить как `MediaHost.DERIVED_TIMING_DROPS`-делегат). `v3AttachAudioTiming` НЕ переносится (сессия импорта — чисто студийная), продолжает работать через обёртки. В `v3RestoreMediaFromMeta` тело карантина+align (24436-24448) → `if (audio && window.MediaHost) { try { MediaHost.restoreForRows(audio, rows); } catch (_) {} }`; остальное (window.v3ActiveMediaAudio, karaoke stop, bar refresh) без изменений.
- [ ] **3.3** index.html: ленивые инстансы + обёртки resolve/stage/augment (`v3MediaCompat`/`v3MediaIdentity`/`v3MediaBlobCache`/`v3MediaStageUrl`/`v3MediaStageIdentity` удалить после grep их вхождений):

```js
let v3MediaResolverInst = null, v3MediaStageInst = null;
function v3MediaResolver() {
  if (!v3MediaResolverInst && window.MediaHost) v3MediaResolverInst = MediaHost.createBlobResolver({ getSessionBlob: () => window.v3SessionMediaBlob || null });
  return v3MediaResolverInst;
}
async function v3MediaResolveBlob(audio) { const r = v3MediaResolver(); return r ? r.resolve(audio) : null; }
function v3MediaStage() {
  if (!v3MediaStageInst && window.MediaHost) v3MediaStageInst = MediaHost.createStage({
    stageId: "v3MediaLocalStage", playerId: "v3MediaLocalPlayer", t: t, ariaKey: "studio.media.sourcePlayer",
    getRowCount: () => (Array.isArray(currentTableData) ? currentTableData.length : 0),
    onRangeChange: v3MediaFollowTableRange,
  });
  return v3MediaStageInst;
}
function v3MediaEnsureLocalStage(audio, blob) { const st = v3MediaStage(); return st ? st.ensure(audio, blob) : null; }
function v3MediaDestroyLocalStage() { if (v3MediaStageInst) v3MediaStageInst.destroy(); }
function v3MediaAugmentRows() {
  const table = document.getElementById("proTable");
  if (!table || !window.MediaHost) return;
  MediaHost.augmentRows({
    table, audio: window.v3ActiveMediaAudio, resolveBlob: v3MediaResolveBlob, t: t,
    onReplay: async (idx, audio, blob) => {
      const player = v3MediaEnsureLocalStage(audio, blob);
      if (player) StudioMediaKaraoke.playSegment(idx);
      else if (!StudioMediaKaraoke.getAudioEl()) { await StudioMediaKaraoke.start({ blob, entries: audio.timing.entries, rowCount: Array.isArray(currentTableData) ? currentTableData.length : 0, onRangeChange: v3MediaFollowTableRange }); StudioMediaKaraoke.playSegment(idx); }
    },
  });
}
```
Все `v3MediaBlobCache = null` → `if (v3MediaResolverInst) v3MediaResolverInst.clear();`. MutationObserver (24721-24736) и `v3MediaBarRefresh`/`v3MediaPlayOriginal` остаются (используют обёртки). ВНИМАНИЕ: в `v3MediaPlayOriginal` (24603) blob-ветка вызывает `StudioMediaKaraoke.start({media: player || blob, ...})` — оставить, entries по-прежнему `audio.timing.entries` (ссылка).
- [ ] **3.4** sw.js precache + script-включение в index.html (ДО inline-скрипта с обёртками — той же группой, где грузится studio-media-karaoke.js).
- [ ] **3.5 Прогнать:** `node --test tests/mediaHost.test.js tests/mediaKaraoke.test.js tests/asrTranscript.test.js`, `npm run smoke:media-karaoke`, `npm run smoke:reader-parity`, `npm run smoke:studio-chunks`, `npm run smoke:text-card`, `npm run smoke:media-package` → все PASS.
- [ ] **3.6 Commit:** `refactor(studio): media passport/stage/augment delegate to shared MediaHost`

---

### Task 4: Зал — разметка, CSS, скрипты, локали

**Files:**
- Modify: `public/library.html` — разметка после `#readerTip` (~2063); CSS в style-блоке (рядом с `.rm-row-jump` ~999); script-включения перед `library-ui.js` (~2333); bump локалей `?v=66`→`?v=67` (строки 2287-2289)
- Modify: `public/i18n/locales/{ru,en,he}.js` — ключ `room.media.openInStudio`
- Modify: `public/sw.js` — если локали precache-ятся с `?v=` — синхронизировать (проверить grep `locales` в sw.js)

**Steps:**

- [ ] **4.1** Разметка (между `#readerTip` и `#roomReaderTable`):

```html
<!-- Room media player (spec 2026-08-04): оригинал аудио/видео медиа-импортированных материалов.
     Post-render chrome — parity-locked билдер не тронут. Управление: library-ui.js (roomMedia*). -->
<div id="roomMediaBar" hidden>
  <button type="button" id="roomMediaPlayBtn">▶ <span data-i18n="studio.media.playOriginal">Оригинал</span></button>
  <span id="roomMediaBarNote" class="room-media-note"></span>
  <a id="roomMediaStudioLink" class="room-media-studio-link" hidden target="_blank" rel="noopener" data-i18n="room.media.openInStudio">Открыть в Студии ↗</a>
  <div id="roomMediaLocalStage" class="room-media-local-stage" hidden>
    <audio id="roomMediaLocalPlayer" controls preload="metadata" data-i18n-aria-label="studio.media.sourcePlayer" aria-label="Исходное аудио / видео"></audio>
  </div>
  <div id="roomMediaYtMount" hidden></div>
</div>
```
- [ ] **4.2** CSS (НЕ sticky — sticky конфликтует по stacking с уже-sticky `.reader-bar` top:0; управление вне зоны видимости бара обеспечивают per-row ▶︎ и tap-seek):

```css
/* Room media player (spec 2026-08-04). [hidden]-guard'ы — ловушка author-display. */
#roomMediaBar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 12px; }
#roomMediaBar[hidden] { display: none; }
#roomMediaBar button { width: auto; }
.room-media-note { font-size: 12px; color: var(--text-secondary); }
.room-media-studio-link { font-size: 12px; }
.room-media-local-stage { flex: 1 0 100%; border: 1px solid var(--border-soft); border-radius: 12px; padding: 8px; background: var(--bg-muted); }
.room-media-local-stage[hidden] { display: none; }
.room-media-local-stage audio, .room-media-local-stage video { display: block; width: 100%; max-height: clamp(120px, 26vh, 280px); background: #0d1716; border-radius: 8px; }
#roomMediaYtMount { margin: 0 12px 6px; }
#roomMediaYtMount[hidden] { display: none; }
.smk-row-replay { width: auto; padding: 0 6px; margin-inline-start: 4px; font-size: 12px; }
/* Активный сегмент медиа-караоке: ниже playing/error, выше jump (порядок приоритета Студии). */
#roomReaderTable tr.smk-row-active:not(.row-playing):not(.row-error) td,
#roomReaderTable tr.smk-row-active:not(.row-playing):not(.row-error) td.rtl { background: rgba(255, 193, 7, 0.28) !important; }
```
Существующий селектор `.rm-row-jump` (999-1004, ОБЕ строки правила + td:first-child) дополнить `:not(.smk-row-active)`.
- [ ] **4.3** Script-включения перед `<script type="module" src="/js/library-ui.js">`:

```html
<!-- Room media player (spec 2026-08-04): общий пайплайн + караоке-ядро + OPFS-store + YT-адаптер. -->
<script src="/js/media-store.js"></script>
<script src="/js/asr-transcript.js"></script>
<script src="/js/studio-media-karaoke.js"></script>
<script src="/js/studio-yt-player.js"></script>
<script src="/js/media-host.js"></script>
```
- [ ] **4.4** Локали: в ru.js/en.js/he.js внутри объекта `room` добавить `media: { openInStudio: ... }` — ru: `"Открыть в Студии ↗"`, en: `"Open in Studio ↗"`, he: `"פתיחה בסטודיו ↗"`. Bump `?v=66`→`?v=67` в library.html (3 строки). `npm run smoke:i18n` — если Suite 10 потребует bump `?v=` в index.html + lock-файл (`tests/i18n.locale-version.lock.json`), выполнить по инструкции из его сообщения об ошибке.
- [ ] **4.5 Прогнать:** `npm run smoke:i18n` → PASS.
- [ ] **4.6 Commit:** `feat(room): media bar markup, css, module includes, i18n key`

---

### Task 5: Зал — хост-логика в `library-ui.js`

**Files:**
- Modify: `public/js/library-ui.js` — новая секция `roomMedia*` (после блока karaoke-хелперов, ~3581); интеграция: `openReader` (сброс ~5405, сетап после ~5460), `rerenderReader` (5206-5212), `closeReader` (~5547), `onKaraokeRowChange` (3542), `toggleReadAloud` (3570), `renderMyTextCard` (6476-6498)

**Interfaces (Consumes):** `MediaHost.passportFromTextRow/restoreForRows/createBlobResolver/createStage/augmentRows` (Task 1/3), `StudioMediaKaraoke.{bind,start,stop,playSegment,seekToRow,getAudioEl,isActive}` + `stopOtherAudio` (Task 2), `StudioYtPlayer.{capability,create,destroy}`, разметка Task 4, существующие `readerRows/readerAudio/readerTextId/karaokeUserScrolled/_karaokeLeftBand/_karaokeRowFollowable/stopKaraoke/recordProgress/deepLinkForText/tt/$`.

**Steps:**

- [ ] **5.1** Секция (код — целиком; YT-ветка зеркалит `v3MediaPlayOriginal` 24606-24651 с локальными переменными и re-entrancy-guard'ом; teardown YT — ловушка №9 спеки):

```js
// ── Room media player (spec 2026-08-04): оригинал аудио/видео для медиа-материалов ──────────
// Всё — post-render chrome над parity-locked таблицей. Данные: MediaHost (общий со Студией).
let roomMediaAudio = null;   // активный паспорт; timing.entries — ОДНА ссылка (контракт karaoke)
let roomMediaStage = null, roomMediaResolver = null;
let roomMediaYtAdapter = null, roomMediaYtVideoId = null, roomMediaYtCreating = null;
let _roomMediaWired = false;

function roomMediaStopOthers() {   // media → TTS направление взаимоисключения
  try { stopKaraoke(); } catch (_) {}
  try { if (readerAudio) readerAudio.stop(); } catch (_) {}
}
function roomMediaResolverInst() {
  // Session-blob (window.v3SessionMediaBlob) живёт только в документе Студии — Зал честно
  // видит такой паспорт как fileMissing (спека, ловушка №8).
  if (!roomMediaResolver && window.MediaHost) roomMediaResolver = MediaHost.createBlobResolver({ getSessionBlob: () => null });
  return roomMediaResolver;
}
function roomMediaStageInst() {
  if (!roomMediaStage && window.MediaHost) roomMediaStage = MediaHost.createStage({
    stageId: 'roomMediaLocalStage', playerId: 'roomMediaLocalPlayer',
    t: (k) => tt(k, k), ariaKey: 'studio.media.sourcePlayer',
    getRowCount: () => readerRows.length,
    onRangeChange: roomMediaFollowRange,
    stopOtherAudio: roomMediaStopOthers,
  });
  return roomMediaStage;
}
// Скролл-слежение — контракт TTS-караоке Зала: yield ручному скроллу + re-engage по central band.
function roomMediaFollowRange(range) {
  if (!range) return;
  recordProgress(range.rowStart);
  const mount = $('roomReaderTable');
  const tr = mount && mount.querySelector('tr[data-row-idx="' + String(range.rowStart) + '"]');
  if (!tr) return;
  if (karaokeUserScrolled) {
    if (!_karaokeRowFollowable(tr)) { _karaokeLeftBand = true; return; }
    if (!_karaokeLeftBand) return;
    karaokeUserScrolled = false; _karaokeLeftBand = false;
  }
  try { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
}
function roomMediaTeardown() {
  try { if (window.StudioMediaKaraoke) StudioMediaKaraoke.stop(); } catch (_) {}
  try { if (roomMediaStage) roomMediaStage.destroy(); } catch (_) {}
  // YT-адаптер привязан к КОНКРЕТНОМУ videoId (спека, ловушка №9) — уничтожать при смене текста.
  if (roomMediaYtAdapter && window.StudioYtPlayer) { try { window.StudioYtPlayer.destroy(roomMediaYtAdapter); } catch (_) {} }
  roomMediaYtAdapter = null; roomMediaYtVideoId = null; roomMediaYtCreating = null;
  roomMediaAudio = null;
  if (roomMediaResolver) { try { roomMediaResolver.clear(); } catch (_) {} }
  for (const id of ['roomMediaBar', 'roomMediaYtMount', 'roomMediaStudioLink']) { const n = $(id); if (n) n.hidden = true; }
}
function roomMediaSetup(textRow) {
  roomMediaTeardown();
  if (!window.MediaHost || !window.StudioMediaKaraoke) return;   // офлайн до precache → фичи честно нет
  const audio = MediaHost.passportFromTextRow(textRow);
  if (!audio) return;
  try { MediaHost.restoreForRows(audio, readerRows); } catch (_) {}   // K1-карантин + K3-довыравнивание
  roomMediaAudio = audio;
  const bar = $('roomMediaBar'); if (!bar) return;
  bar.hidden = false;
  roomMediaWireOnce();
  roomMediaRefresh();
}
function roomMediaRefresh() {
  const audio = roomMediaAudio; if (!audio) return;
  const note = $('roomMediaBarNote'), btn = $('roomMediaPlayBtn'), link = $('roomMediaStudioLink');
  if (note) note.textContent = audio.timing ? '' : tt('studio.media.noTiming', 'Караоке недоступно для этого импорта');
  const res = roomMediaResolverInst();
  (res ? res.resolve(audio) : Promise.resolve(null)).then((blob) => {
    if (roomMediaAudio !== audio) return;   // текст сменился, пока резолвили
    const hasVideo = !!(audio.video && audio.video.videoId && window.StudioYtPlayer && window.StudioYtPlayer.capability().supported);
    if (btn) { btn.hidden = !!blob; btn.disabled = !blob && !hasVideo; }
    if (!blob && !hasVideo) {
      if (note) note.textContent = tt('studio.media.fileMissing', 'Аудио-файл не найден в этом браузере');
      if (link && readerTextId != null) { link.href = deepLinkForText(readerTextId); link.hidden = false; }
    } else if (!blob && hasVideo && note) { note.textContent = tt('studio.media.viaYouTube', 'Воспроизведение через YouTube'); }
    if (blob) { const st = roomMediaStageInst(); if (st) st.ensure(audio, blob); }
    else if (roomMediaStage) roomMediaStage.destroy();
    roomMediaAugment();
  }).catch(() => {});
}
function roomMediaAugment() {
  const mount = $('roomReaderTable');
  const table = mount && mount.querySelector('#proTable');
  if (!table || !window.MediaHost) return;
  const res = roomMediaResolverInst();
  MediaHost.augmentRows({
    table, audio: roomMediaAudio,
    resolveBlob: (a) => (res ? res.resolve(a) : Promise.resolve(null)),
    t: (k) => tt(k, k),
    onReplay: async (rowIdx, audio, blob) => {
      const st = roomMediaStageInst(); if (!st) return;
      const player = st.ensure(audio, blob);
      if (player) StudioMediaKaraoke.playSegment(rowIdx);   // stopOtherAudio дергается ядром/стейджем
    },
  });
}
async function roomMediaPlayOriginal() {
  const audio = roomMediaAudio; if (!audio) return;
  const entries = audio.timing ? audio.timing.entries : null;   // ссылка, не копия (контракт resume)
  const res = roomMediaResolverInst();
  const blob = res ? await res.resolve(audio) : null;
  if (roomMediaAudio !== audio) return;
  if (blob) {
    const st = roomMediaStageInst(); if (!st) return;
    const player = st.ensure(audio, blob);
    await StudioMediaKaraoke.start({ media: player || blob, entries, rowCount: readerRows.length, onRangeChange: roomMediaFollowRange, stopOtherAudio: roomMediaStopOthers });
    return;
  }
  if (!audio.video || !audio.video.videoId) return;
  if (!window.StudioYtPlayer || !window.StudioYtPlayer.capability().supported) return;
  if (!roomMediaYtAdapter) {
    // Re-entrancy guard — зеркало CRITICAL 2 Студии (index.html v3MediaPlayOriginal).
    if (!roomMediaYtCreating) {
      const mountEl = $('roomMediaYtMount'); if (!mountEl) return;
      mountEl.hidden = false;
      const wantedVideoId = audio.video.videoId;
      roomMediaYtCreating = window.StudioYtPlayer.create(mountEl, wantedVideoId)
        .then((adapter) => {
          const stillWanted = roomMediaAudio && roomMediaAudio.video && roomMediaAudio.video.videoId === wantedVideoId;
          if (!stillWanted) { window.StudioYtPlayer.destroy(adapter); mountEl.hidden = true; return null; }
          roomMediaYtAdapter = adapter; roomMediaYtVideoId = wantedVideoId;
          return adapter;
        })
        .catch((e) => { mountEl.hidden = true; throw e; })
        .finally(() => { roomMediaYtCreating = null; });
    }
    try { await roomMediaYtCreating; } catch (_) { return; }
    if (!roomMediaYtAdapter) return;
  }
  // Per-row replay на адаптер НЕ подключён — ловушка асинхронного seekTo (karaoke.js:177-192).
  await StudioMediaKaraoke.start({ media: roomMediaYtAdapter, entries, rowCount: readerRows.length, onRangeChange: roomMediaFollowRange, stopOtherAudio: roomMediaStopOthers });
}
function roomMediaWireOnce() {
  if (_roomMediaWired) return; _roomMediaWired = true;
  const btn = $('roomMediaPlayBtn');
  if (btn) btn.addEventListener('click', () => { roomMediaPlayOriginal(); });
  // Tap-seek: делегат на СТАБИЛЬНОМ #roomReaderTable (innerHTML пересобирается внутри него).
  // Интерактивные цели Зала (морфология .rm-w, кнопки, ссылки) НЕ перехватываются.
  const mount = $('roomReaderTable');
  if (mount) mount.addEventListener('click', (e) => {
    try {
      if (!window.StudioMediaKaraoke || !StudioMediaKaraoke.getAudioEl()) return;
      if (e.target && e.target.closest && e.target.closest('button, a, .rm-w, select, input')) return;
      const tr = e.target && e.target.closest ? e.target.closest('tr[data-row-idx]') : null;
      if (!tr) return;
      const idx = Number(tr.getAttribute('data-row-idx'));
      if (Number.isFinite(idx) && idx >= 0) StudioMediaKaraoke.seekToRow(idx);
    } catch (_) {}
  });
  wireKaraokeScrollPause();   // yield-скролл единый для TTS- и медиа-караоке
}
```
- [ ] **5.2** Интеграции:
  - `openReader` cleanup-блок (~5405): добавить `roomMediaTeardown();`
  - `openReader` внутри `if (res && res.ok)` после `attachReaderAudio();`: `try { roomMediaSetup(res.text); } catch (_) {}`
  - `rerenderReader` после `attachReaderAudio();`: `try { roomMediaRefresh(); } catch (_) {}` (re-bind стейджа + re-инъекция ▶︎ после пересборки таблицы)
  - `closeReader` рядом с `karaokeActive = false;` (~5547): `try { roomMediaTeardown(); } catch (_) {}`
  - `onKaraokeRowChange` (3542), первой строкой в ветке `idx >= 0` (TTS → media направление; `isActive()`-guard сохраняет позицию паузы):
    `try { if (window.StudioMediaKaraoke && StudioMediaKaraoke.isActive()) StudioMediaKaraoke.stop(); } catch (_) {}`
  - `toggleReadAloud` (3570) перед `readerAudio.playAll(0)`: `try { if (window.StudioMediaKaraoke) StudioMediaKaraoke.stop(); } catch (_) {}`
  - `renderMyTextCard` (после цикла тегов ~6487) — бейдж наличия медиа (данные уже в строке `listTexts`; ⚠ `listTextsLight` срезает `table_model_meta_json` — при миграции бейдж пропадёт, комментарий обязателен):

```js
  // Медиа-бейдж (spec 2026-08-04). ⚠ Работает только от listTexts: listTextsLight срезает
  // table_model_meta_json (local-db.js:577) — при миграции роутинга бейдж молча исчезнет.
  try {
    if (window.MediaHost) {
      const mAudio = MediaHost.passportFromTextRow(item);
      if (mAudio && (mAudio.media || (mAudio.video && mAudio.video.videoId))) {
        const isVideo = !!(mAudio.video && mAudio.video.videoId) || /^video\//.test(String((mAudio.media && mAudio.media.mime) || ''));
        meta.appendChild(el('span', { class: 'prov-badge mytext-media', text: isVideo ? '🎬' : '🎧', attrs: { title: tt('studio.media.sourcePlayer', 'Исходное аудио / видео') } }));
      }
    }
  } catch (_) {}
```
- [ ] **5.3 Прогнать:** `npm run smoke:reader-parity`, `npm run smoke:room`, `npm run smoke:room-mode`, `npm run smoke:reader-mytexts`, `npm run smoke:reader-karaoke` → PASS.
- [ ] **5.4 Commit:** `feat(room): media player host — karaoke, tap-seek, per-row replay, honest states`

---

### Task 6: Детерминированный смоук `smoke:room-media`

**Files:**
- Create: `scripts/premium/room-media-smoke.js` (харнесс — копия структуры `scripts/premium/room-smoke.js`: старт server.js на своём порту, Playwright chromium, сид через `window.ensureLocalDB()` на index.html, затем открытие library.html)
- Modify: `package.json` — `"smoke:room-media": "node scripts/premium/room-media-smoke.js"` (рядом с `smoke:room`, ~205)

**Steps:**

- [ ] **6.1** Сид (три карточки; медиа-байты пишутся прямо в OPFS из страницы):

```js
const PASSPORT_OK = { source: { audio: { v: 1,
  media: { opfsPath: 'media/rmm-smoke.mp3', sha256: 'rmm-smoke', mime: 'audio/mpeg', sizeBytes: 3, durationSec: 30, originalName: 'rmm.mp3' },
  segments: [ { i: 0, start: 0, end: 10, text: 'שלום עולם' }, { i: 1, start: 10, end: 20, text: 'מה קורה היום' } ],
  timing: { v: 1, unit: 'row', entries: [ { o: 0, t: 0, end: 10 }, { o: 1, t: 10, end: 20 } ] } } } };
const PASSPORT_NO_TIMING = { source: { audio: { v: 1,
  media: { opfsPath: 'media/rmm-smoke.mp3', sha256: 'rmm-smoke', mime: 'audio/mpeg' },
  segments: [], timing: null, timingDropReason: 'ASR_TIMING_INVALID' } } };
const PASSPORT_NO_BYTES = { source: { audio: { v: 1,
  media: { opfsPath: 'media/rmm-absent.mp3', sha256: 'rmm-absent', mime: 'audio/mpeg' },
  segments: [ { i: 0, start: 0, end: 5, text: 'אחת' }, { i: 1, start: 5, end: 9, text: 'שתיים' } ],
  timing: { v: 1, unit: 'row', entries: [ { o: 0, t: 0 }, { o: 1, t: 5 } ] } } } };
// SEED (в контексте index.html, как room-smoke):
//   createText rmm-t1 (title 'מדיה', table_model_meta_json: PASSPORT_OK) + addSentence ×2
//     ('שלום עולם'/'привет мир', 'מה קורה היום'/'что происходит');
//   createText rmm-t2 (PASSPORT_NO_TIMING в source_meta_json — проверка фолбэка колонок) + addSentence ×1;
//   createText rmm-t3 (PASSPORT_NO_BYTES) + addSentence ×2;
//   OPFS: navigator.storage.getDirectory() → media/rmm-smoke.mp3 ← Uint8Array([0xFF,0xFB,0x90]).
```
- [ ] **6.2** Ассерты (открытие каждого текста в Зале через `openReader` — навигация «Мои тексты» → карточка, либо прямой вызов из page.evaluate по образцу mytexts-smoke):
  1. rmm-t1: `#roomMediaBar` видим, note пустой, `#roomMediaPlayBtn` присутствует;
  2. rmm-t1: две кнопки `.smk-row-replay` инъецированы (blob резолвится);
  3. rmm-t1: `page.evaluate` смена aids (rerenderReader) → кнопки снова инъецированы;
  4. rmm-t1: `StudioMediaKaraoke.seekToRow(1)` из evaluate после bind → нет исключения, karaoke-подсветка `tr.smk-row-active` появляется после `syncCurrent()` (audio.currentTime может не двигаться на фейковом mp3 — сидим на `bind` + прямой вызов `paintRange` через `syncCurrent`; если элемент бросает error-событие и run уничтожается — ассерт ослабить до «bind не бросил и .smk-row-replay остались», зафиксировав причину комментарием);
  5. rmm-t2: note === `t('studio.media.noTiming')` (сравнение через page.evaluate `window.t`), кнопок `.smk-row-replay` нет — паспорт из `source_meta_json` подхвачен (фолбэк колонок);
  6. rmm-t3: note === `t('studio.media.fileMissing')`, `#roomMediaStudioLink` видим и href содержит `/index.html?room=1#/t/`, кнопок `.smk-row-replay` нет;
  7. закрытие ридера (`readerBack`) → `#roomMediaBar` hidden;
  8. корпусный текст без паспорта → бар hidden;
  9. no pageerror за весь прогон.
- [ ] **6.3 Прогнать:** `npm run smoke:room-media` → PASS (итеративно доводить).
- [ ] **6.4 Commit:** `test(room): deterministic room-media smoke gate`

---

### Task 7: Версии, полный прогон гейтов, скриншоты 380px, докы, push

**Files:**
- Modify: `public/sw.js:32` CACHE_VERSION → `v3.11.305`; `public/index.html:13082` APP_VERSION → `3.11.305`
- Modify: `CLAUDE.md` — в секцию «Читальный зал» одна строка: медиа-плеер учебных материалов в Зале (общий MediaHost, гейт `smoke:room-media`)
- Modify: `docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md` — отметка «Room media player SHIPPED» со ссылкой на спеку (одной строкой в соответствующей таблице/секции)

**Steps:**

- [ ] **7.1** Bump версий.
- [ ] **7.2** Полный прогон: `node --test tests/mediaHost.test.js tests/mediaKaraoke.test.js tests/asrTranscript.test.js` + `npm run smoke:reader-parity smoke:media-karaoke smoke:reader-karaoke smoke:reader-mytexts smoke:room smoke:room-mode smoke:room-media smoke:i18n smoke:media-package smoke:text-card` (последовательно; все PASS).
- [ ] **7.3** Playwright-скриншот 380×844: library.html с открытым rmm-t1 (бар + стейдж + строка с двумя кнопками) — смотреть глазами до `git add`; при дефектах верстки — чинить CSS Task 4.
- [ ] **7.4** Докы (CLAUDE.md + roadmap) — по строке, без развёрнутых секций.
- [ ] **7.5 Commit + push:** `feat(room): premium media player in Reading Room (shared MediaHost)` → push в main (деплой авто). Прод-верификация: открыть https://linguistpro.kolosei.com/library.html после деплоя, проверить загрузку `/js/media-host.js` (200) и отсутствие консольных ошибок.

---

## Self-review (выполнен при написании)

- Покрытие спеки: §3.1 (модуль) → Task 1/3; §3.2 (хук) → Task 2; §3.3 (хост Зала, CSS, бейдж, YT) → Task 4/5; §3.4 исключения соблюдены (L3a exact-bindings НЕ реализуются — augmentRows сохраняет suppression-проверку, но `activateTextBinding` в Зале не вызывается); §5 честность → Task 5 (noTiming/fileMissing/openInStudio) + ядро (blind); §6 ловушки → распределены по таскам; §7 тесты → Task 1/2/6/7.
- Типы согласованы: `passportFromTextRow` → passport|null (Task 1 = Task 5); `createStage.ensure(audio, blob)` → playerEl|null (Task 3 = Task 5); `augmentRows.onReplay(rowIdx, audio, blob)` (Task 3 = Task 5); `stopOtherAudio` опция bind/start/createStage (Task 2 = Task 3 = Task 5).
- Плейсхолдеров нет; единственная условная ветка — поведение smoke-ассерта 4 на фейковом mp3 и требование Suite 10 к `?v=` index.html, обе описаны с критерием решения.
