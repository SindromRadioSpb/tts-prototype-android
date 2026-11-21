'use strict';
// «Обзор дня» kept by article (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.4).
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../news/newsPackCore');
const { createOverviewItems } = require('../db/newsOverviewItems');
const { openDb } = require('./helpers/newsDb.cjs');

const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const NOW = Date.parse('2026-11-16T18:10:00+02:00');
const ED = { morning: 'ne_' + 'a'.repeat(18), evening: 'ne_' + 'b'.repeat(18) };
const it = (n, extra = {}) => { const url = 'https://www.ynet.co.il/news/article/x' + n; return { item_key: C.articleKey('ynet', C.canonicalizeUrl(url)), outlet_id: 'ynet', url,
  published_at: '2026-11-16T09:00:00+02:00', section: 'politics', title_he: 'כותרת ' + n, title_ru: 'Заголовок ' + n, ...extra }; };
const v2 = (slot, stories) => ({ schema: 'linguistpro-news-overview', schema_version: 2, edition_id: ED[slot], day: '2026-11-16', slot, stories });

async function setup() {
  const db = await openDb();
  for (const [slot, id] of Object.entries(ED)) await run(db, `INSERT INTO news_editions(edition_id, day, slot, trigger, status, published_at) VALUES (?,?,?,'schedule','published',?)`,
    [id, '2026-11-16', slot, slot === 'morning' ? '2026-11-16T05:50:00.000Z' : '2026-11-16T16:04:00.000Z']);
  return { db, ov: createOverviewItems({ db, now: () => NOW }) };
}

