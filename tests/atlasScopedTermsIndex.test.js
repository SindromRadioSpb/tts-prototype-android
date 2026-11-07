'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildTermsIndex} = require('../scripts/atlas/build-train-bank.cjs');
const id='a97001:term:period';
function fixtures() {
 return [
  {id:'s11-circular-motion',terms:{[id]:{lemma_he:'זמן מחזור',niqqud:'זְמַן מַחְזוֹר',translit:'Zman makhzor',translit_ru:'зман махзор',definition_refs:['p92:definition'],senses:[{sense:'technical',ru:'период'}]}},pages:[{page:92,items:[{id:'p92:definition',type:'block',kind:'prose',he:'זמן מחזור',terms:[id+'#technical']}]}]},
  {id:'s15-materials-basics',terms:{[id]:{lemma_he:'מספר מחזורי',niqqud:'מִסְפָּר מַחֲזוֹרִי',translit:'Mispar makhazori',translit_ru:'миспар махазори',definition_refs:['p116:definition'],senses:[{sense:'periodic-table-row',ru:'номер периода'}],training_eligible:false,projection_hold_reasons:['fixture_hold']}},pages:[{page:116,items:[{id:'p116:definition',type:'block',kind:'prose',he:'מספר מחזורי',terms:[id+'#periodic-table-row'],training_eligible:false,projection_held_terms:[id]}]}],term_projection:{held_source_ids:['p116:definition'],evidence:{[id]:[{scope:{section:'s15-materials-basics',package:'fixture'},canonical:{lemma_he:'מספר מחזורי',senses:[{sense:'periodic-table-row',ru:'номер периода'}]},occurrences:[{source_ref:'p116:definition'}]}]}}}
 ];
}
test('a97001 index unions definitions and distinct senses without replacing legacy lexical fields',()=>{
 const input=fixtures(),before=JSON.stringify(input),out=buildTermsIndex(input,'a97001').terms[id];
 assert.equal(JSON.stringify(input),before);
 assert.equal(out.lemma_he,'זמן מחזור');
 assert.deepEqual(out.definition_refs,['p92:definition','p116:definition']);
 assert.deepEqual(out.senses.map(s=>s.sense),['technical','periodic-table-row']);
 assert.equal(out.canonical_selection,'legacy_first_section_with_scoped_variants');
 assert.equal(out.has_scoped_variants,true);
 assert.equal(out.scoped_variants.length,2);
 assert.equal(out.scoped_variants[1].canonical.lemma_he,'מספר מחזורי');
 assert.equal(out.scoped_variants[1].source_candidates[0].scope.package,'fixture');
 assert.deepEqual(out.held_sources,[{sid:'s15-materials-basics',source_ref:'p116:definition',reasons:['fixture_hold']}]);
 assert.deepEqual(JSON.parse(JSON.stringify(out)),out);
});
test('same-sense different scoped Russian gloss is preserved without silent overwrite',()=>{
 const ss=fixtures();ss[1].terms[id].senses=[{sense:'technical',ru:'контекстный перевод'}];
 const out=buildTermsIndex(ss,'a97001').terms[id];
 assert.equal(out.senses[0].ru,'период');
 assert.equal(out.scoped_variants[1].canonical.senses[0].ru,'контекстный перевод');
 assert.equal(out.has_scoped_variants,true);
});
test('table and figure descendants retain source and hold metadata',()=>{
 const ss=fixtures();ss[0].pages[0].tables=[{id:'table',cells:[{id:'cell',terms:[id+'#technical'],training_eligible:false}]}];
 ss[0].pages[0].figures=[{id:'figure',labels:[{id:'label',terms:[id+'#technical']}]}];
 const out=buildTermsIndex(ss,'a97001').terms[id];
 assert.ok(out.scoped_variants[0].source_refs.includes('cell'));
 assert.ok(out.scoped_variants[0].source_refs.includes('label'));
 assert.ok(out.held_sources.some(s=>s.source_ref==='cell'));
});
test('other atlas serialization remains unchanged',()=>{
 const s={id:'s',terms:{t:{lemma_he:'x',senses:[{sense:'sense',ru:'r'}]}},pages:[]};
 assert.deepEqual(buildTermsIndex([s],'a97002'),{schema:'linguistpro.atlas-train-terms.1.0.0',atlas_id:'a97002',terms:{t:{lemma_he:'x',niqqud:'',translit:'',translit_ru:'',senses:[{sense:'sense',ru:'r'}],sections:['s'],places:{}}}});
});
test('repeated build is deterministic and output is not aliased to source',()=>{
 const ss=fixtures(),a=buildTermsIndex(ss,'a97001'),b=buildTermsIndex(ss,'a97001');
 assert.deepEqual(a,b);a.terms[id].scoped_variants[1].canonical.senses[0].ru='mutated';
 assert.notEqual(ss[1].terms[id].senses[0].ru,'mutated');
});
test('index records exact old-sense source retirement without changing current sense keys',()=>{
 const ss=fixtures();ss[1].term_projection.semantic_corrections=[{term_id:id,old:{sense:'technical'},new:{sense:'periodic-table-row'},source_targets:['p116:definition']}];
 const out=buildTermsIndex(ss,'a97001').terms[id];
 assert.deepEqual(out.retired_sense_sources,[{sid:'s15-materials-basics',source_ref:'p116:definition',old_sense:'technical',new_sense:'periodic-table-row'}]);
 assert.deepEqual(out.senses.map(s=>s.sense),['technical','periodic-table-row']);
});
