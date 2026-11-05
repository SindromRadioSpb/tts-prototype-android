const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/course-evidence.js');

const task = { id: '6', spec: { kind: 'order', expect: { drink: 'tea', sugar: 'without' } }, model: { niqqud: 'תֵּה', plain: 'תה' } };
const base = { lessonId: 'L001', lessonVersion: 1, task, channel: 'write_he', input: 'תה בלי סוכר', result: { kind: 'accepted' } };

test('progress merge preserves unique attempts and converges in any order', () => {
  const make = (ids) => ({ ...E.emptyProgress('ulpan'), attempts: ids.map(([id, at]) => ({ id, at })),
    aids: { 'L001/6': { hint: ids.length, model: ids.length > 1, transcript: false, translation: false } },
    seen: { abc: ids.length * 10 }, firstMet: { tea: ids.length * 10 }, lessonVersions: { L001: ids.length } });
  const a = make([['a', 1], ['b', 2], ['c', 3]]);
  const b = make([['c', 3], ['d', 4], ['e', 5]]);
  const c = make([['f', 6]]);
  assert.deepEqual(E.mergeProgress(a, b), E.mergeProgress(b, a));
  assert.deepEqual(E.mergeProgress(a, a), a);
  assert.deepEqual(E.mergeProgress(E.mergeProgress(a, b), c), E.mergeProgress(a, E.mergeProgress(b, c)));
  assert.deepEqual(E.mergeProgress(a, b).attempts.map(x => x.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(E.mergeProgress(a, b).aids['L001/6'], { hint: 3, model: true, transcript: false, translation: false });
  assert.equal(E.mergeProgress(a, b).seen.abc, 30);
  assert.equal(E.mergeProgress(a, b).lessonVersions.L001, 3);
  assert.equal(E.progressDigest(a), E.progressDigest(structuredClone(a)));
  const draft={...a,reader:{position:{lessonId:'L001',step:2}}};
  assert.deepEqual(E.mergeProgress(draft,draft),draft);
  assert.deepEqual(E.mergeProgress(draft,b),E.mergeProgress(b,draft));
  assert.throws(() => E.mergeProgress(a, E.emptyProgress('other')), /COURSE_MISMATCH/);
});

test('attempt IDs are unique across devices and recorded input is bounded', () => {
  const event = { ...base, at: 1000, input: 'x'.repeat(1000) };
  const a = E.record(E.emptyProgress('ulpan'), event).attempt;
  const b = E.record(E.emptyProgress('ulpan'), event).attempt;
  assert.notEqual(a.id, b.id);
  assert.match(a.id, /^[0-9a-f]{8}-[a-z0-9]{6}$/);
  assert.equal(a.input.length, 300);
});

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
test('completed transfer returns after one day; new situation defers three days; review is immediate', () => {
 const l=transferLesson(), t=24*hour;
 let p=answer(E.emptyProgress('ulpan'),l,{at:0});
 assert.deepEqual(E.dueReturns(p,[l],23*hour),[]);
 assert.deepEqual(E.dueReturns(p,[l],25*hour),[{lessonId:l.id,dueAt:t,reason:'scheduled'}]);
 p=answer(p,l,{at:25*hour,variant:{id:'new'}});
 assert.deepEqual(E.dueReturns(p,[l],25*hour+2*24*hour),[]);
 assert.deepEqual(E.dueReturns(p,[l],25*hour+3*24*hour+1),[{lessonId:l.id,dueAt:25*hour+3*24*hour,reason:'scheduled'}]);
 p=answer(p,l,{at:25*hour+1000,variant:{id:'again'},result:{kind:'mismatch'}});
 assert.deepEqual(E.dueReturns(p,[l],25*hour+1000),[{lessonId:l.id,dueAt:25*hour+1000,reason:'needs_review'}]);
});
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
 assert.equal(E.lessonSkill(independent,revised),'in_progress');
 assert.equal(E.itemStatus(independent,'lx.tea',[revised]).produced,true);
 assert.equal(E.lessonSkill(independent,{...l,tasks:[]}),'in_progress');
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
 let p=answer(E.emptyProgress('ulpan'),l); assert.equal(E.lessonSkill(p,l),'in_progress');
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

test('migration changes model without erasing historical item evidence',()=>{
 const l=transferLesson(); let p=answer(E.emptyProgress('ulpan'),l);
 p=E.openAid(p,l.id+'/'+l.tasks[0].id,'model',1500);
 const before=structuredClone(p); const revised=structuredClone(l); revised.version++;
 revised.tasks[0].model={niqqud:'קָפֶה',plain:'קפה'};
 const r=E.migrate(p,revised);
 assert.deepEqual(r.changes,[{taskId:l.tasks[0].id,change:'spec_changed'}]);
 assert.deepEqual(p,before); assert.deepEqual(r.progress.attempts,p.attempts);
 assert.equal(Object.hasOwn(r.progress.aids,l.id+'/'+l.tasks[0].id),false);
 assert.equal(E.itemStatus(r.progress,'lx.tea',[revised]).produced,true);
 assert.equal(E.lessonSkill(r.progress,revised),'in_progress');
 const next=answer(r.progress,revised,{at:3000});
 assert.equal(next.attempts.at(-1).first,true);
 assert.equal(E.attemptLevel(next.attempts.at(-1)),'independent');
 assert.equal(r.progress.lessonVersions[l.id],revised.version);
});
test('migration retains removed attempts and drops aids only for affected lesson',()=>{
 const l=transferLesson(); let p=answer(E.emptyProgress('ulpan'),l);
 p=E.openAid(p,l.id+'/'+l.tasks[0].id,'hint',1500);
 p=E.openAid(p,'other/6','model',1500);
 const r=E.migrate(p,{...l,version:2,tasks:[]});
 assert.deepEqual(r.changes,[{taskId:l.tasks[0].id,change:'removed'}]);
 assert.deepEqual(r.progress.attempts,p.attempts);
 assert.equal(Object.hasOwn(r.progress.aids,l.id+'/'+l.tasks[0].id),false);
 assert.equal(r.progress.aids['other/6'].model,true);
});
test('same lesson version migration is a value no-op',()=>{
 const l=transferLesson(); const p=E.migrate(answer(E.emptyProgress('ulpan'),l),l).progress;
 const r=E.migrate(p,l); assert.deepEqual(r.progress,p); assert.deepEqual(r.changes,[]);
 r.progress.attempts[0].input='changed'; assert.notEqual(p.attempts[0].input,'changed');
});
test('variant is unchanged on version bump; revert never fabricates unseen evidence',()=>{
 const l=transferLesson(); const p=answer(E.emptyProgress('ulpan'),l,{variant:{situation:2}});
 const r=E.migrate(p,{...l,version:2});
 assert.deepEqual(r.changes,[{taskId:l.tasks[0].id,change:'unchanged'}]);
 let original=answer(E.emptyProgress('ulpan'),l);
 const changed=structuredClone(l); changed.version=2; changed.tasks[0].model={plain:'קפה',niqqud:'קָפֶה'};
 original=answer(E.migrate(original,changed).progress,changed,{at:3000});
 const reverted={...l,version:3}; const back=E.migrate(original,reverted);
 assert.equal(answer(back.progress,reverted,{at:5000}).attempts.at(-1).first,false);
});

test('P2-F1: ordinary and partial transfer work is in progress', () => {
 const l={id:'L001',tasks:[{id:'practice'}, {id:'a',transfer:true}, {id:'b',transfer:true}]};
 assert.equal(E.lessonSkill(E.emptyProgress('ulpan'),l),'not_started');
 const ordinary=E.record(E.emptyProgress('ulpan'),{...base,task:l.tasks[0],at:0}).progress;
 assert.equal(E.lessonSkill(ordinary,l),'in_progress');
 const partial=E.record(E.emptyProgress('ulpan'),{...base,task:l.tasks[1],at:0}).progress;
 assert.equal(E.lessonSkill(partial,l),'in_progress');
});
test('P2-F2: recorded lexical attribution survives lesson edits and omission', () => {
 const t={id:'6',transfer:true,spec:{kind:'order',require:['drink'],expect:{drink:'tea'}}};
 const l={id:'L001',tasks:[t],introduces:{active:[],receptive:[]},slots:[{id:'drink',values:[{key:'tea',seq:['lx.tea']}]}]};
 const r=E.record(E.markMet(E.emptyProgress('ulpan'),['lx.tea'],0),{...base,task:t,lesson:l,at:E.BREAK_MS});
 assert.deepEqual(E.touchedLexIds(l,t),['lx.tea']);
 assert.deepEqual(r.attempt.lexIds,['lx.tea']);
 const revised=structuredClone(l); revised.slots[0].values[0].seq=['lx.coffee'];
 for(const lessons of [[revised],[]]) {
  assert.equal(E.itemStatus(r.progress,'lx.tea',lessons).produced,true);
  assert.equal(E.itemStatus(r.progress,'lx.tea',lessons).appliedAfterBreak,true);
  assert.equal(E.itemStatus(r.progress,'lx.coffee',lessons).produced,false);
  assert.equal(E.courseCounts(r.progress,{entries:[{id:'lx.tea'}]},lessons).produced,1);
 }
 r.attempt.lexIds.push('lx.other'); l.slots[0].values[0].seq.push('lx.other');
 assert.deepEqual(r.progress.attempts[0].lexIds,['lx.tea']);
 const empty=structuredClone(r.progress); empty.attempts[0].lexIds=[];
 assert.equal(E.itemStatus(empty,'lx.tea',[l]).produced,false);
 const legacy=structuredClone(r.progress); delete legacy.attempts[0].lexIds;
 assert.equal(E.itemStatus(legacy,'lx.coffee',[revised]).produced,true);
});

test('P8a: skillSummary reports the weakest accepted level per skill and not_yet without evidence', () => {
  const E = require('../public/js/course-evidence.js');
  const l = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/course/mini/lessons/L001-cafe.json'), 'utf8'));
  const [a, b, c] = l.tasks;
  l.skills = [{ id: 's1', label: { ru: 'Сами' }, tasks: [a.id] }, { id: 's2', label: { ru: 'С опорой' }, tasks: [a.id, b.id] }, { id: 's3', label: { ru: 'Нет' }, tasks: [c.id] }];
  let p = E.emptyProgress('mini');
  p = E.record(p, { lessonId: l.id, lessonVersion: l.version, task: a, channel: 'write_he', input: 'x', result: { kind: 'accepted' }, at: 1 }).progress;
  p = E.openAid(p, l.id + '/' + b.id, 'hint', 2);
  p = E.record(p, { lessonId: l.id, lessonVersion: l.version, task: b, channel: 'write_he', input: 'y', result: { kind: 'accepted' }, at: 3 }).progress;
  const s = E.skillSummary(p, l);
  assert.deepEqual(s.map(x => [x.id, x.level]), [['s1', 'independent'], ['s2', 'supported'], ['s3', 'not_yet']]);
  assert.equal(s[0].label.ru, 'Сами');
  assert.deepEqual(E.skillSummary(p, { ...l, skills: undefined }), []);
});
