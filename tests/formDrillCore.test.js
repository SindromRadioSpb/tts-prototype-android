'use strict';
// Д2.2 — тренировка форм: задания из реальных клеток Pealim, порядок «встреченные → их группа → остальные →
// освежить усвоенные», варианты из той же таблицы без дублей формы, омографичные клетки = одна форма.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const F = require('../public/js/form-drill-core.js');
const IR = require('../public/js/inflection-render.js');

const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz'))).toString('utf8'));
const katav = ds.paradigms.find((p) => p.lemma === 'לכתוב' && p.binyan === 'paal');
const study = IR.projectStudyForms(katav);

test('forms are exactly the Pealim cells of the table (no invented form)', () => {
  const forms = F.formsOf(study);
  assert.ok(forms.length >= 25);
  forms.forEach((f) => assert.equal(f.he, katav.cells[f.slot].he));
  assert.ok(forms.some((f) => f.slot === 'PERF-1p'));
});

test('deck: met forms first, then their group, mastered ones last', () => {
  const deck = F.buildDeck(study, { metSlots: ['PERF-3fs'], memory: { 'PERF-1s': { streak: 2, last: 5 } }, size: 8 });
  assert.equal(deck[0].slot, 'PERF-3fs');
  assert.ok(deck.slice(1, 6).every((f) => f.groupKey === deck[0].groupKey), 'the rest of the past tense follows');
  assert.ok(!deck.some((f) => f.slot === 'PERF-1s'), 'a mastered form waits until the others are done');
  const all = F.buildDeck(study, { memory: Object.fromEntries(F.formsOf(study).map((f) => [f.slot, { streak: 2, last: f.slot === 'AP-ms' ? 1 : 9 }])), size: 3 });
  assert.equal(all[0].slot, 'AP-ms', 'when everything is mastered, the least recently seen comes first');
});

test('options: four distinct forms of the same table, same tense first, the answer among them', () => {
  const target = F.formsOf(study).find((f) => f.slot === 'PERF-1p');
  const opts = F.optionsFor(target, study, 4, 7);
  assert.equal(opts.length, 4);
  assert.ok(opts.some((o) => o.slot === 'PERF-1p'));
  assert.equal(new Set(opts.map((o) => o.he)).size, 4, 'no two options look the same');
  assert.ok(opts.filter((o) => o.groupKey === target.groupKey).length >= 3, 'mostly other persons of the past');
});

test('homograph cells count as one form; memory streak marks a form mastered', () => {
  const t2ms = F.formsOf(study).find((f) => f.slot === 'IMPF-2ms');
  const t3fs = F.formsOf(study).find((f) => f.slot === 'IMPF-3fs');
  assert.equal(t2ms.he, t3fs.he, 'Pealim: תִּכְתֹּב is both «ты (м)» and «она» in the future');
  assert.equal(F.isCorrect(t3fs, t2ms.he), true);
  assert.equal(F.isCorrect(t3fs, F.formsOf(study).find((f) => f.slot === 'IMPF-1s').he), false);
  const opts = F.optionsFor(t3fs, study, 4, 3);
  assert.equal(opts.filter((o) => o.he === t3fs.he).length, 1, 'the twin cell is never offered as a distractor');
  let m = {};
  m = F.grade(m, 'PERF-1p', true, 10); m = F.grade(m, 'PERF-1p', true, 20);
  assert.equal(F.mastered(m['PERF-1p']), true);
  m = F.grade(m, 'PERF-1p', false, 30);
  assert.equal(F.mastered(m['PERF-1p']), false, 'a miss resets the streak');
  assert.deepEqual(F.summary(study, m), { total: F.formsOf(study).length, mastered: 0, tried: 1 });
});
