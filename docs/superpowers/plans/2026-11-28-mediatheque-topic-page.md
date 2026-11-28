# Медиатека: страница темы — план (3.11.927)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** страница темы Медиатеки: лента подборок сверху, листалка у списка, тихие карточки, ясная левая панель, телефонный выбор темы, поиск в теме.

**Architecture:** только фронтенд. Разметка — строковые шаблоны в `public/js/mediatheque-ui.js` (`catalogHtml`, `channelCollections`, `itemHtml`, `pager`); стили — `public/css/mediatheque.css`; строки — `window.I18N_LOCALES.<lang>.mediatheque` в ru/en/he.

**Tech Stack:** vanilla JS, node:test + vm-срез функций (как `tests/mediathequeDailyTab.test.js`), Playwright-снимки `scripts/art/gouache/shots.js`.

**Spec:** `docs/superpowers/specs/2026-11-28-mediatheque-topic-page-design.md`

## Global Constraints
- Новые строки — во всех трёх локалях; правка локали → `?v=` локалей во всех `public/*.html`, в `public/sw.js` и в списке в `server.js`, затем `node tests/i18n.smoke.js --write-lock`.
- Выпуск 3.11.927: `CACHE_VERSION`, `window.APP_VERSION`, `roomFooterVersion`, `?v=927` для `mediatheque-ui.js`/`mediatheque.css` — одним коммитом.
- RTL: только `inline-*`/`block-*` свойства; заголовки с `dir="auto"`.
- `organizeMode()` и `state.space==='personal'` сохраняют текущие кнопки карточки.

## Review Focus
1. Тема без подборок — ленты нет, список сразу под шапкой (тест в Task 1).
2. Тема ≤36 материалов — листалок нет, подпись «Материалов: N» без диапазона (Task 1).
3. Последняя страница: диапазон «73–95 из 95», не «73–108» (Task 1).
4. Меню «⋯» закрывается после действия и по клику вне него; Esc закрывает (Task 2, проверка снимком/скриптом).
5. Подборка открыта (`filters.collection`) — лента подборок не показывается, поиск говорит «Найти в «<подборка>»» (Task 1, Task 4).

---

### Task 1: Порядок страницы темы + листалка с диапазоном
**Files:** Modify `public/js/mediatheque-ui.js` (`channelCollections`, `catalogHtml`, `pager`, обработчик `previous-page/next-page`); `public/css/mediatheque.css`; локали; Test: `tests/mediathequeTopicPage.test.js`.

**Interfaces — Produces:** `pageRange(page:number,size:number,total:number) -> {from:number,to:number}`; `pager(pages:number, total?:number, size?:number) -> string` (с `total` рисует `<span class="ml-pager-range">` по ключу `pageRange` «{from}–{to} из {total}»); `channelCollections(category)` возвращает `<section class="ml-channel-rail">` с заголовком `t('channelSeries')`, ссылкой `t('allSeries',{count})` на `section:'collections'` и `<div class="ml-rail">` со всеми подборками темы (без среза 12).

- [ ] Тест: `pageRange(3,36,95)` → `{from:73,to:95}`; `pageRange(1,36,95)` → `{from:1,to:36}`; в HTML `catalogHtml()` для темы с подборками индекс `ml-channel-rail` < индекс `ml-materials` < индекс последнего `ml-pager`; верхний `ml-pager` стоит до `ml-materials`; при 30 материалах `ml-pager` нет; тема без подборок — нет `ml-channel-rail`; при `filters.collection` — нет `ml-channel-rail`.
- [ ] Прогон → FAIL.
- [ ] Реализация: в `catalogHtml` лента сразу после `descriptionHtml/collectionContextHtml`, перед фильтрами; блок списка `<section class="ml-results" id="ml-results">` с заголовком «Все материалы · диапазон» + верхней листалкой, карточками, нижней листалкой. Смена страницы прокручивает к `#ml-results` (не к `#ml-content`).
- [ ] CSS: `.ml-rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,230px);overflow-x:auto;scroll-snap-type:x mandatory;gap:16px}`; карточки подборки в ленте компактные (арт ≤110 px). Старые правила `.ml-channel-series` удалить.
- [ ] Прогон → PASS; `node --test tests/mediatheque*.test.js` зелёный.

### Task 2: Тихая карточка — «Изучать» + меню «⋯»
**Files:** `itemHtml` в `public/js/mediatheque-ui.js`; CSS; локали; Test: `tests/mediathequeTopicPage.test.js`.

**Interfaces — Produces:** `<details class="ml-more"><summary aria-label="t('moreActions')">⋯</summary><div class="ml-more-menu" role="menu">…</div></details>`.

- [ ] Тест: вне `organizeMode` у публичной карточки в подвале видимы только `ml-open` и `details.ml-more`; кнопки `share-link`, `add-item` и ссылка `ml-tutor` — внутри `.ml-more-menu`; `place-item` (владелец) — вне меню; в `organizeMode` разметка подвала прежняя (меню нет).
- [ ] FAIL → реализация → PASS.
- [ ] Поведение: после `onAction` закрыть ближайший `details.ml-more`; клик вне и `Escape` закрывают открытое меню. Меню позиционируется `inset-inline-end:0`.

### Task 3: Левая панель ПК — каналы, темы, подборки выбранной темы
**Files:** функция `sideHtml(d, path, category, collection)` (новая) в `mediatheque-ui.js`, вызов из `catalogHtml`; CSS; локали; Test: тот же файл.

**Interfaces — Produces:** `sideHtml(...) -> string`; канал = корневая тема с `id.startsWith('yt_')`.

- [ ] Тест: заголовки групп `t('sideChannels')` и `t('sideTopics')`; каждая ссылка содержит `<small>` с `categoryCount`; под текущей темой — `<div class="ml-side-sub">` с подтемами и подборками (`collection` в href) и числом материалов; выбранная подборка помечена `aria-current="page"`; группа без элементов не выводится; в `personal` групп нет (одна прежняя колонка).
- [ ] FAIL → реализация (без среза 20 для каналов; «Карта тем» внизу) → PASS.

### Task 4: Телефон — текущая тема на кнопке; поиск в теме
**Files:** `filtersHtml`, `catalogHtml`, обработчик input; CSS; локали; Test: тот же файл.

**Interfaces — Produces:** `<input type="search" id="ml-scope-search" class="ml-scope-search">` — пишет `state.filters.q` тем же путём, что `ml-search` (debounce 200 мс, `persist`), и синхронизирует значение верхнего поля; кнопка `search-all` рядом.

- [ ] Тест: при `filters.category` кнопка `open-filters` подписана `t('topicButton',{title})`; без темы — `t('topicsAndFilters')`; поле `ml-scope-search` есть только при теме/подборке, placeholder `t('searchIn',{title})` (для подборки — её название).
- [ ] FAIL → реализация → PASS.

### Task 5: Проверка глазами, выпуск
- [ ] Снимки ПК 1440 и телефона 390 темы «כאן 11» (страницы 1 и 3, открытое меню «⋯», поиск «מלחמה»), тема без подборок, тёмная тема, интерфейс he (RTL).
- [ ] Бамп версий (Global Constraints), `node tests/i18n.smoke.js --write-lock`, `npm test` зелёный.
- [ ] Один коммит `feat(mediatheque): 3.11.927 — …` (спека+план+код), пуш в main, проверка живой версии.
