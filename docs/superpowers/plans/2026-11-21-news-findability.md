# Новости: найти, пометить, заказать — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Обзор дня и вкладки изданий становятся одним экраном с дата‑навигацией, порядком «учебные → в срезе», полным поиском (в т. ч. по тексту за 45 дней), фильтрами, сортировкой, тегами/★ и заказами dot.

**Architecture:** Новая производная таблица `news_index` (одна строка на статью — из среза или учебную) + FTS5 `news_search` над ней; один эндпоинт `GET /api/news/list` отдаёт отфильтрованные и отсортированные страницы; клиент рисует их одним модулем `news-list-ui.js` для Обзора и издания. Тела статей среза живут 45 дней (gzip после 3), отметки — отдельные таблицы; заказы dot — очередь, исполняемая его ключом через существующие `extras`/`archive-order`.

**Tech Stack:** Node.js + Express, SQLite (`sqlite3`, FTS5 с `contentless_delete`), vanilla JS UMD‑модули в `public/js`, `node:test` + `linkedom`.

**Spec:** `docs/superpowers/specs/2026-11-21-news-findability-design.md`

## Global Constraints

- Пять волн W1–W5; каждая — отдельный выпуск: один полный коммит и один пуш (`feedback_release_commit_complete_single_push`); перед пушем — `df`, coolify‑db healthy, `docker rmi` предыдущего образа, `builder prune` (`feedback_prod_build_cache_prune_authorized`).
- Каждый выпуск: следующий номер `APP_VERSION` (сейчас 3.11.908), `CACHE_VERSION` в `public/sw.js`, `?v=` у изменённых файлов в `public/news.html`, `public/sw.js` и списке целостности оболочки в `server.js` (≈ строка 1455) — по построению одинаково (`feedback_version_lockstep_bump`).
- Новые строки интерфейса — ключи `news.*` в `public/js/i18n/` ru/en/he (вложенные `I18N_LOCALES.<loc>.news…`), затем `--write-lock` замка локалей и `?v=` локалей везде; запасной текст `t()` не считается (`feedback_tt_fallback_dead_add_locale_keys`).
- День статьи = израильская дата (`Asia/Jerusalem`) `first_seen_at` строки среза; учебная без строки среза — израильская дата `published_at` (спека §8а п.2).
- Хранение: текст статей среза и FTS — 45 дней (gzip после 3 дней); фото несобранных — 3 дня; помеченные владельцем — без срока; при свободном месте < 2 ГБ сокращать начиная со старых непомеченных (спека §2 п.5, §8а п.7).
- Весь функционал (поиск по тексту, фильтры, сортировка, «Читать оригинал», теги, ★) — всем посетителям; заказы dot — только владелец/редактор (спека §8а п.1).
- Нормализация иврита для индекса и запроса — одна функция (`news/newsSearchNorm.js`, поверх `db/hebrewNorm.js`): без огласовки, финальные формы → обычные, гереш `'`/`׳` и кавычки `"`/`״` — к одному знаку.
- Лимиты: страница 60 строк; сниппет ≤ 200 знаков; заказ по тегу ≤ 50 статей; запрос `q` ≤ 200 знаков.
- Длинные списки: без `:has` на html/body, догрузка через IntersectionObserver, без синхронной пересборки всего списка на ввод (`feedback_long_table_perf_rules`).
- Тема: токены `--nw-*`, тёмная — `body.nw-dark`, переопределения «Гуаши» в `public/css/lp-gouache.css`; скрытые блоки с авторским `display` — правило `.cls[hidden]{display:none}`.
- Миграции — по skill `anthropic-skills:sqlite-migration-safety`: `IF NOT EXISTS`, файл отката в `migrations/down/`, бэкфилл — кодом, не SQL‑миграцией; номера с 091.
- Проверка в браузере — на свежем коде (SW отдаёт старое; `feedback_browser_verify_fresh_code`), через `shots.js` на непустом дне (300+ статей).

## Review Focus

