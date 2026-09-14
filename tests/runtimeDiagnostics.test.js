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

test('unresponsive lock query is bounded and explicitly unknown', async () => {
  const { createRuntimeDiagnostics } = await import('../public/db/runtime-diagnostics.js');
  const diagnostic = createRuntimeDiagnostics({ Channel: null, waitMs: 5,
    locks: { query: () => new Promise(() => {}) }, snapshot: () => ({ phase: 'idle' }) });
  const result = await diagnostic.capture();
  assert.deepEqual(result.locks, { unavailable: true });
  assert.deepEqual(result.peers, []);
  diagnostic.close();
});
