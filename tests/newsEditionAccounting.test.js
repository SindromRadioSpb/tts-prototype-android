'use strict';
// Edition accounting, the rework queue and the editions API (docs/superpowers/specs/2026-11-15-news-editions-design.md §5.3, §5.8, §5.9).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const express = require('express');
const C = require('../news/newsPackCore');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');
const { mountNewsRoutes } = require('../news/newsRoutes');

const run = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const get = (db, sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
const ED = 'ne_' + '1'.repeat(18), ED2 = 'ne_' + '2'.repeat(18);
const url = n => 'https://www.ynet.co.il/news/article/r' + n;
const key = n => C.articleKey('ynet', C.canonicalizeUrl(url(n)));

async function setup(t, { now = Date.parse('2026-11-16T12:00:00+02:00') } = {}) {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-acc-'));
  const clock = { now };
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const h = createNewsHarvester({ db, dataDir, sources: [], delayMs: 0, now: () => clock.now, fetchImpl: async () => new Response('', { status: 404 }) });
  return { db, h, clock, dataDir };
}
async function edition(db, id, { slot = 'midday', status = 'downloaded', day = '2026-11-16', cutoff = '2026-11-16T08:30:00Z', ready = '2026-11-16T10:00:00Z', lease = '2026-11-16T14:00:00Z', file = null } = {}) {
  await run(db, `INSERT INTO news_editions(edition_id, day, slot, trigger, status, cutoff_at, target_ready_at, cut_at, archive_ready_at, lease_until, file_name)
    VALUES (?,?,?,'schedule',?,?,?,?,?,?,?)`, [id, day, slot, status, cutoff, ready, cutoff, cutoff, lease, file]);
}
async function drafted(db, n, editionId, extra = {}) {
  await run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, story_key, main_state, main_edition_id, main_attempts, main_reason, data_json)
    VALUES (?,?,?,?,'ready',?,'drafted',?,?,?,?)`, [key(n), 'ynet', url(n), '2026-11-16T07:00:00Z', 'S' + n, editionId, extra.attempts || 0, extra.reason || null, '{}']);
}
const state = async (db, n) => get(db, 'SELECT main_state, main_attempts, main_reason FROM news_harvest_items WHERE url_key=?', [key(n)]);

test('attempts: absent articles count only when the edition closes', async t => {
  const { db, h } = await setup(t);
  await edition(db, ED);
  for (const n of [1, 2, 3]) await drafted(db, n, ED);
  await h.accountPack({ edition_id: ED, items: [{ status: 'published', article_id: key(1) }], rejected: [], overview: false });
  await h.accountPack({ edition_id: ED, items: [{ status: 'published', article_id: key(2) }], rejected: [], overview: false });
  assert.deepEqual(await state(db, 3), { main_state: 'drafted', main_attempts: 0, main_reason: null });
  assert.equal((await state(db, 1)).main_state, 'published');
  await h.closeEdition(ED);
  assert.deepEqual(await state(db, 3), { main_state: 'drafted', main_attempts: 1, main_reason: 'SKIPPED' });
  const e = await get(db, 'SELECT status, published_count, published_at, closed_at FROM news_editions WHERE edition_id=?', [ED]);
  assert.equal(e.status, 'partial'); assert.equal(e.published_count, 2); assert.ok(e.published_at); assert.ok(e.closed_at);
});
test('attempts: no pack at all — nothing counts, the drafts carry over', async t => {
  const { db, h } = await setup(t);
  await edition(db, ED);
  await drafted(db, 1, ED);
  await h.closeEdition(ED);
  assert.deepEqual(await state(db, 1), { main_state: 'drafted', main_attempts: 0, main_reason: null });
});
test('rework: rejected twice → dropped, stays in the overview', async t => {
  const { db, h } = await setup(t);
  await edition(db, ED); await edition(db, ED2, { slot: 'evening' });
  await drafted(db, 1, ED);
  await h.accountPack({ edition_id: ED, items: [], rejected: [{ outlet_id: 'ynet', canonical_url: url(1), code: 'STUDY_LAYER_INVALID' }], overview: true });
  assert.deepEqual(await state(db, 1), { main_state: 'drafted', main_attempts: 1, main_reason: 'STUDY_LAYER_INVALID' });
  await h.closeEdition(ED);
  assert.equal((await state(db, 1)).main_attempts, 1, 'a refused article is not counted again as skipped');
  await run(db, 'UPDATE news_harvest_items SET main_edition_id=? WHERE url_key=?', [ED2, key(1)]);
  await h.accountPack({ edition_id: ED2, items: [{ status: 'rejected', code: 'IMAGE_CHANGED', article_id: key(1) }], rejected: [], overview: false });
  assert.deepEqual(await state(db, 1), { main_state: 'dropped', main_attempts: 2, main_reason: 'IMAGE_CHANGED' });
});
test('an edition where every draft is published is «published»; the first pack sets the time', async t => {
  const { db, h, clock } = await setup(t);
  await edition(db, ED);
  await drafted(db, 1, ED);
  await h.accountPack({ edition_id: ED, items: [], rejected: [], overview: true });
  const t1 = (await get(db, 'SELECT published_at FROM news_editions WHERE edition_id=?', [ED])).published_at;
  assert.equal(t1, new Date(clock.now).toISOString());
  clock.now += 600e3;
  await h.accountPack({ edition_id: ED, items: [{ status: 'duplicate', article_id: key(1) }], rejected: [], overview: false });
  const e = await get(db, 'SELECT status, published_at FROM news_editions WHERE edition_id=?', [ED]);
  assert.equal(e.status, 'published'); assert.equal(e.published_at, t1);
});

async function server(t, h, { owner = true } = {}) {
  const app = express();
  const resolveUser = async req => String(req.headers.cookie || '').includes('owner') ? { user: { id: 'o', role: 'owner' }, session: { csrf: 'c' } } : null;
  const editorAuth = { resolve: async req => String(req.headers.cookie || '').includes('editor') ? { id: 'e', kind: 'editor', via: 'key' } : null };
  mountNewsRoutes(app, { repo: {}, editorAuth, resolveUser, harvester: h });
  const s = await new Promise(r => { const x = app.listen(0, () => r(x)); });
  t.after(() => new Promise(r => s.close(r)));
  return 'http://127.0.0.1:' + s.address().port;
}
test('routes: editions/next gives the oldest archived edition, superseded never', async t => {
  const { db, h, dataDir } = await setup(t, { now: Date.parse('2026-11-16T13:00:00+02:00') });
  fs.mkdirSync(path.join(dataDir, 'news-harvest'), { recursive: true });
  for (const f of ['a.zip', 'b.zip', 'c.zip']) fs.writeFileSync(path.join(dataDir, 'news-harvest', f), 'PK');
  await edition(db, 'ne_' + 'a'.repeat(18), { status: 'superseded', cutoff: '2026-11-16T04:00:00Z', file: 'a.zip' });
  await edition(db, 'ne_' + 'b'.repeat(18), { status: 'archived', cutoff: '2026-11-16T08:30:00Z', file: 'b.zip', lease: null });
  await edition(db, 'ne_' + 'c'.repeat(18), { status: 'archived', cutoff: '2026-11-16T14:30:00Z', file: 'c.zip', lease: null });
  const base = await server(t, h), editor = { cookie: 'lp=editor' };
  assert.equal((await fetch(base + '/api/news/editor/editions/next')).status, 401);
  const next = await (await fetch(base + '/api/news/editor/editions/next', { headers: editor })).json();
  assert.equal(next.edition.edition_id, 'ne_' + 'b'.repeat(18));
  assert.match(next.edition.download, /\/api\/news\/editor\/editions\/ne_b{18}\/download$/);
  const list = await (await fetch(base + '/api/news/editor/editions', { headers: editor })).json();
  assert.equal(list.editions.length, 3);
  assert.equal(list.editions.find(e => e.status === 'archived').late, true, 'not published and past its ready time');
});
test('routes: download leases the edition; schedule PUT is owner-only and validated', async t => {
  const { db, h, dataDir, clock } = await setup(t);
  fs.mkdirSync(path.join(dataDir, 'news-harvest'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'news-harvest', 'b.zip'), 'PK');
  await edition(db, ED, { status: 'archived', file: 'b.zip', lease: null });
  await run(db, `UPDATE news_editions SET report_json=? WHERE edition_id=?`, [JSON.stringify({ overview_keys: [key(1)], main_keys: [] }), ED]);
  await run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status) VALUES (?,?,?,?,'ready')`, [key(1), 'ynet', url(1), '2026-11-16T07:00:00Z']);
  const base = await server(t, h), editor = { cookie: 'lp=editor' }, owner = { cookie: 'lp=owner' };
  const dl = await fetch(base + '/api/news/editor/editions/' + ED + '/download', { headers: editor });
  assert.equal(dl.status, 200);
  const e = await get(db, 'SELECT status, lease_until FROM news_editions WHERE edition_id=?', [ED]);
  assert.equal(e.status, 'downloaded'); assert.equal(e.lease_until, new Date(clock.now + 4 * 3600e3).toISOString());
  assert.equal((await get(db, 'SELECT lease_until FROM news_harvest_items')).lease_until, e.lease_until);
  const put = (headers, body) => fetch(base + '/api/news/editor/schedule', { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put(editor, { slots: { evening: { main: 10 } } })).status, 403);
  assert.equal((await put({ ...owner, 'x-lp-csrf': 'c' }, { slots: { evening: { ready: '15:00' } } })).status, 400);
  const ok = await (await put({ ...owner, 'x-lp-csrf': 'c' }, { slots: { evening: { main: 10 } } })).json();
  assert.equal(ok.schedule.slots.evening.main, 10);
  assert.equal((await (await fetch(base + '/api/news/editor/schedule', { headers: editor })).json()).schedule.slots.evening.main, 10);
});
test('status: preparing before the ready time, late after it, last_ready from published', async t => {
  const { db, h, clock } = await setup(t, { now: Date.parse('2026-11-16T11:00:00+02:00') });
  const base = await server(t, h);
  await edition(db, ED, { slot: 'morning', status: 'published', cutoff: '2026-11-16T04:00:00Z', ready: '2026-11-16T06:00:00Z' });
  await run(db, `UPDATE news_editions SET published_at='2026-11-16T05:40:00.000Z' WHERE edition_id=?`, [ED]);
  await edition(db, ED2, { slot: 'midday', status: 'downloaded' });
  let s = await (await fetch(base + '/api/news/status')).json();
  assert.deepEqual(s.last_ready, { slot: 'morning', day: '2026-11-16', published_at: '2026-11-16T05:40:00.000Z' });
  assert.deepEqual(s.next, { slot: 'midday', day: '2026-11-16', target_ready_at: '2026-11-16T10:00:00.000Z', state: 'preparing' });
  clock.now = Date.parse('2026-11-16T12:30:00+02:00');
  s = await (await fetch(base + '/api/news/status')).json();
  assert.equal(s.next.state, 'late');
  clock.now = Date.parse('2026-11-16T09:00:00+02:00');
  await run(db, `DELETE FROM news_editions WHERE edition_id=?`, [ED2]);
  s = await (await fetch(base + '/api/news/status')).json();
  assert.deepEqual(s.next, { slot: 'midday', day: '2026-11-16', target_ready_at: '2026-11-16T10:00:00.000Z', state: 'waiting' });
});
test('repo: a pack of an edition tells the harvester what was published and what was refused', async t => {
  const AdmZip = require('adm-zip');
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await openDb(); t.after(() => db.close());
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00') });
  const got = [];
  repo.setEditionListener(r => { got.push(r); });
  const bad = fixtureArticle({ source: { url: 'https://www.ynet.co.il/news/article/zz9', canonical_url: 'https://www.ynet.co.il/news/article/zz9' }, revision: 0 });
  const zip = new AdmZip(fixturePack([fixtureArticle(), bad], { manifestOver: { edition_id: ED, rejected: [{ outlet_id: 'ynet', canonical_url: url(7), code: 'TRANSLIT' }] } }));
  await repo.ingestPack({ id: 'owner', kind: 'owner' }, zip.toBuffer());
  assert.equal(got.length, 1);
  assert.equal(got[0].edition_id, ED);
  assert.deepEqual(got[0].items.map(i => i.status), ['published', 'rejected']);
  assert.equal(got[0].items[1].article_id, C.articleKey('ynet', 'https://www.ynet.co.il/news/article/zz9'), 'a refused article still names its key');
  assert.equal(got[0].rejected[0].code, 'TRANSLIT');
});