1. Длинный день (400+ статей) и набор запроса на iPhone — без зависаний: страницы по 60, отмена прежнего запроса, задержка 300 мс. → тест в Task 2.5 (`list: page size and cursor`), проверка в Task 2.7.
2. Иврит с огласовкой, приставкой или разным герешем (`הבחירות`/`בחירות`, `צ'ילה`/`צ׳ילה`) находит одно и то же. → тест в Task 2.2.
3. Учебная статья без строки среза (пакеты до сборщика) остаётся видна во вкладке издания, как в старой ленте. → тест в Task 2.3.
4. Одна статья под двумя ключами (`url_key` и `canonical_key`, обновление изданием) — одна строка, а не две. → тест в Task 2.3.
5. Посетитель без входа и с запрещённым хранилищем (приватный режим) — отметки честно сообщают «не сохраняются на этом устройстве», страница работает. → тест в Task 4.4.

---

## W1 — порядок и метки (без миграций)

### Task 1.1: Серверный порядок сюжетов и метка dot

**Files:**
- Modify: `db/newsOverviewItems.js` (`day()`, сортировка ≈ строки 120–127; `linkWorks`)
- Test: `tests/newsOverviewItems.test.js`

**Interfaces:**
- Produces: `freshness(item) -> number` (ms; `max(changed_at, edition_published_at, published_at)`), экспорт рядом с `createOverviewItems`; у статей обзора новое поле `selected_by` (из `news_harvest_items.selected_by` по `url_key`/`canonical_key`, `null` если нет).

- [ ] **Step 1: Failing tests**
  - `overview day: stories with a study article come first, then by freshness, rubric ignored` — три сюжета: `security` без учебной (свежий), `politics` с учебной (старый), `culture` с учебной (свежий) → порядок `culture, politics, security`.
  - `overview day: items inside a story — study ones first, then freshness by changed_at/edition time` — статья с `changed_at` позже `published_at` соседки идёт выше.
  - `overview day: selected_by from the harvest row is on the item` — строка среза с `selected_by='dot'` → `it.selected_by === 'dot'`.
- [ ] **Step 2:** `node --test tests/newsOverviewItems.test.js` → FAIL (порядок по рубрике, нет `selected_by`).
- [ ] **Step 3:** Сортировка `list.sort`: `(b.main - a.main) || (fresh(b) - fresh(a)) || (outlets(b) - outlets(a))`, где `fresh(story) = max(freshness(item))`; внутри сюжета `(!!b.work_id - !!a.work_id) || (freshness(b) - freshness(a))`. `ORDER`/`group` из сортировки убрать. `selected_by` — один запрос пачками по 400 рядом с `linkWorks`.
- [ ] **Step 4:** тесты PASS; `npm test` зелёный.

### Task 1.2: Обзор — каждая учебная статья видна, «Учебные → В срезе», счётчики

**Files:**
- Modify: `public/js/news-ui.js` (`filterByEdition` ≈ 203, `ovItem` ≈ 212, `renderStory` ≈ 233, `renderOverview` ≈ 498)
- Modify: `public/css/news-reader.css` (или `news.css` — где живут `.nw-ov-*`), `public/css/lp-gouache.css` при необходимости
- Modify: локали ru/en/he — ключи `news.overview.learnSection`, `news.overview.sliceSection`, `news.overview.counts` («Учебных {learn} · в срезе {slice}»), `news.overview.learnBadge` («учебная»), `news.overview.byDot` («выбрано dot»)
- Test: `tests/newsUi.test.js`

**Interfaces:**
- Produces: `splitLearn(stories) -> { learn: Item[] /* все статьи с work_id, по freshness */, slice: Story[] /* сюжеты только со статьями без work_id */ }` — экспорт UI.
- `filterByEdition` пересчитывает `main = items.some(work_id)` после фильтра.

- [ ] **Step 1: Failing tests**
  - `splitLearn: every study article of a story is listed, not only the first` — сюжет с двумя учебными и одной из среза → `learn.length === 2`, `slice[0].items.length === 1`.
  - `splitLearn: learn sorted by freshness across stories`.
  - `filterByEdition: main is recomputed after filtering` — учебная статья не из выбранного выпуска → `main === false`.
  - `ovItem: a study item has a Read link and badges` — `a.nw-ov-read[href^="/library.html?news="]`, текст «учебная», при `selected_by:'dot'` — «выбрано dot».
- [ ] **Step 2:** `node --test tests/newsUi.test.js` → FAIL.
- [ ] **Step 3:** `renderOverview`: заголовок‑счётчик, секция «Учебные материалы · N» (плоский список `ovItem(..., big=true)` с кнопкой), затем «Только в срезе · M» (сюжеты из `slice`, порциями по 60 как сейчас). Рубрика и выпуск фильтруют обе секции.
- [ ] **Step 4:** тесты PASS; `npm test` зелёный.

