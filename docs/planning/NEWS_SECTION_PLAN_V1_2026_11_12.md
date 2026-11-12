# Новостной раздел v1 — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вкладка «Новости»: 7 изданий → рубрики → лента учебных пересказов, которые открываются обычным учебным экраном Зала. Пакеты `.lpnews.zip` от dot принимаются через вход «Редактор новостей» и публикуются автоматически; через 3 дня статья уходит в архив, через 6 месяцев от неё остаётся карточка.

**Architecture:** Сервер хранит статьи в своих таблицах (`news_*`), а не в изданиях публичных корпусов: тысяча статей в день не ложится на модель «новое издание корпуса на каждую публикацию». Для читалки каждая статья отдаётся **в той же форме, что публичная работа корпуса** (`public_corpus_work.1.0.0`, `snapshot = {library:{texts:[text]}}`) по адресу `/api/public-corpora/news-<outlet>/works/<work_id>`. Тогда Зал открывает её существующим путём `CorpusMaterialize.ensurePublicWork` → `openReader`, и таблица, огласовка, морф-карточка, «в контексте (ИИ)», статус слов и озвучка работают без новой читалки. Вход dot — отдельный ключ редактора и отдельные сессии, которые признают **только** маршруты `/api/news/editor/*`.

**Tech Stack:** Node/Express (`server.js`), sqlite3 + `migrations/*.sql`, `adm-zip`, `node:test`, ванильный JS в `public/js`, локали `public/i18n/locales/{ru,en,he}.js`, SW `public/sw.js`.

**Spec:** `docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md` (утверждён владельцем 2026-11-12), контекст — `docs/planning/NEWS_SECTION_BRAINSTORM_2026_11_12.md` §12.

## Global Constraints

- `schema` = `linguistpro-news-pack`, `schema_version` = `1`; файл `.lpnews.zip`.
- `outlet_id` ∈ `ynet`, `mako`, `walla`, `maariv`, `c14`, `n12`, `haaretz`; домены — спецификация §4; `mako.co.il/news-*` → `n12`.
- Ключ статьи = `outlet_id` + нормализованный `canonical_url` (https, хост в нижнем регистре, без `utm_*`/`fbclid`/`#…`, без хвостового `/`).
- Дословность: 5-словные отпечатки, SHA-256 → первые 16 hex; > 15% → `VERBATIM_OVERLAP`, 8–15% → `flagged`; отпечатки внутри кавычек не считаются.
- Строки версии: 3–120; `original_title_he` ≤ 160 символов; архив ≤ 50 МБ, ≤ 1000 статей, `article.json` ≤ 256 КБ, картинка ≤ 1 МБ; ≤ 20 пакетов в час на один вход.
- Свежесть 72 ч от `published_at`; архив до 6 месяцев; потом карточка. Сдвиг часов: `published_at` до +10 мин в будущем допустим.
- Фото по `source_link` у нас не скачиваются и не хранятся. Если картинка не загрузилась — запасная обложка.
- Публикация автоматическая; владелец может снять статью, снять пакет, отозвать вход редактора.
- Новость не попадает в «Мои материалы» без действия пользователя.
- Плашка источника: «Учебный пересказ LinguistPro по материалам {outlet} · {дата} · Оригинал ↗». Логотипы изданий не используем.
- Каждая видимая строка — ключ в `ru.js`, `en.js`, `he.js` (запасной текст в `tt()` мёртв).
- Выпуск: `CACHE_VERSION` в `public/sw.js`, `window.APP_VERSION` и `?v=` меняются вместе; новые файлы — в precache/integrity.
- Огласовку Dicta массово не запрашивать (бан IP); проверка — только существующим механизмом при открытии.
- Python для правки `server.js` не использовать (CRLF).

## Review Focus

