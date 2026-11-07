'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const W=require('../public/js/atlas-words'),T=require('../public/js/atlas-train'),B=require('../scripts/atlas/build-train-bank.cjs'),R=require('../public/js/atlas-reader');
const {parseHTML}=require('linkedom');
const policy=(lexical,find)=>({schema:'atlas97001.learning-eligibility.1',lexical:{allowed:lexical,review_basis:'explicit_source_and_reading_review',target:'name',scoped_fields:['he','ru'],excludes:['atomic_mass']},source_find:{allowed:find,review_basis:'authored_source_bound',scoped_fields:['he']}});
function row(){return {id:'a97001:p8:b1',type:'block',kind:'definition',he:'הכוח פועל על הגוף לאורך קו הפעולה',he_niqqud:'',ru:'Сила действует вдоль линии действия.',training_eligible:false,find_training_eligible:true,structure:{training_eligible:false},learning_eligibility:policy(false,true)};}
function section(item=row()){return {atlas_id:'a97001',id:'s01-fixture',terms:{},pages:[{page:8,items:[item],tables:[],figures:[]}]};}
test('source-find can use exact source text without granting lexical or unknown-numeric practice',()=>{
 const item=row();assert.equal(W.learningItem(item),false);assert.equal(W.learningItem(item,'source_find'),true);assert.equal(W.sectionItems(section(item)).length,0);
 const bank=B.buildFindBank([section(item)],{},'a97001');assert.equal(bank.items.length,1);assert.equal(bank.items[0].he,item.he);assert(!('atomic_mass' in bank.items[0]));assert.equal(bank.items[0].block,item.id);
});
test('explicit scope schema and flags fail closed; legacy holds still work',()=>{
 const item=row();assert.equal(W.learningItem({...item,learning_eligibility:{...item.learning_eligibility,schema:'unknown'}},'source_find'),false);
 assert.equal(W.learningItem({...item,find_training_eligible:false},'source_find'),false);
 assert.equal(W.learningItem({...item,learning_eligibility:undefined},'source_find'),false);
 assert.equal(W.learningItem({...item,learning_eligibility:policy(false,true),training_eligible:true,structure:{} }),false);
});
test('non-learning notes and headings cannot enter source-find through a scope flag',()=>{
 for(const kind of ['editor_note','shared_source_context','heading','footer'])assert.equal(B.buildFindBank([section({...row(),kind})],{},'a97001').items.length,0,kind);
});
test('a duplicate in a held table still prevents an ambiguous find question',()=>{
 const sec=section();sec.pages[0].tables=[{id:'table',training_eligible:false,cells:[{id:'other-place',he:row().he,training_eligible:false}]}];assert.equal(B.buildFindBank([sec],{},'a97001').items.length,0);
 sec.pages[0].tables[0].cells[0].id=row().id;assert.equal(B.buildFindBank([sec],{},'a97001').items.length,1,'same source ID mirrored does not create a second answer');
});
test('held canonical terms never enter a section SRS session from an otherwise eligible row',()=>{
 const id='a97001:term:held',ctx={atlasId:'a97001',items:new Map([['block',{id:'block'}]]),terms:{[id]:{lemma_he:'כוח',senses:[{sense:'technical',ru:'сила'}],training_eligible:false}},located:()=>({he:{spans:[{id,sense:'technical',from:0,to:0}]},loose:[]})};
 assert.deepEqual(T.sectionTermItems(ctx),[]);ctx.terms[id].training_eligible=true;assert.equal(T.sectionTermItems(ctx).length,1);ctx.terms[id].projection_hold_reasons=['normalization_unverified'];assert.deepEqual(T.sectionTermItems(ctx),[]);
});
test('eligible containers do not silently activate unreviewed table titles or figure captions',()=>{
 const sec=section();sec.pages[0].items=[];sec.pages[0].tables=[{id:'t',title_he:'כוח',title_training_eligible:false,cells:[]}];sec.pages[0].figures=[{id:'f',caption_he:'כוח',caption_training_eligible:false}];assert.deepEqual(W.sectionItems(sec),[]);
});
test('source-find-only row remains readable without word-card activation',()=>{
 const {document}=parseHTML('<html></html>'),reader=R.factory(document),sec=section({...row(),source_limit_note:'Огласовка ещё проверяется; поиск использует только текст источника.'});
 const node=reader.renderSection((k,f)=>f,sec,{});assert(node.textContent.includes(row().he));assert.equal(node.querySelectorAll('[data-col]').length,0);assert(node.querySelector('.atlas-source-limit'));
});
test('actual section UI distinguishes held terms from an empty dictionary',async()=>{
 const {document}=parseHTML('<html></html>'),source=fs.readFileSync(require.resolve('../public/js/library-ui.js'),'utf8'),start=source.indexOf('function atlasSectionTermsBlock('),end=source.indexOf('// «Мои термины',start);
 const context={window:{AtlasTrain:T,AtlasWords:W,ReaderMorph:{},AtlasTrainUI:{}},document,ATLAS_SESSION_N:20,Set,Map,Date,localDb:{getAtlasTermStates:async()=>({})},tt:(_k,f)=>f,atlasStageOf:()=>0,el:(tag,o={})=>{const n=document.createElement(tag);if(o.class)n.className=o.class;if(o.text)n.textContent=o.text;for(const[k,v]of Object.entries(o.attrs||{}))n.setAttribute(k,v);return n;}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+';globalThis.build=atlasSectionTermsBlock;',context);const terms={held:{lemma_he:'כוח'}},ctx={atlasId:'a97001',items:new Map(),terms,located:()=>null};const block=context.build(document.createElement('main'),{id:'s01',terms},ctx,{hint:()=>{}});await new Promise(r=>setImmediate(r));assert.match(block.el.textContent,/есть 1 терминов/);assert(!block.el.textContent.includes('терминов нет'));assert(!block.el.textContent.includes('добавьте свои'));
});
test('actual Find open validates source-find rows, not the smaller lexical context',async()=>{
 const source=fs.readFileSync(require.resolve('../public/js/library-ui.js'),'utf8'),start=source.indexOf('function atlasFindOpen('),end=source.indexOf('// P5 G3',start);let flashed=false,stale=false;
 const item=row(),ctx={atlasId:'a97001',sectionId:'s01-fixture',items:new Map()},node={getAttribute:()=>item.id,scrollIntoView:()=>{flashed=true;},classList:{add(){},remove(){}}};
 const sandbox={roomAtlasReader:{openSection:async()=>{}},atlasWordsCtx:ctx,atlasLoadSection:async()=>section(),window:{AtlasWords:W,AtlasTrain:T},document:{querySelectorAll:()=>[node]},atlasFindStale:()=>new Set(),localStorage:{setItem:()=>{stale=true;}},roomToast:()=>{stale=true;},tt:(_k,f)=>f,setTimeout:()=>{},Promise};
 vm.createContext(sandbox);vm.runInContext(source.slice(start,end)+';globalThis.open=atlasFindOpen;',sandbox);sandbox.open({sid:ctx.sectionId,page:8,block:item.id,he:item.he});await new Promise(r=>setImmediate(r));assert.equal(flashed,true);assert.equal(stale,false);assert.equal(ctx.items.size,0);
});
