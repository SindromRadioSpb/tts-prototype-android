'use strict';
// Topic page (spec 2026-11-28-mediatheque-topic-page): collections rail above the list, the pager belongs to the list,
// a quiet card, the PC side panel, the phone topic button and the in-topic search.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const C = require('../public/js/mediatheque-core');
const P = require('../public/js/mediatheque-placement');
const source = fs.readFileSync(path.resolve(__dirname, '../public/js/mediatheque-ui.js'), 'utf8');
const slice = (from, to) => { const a = source.indexOf(from); assert.ok(a >= 0, from); return source.slice(a, source.indexOf(to, a)); };
const O = { publicOnly: true };
const ref = n => ({ kind: 'public', slug: 'media-0123456789abcdef0123', workId: 'w' + n, snapshotHash: String(n % 10).repeat(64) });
const row = n => ({ ref: ref(n), title: 'Материал ' + n, media: { kind: 'video', videoId: 'v' + n, durationSeconds: 60 }, position_no: n });

// kan: n materials (yt_ channel) with `series` collections; films: a plain topic with 2 materials and a subtopic.
function build({ n = 95, series = 2, films: withFilms = true } = {}) {
  let s = C.empty();
  s = C.command(s, { type: 'category.create', id: 'yt_kan', title: 'כאן 11' }, O);
  if (withFilms) s = C.command(s, { type: 'category.create', id: 'films', title: 'Films' }, O);
  if (withFilms) s = C.command(s, { type: 'category.create', id: 'films_old', title: 'Старое кино', parentId: 'films' }, O);
  const kan = [], films = [];
  for (let i = 1; i <= n; i++) kan.push(ref(i));
  for (let i = 1; i <= 2; i++) films.push(ref(1000 + i));
  s = C.command(s, { type: 'items.add', target: 'category', id: 'yt_kan', references: kan }, O);
  if (withFilms) s = C.command(s, { type: 'items.add', target: 'category', id: 'films', references: films }, O);
  if (withFilms) s = C.command(s, { type: 'items.add', target: 'category', id: 'films_old', references: [ref(1003)] }, O);
  for (let j = 1; j <= series; j++) {
    s = C.command(s, { type: 'collection.create', id: 'ser' + j, title: 'Подборка ' + j, categoryId: 'yt_kan' }, O);
    s = C.command(s, { type: 'items.add', target: 'collection', id: 'ser' + j, references: [ref(j)] }, O);
  }
  const rows = [...Array.from({ length: n }, (_, i) => row(i + 1)), row(1001), row(1002), row(1003)];
  return { s, rows };
}
function ui(opts = {}, st = {}) {
  const { s, rows } = build(opts);
  const state = { space: 'public', section: 'catalog', filters: C.filters({ category: 'yt_kan' }), personal: { structure: C.empty() },
    published: { structure: s, items: rows }, draft: null, localItems: [], localReady: true, owner: false, editing: false, preview: false,
    selected: new Set(), page: 1, viewId: '', topicSearch: '', expanded: new Set(), ...st };
  if (st.filters) state.filters = C.filters(st.filters);
  const context = { C, P, state, URLSearchParams, URL, CSS: { escape: x => x }, location: { origin: 'https://x', pathname: '/mediatheque.html', search: '' },
    tutorEnabled: true, topicCounts: new Map(), topicSamples: new Map(), projectionInputs: [],
    t: (k, v) => k + (v ? JSON.stringify(v) : ''), esc: x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
  vm.createContext(context);
  for (const [a, b] of [['function documentState(', 'function personalMaterial('], ['function rebuild(', '\nlet localLoadEpoch'],
    ['const managed = ', 'function changedFields('], ['function duration(', '\nfunction topicsHtml('], ['const canPlace = ', '\nconst placeStructure']])
    vm.runInContext(slice(a, b), context);
  vm.runInContext('rebuild()', context);
  return code => vm.runInContext(code, context);
}
const at = (html, needle) => html.indexOf(needle);

test('pageRange clamps the last page to the total', () => {
  const run = ui();
  assert.deepEqual({ ...run('pageRange(3,36,95)') }, { from: 73, to: 95 });
  assert.deepEqual({ ...run('pageRange(1,36,95)') }, { from: 1, to: 36 });
});
test('topic page: collections rail, then the list with a pager above and below it', () => {
  const html = ui()('catalogHtml()');
  const rail = at(html, 'ml-channel-rail'), list = at(html, 'class="ml-materials"'), first = at(html, 'ml-pager'), last = html.lastIndexOf('ml-pager');
  assert.ok(rail > 0 && list > 0, 'rail and list exist');
  assert.ok(rail < first && first < list && list < last, `rail ${rail} < top pager ${first} < list ${list} < bottom pager ${last}`);
  assert.ok(html.includes('pageRange{&quot;from&quot;:1,&quot;to&quot;:36,&quot;total&quot;:95}'), 'range 1–36 of 95');
  assert.ok(html.includes('allSeries{&quot;count&quot;:2}'), 'link to all 2 collections');
});
test('the rail shows every collection of the topic, not only twelve', () => {
  const html = ui({ series: 14 })('catalogHtml()');
  assert.equal((html.slice(at(html, 'ml-channel-rail'), at(html, 'id="ml-results"')).match(/class="ml-collection"/g) || []).length, 14);
});
test('a short topic has no pager; a topic without collections has no rail', () => {
  const html = ui({ n: 30, series: 0 })('catalogHtml()');
  assert.doesNotMatch(html, /ml-pager/);
  assert.doesNotMatch(html, /ml-channel-rail/);
});
test('inside a collection there is no rail', () => {
  assert.doesNotMatch(ui({}, { filters: { collection: 'ser1' } })('catalogHtml()'), /ml-channel-rail/);
});

const footer = (html, key) => { const a = html.indexOf(`data-key="${key}"`); const art = html.lastIndexOf('<article', a); return html.slice(html.indexOf('ml-item-footer', art), html.indexOf('</article>', art)); };
test('a quiet card: «Изучать» and a «⋯» menu holding share, add-to-collection and the tutor', () => {
  const run = ui({ n: 3, series: 0 });
  const html = run('itemHtml(state.prepared.byKey.get(C.refKey(' + JSON.stringify(ref(1)) + ')))');
  const f = footer(html, C.refKey(ref(1)));
  const menu = f.slice(f.indexOf('ml-more-menu'));
  assert.match(f, /class="ml-open"/);
  assert.match(f, /<details class="ml-more"><summary aria-label="moreActions"/);
  for (const needle of ['data-action="share-link"', 'data-action="add-item"', 'class="ml-tutor"']) {
    assert.ok(menu.includes(needle), needle + ' inside the menu');
    assert.ok(!f.slice(0, f.indexOf('ml-more-menu')).includes(needle), needle + ' not outside the menu');
  }
});
test('the owner keeps «Разложить» visible; the editor keeps its own footer without the menu', () => {
  const owner = ui({ n: 3, series: 0 }, { owner: true })('itemHtml(state.prepared.byKey.get(C.refKey(' + JSON.stringify(ref(1)) + ')))');
  const f = footer(owner, C.refKey(ref(1)));
  assert.ok(f.indexOf('data-action="place-item"') >= 0 && f.indexOf('data-action="place-item"') < f.indexOf('ml-more'), '«Разложить» before the menu');
  const run = ui({ n: 3, series: 0 }, { owner: true, editing: true });
  run('state.draft = state.published');
  assert.doesNotMatch(run('itemHtml(state.prepared.byKey.get(C.refKey(' + JSON.stringify(ref(1)) + ')))'), /ml-more/);
});

const side = html => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
test('side panel: «Каналы» and «Темы» groups with material counts', () => {
  const html = side(ui()('catalogHtml()'));
  const ch = html.indexOf('sideChannels'), tp = html.indexOf('sideTopics');
  assert.ok(ch > 0 && tp > ch, 'channels group, then topics group');
  assert.ok(html.indexOf('כאן 11') > ch && html.indexOf('כאן 11') < tp, 'yt_ topic is a channel');
  assert.ok(html.indexOf('Films') > tp, 'plain topic is under «Темы»');
  assert.match(html, /כאן 11<\/span><small>95<\/small>/);
  assert.match(html, /Films<\/span><small>3<\/small>/);
});
test('side panel: the selected topic lists its subtopics and collections; the open collection is current', () => {
  const kan = side(ui({}, { filters: { collection: 'ser2', category: 'yt_kan' } })('catalogHtml()'));
  const sub = kan.slice(kan.indexOf('ml-side-sub'));
  assert.ok(kan.indexOf('ml-side-sub') > 0);
  assert.match(sub, /Подборка 1<\/span><small>1<\/small>/);
  assert.match(sub, /aria-current="page"[^>]*><span dir="auto">Подборка 2/);
  const films = side(ui({}, { filters: { category: 'films' } })('catalogHtml()'));
  assert.match(films.slice(films.indexOf('ml-side-sub')), /Старое кино/);
  assert.doesNotMatch(side(ui()('catalogHtml()')).slice(side(ui()('catalogHtml()')).indexOf('sideTopics')), /ml-side-sub/, 'Films is closed while כאן 11 is open');
});
test('side panel: a group without topics is left out; «Мои материалы» keeps one list', () => {
  assert.doesNotMatch(side(ui({ n: 3, series: 0, films: false })('catalogHtml()')), /sideTopics/);
  const personal = ui({ n: 3, series: 0 }, { space: 'personal' });
  personal('state.personal = { structure: state.published.structure }; state.localItems = []; projectionInputs = []; rebuild()');
  assert.doesNotMatch(side(personal('catalogHtml()')), /sideChannels|sideTopics/);
});

test('phone: the «Темы и фильтры» button names the open topic', () => {
  assert.ok(ui()('filtersHtml()').includes('topicButton{&quot;title&quot;:&quot;כאן 11&quot;}'));
  assert.match(ui({}, { filters: {} })('filtersHtml()'), /data-action="open-filters"[^>]*>topicsAndFilters</);
});
test('search inside the topic or collection names its scope; «Все материалы» has none', () => {
  const topic = ui()('catalogHtml()'), coll = ui({}, { filters: { collection: 'ser1' } })('catalogHtml()');
  assert.match(topic, /id="ml-scope-search"/);
  assert.ok(topic.includes('searchIn{&quot;title&quot;:&quot;כאן 11&quot;}'));
  assert.ok(coll.includes('searchIn{&quot;title&quot;:&quot;Подборка 1&quot;}'));
  assert.ok(topic.indexOf('ml-scope-search') < topic.indexOf('class="ml-materials"'), 'the field sits above the list');
  assert.doesNotMatch(ui({}, { filters: {} })('catalogHtml()'), /ml-scope-search/);
});

// Final review fixes. Real navigation into a collection clears `category` (the link is { collection } only).
test('a collection opened from the rail keeps its topic unfolded in the side panel, the breadcrumbs and the phone button', () => {
  const run = ui({}, { filters: { collection: 'ser2' } });
  const html = run('catalogHtml()'), s = side(html);
  assert.ok(s.indexOf('ml-side-sub') > 0, 'topic stays unfolded');
  assert.match(s.slice(s.indexOf('ml-side-sub')), /aria-current="page"[^>]*><span dir="auto">Подборка 2/);
  assert.match(html.slice(html.indexOf('ml-breadcrumbs'), html.indexOf('</nav>', html.indexOf('ml-breadcrumbs'))), /כאן 11/);
  assert.ok(run('filtersHtml()').includes('topicButton{&quot;title&quot;:&quot;כאן 11&quot;}'));
});
test('closing a «⋯» menu moves focus from its item back to its «⋯»', () => {
  const ctx = { focused: null };
  const summary = { focus: () => { ctx.focused = 'summary'; } };
  const menu = { open: true, contains: () => true, querySelector: () => summary };
  ctx.document = { activeElement: {}, querySelectorAll: () => [menu] };
  vm.createContext(ctx); vm.runInContext(slice('function closeMoreMenus(', '\ndocument.addEventListener'), ctx);
  vm.runInContext('closeMoreMenus(null)', ctx);
  assert.equal(menu.open, false); assert.equal(ctx.focused, 'summary');
});
test('topic search: matches of topics and collections render below the field, not above it', () => {
  const run = ui({}, { filters: { category: 'yt_kan', q: 'Подборка' } });
  const html = run('catalogHtml()');
  assert.ok(html.indexOf('ml-navmatches') > html.indexOf('id="ml-scope-search"'), 'navmatches after the scope field');
});
test('outside taps close the menu on pointerdown (iOS does not deliver click on plain elements)', () => {
  assert.match(source, /addEventListener\('pointerdown', event => \{[^}]*closeMoreMenus/);
});
