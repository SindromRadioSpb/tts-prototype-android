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
