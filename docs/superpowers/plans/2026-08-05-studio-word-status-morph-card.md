# Studio Word-Status + Morph Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Порт «Статуса слов» (раскраска) и морф-карточки-на-тапе из Зала в Студию через общий хост-модуль, с удалением мобильного шита «Строка таблицы».

**Architecture:** Канонические писатели памяти слова (`markWordStatus`/`gradeReadingTap`/`occToVerifiedSource`/кэш статусов/глю заметок/consent Dicta/speakWord) переезжают из `library-ui.js` в общий `public/js/morph-host.js` (env-параметризация, паттерн media-host). Студия получает тонкий адаптер `public/js/studio-morph.js`, который оборачивает `window.renderTable` (прецедент `studio-agent.js:1226`), вешает ReaderMorph на `#tableContainer` и рисует тумблер. CSS карточки выносится из library.html в общий `public/css/reader-morph.css`.

**Tech Stack:** vanilla JS (classic scripts + window.*), OPFS local-db, ReaderMorph, Playwright smokes.

**Spec:** `docs/superpowers/specs/2026-08-05-studio-word-status-morph-card-design.md`

## Global Constraints

- `renderTable` в index.html и `reader-core.buildBilingualTableHtml` — БАЙТ-ЗАМОРОЖЕНЫ (`smoke:reader-parity`). Никаких правок внутри; только post-render обёртки/трансформы.
- Форк семантики памяти запрещён: одна реализация в morph-host, Зал и Студия — делегаты.
- Тела функций при переносе в morph-host НЕ меняются семантически — только механические подстановки по таблице замен (см. Task 1).
- Никаких новых строк UI без ru/en/he (здесь: переиспользуем существующие `room.morph.*` ключи, новых НЕ добавляем).
- SW: новые файлы в `PRECACHE_URLS` + bump `CACHE_VERSION` (`public/sw.js:32`, сейчас `v3.11.310`).
- localStorage-ключи: тумблер Студии `studio.wordStatus` (первое чтение наследует `room.wordStatus`); consent Dicta общий `room.contextConsent`; TTS-ключ общий `v3.gcpTtsApiKey`.
- Перед git add UI-правок — скриншот @380×844 (CLAUDE.md workflow).
- Гейты после каждой задачи, затрагивающей Зал: `smoke:reader-word-status`, `smoke:memory-canon`, `smoke:room-study`, `smoke:room-media`, `smoke:reader-morph`, `smoke:reader-parity`.

---

### Task 1: `public/js/morph-host.js` — общий хост (перенос тел из library-ui.js)

**Files:**
- Create: `public/js/morph-host.js`
- Test: гейты Зала (Task 2) — корректность доказывается делегированием без регрессий; изолированный Node-тест невозможен (браузерные localDb/FsrsCore).

**Interfaces (Produces):**
```js
window.MorphHost = { createHost };
// host = MorphHost.createHost(env)
// env = {
//   ldb: async () => localDbNamespace,       // Room: async () => localDb; Studio: window.ensureLocalDB
//   getTextKey: async () => string|null,     // текущий text_key поверхности (или null)
//   toast: (msg) => void,
//   onProfileChanged: () => void,            // инвалидации+перекраска поверхности (вызывается ПОСЛЕ host-инвалидации)
//   getTtsKey: () => string,                 // localStorage v3.gcpTtsApiKey
//   dayStr: () => 'YYYY-MM-DD',
//   getContextOverlay: () => object|null,    // Room: _ctxOverlay; Studio: () => null
//   applyI18n: () => void,
// }
// host API:
//   ensureWordStates(), invalidateWordStates()            — single-flight кэш (референс-стабильный)
//   markWordStatus(lemmaKey, status, source)              — метка + FSRS-посев (тело library-ui.js:5242-5280)
//   occToVerifiedSource(occ)                              — verified source (тело 5233-5241; readerTextKey → await env.getTextKey())
//   gradeReadingTap(card, occ, correct, prev)             — write-step оценки (тело 5399-5456 БЕЗ Room-побочек — см. замены)
//   lookupNote(card), loadWordNote(card), saveWord(card,occ), saveWordPersonal(card,occ,fields),
//   lookupUserMeaning(card), saveUserMeaning(card,occ,meaning)   — тела roomLookupNote/... (2564-2705) + roomDedupKey/roomNoteBody
//   contextConsent(), contextConsentSet(v), promptContextConsent(), canRefine(),
//   makeContextProvider(), makeRefineProvider(), grantContextConsent()
//   speakWord(text), playUrl(url), stopAudio()            — тело speakWord (600-618) + аудио-синглтон
//   bumpTapStat(kind)                                     — тело 5381-5387 (localStorage room.readingTap.stats — ОБЩИЙ ключ)
```

