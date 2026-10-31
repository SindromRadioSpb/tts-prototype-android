'use strict';
// Engineering atlas in the Reading Room: data route, reader module wiring, locales, service worker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('atlas data is served from the data volume before public static files', () => {
  const server = read('server.js');
  const route = server.indexOf("app.use('/data/atlas', express.static(path.join(DATA_DIR, 'atlas')");
  assert.ok(route > 0, 'route /data/atlas from DATA_DIR/atlas');
  assert.ok(route < server.indexOf('app.use(express.static(path.join(__dirname, "public")'), 'volume route wins over public');
  const block = server.slice(route, route + 600);
  assert.match(block, /fallthrough: true/);
  assert.match(block, /immutable/);           // sha-named images never change
  assert.match(block, /max-age=300/);         // section JSON is re-published
});

// ---- reader rendering (linkedom) ----
const { parseHTML } = require('linkedom');
const fixture = (name) => JSON.parse(read('tests/fixtures/atlas/' + name));

function env() {
  const { document, window } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  return { document, window, R: api.factory(document), T: (k, fb) => fb };
}

test('home lists sections by part with honest translation state and a page jump', () => {
  const { R, T } = env();
  let opened = null;
  const home = R.renderHome(T, fixture('index.json'), (id, page) => { opened = [id, page]; });
  const buttons = home.querySelectorAll('.atlas-section-btn');
  assert.equal(buttons.length, 2);
  assert.match(home.textContent, /переведено/);
  assert.match(home.textContent, /без перевода/);
  const form = home.querySelector('.atlas-jump');
  form.querySelector('input').value = '197';
  form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit'));
  assert.deepEqual(opened, ['s09-belt', 197]);
});

test('translated section: rows, MathML formula with variables, figure regions, pending status', () => {
  const { R, T } = env();
  const section = R.renderSection(T, fixture('s09-belt.json'), {});
  assert.ok(section.querySelector('#atlas-p197'));
  const row = section.querySelector('.atlas-row');
  assert.equal(row.querySelector('.atlas-he').getAttribute('dir'), 'rtl');
  assert.ok(row.querySelector('.atlas-ru').textContent.length > 0);
  assert.ok(section.querySelector('.atlas-math math'), 'build-time MathML is inserted');
  assert.ok(section.querySelectorAll('.atlas-vars tr').length > 0);
  assert.ok(section.querySelector('.atlas-rg[data-region]'));
  assert.match(section.textContent, /ждёт вычитки/);
  assert.match(section.textContent, /Словарь раздела/);
});

test('every figure region is a numbered pin; the labels live in the legend (no text over the scan)', () => {
  const { R, T } = env();
  const data = fixture('s09-belt.json');
  data.pages[0].figures[0].regions = data.pages[0].figures[0].regions.slice(0, 2);   // even a sparse figure
  const section = R.renderSection(T, data, {});
  const fig = section.querySelector('figure[data-ref="' + data.pages[0].figures[0].id + '"]');
  const pins = fig.querySelectorAll('.atlas-rg i');
  assert.equal(pins.length, 2);
  pins.forEach((p) => assert.ok(p.classList.contains('n')));
  assert.equal(fig.querySelectorAll('.atlas-regions li').length, 2);
  assert.equal(section.querySelectorAll('.atlas-rg i:not(.n)').length, 0);
});

// ---- acceptance report 2026-10-30 (docs/research/engineering-atlas/acceptance/) ----
test('R01: a crowded figure shows numbers on the picture and the labels in the legend', () => {
  const { R, T } = env();
  const section = R.renderSection(T, fixture('s09-belt.json'), {});
  const marks = section.querySelectorAll('.atlas-rg i');
  assert.ok(marks.length >= 4);
  marks.forEach((m) => assert.ok(m.classList.contains('n'), 'numbered marker'));
  assert.equal(section.querySelectorAll('.atlas-regions li').length, marks.length);
});

function page(extra) {
  return Object.assign({ page: 5, image: '', items: [], figures: [], tables: [], examples: [], errata: [], editor: [] }, extra);
}
function section(pages) { return { id: 's01', title_he: 'מבוא', title_ru: 'Введение', first: 5, last: 5, translated: true, pages, terms: {} }; }

test('R07: a page with a translated table is not marked "without translation"; empty and partial pages say so', () => {
  const { R, T } = env();
  const table = { title_ru: 'Основные размеры', cells: [{ row: 0, col: 0, rowspan: 1, colspan: 1, he: 'מידות', ru: 'Основные размеры' }] };
  const html = (p) => R.renderPage(T, page(p)).querySelector('.atlas-page-head').textContent;
  assert.doesNotMatch(html({ state: 'translated', translated: true, tables: [table] }), /без перевода/);
  assert.match(html({ state: 'empty', translated: true }), /нет текста/);
  assert.match(html({ state: 'partial', translated: true }), /частично/);
  assert.match(html({ state: 'none', translated: false }), /без перевода/);
});

test('R03/R06: editor notes sit in a closed panel apart from the reading text', () => {
  const { R, T } = env();
  const el = R.renderPage(T, page({ state: 'translated', editor: [{ about: 'formula', ref: 'a97002:p5:f01', text: 'source_text извлёк только знаменатель' }] }));
  const panel = el.querySelector('details.atlas-editor');
  assert.ok(panel && !panel.hasAttribute('open'));
  assert.match(panel.textContent, /Заметки редактора \(1\)/);
  assert.match(panel.textContent, /к формуле: source_text/);
});

