'use strict';
// One screen for the day overview and every outlet (docs/superpowers/specs/2026-11-21-news-findability-design.md §7.3).
const test = require('node:test'), assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const UI = require('../public/js/news-ui');
const LU = require('../public/js/news-list-ui');

test('parseState/stateHref round-trip for all list params', () => {
  const href = '/news.html?outlet=ynet&day=2026-11-20&group=politics&ed=evening&kind=learn&story=S1&q=%D7%91%D7%97%D7%99%D7%A8%D7%95%D7%AA&sort=time';
  const s = UI.parseState(href.split('?')[1]);
  assert.deepEqual([s.view, s.outlet, s.day, s.group, s.ed, s.kind, s.story, s.q, s.sort], ['outlet', 'ynet', '2026-11-20', 'politics', 'evening', 'learn', 'S1', 'בחירות', 'time']);
  assert.equal(UI.stateHref(s), href);
  const ov = UI.parseState('view=overview&from=2026-11-01&to=2026-11-21&q=x');
  assert.equal(ov.view, 'overview'); assert.equal(UI.stateHref(ov), '/news.html?view=overview&from=2026-11-01&to=2026-11-21&q=x');
  assert.equal(UI.parseState('kind=junk&sort=junk').kind, 'all');
  assert.equal(UI.stateHref(UI.parseState('')), '/news.html', 'home stays home');
});
test('old archive URL maps to from/to', () => {
  const s = UI.parseState('outlet=ynet&tier=archive&q=abc&from=2026-11-01&to=2026-11-10');
  assert.equal(s.view, 'outlet'); assert.equal(s.q, 'abc'); assert.equal(s.from, '2026-11-01'); assert.equal(s.to, '2026-11-10');
  assert.equal(UI.stateHref(s), '/news.html?outlet=ynet&from=2026-11-01&to=2026-11-10&q=abc');
});
test('listUrl carries every filter and the cursor', () => {
  const url = LU.listUrl({ view: 'outlet', outlet: 'ynet', day: '2026-11-20', group: 'politics', ed: 'late', kind: 'slice', story: 'S', q: 'א', sort: 'match' }, 'CUR');
  const q = new URLSearchParams(url.split('?')[1]);
  assert.equal(url.split('?')[0], '/api/news/list');
  assert.deepEqual(Object.fromEntries(q), { outlet: 'ynet', day: '2026-11-20', group: 'politics', edition: 'late', kind: 'slice', story: 'S', q: 'א', sort: 'match', cursor: 'CUR' });
});

const learnRow = n => ({ item_key: 'na_l' + n, kind: 'learn', work_id: 'na_' + 'a'.repeat(24) + '.b1', outlet_id: 'ynet', title_he: 'כותרת ' + n, title_ru: 'Учебная ' + n });
const sliceRow = n => ({ item_key: 'na_s' + n, kind: 'slice', outlet_id: 'walla', title_he: 'כותרת ' + n, title_ru: 'Срез ' + n, story_key: 'S' + n, snippet: '…סניפט ' + n + '…' });
function ctxFor(document, responses, extra = {}) {
  const calls = [];
  const ctx = {
    t: (k, f) => f, locale: 'ru', heading: document.createElement('header'),
    getJson: (url, opts) => { calls.push({ url, signal: opts && opts.signal }); const r = responses.shift(); return r instanceof Error ? Promise.reject(r) : new Promise(res => setTimeout(() => res(r), 0)); },
    go: () => {}, replaceUrl: () => {}, isCurrent: () => true,
    renderItem: row => { const el = document.createElement('div'); el.className = 'nw-ov-item'; el.textContent = row.title_he; if (row.work_id) { const a = document.createElement('a'); a.className = 'nw-ov-read'; a.setAttribute('href', '/library.html?news=' + row.work_id); el.appendChild(a); } return el; },
    renderCard: card => { const el = document.createElement('article'); el.className = 'nw-card'; el.textContent = card.title_he; return el; },
    ...extra,
  };
  return { ctx, calls };
}
const page = (items, over = {}) => ({ ok: true, day: '2026-11-21', prev: '2026-11-20', next: null, counts: { learn: items.filter(i => i.kind === 'learn').length, slice: items.filter(i => i.kind === 'slice').length }, items, next_cursor: null, ...over });

