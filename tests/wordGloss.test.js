'use strict';
// Слой слов Ф1 (docs/planning/word-layer/F1_SPEC_2026_10_11.md): ядро подстрочника на реальном
// офлайн-датасете Pealim. Подпись формы — только при ТОЧНОМ совпадении огласованной формы (или её
// основы после приставки) с клеткой парадигмы; иначе только смысл леммы (R1/R10).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const WG = require('../public/js/word-gloss.js');

const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'inflection', 'pealim-infl-v12.json.gz'))).toString('utf8'));
const byLemma = (lemma, binyan) => ds.paradigms.find((p) => p.lemma === lemma && (binyan === undefined || (p.binyan || '') === binyan));

test('shortGloss keeps the first sense, drops parentheticals and markup', () => {
  assert.equal(WG.shortGloss('слышать; слушать'), 'слышать');
  assert.equal(WG.shortGloss('смотреть, созерцать, наблюдать (ב־)'), 'смотреть');
  assert.equal(WG.shortGloss('ты *(м. р.)*'), 'ты');
  assert.equal(WG.shortGloss('говорящий (в идиомах'), 'говорящий');
  assert.ok(WG.shortGloss('очень-очень-длинное-значение-без-пробелов-вообще').length <= WG.GLOSS_MAX + 1);
  assert.equal(WG.shortGloss(''), '');
});

test('prefixGloss covers the closed proclitic set and rejects non-prefixes', () => {
  assert.equal(WG.prefixGloss('ש'), 'что');
  assert.equal(WG.prefixGloss('ו'), 'и');
  assert.equal(WG.prefixGloss('וכש'), 'и когда');
  assert.equal(WG.prefixGloss('ב'), 'в');
  assert.equal(WG.prefixGloss('מה'), 'из');      // article merged: no gloss for ה
  assert.equal(WG.prefixGloss('ה'), '');
  assert.equal(WG.prefixGloss('תב'), '');        // not a proclitic sequence
  assert.equal(WG.prefixGloss('בש'), '');        // wrong order
});

test('a verb form with a proclitic: ששמעתי → что + слышать · я, прош.', () => {
  const p = byLemma('לשמוע', 'paal');
  assert.ok(p, 'paradigm present');
  const m = WG.matchCell(p, 'שֶׁשָּׁמַעְתִּי');
  assert.deepEqual(m && m.prefix, 'ש');
  assert.ok(m.slots.includes('PERF-1s'));
  const g = WG.composeGloss({ label: 'exact', meaning: p.meaning, paradigm: p, niqqud: 'שֶׁשָּׁמַעְתִּי' }, 'שֶׁשָּׁמַעְתִּי');
  assert.equal(g.prefix, 'что');
  assert.match(g.hint, /^я, прош\.$/);
  assert.match(g.text, /^что \+ слышать/);
});

test('present participle and possessive noun forms get their slot hint', () => {
  const see = byLemma('לראות', 'paal');
  const m1 = WG.matchCell(see, 'רוֹאִים');
  assert.ok(m1 && m1.slots.includes('AP-mp') && m1.prefix === '');
  assert.match(WG.slotHint('AP-mp'), /наст\./);
  const wife = ds.paradigms.find((p) => p.lemma === 'אישה' && p.cells && p.cells['s-P-1s']);
  assert.ok(wife, 'אישה paradigm');
  const m2 = WG.matchCell(wife, 'מֵאִשְׁתִּי');
  assert.ok(m2, 'מאשתי matches after the מ proclitic');
  assert.equal(m2.prefix, 'מ');
  assert.ok(m2.slots.includes('s-P-1s'));
  assert.equal(WG.slotHint('s-P-1s'), 'мой');
  assert.match(WG.slotHint('p-P-1s'), /^мн\., /);
});

test('article + gemination: הַכְּבִישׁ matches the base form, no hint for the dictionary form', () => {
  const road = byLemma('כביש');
  const m = WG.matchCell(road, 'הַכְּבִישׁ');
  assert.ok(m && m.slots.includes('s') && m.prefix === 'ה');
  const g = WG.composeGloss({ label: 'exact', meaning: road.meaning, paradigm: road }, 'הַכְּבִישׁ');
  assert.equal(g.hint, '');
  assert.equal(g.prefix, '');          // the article is not glossed
  assert.equal(g.text, WG.shortGloss(road.meaning));
});

test('no consonant-only guessing: an unvocalized word gets no form hint', () => {
  const p = byLemma('לשמוע', 'paal');
  assert.equal(WG.matchCell(p, 'ששמעתי'), null);
  const g = WG.composeGloss({ label: 'exact', meaning: p.meaning, paradigm: p }, 'ששמעתי');
  assert.equal(g.hint, '');
  assert.equal(g.text, 'слышать');
});

