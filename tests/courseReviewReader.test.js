'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const E=require('../public/js/course-evidence'),R=require('../public/js/course-review'),UI=require('../public/js/course-review-reader');
const task={id:'word',prompt:{ru:'Назовите слово'},key:{ru:'Ответ: קפה'},accepts:['קפה'],rubric:[{id:'lexical',label:{ru:'Слово'},max:1}]};
const action={id:'action',prompt:{ru:'Перескажите'},stimulus:{ru:'Секретный материал'},key:{ru:'Ключ действия'},rubric:[{id:'meaning',label:{ru:'Смысл'},max:2}],repair:{prompt:{ru:'Другой заказ для практики'},key:{ru:'Сверка нового заказа'}}};
const plan={id:'review-plan',version:1,anchorLessonId:'B001',sessions:[{id:'R00',day:0,kind:'review',requiresActivityBreak:true,title:{ru:'Повтор'},instructions:{ru:'Инструкция'},tasks:[task,action]},{id:'D07',day:7,kind:'assessment',title:{ru:'Контроль'},instructions:{ru:'Инструкция'},tasks:[task,action]},{id:'R07',day:7,kind:'review',after:'D07',title:{ru:'Повтор 7'},instructions:{ru:'Инструкция'},tasks:[task]}]};
function seed(at=1000){return R.ensureAnchor(E.record(E.emptyProgress('pilot'),{lessonId:'B001',lessonVersion:1,task:{id:'base'},channel:'write_he',input:'x',result:{kind:'unknown'},at}).progress,plan);}
function env(){
 const {document,window}=parseHTML('<html lang="ru"><body><main></main></body></html>');let progress=seed(),at=1000,fail=false;const states=[];
 const container=document.querySelector('main'),opts={plan,now:()=>at++,getProgress:()=>progress,persist:()=>!fail,onState:s=>states.push(s),transact(fn){const next=fn(progress);if(fail)return false;progress=next;return true;}};
 return {document,window,container,states,get:()=>progress,set:p=>{progress=p;},setTime:n=>{at=n;},fail:v=>{fail=v;},mount:extra=>UI.mount(container,{...opts,...extra}),q:s=>container.querySelector(s),click(s){assert.ok(this.q(s),s);this.q(s).click();},input(s,value){const n=this.q(s);n.value=value;n.dispatchEvent(new window.Event('input'));}};
}
function start(e,id='R00'){
 e.click('[data-review-open="'+id+'"]');
 if(id==='R00'){const c=e.q('[data-review-break]');c.checked=true;c.dispatchEvent(new e.window.Event('change'));}
 e.click('[data-review-start]');
}
function finish(e){e.input('[data-review-input]','wrong');e.click('[data-review-submit]');e.input('[data-review-input]','first action');e.click('[data-review-submit]');e.click('[data-review-finish]');}
test('review starts only after activity break; answers are neutral and keys absent until complete',()=>{
 const e=env(),ui=e.mount();e.click('[data-review-open="R00"]');e.click('[data-review-start]');assert.match(e.q('[data-review-notice]').textContent,/Сначала сделайте паузу/);assert.equal(e.q('[data-review-input]'),null);assert.equal(e.get().reviewEvents.filter(x=>x.type==='start').length,0);
 const c=e.q('[data-review-break]');c.checked=true;c.dispatchEvent(new e.window.Event('change'));e.click('[data-review-start]');
 assert.equal(e.q('[data-review-key]'),null);assert.ok(!e.container.textContent.includes('Секретный материал'));assert.ok(!e.container.textContent.includes('Ответ: קפה'));
 const stale=e.q('[data-review-submit]');e.input('[data-review-input]','wrong');stale.click();stale.click();
 assert.equal(e.get().reviewEvents.filter(x=>x.type==='response').length,1);
 assert.equal(e.q('[data-review-stimulus]'),null);e.click('[data-review-stimulus-toggle]');assert.equal(e.q('[data-review-stimulus]').textContent,'Секретный материал');assert.equal(e.get().reviewEvents.at(-1).type,'stimulus');e.click('[data-review-stimulus-toggle]');
 e.input('[data-review-input]','action');e.click('[data-review-submit]');assert.equal(e.q('[data-review-keys]'),null);e.click('[data-review-finish]');assert.equal(e.q('[data-review-key]'),null);e.click('[data-review-keys]');assert.ok(e.q('[data-review-key]'));assert.equal(e.get().attempts.length,1);ui.destroy();
});
test('draft and assistance survive review remount with selected session and run',()=>{
 const e=env();let ui=e.mount();start(e);e.input('[data-review-input]','неотправленный ответ');const aided=e.q('[data-review-response-aided]');aided.checked=true;aided.dispatchEvent(new e.window.Event('change'));
 const pos=e.states.at(-1);assert.equal(pos.reviewSessionId,'R00');assert.ok(pos.reviewRunId);ui.destroy();e.document.documentElement.lang='he';ui=e.mount({sessionId:pos.reviewSessionId,runId:pos.reviewRunId});
 assert.equal(e.q('[data-review-input]').value,'неотправленный ответ');assert.equal(e.q('[data-review-input]').getAttribute('dir'),'auto');assert.equal(e.q('[data-review-response-aided]').checked,true);assert.equal(e.get().reviewEvents.filter(x=>x.type==='start').length,1);ui.destroy();
});
test('failed writes cannot reveal stimuli or keys or lose the unsent answer',()=>{
 const e=env(),ui=e.mount();start(e);e.input('[data-review-input]','draft');e.fail(true);e.click('[data-review-submit]');assert.equal(e.q('[data-review-input]').value,'draft');assert.equal(e.get().reviewEvents.filter(x=>x.type==='response').length,0);e.fail(false);e.click('[data-review-submit]');
 e.fail(true);e.click('[data-review-stimulus-toggle]');assert.equal(e.q('[data-review-stimulus]'),null);e.fail(false);e.input('[data-review-input]','action');e.click('[data-review-submit]');e.click('[data-review-finish]');e.fail(true);e.click('[data-review-keys]');assert.equal(e.q('[data-review-key]'),null);assert.equal(e.get().reviewEvents.filter(x=>x.type==='key').length,0);ui.destroy();
});
test('repair practice preserves initial response and defers its key until practice is saved',()=>{
 const e=env(),ui=e.mount();start(e);finish(e);e.click('[data-review-keys]');assert.ok(e.q('[data-review-repair="action"]'));assert.equal(e.q('[data-review-repair-key]'),null);e.input('[data-review-repair-input]','practice');e.click('[data-review-repair-submit]');
 assert.equal(e.q('[data-review-repair-key]').textContent,'Сверка нового заказа');const answers=e.get().reviewEvents.filter(x=>x.type==='response'&&x.taskId==='action');assert.deepEqual(answers.map(x=>[x.phase,x.input]),[['initial','first action'],['repair','practice']]);assert.equal(e.get().attempts.length,1);ui.destroy();
});
test('source rubric stays separate, exact score uses first response and repeated series is practice',()=>{
 const e=env(),ui=e.mount();e.setTime(1000+7*R.DAY);start(e,'D07');finish(e);e.click('[data-review-keys]');e.click('[data-review-auto-score="word"]');assert.equal(e.get().reviewEvents.find(x=>x.type==='score').value,0);assert.ok(e.q('[data-review-rubric="meaning"]'));assert.match(e.container.textContent,/Общий процент.*не вычисляется/);
 e.click('[data-review-retry]');e.click('[data-review-start]');assert.match(e.q('[data-review-classification]').textContent,/Практика/);assert.equal(e.get().reviewEvents.filter(x=>x.type==='start').length,2);ui.destroy();
});
test('conflicting offline resolution choices can be explicitly superseded from schedule',()=>{
 const e=env();let p=E.mergeProgress(seed(1000),seed(2000)),ids=p.reviewEvents.map(x=>x.id);
 p=E.mergeProgress(R.append(p,plan,'resolve_anchor',{candidateIds:ids,anchorId:ids[0]},3000),R.append(p,plan,'resolve_anchor',{candidateIds:ids,anchorId:ids[1]},3000));e.set(p);e.setTime(4000);const ui=e.mount();assert.equal(R.summary(e.get(),plan).conflict,true);e.click('[data-review-anchor]');assert.equal(R.summary(e.get(),plan).conflict,false);assert.equal(e.get().reviewEvents.filter(x=>x.type==='resolve_anchor').length,3);ui.destroy();
});

