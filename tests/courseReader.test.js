const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseHTML}=require('linkedom');
const E=require('../public/js/course-evidence'),S=require('../public/js/course-store');
const C=require('../public/js/course-reader');
const load=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/course/mini',n),'utf8'));
function env(edit){const {document,window}=parseHTML('<html><body><main></main></body></html>');const store=S.memoryStore();const data={'course.json':load('course.json'),'lexicon.json':load('lexicon.json')};for(const id of data['course.json'].lessons)data['lessons/'+id+'.json']=load('lessons/'+id+'.json');if(edit)edit(data);const opts={courseId:'mini',store,fetch:async url=>({ok:true,json:async()=>structuredClone(data[url.split('/mini/')[1]])}),T:(k,fb)=>fb,now:()=>10000};const mount=()=>C.factory(document).mount(document.querySelector('main'),opts);return {document,window,store,opts,mount,data};}
const tick=()=>new Promise(r=>setImmediate(r));
function click(e,s){e.document.querySelector(s).click();}
function input(e,value){const n=e.document.querySelector('[data-course-input]');n.value=value;n.dispatchEvent(new e.window.Event('input'));}
test('sync status remains visible in list and lesson and an attempt schedules upload',async()=>{
 const e=env();let scheduled=0;e.opts.sync={status:'local_only',schedule(){scheduled++;}};
 const r=e.mount();await r.home();assert.match(e.document.querySelector('[data-course-sync-status]').textContent,/Данные на этом устройстве/);
 await r.openLesson('L001-cafe',1);input(e,'תה בלי סוכר');click(e,'[data-course-check]');
 assert.equal(scheduled,1);assert.match(e.document.querySelector('[data-course-sync-status]').textContent,/Данные на этом устройстве/);
 r.setSyncStatus('synced');assert.match(e.document.querySelector('[data-course-sync-status]').textContent,/Сохранено в облаке/);
 r.destroy();
});
test('two open readers retain both attempts in their shared local store',async()=>{
 const e=env(),other=e.document.createElement('main');e.document.body.append(other);
 const a=e.mount(),b=C.factory(e.document).mount(other,e.opts);
 await a.openLesson('L001-cafe',1);await b.openLesson('L001-cafe',1);
 const first=e.document.querySelector('main [data-course-input]');first.value='תה בלי סוכר';first.dispatchEvent(new e.window.Event('input'));
 e.document.querySelector('main [data-course-check]').click();
 const second=other.querySelector('[data-course-input]');second.value='אפשר תה בלי סוכר';second.dispatchEvent(new e.window.Event('input'));
 other.querySelector('[data-course-check]').click();
 assert.equal(e.store.load('mini').progress.attempts.length,2);
 a.destroy();b.destroy();
});
test('due return opens transfer on a new variant and fallback repeats without a promise',async()=>{
 const e=env(data=>{const t=data['lessons/L001-cafe.json'].tasks.find(x=>x.transfer);t.variants=[{id:'counter',prompt:{ru:'Закажите у стойки'},spec:structuredClone(t.spec),model:structuredClone(t.model)}];});
 const l=e.data['lessons/L001-cafe.json'],t=l.tasks.find(x=>x.transfer);
 const first=E.record(E.emptyProgress('mini'),{lessonId:l.id,lessonVersion:l.version,task:t,channel:'write_he',input:'תה',result:{kind:'accepted'},at:0}).progress;
 e.store.save(first);e.opts.now=()=>25*60*60*1000;
 const r=e.mount();await r.home();assert.match(e.document.querySelector('[data-course-return]').textContent,/Новый вариант ситуации/);
 click(e,'[data-course-return]');await tick();assert.match(e.document.querySelector('[data-course-task] h3').textContent,/Закажите у стойки/);
 input(e,'תה בלי סוכר');click(e,'[data-course-check]');
 const attempts=e.store.load('mini').progress.attempts;
 assert.notEqual(attempts.at(-1).fp,attempts[0].fp);
 assert.equal(attempts.at(-1).baseFp,attempts[0].baseFp);
 r.destroy();
 const f=env(),fl=f.data['lessons/L001-cafe.json'],ft=fl.tasks.find(x=>x.transfer);
 f.store.save(E.record(E.emptyProgress('mini'),{lessonId:fl.id,lessonVersion:fl.version,task:ft,channel:'write_he',input:'תה',result:{kind:'accepted'},at:0}).progress);
 f.opts.now=()=>25*60*60*1000;const rr=f.mount();await rr.home();
 assert.match(f.document.querySelector('[data-course-return]').textContent,/Повторить урок/);rr.destroy();
});
test('failed return keeps the same variant available for review',async()=>{
 const e=env(data=>{const t=data['lessons/L001-cafe.json'].tasks.find(x=>x.transfer);t.variants=[
  {id:'first',prompt:{ru:'Первый вариант'},spec:structuredClone(t.spec),model:structuredClone(t.model)},
  {id:'second',prompt:{ru:'Второй вариант'},spec:structuredClone(t.spec),model:structuredClone(t.model)}];});
 const l=e.data['lessons/L001-cafe.json'],t=l.tasks.find(x=>x.transfer);
 let p=E.record(E.emptyProgress('mini'),{lessonId:l.id,lessonVersion:l.version,task:t,channel:'write_he',input:'תה',result:{kind:'accepted'},at:0}).progress;
 const chosen={...t,prompt:t.variants[0].prompt,spec:t.variants[0].spec,model:t.variants[0].model};
 p=E.record(p,{lessonId:l.id,lessonVersion:l.version,task:chosen,baseTask:t,variant:{id:'first'},channel:'write_he',input:'wrong',result:{kind:'mismatch'},at:25*60*60*1000}).progress;
 e.store.save(p);e.opts.now=()=>25*60*60*1000+1000;
 const r=e.mount();await r.home();click(e,'[data-course-return]');await tick();
 assert.match(e.document.querySelector('[data-course-task] h3').textContent,/Первый вариант/);r.destroy();
});
test('home counts and introduction scene use paired Hebrew and stable rows',async()=>{const e=env(),r=e.mount();await r.home();assert.equal(e.document.querySelectorAll('[data-course-lesson]').length,2);assert.match(e.document.body.textContent,/Введено 0/);assert.match(e.document.body.textContent,/Не начат/);await r.openLesson('L001-cafe',0);assert.equal(e.document.querySelectorAll('.course-line').length,8);assert.equal(e.document.querySelector('[data-col=he]').getAttribute('dir'),'rtl');r.destroy();});

