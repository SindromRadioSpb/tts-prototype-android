'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('table-job journal restores only a proven contiguous prefix for the exact plan', () => {
  const Job = require('../public/js/table-job.js');
  const segments = Array.from({ length: 5 }, (_, i) => ({ i, text: `segment ${i}` }));
  let journal = Job.create({ text: 'source', provider: 'gemini', segments, chunkSize: 2,
    mediaSha: 'a'.repeat(64), now: 1000 });
  journal = Job.acceptChunk(journal, { index: 0, rows: [{ he: 'a', segment_index: 0 }], meta: { fromCache: false }, now: 2000 });
  assert.throws(() => Job.acceptChunk(journal, { index: 2, rows: [{ he: 'gap' }], now: 2500 }), /NON_CONTIGUOUS/);
  journal = Job.acceptChunk(journal, { index: 1, rows: [{ he: 'b', segment_index: 2 }], meta: { fromCache: true }, now: 3000 });
  journal = Job.acceptRepair(journal, { indexes: [4], rows: [{ he: 'repaired', segment_index: 4 }],
    meta: { reason: 'coverage-gap' }, now: 3500 });

  const resumed = Job.resume(journal, { text: 'source', provider: 'gemini', segments, chunkSize: 2 });
  assert.deepEqual(resumed.rows, [{ he: 'a', segment_index: 0 }, { he: 'b', segment_index: 2 }, { he: 'repaired', segment_index: 4 }]);
  assert.equal(resumed.nextChunk, 2);
  assert.equal(resumed.repairs, 1);
  assert.equal(resumed.mediaSha, 'a'.repeat(64));
  assert.equal(Job.resume(journal, { text: 'changed', provider: 'gemini', segments, chunkSize: 2 }), null);
  assert.equal(Job.resume(journal, { text: 'source', provider: 'google-free', segments, chunkSize: 2 }), null);
});

test('table-job journal identity is model-specific', () => {
  const Job = require('../public/js/table-job.js');
  const segments = [{ i: 0, text: 'segment 0' }];
  const input = { text: 'source', provider: 'gemini', model: 'gemini-3.8-flash', segments, chunkSize: 1 };
  let journal = Job.create(input);
  journal = Job.acceptChunk(journal, { index: 0, rows: [{ he: 'א', segment_index: 0 }] });

  assert.equal(journal.model, 'gemini-3.8-flash');
  assert.ok(Job.resume(journal, input));
  assert.equal(Job.resume(journal, { ...input, model: 'gemini-3.7-flash' }), null);
  assert.equal(Job.resume(journal, { ...input, model: '' }), null);
});

