'use strict';
// W5: a reader's outlets — the list filter, the account's preferences, «new» outlets (spec 2026-11-26 §7).
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express');
const { openDb } = require('./helpers/newsDb.cjs');
const { createNewsRepo } = require('../db/newsRepo');
const { createNewsEditorAuth } = require('../news/newsEditorAuth');
const { createOutletState } = require('../db/newsOutletState');
const { createReaderPrefs } = require('../db/newsReaderPrefs');
const { createNewsList } = require('../db/newsList');
const { mountNewsRoutes } = require('../news/newsRoutes');

const NOW = Date.parse('2026-11-26T08:00:00Z');
const USER = 'lp_session=u1', CSRF = 'c1';
async function setup(t) {
  const db = await openDb();
  const repo = createNewsRepo({ db, now: () => NOW });
  const app = express();
  const resolveUser = async req => String(req.headers.cookie || '').includes(USER) ? { user: { id: 'u1', role: 'user' }, session: { csrf: CSRF } } : null;
  mountNewsRoutes(app, { repo, editorAuth: createNewsEditorAuth({ db }), resolveUser, outletState: createOutletState({ db, now: () => NOW }),
    prefs: createReaderPrefs({ db, now: () => NOW }), list: createNewsList({ db, now: () => NOW }) });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => new Promise(r => server.close(() => db.close(r))));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, url, { headers = {}, json } = {}) => fetch(base + url, { method, headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { call, db };
}
const me = { cookie: USER, 'x-lp-csrf': CSRF };

test('outlets param is validated', async t => {
  const { call } = await setup(t);
  assert.equal((await call('GET', '/api/news/list?outlets=ynet,haipo')).status, 200);
  assert.equal((await call('GET', '/api/news/list?outlets=ynet,evil')).status, 400);
  assert.equal((await call('GET', '/api/news/list?outlets=' + Array(61).fill('ynet').join(','))).status, 400);
});
test('order survives a round trip through the server', async t => {
  const { call } = await setup(t);
  assert.equal((await call('GET', '/api/news/prefs')).status, 401);
  assert.deepEqual((await call('GET', '/api/news/prefs', { headers: me })).body.prefs, null, 'nothing saved yet');
  assert.equal((await call('PUT', '/api/news/prefs', { headers: { cookie: USER }, json: { prefs: { v: 1, mine: ['haipo'] } } })).status, 403, 'CSRF');
  const put = await call('PUT', '/api/news/prefs', { headers: me, json: { prefs: { v: 1, mine: ['haipo', 'ynet', 'nope'], hidden: ['kikar'], collapsed: ['radio'], overview: 'mine', extra: 'x' } } });
  assert.equal(put.status, 200);
  const got = (await call('GET', '/api/news/prefs', { headers: me })).body.prefs;
  assert.deepEqual(got, { v: 1, mine: ['haipo', 'ynet'], hidden: ['kikar'], collapsed: ['radio'], overview: 'mine' });
  assert.equal((await call('PUT', '/api/news/prefs', { headers: me, json: { prefs: { v: 1, mine: [], junk: 'x'.repeat(9000) } } })).status, 413);
});
test('the public outlet list says since when an outlet is in the slice («new»)', async t => {
  const { call } = await setup(t);
  const o = (await call('GET', '/api/news/outlets')).body.outlets;
  assert.equal(o.find(x => x.outlet_id === 'haipo').enabled_at, '2026-11-26T05:30:00.000Z');
  assert.equal(o.find(x => x.outlet_id === 'ynet').enabled_at, null);
});
