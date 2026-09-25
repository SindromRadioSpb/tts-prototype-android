# Программа «UI к массовому релизу» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** довести Студию, Читальный зал и Медиатеку до спокойного, понятного с первого запуска интерфейса на телефоне и десктопе, не меняя концепцию учебной таблицы.

**Architecture:** работа идёт небольшими релизами: один экран или один сквозной компонент за раз. Сначала P0 из аудита, потом дизайн-токены, потом экраны. Parity-залоченный билдер таблицы (`public/js/reader-core.js` ≡ `renderTable` в `public/index.html`, гейт `smoke:reader-parity`) не меняется. Всё новое в таблице (номера строк, наборы колонок, ▶︎ медиа) делается через его легальные входы (`visibleColumns`, `baseWidths`) или пост-рендер-инъекцию, как сейчас `MediaHost.augmentRows`.

**Tech Stack:** PWA без сборщика: `public/index.html` (Студия, инлайн-скрипт), `public/library.html` + `public/js/library-ui.js` (Зал), `public/mediatheque.html` + `public/js/mediatheque-ui.js`, `public/sw.js`, локали `public/i18n/locales/{ru,en,he}.js`. Тесты — `node:test` (`npm test` → `scripts/test-unit.js`), браузерные проверки — Playwright 1.60.

**Spec:**
- аудит: `docs/research/ui-release-audit/2026-09-25/AUDIT.md` (находки P0-n / P1-n / P2-n);
- макеты направления D: `docs/research/ui-release-audit/2026-09-25/directions/` и канвас https://claude.ai/artifact/DE6Gnp1eJTDU7VxufKfGSS (строка D);
- решения владельца — раздел ниже.

## Решения владельца (2026-09-25)

| # | Решение |
|---|---|
| D1 | Учебная поверхность остаётся **горизонтальной таблицей** с выбором колонок и тянущимися ширинами на любой ширине экрана. Строки-карточки отклонены. |
| D2 | Слева колонка «Действие»: номер строки, озвучка TTS (точка — озвучка сохранена, кольцо — будет синтезирована), ИИ-наставник. Справа ▶︎ — звук из медиа (локальный файл или YouTube). |
| D3 | ▶︎ медиа стоит **следующим знаком после последнего слова** в последней видимой ячейке, через неразрывный пробел. Длительность и время не показываются. |
| D4 | Нумерация строк. |
| D5 | Статусы слов словами, данные не меняются: Новое · Незнакомо (1) · Узнаю (2) · Вспоминаю (3) · Почти знаю (4) · Знаю · Не учить. |
| D6 | Шрифты: Frank Ruhl Libre (иврит) + Golos Text (интерфейс, кириллица). Акцент — тхелет `#1B4FB8`; активная строка `#E3EBFA` / тёмная `#1A2740`. |
| D7 | Минимальная зона касания — 44 px. |
| D8 | На телефоне по умолчанию набор «Огласовка и перевод»; на десктопе — все колонки. |
| D9 | В интерфейсе на иврите (RTL) таблица зеркалится: «Действие» справа, последняя колонка с ▶︎ слева. |
| D10 | Значок наставника — линейная академическая шапочка, без эмодзи. |

## Global Constraints

- Не трогать данные ученика: `review_log`, SRS, статусы слов — только отображение. D5 меняет подписи, не значения `new|l1|l2|l3|l4|known|ignore`.
- Не менять parity-залоченный билдер таблицы; `npm run smoke:reader-parity` зелёный после каждого релиза, трогающего таблицу.
- Каждая новая строка интерфейса — в `ru`, `en`, `he` (fallback `tt()` мёртв); `node --test tests/i18n.smoke.js` зелёный перед пушем.
- Lockstep версий в каждом релизе: `CACHE_VERSION` (`public/sw.js`), `window.APP_VERSION` (`public/index.html`) и все `?v=` в `index.html`, `library.html`, `mediatheque.html` поднимаются вместе; `SHELL_INTEGRITY_PATHS ≡ PRECACHE_URLS`.
- Новый модуль, загружаемый оболочкой, добавляется в `PRECACHE_URLS`, в `<script>` обеих оболочек, где нужен, и в гейт `tests/shellModuleWiring.test.js`.
- Касание ≥ 44×44 px для всего, что появляется или меняется в релизе.
- Без заглушек; замеченное и не исправленное → `docs/planning/OBSERVATIONS_LOG.md`.
- Push в `main` = деплой в прод. Перед деплоем проверить диск прода (O-012); при высоком — `docker builder prune` (разрешено владельцем).

## Протокол релиза (для каждого R-n)

1. Скриншоты «до» скриптом аудита (`docs/research/ui-release-audit/2026-09-25/step.js`, `batch.js`) на затронутых экранах: 380 RU, 380 HE, 1280 RU; для визуальных релизов ещё тёмная тема и `FORCED=1`. Сохранять в `docs/research/ui-release-audit/<дата>/R<n>/before/`.
2. Реализация по задачам с TDD (`node:test`).
3. `npm test`, `node --test tests/i18n.smoke.js`, `npm run smoke:reader-parity` (если таблица), доменные smoke по месту.
4. Lockstep версий.
5. Скриншоты «после» локально (`AUDIT_BASE=http://127.0.0.1:3000`), те же ширины и темы, в `R<n>/after/`.
6. Коммит, push в `main`, деплой, проверка живой версии в чистом профиле скриптом аудита (`APP_VERSION` = новой версии), скриншоты с прода.
7. В `AUDIT.md` у закрытых находок пометка «закрыто в R<n> (<коммит>)».

