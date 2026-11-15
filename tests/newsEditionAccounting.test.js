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
