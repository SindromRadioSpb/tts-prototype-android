const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseHTML}=require('linkedom');
const S=require('../public/js/course-store'),R=require('../public/js/course-reader');
const load=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/course/mini',n),'utf8'));
const he=(n,p)=>({niqqud:n,plain:p});
const media=(id,target,extra={})=>({id,kind:'image',target,purpose:{ru:'смысл'},brief:{ru:'бриф'},alt:{ru:'Описание '+id},aspect:'4:3',fallback:{ru:{ru:'Запасная карточка '+id}},...extra});
function env(edit){const {document,window}=parseHTML('<html><body><main></main></body></html>');const store=S.memoryStore();const data={'course.json':load('course.json'),'lexicon.json':load('lexicon.json')};for(const id of data['course.json'].lessons)data['lessons/'+id+'.json']=load('lessons/'+id+'.json');if(edit)edit(data);
 const opts={courseId:'mini',store,fetch:async url=>{const k=url.split('/mini/')[1];return k in data?{ok:true,json:async()=>structuredClone(data[k])}:{ok:false,json:async()=>null};},T:(k,fb)=>fb,now:()=>10000};
 return {document,window,store,opts,data,mount:()=>R.factory(document).mount(document.querySelector('main'),opts)};}
const M=()=>require('../public/js/course-media');
test('figure: lazy image with alt and reserved aspect ratio',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 const f=M().figure(media('m1','sc',{src:'abc.png'}),{base:'/data/course/mini/',doc:document});
 const img=f.querySelector('img');
 assert.equal(img.getAttribute('loading'),'lazy');assert.equal(img.getAttribute('decoding'),'async');
 assert.equal(img.getAttribute('alt'),'Описание m1');assert.equal(img.getAttribute('src'),'/data/course/mini/media/abc.png');
 assert.match(f.getAttribute('style'),/aspect-ratio:\s*4\s*\/\s*3/);
});
test('figure: reduced motion shows the last frame of a sequence and never animates',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 const f=M().figure(media('s','sc',{kind:'sequence',frames:['a.png','b.png','c.png']}),{base:'/b/',doc:document,reducedMotion:true});
 assert.equal(f.querySelectorAll('img').length,1);
 assert.equal(f.querySelector('img').getAttribute('src'),'/b/media/c.png');
});
test('figure: a decorative image that fails to load disappears without alt text; an essential one shows its fallback',()=>{
 const {document,window}=parseHTML('<html><body></body></html>');
 const deco=M().figure(media('d','sc',{src:'x.png'}),{base:'/b/',doc:document});document.body.append(deco);
 deco.querySelector('img').dispatchEvent(new window.Event('error'));
 assert.equal(deco.hidden,true);
 const need=M().figure(media('n','sc',{src:'x.png'}),{base:'/b/',doc:document,essential:true});document.body.append(need);
 need.querySelector('img').dispatchEvent(new window.Event('error'));
 assert.match(need.textContent,/Запасная карточка n/);assert.equal(need.querySelector('img'),null);
});
test('figure: an unfilled essential slot shows its fallback; an unfilled decorative slot renders nothing',()=>{
 const {document}=parseHTML('<html><body></body></html>');
 assert.equal(M().figure(media('e','sc'),{base:'/b/',doc:document}),null);
 assert.match(M().figure(media('e','sc'),{base:'/b/',doc:document,essential:true}).textContent,/Запасная карточка e/);
});
function orderEnv(){return env(d=>{const l=d['lessons/L001-cafe.json'];
 l.media=[media('card',l.scene.id,{src:'card.png'}),media('ti',l.tasks[0].id,{src:'t.png'})];
 l.tasks.unshift({id:'or',type:'order',channel:['write_he'],prompt:{ru:'Закажите то, что на карточке'},card:{drink:'tea',sugar:'without'},cardMedia:'card',
  model:he('אֶפְשָׁר תֵּה בְּלִי סֻכָּר','אפשר תה בלי סוכר'),spec:{kind:'order',expect:{drink:'tea',sugar:'without'},require:['drink','sugar']}});});}
