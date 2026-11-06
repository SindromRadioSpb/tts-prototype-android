'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const {window,document}=parseHTML('<html><body></body></html>');
global.window=window;global.document=document;window.indexedDB=undefined;
window.ReaderMorph=require('../public/js/reader-morph.js');require('../public/js/word-gloss-ai.js');
const AI=window.WordGlossAI,AW=require('../public/js/atlas-words.js');
const C=require('../public/js/atlas-context-contract.js'),R=require('../public/js/atlas-reader.js').factory(document);
const copy=x=>JSON.parse(JSON.stringify(x));
const section={atlas_id:'a97001',id:'s01-units',terms:{},pages:[{page:4,items:[{id:'a97001:p4:b001',he:'כוח מסה',he_niqqud:'כוח מסה',ru:'сила масса'}],figures:[{id:'a97001:p4:img01',caption_he:'כוח',caption_ru:'сила',crop:'/scan.png',bbox:[0,0,200,150],regions:[]}],tables:[{id:'a97001:p4:t',title_he:'מידות',title_ru:'величины',cells:[{row:0,col:0,colspan:1,rowspan:1,he:'מסה',ru:'масса'}]}],editor:[],source_limits:[{id:'limit',scope:'Не сертифицировано'}],coverage_notice:{ru:'Частично',he:'חלקי'}}]};
function setup(){const ctx=AW.sectionContext('a97001',section,window.ReaderMorph),rows=AW.glossRows(ctx);return{ctx,rows,expected:C.describe(rows,AI)};}
async function answer(){const {expected}=setup();return{schema:AI.LAYER_SCHEMA,contract:C.CONTRACT,atlas:'a97001',section:section.id,source_revision:await C.revision(expected),coverage_mode:'complete',provenance:{kind:'prepared_ai',producer:'synthetic-test-only',review_scope:'fixture; not a published AI answer'},rows:expected.map(r=>({row_id:r.id,order_index:r.order_index,key:r.key,model:'test',glosses:r.words.map(()=>({gloss:'значение'})),mwe:[]}))};}
async function check(layer,opts={}){const {expected}=setup();return C.validate(layer,expected,{atlas:'a97001',section:section.id,revision:await C.revision(expected),...opts});}