## Карта релизов

| Релиз | Что | Находки аудита |
|---|---|---|
| R0 | Доставка новой версии уже установленным пользователям | P0-11, O-001 |
| R1 | Первый запуск: одно окно вместо трёх, пустой ввод Студии | P0-1, P0-12, P2-3 |
| R2 | Учебная таблица на телефоне: наборы колонок, ▶︎ в конце текста, перенос по словам, номера, 44 px | P0-7, P0-9 (таблица), P1-8, P1-15 (колонки), D1–D4, D7–D10 |
| R3 | Статусы слов словами и контраст | P1-11, D5 |
| R4 | Учебный экран: шапка Зала в тексте, учебный режим по умолчанию, видео по центру, согласие Dicta в карточке | P0-6, P0-8, P0-10 |
| R5 | Дизайн-токены: цвета, шрифты, радиусы, тёмная тема | P0-4, P0-5, P1-1, P2-1, P2-2 |
| R6 | Навигация трёх разделов и стартовый раздел нового профиля | P0-2, P2-11 |
| R7 | Студия после сборки: лимиты, путь к таблице, сохранение | P0-3, P1-4 (Студия), P1-5, P1-6, P1-7, P2-5, P2-9 |
| R8 | Полки Зала: один компонент «материал», скелет загрузки, вкладки | P1-10, P1-12, P1-13, P1-14, P2-12 |
| R9 | Слова и повторение: один словарь «Мои слова» | P1-2, P1-3, P2-7, P2-8 |
| R10 | Десктоп: видео и карточка слова слева, таблица справа | P1-16 |
| R11 | Иконки вместо эмодзи, жаргон, футер, HE-названия | P1-9, P1-4 (остаток), P1-17, P2-4, P2-6, P2-10 |

R0–R2 расписаны ниже по шагам. **R3–R11 расписываются так же подробно в начале своего релиза** против живого кода (правило: план старше эпика может врать). Здесь для них — объём, файлы и критерии приёмки.

## Review Focus

- **Скрытая колонка «Перевод»** (набор «Одна колонка» или «Свой набор» без перевода): ▶︎ медиа должна оказаться в конце последней видимой ячейки, а не пропасть. Тест в задаче 2.3.
- **Очень длинное слово или URL в ячейке 160 px** при переносе только по словам: ячейка не должна раздвигать таблицу за экран. Тест в задаче 2.4 (`overflow-wrap: break-word` остаётся запасным для слов длиннее ячейки).
- **Пользователь, уже настроивший колонки:** умолчание D8 применяется только к профилю без сохранённых настроек. Сохранённое не перезаписывается. Тест в задаче 2.2.
- **RTL-интерфейс:** номер строки и ▶︎ зеркалятся вместе с таблицей; неразрывный пробел перед ▶︎ не переносит кнопку на отдельную строку в начале. Тест в задаче 2.3 (bidi-изоляция кнопки).
- **Вкладка, открытая во время деплоя, с несохранённой правкой:** обновление не перезагружает её поверх правки (safe point) и доходит позже. Тест в задаче 0.3.

---

## R0 — Доставка новой версии

**Что известно (аудит, 2026-09-25):** профиль, не открывавший сайт давно, при первом входе получил 3.11.344 от старого service worker. Через несколько минут он сам перешёл на 3.11.635 (кэши `v3.11.635`, `waiting=null`). Модель по коду: старый worker отдаёт старую оболочку (`staleWhileRevalidate`), новый ставится в фоне и ждёт (`sw.js:15-25`). Переход — по тосту «Доступно обновление» (`index.html` ~52040, `library-ui.js` ~4650, `mediatheque-ui.js` ~844) после safe point. Не объяснено O-001: у владельца две перезагрузки не помогли, помог только `unregister()`.

### Задача 0.1: воспроизводимый стенд обновления

**Files:**
- Create: `scripts/premium/sw-update-browser-smoke.js`
- Modify: `package.json` (скрипт `smoke:sw-update`)

**Interfaces:**
- Produces: `npm run smoke:sw-update`. Выход 0 — все сценарии зелёные; иначе печатает сценарий и наблюдаемые `APP_VERSION`, `controller`, `waiting`.

- [ ] **Step 1: Написать стенд.** Локальный сервер (`PORT=3307`, как в `room-ux-maturity-browser-smoke.js`), персистентный профиль Playwright. Версию N+1 имитировать через `page.route`: подменить ответы `/sw.js` (строка `CACHE_VERSION = "vX"` → `vX-next`) и `/api/client-config` (`version` → `X-next`, `shellIntegrity` пересчитать по тем же файлам), а в HTML оболочек — `window.APP_VERSION`. Сценарии:
  - A: вкладка Студии на N → «деплой» N+1 → `registration.update()` → ждать тост → нажать «Обновить» → ожидать ровно одну перезагрузку и `APP_VERSION = N+1`;
  - B: то же в Зале и в Медиатеке;
  - C: две вкладки (Студия + Зал) → обновление из одной → вторая перезагружается или показывает тост;
  - D: закрыть все вкладки → открыть снова → первая загрузка отдаёт N (ожидаемо), тост появляется ≤ 10 с;
  - E: обычная перезагрузка ×2 без нажатия «Обновить» → записать, какая версия (воспроизведение O-001).
