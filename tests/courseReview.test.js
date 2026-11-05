'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../public/js/course-review'),E=require('../public/js/course-evidence'),S=require('../public/js/course-store');
const task={id:'t',prompt:{ru:'Answer'},key:{ru:'Key'},accepts:['קפה'],rubric:[{id:'lexical',label:{ru:'Word'},max:1}],repair:{prompt:{ru:'Other'},key:{ru:'Other key'}}};
const plan={id:'b-review',version:1,anchorLessonId:'B001',sessions:[{id:'R00',day:0,kind:'review',requiresActivityBreak:true,title:{ru:'R0'},instructions:{ru:'Do'},tasks:[task]},{id:'D07',day:7,kind:'assessment',title:{ru:'D7'},instructions:{ru:'Do'},tasks:[task]},{id:'R07',day:7,kind:'review',after:'D07',title:{ru:'R7'},instructions:{ru:'Do'},tasks:[task]}]};
const opts={activityBreak:true,externalExposure:'yes',priorStimuli:'no',priorKey:'no',aided:false};
function progress(at=1000){let p=E.emptyProgress('pilot');p=E.record(p,{lessonId:'B001',lessonVersion:1,task:{id:'base'},channel:'write_he',input:'x',result:{kind:'unknown'},at}).progress;return R.ensureAnchor(p,plan);}
function finish(p,id,at){let r=R.start(p,plan,id,opts,at);p=R.respond(r.progress,plan,r.runId,'t','קפה',{},at+1);return {progress:R.complete(p,plan,r.runId,at+2),runId:r.runId};}
test('plan checks IDs references rubrics and dependency cycles',()=>{assert.deepEqual(R.validatePlan(plan,{lessons:['B001']}),[]);let q=structuredClone(plan);q.sessions[0].after='R07';assert.ok(R.validatePlan(q,{lessons:['B001']}).length);q=structuredClone(plan);q.sessions[0].tasks[0].rubric.push(task.rubric[0]);assert.ok(R.validatePlan(q,{lessons:['B001']}).length);});
test('legacy progress remains byte-identical with no optional events',()=>{let p=E.emptyProgress('ulpan');assert.equal(Object.hasOwn(E.mergeProgress(p,p),'reviewEvents'),false);assert.equal(S.validProgress(p,'ulpan'),true);assert.equal(R.ensureAnchor(p,plan),p);});
test('anchor is real attempt, immutable under later retry, isolated per course',()=>{let p=progress();let before=R.summary(p,plan).anchor.at;p=E.record(p,{lessonId:'B001',lessonVersion:1,task:{id:'other'},channel:'write_he',input:'x',result:{kind:'accepted'},at:5000}).progress;assert.equal(R.summary(R.ensureAnchor(p,plan),plan).anchor.at,before);assert.throws(()=>R.append(p,plan,'anchor',{attemptId:'invented',anchorAt:0},0),/ANCHOR/);assert.throws(()=>E.mergeProgress(p,E.emptyProgress('ulpan')),/COURSE_MISMATCH/);});
test('two offline anchors require explicit resolution, conflicting choices stay blocked',()=>{let a=progress(1000),b=progress(2000),p=E.mergeProgress(a,b);assert.equal(R.summary(p,plan).anchor.status,'conflict');const ids=p.reviewEvents.map(e=>e.id);let x=R.append(p,plan,'resolve_anchor',{candidateIds:ids,anchorId:ids[0]},3000),y=R.append(p,plan,'resolve_anchor',{candidateIds:ids,anchorId:ids[1]},3000);assert.equal(R.summary(x,plan).anchor.at,p.reviewEvents[0].anchorAt);assert.equal(R.summary(E.mergeProgress(x,y),plan).conflict,true);assert.throws(()=>R.append(p,plan,'resolve_anchor',{candidateIds:[ids[0]],anchorId:ids[0]},3000),/STALE/);});
test('same ID differing event bodies survive merge and produce conflict',()=>{let p=progress();let q=structuredClone(p);q.reviewEvents[0].at++;let m=E.mergeProgress(p,q);assert.equal(m.reviewEvents.length,2);assert.equal(R.summary(m,plan).conflict,true);assert.deepEqual(E.mergeProgress(p,q),E.mergeProgress(q,p));});
test('fixed day offsets overdue and D-before-R; no early starts',()=>{let p=progress(),at=1000+7*R.DAY;assert.equal(R.sessionState(p,plan,'D07',at-1).status,'upcoming');assert.equal(R.sessionState(p,plan,'D07',at).status,'due');assert.equal(R.sessionState(p,plan,'D07',at+R.DAY).status,'overdue');assert.equal(R.sessionState(p,plan,'R07',at).status,'blocked');assert.throws(()=>R.start(p,plan,'D07',opts,at-1),/NOT_AVAILABLE/);assert.throws(()=>R.start(p,plan,'R00',{},1000),/BREAK/);let f=finish(p,'D07',at+R.DAY);assert.equal(R.runState(f.progress,plan,f.runId).actualDelayDays,8);assert.equal(R.sessionState(f.progress,plan,'R07',at+R.DAY).status,'overdue');assert.equal(R.sessionState(f.progress,plan,'R00',at+R.DAY).dueAt,1000);});
test('D saves errors without mastery, defers key, resumes, preserves repeated responses',()=>{let p=progress(),at=1000+7*R.DAY,r=R.start(p,plan,'D07',opts,at);assert.throws(()=>R.append(r.progress,plan,'key',{runId:r.runId},at),/LOCKED/);p=R.respond(r.progress,plan,r.runId,'t','wrong',{},at+1);p=R.respond(p,plan,r.runId,'t','קפה',{},at+2);assert.equal(R.runState(p,plan,r.runId).responses.length,2);assert.equal(R.sessionState(p,plan,'D07',at+2).status,'in_progress');p=R.complete(p,plan,r.runId,at+3);assert.equal(p.attempts.length,1);p=R.append(p,plan,'key',{runId:r.runId},at+4);assert.throws(()=>R.append(p,plan,'score',{runId:r.runId,taskId:'t',rubricId:'lexical',value:1,source:'auto_exact'},at+5),/EXACT/);p=R.append(p,plan,'score',{runId:r.runId,taskId:'t',rubricId:'lexical',value:0,source:'auto_exact'},at+5);assert.equal(R.runState(p,plan,r.runId).scores[0].value,0);p=R.respond(p,plan,r.runId,'t','repair', {phase:'repair'},at+6);assert.equal(R.runState(p,plan,r.runId).responses.length,3);});
test('intervening study is context; unknown exact-test exposure or aids disqualifies independence',()=>{let p=progress(),at=1000+7*R.DAY;let r=R.start(p,plan,'D07',opts,at);assert.equal(R.runState(r.progress,plan,r.runId).independentEligible,true);let q=R.start(p,plan,'D07',{},at);assert.equal(R.runState(q.progress,plan,q.runId).independentEligible,false);let f=finish(p,'D07',at);let next=R.start(f.progress,plan,'D07',opts,at+10);assert.equal(R.runState(next.progress,plan,next.runId).practice,true);});
test('strict bounded events survive store and reject malformed and excessive payloads',()=>{let p=progress();assert.equal(S.validProgress(p,'pilot'),true);let store=S.memoryStore();store.save(p);assert.deepEqual(store.load('pilot').progress,p);let bad=structuredClone(p);bad.reviewEvents[0].secret='no';assert.equal(S.validProgress(bad,'pilot'),false);assert.equal(R.validEvents(Array(10001).fill(p.reviewEvents[0])),false);let r=R.start(p,plan,'R00',opts,1000);assert.throws(()=>R.respond(r.progress,plan,r.runId,'t','x'.repeat(8001),{},1001),/INVALID/);});
test('clock rollback cannot open an early test or manufacture nonnegative delay',()=>{
 const p=progress(1000+30*R.DAY);const at=1000;
 assert.equal(R.sessionState(p,plan,'D07',at).status,'upcoming');
 assert.throws(()=>R.start(p,plan,'D07',opts,at),/NOT_AVAILABLE/);
 assert.equal(R.summary(p,plan,at).anchor.at,1000+30*R.DAY);
 const due=1000+37*R.DAY,r=R.start(p,plan,'D07',opts,due);
 assert.throws(()=>R.respond(r.progress,plan,r.runId,'t','x',{},due-1),/INVALID/);
});

