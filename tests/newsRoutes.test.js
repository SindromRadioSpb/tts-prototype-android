'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sqlite3 = require('sqlite3');
const express = require('express');
const { createNewsRepo } = require('../db/newsRepo');
const { createNewsEditorAuth } = require('../news/newsEditorAuth');
const { mountNewsRoutes } = require('../news/newsRoutes');
const { fixtureArticle, fixturePack } = require('./helpers/newsFixture.cjs');

const NOW = Date.parse('2026-11-12T08:00:00+02:00');
const exec = (db, sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));
const OWNER_COOKIE = 'lp_session=owner-session', OWNER_CSRF = 'owner-csrf';

async function setup(t, { packLimit } = {}) {
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  await exec(db, 'PRAGMA foreign_keys=ON');
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '078_news.sql'), 'utf8'));
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '079_news_manage.sql'), 'utf8'));
  await exec(db, fs.readFileSync(path.join(__dirname, '..', 'migrations', '080_news_images.sql'), 'utf8'));
  const repo = createNewsRepo({ db, now: () => NOW }), auth = createNewsEditorAuth({ db, now: () => NOW });
  const app = express(), audits = [], userLookups = [];
  // The owner session is resolved by the app; an editor key must never reach this resolver as a session.
  const resolveUser = async req => {
    userLookups.push(String(req.headers.cookie || ''));
    return String(req.headers.cookie || '').includes(OWNER_COOKIE) ? { user: { id: 'owner', role: 'owner' }, session: { csrf: OWNER_CSRF } } : null;
  };
  mountNewsRoutes(app, { repo, editorAuth: auth, resolveUser, audit: (...a) => audits.push(a), packLimitPerHour: packLimit });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => db.close(r))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, url, { body, headers = {}, json } = {}) => fetch(base + url, { method, headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : body }).then(async r => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));
  return { repo, auth, call, audits, userLookups };
}
const zipHeaders = h => ({ 'content-type': 'application/zip', ...h });
const ownerHeaders = { cookie: OWNER_COOKIE, 'x-lp-csrf': OWNER_CSRF };

