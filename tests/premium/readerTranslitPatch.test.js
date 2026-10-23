'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const source = fs.readFileSync(path.resolve(__dirname, '../../public/js/library-ui.js'), 'utf8');
const patchSource = source.slice(source.indexOf('function refreshReaderTranslit('), source.indexOf('function rerenderReader()'));

function fixture({ sliced = false } = {}) {
  const table = (id, css, offset, emptyLast = false) => `<table id="${id}" class="${css}"><thead><tr>` +
    '<th data-col="translit">Учебная<div class="col-resizer"></div></th></tr></thead><tbody>' +
    [0, 1].map(i => `<tr data-row-idx="${offset + i}"><td data-col="he"><span class="rm-w rm-w-active">שלום</span></td>` +
      `<td data-col="translit">${emptyLast && i === 1 ? '' : 'stored-' + (offset + i)}</td>` +
      '<td data-col="ru" class="ru-veiled ru-revealed">перевод</td></tr>').join('') + '</tbody></table>';
  const { window, document } = parseHTML('<html><body><section id="roomReader"><div id="roomReaderTable">' +
    table('proTable', '', 0) + '</div><div id="solution">' + table('materialsInlineSolutionTable', 'materials-inline-table', 2, true) +
    '</div><div class="rm-sheet rm-open">открытая карточка</div></section></body></html>');
  const rows = [
    { id: 'main-0', shown: { sbl: 'main SBL', 'ru-phonetic': 'основная строка' } },
    { id: 'main-edited', edit_meta_json: { edited: { translit: true, translit_ru: true } }, shown: { sbl: 'Мой текст', 'ru-phonetic': 'Мой текст' } },
  ];
  const solutionRows = [
    { id: 'solution-0', shown: { sbl: 'solution SBL', 'ru-phonetic': 'строка решения' } },
    { id: 'solution-empty', shown: { sbl: '', 'ru-phonetic': '' } },
  ];
  const timers = [], callbacks = [], displays = [];
  let now = 0, begins = 0, cancels = 0;
  const store = {
    display(row, profile) { assert.ok(row, 'every DOM row must map to its own table model'); displays.push([row.id, profile]); return row.shown[profile]; },
    beginRender() { begins++; }, cancelPending() { cancels++; },
    endRender(callback) { callbacks.push(callback); },
  };
  const context = vm.createContext({
    document, Node: window.Node, readerRows: rows, readerCfg: { translitProfile: 'sbl' }, readerOpenEpoch: 1,
    readerTranslitRevision: 0, materialsInlineState: { expanded: true, rows: solutionRows },
    roomTranslit: () => store, $: id => document.getElementById(id),
    tt: key => ({ 'table.colTranslitSbl': 'SBL', 'table.colTranslitRu': 'Рус', 'table.colTranslitLearnerLatin': 'Учебная' })[key],
    performance: { now: () => sliced ? (now += 10) : 0 }, setTimeout: callback => { timers.push(callback); return timers.length; },
    readerPlaceAnchor: () => null, restoreReaderPlaceAnchor: () => {},
  });
  vm.runInContext(patchSource, context);
  function drain() {
    let count = 0;
    while (timers.length) { assert.ok(count++ < 50, 'cell patch must settle'); timers.shift()(); }
  }
  return { context, document, rows, solutionRows, callbacks, displays, timers, drain, counts: () => ({ begins, cancels }) };
}

function replayOn(f, selector) {
  const cell = f.document.querySelector(selector);
  const glue = f.document.createTextNode('\u00a0'), button = f.document.createElement('button');
  button.className = 'smk-row-replay'; button.textContent = '▶︎';
  let clicks = 0;
  button.addEventListener('click', () => { clicks++; });
  cell.append(glue, button);
  return { cell, glue, button, clicks: () => clicks };
}

