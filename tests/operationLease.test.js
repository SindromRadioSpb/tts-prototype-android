'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(options = {}) {
  const { OperationLease } = await import('../public/db/operation-lease.js');
  let tail = Promise.resolve(), physical = 0, transaction = false;
  const events = [];
  const locks = { request(name, { signal }, callback) {
    const request = tail.then(() => {
      if (signal.aborted) throw new Error('aborted');
      events.push('acquire');
      return callback().then(() => events.push('release'));
    });
    tail = request.catch(() => {}); return request;
  } };
  const lease = new OperationLease({ locks, lockName: 'fixture',
    open: async () => { physical++; assert.equal(physical, 1); events.push('open'); },
    close: async () => { if (physical) { events.push('close'); physical--; } },
    inTransaction: () => transaction,
    rollback: async () => { transaction = false; events.push('rollback'); },
    onCommit: () => events.push('commit-notification'), ...options,
  });
  return { lease, events, tx: value => { transaction = value; } };
}
test('serializes asynchronous calls and closes resources before releasing lock/reply', async () => {
  const { lease, events } = await fixture();
  await Promise.all([1, 2, 3].map(n => lease.run(async () => {
    await lease.ensureOpen(); events.push(`start${n}`); await delay(2); events.push(`end${n}`);
  })));
  assert.deepEqual(events, [1, 2, 3].flatMap(n => ['acquire', 'open', `start${n}`, `end${n}`, 'close', 'release']));
});
test('holds physical lease across transaction awaits and notifies only after commit', async () => {
  const { lease, events, tx } = await fixture();
  await lease.run(async () => { await lease.ensureOpen(); tx(true); }, { sql: 'BEGIN' });
  await lease.run(async () => {}, { sql: 'INSERT INTO fixture VALUES (1)' });
  assert.deepEqual(events, ['acquire', 'open']);
  await lease.run(async () => { tx(false); }, { sql: 'COMMIT' });
  assert.deepEqual(events, ['acquire', 'open', 'close', 'release', 'commit-notification']);
});
test('abandoned transaction rolls back; late continuation cannot become an autocommit write', async () => {
  const { lease, events, tx } = await fixture({ transactionIdleMs: 10 });
  await lease.run(async () => { await lease.ensureOpen(); tx(true); }, { sql: 'BEGIN' });
  await delay(25);
  let executed = false;
  await assert.rejects(lease.run(async () => { executed = true; }, { sql: 'INSERT INTO fixture VALUES (1)' }), { code: 'DB_TRANSACTION_ABORTED' });
  assert.equal(executed, false);
  assert.ok(events.includes('rollback'));
  await lease.run(() => lease.close(), { reset: true });
  await lease.run(() => lease.ensureOpen());
});
test('ordinary SQL error does not poison the queue or retain idle ownership', async () => {
  const { lease, events } = await fixture();
  await assert.rejects(lease.run(async () => { await lease.ensureOpen(); throw new Error('constraint'); }), /constraint/);
  await lease.run(() => lease.ensureOpen());
  assert.equal(events.filter(e => e === 'release').length, 2);
});
test('resuming a frozen worker checks elapsed time before a delayed write even if timers never fired', async () => {
  let clock = 100;
  const { lease, tx } = await fixture({ transactionIdleMs: 30000, now: () => clock });
  await lease.run(async () => { await lease.ensureOpen(); tx(true); }, { sql: 'BEGIN' });
  clock += 60000;
  let written = false;
  await assert.rejects(lease.run(async () => { written = true; }), { code: 'DB_TRANSACTION_ABORTED' });
  assert.equal(written, false);
});
test('missing Web Locks never permits uncoordinated physical access', async () => {
  const { lease, events } = await fixture({ locks: undefined });
  await assert.rejects(lease.run(() => lease.ensureOpen()), { code: 'DB_COORDINATION_UNSUPPORTED' });
  assert.deepEqual(events, []);
});
test('failed physical cleanup retains exclusion and blocks subsequent writes', async () => {
  let broken = true;
  const { lease, events } = await fixture({ close: async () => { if (broken) throw new Error('fixture close failure'); } });
  await assert.rejects(lease.run(() => lease.ensureOpen()), { code: 'DB_STORAGE_CLOSE_FAILED' });
  assert.equal(events.includes('release'), false);
  let written = false;
  await assert.rejects(lease.run(async () => { written = true; }), { code: 'DB_TRANSACTION_ABORTED' });
  assert.equal(written, false);
  broken = false;
  await lease.run(() => lease.close(), { reset: true });
  assert.equal(events.includes('release'), true);
});
