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
    _pageCached: false, _resumeWaiters: [], _cacheAbortedTransaction: false,
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

test('SQL issued while the page is in back/forward cache waits for pageshow instead of reaching a worker', async () => {
  const h = fixture();
  h.context._initialized = true; h.context._pageCached = true;
  const work = h.call('run');
  assert.equal(h.sent.length, 0);
  h.context._pageCached = false;
  h.context._resumeWaiters.splice(0).forEach(resume => resume());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sent.length, 1);
  h.context._pending.get(h.sent[0].id).resolve(1);
  assert.equal(await work, 1);
});

test('a transaction rolled back by page caching cannot continue as autocommit writes', async () => {
  const h = fixture();
  h.context._initialized = true; h.context._cacheAbortedTransaction = true;
  const reopen = h.context._call('init');
  assert.equal(h.context._cacheAbortedTransaction, true, 'the reopen after pageshow keeps the abort mark');
  h.context._pending.get(h.sent[0].id).resolve({});
  await reopen;
  h.sent.length = 0;
  await assert.rejects(h.context._call('run', 'INSERT INTO t VALUES (1)'), { code: 'DB_TRANSACTION_ABORTED' });
  await assert.rejects(h.context._call('exec', 'ROLLBACK TO sp;'), { code: 'DB_TRANSACTION_ABORTED' });
  assert.equal(JSON.stringify(await h.context._call('exec', 'ROLLBACK;')), '{}');
  assert.equal(h.sent.length, 0, 'no statement of the aborted transaction reaches the worker');
  const next = h.context._call('run', 'INSERT INTO t VALUES (2)');
  assert.equal(h.sent.length, 1);
  h.context._pending.get(h.sent[0].id).resolve(1);
  await next;
  h.context._cacheAbortedTransaction = true;
  await assert.rejects(h.context._call('exec', 'COMMIT;'), { code: 'DB_TRANSACTION_ABORTED' });
  assert.equal(h.context._cacheAbortedTransaction, false, 'COMMIT ends the aborted transaction');
});
