'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), zlib = require('node:zlib');
const LT = require('../public/js/learning-targets'), LC = require('../public/js/lemma-canon'), NA = require('../public/js/notes-autogen');
const RF = require('../public/js/ru-forms');
RF.setData(JSON.parse(zlib.gunzipSync(fs.readFileSync(require('node:path').join(__dirname, '../public/data/inflection/ru-forms-v1.json.gz')))));
const WG = require('../public/js/word-gloss');
const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(require('node:path').join(__dirname, '../public/data/inflection/pealim-infl-v12.json.gz'))));
const fear = ds.paradigms.find(p => String(p.pealim_id) === '1612');
const card = p => ({ label: 'exact', pealim_id: String(p.pealim_id), pos: p.pos, lemma: p.lemma, meaning: p.meaning, paradigm: p });
const candidates = (p, niq, extra) => LT.candidates(Object.assign(card(p), extra), niq, { wordGloss: WG });

test('the observed prefixed past form is one exact target with its own form meaning', () => {
  const [t] = candidates(fear, 'שֶׁפָּחַדְתָּ');
  assert.equal(t.key, 'ft1:1612:PERF-2ms:sh'); assert.equal(t.parentKey, 'pid:1612');
  assert.equal(t.meaning, 'что ты боялся'); assert.equal(t.niqqud, 'שֶׁפָּחַדְתָּ');
  assert.equal(t.kind, 'composed_form');
  assert.equal(LC.canonKey(NA, card(fear), 'שֶׁפָּחַדְתָּ', 'שפחדת'), 'pid:1612');
});
test('bare and prefixed forms have separate identities and share the unchanged parent', () => {
  const bare = candidates(fear, 'פָּחַדְתָּ')[0], prefixed = candidates(fear, 'שֶׁפָּחַדְתָּ')[0];
  assert.notEqual(bare.key, prefixed.key); assert.equal(bare.parentKey, prefixed.parentKey);
  assert.equal(bare.meaning, 'ты боялся'); assert.equal(bare.prefixCode, '_');
});
test('homographic future cells remain two choices with distinct meanings', () => {
  const ts = candidates(fear, 'תִּפְחַד');
  assert.deepEqual(ts.map(t => t.slot).sort(), ['IMPF-2ms', 'IMPF-3fs']);
  assert.equal(new Set(ts.map(t => t.key)).size, 2);
  assert.ok(ts.some(t => /ты будешь/.test(t.meaning))); assert.ok(ts.some(t => /она будет/.test(t.meaning)));
});
test('an unrelated word, unpointed surface, uncertain reading and unresolved lexical choice cannot enroll', () => {
  for (const niq of ['שפחדת', 'כָּתַב', 'בְּפָחַדְתָּ']) assert.deepEqual(candidates(fear, niq), []);
  for (const extra of [{ label: 'likely' }, { ambiguous: true }, { selectionRequired: true }, { pealim_id: '1' }, { pos: 'noun' }]) {
    assert.deepEqual(candidates(fear, 'שֶׁפָּחַדְתָּ', extra), []);
  }
});
test('a fused article stays distinct from a bare preposition', () => {
  const road = ds.paradigms.find(p => p.lemma === 'כביש');
  const withArticle = candidates(road, 'בַּכְּבִישׁ')[0], withoutArticle = candidates(road, 'בִּכְבִישׁ')[0];
  assert.ok(withArticle); assert.ok(withoutArticle);
  assert.equal(withArticle.prefixCode, 'b.h'); assert.equal(withoutArticle.prefixCode, 'b');
  assert.notEqual(withArticle.key, withoutArticle.key);
});
test('keys reject noncanonical encodings, unsupported clitic order and arbitrary text', () => {
  for (const k of ['ft1:01612:PERF-2ms:sh', 'ft1:1612:PERF-2ms:s.h', 'ft1:1612:PERF-2ms:b.sh', 'ft1:1612:x:secret', 'ft1:1612:x:sh.v', 'pid:1612']) assert.equal(LT.parse(k), null);
  assert.equal(LT.keyFor('1612', 'PERF-2ms', 'וש'), 'ft1:1612:PERF-2ms:v.sh');
});
test('a composed target requires a verified real example, while a bare cell can be restored from the dictionary', () => {
  const key = 'ft1:1612:PERF-2ms:sh';
  assert.equal(LT.describe(key, fear, '', { wordGloss: WG }).available, false);
  assert.equal(LT.describe(key, fear, 'פָּחַדְתָּ', { wordGloss: WG }), null);
  assert.equal(LT.describe(key, fear, 'שֶׁפָּחַדְתָּ', { wordGloss: WG }).meaning, 'что ты боялся');
  assert.equal(LT.describe('ft1:1612:PERF-2ms:_', fear, '', { wordGloss: WG }).available, true);
  assert.equal(LT.describe('ft1:1612:made-up:_', fear, '', { wordGloss: WG }), null);
});
test('answer checking requires the full selected form and accepts supported orthographic variants', () => {
  const key='ft1:1612:PERF-2ms:sh',expected='שֶׁפָּחַדְתָּ';
  assert.equal(LT.acceptAnswer(key,fear,expected,'שפחדת'),true);
  assert.equal(LT.acceptAnswer(key,fear,expected,'פחדת'),false);
  assert.equal(LT.acceptAnswer(key,fear,expected,'ושפחדת'),false);
  assert.equal(LT.acceptAnswer(key,fear,expected,'לפחוד'),false);
  assert.equal(LT.acceptAnswer('ft1:1612:PERF-1s:sh',fear,expected,'שפחדת'),false);
});
test('selected form goals stay under one dictionary word and never donate their status',()=>{
  const D=require('../public/js/dictionary-core');
  const map=D.mergeSources({statuses:{'pid:1612':'l4','ft1:1612:PERF-2ms:sh':'known','ft1:1612:PERF-2ms:_':'l1'}});
  assert.equal(map.size,1);assert.equal(map.get('pid:1612').status,'l4');assert.equal(map.get('pid:1612').targets.length,2);
  const childOnly=D.mergeSources({statuses:{'ft1:1612:PERF-2ms:sh':'known'}});
  assert.equal(childOnly.size,1);assert.equal(D.statusOf(childOnly.get('pid:1612')),'');
  assert.equal(D.statusCounts([...childOnly.values()]).total,0);
});
test('ignored forms leave the due badge, and form schedules never paint lexical rings',()=>{
  const R=require('../public/js/reader-morph');
  const schedule={'pid:1612':{due:1},'ft1:1612:PERF-2ms:sh':{due:1,status:'ignore'},'ft1:1612:PERF-2ms:_':{due:1,status:'l2'}};
  assert.equal(R.dueCounts({'pid:1612':'l4'},schedule,2).dueNow,2);
  assert.deepEqual([...R.dueSetFromSchedule(schedule,{'pid:1612':'l4'},2)],['pid:1612']);
});