test('the prompt is not displayed unless its exposure is durably saved',()=>{
 const e=env();const started=R.start(e.get(),plan,'R00',{activityBreak:true},1000);e.set(started.progress);e.fail(true);const ui=e.mount({sessionId:'R00',runId:started.runId});
 assert.equal(e.q('[data-review-task]'),null);assert.ok(!e.container.textContent.includes(task.prompt.ru));assert.ok(e.q('[data-review-retry-display]'));
 e.fail(false);e.click('[data-review-retry-display]');assert.ok(e.q('[data-review-task]'));assert.ok(e.get().reviewEvents.some(x=>x.type==='stimulus'&&x.taskId==='word'));ui.destroy();
});

test('one imported task key does not silently reveal all other keys',()=>{
 const e=env();let s=R.start(e.get(),plan,'R00',{activityBreak:true},1000),p=s.progress;
 p=R.respond(p,plan,s.runId,'word','x',{},1001);p=R.respond(p,plan,s.runId,'action','y',{},1002);p=R.complete(p,plan,s.runId,1003);p=R.append(p,plan,'key',{runId:s.runId,taskId:'word'},1004);e.set(p);e.setTime(1005);
 const ui=e.mount({sessionId:'R00',runId:s.runId});assert.equal(e.q('[data-review-key]'),null);e.click('[data-review-keys]');assert.equal(e.container.querySelectorAll('[data-review-key]').length,2);assert.ok(e.get().reviewEvents.some(x=>x.type==='key'&&x.taskId===undefined));ui.destroy();
});