1. **Враждебный архив** (`../` в путях, абсолютные пути, зип-бомба, лишние файлы) → пакет или статья отклоняются до распаковки на диск; ничего не пишется вне хранилища. Тест — Task 3.
2. **Два пакета с одной статьёй одновременно или повторная загрузка оборванного пакета** → одна запись, итог `duplicate`/`revised`, без двойной публикации. Приём сериализован. Тест — Task 3.
3. **Статья исправлена (`revision` 2) после того, как читатель её открыл** → у читателя появляется новая версия (другой `snapshot_sha256`), старая локальная копия без пользовательских данных удаляется очисткой. Тест — Task 6.
4. **Картинка `javascript:`/`http:`/не на `https`** → `IMAGE_INVALID`; битая картинка в ленте → запасная обложка без дёргания разметки. Тесты — Task 3, Task 7.
5. **`published_at` без часового пояса или чуть в будущем** (часы dot спешат) → без пояса `DATE_MISSING`; до +10 мин принимается. Тест — Task 2.

## Вне v1 (данные принимаются и хранятся в `body_json`, интерфейса нет)

`glossary`, `abbreviations`, `entities`, `questions`, `story_key` («разные голоса»), `title_en`/`en` (в читалке колонка перевода — `ru`), уровни сверх первого показываются только переключателем уровня на карточке (`levels`). Следующие планы: сюжеты и «разные голоса», газетный иврит, вопросы на понимание.

---

### Task 1: Справочник изданий и ядро формата

**Files:**
- Create: `public/js/news-outlets.js` (UMD: браузер + Node)
- Create: `news/newsPackCore.js` (CommonJS, только Node)
- Test: `tests/newsPackCore.test.js`

**Interfaces:**
- Produces: `NewsOutlets.OUTLETS: Array<{id, name_he, name_latin, color, domains: string[], pathRules?: Array<{host, prefix, outlet}>}>`; `NewsOutlets.outletForUrl(url: string) → string|null`; `NewsOutlets.byId(id) → outlet|null`.
- Produces: `normalizeHebrewText(s) → string`; `shingles(text) → string[]` (уникальные, 16 hex); `quotedSpans(text) → Array<[start,end]>`; `overlapRatio(paraphraseTexts: string[], sourceShingles: string[]) → number` (0..1, без отпечатков в кавычках); `canonicalizeUrl(url) → string`; `articleKey(outletId, canonicalUrl) → 'na_' + 24 hex`; `validateArticle(article, {now}) → {ok: boolean, code?: string, warnings: string[]}`; `SECTIONS`, `CONTENT_TYPES`, `LEVELS`, `SENSITIVE_KINDS` — массивы из спецификации §5.2.

- [ ] **Step 1: Тесты**

```js
test('outletForUrl routes mako news to n12 and rejects foreign hosts', () => {
  assert.equal(O.outletForUrl('https://www.mako.co.il/news-politics/2026_q4/Article-1.htm'), 'n12');
  assert.equal(O.outletForUrl('https://www.mako.co.il/tv-ratings/x'), 'mako');
  assert.equal(O.outletForUrl('https://news.walla.co.il/item/3700000'), 'walla');
  assert.equal(O.outletForUrl('https://ynet.co.il.evil.com/a'), null);
});
test('canonicalizeUrl strips tracking and is stable', () => {
  assert.equal(C.canonicalizeUrl('http://WWW.Ynet.co.il/news/article/abc/?utm_source=x&fbclid=y#top'), 'https://www.ynet.co.il/news/article/abc');
  assert.equal(C.articleKey('ynet', 'https://www.ynet.co.il/news/article/abc'), C.articleKey('ynet', C.canonicalizeUrl('https://www.ynet.co.il/news/article/abc/')));
});
test('normalizeHebrewText removes niqqud, final letters and punctuation', () => {
  assert.equal(C.normalizeHebrewText('שָׁלוֹם, עוֹלָם!'), 'שלומ עולמ');
});
test('overlapRatio ignores quoted spans and detects copying', () => {
  const src = 'הכנסת אישרה אתמול בלילה את תקציב המדינה בקריאה ראשונה אחרי דיון ארוך';
  assert.ok(C.overlapRatio([src], C.shingles(src)) > 0.9);
  assert.equal(C.overlapRatio(['לדבריו "הכנסת אישרה אתמול בלילה את תקציב המדינה"'], C.shingles(src)), 0);
});
test('validateArticle: required fields, clock skew, image scheme', () => {
  const a = fixtureArticle(); // tests/helpers/newsFixture.cjs, Task 1 creates it
  const now = Date.parse('2026-11-12T08:00:00+02:00');
  assert.equal(C.validateArticle(a, { now }).ok, true);
  assert.equal(C.validateArticle({ ...a, source: { ...a.source, published_at: '2026-11-12T07:40:00' } }, { now }).code, 'DATE_MISSING');
  assert.equal(C.validateArticle({ ...a, source: { ...a.source, published_at: '2026-11-12T08:09:00+02:00' } }, { now }).ok, true);
  assert.equal(C.validateArticle({ ...a, source: { ...a.source, published_at: '2026-11-12T08:30:00+02:00' } }, { now }).code, 'DATE_IN_FUTURE');
  assert.equal(C.validateArticle({ ...a, image: { mode: 'source_link', url: 'javascript:alert(1)' } }, { now }).code, 'IMAGE_INVALID');
  assert.equal(C.validateArticle({ ...a, learning: { ...a.learning, title_he: a.source.original_title_he } }, { now }).code, 'TITLE_COPIES_ORIGINAL');
  assert.equal(C.validateArticle({ ...a, source: { ...a.source, url: 'https://evil.com/x', canonical_url: 'https://evil.com/x' } }, { now }).code, 'URL_DOMAIN_MISMATCH');
});
```