// ---- final review fixes ----------------------------------------------------------------------------
test('review: an overview upload keeps the lease of drafts still in work', async t => {
  const { createOverviewItems } = require('../db/newsOverviewItems');
  const { db, clock } = await setup(t);
  const until = new Date(clock.now + 3 * 3600e3).toISOString();
  await drafted(db, 1, ED);
  await run(db, `UPDATE news_harvest_items SET lease_until=?, overview_state='sent' WHERE url_key=?`, [until, key(1)]);
  await run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, overview_state, lease_until) VALUES (?,?,?,?,'ready','sent',?)`, [key(2), 'ynet', url(2), '2026-11-16T07:00:00Z', until]);
  const ov = createOverviewItems({ db, now: () => clock.now });
  await ov.upsert({ schema: 'linguistpro-news-overview', schema_version: 2, edition_id: ED, day: '2026-11-16', slot: 'midday', stories: [{ story_key: 'S', items: [1, 2].map(n => ({ outlet_id: 'ynet', url: url(n), title_he: 'כותרת', title_ru: 'Заголовок' })) }] });
  const rows = await all(db, 'SELECT url_key, lease_until, overview_state FROM news_harvest_items ORDER BY url_key=?', [key(2)]);
  assert.deepEqual(rows.map(r => [r.overview_state, r.lease_until]), [['done', until], ['done', null]]);
});
test('review: a superseded or skipped edition is not served for download and keeps its status', async t => {
  const { db, h, dataDir } = await setup(t);
  fs.mkdirSync(path.join(dataDir, 'news-harvest'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'news-harvest', 'a.zip'), 'PK');
  await edition(db, ED, { status: 'superseded', file: 'a.zip', lease: null });
  assert.equal(await h.downloadEdition(ED), null);
  await drafted(db, 1, ED);
  await h.accountPack({ edition_id: ED, items: [{ status: 'published', article_id: key(1) }], rejected: [], overview: false });
  assert.equal((await get(db, 'SELECT status FROM news_editions WHERE edition_id=?', [ED])).status, 'superseded');
});
test('review: a pack where every article was refused does not move «Обновлено в»', async t => {
  const { db, h } = await setup(t);
  await edition(db, ED);
  await drafted(db, 1, ED);
  await h.accountPack({ edition_id: ED, items: [{ status: 'rejected', code: 'X', article_id: key(1) }], rejected: [], overview: false });
  const e = await get(db, 'SELECT published_at, first_upload_at FROM news_editions WHERE edition_id=?', [ED]);
  assert.equal(e.published_at, null); assert.ok(e.first_upload_at);
});
test('review: a slot whose build failed twice is not shown as late; the next slot is', async t => {
  const { db, h } = await setup(t, { now: Date.parse('2026-11-16T17:00:00+02:00') });
  await edition(db, 'ne_' + 'f'.repeat(18), { slot: 'morning', status: 'published', cutoff: '2026-11-16T04:00:00Z', ready: '2026-11-16T06:00:00Z' });
  await run(db, `UPDATE news_editions SET published_at='2026-11-16T05:40:00.000Z' WHERE slot='morning'`);
  await edition(db, 'ne_' + 'd'.repeat(18), { slot: 'midday', status: 'failed', lease: null });
  await edition(db, 'ne_' + 'e'.repeat(18), { slot: 'midday', status: 'failed', lease: null });
  await edition(db, ED, { slot: 'evening', status: 'downloaded', cutoff: '2026-11-16T14:30:00Z', ready: '2026-11-16T16:00:00Z' });
  const s = await h.status();
  assert.equal(s.next.slot, 'evening'); assert.equal(s.next.state, 'preparing');
});

// ---- C1: dot's own choice — route and the label check -------------------------------------------------
test('routes: extras returns a zip; refusals keep their code', async t => {
  const calls = [];
  const h = { isRunning: () => false, listRuns: async () => [], orderExtras: async (id, items) => {
    calls.push([id, items]);
    if (items[0].item_key === 'bad') { const e = new Error('EXTRAS_LIMIT'); e.code = 'EXTRAS_LIMIT'; throw e; }
    return { buffer: Buffer.from('PKzip'), name: 'news-extras-x.zip', items: [] };
  } };
  const base = await server(t, h), editor = { cookie: 'lp=editor', 'content-type': 'application/json' };
  const ok = await fetch(base + '/api/news/editor/editions/' + ED + '/extras', { method: 'POST', headers: editor, body: JSON.stringify({ items: [{ item_key: 'k', note_ru: 'почему' }] }) });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'application/zip');
  assert.equal(Buffer.from(await ok.arrayBuffer()).toString(), 'PKzip');
  const bad = await fetch(base + '/api/news/editor/editions/' + ED + '/extras', { method: 'POST', headers: editor, body: JSON.stringify({ items: [{ item_key: 'bad', note_ru: 'x' }] }) });
  assert.equal(bad.status, 409); assert.equal((await bad.json()).error, 'EXTRAS_LIMIT');
  assert.equal((await fetch(base + '/api/news/editor/editions/' + ED + '/extras', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
});
test('ingest: a dot label without an order is dropped with SELECTED_BY_UNVERIFIED; with an order it is kept', async t => {
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await openDb(['084_news_fingerprints.sql']); t.after(() => db.close());
  const repo = createNewsRepo({ db, now: () => Date.parse('2026-11-12T08:00:00+02:00') });
  const label = { learning: { selected_by: 'dot', selection_note_ru: 'Про экономику' } };
  const r1 = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle(label)]));
  assert.ok(r1.items[0].warnings.includes('SELECTED_BY_UNVERIFIED'));
  assert.equal((await repo.getCard(r1.items[0].work_id)).selected_by, undefined);
  const url2 = 'https://www.ynet.co.il/news/article/ord1', k2 = C.articleKey('ynet', url2);
  await run(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status, main_state, selected_by, selection_note_ru) VALUES (?,?,?,?,'ready','drafted','dot','Про экономику')`, [k2, 'ynet', url2, '2026-11-12T07:00:00Z']);
  const r2 = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle({ ...label, source: { url: url2, canonical_url: url2 } })]));
  const card = await repo.getCard(r2.items[0].work_id);
  assert.equal(card.selected_by, 'dot'); assert.equal(card.selection_note_ru, 'Про экономику');
});

