'use strict';
// 3.11.908 — a long text (≈1000 rows with interlinear, contextual layer and word status) on a phone.
// Bench: .tmp/plans/pfs.js (Studio) and pfr.js (Room), CPU ×4. Each rule below removed a measured stall;
// docs/planning/LONG_TABLE_PERF_2026_11_21.md has the numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { parseHTML } = require('linkedom');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('no :has() whose subject is <html> or <body> in the shipped stylesheets', () => {
  // The browser re-checks such a rule on every node inserted anywhere in the page; a long table inserts
  // tens of thousands of word spans → the whole document's style was recalculated again and again.
  const files = fs.readdirSync(path.join(__dirname, '..', 'public', 'css')).filter((f) => f.endsWith('.css')).map((f) => 'public/css/' + f);
  const bad = [];
  for (const f of files) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /(?:^|[\s,{>~+(])(?:html|body|:root)(?:\[[^\]]*\]|\.[\w-]+|:not\([^)]*\))*:has\(/g;
    let m; while ((m = re.exec(css))) bad.push(f + ': ' + css.slice(m.index, m.index + 60).trim());
  }
  const gouache = read('public/css/lp-gouache.css').replace(/\/\*[\s\S]*?\*\//g, '');
  // in lp-gouache.css the top-level nesting selector & is <html>
  const nested = gouache.match(/&(?::not\([^)]*\)|\.[\w-]+)*:has\(/g) || [];
  assert.deepEqual(bad, []);
  assert.deepEqual(nested, []);
});

test('word spans are real inline boxes, so a status colour does not re-lay out the table', () => {
  const css = read('public/css/reader-morph.css');
  assert.match(css, /\.rm-w \{ cursor: pointer; border-radius: 3px; padding-inline: \.01px; \}/);
  // the hover fade is for a mouse only (it animated every coloured word of a long text on a phone)
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\n  \.rm-w \{ transition: background-color/);
});

test('app-nav mirrors the body states the stylesheets need onto <html> and <body> classes', () => {
  const { document } = parseHTML('<html><head></head><body class="theme-dark lp-has-app-nav"></body></html>');
  const observers = [];
  class MO { constructor(fn) { this.fn = fn; observers.push(this); } observe(target, opts) { this.target = target; this.opts = opts; } disconnect() {} }
  const window = { document, addEventListener() {}, location: { pathname: '/library.html', hash: '' }, matchMedia: () => ({ matches: false }) };
  const ctx = vm.createContext({ window, document, MutationObserver: MO, WeakSet, setTimeout, localStorage: { getItem: () => null } });
  vm.runInContext(read('public/js/app-nav.js'), ctx);
  const root = document.documentElement.classList;
  assert.ok(root.contains('lp-b-night') && root.contains('lp-b-nav') && !root.contains('lp-b-day'));
  document.body.className = 'theme-light room-reading';
  window.LpAppNav.syncRootStates();
  assert.ok(root.contains('lp-b-day') && root.contains('lp-b-reading') && !root.contains('lp-b-night') && !root.contains('lp-b-nav'));
  // only the body's own class attribute and its direct children are watched
  const bodyWatch = observers.filter((o) => o.target === document.body);
  assert.ok(bodyWatch.length >= 2 && bodyWatch.every((o) => !o.opts.subtree));
});

function morphFixture(rowsN) {
  const { window: dw, document } = parseHTML('<html><body><div id="mount"><table id="proTable"><tbody>' +
    Array.from({ length: rowsN }, (_, i) => '<tr data-row-idx="' + i + '"><td data-col="niqqud">w' + i + '</td></tr>').join('') + '</tbody></table></div></body></html>');
  let ioCallback = null, hitTests = 0;
  document.elementsFromPoint = () => { hitTests++; return []; };
  class IO { constructor(fn) { ioCallback = fn; } observe() {} unobserve() {} disconnect() {} }
  const window = { document, addEventListener() {}, removeEventListener() {}, Event: dw.Event };
  const ctx = vm.createContext({ window, document, setTimeout, clearTimeout, IntersectionObserver: IO, WeakMap, performance: { now: () => Date.now() } });
  vm.runInContext(read('public/js/reader-morph.js'), ctx);
  const mount = document.getElementById('mount'), rows = Array.from(mount.querySelectorAll('tbody tr'));
  return { RM: window.ReaderMorph, mount, rows, show: (list) => ioCallback(list.map((r) => ({ target: r, isIntersecting: true }))), hitTests: () => hitTests };
}