### Task 1.3: Выпуск W1

- [ ] Версии/локали/SW по Global Constraints; `npm test`.
- [ ] Проверка в браузере (локальный `public/` поверх прода через `shots.js`): день с учебными статьями dot — все наверху; 380 px и десктоп; светлая/тёмная.
- [ ] Подготовка диска, коммит `feat(news): 3.11.9xx — study articles first in the day overview`, пуш, проверка живой версии.

---

## W2 — единый экран, индекс и поиск по заголовкам/абзацам

### Task 2.1: Миграция индекса

**Files:**
- Create: `migrations/091_news_index.sql`, `migrations/down/091_news_index.sql`
- Modify: `tests/helpers/newsDb.cjs` (добавить 091 в `MIGRATIONS`)

**Interfaces:**
- Produces:
  - `news_index(rid INTEGER PRIMARY KEY, item_key TEXT UNIQUE NOT NULL, day TEXT NOT NULL, outlet_id TEXT NOT NULL, section TEXT, story_key TEXT, edition_slot TEXT, published_at TEXT, fresh_at TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('learn','slice')), work_id TEXT, selected_by TEXT, paywalled INTEGER NOT NULL DEFAULT 0, full_ok INTEGER NOT NULL DEFAULT 0, title_he TEXT NOT NULL, title_ru TEXT, subtitle_he TEXT, subtitle_ru TEXT, lead_he TEXT, lead_ru TEXT, url TEXT, body_until TEXT, updated_at TEXT NOT NULL)`;
  - индексы `(day, kind, fresh_at DESC)`, `(outlet_id, day, kind, fresh_at DESC)`, `(story_key)`;
  - `news_search USING fts5(he, stems, ru, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0')`, rowid = `news_index.rid`.
- [ ] Миграция применяется дважды без ошибок; откат удаляет обе таблицы. Тест `migration 091 is idempotent` в `tests/newsIndex.test.js`.

### Task 2.2: Нормализация поиска

**Files:**
- Create: `news/newsSearchNorm.js`
- Test: `tests/newsSearchNorm.test.js`

**Interfaces:**
- Produces: `normHe(text) -> string` (через `db/hebrewNorm.js` + гереш/кавычки), `stemsHe(norm) -> string` (для каждого слова — варианты без 1–2 ведущих проклитик из `ו ה ב ל מ ש כ`, слово ≥ 2 букв после снятия), `normRu(text) -> string` (lower, ё→е), `ftsQuery(q) -> string | null` (каждое слово запроса — префиксный терм `"w"*`, ивритское слово ищется в `he` OR `stems`, кириллица — в `ru`; кавычки экранированы; пустой → `null`).

- [ ] **Step 1: Failing tests**
  - `normHe: niqqud and final forms` — `normHe('הַבְּחִירוֹת')` = `normHe('הבחירות')`.
  - `normHe: geresh variants are one` — `normHe("צ'ילה") === normHe('צ׳ילה')`.
  - `stemsHe: prefixes stripped` — `stemsHe(normHe('ובבחירות'))` содержит `בחירות`; `stemsHe('של')` не даёт однобуквенных.
  - `ftsQuery: injection-safe` — `ftsQuery('a" OR x')` не содержит несбалансированных кавычек; `ftsQuery('   ')` → `null`.
- [ ] **Step 2–4:** FAIL → реализация → PASS.

### Task 2.3: Наполнение индекса

**Files:**
- Create: `db/newsIndex.js`
- Test: `tests/newsIndex.test.js`

**Interfaces:**
- Consumes: `normHe`, `stemsHe`, `normRu` (Task 2.2).
- Produces: `createNewsIndex({ db, now }) -> { refresh(keys: string[]): Promise<{ upserted, removed }>, backfill({ batch = 200 }): Promise<number>, prune(nowMs): Promise<number>, israelDay(iso) }`.
  - `refresh` для каждого ключа собирает строку из `news_harvest_items` (по `url_key` или `canonical_key`; `status='failed'` → строки нет), `news_overview_items` (переводы, `story_key`, `edition_slot`), `news_articles`/`news_works` (`work_id` первой позиции при `tier IN ('fresh','archive')` → `kind='learn'`, иначе `'slice'`); учебная без строки среза — `day = israelDay(published_at)`. Пишет `news_index` (UPSERT, `feedback_upsert_preserve_columns`) и строку FTS (delete + insert по `rid`). Тело в W2 не индексируется.
  - `prune` удаляет строки `kind='slice'` с `day` старше 45 дней (W4 добавит исключение помеченных) вместе с FTS.

