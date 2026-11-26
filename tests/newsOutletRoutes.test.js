'use strict';
// Outlet routes: the owner's list with switches and the public outlet list (spec 2026-11-26 §7.5, §8; plan W1 Task 5).
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsRepo } = require('../db/newsRepo');
const { createNewsEditorAuth } = require('../news/newsEditorAuth');
const { createOutletState } = require('../db/newsOutletState');
const { mountNewsRoutes } = require('../news/newsRoutes');

const NOW = Date.parse('2026-11-26T08:00:00Z');
const OWNER_COOKIE = 'lp_session=owner-session', OWNER_CSRF = 'owner-csrf';
const ownerHeaders = { cookie: OWNER_COOKIE, 'x-lp-csrf': OWNER_CSRF };
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));
const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

async function setup(t, { freshMako = 0 } = {}) {
  const db = await openDb();
  const repo = createNewsRepo({ db, now: () => NOW }), auth = createNewsEditorAuth({ db, now: () => NOW });
  const outletState = createOutletState({ db, now: () => NOW });
  if (freshMako) { const orig = repo.listOutlets; repo.listOutlets = async () => (await orig()).map(o => o.outlet_id === 'mako' ? { ...o, fresh_count: freshMako } : o); }
  const app = express(), audits = [];
  const resolveUser = async req => String(req.headers.cookie || '').includes(OWNER_COOKIE) ? { user: { id: 'owner', role: 'owner' }, session: { csrf: OWNER_CSRF } } : null;
  mountNewsRoutes(app, { repo, editorAuth: auth, resolveUser, audit: (...a) => audits.push(a), outletState });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => db.close(r))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, url, { headers = {}, json } = {}) => fetch(base + url, { method, headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { db, auth, call, audits, outletState };
}

test('editor reads outlets with state', async t => {
  const { db, auth, call, outletState } = await setup(t);
  await outletState.recordPoll('ynet', { okAt: '2026-11-26T07:55:00.000Z' });
  for (const [k, at] of [['a', '2026-11-26T07:00:00.000Z'], ['b', '2026-11-25T09:00:00.000Z'], ['c', '2026-11-24T07:00:00.000Z']])
    await dbRun(db, `INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status) VALUES (?, 'ynet', ?, ?, 'ready')`, ['na_' + k.repeat(24), 'https://www.ynet.co.il/news/article/' + k, at]);
  const { key } = await auth.createEditor('owner', 'dot');
  const r = await call('GET', '/api/news/editor/outlets', { headers: { authorization: 'Bearer ' + key } });
  assert.equal(r.status, 200);
  const y = r.body.outlets.find(o => o.outlet_id === 'ynet'), m = r.body.outlets.find(o => o.outlet_id === 'mako'), c = r.body.outlets.find(o => o.outlet_id === 'c14');
  assert.deepEqual([y.enabled, y.route, y.group, y.has_adapter, y.day_count, y.last_ok_at], [true, 'server', 'national', true, 2, '2026-11-26T07:55:00.000Z']);
  assert.deepEqual([m.enabled, m.has_adapter], [false, false]);
  assert.equal(c.route, 'home_pc');
  assert.equal(r.body.outlets.length, 7);
});
test('editor key cannot switch an outlet (OWNER_ONLY)', async t => {
  const { auth, call } = await setup(t);
  const { key } = await auth.createEditor('owner', 'dot');
  const r = await call('POST', '/api/news/editor/outlets/walla', { json: { enabled: false }, headers: { authorization: 'Bearer ' + key } });
  assert.equal(r.status, 403); assert.equal(r.body.error, 'OWNER_ONLY');
});
test('owner switches with CSRF, journal written', async t => {
  const { db, call, audits } = await setup(t);
  assert.equal((await call('POST', '/api/news/editor/outlets/walla', { json: { enabled: false }, headers: { cookie: OWNER_COOKIE } })).status, 403);
  const r = await call('POST', '/api/news/editor/outlets/walla', { json: { enabled: false }, headers: ownerHeaders });
  assert.equal(r.status, 200); assert.equal(r.body.outlet.enabled, false);
  assert.deepEqual((await dbAll(db, 'SELECT action, actor FROM news_outlet_journal')).map(j => [j.action, j.actor]), [['disable', 'owner']]);
  assert.ok(audits.some(a => a[0] === 'news_outlet_disabled' && a[2].outlet_id === 'walla'));
  assert.equal((await call('POST', '/api/news/editor/outlets/walla', { json: { enabled: 'yes' }, headers: ownerHeaders })).status, 400);
});
test('public outlets hide disabled ones', async t => {
  const { call, outletState } = await setup(t);
  await outletState.setEnabled('walla', false, 'owner');
  const r = await call('GET', '/api/news/outlets');
  const ids = r.body.outlets.map(o => o.outlet_id);
  assert.ok(!ids.includes('walla') && !ids.includes('mako'));
  const c = r.body.outlets.find(o => o.outlet_id === 'c14');
  assert.deepEqual([c.group, c.route, c.last_ok_at], ['national', 'home_pc', null]);
});
test('NO_ADAPTER is 409', async t => {
  const { call } = await setup(t);
  const r = await call('POST', '/api/news/editor/outlets/mako', { json: { enabled: true }, headers: ownerHeaders });
  assert.equal(r.status, 409); assert.equal(r.body.error, 'NO_ADAPTER');
});
test('an outlet without a harvester still shows while it has fresh published articles (mako)', async t => {
  const { call } = await setup(t, { freshMako: 2 });
  const r = await call('GET', '/api/news/outlets');
  const m = r.body.outlets.find(o => o.outlet_id === 'mako');
  assert.ok(m, 'mako stays on the home page'); assert.equal(m.fresh_count, 2);
});