test('answer records once; drafts and assistance survive reload',async()=>{const e=env(),r=e.mount();await r.openLesson('L001-cafe',1);input(e,'תֵּה בְּלִי סֻכָּר');click(e,'[data-course-check]');assert.match(e.document.body.textContent,/Смысл передан/);let p=e.store.load('mini').progress;assert.equal(p.attempts.length,1);assert.equal(p.attempts[0].channel,'write_he');assert.equal(p.attempts[0].first,true);click(e,'[data-course-model]');input(e,'אפשר תה בלי סוכר');r.destroy();const r2=e.mount();await r2.openLesson('L001-cafe');assert.equal(e.document.querySelector('[data-course-input]').value,'אפשר תה בלי סוכר');assert.equal(e.document.querySelector('[data-course-model]').getAttribute('aria-expanded'),'true');e.opts.now=()=>12000;click(e,'[data-course-check]');assert.match(e.document.querySelector('details').textContent,/с опорой/);});
test('unknown allows explicit self-check and next',async()=>{const e=env(),r=e.mount();await r.openLesson('L001-cafe',1);input(e,'тэ');click(e,'[data-course-check]');click(e,'[data-course-self]');assert.equal(e.store.load('mini').progress.attempts.at(-1).channel,'self');assert.equal(e.document.querySelector('[data-course-next]').disabled,false);});
test('choice does not reveal solution on first wrong answer; match uses cards',async()=>{const e=env(data=>{const l=data['lessons/L001-cafe.json'];l.tasks=[{id:'choice',type:'choice',channel:['cards'],prompt:{ru:'Выберите'},options:[{id:'a',he:{plain:'תה',niqqud:'תֵּה'}},{id:'b',he:{plain:'קפה',niqqud:'קָפֶה'}}],correctOption:'a'},{id:'match',type:'match',channel:['cards'],prompt:{ru:'Пары'},pairs:[{id:'tea',he:{plain:'תה',niqqud:'תֵּה'},label:{ru:'чай'}},{id:'coffee',he:{plain:'קפה',niqqud:'קָפֶה'},label:{ru:'кофе'}}]}];});const r=e.mount();await r.openLesson('L001-cafe',1);click(e,'[data-option="b"]');assert.match(e.document.querySelector('[data-course-feedback]').textContent,/Попробуйте ещё/);await r.openLesson('L001-cafe',2);assert.equal(e.document.querySelectorAll('.course-match select').length,0);click(e,'[data-match-left="tea"]');click(e,'[data-match-right="tea"]');click(e,'[data-match-left="coffee"]');click(e,'[data-match-right="coffee"]');assert.equal(e.store.load('mini').progress.attempts.at(-1).kind,'accepted');});
test('destroy aborts fetch and suppresses late rendering',async()=>{const e=env();let done,signal;e.opts.fetch=(_url,o)=>{signal=o.signal;return new Promise(r=>done=r)};const r=e.mount(),pending=r.home();r.destroy();assert.equal(signal.aborted,true);done({ok:true,json:async()=>e.data['course.json']});await pending;assert.equal(e.document.querySelector('main').textContent,'');});
test('grammar reference validated and rendered in constrained dialog',async()=>{const F=require('../public/js/course-format');const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.grammar={sugar:{title:{ru:'Без сахара'},body:{ru:'Используйте בלי.'}}};l.tasks[0].grammarRef='sugar';});const l=e.data['lessons/L001-cafe.json'],idx=new Map(e.data['lexicon.json'].entries.flatMap(x=>[[x.id,x],...(x.forms||[]).map(f=>[f.id,f])]));assert.ok(!F.validateLesson(l,idx).some(x=>x.code==='REF_UNKNOWN'));l.tasks[0].grammarRef='missing';assert.ok(F.validateLesson(l,idx).some(x=>x.code==='REF_UNKNOWN'));l.tasks[0].grammarRef='sugar';const r=e.mount();await r.openLesson(l.id,1);click(e,'[data-course-rule]');assert.match(e.document.querySelector('[role=dialog]').textContent,/Используйте/);});

