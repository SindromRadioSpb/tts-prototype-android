'use strict';
// Слой слов Ф2 (docs/planning/word-layer/F2_SPEC_2026_10_11.md): русский перевод каждой формы
// парадигмы без ИИ. Данные — офлайн-сборка pymorphy3 (scripts/word-layer/f2-ru-forms-bake.py);
// фразу из словоформ собирает public/js/ru-forms.js. Оракул — полные фразы, построенные сборкой
// НАПРЯМУЮ (tests/fixtures/word-layer/ru-forms-oracle-sample.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const gunzipJson = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, rel))).toString('utf8'));
const RF = require('../public/js/ru-forms.js');
const data = gunzipJson('public/data/inflection/ru-forms-v1.json.gz');
RF.setData(data);
const WG = require('../public/js/word-gloss.js');
const IR = require('../public/js/inflection-render.js');
const ds = gunzipJson('public/data/inflection/pealim-infl-v12.json.gz');
const byLemma = (lemma, kind) => ds.paradigms.find((p) => p.lemma === lemma && (!kind || p.kind === kind));
const oracle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'word-layer', 'ru-forms-oracle-sample.json'), 'utf8'));

test('the shipped file belongs to the shipped Pealim model', () => {
  assert.equal(data.model_version, 'ru-forms-v1');
  assert.equal(data.source_model, 'pealim-infl-v12');
  assert.ok(Object.keys(data.forms).length > 8000);
});

test('composer = oracle on every cell of the committed slice (incl. copula, passive, adjectives, pluralia tantum)', () => {
  const pids = Object.keys(oracle.paradigms);
  assert.ok(pids.length >= 400);
  let cells = 0;
  const kinds = new Set();
  for (const pid of pids) {
    const { slots, forms } = oracle.paradigms[pid];
    const c = data.forms[pid];
    assert.ok(c, 'compact entry for ' + pid);
    kinds.add(c.c ? 'copula' : c.s ? 'passive' : c.A ? 'adj' : c.g === 'p' ? 'pltm' : c.n ? 'noun' : 'verb');
    for (const s of slots) {
      assert.equal(RF.compose(data, c, s), forms[s] || null, `${pid} ${s}`);
      cells++;
    }
  }
  assert.deepEqual([...kinds].sort(), ['adj', 'copula', 'noun', 'passive', 'pltm', 'verb']);
  assert.ok(cells > 10000);
});

// Independent of the oracle: a defect shared by the bake AND the composer cannot hide behind parity.
test('a verb has every tense: писать', () => {
  const p = byLemma('לכתוב', 'verb');
  const f = (s) => RF.formFor(p, s);
  assert.equal(f('PERF-3fs'), 'она писала');
  assert.equal(f('PERF-1s'), 'я писал(а)');
  assert.equal(f('PERF-3p'), 'они писали');
  assert.equal(f('IMPF-1s'), 'я буду писать');
  assert.equal(f('IMP-2mp'), 'пишите!');
  assert.equal(f('INF-L'), 'писать');
  assert.equal(f('AP-ms'), 'пишет');            // present = participle: gender × number, no person
  assert.equal(f('AP-fs'), 'пишет (ж.)');
  assert.equal(f('AP-fp'), 'пишут (ж.)');
  assert.equal(f('nonexistent'), null);
});

test('regressions from the F2 measurement', () => {
  const be = byLemma('להיות', 'verb');
  assert.equal(RF.formFor(be, 'IMPF-3mp'), 'они будут');          // not «они будут быть»
  assert.equal(RF.formFor(be, 'AP-ms'), null);                     // not «есть»
  for (const p of ds.paradigms) {                                  // no form anywhere repeats «быть»
    if (p.kind !== 'verb' || !data.forms[p.pealim_id]) continue;
    for (const s of Object.keys(p.cells)) {
      const f = RF.formFor(p, s);
      if (f) assert.doesNotMatch(f, /будут? быть|будем быть|буду быть/, `${p.lemma} ${s}`);
    }
  }
});

test('nouns: possessive agrees with the Russian noun; construct = the plain form', () => {
  const p = byLemma('ספר', 'noun') && ds.paradigms.find((x) => x.lemma === 'ספר' && x.kind === 'noun' && /книга/.test(x.meaning));
  assert.ok(p, 'ספר «книга»');
  assert.equal(RF.formFor(p, 's-P-1s'), 'моя книга');
  assert.equal(RF.formFor(p, 'p-P-1s'), 'мои книги');
  assert.equal(RF.formFor(p, 's-P-3fs'), 'её книга');
  assert.equal(RF.formFor(p, 'pc'), 'книги');
  assert.equal(RF.selfDescribing('pc'), false);
  assert.equal(RF.selfDescribing('PERF-3fs'), true);
});