test('R02: a formula whose left side was restored says so under the book crop', () => {
  const { R, T } = env();
  const el = R.renderPage(T, page({ items: [{ id: 'a97002:p5:f01', type: 'formula', latex: '\\sin\\alpha=\\frac{a}{c}', crop: '/x.png', lhs_restored: true, vars: [] }] }));
  assert.match(el.querySelector('.atlas-orig').textContent, /только правую часть/);
});

test('R08: a recount shows the computed value, the gap, and rounding apart from a mismatch', () => {
  const { R, T } = env();
  const steps = [
    { compute: 'H1*9550000/n1', bindings: { H1: 10, n1: 600 }, printed: '159170', value: 159166.666666667, math_review: 'core_rounded' },
    { compute: 'x*Fr+y*Fa', bindings: { x: 0.56, Fr: 2000, y: 2, Fa: 600 }, printed: '2200', value: 2320, math_review: 'core_mismatch' }];
  const items = R.renderPage(T, page({ examples: [{ id: 'x', title_ru: 'Пример 4', steps }] })).querySelectorAll('.atlas-steps li');
  assert.match(items[0].textContent, /сошлось с округлением/);
  assert.match(items[0].textContent, /пересчёт даёт 159166\.667/);
  assert.match(items[0].textContent, /разница с напечатанным -3\.33333333 \(0\.0021 %\)/);
  assert.match(items[1].textContent, /арифметика не сошлась/);
  assert.match(items[1].textContent, /разница с напечатанным 120 \(5\.5 %\)/);
  assert.match(items[1].textContent, /не доказанная ошибка/);
});

test('UI03: Russian layers of tables, legends, captions and notes are marked for the Hebrew-only mode', () => {
  const { R, T } = env();
  const el = R.renderSection(T, fixture('s09-belt.json'), {});
  const td = R.renderTable({ title_ru: 'Размеры', title_he: 'מידות', cells: [{ row: 0, col: 0, rowspan: 1, colspan: 1, he: 'קוטר', ru: 'Диаметр' }] });
  assert.equal(td.querySelector('td .atlas-l-ru').textContent, 'Диаметр');
  assert.equal(td.querySelector('td .atlas-l-he').textContent, 'קוטר');
  assert.equal(td.querySelector('caption .atlas-l-ru').textContent, 'Размеры');
  el.querySelectorAll('.atlas-regions li').forEach((li) => assert.ok(li.querySelector('.atlas-l-ru'), 'legend Russian part marked'));
  // a caption is either the page's own caption line (its translation is the row's) or a marked short caption
  el.querySelectorAll('figcaption').forEach((c) => assert.ok(c.querySelector('.atlas-l-ru, .atlas-row > .atlas-ru')));
  const css = read('public/css/atlas-reader.css');
  assert.match(css, /\.atlas-hebrew-only \.atlas-l-ru/);
  assert.match(css, /\.atlas-hebrew-only \.atlas-l-he/);
});

test('UI01: the reader reports the open section and page so the Room can keep them in the address', async () => {
  const { document } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  const calls = [];
  const data = fixture('s09-belt.json');
  const reader = api.mount(document.getElementById('m'), {
    fetchJson: (url) => Promise.resolve(url.endsWith('index.json') ? fixture('index.json') : data),
    onState: (sec, pg, mode) => calls.push([sec, pg, mode]) });
  await reader.openSection('s09-belt', 197);
  assert.deepEqual(calls.pop(), ['s09-belt', 197, 'push']);
  await reader.openSection('s09-belt', 197, { restore: true });
  assert.equal(calls.length, 0, 'restoring from the address does not add a history entry');
  await reader.home();
  assert.deepEqual(calls.pop(), ['', 0, 'push']);
});

test('search reports the number of matches and says when there are none', async () => {
  const { document, window } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  const reader = api.mount(document.getElementById('m'), { fetchJson: () => Promise.resolve(fixture('s09-belt.json')) });
  await reader.openSection('s09-belt');
  const input = document.querySelector('.atlas-search');
  input.value = 'זזזזזז';
  input.dispatchEvent(new window.Event('input'));
  assert.equal(document.querySelector('.atlas-search-count').textContent, 'ничего не найдено');
  input.value = 'ременн';
  input.dispatchEvent(new window.Event('input'));
  assert.match(document.querySelector('.atlas-search-count').textContent, /^1 \/ \d+$/);
});

test('untranslated section shows raw Hebrew and says so', () => {
  const { R, T } = env();
  const section = R.renderSection(T, fixture('s25-size-tolerance.json'), {});
  assert.match(section.textContent, /нет перевода/);
  assert.ok(section.querySelector('.atlas-raw'));
});

test('print view: one sheet per page with a repeating page header and two columns', () => {
  const { R, T } = env();
  const print = R.renderPrint(T, fixture('s09-belt.json'));
  const sheet = print.querySelector('.atlas-psheet table.atlas-sheet');
  assert.ok(sheet.querySelector('thead .atlas-shead'));
  assert.match(sheet.querySelector('thead').textContent, /стр\. 197/);
  assert.ok(print.querySelector('td.atlas-pru') && print.querySelector('td.atlas-phe[lang="he"]'));
});

test('table grid keeps sparse columns and repeats header rows', () => {
  const { R } = env();
  const wrap = R.renderTable({ title_ru: 't', cells: [
    { row: 0, col: 0, rowspan: 1, colspan: 1, ru: 'd' }, { row: 0, col: 1, rowspan: 1, colspan: 1, ru: 'Масса' },
    { row: 1, col: 1, rowspan: 1, colspan: 1, ru: '0.050' }] });
  assert.ok(wrap.querySelector('thead'));
  const last = wrap.querySelector('tbody tr');
  assert.equal(last.querySelectorAll('td').length, 2);
  assert.equal(last.querySelectorAll('td')[1].textContent, '0.050');
});