`tests/helpers/newsFixture.cjs` экспортирует `fixtureArticle()` — валидную статью по примеру §5.1 спецификации (3 строки, `check.source_shingles` от отдельного исходного текста, не совпадающего с пересказом) и `fixturePack(articles) → Buffer` (собирает zip через `adm-zip`).

- [ ] **Step 2:** `node --test tests/newsPackCore.test.js` → FAIL (модулей нет).
- [ ] **Step 3: Реализация.** Нормализация по §6: NFC → убрать `[֑-ׇ]` → кавычки/гершаим (`"״׳'”“„`) → `"`, тире → пробел → убрать прочую пунктуацию → `ךםןףץ`→`כמנפצ` → схлопнуть пробелы. Отпечатки считаются по словам; окно из 5 слов отбрасывается, если хотя бы одно слово лежит внутри `quotedSpans` (пары `"…"` в исходной строке до нормализации). Коды отказа `validateArticle` — ровно список §9 спецификации, первый найденный. Цвета изданий нейтральные и различимые; текст на метке проходит контраст AA в светлой и тёмной теме.
- [ ] **Step 4:** тот же запуск → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): outlet registry and pack format core"`

### Task 2: Программа упаковки для dot

**Files:**
- Create: `scripts/news/build-pack.js`
- Test: `tests/newsBuildPack.test.js`

**Interfaces:**
- Consumes: `newsPackCore` (Task 1).
- Produces: CLI `node scripts/news/build-pack.js <папка> [--out file.lpnews.zip] [--check-only] [--producer dot]`; модульная функция `buildPack(dir, {checkOnly, producer, now}) → {ok, written?: string, articles: Array<{file, ok, code?, overlap}>}`.

- [ ] **Step 1: Тесты**

```js
test('buildPack strips source_text_he and computes check', async () => {
  const dir = draftDir([{ ...draft(), source_text_he: SOURCE }]);
  const r = await buildPack(dir, { producer: 'dot', now: NOW });
  const zip = new AdmZip(r.written);
  const a = JSON.parse(zip.readAsText(zip.getEntries().find(e => e.entryName.endsWith('article.json'))));
  assert.equal('source_text_he' in a, false);
  assert.equal(a.check.source_word_count, SOURCE.split(/\s+/).length);
  assert.deepEqual(a.check.source_shingles, C.shingles(SOURCE));
  const m = JSON.parse(zip.readAsText('manifest.json'));
  assert.equal(m.schema, 'linguistpro-news-pack'); assert.equal(m.articles.length, 1);
  assert.equal(m.articles[0].sha256, sha256(zip.readFile(m.articles[0].path)));
});
test('buildPack reports per-file errors and still packs the good ones', async () => {
  const dir = draftDir([{ ...draft(), source_text_he: SOURCE }, { ...draft(), learning: { ...draft().learning, versions: [{ level: 'B1', rows: [{ he_plain: SOURCE, ru: 'x' }] }] }, source_text_he: SOURCE }]);
  const r = await buildPack(dir, { now: NOW });
  assert.deepEqual(r.articles.map(x => x.code || 'ok').sort(), ['VERBATIM_OVERLAP', 'ok']);
  assert.equal(new AdmZip(r.written).getEntries().filter(e => e.entryName.endsWith('article.json')).length, 1);
});
test('--check-only writes nothing', async () => {
  const r = await buildPack(draftDir([{ ...draft(), source_text_he: SOURCE }]), { checkOnly: true, now: NOW });
  assert.equal(r.written, undefined);
});
```