- [ ] **Step 1.1: Прочитать переносимые диапазоны library-ui.js** (verbatim-источник): 600-618 (speakWord), 590-599 (browserSpeakWord), roomDedupKey/roomNoteBody (найти рядом с 2520-2563), 2564-2705 (note-глю), 673-674 (wordStatusEnabled/Set — НЕ переносится, остаётся у Зала), 680-761 (consent + провайдеры), 763-781 (ensureWordStates), 5233-5280 (occToVerifiedSource+markWordStatus), 5381-5456 (bumpTapStat+gradeReadingTap), 726-743 (promptContextConsent).

- [ ] **Step 1.2: Написать morph-host.js.** IIFE classic-script (`window.MorphHost`), `createHost(env)` возвращает объект с замыканиями. Таблица механических замен при переносе тел:

| В library-ui.js | В morph-host.js |
|---|---|
| `localDb.<fn>(...)` | `(await env.ldb()).<fn>(...)` (в начале каждой async-функции: `const ldb = await env.ldb();`) |
| `readerTextKey` | `await env.getTextKey()` (в occToVerifiedSource/gradeReadingTap — один await в начале) |
| `roomToast(...)` | `env.toast(...)` |
| `readerWordStates = null; invalidateReadableSet(); applyDecorations();` | `invalidateWordStates(); env.onProfileChanged();` |
| `refreshDueBadge()` (в gradeReadingTap 5454) | убрать — входит в `env.onProfileChanged()` |
| `applyDecorations()` (в gradeReadingTap 5453) | убрать — входит в `env.onProfileChanged()` |
| `_asdCache = null` (5452) | убрать из host; Зал делает это в своём onProfileChanged |
| `gcpTtsKey()` | `env.getTtsKey()` |
| `_localDayStr()` | `env.dayStr()` |
| `_ctxOverlay` (703-711) | `env.getContextOverlay()` |
| `el(...)` (в promptContextConsent) | локальный минимальный `_el()` в host (скопировать сигнатуру el из library-ui) |
| `tt(key, fallback)` | локальный `_tt()`: `window.t` c fallback (копия reader-morph.js:983) |
| `window.applyI18n && window.applyI18n()` | `env.applyI18n()` |
| `_wordAudio` | приватный синглтон host; `stopAudio()` = pause + `speechSynthesis.cancel()` |
| `_ctxCache` | приватный Map host + метод `clearCtxCache()` |
| `_ctxConsentAsked` | приватный флаг host |

- [ ] **Step 1.3: Синтакс-чек**: `node --check public/js/morph-host.js` → OK.

- [ ] **Step 1.4: Commit** `feat(morph-host): общий хост памяти слова (перенос канона из library-ui)`.

---

### Task 2: Делегирование Зала в morph-host (нулевая регрессия)

**Files:**
- Modify: `public/js/library-ui.js` (тела → делегаты), `public/library.html` (script-тег morph-host.js ДО library-ui.js, рядом с 2451)

**Interfaces (Consumes):** `window.MorphHost.createHost(env)` из Task 1.

- [ ] **Step 2.1: roomEnv + host-инстанс** в library-ui.js (рядом с определением localDb-импорта):
```js
const morphHost = window.MorphHost.createHost({
  ldb: async () => localDb,
  getTextKey: async () => readerTextKey || null,
  toast: (m) => roomToast(m),
  onProfileChanged: () => {
    readerWordStates = null; _asdCache = null;
    try { invalidateReadableSet(); } catch (_) {}
    try { applyDecorations(); } catch (_) {}
    try { refreshDueBadge(); } catch (_) {}
  },
  getTtsKey: () => gcpTtsKey(),
  dayStr: () => _localDayStr(),
  getContextOverlay: () => _ctxOverlay,
  applyI18n: () => { try { window.applyI18n && window.applyI18n(); } catch (_) {} },
});
```
⚠ `readerWordStates`-кэш Зала: refreshCovChip сравнивает `statesRef === states` (861). Делегат `ensureWordStates` должен вернуть host-кэш; строку `readerWordStates = null` в Room-коде заменить на `morphHost.invalidateWordStates()` везде (grep `readerWordStates` — все присваивания/чтения свести к host: `ensureWordStates()` → `morphHost.ensureWordStates()`; референс-стабильность сохраняется host-кэшем).

