'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const source = fs.readFileSync(require.resolve('../public/js/translit-display.js'), 'utf8');

function fixture(sliced = false) {
  const { document } = parseHTML('<html><body><div id="mount"><table><tbody>' + [0, 1, 2].map(i =>
    `<tr data-row-idx="${i}" data-sentence-id="s${i}"><td data-col="he"><span class="rm-w">שלום</span></td><td data-col="translit">stored-${i}</td></tr>`).join('') + '</tbody></table></div></body></html>');
  let tick = 0, current = true;
  const context = vm.createContext({ module: { exports: {} }, performance: { now: () => sliced ? ++tick * 9 : 0 } });
  vm.runInContext(source, context);
  const table = document.querySelector('table'), timers = [];
  const rows = [0, 1, 2].map(i => ({ _v3_sentenceId: 's' + i, he_niqqud: 'שָׁלוֹם ' + i, translit: 'my text', edit_meta_json: i === 1 ? { edited: { translit: true } } : null }));
  const store = context.module.exports.createStore(() => 'derived');
  const patch = () => context.module.exports.patchTable(table, rows, 'sbl', { store, isCurrent: () => current, defer: fn => timers.push(fn) });
  return { document, table, rows, patch, timers, supersede: () => { current = false; }, drain: () => { while (timers.length) timers.shift()(); } };
}

test('background completion preserves table, words, manual transliteration and replay listeners', async () => {
  const f = fixture(), word = f.document.querySelector('.rm-w'), cell = f.table.querySelector('[data-col="translit"]');
  const glue = f.document.createTextNode('\u00a0'), replay = f.document.createElement('button');
  replay.className = 'smk-row-replay'; replay.textContent = '▶'; let clicks = 0;
  replay.addEventListener('click', () => clicks++); cell.append(glue, replay);
  const before = JSON.stringify(f.rows), result = await f.patch();
  assert.equal(result.patched, 3);
  assert.equal(cell.firstChild.textContent, 'derived');
  assert.equal(f.table.querySelectorAll('[data-col="translit"]')[1].textContent, 'my text');
  assert.equal(f.document.querySelector('table'), f.table);
  assert.equal(f.document.querySelector('.rm-w'), word);
  assert.equal(replay.previousSibling, glue); replay.click(); assert.equal(clicks, 1);
  assert.equal(JSON.stringify(f.rows), before);
});

test('an open cell editor and selected text are retained during background completion', async () => {
  const f = fixture(), cells = f.table.querySelectorAll('[data-col="translit"]');
  cells[0].innerHTML = '<div class="cell-editor-wrap"><textarea>unfinished edit</textarea></div>';
  const editor = cells[0].querySelector('textarea');
  f.document.defaultView.getSelection = () => ({ isCollapsed: false, rangeCount: 1,
    getRangeAt: () => ({ cloneRange: () => ({ intersectsNode: cell => cell === cells[2] }) }) });
  await f.patch();
  assert.equal(cells[0].querySelector('textarea'), editor);
  assert.equal(editor.textContent, 'unfinished edit');
  assert.equal(cells[2].textContent, 'stored-2');
});

test('selection is read once per slice rather than once per mutated cell', async () => {
  const f = fixture(); let reads = 0;
  f.document.defaultView.getSelection = () => { reads++; return { isCollapsed: true }; };
  await f.patch(); assert.equal(reads, 1);
});

for (const boundary of ['material/profile', 'mount', 'row identity']) test('queued patch stops at a changed ' + boundary, async () => {
  const f = fixture(true), running = f.patch();
  assert.equal(f.timers.length, 1);
  const cells = f.table.querySelectorAll('[data-col="translit"]');
  if (boundary === 'material/profile') f.supersede();
  if (boundary === 'mount') f.table.remove();
  if (boundary === 'row identity') f.rows[1]._v3_sentenceId = 'other';
  f.drain(); await running;
  assert.equal(cells[1].textContent, 'stored-1');
});

test('saved word layer begins before the status pass completes', async () => {
  const morph = fs.readFileSync(require.resolve('../public/js/studio-morph.js'), 'utf8');
  const start = morph.indexOf('async function refreshDecorations(');
  const end = morph.indexOf('\n  // Word layer', start);
  let finish, glosses = 0;
  const waiting = new Promise(resolve => { finish = resolve; });
  const table = { isConnected: true }, mount = { querySelector: () => table };
  const context = vm.createContext({ _decorBusy: false, _decorDirty: false, _decorRevision: 0, studioMount: () => mount,
    window: { ReaderMorph: { decorateWords: () => waiting } }, editModeOn: () => false,
    healStaleWrapFlags() {}, rmAttach: { refresh() {} }, wordStatusEnabled: () => false, ensureHost: () => null,
    applyWordLayer: () => glosses++ });
  vm.runInContext(morph.slice(start, end), context);
  const refreshing = context.refreshDecorations();
  assert.equal(glosses, 1, 'saved gloss is not gated behind the full morphology scan');
  finish(); await refreshing;
  assert.equal(glosses, 1, 'completion does not enqueue a duplicate full gloss pass');
});

test('B context starts while A state is pending and only B may receive the late status paint', async () => {
  const morph = fs.readFileSync(require.resolve('../public/js/studio-morph.js'), 'utf8');
  const start = morph.indexOf('async function refreshDecorations('), end = morph.indexOf('\n  // Word layer', start);
  let table = { id: 'A', isConnected: true }, release, calls = 0;
  const pending = new Promise(resolve => { release = resolve; }), owners = [], painted = [];
  const mount = { querySelector: () => table };
  const context = vm.createContext({ _decorBusy: false, _decorDirty: false, _decorRevision: 0,
    studioMount: () => mount, editModeOn: () => false, healStaleWrapFlags() {}, rmAttach: { refresh() {} },
    wordStatusEnabled: () => true, ensureHost: () => ({ ensureWordStates: () => ++calls === 1 ? pending : Promise.resolve({}) }),
    applyWordLayer: (_, current) => owners.push(current),
    window: { ReaderMorph: { decorateWords: async (_, __, opts) => { if (opts.isCurrent()) painted.push(table.id); } } } });
  vm.runInContext(morph.slice(start, end), context);
  const a = context.refreshDecorations();
  table = { id: 'B', isConnected: true };
  await context.refreshDecorations();
  assert.equal(owners.length, 2); assert.equal(owners[0](), false); assert.equal(owners[1](), true);
  release({}); await a;
  for (let i = 0; i < 10 && context._decorBusy; i++) await Promise.resolve();
  assert.deepEqual(painted, ['B']); assert.equal(owners.length, 2, 'status coalescing does not repeat the word layer');
});
