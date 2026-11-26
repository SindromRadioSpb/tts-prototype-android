# Новости: каталог изданий с галочками (W1) и C14 с домашнего ПК (W2) — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У владельца раздел «Издания» с галочками и состоянием каждого издания; C14 собирается с ПК владельца раз в час и попадает в срез обычным путём, с честным временем последнего сбора.

**Architecture:** Каталог (метаданные) остаётся в `public/js/news-outlets.js`; состояние (галочка, маршрут, последний успешный сбор, ошибка) — новая таблица; серверный опрос читает состояние и пропускает выключенные и `home_pc`. ПК запускает тот же `createNewsHarvester(...).poll()` локально и отправляет все готовые строки `news_harvest_items` (с телом и без) на новый маршрут приёма по отзываемому ключу; фото — отдельным запросом в кэш фото сервера.

**Tech Stack:** Node.js (CommonJS), express, sqlite3, linkedom (тесты UI), node:test.

**Spec:** `docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md` (§4, §6, §8; волны 1–2 из §11). Волны 3–6 — отдельные планы после выпуска этой.

## Global Constraints

- Юзер-агент и вежливость сборщика не меняются: `LinguistProNewsReader/1.0`, robots, по одному запросу к хосту с паузой. Никакого обхода 403/challenge.
- Нынешние настройки шести изданий в `news/harvest/newsHarvestSources.js` не трогать.
- `mako` остаётся в каталоге как есть, без сборщика; `/news-*` → `n12` (правило пути не меняется).
- Каждая новая строка интерфейса — ключи в `public/i18n/locales/{ru,en,he}.js` (fallback `tt()` мёртв); после правки локалей — `?v=` во всех подключениях и `--write-lock` замка локалей; `CACHE_VERSION` SW — bump.
- Один выпуск = один полный коммит с версиями и один пуш (W1 — 3.11.915, W2 — 3.11.916). Перед пушем: свободное место на проде, `coolify-db` healthy, удалить предыдущий образ, `builder prune`.
- «Тихий ноль» запрещён: любое пустое состояние издания называет причину (`DISABLED`, `HOME_PC`, `BOT_CHALLENGE`, `FEED_FAILED`, `NO_ADAPTER`, «ПК не присылал сбор»).
- Порог «ПК молчит» — 3 часа (spec §6.4, решение 7).
- Тесты не хранят реальные тексты статей: фикстуры синтетические (как в `tests/newsHarvest.test.js`).

## Review Focus

1. Повтор пакета с ПК после обрыва ответа (тот же `batch_id`, тот же набор) — ответ тот же, строк не прибавилось → Task 8 тест `same batch twice`.
2. Пакет со старым `harvested_at` после нового — `last_ok_at` C14 не откатывается и не «освежается» → Task 8 тест `old batch keeps freshness`.
3. Строка, которая на сервере уже есть без тела, приходит с ПК с телом — тело дописывается; обратное (пришла без тела, на сервере с телом) — тело не стирается → Task 8 тест `body only grows`.
4. Чужое издание или чужой домен в пакете с ключом C14-ПК (`url` ynet в пакете `c14`) — строка отвергается с кодом, остальные принимаются → Task 8 тест `foreign url rejected per item`.
5. Владелец снимает галочку у издания во время идущего опроса — опрос не падает, следующий опрос издание пропускает с `DISABLED` → Task 4 тест `disabled mid-way`.

---

## Волна 1 — каталог, состояние, галочки (выпуск 3.11.915)

### Task 1: Каталог — группы и регион

**Files:**
- Modify: `public/js/news-outlets.js`
- Test: `tests/newsOutlets.test.js` (создать)

**Interfaces:**
- Produces: у каждой записи `OUTLETS[i]` поля `group` ∈ `GROUPS`, `region` (только при `group==='local'`: `north|jerusalem|center|south`), `priority` (`'A'|'B'`), `home` (https URL); экспорт `GROUPS = ['national','local','religious','haredi','economy_tech','science_env','society','radio']`, `REGIONS`.

- [ ] **Step 1: тест** `tests/newsOutlets.test.js`:
  - `every outlet has a known group; local ones have a region; others none`;
  - `colour passes AA with white text` — контраст `#fff` против `color` ≥ 4.5 у каждой записи;
  - `ids and domains are unique; mako news path still maps to n12` — `outletForUrl('https://www.mako.co.il/news-military/x/Article-ab.htm') === 'n12'`.
