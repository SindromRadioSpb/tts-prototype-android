'use strict';
// Д6.1 one way to put a public work on the device (the Room and «Мой словарь»): docs/planning/word-layer/F4_D6_CATALOG_SETS_SPEC_2026_10_14.md
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/corpus-materialize.js');
const Edition = require('../public/js/benyehuda-learning-edition.js');

function fakeDb(texts) {
  const rows = new Map(Object.entries(texts || {}));   // text_key → { id, source_meta_json }
  const imported = [];
  return {
    imported,
    dbQuery: async (_sql, [key]) => (rows.has(key) ? [{ id: rows.get(key).id }] : []),
    getTextById: async (id) => Array.from(rows.values()).find((t) => t.id === id) || null,
    importBundle: async (bundle) => { imported.push(bundle); bundle.library.texts.forEach((t, i) => rows.set(t.text_key, { id: 'new-' + imported.length + '-' + i, source_meta_json: JSON.stringify(t.source_meta || {}) })); },
  };
}
const fetchOf = (map, calls) => async (url) => { calls.push(url); const body = map[url.split('?')[0]] ?? map[url]; if (body === undefined) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => body, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer }; };

test('Ben-Yehuda: a work already on the device is reused without a download', async () => {
  const db = fakeDb({ k1: { id: 't1' } }), calls = [];
  const r = await M.ensureBenYehudaWork({ id: '101', text_key: 'k1', file: 'works/101.json' }, { db, fetch: fetchOf({}, calls), Edition, catalogVersion: 8 });
  assert.deepEqual(r, { localId: 't1', edition: 'published', imported: false });
  assert.equal(calls.length, 0);
});

test('Ben-Yehuda: a missing work is fetched with the catalog version, verified and imported', async () => {
  const db = fakeDb({}), calls = [];
  const bundle = { library: { texts: [{ text_key: 'k2', title: 'x', rows: [] }] } };
  const r = await M.ensureBenYehudaWork({ id: '7', text_key: 'k2', file: 'works/7.json' }, { db, fetch: fetchOf({ '/data/benyehuda/works/7.json': bundle }, calls), Edition, catalogVersion: 8 });
  assert.equal(calls[0], '/data/benyehuda/works/7.json?v=8');
  assert.equal(r.imported, true); assert.ok(r.localId);
  assert.equal(db.imported.length, 1);
});

test('Ben-Yehuda learning edition: an earlier edition with my marks is kept; a foreign local key is refused', async () => {
  const card = { id: '9', text_key: 'kNew', file: 'works/9-' + 'a'.repeat(32) + '.json', learning_edition_id: 'le1', previous_text_keys: ['kOld'] };
  const db = fakeDb({ kOld: { id: 'old', source_meta_json: JSON.stringify({ corpus: { byehuda_id: 9 } }) } }), calls = [];
  const r = await M.ensureBenYehudaWork(card, { db, fetch: fetchOf({}, calls), Edition, catalogVersion: 8 });
  assert.deepEqual(r, { localId: 'old', edition: 'previous', imported: false });
  const db2 = fakeDb({ kNew: { id: 'x', source_meta_json: JSON.stringify({ corpus: { byehuda_id: 10 } }) } });
  await assert.rejects(M.ensureBenYehudaWork(card, { db: db2, fetch: fetchOf({}, []), Edition, catalogVersion: 8 }), /another source work/);
});

test('public corpus: the exact snapshot is requested, imported once, then reused', async () => {
  const h = 'c'.repeat(64), calls = [];
  const Adapter = { localTextKey: (slug, w, s) => 'pub:' + slug + ':' + w + ':' + s, prepareImportBundle: (p) => ({ library: { texts: [{ text_key: 'pub:s:w1:' + h }] } }) };
  const db = fakeDb({});
  const fetch = fetchOf({ ['/api/public-corpora/s/works/w1?snapshot=' + h]: { item: { snapshot_sha256: h } } }, calls);
  const a = await M.ensurePublicWork('s', { public_work_id: 'w1', snapshot_sha256: h }, { db, fetch, Adapter });
  const b = await M.ensurePublicWork('s', { public_work_id: 'w1', snapshot_sha256: h }, { db, fetch, Adapter });
  assert.equal(a.imported, true); assert.equal(b.imported, false); assert.equal(a.localId, b.localId);
  assert.equal(calls.length, 1);
});