// ---- C2: owner interests and the reading signal (spec §4.5, §5.7) -------------------------------------
async function readingSetup(t) {
  const { createNewsRepo } = require('../db/newsRepo');
  const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');
  const db = await openDb(['084_news_fingerprints.sql', '085_news_reading.sql']);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-read-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const clock = { now: Date.parse('2026-11-12T08:00:00+02:00') };
  const repo = createNewsRepo({ db, now: () => clock.now });
  const r = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  const h = createNewsHarvester({ db, dataDir, sources: [], delayMs: 0, now: () => clock.now, fetchImpl: async () => new Response('', { status: 404 }) });
  return { db, h, clock, workId: r.items[0].work_id, articleId: r.items[0].article_id };
}
test('read: only the owner\'s reading is recorded; others get 204 and nothing is stored', async t => {
  const { db, h, workId } = await readingSetup(t);
  const base = await server(t, h);
  const post = (headers, body) => fetch(base + '/api/news/read', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({}, { work_id: workId, event: 'open' })).status, 204);
  assert.equal((await post({ cookie: 'lp=editor' }, { work_id: workId, event: 'open' })).status, 204);
  assert.equal((await get(db, 'SELECT COUNT(*) n FROM news_read_signals')).n, 0);
  assert.equal((await post({ cookie: 'lp=owner' }, { work_id: workId, event: 'open' })).status, 204);
  assert.equal((await post({ cookie: 'lp=owner' }, { work_id: 'junk', event: 'open' })).status, 204);
  assert.deepEqual(await all(db, 'SELECT event FROM news_read_signals'), [{ event: 'open' }]);
});
test('read: open is recorded once per hour, finish once per day', async t => {
  const { db, h, workId, clock } = await readingSetup(t);
  for (let i = 0; i < 3; i++) await h.recordRead(workId, 'open');
  clock.now += 61 * 60e3; await h.recordRead(workId, 'open');
  await h.recordRead(workId, 'finish'); clock.now += 3600e3; await h.recordRead(workId, 'finish');
  assert.deepEqual((await all(db, 'SELECT event, COUNT(*) n FROM news_read_signals GROUP BY event ORDER BY event')).map(r => [r.event, r.n]), [['finish', 1], ['open', 2]]);
});
test('interests: the owner writes, the editor reads, more than 4000 characters is refused', async t => {
  const { h } = await readingSetup(t);
  const base = await server(t, h);
  const put = (headers, text) => fetch(base + '/api/news/editor/interests', { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ text }) });
  assert.equal((await put({ cookie: 'lp=editor' }, 'x')).status, 403);
  assert.equal((await put({ cookie: 'lp=owner', 'x-lp-csrf': 'c' }, 'a'.repeat(4001))).status, 400);
  assert.equal((await put({ cookie: 'lp=owner', 'x-lp-csrf': 'c' }, 'Больше экономики, меньше криминала')).status, 200);
  const got = await (await fetch(base + '/api/news/editor/interests', { headers: { cookie: 'lp=editor' } })).json();
  assert.equal(got.text, 'Больше экономики, меньше криминала'); assert.ok(got.updated_at);
});
test('edition archive carries interests.md and reading.json with 14-day counts', async t => {
  const { h, workId } = await readingSetup(t);
  await h.saveInterests('Больше экономики');
  await h.recordRead(workId, 'open'); await h.recordRead(workId, 'finish');
  const r = await h.readingSummary();
  assert.equal(r.days, 14);
  assert.deepEqual(r.by_section.politics, { open: 1, finish: 1 });
  assert.deepEqual(r.by_outlet.ynet, { open: 1, finish: 1 });
  assert.deepEqual(r.by_selected.auto, { open: 1, finish: 1 });
  assert.equal(r.recent[0].title_ru, 'Бюджет прошёл первое чтение'); assert.equal(r.recent[0].finished, true);
  assert.equal(await h.interestsText(), 'Больше экономики');
});

