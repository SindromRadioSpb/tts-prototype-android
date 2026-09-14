'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

async function fixture() {
  const { IDBContext } = await import('../public/db/IDBContext.js');
  const transactions = [];
  let closed = false;
  const db = { objectStoreNames: [], close() { closed = true; },
    transaction(_stores, mode) {
      const tx = new EventTarget();
      tx.mode = mode;
      tx.listeners = [];
      const add = tx.addEventListener.bind(tx);
      tx.addEventListener = (type, callback) => { tx.listeners.push(type); add(type, callback); };
      transactions.push(tx);
      return tx;
    } };
  return { context: new IDBContext(db), transactions, isClosed: () => closed };
}

test('completion listeners belong to each transaction immediately, not to a later mutable transaction', async () => {
  const { context, transactions, isClosed } = await fixture();
  await context.run('readonly', () => {});
  await context.run('readwrite', () => {});
  // Both transactions can exist before the first complete event is delivered.
  // Sync must track the second transaction even while the first is pending.
  assert.deepEqual(transactions.map(tx => tx.listeners), [['complete', 'abort'], ['complete', 'abort']]);
  let finished = false;
  const closing = context.close().then(() => { finished = true; });
  transactions[0].dispatchEvent(new Event('complete'));
  await Promise.resolve();
  assert.equal(finished, false);
  transactions[1].dispatchEvent(new Event('complete'));
  await closing;
  assert.equal(isClosed(), true);
});

test('an aborted transaction is reported by sync and never swallowed by a later transaction', async () => {
  const { context, transactions } = await fixture();
  await context.run('readonly', () => {});
  await context.run('readwrite', () => {});
  const failure = new DOMException('Fixture write aborted', 'AbortError');
  transactions[1].error = failure;
  const synced = assert.rejects(context.sync(), error => error === failure);
  // A queued transaction can be aborted before an older transaction finishes.
  transactions[1].dispatchEvent(new Event('abort'));
  transactions[0].dispatchEvent(new Event('complete'));
  await synced;
});

test('an aborted transaction is reported once and does not poison later transactions', async () => {
  const { context, transactions } = await fixture();
  await context.run('readwrite', () => {});
  const failure = new DOMException('Fixture write aborted', 'AbortError');
  transactions[0].error = failure;
  transactions[0].dispatchEvent(new Event('abort'));
  await assert.rejects(context.sync(), error => error === failure);
  // SQLite's next unlock/write must observe only transactions since that report.
  await context.run('readwrite', () => {});
  const later = context.sync();
  transactions[1].dispatchEvent(new Event('complete'));
  await later;
});

test('explicit abort is typed and close still releases the IndexedDB connection', async () => {
  const { context, transactions, isClosed } = await fixture();
  await context.run('readwrite', () => {});
  transactions[0].dispatchEvent(new Event('abort'));
  await assert.rejects(context.close(), error => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(isClosed(), true);
});