- [ ] **Step 2:** `node --test tests/newsBuildPack.test.js` → FAIL.
- [ ] **Step 3: Реализация.** Каждый `*.draft.json` → папка `articles/<outlet>-<NNNN>/`; файлы слоя `word_gloss_ai` и `image.file` копируются из той же папки, что и draft. `pack_id` — `crypto.randomUUID()`, `created_at` — локальное время с поясом. Вывод CLI на русском: строка на статью + итог; код выхода 1, если не собрано ни одной.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): pack builder for dot"`

### Task 3: Хранилище и приём пакета

**Files:**
- Create: `migrations/078_news.sql`
- Create: `news/newsSnapshot.js`
- Create: `db/newsRepo.js`
- Test: `tests/newsRepo.test.js` (настройка БД — как в `tests/mediathequeMaterialCommands.test.js:16-22`, плюс `078_news.sql`)

**Interfaces:**
- Consumes: Task 1; `wordGlossLayerReport`, `boundedFieldMeta` из `publication/materialArchive.js`.
- Produces: `createNewsRepo({db, now?}) → repo` с методами:
  - `ingestPack(actor: {id, kind: 'owner'|'editor'}, zip: Buffer) → Promise<Receipt>`, где `Receipt = {pack_id, totals: {published, archived, revised, duplicate, flagged, withdrawn, rejected}, items: Array<{path, article_id?, work_id?, status, code?, overlap?}>, warnings: string[]}`;
  - `withdrawArticle(actor, articleId, reason) → {article_id, tier: 'withdrawn'}`; `withdrawPack(actor, packId, reason) → {count}`.
- Produces: `buildNewsSnapshot(articleRow, version) → {snapshot, snapshot_sha256}`; `workIdFor(articleId, level) → articleId + '.' + level.toLowerCase()`.

Таблицы `078_news.sql`:
- `news_articles(article_id PK, outlet_id, canonical_url, revision, section, content_type, published_at, retrieved_at, title_he, title_ru, summary_ru, original_title_he, author, story_key, heavy INTEGER, image_json, provenance_json, body_json NULL, tier CHECK(tier IN ('fresh','archive','card','withdrawn')), overlap REAL, flagged INTEGER, pack_id, withdrawn_reason, created_at, updated_at, UNIQUE(outlet_id, canonical_url))`; индексы `(outlet_id, tier, published_at DESC)`, `(outlet_id, section, published_at DESC)`, `(story_key)`, `(pack_id)`.
- `news_works(work_id PK, article_id REFERENCES news_articles ON DELETE CASCADE, level, snapshot_json, snapshot_sha256)`.
- `news_packs(pack_id PK, uploaded_by, uploaded_at, producer_json, receipt_json)`.
- `news_events(event_id PK, at, actor_id, pack_id, article_id, type, detail_json)`.
- `news_editors(editor_id PK, label, key_sha256 UNIQUE, status CHECK(status IN ('ACTIVE','REVOKED')), created_by, created_at, revoked_at)`; `news_editor_sessions(session_sha256 PK, editor_id, csrf, created_at, expires_at)`.

- [ ] **Step 1: Тесты**