- [ ] **Step 2.2: Заменить тела на делегаты** (имена/сигнатуры сохраняются): `speakWord`→`morphHost.speakWord`, `_playSentenceAudio` внутри — `_wordAudio`-путь → `morphHost.playUrl(src)`, `_stopTrainAudio` → `morphHost.stopAudio()`, `roomLookupNote`/`roomLoadWordNote`/`roomSaveWord`/`roomSaveWordPersonal`/`roomLookupUserMeaning`/`roomSaveUserMeaning`→host, `contextConsent`/`contextConsentSet`/`promptContextConsent`/`canRefine`/`makeContextProvider`/`makeRefineProvider`→host, `ensureWordStates`→host, `occToVerifiedSource`/`markWordStatus`/`gradeReadingTap`/`bumpTapStat`→host. Удалить перенесённые тела. `_ctxCache = new Map()` в attachReaderMorph → `morphHost.clearCtxCache()`.

- [ ] **Step 2.3: Синтакс-чек** обоих файлов + grep остаточных ссылок на удалённые приватники.

- [ ] **Step 2.4: Гейты Зала**: `npm run smoke:reader-word-status && npm run smoke:memory-canon && npm run smoke:room-study && npm run smoke:room-media && npm run smoke:reader-morph && npm run smoke:reader-parity` → все PASS.

- [ ] **Step 2.5: Commit** `refactor(room): память слова через MorphHost (делегаты, поведение байт-в-байт)`.

---

### Task 3: Вынос CSS карточки в `public/css/reader-morph.css`

**Files:**
- Create: `public/css/reader-morph.css`
- Modify: `public/library.html` (удалить перенесённые блоки, добавить `<link>`), `public/index.html` (добавить `<link>` + исключение width-ловушки)

Переносим ТОЛЬКО не-Room-скоупленные блоки (карта из разведки, library.html): палитра `--ws-*`/`--prov-*` `:root` 27-39 + dark 51-57 + `body.theme-dark` 60-69 (копия всех трёх скоупов); `.rm-w` база 1129-1133 (**проверить скоуп** — если селектор `#roomReaderTable .rm-w`, в общий файл кладём БЕЗ префикса и добавляем к обоим столам, а в library удаляем); `.rm-sheet` 1164-1227; `.rm-refine…rm-note` 1281-1449; цвета `.rm-w-*` 1462-1478 (1480 `#roomReaderTable.karaoke-on` — ОСТАВИТЬ в library; 1481-1490 rm-w-speaking — проверить скоуп, у Студии свой дубль 2906-2920); `.room-consent*` 1512-1525; `.rm-acc/.rm-rootfam/.rm-status*` 1736-1782; `.reader-status-legend/-sw/-dot` 1783-1793; `.rm-statpop` 1794-1801; `.rm-word-wrap/.rm-speak` 2059-2067; `.rm-conj-body` 2068-2096. Room-специфика (`.rm-find-*` 734-738, `.rm-row-jump` 1008-1015, `.reader-aids-*`) — НЕ трогаем.

- [ ] **Step 3.1**: Создать css-файл (шапка-комментарий: источник, обе поверхности, правило «правь здесь»). Перенести блоки; в library.html вырезать их и добавить `<link rel="stylesheet" href="/css/reader-morph.css">` ПЕРЕД инлайн `<style>` (чтобы Room-специфичные overrides выигрывали каскадом).
- [ ] **Step 3.2**: index.html: `<link>` тот же, ПОСЛЕ инлайн-стилей шапки (порядок: наш файл позже инлайна → выигрывает при равной специфичности); добавить в конец css-файла исключение мобильной ловушки: `.rm-sheet button, .rm-statpop button, .room-consent button { width: auto; }`.
- [ ] **Step 3.3**: Гейты Зала (как 2.4) + скриншот Room-карточки (Playwright: library.html, тап по слову, скрин @380) — визуально сверить с прод-видом.
- [ ] **Step 3.4: Commit** `refactor(css): rm-карточка/палитра статусов → общий /css/reader-morph.css`.

