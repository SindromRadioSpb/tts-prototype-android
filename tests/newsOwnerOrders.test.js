'use strict';
// The owner's orders for dot (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.7, §7.2, §7.4).
const test = require('node:test'), assert = require('node:assert/strict');
const { openDb } = require('./helpers/newsDb.cjs');
const { createOwnerOrders } = require('../news/newsOwnerOrders');
const { createNewsMarks } = require('../db/newsMarks');
const { packBody } = require('../news/harvest/newsBody');
const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const NOW = Date.parse('2026-11-21T12:00:00Z');
const OWNER = { id: 'u1', kind: 'owner' }, DOT = { id: 'editor:e1', kind: 'editor' };
const K = n => 'na_' + String(n).padStart(24, '0');

async function setup(t) {
  const db = await openDb();
  t.after(() => db.close());
  const marks = createNewsMarks({ db, now: () => NOW });
  return { db, marks, orders: createOwnerOrders({ db, now: () => NOW, marks }) };
}
async function slice(db, n, { day = '2026-11-21', body = true, paywalled = 0, full = 1, edition = 'ne_' + 'a'.repeat(18) } = {}) {
  await run(db, `INSERT INTO news_harvest_items(url_key, canonical_key, outlet_id, url, first_seen_at, status, title_he, full_ok, paywalled, data_gz, edition_id) VALUES (?,?,?,?,?,'ready',?,?,?,?,?)`,
    [K(n), K(n), 'ynet', 'https://www.ynet.co.il/news/article/' + n, day + 'T08:00:00.000Z', 'כותרת ' + n, full, paywalled, body ? packBody({ paragraphs: ['טקסט.'] }) : null, edition]);
  await run(db, `INSERT INTO news_index(item_key, day, outlet_id, fresh_at, kind, title_he, updated_at) VALUES (?,?,?,?,?,?,?)`, [K(n), day, 'ynet', day + 'T08:00:00.000Z', 'slice', 'כותרת ' + n, 't']);
}

