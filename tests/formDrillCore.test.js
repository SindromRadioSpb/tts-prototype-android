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

// ── Д2.2+ : ввод / плитки / набор слов ─────────────────────────────────────────────────────────
const dibber = ds.paradigms.find((p) => p.lemma === 'לדבר' && p.binyan === 'piel');
const dStudy = IR.projectStudyForms(dibber);
const formOf = (st, slot) => F.formsOf(st).find((f) => f.slot === slot);

test('typed answer: letters only, finals folded, niqqud ignored', () => {
  const t = formOf(study, 'PERF-1p');   // כָּתַבְנוּ
  assert.equal(F.checkTyped(t, study, 'כתבנו').ok, true);
  assert.equal(F.checkTyped(t, study, 'כָּתַבְנוּ').ok, true);
  assert.equal(F.checkTyped(t, study, ' כתבנו ').ok, true);
  const t2 = formOf(study, 'PERF-2mp');  // כְּתַבְתֶּם
  assert.equal(F.checkTyped(t2, study, 'כתבתמ').ok, true, 'a non-final mem at the end is the same letter');
  assert.equal(F.checkTyped(t, study, 'כתבתי').ok, false);
});

test('typed answer: plene spelling only where the vowels allow it', () => {
  const t = formOf(dStudy, 'PERF-1s');   // דִּבַּרְתִּי
  assert.equal(F.checkTyped(t, dStudy, 'דברתי').ok, true, 'defective');
  assert.equal(F.checkTyped(t, dStudy, 'דיברתי').ok, true, 'yod after hiriq');
  assert.equal(F.checkTyped(t, dStudy, 'דבירתי').ok, false, 'yod after a patah is not plene');
  assert.equal(F.checkTyped(t, dStudy, 'דוברתי').ok, false, 'vav after a hiriq is not plene');
  const fut = formOf(study, 'IMPF-1s');  // אֶכְתֹּב
  assert.equal(F.checkTyped(fut, study, 'אכתוב').ok, true, 'vav after holam');
});

test('typed answer that is another cell names that cell; homograph cell counts', () => {
  const t = formOf(study, 'PERF-1p');
  const r = F.checkTyped(t, study, 'כתבתי');
  assert.equal(r.ok, false);
  assert.ok(r.other && r.other.slot === 'PERF-1s', 'the produced form is «я · прошедшее»');
  const t3fs = formOf(study, 'IMPF-3fs');
  assert.equal(F.checkTyped(t3fs, study, 'תכתוב').ok, true);
  const r2 = F.checkTyped(formOf(study, 'PERF-2ms'), study, 'כתבת');
  assert.equal(r2.ok, true, 'letters right');
  assert.equal(r2.niqqudAmbiguous, true, 'כתבת is also «ты (ж)» — the vowels decide, shown to the learner');
});

test('keyboard layout: Russian and Latin keys on a Hebrew layout are converted', () => {
  assert.deepEqual(F.fromLayout('албыщ'), { text: 'כלתדם', converted: true });
  assert.deepEqual(F.fromLayout('fk,so'), { text: 'כלתדם', converted: true });
  assert.deepEqual(F.fromLayout('כתב'), { text: 'כתב', converted: false });
});

test('tiles: the letters of the form plus decoys from the same tense, deterministic', () => {
  const t = formOf(study, 'PERF-1p');
  const tiles = F.tilesFor(t, study, 3, 5);
  const letters = tiles.map((x) => x.ch);
  'כתבנו'.split('').forEach((c) => assert.ok(letters.includes(c), c));
  assert.ok(tiles.length >= 6 && tiles.length <= 8, 'up to 3 decoys');
  assert.equal(new Set(tiles.map((x) => x.id)).size, tiles.length);
  assert.deepEqual(F.tilesFor(t, study, 3, 5), tiles, 'same seed, same tiles');
  assert.equal(F.checkTyped(t, study, 'כתבנו').ok, true);
});

test('grade counts production answers separately', () => {
  let m = F.grade({}, 'PERF-1p', true, 1, 'type');
  m = F.grade(m, 'PERF-1p', true, 2, 'choice');
  assert.equal(m['PERF-1p'].prod, 1);
  assert.equal(m['PERF-1p'].right, 2);
});

test('focus groups narrow the deck to one tense', () => {
  const deck = F.buildDeck(study, { size: 6, focusGroups: ['future'] });
  assert.ok(deck.length === 6 && deck.every((f) => f.groupKey === 'future'));
});

test('set deck: round-robin across words, weak words first, options from the word\'s own table', () => {
  const items = [
    { key: 'pid:a', lemma: 'כתב', study, memory: Object.fromEntries(F.formsOf(study).map((f) => [f.slot, { streak: 2, last: 1 }])) },
    { key: 'pid:b', lemma: 'דבר', study: dStudy, memory: {}, metSlots: ['PERF-1s'] },
  ];
  const deck = F.buildSetDeck(items, { size: 6 });
  assert.equal(deck.length, 6);
  assert.equal(deck[0].key, 'pid:b', 'the word with unlearnt forms met in my texts starts');
  assert.equal(deck[0].target.slot, 'PERF-1s');
  assert.deepEqual(deck.map((x) => x.key), ['pid:b', 'pid:a', 'pid:b', 'pid:a', 'pid:b', 'pid:a']);
  assert.ok(deck.every((x) => x.study === (x.key === 'pid:a' ? study : dStudy)));
  assert.equal(F.buildSetDeck([], { size: 5 }).length, 0);
});