---

### Task 4: `public/js/studio-morph.js` — адаптер Студии

**Files:**
- Create: `public/js/studio-morph.js`

**Interfaces:**
- Consumes: `MorphHost.createHost`, `window.ReaderMorph.attach/decorateWords/dueSetFromSchedule`, `window.ensureLocalDB`, `window.__localDBInitPromise`, `gcpTtsKeyGet` (index.html top-level fn), `showToast`, `currentTableData` через `window.StudioAgentHost.getRow`, `window.StudioAgent` (наличие агента).
- Produces: `window.StudioMorph = { refresh, wordStatusEnabled, wordStatusSet, attachOnce, buildPanelRow }`.

Ключевые куски (реальный код):
```js
(function () {
  "use strict";
  var LS_KEY = "studio.wordStatus";
  function wordStatusEnabled() {
    try {
      var v = localStorage.getItem(LS_KEY);
      if (v === null) { // первое чтение — наследуем Зал (inherit-once)
        v = localStorage.getItem("room.wordStatus") === "1" ? "1" : "0";
        localStorage.setItem(LS_KEY, v);
      }
      return v === "1";
    } catch (_) { return false; }
  }
  async function _ldb() { // паттерн studio-retell.js:91-103
    if (window.__localDBInitPromise) { try { await window.__localDBInitPromise; } catch (_) {} }
    if (typeof window.ensureLocalDB === "function") return await window.ensureLocalDB();
    return window.__localDB || null;
  }
  // text_key активного сохранённого текста — резолв НА ТАПЕ (кэш индексов протухает, критика wf_7f300c39)
  async function _textKey() {
    try {
      var tid = window.v3ActiveTextId || null; // fallback: dataset у #proTable
      if (!tid) { var pt = document.getElementById("proTable"); tid = pt && pt.dataset ? (pt.dataset.textId || null) : null; }
      if (!tid) return null;
      var ldb = await _ldb(); if (!ldb) return null;
      var text = await ldb.getTextById(String(tid));
      return (text && text.text_key) ? String(text.text_key) : null;
    } catch (_) { return null; }
  }
  var host = null;
  function ensureHost() {
    if (host || !window.MorphHost) return host;
    host = window.MorphHost.createHost({
      ldb: _ldb,
      getTextKey: _textKey,
      toast: function (m) { try { window.showToast && window.showToast(m); } catch (_) {} },
      onProfileChanged: function () { try { refreshDecorations(); } catch (_) {} },
      getTtsKey: function () { try { return (typeof window.gcpTtsKeyGet === "function") ? window.gcpTtsKeyGet() : (localStorage.getItem("v3.gcpTtsApiKey") || ""); } catch (_) { return ""; } },
      dayStr: function () { var d = new Date(); ... }, // локальная дата YYYY-MM-DD (копия _localDayStr Зала)
      getContextOverlay: function () { return null; },
      applyI18n: function () { try { window.applyI18n && window.applyI18n(); } catch (_) {} },
    });
    return host;
  }
  function editModeOn() { var t = document.getElementById("proTable"); return !!(t && t.classList.contains("tbl-edit-mode")); }
  // САМОЛЕЧЕНИЕ: ячейка с data-rm-wrapped, но без .rm-w (правка ячейки) → снять флаг, wrapMount перевернёт заново
  function healStaleWrapFlags(mount) {
    var tds = mount.querySelectorAll('td[data-rm-wrapped]');
    for (var i = 0; i < tds.length; i++) if (!tds[i].querySelector(".rm-w")) tds[i].removeAttribute("data-rm-wrapped");
  }
  var rmAttach = null;
  function attachOnce() {
    var mount = document.getElementById("tableContainer");
    if (!mount || rmAttach || !window.ReaderMorph) return;
    var h = ensureHost(); if (!h) return;
    var opts = {
      getRow: function (i) { return (window.StudioAgentHost && window.StudioAgentHost.getRow) ? window.StudioAgentHost.getRow(i) : null; },
      getWordStates: function () { return h.ensureWordStates(); },
      getWordStatus: async function (lk) { var ldb = await _ldb(); return ldb ? ldb.getWordStatus(lk) : ""; },
      setWordStatus: async function (lk, st, occ) {
        var source = null; try { source = await h.occToVerifiedSource(occ); } catch (_) {}
        var res = null; try { res = await h.markWordStatus(lk, st, source); } catch (_) {}
        h.invalidateWordStates(); refreshDecorations();
        try { var cardOpen = !!document.querySelector(".rm-sheet.rm-open"); if (!cardOpen && res && res.dueMs) { /* toast как в Зале 5498-5501 */ } } catch (_) {}
        return res;
      },
      speakWord: function (t) { return ensureHost().speakWord(t); },
      lookupNote: function (c) { return ensureHost().lookupNote(c); },
      loadWordNote: function (c) { return ensureHost().loadWordNote(c); },
      saveWord: function (c, o) { return ensureHost().saveWord(c, o); },
      saveWordPersonal: function (c, o, f) { return ensureHost().saveWordPersonal(c, o, f); },
      lookupUserMeaning: function (c) { return ensureHost().lookupUserMeaning(c); },
      saveUserMeaning: function (c, o, m) { return ensureHost().saveUserMeaning(c, o, m); },
      contextProvider: ensureHost().makeContextProvider(),
      refineContext: ensureHost().makeRefineProvider(),
      canRefine: function () { return ensureHost().canRefine(); },
      grantContextConsent: function () { ensureHost().contextConsentSet("granted"); },
      getDueSchedule: async function () {
        if (!wordStatusEnabled()) return null;
        try { var ldb = await _ldb(); return (await ldb.getSrsSchedule()) || {}; } catch (_) { return null; }
      },
      noteRecallShown: function () { ensureHost().bumpTapStat("shown"); },
      gradeReadingTap: function (card, occ, correct, prev) { return ensureHost().gradeReadingTap(card, occ, correct, prev); },
      explainWord: makeExplainWord(), // ниже
    };
    rmAttach = window.ReaderMorph.attach(mount, opts);
  }
  // Наставник: ТОЛЬКО сохранённые тексты (нужен text_key/order_index) — resolveAnchor-паттерн studio-agent.js:368
  function makeExplainWord() {
    return async function (p) {
      var tk = await _textKey();
      if (!tk || p == null || p.orderIndex == null) return { ok: false, message: t_("studio.morph.explainNeedsSave") };
      // POST /api/agent/explain-word { surface, text_key, order_index, displayed } + X-LP-CSRF + byok — копия library-ui.js:5155-5199 без corpus-ветки
      ...
    };
  }
  async function refreshDecorations() {
    var mount = document.getElementById("tableContainer");
    if (!mount || !window.ReaderMorph) return;
    if (editModeOn()) return;
    healStaleWrapFlags(mount);
    if (rmAttach) rmAttach.refresh(); // wrapMount idempotent
    var color = wordStatusEnabled();
    var states = color ? await ensureHost().ensureWordStates() : {};
    var dueSet = null;
    if (color && window.ReaderMorph.dueSetFromSchedule) {
      try { var ldb = await _ldb(); dueSet = window.ReaderMorph.dueSetFromSchedule((await ldb.getSrsSchedule()) || {}, states || {}, Date.now()); } catch (_) { dueSet = null; }
    }
    try { await window.ReaderMorph.decorateWords(mount, states, { color: color, fadeMode: "full", dueSet: dueSet }); } catch (_) {}
  }
  var _t = null; function refresh() { clearTimeout(_t); _t = setTimeout(function () { attachOnce(); refreshDecorations(); }, 30); } // дебаунс чанк-прогрессии
  function wrapRenderTable() { // прецедент studio-agent.js:1226-1245
    var orig = window.renderTable;
    if (typeof orig !== "function" || orig.__smWrapped) return false;
    var wrapped = function () { var out = orig.apply(this, arguments); try { refresh(); } catch (_) {} return out; };
    wrapped.__smWrapped = true; window.renderTable = wrapped;
    try { refresh(); } catch (_) {} return true;
  }
  if (!wrapRenderTable()) document.addEventListener("DOMContentLoaded", wrapRenderTable);
  window.StudioMorph = { refresh: refresh, wordStatusEnabled: wordStatusEnabled, wordStatusSet: function (v) { try { localStorage.setItem(LS_KEY, v ? "1" : "0"); } catch (_) {} }, attachOnce: attachOnce };
})();
```
⚠ Подавление карточки в edit-mode: wrap не выполняется (refreshDecorations ранний return), но спаны от прошлого рендера остаются — reader-morph onClick сработал бы. Решение: в `opts.getRow` вернуть null при editModeOn()? Нет — карточка без row всё равно откроется по data-surface. Чисто: в attachOnce обернуть `opts` не нужно; вместо этого в studio-morph добавить capture-раньше reader-morph нельзя (reader-morph на mount capture). Реализация: перед `window.ReaderMorph.attach` добавить на mount capture-обработчик, зарегистрированный РАНЬШЕ (attach нашего до RM.attach): `mount.addEventListener("click", function (e) { if (editModeOn()) { var s = e.target.closest && e.target.closest(".rm-w"); if (s) { e.stopImmediatePropagation(); } } }, true);` — первый зарегистрированный capture-слушатель на том же узле выполняется первым → карточка не открывается в edit-mode.