test('corrupt event identity keeps audit history and offers no ineffective anchor selection',()=>{
 const e=env(),p=e.get();p.reviewEvents.push({...p.reviewEvents[0],at:2000});e.set(p);const ui=e.mount();assert.ok(e.q('[data-review-integrity-error]'));assert.equal(e.q('[data-review-anchor]'),null);assert.equal(e.get().reviewEvents.length,2);ui.destroy();
});

test('malformed nested reader drafts are repaired without changing evidence',()=>{
 for(const draft of ['bad',{word:'bad'}]){
  const e=env(),s=R.start(e.get(),plan,'R00',{activityBreak:true},1000);s.progress.reader={review:{drafts:{[s.runId]:draft}}};e.set(s.progress);const ui=e.mount({sessionId:'R00',runId:s.runId});
  e.input('[data-review-input]','safe draft');assert.equal(e.q('[data-review-input]').value,'safe draft');assert.equal(e.get().attempts.length,1);ui.destroy();
 }
});

test('missing or corrupt aid disclosure stays unknown rather than granting independence',()=>{
 const e=env();e.setTime(1000+7*R.DAY);const p=e.get();p.reader={review:{preflight:{sessionId:'D07',priorStimuli:'no',priorKey:'no'}}};e.set(p);const ui=e.mount({sessionId:'D07'});e.click('[data-review-start]');
 const start=e.get().reviewEvents.find(x=>x.type==='start');assert.equal(start.aided,'unknown');assert.equal(R.runState(e.get(),plan,start.runId).independentEligible,false);ui.destroy();
});

test('unknown review routes fall back to schedule or an existing unfinished run',()=>{
 const e=env();let ui=e.mount({sessionId:'does-not-exist'});assert.ok(e.q('[data-review-schedule]'));ui.destroy();const s=R.start(e.get(),plan,'R00',{activityBreak:true},1000);e.set(s.progress);ui=e.mount({sessionId:'R00',runId:'does-not-exist'});assert.ok(e.q('[data-review-input]'));assert.equal(e.states.at(-1).reviewRunId,s.runId);ui.destroy();
});

