const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/course-evidence.js');

const task = { id: '6', spec: { kind: 'order', expect: { drink: 'tea', sugar: 'without' } }, model: { niqqud: 'תֵּה', plain: 'תה' } };
const base = { lessonId: 'L001', lessonVersion: 1, task, channel: 'write_he', input: 'תה בלי סוכר', result: { kind: 'accepted' } };

test('fingerprint sorts nested keys and changes with content or variant', () => {
  const a = E.fingerprint('L001', task);
  const reordered = { model: { plain: 'תה', niqqud: 'תֵּה' }, spec: { expect: { sugar: 'without', drink: 'tea' }, kind: 'order' }, id: '6' };
  assert.equal(a, E.fingerprint('L001', reordered));
  assert.notEqual(a, E.fingerprint('L001', task, { drink: 'coffee' }));
  assert.notEqual(a, E.fingerprint('L002', task));
  assert.notEqual(a, E.fingerprint('L001', { ...task, model: { plain: 'קפה', niqqud: 'קָפֶה' } }));
  assert.match(a, /^[0-9a-f]{8}$/);
});

test('double event within 1 s is duplicate; boundary and clock reversal are not', () => {
  const p = E.record(E.emptyProgress('ulpan'), { ...base, at: 1000 }).progress;
  const r = E.record(p, { ...base, at: 1600 });
  assert.equal(r.duplicate, true);
  assert.deepEqual(r.progress, p);
  assert.equal(r.progress.attempts.length, 1);
  assert.equal(E.record(p, { ...base, at: 2000 }).duplicate, false);
  assert.equal(E.record(p, { ...base, at: 900 }).duplicate, false);
  assert.equal(E.record(p, { ...base, channel: 'read', at: 1600 }).duplicate, false);
  assert.equal(E.record(p, { ...base, input: 'תה', at: 1600 }).duplicate, false);
});

test('duplicate uses most recent attempt for this task, even after another task', () => {
  let p = E.record(E.emptyProgress('ulpan'), { ...base, at: 1000 }).progress;
  p = E.record(p, { ...base, task: { ...task, id: '7' }, at: 1200 }).progress;
  assert.equal(E.record(p, { ...base, at: 1300 }).duplicate, true);
});

test('aid snapshots remain immutable and persist after JSON reload', () => {
  const original = E.emptyProgress('ulpan');
  let p = E.openAid(original, 'L001/6', 'model', 500);
  assert.deepEqual(original.aids, {});
  const r = E.record(p, { ...base, at: 900 });
  assert.equal(r.attempt.aids.model, true);
  assert.equal(r.attempt.first, true);
  assert.equal(p.attempts.length, 0);
  p = E.openAid(r.progress, 'L001/6', 'hint', 1100);
  p = E.openAid(p, 'L001/6', 'hint', 1200);
  assert.equal(r.attempt.aids.hint, 0);
  assert.equal(r.progress.attempts[0].aids.hint, 0);
  const later = E.record(JSON.parse(JSON.stringify(p)), { ...base, at: 2000 });
  assert.deepEqual(later.attempt.aids, { hint: 2, model: true, transcript: false, translation: false });
  assert.equal(later.attempt.first, false);
  assert.notEqual(later.attempt.id, r.attempt.id);
  later.attempt.aids.hint = 99;
  assert.equal(later.progress.attempts[1].aids.hint, 2);
});

test('zero timestamp and prototype-like keys are owned values', () => {
  let p = E.record(E.emptyProgress('ulpan'), { ...base, at: 0 }).progress;
  assert.equal(E.record(p, { ...base, at: 2000 }).attempt.first, false);
  p = E.openAid(p, '__proto__', 'translation', 1);
  assert.equal(Object.hasOwn(p.aids, '__proto__'), true);
  assert.equal(p.aids.__proto__.translation, true);
  assert.equal({}.translation, undefined);
});
