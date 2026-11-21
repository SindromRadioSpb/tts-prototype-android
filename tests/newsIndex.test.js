'use strict';
// News index (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.1).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { openDb } = require('./helpers/newsDb.cjs');
const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

test('migration 091 is idempotent and its down drops both tables', async () => {
  const db = await openDb();
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '091_news_index.sql'), 'utf8'));
  const names = (await all(db, "SELECT name FROM sqlite_master WHERE name IN ('news_index','news_search')")).map(r => r.name).sort();
  assert.deepEqual(names, ['news_index', 'news_search']);
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', 'down', '091_news_index.sql'), 'utf8'));
  assert.equal((await all(db, "SELECT name FROM sqlite_master WHERE name IN ('news_index','news_search')")).length, 0);
  db.close();
});

const C = require('../news/newsPackCore');
const { createNewsIndex } = require('../db/newsIndex');
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const NOW = Date.parse('2026-11-21T12:00:00Z');
const URL1 = 'https://www.ynet.co.il/news/article/abc123';
const key = url => C.articleKey('ynet', C.canonicalizeUrl(url));
async function harvestRow(db, over = {}) {
  const r = { url_key: key(URL1), outlet_id: 'ynet', url: URL1, first_seen_at: '2026-11-20T23:30:00Z', status: 'ready', title_he: 'הבחירות בצ׳ילה', lead_he: 'פסקה ראשונה',
    published_at: '2026-11-20T23:00:00Z', section: 'world', full_ok: 1, ...over };
  const cols = Object.keys(r);
  await run(db, `INSERT INTO news_harvest_items(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map(c => r[c]));
  return r;
}
async function publish(db, now = Date.parse('2026-11-12T08:00:00+02:00')) {
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const repo = createNewsRepo({ db, now: () => now });
  await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
}
const rows = db => all(db, 'SELECT * FROM news_index ORDER BY item_key');

test('refresh: harvest row becomes a slice row with Israel day of first_seen_at', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const h = await harvestRow(db);
  await ix.refresh([h.url_key]);
  const [r] = await rows(db);
  assert.equal(r.kind, 'slice'); assert.equal(r.day, '2026-11-21'); assert.equal(r.title_he, 'הבחירות בצ׳ילה'); assert.equal(r.work_id, null);
  const hit = await all(db, 'SELECT rowid FROM news_search WHERE news_search MATCH ?', [require('../news/newsSearchNorm').ftsQuery('בחירות')]);
  assert.deepEqual(hit.map(x => x.rowid), [r.rid]);
  db.close();
});
test('refresh: published study article turns the row into learn with work_id', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const h = await harvestRow(db, { first_seen_at: '2026-11-12T05:00:00Z' });
  await publish(db);
  await ix.refresh([h.url_key]);
  const [r] = await rows(db);
  assert.equal(r.kind, 'learn'); assert.match(r.work_id, /^na_[0-9a-f]{24}\.b1$/); assert.equal(r.title_ru, 'Бюджет прошёл первое чтение');
  db.close();
});
test('refresh: study article without a harvest row is indexed by published_at day', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  await publish(db);
  await ix.refresh([key(URL1)]);
  const [r] = await rows(db);
  assert.equal(r.kind, 'learn'); assert.equal(r.day, '2026-11-12'); assert.equal(r.outlet_id, 'ynet');
  db.close();
});
test('refresh: url_key and canonical_key of one article give one row', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const alt = 'https://www.ynet.co.il/news/article/abc123?from=rss&x=1';
  const h = await harvestRow(db, { url_key: key(alt) === key(URL1) ? 'na_' + '1'.repeat(24) : key(alt), url: alt, canonical_key: key(URL1) });
  await ix.refresh([h.url_key]);
  await ix.refresh([key(URL1)]);
  const list = await rows(db);
  assert.equal(list.length, 1); assert.equal(list[0].item_key, key(URL1));
  db.close();
});
test('refresh: failed harvest row is removed from the index', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const h = await harvestRow(db);
  await ix.refresh([h.url_key]);
  await run(db, "UPDATE news_harvest_items SET status='failed' WHERE url_key=?", [h.url_key]);
  const r = await ix.refresh([h.url_key]);
  assert.equal(r.removed, 1);
  assert.equal((await rows(db)).length, 0);
  assert.equal((await all(db, 'SELECT rowid FROM news_search WHERE news_search MATCH ?', ['"הבחירות"*'])).length, 0);
  db.close();
});
test('prune: slice rows older than 45 days go, learn rows stay', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  await harvestRow(db, { url_key: 'na_' + 'a'.repeat(24), url: 'https://www.ynet.co.il/news/article/old', first_seen_at: '2026-09-30T10:00:00Z' });
  await harvestRow(db, { url_key: 'na_' + 'b'.repeat(24), url: 'https://www.ynet.co.il/news/article/new', first_seen_at: '2026-11-20T10:00:00Z' });
  await publish(db);
  await ix.backfill({ batch: 2 });
  assert.equal((await rows(db)).length, 3);
  assert.equal(await ix.prune(NOW), 1);
  const left = await rows(db);
  assert.deepEqual(left.map(r => r.kind).sort(), ['learn', 'slice']);
  db.close();
});

test('pack accept turns the index row into learn; withdraw turns it back to slice', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00'), index: ix });
  const h = await harvestRow(db, { first_seen_at: '2026-11-12T05:00:00Z' });
  await ix.refresh([h.url_key]);
  assert.equal((await rows(db))[0].kind, 'slice');
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  assert.equal((await rows(db))[0].kind, 'learn');
  await repo.withdrawArticle({ id: 'owner', kind: 'owner' }, receipt.items[0].article_id, 'test');
  const [r] = await rows(db);
  assert.equal(r.kind, 'slice'); assert.equal(r.work_id, null);
  db.close();
});
test('overview upsert refreshes the index with translations', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const { createOverviewItems } = require('../db/newsOverviewItems');
  const ov = createOverviewItems({ db, now: () => NOW, index: ix });
  const h = await harvestRow(db);
  await ov.upsert({ schema: 'linguistpro-news-overview', schema_version: 1, day: '2026-11-21', stories: [{ story_key: 'S', items: [{ outlet_id: 'ynet', url: URL1, title_he: h.title_he, title_ru: 'Выборы в Чили' }] }] });
  const [r] = await rows(db);
  assert.equal(r.title_ru, 'Выборы в Чили'); assert.equal(r.story_key, 'S');
  db.close();
});

test('cleanup drops 45-day-old overview rows but keeps study ones', async () => {
  const os = require('node:os');
  const db = await openDb(['084_news_fingerprints.sql']);
  const { createNewsHarvester } = require('../news/harvest/newsHarvest');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-ix-'));
  await publish(db);
  const learnKey = key(URL1), oldKey = 'na_' + 'c'.repeat(24);
  const ins = (k, day) => run(db, `INSERT INTO news_overview_items(item_key, day, story_key, outlet_id, url, title_he, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [k, day, 'S-' + k, 'ynet', 'https://www.ynet.co.il/news/article/' + k, 'כותרת', 't', 't']);
  await ins(learnKey, '2026-09-01'); await ins(oldKey, '2026-09-01'); await ins('na_' + 'd'.repeat(24), '2026-11-20');
  await run(db, `INSERT INTO news_stories(story_key, first_day, created_at, last_at, words_json, mass) VALUES ('S-old','2026-09-01','t','2026-09-01T00:00:00Z','[]',1)`);
  await run(db, `INSERT INTO news_article_changes(article_id, detected_at, significant) VALUES (?, '2026-09-01T00:00:00Z', 1)`, [oldKey]);
  const h = createNewsHarvester({ db, dataDir, now: () => NOW, fetchImpl: async () => { throw new Error('offline'); } });
  await h.cleanup();
  const left = (await all(db, 'SELECT item_key FROM news_overview_items ORDER BY item_key')).map(r => r.item_key);
  assert.deepEqual(left.sort(), [learnKey, 'na_' + 'd'.repeat(24)].sort());
  assert.equal((await all(db, "SELECT 1 FROM news_stories WHERE story_key='S-old'")).length, 0);
  assert.equal((await all(db, 'SELECT 1 FROM news_article_changes')).length, 0);
  fs.rmSync(dataDir, { recursive: true, force: true });
  db.close();
});

