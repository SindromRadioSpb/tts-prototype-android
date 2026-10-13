'use strict';
// Ф4 · Д1 «Мой словарь» — чистое ядро: одна запись на канон-ключ из всех источников, сила памяти FSRS,
// поиск (иврит без огласовки / русский), фильтры и сортировки.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../public/js/dictionary-core.js');

const NOW = Date.parse('2026-10-12T12:00:00Z');
const DAY = 86400000;
function sample() {
  const map = D.mergeSources({
    statuses: { 'pid:11': 'l2', 'כתב#verb': 'known', 'בית#noun': 'l1' },
    statusTimes: { 'pid:11': '2026-10-01T00:00:00Z', 'כתב#verb': '2026-09-01T00:00:00Z', 'בית#noun': '2026-10-10T00:00:00Z' },
    schedule: {
      'pid:11': { due: NOW - 3 * DAY, reps: 4, lapses: 3, stability: 2, reviewedAt: NOW - 10 * DAY },
      'בית#noun': { due: NOW + 2 * DAY, reps: 1, lapses: 0, stability: 10, reviewedAt: NOW - DAY },
    },
    notes: [{ key: 'pid:11', id: 'n1', word: 'שמע', niqqud: 'שָׁמַע', meaning: 'слышать', userMeaning: 'услышать', pos: 'verb', root: 'שמע', binyan: 'paal', created: '2026-09-20T00:00:00Z', occ: 2 },
      { key: 'אהבה#noun', id: 'n2', word: 'אהבה', niqqud: 'אַהֲבָה', meaning: 'любовь', pos: 'noun', root: 'אהב', created: '2026-10-11T00:00:00Z', occ: 1 }],
    logAgg: [{ key: 'pid:11', n: 7, first: '2026-09-15T00:00:00Z', last: '2026-10-09T00:00:00Z', surface: 'שֶׁשָּׁמַעְתִּי' }],
    contexts: [{ key: 'pid:11', occ: 3, texts: 2, surface: 'שָׁמַעְתִּי' }],
    marks: [{ key: 'בית#noun', surface: 'לַבַּיִת', textKey: 't1', order: 1 }, { key: 'nobody', surface: 'x' }],
  });
  return map;
}

test('one entry per canon key, merged from statuses, schedule, notes, log and contexts', () => {
  const map = sample();
  assert.equal(map.size, 4);
  const e = map.get('pid:11');
  assert.deepEqual(e.sources, ['status', 'srs', 'note', 'log', 'context']);
  assert.equal(e.status, 'l2');
  assert.equal(e.added, Date.parse('2026-09-15T00:00:00Z'), 'added = the earliest trace (first review)');
  assert.deepEqual(e.surfaces.map((x) => x.from), ['note', 'log', 'context'], 'pid: key yields no surface of its own');
  assert.equal(D.occurrences(e), 5);
  assert.deepEqual(map.get('כתב#verb').surfaces, [{ s: 'כתב', from: 'key' }], 'a skeleton key carries its own surface');
  assert.deepEqual(map.get('בית#noun').surfaces.map((x) => x.from), ['mark', 'key'], 'the form stored at mark time comes first');
  assert.deepEqual(map.get('בית#noun').mark, { textKey: 't1', order: 1, surface: 'לַבַּיִת' });
  assert.equal(map.has('nobody'), false, 'a mark alone does not create an entry');
  assert.equal(map.get('אהבה#noun').status, '', 'a saved word without a status is still mine');
});

test('memory: FSRS retrievability, due / overdue / scheduled, unscheduled and ignored', () => {
  const map = sample();
  const m = D.memory(map.get('pid:11'), NOW);
  assert.equal(m.state, 'overdue');
  assert.ok(Math.abs(m.strength - 1 / (1 + 10 / 18)) < 1e-9);
  assert.equal(D.memory(map.get('בית#noun'), NOW).state, 'scheduled');
  assert.equal(D.memory(map.get('כתב#verb'), NOW).state, 'unscheduled');
  assert.equal(D.memory({ status: 'ignore' }, NOW).state, 'ignored');
});

test('search: Hebrew without niqqud and with final letters, Russian by meaning (mine first)', () => {
  const map = sample();
  const list = [...map.values()];
  const q = (s) => list.filter((e) => D.matches(e, { q: s }, NOW)).map((e) => e.key).sort();
  assert.deepEqual(q('שמעתי'), ['pid:11'], 'a form met in a text finds the entry');
  assert.deepEqual(q('שָׁמַע'), ['pid:11']);
  assert.deepEqual(q('בית'), ['בית#noun']);
  assert.deepEqual(q('услыш'), ['pid:11'], 'my own meaning is searchable');
  assert.deepEqual(q('ЛЮБОВ'), ['אהבה#noun']);
  assert.equal(D.normHe('מִכְתָּבִים־ךְ'), 'מכתבימכ');
});

