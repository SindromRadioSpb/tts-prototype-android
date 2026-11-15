# Новости: один день — четыре выпуска. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вместо одного утреннего архива — четыре выпуска в день (утро 22 статьи, обед/вечер/поздний по 8) с общим пополняемым «Обзором дня», постоянными сюжетами, учётом «взята только после публикации», переделкой, пометками об обновлении изданием, выбором dot сверх автоматики и выгрузкой архива на ПК владельца.

**Architecture:** Сервер (`news/harvest/*`) режет срезы по настраиваемому расписанию, ведёт сюжеты в БД, собирает архив выпуска; dot забирает «следующий выпуск» через редакторский вход и загружает пакет как сейчас (`scripts/news/build-pack.js` → `/api/news/editor/packs`). Приём пакета (`db/newsRepo.js`) отмечает, что опубликовано, и ведёт очередь переделки. «Обзор дня» хранится по статьям и пополняется. Четыре части (A–D) выкладываются отдельными выпусками; каждая работает сама по себе.

**Tech Stack:** Node.js (CommonJS), sqlite3, express, adm-zip, sharp, node:test; фронт — ванильный JS (`public/js/news-*.js`), локали `public/i18n/locales/{ru,en,he}.js`.

**Spec:** `docs/superpowers/specs/2026-11-15-news-editions-design.md` (утверждён владельцем 2026-11-15). Предшественник: §16–17 `docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md`.

## Global Constraints

- Время в БД — UTC ISO; слоты, «день» и подписи — по Израилю через `israelIso` (`news/harvest/newsExtract.js`), включая переход на летнее время.
- Расписание по умолчанию (настраивается в БД, не через переменную окружения): `morning` срез `06:00`, готов `08:00`, 22 статьи; `midday` `10:30` → `12:00`, 8; `evening` `16:30` → `18:00`, 8; `late` `20:30` → `22:00`, 8. Выбор dot — до 5 на выпуск. Аренда скачанного выпуска — 4 ч. Попыток переделки — 2.
- День начинается с утреннего среза: Израиль-время раньше `morning.cutoff` принадлежит предыдущему дню.
- Вежливость к изданиям без изменений: robots.txt, `USER_AGENT`, один запрос за раз с паузой, без обхода пейволла/защиты.
- Оригинал (`he_plain`, `p`, `source_text_he`, заголовки на иврите) и фото (байты, подписи, авторы, `after_p`) не меняются ни dot, ни сервером.
- Опубликованная статья не меняется при обновлении изданием (только пометка).
- Новые строки UI — ключи в `public/i18n/locales/ru.js`, `en.js`, `he.js` (запасной текст `t(key, fallback)` в проде не показывается).
- Новый файл в `public/js/` — в список предзагрузки/целостности SW (найти по `news-reader.js` в `public/sw.js` и в списке integrity).
- Каждая часть — один выпуск: `CACHE_VERSION` + `APP_VERSION` + `?v=` вместе, один полный коммит и один пуш; перед деплоем — удалить предыдущий образ и кэш сборки (разрешено владельцем).
- Миграции — `migrations/NNN_*.sql` + `migrations/down/NNN_*.sql` (skill `sqlite-migration-safety`).

## Review Focus

1. **Срез, пропущенный из-за простоя сервера** (сервер лежал 10:00–17:00) → обеденный выпуск помечается `skipped`, вечерний собирается один раз со всем материалом; два архива подряд не делаются. Тест — Task A4 `tick: missed midday is skipped, evening carries everything`.
2. **dot загрузил пакет двумя частями** → «пропущенные» статьи считаются попыткой только при закрытии выпуска (следующий срез), а не после первой части. Тест — Task A7 `attempts: absent articles count only when the edition closes`.
3. **Переход на летнее/зимнее время** (2026-10-25, 2027-03-26) → срез 06:00 по Израилю остаётся 06:00 местного; «день» не съезжает. Тест — Task A1 `dayOf/slotDue across DST`.
4. **Одна статья пришла в двух выпусках как остаток и как новая** (тот же `url_key`) → одна строка обзора, одна статья; повторная загрузка — `duplicate`. Тест — Task A5 `overview upsert: same item twice keeps one row, translation kept`.
5. **Выгрузка дня оборвалась между записью файла и «освободить»** → на сервере ничего не удалено, повторное нажатие продолжает с этого дня; неверный sha256 → 409, ничего не удалено. Тест — Task D1 `release: wrong sha256 deletes nothing`.

---

# Часть A — выпуски, сюжеты, пополняемый обзор, проверки, переделка (выпуск 3.11.894)

## Файлы части A

- Create `migrations/083_news_editions.sql`, `migrations/down/083_news_editions.sql` — таблицы выпусков, настроек, сюжетов, строк обзора; колонки учёта в `news_harvest_items`.
- Create `news/harvest/newsEditions.js` — чистая логика расписания (без БД).
- Create `news/harvest/newsStoryStore.js` — постоянные сюжеты (БД).
- Modify `news/harvest/newsStories.js` — `clusterStories` с `seeds`, новый `selectEdition`.
- Create `news/harvest/newsEditionBuild.js` — сборка архива выпуска (выносит `buildNow` из `newsHarvest.js`).
- Modify `news/harvest/newsHarvest.js` — `tick`, `runOnce`, `listEditions`, `nextEdition`, `downloadEdition`, `closeEdition`.
- Create `db/newsOverviewItems.js` — строки обзора: приём, выдача дня.
- Modify `db/newsRepo.js` — `ingestOverview` → строки; учёт выпуска при приёме; проверки статей.
- Modify `news/newsPackCore.js` — `validateOverview` v1+v2, `checkStudyLayers`.
- Modify `scripts/news/build-pack.js` — `edition_id`, `rejected[]`, папка `rework/`, новые проверки.
- Modify `news/newsRoutes.js` — `/api/news/editor/editions*`, `/api/news/editor/schedule`; `GET /api/news/overview` в новой форме; `GET /api/news/status`.
- Modify `public/js/news-ui.js`, `public/css/news.css`, `public/js/news-editor-ui.js`, `public/css/news-editor.css`, локали.
- Rewrite `news/harvest/dotTask.md`; add §18 в `docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md`.
- Tests: `tests/newsEditions.test.js` (новый), `tests/newsHarvest.test.js` (правка тестов расписания/сборки), `tests/newsOverviewItems.test.js` (новый), `tests/newsBuildPack.test.js`, `tests/newsUi.test.js`, `tests/newsEditorUi.test.js`.

### Task A1: Миграция 083 и логика расписания

**Files:**
- Create: `migrations/083_news_editions.sql`, `migrations/down/083_news_editions.sql`
- Create: `news/harvest/newsEditions.js`
- Test: `tests/newsEditions.test.js`

