'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('table-job journal restores only a proven contiguous prefix for the exact plan', () => {
  const Job = require('../public/js/table-job.js');
  const segments = Array.from({ length: 5 }, (_, i) => ({ i, text: `segment ${i}` }));
  let journal = Job.create({ text: 'source', provider: 'gemini', segments, chunkSize: 2,
    mediaSha: 'a'.repeat(64), now: 1000 });
  journal = Job.acceptChunk(journal, { index: 0, rows: [{ he: 'a' }], meta: { fromCache: false }, now: 2000 });
  assert.throws(() => Job.acceptChunk(journal, { index: 2, rows: [{ he: 'gap' }], now: 2500 }), /NON_CONTIGUOUS/);
  journal = Job.acceptChunk(journal, { index: 1, rows: [{ he: 'b' }], meta: { fromCache: true }, now: 3000 });

  const resumed = Job.resume(journal, { text: 'source', provider: 'gemini', segments, chunkSize: 2 });
  assert.deepEqual(resumed.rows, [{ he: 'a' }, { he: 'b' }]);
  assert.equal(resumed.nextChunk, 2);
  assert.equal(resumed.mediaSha, 'a'.repeat(64));
  assert.equal(Job.resume(journal, { text: 'changed', provider: 'gemini', segments, chunkSize: 2 }), null);
  assert.equal(Job.resume(journal, { text: 'source', provider: 'google-free', segments, chunkSize: 2 }), null);
});

test('table-job telemetry has a closed state vocabulary and explicit retry budget', () => {
  const Job = require('../public/js/table-job.js');
  assert.deepEqual(Job.STATES, ['cache', 'generate', 'retry', 'repair', 'split', 'done', 'stopped']);
  const snap = Job.telemetry({ state: 'retry', chunk: 2, chunks: 6, attempt: 2, attempts: 2,
    readyRows: 120, totalRows: 709, startedAt: 1000, now: 61000, nextAction: 'wait' });
  assert.deepEqual(snap, { state: 'retry', chunk: 2, chunks: 6, attempt: 2, attempts: 2,
    readyRows: 120, totalRows: 709, elapsedSec: 60, nextAction: 'wait' });
  assert.throws(() => Job.telemetry({ state: 'hidden-retry' }), /UNKNOWN_STATE/);
});