test('editor key works only on news editor routes', async t => {
  const { auth, call, userLookups, audits } = await setup(t);
  const { key } = await auth.createEditor('owner', 'dot');
  const r = await call('POST', '/api/news/editor/packs', { body: fixturePack([fixtureArticle()]), headers: zipHeaders({ authorization: 'Bearer ' + key }) });
  assert.equal(r.status, 200); assert.equal(r.body.receipt.totals.published, 1);
  assert.ok(userLookups.every(c => !c.includes(key)));
  assert.ok(audits.some(a => a[0] === 'news_pack_ingested'));
  assert.equal((await call('POST', '/api/news/editor/packs', { body: fixturePack([]), headers: zipHeaders({ authorization: 'Bearer lpne_' + 'x'.repeat(43) }) })).status, 401);
});
test('revoked key and its sessions stop working', async t => {
  const { auth, call } = await setup(t);
  const { key, editor_id } = await auth.createEditor('owner', 'dot');
  const login = await call('POST', '/api/news/editor/login', { json: { key } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await call('GET', '/api/news/editor/me', { headers: { cookie } })).body.kind, 'editor');
  assert.equal((await call('POST', '/api/news/editor/editors/' + editor_id + '/revoke', { json: {}, headers: ownerHeaders })).status, 200);
  assert.equal((await call('GET', '/api/news/editor/me', { headers: { cookie } })).status, 401);
  assert.equal((await call('POST', '/api/news/editor/packs', { body: fixturePack([]), headers: zipHeaders({ authorization: 'Bearer ' + key }) })).status, 401);
  assert.equal((await call('POST', '/api/news/editor/login', { json: { key } })).status, 401);
});
test('only owner manages editors', async t => {
  const { auth, call } = await setup(t);
  const { key } = await auth.createEditor('owner', 'dot');
  assert.equal((await call('GET', '/api/news/editor/editors', { headers: { authorization: 'Bearer ' + key } })).status, 403);
  assert.equal((await call('POST', '/api/news/editor/editors', { json: { label: 'x' }, headers: { authorization: 'Bearer ' + key } })).status, 403);
  const created = await call('POST', '/api/news/editor/editors', { json: { label: 'dot-2' }, headers: ownerHeaders });
  assert.equal(created.status, 200); assert.match(created.body.key, /^lpne_/);
  const list = await call('GET', '/api/news/editor/editors', { headers: ownerHeaders });
  assert.equal(list.body.editors.length, 2);
  assert.equal((await call('GET', '/api/news/editor/me', { headers: { cookie: OWNER_COOKIE } })).body.csrf, OWNER_CSRF); assert.ok(list.body.editors.every(e => !('key' in e) && !('key_sha256' in e)));
});
test('cookie session needs csrf, bearer does not', async t => {
  const { auth, call } = await setup(t);
  const { key } = await auth.createEditor('owner', 'dot');
  const login = await call('POST', '/api/news/editor/login', { json: { key } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('POST', '/api/news/editor/packs', { body: fixturePack([fixtureArticle()]), headers: zipHeaders({ cookie }) })).status, 403);
  assert.equal((await call('POST', '/api/news/editor/packs', { body: fixturePack([fixtureArticle()]), headers: zipHeaders({ cookie, 'x-lp-csrf': login.body.csrf }) })).status, 200);
  assert.equal((await call('POST', '/api/news/editor/packs', { body: fixturePack([]), headers: zipHeaders({ cookie: OWNER_COOKIE }) })).status, 403);
});
test('rate limit: pack over the hourly limit → 429', async t => {
  const { auth, call } = await setup(t, { packLimit: 2 });
  const { key } = await auth.createEditor('owner', 'dot');
  const send = () => call('POST', '/api/news/editor/packs', { body: fixturePack([]), headers: zipHeaders({ authorization: 'Bearer ' + key }) });
  assert.equal((await send()).status, 200); assert.equal((await send()).status, 200); assert.equal((await send()).status, 429);
});
test('bad pack → 400 PACK_INVALID with detail', async t => {
  const { call } = await setup(t);
  const r = await call('POST', '/api/news/editor/packs', { body: Buffer.from('nope'), headers: zipHeaders(ownerHeaders) });
  assert.equal(r.status, 400); assert.equal(r.body.error, 'PACK_INVALID'); assert.equal(r.body.detail, 'NOT_ZIP');
});
test('news work served in public work shape; feed and outlets are public', async t => {
  const { call, repo } = await setup(t);
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  const workId = receipt.items[0].work_id;
  const r = await call('GET', '/api/public-corpora/news-ynet/works/' + workId);
  assert.equal(r.status, 200); assert.equal(r.body.schema_version, 'public_corpus_work.1.0.0');
  assert.match(r.body.item.snapshot_sha256, /^[a-f0-9]{64}$/);
  assert.equal(r.headers.get('etag'), '"news-work-v2-' + r.body.item.snapshot_sha256 + '"', 'the payload shape version is part of the validator');
  assert.equal((await call('GET', '/api/public-corpora/news-ynet/works/' + workId + '?snapshot=' + 'f'.repeat(64))).status, 409);
  assert.equal((await call('GET', '/api/public-corpora/news-walla/works/' + workId)).status, 404);
  const feed = await call('GET', '/api/news/feed?outlet=ynet&tier=fresh');
  assert.equal(feed.body.items.length, 1);
  assert.equal((await call('GET', '/api/news/feed?work=' + workId)).body.card.work_id, workId);
  assert.equal((await call('GET', '/api/news/feed?work=na_' + '0'.repeat(24) + '.b1')).status, 404);
  assert.equal((await call('GET', '/api/news/feed?outlet=cnn')).status, 404);
  const outlets = await call('GET', '/api/news/outlets');
  assert.equal(outlets.body.outlets.length, require('../public/js/news-outlets').OUTLETS.length); assert.equal(outlets.body.outlets[0].name_he, 'ynet');
});
test('withdraw article and pack through the editor routes', async t => {
  const { call, repo, auth } = await setup(t);
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  const { key } = await auth.createEditor('owner', 'dot');
  const r = await call('POST', '/api/news/editor/articles/' + receipt.items[0].article_id + '/withdraw', { json: { reason: 'ошибка' }, headers: { authorization: 'Bearer ' + key } });
  assert.equal(r.status, 200); assert.equal(r.body.tier, 'withdrawn');
  assert.equal((await call('POST', '/api/news/editor/packs/' + receipt.pack_id + '/withdraw', { json: {}, headers: ownerHeaders })).body.count, 0);
  const j = await call('GET', '/api/news/editor/journal', { headers: { authorization: 'Bearer ' + key } });
  assert.equal(j.body.packs.length, 1);
});

