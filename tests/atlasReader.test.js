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

test('region labels in the right half of a figure open to the left (no page overflow)', () => {
  const { R, T } = env();
  const data = fixture('s09-belt.json');
  const fig = data.pages[0].figures[0];
  fig.regions = fig.regions.slice(0, 2);   // a sparse figure keeps text labels
  const section = R.renderSection(T, data, {});
  const label = (r) => section.querySelector('.atlas-rg[data-region="' + r.id + '"] i');
  // region 0 sits at the right edge of the figure, region 1 at its left edge
  assert.ok(label(fig.regions[0]).classList.contains('flip'));
  assert.ok(!label(fig.regions[1]).classList.contains('flip'));
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
  assert.ok(el.querySelector('figcaption .atlas-l-ru'));
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
