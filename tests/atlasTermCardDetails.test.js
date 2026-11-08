'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../public/js/atlas-words'),RM=require('../public/js/reader-morph'),S=require('../public/js/atlas-search');
test('97001 term header stays compact; page-wide source notes and AI provenance are collapsed and escaped',()=>{
 const term='a97001rc32:term:force',ctx={atlasId:'a97001rc32',purpose:'inspection',terms:{[term]:{lemma_he:'כוח',niqqud:'כּוֹחַ',translit:'koakh',senses:[{sense:'s1',ru:'сила'}],study_note:'Пояснение именно этого термина'}},contextLayerStatus:{covered:new Set(['row']),producer:'producer',coverage_mode:'partial'}};
 const occ={surface:'כוח',sentence_id:'row',atlas_term:{id:term,sense:'s1'},source_context:{page:2,scientific_notes:['Примечание обо всей странице','<img src=x onerror=evil()>'],limits:[{scope:'Не проверять числа'}]}};
 const top=W.cardSourceDetails(W.cardTop(occ,ctx,{}),occ,ctx,{}),html=RM.surfaceTopHtml(top,'ltr');
 assert.deepEqual(top.lines,['сила','Пояснение именно этого термина']);assert(!top.lines.some(l=>l.includes('producer')));
 assert.equal(top.details.length,1);assert(top.details[0].lines.includes('Примечание обо всей странице'));
 assert(html.includes('<details class="rm-surface-details"'));assert(!html.includes('<details open'));assert(html.includes('data-rm-surface-action="show-source"'));assert(!html.includes('<img'));assert(html.includes('&lt;img'));
 const header=html.slice(0,html.indexOf('</section>'));assert(!header.includes('Примечание обо всей странице'));assert(!header.includes('producer'));
});
test('97002 term presentation is preserved without adding 97001 source disclosures',()=>{
 const top={title:'מַסְמֵרָה',lines:['заклёпка'],actions:[{id:'learn-term',label:'Учить этот термин'}]};
 assert.deepEqual(W.cardSourceDetails(top,{source_context:{page:3}},{atlasId:'a97002'},{}),top);
 assert(!RM.surfaceTopHtml(top,'ltr').includes('rm-surface-details'));
});
test('glossary search retains exact semantic table-part source and its scoped canonical form',()=>{
 const id='a97001:term:wheel',make=(sid,lemma,parts)=>({atlas_id:'a97001',id:sid,terms:{[id]:{lemma_he:lemma,niqqud:lemma,senses:[{sense:'s1',ru:'колесо'}]}},pages:[{page:11,items:[],tables:[{id:'table-'+sid,cells:[{he:'מקור',parts}]}]}]});
 const sections=[make('s01-test','неверная форма',[]),make('s02-test','גלגל',[{id:'a97001:p11:part',he:'גלגל',terms:[id+'#s1']}])];
 const ix=S.buildIndex(sections,{knownCommands:[],units:[]}),doc=ix.docs.find(d=>d[0]==='term');
 assert.equal(doc[1],'s02-test');assert.equal(doc[3],'a97001:p11:part');assert.equal(doc[4],'גלגל');
});
test('reviewed source-bound front-matter term has a due fallback place; unreviewed headings remain excluded',()=>{
 const approved='a97001:term:mechanics',held='a97001:term:heading',ref='a97001:p1:b2';
 const section={atlas_id:'a97001',id:'s00-front',activation:{learning_mode:'scoped'},terms:{
  [approved]:{lemma_he:'מכניקה',niqqud:'מֵכָנִיקָה',senses:[{sense:'s1',ru:'механика'}],source_refs:[ref],learning_eligibility:{lexical:{allowed:true}}},
  [held]:{lemma_he:'ספר',senses:[{sense:'s1',ru:'книга'}],source_refs:[ref],training_eligible:false}},
  pages:[{page:1,items:[{id:ref,he:'מכניקה ספר',terms:[approved+'#s1',held+'#s1'],training_eligible:false,term_context_eligible:true,term_context_refs:[approved+'#s1'],learning_eligibility:{schema:'atlas97001.learning-eligibility.1',lexical:{allowed:false},term_context:{allowed:true}}}]}]};
 const bank=require('../scripts/atlas/build-train-bank.cjs').buildTermsIndex([section],'a97001');
 assert.equal(bank.terms[approved].places.s1.block,ref);assert.equal(bank.terms[approved].occurrences.s1.length,1);assert.deepEqual(bank.terms[held].places,{});
});
test('authorial canonical correction/expansion never acquires a source word span through pointed text',()=>{
 const id='a97001:term:carbide',term={lemma_he:'מתכות קשות',niqqud:'מַתָּכוֹת קָשׁוֹת',authorial_normalization:{type:'verified_abbreviation_expansion_for_reading'},senses:[{sense:'s1',ru:'твёрдые сплавы'}]};
 const loc=W.locateBlock({he:'מתק״ש',he_niqqud:'מַתָּכוֹת קָשׁוֹת',terms:[id+'#s1']},{[id]:term},RM);
 assert.deepEqual(loc.he.spans,[]);assert.deepEqual(loc.niqqud.spans,[]);assert.deepEqual(loc.loose,[{id,sense:'s1'}]);
});
test('an ordinary atlas word gets the source disclosure alone, without a fake term header',()=>{
 const html=RM.surfaceTopHtml({title:'',details:[{summary:'Источник и ограничения',lines:['стр. 2'],actions:[{id:'show-source',label:'Показать в книге'}]}]},'ltr');
 assert(html.startsWith('<details class="rm-surface-details"'));assert(!html.includes('rm-surface-top'));assert(!html.includes('rm-surface-title'));
 assert.equal(RM.surfaceTopHtml({title:''},'ltr'),'');
});
test('headword shows learner Latin from its vowel marks and nothing for an unpointed word',()=>{
 const vm=require('vm'),fs=require('fs'),path=require('path'),box={require,console};vm.createContext(box);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/local-translit-bundle.js'),'utf8')+';this.LT=LocalTranslit;',box);
 const had=Object.prototype.hasOwnProperty.call(globalThis,'window'),prev=globalThis.window;
 globalThis.window=Object.assign({},prev||{},{LocalTranslit:box.LT});
 try{
  const html=RM.headTranslitHtml('מְסַפְּקוֹת');
  assert(html.includes('class="rm-head-translit"'));assert(html.includes('dir="ltr"'));assert(html.includes('>mesapkot<'));
  assert(RM.headTranslitHtml('הָאִישׁ').includes('>ha&#039;ish<'));
  assert.equal(RM.headTranslitHtml('מספקות'),'');assert.equal(RM.headTranslitHtml(''),'');
 }finally{ if(had)globalThis.window=prev; else delete globalThis.window; }
});
