'use strict';
// Ф3б: «Перевод слов ИИ» как этап сборки учебного материала (с медиа и без). Согласие с ценой —
// часть подписанного входа; этап идёт после сохранения и привязки ▶ и до упаковки; частичный
// итог или сбой не валит материал, а называется на финале.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('../public/js/learning-material-task');

const input = { source_text: 'שלום עולם', title: 'Greeting', provider: 'gemini' };
const consent = { enabled: true, quote: { words: 2, usd: 0.0003, basis: 'text' } };
function memory() {
  const rows = new Map();
  return { add: async (j) => (rows.set(j.id, structuredClone(j)), j), get: async (id) => structuredClone(rows.get(id)),
    update: async (id, fn) => { const j = fn(structuredClone(rows.get(id))); rows.set(id, structuredClone(j)); return j; } };
}
function ops(log, gloss) {
  return {
    translate: async () => (log.push('translate'), { rows: [{ he: 'שלום עולם', ru: 'Привет, мир' }] }),
    save: async (j) => (log.push('save'), { id: 'text-' + j.id }),
    glossWords: async (job, opts) => { log.push('gloss'); return gloss(job, opts); },
    preparePackage: async () => (log.push('package'), { sha256: 'a'.repeat(64) }),
  };
}

test('consent is part of the signed input; disabled consent leaves the input unchanged', async () => {
  const on = await T.create({ ...input, word_gloss_ai: consent });
  assert.deepEqual(on.input.word_gloss_ai, consent);
  const off = await T.create({ ...input, word_gloss_ai: { enabled: false } });
  assert.equal('word_gloss_ai' in off.input, false);
  assert.equal(off.signature, (await T.create(input)).signature);
  await assert.rejects(T.create({ ...input, word_gloss_ai: { enabled: true, quote: { words: -1, usd: 0 } } }), /TASK_INPUT_INVALID/);
});

test('the stage runs after saving and before the package, and its outcome is kept', async () => {
  const store = memory(), log = [];
  const job = await T.create({ ...input, word_gloss_ai: consent }); await store.add(job);
  const done = await T.createRunner(store, ops(log, (j) => {
    assert.equal(j.saved_text_id, 'text-' + j.id, 'glosses are taken from the SAVED card');
    return { rows: 1, covered: 1, done: 1, rejected: 0, failed: 0, skipped: 0, error: '' };
  })).run(job.id);
  assert.deepEqual(log, ['translate', 'save', 'gloss', 'package']);
  assert.equal(done.state, 'ready');
  assert.equal(done.word_gloss.covered, 1);
  assert.ok(done.stage_times.glossing, 'the stage has its own clock');
});

test('without consent the stage never runs (owner default: off)', async () => {
  const store = memory(), log = [];
  const job = await T.create(input); await store.add(job);
  await T.createRunner(store, ops(log, () => { throw new Error('must not run'); })).run(job.id);
  assert.deepEqual(log, ['translate', 'save', 'package']);
});

test('a failing provider does not fail the material: the outcome names the reason', async () => {
  const store = memory(), log = [];
  const job = await T.create({ ...input, word_gloss_ai: consent }); await store.add(job);
  const done = await T.createRunner(store, ops(log, () => { const e = new Error('quota'); e.code = 'GEMINI_QUOTA'; throw e; })).run(job.id);
  assert.equal(done.state, 'ready');
  assert.deepEqual(log, ['translate', 'save', 'gloss', 'package']);
  assert.equal(done.word_gloss.error, 'GEMINI_QUOTA');
  assert.equal(done.word_gloss.covered, 0);
});

test('resume does not re-run a recorded stage; «fetch the rest» updates the outcome', async () => {
  const store = memory(), log = [];
  const job = await T.create({ ...input, word_gloss_ai: consent }); await store.add(job);
  let covered = 0;
  const o = ops(log, () => ({ rows: 4, covered, done: covered, rejected: 0, failed: 4 - covered, skipped: 0, error: covered ? '' : 'HTTP_503' }));
  const failPackage = o.preparePackage; let fail = true;
  o.preparePackage = async () => { if (fail) { fail = false; throw new Error('zip'); } return failPackage(); };
  const runner = T.createRunner(store, o);
  await assert.rejects(runner.run(job.id), /zip/);
  await runner.run(job.id);
  assert.equal(log.filter((x) => x === 'gloss').length, 1, 'recorded outcome is not paid for again on resume');
  covered = 4;
  const after = await T.retryWordGloss(store, o, job.id);
  assert.equal(after.word_gloss.covered, 4);
  assert.equal(after.state, 'ready');
});

test('cancel during the stage stops before the package', async () => {
  const store = memory(), log = [];
  const job = await T.create({ ...input, word_gloss_ai: consent }); await store.add(job);
  let runner;
  runner = T.createRunner(store, ops(log, async (j, opts) => {
    await runner.cancel(j.id);
    assert.equal(await opts.shouldStop(), true, 'the stage sees the stop request');
    return { rows: 1, covered: 0, done: 0, rejected: 0, failed: 0, skipped: 1, error: '' };
  }));
  const out = await runner.run(job.id);
  assert.equal(out.state, 'cancelled');
  assert.deepEqual(log, ['translate', 'save', 'gloss']);
});