test('gloss shows the FORM: כָּתְבָה → она писала; ששמעתי → что я слышал(а)', async () => {
  const card = (lemma, niqqud) => ({ label: 'exact', meaning: byLemma(lemma, 'verb').meaning, paradigm: byLemma(lemma, 'verb'), niqqud });
  let g = WG.composeGloss(card('לכתוב', 'כָּתְבָה'), 'כָּתְבָה');
  assert.equal(g.form, true);
  assert.equal(g.text, 'она писала');
  g = WG.composeGloss(card('לשמוע', 'שֶׁשָּׁמַעְתִּי'), 'שֶׁשָּׁמַעְתִּי');
  assert.equal(g.text, 'что я слышал(а)');                     // conjunction prefix joins with a space
  // homographic cells show both readings
  g = WG.composeGloss(card('לכתוב', 'תִּכְתֹּב'), 'תִּכְתֹּב');
  assert.match(g.text, /ты будешь писать \/ она будет писать/);
});

test('gloss: a preposition keeps «+»; construct keeps its hint; likely + form stays silent', () => {
  const house = ds.paradigms.find((x) => x.lemma === 'בית' && x.kind === 'noun');
  let g = WG.composeGloss({ label: 'exact', meaning: house.meaning, paradigm: house }, 'בַּבָּתִּים');
  assert.equal(g.form, true);
  assert.match(g.text, /^в \+ /);
  g = WG.composeGloss({ label: 'exact', meaning: house.meaning, paradigm: house }, 'בָּתֵּי');
  if (g.form) assert.match(g.text, /сопр\./);
  const v = byLemma('לכתוב', 'verb');
  g = WG.composeGloss({ label: 'likely', meaning: v.meaning, paradigm: v }, 'כָּתְבָה');
  assert.equal(g.text, '');
});

test('gloss: preposition + finite verb is not Hebrew → no gloss at all', () => {
  const v = byLemma('לכתוב', 'verb');
  const g = WG.composeGloss({ label: 'exact', meaning: v.meaning, paradigm: v }, 'בְּכָתְבָה');
  assert.equal(g.text, '');
  const m = WG.matchCell(v, 'בְּכָתְבָה');
  assert.equal(m && m.impossible, true);
  // a conjunction before a finite verb is fine
  assert.equal(WG.composeGloss({ label: 'exact', meaning: v.meaning, paradigm: v }, 'וְכָתְבָה').text, 'и она писала');
});

test('morph card: verb = present strip + person × tense matrix with the current form marked and translated', () => {
  const p = byLemma('לכתוב', 'verb');
  const html = IR.renderParadigm(p, { highlightForm: 'כָּתְבָה', ruForm: (s) => RF.formFor(p, s) });
  assert.match(html, /class="v3-conj-mx"/);
  const hl = html.match(/<button[^>]*v3-conj-cell-hl[^>]*>[\s\S]*?<\/button>/g);
  assert.equal(hl.length, 1);
  assert.match(hl[0], /data-slot="PERF-3fs"/);
  assert.match(hl[0], /aria-current="true"/);
  assert.match(hl[0], /v3-conj-cur[^>]*>▶/);
  assert.match(hl[0], /<span class="v3-conj-ru" dir="ltr">она писала<\/span>/);
  // every Pealim cell is rendered exactly once; PERF-3p spans the two «они» rows
  const slots = [...html.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...slots].sort(), Object.keys(p.cells).sort());
  assert.match(html, /<td rowspan="2"><button[^>]*data-slot="PERF-3p"/);
  // translations: every cell of писать has one, and the machine-made note is shown
  assert.equal((html.match(/class="v3-conj-ru"/g) || []).length, Object.keys(p.cells).length);
  assert.match(html, /v3-conj-ru-note/);
});

test('morph card without translations (data not loaded) stays the F1 table, no note', () => {
  const p = byLemma('לכתוב', 'verb');
  const html = IR.renderParadigm(p, { highlightForm: 'כָּתְבָה', ruForm: false });
  assert.doesNotMatch(html, /v3-conj-ru/);
  assert.match(html, /v3-conj-mx/);
});

test('passive voice gets its own matrix without the imperative column', () => {
  const p = ds.paradigms.find((x) => x.kind === 'verb' && x.cells['passive-PERF-3ms'] && data.forms[x.pealim_id] && data.forms[x.pealim_id].s);
  assert.ok(p, 'a perfective verb with passive forms');
  const html = IR.renderParadigm(p, { ruForm: (s) => RF.formFor(p, s) });
  assert.equal((html.match(/class="v3-conj-mx"/g) || []).length, 2);
  const slots = [...html.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...slots].sort(), Object.keys(p.cells).filter((k) => p.cells[k] && p.cells[k].he).sort());
  assert.match(RF.formFor(p, 'passive-PERF-3ms'), /^он был /);
});