test('the section bar jumps to any page of the book without the contents', async () => {
  const { document, window } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  const loaded = [];
  const reader = api.mount(document.getElementById('m'), {
    fetchJson: (url) => { loaded.push(url); return Promise.resolve(url.endsWith('index.json') ? fixture('index.json') : fixture('s09-belt.json')); } });
  await reader.openSection('s09-belt');
  const form = document.querySelector('.atlas-pagejump');
  form.querySelector('input').value = '485';
  form.dispatchEvent(new window.Event('submit'));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(loaded.some((u) => u.endsWith('index.json')));
  assert.ok(loaded.some((u) => /sections\/s25-size-tolerance\.json$/.test(u)), 'opens the section that holds page 485');
});

// ---- dots retest 2026-10-30 (docs/research/engineering-atlas/acceptance/2026-10-30-dots-retest/) ----
test('P2-01: figure markers and legend use plain digits, not circled glyphs a font may lack', () => {
  const { R, T } = env();
  const el = R.renderSection(T, fixture('s09-belt.json'), {});
  const marks = [...el.querySelectorAll('.atlas-rg i.n')].map((i) => i.textContent);
  assert.deepEqual(marks.slice(0, 3), ['1', '2', '3']);
  assert.equal(el.querySelector('.atlas-regions li .atlas-mark').textContent, '1');
  assert.doesNotMatch(el.textContent, /[①-⑳]/);
});

test('P2-02: a page jump keeps the requested page in the address and in the jump field', async () => {
  const { document, window } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  const calls = [];
  const data = fixture('s09-belt.json');
  const reader = api.mount(document.getElementById('m'), { fetchJson: () => Promise.resolve(data), onState: (s, p, m) => calls.push([s, p, m]) });
  await reader.openSection('s09-belt', 197);
  const input = document.querySelector('.atlas-pagejump input');
  assert.equal(input.value, '197');
  input.value = '197';
  document.querySelector('.atlas-pagejump').dispatchEvent(new window.Event('submit'));
  assert.deepEqual(calls.pop(), ['s09-belt', 197, 'replace']);
});

// ---- polish 2026-10-31: the Room's theme and the Room's column presets ----
test('theme: the atlas follows the Room theme classes and never paints a light surface under theme text', () => {
  const css = read('public/css/atlas-reader.css');
  assert.doesNotMatch(css, /:root\[data-theme/, 'the Room switches themes on body, not on :root');
  assert.match(css, /body\.theme-dark \.atlas-root/);
  assert.match(css, /body:not\(\.theme-light\) \.atlas-root/);
  const screen = css.slice(0, css.indexOf('@media print'));
  // white stays only behind book scans (page thumbnails, figure crops, the original-image overlay)
  screen.split('\n').filter((line) => /#fff\b|#ffffff\b|#f2f4f5|#d8efef/i.test(line) && !/--atlas-/.test(line)).forEach((line) => {
    assert.match(line, /atlas-thumb|atlas-figbox|atlas-orig img|atlas-overlay|atlas-scan|atlas-chipfig img/, 'hard light colour outside a scan: ' + line.trim());
  });
});

function mountWith(layers) {
  const { document, window } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  const reported = [];
  const reader = api.mount(document.getElementById('m'), { layers, onLayers: (l) => reported.push(l),
    fetchJson: () => Promise.resolve(fixture('s09-belt.json')) });
  return { document, window, reader, reported };
}

test('columns: the bar offers the Room presets and four columns, applies them and reports the choice', async () => {
  const { document, window, reader, reported } = mountWith({ he: true, niqqud: true, translit: true, ru: true, script: 'lat' });
  await reader.openSection('s09-belt');
  assert.equal(document.querySelector('[data-toggle="hebrew-only"]'), null, 'the old Hebrew-only box is replaced by the column panel');
  const btn = document.querySelector('.atlas-view-btn');
  const panel = document.querySelector('.atlas-view-panel');
  assert.ok(panel.hasAttribute('hidden'));
  btn.dispatchEvent(new window.Event('click'));
  assert.ok(!panel.hasAttribute('hidden'));
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  const presets = panel.querySelectorAll('[data-preset]');
  assert.equal(presets.length, 6);
  assert.equal(panel.querySelector('[data-preset="all"]').getAttribute('aria-checked'), 'true');
  const section = document.querySelector('.atlas-section');
  panel.querySelector('[data-preset="niqqud"]').dispatchEvent(new window.Event('click'));
  assert.ok(section.classList.contains('atlas-hide-he'));
  assert.ok(section.classList.contains('atlas-hide-translit'));
  assert.ok(!section.classList.contains('atlas-hide-niqqud'));
  assert.ok(!section.classList.contains('atlas-hebrew-only'));
  assert.deepEqual(reported.pop(), { he: false, niqqud: true, translit: false, ru: true, script: 'lat' });
  const ru = panel.querySelector('input[data-col="ru"]');
  ru.checked = false; ru.dispatchEvent(new window.Event('change'));
  assert.ok(section.classList.contains('atlas-hebrew-only'), 'no translation = every Russian layer hidden');
  assert.equal(panel.querySelector('[data-preset="hebrew"]').getAttribute('aria-checked'), 'true');
  // the last Hebrew-side column cannot be switched off: a row always has its source
  assert.ok(panel.querySelector('input[data-col="niqqud"]').disabled);
  panel.querySelector('[data-script="cyr"]').dispatchEvent(new window.Event('click'));
  assert.ok(section.classList.contains('atlas-tl-cyr'));
  assert.equal(reported.pop().script, 'cyr');
});

