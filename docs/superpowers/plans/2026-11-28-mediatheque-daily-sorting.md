# Медиатека «Разложить» из «Видео дня» — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** владелец одним окном раскладывает видео из «Видео дня» по общедоступным (сразу) или личным Темам/Подборкам; через 5 дней неразложенное уходит в «Нераспределённые».

**Architecture:** чистые функции разбора — общий модуль `public/js/mediatheque-placement.js` (браузер и сервер, как mediatheque-core). Сервер применяет их узкой правкой (`writeNarrowEdition`) к опубликованной витрине и черновику. UI — новое окно в `mediatheque-ui.js`.

**Tech Stack:** Node/express, sqlite3, node:test, ванильный JS-модуль, Playwright для живой проверки.

**Spec:** `docs/superpowers/specs/2026-11-28-mediatheque-daily-sorting-design.md`

## Global Constraints

- ID: «Видео дня» `m_daily_video` (`DAILY_VIDEO`), «Нераспределённые» `{ id: 'm_unsorted_video', title: 'Нераспределённые' }`.
- Срок в «Видео дня»: 5 дней (`DAILY_KEEP_DAYS = 5`). Уборка раз в час, первая через 4 минуты после старта.
- Публичные записи только владельцу (`mediathequeOwner`), структура через `Mediatheque.command(..., { publicOnly: true })`.
- Новые строки — в локалях ru/en/he (tt-fallback мёртв); правка локали → `?v=` везде + `--write-lock`.
- Выпуск одним коммитом и одним пушем, версия 3.11.926 (CACHE_VERSION, APP_VERSION, футер Зала, `?v=`).

## Review Focus

1. Отмеченное место удалено в черновике, но есть в витрине (и наоборот) — витрина пишется, в черновике место пропускается, без 500.
2. Повторное нажатие / сетевой повтор — идемпотентно (`withIdempotency`), видео не дублируется.
3. Снятие всех отметок — видео остаётся в «Видео дня», пометка снова «Не разобрано»; из «Нераспределённых» не уходит.
4. Уборка не трогает видео моложе 5 дней и разложенные кладёт не в «Нераспределённые», а просто убирает из «Видео дня».
5. Не-владелец / предпросмотр — окна «Разложить» и пометок нет; маршрут отвечает 403.

---

### Task 1: модуль разбора

**Files:** Create `public/js/mediatheque-placement.js`; Test `tests/mediathequePlacement.test.js`.

**Interfaces — Produces** (`MediathequePlacement` / module.exports):
- `DAILY_ID = 'm_daily_video'`, `UNSORTED = { id: 'm_unsorted_video', title: 'Нераспределённые' }`, `INBOX_IDS = [DAILY_ID, UNSORTED.id]`.
- `placesOf(structure, key) -> [{ type: 'category'|'collection', id, title }]` — без INBOX_IDS.
- `placeLabel(structure, key) -> string` — пути через « / », Подборка как «Тема / Подборка»; '' если мест нет.
- `place(structure, ref, { places, create = [] }, C, options) -> structure` — `places`: полный желаемый набор `{type,id}`; `create`: `[{ tempId, type, title, categoryId? }]` (categoryId может быть tempId); создаёт новые (`category.create`/`collection.create`+`collection.update categoryId`), добавляет в отмеченные, убирает из снятых (вне INBOX_IDS), при непустом результате убирает из «Нераспределённых». Неизвестный id: `options.skipUnknown` ? пропустить : throw `MEDIATHEQUE_PLACE_UNKNOWN`. `options.newId(tempId)` даёт постоянный id.
- `sweep(structure, firstSeen: Map<key, ms>, now, C, days = 5) -> { structure, expired: [key], unsorted: [key] }`.

- [ ] Тесты: placesOf/placeLabel игнорируют inbox; place добавляет в тему+подборку, убирает снятую, создаёт тему и подборку в ней по tempId, убирает из «Нераспределённых» и не трогает «Видео дня»; пустые places — снимает всё, «Видео дня» цел; unknown → throw / skip; sweep: моложе 5 дней остаётся, старше и не разложено → в «Нераспределённые» (тема создаётся), старше и разложено → только уходит из «Видео дня».
- [ ] Красный прогон → реализация → зелёный: `node --test tests/mediathequePlacement.test.js`.