```js
test('valid pack publishes, receipt counts per article', async t => {
  const { repo } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([fixtureArticle(), { ...fixtureArticle(), source: { ...fixtureArticle().source, outlet_id: 'nope' } }]));
  assert.equal(r.totals.published, 1); assert.equal(r.totals.rejected, 1);
  assert.equal(r.items.find(i => i.status === 'rejected').code, 'OUTLET_UNKNOWN');
});
test('same pack twice and concurrent packs with one article give one row', async t => {
  const { repo, db } = await setup(t); const zip = fixturePack([fixtureArticle()]);
  const [a, b] = await Promise.all([repo.ingestPack(OWNER, zip), repo.ingestPack(OWNER, fixturePack([fixtureArticle()]))]);
  assert.equal(a.totals.published + b.totals.published, 1);
  assert.equal(a.totals.duplicate + b.totals.duplicate, 1);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_articles')).n, 1);
});
test('higher revision replaces, lower is REVISION_STALE', async t => { /* revision 2 → 'revised', новый snapshot_sha256; затем revision 1 → rejected REVISION_STALE */ });
test('older than 72h goes straight to archive', async t => { /* published_at = now-4d → status 'archived', tier 'archive' */ });
test('overlap 8–15% is flagged, >15% rejected', async t => { /* пересказ с подобранной долей совпадающих отпечатков */ });
test('hostile zip: traversal, absolute path, oversize entry, sha mismatch', async t => {
  // '../evil.json' и '/abs.json' в manifest.articles → весь пакет отклонён PACK_INVALID, файлов вне хранилища нет;
  // запись с заявленным распакованным размером > 256 КБ → TOO_LARGE без распаковки; неверный sha256 → SHA_MISMATCH
});
test('withdraw removes from feed and logs event', async t => { /* manifest.withdraw и withdrawArticle → tier 'withdrawn', событие в news_events */ });
test('snapshot has reader shape and keeps gloss layer', async t => {
  const { snapshot } = buildNewsSnapshot(row, 'B1');
  const text = snapshot.library.texts[0];
  assert.equal(text.rows[0].hebrew_plain, fixtureArticle().learning.versions[0].rows[0].he_plain);
  assert.deepEqual(Object.keys(text.rows[0]).sort(), ['edit_meta', 'hebrew_niqqud', 'hebrew_plain', 'order_index', 'russian', 'translit', 'translit_ru']);
  assert.equal(text.source_meta.news.outlet_id, 'ynet');
  assert.equal(text.word_gloss_ai_layer.schema, 'word-gloss-ai-layer-v1');
});
```

- [ ] **Step 2:** `node --test tests/newsRepo.test.js` → FAIL.
- [ ] **Step 3: Реализация.** Сначала проверяются все имена записей zip (только `manifest.json`, `articles/<имя>/<файл>` из `[a-z0-9-]`, без `..`) и заявленные размеры; при нарушении — отказ всего пакета `PACK_INVALID`. Распаковка только в память. Приём сериализуется одной очередью на процесс, как `serialize()` в `db/publicationRepo.js`. Каждая статья — своя транзакция. `body_json` = `article.json` без `check`. Строки снимка — та же проекция, что `publication/materialArchive.js:67-68`; слой — через `wordGlossLayerReport(layer, rows.length)`; `text.title = title_he`, `text.text_key = 'news:' + work_id`, `text.source_meta.news = {outlet_id, canonical_url, published_at, author, section, content_type, original_title_he, image, prepared, quality, level}`. `snapshot_sha256` — SHA-256 канонического JSON снимка.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** `git commit -m "feat(news): storage and pack ingest"`

### Task 4: Чтение ленты и жизненный цикл

**Files:**
- Modify: `db/newsRepo.js`
- Test: `tests/newsRepoLifecycle.test.js`

**Interfaces:**
- Produces: `repo.listOutlets() → Array<{outlet_id, fresh_count, latest_at, sections: Array<{section, count}>}>`; `repo.listFeed({outlet_id, section?, tier: 'fresh'|'archive', q?, from?, to?, cursor?, limit≤50}) → {items: Card[], next_cursor: string|null}`, где `Card = {article_id, work_id, outlet_id, section, content_type, published_at, title_he, title_ru, summary_ru, levels: string[], image, heavy, story_key, tier, original_url}`; `repo.getWork(outletId, workId) → {item: {public_work_id, title, snapshot, snapshot_sha256}, edition: {...}}` в форме ответа `getPublicWork` (`db/publicationRepo.js:743-770`); `repo.runLifecycle(nowMs) → {to_archive, to_card}`.

- [ ] **Step 1: Тесты**