test('conflicting resolutions can be superseded without deleting audit history',()=>{
 const merged=E.mergeProgress(progress(1000),progress(2000));
 const ids=merged.reviewEvents.filter(e=>e.type==='anchor').map(e=>e.id);
 const choose=(p,anchorId,at,supersedes)=>R.append(p,plan,'resolve_anchor',{candidateIds:ids,anchorId,...(supersedes?{supersedes}:{})},at);
 const a=choose(merged,ids[0],3000),b=choose(merged,ids[1],3000),both=E.mergeProgress(a,b);
 assert.equal(R.summary(both,plan).conflict,true);
 assert.throws(()=>choose(both,ids[0],4000),/STALE/);
 const old=both.reviewEvents.filter(e=>e.type==='resolve_anchor').map(e=>e.id);
 const fixed=choose(both,ids[0],4000,old);
 assert.equal(R.summary(fixed,plan).conflict,false);
 assert.equal(fixed.reviewEvents.length,both.reviewEvents.length+1);
 assert.equal(S.validProgress(fixed,'pilot'),true);
 assert.deepEqual(E.mergeProgress(fixed,both),fixed);
 const competing=choose(both,ids[1],4000,old),again=E.mergeProgress(fixed,competing);
 assert.equal(R.summary(again,plan).conflict,true);
 const all=again.reviewEvents.filter(e=>e.type==='resolve_anchor').map(e=>e.id);
 assert.equal(R.summary(choose(again,ids[1],5000,all),plan).conflict,false);
});