test('overview upsert: same item twice keeps one row, translation kept', async () => {
  const { db, ov } = await setup();
  await ov.upsert(v2('morning', [{ story_key: 'S1', items: [it(1, { title_ru: 'Кнессет утвердил бюджет' })] }]), { packId: 'p1' });
  const r = await ov.upsert(v2('evening', [{ story_key: 'S1', items: [it(1, { title_ru: '' })] }]), { packId: 'p2' });
  assert.deepEqual([r.inserted, r.updated, r.kept], [0, 0, 1]);
  const rows = await all(db, 'SELECT * FROM news_overview_items');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title_ru, 'Кнессет утвердил бюджет');
  assert.equal(rows[0].edition_id, ED.morning, 'the edition of first appearance stays');
  db.close();
});
test('overview upsert: a v1 pack of the whole day is split into rows', async () => {
  const { db, ov } = await setup();
  const o = { schema: 'linguistpro-news-overview', schema_version: 1, day: '2026-11-16', stories: [
    { story_key: 'A', main: true, items: [it(1), it(2)] }, { story_key: 'B', items: [it(3)] }, { story_key: 'C', items: [it(4), it(5)] }].map(s => ({ ...s, items: s.items.map(({ item_key, ...x }) => x) })) };
  const r = await ov.upsert(o, { packId: 'p' });
  assert.equal(r.inserted, 5);
  assert.deepEqual((await all(db, 'SELECT DISTINCT edition_id e FROM news_overview_items')).map(x => x.e), [null]);
  db.close();
});
test('overview upsert: the harvested rows are marked done', async () => {
  const { db, ov } = await setup();
  const one = it(1);
  await run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, overview_state) VALUES (?,?,?,?,'ready','sent')`, [one.item_key, 'ynet', one.url, '2026-11-16T07:00:00Z']);
  await ov.upsert(v2('morning', [{ story_key: 'S1', items: [one] }]), { packId: 'p1' });
  assert.equal((await all(db, 'SELECT overview_state s FROM news_harvest_items'))[0].s, 'done');
  db.close();
});
test('overview day: rows of three editions make one day; each row says its edition', async () => {
  const { db, ov } = await setup();
  await ov.upsert(v2('morning', [{ story_key: 'S1', items: [it(1)] }, { story_key: 'S2', items: [it(2)] }, { story_key: 'S3', items: [it(3)] }]), { packId: 'p1' });
  await ov.upsert(v2('evening', [{ story_key: 'S1', items: [it(4, { outlet_id: 'walla', url: 'https://www.walla.co.il/news/israel/1', item_key: C.articleKey('walla', 'https://www.walla.co.il/news/israel/1') })] },
    { story_key: 'S4', items: [it(5)] }]), { packId: 'p2' });
  const d = await ov.day('2026-11-16');
  assert.equal(d.day, '2026-11-16');
  assert.deepEqual(d.editions.map(e => e.slot), ['morning', 'evening']);
  const s1 = d.stories.find(s => s.story_key === 'S1');
  assert.equal(s1.items.length, 2);
  assert.deepEqual(s1.items.map(x => x.edition_slot).sort(), ['evening', 'morning']);
  assert.equal(s1.items.find(x => x.edition_slot === 'evening').edition_published_at, '2026-11-16T16:04:00.000Z');
  assert.equal(d.stories[0].story_key, 'S1', 'two outlets first');
  db.close();
});
test('overview day: a day before 3.11.894 is read from news_overviews', async () => {
  const { db, ov } = await setup();
  const body = { day: '2026-11-14', stories: [{ story_key: 'old', main: true, items: [{ outlet_id: 'ynet', url: 'https://www.ynet.co.il/news/article/o1', title_he: 'ישן', title_ru: 'Старое' }] }] };
  await run(db, `INSERT INTO news_overviews(day, pack_id, body_json, stories, items, created_at, updated_at) VALUES ('2026-11-14','p',?,1,1,'t','2026-11-14T06:00:00Z')`, [JSON.stringify(body)]);
  const d = await ov.day('2026-11-14');
  assert.equal(d.stories[0].items[0].title_ru, 'Старое');
  assert.equal(d.next, null);
  assert.equal((await ov.day('2026-11-16')), null, 'no rows for the 16th yet');
  await ov.upsert(v2('morning', [{ story_key: 'S1', items: [it(1)] }]), { packId: 'p1' });
  assert.equal((await ov.day('2026-11-14')).next, '2026-11-16');
  assert.equal((await ov.day(null)).day, '2026-11-16', 'no day → the latest');
  db.close();
});
test('validateOverview: v2 needs edition_id and a matching item_key', () => {
  assert.equal(C.validateOverview({ ...v2('morning', [{ story_key: 'S', items: [it(1)] }]), edition_id: 'x' }).code, 'OVERVIEW_INVALID');
  assert.equal(C.validateOverview(v2('morning', [{ story_key: 'S', items: [it(1, { item_key: 'na_' + '0'.repeat(24) })] }])).code, 'OVERVIEW_ITEM_INVALID');
  assert.equal(C.validateOverview(v2('morning', [{ story_key: 'S', items: [it(1)] }])).ok, true);
});
test('repo: a pack with a v2 overview adds rows; getOverview assembles the day and links the readable article', async () => {
  const AdmZip = require('adm-zip');
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await openDb();
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00') });
  const art = fixtureArticle();
  const url = art.source.canonical_url;
  const o = { schema: 'linguistpro-news-overview', schema_version: 2, edition_id: ED.morning, day: '2026-11-12', slot: 'morning', stories: [{ story_key: 'K', items: [
    { item_key: C.articleKey(art.source.outlet_id, C.canonicalizeUrl(url)), outlet_id: art.source.outlet_id, url, section: 'politics', title_he: 'כותרת ראשית', title_ru: 'Главный' }] }] };
  const zip = new AdmZip(fixturePack([art])), buf = Buffer.from(JSON.stringify(o)), manifest = JSON.parse(zip.readAsText('manifest.json'));
  manifest.overview = { path: 'overview.json', sha256: C.sha256(buf) };
  zip.addFile('overview.json', buf); zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, zip.toBuffer());
  assert.equal(receipt.overview.inserted, 1);
  const got = await repo.getOverview('2026-11-12');
  assert.equal(got.stories[0].main, true);
  assert.match(got.stories[0].items[0].work_id, /^na_[0-9a-f]{24}\.b1$/);
  db.close();
});
test('review: a day with an old overview body and new rows shows both', async () => {
  const { db, ov } = await setup();
  const old = { day: '2026-11-16', stories: [{ story_key: 'old', main: true, items: [{ outlet_id: 'ynet', url: 'https://www.ynet.co.il/news/article/o1', title_he: 'ישן', title_ru: 'Старое' }, it(1, { item_key: undefined })] }] };
  await run(db, `INSERT INTO news_overviews(day, pack_id, body_json, stories, items, created_at, updated_at) VALUES ('2026-11-16','p',?,1,2,'t','2026-11-16T06:00:00Z')`, [JSON.stringify(old)]);
  await ov.upsert(v2('evening', [{ story_key: 'S1', items: [it(1)] }, { story_key: 'S2', items: [it(2)] }]), { packId: 'p2' });
  const d = await ov.day('2026-11-16');
  const titles = d.stories.flatMap(s => s.items.map(x => x.title_he)).sort();
  assert.deepEqual(titles, ['ישן', 'כותרת 1', 'כותרת 2'], 'the old body is merged, the row that is in both is shown once');
  db.close();
});

// Findability W1 (docs/superpowers/specs/2026-11-21-news-findability-design.md): study first, then freshness; rubric does not order.
const { freshness, sortStories } = require('../db/newsOverviewItems');
const at = h => '2026-11-16T' + h + ':00.000Z';
test('overview day: stories with a study article come first, then by freshness, rubric ignored', () => {
  const s = (key, section, h, work) => ({ story_key: key, items: [{ outlet_id: 'ynet', section, published_at: at(h), ...(work ? { work_id: 'w' } : {}) }] });
  const out = sortStories([s('sec', 'security', '17:00', false), s('pol', 'politics', '08:00', true), s('cul', 'culture', '16:00', true)]);
  assert.deepEqual(out.map(x => x.story_key), ['cul', 'pol', 'sec']);
  assert.deepEqual(out.map(x => x.main), [true, true, false]);
});
test('overview day: items inside a story — study ones first, then freshness by changed_at/edition time', () => {
  const a = { item_key: 'a', published_at: at('10:00') }, b = { item_key: 'b', published_at: at('09:00'), changed_at: at('12:00') },
    c = { item_key: 'c', published_at: at('08:00'), edition_published_at: at('11:00') }, w = { item_key: 'w', published_at: at('07:00'), work_id: 'x' };
  assert.equal(freshness(b), Date.parse(at('12:00')));
  const [one] = sortStories([{ story_key: 'S', items: [a, b, c, w] }]);
  assert.deepEqual(one.items.map(x => x.item_key), ['w', 'b', 'c', 'a']);
});
test('overview day: selected_by from the harvest row is on the item', async () => {
  const { db, ov } = await setup();
  const one = it(1);
  await run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, selected_by) VALUES (?,?,?,?,'ready','dot')`, [one.item_key, 'ynet', one.url, '2026-11-16T07:00:00Z']);
  await ov.upsert(v2('morning', [{ story_key: 'S1', items: [one, it(2)] }]), { packId: 'p1' });
  const items = (await ov.day('2026-11-16')).stories[0].items;
  assert.equal(items.find(x => x.item_key === one.item_key).selected_by, 'dot');
  assert.equal(items.find(x => x.item_key !== one.item_key).selected_by, undefined);
  db.close();
});
