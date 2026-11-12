'use strict';
// «В архив» / «Удалить» (корзина 30 дней) — owner decision 2026-11-13.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const { createNewsRepo } = require('../db/newsRepo');
const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');

const NOW = Date.parse('2026-11-12T08:00:00+02:00');
const DAY = 24 * 3600 * 1000;
const OWNER = { id: 'owner', kind: 'owner' };
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
async function setup(t) {
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  await exec(db, 'PRAGMA foreign_keys=ON');
  for (const m of ['078_news.sql', '079_news_manage.sql']) await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', m), 'utf8'));
  t.after(() => new Promise(r => db.close(r)));
  let now = NOW;
  return { db, repo: createNewsRepo({ db, now: () => now }), setNow: v => { now = v; } };
}
const iso = ms => new Date(ms).toISOString().replace('Z', '+00:00');
const article = (n, hoursAgo = 1) => fixtureArticle({ source: { url: 'https://www.ynet.co.il/item/' + n, canonical_url: 'https://www.ynet.co.il/item/' + n,
  published_at: iso(NOW - hoursAgo * 3600e3), retrieved_at: iso(NOW - hoursAgo * 3600e3 + 60e3) }, learning: { title_he: 'כותרת ' + n } });

test('«В архив» moves a fresh article out of the feed into the archive; «Вернуть в ленту» brings it back while young', async t => {
  const { repo } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([article(1)]));
  const id = r.items[0].article_id;
  assert.equal((await repo.archiveArticle(OWNER, id)).tier, 'archive');
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh' })).items.length, 0);
  const inArchive = (await repo.listFeed({ outlet_id: 'ynet', tier: 'archive' })).items;
  assert.equal(inArchive.length, 1); assert.equal(inArchive[0].readable, true);
  assert.equal((await repo.unarchiveArticle(OWNER, id)).tier, 'fresh');
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh' })).items.length, 1);
});
test('an archived article stays archived even though it is young (the hourly job never revives it)', async t => {
  const { repo } = await setup(t);
  const id = (await repo.ingestPack(OWNER, fixturePack([article(1)]))).items[0].article_id;
  await repo.archiveArticle(OWNER, id);
  await repo.runLifecycle(NOW + 3600e3);
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh' })).items.length, 0);
});
test('«Вернуть в ленту» refuses an article older than 72h', async t => {
  const { repo } = await setup(t);
  const id = (await repo.ingestPack(OWNER, fixturePack([article(1, 100)]))).items[0].article_id;
  await assert.rejects(repo.unarchiveArticle(OWNER, id), /NEWS_TOO_OLD_FOR_FEED/);
});
test('«Удалить» hides everywhere but keeps the article; «Восстановить» brings it back readable', async t => {
  const { repo, db } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([article(1)]));
  const { article_id: id, work_id: work } = r.items[0];
  const d = await repo.deleteArticle(OWNER, id);
  assert.equal(d.tier, 'withdrawn'); assert.match(d.purge_at, /^\d{4}-/);
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh' })).items.length, 0);
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'archive' })).items.length, 0);
  await assert.rejects(repo.getWork('ynet', work), /NEWS_NOT_FOUND/);
  assert.ok((await get(db, 'SELECT body_json FROM news_articles WHERE article_id=?', [id])).body_json, 'body kept for restore');
  const back = await repo.restoreArticle(OWNER, id);
  assert.equal(back.tier, 'fresh');
  assert.equal((await repo.getWork('ynet', work)).item.public_work_id, work);
});
test('restoring an old deleted article puts it in the archive, not the feed', async t => {
  const { repo } = await setup(t);
  const id = (await repo.ingestPack(OWNER, fixturePack([article(1, 100)]))).items[0].article_id;
  await repo.deleteArticle(OWNER, id);
  assert.equal((await repo.restoreArticle(OWNER, id)).tier, 'archive');
});
test('the trash is emptied after 30 days by the lifecycle job', async t => {
  const { repo, db } = await setup(t);
  const id = (await repo.ingestPack(OWNER, fixturePack([article(1)]))).items[0].article_id;
  await repo.deleteArticle(OWNER, id);
  assert.equal((await repo.runLifecycle(NOW + 29 * DAY)).purged, 0);
  assert.equal((await repo.runLifecycle(NOW + 31 * DAY)).purged, 1);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_articles')).n, 0);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_works')).n, 0);
  await assert.rejects(repo.restoreArticle(OWNER, id), /NEWS_NOT_FOUND/);
});
test('editor list: feed / archive / deleted views with titles, search and outlet filter', async t => {
  const { repo } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([article(1), article(2), article(3, 100)]));
  await repo.deleteArticle(OWNER, r.items[1].article_id);
  const feed = await repo.listForEditor({ view: 'feed' });
  assert.deepEqual(feed.items.map(c => c.title_he), ['כותרת 1']);
  assert.deepEqual((await repo.listForEditor({ view: 'archive' })).items.map(c => c.title_he), ['כותרת 3']);
  const deleted = (await repo.listForEditor({ view: 'deleted' })).items;
  assert.deepEqual(deleted.map(c => c.title_he), ['כותרת 2']);
  assert.match(deleted[0].purge_at, /^\d{4}-/); assert.equal(deleted[0].title_ru, fixtureArticle().learning.title_ru);
  assert.equal((await repo.listForEditor({ view: 'feed', q: 'כותרת 1' })).items.length, 1);
  assert.equal((await repo.listForEditor({ view: 'feed', outlet_id: 'walla' })).items.length, 0);
});
