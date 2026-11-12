'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const { createNewsRepo } = require('../db/newsRepo');
const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');

const NOW = Date.parse('2026-11-12T08:00:00+02:00');
const OWNER = { id: 'owner', kind: 'owner' };
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
async function setup(t) {
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  await exec(db, 'PRAGMA foreign_keys=ON');
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '078_news.sql'), 'utf8'));
  t.after(() => new Promise(r => db.close(r)));
  let now = NOW;
  return { db, repo: createNewsRepo({ db, now: () => now }), setNow: v => { now = v; } };
}
const iso = ms => new Date(ms).toISOString().replace('Z', '+00:00');
function article(n, { hoursAgo = 1, outlet = 'ynet', section = 'politics', title = 'כותרת מספר ' + n, heavy = false } = {}) {
  const host = { ynet: 'www.ynet.co.il', walla: 'news.walla.co.il' }[outlet];
  const published = NOW - hoursAgo * 3600 * 1000;
  return fixtureArticle({ source: { outlet_id: outlet, url: `https://${host}/item/${n}`, canonical_url: `https://${host}/item/${n}`, section,
    published_at: iso(published), retrieved_at: iso(published + 60000) },
    learning: { title_he: title, sensitive: { heavy, kinds: heavy ? ['war'] : [] } } });
}