test('two independently generated anchors for the same actual attempt do not conflict',()=>{
 const base=progress();delete base.reviewEvents;
 const a=R.ensureAnchor(base,plan),b=R.ensureAnchor(base,plan),merged=E.mergeProgress(a,b);
 assert.equal(merged.reviewEvents.length,2);
 assert.equal(R.summary(merged,plan).conflict,false);
 assert.equal(R.summary(merged,plan).anchor.at,1000);
});

test('shape-valid imported impossible relationships cannot unlock keys or claim completion',()=>{
 const at=1000+7*R.DAY;
 const fresh=()=>R.start(progress(),plan,'D07',opts,at);
 const inject=(p,runId,type,payload,when)=>({...p,reviewEvents:[...p.reviewEvents,{id:'import-'+type,planId:plan.id,planVersion:1,runId,type,at:when,...payload}]});
 const check=(p,runId)=>{
  assert.equal(S.validProgress(p,'pilot'),true,'shape remains loadable/auditable');
  assert.equal(R.summary(p,plan).conflict,true);
  const state=R.runState(p,plan,runId);
  assert.equal(state.completed,false);assert.equal(state.independentEligible,false);assert.equal(state.keyExposed,false);
  assert.throws(()=>R.append(p,plan,'key',{runId},at+20),/INVALID|LOCKED/);
 };
 let r=fresh();check(inject(r.progress,r.runId,'complete',{},at+1),r.runId);
 r=fresh();check(inject(r.progress,r.runId,'response',{taskId:'missing',input:'x',aided:false,channel:'text',phase:'initial'},at+1),r.runId);
 r=fresh();check(inject(r.progress,r.runId,'key',{},at+1),r.runId);
 r=fresh();check(inject(r.progress,r.runId,'response',{taskId:'t',input:'x',aided:false,channel:'text',phase:'initial'},at-1),r.runId);
 r=fresh();let p=R.respond(r.progress,plan,r.runId,'t','קפה',{},at+2);check(inject(p,r.runId,'complete',{},at+1),r.runId);
 p=R.complete(p,plan,r.runId,at+3);check(inject(p,r.runId,'key',{},at+2),r.runId);
 p=R.append(p,plan,'key',{runId:r.runId},at+4);
 check(inject(p,r.runId,'score',{taskId:'t',rubricId:'lexical',value:0,source:'auto_exact'},at+5),r.runId);
 check(inject(p,r.runId,'score',{taskId:'t',rubricId:'lexical',value:1,source:'auto_exact'},at+3),r.runId);
 check(inject(p,r.runId,'response',{taskId:'t',input:'x',aided:false,channel:'text',phase:'initial'},at+5),r.runId);
});