test('review fix: an unauthenticated upload is refused before its body is buffered', async t => {
  const { call } = await setup(t);
  const r = await call('POST', '/api/news/editor/packs', { body: Buffer.alloc(51 * 1024 * 1024), headers: zipHeaders({}) });
  assert.equal(r.status, 401);
});
test('review fix: the spec upload path POST /api/news/packs works for an editor key', async t => {
  const { auth, call } = await setup(t);
  const { key } = await auth.createEditor('owner', 'dot');
  const r = await call('POST', '/api/news/packs', { body: fixturePack([fixtureArticle()]), headers: zipHeaders({ authorization: 'Bearer ' + key }) });
  assert.equal(r.status, 200); assert.equal(r.body.receipt.totals.published, 1);
});
test('manage: archive, return to feed, delete, restore and the editor list through the routes', async t => {
  const { call, repo, auth } = await setup(t);
  const receipt = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([fixtureArticle()]));
  const id = receipt.items[0].article_id;
  const { key } = await auth.createEditor('owner', 'dot');
  const H = { authorization: 'Bearer ' + key };
  assert.equal((await call('POST', '/api/news/editor/articles/' + id + '/archive', { json: {}, headers: H })).body.tier, 'archive');
  assert.equal((await call('GET', '/api/news/editor/articles?view=archive', { headers: H })).body.items.length, 1);
  assert.equal((await call('POST', '/api/news/editor/articles/' + id + '/unarchive', { json: {}, headers: H })).body.tier, 'fresh');
  const del = await call('POST', '/api/news/editor/articles/' + id + '/delete', { json: {}, headers: ownerHeaders });
  assert.equal(del.body.tier, 'withdrawn'); assert.ok(del.body.purge_at);
  const trash = await call('GET', '/api/news/editor/articles?view=deleted', { headers: H });
  assert.equal(trash.body.items[0].title_he, fixtureArticle().learning.title_he);
  assert.equal((await call('POST', '/api/news/editor/articles/' + id + '/restore', { json: {}, headers: H })).body.tier, 'fresh');
  assert.equal((await call('GET', '/api/news/editor/articles?view=deleted')).status, 401);
  assert.equal((await call('POST', '/api/news/editor/articles/' + id + '/archive', { json: {} })).status, 401);
});
test('manage: soft role probe answers 200 for everyone (no console error for readers)', async t => {
  const { call } = await setup(t);
  const anon = await call('GET', '/api/news/editor/me?soft=1');
  assert.equal(anon.status, 200); assert.equal(anon.body.kind, null);
  assert.equal((await call('GET', '/api/news/editor/me?soft=1', { headers: { cookie: OWNER_COOKIE } })).body.kind, 'owner');
});

test('GET /api/news/images serves a stored photo same-origin, immutable only at its hash address', async t => {
  const { repo, call } = await setup(t);
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
  const a = fixtureArticle({ images: [{ file: 'img-1.jpg', role: 'hero', source_url: 'https://ynet-pic1.yit.co.il/p/1.jpg' }], __files: { 'img-1.jpg': JPEG } });
  const r = await repo.ingestPack({ id: 'owner', kind: 'owner' }, fixturePack([a]));
  const url = (await repo.getCard(r.items[0].article_id + '.b1')).image.stored.url;
  const ok = await call('GET', url);
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  assert.equal(ok.headers.get('cross-origin-resource-policy'), 'same-origin'); assert.match(ok.headers.get('cache-control'), /immutable/);
  assert.doesNotMatch((await call('GET', url.split('?')[0])).headers.get('cache-control'), /immutable/);
  assert.equal((await call('GET', '/api/news/images/' + r.items[0].article_id + '/img-9.jpg')).status, 404);
  assert.equal((await call('GET', '/api/news/images/na_x/..%2Fetc')).status, 404);
});

