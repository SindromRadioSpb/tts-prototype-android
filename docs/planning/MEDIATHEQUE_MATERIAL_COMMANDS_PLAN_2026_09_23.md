# Медиатека: команды над материалами — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец удаляет (по одному и массово), правит и скачивает опубликованные материалы «Общедоступных»; любой пользователь скрывает свои материалы из «Моих материалов», не трогая Библиотеку.

**Architecture:** Серверные операции над материалом живут в `db/publicationRepo.js` поверх существующего конвейера корпусов (черновик → публикация) и новой узкой вычистки (миграция `068`). Витрина (`public/js/mediatheque-core.js`) получает правило «ссылка следует за текущей версией» и поле `hidden` для личного пространства. Интерфейс (`public/js/mediatheque-ui.js`) добавляет действия на карточку и в панель выделения.

**Tech Stack:** Node.js, Express, sqlite3, `node:test`, vanilla ES-модули в браузере, i18n-локали `public/i18n/locales/{ru,en,he}.js`.

**Spec:** [MEDIATHEQUE_MATERIAL_COMMANDS_2026_09_23.md](MEDIATHEQUE_MATERIAL_COMMANDS_2026_09_23.md) — §§1–8 и уточнения §9 (U1–U7).

## Global Constraints

- Все команды «Общедоступных» — только `role==='owner'` (серверная проверка `mediathequeOwner`), POST — `rlPublicationWrite` + `requireStrictSameOriginJson` + CSRF через `publicationWrite`.
- Управляемые корпуса: slug по регулярке `/^media-[a-f0-9]{20}$/`; прочие → `MATERIAL_NOT_MANAGED`.
- Удаление срабатывает сразу после подтверждения, минуя черновик витрины (D2).
- Удалённый материал: снимок → `{"purged":true}`, название строки → `[deleted]`, `creator` → NULL, права → 0.
- Новые строки интерфейса — в ru/en/he; `tt()`-запасной текст не считается (см. память `feedback_tt_fallback_dead_add_locale_keys`).
- Версии lockstep: `window.APP_VERSION` (`public/index.html`), `CACHE_VERSION` (`public/sw.js`), футер `public/library.html:3185`, `?v=` изменённых файлов в HTML и `sw.js`; гейт `node --test tests/i18n.smoke.js`.
- Миграции: без `BEGIN/COMMIT` внутри `.sql` (раннер `db/migrate.js` управляет транзакцией); к каждой — `migrations/down/068_*.sql`.

## Review Focus

1. Повторное «Удалить» после обрыва на середине (сеть, 500 на публикации) — должно доделать оставшиеся шаги, а не падать `MATERIAL_NOT_FOUND`. → Task 3, тест «resume after interruption».
2. Удаление материала, у корпуса которого есть активный черновик с чужими правками (например, незавершённое «Добавить материал»), — отказ `DRAFT_VERSION_CONFLICT`, ничего не стёрто. → Task 3, тест «foreign active draft blocks».
3. Удаление, когда другой материал того же корпуса ссылается на тот же медиафайл/пакет (дубли импорта), — общий файл не стирается. → Task 3, тест «shared source file survives».
4. Правка карточки уже удалённого или изменённого в другой вкладке материала → `MATERIAL_CHANGED`/`MATERIAL_NOT_FOUND`, без новой редакции. → Task 4.
5. Личная структура со скрытыми материалами, экспортированная и импортированная на другом устройстве, — скрытые остаются скрытыми; публичная витрина с непустым `hidden` отвергается. → Task 1.

## File Structure

| Файл | Ответственность |
|---|---|
| `public/js/mediatheque-core.js` (modify) | `hidden`, `items.hide/unhide`, `followCurrent`, фильтр `hidden` |
| `migrations/068_mediatheque_material_purge.sql` (create) + `migrations/down/068_mediatheque_material_purge.sql` | таблица вычисток, узкий триггер |
| `db/publicationRepo.js` (modify) | `removeDraftWork`, `purgeWork`, `cleanupPurgedFiles`, `dropMediathequeWork`, `deleteMediathequeMaterials`, `updateMediathequeMaterial`, `mediathequeMaterialArchive`, guard `EDITION_PURGED`, `followCurrent` при чтении |
| `server.js` (modify, около строки 4124) | 3 маршрута, коды ошибок |
| `public/js/mediatheque-ui.js` (modify) | действия на карточке, массовое удаление, правка, скачивание, скрытие |
| `public/i18n/locales/{ru,en,he}.js` (modify) | строки |
| `tests/mediathequeCore.test.js` (modify), `tests/mediathequeMaterialCommands.test.js` (create), тестовые обвязки с `063` (modify) | гейты |

---

### Task 1: Ядро витрины — `hidden`, `items.hide/unhide`, `followCurrent`

**Files:**
- Modify: `public/js/mediatheque-core.js:45-100` (filters, validate), `:114-208` (command), `:310-311` (exports)
- Test: `tests/mediathequeCore.test.js`

**Interfaces:**
- Produces: `C.followCurrent(structure, currentRefs, options) → structure`; команды `{type:'items.hide', keys:string[]}` и `{type:'items.unhide', keys:string[]}` (только личное пространство, ключи `my/…`); поле структуры `hidden?: string[]` (опускается, если пусто); фильтр `hidden: boolean` (по умолчанию `false`).

- [ ] **Step 1: Write the failing tests** — добавить в конец `tests/mediathequeCore.test.js`:

```js
test('hidden personal materials leave every placement, survive export/import and never enter public structure', () => {
  let d = C.command(tree(), { type: 'items.add', target: 'category', id: 'science', references: [my] });
  d = C.command(d, { type: 'home.update', title: '', description: '', reference: my, sections: C.SECTIONS.slice() });
  d = C.command(d, { type: 'items.hide', keys: [myKey] });
  assert.deepEqual(d.hidden, [myKey]);
  assert.equal(d.categories.find(c => c.id === 'science').items.includes(myKey), false);
  assert.equal(d.home.featured, null);
  const round = C.importStructure(JSON.parse(JSON.stringify(C.exportStructure(d))));
  assert.deepEqual(round.hidden, [myKey]);
  d = C.command(d, { type: 'items.unhide', keys: [myKey] });
  assert.equal('hidden' in d, false);
  assert.throws(() => C.command(C.empty(), { type: 'items.hide', keys: [myKey] }, { publicOnly: true }));
  assert.throws(() => C.validate({ ...C.empty(), hidden: [myKey] }, { publicOnly: true }), /MEDIATHEQUE_PRIVATE_REFERENCE/);
  assert.throws(() => C.command(C.empty(), { type: 'items.hide', keys: [pubKey] }));
  assert.deepEqual(C.validate(C.empty()), C.empty());
  assert.equal(C.filters().hidden, false);
});
test('public references follow the current version of the same work and collapse duplicates', () => {
  const old = pub, next = { ...pub, snapshotHash: 'b'.repeat(64) }, gone = { ...pub, workId: 'pw_gone' };
  let d = C.command(tree(), { type: 'items.add', target: 'category', id: 'science', references: [old, gone] }, { publicOnly: true });
  d = C.command(d, { type: 'items.add', target: 'collection', id: 'kan', references: [old, next] }, { publicOnly: true });
  d = C.command(d, { type: 'annotation.set', references: [old], tags: ['a'] }, { publicOnly: true });
  const out = C.followCurrent(d, [next, gone], { publicOnly: true });
  const nextKey = C.refKey(next);
  assert.deepEqual(out.categories.find(c => c.id === 'science').items, [nextKey, C.refKey(gone)]);
  assert.deepEqual(out.collections.find(c => c.id === 'kan').items, [nextKey]);
  assert.deepEqual(out.annotations.map(a => a.key), [nextKey]);
  assert.equal(out.references.filter(r => r.workId === 'pw_1').length, 1);
  assert.deepEqual(C.followCurrent(d, [], { publicOnly: true }), d);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mediathequeCore.test.js`
Expected: FAIL — `items.hide` → `MEDIATHEQUE_INVALID`, `C.followCurrent is not a function`.

- [ ] **Step 3: Implement** in `public/js/mediatheque-core.js`:

`filters()` — добавить `'hidden'` в список `exact(...)`, в значения по умолчанию `hidden: false`, и в проверку булевых полей: `['translation', 'captions', 'uncategorized', 'hidden'].forEach(...)`.

`validate()` — заменить первую строку и добавить блок перед `return d;`:

```js
    exact(raw, ['schema', 'references', 'saved', 'categories', 'collections', 'views', 'annotations', 'home', 'hidden']);
```
```js
    if (d.hidden !== undefined) {
      keyList(d.hidden);
      if (options.publicOnly && d.hidden.length) fail('MEDIATHEQUE_PRIVATE_REFERENCE');
      if (d.hidden.some(k => !k.startsWith('my/'))) fail();
      if (!d.hidden.length) delete d.hidden;
    }
```

`command()` — два новых `case` перед `default`:

```js
      case 'items.hide': {
        if (options.publicOnly) fail('MEDIATHEQUE_PRIVATE_REFERENCE');
        keyList(cmd.keys); if (cmd.keys.some(k => !k.startsWith('my/'))) fail();
        const keys = new Set(cmd.keys);
        for (const c of [...d.categories, ...d.collections]) c.items = c.items.filter(k => !keys.has(k));
        if (keys.has(d.home.featured)) d.home.featured = null;
        d.hidden = unique([...(d.hidden || []), ...cmd.keys]); break;
      }
      case 'items.unhide': {
        if (options.publicOnly) fail('MEDIATHEQUE_PRIVATE_REFERENCE');
        keyList(cmd.keys); const keys = new Set(cmd.keys);
        d.hidden = (d.hidden || []).filter(k => !keys.has(k)); break;
      }
```