test('columns: a row without a pointed line keeps its Hebrew when the plain column is off', () => {
  const { R, T } = env();
  const row = R.renderPage(T, { page: 1, items: [{ id: 'b1', he: 'מבוא', ru: 'Введение' }] }, {});
  assert.ok(row.querySelector('.atlas-he.atlas-he-sole'));
  const css = read('public/css/atlas-reader.css');
  assert.match(css, /\.atlas-hide-he [^{]*:not\(\.atlas-he-sole\)/);
});

test('columns: the Room hands its saved columns to the atlas and stores the atlas choice', () => {
  const ui = read('public/js/library-ui.js');
  const at = ui.indexOf('window.AtlasReader.mount(');
  const call = ui.slice(at, at + 1200);
  assert.match(call, /layers:/);
  assert.match(call, /onLayers:/);
  assert.match(call, /saveReaderCfg\(\)/);
});

test('columns: the panel labels are translated in every interface language', () => {
  ['ru', 'en', 'he'].forEach((lang) => {
    const src = read('public/i18n/locales/' + lang + '.js');
    const line = src.split('\n').find((l) => l.startsWith('window.I18N_LOCALES.' + lang + '.atlas = '));
    const atlas = JSON.parse(line.slice(line.indexOf('= ') + 2).replace(/;\s*$/, ''));
    assert.ok(atlas.columns, lang + ' atlas.columns');
    ['he', 'niqqud', 'translit', 'ru', 'custom', 'script', 'lat', 'cyr'].forEach((k) => assert.ok(atlas.col && atlas.col[k], lang + ' atlas.col.' + k));
  });
});

// ---- owner review 2026-10-31: row layout, margin marks, figure placement, page proofreading ----
function bookPage14() {
  // the shape of a97002 p14: 👍 above five advantages, 👎 above the drawbacks (tiny unnumbered margin figures)
  const li = (n, y) => ({ id: 'a97002:p14:b' + n, type: 'block', kind: 'list_item', y, he: '• ' + n, he_niqqud: '• ' + n, translit: 't' + n, ru: '• ru' + n,
    status: { language_review: 'producer_checked', owner_status: 'none' } });
  const icon = (id, y, he, ru) => ({ id, number: null, bbox: [522, y, 552, y + 29], caption_he: '', caption_ru: '',
    regions: [{ id: id + ':r', bbox: [522, y, 552, y + 29], label_he: he, label_ru: ru, links: [] }] });
  return page({ page: 14, state: 'translated', translated: true,
    items: [li(1, 147), li(2, 176), li(3, 206), li(4, 234), li(5, 262), li(6, 355), li(7, 383), li(8, 412),
      { id: 'a97002:p14:b9', type: 'block', kind: 'prose', y: 525, he: 'המלצות:', ru: 'Рекомендации:' }],
    figures: [icon('a97002:p14:img01', 104, '👍', 'Преимущества (графический значок)'), icon('a97002:p14:img02', 310, '👎', 'Недостатки (графический значок)')] });
}

test('margin marks wrap their own text: 👍 over the advantages, 👎 over the drawbacks, no stray pictures', () => {
  const { R, T } = env();
  const el = R.renderPage(T, bookPage14());
  const groups = el.querySelectorAll('.atlas-mark-group');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].getAttribute('data-mark'), 'pro');
  assert.match(groups[0].querySelector('.atlas-mark-head').textContent, /👍.*Преимущества.*יתרונות/);
  assert.equal(groups[0].querySelectorAll('.atlas-row').length, 5);
  assert.equal(groups[1].getAttribute('data-mark'), 'con');
  assert.equal(groups[1].querySelectorAll('.atlas-row').length, 3);
  assert.ok(!groups[1].textContent.includes('Рекомендации'), 'the group ends with the list');
  assert.equal(el.querySelectorAll('figure').length, 0, 'the marks are not drawn as figures');
});

test('a ❗ mark highlights the paragraph right below it, and print keeps the mark as a heading', () => {
  const { R, T } = env();
  const p = page({ page: 13, state: 'translated', translated: true,
    items: [{ id: 'a', type: 'block', kind: 'prose', y: 340, he: 'א', ru: 'A' }, { id: 'b', type: 'block', kind: 'prose', y: 603, he: 'ב', ru: 'B' }],
    figures: [{ id: 'i', number: null, bbox: [542, 583, 553, 614], regions: [{ id: 'r', bbox: [542, 583, 553, 614], label_he: '!', label_ru: 'Внимание', links: [] }] }] });
  const g = R.renderPage(T, p).querySelector('.atlas-mark-group[data-mark="attn"]');
  assert.equal(g.querySelector('.atlas-row').getAttribute('data-ref'), 'b');
  const print = R.renderPrint(T, section([p]));
  assert.ok(print.querySelector('tr.atlas-pmark[data-mark="attn"]'));
  assert.equal(print.querySelectorAll('figure').length, 0);
});