test('order a slice article', async t => {
  const { db, orders } = await setup(t);
  await slice(db, 1);
  const r = await orders.orderArticle(OWNER, { item_key: K(1), note_ru: 'Выбор владельца' });
  assert.equal(r.created.length, 1); assert.deepEqual(r.skipped, []);
  const [o] = await orders.list({ status: 'open' });
  assert.deepEqual([o.item_key, o.status, o.note_ru, o.edition_id, o.created_by], [K(1), 'open', 'Выбор владельца', 'ne_' + 'a'.repeat(18), 'u1']);
  assert.match(o.order_id, /^noo_[0-9a-f]{24}$/);
});
test('tag order expands to articles of the tag in the day range, capped at 50', async t => {
  const { db, marks, orders } = await setup(t);
  for (const [n, day] of [[1, '2026-11-20'], [2, '2026-11-21'], [3, '2026-11-10']]) { await slice(db, n, { day }); await marks.mark(OWNER, K(n), 'выборы'); }
  const r = await orders.orderTag(OWNER, { tag: 'выборы', from: '2026-11-20', to: '2026-11-21', note_ru: 'По тегу' });
  assert.deepEqual(r.created.map(o => o.item_key).sort(), [K(1), K(2)]);
  assert.equal((await all(db, 'SELECT tag, day_from, day_to FROM news_owner_orders'))[0].tag, 'выборы');
  for (let n = 10; n < 61; n++) { await slice(db, n); await marks.mark(OWNER, K(n), 'много'); }
  await assert.rejects(orders.orderTag(OWNER, { tag: 'много', from: '2026-11-21', to: '2026-11-21', note_ru: 'x' }), e => e.code === 'ORDER_TOO_BIG' && e.status === 400);
  assert.equal((await all(db, "SELECT 1 FROM news_owner_orders WHERE tag='много'")).length, 0, 'nothing half-created');
});
test('duplicate, already-learning, paywalled and expired are skipped with reasons', async t => {
  const { db, orders } = await setup(t);
  await slice(db, 1); await slice(db, 2, { paywalled: 1 }); await slice(db, 3, { body: false });
  await orders.orderArticle(OWNER, { item_key: K(1), note_ru: 'a' });
  const again = await orders.orderArticle(OWNER, { item_key: K(1), note_ru: 'a' });
  assert.deepEqual(again.skipped, [{ item_key: K(1), reason: 'ALREADY_ORDERED' }]);
  assert.equal((await orders.orderArticle(OWNER, { item_key: K(2), note_ru: 'a' })).skipped[0].reason, 'NO_FULL_TEXT');
  assert.equal((await orders.orderArticle(OWNER, { item_key: K(3), note_ru: 'a' })).skipped[0].reason, 'SOURCES_EXPIRED');
  await run(db, "UPDATE news_index SET kind='learn', work_id='w' WHERE item_key=?", [K(2)]);
  assert.equal((await orders.orderArticle(OWNER, { item_key: K(2), note_ru: 'a' })).skipped[0].reason, 'ALREADY_LEARNING');
  await assert.rejects(orders.orderArticle(OWNER, { item_key: K(1), note_ru: '' }), e => e.code === 'NOTE_REQUIRED');
});
test('dot takes an order, fails it with a reason; another order closes when its article is published', async t => {
  const { db, orders } = await setup(t);
  await slice(db, 1); await slice(db, 2);
  const [a] = (await orders.orderArticle(OWNER, { item_key: K(1), note_ru: 'a' })).created;
  const [b] = (await orders.orderArticle(OWNER, { item_key: K(2), note_ru: 'b' })).created;
  const taken = await orders.take(DOT, a.order_id);
  assert.equal(taken.status, 'taken'); assert.equal(taken.attempts, 1);
  await orders.fail(DOT, a.order_id, 'Слишком короткий текст');
  assert.equal((await orders.get(a.order_id)).reason, 'Слишком короткий текст');
  await orders.setArchiveOrder(b.order_id, 'nso_' + 'f'.repeat(32));
  await orders.onPublished([K(2)]);
  const done = await orders.get(b.order_id);
  assert.equal(done.status, 'done');
  const map = await orders.forItems([K(1), K(2)]);
  assert.deepEqual([map.get(K(1)).status, map.get(K(2)).status], ['failed', 'done']);
  await assert.rejects(orders.take(DOT, a.order_id), e => e.code === 'ORDER_CLOSED');
});
test('expired body expires the order', async t => {
  const { db, orders } = await setup(t);
  await slice(db, 1);
  const [o] = (await orders.orderArticle(OWNER, { item_key: K(1), note_ru: 'a' })).created;
  await run(db, 'UPDATE news_harvest_items SET data_gz=NULL WHERE url_key=?', [K(1)]);
  assert.equal(await orders.expire(), 1);
  assert.deepEqual([(await orders.get(o.order_id)).status, (await orders.get(o.order_id)).reason], ['expired', 'SOURCES_EXPIRED']);
});
test('repo: an accepted pack closes the owner order of its article (onPublished hook)', async t => {
  const db = await openDb();
  t.after(() => db.close());
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const seen = [];
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00'), onPublished: async ids => { seen.push(...ids); } });
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  assert.deepEqual(seen, [receipt.items[0].article_id]);
});
test('review W5 I1: a failed take goes back to the queue; a stale take reopens; a published article closes on the hourly pass', async t => {
  const { db, orders } = await setup(t);
  await slice(db, 1); await slice(db, 2); await slice(db, 3);
  const [a] = (await orders.orderArticle(OWNER, { item_key: K(1), note_ru: 'a' })).created;
  await orders.take(DOT, a.order_id); await orders.noteError(a.order_id, 'ARCHIVE_PHOTOS_UNAVAILABLE');
  assert.deepEqual([(await orders.get(a.order_id)).status, (await orders.get(a.order_id)).reason], ['open', 'ARCHIVE_PHOTOS_UNAVAILABLE']);
  const [b] = (await orders.orderArticle(OWNER, { item_key: K(2), note_ru: 'b' })).created;
  await orders.take(DOT, b.order_id); await orders.setArchiveOrder(b.order_id, 'nso_' + 'b'.repeat(32));
  await run(db, `INSERT INTO news_archive_orders(article_id, order_id, edition_id, actor_kind, actor_id, url_key, note_ru, created_at, expires_at, draft_sha256) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [K(2), 'nso_' + 'b'.repeat(32), 'owner-order', 'editor', DOT.id, K(2), 'b', '2026-11-21T00:00:00Z', '2026-11-21T06:00:00Z', 'x']);
  const [c] = (await orders.orderArticle(OWNER, { item_key: K(3), note_ru: 'c' })).created;
  await run(db, "UPDATE news_index SET kind='learn' WHERE item_key=?", [K(3)]);
  await orders.expire();
  assert.equal((await orders.get(b.order_id)).status, 'open', 'dot took it 6 h ago and never uploaded');
  assert.equal((await orders.get(c.order_id)).status, 'done', 'the article became a study material anyway');
});
test('review W5 I2: an article an edition holds is skipped as IN_EDITION; a dropped one can be ordered', async t => {
  const { db, orders } = await setup(t);
  await slice(db, 1); await slice(db, 2);
  await run(db, "UPDATE news_harvest_items SET main_state='drafted' WHERE url_key=?", [K(1)]);
  await run(db, "UPDATE news_harvest_items SET main_state='dropped' WHERE url_key=?", [K(2)]);
  assert.equal((await orders.orderArticle(OWNER, { item_key: K(1), note_ru: 'a' })).skipped[0].reason, 'IN_EDITION');
  assert.equal((await orders.orderArticle(OWNER, { item_key: K(2), note_ru: 'b' })).created.length, 1);
});