- [ ] **Step 1: Failing tests**
  - `refresh: harvest row becomes a slice row with Israel day of first_seen_at` — `first_seen_at='2026-11-20T23:30:00Z'` → `day='2026-11-21'`.
  - `refresh: published study article turns the row into learn with work_id`.
  - `refresh: study article without a harvest row is indexed by published_at day` (Review Focus 3).
  - `refresh: url_key and canonical_key of one article give one row` (Review Focus 4).
  - `refresh: failed harvest row is removed from the index`.
  - `prune: slice rows older than 45 days go, learn rows stay`.
- [ ] **Step 2–4:** FAIL → реализация → PASS.

### Task 2.4: Вызовы индекса из жизненного цикла

**Files:**
- Modify: `news/harvest/newsHarvest.js` (после записи строки среза ≈ 262–266; в `cleanup()` — `prune`), `db/newsOverviewItems.js` (`upsert` → `refresh(done)`), `db/newsRepo.js` (приём пакета, `runLifecycle`, снятие/удаление статьи → `refresh`), точка создания сервисов в `server.js` (`newsStore()`, ≈ 4610) — общий экземпляр `index` и бэкфилл при старте (фоном, пачками, с `unref`).
- Test: `tests/newsHarvest.test.js`, `tests/newsRepo.test.js` — по одному тесту «после X строка индекса обновлена».

**Interfaces:**
- Consumes: `createNewsIndex` (Task 2.3). Передаётся в фабрики опцией `index` (по умолчанию — заглушка `{ refresh: async () => ({}) }`, чтобы старые тесты не менялись).

- [ ] Тесты: `harvest poll refreshes index for new rows`, `pack accept turns the index row into learn`, `withdraw turns it back to slice`. FAIL → реализация → PASS → `npm test`.
- [ ] Ретенция таблиц, которые сейчас никто не чистит (спека §7.1): в `cleanup()` удалять `news_overview_items`, `news_article_fingerprints`, `news_article_changes` старше 45 дней и `news_stories` с `last_at` старше 45 дней — кроме статей с учебной работой (W4 добавит помеченные). Тест `cleanup drops 45-day-old overview rows but keeps study ones`.

### Task 2.5: Запрос ленты

**Files:**
- Create: `db/newsList.js`
- Test: `tests/newsList.test.js`

**Interfaces:**
- Consumes: `ftsQuery` (Task 2.2), таблицы Task 2.1.
- Produces: `createNewsList({ db, now }) -> { list(p) }`, где `p = { day?, from?, to?, outlet?, section?, edition?, kind: 'learn'|'slice'|'all' = 'all', story?, q?, sort: 'fresh'|'time'|'match' = 'fresh', cursor?, keys?: string[] /* W4 */ }` →
  `{ day, prev, next, counts: { learn, slice }, items: Row[], next_cursor, body_search_from }`; `Row` = поля `news_index` без `rid` + `snippet?` (≤ 200 знаков, из FTS `snippet()` по `he`/`ru`).
  - По умолчанию — последний день с данными; `from/to` — диапазон израильских дней (заменяет `day`).
  - Порядок при `kind='all'`: все `learn` выше всех `slice`, внутри — `sort`; `fresh` = `fresh_at DESC`, `time` = `published_at DESC`, `match` = `bm25` (только при `q`, иначе как `fresh`).
  - Страница 60, курсор непрозрачный (base64 из ключей сортировки + `rid`); `counts` — по тем же фильтрам без `kind`.
  - `prev/next` — ближайшие дни с данными при тех же `outlet`.

- [ ] **Step 1: Failing tests**
  - `list: learn before slice, each by freshness`.
  - `list: outlet filter gives the same rows as the overview for that outlet`.
  - `list: q finds by Hebrew title with prefix and by Russian lead`.
  - `list: page size and cursor` — 130 строк → 60/60/10, без повторов (Review Focus 1).
  - `list: honest empty` — нет совпадений → `items: []`, `counts` нули, `day` тот, что спрошен.
  - `list: prev/next skip days without rows for the outlet`.
- [ ] **Step 2–4:** FAIL → реализация → PASS.

### Task 2.6: Маршрут