- [ ] **Step 4.1**: Написать файл целиком (код выше + перенос _localDayStr-копии + explainWord fetch-копия из library-ui.js:5155-5199 без corpus-ветки, эндпоинт `/api/agent/explain-word`, byok из `agent.byok.provider/key` — литералы как в studio-agent.js:31-32).
- [ ] **Step 4.2**: `node --check public/js/studio-morph.js`.
- [ ] **Step 4.3: Commit** `feat(studio): studio-morph — адаптер карточки/раскраски (MorphHost + ReaderMorph)`.

---

### Task 5: Интеграция в index.html (тумблер, скрипты, удаление шита)

**Files:**
- Modify: `public/index.html`

- [ ] **Step 5.1: Скрипты** — после `<script src="/js/reader-morph.js">` (12990): `<script src="/js/reader-dicta.js"></script>`; после media-host (13032): `<script src="/js/morph-host.js"></script><script src="/js/studio-morph.js"></script>`.

- [ ] **Step 5.2: Тумблер в «🎛️ Настройки таблицы»** — новая строка ПОСЛЕ блока колонок (11545):
```html
<div class="table-settings-row table-settings-sub studio-morph-row">
  <label class="table-chk" title="" >
    <input type="checkbox" id="studioWordStatusToggle">
    <span data-i18n="room.morph.statusToggle">🎨 Статус слов</span>
  </label>
  <span id="studioWordStatusLegend" class="reader-status-legend" aria-label="Статус слов"></span>
  <span class="table-settings-note" data-i18n="room.morph.statusNote">Цвет — у уверенно распознанных учебных слов; служебные и не найденные в словаре остаются без цвета.</span>
</div>
```
Легенда строится JS-ом (тот же порядок, что Зал 5797-5806): в инициализации (рядом с autoNextToggle wiring, ~17046) —
```js
(function () {
  var cb = document.getElementById("studioWordStatusToggle");
  var lg = document.getElementById("studioWordStatusLegend");
  if (!cb || !window.StudioMorph) return;
  cb.checked = window.StudioMorph.wordStatusEnabled();
  cb.addEventListener("change", function () { window.StudioMorph.wordStatusSet(cb.checked); window.StudioMorph.refresh(); });
  if (lg && !lg.childNodes.length) {
    [["new", (window.t ? t("room.morph.status.new") : "новое")], ["l1","1"], ["l2","2"], ["l3","3"], ["l4","4"],
     ["known", (window.t ? t("room.morph.status.known") : "знаю")], ["ignore", (window.t ? t("room.morph.status.ignore") : "игнор")]].forEach(function (p) {
      var sw = document.createElement("span"); sw.className = "reader-status-sw";
      var dot = document.createElement("span"); dot.className = "reader-status-dot sw-" + p[0];
      var tx = document.createElement("span"); tx.textContent = p[1];
      sw.appendChild(dot); sw.appendChild(tx); lg.appendChild(sw);
    });
  }
})();
```

