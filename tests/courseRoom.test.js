'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
const source=fs.readFileSync(path.join(__dirname,'../public/js/library-ui.js'),'utf8');
function block(name,end){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const stop=source.indexOf(end,start);assert.ok(stop>start);return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,stop);}
function env(){
 const {document}=parseHTML('<html><body><main id="roomContent"></main></body></html>');const mounted=[],states=[],requests=[];
 const ctx=vm.createContext({document,window:{CourseReader:{mount(container,opts){const reader={home(){container.textContent='home';},openLesson(id,step){container.textContent=id+':'+step;},destroy(){container.textContent='';reader.dead=true;}};mounted.push({container,opts,reader});return reader;}},CourseStore:{localStore:(storage,opts)=>opts},CourseSync:{create:opts=>({status:'local_only',syncNow:async()=> 'local_only',schedule(){},dispose(){},opts})},CloudSync:{me:async()=>({user:{id:'u1'},consents:{}}),CLOUD_TEXTS_CONSENT_VERSION:'v2'},fetch:async()=>({})},localStorage:{},
 $:id=>document.getElementById(id),el:(tag,opts)=>{const node=document.createElement(tag);node.className=opts?.class||'';return node;},tt:(k,fb)=>fb,corpusSwitcherBar:()=>document.createElement('nav'),readerCfg:{heOn:true,niqqudMode:'full',ruMode:'reveal',translitOn:false},corpusRenderToken:1,roomCourseReader:null,roomCourseAnchor:null,roomCoursePosition:null,roomCourseUserId:null,roomSessionRole:'owner',roomSessionUserId:'u1',roomCommitPresentation:(...args)=>states.push(args),attachCourseWords(){},showState(){},
 roomRefreshSessionRole:()=>new Promise(resolve=>requests.push(resolve))});
 vm.runInContext(block('renderCourseCorpus','function attachCourseWords'),ctx);
 return {ctx,mounted,states,requests,document};
}
test('course dispatch and teardown cover corpus switch and Room exit',()=>{
 assert.match(block('renderCorpus','// The open section'),/startsWith\('course:'\)/);
 assert.match(block('renderCorpus','// The open section'),/destroyCourseReader\(\)/);
 assert.match(source.slice(source.indexOf('const leaveRoom ='),source.indexOf('const leaveRoom =')+800),/destroyCourseReader\(\)/);
});
test('late auth response cannot mount over newer corpus render',async()=>{
 const e=env();const first=e.ctx.renderCourseCorpus('ulpan',1);e.ctx.corpusRenderToken=2;
 const second=e.ctx.renderCourseCorpus('ulpan',2);
 e.requests[1]({user:{id:'u1',role:'owner'}});await second;
 e.requests[0]({user:{id:'u1',role:'owner'}});await first;
 assert.equal(e.mounted.length,1);assert.equal(e.document.querySelector('#roomContent').textContent,'home');
});
test('public course route isolates member and owner progress/restoration',async()=>{
 const e=env();let p=e.ctx.renderCourseCorpus('ulpan',1);e.ctx.roomSessionRole='member';e.requests[0]({user:{id:'u2',role:'member'}});await p;assert.equal(e.mounted.length,1);assert.equal(e.mounted[0].opts.store.userKey,'u2');
 e.ctx.roomSessionRole='owner';e.ctx.roomCourseAnchor={lessonId:'L001-cafe',step:3};p=e.ctx.renderCourseCorpus('ulpan',1);e.requests[1]({user:{id:'u1',role:'owner'}});await p;
 assert.equal(e.mounted[1].opts.store.userKey,'u1');assert.match(e.document.querySelector('#roomContent').textContent,/L001-cafe:3/);
 e.mounted[0].opts.onState({lessonId:'L001-cafe',step:3});assert.equal(e.states.at(-1)[0],'replace');
 e.mounted[0].opts.onState({lessonId:'',step:0});assert.equal(e.states.at(-1)[0],'push');
});
test('anonymous direct course route mounts lessons with isolated local progress',async()=>{
 const e=env();e.ctx.roomSessionRole='';e.ctx.roomSessionUserId='';
 const pending=e.ctx.renderCourseCorpus('ulpan',1);e.requests[0](null);await pending;
 assert.equal(e.mounted.length,1);assert.equal(e.mounted[0].opts.store.userKey,'anon');
 assert.equal(e.mounted[0].opts.sync.opts.userKey,'anon');
 assert.equal(e.document.querySelector('#roomContent').textContent,'home');
});

