'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const W=require('../public/js/atlas-words'),T=require('../public/js/atlas-train'),RM=require('../public/js/reader-morph'),R=require('../public/js/atlas-reader');
function fixture(){
 const id='a97001rc32',term=id+':term:force',held={training_eligible:false,learning_eligibility:{schema:'atlas97001.learning-eligibility.1',lexical:{allowed:false}}};
 const row={...held,id:id+':p124:b1',he:'כוח החומר',he_niqqud:'כּוֹחַ הַחוֹמֶר',ru:'Сила материала',terms:[term+'#force']};
 return {atlas_id:id,id:'s16-test',activation:{learning_mode:'scoped'},terms:{[term]:{training_eligible:false,lemma_he:'כוח',senses:[{sense:'force',ru:'сила'}]}},pages:[{page:124,items:[row,{...row,id:id+':p124:note',kind:'editor_note'}],tables:[{...held,id:id+':p124:t1',title_he:'חומר',cells:[{...held,id:id+':p124:c1',row:0,col:0,rowspan:1,colspan:1,he:'מתכת',ru:'Металл'}]}],figures:[{...held,id:id+':p124:f1',bbox:[0,0,300,200],image:'/fixture.png',caption_he:'חומר'}]}]};
}
test('RC3.2 held text, table cells and figure captions are inspectable without becoming learning sources',()=>{
 const sec=fixture(),before=JSON.stringify(sec),ctx=W.sectionContext(sec.atlas_id,sec,RM,{purpose:'inspection'});
 assert(ctx.items.has('a97001rc32:p124:b1'));assert(ctx.items.has('a97001rc32:p124:c1'));assert(ctx.items.has('a97001rc32:p124:f1:caption'));
 assert(!ctx.items.has('a97001rc32:p124:note'));
 const occ=W.occurrence(ctx,'a97001rc32:p124:b1',0,'כוח','he');assert(occ);assert.equal(occ.inspection_only,true);
 assert.equal(W.verifyOccurrence(occ,ctx),null);assert.deepEqual(T.sectionTermItems(ctx),[]);
 assert.deepEqual(W.sectionItems(sec),[]);assert.equal(JSON.stringify(sec),before);
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