**Files:**
- Modify: `news/newsRoutes.js` (рядом с `/api/news/overview`), `server.js` (передать `list` в `mountNewsRoutes`)
- Test: `tests/newsRoutes.test.js`

**Interfaces:**
- Produces: `GET /api/news/list` — параметры как `p` (Task 2.5), валидация: дни `YYYY-MM-DD`, `outlet` из `news-outlets.js`, `section` из `C.SECTIONS`, `q` ≤ 200; ошибки — `400 NEWS_PARAM_INVALID` с `detail`. `Cache-Control: public, max-age=30` (W4 сделает `private, no-store` при наличии сессии).
- [ ] Тесты: `GET /api/news/list returns rows and counts`, `bad day → 400`. FAIL → PASS.

### Task 2.7: Клиент — единый экран

**Files:**
- Create: `public/js/news-list-ui.js` (UMD как `news-ui.js`)
- Modify: `public/js/news-ui.js` (`parseState`/`stateHref` — общий набор параметров; `renderOverview` и `renderOutlet` делегируют `NewsListUI.render(root, state, ctx)`; домашняя плитка «Обзор дня» — тот же адрес), `public/news.html` (подключение), `public/sw.js` (precache), список целостности в `server.js`, CSS, локали
- Test: `tests/newsListUi.test.js`

**Interfaces:**
- Consumes: `GET /api/news/list`.
- Produces: `NewsListUI.render(root, state, { t, locale, getJson, go, returnTo, manage })`; состояние адреса: `view=overview|outlet`, `outlet`, `day`, `from`, `to`, `section`, `ed`, `kind`, `story`, `q`, `sort` (+ `tag`, `star` в W4). Старые адреса (`?outlet=ynet&tier=archive&q=…`) переводятся в новые (`tier=archive` → без `day`, с `from/to`).
- Экран — скетч спеки §7.3: дни ‹ › + выбор даты, поле поиска (задержка 300 мс, `AbortController` для прежнего запроса), переключатель «Учебные · В срезе · Все» со счётчиками, кнопка «Фильтры·N» → нижняя панель (издание, рубрика, выпуск, сюжет, сортировка, диапазон), секции «Учебные материалы» / «Только в срезе», догрузка следующей страницы IntersectionObserver‑ом, честные пустые состояния.

- [ ] **Step 1: Failing tests**
  - `parseState/stateHref round-trip for all list params`.
  - `old archive URL maps to from/to`.
  - `render: learn and slice sections with counts; Read link only on learn rows`.
  - `render: empty result says day and query`.
  - `search input aborts the previous request` (поддельный `getJson` с проверкой `signal.aborted`).
- [ ] **Step 2–4:** FAIL → реализация → PASS; `npm test`.

### Task 2.8: Выпуск W2

- [ ] Версии/локали/SW; `npm test`.
- [ ] Браузер: Обзор и ynet — одинаковые даты/фильтры/порядок; поиск по ивриту и русскому; 380 px, тёмная тема; день 300+ статей — прокрутка без подвисаний (замер в WebKit через `shots.js`).
- [ ] Диск, коммит `feat(news): 3.11.9xx — one screen for the day overview and every outlet: dates, filters, sort, search`, пуш, проверка живой версии и бэкфилла (`SELECT COUNT(*) FROM news_index` через админ‑эндпоинт или лог старта).

---

## W3 — полный текст 45 дней, «Читать оригинал», ограничитель диска

### Task 3.1: Тело 45 дней со сжатием

**Files:**
- Create: `migrations/092_news_body_gz.sql` (+ down): `ALTER TABLE news_harvest_items ADD COLUMN data_gz BLOB`
- Create: `news/harvest/newsBody.js`
- Modify: `news/harvest/newsHarvest.js` — `LIMITS.keepBodyDays` 3 → 45, новый `L.plainBodyDays = 3`; `cleanup()`: старше 3 дней `data_json` → `data_gz` (gzip), старше 45 — `NULL` обоим; все чтения `data_json` (extras ≈ 509, archive‑order ≈ 582, сборка выпуска, `newsEditionBuild.js`) — через `bodyOf`
- Test: `tests/newsBody.test.js`, `tests/newsHarvest.test.js`, `tests/newsArchiveOrders.test.js`

**Interfaces:**
- Produces: `bodyOf(row) -> article | null` (из `data_json`, иначе gunzip `data_gz`), `packBody(article) -> Buffer`.
- Черновики для dot старше 3 дней: фото, которых нет в кэше, идут как `mode:'source_link'` без файла (предупреждение `PHOTO_EXPIRED` в `quality.warnings`).