test('public evidence restoration keeps existing text identity, requests an isolated evidence URL once, and works offline', async () => {
  const h='d'.repeat(64),calls=[];
  const key='pub:s:existing:'+h;
  const db=fakeDb({[key]:{id:'existing-local'}});
  db.importBundle=async(bundle,options)=>{assert.equal(options.mode,'skip');db.imported.push(bundle);};
  const Adapter={localTextKey:()=>key,prepareImportBundle:()=>({library:{texts:[{text_key:key}]}})};
  const fetch=async url=>{calls.push(url);return {ok:true,json:async()=>({item:{snapshot_sha256:h}})};};
  const card={public_work_id:'existing',snapshot_sha256:h};
  const first=await M.ensurePublicWork('s',card,{db,fetch,Adapter},{restoreEvidence:true});
  assert.equal(first.localId,'existing-local');assert.equal(first.imported,false);
  await M.ensurePublicWork('s',card,{db,fetch,Adapter},{restoreEvidence:true});
  assert.equal(calls.length,1);
  assert.match(calls[0],/snapshot=d{64}&evidence=1$/);
  const offlineDb=fakeDb({[key]:{id:'offline-local'}});
  const offline=await M.ensurePublicWork('s',card,{db:offlineDb,fetch:async()=>{throw Error('offline')},Adapter},{restoreEvidence:true});
  assert.equal(offline.localId,'offline-local');
});

test('many works: one at a time, a failure does not stop the rest, every failure is named', async () => {
  const seen = [], progress = [];
  const r = await M.materializeMany(['a', 'bad', 'c'], async (x) => { seen.push(x); if (x === 'bad') throw new Error('fetch 503'); return { localId: 'id-' + x, imported: true }; },
    { onProgress: (d, n) => progress.push(d + '/' + n) });
  assert.deepEqual(seen, ['a', 'bad', 'c']);
  assert.deepEqual(r.ok.map((x) => x.localId), ['id-a', 'id-c']);
  assert.deepEqual(r.failed, [{ item: 'bad', reason: 'fetch 503' }]);
  assert.deepEqual(progress, ['0/3', '1/3', '2/3', '3/3']);
});

test('catalog search ignores niqqud and case, matches every word, reports the total beyond the limit', () => {
  const cards = [{ title: 'הַשַּׁחַר נִדְמֹה', author: 'יהודה ליב גורדון' }, { title: 'אהבת ציון', author: 'אברהם מאפו' }, { title: 'Shir', author: 'גורדון' }];
  assert.deepEqual(M.searchCards(cards, 'השחר', ['title', 'author']).items.map((c) => c.title), ['הַשַּׁחַר נִדְמֹה']);
  assert.equal(M.searchCards(cards, 'גורדון', ['title', 'author'], 1).total, 2);
  assert.equal(M.searchCards(cards, 'גורדון', ['title', 'author'], 1).items.length, 1);
  assert.equal(M.searchCards(cards, 'shir', ['title']).items.length, 1);
  assert.equal(M.searchCards(cards, '', ['title']).total, 3);
});

test('the server tells the Ben-Yehuda catalog number the Room carries (one source: library-ui.js)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'library-ui.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const N = require('../agent/nextText.js');
  N._resetForTest();
  assert.equal(N.catalogVersion(), Number(ui.match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/)[1]));
  const at = server.indexOf('app.get("/api/corpus-catalog/benyehuda"');
  assert.ok(at > 0 && server.slice(at, at + 600).includes('require("./agent/nextText").catalogVersion()'));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'data', 'benyehuda', 'corpus-index-v' + N.catalogVersion() + '.json')), 'the index the dictionary searches exists');
});