- [ ] **Step 2: Прогнать** `npm run smoke:sw-update`. Ожидаемо: A–D зелёные или красные с диагнозом; E фиксирует факт.
- [ ] **Step 3: Записать наблюдения** в `docs/research/ui-release-audit/<дата>/R0/SW_DIAGNOSIS.md`: какие сценарии красные, лог `controllerchange`, состояние `reg.waiting` при загрузке.

### Задача 0.2: исправить найденное (superpowers:systematic-debugging)

**Files:** по диагнозу; кандидаты — обработчики тоста в трёх оболочках и `public/sw.js`.

- [ ] **Step 1:** Для каждого красного сценария из 0.1 — гипотеза, минимальный тест в `tests/swUpdateFlow.test.js`, фикс. Уже видимые кандидаты:
  - при загрузке с уже существующим `reg.waiting` тост должен появляться сразу, не только по `updatefound`;
  - у Зала и Медиатеки нет проверки `registration.update()` при возврате на вкладку (`visibilitychange`);
  - нет подсказки «закройте другие вкладки», когда `SKIP_WAITING` отправлен, а `controllerchange` не пришёл за 5 с.
- [ ] **Step 2:** Тексты тоста и подсказки — ключи `app.updateAvailable`, `app.updateNow`, `app.updateCloseOtherTabs` в ru/en/he.
- [ ] **Step 3:** `npm run smoke:sw-update` — все сценарии A–D зелёные; E — версия N+1 после одного нажатия «Обновить».

### Задача 0.3: safe point не теряет правку

**Files:**
- Test: `tests/swUpdateFlow.test.js`

- [ ] **Step 1: Тест.**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("Studio defers the update while a draft, cell edit or save is open", () => {
  const html = read("public/index.html");
  const fn = html.slice(html.indexOf("window.v3PrepareForAppUpdate"), html.indexOf("window.__v3ApplyUpdate"));
  for (const guard of ["mode === \"draft\"", "_tableEditActiveEditorTd", "_tableEditDebounceTimers", "v3NotesModalIsDirty", "v3SaveMetaSaving"]) {
    assert.ok(fn.includes(guard), "safe point must check " + guard);
  }
  assert.match(fn, /UPDATE_DEFERRED_UNSAVED/);
});
```

- [ ] **Step 2:** `node --test tests/swUpdateFlow.test.js` → PASS (фиксирует контракт, чтобы фиксы 0.2 его не сломали).
- [ ] **Step 3:** Сценарий F в стенде 0.1: открыта правка ячейки → «Обновить» → предупреждение, перезагрузки нет, после сохранения повторное «Обновить» даёт N+1.
- [ ] **Step 4:** Коммит `fix(pwa): updates reach open tabs reliably (R0)`, протокол релиза, закрыть O-001.

---

## R1 — Первый запуск

### Задача 1.1: окно переноса с сервера только при реальных данных

`v3Phase6ShouldPrompt` (`index.html` ~28550) показывает окно любому новому посетителю, хотя серверная библиотека отвечает 410 (в консоли первого запуска — 410).

**Files:**
- Modify: `public/index.html` (функции `v3Phase6ShouldPrompt`, `v3Phase6ServerLibraryCount` и место их вызова)
- Test: `tests/firstRunModals.test.js`

- [ ] **Step 1: Тест.**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "..", "public/index.html"), "utf8");

test("server-migration prompt requires a positive server library count", () => {
  const start = html.indexOf("async function v3Phase6MaybePrompt");
  assert.ok(start > 0, "entry point exists");
  const body = html.slice(start, html.indexOf("\n}\n", start));
  assert.match(body, /v3Phase6ServerLibraryCount\(\)/);
  assert.match(body, /if \(!\(count > 0\)\)/, "no prompt when the count is 0, null or the endpoint is gone (410)");
});
```

- [ ] **Step 2:** `node --test tests/firstRunModals.test.js` → FAIL. Если точка входа называется иначе — найти вызов `v3Phase6ShouldPrompt()` и назвать обёртку `v3Phase6MaybePrompt`.
- [ ] **Step 3: Реализация.** В `v3Phase6MaybePrompt`: `const count = await v3Phase6ServerLibraryCount(); if (!(count > 0)) { localStorage.setItem(V3_PHASE6_DECISION_KEY, "none-on-server"); return; }` — затем прежний показ. Пробник возвращает `0` при 404/410 (сейчас `null` только при сетевой ошибке; 410 → 0).
- [ ] **Step 4:** тест → PASS; `npm test`.

### Задача 1.2: ключи BYOK — при первом действии, которому они нужны

**Files:**
- Modify: `public/index.html` (`byokOnboardingInit`, ~38157)
- Test: `tests/firstRunModals.test.js`

- [ ] **Step 1: Тест.** В `byokOnboardingInit` нет автопоказа по таймеру; показ зовётся из обработчика ошибки «нет ключа» (найти текущий путь `classifyGeminiError` → код отсутствующего ключа).

