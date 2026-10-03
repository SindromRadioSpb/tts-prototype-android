'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const core = () => import('../public/db/change-scope.js');
const scope = (...tables) => ({ schema: 1, all: false, tables: tables.sort() });

test('DML scopes include only target names, never source text or WHERE literals', async () => {
  const { createChangeTracker } = await core(), tracker = createChangeTracker();
  tracker.record(`WITH c AS (SELECT 'DELETE FROM notes_v2; private text') UPDATE "main"."texts" SET title='secret';
    INSERT OR REPLACE INTO [text_progress](text_id) VALUES ('private-id');
    /* UPDATE word_status */ DELETE FROM sentences WHERE text_id='private-id';`);
  assert.deepEqual(tracker.snapshot(), scope('sentences', 'text_progress', 'texts'));
});
test('reads and rolled-back savepoints do not leak scopes into the committed transaction', async () => {
  const { createChangeTracker } = await core(), tracker = createChangeTracker();
  tracker.record('BEGIN; UPDATE texts SET title=1; SAVEPOINT outer_save; UPDATE word_status SET familiarity=1; SAVEPOINT inner_save; DELETE FROM notes_v2; ROLLBACK TO outer_save; RELEASE outer_save; COMMIT');
  assert.deepEqual(tracker.snapshot(), scope('texts'));
  tracker.clear(); tracker.record('SAVEPOINT only; INSERT INTO texts VALUES(1); ROLLBACK TO only; RELEASE only;');
  assert.deepEqual(tracker.snapshot(), scope());
  tracker.record('BEGIN; DELETE FROM texts; ROLLBACK; SELECT 1;');
  assert.deepEqual(tracker.snapshot(), scope());
});
test('unknown SQL and old or malformed envelopes invalidate conservatively', async () => {
  const { createChangeTracker, normalizeChanges, changesAffect } = await core(), tracker = createChangeTracker();
  tracker.record('ALTER TABLE texts ADD COLUMN fixture TEXT');
  assert.equal(tracker.snapshot().all, true);
  for (const value of [null, { changed: true }, { schema: 2, all: false, tables: [] }, { schema: 1, all: false, tables: ['secret; SQL'] }]) {
    assert.deepEqual(normalizeChanges(value), { schema: 1, all: true, tables: [] });
    assert.equal(changesAffect(value, 'catalog'), true);
  }
  assert.equal(changesAffect(scope('future_unclassified_table'), 'catalog'), true);
});
test('progress, word state, metadata and structure invalidate their consumers independently', async () => {
  const { changesAffect } = await core();
  assert.equal(changesAffect(scope('text_progress'), 'catalogData'), false);
  assert.equal(changesAffect(scope('text_progress'), 'words'), false);
  assert.equal(changesAffect(scope('text_progress'), 'progress'), true);
  assert.equal(changesAffect(scope('word_status'), 'mediathequeItems'), false);
  assert.equal(changesAffect(scope('word_status'), 'words'), true);
  assert.equal(changesAffect(scope('mediatheque_personal'), 'mediathequeStructure'), true);
  assert.equal(changesAffect(scope('mediatheque_personal'), 'mediathequeItems'), false);
  assert.equal(changesAffect(scope('texts'), 'progress'), true, 'parent deletes can cascade');
  assert.equal(changesAffect(scope('texts'), 'words'), true, 'parent deletes can cascade');
});
test('bursts merge into one content-free delivery; legacy messages widen the whole batch', async () => {
  const { createChangeBatcher } = await core(); let callback, scheduled = 0; const delivered = [];
  const batch = createChangeBatcher(value => delivered.push(value), { schedule: fn => { callback = fn; return ++scheduled; }, cancel() {} });
  for (let i = 0; i < 10; i++) batch.add(scope(i % 2 ? 'text_progress' : 'texts'));
  assert.equal(scheduled, 1); callback(); assert.deepEqual(delivered, [scope('text_progress', 'texts')]);
  batch.add(scope('word_status')); batch.add(undefined); batch.flush();
  assert.equal(delivered[1].all, true); assert.equal(delivered.length, 2);
});

test('rollback cannot erase earlier autocommitted or committed statements in the same exec', async () => {
  const { createChangeTracker } = await core(), tracker = createChangeTracker();
  tracker.record('UPDATE texts SET title=1; BEGIN; UPDATE text_progress SET last_row_idx=1; COMMIT; BEGIN; DELETE FROM word_status; ROLLBACK;');
  assert.deepEqual(tracker.snapshot(), scope('text_progress', 'texts'));
  tracker.clear();
  tracker.record('SAVEPOINT first; UPDATE texts SET title=1; RELEASE first; SAVEPOINT second; DELETE FROM notes_v2; ROLLBACK TO second; RELEASE second');
  assert.deepEqual(tracker.snapshot(), scope('texts'));
});
test('uncertain failed statement inside a transaction is silenced by its full rollback', async () => {
  const { createChangeTracker } = await core(), tracker = createChangeTracker();
  tracker.uncertain(true); tracker.record('ROLLBACK;');
  assert.deepEqual(tracker.snapshot(), scope());
});