Новая функция после `command()`:

```js
  // Публичная ссылка следует за текущей версией своего slug+workId: правка карточки меняет
  // snapshotHash, но не должна выбрасывать материал из тем, подборок и с главной.
  function followCurrent(raw, current, options = {}) {
    const d = validate(raw, options), latest = new Map();
    for (const r of current || []) { const s = reference(r); if (s.kind === 'public') latest.set(s.slug + '\u0000' + s.workId, s); }
    const rename = new Map();
    for (const r of d.references) if (r.kind === 'public') {
      const next = latest.get(r.slug + '\u0000' + r.workId);
      if (next && next.snapshotHash !== r.snapshotHash) rename.set(refKey(r), next);
    }
    if (!rename.size) return d;
    const map = k => rename.has(k) ? refKey(rename.get(k)) : k, fix = xs => unique(xs.map(map)), seen = new Set();
    d.references = d.references.map(r => rename.get(refKey(r)) || r).filter(r => { const k = refKey(r); if (seen.has(k)) return false; seen.add(k); return true; });
    d.saved = fix(d.saved);
    for (const c of [...d.categories, ...d.collections]) c.items = fix(c.items);
    const annotations = new Map();
    for (const a of d.annotations) { const k = map(a.key); if (!annotations.has(k)) annotations.set(k, { ...a, key: k }); }
    d.annotations = Array.from(annotations.values());
    if (d.home.featured) d.home.featured = map(d.home.featured);
    if (d.hidden) d.hidden = fix(d.hidden);
    return validate(d, options);
  }
```

Экспорт: добавить `followCurrent` в `Object.freeze({...})`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/mediathequeCore.test.js tests/mediathequeEditorial.test.js tests/mediathequeStage2.test.js tests/mediathequePersistence.test.js`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add public/js/mediatheque-core.js tests/mediathequeCore.test.js
git commit -m "feat(mediatheque-core): hide personal materials and follow current public versions"
```

---

### Task 2: Миграция 068 — таблица вычисток и узкий триггер

**Files:**
- Create: `migrations/068_mediatheque_material_purge.sql`, `migrations/down/068_mediatheque_material_purge.sql`
- Modify: тестовые обвязки, применяющие `063_publication_domain.sql` и вызывающие `rollback`/`restore`/Медиатеку: найти `grep -ln "063_publication_domain.sql" tests/*.js` и добавить `068_mediatheque_material_purge.sql` после `063`/`067` в список применяемых миграций.
- Test: `tests/mediathequeMaterialCommands.test.js` (create; первый тест)

**Interfaces:**
- Produces: таблица `published_corpus_edition_purges(edition_id, public_work_id, corpus_id, purged_by, purged_at)`; обновление `published_corpus_edition_items` разрешено только в форму вычистки.

- [ ] **Step 1: Write the failing test** — создать `tests/mediathequeMaterialCommands.test.js`:

```js
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sqlite3=require('sqlite3');
const fixture=require('./helpers/mediathequeArchiveFixture.cjs');
const Core=require('../public/js/portable-learning-package-core');
const Portable=require('../public/js/studio-portable-learning-package');
const Playback=require('../public/js/playback-source');
const C=require('../public/js/mediatheque-core');
const {createPublicationRepo}=require('../db/publicationRepo');
const MIGRATIONS=['020_identity.sql','056_group_song_corpus_p0.sql','057_group_corpus_audio_revisions.sql','058_group_corpus_catalog_metadata.sql','063_publication_domain.sql','067_mediatheque_structure.sql','068_mediatheque_material_purge.sql'];
const exec=(db,s)=>new Promise((resolve,reject)=>db.exec(s,e=>e?reject(e):resolve()));
const all=(db,s,p=[])=>new Promise((resolve,reject)=>db.all(s,p,(e,r)=>e?reject(e):resolve(r)));
const run=(db,s,p=[])=>new Promise((resolve,reject)=>db.run(s,p,e=>e?reject(e):resolve()));
async function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-material-'));
  const db=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(':memory:',e=>e?reject(e):resolve(d));});
  for(const m of MIGRATIONS)await exec(db,fs.readFileSync(path.join(__dirname,'..','migrations',m),'utf8'));
  await exec(db,"INSERT INTO users(id,role,display_name) VALUES('owner','owner','Owner'),('member','user','Member')");
  t.after(async()=>{await new Promise(r=>db.close(r));fs.rmSync(dir,{recursive:true,force:true});});
  return {db,dir,repo:createPublicationRepo({db,dataDir:dir}),owner:{id:'owner',role:'owner'}};
}
module.exports={setup,all,run};
test('edition items accept only the audited purge shape',async t=>{
  const {db}=await setup(t);
  await exec(db,`INSERT INTO published_corpora(corpus_id,slug,title,status,created_by,updated_by,created_at,updated_at) VALUES('pc','media-00000000000000000000','T','DRAFT_ACTIVE','owner','owner','x','x');
    INSERT INTO publication_drafts(draft_id,corpus_id,draft_number,version,state,created_by,updated_by,created_at,updated_at) VALUES('pd','pc',1,1,'PUBLISHED','owner','owner','x','x');
    INSERT INTO published_corpus_editions(edition_id,corpus_id,edition_number,source_draft_id,manifest_json,manifest_sha256,item_count,asset_count,package_complete,package_path,package_bytes,package_sha256,published_by,published_at)
      VALUES('ed','pc',1,'pd','{}','${'a'.repeat(64)}',1,0,1,'published-corpora/pc/editions/ed/packages/corpus.zip',1,'${'a'.repeat(64)}','owner','x');
    INSERT INTO published_corpus_edition_items(edition_item_id,edition_id,source_item_id,public_work_id,position_no,title,creator,snapshot_json,snapshot_sha256,public_read_allowed,public_stream_allowed,package_download_allowed,rights_basis,rights_asserted_at,expected_audio_count,included_audio_count,asset_missing,package_complete)
      VALUES('ei','ed','pi','work-1',1,'Title','C','{"a":1}','${'b'.repeat(64)}',1,1,1,'B','2026-09-23',0,0,0,1);`);
  const purge=`UPDATE published_corpus_edition_items SET snapshot_json='{"purged":true}',title='[deleted]',creator=NULL,public_read_allowed=0,public_stream_allowed=0,package_download_allowed=0 WHERE edition_item_id='ei'`;
  await assert.rejects(run(db,purge),/PUBLICATION_EDITION_ITEM_IMMUTABLE/);
  await run(db,`INSERT INTO published_corpus_edition_purges(edition_id,public_work_id,corpus_id,purged_by,purged_at) VALUES('ed','work-1','pc','owner','x')`);
  await assert.rejects(run(db,`UPDATE published_corpus_edition_items SET title='Other' WHERE edition_item_id='ei'`),/PUBLICATION_EDITION_ITEM_IMMUTABLE/);
  await run(db,purge);
  assert.equal((await all(db,"SELECT snapshot_json FROM published_corpus_edition_items"))[0].snapshot_json,'{"purged":true}');
  await assert.rejects(run(db,"DELETE FROM published_corpus_edition_items"),/PUBLICATION_EDITION_ITEM_IMMUTABLE/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mediathequeMaterialCommands.test.js`
Expected: FAIL — `ENOENT ... 068_mediatheque_material_purge.sql`.

- [ ] **Step 3: Implement** — `migrations/068_mediatheque_material_purge.sql`:

```sql
-- Mediatheque material deletion: the only permitted change to a published edition item is an
-- audited purge of one work. Editions, assets and every other column stay immutable.
CREATE TABLE IF NOT EXISTS published_corpus_edition_purges (
  edition_id     TEXT NOT NULL REFERENCES published_corpus_editions(edition_id) ON DELETE RESTRICT,
  public_work_id TEXT NOT NULL CHECK(length(public_work_id) BETWEEN 1 AND 160),
  corpus_id      TEXT NOT NULL REFERENCES published_corpora(corpus_id) ON DELETE RESTRICT,
  purged_by      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purged_at      TEXT NOT NULL,
  PRIMARY KEY(edition_id, public_work_id)
);
CREATE INDEX IF NOT EXISTS ix_edition_purges_work ON published_corpus_edition_purges(corpus_id, public_work_id);
CREATE TRIGGER IF NOT EXISTS trg_edition_purges_no_update
BEFORE UPDATE ON published_corpus_edition_purges BEGIN SELECT RAISE(ABORT,'PUBLICATION_PURGE_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS trg_edition_purges_no_delete
BEFORE DELETE ON published_corpus_edition_purges BEGIN SELECT RAISE(ABORT,'PUBLICATION_PURGE_APPEND_ONLY'); END;
DROP TRIGGER IF EXISTS trg_published_edition_items_no_update;
CREATE TRIGGER trg_published_edition_items_no_update
BEFORE UPDATE ON published_corpus_edition_items
WHEN NOT (
  NEW.snapshot_json = '{"purged":true}' AND NEW.title = '[deleted]' AND NEW.creator IS NULL
  AND NEW.public_read_allowed = 0 AND NEW.public_stream_allowed = 0 AND NEW.package_download_allowed = 0
  AND NEW.edition_item_id = OLD.edition_item_id AND NEW.edition_id = OLD.edition_id AND NEW.source_item_id = OLD.source_item_id
  AND NEW.public_work_id = OLD.public_work_id AND NEW.position_no = OLD.position_no AND NEW.snapshot_sha256 = OLD.snapshot_sha256
  AND NEW.rights_basis = OLD.rights_basis AND NEW.rights_asserted_at = OLD.rights_asserted_at
  AND NEW.expected_audio_count = OLD.expected_audio_count AND NEW.included_audio_count = OLD.included_audio_count
  AND NEW.asset_missing = OLD.asset_missing AND NEW.package_complete = OLD.package_complete
  AND EXISTS (SELECT 1 FROM published_corpus_edition_purges p WHERE p.edition_id = OLD.edition_id AND p.public_work_id = OLD.public_work_id)
)
BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_ITEM_IMMUTABLE'); END;
```