```js
test("BYOK onboarding is not auto-shown on load", () => {
  const init = html.slice(html.indexOf("function byokOnboardingInit"), html.indexOf("BYOK GUIDED TOUR"));
  assert.doesNotMatch(init, /setTimeout\(/);
});
```

- [ ] **Step 2:** FAIL → убрать `setTimeout`-автопоказ, вызвать `byokOnboardingShow()` из места, где действие требует ключ и его нет (одно место, с флагом «показано в этой сессии»). Бесплатные пути (Google Translate free, браузерная озвучка) окна не вызывают.
- [ ] **Step 3:** PASS; вручную в чистом профиле: сборка таблицы бесплатным провайдером → окна нет; «Упростить до моего уровня» (Gemini) → окно с объяснением.

### Задача 1.3: короткое приветствие

**Files:**
- Modify: `public/index.html` (`#v3OnboardingModal` разметка и CSS ~10622, логика ~51880)
- Modify: `public/i18n/locales/{ru,en,he}.js` (ключи `onboarding.*`)
- Test: `tests/firstRunModals.test.js`

- [ ] **Step 1: Тест:** модалка содержит три действия с `data-onb-go="room|mediatheque|studio"`; нет слов `IDE`, `offline-first`, `TTS`, `SRS` в ru-локали ключей `onboarding.*`.
- [ ] **Step 2: Реализация.** Заголовок «Добро пожаловать в LinguistPro». Одна строка «Читайте и слушайте иврит с переводом, огласовкой и разбором слов. Всё хранится на этом устройстве.» Три кнопки по 48 px: «Читать тексты» → `/library.html`, «Учить по видео» → `/mediatheque.html`, «Добавить свой текст» → закрыть и сфокусировать ввод Студии. Ссылка «Не показывать снова». На 380 все кнопки выше сгиба (проверка скриншотом).
- [ ] **Step 3:** ru/en/he, `node --test tests/i18n.smoke.js`.

### Задача 1.4: пустой ввод Студии и заголовок страницы

**Files:**
- Modify: `public/index.html` (значение `#inputText`, `<title>`, расчёт этапа `classicNextAction*`)
- Test: `tests/firstRunModals.test.js`

- [ ] **Step 1: Тест:** `<textarea id="inputText"` без текста-заглушки `אבטיפוס`, с `placeholder` из `data-i18n-placeholder`; `<title>` не содержит `TTS & Translator Dashboard`.
- [ ] **Step 2:** Реализация; этап «Исходный текст готов» считается от непустого ввода (проверить функцию шага, при пустом — этап 1 «Вставьте текст»).
- [ ] **Step 3:** PASS, i18n, протокол релиза (скриншоты первого запуска 380 RU/HE, 1280), коммит `feat(onboarding): one calm first-run screen (R1)`.

---

## R2 — Учебная таблица на телефоне

Общие факты кода:
- колонки Зала: `readerCfg` (`library-ui.js:1510`: `heOn`, `niqqudMode full|adaptive|off`, `translitOn`, `ruMode show|reveal|off`), хранение `room.*` в `localStorage`; `readerConfig().visibleColumns` — вход билдера;
- колонки Студии: `tableVisibleColumns` + `tablePreset` (`index.html:20498`, ключ `ttsDashboard_table_settings_v1`), сейчас `tablePreset` только `full|custom`;
- ▶︎ медиа: `MediaHost.renderRowReplay` (`media-host.js:~830`) добавляет `.smk-row-replay` в `td:last-child` строки. Скрытая колонка не рендерится билдером, поэтому последняя ячейка — последняя видимая. CSS кнопки: `library.html:1370`, `index.html:1963`;
- колонка «Действие»: режимы `full|rail|hidden` (`library-ui.js:1562`, «Рельс» 34 px).

### Задача 2.1: общий модуль наборов колонок

**Files:**
- Create: `public/js/table-presets.js`
- Test: `tests/tablePresets.test.js`

**Interfaces:**
- Produces: `window.TablePresets` / `module.exports`:
  - `PRESETS: string[]` = `["niqqud","translit","plain","three","hebrew","all"]`
  - `toColumns(id): {he:boolean, niqqud:boolean, translit:boolean, ru:boolean}`; неизвестный id → как `all`
  - `fromColumns(cols): string` — id набора или `"custom"`
  - `defaultFor(viewportWidth:number): string` — `< 600` → `"niqqud"`, иначе `"all"`

- [ ] **Step 1: Тест.**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../public/js/table-presets.js");

test("presets map to the owner's column pairs", () => {
  assert.deepEqual(P.toColumns("niqqud"), { he: false, niqqud: true, translit: false, ru: true });
  assert.deepEqual(P.toColumns("translit"), { he: false, niqqud: false, translit: true, ru: true });
  assert.deepEqual(P.toColumns("plain"), { he: true, niqqud: false, translit: false, ru: true });
  assert.deepEqual(P.toColumns("three"), { he: false, niqqud: true, translit: true, ru: true });
  assert.deepEqual(P.toColumns("hebrew"), { he: false, niqqud: true, translit: false, ru: false });
  assert.deepEqual(P.toColumns("all"), { he: true, niqqud: true, translit: true, ru: true });
  assert.deepEqual(P.toColumns("nope"), P.toColumns("all"));
});