test('honesty labels: likely is marked ≈, unknown stays empty, function words keep their gloss', () => {
  const p = byLemma('לשמוע', 'paal');
  assert.match(WG.composeGloss({ label: 'likely', meaning: p.meaning, paradigm: p }, '').text, /^≈слышать/);
  assert.deepEqual(WG.composeGloss({ label: 'unknown', meaning: '' }, '').text, '');
  assert.equal(WG.composeGloss({ label: 'unknown', meaning: 'что-то' }, '').text, '');
  const fn = WG.composeGloss({ label: 'function', meaning: 'не', functionWord: true, paradigm: null }, 'לֹא');
  assert.equal(fn.text, 'не');
  assert.equal(WG.composeGloss(null, ''), null);
});

test('guessed (meaning-fallback) readings are not shown under a word', () => {
  // Ф1 sample: שֶׁיֵּשׁ → «радоваться», בְּבָתֵּי → «кукла»
  const g = WG.composeGloss({ label: 'guessed', meaning: 'радоваться (лит.)', paradigm: null }, 'שֶׁיֵּשׁ');
  assert.equal(g.text, '');
  assert.equal(g.label, 'unknown');
});

test('closed-class glosses keep their grammatical note and a stripped proclitic', () => {
  // O-104: the vowels pick the word; without vowels the curated note stays whole.
  const et = WG.composeGloss({ label: 'function', meaning: '(винит. падеж); ты (ж.р.)', functionWord: true, gateVia: 'flat' }, 'אֶת');
  assert.equal(et.text, '(винит. падеж)');
  const bare = WG.composeGloss({ label: 'function', meaning: '(винит. падеж); ты (ж.р.)', functionWord: true, gateVia: 'flat' }, 'את');
  assert.equal(bare.text, '(винит. падеж); ты (ж.р.)');
  const vehi = WG.composeGloss({ label: 'function', meaning: 'она', functionWord: true, gateVia: 'proclitic', word: 'והיא' }, 'וְהִיא');
  assert.equal(vehi.text, 'и + она');
  const sheze = WG.composeGloss({ label: 'function', meaning: 'это, этот', functionWord: true, gateVia: 'proclitic' }, 'שֶׁזֶּה');
  assert.equal(sheze.text, 'что + это, этот');
  assert.equal(WG.shortGloss('(винит. падеж); ты (ж.р.)'), 'ты');
});

test('personal pronouns read their own cell, not the set lemma «я»', () => {
  const set = ds.paradigms.find((p) => p.cells && p.cells['1s'] && p.cells['3mp'] && !p.cells.s && !p.cells['P-1s']);
  assert.ok(set, 'pronoun set paradigm');
  const g = WG.composeGloss({ label: 'likely', meaning: set.meaning, paradigm: set }, 'שֶׁהֵם');
  assert.equal(g.text, 'что + они (м)');
});

test('an undecided homograph that claims a concrete form stays silent', () => {
  const other = byLemma('לאחר', 'piel');
  assert.ok(other && WG.matchCell(other, 'אַחֵר'), 'אַחֵר is also IMP-2ms of לאחר «опаздывать»');
  assert.equal(WG.composeGloss({ label: 'likely', meaning: other.meaning, paradigm: other }, 'אַחֵר').text, '');
  assert.match(WG.composeGloss({ label: 'exact', meaning: other.meaning, paradigm: other }, 'אַחֵר').text, /повел\./);
});

test('a bare preposition is its base form, a suffixed one names the person', () => {
  const lefi = byLemma('לפי');
  assert.equal(WG.matchCell(lefi, 'לְפִי'), null);          // not «according to me»
  assert.deepEqual(WG.matchCell(lefi, 'לְפִיהֶם').slots, ['P-3mp']);
  const g = WG.composeGloss({ label: 'exact', meaning: lefi.meaning, paradigm: lefi }, 'שֶׁלְּפִי');
  assert.equal(g.hint, '');
  assert.match(g.text, /^что \+ /);
});

test('the relative particle שֶׁ + gemination resolves to its bare form (reader-morph variant)', () => {
  const RM = require('../public/js/reader-morph.js');
  assert.equal(RM.relativeStrippedForm('שֶׁשָּׁמַעְתִּי'), 'שָׁמַעְתִּי');   // gemination dagesh dropped
  assert.equal(RM.relativeStrippedForm('שֶׁבָּא'), 'בָּא');               // בגדכפת keep dagesh lene
  assert.equal(RM.relativeStrippedForm('שֶׁמֶשׁ'), '');                    // «солнце»: no gemination
  assert.equal(RM.relativeStrippedForm('שֶׁקֶט'), '');
  assert.equal(RM.relativeStrippedForm('שֶׂה'), '');                      // sin, not the particle
  assert.equal(RM.relativeStrippedForm('הַבַּיִת'), '');
});

test('passive (hufal/pual) cells are labelled as passive', () => {
  assert.match(WG.slotHint('passive-PERF-3ms'), /прош\. страд\./);
});