`migrations/down/068_mediatheque_material_purge.sql`:

```sql
DROP TRIGGER IF EXISTS trg_published_edition_items_no_update;
CREATE TRIGGER IF NOT EXISTS trg_published_edition_items_no_update
BEFORE UPDATE ON published_corpus_edition_items BEGIN SELECT RAISE(ABORT,'PUBLICATION_EDITION_ITEM_IMMUTABLE'); END;
DROP TRIGGER IF EXISTS trg_edition_purges_no_update;
DROP TRIGGER IF EXISTS trg_edition_purges_no_delete;
DROP INDEX IF EXISTS ix_edition_purges_work;
DROP TABLE IF EXISTS published_corpus_edition_purges;
```

Добавить `'068_mediatheque_material_purge.sql'` в списки миграций тестовых обвязок из шага «Files» (минимум `tests/mediathequeArchive.test.js:40`).

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/mediathequeMaterialCommands.test.js tests/mediathequeArchive.test.js tests/publicationDomain.test.js`
Expected: PASS. Затем применить миграцию к копии локальной БД через `node db/migrate-cli.js` по навыку `sqlite-migration-safety` и убедиться, что повторный прогон — no-op.

- [ ] **Step 5: Commit**

```bash
git add migrations/068_mediatheque_material_purge.sql migrations/down/068_mediatheque_material_purge.sql tests/
git commit -m "feat(publication): audited purge of one published work (migration 068)"
```

---

### Task 3: Сервер — удаление материала (одиночное и массовое)

**Files:**
- Modify: `db/publicationRepo.js` (внутри `createPublicationRepo`, после `rollbackMediatheque`, и `pointerMutation:770-785`, `getPublicMediatheque:890-900`, `getMediathequeDraft`, экспорт `:959-965`)
- Test: `tests/mediathequeMaterialCommands.test.js`

**Interfaces:**
- Consumes: миграция 068; `createRevisionDraft`, `publish`, `withdraw`, `withIdempotency`, `mediathequeOwner`, `C.followCurrent`, `Mediatheque.command(..., {type:'reference.forget'})`.
- Produces:
  - `repo.deleteMediathequeMaterials(actor, {items:[{slug,workId}]}, {idempotencyKey}) → {deleted:[{slug,workId,title,corpus_archived}], failed:[{slug,workId,code}], cleanup_pending:[{slug,workId,path}]}`
  - Ошибки: `MATERIAL_NOT_MANAGED` (409), `MATERIAL_NOT_FOUND` (404), `DRAFT_VERSION_CONFLICT` (409), `EDITION_PURGED` (409).

- [ ] **Step 1: Write the failing tests** — добавить в `tests/mediathequeMaterialCommands.test.js` помощник публикации и тесты:

```js
async function archiveBytes(title){
  const input=fixture();input.text_card=input.text_card||{};
  input.playback_source=Playback.append(null,{url:'https://www.youtube.com/watch?v=sYd4zgR7f6w'});
  if(title)input.material.text.title=title;
  return Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input,{mode:'snapshot'}),'nodebuffer'));
}
const slug='media-'+'1'.repeat(20);
async function publishArchive(h,title,key){
  const prepared=await h.repo.prepareMediathequeArchive(h.owner,await archiveBytes(title),{mode:'youtube'});
  const o=n=>({idempotencyKey:key+'-'+n});
  let corpus=(await h.repo.listPublisherCorpora(h.owner)).find(c=>c.slug===slug);
  if(!corpus)corpus=await h.repo.createCorpus(h.owner,{slug,title:'Channel'},o('create'));
  let detail=await h.repo.getPublisherCorpus(h.owner,corpus.corpus_id);
  if(!detail.draft){await h.repo.createRevisionDraft(h.owner,corpus.corpus_id,o('rev'));detail=await h.repo.getPublisherCorpus(h.owner,corpus.corpus_id);}
  const copied=await h.repo.copyMediathequeArchive(h.owner,corpus.corpus_id,{token:prepared.token,title:title||'Episode',creator:'Channel',expectedVersion:detail.draft.version},o('copy'));
  const rights=await h.repo.recordMaterialRights(h.owner,corpus.corpus_id,{itemIds:copied.items.map(i=>i.item_id),expectedVersion:copied.draft_version,preset:{public_read_allowed:true,public_stream_allowed:true,package_download_allowed:true,basis:'OWNER_ATTESTATION_2026_09_23',asserted_at:'2026-09-23'}},o('rights'));
  await h.repo.publish(h.owner,corpus.corpus_id,{expectedVersion:rights.draft_version},o('publish'));
  const items=(await h.repo.getPublicMediatheque()).items;
  return {corpus,item:items.find(i=>i.title===(title||'Episode')),prepared};
}
async function placeOnShowcase(h,refs){
  let draft=await h.repo.getMediathequeDraft(h.owner),d=draft.structure;
  d=C.command(d,{type:'category.create',id:'topic',title:'Topic',parentId:null},{publicOnly:true});
  d=C.command(d,{type:'items.add',target:'category',id:'topic',references:refs},{publicOnly:true});
  const saved=await h.repo.saveMediathequeDraft(h.owner,{structure:d,expectedVersion:draft.revision},{idempotencyKey:'show-save'});
  await h.repo.publishMediatheque(h.owner,{expectedVersion:saved.revision,expectedEdition:draft.edition_id||null},{idempotencyKey:'show-publish'});
}
test('deleting one of two materials publishes an edition without it, purges history and files, and drops showcase links',async t=>{
  const h=await setup(t);
  const a=await publishArchive(h,'Keep','a'),b=await publishArchive(h,'Drop','b');
  await placeOnShowcase(h,[a.item.ref,b.item.ref]);
  await assert.rejects(h.repo.deleteMediathequeMaterials({id:'member',role:'user'},{items:[b.item.ref]},{idempotencyKey:'d0'}),/PUBLISHER_FORBIDDEN/);
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[{slug:b.item.ref.slug,workId:b.item.ref.workId}]},{idempotencyKey:'d1'});
  assert.deepEqual(out.failed,[]);assert.equal(out.deleted[0].title,'Drop');assert.equal(out.deleted[0].corpus_archived,false);
  const pub=await h.repo.getPublicMediatheque();
  assert.deepEqual(pub.items.map(i=>i.title),['Keep']);
  assert.equal(JSON.stringify(pub.structure).includes(b.item.ref.workId),false);
  assert.equal(JSON.stringify((await h.repo.getMediathequeDraft(h.owner)).structure).includes(b.item.ref.workId),false);
  const rows=await all(h.db,'SELECT snapshot_json,title FROM published_corpus_edition_items WHERE public_work_id=?',[b.item.ref.workId]);
  assert.ok(rows.length>=1);assert.ok(rows.every(r=>r.snapshot_json==='{"purged":true}'&&r.title==='[deleted]'));
  const drafts=await all(h.db,"SELECT snapshot_json FROM publication_draft_items WHERE title='Drop' OR snapshot_json LIKE '%Drop%'");
  assert.equal(drafts.length,0);
  const purgedEditions=await all(h.db,'SELECT edition_id FROM published_corpus_edition_purges WHERE public_work_id=?',[b.item.ref.workId]);
  for(const {edition_id} of purgedEditions){
    assert.equal(fs.existsSync(path.join(h.dir,'published-corpora',a.corpus.corpus_id,'editions',edition_id)),false);
    await assert.rejects(h.repo.rollback(h.owner,a.corpus.corpus_id,{editionId:edition_id},{idempotencyKey:'rb-'+edition_id}),/EDITION_PURGED/);
  }
  assert.equal(fs.existsSync(path.join(h.dir,'publication-imports',b.prepared.token+'.json')),false);
  const again=await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'d2'});
  assert.deepEqual(again.failed,[]);// повтор по уже удалённому дочищает и не падает
});
test('deleting the last material withdraws its corpus and refuses restore',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Only','only');
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[a.item.ref]},{idempotencyKey:'d1'});
  assert.equal(out.deleted[0].corpus_archived,true);
  assert.equal((await h.repo.getPublicMediatheque()).items.length,0);
  const [ed]=await all(h.db,'SELECT edition_id FROM published_corpus_edition_purges');
  await assert.rejects(h.repo.restore(h.owner,a.corpus.corpus_id,{editionId:ed.edition_id},{idempotencyKey:'r1'}),/EDITION_PURGED/);
});
test('bulk delete reports each item; unmanaged and missing items fail without stopping the rest',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'One','one'),b=await publishArchive(h,'Two','two');
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[{slug:'study-songs',workId:'work-x'},a.item.ref,{slug,workId:'work-missing'},b.item.ref]},{idempotencyKey:'bulk'});
  assert.deepEqual(out.deleted.map(d=>d.title).sort(),['One','Two']);
  assert.deepEqual(out.failed.map(f=>f.code).sort(),['MATERIAL_NOT_FOUND','MATERIAL_NOT_MANAGED']);
});
test('foreign active draft blocks deletion and nothing is purged',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Keep','a'),b=await publishArchive(h,'Drop','b');
  const prepared=await h.repo.prepareMediathequeArchive(h.owner,await archiveBytes('Pending'),{mode:'youtube'});
  await h.repo.createRevisionDraft(h.owner,a.corpus.corpus_id,{idempotencyKey:'foreign-rev'});
  const detail=await h.repo.getPublisherCorpus(h.owner,a.corpus.corpus_id);
  await h.repo.copyMediathequeArchive(h.owner,a.corpus.corpus_id,{token:prepared.token,title:'Pending',creator:'C',expectedVersion:detail.draft.version},{idempotencyKey:'foreign-copy'});
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'blocked'});
  assert.deepEqual(out.failed.map(f=>f.code),['DRAFT_VERSION_CONFLICT']);
  assert.equal((await all(h.db,'SELECT COUNT(*) n FROM published_corpus_edition_purges'))[0].n,0);
});
test('shared source file survives when another live item still references it',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Same','s1');
  const b=await publishArchive(h,'Same copy','s2');// тот же архив → тот же package_sha256
  await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'shared'});
  const pkg=path.join(h.dir,'publication-imports','packages');
  assert.ok(fs.readdirSync(pkg).length>=1);
});
test('resume after interruption finishes purge and structure cleanup',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Keep','a'),b=await publishArchive(h,'Drop','b');
  await assert.rejects(h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'x',faultAfter:'publish'}),/FAULT_AFTER_PUBLISH/);
  assert.deepEqual((await h.repo.getPublicMediatheque()).items.map(i=>i.title),['Keep']);
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[b.item.ref]},{idempotencyKey:'y'});
  assert.deepEqual(out.failed,[]);
  assert.ok((await all(h.db,'SELECT snapshot_json FROM published_corpus_edition_items WHERE public_work_id=?',[b.item.ref.workId])).every(r=>r.snapshot_json==='{"purged":true}'));
});
```

Примечание к тесту «shared source file»: если фикстура даёт одинаковый `content_root` и `copyMediathequeArchive` откажет `SOURCE_ALREADY_COPIED`, заменить второй архив на `archiveBytes('Same copy')` с тем же медиа-пакетом — цель теста в том, чтобы `publication-imports/packages/<sha>.zip`, на который ссылается живой элемент, не был стёрт.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mediathequeMaterialCommands.test.js`
Expected: FAIL — `h.repo.deleteMediathequeMaterials is not a function`.

