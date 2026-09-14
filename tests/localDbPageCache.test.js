'use strict';
// Back/forward cache lifecycle of the local DB facade. Owner iPhone evidence
// (3.11.544): a cached document's suspended worker kept the library lock.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/db/local-db.js'), 'utf8');

function harness({ initialized = true, txOpen = false, worker = true } = {}) {
  const workers = [];
  class FakeWorker {
    constructor() { this.posted = []; this.terminated = false; workers.push(this); }
    postMessage(message) { this.posted.push(message); }
    terminate() { this.terminated = true; }
  }
  const initCalls = [];
  const context = vm.createContext({
    Promise, Map, clearTimeout,
    _worker: null, _initialized: initialized, _seq: 10, _pending: new Map(),
    _pageCached: false, _resumeWaiters: [], _reopenAfterCache: null, _txOpen: txOpen, _cacheAbortedTransaction: false,
    _dbJournal: { record() {} },
    DbUnavailableError: class extends Error { constructor(code) { super(code); this.code = code; } },
    _startDbDiagnostics() {},
    _initDiagnosticOptions: () => ({ diagnosticWorkerId: 'new-worker' }),
    initLocalDB: () => { initCalls.push(true); return Promise.resolve(); },
  });
  context._spawnWorker = () => { context._worker = new FakeWorker(); };
  if (worker) context._worker = new FakeWorker();
  const start = source.indexOf('function _suspendForPageCache(');
  const end = source.indexOf('// ── end page cache lifecycle', start);
  assert.ok(start >= 0 && end > start, 'page cache lifecycle functions exist');
  vm.runInContext(source.slice(start, end), context);
  const pending = (type, sql) => new Promise((resolve, reject) => {
    const id = ++context._seq;
    context._pending.set(id, { resolve, reject, type, sql,
      message: { id, type, sql, preferVfs: 'AccessHandlePool', diagnosticWorkerId: 'old-worker' } });
  });
  return { context, workers, initCalls, pending };
}

test('entering the cache terminates the worker and fails in-flight SQL without replaying it', async () => {
  const h = harness();
  const read = h.pending('query', 'SELECT 1');
  const write = h.pending('run', 'INSERT INTO t VALUES (1)');
  h.context._suspendForPageCache();
  assert.equal(h.workers[0].terminated, true, 'the browser releases a terminated worker\'s locks and handles');
  assert.equal(h.context._worker, null);
  assert.equal(h.context._initialized, false);
  assert.equal(h.context._pageCached, true);
  await assert.rejects(read, { code: 'DB_PAGE_SUSPENDED' });
  await assert.rejects(write, { code: 'DB_PAGE_SUSPENDED' });
  assert.equal(h.context._cacheAbortedTransaction, false, 'work outside a transaction does not block later SQL');
  h.context._resumeFromPageCache();
  assert.equal(h.initCalls.length, 1, 'an opened page reopens its store after pageshow');
  assert.equal(h.context._pageCached, false);
});

test('an open or starting transaction is marked aborted when the worker is terminated', () => {
  const open = harness({ txOpen: true });
  open.context._suspendForPageCache();
  assert.equal(open.context._cacheAbortedTransaction, true);
  const starting = harness();
  starting.pending('exec', 'BEGIN IMMEDIATE;').catch(() => {});
  starting.context._suspendForPageCache();
  assert.equal(starting.context._cacheAbortedTransaction, true, 'a queued BEGIN may already have started');
});

test('an interrupted boot initialization is replayed on a fresh worker and completes its promise', async () => {
  const h = harness({ initialized: false });
  const boot = h.pending('init');
  h.context._suspendForPageCache();
  assert.equal(h.workers[0].terminated, true);
  h.context._resumeFromPageCache();
  const fresh = h.context._worker;
  assert.equal(h.workers.length, 2);
  assert.equal(fresh, h.workers[1]);
  assert.equal(fresh.posted.length, 1);
  assert.equal(fresh.posted[0].type, 'init');
  assert.equal(fresh.posted[0].preferVfs, 'AccessHandlePool');
  assert.equal(fresh.posted[0].diagnosticWorkerId, 'new-worker');
  assert.equal(h.initCalls.length, 0, 'the original initialization continues instead of a second one');
  h.context._pending.get(fresh.posted[0].id).resolve({ vfs: 'AccessHandlePool' });
  await boot;
});

test('calls deferred while cached resume in order, and an unopened page starts no database', () => {
  const h = harness({ initialized: false, worker: false });
  h.context._suspendForPageCache();
  const order = [];
  h.context._resumeWaiters.push(() => order.push('first'), () => order.push('second'));
  h.context._resumeFromPageCache();
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(h.initCalls.length, 0);
  assert.equal(h.context._worker, null);
});