test('course word adapter disables occurrence writes and recall, keeps dictionary save',()=>{
 const {document}=parseHTML('<section><div class="course-line" data-ref="L/t"><div data-col="he"><span data-w-offset="0" data-surface="תה"></span></div></div></section>');let opts,saved;
 const ctx=vm.createContext({window:{ReaderMorph:{}},attachReaderMorph:(root,o)=>{opts=o;return {detach(){}};},roomSaveWord:(card,occ)=>{saved=occ;}});
 vm.runInContext(block('attachCourseWords','// The open section'),ctx);
 ctx.attachCourseWords(document.querySelector('section'),{id:'L',scene:{turns:[{id:'t',he:{plain:'תה',niqqud:'תֵּה'},ru:{ru:'чай'}}]}});
 assert.equal(opts.getPlainText(opts.getRowForCell(null,document.querySelector('.course-line'))),'תה');
 const occ=opts.buildOccurrence(document.querySelector('span'));assert.equal(occ.source_kind,'course_line');assert.equal(occ.text_id,null);assert.equal(occ.sentence_id,null);
 opts.saveWord({},occ);assert.equal(saved,null);assert.equal(opts.getDueSchedule,null);assert.equal(opts.gradeReadingTap,null);assert.equal(opts.confirmOccurrenceAnalysis,null);
});

test('changing course identity destroys old reader before returning to hub',()=>{
 const actions=[];
 const ctx=vm.createContext({roomSessionRole:'owner',roomSessionUserId:'u1',roomCourseReader:{destroy(){actions.push('destroy');}},roomCourseAnchor:{lessonId:'old'},roomCoursePosition:{lessonId:'old'},window:{ReaderMorph:{closeSheet(){actions.push('close');}}},corpusNav:{corpus:'course:ulpan'},activeTrack:'corpus',roomRefreshCorpusSwitchers(){},renderCorpus(){},corpusNavToCorpus(id){actions.push(id);ctx.corpusNav={corpus:id};}});
 vm.runInContext(block('destroyCourseReader','async function renderCourseCorpus'),ctx);
 vm.runInContext(block('roomSetSessionRole','async function roomRefreshSessionRole'),ctx);
 ctx.roomSetSessionRole({user:{id:'u2',role:'owner'}});
 assert.deepEqual(actions,['destroy','close','hub']);assert.equal(ctx.roomCourseReader,null);assert.equal(ctx.roomCourseAnchor,null);assert.equal(ctx.roomCoursePosition,null);
});


test('leaving Room invalidates a pending course authorization before DB close resolves',async()=>{
 const e=env();let finishClose;
 e.ctx._progressTimer=null;e.ctx.localDb={closeLocalDB:()=>new Promise(resolve=>{finishClose=resolve;})};e.ctx.location={href:'/library.html'};
 vm.runInContext(block('destroyCourseReader','async function renderCourseCorpus'),e.ctx);
 const start=source.indexOf('const leaveRoom =');const stop=source.indexOf('  const wire =',start);
 vm.runInContext(source.slice(start,stop)+'globalThis.leaveRoom=leaveRoom;',e.ctx);
 const pending=e.ctx.renderCourseCorpus('ulpan',1);
 e.ctx.leaveRoom({button:0,preventDefault(){}},'/');
 e.requests[0]({user:{id:'u1',role:'owner'}});await pending;
 assert.equal(e.mounted.length,0);assert.equal(e.ctx.location.href,'/library.html');
 finishClose();await new Promise(resolve=>setImmediate(resolve));assert.equal(e.ctx.location.href,'/');
});

