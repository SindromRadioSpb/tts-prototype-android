'use strict';
// The owner sorts dot's «Видео дня» into collections from its own tab beside «Главная / Все материалы / Темы / Подборки».
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../public/js/mediatheque-ui.js'), 'utf8');
const start = source.indexOf('function button(');
const end = source.indexOf('\nfunction ', source.indexOf('function sectionTabsHtml('));

function tabs(state, categories = [{ id: 'm_daily_video', title: 'Видео дня' }, { id: 'c1', title: 'C14' }]) {
  const context = { state: { space: 'public', section: 'home', owner: true, preview: false, filters: { category: '' }, ...state },
    structure: () => ({ categories }), t: k => k, esc: s => String(s) };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return vm.runInContext('sectionTabsHtml()', context);
}
const current = html => (html.match(/<button[^>]*aria-current="page"[^>]*>([^<]*)</g) || []).map(b => b.slice(b.lastIndexOf('>') + 1, -1));

test('the owner sees «Видео дня» as a tab of the public showcase', () => {
  const h = tabs({});
  assert.match(h, /data-action="daily-video"[^>]*>Видео дня</);
  assert.deepEqual(current(h), ['home']);
});
test('inside «Видео дня» its tab is current, not «Все материалы»', () => {
  assert.deepEqual(current(tabs({ section: 'catalog', filters: { category: 'm_daily_video' } })), ['Видео дня']);
  assert.deepEqual(current(tabs({ section: 'catalog', filters: { category: 'c1' } })), ['allMaterials']);
});
test('no tab for visitors, the preview, «Мои материалы» or a showcase without the category', () => {
  for (const s of [{ owner: false }, { preview: true }, { space: 'personal' }]) assert.doesNotMatch(tabs(s), /daily-video/, JSON.stringify(s));
  assert.doesNotMatch(tabs({}, [{ id: 'c1', title: 'C14' }]), /daily-video/);
});
