const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseHTML}=require('linkedom');
const S=require('../public/js/course-store');
const R=require('../public/js/course-reader');
const load=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/course/mini',n),'utf8'));
function env(edit){const {document,window}=parseHTML('<html><body><main></main></body></html>');const store=S.memoryStore();const data={'course.json':load('course.json'),'lexicon.json':load('lexicon.json')};for(const id of data['course.json'].lessons)data['lessons/'+id+'.json']=load('lessons/'+id+'.json');if(edit)edit(data);const opts={courseId:'mini',store,fetch:async url=>({ok:true,json:async()=>structuredClone(data[url.split('/mini/')[1]])}),T:(k,fb)=>fb,now:()=>10000};const mount=()=>R.factory(document).mount(document.querySelector('main'),opts);return {document,window,store,opts,mount,data};}
test('registry exposes built-in task types and nothing else',()=>{
 const T=require('../public/js/course-tasks');
 for(const type of ['choice','match','text','cloze','scene'])assert.equal(typeof T.get(type)?.render,'function',type);
 assert.equal(T.get('bogus'),null);
 assert.equal(T.get('constructor'),null);
});
test('registry accepts a new type module without touching the reader',()=>{
 const T=require('../public/js/course-tasks');
 T.register('probe-type',{render(ctx){ctx.body.append(ctx.el('p',{'data-probe':''},'probe'));}});
 assert.equal(typeof T.get('probe-type').render,'function');
});
test('a lesson with an unknown task type is refused at load with an honest message, without throwing',async()=>{
 const e=env(data=>{data['lessons/L001-cafe.json'].tasks[0].type='hologram';});
 const r=e.mount();await r.openLesson('L001-cafe',1);
 assert.equal(e.document.querySelector('[data-course-input]'),null);
 assert.match(e.document.body.textContent,/не удалось загрузить|Урок не удалось/i);
 r.destroy();
});

// --- P8a: tiles ---
const he=(n,p)=>({niqqud:n,plain:p});
function tilesEnv(){return env(d=>{const l=d['lessons/L001-cafe.json'];
 l.tasks.unshift({id:'tl',type:'tiles',channel:['cards'],prompt:{ru:'Соберите: большой кофе'},
  tiles:[he('קָפֶה','קפה'),he('גָּדוֹל','גדול')],distractors:[he('תֵּה','תה')],model:he('קָפֶה גָּדוֹל','קפה גדול'),
  spec:{kind:'order',expect:{drink:'coffee',size:'big'},require:['drink','size']}});});}
const tile=(e,word)=>[...e.document.querySelectorAll('[data-tile]')].find(b=>b.textContent.replace(/[֑-ׇ]/g,'')===word);
test('tiles: tapping builds an RTL answer line and the right order is accepted',async()=>{
 const e=tilesEnv(),r=e.mount();await r.openLesson('L001-cafe',1);
 assert.equal(e.document.querySelector('[data-tiles-answer]').getAttribute('dir'),'rtl');
 assert.equal(e.document.querySelectorAll('[data-tiles-bank] [data-tile]').length,3);
 tile(e,'קפה').click();tile(e,'גדול').click();
 assert.equal(e.document.querySelectorAll('[data-tiles-answer] [data-tile]').length,2);
 e.document.querySelector('[data-course-check]').click();
 const a=e.store.load('mini').progress.attempts.at(-1);
 assert.equal(a.kind,'accepted');assert.equal(a.channel,'cards');
 r.destroy();
});
test('tiles: wrong order is a form error with the order rule, and tapping an answer tile returns it',async()=>{
 const e=tilesEnv(),r=e.mount();await r.openLesson('L001-cafe',1);
 tile(e,'גדול').click();tile(e,'קפה').click();
 e.document.querySelector('[data-course-check]').click();
 assert.equal(e.store.load('mini').progress.attempts.at(-1).kind,'form');
 assert.match(e.document.querySelector('[data-course-feedback]').textContent,/после напитка/);
 e.document.querySelector('[data-tiles-answer] [data-tile]').click();
 assert.equal(e.document.querySelectorAll('[data-tiles-answer] [data-tile]').length,1);
 r.destroy();
});
test('tiles: the built line survives remount and the bank order is stable',async()=>{
 const e=tilesEnv();let r=e.mount();await r.openLesson('L001-cafe',1);
 const order=[...e.document.querySelectorAll('[data-tiles-bank] [data-tile]')].map(b=>b.textContent);
 tile(e,'קפה').click();r.destroy();
 r=e.mount();await r.openLesson('L001-cafe',1);
 assert.equal(e.document.querySelectorAll('[data-tiles-answer] [data-tile]').length,1);
 r.destroy();r=e.mount();await r.openLesson('L001-cafe',1);
 e.document.querySelector('[data-tiles-answer] [data-tile]').click();
 assert.deepEqual([...e.document.querySelectorAll('[data-tiles-bank] [data-tile]')].map(b=>b.textContent),order);
 r.destroy();
});