- [ ] Тесты: `cleanup compresses bodies after 3 days and drops them after 45`, `archive order on a 10-day-old article succeeds from data_gz`, `SOURCES_EXPIRED only after 45 days`, `draft of an old article without cached photos carries PHOTO_EXPIRED`. Предварительно — `grep -n "data_json" news db` и перевод каждого потребителя (`feedback_gate_consumers_sweep`). FAIL → PASS.

### Task 3.2: Тело в поиске

**Files:**
- Modify: `db/newsIndex.js` (`refresh`: `he` += `normHe(paragraphs.join(' '))`, `stems` — тоже; `body_until = first_seen_at + 45 дн`), `db/newsList.js` (сниппет из тела)
- Test: `tests/newsIndex.test.js`, `tests/newsList.test.js`

- [ ] Тесты: `q finds a word that is only in the body`, `after body expiry the row is re-indexed without body` (`refresh` вызывается из `cleanup` для ключей, у которых тело удалено). FAIL → PASS.

### Task 3.3: Ограничитель диска

**Files:**
- Create: `news/newsDiskGuard.js`
- Modify: `news/harvest/newsHarvest.js` (`cleanup()`), `news/newsRoutes.js` (`/api/news/status` + `body_search_from`), `db/newsList.js` (`body_search_from` из `news_settings.search_horizon`), `public/js/news-list-ui.js` (подпись «поиск по тексту — с {date}»), баннер владельца (`renderStorageBanner`)
- Test: `tests/newsDiskGuard.test.js`

**Interfaces:**
- Produces: `createDiskGuard({ statfs = fs.promises.statfs, dir, minFreeBytes = 2 * 1024 ** 3 }) -> { check(): Promise<{ free, low }> }`; `cleanup` при `low` удаляет тела (и перестраивает FTS без тела) самого старого непомеченного дня, повторяя до `!low` или до горизонта 3 дня; горизонт пишется в `news_settings` ключ `search_horizon` (`{ from_day }`).

- [ ] Тесты: `low disk trims the oldest day first and records the horizon`, `never trims inside 3 days`, `normal disk leaves 45 days`. FAIL → PASS.

### Task 3.4: «Читать оригинал»

**Files:**
- Modify: `db/newsRepo.js` (`getWork`: `workId` вида `<item_key>.rw` без сохранённой работы → снимок из `bodyOf` строки среза; `getImage`: для статьи среза — файл из кэша фото, пока есть), `news/harvest/newsHarvest.js` (экспорт `rowsOf`), `news/newsSnapshot.js` (сборка снимка без перевода — поля как у OR‑версии, `ru: ''`), `public/js/news-reader.js` (регэксп `WORK` уже пропускает `.rw` — проверить; плашка «оригинал без перевода»), `public/js/news-list-ui.js` (кнопка «Оригинал» на строках `slice` с `full_ok` и живым телом)
- Test: `tests/newsRepo.test.js`, `tests/newsReaderEntry.test.js`

**Interfaces:**
- Produces: `rawWorkId(itemKey) -> itemKey + '.rw'`; ответ `GET /api/public-corpora/news-<outlet>/works/<item_key>.rw` — та же форма `public_corpus_work.1.0.0`, `snapshot_sha256` = sha256 снимка; `ETag`/`Cache-Control` как у обычной работы.

- [ ] Тесты: `raw work is built from a slice body`, `raw work 404 after body expiry`, `raw work image served from photo cache within 3 days`. FAIL → PASS. Затем вручную: Зал открывает оригинал, таблица без перевода не ругается `NIQQUD_MISSING`‑ошибкой (только пометка), фото встают между абзацами.

### Task 3.5: Выпуск W3

- [ ] Версии/локали/SW; `npm test`.
- [ ] Проверка на проде до пуша: `PRAGMA compile_options` содержит FTS5 (если нет — остановиться и сообщить владельцу).
- [ ] Браузер: поиск слова из тела, «Оригинал» в Зале на телефоне.
- [ ] Диск, коммит `feat(news): 3.11.9xx — full text kept 45 days, searchable, readable as original`, пуш, проверка живой версии.

---

## W4 — теги, ★ и «прочитано»

### Task 4.1: Миграция отметок

**Files:**
- Create: `migrations/093_news_marks.sql` (+ down)

