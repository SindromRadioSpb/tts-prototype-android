const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseHTML}=require('linkedom');
const SC=require('../public/js/course-scene'),A=require('../public/js/course-audio');
const S=require('../public/js/course-store'),R=require('../public/js/course-reader'),E=require('../public/js/course-evidence');
const load=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/course/mini',n),'utf8'));
const he=(n,p)=>({niqqud:n,plain:p});
function branchingScene(){return {id:'sc',roles:[{id:'staff',voice:'he-IL-Wavenet-D'},{id:'learner',voice:'he-IL-Wavenet-C'}],turns:[
 {id:'t1',role:'staff',he:he('שָׁלוֹם, מָה תִּרְצֶה?','שלום, מה תרצה?'),ru:{ru:'Здравствуйте, что желаете?'},next:'t2'},
 {id:'t2',role:'learner',he:he('קָפֶה, בְּבַקָּשָׁה','קפה, בבקשה'),ru:{ru:'Кофе, пожалуйста'},choices:[
   {id:'ok',he:he('קָפֶה, בְּבַקָּשָׁה','קפה, בבקשה'),ru:{ru:'Кофе, пожалуйста'},next:'t4',verdict:'ok'},
   {id:'what',he:he('סְלִיחָה, עוֹד פַּעַם?','סליחה, עוד פעם?'),ru:{ru:'Простите, ещё раз?'},next:'t3',verdict:'repair'}]},
 {id:'t3',role:'staff',he:he('מָה תִּרְצֶה לִשְׁתּוֹת?','מה תרצה לשתות?'),ru:{ru:'Что будете пить?'},next:'t4'},
 {id:'t4',role:'staff',he:he('בְּתֵאָבוֹן!','בתאבון!'),ru:{ru:'Приятного аппетита!'}}]};}
test('path follows next links and stops at an unanswered choice',()=>{
 const s=branchingScene();
 assert.deepEqual(SC.path(s,{}),['t1','t2']);
 assert.deepEqual(SC.path(s,{t2:'ok'}),['t1','t2','t4']);
 assert.deepEqual(SC.path(s,{t2:'what'}),['t1','t2','t3','t4']);
});
test('a scene without edges is a linear list',()=>{
 const l=load('lessons/L001-cafe.json');
 assert.deepEqual(SC.path(l.scene,{}),l.scene.turns.map(t=>t.id));
});
class FakeAudio{static all=[];constructor(src){this.src=src;this.listeners={};FakeAudio.all.push(this);}addEventListener(k,f){this.listeners[k]=f;}removeEventListener(k,f){if(this.listeners[k]===f)delete this.listeners[k];}play(){return Promise.resolve();}pause(){}removeAttribute(){}end(){this.listeners.ended?.();}}
const key=c=>c.repeat(64);
test('playSequence plays clips in order, skips silent turns and stops on stop()',async()=>{
 FakeAudio.all=[];
 const host=A.create({courseId:'mini',lessonId:'L',AudioCtor:FakeAudio,fetch:async()=>({ok:true,json:async()=>({t1:key('a'),t3:key('b')})})});
 await host.load();
 const seen=[];const done=host.playSequence(['t1','t2','t3'],{onTurn:id=>seen.push(id)});
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(seen,['t1']);
 FakeAudio.all.at(-1).end();await new Promise(r=>setImmediate(r));
 assert.deepEqual(seen,['t1','t2','t3']);
 host.stop();
 assert.equal(await done,false);
});
function env(edit,audio){const {document,window}=parseHTML('<html><body><main></main></body></html>');const store=S.memoryStore();const data={'course.json':load('course.json'),'lexicon.json':load('lexicon.json')};for(const id of data['course.json'].lessons)data['lessons/'+id+'.json']=load('lessons/'+id+'.json');
 const l=data['lessons/L001-cafe.json'];l.scene=branchingScene();for(const t of l.tasks)delete t.audioTurnId;
 l.flow=[{id:'p1',title:{ru:'Сцена'},steps:[{kind:'scene',mode:'listen'},{kind:'scene',mode:'read'}]},{id:'p2',title:{ru:'Практика'},steps:l.tasks.map(t=>({kind:'task',ref:t.id}))}];
 if(audio)data['audio/L001-cafe.json']=audio;if(edit)edit(data);
 const opts={courseId:'mini',store,AudioCtor:FakeAudio,fetch:async url=>{const k=url.split('/mini/')[1];return k in data?{ok:true,json:async()=>structuredClone(data[k])}:{ok:false,json:async()=>null};},T:(k,fb)=>fb,now:()=>10000};
 return {document,window,store,opts,data,mount:()=>R.factory(document).mount(document.querySelector('main'),opts)};}
test('listen mode hides text, offers Russian choices and keeps the choice across remount',async()=>{
 const e=env(null,{t1:key('a'),t3:key('b'),t4:key('c')}),r=e.mount();await r.openLesson('L001-cafe',0);
 const scene=e.document.querySelector('[data-course-scene]');
 assert.equal(scene.getAttribute('data-mode'),'listen');
 assert.ok(!/שלום/.test(scene.textContent),'Hebrew text hidden before reveal');
 const choices=[...scene.querySelectorAll('[data-scene-choice]')];
 assert.deepEqual(choices.map(b=>b.textContent),['Кофе, пожалуйста','Простите, ещё раз?']);
 choices[1].click();
 assert.ok(e.document.querySelector('[data-turn="t3"]'),'repair branch shown');
 r.destroy();
 const r2=e.mount();await r2.openLesson('L001-cafe');
 assert.ok(e.document.querySelector('[data-turn="t3"]'));
 assert.equal(e.document.querySelectorAll('[data-scene-choice]').length,0);
 assert.equal(e.store.load('mini').progress.reader.scenes['L001-cafe'].choices.t2,'what');
 r2.destroy();
});
test('revealing the text in listen mode is recorded as transcript help for listening tasks of the scene',async()=>{
 const e=env(d=>{const t=d['lessons/L001-cafe.json'].tasks[0];t.channel=['listen','write_he'];t.audioTurnId='t1';},{t1:key('a')}),r=e.mount();
 await r.openLesson('L001-cafe',0);
 e.document.querySelector('[data-scene-reveal]').click();
 assert.match(e.document.querySelector('[data-course-scene]').textContent,/שָׁלוֹם|שלום/);
 const t=e.data['lessons/L001-cafe.json'].tasks[0];
 assert.equal(e.store.load('mini').progress.aids['L001-cafe/'+t.id].transcript,true);
 r.destroy();
});
test('listen mode without audio honestly falls back to text and never yields a listen channel',async()=>{
 const e=env(),r=e.mount();await r.openLesson('L001-cafe',0);
 const scene=e.document.querySelector('[data-course-scene]');
 assert.equal(scene.getAttribute('data-mode'),'read');
 assert.match(scene.textContent,/Запись недоступна/);
 const t=e.data['lessons/L001-cafe.json'].tasks[0];
 await r.openLesson('L001-cafe',2);
 const field=e.document.querySelector('[data-course-input]');field.value='תה בלי סוכר';field.dispatchEvent(new e.window.Event('input'));
 e.document.querySelector('[data-course-check]').click();
 assert.notEqual(e.store.load('mini').progress.attempts.at(-1).channel,'listen');
 r.destroy();
});
test('read mode shows choices in Hebrew',async()=>{
 const e=env(),r=e.mount();await r.openLesson('L001-cafe',1);
 const b=[...e.document.querySelectorAll('[data-scene-choice]')];
 assert.equal(b.length,2);assert.match(b[1].textContent,/סליחה|סְלִיחָה/);
 r.destroy();
});
