'use strict';
// Tags, ★ and reads (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.6, п.9, §8а п.1, п.4, п.5).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsMarks, validTag } = require('../db/newsMarks');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');
const { createNewsIndex } = require('../db/newsIndex');
const { packBody } = require('../news/harvest/newsBody');
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const NOW = Date.parse('2026-11-21T12:00:00Z');
const OWNER = { id: 'u1', kind: 'owner' }, USER = { id: 'u2', kind: 'user' };
const K = n => 'na_' + String(n).padStart(24, '0');
const SRC = n => 'https://ynet-pic1.yit.co.il/picserver6/crop_images/' + n + '.jpg';

async function setup(t) {
  const db = await openDb(), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-marks-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const photos = {};
  const marks = createNewsMarks({ db, now: () => NOW, photoOf: async src => photos[src] || null });
  return { db, dataDir, marks, photos };
}
async function slice(db, n, { daysAgo = 1, story = null, images = [] } = {}) {
  await run(db, `INSERT INTO news_harvest_items(url_key, canonical_key, outlet_id, url, first_seen_at, status, title_he, full_ok, data_gz, story_key) VALUES (?,?,?,?,?,'ready',?,1,?,?)`,
    [K(n), K(n), 'ynet', 'https://www.ynet.co.il/news/article/' + n, new Date(NOW - daysAgo * 86400000).toISOString(), 'כותרת ' + n,
      packBody({ title_he: 'כותרת ' + n, paragraphs: ['מילה' + n + ' בטקסט.'], images }), story]);
}

test('validTag: 1–40 characters, ★ reserved for favourites, no control characters or leading #', () => {
  assert.equal(validTag(' выборы '), 'выборы'); assert.equal(validTag('★'), '★');
  for (const bad of ['', '   ', '#x', 'a'.repeat(41), 'a\u0000b', null]) assert.equal(validTag(bad), null, String(bad));
});
test('owner star pins body and photos', async t => {
  const { db, marks, photos } = await setup(t);
  photos[SRC(1)] = Buffer.from('JPEG1');
  await slice(db, 1, { images: [{ src: SRC(1), role: 'hero' }] });
  await marks.mark(OWNER, K(1), '★');
  assert.deepEqual((await all(db, 'SELECT source FROM news_pins WHERE item_key=?', [K(1)])).map(r => r.source), ['item']);
  const [img] = await all(db, 'SELECT name, mime, bytes FROM news_pin_images WHERE item_key=?', [K(1)]);
  assert.equal(img.name, 'img-1.jpg'); assert.equal(Buffer.from(img.bytes).toString(), 'JPEG1');
  assert.deepEqual((await marks.marksFor(OWNER.id, [K(1)])).get(K(1)), ['★']);
});
test('pinned article survives 3/45-day cleanup and stays searchable', async t => {
  const { db, dataDir, marks } = await setup(t);
  await slice(db, 1, { daysAgo: 50 }); await slice(db, 2, { daysAgo: 50 });
  await marks.mark(OWNER, K(1), 'выборы');
  const index = createNewsIndex({ db, now: () => NOW });
  await index.refresh([K(1), K(2)]);
  await createNewsHarvester({ db, dataDir, now: () => NOW, index, fetchImpl: async () => { throw new Error('offline'); } }).cleanup();
  const left = await all(db, 'SELECT url_key, data_gz IS NOT NULL body FROM news_harvest_items ORDER BY url_key');
  assert.deepEqual(left.map(r => [r.url_key, r.body]), [[K(1), 1]], 'the unmarked one is gone, the marked one keeps its text');
  assert.deepEqual((await all(db, 'SELECT item_key FROM news_index')).map(r => r.item_key), [K(1)]);
  assert.equal((await all(db, "SELECT rowid FROM news_search WHERE news_search MATCH ?", ['"מילה1"*'])).length, 1);
});
test('story tag pins texts without photos', async t => {
  const { db, marks, photos } = await setup(t);
  photos[SRC(3)] = Buffer.from('JPEG3');
  await slice(db, 3, { story: 'S9', images: [{ src: SRC(3), role: 'hero' }] }); await slice(db, 4, { story: 'S9' });
  await marks.mark(OWNER, 'story:S9', 'тема');
  assert.deepEqual((await all(db, 'SELECT item_key, source FROM news_pins ORDER BY item_key')).map(r => [r.item_key, r.source]), [[K(3), 'story:S9'], [K(4), 'story:S9']]);
  assert.equal((await all(db, 'SELECT 1 FROM news_pin_images')).length, 0);
});
test('last unmark removes the pin; another mark keeps it', async t => {
  const { db, marks, photos } = await setup(t);
  photos[SRC(5)] = Buffer.from('J');
  await slice(db, 5, { images: [{ src: SRC(5), role: 'hero' }] });
  await marks.mark(OWNER, K(5), '★'); await marks.mark(OWNER, K(5), 'экономика');
  await marks.unmark(OWNER, K(5), '★');
  assert.equal((await all(db, 'SELECT 1 FROM news_pins')).length, 1, 'still tagged');
  await marks.unmark(OWNER, K(5), 'экономика');
  assert.equal((await all(db, 'SELECT 1 FROM news_pins')).length, 0);
  assert.equal((await all(db, 'SELECT 1 FROM news_pin_images')).length, 0);
});
test("another user's star does not pin; tags are per user", async t => {
  const { db, marks } = await setup(t);
  await slice(db, 6);
  await marks.mark(USER, K(6), '★'); await marks.mark(USER, K(6), 'мои');
  assert.equal((await all(db, 'SELECT 1 FROM news_pins')).length, 0);
  assert.deepEqual(await marks.tags(USER.id), [{ tag: 'мои', n: 1 }, { tag: '★', n: 1 }]);
  assert.deepEqual(await marks.tags(OWNER.id), []);
});
test('reads: per user, a set for the keys asked', async t => {
  const { marks } = await setup(t);
  await marks.read(USER.id, K(7));
  assert.deepEqual([...(await marks.readSet(USER.id, [K(7), K(8)]))], [K(7)]);
  assert.equal((await marks.readSet(OWNER.id, [K(7)])).size, 0);
});
test('per-user caps: marks, distinct tags, reads (review W4 I3)', async t => {
  const db = await openDb();
  t.after(() => db.close());
  const marks = createNewsMarks({ db, now: () => NOW, limits: { marks: 3, tags: 2, reads: 2 } });
  assert.equal(await marks.mark(USER, K(1), 'a'), true);
  assert.equal(await marks.mark(USER, K(2), 'b'), true);
  await assert.rejects(marks.mark(USER, K(3), 'c'), e => e.code === 'NEWS_MARKS_LIMIT' && e.status === 409, 'a third distinct tag');
  assert.equal(await marks.mark(USER, K(3), 'a'), true);
  await assert.rejects(marks.mark(USER, K(4), 'a'), e => e.code === 'NEWS_MARKS_LIMIT', 'a fourth mark');
  assert.equal(await marks.mark(USER, K(1), 'a'), true, 'the same mark again is not new');
  for (const n of [5, 6, 7]) await marks.read(USER.id, K(n));
  assert.deepEqual([...(await marks.readSet(USER.id, [K(5), K(6), K(7)]))].sort(), [K(6), K(7)], 'the oldest read goes');
});