// Findability W2: one feed for the overview and every outlet.
test('GET /api/news/list returns rows and counts; bad params → 400', async t => {
  const calls = [];
  const db = await new Promise((res, rej) => { const d = new sqlite3.Database(':memory:', e => e ? rej(e) : res(d)); });
  const app = express();
  mountNewsRoutes(app, { repo: {}, editorAuth: { resolve: async () => null }, resolveUser: async () => null,
    list: { list: async p => { calls.push(p); return { day: '2026-11-21', prev: null, next: null, counts: { learn: 1, slice: 0 }, items: [{ item_key: 'na_x', kind: 'learn' }], next_cursor: null, body_search_from: null }; } } });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => db.close(r))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const ok = await fetch(base + '/api/news/list?day=2026-11-21&outlet=ynet&group=politics&kind=learn&q=' + encodeURIComponent('בחירות') + '&sort=match');
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true); assert.deepEqual(body.counts, { learn: 1, slice: 0 });
  assert.deepEqual(calls[0], { day: '2026-11-21', outlet: 'ynet', group: 'politics', kind: 'learn', q: 'בחירות', sort: 'match' });
  for (const bad of ['day=21-11-2026', 'outlet=cnn', 'section=junk', 'kind=x', 'sort=x', 'from=2026-1-1', 'q=' + 'א'.repeat(201)]) {
    const r = await fetch(base + '/api/news/list?' + bad);
    assert.equal(r.status, 400, bad); assert.equal((await r.json()).error, 'NEWS_PARAM_INVALID');
  }
});
test('GET /api/news/list: from after to is refused', async t => {
  const app = express();
  mountNewsRoutes(app, { repo: {}, editorAuth: { resolve: async () => null }, resolveUser: async () => null, list: { list: async () => ({ items: [] }) } });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/news/list?from=2026-11-21&to=2026-11-01');
  assert.equal(r.status, 400); assert.equal((await r.json()).detail, 'range');
});