- [ ] **Step 5.3: Удаление classicRowSheet** (полный инвентарь из разведки): CSS 9119-9234; markup 11600-11614; консты 17038-17044 (оставить только те, что нужны стабу); слушатели 36249-36283 (только sheet-части; resize/orientationchange FAB-обновления ОСТАВИТЬ); `classicOpenRowSheet` 36211-36247 — удалить; document-opener 36290-36304 — удалить; строку 20820 — удалить; в `tableEditFabUpdate` (36334-36335) и `orientationFabUpdate` (36351-36352) убрать `rowSheetOpen` из выражений. `classicCloseRowSheet` — ОСТАВИТЬ НО-ОП СТАБОМ `function classicCloseRowSheet() {}` с комментарием (вызывается из БАЙТ-ЗАМОРОЖЕННОГО renderTable:35913 — не трогаем замороженный код).

- [ ] **Step 5.4: Хук edit-mode exit**: в `tableEditModeExit` (36477-36502, НЕ заморожен) в конец: `try { window.StudioMorph && window.StudioMorph.refresh(); } catch (_) {}`.

- [ ] **Step 5.5**: grep-свип: `classicRowSheet|classic-row-sheet|rowSheetOpen` по index.html → остаётся только стаб+коммент; `node --check` неприменим (html) — открыть страницу в Playwright, проверить отсутствие консольных ошибок.