test('filters: status, memory, part of speech, root, my meaning, added period, scope', () => {
  const map = sample();
  const list = [...map.values()];
  const f = (flt) => list.filter((e) => D.matches(e, flt, NOW)).map((e) => e.key).sort();
  assert.deepEqual(f({ statuses: ['new'] }), ['אהבה#noun'], 'no status = «новое»');
  assert.deepEqual(f({ memory: 'due' }), ['pid:11']);
  assert.deepEqual(f({ memory: 'hard' }), ['pid:11']);
  assert.deepEqual(f({ memory: 'never' }), ['אהבה#noun', 'כתב#verb']);
  assert.deepEqual(f({ pos: ['noun'] }), ['אהבה#noun']);
  assert.deepEqual(f({ root: 'אהב' }), ['אהבה#noun']);
  assert.deepEqual(f({ hasMine: true }), ['pid:11']);
  assert.deepEqual(f({ addedDays: 7 }), ['אהבה#noun', 'בית#noun']);
  const met = { key: 'ילד#noun', metOnly: true, surfaces: [{ s: 'ילד', from: 'key' }], status: '' };
  assert.equal(D.matches(met, {}, NOW), false, '«все встреченные» stay hidden in «мои слова»');
  assert.equal(D.matches(met, { scope: 'met' }, NOW), true);
});

test('sorts: alphabet by skeleton, newest, due, weakest, frequency, root groups', () => {
  const map = sample();
  map.get('pid:11').reading = { lemma: 'שמע', root: 'שמע', meaning: 'слышать', label: 'exact' };
  map.get('כתב#verb').reading = { lemma: 'כתב', root: 'כתב' };
  map.get('בית#noun').reading = { lemma: 'בית', root: 'בית' };
  const list = [...map.values()];
  const keys = (by) => D.sortEntries(list, by, NOW).map((e) => e.key);
  assert.deepEqual(keys('alpha'), ['אהבה#noun', 'בית#noun', 'כתב#verb', 'pid:11']);
  assert.deepEqual(keys('added')[0], 'אהבה#noun');
  assert.deepEqual(keys('due').slice(0, 2), ['pid:11', 'בית#noun']);
  assert.equal(keys('weak')[0], 'pid:11');
  assert.equal(keys('freq')[0], 'pid:11');
  assert.deepEqual(keys('root'), ['אהבה#noun', 'בית#noun', 'כתב#verb', 'pid:11']);
  assert.deepEqual(D.statusCounts(list), { total: 4, none: 0, new: 1, l1: 1, l2: 1, l3: 0, l4: 0, known: 1, ignore: 0 });
  assert.deepEqual(D.meaningOf(map.get('pid:11')), { text: 'услышать', from: 'user' });
});

test('search finds a word by any form of its table', () => {
  const e = { key: 'pid:2250', status: 'l2', surfaces: [{ s: 'לִשְׁמוֹעַ', from: 'pealim' }], forms: ['שמעתי', 'שומע', 'לשמוע'], sources: ['status'] };
  assert.equal(D.matches(e, { q: 'שָׁמַעְתִּי' }), true);
  assert.equal(D.matches(e, { q: 'כתב' }), false);
});

test('text lens: only the words of the text, live status with «не размечено», names hidden on request, text sorts', () => {
  const D = require('../public/js/dictionary-core.js');
  const a = { key: 'pid:1', status: 'known', textStatus: 'known', surfaces: [], inText: { freq: 1, first: 5 } };
  const b = { key: 'pid:2', metOnly: true, status: '', textStatus: '', surfaces: [], inText: { freq: 4, first: 9 } };
  const c = { key: 'pid:3', metOnly: true, status: '', textStatus: 'new', surfaces: [], inText: { freq: 2, first: 1, nameSuspect: true } };
  const d = { key: 'pid:4', status: 'l2', surfaces: [] };   // mine, not in this text
  const all = [a, b, c, d];
  const f = { scope: 'text', statuses: [] };
  assert.deepEqual(all.filter((e) => D.matches(e, f)).map((e) => e.key), ['pid:1', 'pid:2', 'pid:3']);
  assert.deepEqual(all.filter((e) => D.matches(e, { scope: 'text', statuses: ['none'] })).map((e) => e.key), ['pid:2']);
  assert.deepEqual(all.filter((e) => D.matches(e, { scope: 'text', statuses: [], hideNames: true })).map((e) => e.key), ['pid:1', 'pid:2']);
  assert.deepEqual(D.sortEntries([a, b, c], 'textOrder').map((e) => e.key), ['pid:3', 'pid:1', 'pid:2']);
  assert.deepEqual(D.sortEntries([a, b, c], 'textFreq').map((e) => e.key), ['pid:2', 'pid:3', 'pid:1']);
  const n = D.statusCounts(all, 'text');
  assert.deepEqual([n.total, n.known, n.none, n.new], [3, 1, 1, 1]);
  assert.equal(D.statusCounts(all).total, 2, 'the mine scope still counts only my words');
});