```js
test('runLifecycle: 72h → archive, 6 months → card drops body and works', async t => {
  // три статьи: 1 ч, 80 ч, 190 дней от published_at
  const r = await repo.runLifecycle(NOW);
  assert.deepEqual(r, { to_archive: 1, to_card: 1 });
  const card = await get(db, "SELECT body_json, tier FROM news_articles WHERE article_id=?", [oldId]);
  assert.equal(card.tier, 'card'); assert.equal(card.body_json, null);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_works WHERE article_id=?', [oldId])).n, 0);
});
test('fresh feed is newest first, paginates, never shows withdrawn', async t => { /* 60 статей, limit 50 → next_cursor; вторая страница 10; снятая не видна */ });
test('archive search by title and date range', async t => { /* q без огласовки находит title_he с огласовкой; from/to по published_at */ });
test('card-tier work is not readable', async t => { await assert.rejects(repo.getWork('ynet', cardWorkId), /NEWS_NOT_FOUND/); });
```

- [ ] **Step 2:** → FAIL. - [ ] **Step 3:** реализация; курсор — непрозрачная base64 пары `(published_at, article_id)`; поиск — `LIKE` по нормализованному `title_he`/`title_ru` (колонка `title_norm`; добавить её в `078_news.sql` в этой задаче). - [ ] **Step 4:** → PASS. - [ ] **Step 5:** `git commit -m "feat(news): feed, archive search and lifecycle"`

### Task 5: Вход редактора и маршруты сервера

**Files:**
- Create: `news/newsEditorAuth.js`
- Modify: `server.js` (рядом с маршрутами `/api/publication/mediatheque`, ~стр. 4507–4560; таймер — рядом с `_opsSweepInterval`, стр. 4301; CSP — стр. 270)
- Test: `tests/newsRoutes.test.js` (поднять express-приложение из `server.js` нельзя без окружения — тестировать `news/newsRoutes.js`)
- Create: `news/newsRoutes.js` — `mountNewsRoutes(app, {repo, editorAuth, requireUser, requireCsrf, rateLimit})`

**Interfaces:**
- Produces: `createNewsEditorAuth({db})` → `createEditor(ownerId, label) → {editor_id, key}` (ключ показывается один раз; хранится только `key_sha256`); `revokeEditor(ownerId, editorId)` (удаляет его сессии); `login(key) → {cookie, csrf, expires_at}`; `resolve(req) → {id: editor_id, kind: 'editor'}|null` — по cookie `lp_news_editor` либо заголовку `Authorization: Bearer <key>`.
- Маршруты:
  - публичные: `GET /api/news/outlets`, `GET /api/news/feed?outlet=&section=&tier=&q=&from=&to=&cursor=` и `GET /api/news/feed?work=<work_id>` → одна `Card` (с `tier`, в том числе `withdrawn`); `GET /api/public-corpora/news-:outlet/works/:workId` → `repo.getWork` в форме `public_corpus_work.1.0.0` (регистрировать **до** общего маршрута `/api/public-corpora/:slug/works/:workId`, стр. 4739);
  - редактор (владелец или ключ): `POST /api/news/editor/login`, `POST /api/news/editor/logout`, `POST /api/news/editor/packs` (тело — zip, `express.raw` ≤ 50 МБ), `GET /api/news/editor/journal`, `POST /api/news/editor/articles/:id:withdraw`, `POST /api/news/editor/packs/:id:withdraw`;
  - только владелец: `GET/POST /api/news/editor/editors`, `POST /api/news/editor/editors/:id:revoke`.

- [ ] **Step 1: Тесты**

```js
test('editor key works only on news editor routes', async () => {
  const { key } = await auth.createEditor('owner', 'dot');
  assert.equal((await post('/api/news/editor/packs', zip, { Authorization: 'Bearer ' + key })).status, 200);
  assert.equal(requireUserCalls.length, 0); // ключ редактора никогда не превращается в сессию пользователя
});
test('revoked key and its sessions stop working', async () => { /* revoke → 401 и по Bearer, и по cookie */ });
test('only owner manages editors', async () => { /* Bearer редактора на /editors → 403 */ });
test('cookie session needs csrf, bearer does not', async () => { /* POST с cookie без x-csrf → 403 */ });
test('rate limit: 21st pack in an hour → 429', async () => {});
test('news work served in public work shape', async () => {
  const r = await get('/api/public-corpora/news-ynet/works/' + workId);
  assert.equal(r.body.schema_version, 'public_corpus_work.1.0.0');
  assert.match(r.body.item.snapshot_sha256, /^[a-f0-9]{64}$/);
});
```