test('render: learn and slice sections with counts; Read link only on learn rows', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([learnRow(1), learnRow(2), sliceRow(3)])]);
  const api = LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx);
  await api.ready;
  const heads = [...root.querySelectorAll('h2')].map(x => x.textContent);
  assert.deepEqual(heads, ['Учебные материалы · 2', 'Только в срезе · 1']);
  assert.equal(root.querySelectorAll('.nw-list-learn .nw-ov-read').length, 2);
  assert.equal(root.querySelectorAll('.nw-list-slice .nw-ov-read').length, 0);
  assert.match(root.querySelector('.nw-list-slice .nw-snippet').textContent, /סניפט 3/);
  assert.match(root.querySelector('.nw-kinds').textContent, /Учебные · 2/);
  assert.match(root.querySelector('.nw-kinds').textContent, /Все · 3/);
});
test('render: a study row with a card is drawn as the card', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([{ ...learnRow(1), card: { title_he: 'כרטיס', heavy: false } }])]);
  await LU.render(root, { view: 'outlet', outlet: 'ynet', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.equal(root.querySelector('.nw-list-learn .nw-card').textContent, 'כרטיס');
});
test('render: empty result says day and query', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([], { day: '2026-11-21' })]);
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh', q: 'שוםדבר' }, ctx).ready;
  const st = root.querySelector('.nw-list-empty').textContent;
  assert.match(st, /שוםדבר/); assert.match(st, /21 ноября|2026-11-21/);
});
test('search input aborts the previous request', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx, calls } = ctxFor(document, [page([]), page([]), page([])]);
  const api = LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx);
  await api.ready;
  api.search('א'); api.search('אב');
  await api.ready;
  assert.equal(calls.length, 3);
  assert.equal(calls[1].signal.aborted, true, 'the first search is cancelled');
  assert.equal(calls[2].signal.aborted, false);
  assert.match(decodeURIComponent(calls[2].url), /q=אב/);
});
test('render: next page appends rows into their sections', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx, calls } = ctxFor(document, [page([learnRow(1)], { next_cursor: 'C2', counts: { learn: 1, slice: 1 } }), page([sliceRow(2)], { counts: { learn: 1, slice: 1 } })]);
  const api = LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx);
  await api.ready;
  const more = root.querySelector('.nw-list-more');
  assert.equal(more.hidden, false);
  await api.more();
  assert.match(calls[1].url, /cursor=C2/);
  assert.equal(root.querySelectorAll('.nw-list-slice .nw-ov-item').length, 1);
  assert.equal(more.hidden, true);
});
test('render: a search shows the 45-day range instead of the day, and the empty text names it', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([], { day: null, prev: null, next: null, range: { from: '2026-10-07', to: '2026-11-21' } })]);
  await LU.render(root, { view: 'outlet', outlet: 'ynet', kind: 'all', sort: 'fresh', q: 'כנסת' }, ctx).ready;
  const nav = root.querySelector('.nw-ov-days').textContent;
  assert.match(nav, /7 октября/); assert.match(nav, /21 ноября/);
  assert.match(root.querySelector('.nw-list-empty').textContent, /7 октября.*21 ноября.*כנסת/);
});
test('listUrl sends a legacy section (old outlet links keep their rubric)', () => {
  assert.match(LU.listUrl({ view: 'outlet', outlet: 'walla', section: 'sport' }), /section=sport/);
  assert.equal(LU.activeFilters({ view: 'outlet', section: 'sport' }), 1);
});
test('render: while the index is being built the page says so, not «no articles»', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([], { building: true, day: null })]);
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.match(root.querySelector('.nw-list-empty').textContent, /собирается|строится/);
});