- [ ] **Step 5.6: Commit** `feat(studio): тумблер «Статус слов» + карточка на тапе; шит «Строка таблицы» удалён`.

---

### Task 6: Патч studio-karaoke.js — переиспользование морф-спанов

**Files:**
- Modify: `public/js/studio-karaoke.js:70-98` (wrapCell), `:149-158` (stop restore)

- [ ] **Step 6.1**: В `wrapCell(td)` после guard'а WRAP_FLAG:
```js
// morph-спаны уже есть (data-rm-wrapped): у них те же .rm-w[data-w-offset] — переиспользуем,
// НЕ пересобираем и НЕ рестор-им (иначе затрём раскраску статусов)
if (td.getAttribute("data-rm-wrapped")) return !!td.querySelector(".rm-w");
```
`stop()` не трогаем: такие td не попадают в `wrappedCells` (мы вернули true, но пуш в wrappedCells происходит у вызывающего — проверить 182: `if (wrapCell(cells[i])) run.wrappedCells.push(cells[i])` — тогда td попадёт в wrappedCells с `__skOrigHtml === undefined`; рестор 154 гардит `!= null` → безопасно, но чище вернуть true и НЕ пушить: изменить цикл 182 на `var w = wrapCell(cells[i]); if (w === "own") run.wrappedCells.push(cells[i]);` — wrapCell возвращает "own" для своей обёртки, true для reuse, false для мимо).
- [ ] **Step 6.2**: Прогнать `npm run smoke:studio-chunks` (караоке-гейт) → PASS.
- [ ] **Step 6.3: Commit** `fix(studio-karaoke): reuse морф-спанов — подсветка не затирает раскраску статусов`.

---

### Task 7: SW precache + версия

**Files:**
- Modify: `public/sw.js` (32: CACHE_VERSION → следующий v3.11.x; PRECACHE_URLS: `"/js/morph-host.js"`, `"/js/studio-morph.js"`, `"/css/reader-morph.css"` — рядом с 116 и 82)

- [ ] **Step 7.1**: Внести правки; grep дублей.
- [ ] **Step 7.2: Commit** `chore(sw): precache morph-host/studio-morph/reader-morph.css + bump`.

---

### Task 8: Гейт `smoke:studio-morph`

**Files:**
- Create: `scripts/premium/studio-morph-smoke.js` (шаблон room-study-smoke.js: уникальный PORT 3299, `serviceWorkers:"block"`, viewport 380×845, small-writes-only)
- Modify: `package.json` (`"smoke:studio-morph": "node scripts/premium/studio-morph-smoke.js"` рядом с 207-208)