test('a numbered figure stands above its own caption line, which keeps its study layers', () => {
  const { R, T } = env();
  const p = page({ page: 13, state: 'translated', translated: true,
    items: [{ id: 'a', type: 'block', kind: 'prose', y: 340, he: 'א', ru: 'A' },
      { id: 'cap', type: 'block', kind: 'caption', y: 562, he: 'איור 10', he_niqqud: 'אִיּוּר 10', translit: 'iyur 10', ru: 'Рисунок 10' },
      { id: 'b', type: 'block', kind: 'prose', y: 603, he: 'ב', ru: 'B' }],
    figures: [{ id: 'f10', number: 10, bbox: [101, 410, 494, 547], crop: '/x.png', caption_he: 'איור 10', caption_ru: 'Рисунок 10',
      regions: [{ id: 'r1', bbox: [110, 420, 200, 500], label_he: 'מסמרה', label_ru: 'Заклёпка', links: [] }] }] });
  const main = R.renderPage(T, p).querySelector('.atlas-main');
  const order = [...main.children].map((n) => n.getAttribute('data-ref'));
  assert.deepEqual(order, ['a', 'f10', 'b'], 'figure between the paragraphs, as in the book');
  const fig = main.querySelector('figure');
  assert.equal(fig.querySelector('figcaption .atlas-row').getAttribute('data-ref'), 'cap');
  assert.ok(fig.querySelector('figcaption .atlas-niqqud'), 'caption keeps the pointed line');
  assert.equal(main.querySelectorAll('[data-ref="cap"]').length, 1, 'the caption is not repeated');
});

test('a row is Hebrew | transliteration, then pointed Hebrew | translation, without per-row status', () => {
  const { R, T } = env();
  const el = R.renderPage(T, bookPage14());
  const cells = [...el.querySelector('.atlas-row').children].map((c) => c.className);
  assert.deepEqual(cells, ['atlas-he', 'atlas-translit', 'atlas-he atlas-niqqud', 'atlas-ru']);
  assert.equal(el.querySelectorAll('.atlas-row .atlas-badge').length, 0);
  const css = read('public/css/atlas-reader.css');
  assert.match(css, /\.atlas-row \{[^}]*grid-auto-flow: row dense/);
  assert.match(css, /\.atlas-row > \.atlas-he \{ grid-column: 1; \}/);
});

test('proofreading is one mark per page; only the owner gets the checkbox and it saves', async () => {
  const { R, T } = env();
  const head = R.renderPage(T, bookPage14()).querySelector('.atlas-page-head');
  assert.equal(head.querySelectorAll('.atlas-review').length, 1);
  assert.match(head.textContent, /ждёт вычитки/);
  const el = R.renderPage(T, bookPage14()).querySelector('.atlas-review');
  R.paintReview(T, el, false, true);
  assert.ok(el.querySelector('input[type="checkbox"]:not([checked])'));
  R.paintReview(T, el, true, false);
  assert.match(el.textContent, /✓ вычитано/);
  assert.ok(!el.querySelector('input'));

  const { document, window } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  const data = section([bookPage14()]); data.first = 14; data.last = 14;
  const saved = [];
  const reader = api.mount(document.getElementById('m'), { t: (k, fb) => fb, fetchJson: async () => data,
    review: { load: async () => ({ pages: {} }), canEdit: async () => true,
      save: async (n, on) => { saved.push([n, on]); return { pages: on ? { [n]: {} } : {} }; } } });
  await reader.openSection('s01', 0, { restore: true });
  await new Promise((r) => setTimeout(r, 0));
  const box = document.querySelector('.atlas-review input');
  assert.ok(box, 'owner sees the checkbox');
  box.checked = true;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(saved, [[14, true]]);
  assert.equal(document.querySelector('.atlas-review').getAttribute('data-done'), '1');
  assert.match(document.querySelector('.atlas-review-count').textContent, /1 \/ 1/);
});

test('proofreading marks: the server keeps them on the data volume and only the owner writes', async () => {
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-review-'));
  const routes = {};
  const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, ...hs) => { routes['POST ' + p] = hs[hs.length - 1]; } };
  let user = { id: 'u1', role: 'member' };
  require('../lib/atlasReview').installRoutes(app, { dir, requireUser: async () => ({ user, session: {} }), requireCsrf: () => true });
  const call = async (key, params, body) => {
    const out = {}; const res = { set() { return res; }, status(c) { out.status = c; return res; }, json(j) { out.json = j; return res; } };
    await routes[key]({ params, body }, res); return out;
  };
  let r = await call('POST /api/atlas/:id/review', { id: 'a97002' }, { page: 14, reviewed: true });
  assert.equal(r.status, 403);
  user = { id: 'u1', role: 'owner' };
  r = await call('POST /api/atlas/:id/review', { id: 'a97002' }, { page: 14, reviewed: true });
  assert.ok(r.json.ok && r.json.pages['14']);
  assert.equal(r.json.pages['14'].by, undefined, 'who reviewed is not published');
  r = await call('GET /api/atlas/:id/review', { id: 'a97002' });
  assert.ok(r.json.pages['14']);
  r = await call('POST /api/atlas/:id/review', { id: '../x' }, { page: 1, reviewed: true });
  assert.equal(r.status, 404);
  r = await call('POST /api/atlas/:id/review', { id: 'a97002' }, { page: 14, reviewed: false });
  assert.deepEqual(r.json.pages, {});
  assert.match(read('server.js'), /require\("\.\/lib\/atlasReview"\)\.installRoutes\(app, \{ dir: path\.join\(DATA_DIR, "atlas-review"\)/);
});

test('margin marks and proofreading are labelled in every interface language', () => {
  ['ru', 'en', 'he'].forEach((lang) => {
    const src = read('public/i18n/locales/' + lang + '.js');
    const line = src.split('\n').find((l) => l.startsWith('window.I18N_LOCALES.' + lang + '.atlas = '));
    const atlas = JSON.parse(line.slice(line.indexOf('= ') + 2).replace(/;\s*$/, ''));
    ['pro', 'con', 'attn'].forEach((k) => assert.ok(atlas.mark && atlas.mark[k], lang + ' atlas.mark.' + k));
    ['pending', 'done', 'count', 'short', 'ownerHint', 'doneHint', 'pendingHint', 'saveError'].forEach((k) => assert.ok(atlas.review && atlas.review[k], lang + ' atlas.review.' + k));
  });
});