- [ ] **Step 3: Implement** в `db/publicationRepo.js`.

3a. Вверху файла, после `function assetFileName`:

```js
const MANAGED_SLUG = /^media-[a-f0-9]{20}$/;
const PURGED_SNAPSHOT = '{"purged":true}';
const publicWorkIdOf = item => "work-" + sha256(`${item.source_domain}:${item.source_corpus_id || "local"}:${item.source_work_id}`).slice(0, 24);
```

и в `publish()` заменить вычисление `publicWorkId` на `const publicWorkId = publicWorkIdOf(item);`.

3b. Guard в `pointerMutation` сразу после проверки существования целевой редакции:

```js
        if (await dbGet(database, "SELECT 1 ok FROM published_corpus_edition_purges WHERE edition_id=?", [target])) fail("EDITION_PURGED", 409);
```

3c. Новые функции внутри `createPublicationRepo` (после `rollbackMediatheque`):

```js
  async function managedWork(ref) {
    const slug = cleanSlug(ref && ref.slug), workId = cleanId(ref && ref.workId, "MATERIAL_NOT_FOUND");
    const corpus = await dbGet(database, "SELECT * FROM published_corpora WHERE slug=?", [slug]);
    if (!corpus) fail("MATERIAL_NOT_FOUND", 404);
    if (!MANAGED_SLUG.test(corpus.slug)) fail("MATERIAL_NOT_MANAGED", 409);
    const item = corpus.current_edition_id ? await dbGet(database,
      "SELECT * FROM published_corpus_edition_items WHERE edition_id=? AND public_work_id=?", [corpus.current_edition_id, workId]) : null;
    return { corpus, item, workId };
  }
  // Черновик, который Медиатека может переиспользовать: основан на текущей редакции и не
  // содержит чужих правок (тот же набор снимков). Иначе — чужая работа, её не трогаем.
  async function cleanDraftFor(actor, corpus, key) {
    let draft = await dbGet(database, "SELECT * FROM publication_drafts WHERE corpus_id=? AND state='ACTIVE'", [corpus.corpus_id]);
    if (draft) {
      const mine = (await dbAll(database, "SELECT snapshot_sha256 FROM publication_draft_items WHERE draft_id=? ORDER BY snapshot_sha256", [draft.draft_id])).map(r => r.snapshot_sha256).join();
      const live = (await dbAll(database, "SELECT snapshot_sha256 FROM published_corpus_edition_items WHERE edition_id=? ORDER BY snapshot_sha256", [corpus.current_edition_id])).map(r => r.snapshot_sha256).join();
      if (draft.based_on_edition_id !== corpus.current_edition_id || mine !== live) fail("DRAFT_VERSION_CONFLICT", 409);
      return draft;
    }
    await createRevisionDraft(actor, corpus.corpus_id, { idempotencyKey: key });
    return dbGet(database, "SELECT * FROM publication_drafts WHERE corpus_id=? AND state='ACTIVE'", [corpus.corpus_id]);
  }
  async function removeDraftWork(actor, corpusId, input, opts) {
    const workId = cleanId(input && input.workId, "MATERIAL_NOT_FOUND"), expectedVersion = Number(input && input.expectedVersion);
    return withIdempotency(actor, "REMOVE_DRAFT_WORK", opts, { corpusId, workId, expectedVersion }, async () => {
      const { draft } = await activeDraft(actor, corpusId, expectedVersion);
      const items = await dbAll(database, "SELECT * FROM publication_draft_items WHERE draft_id=? ORDER BY position_no,item_id", [draft.draft_id]);
      const target = items.find(item => publicWorkIdOf(item) === workId);
      if (!target) fail("MATERIAL_NOT_FOUND", 404);
      await dbRun(database, "DELETE FROM publication_draft_items WHERE item_id=?", [target.item_id]);
      const rest = items.filter(item => item.item_id !== target.item_id);
      for (let i = 0; i < rest.length; i += 1) await dbRun(database, "UPDATE publication_draft_items SET position_no=? WHERE item_id=?", [i + 1, rest[i].item_id]);
      const nextVersion = Number(draft.version) + 1;
      await dbRun(database, "UPDATE publication_drafts SET version=?,updated_by=?,updated_at=? WHERE draft_id=?", [nextVersion, actorId(actor), now(), draft.draft_id]);
      return { corpus_id: corpusId, draft_version: nextVersion };
    });
  }
  // Снимок читается ДО вычистки: из него берутся исходный пакет, медиа и корень архива.
  async function purgeWork(actor, corpusId, workId, opts) {
    return withIdempotency(actor, "PURGE_WORK", opts, { corpusId, workId }, async () => {
      const editionRows = await dbAll(database, `SELECT ei.edition_id,ei.title,ei.snapshot_json FROM published_corpus_edition_items ei
        JOIN published_corpus_editions e ON e.edition_id=ei.edition_id WHERE e.corpus_id=? AND ei.public_work_id=?`, [corpusId, workId]);
      const draftRows = (await dbAll(database, `SELECT di.* FROM publication_draft_items di JOIN publication_drafts d ON d.draft_id=di.draft_id WHERE d.corpus_id=?`, [corpusId]))
        .filter(item => publicWorkIdOf(item) === workId);
      const live = [...editionRows, ...draftRows].find(row => row.snapshot_json !== PURGED_SNAPSHOT);
      let source = {};
      if (live) {
        const text = (parseJson(live.snapshot_json).library || {}).texts?.[0] || {};
        const meta = text.source_meta || {};
        source = { title: live.title, package_sha256: meta.publication_archive?.package_sha256 || null,
          content_root: meta.publication_archive?.content_root_sha256 || null, media_sha256: meta.publication_media?.sha256 || null };
      }
      const current = (await dbGet(database, "SELECT current_edition_id FROM published_corpora WHERE corpus_id=?", [corpusId])).current_edition_id;
      const editions = [...new Set(editionRows.map(r => r.edition_id))].filter(e => e !== current);
      for (const editionId of editions) {
        await dbRun(database, `INSERT OR IGNORE INTO published_corpus_edition_purges(edition_id,public_work_id,corpus_id,purged_by,purged_at) VALUES(?,?,?,?,?)`,
          [editionId, workId, corpusId, actorId(actor), now()]);
        await dbRun(database, `UPDATE published_corpus_edition_items SET snapshot_json=?,title='[deleted]',creator=NULL,public_read_allowed=0,public_stream_allowed=0,package_download_allowed=0
          WHERE edition_id=? AND public_work_id=? AND snapshot_json<>?`, [PURGED_SNAPSHOT, editionId, workId, PURGED_SNAPSHOT]);
      }
      for (const row of draftRows) await dbRun(database, "UPDATE publication_draft_items SET snapshot_json=?,title='[deleted]',creator=NULL WHERE item_id=?", [PURGED_SNAPSHOT, row.item_id]);
      return { corpus_id: corpusId, work_id: workId, editions, ...source };
    });
  }
  async function cleanupPurgedFiles(corpusId, purged) {
    const pending = [], remove = async target => { try { await fs.promises.rm(target, { recursive: true, force: true }); } catch (_) { pending.push(target); } };
    for (const editionId of purged.editions || []) {
      await remove(publicationPath(path.posix.join("published-corpora", corpusId, "editions", editionId)));
      await remove(publicationPath(path.posix.join("published-corpora", corpusId, editionId)));
    }
    const stillUsed = async needle => !!(needle && await dbGet(database, `SELECT 1 ok FROM published_corpus_edition_items WHERE snapshot_json LIKE ? AND snapshot_json<>?
      UNION ALL SELECT 1 FROM publication_draft_items WHERE snapshot_json LIKE ? AND snapshot_json<>? LIMIT 1`, ['%' + needle + '%', PURGED_SNAPSHOT, '%' + needle + '%', PURGED_SNAPSHOT]));
    if (purged.package_sha256 && !await stillUsed(purged.package_sha256)) await remove(sourcePath("publication-imports/packages/" + purged.package_sha256 + ".zip"));
    if (purged.media_sha256 && !await stillUsed(purged.media_sha256)) await remove(sourcePath("publication-imports/media/" + purged.media_sha256));
    if (purged.content_root) {
      const dir = sourcePath("publication-imports");
      for (const name of await fs.promises.readdir(dir).catch(() => [])) {
        if (!/^import_[a-f0-9]{24}\.json$/.test(name)) continue;
        const file = path.join(dir, name);
        try { if (JSON.parse(await fs.promises.readFile(file, "utf8")).contentRoot === purged.content_root) await remove(file); } catch (_) {}
      }
    }
    return pending.map(p => path.relative(dataDir, p).replace(/\\/g, "/"));
  }
  // Ссылки на удалённую работу уходят и из черновика, и из опубликованной витрины: иначе
  // followCurrent вернул бы материал на старые места при повторном импорте с тем же workId.
  async function dropMediathequeWork(actor, ref, opts) {
    return withIdempotency(actor, "MEDIATHEQUE_DROP_WORK", opts, { slug: ref.slug, workId: ref.workId }, async () => {
      const without = structure => Mediatheque.command(structure, { type: "reference.forget",
        keys: structure.references.filter(r => r.kind === "public" && r.slug === ref.slug && r.workId === ref.workId).map(Mediatheque.refKey) }, { publicOnly: true });
      const row = await dbGet(database, "SELECT * FROM publication_mediatheque_draft WHERE singleton=1");
      if (row) {
        const structure = without(Mediatheque.validate(parseJson(row.structure_json), { publicOnly: true }));
        const undo = row.undo_json ? canonicalJson(without(Mediatheque.validate(parseJson(row.undo_json), { publicOnly: true }))) : null;
        await dbRun(database, "UPDATE publication_mediatheque_draft SET revision=revision+1,structure_json=?,undo_json=?,updated_by=?,updated_at=? WHERE singleton=1",
          [canonicalJson(structure), undo, actorId(actor), now()]);
      }
      const pointer = await dbGet(database, `SELECT e.* FROM publication_mediatheque_pointer p JOIN publication_mediatheque_editions e ON e.edition_id=p.edition_id WHERE p.singleton=1`);
      if (pointer) {
        const before = Mediatheque.validate(parseJson(pointer.structure_json), { publicOnly: true }), after = without(before);
        if (canonicalJson(after) !== canonicalJson(before)) {
          const json = canonicalJson(after), editionId = id("me_");
          await dbRun(database, `INSERT INTO publication_mediatheque_editions(edition_id,revision,structure_json,sha256,published_by,published_at) VALUES(?,?,?,?,?,?)`,
            [editionId, pointer.revision, json, sha256(json), actorId(actor), now()]);
          await dbRun(database, "UPDATE publication_mediatheque_pointer SET edition_id=? WHERE singleton=1", [editionId]);
        }
      }
      return { dropped: true };
    });
  }
  async function deleteOneMaterial(actor, ref, baseKey, fault) {
    const { corpus, item, workId } = await managedWork(ref);
    const k = step => (baseKey + ":" + workId + ":" + step).slice(0, 200);
    let archived = false;
    if (item) {
      const count = Number((await dbGet(database, "SELECT COUNT(*) n FROM published_corpus_edition_items WHERE edition_id=?", [corpus.current_edition_id])).n);
      if (count === 1) {
        await withdraw(actor, corpus.corpus_id, { reasonCode: "MATERIAL_DELETED" }, { idempotencyKey: k("withdraw") });
        archived = true;
      } else {
        const draft = await cleanDraftFor(actor, corpus, k("draft"));
        const removed = await removeDraftWork(actor, corpus.corpus_id, { workId, expectedVersion: Number(draft.version) }, { idempotencyKey: k("remove") });
        await publish(actor, corpus.corpus_id, { expectedVersion: removed.draft_version }, { idempotencyKey: k("publish") });
      }
      if (fault === "publish") fail("FAULT_AFTER_PUBLISH", 500);
    } else {
      const known = await dbGet(database, `SELECT 1 ok FROM published_corpus_edition_items ei JOIN published_corpus_editions e ON e.edition_id=ei.edition_id
        WHERE e.corpus_id=? AND ei.public_work_id=?`, [corpus.corpus_id, workId]);
      if (!known) fail("MATERIAL_NOT_FOUND", 404);
    }
    const purged = await purgeWork(actor, corpus.corpus_id, workId, { idempotencyKey: k("purge") });
    const pending = await cleanupPurgedFiles(corpus.corpus_id, purged);
    await dropMediathequeWork(actor, { slug: corpus.slug, workId }, { idempotencyKey: k("structure") });
    return { slug: corpus.slug, workId, title: purged.title || null, corpus_archived: archived, cleanup_pending: pending };
  }
  async function deleteMediathequeMaterials(actor, input, opts = {}) {
    mediathequeOwner(actor);
    const base = idemKey(opts.idempotencyKey), items = Array.isArray(input && input.items) ? input.items : [];
    if (!items.length || items.length > 200) fail("PUBLICATION_INPUT_INVALID", 400);
    const out = { deleted: [], failed: [], cleanup_pending: [] };
    for (const ref of items) {
      try {
        const done = await deleteOneMaterial(actor, ref, base, input.faultAfter);
        out.deleted.push({ slug: done.slug, workId: done.workId, title: done.title, corpus_archived: done.corpus_archived });
        for (const p of done.cleanup_pending) out.cleanup_pending.push({ slug: done.slug, workId: done.workId, path: p });
      } catch (error) {
        if (/^FAULT_/.test(error.code || "")) throw error;
        out.failed.push({ slug: String(ref && ref.slug || ""), workId: String(ref && ref.workId || ""), code: String(error.code || "PUBLICATION_FAILED") });
      }
    }
    return out;
  }
```