test('table-job repair evidence survives reload and rejects invalid or duplicate repair indexes', () => {
  const Job = require('../public/js/table-job.js');
  const segments = Array.from({ length: 3 }, (_, i) => ({ i, text: `segment ${i}` }));
  let journal = Job.create({ text: 'source', provider: 'gemini', segments, chunkSize: 3 });
  journal = Job.acceptChunk(journal, { index: 0, rows: [{ segment_index: 0 }, { segment_index: 2 }] });
  journal = Job.acceptRepair(journal, { indexes: [1], rows: [{ segment_index: 1 }] });
  assert.throws(() => Job.acceptRepair(journal, { indexes: [1], rows: [{ segment_index: 1 }] }), /REPAIR_INDEX_ALREADY_RECORDED/);
  assert.throws(() => Job.acceptRepair(journal, { indexes: [], rows: [] }), /REPAIR_INDEXES_REQUIRED/);
  const restored = Job.resume(journal, { text: 'source', provider: 'gemini', segments, chunkSize: 3 });
  assert.equal(restored.rows.length, 3);
  assert.equal(restored.repairs, 1);
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

test('durable journal uses bounded OPFS recovery when localStorage quota is exhausted', async () => {
  const Job = require('../public/js/table-job.js');
  const files = new Map();
  const dir = {
    async getFileHandle(name, options) {
      if (!files.has(name) && !(options && options.create)) throw new Error('not found');
      return {
        async createWritable() {
          let pending = '';
          return { async write(value) { pending = String(value); }, async close() { files.set(name, pending); } };
        },
        async getFile() { return { async text() { return files.get(name); } }; },
      };
    },
    async removeEntry(name) { if (!files.delete(name)) throw new Error('not found'); },
  };
  const root = { async getDirectoryHandle() { return dir; } };
  const oldNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', { configurable: true, value: { storage: { async getDirectory() { return root; } } } });
  const quotaStorage = { getItem() { return null; }, removeItem() {}, setItem() { throw new Error('quota'); } };
  try {
    const journal = Job.create({ text: 'source', provider: 'gemini', segments: [{ i: 0, text: 'one' }], chunkSize: 1 });
    const stored = await Job.storeDurable(journal, quotaStorage);
    assert.deepEqual(stored, { ok: true, backend: 'opfs', file: 'recovery/studio-table-job-v1.json' });
    assert.deepEqual(await Job.loadDurable(quotaStorage), journal);
    await Job.clearDurable(quotaStorage);
    assert.equal(await Job.loadDurable(quotaStorage), null);
  } finally {
    if (oldNavigator) Object.defineProperty(global, 'navigator', oldNavigator);
    else delete global.navigator;
  }
});

// 2026-09-11, разбор прогона владельца: возобновление НЕ подхватило журнал и заново прошло куски
// 0–1 (спасло только серверное кеширование — `fromCache: true`). Молчание здесь недопустимо:
// «журнал не подошёл» обязано быть названо и показано, иначе повторная оплата выглядит как норма.
test('the journal says whether it can be resumed, and names what changed when it cannot', () => {
  const Job = require('../public/js/table-job.js');
  const segments = Array.from({ length: 4 }, (_, i) => ({ i, text: `segment ${i}` }));
  const input = { text: 'source', provider: 'gemini', model: 'gemini-3.8-flash', segments, chunkSize: 2 };
  let journal = Job.create({ ...input, now: 1000 });
  journal = Job.acceptChunk(journal, { index: 0, rows: [{ he: 'a', segment_index: 0 }], now: 2000 });

  const ok = Job.diagnose(journal, input);
  assert.equal(ok.resumable, true);
  assert.equal(ok.nextChunk, 1);
  assert.equal(ok.of, 2);

  assert.equal(Job.diagnose(null, input).reason, 'NO_JOURNAL');
  assert.equal(Job.diagnose({ schema: 'something-else' }, input).reason, 'NO_JOURNAL');

  const changedText = Job.diagnose(journal, { ...input, text: 'other source' });
  assert.equal(changedText.resumable, false);
  assert.equal(changedText.reason, 'SIGNATURE_MISMATCH');
  assert.deepEqual(changedText.changed, ['text']);

  const changedModel = Job.diagnose(journal, { ...input, model: 'gemini-3.7-flash' });
  assert.deepEqual(changedModel.changed, ['model']);

  const changedSegments = Job.diagnose(journal, { ...input, segments: segments.slice(0, 3) });
  assert.deepEqual(changedSegments.changed, ['segments']);
});

test('a journal written before this diagnosis says "unknown", never a guess', () => {
  const Job = require('../public/js/table-job.js');
  const segments = [{ i: 0, text: 'segment 0' }];
  const input = { text: 'source', provider: 'gemini', model: 'gemini-3.8-flash', segments, chunkSize: 1 };
  const legacy = Job.create(input);
  delete legacy.fields;
  const verdict = Job.diagnose(legacy, { ...input, text: 'changed' });
  assert.equal(verdict.resumable, false);
  assert.equal(verdict.reason, 'SIGNATURE_MISMATCH');
  assert.equal(verdict.changed, null, 'an old journal cannot be asked what changed');
});

test('a journal whose completed chunks are broken is not offered as resumable', () => {
  const Job = require('../public/js/table-job.js');
  const segments = Array.from({ length: 4 }, (_, i) => ({ i, text: `segment ${i}` }));
  const input = { text: 'source', provider: 'gemini', model: 'gemini-3.8-flash', segments, chunkSize: 2 };
  const journal = Job.create(input);
  journal.completed = [{ index: 1, rows: [{ he: 'b' }] }];
  const verdict = Job.diagnose(journal, input);
  assert.equal(verdict.resumable, false);
  assert.equal(verdict.reason, 'BROKEN_CHAIN');
});

// Владелец, 2026-09-24: индикация сборки — одна карточка вместо спиннера у «Настроек озвучки».
// Модель отображения чистая: что показать, решает она, а не DOM.
const PJ = require('../public/js/table-job.js');
test('progress model: parts, percent and deferred media while a Gemini job runs', () => {
  const m = PJ.progressModel({ state: 'generate', chunk: 3, chunks: 4, readyRows: 240, totalRows: 453,
    attempt: 1, elapsedSec: 72, mediaSha: 'abc', resumedFrom: 0 });
  assert.equal(m.tone, 'busy');
  assert.deepEqual(m.parts, ['done', 'done', 'current', 'pending']);
  assert.equal(m.percent, 53);
  assert.equal(m.retryAttempt, null, 'a first attempt is not news');
  assert.equal(m.media, 'exact');
  assert.equal(m.mediaDeferred, true, 'the hidden player is explained while the job runs');
  assert.equal(m.elapsedSec, 72);
  assert.equal(m.summary, null);
});

test('progress model: a retry, a resume and a restored cache step are named honestly', () => {
  const retry = PJ.progressModel({ state: 'retry', chunk: 2, chunks: 4, readyRows: 120, totalRows: 453, attempt: 2 });
  assert.equal(retry.retryAttempt, 2);
  const cache = PJ.progressModel({ state: 'cache', chunk: 1, chunks: 4, readyRows: 120, totalRows: 453, resumedFrom: 1 });
  assert.deepEqual(cache.parts, ['done', 'current', 'pending', 'pending'], 'cache reports parts already done');
  assert.equal(cache.resumedFrom, 1);
  const restored = PJ.progressModel({ state: 'done', chunk: 4, chunks: 4, readyRows: 453, totalRows: 453,
    elapsedSec: 99999, restored: true });
  assert.equal(restored.elapsedSec, null, 'time since an old journal is not this run');
});

test('progress model: stop marks the failing part and offers a retry only when it can help', () => {
  const stop = PJ.progressModel({ state: 'stopped', chunk: 2, chunks: 4, readyRows: 120, totalRows: 453, canRetry: true });
  assert.equal(stop.tone, 'stopped');
  assert.deepEqual(stop.parts, ['done', 'failed', 'pending', 'pending']);
  assert.equal(stop.canRetry, true);
  assert.equal(stop.mediaDeferred, false);
  assert.equal(PJ.progressModel({ state: 'stopped', chunk: 1, chunks: 4, canRetry: false }).canRetry, false);
});

test('progress model: done carries the summary; plain builds are indeterminate', () => {
  const done = PJ.progressModel({ state: 'done', chunk: 4, chunks: 4, readyRows: 453, totalRows: 453,
    mediaSha: 'abc', summary: { rows: 453, playable: 452, unvocalized: 6 } });
  assert.equal(done.tone, 'done');
  assert.equal(done.percent, 100);
  assert.deepEqual(done.parts, ['done', 'done', 'done', 'done']);
  assert.deepEqual(done.summary, { rows: 453, playable: 452, unvocalized: 6 });
  assert.equal(done.mediaDeferred, false);
  const plain = PJ.progressModel({ state: 'generate', indeterminate: true });
  assert.equal(plain.indeterminate, true);
  assert.equal(plain.percent, null);
  assert.deepEqual(plain.parts, []);
  assert.equal(plain.media, null);
});
