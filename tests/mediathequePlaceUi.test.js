'use strict';
// «Разложить» on the page (spec 2026-11-28): the tree of topics with nested collections, the badge, who sees the button.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const C = require('../public/js/mediatheque-core');
const P = require('../public/js/mediatheque-placement');
const source = fs.readFileSync(path.resolve(__dirname, '../public/js/mediatheque-ui.js'), 'utf8');
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const O = { publicOnly: true };
const ref = n => ({ kind: 'public', slug: 'media-0123456789abcdef0123', workId: 'w' + n, snapshotHash: String(n).repeat(64) });
function structure() {
  let s = C.empty();
  s = C.command(s, { type: 'category.create', id: P.DAILY_ID, title: 'Видео дня' }, O);
  s = C.command(s, { type: 'category.create', id: 'c14', title: 'C14' }, O);
  s = C.command(s, { type: 'category.create', id: 'kan', title: 'כאן 11' }, O);
  s = C.command(s, { type: 'collection.create', id: 'intv', title: 'Интервью разные', categoryId: 'c14' }, O);
  s = C.command(s, { type: 'collection.create', id: 'yiye', title: 'יהיה טוב', categoryId: 'kan' }, O);
  s = C.command(s, { type: 'collection.create', id: 'loose', title: 'Сборник' }, O);
  for (const n of [1, 2]) s = C.command(s, { type: 'items.add', target: 'category', id: P.DAILY_ID, references: [ref(n)] }, O);
  return P.place(s, ref(1), { places: [{ type: 'category', id: 'c14' }, { type: 'collection', id: 'intv' }] }, C, O);
}
function ui(state = {}) {
  const s = structure();
  const context = { C, P, CSS: { escape: x => x }, state: { space: 'public', owner: true, preview: false, editing: false, section: 'catalog', filters: { category: P.DAILY_ID }, ...state },
    structure: () => s, t: (k, v) => k + (v ? JSON.stringify(v) : ''), esc: x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
  vm.createContext(context);
  vm.runInContext(slice('function button(', '\n// The owner sorts'), context);
  vm.runInContext(slice('const canPlace = ', '\nconst placeStructure'), context);
  return { context, s, run: code => vm.runInContext(code, context) };
}
const k = n => C.refKey(ref(n));
const draft = (checked = [], query = '', create = []) => ({ checked: new Set(checked), query, create });

test('the tree nests collections under their topic and leaves the inboxes out', () => {
  const { context, s } = ui();
  context.d = s; context.dr = draft(['category:c14', 'collection:intv']);
  const html = vm.runInContext('placeTreeHtml(d, dr)', context);
  assert.doesNotMatch(html, /m_daily_video/);
  const order = ['category:c14', 'collection:intv', 'category:kan', 'collection:yiye', 'collection:loose'].map(x => html.indexOf('data-place="' + x + '"'));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'C14 → Интервью → כאן 11 → יהיה טוב → без темы: ' + order);
  assert.match(html, /data-place="collection:intv" checked/); assert.match(html, /data-place="category:c14" checked/);
  assert.doesNotMatch(html, /data-place="category:kan" checked/);
  assert.match(html, /place\.noTopic/); assert.match(html, /data-action="place-new"[^>]*data-type="category"/);
  assert.match(html, /data-type="collection" data-topic="kan"/);
});
test('search narrows the tree; a topic hit keeps its collections; checked places stay visible', () => {
  const { context, s } = ui();
  context.d = s;
  context.dr = draft([], 'טוב'); let html = vm.runInContext('placeTreeHtml(d, dr)', context);
  assert.match(html, /collection:yiye/); assert.match(html, /category:kan/, 'its topic is shown as the group head'); assert.doesNotMatch(html, /category:c14/);
  context.dr = draft([], 'c14'); html = vm.runInContext('placeTreeHtml(d, dr)', context);
  assert.match(html, /collection:intv/); assert.doesNotMatch(html, /collection:yiye/);
  context.dr = draft(['collection:loose'], 'zzz'); html = vm.runInContext('placeTreeHtml(d, dr)', context);
  assert.match(html, /collection:loose/); assert.doesNotMatch(html, /place\.nothingFound/);
  context.dr = draft([], 'zzz'); assert.match(vm.runInContext('placeTreeHtml(d, dr)', context), /place\.nothingFound/);
});
test('new topic and new collection rows render as inputs, checked', () => {
  const { context, s } = ui();
  context.d = s;
  context.dr = draft(['category:n1', 'collection:n2'], '', [{ tempId: 'n1', type: 'category', title: 'Хеврон' }, { tempId: 'n2', type: 'collection', title: '', categoryId: 'n1' }]);
  const html = vm.runInContext('placeTreeHtml(d, dr)', context);
  assert.match(html, /data-place="category:n1" checked><input name="new-n1"[^>]*value="Хеврон"/);
  assert.match(html, /data-place="collection:n2" checked><input name="new-n2"/);
  assert.ok(html.indexOf('new-n2') > html.indexOf('new-n1'), 'the new collection sits under its new topic');
});
test('badge: «Разложено» with the label, «Не разобрано» otherwise; only in the inboxes', () => {
  const { run, context } = ui();
  context.a = { key: k(1) }; context.b = { key: k(2) };
  assert.match(run('placeBadgeHtml(a)'), /data-placed="true"[^>]*>place\.placed\{&quot;places&quot;:&quot;C14 \/ Интервью разные&quot;\}/);
  assert.match(run('placeBadgeHtml(b)'), /data-placed="false"[^>]*>place\.unplaced/);
  context.state.filters = { category: 'c14' }; assert.equal(run('placeBadgeHtml(b)'), '');
});
test('only the owner outside the preview and the editor can place', () => {
  for (const [s, want] of [[{}, true], [{ owner: false }, false], [{ preview: true }, false], [{ editing: true }, false], [{ space: 'personal' }, false]])
    assert.equal(ui(s).run('canPlace()'), want, JSON.stringify(s));
});
