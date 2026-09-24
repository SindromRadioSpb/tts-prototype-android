'use strict';
// Ремонт карточек, сохранённых без медиа (владелец, «Хан Юнес», 2026-09-24): модель склеила 241
// реплику в 133 строки, и строку нужно найти в ДИАПАЗОНЕ подряд идущих реплик, а не в одной.
const test = require('node:test');
const assert = require('node:assert/strict');
const AT = require('../public/js/asr-transcript.js');
const C = require('../public/js/media-rebind-core.js');
const deps = { normalize: AT.stitchNormalizeWords };
const seg = (text, i) => ({ text, caption_segment_id: 'c' + i });
const idx = (r) => r.rows.map((x) => x.segment_index);

test('a row merged from several cues binds to the first cue of its span', () => {
  const segments = ['שלום מיה', 'מה שלומך', 'תודה רבה'].map(seg);
  const r = C.alignRowsToSegmentSpans(['שלום מיה, מה שלומך?', 'תודה רבה.'], segments, deps);
  assert.deepEqual(idx(r), [0, 2]);
  assert.equal(r.bound, 2); assert.equal(r.total, 2);
});

test('a word-free cue such as "..." neither blocks nor shifts its neighbours', () => {
  const segments = ['שלום מיה', '...', 'תודה רבה'].map(seg);
  const r = C.alignRowsToSegmentSpans(['שלום מיה', 'תודה רבה'], segments, deps);
  assert.deepEqual(idx(r), [0, 2]);
});

test('a row with a word the transcript never had stays unbound and the next row still binds', () => {
  const segments = ['שלום מיה', 'מה שלומך', 'תודה רבה'].map(seg);
  const r = C.alignRowsToSegmentSpans(['שלום מיה', 'מה שלומך היום', 'תודה רבה'], segments, deps);
  assert.deepEqual(idx(r), [0, null, 2]);
  assert.equal(r.bound, 2);
});

test('rows never bind backwards in time', () => {
  const segments = ['שלום מיה', 'תודה רבה'].map(seg);
  const r = C.alignRowsToSegmentSpans(['תודה רבה', 'שלום מיה'], segments, deps);
  assert.deepEqual(idx(r), [0 + 1, null]);
});

test('empty input binds nothing', () => {
  assert.equal(C.alignRowsToSegmentSpans([], [seg('שלום', 0)], deps).bound, 0);
  assert.equal(C.alignRowsToSegmentSpans(['שלום'], [], deps).bound, 0);
});

test('planRebind maps rows to caption ids and reports the share of rows that gain play buttons', () => {
  const revision = { segments: ['שלום מיה', 'מה שלומך', 'תודה רבה'].map(seg) };
  const plan = C.planRebind(['שלום מיה מה שלומך', 'משהו אחר', 'תודה רבה'], revision, deps);
  assert.deepEqual(plan.mapping.rows, [
    { row_index: 0, caption_segment_id: 'c0' },
    { row_index: 2, caption_segment_id: 'c2' },
  ]);
  assert.equal(plan.bound, 2); assert.equal(plan.total, 3);
  assert.equal(Math.round(plan.ratio * 100), 67);
  assert.equal(plan.needsRebuild, true, 'under 80% of rows the paid rebuild is offered');
});

test('the rebind target is the one transcript that explains the most rows, and a tie is refused', () => {
  const plan = (bound) => ({ bound, total: 10, ratio: bound / 10 });
  assert.equal(C.chooseCandidate([{ id: 'a', plan: plan(3) }, { id: 'b', plan: plan(9) }]).candidate.id, 'b');
  assert.equal(C.chooseCandidate([{ id: 'a', plan: plan(7) }, { id: 'b', plan: plan(7) }]).reason, 'AMBIGUOUS');
  assert.equal(C.chooseCandidate([{ id: 'a', plan: plan(0) }]).reason, 'NO_MATCH');
  assert.equal(C.chooseCandidate([]).reason, 'NO_MATCH');
});