**Interfaces:**
- Produces:
  - Таблицы (миграция 083):
    - `news_settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)` — ключи `schedule`, позже `interests`.
    - `news_editions(edition_id TEXT PK, day TEXT NOT NULL, slot TEXT NOT NULL CHECK(slot IN ('morning','midday','evening','late','extra')), trigger TEXT NOT NULL CHECK(trigger IN ('schedule','manual')), status TEXT NOT NULL CHECK(status IN ('building','archived','downloaded','published','partial','superseded','skipped','failed')), cutoff_at TEXT, target_ready_at TEXT, cut_at TEXT, archive_ready_at TEXT, downloaded_at TEXT, lease_until TEXT, first_upload_at TEXT, published_at TEXT, closed_at TEXT, main_count INT DEFAULT 0, overview_count INT DEFAULT 0, published_count INT DEFAULT 0, rework_count INT DEFAULT 0, extras_count INT DEFAULT 0, file_name TEXT, bytes INT DEFAULT 0, report_json TEXT NOT NULL DEFAULT '{}')`; индекс `(day, slot)`.
    - `news_stories(story_key TEXT PK, first_day TEXT NOT NULL, created_at TEXT NOT NULL, last_at TEXT NOT NULL, words_json TEXT NOT NULL, mass REAL NOT NULL, outlets_json TEXT NOT NULL DEFAULT '[]', full_at TEXT, full_outlets INT DEFAULT 0, full_title_he TEXT, full_title_ru TEXT, prev_story_key TEXT)`; индекс `(last_at)`.
    - `news_overview_items(item_key TEXT PK, day TEXT NOT NULL, story_key TEXT NOT NULL, edition_id TEXT, outlet_id TEXT NOT NULL, url TEXT NOT NULL, published_at TEXT, section TEXT, title_he TEXT NOT NULL, title_ru TEXT, subtitle_he TEXT, subtitle_ru TEXT, lead_he TEXT, lead_ru TEXT, paywalled INT DEFAULT 0, changed_at TEXT, change_json TEXT, pack_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`; индексы `(day, story_key)`, `(edition_id)`.
    - `ALTER TABLE news_harvest_items ADD COLUMN`: `story_key TEXT`, `edition_id TEXT` (первый выпуск, в архив которого попала), `overview_state TEXT NOT NULL DEFAULT 'todo'` (`todo|sent|done`), `main_state TEXT NOT NULL DEFAULT 'none'` (`none|drafted|published|dropped`), `main_edition_id TEXT`, `main_attempts INT NOT NULL DEFAULT 0`, `main_reason TEXT`, `selected_by TEXT`, `selection_note_ru TEXT`, `draft_images_json TEXT` (`{file: sha256}`), `lease_until TEXT`.
    - Down-миграция удаляет новые таблицы; колонки `news_harvest_items` остаются (SQLite) — отметить в комментарии.
  - `news/harvest/newsEditions.js`:
    - `DEFAULT_SCHEDULE = { slots: { morning: { cutoff: '06:00', ready: '08:00', main: 22 }, midday: { cutoff: '10:30', ready: '12:00', main: 8 }, evening: { cutoff: '16:30', ready: '18:00', main: 8 }, late: { cutoff: '20:30', ready: '22:00', main: 8 } }, extras: 5, leaseHours: 4, maxAttempts: 2 }`
    - `SLOTS = ['morning','midday','evening','late']`
    - `normalizeSchedule(input) -> schedule` — сливает с умолчаниями; `cutoff`/`ready` формата `HH:MM`, `ready` позже `cutoff`, срезы строго по возрастанию в порядке `SLOTS`, `main` 1..40, иначе `Error('SCHEDULE_INVALID')`.
    - `israelAt(day: 'YYYY-MM-DD', hhmm: string) -> ms` — момент «этот день, это время по Израилю» (учесть смещение +02/+03 на эту дату).
    - `dayOf(ms, schedule) -> 'YYYY-MM-DD'` — израильская дата; раньше `morning.cutoff` — предыдущая дата.
    - `slotTimes(day, schedule) -> [{ slot, cutoffMs, readyMs }]` — четыре слота; срезы `midday/evening/late` того же дня, все после утреннего.
    - `dueSlot(ms, schedule, editionsOfDay: [{slot,status}]) -> { day, slot, cutoffMs, readyMs, skip: string[] } | null` — последний наступивший слот дня, у которого нет выпуска (кроме `failed` с менее чем 2 попытками — `failed` считаются по числу строк); все более ранние слоты без выпуска попадают в `skip`.

- [ ] **Step 1: Write the failing tests** (`tests/newsEditions.test.js`)

```js
test('dayOf: before the morning cut-off is still yesterday', () => {
  assert.equal(dayOf(Date.parse('2026-11-16T03:59:00Z'), DEFAULT_SCHEDULE), '2026-11-15'); // 05:59 Israel
  assert.equal(dayOf(Date.parse('2026-11-16T04:00:00Z'), DEFAULT_SCHEDULE), '2026-11-16'); // 06:00 Israel
});
test('dayOf/slotDue across DST', () => {
  assert.equal(israelAt('2027-03-26', '06:00'), Date.parse('2027-03-26T03:00:00Z')); // summer +03
  assert.equal(israelAt('2026-10-25', '06:00'), Date.parse('2026-10-25T04:00:00Z')); // winter +02
});
test('dueSlot: the latest passed slot without an edition; earlier empty slots are skipped', () => {
  const t = israelAt('2026-11-16', '17:00');
  assert.deepEqual(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'published' }]).slot, 'evening');
  assert.deepEqual(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'published' }]).skip, ['midday']);
  assert.equal(dueSlot(t, DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'published' }, { slot: 'evening', status: 'archived' }]), null);
  assert.equal(dueSlot(israelAt('2026-11-16', '10:29'), DEFAULT_SCHEDULE, [{ slot: 'morning', status: 'archived' }]), null);
});
test('normalizeSchedule rejects cut-offs out of order and ready before cut-off', () => {
  assert.throws(() => normalizeSchedule({ slots: { midday: { cutoff: '05:00' } } }), /SCHEDULE_INVALID/);
  assert.throws(() => normalizeSchedule({ slots: { evening: { cutoff: '16:30', ready: '16:00' } } }), /SCHEDULE_INVALID/);
  assert.equal(normalizeSchedule({ slots: { evening: { main: 10 } } }).slots.evening.main, 10);
});
test('migration 083 applies on top of 082', async () => { /* открыть :memory:, применить 078–083, проверить PRAGMA table_info(news_harvest_items) содержит main_state, overview_state */ });
```

- [ ] **Step 2:** `node --test tests/newsEditions.test.js` → FAIL (`Cannot find module '../news/harvest/newsEditions'`).
- [ ] **Step 3:** Написать миграцию и `newsEditions.js` по Interfaces.
- [ ] **Step 4:** `node --test tests/newsEditions.test.js` → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): editions schedule + migration 083"`

### Task A2: Постоянные сюжеты

**Files:**
- Modify: `news/harvest/newsStories.js` (`clusterStories`)
- Create: `news/harvest/newsStoryStore.js`
- Test: `tests/newsEditions.test.js`

**Interfaces:**
- Consumes: таблица `news_stories` (A1).
- Produces:
  - `clusterStories(items, { threshold = 0.3, titleWeight = 2, seeds = [] })` — `seeds: [{ id, words: Map<string,number>, mass: number }]` участвуют как готовые сюжеты (кандидаты для присоединения, тем же правилом «счёт ≥ порога и ≥1 редкое общее слово»); возвращаемая `Map` отдаёт id сида для присоединившихся. Без `seeds` поведение прежнее (существующие тесты не меняются).
  - `createStoryStore({ db, now })` → `{ assign(items, { day }) -> Promise<Map<itemId, story_key>>, markFull(story_key, { outlets, title_he, title_ru, at }) -> Promise<void>, get(story_key) -> Promise<row|null>, activeSince(ms) -> Promise<row[]> }`.
    - `assign`: сиды = сюжеты с `last_at` за последние 36 ч; новые сюжеты получают `story_key = day + '-' + sha256(firstItemId).slice(0, 8)`, `first_day = day`; присоединение обновляет `last_at`, `words_json` (максимум весов), `mass`, `outlets_json`. Если присоединённый сюжет имеет `first_day < day` — он остаётся тем же ключом («продолжение»).