test('cloze and scene use checker; missing model permits skip without false accepted evidence',async()=>{const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.tasks[0].type='cloze';l.tasks[1].type='scene';l.tasks[1].cue={niqqud:'שָׁלוֹם',plain:'שלום'};});const r=e.mount();await r.openLesson('L001-cafe',1);input(e,'תה בלי סוכר');click(e,'[data-course-check]');assert.equal(e.store.load('mini').progress.attempts.at(-1).kind,'accepted');await r.openLesson('L001-cafe',2);input(e,'unknown');click(e,'[data-course-check]');assert.ok(e.document.querySelector('[data-course-skip]'));assert.equal(!!e.document.querySelector('[data-course-self]'),false);click(e,'[data-course-skip]');assert.equal(e.document.querySelector('[data-course-task]').getAttribute('data-course-task'),'10a');});
test('translation assistance, word handle cleanup and visible save failures',async()=>{const e=env();let detached=0;e.opts.onWords=()=>({detach(){detached++;}});e.opts.store={load:()=>({progress:E.emptyProgress('mini')}),save:()=>({ok:false,reason:'quota'})};const r=e.mount();await r.openLesson('L001-cafe',0);assert.equal(e.document.querySelector('[data-course-save-error]').hidden,false);await r.openLesson('L001-cafe',1);assert.equal(detached,1);r.destroy();assert.equal(detached,2);});
test('all reader UI keys are present in all locales',()=>{const vm=require('node:vm');for(const lang of ['ru','en','he']){const context={window:{I18N_LOCALES:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/i18n/locales/'+lang+'.js'),'utf8'),context);const source=['course-reader.js','course-tasks.js','course-scene.js','course-media.js'].filter(f=>fs.existsSync(path.join(__dirname,'../public/js/',f))).map(f=>fs.readFileSync(path.join(__dirname,'../public/js/',f),'utf8')).join(' ');for(const m of source.matchAll(/T\('([^']+)'\s*,/g)){if(m[1].endsWith('.'))continue;let v=context.window.I18N_LOCALES[lang].course;for(const part of m[1].split('.'))v=v?.[part];assert.equal(typeof v,'string',lang+':'+m[1]);}}});

test('choice answer-key revision invalidates prior success and draft',async()=>{
 const e=env(d=>{d['lessons/L001-cafe.json'].tasks=[{id:'c',type:'choice',channel:['cards'],prompt:{ru:'Выберите'},options:[{id:'a',he:{plain:'תה',niqqud:'תֵּה'}},{id:'b',he:{plain:'קפה',niqqud:'קָפֶה'}}],correctOption:'a'}];});
 let r=e.mount();await r.openLesson('L001-cafe',1);click(e,'[data-option="a"]');assert.equal(e.document.querySelector('[data-course-next]').disabled,false);r.destroy();
 e.data['lessons/L001-cafe.json'].version=2;e.data['lessons/L001-cafe.json'].tasks[0].correctOption='b';
 r=e.mount();await r.openLesson('L001-cafe',1);assert.equal(e.document.querySelector('[data-course-next]').disabled,true);assert.equal(e.store.load('mini').progress.reader.tasks['L001-cafe/c']?.input||'','');
});
test('match restores selected, paired and completed cards across remount',async()=>{
 const e=env(d=>{d['lessons/L001-cafe.json'].tasks=[{id:'m',type:'match',channel:['cards'],prompt:{ru:'Пары'},pairs:[{id:'tea',he:{plain:'תה',niqqud:'תֵּה'},label:{ru:'чай'}},{id:'coffee',he:{plain:'קפה',niqqud:'קָפֶה'},label:{ru:'кофе'}}]}];});
 let r=e.mount();await r.openLesson('L001-cafe',1);click(e,'[data-match-left="tea"]');click(e,'[data-match-right="tea"]');click(e,'[data-match-left="coffee"]');r.destroy();
 r=e.mount();await r.openLesson('L001-cafe',1);assert.equal(e.document.querySelector('[data-match-left="tea"]').disabled,true);assert.equal(e.document.querySelector('[data-match-right="tea"]').disabled,true);assert.equal(e.document.querySelector('[data-match-left="coffee"]').getAttribute('aria-pressed'),'true');click(e,'[data-match-right="coffee"]');assert.equal(e.document.querySelector('[data-course-next]').disabled,false);r.destroy();
 r=e.mount();await r.openLesson('L001-cafe',1);assert.equal([...e.document.querySelectorAll('[data-match-left],[data-match-right]')].every(n=>n.disabled),true);assert.equal(e.document.querySelector('[data-course-next]').disabled,false);
});

test('consecutive utterances of the same role stay on the same side',async()=>{const e=env(d=>{d['lessons/L001-cafe.json'].scene.turns[1].role=d['lessons/L001-cafe.json'].scene.turns[0].role;});const r=e.mount();await r.openLesson('L001-cafe',0);const rows=[...e.document.querySelectorAll('.course-line')];assert.equal(rows[0].className,rows[1].className);});
test('UI semantics affect fingerprint but legacy tasks retain exact fingerprint',()=>{assert.equal(E.fingerprint('L001',{id:'legacy',spec:{kind:'repeat'}}),'220ac3e4');for(const [key,a,b]of [['correctOption','a','b'],['options',[{id:'a'}],[{id:'b'}]],['pairs',[{id:'a'}],[{id:'b'}]],['cue',{plain:'תה',niqqud:'תֵּה'},{plain:'קפה',niqqud:'קָפֶה'}]])assert.notEqual(E.fingerprint('L001',{id:'t',[key]:a}),E.fingerprint('L001',{id:'t',[key]:b}),key);});
test('keyboard starts collapsed, edits persist and old keys detach on rerender/destroy',async()=>{const e=env(),r=e.mount();await r.openLesson('L001-cafe',1);assert.equal(e.document.querySelector('[data-course-keyboard]').hidden,true);click(e,'[data-course-keyboard-toggle]');assert.equal(e.document.querySelector('[data-course-keyboard]').hidden,false);const old=e.document.querySelector('[data-course-key="ש"]');old.click();assert.equal(e.store.load('mini').progress.reader.tasks['L001-cafe/'+e.data['lessons/L001-cafe.json'].tasks[0].id].input,'ש');await r.openLesson('L001-cafe',2);assert.equal(e.document.querySelector('[data-course-keyboard]').hidden,true);old.click();assert.equal(e.document.querySelector('[data-course-input]').value,'');const key=e.document.querySelector('[data-course-key="ת"]');r.destroy();key.click();assert.equal(e.document.querySelectorAll('.course-keyboard').length,0);});

test('audio controls require clips, rate survives replay, and home stops audio',async()=>{
 const e=env(),audios=[];class Audio{constructor(src){this.src=src;this.paused=false;this.events={};audios.push(this);}addEventListener(k,f){this.events[k]=f;}removeEventListener(k){delete this.events[k];}play(){return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}}
 const normal=e.opts.fetch;e.opts.AudioCtor=Audio;e.opts.fetch=async url=>url.includes('/audio/')?{ok:true,json:async()=>({'a1-01':'a'.repeat(64)})}:normal(url);
 const r=e.mount();await r.openLesson('L001-cafe',0);assert.equal(e.document.querySelectorAll('[data-course-play]').length,1);
 const rate=e.document.querySelector('[data-course-rate]');rate.querySelector('option[value="0.75"]').selected=true;rate.dispatchEvent(new e.window.Event('change'));
 click(e,'[data-course-play]');await tick();click(e,'[data-course-play]');await tick();assert.ok(audios.every(a=>a.playbackRate===.75));await r.home();assert.equal(audios.at(-1).paused,true);assert.equal(audios.at(-1).src,'');
 const missing=env(),r2=missing.mount();await r2.openLesson('L001-cafe',0);assert.equal(missing.document.querySelectorAll('[data-course-play]').length,0);
});
test('listen requires completed clip; revealing transcript is captured as aid',async()=>{
 const e=env(data=>{const t=data['lessons/L001-cafe.json'].tasks[0];t.channel=['listen'];t.audioTurnId='a1-01';});const audios=[];
 class Audio{constructor(){this.events={};audios.push(this);}addEventListener(k,f){this.events[k]=f;}removeEventListener(k){delete this.events[k];}play(){return Promise.resolve();}pause(){}removeAttribute(){}}
 const normal=e.opts.fetch;e.opts.AudioCtor=Audio;e.opts.fetch=async url=>url.includes('/audio/')?{ok:true,json:async()=>({'a1-01':'a'.repeat(64)})}:normal(url);
 let time=10000;e.opts.now=()=>time;const r=e.mount();await r.openLesson('L001-cafe',1);
 assert.equal(e.document.querySelector('[data-course-transcript]').hidden,true);
 click(e,'[data-course-play]');await tick();input(e,'תה בלי סוכר');click(e,'[data-course-check]');assert.equal(e.store.load('mini').progress.attempts.at(-1).channel,'write_he');
 audios.at(-1).events.ended();time+=2000;click(e,'[data-course-check]');assert.equal(e.store.load('mini').progress.attempts.at(-1).channel,'listen');
 click(e,'[data-course-transcript-toggle]');time+=2000;click(e,'[data-course-check]');assert.equal(e.store.load('mini').progress.attempts.at(-1).aids.transcript,true);
 r.destroy();
});

test('audio stimulus participates in fingerprint and requires a real scene turn',()=>{
 const F=require('../public/js/course-format'),l=load('lessons/L001-cafe.json'),lex=load('lexicon.json');
 const index=new Map(lex.entries.flatMap(e=>[[e.id,e],...(e.forms||[]).map(f=>[f.id,f])]));
 const original=E.fingerprint(l.id,l.tasks[0]);l.tasks[0].audioTurnId='a1-01';assert.notEqual(E.fingerprint(l.id,l.tasks[0]),original);
 assert.equal(F.validateLesson(l,index).filter(i=>i.level==='error').length,0);
 l.tasks[0].audioTurnId='absent';assert.ok(F.validateLesson(l,index).some(i=>i.code==='REF_UNKNOWN'&&i.path.endsWith('.audioTurnId')));
});
test('completed hidden clip supports independent listening; visible introduction is assistance',async()=>{
 for(const intro of [false,true]){
 const e=env(data=>{const t=data['lessons/L001-cafe.json'].tasks[0];t.channel=['listen'];t.audioTurnId='a1-01';}),audios=[];
 class Audio{constructor(){this.events={};audios.push(this);}addEventListener(k,f){this.events[k]=f;}removeEventListener(k){delete this.events[k];}play(){return Promise.resolve();}pause(){}removeAttribute(){}}
 const normal=e.opts.fetch;e.opts.AudioCtor=Audio;e.opts.fetch=async url=>url.includes('/audio/')?{ok:true,json:async()=>({'a1-01':'a'.repeat(64)})}:normal(url);
 const r=e.mount();if(intro)await r.openLesson('L001-cafe',0);await r.openLesson('L001-cafe',1);click(e,'[data-course-play]');await tick();audios.at(-1).events.ended();input(e,'תה בלי סוכר');click(e,'[data-course-check]');
 const attempt=e.store.load('mini').progress.attempts.at(-1);assert.equal(attempt.channel,'listen');assert.equal(E.attemptLevel(attempt),intro?'supported':'independent');r.destroy();
 }
});

test('self-check replaces unknown feedback and stays resolved after reload',async()=>{
 const e=env(),r=e.mount();await r.openLesson('L001-cafe',1);input(e,'тэ');click(e,'[data-course-check]');click(e,'[data-course-self]');
 assert.equal(!!e.document.querySelector('[data-course-self]'),false);
 assert.match(e.document.querySelector('[data-course-feedback]').textContent,/Смысл передан/);
 r.destroy();const again=e.mount();await again.openLesson('L001-cafe',1);
 assert.equal(!!e.document.querySelector('[data-course-self]'),false);
 assert.match(e.document.querySelector('[data-course-feedback]').textContent,/Смысл передан/);
});
test('scene translation stays hidden with room show preference and records only reveal',async()=>{const e=env();e.opts.layers={ruMode:'show'};const r=e.mount();await r.openLesson('L001-cafe',0);assert.ok([...e.document.querySelectorAll('[data-col=ru]')].every(n=>n.hidden));const before=JSON.stringify(e.store.load('mini').progress);click(e,'.course-line button[aria-expanded]');assert.equal(e.document.querySelector('[data-col=ru]').hidden,false);assert.notEqual(JSON.stringify(e.store.load('mini').progress),before);});
test('Russian authored fallback remains LTR in Hebrew shell',async()=>{const e=env();e.document.documentElement.lang='he';const r=e.mount();await r.openLesson('L001-cafe',0);for(const s of ['h2','.course-goal','[data-col=ru]']){assert.equal(e.document.querySelector(s).getAttribute('dir'),'ltr');assert.equal(e.document.querySelector(s).getAttribute('lang'),'ru');}await r.openLesson('L001-cafe',1);assert.equal(e.document.querySelector('.course-step h3').getAttribute('dir'),'ltr');});
test('changed task clears unsubmitted draft model and heard state while preserving evidence history',async()=>{const e=env();let r=e.mount();await r.openLesson('L001-cafe',1);input(e,'תה');click(e,'[data-course-model]');const key='L001-cafe/6';const p=e.store.load('mini').progress;p.reader.tasks[key].heard=true;e.store.save(p);assert.equal(p.attempts.length,0);r.destroy();const seen=JSON.stringify(p.seen);e.data['lessons/L001-cafe.json'].tasks[0].spec={...e.data['lessons/L001-cafe.json'].tasks[0].spec,allowPolite:true};e.data['lessons/L001-cafe.json'].tasks[0].audioTurnId='a1-02';r=e.mount();await r.openLesson('L001-cafe',1);const after=e.store.load('mini').progress;assert.equal(e.document.querySelector('[data-course-input]').value,'');assert.equal(e.document.querySelector('[data-course-model]').getAttribute('aria-expanded'),'false');assert.equal(!!after.reader.tasks[key]?.heard,false);assert.equal(!!after.aids[key]?.model,false);assert.deepEqual(after.attempts,p.attempts);assert.equal(JSON.stringify(after.seen),seen);});


test('P3-F1 defaults full independently of Room and override never persists across surfaces',async()=>{
 const e=env(),values=new Map();e.opts.layers={niqqudMode:'off'};e.opts.storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 let r=e.mount();await r.openLesson('L001-cafe',0);assert.ok(e.document.querySelector('[data-col=he]').textContent.includes('שָׁלוֹם'));
 await r.openLesson('L001-cafe',1);click(e,'[data-course-model]');assert.match(e.document.querySelector('[data-course-model-text]').textContent,/תֵּה/);
 const select=e.document.querySelector('[data-course-niqqud-override]');select.querySelector('[value=never]').selected=true;select.dispatchEvent(new e.window.Event('change'));
 assert.equal(values.get('course.mini.niqqudOverride'),'never');assert.match(e.document.querySelector('[data-course-model-text]').textContent,/סוכר/);assert.doesNotMatch(e.document.querySelector('[data-course-model-text]').textContent,/[\u0591-\u05BD\u05BF-\u05C7]/);
 r.destroy();r=e.mount();await r.openLesson('L001-cafe',0);assert.equal(e.document.querySelector('[data-col=he]').textContent,'שלום.');
});
test('P3-F1 new vocalizes introduced units and preserves full spelling/punctuation',async()=>{
 const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.niqqud='new';l.introduces={active:['lx.coffee'],receptive:[]};l.scene.turns[0].he={niqqud:'אֶפְשָׁר קָפֶה, סֻכָּר?',plain:'אפשר קפה, סוכר?'};});
 const r=e.mount();await r.openLesson('L001-cafe',0);assert.equal(e.document.querySelector('[data-col=he]').textContent,'אפשר קָפֶה, סוכר?');
});
test('P3-F1 tap exposes row with keyboard without recording an answer',async()=>{
 const e=env(d=>d['lessons/L001-cafe.json'].niqqud='tap'),r=e.mount();await r.openLesson('L001-cafe',0);const n=e.document.querySelector('[data-col=he]');assert.equal(n.textContent,'שלום.');assert.equal(n.getAttribute('tabindex'),'0');n.click();assert.equal(n.textContent,'שָׁלוֹם.');assert.equal(e.store.load('mini').progress.attempts.length,0);
});
test('P3-F1 niqqud mode validated',()=>{const F=require('../public/js/course-format'),e=env(),l=e.data['lessons/L001-cafe.json'];const idx=new Map(e.data['lexicon.json'].entries.flatMap(x=>[[x.id,x],...(x.forms||[]).map(f=>[f.id,f])]));for(const mode of ['full','new','tap']){l.niqqud=mode;assert.equal(F.validateLesson(l,idx).some(i=>i.path==='niqqud'),false);}l.niqqud='off';assert.ok(F.validateLesson(l,idx).some(i=>i.path==='niqqud'&&i.level==='error'));});