test('all 123 authored pilot review tasks and 18 repairs complete through the UI without lesson mastery writes',()=>{
 const fs=require('node:fs'),path=require('node:path'),course=JSON.parse(fs.readFileSync(path.join(__dirname,'../content/course/ulpan-cafe-b-pilot/course.json'),'utf8')),real=course.reviewPlan;
 const {document,window}=parseHTML('<html lang="ru"><body><main></main></body></html>'),container=document.querySelector('main');
 let p=R.ensureAnchor(E.record(E.emptyProgress(course.id),{lessonId:real.anchorLessonId,lessonVersion:1,task:{id:'seed'},channel:'write_he',input:'x',result:{kind:'unknown'},at:1000}).progress,real),at=1000+31*R.DAY;
 const ui=UI.mount(container,{plan:real,now:()=>at++,getProgress:()=>p,persist:()=>true,transact(fn){p=fn(p);return true;}});
 let responses=0,repairs=0;
 for(const session of real.sessions){
  ui.openSession(session.id);
  const breakBox=container.querySelector('[data-review-break]');if(breakBox){breakBox.checked=true;breakBox.dispatchEvent(new window.Event('change'));}
  container.querySelector('[data-review-start]').click();
  for(const task of session.tasks){
   assert.equal(container.querySelector('[data-review-task]').getAttribute('data-review-task'),task.id);
   assert.equal(container.querySelector('[data-review-key]'),null);
   const input=container.querySelector('[data-review-input]');input.value=task.accepts?.[0]||'';input.dispatchEvent(new window.Event('input'));container.querySelector('[data-review-submit]').click();responses++;
  }
  container.querySelector('[data-review-finish]').click();container.querySelector('[data-review-keys]').click();
  assert.equal(container.querySelectorAll('[data-review-key]').length,session.tasks.length);
  for(const task of session.tasks.filter(t=>t.repair)){
   const input=container.querySelector('[data-review-repair-input="'+task.id+'"]');input.value='תרגול';input.dispatchEvent(new window.Event('input'));container.querySelector('[data-review-repair-submit="'+task.id+'"]').click();repairs++;
  }
 }
 assert.equal(responses,123);assert.equal(repairs,18);assert.equal(p.attempts.length,1);assert.equal(R.summary(p,real,at).conflict,false);assert.ok(R.summary(p,real,at).sessions.every(s=>s.status==='completed'));assert.equal(p.reviewEvents.filter(e=>e.type==='response'&&e.phase==='initial').length,123);assert.equal(p.reviewEvents.filter(e=>e.type==='response'&&e.phase==='repair').length,18);ui.destroy();
});

test('ambiguous same-time first answers show no exact score or automatic scoring control',()=>{
 const e=env(),s=R.start(e.get(),plan,'R00',{activityBreak:true},1000);let p=R.respond(s.progress,plan,s.runId,'word','wrong',{},1001);
 p.reviewEvents.push({...p.reviewEvents.find(x=>x.type==='response'),id:'same-time-other',input:'קפה'});p=R.respond(p,plan,s.runId,'action','',{},1002);p=R.complete(p,plan,s.runId,1003);p=R.append(p,plan,'key',{runId:s.runId},1004);e.set(p);e.setTime(1005);const ui=e.mount({sessionId:'R00',runId:s.runId});
 assert.ok(e.q('[data-review-ambiguous]'));assert.equal(e.q('[data-review-exact]'),null);assert.equal(e.q('[data-review-auto-score]'),null);assert.match(e.q('[data-review-classification]').textContent,/Практика/);ui.destroy();
});

test('keyboard submit moves focus to the next prompt or finish, while drafts do not steal focus',()=>{
 const e=env();let focused=null;e.window.HTMLElement.prototype.focus=function(){focused=this;};const ui=e.mount();start(e);
 assert.equal(focused,e.q('[data-review-task] h4'));assert.equal(focused.getAttribute('tabindex'),'-1');
 const input=e.q('[data-review-input]');input.focus();e.input('[data-review-input]','draft');assert.equal(focused,input);
 e.fail(true);e.click('[data-review-submit]');assert.equal(focused,e.q('[data-review-input]'));e.fail(false);
 e.click('[data-review-submit]');assert.equal(focused,e.q('[data-review-task] h4'));assert.equal(focused.textContent,action.prompt.ru);
 e.click('[data-review-submit]');assert.equal(focused,e.q('[data-review-finish]'));e.click('[data-review-finish]');assert.equal(focused,e.q('[data-review-keys]'));e.click('[data-review-keys]');assert.equal(focused,e.q('[data-review-result] h4'));ui.destroy();
});

test('second physical click cannot submit the next task and held Enter is cancelled',()=>{
 const e=env(),ui=e.mount();start(e);e.input('[data-review-input]','first');
 const first=new e.window.Event('click',{bubbles:true});Object.defineProperty(first,'detail',{value:1});e.q('[data-review-submit]').dispatchEvent(first);
 const next=e.q('[data-review-submit]'),second=new e.window.Event('click',{bubbles:true});Object.defineProperty(second,'detail',{value:2});next.dispatchEvent(second);
 assert.equal(e.get().reviewEvents.filter(x=>x.type==='response').length,1);assert.equal(e.q('[data-review-task]').getAttribute('data-review-task'),'action');
 const repeat=new e.window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperties(repeat,{repeat:{value:true},key:{value:'Enter'}});next.dispatchEvent(repeat);assert.equal(repeat.defaultPrevented,true);ui.destroy();
});