**Interfaces:**
- Produces: `news_marks(item_key, actor_id, tag, created_at, PRIMARY KEY(item_key, actor_id, tag))` (`tag='★'` — Избранное; `item_key` может быть `story:<key>`), `news_reads(item_key, actor_id, at, PRIMARY KEY(item_key, actor_id))`, `news_pins(item_key PRIMARY KEY, body_gz BLOB, pinned_at)`, `news_pin_images(item_key, name, mime, sha256, bytes BLOB, PRIMARY KEY(item_key, name))`.

### Task 4.2: Модель отметок и закрепление владельца

**Files:**
- Create: `db/newsMarks.js`
- Modify: `news/harvest/newsHarvest.js` (`cleanup`: тела и строки помеченных не трогать), `db/newsIndex.js` (`prune` пропускает помеченные; `refresh` берёт тело из `news_pins`, если в срезе его уже нет), `news/harvest/newsBody.js` (`bodyOf` — запасной источник `news_pins`)
- Test: `tests/newsMarks.test.js`

**Interfaces:**
- Produces: `createNewsMarks({ db, now, ownerId }) -> { mark(actorId, itemKey, tag), unmark(actorId, itemKey, tag), marksFor(actorId, keys) -> Map<key, string[]>, tags(actorId) -> [{ tag, n }], read(actorId, itemKey), readSet(actorId, keys) -> Set }`. Тег: 1–40 знаков, без `#` в начале и управляющих символов; ★ — зарезервирован.
  - Отметка владельца на статье → `news_pins` (тело gzip) + `news_pin_images` (фото из кэша или из `news_images`); на `story:<key>` → тела всех статей сюжета без фото. Снятие последней отметки владельца → удалить снимок.

- [ ] Тесты: `owner star pins body and photos`, `pinned article survives 3/45-day cleanup and stays searchable`, `story tag pins texts without photos`, `last unmark removes the pin`, `another user's star does not pin`, `tag validation`. FAIL → PASS.

### Task 4.3: Маршруты отметок и личная лента

**Files:**
- Modify: `news/newsRoutes.js` — новый `userFor(req, res, { mutating })` (любой вошедший через `resolveUser`, CSRF `x-lp-csrf` для изменений); `PUT /api/news/marks` `{ item_key, tag }`, `DELETE /api/news/marks` `{ item_key, tag }`, `GET /api/news/tags`, `POST /api/news/read` — для любого вошедшего, с `item_key` (пишет `news_reads`; для владельца — по‑прежнему и `news_read_signals`); `GET /api/news/list` — при сессии добавляет к строкам `marks`, `read`, фильтры `tag`, `star`, ответ `private, no-store`
- Modify: `db/newsList.js` (параметры `tag`, `star`, `actorId`, `keys` — для посетителя без входа, ≤ 500 ключей)
- Test: `tests/newsRoutes.test.js`, `tests/newsList.test.js`

- [ ] Тесты: `marks need a session and csrf`, `list with tag filter returns only marked rows of this user`, `anonymous keys filter`, `read mark appears on the row`. FAIL → PASS.

### Task 4.4: Клиент отметок

