'use strict';
// The hourly poll follows the owner's switches (spec 2026-11-26 §4, §8; plan W1 Task 4).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openDb } = require('./helpers/newsDb.cjs');
const { createOutletState } = require('../db/newsOutletState');
const { createNewsHarvester } = require('../news/harvest/newsHarvest');
const { sourceFor } = require('../news/harvest/newsHarvestSources');

async function setup(t, { failYnet = false, onFeed = null } = {}) {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-outlet-state-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const clock = { now: Date.parse('2026-11-26T08:00:00Z') };
  const outletState = createOutletState({ db, now: () => clock.now });
  const asked = [];
  const fetchImpl = async url => {
    asked.push(url);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
    if (onFeed) await onFeed(url);
    if (url.includes('ynet.co.il') && failYnet) return new Response('down', { status: 500 });
    if (url.includes('c14.co.il')) return new Response('<title>Just a moment...</title>', { status: 403 });
    return new Response('<rss><channel></channel></rss>', { headers: { 'content-type': 'application/rss+xml' } });
  };
  const harvester = createNewsHarvester({ db, dataDir, fetchImpl, sources: [sourceFor('ynet'), sourceFor('walla'), sourceFor('c14')], delayMs: 0, now: () => clock.now, outletState });
  return { db, outletState, harvester, asked, clock };
}
const hits = (asked, host) => asked.filter(u => u.includes(host)).length;

test('home_pc outlet is not fetched by the server', async t => {
  const { harvester, asked } = await setup(t);
  const r = await harvester.poll();
  assert.equal(hits(asked, 'c14.co.il'), 0);
  assert.deepEqual(r.outlets.c14.errors, ['HOME_PC']);
});
test('disabled outlet reported, not fetched', async t => {
  const { harvester, asked, outletState } = await setup(t);
  await outletState.setEnabled('walla', false, 'owner:1');
  const r = await harvester.poll();
  assert.equal(hits(asked, 'walla.co.il'), 0);
  assert.deepEqual(r.outlets.walla.errors, ['DISABLED']);
  assert.ok(hits(asked, 'ynet.co.il') > 0);
});
test('disabled mid-way', async t => {
  let switched = false, st;
  const s = await setup(t, { onFeed: async url => { if (!switched && url.includes('ynet.co.il')) { switched = true; await st.setEnabled('walla', false, 'owner:1'); } } });
  st = s.outletState;
  const first = await s.harvester.poll();
  assert.ok(first.outlets.ynet, 'the poll finished');
  s.clock.now += 3600e3;
  const second = await s.harvester.poll();
  assert.deepEqual(second.outlets.walla.errors, ['DISABLED']);
});
test('feed ok sets last_ok_at, all feeds failing sets last_error', async t => {
  const { harvester, outletState } = await setup(t, { failYnet: true });
  await harvester.poll();
  const walla = await outletState.get('walla'), ynet = await outletState.get('ynet');
  assert.equal(walla.last_ok_at, '2026-11-26T08:00:00.000Z'); assert.equal(walla.last_error, null);
  assert.equal(ynet.last_ok_at, null); assert.match(ynet.last_error, /^FEED_FAILED/);
  assert.equal((await outletState.get('c14')).last_ok_at, null, 'the server never marks the home PC outlet fresh');
});
test('queued pages of a switched-off outlet do not take the poll\'s page slots', async t => {
  const db = await openDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-outlet-starve-'));
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); db.close(); });
  const outletState = createOutletState({ db, now: () => Date.parse('2026-11-26T08:00:00Z') });
  const asked = [];
  const fetchImpl = async url => { asked.push(url); return url.endsWith('/robots.txt') ? new Response('User-agent: *\nAllow: /') : new Response('<rss><channel></channel></rss>'); };
  const harvester = createNewsHarvester({ db, dataDir, fetchImpl, sources: [sourceFor('ynet'), sourceFor('walla')], delayMs: 0, now: () => Date.parse('2026-11-26T08:00:00Z'), outletState, limits: { pagesPerPoll: 2, pagesPerOutlet: 0 } });
  const ins = (k, outlet, url, at) => new Promise((res, rej) => db.run(`INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status) VALUES (?,?,?,?,'queued')`, ['na_' + k.repeat(24), outlet, url, at], e => e ? rej(e) : res()));
  await ins('1', 'walla', 'https://news.walla.co.il/item/3700011', '2026-11-26T06:00:00.000Z');
  await ins('2', 'walla', 'https://news.walla.co.il/item/3700012', '2026-11-26T06:01:00.000Z');
  await ins('3', 'ynet', 'https://www.ynet.co.il/news/article/fresh1', '2026-11-26T07:00:00.000Z');
  await outletState.setEnabled('walla', false, 'owner:1');
  await harvester.poll();
  assert.ok(asked.includes('https://www.ynet.co.il/news/article/fresh1'), 'the ynet page is read although older walla pages wait');
});
test('queued pages of a switched-off outlet are not fetched', async t => {
  const { db, harvester, asked, outletState } = await setup(t);
  await new Promise((res, rej) => db.run(`INSERT INTO news_harvest_items(url_key, outlet_id, url, first_seen_at, status) VALUES ('na_${'b'.repeat(24)}','walla','https://news.walla.co.il/item/3700001','2026-11-26T07:00:00.000Z','queued')`, e => e ? rej(e) : res()));
  await outletState.setEnabled('walla', false, 'owner:1');
  await harvester.poll();
  assert.equal(asked.filter(u => u.includes('3700001')).length, 0);
});
