# Новости W5: личная настройка читателя — план

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Читатель видит издания по группам, «Мои издания» сверху в своём порядке, скрывает ненужные, а в «Обзоре дня» переключает «Все издания | Мои (N)»; настройки у гостя — в браузере, у вошедшего — в аккаунте.

**Spec:** `docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md` §7 (утверждено владельцем), решения 7–8 §12.

## Global Constraints
- Три состояния издания для читателя: «мои» (упорядочено), обычное, скрытое. «Все» = включённые владельцем минус скрытые читателем; «Мои (N)» = только «мои».
- Фильтр — на сервере (`outlets=` в `/api/news/list`), счётчики и листание дат считают только видимое; общий обзор и работа dot не меняются.
- Гость — `localStorage` `lp_news_prefs_v1`; старый `lp_news_pinned_v1` переносится в «мои» один раз. Вошедший — `news_reader_prefs` (миграция 097), `GET/PUT /api/news/prefs` (CSRF, ≤ 8 КБ); при первом входе с пустым аккаунтом — переносятся настройки браузера.
- Новое издание (включено ≤ 7 дней назад) — метка «новое» на плитке; само в «Мои» не добавляется.
- Строки — ru/en/he; выпуск 3.11.919.

## Review Focus
1. В «Мои» нет ни одного издания → режим «Мои» не показывает пустоту молча: подсказка «добавьте издания» и кнопка настройки — тест `mine with no outlets says how to add`.
2. Издание из «моих», которое владелец выключил, не ломает список и не уходит в запрос — тест `prefs ignore outlets that are not shown`.
3. Испорченный `localStorage` → настройки по умолчанию, без падения — тест `broken stored prefs fall back to defaults`.
4. Сервер получает `outlets=` с чужими id или 200 id → 400 без утечки — тест `outlets param is validated`.
5. Порядок «моих» сохраняется после перезагрузки и на другом устройстве — тест `order survives a round trip through the server`.

---
### Task 1: Сервер — фильтр `outlets`, настройки читателя, «новое»
`db/newsList.js` (`p.outlets` → `IN`, и в `latestDay/neighbours`), `news/newsRoutes.js` (`listParams` разбирает `outlets`, ≤ 60 id из каталога; `GET/PUT /api/news/prefs`; публичный `/api/news/outlets` отдаёт `enabled_at`), create `db/newsReaderPrefs.js`, `migrations/097_news_reader_prefs.sql` (+ `enabled_at` для 15 изданий волны 4). Тесты: `tests/newsReaderPrefs.test.js`, `tests/newsList.test.js`.
### Task 2: Модуль настроек в браузере
create `public/js/news-prefs.js`: `normalize(raw, knownIds)`, `load(store)`, `save(store, prefs)`, `move(prefs, id, dir)`, `setState(prefs, id, 'mine'|'shown'|'hidden')`, `visible(prefs, outlets, mode)`, `migratePins(store)`; синхронизация с сервером для вошедшего. Тест: `tests/newsPrefs.test.js`.
### Task 3: Главная по группам и панель «Настроить»
`public/js/news-ui.js` (`renderHomeGroups(doc, outlets, prefs, opts)`, `renderPrefsPanel(doc, outlets, prefs, opts)`), `public/css/news.css`, локали. Тест: `tests/newsUi.test.js`.
### Task 4: «Все | Мои (N)» в Обзоре
`public/js/news-list-ui.js` (переключатель в шапке Обзора, `outlets=` в `listUrl`, пустое «Мои» с подсказкой), `public/js/news-ui.js` (передать `prefs`). Тест: `tests/newsListUi.test.js`.
### Task 5: Выпуск 3.11.919 — `npm test`, браузерная проверка (телефон 390 px, RTL), ревью, прод.
