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

const mini = require('./fixtures/course/mini/lessons/L001-cafe.json');
const lexicon = require('./fixtures/course/mini/lexicon.json');
const hour = 60*60*1000;
const transferLesson = () => ({...structuredClone(mini), tasks:[{...structuredClone(mini.tasks.find(t=>t.id==='6')),transfer:true}]});
function answer(p,l,options={}) { return E.record(p,{lessonId:l.id,lessonVersion:l.version,task:l.tasks[0],channel:'write_he',input:'תה בלי סוכר',result:{kind:'accepted'},at:1000,...options}).progress; }
test('cards and repeated fingerprint cannot count as produced; fresh writing can',()=>{
 const l=transferLesson(); let p=answer(E.emptyProgress('ulpan'),l,{channel:'cards'});
 assert.equal(E.itemStatus(p,'lx.tea',[l]).produced,false);
 p=answer(p,l,{at:3000}); assert.equal(E.itemStatus(p,'lx.tea',[l]).produced,false);
 p=answer(p,l,{at:5000,variant:{drink:'tea',situation:2}});
 assert.equal(E.itemStatus(p,'lx.tea',[l]).produced,true);
});
test('markMet is immutable, preserves zero and first encounter',()=>{
 const p=E.emptyProgress('ulpan'); const a=E.markMet(p,['lx.tea','__proto__'],0);
 assert.deepEqual(p.firstMet,{}); assert.equal(E.markMet(a,['lx.tea'],99).firstMet['lx.tea'],0);
 assert.equal(Object.hasOwn(a.firstMet,'__proto__'),true);
});
test('transfer requires new fingerprint and 20h break; clock skew cannot qualify',()=>{
 const l=transferLesson(); let p=E.markMet(E.emptyProgress('ulpan'),['lx.tea'],0);
 p=answer(p,l,{at:19*hour}); assert.equal(E.itemStatus(p,'lx.tea',[l]).appliedAfterBreak,false);
 p=answer(p,l,{at:21*hour}); assert.equal(E.itemStatus(p,'lx.tea',[l]).appliedAfterBreak,false);
 p=answer(p,l,{at:22*hour,variant:{new:1}}); assert.equal(E.itemStatus(p,'lx.tea',[l]).appliedAfterBreak,true);
 const skew=answer(E.markMet(E.emptyProgress('ulpan'),['lx.tea'],hour),l,{at:0});
 assert.equal(E.itemStatus(skew,'lx.tea',[l]).appliedAfterBreak,false);
 assert.equal(E.BREAK_MS,20*hour);
});
test('attempt levels preserve channel and aids distinctions including explicit AI provenance',()=>{
 for(const channel of ['read','listen','write_he','speech']) {
  const p=answer(E.emptyProgress('ulpan'),transferLesson(),{channel}); assert.equal(E.attemptLevel(p.attempts[0]),'independent');
 }
 for(const channel of ['cards','translit','self','ai']) assert.equal(E.attemptLevel(answer(E.emptyProgress('ulpan'),transferLesson(),{channel}).attempts[0]),'supported');
 assert.equal(E.attemptLevel(answer(E.emptyProgress('ulpan'),transferLesson(),{channel:'ai',via:'ai'}).attempts[0]),'independent');
 assert.equal(E.attemptLevel({...base,kind:'mismatch'}),'none');
});
test('lesson skill uses latest result, aid snapshots, all transfer tasks and current definition',()=>{
 const l=transferLesson(); assert.equal(E.lessonSkill(E.emptyProgress('ulpan'),l),'not_started');
 let p=E.openAid(E.emptyProgress('ulpan'),l.id+'/'+l.tasks[0].id,'model',0); p=answer(p,l);
 assert.equal(E.lessonSkill(JSON.parse(JSON.stringify(p)),l),'supported');
 p=answer(p,l,{at:3000,result:{kind:'mismatch'}}); assert.equal(E.lessonSkill(p,l),'needs_review');
 const independent=answer(E.emptyProgress('ulpan'),l); assert.equal(E.lessonSkill(independent,l),'independent');
 const revised=structuredClone(l); revised.tasks[0].model.plain='קפה';
 assert.equal(E.lessonSkill(independent,revised),'not_started');
 assert.equal(E.itemStatus(independent,'lx.tea',[revised]).produced,true);
 assert.equal(E.lessonSkill(independent,{...l,tasks:[]}),'not_started');
});
test('counts separate introduced, recognized, production and applied with literal expectations',()=>{
 const l={id:'counts',version:1,introduces:{active:['lx.tea'],receptive:[]},slots:[],tasks:[{id:'one',transfer:true}]};
 let p=E.markMet(E.emptyProgress('ulpan'),['lx.tea','lx.coffee'],0);
 p=answer(p,l,{channel:'read',at:hour});
 assert.deepEqual(E.courseCounts(p,lexicon,[l]),{introduced:2,recognized:1,produced:0,appliedAfterBreak:0});
 p=answer(p,l,{channel:'write_he',variant:{new:1},at:21*hour});
 assert.deepEqual(E.courseCounts(p,lexicon,[l]),{introduced:2,recognized:1,produced:1,appliedAfterBreak:1});
 assert.equal(E.itemStatus(p,'lx.tea',[l]).listenOk,false);
});
test('required slot mappings count only expected values, not every value in slot',()=>{
 const l=transferLesson(); l.introduces={active:[],receptive:[]};
 const p=answer(E.emptyProgress('ulpan'),l);
 assert.equal(E.itemStatus(p,'lx.tea',[l]).produced,true);
 assert.equal(E.itemStatus(p,'lx.coffee',[l]).produced,false);
});

test('lesson skill waits for all transfers and ignores non-transfer attempts',()=>{
 const l=transferLesson(); l.tasks.push({...structuredClone(l.tasks[0]),id:'second'});
 let p=answer(E.emptyProgress('ulpan'),l); assert.equal(E.lessonSkill(p,l),'not_started');
 p=answer(p,l,{task:l.tasks[1],at:3000}); assert.equal(E.lessonSkill(p,l),'independent');
 p=answer(p,l,{task:{id:'practice'},result:{kind:'mismatch'},at:4000}); assert.equal(E.lessonSkill(p,l),'independent');
});
test('recorded task snapshots and AI provenance survive reload without aliasing',()=>{
 const l=transferLesson(); const p=answer(E.emptyProgress('ulpan'),l,{via:'ai',channel:'ai'});
 l.tasks[0].transfer=false;
 assert.equal(p.attempts[0].taskSnapshot.transfer,true);
 assert.equal(E.attemptLevel(JSON.parse(JSON.stringify(p)).attempts[0]),'independent');
 const marked=E.markMet(p,['lx.tea'],0);
 const delayed=answer(marked,transferLesson(),{at:20*hour,variant:{new:1}});
 assert.equal(E.itemStatus(delayed,'lx.tea',[transferLesson()]).appliedAfterBreak,true);
});
