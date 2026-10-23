'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

// Execute the actual host functions; dependencies expose controlled asynchronous boundaries.
const host = fs.readFileSync(path.resolve(__dirname, '../../public/js/library-ui.js'), 'utf8');
const start = host.indexOf('let readerDecorationRevision = 0;');
const end = host.indexOf('// B7 — in-reader Learning Compass chip.', start);
if (start < 0 || end < 0) throw new Error('Reader decoration host functions could not be extracted');
const source = host.slice(start, end);

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

function fixture() {
  const { document } = parseHTML('<html><body><div id="reader"><table id="proTable"><tbody><tr><td><span class="rm-w">שלום</span></td></tr></tbody></table></div></body></html>');
  const mount = document.getElementById('reader');
  const rowWork = deferred(), states = deferred(), decorationJobs = [];
  const glossCalls = [], binds = [], events = [], writes = [], prepared = [];
  const storage = new Map([['room.dueMarker.day', JSON.stringify({ day: '2026-10-22', marked: 99, suppressed: 99 })]]);
  let statReads = 0, coverageRefreshes = 0;
  const window = {
    WordGloss: {
      enabled(surface, field) { assert.equal(surface, 'room'); return field === 'Gloss'; },
      apply(node, options) { events.push('gloss'); glossCalls.push({ node, options }); return Promise.resolve(); },
    },
    WordGlossAI: { bindRows(node, rows) { binds.push({ node, rows }); } },
    ReaderMorph: {
      dueSetFromSchedule: () => new Set(['שלום#noun']),
      decorateWords(node, state, options) {
        events.push('decorate');
        const done = deferred();
        decorationJobs.push({ node, state, options, ...done });
        return done.promise;
      },
      dueMarkStats() { statReads++; return { marked: 3, suppressed: 2 }; },
    },
  };
  const rows = [{ he: 'שלום', he_niqqud: 'שָׁלוֹם' }];
  const context = vm.createContext({
    window, readerRows: rows, readerOpenEpoch: 1, readerMorphWork: { complete: rowWork.promise, ensure: row => { prepared.push(row); return true; } },
    readerCfg: { niqqudMode: 'adaptive' }, activeReaderMorphMount: () => mount,
    wordStatusEnabled: () => true,
    ensureWordStates() { events.push('states'); return states.promise; },
    localDb: { getSrsSchedule: async () => ({ 'שלום#noun': { due: 0 } }) },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => { writes.push([key, value]); storage.set(key, value); } },
    _localDayStr: () => '2026-10-23', refreshCovChip() { coverageRefreshes++; },
  });
  vm.runInContext(source, context);
  return { context, mount, rows, rowWork, states, decorationJobs, glossCalls, binds, events, writes, prepared,
    counters: () => ({ statReads, coverageRefreshes }) };
}

test('visible rows can wrap and show stored context while full row hydration and learner states are still pending', async () => {
  const f = fixture();
  const applying = f.context.applyDecorations();
  await flush();
  assert.deepEqual(f.events, ['gloss', 'states']);
  assert.equal(f.glossCalls[0].node, f.mount);
  assert.equal(f.glossCalls[0].options.gloss, true);
  assert.equal(f.glossCalls[0].options.ai, false, 'stored translations remain eligible when generation is off');
  assert.equal(f.binds[0].rows, f.rows);
  assert.equal(f.glossCalls[0].options.isCurrent(), true);
  const row = f.mount.querySelector('tr');
  assert.equal(f.glossCalls[0].options.prepareRow(row), true);
  assert.deepEqual(f.prepared, [row], 'foreground hydration is scoped to the selected row');
  assert.equal(f.decorationJobs.length, 0, 'unresolved statuses do not block stored contextual translations');

  f.states.resolve({}); await flush();
  assert.deepEqual(f.events, ['gloss', 'states', 'decorate']);
  assert.equal(f.decorationJobs.length, 1);
  assert.equal(f.decorationJobs[0].options.prepareRow(row), true);
  assert.equal(f.writes.length, 0, 'due totals wait for completed decoration');
  f.decorationJobs[0].resolve(); await applying;
  assert.deepEqual(f.counters(), { statReads: 1, coverageRefreshes: 1 });
  assert.deepEqual(JSON.parse(f.writes[0][1]), { day: '2026-10-23', marked: 3, suppressed: 2 });
  f.rowWork.resolve(true);
});

test('rebuilding the same material invalidates old word-layer work before the new rows finish', () => {
  const f = fixture();
  f.context.applyWordLayer();
  const old = f.glossCalls[0].options;
  assert.equal(old.isCurrent(), true);
  f.mount.innerHTML = '<table id="proTable"><tbody><tr><td>new table, same material</td></tr></tbody></table>';
  assert.equal(old.isCurrent(), false);
  f.context.applyWordLayer();
  assert.equal(f.glossCalls[1].options.isCurrent(), true);
});

test('cancelling row work invalidates the foreground layer and prevents later status/decorations', async () => {
  const f = fixture();
  const applying = f.context.applyDecorations();
  f.context.readerMorphWork = null; f.rowWork.resolve(false); f.states.resolve({}); await applying;
  assert.equal(f.glossCalls[0].options.isCurrent(), false);
  assert.deepEqual(f.events, ['gloss', 'states']);
  assert.deepEqual(f.counters(), { statReads: 0, coverageRefreshes: 0 });
});

test('word layer validity follows both material epoch and row identity', async () => {
  for (const switchMaterial of [f => { f.context.readerOpenEpoch++; }, f => { f.context.readerRows = [{ he: 'חדש' }]; }]) {
    const f = fixture();
    f.context.applyWordLayer();
    const old = f.glossCalls[0].options;
    assert.equal(old.isCurrent(), true);
    switchMaterial(f);
    assert.equal(old.isCurrent(), false, 'a delayed word-layer continuation cannot paint the next material');
    f.context.applyWordLayer();
    assert.equal(f.glossCalls[1].options.isCurrent(), true);
    f.mount.remove();
    assert.equal(f.glossCalls[1].options.isCurrent(), false, 'detached mounts also invalidate queued work');
  }
});

test('a late morphology completion after a material switch cannot publish stale due totals or coverage', async () => {
  const f = fixture();
  f.rowWork.resolve(true); f.states.resolve({});
  const applying = f.context.applyDecorations(); await flush();
  assert.equal(f.decorationJobs.length, 1);
  f.context.readerOpenEpoch++;
  f.context.readerRows = [{ he: 'חדש' }];
  assert.equal(f.glossCalls[0].options.isCurrent(), false);
  assert.equal(f.decorationJobs[0].options.isCurrent(), false);
  f.decorationJobs[0].resolve(); await applying;
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.counters(), { statReads: 0, coverageRefreshes: 0 });
});

test('a newer decoration wins while an older pass is awaiting its morphology tail', async () => {
  const f = fixture();
  f.rowWork.resolve(true); f.states.resolve({});
  const old = f.context.applyDecorations(); await flush();
  const latest = f.context.applyDecorations(); await flush();
  assert.equal(f.decorationJobs[0].options.isCurrent(), false);
  assert.equal(f.decorationJobs[1].options.isCurrent(), true);
  f.decorationJobs[1].resolve(); await latest;
  const currentWrites = JSON.stringify(f.writes);
  f.decorationJobs[0].resolve(); await old;
  assert.equal(JSON.stringify(f.writes), currentWrites, 'stale completion cannot append a new due-marker record');
  assert.deepEqual(f.counters(), { statReads: 1, coverageRefreshes: 1 });
});