// ---- owner wave 2 (2026-10-31): tables in the text, contents progress, phone rows ----
const cell = (row, col, he, ru) => ({ row, col, rowspan: 1, colspan: 1, he, ru: ru == null ? he : ru });

test('a table takes the place of its own flattened copy in the text', () => {
  const { R, T } = env();
  const el = R.renderPage(T, page({ items: [
    { id: 'a', type: 'block', kind: 'heading', y: 100, he: 'עמידה', ru: 'Прочность' },
    { id: 'flat', type: 'block', kind: 'other', y: 150, he: 'סוג המאמץ תנאי חוזק גזירה מעיכה', ru: 'Вид; условие; срез; смятие' },
    { id: 'b', type: 'block', kind: 'prose', y: 300, he: 'טקסט', ru: 'Текст' }],
  tables: [{ id: 't1', cells: [cell(0, 0, 'סוג המאמץ', 'Вид'), cell(0, 1, 'תנאי חוזק', 'Условие'), cell(1, 0, 'גזירה', 'Срез'), cell(2, 0, 'מעיכה', 'Смятие')] }] }));
  const order = [...el.querySelector('.atlas-main').children].map((n) => n.getAttribute('data-ref'));
  assert.deepEqual(order, ['a', 'flat', 'b'], 'the table stands where the flattened line was');
  assert.ok(el.querySelector('.atlas-tablewrap[data-ref="flat"] table'));
  assert.ok(!el.querySelector('.atlas-row[data-ref="flat"]'), 'the flattened line itself is gone');
});

test('a symbol table follows «טבלת סמלים»; an unplaceable table stays at the end of the page', () => {
  const { R, T } = env();
  const el = R.renderPage(T, page({ items: [
    { id: 'h', type: 'block', kind: 'prose', y: 100, he: 'טבלת סמלים', ru: 'Таблица обозначений' },
    { id: 'b', type: 'block', kind: 'prose', y: 300, he: 'טקסט אחר', ru: 'Другой текст' }],
  tables: [{ id: 'sym', cells: [cell(0, 0, 'יחידות', 'Единицы'), cell(0, 1, 'תיאור', 'Описание'), cell(0, 2, 'סמל', 'Обозначение')] },
    { id: 'lost', cells: [cell(0, 0, 'אלפא', 'Альфа'), cell(1, 0, 'בטא', 'Бета')] }] }));
  const order = [...el.querySelector('.atlas-main').children].map((n) => n.getAttribute('data-ref'));
  assert.deepEqual(order, ['h', 'sym', 'b', 'lost']);
});

test('a table drawn from a scanned figure follows that figure', () => {
  const { R, T } = env();
  const el = R.renderPage(T, page({ items: [{ id: 'a', type: 'block', kind: 'prose', y: 100, he: 'א', ru: 'A' }, { id: 'b', type: 'block', kind: 'prose', y: 500, he: 'ב', ru: 'B' }],
    figures: [{ id: 'fig', number: null, bbox: [50, 200, 500, 400], crop: '/x.png', regions: [] }],
    tables: [{ id: 'ft', parent: 'fig', cells: [cell(0, 0, 'x', 'x')] }] }));
  const order = [...el.querySelector('.atlas-main').children].map((n) => n.getAttribute('data-ref'));
  assert.deepEqual(order, ['a', 'fig', 'ft', 'b']);
});

test('table cells: raw LaTeX becomes symbols with sub/superscripts; only a label row is the header', () => {
  const { R } = env();
  const t = R.renderTable({ cells: [cell(0, 0, 'סמל', 'Обозначение'), cell(0, 1, 'תיאור', 'Описание'),
    cell(1, 0, '\\tau_S'), cell(1, 1, 'גזירה', 'Срез'), cell(2, 0, '[\\sigma_{Lc}]'), cell(2, 1, 'מעיכה', 'Смятие')] });
  const tds = [...t.querySelectorAll('tbody td')].map((td) => td.innerHTML);
  assert.ok(tds.some((x) => x.includes('τ<sub>S</sub>')), tds.join(' | '));
  assert.ok(tds.some((x) => x.includes('[σ<sub>Lc</sub>]')));
  assert.equal(t.querySelectorAll('thead tr').length, 1);
  assert.equal(t.querySelectorAll('tbody tr').length, 2, 'label-less rows are body rows, not bold headers');
  const two = R.renderTable({ cells: [cell(0, 0, 'd ≤ 8'), cell(0, 1, 'בקור', 'холодная'), cell(1, 0, 'd > 8'), cell(1, 1, 'בחום', 'горячая')] });
  assert.equal(two.querySelectorAll('thead tr').length, 0);
  assert.ok(!t.textContent.includes('\\'), 'no backslash left');
});