test('order: a broken card image falls back to words and the answer is still checked',async()=>{
 const e=orderEnv(),r=e.mount();await r.openLesson('L001-cafe',1);
 const fig=e.document.querySelector('[data-course-order-card] [data-media="card"]');
 fig.querySelector('img').dispatchEvent(new e.window.Event('error'));
 assert.match(e.document.querySelector('[data-course-order-card]').textContent,/Запасная карточка card/);
 const field=e.document.querySelector('[data-course-input]');field.value='אֶפְשָׁר תֵּה בְּלִי סֻכָּר';field.dispatchEvent(new e.window.Event('input'));
 e.document.querySelector('[data-course-check]').click();
 assert.equal(e.store.load('mini').progress.attempts.at(-1).kind,'accepted');
 r.destroy();
});
test('order: without card media the card lists slot values in words',async()=>{
 const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.tasks.unshift({id:'or',type:'order',channel:['write_he'],prompt:{ru:'Закажите'},card:{drink:'tea',sugar:'without'},spec:{kind:'order',expect:{drink:'tea',sugar:'without'},require:['drink','sugar']}});});
 const r=e.mount();await r.openLesson('L001-cafe',1);
 const l=e.data['lessons/L001-cafe.json'];const label=(s,k)=>l.slots.find(x=>x.id===s).values.find(v=>v.key===k).label.ru;
 const txt=e.document.querySelector('[data-course-order-card]').textContent;
 assert.ok(txt.includes(label('drink','tea'))&&txt.includes(label('sugar','without')),txt);
 r.destroy();
});
test('media with a task target stands before that task prompt',async()=>{
 const e=orderEnv(),r=e.mount();await r.openLesson('L001-cafe',2);
 const step=e.document.querySelector('[data-course-task]');
 const fig=step.querySelector('[data-media="ti"]'),h3=step.querySelector('h3');
 assert.ok(fig&&h3);assert.ok(fig.compareDocumentPosition(h3)&4,'figure precedes prompt');
 r.destroy();
});
test('match pairs with media render pictures with alt text',async()=>{
 const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.media=[media('tea',l.scene.id,{src:'tea.png'})];
  l.tasks.unshift({id:'mt',type:'match',channel:['cards'],prompt:{ru:'Сопоставьте'},pairs:[{id:'p1',he:he('תֵּה','תה'),media:'tea'}]});});
 const r=e.mount();await r.openLesson('L001-cafe',1);
 assert.equal(e.document.querySelector('[data-match-right="p1"] img').getAttribute('alt'),'Описание tea');
 r.destroy();
});
test('grammar micro-card shows the line with highlighted slot groups and their labels',async()=>{
 const e=env(d=>{const l=d['lessons/L001-cafe.json'];l.grammar={g:{title:{ru:'Прилагательное после'},body:{ru:'Сначала что, потом какой.'},
  line:{he:he('קָפֶה גָּדוֹל','קפה גדול'),slots:[{from:0,to:0,label:{ru:'что'}},{from:1,to:1,label:{ru:'какой'}}]}}};
  l.flow=[{id:'p',title:{ru:'Ч'},steps:[{kind:'grammar',ref:'g'}]}];});
 const r=e.mount();await r.openLesson('L001-cafe',0);
 const card=e.document.querySelector('[data-course-microcard]');
 assert.equal(card.querySelectorAll('[data-slot]').length,2);
 assert.match(card.textContent,/что/);assert.match(card.textContent,/какой/);
 assert.equal(card.querySelector('[data-microcard-line]').getAttribute('dir'),'rtl');
 r.destroy();
});
test('course media files are served immutable',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const route=server.match(/app\.use\(['"]\/data\/course['"][\s\S]*?\}\)\);/)[0];
 assert.match(route,/media[\s\S]*immutable/);
});
