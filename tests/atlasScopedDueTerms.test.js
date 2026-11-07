'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../public/js/atlas-train.js');
const {buildTermsIndex}=require('../scripts/atlas/build-train-bank.cjs');
const tid='a97001:term:period',key='at1:a97001:period#technical';
function fixture(){
 const a={lemma_he:'first',niqqud:'FIRST',translit:'first',translit_ru:'первый',senses:[{sense:'technical',ru:'первый смысл'}]};
 const b={lemma_he:'second',niqqud:'SECOND',translit:'second',translit_ru:'второй',senses:[{sense:'technical',ru:'второй смысл'}]};
 return {states:{[key]:{due:5,textKey:'atlas-block-v1:a97001:s02-second:hash',sentenceId:'a97001:p2:b001'}},index:{terms:{[tid]:{...a,places:{technical:{sid:'s01-first',page:1,block:'a97001:p1:b001'}},occurrences:{technical:[{sid:'s01-first',block:'a97001:p1:b001'},{sid:'s02-second',block:'a97001:p2:b001'}]},held_sources:[],scoped_variants:[{sid:'s01-first',canonical:a,source_refs:['a97001:p1:b001'],held_source_ids:[],hold_reasons:[]},{sid:'s02-second',canonical:b,source_refs:['a97001:p2:b001'],held_source_ids:[],hold_reasons:[]}]}}}};
}
const due=x=>T.globalDueItems(x.states,x.index,[],100,10);
test('due display uses exact saved section/reference variant without changing grades',()=>{
 const f=fixture(),before=JSON.stringify(f);const q=due(f);
 assert.equal(q.items.length,1);assert.deepEqual([q.items[0].title,q.items[0].translit,q.items[0].ru],['SECOND','second','второй смысл']);
 assert.equal(JSON.stringify(f),before);
});
test('explicit canonical false excludes old due grade and preserves state',()=>{
 const f=fixture();f.index.terms[tid].training_eligible=false;const before=JSON.stringify(f.states);
 assert.equal(due(f).due,0);assert.equal(JSON.stringify(f.states),before);
});
test('held saved source cannot fall back to another section',()=>{
 const f=fixture();f.index.terms[tid].held_sources=[{sid:'s02-second',source_ref:'a97001:p2:b001'}];
 f.index.terms[tid].occurrences.technical=[{sid:'s01-first',block:'a97001:p1:b001'}];
 assert.equal(due(f).due,0);
});
test('held scoped canonical or source is excluded',()=>{
 for(const kind of ['canonical','source','reasons','variant']){
  const f=fixture(),v=f.index.terms[tid].scoped_variants[1];
  if(kind==='canonical')v.canonical.training_eligible=false;
  if(kind==='source')v.held_source_ids=['a97001:p2:b001'];
  if(kind==='reasons')v.hold_reasons=['unresolved'];
  if(kind==='variant')v.training_eligible=false;
  assert.equal(due(f).due,0,kind);
 }
});
test('unknown scoped reference fails closed rather than using first writer',()=>{
 const f=fixture();f.index.terms[tid].scoped_variants[1].source_refs=[];
 assert.equal(due(f).due,0);assert.equal(due(f).missing,1);
});
test('native occurrence candidate selects exact expression within one section',()=>{
 const f=fixture(),v=f.index.terms[tid].scoped_variants[1];v.source_candidates_are_native=true;
 v.source_candidates=[{canonical:{...v.canonical,niqqud:'EXACT',translit:'exact'},occurrences:[{source_ref:'a97001:p2:b001'}]}];
 assert.equal(due(f).items[0].title,'EXACT');
 v.source_candidates.push({canonical:{...v.canonical,niqqud:'CONFLICT'},occurrences:[{block:'a97001:p2:b001'}]});
 assert.equal(due(f).due,0);assert.equal(due(f).missing,1);
});
test('candidate-wide blocked release survives builder and suppresses existing due grades',()=>{
 const section={id:'s02-second',activation:{release_gate:'blocked'},terms:{[tid]:{lemma_he:'x',senses:[{sense:'technical',ru:'x'}]}},pages:[{page:2,items:[{id:'a97001:p2:b001',type:'block',kind:'prose',terms:[tid+'#technical'],training_eligible:false}]}]};
 const f=fixture();f.index=buildTermsIndex([section],'a97001');
 assert.equal(f.index.terms[tid].training_eligible,false);assert.equal(due(f).due,0);
});
test('legacy index without scoped metadata retains existing saved-place behavior',()=>{
 const f=fixture();delete f.index.terms[tid].scoped_variants;delete f.index.terms[tid].held_sources;
 assert.equal(due(f).items[0].title,'FIRST');assert.equal(due(f).items[0].sid,'s02-second');
});

test('semantic split never reinterprets saved old-sense grade as another source meaning',()=>{
 const f=fixture();f.index.terms[tid].retired_sense_sources=[{sid:'s02-second',source_ref:'a97001:p2:b001',old_sense:'technical',new_sense:'periodic-table-row'}];
 f.index.terms[tid].occurrences.technical=[{sid:'s01-first',block:'a97001:p1:b001'}];const before=JSON.stringify(f.states);
 assert.equal(due(f).due,0);assert.equal(JSON.stringify(f.states),before);
});