- [ ] **Step 1: Write the failing tests**

```js
test('stories persist: an afternoon article about the morning event joins the morning story', async () => {
  // утро: 3 статьи (ynet, walla, maariv) «הכנסת אישרה את תקציב המדינה …» → assign(day '2026-11-16') → один ключ K
  // днём: n12 «תקציב המדינה אושר בכנסת: …» → assign → тот же K; news_stories.outlets_json содержит 4 издания
});
test('stories persist: a story from yesterday keeps its key today (continued)', async () => {
  // assign(day '2026-11-15') → K1; через 20 ч assign(day '2026-11-16') похожей статьи → K1; get(K1).first_day === '2026-11-15'
});
test('stories persist: an unrelated article starts a new story', async () => { /* другой ключ, формат /^2026-11-16-[0-9a-f]{8}$/ */ });
```

- [ ] **Step 2:** `node --test tests/newsEditions.test.js` → FAIL.
- [ ] **Step 3:** Реализовать `seeds` в `clusterStories` и `newsStoryStore.js`.
- [ ] **Step 4:** `node --test tests/newsEditions.test.js tests/newsHarvest.test.js` → PASS (старые тесты сюжетов целы).
- [ ] **Step 5:** `git commit -m "feat(news): stories persist across editions and days"`

### Task A3: Отбор для выпуска

**Files:**
- Modify: `news/harvest/newsStories.js`
- Test: `tests/newsEditions.test.js`

**Interfaces:**
- Consumes: `selectStories` (есть), строки `news_stories` (A2).
- Produces: `selectEdition(stories, { slot, main, full = new Map() }) -> [{ story, group, outlets, pick, kind: 'new'|'development' }]`
  - `stories` — как у `selectStories` (`{ id, members[] }`, `id` = `story_key`); `full` — `Map<story_key, { full_outlets, full_title_he }>` для сюжетов с полной статьёй за последние 36 ч.
  - `slot === 'morning'`: `selectStories` по сюжетам без полной статьи (`total = main`, квоты `QUOTA`) + развития (правило ниже) в пределах того же `main`.
  - Остальные слоты, `main` = 8:
    - новые события: сюжеты без полной статьи; сначала с ≥2 изданиями (по убыванию счёта как в `selectStories`), сюжеты одного издания — не больше `Math.floor(main / 2)` (= 4); одна рубрика — не больше 3; недобор не добирается.
    - развития: сюжет из `full`, у которого `изданий сейчас − full_outlets ≥ 2` или Jaccard слов (`tokens`) заголовка новой статьи и `full_title_he` < 0.2 при ≥2 изданиях в новых статьях; не больше 2; `kind: 'development'`; статья — из новых членов сюжета.
  - `pick` выбирается как в `selectStories` (не платная, чередование изданий, фото/объём).

- [ ] **Step 1: Write the failing tests**

```js
test('selectEdition midday: 8 at most, single-outlet stories capped at 4, no filler', () => {
  // 2 сюжета по 3 издания + 10 одиночных → 6 (2 + 4)
});
test('selectEdition: a story with a full article returns only as a development (+2 outlets), at most 2', () => {
  // full: K1 { full_outlets: 2 }; K1 сейчас 4 издания → kind 'development'; K2 { full_outlets: 2 }, сейчас 3 → не выбран
  // 3 сюжета-развития с +2 → выбраны 2
});
test('selectEdition: one rubric gives at most 3 of the day editions', () => { /* 6 сюжетов politics по 3 издания → 3 */ });
test('selectEdition morning keeps the rubric quota and total 22', () => { /* как существующий тест selectStories */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat(news): per-edition selection (22/8/8/8, developments, no filler)"`

### Task A4: Сборка выпуска и расписание сборщика

**Files:**
- Create: `news/harvest/newsEditionBuild.js`
- Modify: `news/harvest/newsHarvest.js` (`buildNow` → вызов сборки выпуска; `tick`; `runOnce`; `listRuns` остаётся для старых строк `news_harvest_runs`)
- Test: `tests/newsHarvest.test.js` (тесты `schedule:` и `hourly poll…` переписать под выпуски)

**Interfaces:**
- Consumes: A1 (`dueSlot`, `slotTimes`, `normalizeSchedule`), A2 (`createStoryStore`), A3 (`selectEdition`), `draftOf`, `leadOf`, `photo()` (вынести из замыкания в параметр).
- Produces:
  - `buildEdition({ db, stories, editionId, day, slot, schedule, nowMs, photo, zipDir, log }) -> Promise<{ edition_id, main, overview_items, rework, file_name, bytes }>`:
    - **Кандидаты обзора:** `status='ready' AND overview_state IN ('todo','sent') AND (lease_until IS NULL OR lease_until < now)` и `first_seen_at` за 36 ч (для `sent` — без ограничения в пределах тел 3 дня). Им `edition_id` ставится, если пуст; `overview_state='sent'`.
    - **Новые главные:** `selectEdition` по сюжетам кандидатов с `main_state='none'`; выбранным `main_state='drafted'`, `main_edition_id`, `draft_images_json`.
    - **Остатки:** `main_state='drafted'`, не в аренде, `main_attempts < maxAttempts` — снова черновик; в `rework/`, если есть `main_reason`, иначе в корень.
    - Архив: `<outlet>-<NNNN>.draft.json` + папки фото, `rework/…`, `overview.json` (схема v2, Task A5), `harvest.json` (`schema_version: 3`, `edition_id`, `day`, `slot`, `main[]` с `story_key`, `kind`, `images: {file: sha256}`, `rework[]` с `reason`), `README-dot.md`.
    - `news_editions`: `status='archived'`, `cut_at`, `archive_ready_at`, счётчики, `file_name`; файл `news-edition-<day>-<slot>-<id6>.zip` в `DATA_DIR/news-harvest/`.
  - `tick()`: `dueSlot` по выпускам дня из БД; для слотов из `skip` — строки `status='skipped'`; перед сборкой: выпуски дня со статусом `archived` → `superseded`; закрыть (`closeEdition`, Task A7) выпуски `downloaded|partial` с истёкшей арендой; затем `pollNow()` и `buildEdition`. Иначе — ежечасный опрос, как сейчас.
  - `runOnce({ trigger: 'manual' })` — выпуск `slot='extra'` текущего дня (`dayOf`), то же правило отбора, что `midday`.
  - Расписание читается из `news_settings.schedule` (нет строки → `DEFAULT_SCHEDULE`).

- [ ] **Step 1: Write the failing tests** (в `tests/newsHarvest.test.js`, с поддельным временем `now` и фикстурами страниц, как в существующих тестах)