- [ ] **Step 2:** `node --test tests/newsOutlets.test.js` → FAIL (нет `group`).
- [ ] **Step 3:** нынешним семи проставить: ynet/mako/walla/maariv/c14/n12/haaretz — `national`, priority по реестру (`haaretz`,`c14` — `B`, остальные `A`), `home` из реестра. Новых изданий в этой волне не добавлять (волна 4).
- [ ] **Step 4:** тест PASS.
- [ ] **Step 5:** commit `feat(news): outlet catalog carries group, region, priority`.

### Task 2: Миграция 095 — состояние изданий, журнал, ключи и пакеты ПК

**Files:**
- Create: `migrations/095_news_outlet_state.sql`, `migrations/down/095_news_outlet_state.sql`
- Modify: `tests/helpers/newsDb.cjs` (добавить в `MIGRATIONS`)

- [ ] **Step 1:** таблицы:
  - `news_outlet_state(outlet_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, route TEXT NOT NULL DEFAULT 'server' CHECK(route IN ('server','home_pc')), probe_json TEXT, probe_at TEXT, last_ok_at TEXT, last_error TEXT, last_error_at TEXT, enabled_at TEXT, updated_by TEXT, updated_at TEXT)`;
  - `news_outlet_journal(id INTEGER PRIMARY KEY AUTOINCREMENT, outlet_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, detail_json TEXT)`;
  - `news_relay_keys(key_id TEXT PRIMARY KEY, label TEXT NOT NULL, key_sha256 TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')), created_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT)`;
  - `news_relay_batches(batch_id TEXT PRIMARY KEY, key_id TEXT NOT NULL, outlet_id TEXT NOT NULL, harvested_at TEXT NOT NULL, received_at TEXT NOT NULL, result_json TEXT NOT NULL)`.
  - Сид: `INSERT OR IGNORE` для `ynet, walla, maariv, n12, haaretz` (`enabled=1, route='server'`), `c14` (`enabled=1, route='home_pc'`), `mako` (`enabled=0`).
- [ ] **Step 2:** down — `DROP TABLE IF EXISTS` четырёх таблиц.
- [ ] **Step 3:** `node --test tests/newsHarvest.test.js tests/newsRoutes.test.js` → PASS (миграция применяется в памяти).
- [ ] **Step 4:** commit `feat(news): migration 095 — outlet state, journal, relay keys and batches`.

### Task 3: `db/newsOutletState.js`

**Files:**
- Create: `db/newsOutletState.js`
- Test: `tests/newsOutletState.test.js`

**Interfaces:**
- Produces: `createOutletState({ db, now = () => Date.now() })` →
  - `list(): Promise<Array<{outlet_id, enabled:boolean, route, probe, probe_at, last_ok_at, last_error, last_error_at, enabled_at}>>` — все id каталога (`Outlets.OUTLETS`), отсутствующие в таблице — `enabled:false, route:'server'`;
  - `get(id)` — то же для одного;
  - `harvestable(sources): Promise<Array<source>>` — источники с `enabled && route==='server'`;
  - `setEnabled(id, enabled:boolean, actor:string): Promise<state>` — бросает `NewsError(409,'NO_ADAPTER')`, если у издания нет записи в `newsHarvestSources` и `route!=='home_pc'`; пишет журнал `enable|disable`;
  - `recordPoll(id, { okAt?:string, error?:string })` — `okAt` обновляет `last_ok_at`, только если новее текущего; `error` пишет `last_error/at`, `okAt` без `error` очищает `last_error`.