test('clock rollback cannot timestamp keys scores or repairs before their prerequisites',()=>{
 const at=1000+7*R.DAY,f=finish(progress(),'D07',at);let p=f.progress;
 assert.throws(()=>R.append(p,plan,'key',{runId:f.runId},at+1),/LOCKED/);
 p=R.append(p,plan,'key',{runId:f.runId},at+4);
 assert.throws(()=>R.append(p,plan,'score',{runId:f.runId,taskId:'t',rubricId:'lexical',value:1,source:'auto_exact'},at+3),/SCORE/);
 assert.throws(()=>R.respond(p,plan,f.runId,'t','x',{phase:'repair'},at+3),/PHASE/);
});

test('imports with orphan events, early starts, missing predecessor, or cyclic resolutions fail closed',()=>{
 let r=R.start(progress(),plan,'D07',opts,1000+7*R.DAY);
 for(const mutate of [
  p=>p.reviewEvents.find(e=>e.type==='start').at=1000,
  p=>p.reviewEvents.find(e=>e.type==='start').sessionId='R07',
  p=>p.reviewEvents.push({id:'orphan',planId:plan.id,planVersion:1,runId:'missing',type:'complete',at:1000+7*R.DAY})
 ]){const p=structuredClone(r.progress);mutate(p);assert.equal(S.validProgress(p,'pilot'),true);assert.equal(R.summary(p,plan).conflict,true);}
 let p=progress();const anchor=p.reviewEvents[0].id;
 for(const [id,other]of [['a','b'],['b','a']])p.reviewEvents.push({id,planId:plan.id,planVersion:1,type:'resolve_anchor',candidateIds:[anchor],anchorId:anchor,supersedes:[other],at:2000});
 assert.equal(S.validProgress(p,'pilot'),true);assert.equal(R.summary(p,plan).conflict,true);
});


test('clock rollback cannot insert a replacement before the original response',()=>{
 const at=1000+7*R.DAY,r=R.start(progress(),plan,'D07',opts,at);
 const p=R.respond(r.progress,plan,r.runId,'t','wrong',{},at+10);
 assert.throws(()=>R.respond(p,plan,r.runId,'t','קפה',{},at+5),/TIME/);
});

test('different same-ms first answers never use UUID ordering as first-answer evidence',()=>{
 const at=1000+7*R.DAY,r=R.start(progress(),plan,'D07',opts,at);
 const left=R.respond(r.progress,plan,r.runId,'t','wrong',{},at+1);
 const right=R.respond(r.progress,plan,r.runId,'t','קפה',{},at+1);
 for(const p of [E.mergeProgress(left,right),E.mergeProgress(right,left)]){
  const state=R.runState(p,plan,r.runId);
  assert.deepEqual(state.ambiguousFirstTaskIds,['t']);assert.equal(state.practice,true);assert.equal(state.independentEligible,false);
  assert.equal(state.responses.length,2);assert.equal(R.summary(p,plan).conflict,false);
  let finished=R.complete(p,plan,r.runId,at+2);finished=R.append(finished,plan,'key',{runId:r.runId},at+3);
  for(const value of [0,1])assert.throws(()=>R.append(finished,plan,'score',{runId:r.runId,taskId:'t',rubricId:'lexical',value,source:'auto_exact'},at+4),/AMBIGUOUS_FIRST_RESPONSE/);
 }
});