- [ ] **Step 2:** → FAIL. - [ ] **Step 3:** реализация; в `server.js` — только `mountNewsRoutes(...)`, `setInterval(() => newsRepo.runLifecycle(Date.now()), 3600*1000)` и в CSP для `/news.html` `img-src 'self' data: https:`. Каждый приём и снятие — `identityRepo.audit('news_*', …)`. - [ ] **Step 4:** → PASS; `node -e "require('./server.js')"` не нужен — `node --check server.js`. - [ ] **Step 5:** `git commit -m "feat(news): editor access and API routes"`

### Task 6: Открытие новости в Зале и очистка локальных копий

**Files:**
- Modify: `public/js/library-ui.js` (рядом с `openInitialPublicMaterial`, стр. ~10706)
- Create: `public/js/news-local-sweep.js`
- Test: `tests/newsLocalSweep.test.js`, `tests/newsReaderEntry.test.js`

**Interfaces:**
- Consumes: `CorpusMaterialize.ensurePublicWork(slug, card, deps, opts)`; `PublicCorpusAdapter.localTextKey(slug, workId, snapshot)` (ключи вида `public:news-<outlet>:<work_id>:<12 hex>`); `localDb.deleteText(id)`, `localDb.dbQuery(sql, params)`.
- Produces: адрес `library.html?news=<work_id>&outlet=<outlet_id>[&from=news]`; `NewsLocalSweep.run(ldb, {now, isFresh: (workId) => boolean}) → {removed, kept}`.

- [ ] **Step 1: Тесты**

```js
test('sweep keeps texts with any user state and removes the rest', async () => {
  // три локальных текста public:news-*: (a) без следов, статья в архиве; (b) с записью статуса слова/повторения; (c) свежая
  const r = await NewsLocalSweep.run(fakeDb, { now: NOW, isFresh: id => id === 'c' });
  assert.deepEqual(r, { removed: 1, kept: 2 });
});
test('superseded revision copy without user state is removed', async () => {});
test('reader entry builds the public-work card from /api/news/feed item and opens it', async () => { /* ?news= → openPublicCorpusWork('news-ynet', {public_work_id, snapshot_sha256, title}) */ });
```

- [ ] **Step 2:** → FAIL. - [ ] **Step 3:** «Пользовательские данные» = любая строка в любой таблице локальной БД, где есть колонка `text_id` (или `local_text_id`) со значением этого текста, кроме таблиц самого текста (строки, предложения). Список таблиц берётся из `sqlite_master` при запуске. Сомнение → не удалять. Очистка запускается после открытия Зала, не чаще раза в сутки (`localDb.getSyncState/setSyncState('news_sweep_at')`). Вход `?news=` открывает статью без загрузки каталога корпуса: карточку даёт `GET /api/news/feed?work=<id>`. Возврат — на `from=news`. Для текста с `source_meta.news` читалка показывает плашку источника сверху и внизу (Global Constraints), внизу — автор, рубрика, «подготовлено: {prepared.by} · дата», для `opinion` — «мнение автора колонки». Если `/api/news/feed?work=` отвечает, что статья снята, на плашке — «снята источником LinguistPro»; личная копия остаётся. Тест на плашку — в `tests/newsReaderEntry.test.js`.
- [ ] **Step 4:** → PASS; `npm run smoke:reader-parity` → PASS (он не входит в `npm test`).
- [ ] **Step 5:** `git commit -m "feat(news): open news in the Room reader and sweep local copies"`

### Task 7: Вкладка «Новости»

**Files:**
- Create: `public/news.html`, `public/js/news-ui.js`, `public/css/news.css`
- Modify: `public/js/app-nav.js:7-13,25` (пункт `{ id: "news", href: "/news.html", icon: "lp-icon-…", key: "appNav.news" }` после Медиатеки), `public/i18n/locales/{ru,en,he}.js`
- Test: `tests/newsUi.test.js`, `tests/appNav.test.js` (дополнить)

**Interfaces:**
- Consumes: `/api/news/outlets`, `/api/news/feed` (Task 5), `NewsOutlets` (Task 1).