`faultAfter` — тестовая точка: сервер её не пробрасывает (Task 5 передаёт только `items`).

3d. Последний материал и активный черновик. В `deleteOneMaterial` ветку `count === 1` заменить на:

```js
      if (count === 1) {
        const active = await dbGet(database, "SELECT * FROM publication_drafts WHERE corpus_id=? AND state='ACTIVE'", [corpus.corpus_id]);
        if (active) {
          await cleanDraftFor(actor, corpus, k("draft")); // чужие правки → DRAFT_VERSION_CONFLICT, ничего не тронуто
          await withIdempotency(actor, "ARCHIVE_DRAFT", { idempotencyKey: k("close-draft") }, { draftId: active.draft_id }, async () => {
            await dbRun(database, "UPDATE publication_drafts SET state='ARCHIVED',updated_by=?,updated_at=? WHERE draft_id=? AND state='ACTIVE'", [actorId(actor), now(), active.draft_id]);
            return { closed: true };
          });
        }
        await withdraw(actor, corpus.corpus_id, { reasonCode: "MATERIAL_DELETED" }, { idempotencyKey: k("withdraw") });
        archived = true;
      }
```

Добавить тест в Step 1 этого Task:

```js
test('last material with an untouched mediatheque draft: draft closed, corpus withdrawn',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Only','only');
  await h.repo.createRevisionDraft(h.owner,a.corpus.corpus_id,{idempotencyKey:'clean-rev'});
  const out=await h.repo.deleteMediathequeMaterials(h.owner,{items:[a.item.ref]},{idempotencyKey:'d'});
  assert.deepEqual(out.failed,[]);assert.equal(out.deleted[0].corpus_archived,true);
  assert.equal((await all(h.db,"SELECT COUNT(*) n FROM publication_drafts WHERE state='ACTIVE'"))[0].n,0);
});
```

3e. Чтение витрины по правилу «ссылка следует за текущей версией» — в `getPublicMediatheque` перед `reference.forget`:

```js
    structure = Mediatheque.followCurrent(structure, items.map(item => item.ref), { publicOnly: true });
```

и в `getMediathequeDraft` (возвращаемую `structure`) — то же с `(await mediathequeCatalog()).map(i => i.ref)`.