### Task 2: сервер

**Files:** Create `migrations/103_media_daily_seen.sql` (+ `down/103`); Modify `db/publicationRepo.js`, `server.js` (маршрут в списке операций, таймер); тестовые списки миграций (`tests/mediathequeDailyAddition.test.js`, `tests/mediaDailyPublisher.test.js`, `tests/helpers/newsDb.cjs` — где перечислены); Test `tests/mediathequeDailySorting.test.js`.

**Interfaces — Produces:**
- `media_daily_seen(item_key TEXT PRIMARY KEY, first_seen_at TEXT NOT NULL)`.
- `repo.placeMediathequeItem(actor, { ref, places, create }, opts) -> { edition_id, revision, places: [..] }`; 409 `MEDIATHEQUE_REFERENCE_UNAVAILABLE` если ref не опубликован; 400 `MEDIATHEQUE_PLACE_UNKNOWN`.
- `repo.sweepMediathequeDaily(actor, { now }) -> { expired, unsorted, edition_id? }` — без изменений не пишет издание.
- `publishMediathequeDailyAddition` записывает `media_daily_seen` (INSERT OR IGNORE).
- Маршрут `POST /api/publication/mediatheque/place` через существующий цикл операций (`['place','placeMediathequeItem']`).

- [ ] Тесты: place публикует сразу (getPublicMediatheque видит), черновик получает то же, посторонняя правка черновика не публикуется; неизвестное место 400; не-владелец 403; повтор с тем же idempotencyKey не дублирует; место, удалённое в черновике, пропускается; sweep с now+6д переносит неразложенное, оставляет свежее, без изменений не пишет издание; dot-публикация записывает first_seen.
- [ ] Красный → реализация → зелёный: `node --test tests/mediathequeDailySorting.test.js tests/mediathequeDailyAddition.test.js tests/mediaDailyPublisher.test.js`.

### Task 3: окно «Разложить», пометки, фильтр

**Files:** Modify `public/js/mediatheque-ui.js`, `public/css/mediatheque.css`, локали ru/en/he, `public/sw.js` и `server.js` (список precache: `/js/mediatheque-placement.js`); Test `tests/mediathequePlaceUi.test.js`.

**Interfaces — Consumes:** Task 1 (`placesOf`, `placeLabel`, `place`, `INBOX_IDS`), маршрут Task 2.
**Produces (в mediatheque-ui.js):** `placeTreeHtml(structure, key, query) -> html`, `placeBadgeHtml(item) -> html`, `openPlaceDialog(key)`.

- Окно: `<fieldset>` «Куда» (radio `target=public|mine`; у не-владельца только «Мои материалы»), поиск, дерево: Тема (checkbox `data-place="category:<id>"`), под ней её Подборки (`collection:<id>`), Подборки без Темы — группой «Без темы»; «+ новая подборка в «…»» и «+ новая тема» добавляют строку ввода. Отметка Подборки отмечает её Тему. Ответ: «Опубликовано: …» / «Сохранено в «Мои материалы»: …» / «Убрано из всех тем и подборок».
- Карточка у владельца в публичной витрине (не предпросмотр, не режим редактирования): кнопка «Разложить» вместо «В подборку»; в «Видео дня» и «Нераспределённых» — пометка «Разложено: …» / «Не разобрано». В «Видео дня» кнопка-переключатель «Только неразобранные».
- [ ] Тесты (vm-срез): дерево вкладывает Подборки в Темы, отмечает текущие места, не показывает inbox, поиск фильтрует; пометка разложено/не разобрано; не-владелец — нет кнопки «Разложить».
- [ ] Красный → зелёный; живая проверка Playwright (телефон 390 px, прод-оверлей, мок владельца и маршрута place).

### Task 4: выпуск 3.11.926

- [ ] Бамп версий, `node tests/i18n.smoke.js --write-lock`, `npm test`.
- [ ] Перед пушем: df, coolify healthy, `docker rmi` образа 3.11.924, builder prune; коммит, пуш, проверка прода (маршрут place 401/403 без входа, уборка в логе).