- [ ] **Step 1: тесты:** `unknown outlet in table reads as disabled`; `enable without adapter → NO_ADAPTER` (`mako`); `recordPoll never moves last_ok_at back`; `journal records actor and action`; `harvestable skips disabled and home_pc`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(news): outlet state store`.

### Task 4: Опрос читает состояние

**Files:**
- Modify: `news/harvest/newsHarvest.js` (`createNewsHarvester` — опция `outletState = null`; `pollNow` строки 213–222), `server.js:4617` (передать `outletState`)
- Test: `tests/newsHarvest.test.js`

**Interfaces:**
- Consumes: Task 3 `harvestable`, `get`, `recordPoll`.
- Produces: в отчёте опроса для каждого издания каталога `errors` содержит `DISABLED` или `HOME_PC` вместо попытки; после успешного чтения хотя бы одной ленты — `recordPoll(id,{okAt})`; при `BOT_CHALLENGE|FEED_FAILED` на всех лентах — `recordPoll(id,{error})`.

- [ ] **Step 1: тесты:** `home_pc outlet is not fetched by the server` (fake fetch считает обращения к c14 — 0); `disabled outlet reported, not fetched`; `disabled mid-way` — `setEnabled(false)` между лентами, опрос завершается, второй опрос даёт `DISABLED`; `feed ok sets last_ok_at, all feeds failing sets last_error`. Без `outletState` поведение прежнее (старые тесты зелёные).
- [ ] **Step 2:** FAIL. **Step 3:** перед каждым изданием `await outletState.get(id)`; `blocked` оставить как есть для совместимости.
- [ ] **Step 4:** `node --test tests/newsHarvest.test.js` PASS.
- [ ] **Step 5:** commit `feat(news): harvester follows the owner's outlet switches`.

### Task 5: Маршруты изданий

**Files:**
- Modify: `news/newsRoutes.js` (опция `outletState`), `server.js` (`newsStore()` создаёт `outletState`, передаёт в маршруты и сборщик)
- Test: `tests/newsRoutes.test.js`

**Interfaces:**
- Produces:
  - `GET /api/news/editor/outlets` (владелец или редактор) → `{ ok, outlets:[{ outlet_id, name_he, name_latin, color, group, region, priority, enabled, route, has_adapter, last_ok_at, last_error, last_error_at, day_count }] }`, где `day_count` — строк `news_harvest_items` с `first_seen_at` за 24 ч;
  - `POST /api/news/editor/outlets/:id` (только владелец, CSRF) `{enabled:boolean}` → `{ok, outlet}`; audit `news.outlet.enable|disable`;
  - `GET /api/news/outlets` — добавляет `group, region, route, last_ok_at` и **не отдаёт** издания с `enabled=false`.

- [ ] **Step 1: тесты:** `editor reads outlets with state`; `editor key cannot switch an outlet (OWNER_ONLY)`; `owner switches with CSRF, journal written`; `public outlets hide disabled ones`; `NO_ADAPTER is 409`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(news): outlet routes for the owner and the public list`.

### Task 6: Раздел «Издания» в кабинете

**Files:**
- Modify: `public/js/news-editor-ui.js` (новая `renderOutletsTable(doc, outlets, opts)` и карточка в сборке страницы рядом с «Статьи для dot»), `public/css/news-editor.css`, `public/i18n/locales/{ru,en,he}.js` (`newsEditor.outlets.*`, `news.group.*`, `news.region.*`, коды `DISABLED, HOME_PC, NO_ADAPTER, BOT_CHALLENGE, FEED_FAILED`), `public/news-editor.html` (`?v=`)
- Test: `tests/newsEditorUi.test.js`

**Interfaces:**
- Consumes: Task 5 `GET/POST /api/news/editor/outlets`.
- Produces: `UI.renderOutletsTable(doc, outlets, { t, now, canSwitch:boolean, onSwitch(id, enabled) })` — таблица по группам (подзаголовок группы; у `local` — «Местные: <регион>»), строка: галочка «в срезе» (`disabled` если `!has_adapter && route!=='home_pc'` или `!canSwitch`), имя, маршрут («сервер»/«с ПК»), статей за сутки, «последний сбор …» или причина, последняя ошибка переведённым текстом.

- [ ] **Step 1: тесты:** `outlets grouped, local by region`; `no-adapter row is greyed and its checkbox disabled`; `error codes are translated, never raw`; ключи во всех трёх локалях (расширить существующий тест «every reason code … translated»).
- [ ] **Step 2:** FAIL. **Step 3:** реализовать; переключение — оптимистично с откатом и тостом при ошибке. **Step 4:** PASS.
- [ ] **Step 5: выпуск W1:** `npm test` зелёный; bump версий 3.11.915 (version lockstep, SW, `--write-lock`); браузерная проверка на локальном сервере: галочка C14/mako, перезагрузка сохраняет; один коммит `feat(news): 3.11.915 — the owner's outlet list with switches`, пуш по Global Constraints, проверка прода (`/api/news/editor/outlets` в кабинете, поллинг пропускает c14 с `HOME_PC`).