// ---- 3.11.897 -------------------------------------------------------------------------------------------
test('routes 897: the owner downloads without leasing, dot (editor key) leases', async t => {
  const { db, h, dataDir } = await setup(t);
  fs.mkdirSync(path.join(dataDir, 'news-harvest'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'news-harvest', 'b.zip'), 'PK');
  await edition(db, ED, { status: 'archived', file: 'b.zip', lease: null });
  const base = await server(t, h);
  assert.equal((await fetch(base + '/api/news/editor/editions/' + ED + '/download', { headers: { cookie: 'lp=owner' } })).status, 200);
  assert.equal((await get(db, 'SELECT status FROM news_editions WHERE edition_id=?', [ED])).status, 'archived');
  assert.equal((await fetch(base + '/api/news/editor/harvests/' + ED + '/download', { headers: { cookie: 'lp=owner' } })).status, 200);
  assert.equal((await get(db, 'SELECT status FROM news_editions WHERE edition_id=?', [ED])).status, 'archived');
  assert.equal((await fetch(base + '/api/news/editor/editions/' + ED + '/download', { headers: { cookie: 'lp=editor' } })).status, 200);
  assert.equal((await get(db, 'SELECT status FROM news_editions WHERE edition_id=?', [ED])).status, 'downloaded');
});
test('migration 088: a schedule saved with the old extras limit of 5 gets 50', async () => {
  const fs2 = require('node:fs'), path2 = require('node:path');
  const db = await openDb();
  await run(db, `INSERT INTO news_settings(key, value_json, updated_at) VALUES ('schedule', ?, 't')`, [JSON.stringify({ slots: {}, extras: 5, leaseHours: 4, maxAttempts: 2 })]);
  await new Promise((res, rej) => db.exec(fs2.readFileSync(path2.join(__dirname, '..', 'migrations', '088_news_extras_50.sql'), 'utf8'), e => e ? rej(e) : res()));
  assert.equal(JSON.parse((await get(db, "SELECT value_json FROM news_settings WHERE key='schedule'")).value_json).extras, 50);
  db.close();
});