```js
test('tick: morning at 06:00 builds an edition; the next tick before 10:30 only polls', async t => {
  // now = israelAt('2026-11-16','06:05') → tick → news_editions: 1 строка { slot:'morning', status:'archived' }
  // now = 06:20 → tick → строк по-прежнему 1
});
test('tick: missed midday is skipped, evening carries everything', async t => {
  // утро archived; now = 17:00 → tick → midday 'skipped', evening 'archived'; morning 'superseded' (не скачан)
  // архив evening содержит строки обзора, которые были в morning (overview_state 'sent' без аренды)
});
test('edition: items of a downloaded edition are leased for 4 h and not repeated', async t => {
  // morning archived → downloadEdition → 10:30 tick → midday архив не содержит статей morning
});
test('edition: carried-over drafts come on top of the 8 new ones', async t => {
  // morning: 22 drafted, не опубликованы, аренда истекла → midday: 22 остатка + ≤8 новых; harvest.json.main.length ≤ 30
});
test('manual run makes an extra edition of the current day', async t => { /* slot 'extra', trigger 'manual' */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `node --test tests/newsHarvest.test.js tests/newsEditions.test.js` → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): editions — cut-off, supersede, lease, carry-over"`

### Task A5: «Обзор дня» по строкам

**Files:**
- Create: `db/newsOverviewItems.js`
- Modify: `news/newsPackCore.js` (`validateOverview`), `db/newsRepo.js` (`ingestOverview`, `getOverview`), `news/harvest/newsEditionBuild.js` (форма `overview.json` v2)
- Test: `tests/newsOverviewItems.test.js`, `tests/newsHarvest.test.js` (тест `«Обзор дня»: packed overview…`)

**Interfaces:**
- Produces:
  - `overview.json` v2: `{ schema: 'linguistpro-news-overview', schema_version: 2, edition_id, day, slot, created_at, stories: [{ story_key, continued?: true, context_title_ru?: string, items: [{ item_key, outlet_id, url, published_at, section, title_he, title_ru: '', subtitle_he?, subtitle_ru?, lead_he?, lead_ru?, paywalled?, draft?, changed?: true }] }] }` — только строки, которым нужен перевод. `item_key` = `C.articleKey(outlet_id, C.canonicalizeUrl(url))`.
  - `validateOverview(o)` принимает `schema_version` 1 и 2; v2 требует `edition_id` (`/^ne_[0-9a-f]{18}$/`) и `slot`; `item_key` (если есть) должен совпасть с вычисленным, иначе `OVERVIEW_ITEM_INVALID`.
  - `createOverviewItems({ db, now })` → `{ upsert(o, { packId }) -> { inserted, updated, kept }, day(day | null) -> { day, prev, next, updated_at, editions: [...], stories: [...] } | null }`.
    - `upsert`: по `item_key`; иврит и метаданные пишутся при вставке; `*_ru` перезаписываются, только если новое значение непустое; `day`, `edition_id` первой вставки не меняются; v1 → строки с `edition_id = NULL`, `day = o.day`. После вставки — `news_harvest_items.overview_state='done'` для этих ключей (по `url_key` или `canonical_key`).
    - `day()`: сюжеты из строк дня; порядок как в нынешнем `buildNow` (сюжеты с полной статьёй дня по рубрикам → ≥2 изданий → по времени); у строки — `edition_slot`, `edition_published_at`, `work_id` (как сейчас), `changed_at`; у сюжета — `continued` (`news_stories.first_day < day`). Нет строк за день, но есть `news_overviews` → прежний ответ из `body_json` (запасной путь для дней до 3.11.894).
  - `GET /api/news/overview[?day=]` отдаёт ответ `day()`; поля прежнего ответа сохраняются (`day, prev, next, updated_at, stories`), добавляются `editions`.

- [ ] **Step 1: Write the failing tests** (`tests/newsOverviewItems.test.js`)

```js
test('overview upsert: same item twice keeps one row, translation kept', async () => {
  // upsert(v2 с item A title_ru 'Кнессет утвердил бюджет') → upsert(v2 с A title_ru '') → одна строка, title_ru прежний
});
test('overview upsert: a v1 pack of the whole day is split into rows', async () => { /* 3 сюжета, 5 статей → 5 строк, edition_id null */ });
test('overview day: rows of three editions make one day; each row says its edition', async () => {
  // morning 3 строки, evening 2 строки (одна в сюжете утра) → stories: сюжет утра содержит 2 статьи, у одной edition_slot 'evening'
});
test('overview day: a day before 3.11.894 is read from news_overviews', async () => { /* только news_overviews → прежняя форма */ });
test('validateOverview: v2 needs edition_id and a matching item_key', () => { /* OVERVIEW_INVALID / OVERVIEW_ITEM_INVALID */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `node --test tests/newsOverviewItems.test.js tests/newsHarvest.test.js tests/newsRoutes.test.js` → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): «Обзор дня» grows by rows across editions"`

### Task A6: Проверки перед публикацией (упаковщик и сервер)

**Files:**
- Modify: `news/newsPackCore.js`, `scripts/news/build-pack.js`, `db/newsRepo.js` (`ingestArticle`)
- Test: `tests/newsBuildPack.test.js`, `tests/newsPackCore.test.js`, `tests/newsHarvest.test.js`

**Interfaces:**
- Produces:
  - `checkStudyLayers(article, { glossLayer }) -> string[]` (коды ошибок, пусто = ок), только для версии `OR`:
    - `RU_MISSING:<n>` — строк с пустым `ru`;
    - `TRANSLIT_MISSING:<n>` — пустой `translit` или `translit_ru`;
    - `NIQQUD_WORDS:<n>` — строк, где число слов `he_niqqud` (после снятия огласовки, деление по пробелам и макафу `־`) ≠ числу слов `he_plain`, или есть `[A-Za-zА-Яа-я]`;
    - `GLOSS_MISSING` — нет `word_gloss_ai`; `GLOSS_COVERAGE:<pct>` — покрыто строк < 90% (по `wordGlossLayerReport`).
  - Сервер: непустой результат `checkStudyLayers` → статья `rejected`, `code: 'STUDY_LAYER_INVALID'`, `detail: [...]` (пакет не валится). `NIQQUD_MISSING` из предупреждений становится частью этой проверки.
  - Фото: если пакет несёт `manifest.edition_id` и у статьи есть запись `news_harvest_items.draft_images_json`, sha256 каждого фото и `caption_he/credit_he/after_p` (из `harvest.json` нет на сервере — сравнивать только sha256) должны совпасть → иначе `rejected`, `code: 'IMAGE_CHANGED'`.
  - `build-pack.js`: читает `harvest.json` (если есть) → `manifest.edition_id`; ищет черновики в корне и в `rework/`; та же `checkStudyLayers` и сверка sha256 фото с `harvest.json.main[].images`; не прошедшие статьи **не** кладёт, а пишет в `manifest.rejected = [{ outlet_id, canonical_url, code }]`; пакет собирается, если есть хоть одна статья, обзор или `rejected`.

- [ ] **Step 1: Write the failing tests**

