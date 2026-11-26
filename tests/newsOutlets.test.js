'use strict';
// The outlet catalog (docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md §4, §7.1).
const test = require('node:test'), assert = require('node:assert/strict');
const Outlets = require('../public/js/news-outlets');

function luminance(hex) {
  const c = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

test('every outlet has a known group; local ones have a region; others none', () => {
  assert.deepEqual(Outlets.GROUPS, ['national', 'local', 'religious', 'haredi', 'economy_tech', 'science_env', 'society', 'radio']);
  for (const o of Outlets.OUTLETS) {
    assert.ok(Outlets.GROUPS.includes(o.group), o.id + ' group');
    if (o.group === 'local') assert.ok(Outlets.REGIONS.includes(o.region), o.id + ' region');
    else assert.equal(o.region, undefined, o.id + ' has no region');
    assert.ok(['A', 'B'].includes(o.priority), o.id + ' priority');
    assert.match(o.home, /^https:\/\//, o.id + ' home');
  }
});
test('colour passes AA with white text', () => {
  for (const o of Outlets.OUTLETS) assert.ok(1.05 / (luminance(o.color) + 0.05) >= 4.5, o.id + ' ' + o.color);
});
test('ids and domains are unique; mako news path still maps to n12', () => {
  const ids = Outlets.OUTLETS.map(o => o.id), domains = Outlets.OUTLETS.flatMap(o => o.domains);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(domains).size, domains.length);
  assert.equal(Outlets.outletForUrl('https://www.mako.co.il/news-military/x/Article-ab12.htm'), 'n12');
  assert.equal(Outlets.outletForUrl('https://www.mako.co.il/tv-home/x'), 'mako');
});