3f. Экспорт: добавить `deleteMediathequeMaterials` в возвращаемый объект репозитория.

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/mediathequeMaterialCommands.test.js tests/mediathequeArchive.test.js tests/publicationDomain.test.js tests/mediathequeEditorial.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/publicationRepo.js tests/mediathequeMaterialCommands.test.js
git commit -m "feat(mediatheque): delete public materials with audited purge and showcase cleanup"
```

---

### Task 4: Сервер — изменить карточку и скачать архив

**Files:**
- Modify: `db/publicationRepo.js`
- Test: `tests/mediathequeMaterialCommands.test.js`

**Interfaces:**
- Consumes: `managedWork`, `cleanDraftFor`, `publish`, `publicWorkIdOf` (Task 3).
- Produces:
  - `repo.updateMediathequeMaterial(actor, {slug, workId, expectedSnapshotHash, fields:{title, description, creator, tags:string[], download:boolean}}, opts) → {slug, workId, snapshotHash}`
  - `repo.mediathequeMaterialArchive(actor, {slug, workId, part:'package'|'media'}) → {absolute_path, filename, mime}`; ошибки `MATERIAL_ARCHIVE_UNAVAILABLE` (404), `MATERIAL_CHANGED` (409).

- [ ] **Step 1: Write the failing tests**:

```js
test('edit card publishes a new version that keeps its showcase place',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Old title','a'),b=await publishArchive(h,'Other','b');
  await placeOnShowcase(h,[a.item.ref]);
  await assert.rejects(h.repo.updateMediathequeMaterial({id:'member',role:'user'},{...a.item.ref,expectedSnapshotHash:a.item.ref.snapshotHash,fields:{title:'X',description:'',creator:'C',tags:[],download:true}},{idempotencyKey:'u0'}),/PUBLISHER_FORBIDDEN/);
  const out=await h.repo.updateMediathequeMaterial(h.owner,{slug:a.item.ref.slug,workId:a.item.ref.workId,expectedSnapshotHash:a.item.ref.snapshotHash,
    fields:{title:'New title',description:'About',creator:'Kan 11',tags:['интервью'],download:false}},{idempotencyKey:'u1'});
  assert.notEqual(out.snapshotHash,a.item.ref.snapshotHash);
  const pub=await h.repo.getPublicMediatheque(),item=pub.items.find(i=>i.ref.workId===a.item.ref.workId);
  assert.equal(item.title,'New title');assert.equal(item.creator,'Kan 11');assert.deepEqual(item.tags,['интервью']);assert.equal(item.topic,'About');
  assert.deepEqual(pub.structure.categories.find(c=>c.id==='topic').items,[C.refKey(item.ref)]);
  await assert.rejects(h.repo.updateMediathequeMaterial(h.owner,{slug:a.item.ref.slug,workId:a.item.ref.workId,expectedSnapshotHash:a.item.ref.snapshotHash,fields:{title:'Y',description:'',creator:'',tags:[],download:true}},{idempotencyKey:'u2'}),/MATERIAL_CHANGED/);
});
test('archive download is owner-only and names a missing archive honestly',async t=>{
  const h=await setup(t);const a=await publishArchive(h,'Episode','a');
  await assert.rejects(h.repo.mediathequeMaterialArchive({id:'member',role:'user'},{...a.item.ref,part:'package'}),/PUBLISHER_FORBIDDEN/);
  const out=await h.repo.mediathequeMaterialArchive(h.owner,{...a.item.ref,part:'package'});
  assert.ok(fs.existsSync(out.absolute_path));assert.match(out.filename,/\.lplp\.zip$/);
  await assert.rejects(h.repo.mediathequeMaterialArchive(h.owner,{...a.item.ref,part:'media'}),/MATERIAL_ARCHIVE_UNAVAILABLE/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mediathequeMaterialCommands.test.js`
Expected: FAIL — `updateMediathequeMaterial is not a function`.

- [ ] **Step 3: Implement**:

```js
  async function updateDraftWork(actor, corpusId, input, opts) {
    return withIdempotency(actor, "UPDATE_DRAFT_WORK", opts, input, async () => {
      const { draft } = await activeDraft(actor, corpusId, input.expectedVersion);
      const target = (await dbAll(database, "SELECT * FROM publication_draft_items WHERE draft_id=?", [draft.draft_id])).find(item => publicWorkIdOf(item) === input.workId);
      if (!target) fail("MATERIAL_NOT_FOUND", 404);
      const snapshot = parseJson(target.snapshot_json), text = snapshot.library && snapshot.library.texts && snapshot.library.texts[0];
      if (!text) fail("SOURCE_SNAPSHOT_INVALID", 400);
      const f = input.fields;
      text.title = f.title; text.topic = f.description; text.tags = f.tags; delete text.tags_json;
      const video = text.source_meta && text.source_meta.source && text.source_meta.source.audio && text.source_meta.source.audio.video;
      if (video) video.author = f.creator;
      const snapshotJson = canonicalJson(snapshot), snapshotSha = sha256(Buffer.from(snapshotJson, "utf8"));
      await dbRun(database, "UPDATE publication_draft_items SET snapshot_json=?,snapshot_sha256=?,source_hash=?,title=?,creator=? WHERE item_id=?",
        [snapshotJson, snapshotSha, snapshotSha, f.title, f.creator || null, target.item_id]);
      const rights = await latestRights(target.item_id);
      if (!rights.PACKAGE_DOWNLOAD || (rights.PACKAGE_DOWNLOAD.allowed === 1) !== f.download)
        await dbRun(database, `INSERT INTO publication_rights_facts(fact_id,item_id,permission,allowed,basis,asserted_at,asserted_by,created_at) VALUES(?,?,?,?,?,?,?,?)`,
          [id("prf_"), target.item_id, "PACKAGE_DOWNLOAD", f.download ? 1 : 0, rights.PUBLIC_READ.basis, rights.PUBLIC_READ.asserted_at, actorId(actor), now()]);
      const nextVersion = Number(draft.version) + 1;
      await dbRun(database, "UPDATE publication_drafts SET version=?,updated_by=?,updated_at=? WHERE draft_id=?", [nextVersion, actorId(actor), now(), draft.draft_id]);
      return { draft_version: nextVersion, snapshot_sha256: snapshotSha };
    });
  }
  async function updateMediathequeMaterial(actor, input, opts = {}) {
    mediathequeOwner(actor);
    const base = idemKey(opts.idempotencyKey), raw = input && input.fields || {};
    const tags = Array.isArray(raw.tags) ? [...new Set(raw.tags.map(t => cleanText(t, 240)).filter(Boolean))] : [];
    if (tags.length > 30 || tags.some(t => t.length > 80) || typeof raw.download !== "boolean") fail("PUBLICATION_INPUT_INVALID", 400);
    const fields = { title: cleanText(raw.title, 500, true), description: cleanText(raw.description, 4000), creator: cleanText(raw.creator, 200), tags, download: raw.download };
    const { corpus, item, workId } = await managedWork(input);
    if (!item) fail("MATERIAL_NOT_FOUND", 404);
    if (item.snapshot_sha256 !== String(input.expectedSnapshotHash || "")) fail("MATERIAL_CHANGED", 409);
    const k = step => (base + ":" + workId + ":" + step).slice(0, 200);
    const draft = await cleanDraftFor(actor, corpus, k("draft"));
    const updated = await updateDraftWork(actor, corpus.corpus_id, { workId, expectedVersion: Number(draft.version), fields }, { idempotencyKey: k("update") });
    await publish(actor, corpus.corpus_id, { expectedVersion: updated.draft_version }, { idempotencyKey: k("publish") });
    return { slug: corpus.slug, workId, snapshotHash: updated.snapshot_sha256 };
  }
  async function mediathequeMaterialArchive(actor, input) {
    mediathequeOwner(actor);
    const { item, workId } = await managedWork(input);
    if (!item) fail("MATERIAL_NOT_FOUND", 404);
    const meta = ((parseJson(item.snapshot_json).library || {}).texts?.[0] || {}).source_meta || {};
    const part = input && input.part === "media" ? "media" : "package";
    const sha = part === "media" ? meta.publication_media?.sha256 : meta.publication_archive?.package_sha256;
    if (!/^[a-f0-9]{64}$/.test(String(sha || ""))) fail("MATERIAL_ARCHIVE_UNAVAILABLE", 404);
    const absolute = sourcePath(part === "media" ? "publication-imports/media/" + sha : "publication-imports/packages/" + sha + ".zip");
    try { if (!(await fs.promises.stat(absolute)).isFile()) fail("MATERIAL_ARCHIVE_UNAVAILABLE", 404); }
    catch (error) { if (error.code === "MATERIAL_ARCHIVE_UNAVAILABLE") throw error; fail("MATERIAL_ARCHIVE_UNAVAILABLE", 404); }
    const ext = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "audio/mpeg": ".mp3", "audio/mp4": ".m4a" }[meta.publication_media?.mime] || "";
    return { absolute_path: absolute, filename: workId + (part === "media" ? ext : ".lplp.zip"), mime: part === "media" ? meta.publication_media.mime : "application/zip" };
  }
```

Экспорт: `updateMediathequeMaterial`, `mediathequeMaterialArchive`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/mediathequeMaterialCommands.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/publicationRepo.js tests/mediathequeMaterialCommands.test.js
git commit -m "feat(mediatheque): edit public material cards and download their archives"
```

---

### Task 5: Маршруты сервера

**Files:**
- Modify: `server.js:4058-4070` (`publicationError` safe-коды), `:4124` (маршруты после цикла `draft/undo/publish/rollback`)
- Test: `tests/mediathequeMaterialCommands.test.js` (статический тест маршрутов)

**Interfaces:**
- Produces: `POST /api/publication/mediatheque/materials:delete` body `{items:[{slug,workId}]}`; `POST /api/publication/mediatheque/materials:update` body `{slug,workId,expectedSnapshotHash,fields}`; `GET /api/publication/mediatheque/materials/archive?slug=&workId=&part=package|media`.

- [ ] **Step 1: Write the failing test**:

```js
test('server wires owner-guarded material routes and exposes their error codes',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  for(const route of ["mediatheque/materials\\\\:delete","mediatheque/materials\\\\:update"])
    assert.match(src,new RegExp("app\\.post\\('/api/publication/"+route+"',\\s*rlPublicationWrite,\\s*requireStrictSameOriginJson"));
  assert.match(src,/app\.get\('\/api\/publication\/mediatheque\/materials\/archive',\s*rlPublicationRead/);
  for(const code of ['MATERIAL_NOT_MANAGED','MATERIAL_NOT_FOUND','MATERIAL_CHANGED','MATERIAL_ARCHIVE_UNAVAILABLE','EDITION_PURGED'])assert.ok(src.includes('"'+code+'"'),code);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/mediathequeMaterialCommands.test.js` → FAIL на маршрутах.

- [ ] **Step 3: Implement** — в `publicationError` добавить в `safe`: `"MATERIAL_NOT_MANAGED", "MATERIAL_NOT_FOUND", "MATERIAL_CHANGED", "MATERIAL_ARCHIVE_UNAVAILABLE", "EDITION_PURGED",`. После цикла маршрутов Медиатеки:

```js
app.post('/api/publication/mediatheque/materials\\:delete', rlPublicationWrite, requireStrictSameOriginJson,
  (req, res) => publicationWrite(req, res, 'mediatheque_material_delete',
    (repo, actor, opts) => repo.deleteMediathequeMaterials(actor, { items: (req.body && req.body.items) || [] }, opts)));
app.post('/api/publication/mediatheque/materials\\:update', rlPublicationWrite, requireStrictSameOriginJson,
  (req, res) => publicationWrite(req, res, 'mediatheque_material_update', (repo, actor, opts) => repo.updateMediathequeMaterial(actor, req.body || {}, opts)));
app.get('/api/publication/mediatheque/materials/archive', rlPublicationRead, async (req, res) => {
  const auth = await requireUser(req, res); if (!auth) return;
  res.set('Cache-Control', 'private, no-store, max-age=0');
  try {
    const file = await getPublicationRepo().mediathequeMaterialArchive(publicationActor(auth),
      { slug: String(req.query.slug || ''), workId: String(req.query.workId || ''), part: String(req.query.part || 'package') });
    identityRepo.audit('publication_mediatheque_material_archive', auth.user.id, { slug: String(req.query.slug || '') }, req.ip);
    res.type(file.mime); return res.download(file.absolute_path, file.filename);
  } catch (error) { return publicationError(res, error); }
});
```

- [ ] **Step 4: Run** — `node --test tests/mediathequeMaterialCommands.test.js` → PASS; `node -e "require('./server.js')"` не запускать (поднимает сервер) — вместо этого `node --check server.js`.

- [ ] **Step 5: Commit** — `git add server.js tests/mediathequeMaterialCommands.test.js && git commit -m "feat(server): mediatheque material delete, edit and archive routes"`

---

### Task 6: Интерфейс «Общедоступных» — удалить, удалить выбранные, изменить, скачать

**Files:**
- Modify: `public/js/mediatheque-ui.js` (`itemHtml:257-277`, `bulkHtml:421-428`, `onAction:757+`, `errorText:61-74`, `rebuild:156-160`)
- Modify: `public/i18n/locales/{ru,en,he}.js` (новый блок `Object.assign(window.I18N_LOCALES.<l>.mediatheque, {...})` в конце файла)
- Test: `tests/mediathequeStage2.test.js` или новый статический тест в `tests/mediathequeMaterialCommands.test.js`; живая проверка в браузере

**Interfaces:**
- Consumes: маршруты Task 5; `api(path, body, key)`, `showDialog`, `formActions(label, danger)`, `closeDialog`, `announce`, `loadPublic`, `refreshStructure`, `state.prepared.byKey`, `state.published.structure`, `state.draft.structure`.

- [ ] **Step 1: Write the failing test** (статический, ловит неподключённые действия и пропуски локалей):

```js
test('mediatheque UI wires material commands and every new string exists in ru/en/he',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','public/js/mediatheque-ui.js'),'utf8');
  for(const a of ['delete-material','delete-selected','edit-material','download-material','hide-item','hide-selected','unhide-item'])assert.ok(ui.includes("'"+a+"'"),a);
  global.window={I18N_LOCALES:{}};
  for(const l of ['ru','en','he'])require('../public/i18n/locales/'+l+'.js');
  const keys=['deleteMaterial','deleteMaterialHelp','deleteMaterialPlaces','deleteMaterialDevices','deleteForever','deleteSelected','deleteSelectedHelp','deleteSkipped','deleteReport','deleteCleanupPending','downloadArchive','downloadMedia','downloadBeforeDelete','archiveUnavailable','editMaterial','materialTitle','materialDescription','materialCreator','materialTags','materialDownload','materialNotManaged','materialNotFound','materialChanged','editionPurged','hideFromMediatheque','hideHelp','hiddenFilter','unhide','hiddenDone','unhiddenDone'];
  for(const l of ['ru','en','he'])for(const k of keys)assert.ok(window.I18N_LOCALES[l].mediatheque[k],l+'.'+k);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**

Локали — ru (en/he — перевод тех же смыслов):

```js
Object.assign(window.I18N_LOCALES.ru.mediatheque, {
  "deleteMaterial": "Удалить", "deleteMaterialHelp": "«{title}» будет удалён с сервера вместе с файлами. У зрителей он исчезнет сразу. Это необратимо.",
  "deleteMaterialPlaces": "Сейчас стоит: {places}", "deleteMaterialDevices": "Копии, уже сохранённые на устройствах учеников, сервер стереть не может.",
  "deleteForever": "Удалить навсегда", "deleteSelected": "Удалить", "deleteSelectedHelp": "Будут удалены с сервера ({count}):",
  "deleteSkipped": "Будут пропущены — ими управляют в Центре публикаций:", "deleteReport": "Удалено: {deleted}. Не удалось: {failed}.",
  "deleteCleanupPending": "Часть файлов не стёрта. Повторите удаление, чтобы дочистить.",
  "downloadArchive": "Скачать архив", "downloadMedia": "Скачать медиафайл", "downloadBeforeDelete": "Скачать архив перед удалением",
  "archiveUnavailable": "Для этого материала исходный архив на сервере не хранится.",
  "editMaterial": "Изменить карточку", "materialTitle": "Название", "materialDescription": "Описание", "materialCreator": "Автор или источник",
  "materialTags": "Теги через запятую", "materialDownload": "Разрешить скачивание",
  "materialNotManaged": "Материал принадлежит собранию «{corpus}»; им управляют в Центре публикаций.",
  "materialNotFound": "Материал уже удалён или заменён. Обновите страницу.", "materialChanged": "Карточку уже изменили. Обновите страницу и повторите.",
  "editionPurged": "Эта редакция содержит удалённый материал и недоступна.",
  "hideFromMediatheque": "Удалить из Медиатеки", "hideHelp": "Материал исчезнет из Медиатеки. В Библиотеке он останется; вернуть можно через фильтр «Скрытые».",
  "hiddenFilter": "Скрытые", "unhide": "Вернуть в Медиатеку", "hiddenDone": "Скрыто из Медиатеки", "unhiddenDone": "Возвращено в Медиатеку"
});
```

`errorText` — перед общим `MATERIAL_ARCHIVE|PACKAGE_`:

```js
  if (/MATERIAL_NOT_MANAGED/.test(code)) return t('materialNotManaged', { corpus: '' });
  if (/MATERIAL_NOT_FOUND/.test(code)) return t('materialNotFound');
  if (/MATERIAL_CHANGED/.test(code)) return t('materialChanged');
  if (/MATERIAL_ARCHIVE_UNAVAILABLE/.test(code)) return t('archiveUnavailable');
  if (/EDITION_PURGED/.test(code)) return t('editionPurged');
```

Хелперы (рядом с `selectedMaterials`):

```js
const managed = item => item?.ref?.kind === 'public' && /^media-[a-f0-9]{20}$/.test(item.ref.slug);
function placesOf(item) {
  const d = state.editing && state.draft ? state.draft.structure : state.published.structure, same = k => k === item.key;
  const places = [...d.categories.filter(c => c.items.some(same)).map(c => C.categoryPath(d, c.id).map(x => x.title).join(' / ')),
    ...d.collections.filter(c => c.items.some(same)).map(c => c.title), ...(d.home.featured === item.key ? [t('section.pinned')] : [])];
  return places.length ? places.join(', ') : t('none');
}
function archiveHref(item, part = 'package') {
  return '/api/publication/mediatheque/materials/archive?' + new URLSearchParams({ slug: item.ref.slug, workId: item.ref.workId, part });
}
async function deleteMaterials(items) {
  const result = await api('/api/publication/mediatheque/materials:delete', { items: items.map(i => ({ slug: i.ref.slug, workId: i.ref.workId })) });
  closeDialog(); state.selected.clear();
  await loadPublic(); if (state.editing) state.draft = await api('/api/publication/mediatheque'); rebuild(); render();
  announce(t('deleteReport', { deleted: result.deleted.length, failed: result.failed.length })
    + (result.failed.length ? ' ' + result.failed.map(f => (state.publicItems.find(i => i.ref.workId === f.workId)?.title || f.workId) + ' — ' + errorText({ code: f.code })).join('; ') : '')
    + (result.cleanup_pending.length ? ' ' + t('deleteCleanupPending') : ''), result.failed.length > 0);
}
```

`itemHtml` — в футер карточки, когда `manage && state.space === 'public' && item.ref.kind === 'public'`:

```js
      ${manage && state.space === 'public' && item.ref.kind === 'public' ? (managed(item)
        ? button('edit-material', t('editMaterial'), `data-key="${esc(item.key)}"`) + button('download-material', t('downloadArchive'), `data-key="${esc(item.key)}"`)
          + button('delete-material', t('deleteMaterial'), `data-key="${esc(item.key)}"`, 'ml-danger')
        : `<span class="ml-hint" dir="auto">${esc(t('materialNotManaged', { corpus: item.corpusTitle || item.ref.slug }))}</span>`) : ''}
      ${manage && state.space === 'personal' && item.ref.kind === 'personal' ? (structure().hidden || []).includes(item.key)
        ? button('unhide-item', t('unhide'), `data-key="${esc(item.key)}"`) : button('hide-item', t('hideFromMediatheque'), `data-key="${esc(item.key)}"`, 'ml-quiet') : ''}
```

`bulkHtml` — после `remove-items`:

```js
    ${state.space === 'public' ? button('delete-selected', t('deleteSelected'), n ? '' : 'disabled', 'ml-danger') : button('hide-selected', t('hideFromMediatheque'), n ? '' : 'disabled')}
```

`onAction` — после `if (!canEdit()) return;`:

```js
  if (action === 'delete-material') {
    const item = state.prepared.byKey.get(node.dataset.key); if (!managed(item)) return;
    return showDialog(t('deleteMaterial'), `<p dir="auto">${esc(t('deleteMaterialHelp', { title: item.title }))}</p>
      <p dir="auto">${esc(t('deleteMaterialPlaces', { places: placesOf(item) }))}</p><p>${esc(t('deleteMaterialDevices'))}</p>
      <p><a class="ml-textlink" href="${esc(archiveHref(item))}" download>${esc(t('downloadBeforeDelete'))}</a></p>${formActions(t('deleteForever'), true)}`,
      () => deleteMaterials([item]));
  }
  if (action === 'delete-selected') {
    const items = selectedMaterials(), ok = items.filter(managed), skip = items.filter(i => !managed(i));
    return showDialog(t('deleteSelected'), `<p>${esc(t('deleteSelectedHelp', { count: ok.length }))}</p><ul>${ok.map(i => `<li dir="auto">${esc(i.title)}</li>`).join('')}</ul>
      ${skip.length ? `<p>${esc(t('deleteSkipped'))}</p><ul>${skip.map(i => `<li dir="auto">${esc(i.title)}</li>`).join('')}</ul>` : ''}
      <p>${esc(t('deleteMaterialDevices'))}</p>${formActions(t('deleteForever'), true)}`, () => ok.length ? deleteMaterials(ok) : closeDialog());
  }
  if (action === 'download-material') {
    const item = state.prepared.byKey.get(node.dataset.key); if (!managed(item)) return;
    const probe = await fetch(archiveHref(item), { method: 'HEAD', credentials: 'same-origin' }).catch(() => null);
    if (!probe || !probe.ok) return announce(t('archiveUnavailable'), true);
    location.assign(archiveHref(item)); return;
  }
  if (action === 'edit-material') {
    const item = state.prepared.byKey.get(node.dataset.key); if (!managed(item)) return;
    const row = state.published.items.find(i => C.refKey(i.ref) === item.key);
    return showDialog(t('editMaterial'), `<label>${esc(t('materialTitle'))}<input name="title" maxlength="500" required value="${esc(item.title)}"></label>
      <label>${esc(t('materialDescription'))}<textarea name="description" maxlength="4000">${esc(item.description || '')}</textarea></label>
      <label>${esc(t('materialCreator'))}<input name="creator" maxlength="200" value="${esc(row?.creator || '')}"></label>
      <label>${esc(t('materialTags'))}<input name="tags" value="${esc((row?.tags || []).join(', '))}"></label>
      <label class="ml-checkbox"><input type="checkbox" name="download" ${row?.media?.downloadAllowed === false ? '' : 'checked'}>${esc(t('materialDownload'))}</label>${formActions(t('save'))}`,
      async data => {
        await api('/api/publication/mediatheque/materials:update', { slug: item.ref.slug, workId: item.ref.workId, expectedSnapshotHash: item.ref.snapshotHash,
          fields: { title: data.get('title').trim(), description: data.get('description').trim(), creator: data.get('creator').trim(),
            tags: data.get('tags').split(',').map(s => s.trim()).filter(Boolean), download: data.has('download') } });
        closeDialog(); await loadPublic(); if (state.editing) state.draft = await api('/api/publication/mediatheque'); rebuild(); render(); announce(t('saved'));
      });
  }
```

Перед реализацией проверить, как `dialogAction` получает `FormData` (`grep -n "dialogAction(" public/js/mediatheque-ui.js`) и чем `row.media` отдаёт право скачивания (`public/js/mediatheque-metadata.js`); если поля `downloadAllowed` нет — чекбокс по умолчанию отмечен, а сервер хранит факт отдельно (не выдумывать поле).

`rebuild` — прогресс учеников после правки карточки: заменить сопоставление `localByKey.get(C.refKey(row.ref))` сопоставлением по `slug`+`workId`:

```js
  const localByWork = new Map(state.localItems.filter(i => i.ref.kind === 'public').map(i => [i.ref.slug + '\u0000' + i.ref.workId, i]));
  // ...
    const local = state.preview ? null : localByWork.get(row.ref.slug + '\u0000' + row.ref.workId);
```

- [ ] **Step 4: Run** — `node --test tests/mediathequeMaterialCommands.test.js tests/mediathequeStage2.test.js tests/i18n.smoke.js` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(mediatheque-ui): delete, bulk delete, edit and download public materials"`

---

### Task 7: Интерфейс «Моих материалов» — скрыть и вернуть

**Files:**
- Modify: `public/js/mediatheque-ui.js` (`rebuild`, `filtersHtml:379`, `activeFiltersHtml:413-416`, `onAction`)
- Test: `tests/mediathequeMaterialCommands.test.js` (статический тест уже проверяет действия Task 6); живая проверка

**Interfaces:**
- Consumes: `C.command(..., {type:'items.hide'|'items.unhide'})`, фильтр `hidden` (Task 1), `mutate(command, success)`.

- [ ] **Step 1: Implement** (тест из Task 6 уже требует `hide-item`, `hide-selected`, `unhide-item`):

`rebuild` — после построения `items` для личного пространства:

```js
  if (state.space === 'personal') {
    const hidden = new Set(structure().hidden || []);
    items = items.filter(i => state.filters.hidden ? hidden.has(C.refKey(i.ref)) : !hidden.has(C.refKey(i.ref)));
  }
```

и добавить `state.filters.hidden` в массив `inputs` мемоизации `rebuild`.

`filtersHtml` — в список чекбоксов для личного пространства: `...(state.space === 'personal' ? [['hidden', 'hiddenFilter']] : [])`.
`activeFiltersHtml` — добавить `'hidden'` в список полей и подпись `t('hiddenFilter')` для булева `hidden`.

`onAction`:

```js
  if (action === 'hide-item') return showDialog(t('hideFromMediatheque'), `<p>${esc(t('hideHelp'))}</p>${formActions(t('hideFromMediatheque'))}`,
    () => formSave(C.command(structure(), { type: 'items.hide', keys: [node.dataset.key] }), t('hiddenDone')));
  if (action === 'hide-selected') return showDialog(t('hideFromMediatheque'), `<p>${esc(t('hideHelp'))}</p>${formActions(t('hideFromMediatheque'))}`,
    () => formSave(C.command(structure(), { type: 'items.hide', keys: Array.from(state.selected).filter(k => k.startsWith('my/')) }), t('hiddenDone')));
  if (action === 'unhide-item') return mutate({ type: 'items.unhide', keys: [node.dataset.key] }, t('unhiddenDone'));
```

- [ ] **Step 2: Run** — `node --test tests/mediatheque*.test.js tests/i18n.smoke.js` → PASS.

- [ ] **Step 3: Commit** — `git commit -m "feat(mediatheque-ui): hide personal materials from the Mediatheque without touching the Library"`

---

### Task 8: Версии, гейты, выпуск, живая проверка

**Files:**
- Modify: `public/index.html` (`APP_VERSION`), `public/sw.js` (`CACHE_VERSION`, `?v=` у `mediatheque-core.js`, `mediatheque-ui.js`, локалей), `public/library.html:3185`, `public/mediatheque.html` (`?v=`), `docs/planning/MEDIATHEQUE_MATERIAL_COMMANDS_2026_09_23.md` (статус → SHIPPED + версия)

- [ ] **Step 1:** поднять версию до следующей `3.11.x`, все `?v=` изменённых файлов (`grep -rn "mediatheque-core.js?v=\|mediatheque-ui.js?v=\|locales/ru.js?v=" public/*.html public/sw.js public/js/*.js`), включая импорты внутри `mediatheque-ui.js`.
- [ ] **Step 2:** гейты: `node --test tests/mediatheque*.test.js tests/publication*.test.js tests/i18n.smoke.js tests/shellModuleWiring.test.js tests/playbackSource.test.js` → 0 fail.
- [ ] **Step 3:** коммит + push в `main`; дождаться `CACHE_VERSION` новой версии на `https://linguistpro.kolosei.com/sw.js`; убедиться, что миграция `068` применилась на проде (`/healthz` или журнал запуска).
- [ ] **Step 4 (живое, с подтверждением владельца перед необратимым действием):** в «Общедоступных» → «Редактировать витрину» → на «Ворт» «Скачать архив» (файл скачивается) → «Удалить» → окно показывает места и предупреждение → «Удалить навсегда» → «Удалено: 1». Материал исчез из каталога и тем. «Добавить материал» с исправленным архивом проходит без `SOURCE_ALREADY_COPIED`; у новой копии в Студии/Зале кнопки ▶ в колонке «Перевод».
- [ ] **Step 5:** в «Моих материалах» скрыть одну карточку → исчезла; фильтр «Скрытые» → видна, «Вернуть в Медиатеку» → вернулась; в Библиотеке карточка всё время на месте.
- [ ] **Step 6:** обновить статус спецификации, память проекта; коммит + push.