```js
test('checkStudyLayers: empty ru, translit, niqqud word mismatch, gloss coverage', () => {
  // строка he_plain 'הכנסת אישרה את התקציב' he_niqqud 'הַכְּנֶסֶת אִשְּׁרָה' → ['NIQQUD_WORDS:1', …]
  // he_niqqud 'הָיְתָה' при he_plain 'הייתה' → не ошибка (одно слово)
});
test('build-pack: a broken draft is left out and listed in manifest.rejected; the rest is packed', async () => {
  // 2 черновика, у одного пустой ru → zip содержит 1 статью, manifest.rejected[0].code 'STUDY_LAYER_INVALID'
});
test('build-pack: a changed photo is refused (sha256 differs from harvest.json)', async () => { /* code 'IMAGE_CHANGED' */ });
test('server: STUDY_LAYER_INVALID rejects one article and publishes the others', async () => { /* totals.published 1, rejected 1 */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `node --test tests/newsBuildPack.test.js tests/newsPackCore.test.js tests/newsHarvest.test.js tests/newsRepo.test.js` → PASS (фикстуры существующих тестов дополнить транслитом и слоем, если они падают на новых проверках).
- [ ] **Step 5:** `git commit -m "feat(news): checks before publishing — study layers and photos"`

### Task A7: Учёт выпуска, переделка, адреса для dot

**Files:**
- Modify: `db/newsRepo.js` (`ingestPack`), `news/harvest/newsHarvest.js`, `news/newsRoutes.js`
- Test: `tests/newsHarvest.test.js`, `tests/newsRoutes.test.js`

**Interfaces:**
- Consumes: A4 (выпуски, `main_state`), A6 (`manifest.rejected`, `manifest.edition_id`).
- Produces:
  - `createNewsRepo({ db, now, onEditionPack })` — новый необязательный колбэк `onEditionPack({ edition_id, items, rejected })` после приёма пакета с `edition_id`; сборщик подписывается при создании в `server.js:4611` (`newsStore()`).
  - Харвестер: `accountPack({ edition_id, items, rejected })`:
    - статья `published|revised|duplicate|archived` → `main_state='published'`, `news_stories.markFull` (если первая полная статья сюжета);
    - статья `rejected` (сервер) или в `rejected[]` → `main_attempts+1`, `main_reason=code`; `main_attempts ≥ maxAttempts` → `main_state='dropped'`;
    - выпуск: `first_upload_at` (первый раз), `published_at` = время первого пакета со статьями или обзором, `published_count`, `rework_count`; статус `published`, если все черновики выпуска учтены, иначе `partial`.
  - `closeEdition(edition_id)` (вызывается из `tick` при истечении аренды или при следующем срезе): черновики выпуска в `drafted`, не упомянутые ни в одном пакете → `main_attempts+1`, `main_reason='SKIPPED'`, **только если по выпуску был хотя бы один пакет**; `closed_at`.
  - Адреса (владелец или редактор, `noStore`):
    - `GET /api/news/editor/editions?limit=` → `{ ok, editions: [{ edition_id, day, slot, status, cutoff_at, target_ready_at, cut_at, archive_ready_at, downloaded_at, published_at, late: bool, main_count, overview_count, published_count, rework_count, has_file }] }`, `late` = нет `published_at` и сейчас > `target_ready_at`, или `published_at > target_ready_at`.
    - `GET /api/news/editor/editions/next` → самый старый выпуск со статусом `archived` (не `superseded`) или `{ ok: true, edition: null }`.
    - `GET /api/news/editor/editions/:id/download` → zip; первое скачивание: `status='downloaded'`, `downloaded_at`, `lease_until = now + leaseHours`, у статей выпуска `lease_until`.
    - `GET|PUT /api/news/editor/schedule` (PUT — только владелец, CSRF как у остальных mutating) → `normalizeSchedule`; 400 `SCHEDULE_INVALID`.
    - Старые `/api/news/editor/harvests*` и «Собрать сейчас» работают: `run` → `runOnce` (выпуск `extra`), список — выпуски плюс старые строки `news_harvest_runs`.
  - Публичный `GET /api/news/status` → `{ ok, last_ready: { slot, published_at } | null, next: { slot, target_ready_at, state: 'waiting'|'preparing'|'late' } }`, `noStore`; `preparing` — срез прошёл, выпуск не опубликован, время готовности не наступило; `late` — наступило.

- [ ] **Step 1: Write the failing tests**

```js
test('attempts: absent articles count only when the edition closes', async t => {
  // выпуск с 3 черновиками; пакет 1 публикует A; пакет 2 публикует B → у C main_attempts 0
  // closeEdition → C main_attempts 1, main_reason 'SKIPPED'
});
test('attempts: no pack at all — nothing counts, the drafts carry over', async t => { /* closeEdition без пакетов → attempts 0 */ });
test('rework: rejected twice → dropped, stays in the overview', async t => {
  // rejected[] с C дважды (два выпуска) → main_state 'dropped'; строка обзора C есть
});
test('rework: a rejected draft goes to rework/ of the next edition with its reason', async t => { /* harvest.json.rework[0].reason 'STUDY_LAYER_INVALID' */ });
test('routes: editions/next gives the oldest archived edition, superseded never', async t => {});
test('routes: download leases the edition; schedule PUT is owner-only and validated', async t => { /* editor → 403 OWNER_ONLY */ });
test('status: preparing before the ready time, late after it, last_ready from published', async t => {});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `node --test tests/newsHarvest.test.js tests/newsRoutes.test.js tests/newsRepo.test.js` → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): edition accounting, rework queue, editions API for dot"`

### Task A8: Сайт и редактор

**Files:**
- Modify: `public/js/news-ui.js`, `public/css/news.css`, `public/js/news-editor-ui.js`, `public/css/news-editor.css`, `public/i18n/locales/{ru,en,he}.js`
- Test: `tests/newsUi.test.js`, `tests/newsEditorUi.test.js`

**Interfaces:**
- Consumes: `GET /api/news/status`, `GET /api/news/overview` (`editions`, `edition_slot`, `edition_published_at`, `continued`), `GET /api/news/editor/editions`, `GET|PUT /api/news/editor/schedule`.
- Produces (тексты ru — точные; en/he — перевод):
  - Главная «Новостей» и «Обзор дня»: строка `news.status.ready` «Обновлено в {time} · {slot}», `news.status.next` «следующий выпуск около {time}», `news.status.preparing` «{slot} готовится», `news.status.late` «{slot} задерживается». Названия: `news.slot.morning` «утренний выпуск», `midday` «обеденный выпуск», `evening` «вечерний выпуск», `late` «поздний выпуск», `extra` «внеочередной выпуск».
  - Обзор: метка у строки `news.overview.newIn` «новое в {time}» (для выпусков после утреннего); фильтр-кнопки по выпускам дня (`news.overview.editionAll` «Все выпуски»); у сюжета `news.overview.continued` «продолжение со вчера»; отметка `news.overview.sinceVisit` «с вашего прошлого визита» — строки с `edition_published_at` позже сохранённого `localStorage['lp.news.lastVisit']` (чтение/запись в try/catch; без хранилища отметок нет; запись — при уходе со страницы/через 10 с на ней).
  - Редактор: карточка «Выпуски» (`newsEditor.editions.title`) — по дням: слот, срез, архив готов, скачан, опубликован, «вовремя»/«опоздал» (`newsEditor.editions.onTime`/`late`), статей/в обзоре/на переделке; строка «среднее от среза до публикации за 7 дней» по слотам; форма расписания (срез, готов к, статей) с «Сохранить» (только владельцу). Прежняя карточка «Статьи для dot» — текст подсказки меняется на четыре выпуска.

- [ ] **Step 1: Write the failing tests** (в стиле существующих `tests/newsUi.test.js`: JSDOM-подобный `doc`, подставные ответы API)