Экраны (телефон — первым; RTL для иврита, интерфейс по локали):
1. **Издания:** 7 плиток (название на иврите + латиницей, цвет-метка, «N свежих»); сверху «Мои издания» — закреплённые (хранятся в `localStorage` в try/catch: это удобство одного читателя).
2. **Издание:** чипы рубрик (`section_original_he`, сгруппированные по `section`), переключатель «Свежие / Архив», в архиве — поиск и выбор дат; фильтр «без тяжёлых тем».
3. **Карточка ленты:** картинка `source_link` (`loading="lazy"`, `referrerpolicy="no-referrer"`, при `error` — запасная обложка с цветом издания и рубрикой, без сдвига разметки: фиксированное соотношение 16:9), заголовок на иврите, перевод заголовка, «2 ч назад», уровень, «Фото: {outlet}». Тап → `library.html?news=…&from=news`.
4. Пусто/ошибка/загрузка — отдельные состояния с текстом из локалей.

- [ ] **Step 1: Тесты** — `renderCard(card)` даёт плашку с названием издания, ссылку на оригинал `rel="noopener noreferrer"`, `img` с `referrerpolicy`; при `image.mode='none'` — обложка без `img`; `appNav` содержит `news` и `currentId()` для `/news.html` = `news`; каждый ключ `news.*` есть в трёх локалях.
- [ ] **Step 2:** → FAIL. - [ ] **Step 3:** реализация; вид — по `docs/architecture/AGENT_UI_GUIDE.md` и палитре Медиатеки; авторский `display` + `[hidden]` → `.cls[hidden]{display:none}`. - [ ] **Step 4:** → PASS; `npm run smoke:i18n` → PASS. - [ ] **Step 5:** `git commit -m "feat(news): News tab"`

### Task 8: Страница редактора

**Files:**
- Create: `public/news-editor.html`, `public/js/news-editor-ui.js`
- Modify: локали
- Test: `tests/newsEditorUi.test.js`

**Interfaces:**
- Consumes: маршруты `/api/news/editor/*` (Task 5).

Содержимое: вход по ключу (если нет сессии владельца); перетаскивание `.lpnews.zip` с прогрессом; квитанция (итоги + таблица отказов с кодом и понятным текстом причины + отмеченные «на проверку»); журнал пакетов; снятие статьи/пакета (без `confirm()` — двухшаговая кнопка); у владельца — «Редакторы»: создать (ключ показан один раз, кнопка «Скопировать»), отозвать.

- [ ] **Step 1: Тесты** — `renderReceipt(receipt)` выводит все 7 итогов и строку на каждый отказ с переведённой причиной для каждого кода из §9; ключ после создания не попадает ни в `localStorage`, ни в адрес.
- [ ] **Step 2:** → FAIL. - [ ] **Step 3:** реализация. - [ ] **Step 4:** → PASS. - [ ] **Step 5:** `git commit -m "feat(news): editor page"`

### Task 9: Выпуск

**Files:**
- Modify: `public/sw.js` (`CACHE_VERSION`, precache/integrity для `news.html`, `news-editor.html`, `js/news-*.js`, `css/news.css`), `public/index.html` (`window.APP_VERSION`), `?v=` в подключениях
- Modify: `docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md` — статус «РЕАЛИЗОВАН v1 (версия)»

- [ ] **Step 1:** Узнать живую версию на проде и взять следующую; поменять три места согласованно.
- [ ] **Step 2:** `npm test` → все зелёные (зафиксировать число; падения, которые были до работы, перечислить отдельно).
- [ ] **Step 3:** Проверка в браузере на свежем коде (обход старого SW): пробный пакет из `fixturePack` → квитанция → лента Ynet → статья открывается в Зале с таблицей, огласовкой, морф-карточкой и «в контексте (ИИ)»; телефон 380 px и десктоп, RU/HE, тёмная тема; битая картинка → обложка.
- [ ] **Step 4:** Проверить свободное место на диске прода перед деплоем; один полный коммит выпуска, один пуш, деплой; на проде `GET /api/news/outlets` → 7 изданий.
- [ ] **Step 5:** Владельцу: создать ключ редактора для dot, передать dot Приложение А спецификации; пробный пакет 5–10 статей → по квитанции решить, что упростить в формате.
