'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('diagnostics distinguish a responding lease holder without reading SQLite', async () => {
  const { createRuntimeDiagnostics } = await import('../public/db/runtime-diagnostics.js');
  const channels = new Set();
  class Channel {
    constructor() { channels.add(this); }
    postMessage(data) { for (const peer of channels) if (peer !== this) queueMicrotask(() => peer.onmessage?.({ data })); }
    close() { channels.delete(this); }
  }
  const locks = { query: async () => ({ held: [
    { name: 'linguistpro-opfs-db-owner-v1', mode: 'exclusive', clientId: 'private-id' },
    { name: 'unrelated-user-data', mode: 'exclusive' },
  ], pending: [] }) };
  const waiter = createRuntimeDiagnostics({ Channel, locks, waitMs: 5, snapshot: () => ({ phase: 'waiting-lock', holdsLease: false }) });
  const holder = createRuntimeDiagnostics({ Channel, locks, waitMs: 5, snapshot: () => ({ phase: 'closing-vfs', holdsLease: true }) });
  try {
    const result = await waiter.capture();
    assert.equal(result.peers[0].phase, 'closing-vfs');
    assert.equal(result.peers[0].holdsLease, true);
    assert.equal(result.locks.held.length, 1);
    assert.equal(JSON.stringify(result).includes('private-id'), false);
    assert.equal(JSON.stringify(result).includes('unrelated-user-data'), false);
  } finally { waiter.close(); holder.close(); }
});

const WORKER_A = '11111111-1111-4111-8111-111111111111', DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKER_B = '22222222-2222-4222-8222-222222222222', DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const identity = async (workerId, documentId, generation = 1, surface = 'studio') => {
  const { identityLockName } = await import('../public/db/runtime-diagnostics.js');
  return identityLockName({ surface, release: '3.11.544', documentId, workerId, generation, createdSec: 1757851200 });
};

test('identity lock names carry only allowlisted fields and parse strictly', async () => {
  const { identityLockName, parseIdentity } = await import('../public/db/runtime-diagnostics.js');
  const valid = { surface: 'studio', release: '3.11.544', documentId: DOC_A, workerId: WORKER_A, generation: 2, createdSec: 1757851200 };
  assert.deepEqual(parseIdentity(identityLockName(valid)), valid);
  for (const bad of [{ surface: 'SELECT * FROM texts' }, { release: 'private' }, { documentId: 'Private title' }, { generation: 0 }, { createdSec: 12 }]) {
    assert.equal(identityLockName({ ...valid, ...bad }), null);
  }
  assert.equal(parseIdentity(identityLockName(valid) + '|extra'), null);
  assert.equal(parseIdentity('linguistpro-diag-id-v1|worker|studio|3.11.544|private|title|1|1757851200'), null);
});

test('holders and waiters are joined to identities without exposing client ids', async () => {
  const { describeLocks, holderSummary } = await import('../public/db/runtime-diagnostics.js');
  const value = { held: [
    { name: 'linguistpro-opfs-db-owner-v1', mode: 'exclusive', clientId: 'raw-holder' },
    { name: await identity(WORKER_A, DOC_A, 1, 'room'), mode: 'exclusive', clientId: 'raw-holder' },
    { name: await identity(WORKER_B, DOC_B), mode: 'exclusive', clientId: 'raw-waiter' },
    { name: 'linguistpro-diag-id-v1|worker|studio|private', mode: 'exclusive', clientId: 'raw-malformed' },
  ], pending: [{ name: 'linguistpro-opfs-db-owner-v1', mode: 'exclusive', clientId: 'raw-waiter' }] };
  const locks = describeLocks(value, { self: { workerId: WORKER_B, documentId: DOC_B }, nowSec: 1757851260 });
  assert.equal(/raw-|private/.test(JSON.stringify(locks)), false);
  assert.deepEqual(locks.held, [{ name: 'linguistpro-opfs-db-owner-v1', mode: 'exclusive', client: 'C1' }]);
  assert.equal(locks.relations[0].holderIdentified, true);
  assert.equal(locks.relations[0].holderIsSelf, false);
  assert.deepEqual(locks.relations[0].waiters, [{ client: 'C2', identified: true, self: true, sameClientAsHolder: false, sameDocumentAsHolder: false }]);
  assert.equal(locks.clients.find(client => client.client === 'C1').identity.ageSec, 60);
  assert.equal(holderSummary(locks), 'room/3.11.544/other-document/gen1/age60s');
});

test('self-held locks, same-document workers and uninstrumented holders are distinct', async () => {
  const { describeLocks, holderSummary } = await import('../public/db/runtime-diagnostics.js');
  const owner = { name: 'linguistpro-opfs-db-owner-v1', mode: 'exclusive', clientId: 'raw-old' };
  const old = { name: await identity(WORKER_A, DOC_A, 1), mode: 'exclusive', clientId: 'raw-old' };
  const replacement = { name: await identity(WORKER_B, DOC_A, 2), mode: 'exclusive', clientId: 'raw-new' };
  const twoWorkers = describeLocks({ held: [owner, old, replacement], pending: [{ ...owner, clientId: 'raw-new' }] },
    { self: { workerId: WORKER_B, documentId: DOC_A }, nowSec: 1757851200 });
  assert.equal(twoWorkers.relations[0].waiters[0].sameDocumentAsHolder, true);
  assert.equal(holderSummary(twoWorkers), 'studio/3.11.544/same-document/gen1/age0s');
  assert.equal(holderSummary(describeLocks({ held: [owner, old], pending: [] }, { self: { workerId: WORKER_A, documentId: DOC_A } })), 'self');
  assert.equal(holderSummary(describeLocks({ held: [{ name: '/app.db-outer', mode: 'exclusive', clientId: 'raw' }], pending: [] })), 'uninstrumented');
  assert.equal(holderSummary(describeLocks({ held: [], pending: [] })), 'none');
  assert.equal(holderSummary({ unavailable: true }), 'unknown');
});

test('identity lock is uncontended, never awaited and released with the recording window', async () => {
  const { holdIdentityLock } = await import('../public/db/runtime-diagnostics.js');
  const calls = []; let held; let timerMs;
  const locks = { request(name, options, callback) { calls.push({ name, options }); held = callback({ name }); return new Promise(() => {}); } };
  assert.equal(holdIdentityLock({ locks, name: 'linguistpro-diag-id-v1|fixture', holdMs: 900, setTimer: (release, ms) => { timerMs = ms; release(); } }), true);
  assert.deepEqual(calls[0].options, { ifAvailable: true });
  assert.equal(timerMs, 900);
  await held;
  assert.equal(holdIdentityLock({ locks: undefined, name: 'n', holdMs: 1 }), false);
  assert.equal(holdIdentityLock({ locks: { request() { throw new Error('denied'); } }, name: 'n', holdMs: 1 }), false);
  assert.equal(holdIdentityLock({ locks: { request: () => Promise.reject(new Error('denied')) }, name: 'n', holdMs: 1 }), true);
  assert.equal(holdIdentityLock({ locks, name: null, holdMs: 1 }), false);
});

test('unresponsive lock query is bounded and explicitly unknown', async () => {
  const { createRuntimeDiagnostics } = await import('../public/db/runtime-diagnostics.js');
  const diagnostic = createRuntimeDiagnostics({ Channel: null, waitMs: 5,
    locks: { query: () => new Promise(() => {}) }, snapshot: () => ({ phase: 'idle' }) });
  const result = await diagnostic.capture();
  assert.deepEqual(result.locks, { unavailable: true });
  assert.deepEqual(result.peers, []);
  diagnostic.close();
});
