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
test('render: a shortened text-search window is said under the search box', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([sliceRow(1)], { body_search_from: '2026-11-11' })]);
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.match(root.querySelector('.nw-search-note').textContent, /11 ноября/);
});

// ---- W4: tags, ★, reads on the rows ---------------------------------------------------------------------
function marksCtx(over = {}) {
  const sent = [], state = { na_s1: [] };
  return { sent, api: { signedIn: true, ok: true, marksOf: r => (r.marks || state[r.item_key] || []), isRead: r => !!r.read,
    toggle: async (r, tag) => { sent.push([r.item_key, tag]); const cur = state[r.item_key] || []; state[r.item_key] = cur.includes(tag) ? cur.filter(x => x !== tag) : cur.concat(tag); return state[r.item_key]; },
    tags: async () => [{ tag: 'выборы', n: 2 }, { tag: '★', n: 1 }], read: async () => {}, keysWith: () => [], ...over } };
}
test('star toggles and is sent to the server for a signed-in user', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r'), m = marksCtx();
  const { ctx } = ctxFor(document, [page([sliceRow(1)])], { marks: m.api });
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  const star = root.querySelector('.nw-star');
  assert.equal(star.getAttribute('aria-pressed'), 'false');
  star.click(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(m.sent, [['na_s1', '★']]);
  const after = root.querySelector('.nw-star');
  assert.equal(after.getAttribute('aria-pressed'), 'true'); assert.equal(after.textContent, '★');
});
test('a read row says so', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([{ ...sliceRow(1), read: true }])], { marks: marksCtx().api });
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.match(root.querySelector('.nw-read-mark').textContent, /прочитано/);
});
test('blocked storage shows the honest note', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([sliceRow(1)])], { marks: marksCtx({ signedIn: false, ok: false }).api });
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.match(root.querySelector('.nw-marks-note').textContent, /не сохраняются/);
});
test('tag filter in the sheet lists the user\'s tags with counts; listUrl sends star/tag for a signed-in user, keys for a visitor', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([sliceRow(1)])], { marks: marksCtx().api });
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  await new Promise(r => setTimeout(r, 0));
  const opts = [...root.querySelectorAll('.nw-sheet select[name="tag"] option')].map(o => o.textContent);
  assert.deepEqual(opts, ['Все отметки', 'выборы · 2']);
  assert.match(LU.listUrl({ view: 'overview', star: true, tag: 'выборы' }), /star=1&tag=/);
  assert.match(LU.listUrl({ view: 'overview', star: true }, null, ['na_1', 'na_2']), /keys=na_1%2Cna_2/);
  assert.doesNotMatch(LU.listUrl({ view: 'overview', star: true }, null, ['na_1']), /star=/);
});

// ---- W5: owner orders from the feed ----------------------------------------------------------------------
const orderable = n => ({ ...sliceRow(n), full_ok: 1, body_until: '2099-01-01T00:00:00.000Z' });
test('order button only for owner/editor; a click orders and shows the status', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r'), sent = [];
  const { ctx } = ctxFor(document, [page([orderable(1)])]);
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.equal(root.querySelector('.nw-order-btn'), null, 'a reader has no order button');
  const root2 = document.createElement('main'); document.body.appendChild(root2);
  const c2 = ctxFor(document, [page([orderable(2)])], { orders: { order: async r => { sent.push(r.item_key); return { created: [{ status: 'open' }], skipped: [] }; }, orderTag: async () => ({}) } }).ctx;
  await LU.render(root2, { view: 'overview', kind: 'all', sort: 'fresh' }, c2).ready;
  root2.querySelector('.nw-order-btn').click(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(sent, ['na_s2']);
  assert.match(root2.querySelector('.nw-order-status').textContent, /заказано/);
});
test('order status badge with reason', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const { ctx } = ctxFor(document, [page([{ ...orderable(1), order: { status: 'failed', reason: 'Слишком коротко' } }])], { orders: { order: async () => ({}), orderTag: async () => ({}) } });
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.match(root.querySelector('.nw-order-status').textContent, /отказ.*Слишком коротко/);
  assert.equal(root.querySelector('.nw-order-btn'), null, 'already ordered');
});
test('tag order dialog sends tag and date range and shows skipped reasons', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r'), sent = [];
  const { ctx } = ctxFor(document, [page([orderable(1)], { day: '2026-11-21' })], { marks: marksCtx().api,
    orders: { order: async () => ({}), orderTag: async p => { sent.push(p); return { created: [{}, {}], skipped: [{ item_key: 'na_x', reason: 'ALREADY_LEARNING' }] }; } } });
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh', tag: 'выборы' }, ctx).ready;
  root.querySelector('.nw-order-tag').click(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(sent, [{ tag: 'выборы', from: '2026-11-21', to: '2026-11-21' }]);
  assert.match(root.querySelector('.nw-order-tag-result').textContent, /Заказано: 2.*пропущено: 1/);
});
test('review W5 I3: order reasons are words, not codes; a local skip is not «отказ dot»', async () => {
  const { document } = parseHTML('<html><body><main id="r"></main></body></html>');
  const root = document.getElementById('r');
  const tr = { 'news.list.skip.ARCHIVE_PHOTOS_UNAVAILABLE': 'фото издания недоступны', 'news.list.skip.ALREADY_ORDERED': 'уже заказана' };
  const { ctx } = ctxFor(document, [page([{ ...orderable(1), order: { status: 'open', reason: 'ARCHIVE_PHOTOS_UNAVAILABLE' } }, orderable(2)])],
    { t: (k, f) => tr[k] || f, orders: { order: async () => ({ created: [], skipped: [{ item_key: 'na_s2', reason: 'ALREADY_ORDERED' }] }), orderTag: async () => ({}) } });
  await LU.render(root, { view: 'overview', kind: 'all', sort: 'fresh' }, ctx).ready;
  assert.match(root.querySelector('.nw-order-status').textContent, /фото издания недоступны/);
  root.querySelector('.nw-order-btn').click(); await new Promise(r => setTimeout(r, 0));
  const second = [...root.querySelectorAll('.nw-order-status')][1].textContent;
  assert.match(second, /не заказано: уже заказана/); assert.doesNotMatch(second, /отказ/);
});
