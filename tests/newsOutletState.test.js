'use strict';
// The owner's outlet switches and each outlet's harvest state (spec 2026-11-26 §4, §8).
const test = require('node:test'), assert = require('node:assert/strict');
const { openDb } = require('./helpers/newsDb.cjs');
const { createOutletState } = require('../db/newsOutletState');
const { SOURCES } = require('../news/harvest/newsHarvestSources');

const dbAll = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const dbRun = (db, sql, p = []) => new Promise((res, rej) => db.run(sql, p, e => e ? rej(e) : res()));

test('unknown outlet in table reads as disabled', async () => {
  const db = await openDb();
  await dbRun(db, "DELETE FROM news_outlet_state WHERE outlet_id='haaretz'");
  const st = createOutletState({ db });
  const all = await st.list();
  assert.deepEqual(all.map(o => o.outlet_id).sort(), ['c14', 'haaretz', 'maariv', 'mako', 'n12', 'walla', 'ynet']);
  const h = await st.get('haaretz');
  assert.equal(h.enabled, false); assert.equal(h.route, 'server');
  assert.equal((await st.get('ynet')).enabled, true);
  assert.equal((await st.get('c14')).route, 'home_pc');
  assert.equal(await st.get('nope'), null);
});
test('enable without adapter → NO_ADAPTER', async () => {
  const st = createOutletState({ db: await openDb() });
  await assert.rejects(st.setEnabled('mako', true, 'owner:1'), e => e.code === 'NO_ADAPTER' && e.status === 409);
  await assert.rejects(st.setEnabled('nope', true, 'owner:1'), e => e.code === 'UNKNOWN_OUTLET' && e.status === 404);
});
test('recordPoll never moves last_ok_at back', async () => {
  const st = createOutletState({ db: await openDb() });
  await st.recordPoll('ynet', { okAt: '2026-11-26T10:00:00.000Z' });
  await st.recordPoll('ynet', { okAt: '2026-11-26T09:00:00.000Z' });
  assert.equal((await st.get('ynet')).last_ok_at, '2026-11-26T10:00:00.000Z');
  await st.recordPoll('ynet', { error: 'FEED_FAILED:HTTP_500' });
  let y = await st.get('ynet');
  assert.equal(y.last_error, 'FEED_FAILED:HTTP_500'); assert.ok(y.last_error_at);
  assert.equal(y.last_ok_at, '2026-11-26T10:00:00.000Z');
  await st.recordPoll('ynet', { okAt: '2026-11-26T11:00:00.000Z' });
  y = await st.get('ynet');
  assert.equal(y.last_error, null); assert.equal(y.last_ok_at, '2026-11-26T11:00:00.000Z');
});
test('journal records actor and action', async () => {
  const db = await openDb();
  const st = createOutletState({ db, now: () => Date.parse('2026-11-26T08:00:00Z') });
  const off = await st.setEnabled('walla', false, 'owner:1');
  assert.equal(off.enabled, false);
  await st.setEnabled('walla', true, 'owner:1');
  const j = await dbAll(db, 'SELECT outlet_id, action, actor, at FROM news_outlet_journal ORDER BY id');
  assert.deepEqual(j.map(r => r.action), ['disable', 'enable']);
  assert.equal(j[0].actor, 'owner:1'); assert.equal(j[0].at, '2026-11-26T08:00:00.000Z');
  assert.equal((await st.get('walla')).enabled_at, '2026-11-26T08:00:00.000Z');
});
test('harvestable skips disabled and home_pc', async () => {
  const st = createOutletState({ db: await openDb() });
  await st.setEnabled('maariv', false, 'owner:1');
  const ids = (await st.harvestable(SOURCES)).map(s => s.outlet_id).sort();
  assert.deepEqual(ids, ['haaretz', 'n12', 'walla', 'ynet']);
});