test('row queues take the rows on screen from the browser observer, without hit testing', () => {
  const f = morphFixture(300);
  const seen = [];
  const queue = f.RM.createRowQueue(f.mount, f.rows, () => true, { onVisible: (list) => seen.push([...list].map((r) => r.getAttribute('data-row-idx'))) });
  assert.equal(f.hitTests(), 0, 'no hit test (a forced layout of the whole table) when an observer exists');
  f.show([f.rows[200], f.rows[201]]);
  assert.equal(queue.next(), f.rows[200], 'the row on screen goes first');
  // rows below the screen follow, then a few above: ready before they scroll in
  assert.deepEqual(seen[seen.length - 1], ['200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '199', '198', '197']);
  assert.equal(queue.hasPriority(), true);
  queue.close();
});

test('the Studio row work prepares the row on screen and its neighbours before the rest', async () => {
  const f = morphFixture(200);
  const prepared = [];
  const work = f.RM.createRowWork(f.mount, (row) => prepared.push(Number(row.getAttribute('data-row-idx'))), { rowSelector: '#proTable tbody tr[data-row-idx]' });
  assert.deepEqual(prepared, [0, 1, 2, 3, 4, 5, 6, 7], 'first screen synchronously');
  f.show([f.rows[150]]);
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(prepared.slice(8, 20), [150, 151, 152, 153, 154, 155, 156, 157, 158, 149, 148, 147]);
  assert.equal(await work.finish(), true);
  assert.equal(new Set(prepared).size, 200);
  assert.equal(work.state(), 'done');
});

test('sliced dictionary builders give exactly the synchronous result', async () => {
  const NA = require('../public/js/notes-autogen.js');
  const PS = require('../public/js/proclitic-segment.js');
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz'))).toString('utf8'));
  const paradigms = ds.paradigms.slice(0, 1500);
  let pauses = 0, calls = 0;
  const shouldYield = () => (++calls % 7) === 0, pause = () => { pauses++; return Promise.resolve(); };
  const flat = (maps) => Object.fromEntries(Object.entries(maps).map(([k, m]) => [k, Array.from(m.entries())]));
  assert.deepEqual(flat(await NA.buildResolverMapsAsync(paradigms, shouldYield, pause)), flat(NA.buildResolverMaps(paradigms)));
  const opts = { names: ['דוד'], func: ['של'], attested: { content: ['בית'], nominal: ['בית'] } };
  assert.deepEqual(await PS.buildLexiconAsync(paradigms, opts, shouldYield, pause), PS.buildLexicon(paradigms, opts));
  assert.ok(pauses > 0, 'the work was actually split');
});

test('a long table shows a row of interlinear only when the whole row is painted and near the screen', async () => {
  const { document, window: dw } = parseHTML('<html><body><div id="mount"><div class="reader-table-wrap"><table id="proTable"><tbody>' +
    Array.from({ length: 150 }, (_, i) => '<tr data-row-idx="' + i + '"><td data-col="niqqud">' +
      ['א', 'ב', 'ג'].map((w, k) => '<span class="rm-w" data-w-offset="' + k + '" data-surface="' + w + i + '" data-niqqud="' + w + i + '">' + w + i + '</span>').join(' ') +
      '</td><td data-col="ru">п' + i + '</td></tr>').join('') + '</tbody></table></div></div></body></html>');
  let io = null; const frames = [];
  class IO { constructor(fn) { io = fn; } observe() {} unobserve() {} disconnect() {} }
  document.elementsFromPoint = () => [];
  const window = { document, addEventListener() {}, removeEventListener() {}, Event: dw.Event, getComputedStyle: () => ({ overflowY: 'visible' }) };
  const ctx = vm.createContext({ window, document, setTimeout, clearTimeout, WeakMap, IntersectionObserver: IO,
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} }, getComputedStyle: () => ({ overflowY: 'visible' }),
    performance: { now: () => Date.now() }, fetch: () => { throw new Error('no network'); } });
  vm.runInContext(read('public/js/reader-morph.js'), ctx);
  vm.runInContext(read('public/js/word-gloss.js'), ctx);
  const gloss = window.WordGloss, mount = document.getElementById('mount'), rows = Array.from(mount.querySelectorAll('tbody tr'));
  rows.forEach((tr, i) => ['א', 'ב', 'ג'].forEach((w) => gloss._memo.set(w + i + '\u0001' + w + i, { meaning: 'слово', label: 'exact' })));
  const running = gloss.apply(mount, { gloss: true, strict: false, ai: false });
  io(rows.slice(0, 4).map((r) => ({ target: r, isIntersecting: true })));
  const drain = async () => { for (let k = 0; k < 400; k++) { await new Promise((r) => setTimeout(r, 0)); while (frames.length) frames.shift()(0); } };
  await Promise.race([running, drain()]); await drain();
  const pending = rows.filter((r) => r.classList.contains('rm-gloss-pending'));
  assert.ok(rows.slice(0, 4).every((r) => !r.classList.contains('rm-gloss-pending')), 'rows on screen (and painted) are shown');
  assert.ok(rows[60].querySelector('.rm-w').hasAttribute('data-gloss'), 'distant rows are painted');
  assert.ok(rows[60].classList.contains('rm-gloss-pending'), '…but stay hidden until they come near');
  assert.ok(pending.length > 100);
});
