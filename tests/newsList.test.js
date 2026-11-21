'use strict';
// GET /api/news/list core (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.2).
const test = require('node:test'), assert = require('node:assert/strict');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsList } = require('../db/newsList');
const { normHe, stemsHe, normRu } = require('../news/newsSearchNorm');

const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const NOW = Date.parse('2026-11-21T12:00:00Z');
let n = 0;
async function row(db, over = {}) {
  n++;
  const r = { item_key: 'na_' + String(n).padStart(24, '0'), day: '2026-11-21', outlet_id: 'ynet', section: 'politics', story_key: 'S' + n, published_at: '2026-11-21T08:00:00Z',
    fresh_at: '2026-11-21T08:00:00.000Z', kind: 'slice', title_he: 'כותרת ' + n, title_ru: 'Заголовок ' + n, lead_he: null, lead_ru: null, updated_at: 't', ...over };
  const cols = Object.keys(r);
  const { lastID } = await run(db, `INSERT INTO news_index(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map(c => r[c]));
  const he = normHe([r.title_he, r.lead_he].filter(Boolean).join(' '));
  await run(db, 'INSERT INTO news_search(rowid, he, stems, ru) VALUES (?,?,?,?)', [lastID, he, stemsHe(he), normRu([r.title_ru, r.lead_ru].filter(Boolean).join(' '))]);
  return r;
}
const setup = async () => { const db = await openDb(); return { db, L: createNewsList({ db, now: () => NOW }) }; };

test('list: learn before slice, each by freshness', async () => {
  const { db, L } = await setup();
  await row(db, { fresh_at: '2026-11-21T10:00:00.000Z', item_key: 'na_s1' + '0'.repeat(19) });
  await row(db, { kind: 'learn', work_id: 'w1', fresh_at: '2026-11-21T07:00:00.000Z', item_key: 'na_l1' + '0'.repeat(19) });
  await row(db, { kind: 'learn', work_id: 'w2', fresh_at: '2026-11-21T09:00:00.000Z', item_key: 'na_l2' + '0'.repeat(19) });
  await row(db, { fresh_at: '2026-11-21T11:00:00.000Z', item_key: 'na_s2' + '0'.repeat(19) });
  const r = await L.list({ day: '2026-11-21' });
  assert.deepEqual(r.items.map(x => x.item_key.slice(0, 5)), ['na_l2', 'na_l1', 'na_s2', 'na_s1']);
  assert.deepEqual(r.counts, { learn: 2, slice: 2 });
  assert.equal(r.items[0].rid, undefined, 'rid stays inside');
  db.close();
});
test('list: outlet filter, section filter and kind', async () => {
  const { db, L } = await setup();
  await row(db, { outlet_id: 'walla' }); await row(db, { outlet_id: 'ynet', section: 'world' }); await row(db, { outlet_id: 'ynet', kind: 'learn', work_id: 'w' });
  assert.equal((await L.list({ day: '2026-11-21', outlet: 'ynet' })).items.length, 2);
  assert.equal((await L.list({ day: '2026-11-21', outlet: 'ynet', section: 'world' })).items.length, 1);
  const learn = await L.list({ day: '2026-11-21', kind: 'learn' });
  assert.equal(learn.items.length, 1); assert.deepEqual(learn.counts, { learn: 1, slice: 2 }, 'counts ignore kind');
  db.close();
});
test('list: q finds by Hebrew title with prefix and by Russian lead, with a snippet', async () => {
  const { db, L } = await setup();
  await row(db, { title_he: 'הבחירות בצ׳ילה', lead_ru: 'Голосование прошло спокойно' });
  await row(db, { title_he: 'מזג האוויר' });
  const he = await L.list({ day: '2026-11-21', q: 'ובבחירות' });
  assert.equal(he.items.length, 1); assert.match(he.items[0].snippet, /בחירות/);
  assert.equal((await L.list({ day: '2026-11-21', q: 'голосование' })).items.length, 1);
  assert.equal((await L.list({ from: '2026-11-01', to: '2026-11-30', q: "צ'ילה", sort: 'match' })).items.length, 1);
  db.close();
});
test('list: page size and cursor', async () => {
  const { db, L } = await setup();
  for (let i = 0; i < 130; i++) await row(db, { fresh_at: new Date(Date.parse('2026-11-21T00:00:00Z') + i * 60000).toISOString(), kind: i % 3 ? 'slice' : 'learn' });
  const seen = new Set(); let cursor = null, pages = [];
  do { const r = await L.list({ day: '2026-11-21', cursor }); pages.push(r.items.length); r.items.forEach(x => seen.add(x.item_key)); cursor = r.next_cursor; } while (cursor);
  assert.deepEqual(pages, [60, 60, 10]); assert.equal(seen.size, 130);
  db.close();
});
test('list: honest empty', async () => {
  const { db, L } = await setup();
  await row(db);
  const r = await L.list({ day: '2026-11-21', q: 'שוםדבר' });
  assert.deepEqual([r.items.length, r.counts.learn, r.counts.slice, r.next_cursor], [0, 0, 0, null]);
  assert.deepEqual(r.range, { from: '2026-10-07', to: '2026-11-21' }, 'the empty answer names where it looked');
  const d = await L.list({ day: '2026-11-21', group: 'opinion' });
  assert.deepEqual([d.items.length, d.day], [0, '2026-11-21']);
  db.close();
});
test('list: no day → the latest day; prev/next skip days without rows for the outlet', async () => {
  const { db, L } = await setup();
  await row(db, { day: '2026-11-18' }); await row(db, { day: '2026-11-19', outlet_id: 'walla' }); await row(db, { day: '2026-11-20' }); await row(db, { day: '2026-11-21', outlet_id: 'walla' });
  const r = await L.list({ outlet: 'ynet' });
  assert.equal(r.day, '2026-11-20'); assert.equal(r.prev, '2026-11-18'); assert.equal(r.next, null);
  db.close();
});
test('list: rubric group filter — politics, and society takes the rest', async () => {
  const { db, L } = await setup();
  await row(db, { section: 'politics' }); await row(db, { section: 'health' }); await row(db, { section: null }); await row(db, { section: 'sport' });
  assert.equal((await L.list({ day: '2026-11-21', group: 'politics' })).items.length, 1);
  assert.equal((await L.list({ day: '2026-11-21', group: 'society' })).items.length, 2);
  assert.equal((await L.list({ day: '2026-11-21', group: 'culture' })).items.length, 1);
  db.close();
});
test('list: study rows carry their card (photo, summary, levels) when the repo gives cards', async () => {
  const db = await openDb();
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00') });
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  const id = receipt.items[0].article_id;
  await row(db, { item_key: id, kind: 'learn', work_id: id + '.b1', day: '2026-11-12' });
  await row(db, { day: '2026-11-12' });
  const L = createNewsList({ db, now: () => NOW, cardsFor: ids => repo.cardsFor(ids) });
  const r = await L.list({ day: '2026-11-12' });
  assert.equal(r.items[0].card.summary_ru, fixtureArticle().learning.summary_ru);
  assert.equal(r.items[0].card.readable, true);
  assert.equal(r.items[1].card, undefined, 'slice rows have no card');
  db.close();
});
test('list: a query without a range searches the last 45 days and says so (review W2 I2)', async () => {
  const { db, L } = await setup();
  await row(db, { day: '2026-11-21', title_he: 'בחירות היום' });
  await row(db, { day: '2026-10-20', title_he: 'בחירות לפני חודש' });
  await row(db, { day: '2026-09-01', title_he: 'בחירות ישנות' });
  const r = await L.list({ q: 'בחירות', day: '2026-11-21' });
  assert.equal(r.items.length, 2); assert.equal(r.day, null);
  assert.deepEqual(r.range, { from: '2026-10-07', to: '2026-11-21' });
  const day = await L.list({ day: '2026-11-21' });
  assert.equal(day.range, null, 'no query → one day');
  db.close();
});
test('list says the index is being built until its first build is done (review W2 I3)', async () => {
  const { db, L } = await setup();
  assert.equal((await L.list({})).building, true);
  await run(db, "INSERT INTO news_settings(key, value_json, updated_at) VALUES ('index_version','1','t')");
  assert.equal((await L.list({})).building, false);
  db.close();
});
test('list reports the day text search starts from when the disk guard shortened it', async () => {
  const { db, L } = await setup();
  assert.equal((await L.list({})).body_search_from, null);
  await run(db, "INSERT INTO news_settings(key, value_json, updated_at) VALUES ('search_horizon', ?, 't')", [JSON.stringify({ from_day: '2026-11-11' })]);
  assert.equal((await L.list({})).body_search_from, '2026-11-11');
  db.close();
});