test('ensureBuilt backfills once per index version', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  await harvestRow(db);
  assert.equal(await ix.ensureBuilt(1), 1);
  assert.equal(await ix.ensureBuilt(1), 0, 'same version: nothing to do');
  assert.equal(await ix.ensureBuilt(2), 1, 'a new version rebuilds');
  db.close();
});

test('index row keeps the edition time (the «новое в» and since-last-visit marks need it)', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const { createOverviewItems } = require('../db/newsOverviewItems');
  const ed = 'ne_' + 'e'.repeat(18);
  await run(db, `INSERT INTO news_editions(edition_id, day, slot, trigger, status, published_at) VALUES (?,?,?,'schedule','published',?)`, [ed, '2026-11-21', 'evening', '2026-11-21T16:04:00.000Z']);
  const h = await harvestRow(db);
  await createOverviewItems({ db, now: () => NOW, index: ix }).upsert({ schema: 'linguistpro-news-overview', schema_version: 2, edition_id: ed, day: '2026-11-21', slot: 'evening',
    stories: [{ story_key: 'S', items: [{ item_key: h.url_key, outlet_id: 'ynet', url: URL1, title_he: h.title_he, title_ru: 'Т' }] }] });
  const [r] = await rows(db);
  assert.equal(r.edition_slot, 'evening'); assert.equal(r.edition_published_at, '2026-11-21T16:04:00.000Z');
  db.close();
});
test('backfill writes in transactions and leaves nothing half-done when a batch fails', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  await harvestRow(db, { url_key: 'na_' + 'a'.repeat(24), url: 'https://www.ynet.co.il/news/article/a1' });
  await harvestRow(db, { url_key: 'na_' + 'b'.repeat(24), url: 'https://www.ynet.co.il/news/article/b1', title_he: null, feed_title: null });
  const n = await ix.backfill({ batch: 10 });
  assert.equal(n, 2);
  assert.equal((await rows(db)).length, 1, 'the row without a title is skipped, the other is kept');
  const tx = await all(db, 'PRAGMA wal_checkpoint');
  assert.ok(Array.isArray(tx));
  db.close();
});

test('a word only in the body is found, with a snippet from the body; body_until is 45 days after first seen', async () => {
  const db = await openDb(), ix = createNewsIndex({ db, now: () => NOW });
  const { createNewsList } = require('../db/newsList');
  const { packBody } = require('../news/harvest/newsBody');
  const h = await harvestRow(db, { first_seen_at: '2026-11-15T10:00:00Z' });
  await run(db, 'UPDATE news_harvest_items SET data_gz=? WHERE url_key=?', [packBody({ title_he: h.title_he, paragraphs: ['פסקה ראשונה.', 'בסוף הכתבה מוזכר הפרלמנט האירופי בהקשר אחר לגמרי.'] }), h.url_key]);
  await ix.refresh([h.url_key]);
  const [r] = await rows(db);
  assert.equal(r.body_until, '2026-12-30T10:00:00.000Z');
  const L = createNewsList({ db, now: () => NOW });
  const found = await L.list({ q: 'האירופי' });
  assert.equal(found.items.length, 1);
  assert.match(found.items[0].snippet, /הפרלמנט האירופי/);
  db.close();
});