test('P3-F1 course morphology preserves already selected display instead of rebuilding plain',()=>{
 const {document}=parseHTML('<section><div class="course-line" data-ref="L/t"><div data-col="he">תֵּה</div></div></section>');let opts;
 const ctx=vm.createContext({window:{ReaderMorph:{}},attachReaderMorph:(_root,o)=>{opts=o;return {detach(){}};},roomSaveWord(){}});
 vm.runInContext(block('attachCourseWords','// The open section'),ctx);ctx.attachCourseWords(document.querySelector('section'),{id:'L',scene:{turns:[{id:'t',he:{plain:'תה',niqqud:'תֵּה'},ru:{ru:'чай'}}]}});
 const row=opts.getRowForCell(null,document.querySelector('.course-line'));
 assert.notEqual(opts.plainColumn||'he','he');assert.equal(opts.getVocalizedText(row),'תֵּה');
 document.querySelector('[data-col=he]').textContent='תה';ctx.attachCourseWords(document.querySelector('section'),{id:'L',scene:{turns:[{id:'t',he:{plain:'תה',niqqud:'תֵּה'},ru:{ru:'чай'}}]}});
 assert.equal(opts.getVocalizedText(opts.getRowForCell(null,document.querySelector('.course-line'))),'תה');
});

// Exercise the actual Room dispatcher/remount with the real course reader and
// route codec. Local fixture data only; no browser, network, owner or sync writes.
async function localeEnv(edit) {
 const e=env(),{ctx}=e;
 const code=fs.readFileSync(path.join(__dirname,'../public/js/room-b6-core.js'),'utf8');
 const b6=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const S=require('../public/js/course-store'),C=require('../public/js/course-reader');
 const store=S.memoryStore(),data={};
 const load=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/course/mini',n),'utf8'));
 data['course.json']=load('course.json');data['lexicon.json']=load('lexicon.json');
 for(const id of data['course.json'].lessons)data['lessons/'+id+'.json']=load('lessons/'+id+'.json');
 if(edit)edit(data);
 ctx.window.CourseStore.localStore=()=>store;
 ctx.window.CourseReader={mount(container,opts){
   const gate=e.loadGate;
   const reader=C.factory(e.document).mount(container,{...opts,now:()=>10000,
     fetch:async url=>{if(gate)await gate;return {ok:true,json:async()=>structuredClone(data[url.split('/mini/')[1]])};}});
   e.mounted.push({container,opts,reader});return reader;
 }};
 ctx.corpusNav={corpus:'course:mini'};ctx.roomAtlasReader=null;
 ctx.renderCorpusHub=()=>e.document.querySelector('#roomContent').replaceChildren();
 const history=[];let index=-1;
 ctx.roomCommitPresentation=(mode,{anchor})=>{
   const state=b6.sanitizePresentationState({surface:'corpus',corpus:ctx.corpusNav.corpus,anchor});
   if(mode==='push'||index<0){history.splice(index+1);history.push(state);index++;}else history[index]=state;
   e.states.push([mode,state]);
 };
 vm.runInContext(block('destroyCourseReader','async function renderCourseCorpus'),ctx);
 vm.runInContext(block('renderCorpus','// The open section'),ctx);
 ctx.activeTrack='corpus';
 const listenerStart=source.indexOf("  document.addEventListener('i18n:changed',");
 const listenerEnd=source.indexOf('\n  });',listenerStart)+6;
 vm.runInContext(source.slice(listenerStart,listenerEnd),ctx);
 const locale=async lang=>{e.document.documentElement.lang=lang;const n=e.requests.length;
   e.document.dispatchEvent(new e.document.defaultView.Event('i18n:changed'));
   e.requests[n](null);await new Promise(resolve=>setImmediate(resolve));};
 const render=async()=>{const n=e.requests.length,p=ctx.renderCorpus();e.requests[n](null);await p;};
 const travel=async delta=>{index+=delta;const state=history[index];ctx.corpusNav={corpus:state.corpus};
   ctx.roomCourseAnchor={...state.anchor};
   ctx.roomCoursePosition={...ctx.roomCourseAnchor};await render();};
 return {...e,setLoadGate:gate=>{e.loadGate=gate;},store,render,locale,travel,history,b6,current:()=>history[index]};
}

