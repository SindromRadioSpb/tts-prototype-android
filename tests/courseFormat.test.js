const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../public/js/course-format.js');
const load = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/course/mini', n), 'utf8'));
const lex = load('lexicon.json');
const idx = new Map(lex.entries.flatMap(e => [[e.id,e], ...(e.forms || []).map(f => [f.id,f])]));
test('fixture lexicon and lessons are valid', () => {
 assert.deepEqual(F.validateLexicon(lex).filter(i=>i.level==='error'), []);
 for(const id of ['L001-cafe','L002-cafe-again']) assert.deepEqual(F.validateLesson(load('lessons/'+id+'.json'),idx).filter(i=>i.level==='error'),[]);
});
test('duplicate turn and task IDs are rejected',()=>{for(const field of ['turns','tasks']){const l=load('lessons/L001-cafe.json');const a=field==='turns'?l.scene.turns:l.tasks;a.push({...a[0]});assert.ok(F.validateLesson(l,idx).some(i=>i.code==='ID_DUP' && i.path.includes(field)));}});
test('invalid Hebrew pair and marked plain rejected',()=>{const l=load('lessons/L001-cafe.json');l.scene.turns[0].he={niqqud:'סֻכָּר',plain:'סוגר'};l.scene.turns[1].he={niqqud:'שָׁלוֹם',plain:'שָׁלוֹם'};const codes=F.validateLesson(l,idx).map(i=>i.code);assert.ok(codes.includes('HE_SKELETON_MISMATCH'));assert.ok(codes.includes('HE_PLAIN_HAS_MARKS'));});
test('missing half and unknown reference rejected',()=>{const l=load('lessons/L001-cafe.json');l.scene.turns[0].he={niqqud:'שָׁלוֹם'};l.introduces.active.push('lx.nope');const codes=F.validateLesson(l,idx).map(i=>i.code);assert.ok(codes.includes('HE_PAIR_MISSING'));assert.ok(codes.includes('REF_UNKNOWN'));});
test('lexicon forms share ID namespace',()=>{const x=structuredClone(lex);x.entries[0].forms=[{id:x.entries[1].id,he:x.entries[0].he,tags:[]}];assert.ok(F.validateLexicon(x).some(i=>i.code==='ID_DUP'));});
test('malformed documents yield issues rather than throw',()=>{for(const x of [null,{},[],{entries:[null]}])assert.ok(F.validateLexicon(x).some(i=>i.level==='error'));for(const x of [null,{},[],{format:'course-lesson-v1',scene:null}])assert.ok(F.validateLesson(x,idx).some(i=>i.level==='error'));});
test('unknown task type, bad IDs and bare niqqud diagnosed',()=>{const l=load('lessons/L001-cafe.json');l.tasks[0].type='bogus';l.tasks[0].id='bad id';l.scene.turns[0].he={niqqud:'שלום',plain:'שלום'};const codes=F.validateLesson(l,idx).map(i=>i.code);for(const c of ['TASK_TYPE_UNKNOWN','ID_BAD','HE_NIQQUD_BARE'])assert.ok(codes.includes(c));});

test('role, next, slot and spec references are checked', () => {
 const l=load('lessons/L001-cafe.json');
 l.scene.turns[0].role='missing-role'; l.scene.turns[0].next='missing-turn';
 l.slots[0].values[0].seq=['lx.missing']; l.tasks[0].spec.expect={missing:'value'};
 const issues=F.validateLesson(l,idx);
 for(const suffix of ['.role','.next','.seq[0]','.expect.missing']) assert.ok(issues.some(i=>i.code==='REF_UNKNOWN' && i.path.endsWith(suffix)),suffix);
});
