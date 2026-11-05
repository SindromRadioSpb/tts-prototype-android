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