## Волна 2 — C14 с домашнего ПК (выпуск 3.11.916)

### Task 7: Ключи ПК

**Files:**
- Create: `news/newsRelayAuth.js`
- Modify: `news/newsRoutes.js`, `public/js/news-editor-ui.js` (карточка «Сбор с ПК»: выдать ключ — показан один раз, список, отозвать), локали
- Test: `tests/newsRelay.test.js` (создать)

**Interfaces:**
- Produces: `createRelayAuth({ db, now })` → `issue(label, actor) → { key_id, key }` (ключ `lpr_` + 32 байта base64url, хранится sha256), `list()`, `revoke(key_id, actor)`, `resolve(req) → {key_id}|null` по `Authorization: Bearer lpr_…` (обновляет `last_used_at`). Маршруты (только владелец): `GET/POST /api/news/editor/relay-keys`, `POST /api/news/editor/relay-keys/:id/revoke`.

- [ ] **Step 1: тесты:** `issued key resolves once stored as hash`; `revoked key no longer resolves`; `editor key is not a relay key and vice versa`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** commit `feat(news): revocable relay keys for the home PC`.

### Task 8: Приём пакета на сервере

**Files:**
- Create: `news/newsRelayIntake.js`
- Modify: `news/newsRoutes.js` (`POST /api/news/relay/batches`, `PUT /api/news/relay/photos`), `news/harvest/newsHarvest.js` (экспорт `storeCachedPhoto(src, bytes)` рядом с `cachedPhotoBytes`)
- Test: `tests/newsRelay.test.js`, фикстура `tests/fixtures/news-relay-c14-pilot.json` (синтетический текст, форма пилота: 10 строк c14, 9 `full_ok=1` с телом, 1 `reason:'NO_BODY'` без тела)

**Interfaces:**
- Consumes: Task 3 (`get`, `recordPoll`), Task 7 `resolve`, `news/newsPackCore` (`articleKey`, `canonicalizeUrl`), `Outlets.outletForUrl`, `canFetchArchiveImage`.
- Produces: `createRelayIntake({ db, outletState, index, storePhoto, now })` →
  - `accept(keyId, batch) → { batch_id, accepted, updated, kept, rejected:[{url, code}] }`; `batch = { batch_id (64 hex), outlet_id, harvested_at (ISO), items:[{ url, feed_title, feed_section, feed_image, feed_pub_at, first_seen_at, published_at, section, content_type, title_he, subtitle_he, lead_he, paywalled, full_ok, chars, images, reason, body|null }] }`, ≤ 300 строк, тело JSON ≤ 4 МБ;
  - правила: `outlet_id` должен иметь `route='home_pc'` и `enabled` (иначе 409 `NOT_HOME_PC`); `url_key` считает сервер; `outletForUrl(url)!==outlet_id` → `rejected URL_OUTLET_MISMATCH`; новая строка — `INSERT` со `status='ready'`, `data_json=body`; существующая — тело дописывается только если на сервере его нет (`body only grows`), остальные поля не перезаписываются; повтор `batch_id` → сохранённый `result_json` без записи; после записи `index.refresh(keys)`;
  - свежесть: `recordPoll(outlet,{okAt: harvested_at})` только если `accepted+updated>0` или пакет пустой, но `harvested_at` новее (ПК работал, новостей нет); `harvested_at` позже `now+5 мин` → 400 `BAD_HARVESTED_AT`;
  - `putPhoto(keyId, outlet_id, src, bytes)` — `canFetchArchiveImage(outlet_id, src)`, целый JPEG ≤ 600 КБ (та же проверка, что `cachedPhoto`), `src` встречается в `images` тела строки этого издания → `storeCachedPhoto`; иначе 400 `PHOTO_REJECTED`.

- [ ] **Step 1: тесты (приёмка dot + Review Focus):**
  - `pilot import gives 10 cards, 9 bodies, 1 NO_BODY` — после `accept` в `news_harvest_items`: 10 строк c14, 9 с `hasBody`, 1 `reason='NO_BODY'`;
  - `same batch twice` — второй ответ `deepEqual` первому, строк 10;
  - `old batch keeps freshness` + `server restart, other outlet poll and late old batch do not make c14 fresh` — новый intake на той же БД, `recordPoll('ynet',…)`, затем пакет с более ранним `harvested_at`: `last_ok_at` c14 = время нового пакета;
  - `edition build picks relayed cards` — `buildEdition` (как в `tests/newsEditions.test.js`) включает строки c14 в обзор, без отдельного пути;
  - `body only grows`; `foreign url rejected per item`; `photo from a foreign host rejected`; `relay key required (401)`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** commit `feat(news): server takes the home PC's harvest`.