test('locale remount preserves lesson, step, draft and route without adding history; Back/Forward still work',async()=>{
 const e=await localeEnv();await e.render();
 await e.ctx.roomCourseReader.openLesson('L001-cafe',1);
 const input=e.document.querySelector('[data-course-input]');input.value='תה בלי סוכר';
 input.dispatchEvent(new e.document.defaultView.Event('input'));
 const before=JSON.stringify(e.store.load('mini').progress),url=e.b6.presentationHash(e.current()),count=e.history.length;
 for(const lang of ['he','ru']){
   await e.locale(lang);
   assert.equal(e.document.querySelector('[data-course-input]').value,'תה בלי סוכר');
   assert.equal(e.b6.presentationHash(e.current()),url);
   assert.equal(e.history.length,count);
   assert.equal(JSON.stringify(e.store.load('mini').progress),before);
 }
 assert.equal(e.current().anchor.lessonId,'L001-cafe');assert.equal(e.current().anchor.step,1);
 await e.ctx.roomCourseReader.home();assert.equal(e.history.length,count+1);
 await e.travel(-1);assert.ok(e.document.querySelector('[data-course-input]'));
 await e.travel(1);assert.ok(e.document.querySelector('.course-lessons'));
 const listUrl=e.b6.presentationHash(e.current());await e.render();
 assert.ok(e.document.querySelector('.course-lessons'));assert.equal(e.b6.presentationHash(e.current()),listUrl);
 assert.equal(e.history.length,count+1);
});

test('an explicit history list anchor beats the previous lesson during a remount',async()=>{
 const e=env();e.ctx.roomCoursePosition={lessonId:'L001-cafe',step:3};
 e.ctx.roomCourseAnchor={lessonId:'',step:0};
 const p=e.ctx.renderCourseCorpus('ulpan',1);e.requests[0](null);await p;
 assert.equal(e.document.querySelector('#roomContent').textContent,'home');
});

test('overlapping locale auth remounts preserve pending history anchor; newest navigation wins',async()=>{
 const e=await localeEnv();await e.render();await e.ctx.roomCourseReader.openLesson('L001-cafe',1);
 const old=e.ctx.renderCorpus();
 e.ctx.roomCourseAnchor={lessonId:'L002-cafe-again',step:0};
 e.ctx.roomCoursePosition={...e.ctx.roomCourseAnchor};
 const newer=e.ctx.renderCorpus();
 e.requests[2](null);await newer;e.requests[1](null);await old;
 assert.equal(e.current().anchor.lessonId,'L002-cafe-again');
 assert.equal(e.ctx.roomCourseAnchor,null);
 const stale=e.mounted[0].opts;
 stale.onState({lessonId:'L001-cafe',step:2});
 assert.equal(e.current().anchor.lessonId,'L002-cafe-again');
 const pending=e.ctx.renderCorpus();
 e.ctx.corpusNav={corpus:'hub'};e.ctx.roomCoursePosition=null;e.ctx.roomCourseAnchor=null;
 await e.ctx.renderCorpus();e.requests[3](null);await pending;
 assert.equal(e.ctx.roomCourseReader,null);
 assert.equal(e.document.querySelector('#roomContent').textContent,'');
});