test('profile patch updates the condition and inline solution while retaining edits, replay and reader state', () => {
  const f = fixture();
  const normal = replayOn(f, '#proTable tr[data-row-idx="0"] td[data-col="translit"]');
  const empty = replayOn(f, '.materials-inline-table tr[data-row-idx="3"] td[data-col="translit"]');
  const before = JSON.stringify([f.rows, f.solutionRows]);
  const originalWord = f.document.querySelector('.rm-w-active');
  const originalSheet = f.document.querySelector('.rm-sheet');
  const originalTables = Array.from(f.document.querySelectorAll('table'));
  for (const profile of ['sbl', 'ru-phonetic']) {
    f.context.readerCfg.translitProfile = profile;
    f.context.refreshReaderTranslit(true); f.drain();
    assert.deepEqual(Array.from(f.document.querySelectorAll('th[data-col="translit"]'), node => node.firstChild.textContent),
      [profile === 'sbl' ? 'SBL' : 'Рус', profile === 'sbl' ? 'SBL' : 'Рус']);
    assert.equal(normal.cell.firstChild.textContent, f.rows[0].shown[profile]);
    assert.equal(f.document.querySelector('#proTable tr[data-row-idx="1"] td[data-col="translit"]').textContent, 'Мой текст');
    assert.equal(f.document.querySelector('.materials-inline-table tr[data-row-idx="2"] td[data-col="translit"]').textContent, f.solutionRows[0].shown[profile]);
    assert.equal(empty.cell.textContent, '\u00a0▶︎');
    for (const replay of [normal, empty]) {
      assert.equal(replay.cell.querySelector('.smk-row-replay'), replay.button);
      assert.equal(replay.button.previousSibling, replay.glue);
      replay.button.click();
    }
  }
  assert.equal(normal.clicks(), 2); assert.equal(empty.clicks(), 2);
  assert.equal(JSON.stringify([f.rows, f.solutionRows]), before, 'presentation never rewrites the source models or edits');
  assert.equal(f.document.querySelector('.rm-w-active'), originalWord);
  assert.equal(f.document.querySelector('.rm-sheet'), originalSheet);
  assert.equal(f.document.querySelectorAll('.ru-revealed').length, 4);
  assert.deepEqual(Array.from(f.document.querySelectorAll('table')), originalTables);
});

test('an old profile fill callback cannot replace the newly selected profile', () => {
  const f = fixture();
  f.context.refreshReaderTranslit(true);
  const oldFilled = f.callbacks[0];
  f.context.readerCfg.translitProfile = 'ru-phonetic';
  f.context.refreshReaderTranslit(true);
  const expected = f.document.body.innerHTML, calls = f.displays.length;
  oldFilled(); f.drain();
  assert.equal(f.document.body.innerHTML, expected);
  assert.equal(f.displays.length, calls, 'obsolete callback must not start another patch');
});

test('queued cell work stops when another material becomes current', () => {
  const f = fixture({ sliced: true });
  f.context.refreshReaderTranslit(true);
  assert.ok(f.timers.length, 'fixture yields with remaining cells');
  f.context.readerOpenEpoch++;
  f.context.readerRows = [{ id: 'next', shown: { sbl: 'new material' } }];
  f.document.getElementById('roomReaderTable').innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0"><td data-col="translit">new material</td></tr></tbody></table>';
  const expected = f.document.body.innerHTML, calls = f.displays.length;
  f.drain();
  assert.equal(f.document.body.innerHTML, expected);
  assert.equal(f.displays.length, calls);
  assert.equal(f.callbacks.length, 0, 'superseded render must not enqueue a background completion');
});

test('hidden transliteration leaves the remaining table content and controls intact', () => {
  const f = fixture();
  f.document.querySelectorAll('[data-col="translit"]').forEach(cell => cell.remove());
  const expected = f.document.body.innerHTML;
  f.context.refreshReaderTranslit(true); f.drain();
  assert.equal(f.document.body.innerHTML, expected);
  assert.equal(f.displays.length, 0);
  assert.deepEqual(f.counts(), { begins: 0, cancels: 0 });
});
