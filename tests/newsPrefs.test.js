'use strict';
// W5: a reader's outlets in the browser (spec 2026-11-26 §7).
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../public/js/news-prefs');

const memStore = (init = {}) => { const m = Object.assign({}, init); return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = String(v); }, _m: m }; };
const KNOWN = ['ynet', 'walla', 'haipo', 'kikar', 'c14', 'geektime'];
const SHOWN = [{ outlet_id: 'ynet' }, { outlet_id: 'walla' }, { outlet_id: 'haipo' }, { outlet_id: 'kikar' }, { outlet_id: 'c14' }];

test('broken stored prefs fall back to defaults; old pins move into «мои» once', () => {
  assert.deepEqual(P.load(memStore({ lp_news_prefs_v1: '{not json' }), KNOWN), { v: 1, mine: [], hidden: [], collapsed: [], overview: 'all' });
  const s = memStore({ lp_news_pinned_v1: JSON.stringify(['haipo', 'gone', 'ynet']) });
  assert.deepEqual(P.load(s, KNOWN).mine, ['haipo', 'ynet']);
  assert.ok(s._m.lp_news_prefs_v1, 'saved in the new key');
  s.set('lp_news_pinned_v1', JSON.stringify(['walla']));
  assert.deepEqual(P.load(s, KNOWN).mine, ['haipo', 'ynet'], 'the old key is read only once');
});
test('three states and the order of «мои»', () => {
  let p = P.normalize({}, KNOWN);
  p = P.setState(p, 'haipo', 'mine'); p = P.setState(p, 'ynet', 'mine'); p = P.setState(p, 'kikar', 'hidden');
  assert.deepEqual([p.mine, p.hidden], [['haipo', 'ynet'], ['kikar']]);
  p = P.move(p, 'ynet', -1);
  assert.deepEqual(p.mine, ['ynet', 'haipo']);
  p = P.move(p, 'ynet', -1);
  assert.deepEqual(p.mine, ['ynet', 'haipo'], 'the first stays first');
  p = P.setState(p, 'kikar', 'mine');
  assert.deepEqual([p.mine, p.hidden], [['ynet', 'haipo', 'kikar'], []], 'one state at a time');
  p = P.setState(p, 'haipo', 'shown');
  assert.deepEqual(p.mine, ['ynet', 'kikar']);
  assert.equal(P.stateOf(p, 'kikar'), 'mine'); assert.equal(P.stateOf(p, 'walla'), 'shown');
});
test('prefs ignore outlets that are not shown; the list asks only for what is visible', () => {
  const p = P.normalize({ mine: ['geektime', 'haipo'], hidden: ['kikar'] }, KNOWN);
  assert.deepEqual(P.visible(p, SHOWN, 'mine').map(o => o.outlet_id), ['haipo'], 'geektime is switched off by the owner');
  assert.deepEqual(P.visible(p, SHOWN, 'all').map(o => o.outlet_id), ['ynet', 'walla', 'haipo', 'c14']);
  assert.deepEqual(P.outletsParam(p, SHOWN, 'mine'), ['haipo']);
  assert.deepEqual(P.outletsParam(p, SHOWN, 'all'), ['ynet', 'walla', 'haipo', 'c14']);
  assert.equal(P.outletsParam(P.normalize({}, KNOWN), SHOWN, 'all'), null, 'nothing hidden: no filter at all');
});
test('an outlet switched on in the last week is «new»', () => {
  const now = Date.parse('2026-11-30T08:00:00Z');
  assert.equal(P.isNew({ enabled_at: '2026-11-26T05:30:00.000Z' }, now), true);
  assert.equal(P.isNew({ enabled_at: '2026-11-18T05:30:00.000Z' }, now), false);
  assert.equal(P.isNew({ enabled_at: null }, now), false);
});