test('a late lesson load from a locale remount cannot restore a reader after leaving the course',async()=>{
 const e=await localeEnv();await e.render();await e.ctx.roomCourseReader.openLesson('L001-cafe',1);
 let release;e.setLoadGate(new Promise(resolve=>{release=resolve;}));
 const pending=e.ctx.renderCorpus();e.requests[1](null);
 await new Promise(resolve=>setImmediate(resolve));
 const old=e.mounted.at(-1).opts,count=e.states.length;
 e.ctx.corpusNav={corpus:'hub'};e.ctx.roomCoursePosition=null;e.ctx.roomCourseAnchor=null;
 await e.ctx.renderCorpus();release();await pending;
 old.onState({lessonId:'L001-cafe',step:1});
 assert.equal(e.states.length,count);assert.equal(e.ctx.roomCourseReader,null);
 assert.equal(e.document.querySelector('#roomContent').textContent,'');
});


test('review route and unsent answer survive locale repaint, reload and Back/Forward',async()=>{
 const plan={id:'plan',version:1,anchorLessonId:'L001-cafe',sessions:[{id:'R00',day:0,kind:'review',title:{ru:'Повтор'},instructions:{ru:'Ответьте'},tasks:[{id:'word',prompt:{ru:'Слово'},key:{ru:'Ответ'},accepts:['קפה'],rubric:[{id:'word',label:{ru:'Слово'},max:1}]}]}]};
 const e=await localeEnv(data=>{data['course.json'].reviewPlan=plan;});
 const E=require('../public/js/course-evidence'),R=require('../public/js/course-review');
 e.store.save(R.ensureAnchor(E.record(E.emptyProgress('mini'),{lessonId:'L001-cafe',lessonVersion:1,task:{id:'seed'},channel:'write_he',input:'x',result:{kind:'unknown'},at:1}).progress,plan));
 await e.render();e.document.querySelector('[data-review-open="R00"]').click();e.document.querySelector('[data-review-start]').click();
 const field=e.document.querySelector('[data-review-input]');assert.ok(field,e.document.querySelector('#roomContent').textContent);field.value='черновик';field.dispatchEvent(new e.document.defaultView.Event('input'));
 const count=e.history.length,url=e.b6.presentationHash(e.current()),run=e.current().anchor.reviewRunId;
 assert.equal(e.current().anchor.reviewSessionId,'R00');assert.ok(run);assert.match(url,/rev=R00/);
 for(const lang of ['he','ru']){await e.locale(lang);assert.equal(e.document.querySelector('[data-review-input]').value,'черновик');assert.equal(e.b6.presentationHash(e.current()),url);assert.equal(e.history.length,count);}
 e.ctx.roomCourseAnchor={...e.b6.presentationStateFromHash(url).anchor};await e.render();assert.equal(e.document.querySelector('[data-review-input]').value,'черновик');assert.equal(e.current().anchor.reviewRunId,run);
 e.document.querySelector('[data-review-home]').click();await new Promise(resolve=>setImmediate(resolve));assert.ok(e.document.querySelector('[data-review-schedule]'));assert.equal(e.history.length,count+1);
 await e.travel(-1);assert.equal(e.document.querySelector('[data-review-input]').value,'черновик');await e.travel(1);assert.ok(e.document.querySelector('[data-review-schedule]'));
});

test('review route sanitizer preserves legacy hashes and rejects unsafe or conflicting review anchors',async()=>{
 const {b6}=await localeEnv();const input={surface:'corpus',corpus:'course:mini',anchor:{reviewSessionId:'R00',reviewRunId:'run-1'}};
 const url=b6.presentationHash(input);assert.match(url,/rev=R00&run=run-1/);assert.equal(b6.presentationStateFromHash(url).anchor.reviewRunId,'run-1');
 assert.equal(b6.presentationHash({...input,anchor:{lessonId:'L001',step:2,reviewSessionId:'R00'}}),'#room=course%3Amini&les=L001&st=2');
 assert.equal(b6.presentationStateFromHash('#room=course%3Amini&rev=%3Cscript%3E&run=x').anchor.reviewSessionId,undefined);
});