test("fromColumns round-trips and reports custom", () => {
  for (const id of P.PRESETS) assert.equal(P.fromColumns(P.toColumns(id)), id);
  assert.equal(P.fromColumns({ he: true, niqqud: false, translit: true, ru: false }), "custom");
});

test("phone default is niqqud + translation, desktop shows all", () => {
  assert.equal(P.defaultFor(380), "niqqud");
  assert.equal(P.defaultFor(599), "niqqud");
  assert.equal(P.defaultFor(600), "all");
});
```

- [ ] **Step 2:** `node --test tests/tablePresets.test.js` → FAIL (модуля нет).
- [ ] **Step 3: Реализация.**

```js
// Наборы колонок учебной таблицы (решение владельца 2026-09-25). Чистый модуль:
// только отображение, вход parity-залоченного билдера не меняется.
(function () {
  "use strict";
  var MAP = {
    niqqud:   { he: false, niqqud: true,  translit: false, ru: true },
    translit: { he: false, niqqud: false, translit: true,  ru: true },
    plain:    { he: true,  niqqud: false, translit: false, ru: true },
    three:    { he: false, niqqud: true,  translit: true,  ru: true },
    hebrew:   { he: false, niqqud: true,  translit: false, ru: false },
    all:      { he: true,  niqqud: true,  translit: true,  ru: true },
  };
  var PRESETS = Object.keys(MAP);
  var KEYS = ["he", "niqqud", "translit", "ru"];
  function toColumns(id) { var m = MAP[id] || MAP.all; return { he: m.he, niqqud: m.niqqud, translit: m.translit, ru: m.ru }; }
  function fromColumns(cols) {
    for (var i = 0; i < PRESETS.length; i++) {
      var m = MAP[PRESETS[i]];
      if (KEYS.every(function (k) { return !!cols[k] === m[k]; })) return PRESETS[i];
    }
    return "custom";
  }
  function defaultFor(width) { return Number(width) < 600 ? "niqqud" : "all"; }
  var API = { PRESETS: PRESETS, toColumns: toColumns, fromColumns: fromColumns, defaultFor: defaultFor };
  if (typeof window !== "undefined") window.TablePresets = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
```

- [ ] **Step 4:** PASS. Подключить `<script src="/js/table-presets.js?v=…">` в `index.html` и `library.html` до основного кода, добавить в `PRECACHE_URLS` (`sw.js`) и в `tests/shellModuleWiring.test.js`. `npm test`.

### Задача 2.2: наборы в «Аа» Зала и умолчание для нового профиля

**Files:**
- Modify: `public/js/library-ui.js` (`loadReaderCfg` ~1511, `buildAidsPanel`)
- Modify: `public/i18n/locales/{ru,en,he}.js` (`room.aids.preset.*`)
- Test: `tests/tablePresets.test.js`

**Interfaces:**
- Consumes: `TablePresets.toColumns`, `fromColumns`, `defaultFor`
- Produces: `applyRoomPreset(id)` в `library-ui.js` — пишет `readerCfg`, сохраняет, перерисовывает таблицу

- [ ] **Step 1: Тест.**

```js
const fs = require("node:fs");
const path = require("node:path");
const ui = fs.readFileSync(path.join(__dirname, "..", "public/js/library-ui.js"), "utf8");

test("Room applies the viewport default only to a profile without saved columns", () => {
  const load = ui.slice(ui.indexOf("function loadReaderCfg"), ui.indexOf("function saveReaderCfg"));
  assert.match(load, /room\.niqqudMode/);
  assert.match(load, /TablePresets\.defaultFor\(/);
  assert.match(load, /hasSaved/, "default only when nothing is stored");
});

test("applyRoomPreset keeps adaptive niqqud and tap-to-reveal translation", () => {
  const fn = ui.slice(ui.indexOf("function applyRoomPreset"), ui.indexOf("\n}\n", ui.indexOf("function applyRoomPreset")));
  assert.match(fn, /niqqudMode === 'off' \? 'full' : readerCfg\.niqqudMode/);
  assert.match(fn, /ruMode === 'off' \? 'show' : readerCfg\.ruMode/);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Реализация.**

```js
function loadReaderCfg() {
  let hasSaved = false;
  try {
    const he = localStorage.getItem('room.heOn'); if (he != null) { readerCfg.heOn = he === '1'; hasSaved = true; }
    const nm = localStorage.getItem('room.niqqudMode'); if (nm === 'full' || nm === 'adaptive' || nm === 'off') { readerCfg.niqqudMode = nm; hasSaved = true; }
    const tp = localStorage.getItem('room.translitProfile'); if (tp === 'sbl' || tp === 'ru-phonetic') readerCfg.translitProfile = tp;
    const to = localStorage.getItem('room.translitOn'); if (to != null) { readerCfg.translitOn = to === '1'; hasSaved = true; }
    const rm = localStorage.getItem('room.ruMode'); if (rm === 'show' || rm === 'reveal' || rm === 'off') { readerCfg.ruMode = rm; hasSaved = true; }
  } catch (_) {}
  if (!hasSaved && window.TablePresets) applyRoomPresetCols(window.TablePresets.toColumns(window.TablePresets.defaultFor(window.innerWidth)));
}
function applyRoomPresetCols(cols) {
  readerCfg.heOn = !!cols.he;
  readerCfg.niqqudMode = cols.niqqud ? (readerCfg.niqqudMode === 'off' ? 'full' : readerCfg.niqqudMode) : 'off';
  readerCfg.translitOn = !!cols.translit;
  readerCfg.ruMode = cols.ru ? (readerCfg.ruMode === 'off' ? 'show' : readerCfg.ruMode) : 'off';
}
function applyRoomPreset(id) {
  applyRoomPresetCols(window.TablePresets.toColumns(id));
  saveReaderCfg();
  rerenderReaderTable();
}
```

`rerenderReaderTable` — существующая функция перерисовки из обработчиков «Аа». Перед реализацией найти её точное имя: `grep -n "saveReaderCfg();" public/js/library-ui.js` — что зовут следом. В `buildAidsPanel` над текущими переключателями добавить группу радио «Колонки таблицы» (`role="radiogroup"`, строки ≥ 44 px) с подписями из `room.aids.preset.{niqqud,translit,plain,three,hebrew,all}`: «Огласовка и перевод», «Транслит и перевод», «Иврит и перевод», «Огласовка, транслит и перевод», «Одна колонка», «Все колонки». Выбранное — `TablePresets.fromColumns` от текущего `readerConfig().visibleColumns`; при `custom` радио не отмечено, существующие переключатели («Свой набор») остаются ниже.
- [ ] **Step 4:** PASS; ru/en/he; `node --test tests/i18n.smoke.js`.

### Задача 2.3: ▶︎ медиа — следующий знак после текста, 44 px, без времени

**Files:**
- Modify: `public/js/media-host.js` (`renderRowReplay`)
- Modify: `public/library.html:1370`, `public/index.html:1963` (CSS `.smk-row-replay`)
- Test: `tests/mediaHost.test.js`

**Interfaces:**
- Produces: кнопка `.smk-row-replay` — последний inline-потомок **последнего текстового блока** последней видимой ячейки; перед ней текстовый узел `\u00A0`; `aria-label` = `t("studio.media.replaySegment")`.

- [ ] **Step 1: Тест** (добавить в `tests/mediaHost.test.js`, по образцу существующих jsdom-проверок файла; если jsdom там не используется — минимальный фейковый DOM с `appendChild` / `insertBefore` / `lastChild`).

```js
test("row replay sits inline after the last word of the last visible cell", () => {
  const { table, cells } = makeTable([["שלום", "Здравствуйте, добрый вечер."]]); // хелпер файла
  MediaHost.__renderRowReplayForTest(table, fakeAudio(), async () => ({}), (k) => k, () => {});
  const last = cells[0][1];
  const btn = last.querySelector(".smk-row-replay");
  assert.ok(btn, "button exists in the last visible cell");
  assert.equal(btn.previousSibling.nodeType, 3);
  assert.equal(btn.previousSibling.textContent, "\u00A0", "non-breaking space glues it to the last word");
  assert.equal(btn.textContent.trim(), "▶︎");
  assert.doesNotMatch(last.textContent, /\d:\d\d/, "no duration or timestamp");
});
```

- [ ] **Step 2:** FAIL (сейчас кнопка просто `appendChild` к ячейке, без неразрывного пробела; `__renderRowReplayForTest` ещё не экспортирован).
- [ ] **Step 3: Реализация.** В `renderRowReplay`: цель — `cell.querySelector(".cell-text, .rm-line") || cell` (перед реализацией проверить в DOM живой таблицы фактический класс внутреннего текстового блока); `target.appendChild(document.createTextNode("\u00A0")); target.appendChild(btn);`; экспорт `__renderRowReplayForTest: renderRowReplay` рядом с `augmentRows`. CSS в обеих оболочках:

```css
.smk-row-replay {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; margin: -12px -12px -12px -14px;
  padding: 0; border: 0; border-radius: 22px; background: transparent;
  color: var(--accent, #1B4FB8); font-size: 13px; line-height: 1; vertical-align: middle;
  unicode-bidi: isolate;
}
.smk-row-replay:focus-visible { outline: 2px solid var(--accent, #1B4FB8); outline-offset: -8px; }
tr.smk-row-active .smk-row-replay, tr.row-playing .smk-row-replay { box-shadow: inset 0 0 0 13px var(--accent-soft, #D3E0F8); }
```

  Отрицательные поля дают зону касания 44 px и не раздвигают строку текста; `unicode-bidi: isolate` держит ▶︎ после последнего слова и в RTL.
- [ ] **Step 4:** PASS; `npm run smoke:reader-parity` (билдер не тронут — зелёный); браузер 380 RU/HE: кнопка следует за последним словом, строка не выросла, скрытый «Перевод» → кнопка в конце огласовки.

### Задача 2.4: перенос только между словами, заголовки в одну строку

**Files:**
- Modify: `public/library.html` и `public/index.html` (правила `#proTable td`, `#proTable th`)
- Test: `tests/studyTableWrap.test.js`

- [ ] **Step 1: Тест.**

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

for (const shell of ["public/library.html", "public/index.html"]) {
  test(shell + ": table cells never break inside a word", () => {
    const css = read(shell);
    assert.doesNotMatch(css, /#proTable[^{]*\{[^}]*word-break:\s*break-all/);
    assert.doesNotMatch(css, /#proTable[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /#proTable td[^{]*\{[^}]*overflow-wrap:\s*break-word/, "fallback only for words longer than the cell");
    assert.match(css, /#proTable th[^{]*\{[^}]*white-space:\s*nowrap/);
  });
}
```

- [ ] **Step 2:** FAIL. Найти текущие правила: `grep -n "break-all\|overflow-wrap\|word-break\|hyphens" public/library.html public/index.html`.
- [ ] **Step 3:** Заменить на `overflow-wrap: break-word; word-break: normal; hyphens: manual;` для `td`, а для `th` — `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` с полным названием в `title`. Короткие подписи заголовков: «Огласовка» вместо «Огласовки»; «Транслит» без «(SBL)» — профиль виден в «Аа».
- [ ] **Step 4:** PASS; браузер 380: «Здравствуйте» не рвётся, заголовки в одну строку в наборах «Огласовка и перевод» и «Огласовка, транслит и перевод».

### Задача 2.5: номер строки и колонка «Действие» 44 px

**Files:**
- Modify: `public/js/library-ui.js` (пост-рендер после сборки таблицы, где инжектятся ☆ и 🤖; `ROOM_RAIL_PX`)
- Modify: `public/index.html` (такой же пост-рендер для Студии)
- Modify: CSS обеих оболочек; `public/i18n/locales/{ru,en,he}.js` (`room.study.actionColNarrow` = «Узкая»; `studio.table.rowNumber` = «Строка {n}»)
- Test: `tests/studyTableActionColumn.test.js`

- [ ] **Step 1: Тест:**
  - в обеих оболочках есть `.col-action-cell[data-row-n]::before { content: attr(data-row-n) }` с `font-variant-numeric: tabular-nums`;
  - пост-рендер ставит `data-row-n` = `idx + 1`, двузначно с ведущим нулём до 99 (`01`), дальше как есть;
  - `ROOM_RAIL_PX >= 52`;
  - кнопки колонки «Действие» имеют `min-width: 44px; min-height: 44px`;
  - в `library-ui.js` и `index.html` нет `🤖` в тексте кнопки наставника — вместо него инлайн-SVG шапочки с `aria-label`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Реализация.** Номер — атрибут + `::before`, без изменения билдера. Индикатор TTS: существующий кружок становится точкой 7 px на кнопке озвучки (заливка — озвучка сохранена, кольцо — будет синтезирована); логику состояния не менять, только разметку и CSS. Режим «Рельс» переименовать в «Узкая» (ключ локали; значение `rail` в `localStorage` не меняется). Ширина 52 px: номер + ▶ TTS на активной строке. SVG шапочки:

```html
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.4 10.9a1 1 0 0 0 0-1.8l-8.6-3.9a2 2 0 0 0-1.7 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.7 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>
```

- [ ] **Step 4:** PASS; `npm run smoke:reader-parity`; браузер 380 RU/HE (в RTL номер и «Действие» справа), 1280; тёмная тема; `FORCED=1`.

### Задача 2.6: наборы в Студии

**Files:**
- Modify: `public/index.html` (`tablePreset`, `loadTableSettings` ~20519, панель «ТАБЛИЦА: ОТОБРАЖЕНИЕ И СЦЕНАРИИ» ~12011)
- Test: `tests/tablePresets.test.js`

- [ ] **Step 1: Тест:** `loadTableSettings` при отсутствии сохранённого ключа применяет `TablePresets.defaultFor(innerWidth)`; `tablePreset` принимает значения из `TablePresets.PRESETS` и `custom`; `full` (старое значение) читается как `all`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Та же группа радио, что в Зале (общие ключи `room.aids.preset.*`), над чекбоксами колонок; выбор пишет `tableVisibleColumns` (колонку `action` не трогает) и `tablePreset`; ручной чекбокс → `fromColumns`.
- [ ] **Step 4:** PASS; `npm test`; `node --test tests/i18n.smoke.js`; протокол релиза; коммит `feat(table): column presets, inline media play, row numbers (R2)`.

---

## R3 — Статусы слов словами

**Объём:** подписи `l1..l4` вместо цифр в 5 местах: `library-ui.js:2088` и `:8024`, `reader-morph.js:1082`, `index.html:17781`, плюс `morph-host.js` / `studio-morph.js` / `knowledge-map-view.js`, если там есть легенды. Ключи `room.morph.status.l1..l4`: ru «Незнакомо / Узнаю / Вспоминаю / Почти знаю»; en «Unfamiliar / Recognize / Recalling / Almost know»; he «לא מוכר / מזהה / נזכר / כמעט יודע» (иврит — проверить у владельца). «игнор» → «Не учить». Цвета статусов: тёмный текст на светлой заливке ≥ 7:1 (значения — `directions/TokensD.dc.html`).
**Приёмка:** значения в хранилище не изменились (тест: словарь `STATUS_ORDER` тот же); контраст ≥ 4.5:1 у всех чипов в светлой и тёмной теме; чипы ≥ 44 px в карточке слова.

## R4 — Учебный экран

**Объём:** (1) в открытом тексте на ширине < 600 px шапка Зала (заголовок, иконки, «Медиатека», вкладки) скрыта всегда, не только в учебном режиме; (2) учебный режим включён по умолчанию для материалов с таблицей и медиа; (3) контейнер видео — симметричный отступ 16 px или во всю ширину, одинаково в LTR и RTL; (4) окно согласия Dicta не открывается на первом тапе: карточка открывается сразу с офлайн-разбором, внутри — строка «Уточнить по контексту (Dicta, облако)» с одноразовым согласием; текст ссылается на «Аа».
**Файлы:** `library-ui.js` (study mode, consent `room-consent`), `library.html` CSS, `public/css/study-video-source.css`.
**Приёмка:** на 380 таблица начинается не ниже y = 56 + высота видео + 40; видео x = 0 или 16 с обеих сторон (замер `getBoundingClientRect`); первый тап по слову — карточка без модалки.

## R5 — Дизайн-токены

**Объём:** `public/css/tokens.css` (одна точка правды) с переменными из `directions/TokensD.dc.html`: цвета light/dark (`--bg`, `--surface`, `--ink`, `--ink-2`, `--line`, `--accent`, `--accent-soft`, `--row-active`, статусы), радиусы 6/8/16, отступы 4…32, шрифты `--font-he: "Frank Ruhl Libre"`, `--font-ui: "Golos Text"`. Шрифты самостоятельно размещённые (`public/fonts/`, woff2, в `PRECACHE_URLS`; офлайн-first), без Google Fonts на проде. Подключить во всех трёх оболочках; заменить три синих и тёмную тему Студии (P0-4), кнопку «Медиатека» (P0-5); существующие `--theme-*` становятся псевдонимами новых (O-004 закрывается здесь).
**Приёмка:** `contrast()` из скрипта аудита — 0 провалов на ключевых экранах в светлой и тёмной теме; один синий акцент; ≤ 2 семейства шрифтов в `fonts()` на экранах чтения.

## R6 — Навигация

**Объём:** общая навигация «Зал · Медиатека · Студия · Повторение» (нижняя панель на телефоне с подписями, 56 px + safe-area; верхняя на десктопе); скрыта в открытом тексте на телефоне. Новый профиль (нет текстов и прогресса) на `/` попадает в Зал; Студия — по кнопке. Один знак продукта во всех шапках.
**Приёмка:** из любого раздела любой другой — одним касанием; «Разделы и настройки» Студии больше не единственный путь в Зал.

## R7 — Студия после сборки

**Объём:** панель «Лимиты и квоты» показывает только локальные счётчики этого браузера или убрана из пользовательского UI; серверные агрегаты — в диагностику (закрывает O-013). После сборки — прокрутка к таблице; статус-пилюли сворачиваются в одну строку-итог; «Скачать JSON результата» и «Горячие клавиши» — в «Подробнее». Диалог сохранения: локализованные подсказки, одна кнопка закрытия, липкий футер; квитанция без дублей и технических полей.
**Приёмка:** на 380 после «Создать таблицу» первая строка таблицы в окне без прокрутки вручную; в квитанции нет «Кэш таблицы», «Провайдер» (в «Подробнее»).

## R8 — Полки Зала

**Объём:** один компонент «материал» для полок, «С чего начать» и конца текста; скелет полок сразу; фиксированный набор вкладок без обрезки; бейдж «Нужен профиль слов» / «Не менее 0%» скрыт у нового профиля; «17 строк» вместо «17 стр.».

## R9 — Слова и повторение

**Объём:** словарь терминов ru/en/he; «Сохранить слово» → «Добавить в мои слова» → тост «Добавлено в мои слова» → лист «Мои слова» с вкладками «Список / Повторение»; кнопки-иконки листа с подписями; тост не перекрывает кнопки.

## R10 — Десктоп

**Объём:** ≥ 1024 px: видео слева (480 px, липкое), под ним карточка слова вместо нижнего листа; таблица справа со всеми колонками (макет `TableDesktop.dc.html`).

## R11 — Иконки и язык

**Объём:** линейные иконки вместо эмодзи (🤖 ☆ 🔍 📖 🎬 🎨 📚 🎯 🆕 📦 🌳 🕸 🔧), жаргон на поверхности → «Подробности», футер пользователя без «Made with», «GitHub», версии и диагностики (они в «О приложении»), HE-интерфейс показывает оригинальное название материала, bidi-скобки в колонке огласовки.

---

## Self-review

- Все 41 находки аудита разнесены по релизам (P0-1…P0-12 → R0, R1, R2, R4, R5, R6, R7; P1/P2 → R2…R11).
- Решения владельца D1–D10 → R2 (D1–D4, D7–D10), R3 (D5), R5 (D6).
- Имена между задачами согласованы: `TablePresets.{PRESETS,toColumns,fromColumns,defaultFor}`, `applyRoomPreset`, `applyRoomPresetCols`, `.smk-row-replay`, `data-row-n`, `__renderRowReplayForTest`.
- Места, где точное имя функции надо подтвердить в живом коде перед правкой: перерисовка таблицы Зала (2.2), класс внутреннего текстового блока ячейки (2.3), точка входа окна Phase 6 (1.1), обработчик «нет ключа» (1.2). Для каждого в шаге указан способ проверки.
