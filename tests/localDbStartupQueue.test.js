'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/db/local-db.js'), 'utf8');

function fixture() {
  const sent = [];
  const context = vm.createContext({ Date, Promise, Map, setTimeout, clearTimeout,
    _initialized: false, _initInFlight: null, _workerCrashed: false,
    _lastDbError: null, _seq: 0, _pending: new Map(),
    _worker: { postMessage: data => sent.push(data) },
    _dbJournal: { enabled: () => false },
    DbUnavailableError: class extends Error { constructor(code) { super(code); this.code = code; } },
  });
  const start = source.indexOf('function _call(');
  vm.runInContext(source.slice(start, source.indexOf('// Sticky VFS preference:', start)), context);
  return { context, sent, call: type => context._call(type, 'fixture') };
}

test('startup SQL waits for successful initialization before posting to worker', async () => {
  const h = fixture(); let ready;
  h.context._initInFlight = new Promise(resolve => { ready = resolve; });
  const work = h.call('query');
  assert.equal(h.sent.length, 0);
  h.context._initialized = true; ready();
  await Promise.resolve();
  assert.equal(h.sent.length, 1);
  h.context._pending.get(h.sent[0].id).resolve([]);
  await work;
});

test('failed init rejects all startup SQL without posting it, but permits close', async () => {
  const h = fixture(); let fail;
  h.context._initInFlight = new Promise((_resolve, reject) => { fail = reject; });
  const work = Promise.allSettled(['query', 'run', 'exec'].map(h.call));
  const failure = new Error('fixture initialization failed');
  fail(failure);
  for (const result of await work) assert.equal(result.reason, failure);
  assert.equal(h.sent.length, 0);
  h.context._initInFlight = null; h.context._lastDbError = failure;
  await assert.rejects(h.call('query'), error => error === failure);
  const close = h.call('close');
  assert.equal(h.sent[0].type, 'close');
  h.context._pending.get(h.sent[0].id).resolve({});
  await close;
});