// ---- 897 debt, part A ------------------------------------------------------------------------------------
test('debt A: status on a DST night names the next calendar day', async t => {
  const { israelAt } = require('../news/harvest/newsEditions');
  const { db, h } = await setup(t, { now: israelAt('2027-03-25', '05:30') });
  await edition(db, ED, { day: '2027-03-24', slot: 'late', status: 'published', cutoff: '2027-03-24T18:30:00Z', ready: '2027-03-24T20:00:00Z' });
  await run(db, `UPDATE news_editions SET published_at='2027-03-24T19:50:00.000Z' WHERE edition_id=?`, [ED]);
  const s = await h.status();
  assert.deepEqual([s.next.slot, s.next.day, s.next.state], ['morning', '2027-03-25', 'waiting']);
});
test('debt A: an edition dot downloaded but never answered is offered again as next', async t => {
  const { db, h, dataDir } = await setup(t);
  fs.mkdirSync(path.join(dataDir, 'news-harvest'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'news-harvest', 'b.zip'), 'PK');
  await edition(db, ED, { status: 'downloaded', file: 'b.zip' });
  await run(db, 'UPDATE news_editions SET downloaded_at=? WHERE edition_id=?', ['2026-11-16T07:00:00.000Z', ED]); // three hours ago, no answer
  assert.equal((await h.nextEdition()).edition_id, ED);
  await run(db, `UPDATE news_editions SET first_upload_at='t' WHERE edition_id=?`, [ED]);
  assert.equal(await h.nextEdition(), null, 'once dot answered, it is not offered again');
});
test('debt A: refused_count counts the drafts of the edition that were refused or skipped', async t => {
  const { db, h } = await setup(t);
  await edition(db, ED);
  await drafted(db, 1, ED); await drafted(db, 2, ED);
  await h.accountPack({ edition_id: ED, items: [{ status: 'rejected', code: 'X', article_id: key(1) }], rejected: [], overview: true });
  assert.equal((await get(db, 'SELECT refused_count FROM news_editions WHERE edition_id=?', [ED])).refused_count, 1);
  await h.closeEdition(ED);
  assert.equal((await get(db, 'SELECT refused_count FROM news_editions WHERE edition_id=?', [ED])).refused_count, 2);
});
test('debt A: migrations 083–088 go down and up again', async () => {
  const fs2 = require('node:fs'), path2 = require('node:path');
  const db = await openDb(['084_news_fingerprints.sql', '085_news_reading.sql', '086_news_offloads.sql', '087_news_offload_manifest.sql', '088_news_extras_50.sql']);
  const ex = sql => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
  const mig = (dir, m) => fs2.readFileSync(path2.join(__dirname, '..', 'migrations', dir, m), 'utf8');
  const list = ['083_news_editions.sql', '084_news_fingerprints.sql', '085_news_reading.sql', '086_news_offloads.sql', '087_news_offload_manifest.sql', '088_news_extras_50.sql'];
  for (const m of list.slice().reverse()) await ex(mig('down', m));
  for (const m of list) await ex(mig('', m));
  const cols = (await all(db, 'PRAGMA table_info(news_harvest_items)')).map(c => c.name);
  assert.ok(cols.includes('main_state'));
  db.close();
});