### Task 9: Отправка с ПК

**Files:**
- Create: `news/harvest/newsRelayClient.js`
- Modify: `scripts/news/harvest.js` (флаги `--push <origin>` и `--key-file <path>`; в режиме `--push` вызывает `harvester.poll()` вместо `runOnce`, затем `pushPending`)
- Test: `tests/newsRelay.test.js`

**Interfaces:**
- Consumes: Task 8 маршруты.
- Produces: `pushPending({ db, origin, key, outletId, fetchImpl, now, photoOf }) → { batch_id, accepted, updated, rejected, photos_sent, photos_failed }`; локальная таблица `relay_sent(url_key PRIMARY KEY, body_sent INTEGER, sent_at TEXT)` создаётся клиентом; в пакет идут строки `status='ready'` без записи в `relay_sent` или с `body_sent=0`, когда тело уже есть; `batch_id = sha256(outletId + отсортированные url_key:hasBody)`; при обрыве — повтор с тем же `batch_id` до 3 раз с паузой; `relay_sent` пишется только после ответа сервера; фото: для отправленных строк с телом — до `imagesPerArticle` фото через `photoOf(src)` (тот же `photo()` сборщика), каждое отдельным `PUT`, ошибка одного фото не останавливает остальные и не помечает строку.

- [ ] **Step 1: тесты** (сервер из Task 8 на `express` в процессе): `all ready rows go, with and without body`; `lost response → same batch_id, no duplicates`; `second run sends only the rest`; `photo failure counted, cards still sent`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** commit `feat(news): home PC pushes its harvest`.

### Task 10: Честный статус C14

**Files:**
- Modify: `news/newsRoutes.js` (`GET /api/news/outlets`, `/api/news/editor/outlets`: поле `relay_stale: boolean` = `route==='home_pc' && (!last_ok_at || now-last_ok_at > 3 ч)`), `public/js/news-ui.js` (`renderOutletTile`: строка «собирается с домашнего компьютера · последний сбор HH:MM» / «ПК не присылал сбор с HH:MM»), `public/js/news-editor-ui.js` (та же строка), локали `news.relay.*`
- Test: `tests/newsUi.test.js`, `tests/newsEditorUi.test.js`

- [ ] **Step 1: тесты:** `home_pc tile names the route and last harvest time`; `stale after 3 hours says the PC has been silent since …`; `never harvested says so, not «0»`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** commit `feat(news): C14 shows when the home PC last harvested`.

### Task 11: Инструкция, живая приёмка, выпуск W2

**Files:**
- Modify: `docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md` (§18 «Сбор с домашнего ПК»: ключ, команда, Планировщик), `scripts/news/install-home-harvest.ps1` (создать: `schtasks /Create /SC HOURLY /TN "LinguistPro C14" /TR "node <repo>\scripts\news\harvest.js --only c14 --out <dir> --push https://linguistpro.kolosei.com --key-file <file>"`, параметры — аргументы скрипта)

- [ ] **Step 1:** `npm test` зелёный.
- [ ] **Step 2: живая приёмка на пилотной базе** (`C:\Users\lletp\c14-pilot-20261126-053408\.harvest.sqlite`, копия, не оригинал) против локального сервера: результат `accepted 10`, из них 9 с телом, 1 `NO_BODY`; повторный запуск — `accepted 0, kept 10`.
- [ ] **Step 3: выпуск W2:** bump 3.11.916 (lockstep, SW, локали), один коммит `feat(news): 3.11.916 — C14 from the home PC`, пуш по Global Constraints.
- [ ] **Step 4: на проде:** владелец выдаёт ключ в кабинете, сохраняет в файл; запуск `install-home-harvest.ps1` (задачу создаёт владелец — это его компьютер); первый запуск вручную → в кабинете «C14 · с ПК · последний сбор …», статьи C14 видны в «Обзоре дня» ближайшего выпуска.
