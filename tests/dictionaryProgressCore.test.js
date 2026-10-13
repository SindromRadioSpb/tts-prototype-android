'use strict';
// Д2.3 «Прогресс словаря»: статус на момент T из журнала отметок, динамика неделя/месяц, слабые места
// по срывам повторений (с порогом выборки) и по ошибкам тренировки форм.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../public/js/dictionary-progress-core.js');

const DAY = 86400000;
const NOW = Date.parse('2026-10-13T12:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();

test('status at T comes from the last mark at or before T', () => {
  const idx = P.indexMarks([{ key: 'a', at: ago(20), status: 'l1' }, { key: 'a', at: ago(3), status: 'known' }, { key: 'a', at: ago(10), status: 'l3' }]);
  const e = { key: 'a', status: 'known', added: ago(20) };
  assert.equal(P.statusAt(e, idx.get('a'), NOW), 'known');
  assert.equal(P.statusAt(e, idx.get('a'), NOW - 7 * DAY), 'l3');
  assert.equal(P.statusAt(e, idx.get('a'), NOW - 15 * DAY), 'l1');
  assert.equal(P.statusAt(e, idx.get('a'), NOW - 30 * DAY), null, 'not in the dictionary yet');
  assert.equal(P.statusAt({ key: 'b', status: 'l2', added: ago(40) }, undefined, NOW - 30 * DAY), 'l2', 'no history: current status since added');
  assert.equal(P.statusAt({ key: 'c', status: 'l2', added: ago(40) }, [{ at: NOW - 2 * DAY, status: 'l2' }], NOW - 7 * DAY), 'new', 'in the dictionary, status set later');
  assert.equal(P.statusAt({ key: 'd' }, [{ at: NOW - 2 * DAY, status: '' }], NOW), 'new', 'a cleared status is «new»');
});

test('dynamics: counts then/now, became known, levelled up, new words', () => {
  const entries = [
    { key: 'a', status: 'known', added: ago(20) },
    { key: 'b', status: 'l2', added: ago(2) },
    { key: 'c', status: 'l4', added: ago(60) },
    { key: 'd', status: 'ignore', added: ago(20) },
  ];
  const marks = [
    { key: 'a', at: ago(20), status: 'l1' }, { key: 'a', at: ago(3), status: 'known' },
    { key: 'b', at: ago(2), status: 'l2' },
    { key: 'd', at: ago(20), status: 'l1' }, { key: 'd', at: ago(1), status: 'ignore' },
  ];
  const d = P.dynamics(entries, marks, NOW);
  assert.equal(d.now.total, 4);
  assert.equal(d.now.known, 1);
  assert.equal(d.noHistory, 1, 'c has no marks');
  assert.deepEqual([d.periods.week.then.total, d.periods.week.then.l1, d.periods.week.then.l4], [3, 2, 1]);
  assert.equal(d.periods.week.known, 1);
  assert.equal(d.periods.week.up, 1, 'a went l1 → known; ignore is not a level-up');
  assert.equal(d.periods.week.added, 1);
  assert.equal(d.periods.month.added, 3);
});

test('weekly windows: 8 windows, oldest first, reviews and fails summed', () => {
  const w = P.weekly([{ day: '2026-10-13', n: 5, fails: 1 }, { day: '2026-10-07', n: 2, fails: 0 }, { day: '2026-10-06', n: 4, fails: 2 }, { day: '2026-01-01', n: 9, fails: 9 }], NOW, 8);
  assert.equal(w.length, 8);
  assert.deepEqual([w[7].n, w[7].fails], [7, 1]);
  assert.deepEqual([w[6].n, w[6].fails], [4, 2]);
  assert.equal(w.reduce((a, x) => a + x.n, 0), 11, 'outside the 8 weeks is not counted');
});

test('weak spots need enough data and must be clearly worse than the average', () => {
  const rows = [];
  for (let i = 0; i < 4; i++) rows.push({ value: 'piel', reviews: 5, fails: 2 });
  for (let i = 0; i < 6; i++) rows.push({ value: 'paal', reviews: 5, fails: 0 });
  rows.push({ value: 'hufal', reviews: 30, fails: 3 });            // one word: not a group
  for (let i = 0; i < 3; i++) rows.push({ value: 'hifil', reviews: 2, fails: 1 });   // 6 reviews < 8
  const r = P.weakSpots(rows);
  assert.deepEqual(r.groups.map((g) => g.value), ['piel', 'paal']);
  assert.equal(r.groups[0].weak, true);
  assert.equal(r.groups[1].weak, false);
  assert.equal(r.overall.reviews, 86);
});

test('form drill weak spots by binyan and tense', () => {
  assert.equal(P.tenseOf('PERF-1s'), 'past');
  assert.equal(P.tenseOf('passive-IMPF-3ms'), 'passive_future');
  assert.equal(P.tenseOf('INF-L'), 'infinitive');
  assert.equal(P.tenseOf('S-ms'), '');
  const recs = [
    { key: 'a', binyan: 'piel', mem: { 'IMPF-1s': { seen: 4, right: 1 }, 'IMPF-2ms': { seen: 3, right: 1 }, 'PERF-1s': { seen: 3, right: 3 } } },
    { key: 'b', binyan: 'paal', mem: { 'PERF-1s': { seen: 6, right: 6 }, 'IMPF-1s': { seen: 2, right: 2 } } },
  ];
  const r = P.formWeakSpots(recs);
  assert.equal(r.binyan[0].value, 'piel');
  assert.equal(r.binyan[0].weak, true);
  assert.equal(r.tense[0].value, 'future');
  assert.equal(r.tense[0].wrong, 5);
  assert.equal(r.tense[0].words, 2);
});
