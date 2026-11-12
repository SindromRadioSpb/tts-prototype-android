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
  assert.equal(outlets.body.outlets.length, 7); assert.equal(outlets.body.outlets[0].name_he, 'ynet');
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
