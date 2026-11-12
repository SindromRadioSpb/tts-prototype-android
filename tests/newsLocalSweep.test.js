'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const Sweep = require('../public/js/news-local-sweep');

const NOW = Date.parse('2026-11-12T08:00:00+02:00');
const HOUR = 3600 * 1000;
const key = (n, snap = 'a'.repeat(12)) => `public:news-ynet:na_${String(n).repeat(24).slice(0, 24)}.b1:${snap}`;
const meta = hoursAgo => JSON.stringify({ news: { published_at: new Date(NOW - hoursAgo * HOUR).toISOString() } });

async function fakeDb(t) {
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  t.after(() => new Promise(r => db.close(r)));
  const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
  await q('CREATE TABLE texts(id TEXT PRIMARY KEY, text_key TEXT, source_meta_json TEXT, updated_at TEXT)');
  for (const tbl of ['bookmarks', 'sentence_notes', 'text_progress', 'recent_texts']) await q(`CREATE TABLE ${tbl}(text_id TEXT)`);
  await q('CREATE TABLE word_context(text_key TEXT)');
  await q('CREATE TABLE review_log(item_key TEXT)');
  await q('CREATE TABLE sentences(id TEXT, text_id TEXT)');
  await q('CREATE TABLE srs_cards(source_sentence_id TEXT)');
  await q('CREATE TABLE notes_v2(text_id TEXT)');
  await q('CREATE TABLE sync_state(k TEXT PRIMARY KEY, v TEXT)');
  const deleted = [];
  const ldb = {
    dbQuery: q,
    deleteText: async id => { deleted.push(id); await q('DELETE FROM texts WHERE id=?', [id]); },
    getSyncState: async k => ((await q('SELECT v FROM sync_state WHERE k=?', [k]))[0] || {}).v || null,
    setSyncState: async (k, v) => q('INSERT OR REPLACE INTO sync_state(k,v) VALUES(?,?)', [k, v]),
  };
  return { q, ldb, deleted };
}

test('sweep keeps texts with any user state and removes the rest', async t => {
  const { q, ldb, deleted } = await fakeDb(t);
  await q("INSERT INTO texts VALUES('a',?,?,'1'),('b',?,?,'1'),('c',?,?,'1'),('d',?,?,'1'),('e',?,?,'1'),('own','my:1','{}','1')",
    [key(1), meta(100), key(2), meta(100), key(3), meta(2), key(4), meta(100), key(5), meta(100)]);
  await q("INSERT INTO text_progress VALUES('a')"); await q("INSERT INTO recent_texts VALUES('a')"); // reading traces only
  await q("INSERT INTO bookmarks VALUES('b')");
  await q('INSERT INTO word_context VALUES(?)', [key(4)]);
  await q('INSERT INTO review_log VALUES(?)', ['sent:' + key(5) + '#3#t1']);
  const r = await Sweep.run(ldb, { now: NOW });
  assert.deepEqual(r, { removed: 1, kept: 4 });
  assert.deepEqual(deleted, ['a']);
});
test('superseded revision copy without user state is removed, even while fresh', async t => {
  const { q, ldb, deleted } = await fakeDb(t);
  await q("INSERT INTO texts VALUES('old',?,?,'2026-11-12 05:00:00'),('new',?,?,'2026-11-12 06:00:00')",
    [key(1, 'a'.repeat(12)), meta(1), key(1, 'b'.repeat(12)), meta(1)]);
  assert.deepEqual(await Sweep.run(ldb, { now: NOW }), { removed: 1, kept: 1 });
  assert.deepEqual(deleted, ['old']);
});
test('the open text and texts with unreadable metadata are kept; missing tables mean keep', async t => {
  const { q, ldb } = await fakeDb(t);
  await q("INSERT INTO texts VALUES('open',?,?,'1'),('nometa',?,'not json','1')", [key(1), meta(100), key(2)]);
  assert.deepEqual(await Sweep.run(ldb, { now: NOW, keepIds: ['open'] }), { removed: 0, kept: 2 });
  const broken = { ...ldb, dbQuery: async (sql, p) => { if (/FROM bookmarks/.test(sql)) throw new Error('boom'); return ldb.dbQuery(sql, p); } };
  await q("INSERT INTO texts VALUES('x',?,?,'1')", [key(3), meta(100)]);
  assert.equal((await Sweep.run(broken, { now: NOW, keepIds: ['open'] })).removed, 0);
});
test('maybeRun runs at most once a day', async t => {
  const { q, ldb } = await fakeDb(t);
  await q("INSERT INTO texts VALUES('a',?,?,'1')", [key(1), meta(100)]);
  assert.deepEqual(await Sweep.maybeRun(ldb, { now: NOW }), { removed: 1, kept: 0 });
  assert.equal(await Sweep.maybeRun(ldb, { now: NOW + HOUR }), null);
  assert.ok(await Sweep.maybeRun(ldb, { now: NOW + 25 * HOUR }));
});

test('review fix: unreviewed sentence cards and v2 notes keep the copy', async t => {
  const { q, ldb, deleted } = await fakeDb(t);
  await q("INSERT INTO texts VALUES('a',?,?,'1'),('b',?,?,'1')", [key(1), meta(100), key(2), meta(100)]);
  await q("INSERT INTO sentences VALUES('s1','a')"); await q("INSERT INTO srs_cards VALUES('s1')");
  await q("INSERT INTO notes_v2 VALUES('b')");
  assert.deepEqual(await Sweep.run(ldb, { now: NOW }), { removed: 0, kept: 2 });
  assert.deepEqual(deleted, []);
});