// ---- 897 review fixes ------------------------------------------------------------------------------------
test('897 review: a downloaded edition is offered again only after a grace hour, marked retry; a re-download renews the lease', async t => {
  const { db, h, dataDir, clock } = await setup(t);
  fs.mkdirSync(path.join(dataDir, 'news-harvest'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'news-harvest', 'b.zip'), 'PK');
  await edition(db, ED, { status: 'archived', file: 'b.zip', lease: null });
  await h.downloadEdition(ED); // dot took it
  assert.equal(await h.nextEdition(), null, 'not offered while dot is working on it');
  clock.now += 61 * 60e3;
  const n = await h.nextEdition();
  assert.equal(n.edition_id, ED); assert.equal(n.retry, true);
  await h.downloadEdition(ED);
  assert.equal((await get(db, 'SELECT lease_until FROM news_editions WHERE edition_id=?', [ED])).lease_until, new Date(clock.now + 4 * 3600e3).toISOString());
});
test('897 review: the owner can take an edition for dot explicitly (take=1 leases)', async t => {
  const { db, h, dataDir } = await setup(t);
  fs.mkdirSync(path.join(dataDir, 'news-harvest'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'news-harvest', 'b.zip'), 'PK');
  await edition(db, ED, { status: 'archived', file: 'b.zip', lease: null });
  const base = await server(t, h);
  assert.equal((await fetch(base + '/api/news/editor/editions/' + ED + '/download?take=1', { headers: { cookie: 'lp=owner' } })).status, 200);
  assert.equal((await get(db, 'SELECT status FROM news_editions WHERE edition_id=?', [ED])).status, 'downloaded');
});
test('897 review: an edition published from a hand-passed archive (no lease) closes after its time', async t => {
  const { db, h, clock } = await setup(t);
  await edition(db, ED, { status: 'archived', lease: null, cutoff: new Date(clock.now - 3600e3).toISOString() });
  await drafted(db, 1, ED); await drafted(db, 2, ED);
  await h.accountPack({ edition_id: ED, items: [{ status: 'published', article_id: key(1) }], rejected: [], overview: true });
  clock.now += 4 * 3600e3;
  await h.closeExpired();
  assert.ok((await get(db, 'SELECT closed_at FROM news_editions WHERE edition_id=?', [ED])).closed_at);
  assert.equal((await state(db, 2)).main_reason, 'SKIPPED');
});
test('897 review: the archive count stays; refusals are counted apart', async t => {
  const { db, h } = await setup(t);
  await edition(db, ED);
  await run(db, 'UPDATE news_editions SET rework_count=1 WHERE edition_id=?', [ED]);
  await drafted(db, 1, ED); await drafted(db, 2, ED);
  await h.accountPack({ edition_id: ED, items: [{ status: 'rejected', code: 'X', article_id: key(1) }, { status: 'published', article_id: key(2) }], rejected: [], overview: true });
  const e = await get(db, 'SELECT rework_count, refused_count FROM news_editions WHERE edition_id=?', [ED]);
  assert.deepEqual(e, { rework_count: 1, refused_count: 1 });
  assert.equal((await h.listEditions()).find(x => x.edition_id === ED).refused_count, 1);
});
test('897 review: migration 088 leaves broken JSON alone', async () => {
  const fs2 = require('node:fs'), path2 = require('node:path');
  const db = await openDb();
  await run(db, `INSERT INTO news_settings(key, value_json, updated_at) VALUES ('schedule', '{broken', 't')`);
  await new Promise((res, rej) => db.exec(fs2.readFileSync(path2.join(__dirname, '..', 'migrations', '088_news_extras_50.sql'), 'utf8'), e => e ? rej(e) : res()));
  db.close();
});
