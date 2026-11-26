'use strict';
// W4: the first wave of outlets from the research registry (spec 2026-11-26 §4; home-PC probe 2026-11-26).
const test = require('node:test'), assert = require('node:assert/strict');
const Outlets = require('../public/js/news-outlets');
const { SOURCES, sourceFor } = require('../news/harvest/newsHarvestSources');
const { openDb } = require('./helpers/newsDb.cjs');
const { createOutletState } = require('../db/newsOutletState');

const PASSED = ['hamakom', 'kipa', 'srugim', 'haipo', 'kikar', 'blinker', 'techtime', 'news08', 'geektime', 'hayadan', 'hmnews', 'zavit', 'colbo', 'hkn', 'kolhair'];
const CLOSED = ['makorrishon', 'israelhayom', 'zman', 'davar', 'mekomit', 'shakuf', 'the7eye', 'bhol'];

test('the catalog holds the registry wave: every group is represented', () => {
  assert.ok(Outlets.OUTLETS.length >= 40, 'outlets: ' + Outlets.OUTLETS.length);
  for (const g of Outlets.GROUPS) assert.ok(Outlets.OUTLETS.some(o => o.group === g), 'group ' + g);
  assert.deepEqual(Outlets.OUTLETS.filter(o => o.group === 'local').map(o => o.region).filter((v, i, a) => a.indexOf(v) === i).sort(), ['jerusalem', 'north', 'south']);
});
test('a new outlet with feeds reads them generically; its article pattern takes articles, not tag pages', () => {
  for (const id of [...PASSED, ...CLOSED]) {
    const s = sourceFor(id);
    assert.ok(s && s.generic && s.feeds.length, id);
    const host = Outlets.byId(id).domains[0];
    assert.ok(s.article.test('https://' + host + '/2026/11/26/some-article/'), id + ' article');
    assert.ok(!s.article.test('https://' + host + '/tag/haifa/'), id + ' tag');
    assert.equal(Outlets.outletForUrl('https://' + host + '/x/1'), id, id + ' domain');
  }
  assert.ok(SOURCES.every(s => Outlets.byId(s.outlet_id)), 'every source is in the catalog');
  assert.equal(Outlets.outletForUrl('https://www.maariv.co.il/news/article-1'), 'maariv');
  assert.equal(Outlets.outletForUrl('https://krayot.mynet.co.il/x'), 'mynetkrayot');
});
test('the passed outlets are in the slice with their probe; the closed ones wait, switched off, with theirs', async () => {
  const st = createOutletState({ db: await openDb() });
  for (const id of PASSED) { const o = await st.get(id); assert.equal(o.enabled, true, id); assert.equal(o.probe.pass, true, id); }
  for (const id of CLOSED) { const o = await st.get(id); assert.equal(o.enabled, false, id); assert.equal(o.probe.challenged, 1, id); }
  const kan = await st.get('kan');
  assert.equal(kan.enabled, false); assert.equal(sourceFor('kan'), null, 'no feed found yet: not connected');
});