// Findability W4: tags, ★ and reads for every signed-in user.
async function marksApp(t) {
  const { openDb } = require('./helpers/newsDb.cjs');
  const { createNewsList } = require('../db/newsList');
  const { createNewsMarks } = require('../db/newsMarks');
  const db = await openDb();
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
  await run("INSERT INTO news_settings(key, value_json, updated_at) VALUES ('index_version','2','t')");
  for (const n of [1, 2, 3]) await run(`INSERT INTO news_index(item_key, day, outlet_id, fresh_at, kind, title_he, updated_at) VALUES (?, '2026-11-21', 'ynet', ?, 'slice', ?, 't')`,
    ['na_' + String(n).padStart(24, '0'), '2026-11-21T0' + n + ':00:00.000Z', 'כותרת ' + n]);
  const users = { 'lp_session=a': { user: { id: 'ua', role: 'user' }, session: { csrf: 'ca' } }, 'lp_session=b': { user: { id: 'ub', role: 'user' }, session: { csrf: 'cb' } } };
  const app = express();
  mountNewsRoutes(app, { repo: {}, editorAuth: { resolve: async () => null }, resolveUser: async req => users[req.headers.cookie] || null,
    list: createNewsList({ db, now: () => Date.parse('2026-11-21T12:00:00Z') }), marks: createNewsMarks({ db, now: () => Date.parse('2026-11-21T12:00:00Z') }) });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => db.close(r))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, url, { cookie, csrf, json } = {}) => fetch(base + url, { method, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-lp-csrf': csrf } : {}), ...(json ? { 'content-type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : undefined }).then(async r => ({ status: r.status, headers: r.headers, body: r.status === 204 ? null : await r.json().catch(() => null) }));
  return { call, K: n => 'na_' + String(n).padStart(24, '0') };
}
test('marks need a session and csrf', async t => {
  const { call, K } = await marksApp(t);
  assert.equal((await call('PUT', '/api/news/marks', { json: { item_key: K(1), tag: '★' } })).status, 401);
  assert.equal((await call('PUT', '/api/news/marks', { cookie: 'lp_session=a', json: { item_key: K(1), tag: '★' } })).status, 403);
  const ok = await call('PUT', '/api/news/marks', { cookie: 'lp_session=a', csrf: 'ca', json: { item_key: K(1), tag: '★' } });
  assert.equal(ok.status, 200); assert.deepEqual(ok.body.marks, ['★']);
  assert.equal((await call('PUT', '/api/news/marks', { cookie: 'lp_session=a', csrf: 'ca', json: { item_key: K(1), tag: '#bad' } })).status, 400);
  const del = await call('DELETE', '/api/news/marks', { cookie: 'lp_session=a', csrf: 'ca', json: { item_key: K(1), tag: '★' } });
  assert.deepEqual(del.body.marks, []);
});
test('list with tag filter returns only marked rows of this user; read mark appears on the row', async t => {
  const { call, K } = await marksApp(t);
  await call('PUT', '/api/news/marks', { cookie: 'lp_session=a', csrf: 'ca', json: { item_key: K(2), tag: 'выборы' } });
  await call('PUT', '/api/news/marks', { cookie: 'lp_session=b', csrf: 'cb', json: { item_key: K(3), tag: 'выборы' } });
  await call('POST', '/api/news/read', { cookie: 'lp_session=a', json: { item_key: K(1) } });
  const a = await call('GET', '/api/news/list?day=2026-11-21&tag=' + encodeURIComponent('выборы'), { cookie: 'lp_session=a' });
  assert.deepEqual(a.body.items.map(i => i.item_key), [K(2)]);
  assert.deepEqual(a.body.items[0].marks, ['выборы']);
  assert.match(a.headers.get('cache-control'), /no-store/);
  const all = await call('GET', '/api/news/list?day=2026-11-21', { cookie: 'lp_session=a' });
  assert.equal(all.body.items.find(i => i.item_key === K(1)).read, true);
  assert.deepEqual((await call('GET', '/api/news/tags', { cookie: 'lp_session=a' })).body.tags, [{ tag: 'выборы', n: 1 }]);
  const anon = await call('GET', '/api/news/list?day=2026-11-21&tag=x');
  assert.equal(anon.status, 400, 'a visitor without an account filters by keys, not by server tags');
});
test('anonymous keys filter', async t => {
  const { call, K } = await marksApp(t);
  const r = await call('GET', '/api/news/list?day=2026-11-21&keys=' + [K(1), K(3), 'junk'].join(','));
  assert.deepEqual(r.body.items.map(i => i.item_key).sort(), [K(1), K(3)]);
  assert.equal((await call('GET', '/api/news/list?keys=' + Array.from({ length: 151 }, (_, i) => K(i)).join(','))).status, 400);
});
test('an empty visitor keys filter shows nothing, not everything (review W4 I1)', async t => {
  const { call } = await marksApp(t);
  const r = await call('GET', '/api/news/list?day=2026-11-21&keys=');
  assert.equal(r.status, 200); assert.equal(r.body.items.length, 0);
});
test('a pinned study article keeps serving its photo after news_images is cleared (review W4 I2)', async t => {
  const pinned = { mime: 'image/jpeg', sha256: 'b'.repeat(64), bytes: Buffer.from('PINNEDSTUDY') };
  const app = express();
  mountNewsRoutes(app, { repo: { getImage: async () => null }, editorAuth: { resolve: async () => null }, resolveUser: async () => null,
    marks: { pinImage: async (k, n) => k === 'na_' + 'c'.repeat(24) && n === 'img-1.jpg' ? pinned : null } });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/news/images/na_' + 'c'.repeat(24) + '/img-1.jpg');
  assert.equal(r.status, 200); assert.equal(Buffer.from(await r.arrayBuffer()).toString(), 'PINNEDSTUDY');
});
test('marks over the cap answer 409', async t => {
  const app = express();
  mountNewsRoutes(app, { repo: {}, editorAuth: { resolve: async () => null }, resolveUser: async () => ({ user: { id: 'u', role: 'user' }, session: { csrf: 'c' } }),
    marks: { mark: async () => { throw Object.assign(new Error('NEWS_MARKS_LIMIT'), { code: 'NEWS_MARKS_LIMIT', status: 409 }); }, marksFor: async () => new Map() } });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(r)));
  const r = await fetch('http://127.0.0.1:' + server.address().port + '/api/news/marks', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-lp-csrf': 'c' }, body: JSON.stringify({ item_key: 'na_' + 'a'.repeat(24), tag: 'x' }) });
  assert.equal(r.status, 409);
});