**Files:**
- Create: `public/js/news-marks-local.js` (отметки и «прочитано» посетителя без входа: IndexedDB, все обращения в try/catch)
- Modify: `public/js/news-list-ui.js` (кнопки ☆/★ и «#» на строке, лист тегов с подсказкой существующих, фильтры «★» и «тег» в панели, метка «прочитано», отметка прочтения при «Читать»/«Оригинал»), локали, CSS, SW/`?v=`
- Test: `tests/newsListUi.test.js`, `tests/newsMarksLocal.test.js`

**Interfaces:**
- Produces: `NewsMarksLocal.open() -> Promise<{ ok: boolean, marks(keys), mark(key, tag), unmark(key, tag), tags(), read(key), readSet(keys) }>`; при `ok:false` UI показывает «Отметки не сохраняются на этом устройстве» и не падает.

- [ ] Тесты: `star toggles and is sent to the server for a signed-in user`, `anonymous marks go to local store`, `blocked storage shows the honest note` (Review Focus 5), `tag filter chip lists the user's tags with counts`. FAIL → PASS.

### Task 4.5: Выпуск W4

- [ ] Версии/локали/SW; `npm test`. Браузер: ★ и теги вошедшим и без входа, фильтры, помеченная статья старше 3 дней открывается «Оригиналом».
- [ ] Обновить спеку §8а п.1: снимок на устройство для ★ не‑владельца перенесён в «личный dot» (§8б) — сейчас ★ не‑владельца не продлевает хранение, строка показывает «текст доступен до {date}».
- [ ] Диск, коммит `feat(news): 3.11.9xx — tags, favourites and read marks for everyone`, пуш, проверка.

---

## W5 — заказы dot

### Task 5.1: Очередь заказов

**Files:**
- Create: `migrations/094_news_owner_orders.sql` (+ down), `news/newsOwnerOrders.js`
- Test: `tests/newsOwnerOrders.test.js`

**Interfaces:**
- Produces: `news_owner_orders(order_id TEXT PRIMARY KEY, item_key TEXT NOT NULL, tag TEXT, day_from TEXT, day_to TEXT, note_ru TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','taken','done','failed','expired')), reason TEXT, attempts INTEGER NOT NULL DEFAULT 0, edition_id TEXT, work_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)` + уникальный индекс `item_key WHERE status IN ('open','taken')`.
- `createOwnerOrders({ db, now, marks, index }) -> { orderArticle(actor, { item_key, note_ru }), orderTag(actor, { tag, from, to, note_ru }) -> { created, skipped: [{ item_key, reason }] }, list({ status }), take(editor, orderId), fail(editor, orderId, reason), onPublished(articleIds), expire(nowMs) }`.
  - Пропуски: `ALREADY_LEARNING`, `ALREADY_ORDERED`, `NO_FULL_TEXT`, `SOURCES_EXPIRED`; по тегу > 50 статей → ошибка `ORDER_TOO_BIG` (без частичного создания); `edition_id` подставляется из строки среза; `note_ru` хранится неизменной.
  - `onPublished` — из приёма пакета: статус `done`, `work_id`.

- [ ] Тесты: `order a slice article`, `tag order expands to articles of the tag in the day range, capped at 50`, `duplicate and already-learning are skipped with reasons`, `publish marks the order done`, `expired body expires the order`. FAIL → PASS.

### Task 5.2: Маршруты, dot и редактор

**Files:**
- Modify: `news/newsRoutes.js` — `POST /api/news/orders` (владелец/редактор: статья или тег+диапазон), `GET /api/news/orders`; для dot: `GET /api/news/editor/orders?status=open`, `POST /api/news/editor/orders/:id/take`, `POST /api/news/editor/orders/:id/fail` `{ reason }`; `GET /api/news/editor/editions/next` — поле `orders` (открытые)
- Modify: `news/harvest/newsHarvest.js` (`extraFiles` архива ≈ 306: `tags.json` — теги владельца с ключами статей), `db/newsRepo.js` (приём пакета → `orders.onPublished`), `news/harvest/dotTask.md` («Часть 0. Заказы владельца» — по спеке §7.4; раздел ≈ 53–59 заменить ссылкой), `public/js/news-editor-ui.js` + `public/news-editor.html` (список заказов со статусами и причинами)
- Test: `tests/newsRoutes.test.js`, `tests/newsEditorUi.test.js`

- [ ] Тесты: `orders: owner creates, editor takes and fails with reason, publish closes`, `editions/next carries open orders`, `tags.json is in the edition archive`, `editor page lists orders with reasons`. FAIL → PASS.

### Task 5.3: Кнопки в ленте

**Files:**
- Modify: `public/js/news-list-ui.js` (для владельца/редактора: «Сделать учебной» на строке `slice`, «Отдать dot» в листе тега с выбором дат; метка статуса заказа на строке: заказано / взято dot / опубликовано / отказ: причина), `db/newsList.js` (поле `order` у строк для владельца), локали, CSS, SW/`?v=`
- Test: `tests/newsListUi.test.js`

- [ ] Тесты: `order button only for owner/editor`, `order status badge with reason`, `tag order dialog sends tag and date range and shows skipped reasons`. FAIL → PASS.

### Task 5.4: Выпуск W5

- [ ] Версии/локали/SW; `npm test`. Браузер: заказ статьи и тега, статус на карточке, страница редактора.
- [ ] Диск, коммит `feat(news): 3.11.9xx — owner orders for dot from the overview and tags`, пуш, проверка. Сообщить владельцу: dot нужно дать новый `README-dot.md` (Часть 0).
- [ ] Обновить память `project_news_section` / `project_news_editions` итогом волн.