- [ ] **Step 8.1: Написать smoke (падает до интеграции — TDD-проверка на чистом дереве не нужна, пишем после кода, но прогоняем оба исхода: с искусственно выключенным StudioMorph убедиться, что ключевые ассерты падают).** Сценарии (одна страница, последовательные акты):
```js
// boot: goto BASE + "/?canon=skip", ждать window.renderTable && window.StudioMorph
// СИД: pg.evaluate — currentTableData недоступен снаружи → рендер через глобалку:
//   window.v3RenderTableFromLibrary? НЕТ — она library-путь; используем прямой вызов:
//   pg.evaluate(() => { renderTable([{he:"אני הולך הביתה", he_niqqud:"אֲנִי הוֹלֵךְ הַבַּיְתָה", translit:"ani holekh habayta", ru:"я иду домой"}, ...5 строк]); })
//   ⚠ проверить: renderTable читает rows из аргумента; currentTableData сетится вызывающими —
//   для смоука выставить обе: pg.evaluate есть доступ к замыканию? НЕТ (classic script scope) —
//   но v3RenderTableFromLibrary = top-level function → window.v3RenderTableFromLibrary(rows) сетит currentTableData (26186) и рендерит. Использовать ЕЁ.
// A1: тумблер существует (#studioWordStatusToggle), легенда 7 точек
// A2: шита нет: !document.getElementById("classicRowSheet")
// A3: wrap: после рендера td[data-col=he] .rm-w count > 0
// A4: seed статуса: (await import("/db/local-db.js")).setWordStatus(lemmaKey("הולך"-канон), "l2") — ключ взять как в reader-word-status-smoke (LemmaCanon)
// A5: включить тумблер (cb.click()) → ждать .rm-w-l2 в таблице (декорация)
// A6: тап по слову → .rm-sheet.rm-open появился; в карточке .rm-status-btn (палитра)
// A7: клик rm-status-btn[data-rm-status=l3] → word_status в БД = l3 И слово перекрасилось .rm-w-l3
// A8: несохранённая таблица (наша и есть) — метка прошла без text_key (srs_text_key IS NULL допустим) → getSrsSchedule()[key] существует (FSRS-посев)
// A9: edit-mode: pg.evaluate включить tableEditModeEnter? (top-level fn) → клик по .rm-w → карточка НЕ открылась; exit → снова открывается
// A10: karaoke reuse: td с data-rm-wrapped: вызвать StudioKaraoke wrapCell-путь косвенно нельзя — проверить unit-ом: window.StudioKaraoke отсутствует API… пропустить DOM-путь, проверить статически (grep data-rm-wrapped в studio-karaoke.js) — вместо этого в smoke проверить, что после старта/стопа row-tts спаны сохраняют классы. Если row-tts в headless недоступен без ключа — пометить skip.
```
Каждый ассерт через `ok(cond, msg)`; выход с кодом 1 при failures.
- [ ] **Step 8.2**: `npm run smoke:studio-morph` → PASS.
- [ ] **Step 8.3: Commit** `test(studio): smoke:studio-morph — тумблер/карточка/метка/edit-mode/шит`.

---

### Task 9: Полный прогон гейтов + живая браузер-проверка

- [ ] **Step 9.1**: `npm run smoke:reader-word-status && npm run smoke:memory-canon && npm run smoke:room-study && npm run smoke:room-media && npm run smoke:reader-morph && npm run smoke:reader-parity && npm run smoke:studio-chunks && npm run smoke:studio-morph && npm run test:api-smoke` → все PASS.
- [ ] **Step 9.2: Живой браузер** (Playwright поверх `npm start`, НЕ headless-assert, а скрин-протокол): desktop 1280 + mobile 380×844; сценарий: вставить текст → перевести (если нет ключа — v3RenderTableFromLibrary-фикстура) → тумблер ON → скрин; тап по слову → карточка → скрин; поставить статус → перекраска → скрин; сохранить в библиотеку → открыть в Зале → тот же цвет → скрин. Скрины в `docs/research/studio-word-status/2026-08-05/` + README (artifact rule).
- [ ] **Step 9.3**: Проверить консоль на ошибки на обеих страницах (SW off, cache-bust `/?v=N`).
- [ ] **Step 9.4: Commit** скринов/README.

---

### Task 10: Деплой и прод-верификация

- [ ] **Step 10.1**: `git push` в main (Coolify автодеплой).
- [ ] **Step 10.2**: Прод: `https://linguistpro.kolosei.com/?v=<N>` — проверить load нового css/js (DevTools network через Playwright/Chrome), тумблер виден, консоль чистая. Зал: карточка открывается, стили не разъехались.
- [ ] **Step 10.3**: Память проекта: `project_studio_word_status_morph_card.md` + строка в MEMORY.md.

## Verification (end-to-end)

1. `npm start` → Студия: перевод любого текста → тумблер «🎨 Статус слов» → слова красятся; тап → карточка (статус/заметка/корень/спряжение/Pealim/🔊/наставник-на-сохранённом); долгий тап → поповер; кольцо+«вспомни» у due-слова.
2. Метка в несохранённой таблице → сохранить текст → открыть в Зале → цвет/статус идентичны.
3. Мобильный (380): тап по слову → карточка (НЕ шит); «Озвучить строку»/«Заметка» — в служебной колонке.
4. Все гейты Task 9.1 зелёные; прод отвечает, SW обновился.