// Findability W5: the owner's orders for dot.
async function ordersApp(t, { orderForOwner } = {}) {
  const { openDb } = require('./helpers/newsDb.cjs');
  const { createOwnerOrders } = require('../news/newsOwnerOrders');
  const { createNewsMarks } = require('../db/newsMarks');
  const { packBody } = require('../news/harvest/newsBody');
  const db = await openDb();
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
  const K = n => 'na_' + String(n).padStart(24, '0');
  for (const n of [1, 2]) {
    await run(`INSERT INTO news_harvest_items(url_key, canonical_key, outlet_id, url, first_seen_at, status, title_he, full_ok, data_gz) VALUES (?,?,?,?,?,'ready','כ',1,?)`,
      [K(n), K(n), 'ynet', 'https://www.ynet.co.il/news/article/' + n, '2026-11-21T08:00:00.000Z', packBody({ paragraphs: ['ט.'] })]);
    await run(`INSERT INTO news_index(item_key, day, outlet_id, fresh_at, kind, title_he, updated_at) VALUES (?, '2026-11-21', 'ynet', 't', 'slice', 'כ', 't')`, [K(n)]);
  }
  const now = () => Date.parse('2026-11-21T12:00:00Z');
  const marks = createNewsMarks({ db, now }), orders = createOwnerOrders({ db, now, marks });
  const harvester = { orderForOwner: orderForOwner || (async o => ({ order_id: 'nso_' + 'e'.repeat(32), buffer: Buffer.from('ZIP:' + o.item_key), name: 'news-archive-order-x.zip' })),
    nextEdition: async () => ({ edition_id: 'ne_x' }) };
  const owner = { user: { id: 'owner', role: 'owner' }, session: { csrf: 'oc' } };
  const app = express();
  mountNewsRoutes(app, { repo: {}, harvester, marks, orders, resolveUser: async req => req.headers.cookie === 'o' ? owner : null,
    editorAuth: { resolve: async req => req.headers.authorization === 'Bearer dot' ? { id: 'editor:e1', kind: 'editor', via: 'bearer' } : null } });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => db.close(r))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const OWN = { cookie: 'o', 'x-lp-csrf': 'oc' }, DOTH = { authorization: 'Bearer dot' };
  const call = (method, url, headers, json) => fetch(base + url, { method, headers: { ...headers, ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  return { call, OWN, DOTH, K, orders, marks };
}
test('orders: owner creates, dot lists, takes (draft zip) and fails with a reason; editions/next carries open orders', async t => {
  const { call, OWN, DOTH, K } = await ordersApp(t);
  assert.equal((await call('POST', '/api/news/orders', {}, { item_key: K(1), note_ru: 'x' })).status, 401);
  const made = await (await call('POST', '/api/news/orders', OWN, { item_key: K(1), note_ru: 'Выбор владельца' })).json();
  assert.equal(made.created.length, 1);
  await call('POST', '/api/news/orders', OWN, { item_key: K(2), note_ru: 'Второй' });
  const next = await (await call('GET', '/api/news/editor/editions/next', DOTH)).json();
  assert.equal(next.orders.length, 2, 'dot sees the open orders where it looks first');
  const open = await (await call('GET', '/api/news/editor/orders?status=open', DOTH)).json();
  assert.deepEqual(open.orders.map(o => o.item_key).sort(), [K(1), K(2)]);
  const take = await call('POST', '/api/news/editor/orders/' + made.created[0].order_id + '/take', DOTH, {});
  assert.equal(take.status, 200); assert.equal(take.headers.get('content-type'), 'application/zip');
  assert.equal(Buffer.from(await take.arrayBuffer()).toString(), 'ZIP:' + K(1));
  const failed = await call('POST', '/api/news/editor/orders/' + open.orders.find(o => o.item_key === K(2)).order_id + '/fail', DOTH, { reason: 'Текст слишком короткий' });
  assert.equal(failed.status, 200);
  const mine = await (await call('GET', '/api/news/orders', OWN)).json();
  assert.deepEqual(mine.orders.map(o => [o.item_key, o.status, o.reason]).sort(), [[K(1), 'taken', null], [K(2), 'failed', 'Текст слишком короткий']]);
});
test('orders: a tag order over 50 is refused; a take that cannot be built says why and keeps the order open', async t => {
  const { call, OWN, DOTH, K, marks, orders } = await ordersApp(t, { orderForOwner: async () => { throw Object.assign(new Error('SOURCES_EXPIRED'), { code: 'SOURCES_EXPIRED' }); } });
  await marks.mark({ id: 'owner', kind: 'owner' }, K(1), 'выборы');
  const r = await (await call('POST', '/api/news/orders', OWN, { tag: 'выборы', from: '2026-11-21', to: '2026-11-21', note_ru: 'По тегу' })).json();
  assert.equal(r.created.length, 1);
  const take = await call('POST', '/api/news/editor/orders/' + r.created[0].order_id + '/take', DOTH, {});
  assert.equal(take.status, 410); assert.equal((await take.json()).error, 'SOURCES_EXPIRED');
  assert.equal((await orders.get(r.created[0].order_id)).reason, 'SOURCES_EXPIRED');
  const bad = await call('POST', '/api/news/orders', OWN, { item_key: 'junk', note_ru: '' });
  assert.equal(bad.status, 400);
});
test('orders: the owner sees each row\'s order status in the list', async t => {
  const { openDb } = require('./helpers/newsDb.cjs');
  const { createOwnerOrders } = require('../news/newsOwnerOrders');
  const { createNewsMarks } = require('../db/newsMarks');
  const { createNewsList } = require('../db/newsList');
  const db = await openDb();
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
  const K = 'na_' + '1'.repeat(24), now = () => Date.parse('2026-11-21T12:00:00Z');
  await run("INSERT INTO news_settings(key, value_json, updated_at) VALUES ('index_version','2','t')");
  await run(`INSERT INTO news_index(item_key, day, outlet_id, fresh_at, kind, title_he, updated_at) VALUES (?, '2026-11-21', 'ynet', 't', 'slice', 'כ', 't')`, [K]);
  await run(`INSERT INTO news_owner_orders(order_id, item_key, note_ru, status, reason, created_by, created_at, updated_at) VALUES ('noo_1', ?, 'n', 'failed', 'Слишком коротко', 'owner', 't', 't')`, [K]);
  const app = express();
  mountNewsRoutes(app, { repo: {}, editorAuth: { resolve: async () => null }, resolveUser: async () => ({ user: { id: 'owner', role: 'owner' }, session: { csrf: 'c' } }),
    list: createNewsList({ db, now }), marks: createNewsMarks({ db, now }), orders: createOwnerOrders({ db, now }) });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => db.close(r))));
  const r = await (await fetch('http://127.0.0.1:' + server.address().port + '/api/news/list?day=2026-11-21', { headers: { cookie: 'x' } })).json();
  assert.deepEqual([r.items[0].order.status, r.items[0].order.reason], ['failed', 'Слишком коротко']);
});
