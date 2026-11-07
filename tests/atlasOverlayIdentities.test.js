'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const W=require('../public/js/atlas-words'),RM=require('../public/js/reader-morph');
const key='atlas-block-v1:a97001rc32:s:old:structure:verified:term-context';
function fixture(){return {atlas_id:'a97001rc32',id:'s',content_pack_sha256:'new',structure_revision:'new',pages:[{page:1,items:[{id:'b',type:'block',he:'שלום עולם',he_niqqud:'',ru:'',training_eligible:false,terms:[],term_context_eligible:true,learning_eligibility:{schema:'atlas97001.learning-eligibility.1',lexical:{allowed:false},term_context:{allowed:true}}}]}],terms:{},occurrence_compatibility:{purposes:{term_context:{rows:[{id:'b',he:'שלום עולם',he_niqqud:'',ru:'',order_index:19,text_key:key}]}}}};}
test('overlay retains exact old source identity and ordinal while appending new learning places',()=>{
 const s=fixture();s.pages[0].items.unshift({...s.pages[0].items[0],id:'new'});
 const ctx=W.sectionContext('a97001rc32',s,RM,{purpose:'term_context'});
 assert.equal(ctx.order.get('b'),19);assert.equal(ctx.textKeys.get('b'),key);assert(ctx.order.get('new')>19);
 const occurrence=W.occurrence(ctx,'b',0,'שלום','he');
 // No term link means term-context does not authorize this word as a learning target.
 assert.equal(occurrence,null);
 assert.equal(W.sectionContext('a97001rc32',s,RM,{purpose:'inspection'}).textKeys.get('b')===key,false);
});
test('changed source never reuses a prior text key and rejects an old occurrence',()=>{
 const s=fixture();s.pages[0].items[0].he='שלום אחר';const ctx=W.sectionContext('a97001rc32',s,RM,{purpose:'term_context'});
 assert.notEqual(ctx.textKeys.get('b'),key);assert.equal(W.verifyOccurrence({source_kind:'atlas_block',sentence_id:'b',order_index:19,text_key:key,text_id:key,word_offset:0,surface:'שלום'},ctx),null);
});
test('identity map rejects foreign corpus/section keys and duplicate ordinals',()=>{
 for(const bad of ['atlas-block-v1:a97001:s:old','atlas-block-v1:a97001rc32:other:old']){const s=fixture();s.occurrence_compatibility.purposes.term_context.rows[0].text_key=bad;assert.throws(()=>W.sectionContext('a97001rc32',s,RM,{purpose:'term_context'}),/identity/);}
 const s=fixture();s.occurrence_compatibility.purposes.term_context.rows.push({...s.occurrence_compatibility.purposes.term_context.rows[0],id:'other'});assert.throws(()=>W.sectionContext('a97001rc32',s,RM,{purpose:'term_context'}),/compatibility/);
});
test('explicit editorial canonical stays loose in both source columns',()=>{
 const id='a97001rc32:term:editorial',terms={[id]:{lemma_he:'חליפות',niqqud:'חֲלִיפוּת',source_word_span_verified:false}};
 const loc=W.locateBlock({he:'חליפיות',he_niqqud:'חֲלִיפוּת',terms:[id+'#technical']},terms,RM);
 assert.deepEqual(loc.he.spans,[]);assert.deepEqual(loc.niqqud.spans,[]);assert.deepEqual(loc.loose,[{id,sense:'technical'}]);
});
test('a shared caption ID keeps the existing Map position and final representation exactly once',()=>{
 const s=fixture(),first=s.pages[0].items[0];first.ru='block';
 s.pages[0].items.push({...first,id:'other'}, {...first,ru:'caption'});
 s.occurrence_compatibility.purposes.inspection={rows:[{id:'b',he:first.he,he_niqqud:'',ru:'caption',order_index:19,text_key:key}]};
 const ctx=W.sectionContext('a97001rc32',s,RM,{purpose:'inspection'});
 assert.deepEqual([...ctx.items.keys()],['b','other']);assert.equal(ctx.items.get('b').ru,'caption');assert.equal(ctx.order.get('b'),19);assert.equal(ctx.textKeys.get('b'),key);
});