test('context covers blocks, table cells, titles and captions with a visible card and preserved legacy order',()=>{
 const {ctx,rows,expected}=setup();assert.equal(rows.length,4);assert.equal(rows[0].id,'a97001:p4:b001');
 const dom=R.renderSection((k,f)=>f,section,{});
 for(const row of expected){const el=Array.from(dom.querySelectorAll('[data-ref]')).find(x=>x.getAttribute('data-ref')===row.id);assert.ok(el,row.id);assert.ok(el.querySelector('[data-col="he"]'));AW.bindGlossRow(el,ctx);assert.equal(el.__lpLearningRow.id,row.id);assert.equal(el.__lpLearningRow.source_context.limits[0].id,'limit');}
 const old=copy(section);old.atlas_id='a97002';assert.equal(AW.glossRows(AW.sectionContext('a97002',old,window.ReaderMorph)).length,1);
});
test('strict complete contract accepts a coherent fixture and rejects every reported corrupt form',async()=>{
 const valid=await answer();assert.equal((await check(valid)).complete,true);
 const mutations=[l=>l.rows.push(copy(l.rows[0])),l=>l.rows.pop(),l=>l.rows[0].glosses[0].gloss='כוח',l=>l.rows[0].mwe=[{from:0,to:1,gloss:''}],l=>l.rows[0].glosses[0].gloss='',l=>l.rows[0].glosses[0].manual=true,l=>l.rows[0].key='stale',l=>l.source_revision='stale',l=>l.provenance=null,l=>l.rows[0].mwe=[{from:0,to:99,gloss:'неверно'}],l=>l.rows[0].glosses[0].gloss='?'];
 for(const mutate of mutations){const layer=copy(valid);mutate(layer);assert.equal((await check(layer)).ok,false,String(mutate));}
});
test('partial is explicit and cannot claim completeness; uncertain gloss requires its reason',async()=>{
 const layer=await answer();layer.rows.pop();layer.coverage_mode='partial';assert.equal((await check(layer)).ok,false);
 const partial=await check(layer,{allowPartial:true});assert.equal(partial.ok,true);assert.equal(partial.complete,false);assert.equal(partial.missing.length,1);
 layer.rows[0].glosses[0]={gloss:'?',uncertain:true,reason:'Плохо читается источник'};assert.equal((await check(layer,{allowPartial:true})).ok,true);
});
test('source limits and editor evidence participate in revision; old text keys stay stable',async()=>{
 const {rows,expected}=setup(),altered=copy(section);altered.pages[0].source_limits[0].scope='Другое ограничение';
 const next=C.describe(AW.glossRows(AW.sectionContext('a97001',altered,window.ReaderMorph)),AI);
 assert.equal(expected[0].key,next[0].key);assert.notEqual(await C.revision(expected),await C.revision(next));assert.equal(rows[0].order_index,0);
});
test('CLI rejects corrupt layer without writing and accepts an explicit valid subset only with its flag',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-contract-'));
 try{
  fs.mkdirSync(path.join(dir,'sections'));fs.mkdirSync(path.join(dir,'answers'));
  fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify({atlas_id:'a97001',sections:[{id:section.id}]}));
  fs.writeFileSync(path.join(dir,'sections',section.id+'.json'),JSON.stringify(section));
  const dest=path.join(dir,'context-ai',section.id+'.json'),input=path.join(dir,'answers',section.id+'.json');
  function run(extra=[]){return spawnSync(process.execPath,['scripts/atlas/import-context.cjs','--data='+dir,'--answers='+path.join(dir,'answers'),...extra],{encoding:'utf8'});}
  for(const mutate of [l=>l.rows.push(copy(l.rows[0])),l=>l.rows.pop(),l=>l.rows[0].glosses[0].gloss='כוח',l=>l.rows[0].mwe=[{from:0,to:1,gloss:''}]]){
   const layer=await answer();mutate(layer);fs.writeFileSync(input,JSON.stringify(layer));const result=run();assert.notEqual(result.status,0,result.stdout+result.stderr);assert.equal(fs.existsSync(dest),false);
  }
  const partial=await answer();partial.coverage_mode='partial';partial.rows.pop();fs.writeFileSync(input,JSON.stringify(partial));assert.notEqual(run().status,0);
  const result=run(['--allow-partial']);assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(JSON.parse(result.stdout).complete,false);assert.equal(JSON.parse(fs.readFileSync(dest)).coverage_mode,'partial');
  assert.notEqual(run(['--allow-partial']).status,0,'replacement must be explicit');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('retired source example is replaced while due status and original state remain unchanged',()=>{
 const T=require('../public/js/atlas-train.js'),saved={due:100,stability:30,textKey:'atlas-block-v1:a97001:s09-linear-motion:old',sentenceId:'a97001:p68:b004'};
 const before=copy(saved),place={sid:'s06-trusses',page:40,block:'a97001:p40:b002'};
 const index={terms:{'a97001:term:joint':{lemma_he:'פרק',senses:[{sense:'mechanics',ru:'шарнир'}],places:{mechanics:place},occurrences:{mechanics:[place]}}}};
 const q=T.globalDueItems({'at1:a97001:joint#mechanics':saved},index,[],1000,20);assert.equal(q.items[0].block,place.block);assert.deepEqual(saved,before);
});
test('cached AI is gated by current contract; manual correction survives a later accepted import',async()=>{
 AI._mem.clear();const {ctx,rows}=setup(),layer=await answer();await AI.remember(layer,rows);
 const el=document.createElement('div');el.setAttribute('data-ref',rows[0].id);el.innerHTML='<div data-col="he">'+window.ReaderMorph.wrapCellHtml(rows[0].he,null,{})+'</div>';AW.bindGlossRow(el,ctx);
 assert.equal(AI.wordAt(el,0),null,'unvalidated cache is not a published context layer');
 ctx.contextLayerStatus={covered:new Set([rows[0].id])};assert.equal(AI.wordAt(el,0).gloss,'значение');
 await AI.setOccurrenceGloss(el,0,'моя правка');ctx.contextLayerStatus=null;
 assert.equal(AI.wordAt(el,0).gloss,'моя правка');await AI.remember(layer,rows);assert.equal(AI.wordAt(el,0).gloss,'моя правка');
});
test('training dialog focuses its first action after it is mounted, so Escape reaches the dialog',async()=>{
 const UI=require('../public/js/atlas-train-ui.js'),s=UI.termSession(document,{items:[{key:'test',title:'כוח',ru:'сила'}]});
 const button=s.el.querySelector('[data-ts-reveal]');let focusedWhileMounted=false;button.focus=()=>{focusedWhileMounted=s.el.isConnected;};
 document.body.appendChild(s.el);await Promise.resolve();assert.equal(focusedWhileMounted,true);s.el.remove();
});