```js
test('news home shows the last ready edition and the next one', () => { /* status {last_ready:{slot:'evening', published_at 18:04}} → текст «Обновлено в 18:04 · вечерний выпуск» */ });
test('news home says «готовится»/«задерживается», never «сейчас»', () => {});
test('overview: rows of later editions carry «новое в 18:00»; edition filter narrows the list', () => {});
test('overview: since-last-visit marks only rows published after lastVisit; no storage → no marks, no error', () => {});
test('editor: editions card shows late editions and the 7-day average per slot', () => {});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `node --test tests/newsUi.test.js tests/newsEditorUi.test.js` → PASS; проверка ширины 390px в браузере (Playwright) — главная, обзор, редактор, светлая и тёмная тема.
- [ ] **Step 5:** `git commit -m "feat(news): edition times on the site, editions card in the editor"`

### Task A9: Задание dot, документация, выпуск

**Files:**
- Rewrite: `news/harvest/dotTask.md`
- Modify: `docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md` (новый §18), версии (`CACHE_VERSION`, `APP_VERSION`, `?v=`, подвал Зала)

- [ ] **Step 1:** `dotTask.md` — части: «Как узнать следующий выпуск» (`GET /api/news/editor/editions/next`, скачать `…/download`; повтор безопасен); «Главные статьи» (как сейчас, + `rework/` с причиной в `harvest.json.rework`); «Обзор (только новое)» (v2: переводить только пустые `*_ru`; `context_title_ru` — для единообразия, не переводить); «Проверка» (`--check-only`; упаковщик сам вписывает отказы в `manifest.rejected` — их не нужно чинить в этом же выпуске); «Загрузка». Расписание dot: каждый срез + 15 мин.
- [ ] **Step 2:** §18 формата: таблицы, состояния выпуска, правила отбора, аренда, попытки, адреса, `overview.json` v2, `manifest.edition_id`/`rejected`, `GET /api/news/status`.
- [ ] **Step 3:** `npm test` → все зелёные (кроме известных до этой работы: `atlasNativeMath` — сверить с `main` до начала); `npm run smoke:reader-parity` (не входит в `npm test`).
- [ ] **Step 4:** Версии lockstep → 3.11.894; один коммит, пуш; на проде — диск ≥ 10% свободно до деплоя (удалить предыдущий образ и кэш сборки), миграция 083 применилась, `GET /api/news/status` отвечает.
- [ ] **Step 5:** Живая проверка на проде: ближайший срез собрал выпуск (`/api/news/editor/editions`), архив скачивается, `build-pack --check-only` на реальном архиве с заглушками даёт ожидаемые отказы; после загрузки dot — «Обновлено в …» на сайте. Замеры времени первых пробных выпусков → владельцу для сдвига срезов.

---

# Часть B — отпечатки и перепроверка обновлений (выпуск 3.11.895)

### Task B1: Отпечатки оригинала

**Files:**
- Create: `news/newsFingerprint.js`; migration `migrations/084_news_fingerprints.sql` (+down)
- Modify: `db/newsRepo.js` (`ingestArticle` — запись отпечатка)
- Test: `tests/newsFingerprint.test.js`

**Interfaces:**
- Produces:
  - Таблицы: `news_article_fingerprints(article_id TEXT PK, url TEXT NOT NULL, title_hash TEXT NOT NULL, para_hashes_json TEXT NOT NULL, last_seen_json TEXT, checked_at TEXT, created_at TEXT NOT NULL)`; `news_article_changes(id INTEGER PK AUTOINCREMENT, article_id TEXT NOT NULL, detected_at TEXT NOT NULL, edition_id TEXT, source_updated_at TEXT, added INT, changed INT, removed INT, title_changed INT, new_title_he TEXT, significant INT NOT NULL)`; индекс `(article_id, detected_at)`.
  - `normalizeForPrint(text) -> string` — NFC, без огласовки/таамим, кавычки/геры/гершаим/апострофы удалены, пунктуация удалена, пробелы схлопнуты.
  - `fingerprintOf(titleHe, paragraphs: string[]) -> { title_hash, para_hashes: string[] }` (sha256 по `normalizeForPrint`, 16 hex).
  - `diffPrints(old, now) -> { added, changed, removed, title_changed: bool, significant: bool }` — мультимножества хэшей: `oldOnly`, `newOnly`; `changed = min(|oldOnly|, |newOnly|)`, `added = |newOnly| − changed`, `removed = |oldOnly| − changed`; `significant = title_changed || added + changed ≥ 1`.
  - При приёме статьи с версией `OR`: отпечаток по `learning.title_he` и `source_text_he.split('\n\n')`; статьи без `source_text_he` — без отпечатка.

- [ ] **Step 1: Tests**

```js
test('fingerprint: quotes, geresh, spaces and punctuation do not make a change', () => {
  // 'אמר "שלום" לכולם.' vs 'אמר ״שלום״  לכולם' → significant false
});
test('diffPrints: 4 new paragraphs and a new title', () => { /* added 4, changed 0, title_changed true, significant true */ });
test('diffPrints: one paragraph reworded counts as changed, not added+removed', () => { /* changed 1, added 0, removed 0 */ });
test('ingest stores a fingerprint for an OR article', async () => {});
```

- [ ] **Step 2–4:** FAIL → реализовать → `node --test tests/newsFingerprint.test.js tests/newsRepo.test.js` PASS.
- [ ] **Step 5:** `git commit -m "feat(news): fingerprints of the original per paragraph"`

### Task B2: Перепроверка на срезе

**Files:**
- Modify: `news/harvest/newsHarvest.js` (вызов перед `buildEdition`), `db/newsOverviewItems.js`
- Test: `tests/newsHarvest.test.js`

**Interfaces:**
- Consumes: `fingerprintOf`, `diffPrints` (B1); `get`, `allowed`, `extractArticle` харвестера.
- Produces: `recheckPublished({ editionId }) -> { checked, changed }` — статьи из `news_article_fingerprints` с `created_at` за 24 ч и `tier='fresh'`; по одной с паузой `delayMs`; сравнение с `last_seen_json` (или исходным); при `significant` — строка `news_article_changes`, `last_seen_json` обновляется; при `title_changed` — у строки обзора (`item_key = article_id`) `title_he` = новый, `title_ru = NULL`, `changed_at`, `change_json`; у `news_harvest_items` — `overview_state='todo'`, чтобы новый заголовок ушёл dot в следующем выпуске (`changed: true` в `overview.json`). Опубликованная статья (`news_articles`, `news_works`) не трогается. Ошибка страницы — пропуск без записи.

- [ ] **Step 1: Tests**

```js
test('recheck: an article updated by the outlet gets a change row; the article itself is untouched', async t => {
  // опубликована статья (3 абзаца); страница теперь 5 абзацев и новый заголовок → change { added 2, title_changed 1 }
  // news_works.snapshot_json не изменился; строка обзора title_ru null, changed_at задан
});
test('recheck: the same update is recorded once', async t => { /* две перепроверки → одна строка changes */ });
test('recheck: only articles of the last 24 h, robots respected', async t => {});
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): re-check published articles at each cut-off"`

### Task B3: Пометка на сайте, выпуск

**Files:** `db/newsRepo.js` (в данные шапки статьи — `source_change: { at, source_updated_at, added, changed, title_changed }` последней существенной правки), `public/js/news-reader.js`, `public/css/news-reader.css`, `public/js/news-ui.js`, локали; версии.

- [ ] **Step 1: Tests** (`tests/newsReaderEntry.test.js`, `tests/newsUi.test.js`): шапка с `source_change` показывает `news.reader.sourceChanged` «Издание обновило статью в {time}: {parts} ↗» (`{parts}`: «+N абзацев», «изменено N», «новый заголовок», через запятую; ссылка на оригинал); строка обзора с `changed_at` — `news.overview.changed` «обновлено изданием в {time}».
- [ ] **Step 2–4:** FAIL → реализовать → PASS; 390px.
- [ ] **Step 5:** `npm test`, версии → 3.11.895, коммит, пуш, деплой; через неделю — сводка по `news_article_changes` владельцу (сколько статей, сколько абзацев, в какие часы) для решения о варианте «Б».

