'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const W=require('../public/js/atlas-words'),T=require('../public/js/atlas-train'),RM=require('../public/js/reader-morph'),R=require('../public/js/atlas-reader');
function fixture(){
 const id='a97001rc32',term=id+':term:force',held={training_eligible:false,learning_eligibility:{schema:'atlas97001.learning-eligibility.1',lexical:{allowed:false}}};
 const row={...held,id:id+':p124:b1',he:'כוח החומר',he_niqqud:'כּוֹחַ הַחוֹמֶר',ru:'Сила материала',terms:[term+'#force']};
 return {atlas_id:id,id:'s16-test',activation:{learning_mode:'scoped'},terms:{[term]:{training_eligible:false,lemma_he:'כוח',senses:[{sense:'force',ru:'сила'}]}},pages:[{page:124,items:[row,{...row,id:id+':p124:note',kind:'editor_note'}],tables:[{...held,id:id+':p124:t1',title_he:'חומר',cells:[{...held,id:id+':p124:c1',row:0,col:0,rowspan:1,colspan:1,he:'מתכת',ru:'Металл'}]}],figures:[{...held,id:id+':p124:f1',bbox:[0,0,300,200],image:'/fixture.png',caption_he:'חומר'}]}]};
}
// Owner 2026-11-08 (3.11.883): RC3.2 is a full learning corpus. Its reading projection keeps its own keys, and a
// tapped place is a valid learning source; a term held by its own data flags still stays out of the trainer.
test('RC3.2 reading projection gives learning places; held terms stay out of the trainer',()=>{
 const sec=fixture(),before=JSON.stringify(sec),ctx=W.sectionContext(sec.atlas_id,sec,RM,{purpose:'inspection'});
 assert(ctx.items.has('a97001rc32:p124:b1'));assert(ctx.items.has('a97001rc32:p124:c1'));assert(ctx.items.has('a97001rc32:p124:f1:caption'));
 assert(!ctx.items.has('a97001rc32:p124:note'));
 const occ=W.occurrence(ctx,'a97001rc32:p124:b1',0,'כוח','he');assert(occ);assert.equal(occ.inspection_only,undefined);
 const src=W.verifyOccurrence(occ,ctx);assert(src);assert.equal(src.sentenceId,'a97001rc32:p124:b1');assert.equal(src.surface,'כוח');
 assert.deepEqual(T.sectionTermItems(ctx),[]);
 ctx.terms['a97001rc32:term:force'].training_eligible=true;
 assert.deepEqual(T.sectionTermItems(ctx).map(x=>x.key),['at1:a97001rc32:force#force']);
 assert.deepEqual(W.sectionItems(sec),[]);assert.equal(JSON.stringify(sec.pages),JSON.stringify(JSON.parse(before).pages));
});
test('an ordinary word shows its source disclosure, never itself as a term',()=>{
 const sec=fixture(),ctx=W.sectionContext(sec.atlas_id,sec,RM,{purpose:'inspection'});
 const occ=W.occurrence(ctx,'a97001rc32:p124:b1',1,'החומר','he');
 const top=W.cardSourceDetails({title:''},occ,ctx,{});
 assert.equal(top.title,'');assert.equal(top.details.length,1);
 assert(!top.details[0].lines.some(l=>/Словарный просмотр|Технический кандидат/.test(l)));
});
test('inspection cannot accidentally change the lexical contract of other editions',()=>{
 const sec=fixture();sec.atlas_id='a97001';
 assert.deepEqual(W.sectionItems(sec,{purpose:'inspection'}),[]);
 assert.deepEqual(W.sectionItems(sec,'inspection'),[]);
});
test('held RC3.2 source fields receive morphology targets while learning eligibility remains false',()=>{
 const sec=fixture(),{document}=parseHTML('<html></html>'),r=R.factory(document);
 const dom=r.renderSection((_k,f)=>f,sec,{});
 assert(dom.querySelector('[data-ref="a97001rc32:p124:b1"] [data-col="he"]'));
 assert(dom.querySelector('[data-ref="a97001rc32:p124:c1"] [data-col="he"]'));
 assert(dom.querySelector('[data-ref="a97001rc32:p124:f1:caption"] [data-col="he"]'));
 assert.equal(W.learningItem(sec.pages[0].items[0]),false);
});