test('identical first-answer ties remain scoreable without dropping either event',()=>{
 const at=1000+7*R.DAY,r=R.start(progress(),plan,'D07',opts,at);
 const a=R.respond(r.progress,plan,r.runId,'t','קפה',{},at+1),b=R.respond(r.progress,plan,r.runId,'t','קפה',{},at+1);
 let p=E.mergeProgress(a,b);assert.deepEqual(R.runState(p,plan,r.runId).ambiguousFirstTaskIds,[]);
 assert.equal(R.runState(p,plan,r.runId).responses.length,2);assert.equal(R.runState(p,plan,r.runId).independentEligible,true);
 p=R.complete(p,plan,r.runId,at+2);p=R.append(p,plan,'key',{runId:r.runId},at+3);
 p=R.append(p,plan,'score',{runId:r.runId,taskId:'t',rubricId:'lexical',value:1,source:'auto_exact'},at+4);
 assert.equal(R.runState(p,plan,r.runId).scores[0].value,1);
 const aided=R.respond(r.progress,plan,r.runId,'t','קפה',{aided:true},at+1);
 assert.deepEqual(R.runState(E.mergeProgress(a,aided),plan,r.runId).ambiguousFirstTaskIds,['t']);
});

test('offline ambiguity invalidates derived exact score without losing old score or blocking practice',()=>{
 const at=1000+7*R.DAY,r=R.start(progress(),plan,'D07',opts,at);
 let p=R.respond(r.progress,plan,r.runId,'t','קפה',{},at+1);
 p=R.complete(p,plan,r.runId,at+2);p=R.append(p,plan,'key',{runId:r.runId},at+3);
 p=R.append(p,plan,'score',{runId:r.runId,taskId:'t',rubricId:'lexical',value:1,source:'auto_exact'},at+4);
 const offline=R.respond(r.progress,plan,r.runId,'t','wrong',{},at+1),merged=E.mergeProgress(p,offline),run=R.runState(merged,plan,r.runId);
 assert.equal(run.completed,true);assert.equal(run.practice,true);assert.equal(run.independentEligible,false);
 assert.deepEqual(run.ambiguousFirstTaskIds,['t']);assert.deepEqual(run.scores,[]);
 assert.equal(merged.reviewEvents.filter(e=>e.type==='score').length,1);assert.equal(R.summary(merged,plan).conflict,false);
 assert.equal(S.validProgress(merged,'pilot'),true);
});

test('later tied retries and repairs do not make a unique first answer ambiguous',()=>{
 const at=1000+7*R.DAY,r=R.start(progress(),plan,'D07',opts,at);
 let p=R.respond(r.progress,plan,r.runId,'t','wrong',{},at+1);
 p=R.respond(p,plan,r.runId,'t','קפה',{},at+2);p=R.respond(p,plan,r.runId,'t','other',{},at+2);
 p=R.complete(p,plan,r.runId,at+3);p=R.append(p,plan,'key',{runId:r.runId},at+4);
 p=R.respond(p,plan,r.runId,'t','repair',{phase:'repair'},at+5);
 assert.deepEqual(R.runState(p,plan,r.runId).ambiguousFirstTaskIds,[]);
 p=R.append(p,plan,'score',{runId:r.runId,taskId:'t',rubricId:'lexical',value:0,source:'auto_exact'},at+6);
 assert.equal(R.runState(p,plan,r.runId).scores[0].value,0);
});
