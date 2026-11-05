const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F = require('../public/js/course-format.js');
const { computeAssetKey } = require('../db/premium/ttsAssetKey.js');
const load = id => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/course/mini/lessons', id + '.json'), 'utf8'));
const speech = () => require('../public/js/course-speech.js');

test('cafe yields eight ordered vocalized turns with role voices and UTF-8 bytes', () => {
  const S = speech(), l = load('L001-cafe'), before = structuredClone(l);
  const items = S.speechItems(l);
  assert.equal(items.length, 8);
  assert.deepEqual(items, l.scene.turns.map(t => ({ref: l.id + '/' + t.id, id: t.id, kind: 'turn', role: t.role, text: t.he.niqqud, voiceName: 'he-IL-Wavenet-' + (t.role === 'staff' ? 'C' : 'D'), bytes: Buffer.byteLength(t.he.niqqud, 'utf8')})));
  assert.deepEqual(S.checkItems(items), []);
  assert.deepEqual(l, before);
});

test('profiles allow Hebrew WaveNet A-D and extraction respects overrides and defaults', () => {
  const S = speech();
  for (const letter of ['A','B','C','D']) {
    const voiceName = 'he-IL-Wavenet-' + letter;
    assert.equal(S.VOICE_RE.test(voiceName), true);
    assert.deepEqual(S.profileFor(voiceName), {language:'he-IL',voiceName,speakingRate:1,pitch:0});
  }
  const l = load('L001-cafe');
  l.scene.roles[0].voice = 'he-IL-Wavenet-A';
  assert.equal(S.speechItems(l)[0].voiceName, 'he-IL-Wavenet-A');
  l.scene.roles.forEach(r => { delete r.voice; });
  assert.deepEqual(S.speechItems(l).slice(0,2).map(i=>i.voiceName), ['he-IL-Wavenet-C','he-IL-Wavenet-D']);
});

test('Chirp voice is rejected by both format and speech checks with location', () => {
  const l = load('L001-cafe');
  l.scene.roles[0].voice = 'he-IL-Chirp3-HD-Achernar';
  assert.ok(F.validateLesson(l).some(i => i.code === 'VOICE_NOT_ALLOWED' && i.path === 'scene.roles[0].voice'));
  const items = speech().speechItems(l);
  assert.ok(speech().checkItems(items).some(i => i.code === 'VOICE_NOT_ALLOWED' && i.ref === 'L001-cafe/a1-01'));
});

test('limit is 4800 UTF-8 bytes, not characters or stale byte metadata', () => {
  const S = speech(), l = load('L001-cafe');
  l.scene.turns[0].he.niqqud = 'א'.repeat(2500);
  const item = S.speechItems(l)[0];
  assert.equal(item.bytes, 5000);
  item.bytes = 1;
  assert.ok(S.checkItems([item]).some(i => i.code === 'TEXT_TOO_LONG' && i.ref === item.ref));
  item.text = 'א'.repeat(2400);
  assert.deepEqual(S.checkItems([item]), []);
});

test('L002 paragraphs follow turns and use C with exact authored niqqud', () => {
  const l = load('L002-cafe-again'), items = speech().speechItems(l);
  assert.equal(items.length, 3);
  assert.deepEqual(items.slice(1), l.text.paras.map(p => ({ref:l.id+'/'+p.id,id:p.id,kind:'para',role:null,text:p.he.niqqud,voiceName:'he-IL-Wavenet-C',bytes:Buffer.byteLength(p.he.niqqud)})));
});

test('edited niqqud changes the canonical asset key without changing the ref', () => {
  const S = speech(), l = load('L001-cafe'), old = S.speechItems(l)[0];
  l.scene.turns[0].he.niqqud += ' שָׁלוֹם.';
  const next = S.speechItems(l)[0];
  const key = i => computeAssetKey({text:i.text,ttsProfile:S.profileFor(i.voiceName),assetType:'row'});
  assert.equal(old.ref,next.ref);
  assert.notEqual(key(old),key(next));
});

test('UMD browser entry exposes the same speech contract without Node globals', () => {
  const context = vm.createContext({TextEncoder});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/course-speech.js'),'utf8'),context);
  assert.equal(context.CourseSpeech.speechItems(load('L001-cafe'))[0].bytes, Buffer.byteLength('שָׁלוֹם.'));
});

test('P8a: a text paragraph with a role is voiced by that role; without a role it stays on C', () => {
  const S = require('../public/js/course-speech.js');
  const l = { id: 'L', scene: { roles: [{ id: 'barista', voice: 'he-IL-Wavenet-D' }, { id: 'friend', voice: 'he-IL-Wavenet-C' }], turns: [] },
    text: { id: 'tx', paras: [{ id: 'p1', role: 'barista', he: { niqqud: 'א', plain: 'א' } }, { id: 'p2', he: { niqqud: 'ב', plain: 'ב' } }] } };
  const items = S.speechItems(l);
  assert.equal(items[0].voiceName, 'he-IL-Wavenet-D'); assert.equal(items[0].role, 'barista');
  assert.equal(items[1].voiceName, 'he-IL-Wavenet-C'); assert.equal(items[1].role, null);
});