---

# Часть C — выбор dot, интересы, сигнал чтения (выпуск 3.11.896)

### Task C1: Черновики по заказу dot

**Files:** `news/harvest/newsHarvest.js`, `news/harvest/newsEditionBuild.js` (`candidates.json` в архиве), `news/newsRoutes.js`, `db/newsRepo.js`, migration `085_news_selected_by.sql` (+down: `news_articles.selected_by TEXT`, `selection_note_ru TEXT`); tests `tests/newsHarvest.test.js`, `tests/newsRoutes.test.js`.

**Interfaces:**
- `candidates.json` в архиве: `{ edition_id, items: [{ item_key, story_key, outlet_id, section, title_he, lead_he, full_ok, paywalled, images }] }` — статьи выпуска без полного разбора.
- `POST /api/news/editor/editions/:id/extras` `{ items: [{ item_key, note_ru }] }` → `application/zip` с черновиками `<outlet>-x<NN>.draft.json` + фото; `learning.selected_by: 'dot'`, `learning.selection_note_ru` (1–200 знаков). Харвестер: `main_state='drafted'`, `main_edition_id`, `selected_by='dot'`, `selection_note_ru`, `extras_count+1`. Коды: 409 `EXTRAS_LIMIT` (> `schedule.extras` = 5 на выпуск, с учётом прежних заказов), 404 `UNKNOWN_ITEM`, 409 `NO_BODY` (тело удалено или `full_ok=0`), 409 `PAYWALL`, 409 `ALREADY_TAKEN` (`main_state ≠ 'none'`), 400 `NOTE_REQUIRED`.
- Приём: `learning.selected_by === 'dot'` без соответствующего `news_harvest_items.selected_by='dot'` → метка снимается, предупреждение `SELECTED_BY_UNVERIFIED`; иначе `news_articles.selected_by`, `selection_note_ru`; в карточках (`CARD_COLS`) и шапке статьи.

- [ ] **Step 1: Tests:** `extras: up to 5 per edition, the sixth is EXTRAS_LIMIT`; `extras: the draft is verbatim from the stored body with photos and the dot label`; `extras: paywalled / no body / already taken are refused with their codes`; `ingest: a dot label without an order is dropped with SELECTED_BY_UNVERIFIED`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): dot orders extra drafts (up to 5 per edition)"`

### Task C2: Интересы и сигнал чтения

**Files:** migration `086_news_reading.sql` (+down: `news_read_signals(id INTEGER PK AUTOINCREMENT, article_id TEXT NOT NULL, event TEXT NOT NULL CHECK(event IN ('open','finish')), at TEXT NOT NULL)`, индекс `(at)`), `news/newsRoutes.js`, `news/harvest/newsEditionBuild.js`, `public/js/news-reader.js`; tests `tests/newsRoutes.test.js`, `tests/newsHarvest.test.js`, `tests/newsReaderEntry.test.js`.

**Interfaces:**
- `GET /api/news/editor/interests` → `{ ok, text, updated_at }`; `PUT` (только владелец) `{ text }` ≤ 4000 знаков → `news_settings.interests`.
- `POST /api/news/read` `{ work_id, event: 'open'|'finish' }` — пишет, **только если** `resolveUser` даёт роль `owner` (как в `actorFor`); иначе `204` без записи; одна запись `open` на статью в час, `finish` — один раз на статью в сутки; события старше 90 дней удаляются в `cleanup`.
- `news-reader.js`: `open` — при показе новостной статьи в Зале; `finish` — когда последняя строка таблицы попала в видимую область (IntersectionObserver; без него — не отправлять); ошибки сети молча.
- Архив выпуска: `interests.md` (текст, или «Интересы не записаны»), `reading.json` = `{ days: 14, by_section: { politics: { open, finish } … }, by_outlet: {…}, by_selected: { auto: {open, finish}, dot: {open, finish} }, recent: [{ title_he, title_ru, story_key, section, outlet_id, selected_by, finished, at }] }` (последние 30).

- [ ] **Step 1: Tests:** `read: only the owner's reading is recorded; others get 204 and nothing is stored`; `read: open is recorded once per hour, finish once per day`; `edition archive carries interests.md and reading.json with 14-day counts`; `reader: finish is sent when the last row becomes visible`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): owner interests and reading signal for dot"`

### Task C3: UI, задание dot, выпуск

**Files:** `public/js/news-editor-ui.js` (карточка «Мои интересы в новостях»: поле, «Сохранить», счётчик знаков), `public/js/news-ui.js` + `news-reader.js` (метка `news.selectedByDot` «выбрано dot» и строка причины), локали, `dotTask.md` (часть «Свои статьи, необязательно»: читать `interests.md`, `reading.json`, `candidates.json`; заказать до 5 с причиной; черновики переводить так же), §18 формата; версии.

- [ ] **Step 1: Tests** (`tests/newsEditorUi.test.js`, `tests/newsUi.test.js`): карточка интересов сохраняет текст (PUT) и показывает ошибку > 4000; карточка статьи с `selected_by: 'dot'` показывает метку и причину.
- [ ] **Step 2–4:** FAIL → реализовать → PASS; 390px.
- [ ] **Step 5:** `npm test`, версии → 3.11.896, коммит, пуш, деплой.

---

# Часть D — выгрузка архива на ПК и возврат (выпуск 3.11.897)

Важно: фото и тексты лежат **в SQLite** (`news_images.bytes`, `news_articles.body_json`). Удалённые строки освобождают страницы внутри файла БД, и новые данные пишутся в них — БД перестаёт расти, но файл не уменьшается без `VACUUM` (которому нужно место размером с БД). Поэтому «свободно» = свободно на диске + свободные страницы SQLite (`PRAGMA freelist_count × page_size`); `VACUUM` не запускается автоматически (отметить владельцу при переезде на больший сервер).

### Task D1: Сервер — место, выгрузка дня, освобождение, возврат

**Files:** create `news/newsOffload.js`; migration `087_news_offloads.sql` (+down: `news_offloads(day TEXT PK, sha256 TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('exported','released','restored')), articles INT, photos INT, bytes INT, exported_at TEXT, released_at TEXT, restored_at TEXT)`, `news_articles.offloaded_day TEXT`); `db/newsRepo.js`, `news/newsRoutes.js`; test `tests/newsOffload.test.js`.