test('P3-F1 never/full is unified for choice match text and grammar',async()=>{
 const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.text={id:'txt',paras:[{id:'p',he:{plain:'סוכר',niqqud:'סֻכָּר'},ru:{ru:'сахар'}}]};l.grammar={g:{title:{ru:'Правило'},body:{ru:'Текст'},pattern:[{plain:'סוכר',niqqud:'סֻכָּר'}]}};l.tasks=[{id:'c',type:'choice',channel:['cards'],prompt:{ru:'Выберите'},grammarRef:'g',options:[{id:'s',he:{plain:'סוכר',niqqud:'סֻכָּר'}}],correctOption:'s'},{id:'m',type:'match',channel:['cards'],prompt:{ru:'Пары'},pairs:[{id:'s',he:{plain:'סוכר',niqqud:'סֻכָּר'},label:{ru:'сахар'}}]}];});
 const values=new Map([['course.mini.niqqudOverride','never']]);e.opts.storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};const r=e.mount();
 await r.openLesson('L001-cafe',1);assert.equal(e.document.querySelector('[data-col=he]').textContent,'סוכר');
 await r.openLesson('L001-cafe',2);assert.equal(e.document.querySelector('[data-option]').textContent,'סוכר');click(e,'[data-course-rule]');assert.equal(e.document.querySelector('.course-grammar [lang=he]').textContent,'סוכר');
 await r.openLesson('L001-cafe',3);assert.equal(e.document.querySelector('[data-match-left]').textContent,'סוכר');
 const select=e.document.querySelector('[data-course-niqqud-override]');select.querySelector('[value=always]').selected=true;select.dispatchEvent(new e.window.Event('change'));assert.equal(e.document.querySelector('[data-match-left]').textContent,'סֻכָּר');
});
test('P3-F1 new recognizes introduced forms and multiword phrases without stripping plain',async()=>{
 const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.niqqud='new';l.introduces={active:['lx.sugar','lx.school'],receptive:[]};d['lexicon.json'].entries.push({id:'lx.school',pos:'noun',he:{niqqud:'בֵּית סֵפֶר',plain:'בית ספר'},translit_ru:'бейт сефер',gloss:{ru:'школа'}});l.scene.turns[0].he={niqqud:'בֵּית סֵפֶר, סֻכָּר וְקָפֶה',plain:'בית ספר, סוכר וקפה'};});const r=e.mount();await r.openLesson('L001-cafe',0);assert.equal(e.document.querySelector('[data-col=he]').textContent,'בֵּית סֵפֶר, סֻכָּר וקפה');
});
test('P3-F1 tap first reveals choices without selecting and keyboard reveals rows',async()=>{
 const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.niqqud='tap';l.tasks=[{id:'c',type:'choice',channel:['cards'],prompt:{ru:'Выберите'},options:[{id:'s',he:{plain:'סוכר',niqqud:'סֻכָּר'}}],correctOption:'s'}];});let attached=0;e.opts.onWords=()=>{attached++;return {detach(){}}};const r=e.mount();await r.openLesson('L001-cafe',0);const row=e.document.querySelector('[data-col=he]'),event=new e.window.Event('keydown');event.key='Enter';row.dispatchEvent(event);assert.equal(row.textContent,'שָׁלוֹם.');assert.equal(attached,2);
 await r.openLesson('L001-cafe',1);click(e,'[data-option]');assert.equal(e.document.querySelector('[data-option]').textContent,'סֻכָּר');assert.equal(e.store.load('mini').progress.attempts.length,0);click(e,'[data-option]');assert.equal(e.store.load('mini').progress.attempts.length,1);
});