test('runLifecycle: 72h → archive, 6 months → card drops body and works', async t => {
  const { repo, db, setNow } = await setup(t);
  await repo.ingestPack(OWNER, fixturePack([article(1, { hoursAgo: 1 }), article(2, { hoursAgo: 70 }), article(3, { hoursAgo: 100 * 24 })]));
  setNow(NOW + 3 * 3600 * 1000);
  const r1 = await repo.runLifecycle(NOW + 3 * 3600 * 1000);
  assert.deepEqual(r1, { to_archive: 1, to_card: 0 });
  const later = NOW + 90 * 24 * 3600 * 1000;
  const r2 = await repo.runLifecycle(later);
  assert.deepEqual(r2, { to_archive: 1, to_card: 1 });
  const card = await get(db, "SELECT body_json, tier, article_id FROM news_articles WHERE tier='card'");
  assert.equal(card.body_json, null);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_works WHERE article_id=?', [card.article_id])).n, 0);
  assert.deepEqual(await repo.runLifecycle(later), { to_archive: 0, to_card: 0 });
});
test('fresh feed is newest first, paginates, never shows withdrawn', async t => {
  const { repo } = await setup(t);
  const items = Array.from({ length: 60 }, (_, i) => article(i + 1, { hoursAgo: 1 + i / 2 }));
  const r = await repo.ingestPack(OWNER, fixturePack(items));
  await repo.withdrawArticle(OWNER, r.items[0].article_id, 'x');
  const p1 = await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh', limit: 50 });
  assert.equal(p1.items.length, 50); assert.ok(p1.next_cursor);
  assert.ok(p1.items.every((c, i) => i === 0 || c.published_at <= p1.items[i - 1].published_at));
  const p2 = await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh', limit: 50, cursor: p1.next_cursor });
  assert.equal(p2.items.length, 9); assert.equal(p2.next_cursor, null);
  const ids = new Set([...p1.items, ...p2.items].map(c => c.article_id));
  assert.equal(ids.size, 59); assert.ok(!ids.has(r.items[0].article_id));
  const c = p1.items[0];
  assert.equal(c.outlet_id, 'ynet'); assert.match(c.work_id, /^na_[0-9a-f]{24}\.b1$/); assert.match(c.snapshot_sha256, /^[0-9a-f]{64}$/);
  assert.equal(c.readable, true); assert.equal(c.original_url, 'https://www.ynet.co.il/item/2');
  assert.equal(c.image.mode, 'source_link');
});
test('filters: section, outlet, no heavy topics', async t => {
  const { repo } = await setup(t);
  await repo.ingestPack(OWNER, fixturePack([article(1), article(2, { section: 'sport' }), article(3, { outlet: 'walla' }), article(4, { heavy: true })]));
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh' })).items.length, 3);
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh', section: 'sport' })).items.length, 1);
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh', no_heavy: true })).items.length, 2);
  const outlets = await repo.listOutlets();
  assert.equal(outlets.length, 7);
  const ynet = outlets.find(o => o.outlet_id === 'ynet');
  assert.equal(ynet.fresh_count, 3); assert.deepEqual(ynet.sections.map(s => s.section).sort(), ['politics', 'sport']);
  assert.equal(outlets.find(o => o.outlet_id === 'haaretz').fresh_count, 0);
});
test('archive search by title and date range, card items are listed but not readable', async t => {
  const { repo } = await setup(t);
  await repo.ingestPack(OWNER, fixturePack([
    article(1, { hoursAgo: 100, title: 'הַתַּקְצִיב עבר' }), article(2, { hoursAgo: 200, title: 'בחירות בקרוב' }), article(3, { hoursAgo: 24 * 300, title: 'ישן מאוד' })]));
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'archive' })).items.length, 3);
  const q = await repo.listFeed({ outlet_id: 'ynet', tier: 'archive', q: 'התקציב' });
  assert.deepEqual(q.items.map(c => c.title_he), ['הַתַּקְצִיב עבר']);
  const range = await repo.listFeed({ outlet_id: 'ynet', tier: 'archive', from: '2026-11-03', to: '2026-11-07' });
  assert.deepEqual(range.items.map(c => c.title_he), ['בחירות בקרוב']);
  const card = (await repo.listFeed({ outlet_id: 'ynet', tier: 'archive', q: 'ישן' })).items[0];
  assert.equal(card.readable, false); assert.equal(card.work_id, null);
});
test('getWork serves the public-work shape; card and withdrawn are not readable; getCard sees tiers', async t => {
  const { repo } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([article(1), article(2, { hoursAgo: 24 * 300 })]));
  const work = await repo.getWork('ynet', r.items[0].work_id);
  assert.equal(work.corpus.slug, 'news-ynet'); assert.equal(work.edition.item_count, 1);
  assert.equal(work.item.public_work_id, r.items[0].work_id); assert.equal(work.item.public_read_allowed, 1);
  assert.equal(work.item.snapshot.library.texts[0].source_meta.news.outlet_id, 'ynet');
  await assert.rejects(repo.getWork('walla', r.items[0].work_id), /NEWS_NOT_FOUND/);
  await assert.rejects(repo.getWork('ynet', r.items[1].article_id + '.b1'), /NEWS_NOT_FOUND/);
  await repo.withdrawArticle(OWNER, r.items[0].article_id, 'x');
  await assert.rejects(repo.getWork('ynet', r.items[0].work_id), /NEWS_NOT_FOUND/);
  assert.equal((await repo.getCard(r.items[0].work_id)).tier, 'withdrawn');
  assert.equal(await repo.getCard('na_' + '0'.repeat(24) + '.b1'), null);
});
test('getWork payload passes the real public-corpus adapter the Room uses', async t => {
  const Adapter = require('../public/js/public-corpus-adapter');
  const { repo } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([article(1)]));
  const work = await repo.getWork('ynet', r.items[0].work_id);
  const bundle = Adapter.prepareImportBundle({ ok: true, schema_version: 'public_corpus_work.1.0.0', ...work });
  const text = bundle.library.texts[0];
  assert.equal(text.text_key, Adapter.localTextKey('news-ynet', r.items[0].work_id, work.item.snapshot_sha256));
  assert.equal(text.source_meta.news.outlet_id, 'ynet');
  assert.equal(text.source_meta.public_corpus.public_work_id, r.items[0].work_id);
});
test('journal lists packs newest first', async t => {
  const { repo } = await setup(t);
  await repo.ingestPack(OWNER, fixturePack([article(1)]));
  const j = await repo.journal({ limit: 10 });
  assert.equal(j.packs.length, 1); assert.equal(j.packs[0].totals.published, 1); assert.equal(j.packs[0].producer.name, 'dot');
  assert.ok(j.events.length >= 1);
});
test('review fix: fresh feed and counts follow published_at even if the lifecycle job has not run', async t => {
  const { repo, setNow } = await setup(t);
  await repo.ingestPack(OWNER, fixturePack([article(1, { hoursAgo: 1 })]));
  setNow(NOW + 80 * 3600 * 1000);
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'fresh' })).items.length, 0);
  assert.equal((await repo.listFeed({ outlet_id: 'ynet', tier: 'archive' })).items.length, 1);
  assert.equal((await repo.listOutlets()).find(o => o.outlet_id === 'ynet').fresh_count, 0);
});
test('review fix: a withdrawn card exposes nothing but its tier', async t => {
  const { repo } = await setup(t);
  const r = await repo.ingestPack(OWNER, fixturePack([article(1)]));
  await repo.withdrawArticle(OWNER, r.items[0].article_id, 'x');
  assert.deepEqual(await repo.getCard(r.items[0].work_id), { article_id: r.items[0].article_id, tier: 'withdrawn', readable: false });
});