**Interfaces:**
- `createNewsOffload({ db, repo, dataDir, now })` → `{ storage() , exportDay(day) -> { buf, sha256, articles, photos }, release(day, sha256), restoreAllowed(actor, manifest) }`.
- `GET /api/news/editor/storage` → `{ ok, disk: { free, total }, db_free: <байт свободных страниц>, low: free + db_free < 2 ГБ, by_month: [{ month, photos, bodies }], offloaded: [{ day, state, sha256, articles, photos, bytes, released_at }], suggest: { days: [...], bytes } }` — `suggest`: самые старые дни, где все статьи `tier='archive'` и нет `offloaded_day`, пока сумма ≥ 1 ГБ или дни не кончились; `disk` через `fs.statfsSync(DATA_DIR)`.
- `GET /api/news/editor/offload/:day` (владелец) → `.lpnews.zip` дня: статьи дня (израильская дата `published_at`) со всеми фото и слоем «В контексте» (восстановить из `news_works.snapshot_json`), строки обзора дня (`overview.json` v2 с `edition_id: null`, `restore: true`); `manifest.restore = { day, articles: [{ article_id, created_at, selected_by, selection_note_ru, story_key }] }`; заголовок `X-Pack-Sha256`; `news_offloads` `state='exported'`, `sha256`.
- `POST /api/news/editor/offload/:day/release` `{ sha256 }` (владелец, CSRF) → совпал с `news_offloads.sha256` и `state='exported'` → в транзакции: `DELETE FROM news_images`, `body_json=NULL`, `DELETE FROM news_works`, `offloaded_day=day` для статей дня; строки обзора остаются; `state='released'`. Иначе 409 `OFFLOAD_SHA_MISMATCH` / `OFFLOAD_NOT_EXPORTED`, ничего не удалено.
- Приём пакета с `manifest.restore`: только владелец (иначе весь пакет 403 `RESTORE_OWNER_ONLY`); статьи пишутся с исходным `created_at`, tier по `tierFor` (статья старше 6 месяцев честно становится `card`), `offloaded_day=NULL`; `news_offloads.state='restored'`; повтор — `duplicate`.
- Открытие выгруженной статьи (`/api/public-corpora/news-:outlet/works/:workId` и карточки): 410 `NEWS_OFFLOADED`; карточка `readable: false, offloaded: true`.

- [ ] **Step 1: Tests:**

```js
test('export → release: the day leaves photos and bodies, cards and overview rows stay', async () => {});
test('release: wrong sha256 deletes nothing', async () => { /* 409 OFFLOAD_SHA_MISMATCH; news_images count unchanged */ });
test('release without export is refused', async () => { /* 409 OFFLOAD_NOT_EXPORTED */ });
test('restore: the owner brings the day back, articles open again with the same work ids', async () => {});
test('restore: an editor key cannot restore', async () => { /* 403 RESTORE_OWNER_ONLY */ });
test('storage: low when free + db free pages < 2 GB; suggest takes the oldest archived days', async () => {});
test('offloaded article opens as 410 NEWS_OFFLOADED', async () => {});
```

- [ ] **Step 2–4:** FAIL → реализовать → `node --test tests/newsOffload.test.js tests/newsRoutes.test.js tests/newsRepo.test.js` PASS.
- [ ] **Step 5:** `git commit -m "feat(news): offload archived days to the owner's PC and restore"`

### Task D2: Кнопки в браузере и напоминание

**Files:** create `public/js/news-offload-ui.js` (+ в список SW/целостности); modify `public/js/news-editor-ui.js` (карточка «Место»), `public/js/news-ui.js` (плашка владельцу), `public/js/news-reader.js`/`library-ui.js` (сообщение для `NEWS_OFFLOADED`), CSS, локали; test `tests/newsOffloadUi.test.js`.

**Interfaces:**
- `NewsOffload.run({ api, pickDir = () => showDirectoryPicker({ mode: 'readwrite' }), days, onProgress }) -> { done: day[], failed: [{ day, code }] }` — по дню: `GET offload/:day` → записать `news-<day>.lpnews.zip` → перечитать файл с диска → `crypto.subtle.digest('SHA-256')` == `X-Pack-Sha256` → `POST …/release`; несовпадение → день в `failed` (`LOCAL_SHA_MISMATCH`), без release. После — `offload-index.json` (дополняется, не перезаписывается) и `ПРОЧТИ.txt`.
- `NewsOffload.restore({ api, pickDir }) -> { done, failed }` — читает `offload-index.json`, загружает каждый файл через тот же путь загрузки пакетов, что редактор (`/api/news/editor/packs`).
- Нет `showDirectoryPicker` → кнопки заменяются текстом `newsEditor.offload.needDesktop` «Выгрузка работает в Chrome или Edge на компьютере».
- Плашка (`news.offload.banner`): «Место на сервере заканчивается. Можно выгрузить на этот компьютер {days} дн. архива (≈{size}). [Выгрузить]» — на `/news.html` и в редакторе, только владельцу (`/api/news/editor/me` → `kind: 'owner'`) при `storage.low`; кнопка ведёт в карточку «Место».
- Карточка «Место»: свободно (диск + страницы БД), по месяцам, список выгруженных дней, «Выгрузить предложенные», «Вернуть выгруженное на сервер», прогресс по дням.
- Выгруженная статья в Зале: `news.reader.offloaded` «Материал этой статьи выгружен в архив владельца. Оригинал ↗».
- `ПРОЧТИ.txt` (ru, точный смысл): что это (архив новостей LinguistPro по дням, выгруженный с сервера, чтобы освободить место); не переименовывать и не распаковывать; как вернуть: «Редактор новостей → Место → Вернуть выгруженное на сервер → выбрать эту папку»; запасной путь: `node scripts/news/offload.js --restore <эта папка>` из репозитория LinguistPro; дата выгрузки и список дней.

- [ ] **Step 1: Tests** (с подставной файловой системой): `offload: each day is written, read back, verified, then released`; `offload: a mismatch after read-back does not release`; `offload: index is appended, not replaced`; `restore: every file of the index is uploaded`; `banner: only the owner sees it, only when low`; `no File System Access → the desktop hint instead of buttons`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS; ручная проверка в Chrome на ПК на тестовой БД (выгрузить 2 дня, проверить файлы, вернуть).
- [ ] **Step 5:** `git commit -m "feat(news): offload/restore buttons and low-space reminder"`

### Task D3: Запасной скрипт, выпуск

**Files:** create `scripts/news/offload.js`; test `tests/newsOffload.test.js` (CLI-функция).
- `offload({ base, key, from, to, dir })` / `restore({ base, key, dir })` — тот же порядок, что в браузере (скачать → записать → перечитать → sha256 → release), тот же `offload-index.json`; ключ редактора из переменной окружения `LP_NEWS_EDITOR_KEY` (не в аргументах), но выгрузка требует владельца → скрипт принимает cookie-сессию владельца из `LP_OWNER_SESSION` (точное имя — как в `scripts/news/harvest.js`, если там уже есть способ входа; иначе — этот).
- [ ] **Step 1–4:** тест «скрипт выгружает и возвращает день против поднятого в тесте сервера» → FAIL → реализовать → PASS.
- [ ] **Step 5:** `npm test`, версии → 3.11.897, коммит, пуш, деплой; на проде — `GET /api/news/editor/storage` показывает реальные цифры; владельцу — объяснить про «файл БД не уменьшается, но перестаёт расти».

---

## Самопроверка (выполнена при написании)

- Покрытие спека: §4.1 → A1/A4/A7; §4.2 → A3; §4.3 → A2/A5/A8; §4.4 → B1–B3; §4.5 → C1–C3; §5.1 → A1/A4/A7; §5.3 → A4/A7; §5.4 → A5; §5.8 → A6/A7; §5.9 → A7/A9; §5.10 → A8/B3/C3; §5.11 → D1–D3; §6 (диск, DST, вежливость) → Global Constraints, Review Focus 3, D-вступление.
- Отклонение от спека, решение Claude: строки обзора дня при выгрузке остаются на сервере (≈0,4 МБ/день — удаление ничего не даёт), в пакет дня они входят для полноты.