test('contents: each translated section shows its proofreading progress, and the book total', async () => {
  const { document } = parseHTML('<!doctype html><html><body><main id="m"></main></body></html>');
  const api = require('../public/js/atlas-reader.js');
  const reader = api.mount(document.getElementById('m'), { t: (k, fb) => fb, fetchJson: async () => fixture('index.json'),
    review: { load: async () => ({ pages: { 197: {}, 198: {} } }), canEdit: async () => false, save: async () => ({}) } });
  await reader.home({ restore: true });
  await new Promise((r) => setTimeout(r, 0));
  const rev = [...document.querySelectorAll('.atlas-sec-review')];
  assert.equal(rev.length, fixture('index.json').sections.filter((s) => s.translated).length);
  assert.ok(rev.some((e) => /вычитано 2 \//.test(e.textContent)), rev.map((e) => e.textContent).join(' | '));
  assert.match(document.querySelector('.atlas-home-review').textContent, /вычитано страниц: 2 \//);
});

test('phones keep the 2×2 row (owner, 2026-10-31): no single-column override for rows', () => {
  const css = read('public/css/atlas-reader.css');
  const phone = css.slice(css.indexOf('@media (max-width: 760px)'), css.indexOf('/* ---- print'));
  assert.doesNotMatch(phone, /\.atlas-row \{ grid-template-columns: 1fr/);
  assert.doesNotMatch(phone, /grid-column: 1 !important/);
});

test('two marks over one merged block keep both labels (supplier merged pros and cons, a97002 p198/p210/p235)', () => {
  const { R, T } = env();
  const icon = (id, y, ru) => ({ id, number: null, bbox: [522, y, 552, y + 29], regions: [{ id: id + ':r', bbox: [522, y, 552, y + 29], label_he: '', label_ru: ru, links: [] }] });
  const el = R.renderPage(T, page({ items: [{ id: 'm', type: 'block', kind: 'prose', y: 338, he: 'כוח חיכוך גבוה; יקרה יותר', ru: 'Высокое трение; дороже' }],
    figures: [icon('p', 250, 'Пиктограмма преимуществ'), icon('c', 303, 'Пиктограмма недостатков')] }));
  const g = el.querySelector('.atlas-mark-group');
  assert.equal(g.getAttribute('data-mark'), 'mixed');
  assert.match(g.querySelector('.atlas-mark-head').textContent, /Преимущества.*Недостатки/);
});

// ---- whole-book quality audit 2026-10-31 (docs/planning/ENGINEERING_ATLAS_QUALITY_STANDARD.md) ----
const smallFig = (id, y, he, ru, w = 30) => ({ id, number: null, bbox: [520, y, 520 + w, y + 30], crop: '/c.png',
  regions: [{ id: id + ':r', bbox: [520, y, 520 + w, y + 30], label_he: he, label_ru: ru, links: [] }] });

test('3.1/3.2: a target becomes «🎯 Цель расчёта», tolerance signs show as signs, unlabelled book icons are known, 1×1 junk is dropped', () => {
  const { R, T } = env();
  const items = [{ id: 'a', type: 'block', kind: 'prose', y: 150, he: 'בדיקת תנאי התכנון', ru: 'Проверка условий' }];
  let el = R.renderPage(T, page({ items, figures: [smallFig('x', 130, '', 'Редакционное описание: мишень со стрелой, печатной текстовой подписи нет.')] }));
  assert.match(el.querySelector('.atlas-mark-group[data-mark="goal"] .atlas-mark-head').textContent, /🎯.*Цель расчёта.*מטרה/);
  assert.doesNotMatch(el.textContent, /Редакционное/);
  el = R.renderPage(T, page({ page: 505, items, figures: [smallFig('y', 130, '⌖', 'Знак позиционного допуска')] }));
  assert.match(el.querySelector('.atlas-mark-group[data-mark="sym"]').textContent, /⌖.*Знак позиционного допуска/);
  el = R.renderPage(T, page({ page: 348, items, figures: [Object.assign(smallFig('a97002:p348:img01', 130, '', ''), { regions: [] })] }));
  assert.ok(el.querySelector('.atlas-mark-group[data-mark="goal"]'), 'the unlabelled target of p348');
  el = R.renderPage(T, page({ items, figures: [{ id: 'j', number: null, bbox: [516, 596, 517, 597], crop: '/j.png', regions: [] }] }));
  assert.equal(el.querySelectorAll('figure').length, 0);
});

test('4.3: supplier remarks leave the reading text; the learner part of a note stays, the report goes to the editor notes', () => {
  const { R, T } = env();
  assert.equal(R.cleanMeta('Условный знак жёсткой заделки; редакционное описание'), 'Условный знак жёсткой заделки');
  assert.equal(R.cleanMeta('Шарнир на катке (графический знак, редакционное описание)'), 'Шарнир на катке');
  assert.equal(R.cleanMeta('Редакционное описание: знак «большой палец вверх».'), 'знак «большой палец вверх».');
  assert.equal(R.cleanMeta('Прямой угол — редакционное описание квадратного знака'), 'Прямой угол');
  const parts = R.noteParts('Shift tan означает арктангенс; градусы. Печатное фиксированное 30° сохранено, не заменено произвольным α.');
  assert.equal(parts.reader, 'Shift tan означает арктангенс; градусы.');
  assert.match(parts.editor, /сохранено/);
  assert.equal(R.noteParts('Полная дробь собрана по PNG. Sourcebbox сохранён исходным.').reader, '');
  const el = R.renderPage(T, page({ items: [{ id: 'f', type: 'formula', y: 100, latex: 'a=b', note: 'Радикал восстановлен по странице. Единицы: mm.', vars: [] }] }));
  assert.equal(el.querySelector('.atlas-formula .atlas-note').textContent, 'Единицы: mm.');
  assert.match(el.querySelector('details.atlas-editor').textContent, /восстановлен/);
});

test('1.1/2.3: copies of a table — «= = = =», a column of symbols, a flattened number line, a cut-out numerator — are not shown twice', () => {
  const { R, T } = env();
  const el = R.renderPage(T, page({ items: [
    { id: 'h', type: 'block', kind: 'prose', y: 90, he: '1) מידות תבריג', ru: '1) Размеры резьбы' },
    { id: 'eq', type: 'formula', y: 100, latex: '\\begin{matrix}=\\\\=\\\\=\\end{matrix}', vars: [] },
    { id: 'sym', type: 'formula', y: 110, latex: '\\begin{gathered}d\\\\p\\\\d_1\\end{gathered}', vars: [] },
    { id: 'num', type: 'formula', y: 120, latex: '[\\sigma_e]\\pi d_1^2', vars: [] },
    { id: 'q', type: 'formula', y: 130, latex: 'Q=\\frac{[\\sigma_e]\\pi d_1^2}{4}', vars: [] },
    { id: 'flat', type: 'block', kind: 'other', y: 140, he: 'M2 M2.5 M3 M3.5 M4 M5 1.5 2 2.5 3 3.5 4 1.1 1.2', ru: 'M2 M2.5 M3 M3.5 M4 M5 1.5 2 2.5 3 3.5 4 1.1 1.2' }],
  tables: [{ id: 't', cells: [cell(0, 0, 'd'), cell(0, 1, '='), cell(0, 2, 'mm'), cell(1, 0, 'p'), cell(1, 1, '='), cell(1, 2, 'mm')] }] }));
  ['eq', 'sym', 'num', 'flat'].forEach((id) => assert.ok(!el.querySelector('.atlas-main > [data-ref="' + id + '"]'), id + ' hidden'));
  assert.ok(el.querySelector('[data-ref="q"]'), 'the full formula stays');
});

test('5: table columns in reading order (symbol first), units named once, supplier table titles cleaned', () => {
  const { R, T } = env();
  const el = R.renderPage(T, page({ items: [{ id: 'h', type: 'block', kind: 'prose', y: 90, he: 'טבלת סמלים', ru: 'Таблица обозначений' }],
    tables: [{ id: 't', title_ru: 'Печатная компоновка формул наружного диаметра', cells: [cell(0, 0, 'יחידות', 'Единицы'), cell(0, 1, 'תיאור', 'Описание'), cell(0, 2, 'סמל', 'Символ'),
      cell(1, 0, 'mm', 'mm'), cell(1, 1, 'קוטר', 'Диаметр'), cell(1, 2, 'd', 'd'),
      Object.assign(cell(2, 0, '12', '12'), { unit: 'mm' }), cell(2, 1, 'אורך', 'Длина'), cell(2, 2, 'L', 'L')] }] }));
  const head = [...el.querySelector('.atlas-table tr').children].map((td) => td.querySelector('.atlas-l-ru').textContent);
  assert.deepEqual(head, ['Символ', 'Описание', 'Единицы']);
  assert.equal(el.querySelector('.atlas-table caption').textContent.trim(), 'Формулы наружного диаметра');
  assert.ok(!el.querySelector('.atlas-table td small'), 'mm is a column label, not repeated after 12');
  assert.ok(el.querySelector('.atlas-table td .atlas-l-he'), 'the book Hebrew is in the cell');
});

test('6: a legend groups equal labels; letters-only figures and figures whose labels a table repeats show clean; a one-label picture is a chip', () => {
  const { R, T } = env();
  const reg = (id, x, he, ru) => ({ id, bbox: [x, 10, x + 10, 20], label_he: he, label_ru: ru, links: [] });
  let el = R.renderPage(T, page({ items: [], figures: [{ id: 'f', number: null, bbox: [0, 0, 300, 200], crop: '/f.png',
    regions: [reg('a', 10, 'F', 'Сила F'), reg('b', 100, 'F', 'Сила F'), reg('c', 200, 't', 'Толщина t')] }] }));
  assert.equal(el.querySelectorAll('.atlas-regions li').length, 2);
  assert.equal(el.querySelectorAll('.atlas-rg').length, 3);
  el = R.renderPage(T, page({ items: [], figures: [{ id: 'g', number: null, bbox: [0, 0, 300, 200], crop: '/g.png',
    regions: [reg('a', 10, 'C', 'C'), reg('b', 100, 'a', 'a')] }] }));
  assert.equal(el.querySelectorAll('.atlas-rg').length, 0);
  el = R.renderPage(T, page({ items: [], figures: [smallFig('m', 100, '8.8', '8.8 — маркировка головки', 30)] }));
  assert.ok(el.querySelector('figure.atlas-chipfig'));
  assert.equal(el.querySelectorAll('.atlas-rg').length, 0);
});

test('2.6: a possible misprint is one line that opens; print shows it in full', () => {
  const { R, T } = env();
  const x = { id: 'e', target: 'a', as_printed: '660', proposed: '640', explanation_ru: 'Пояснение', origin: 'core' };
  const el = R.renderPage(T, page({ items: [{ id: 'a', type: 'block', kind: 'prose', y: 10, he: 'א', ru: 'A' }], errata: [x] }));
  const d = el.querySelector('details.atlas-erratum');
  assert.ok(d && !d.hasAttribute('open'));
  assert.match(d.querySelector('summary').textContent, /660.*640/);
  const print = R.renderPrint(T, section([page({ items: [{ id: 'a', type: 'block', kind: 'prose', y: 10, he: 'א', ru: 'A' }], errata: [x] })]));
  assert.ok(print.querySelector('div.atlas-erratum'));
});

test('the audit script checks every page of the book against the quality standard', () => {
  const src = read('scripts/atlas/audit-reader.cjs');
  assert.match(src, /ENGINEERING_ATLAS_QUALITY_STANDARD\.md/);
  ['1.7', '4.3', '4.4', '4.5', '6.2', '3.2'].forEach((rule) => assert.ok(src.includes("'" + rule + "'"), 'rule ' + rule));
  assert.ok(fs.existsSync(path.join(root, 'docs/planning/ENGINEERING_ATLAS_QUALITY_STANDARD.md')));
});
