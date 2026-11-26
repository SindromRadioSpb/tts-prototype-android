'use strict';
// W6: dot's instruction lists the outlet catalog from the code (spec 2026-11-26 §9).
const test = require('node:test'), assert = require('node:assert/strict');
const { createDotTask } = require('../news/newsDotTask');
const Outlets = require('../public/js/news-outlets');

test('the instruction ends with the outlet catalog: names, domains, groups', () => {
  const t = createDotTask({ read: () => '# Задание для dot\nОбновлено: 2026-11-26\n' }).get();
  assert.match(t.text, /## Издания каталога/);
  for (const o of Outlets.OUTLETS) assert.ok(t.text.includes(o.domains[0]), o.id);
  assert.match(t.text, /חי פה · Hai Po · haipo\.co\.il/);
  assert.match(t.text, /Местные: север/);
});
test('a catalog change gives a new version', () => {
  const a = createDotTask({ read: () => 'x' }).get().version;
  Outlets.OUTLETS.push({ id: 'zz', name_he: 'זז', name_latin: 'ZZ', color: '#333333', group: 'radio', priority: 'B', home: 'https://zz.example/', domains: ['zz.example'] });
  try { assert.notEqual(createDotTask({ read: () => 'x' }).get().version, a); } finally { Outlets.OUTLETS.pop(); }
});
