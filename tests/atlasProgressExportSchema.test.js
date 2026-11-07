'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const E=require('../public/js/atlas-progress-export');
const stored=JSON.parse(fs.readFileSync(__dirname+'/fixtures/atlas97001-progress-valid.json','utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
function seal(v){const body={...v};delete body.integrity_sha256;return {...body,integrity_sha256:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};}
const storage={getItem:()=>null};
const capture=rows=>E.capture({db:{getOwnershipState:()=> 'shared',dbAtlasProgressSnapshot:async()=>rows},storage,crypto:crypto.webcrypto});
const record=(kind,row)=>({record_type:kind,record_json:JSON.stringify(row)});
function withMeta(m){const v=clone(stored);v.review_log[0].meta_json=JSON.stringify(m);return seal(v);}
async function rejectBoth(snapshot,label){
 const records=[...snapshot.word_status.map(x=>record('word_status',x)),...snapshot.review_log.map(x=>record('review_log',x))];
 await assert.rejects(capture(records),e=>/^ATLAS_PROGRESS_/.test(e.code),label+' capture');
 // Deliberately construct a correct checksum without calling capture: validate must stand alone.
 await assert.rejects(E.validate(seal(snapshot),crypto.webcrypto),e=>/^ATLAS_PROGRESS_/.test(e.code)&&e.code!=='ATLAS_PROGRESS_HASH',label+' validate');
}
const validMeta={confidence:'exact',status:'known',keyer_version:1,backfill:1,interval:4.5,reps:3,lapses:1,scheme:'sm2',level:'l2',seedAlgoVersion:1,scheduler:{scheme:'fsrs',engine_version:'fsrs6-core-v3',request_retention:0.9},evidence_scope:'recognition',fuzz_days:5,annul_of:'fixture:review',surface:'mass',pos:'noun',text_key:stored.word_status[0].srs_text_key,textKey:stored.word_status[0].srs_text_key,sentence_id:'a97001:p122:b004',sentenceId:'a97001:p122:b004',order_index:116,orderIndex:116,source:{textKey:stored.word_status[0].srs_text_key,sentenceId:'a97001:p122:b004',orderIndex:116,surface:'mass'},postTeach:1,word_only:1,training_stage:'l2',grade_policy_version:'d1.v1',raw_grade:1,effective_grade:2,policy_reason:'production-fail-receptive-strong',grade_policy:'d1.v1',grader:'deterministic',leech_released:1};
test('stored valid snapshot validates independently and capture preserves exact selected values',async()=>{
 assert.deepEqual(await E.validate(stored,crypto.webcrypto),stored);
 const out=await capture([record('word_status',stored.word_status[0]),record('review_log',stored.review_log[0])]);
 assert.deepEqual(out.word_status,stored.word_status);assert.deepEqual(out.review_log,stored.review_log);
 assert.deepEqual(await E.validate(out,crypto.webcrypto),out);
 assert.deepEqual(Object.keys(validMeta).sort(),E.metadataFields.slice().sort(),'every permitted metadata field has positive and negative cases');
 for(const [key,value]of Object.entries(validMeta)){
  const v=withMeta({[key]:value});assert.deepEqual((await E.validate(v,crypto.webcrypto)).review_log,v.review_log,key);
  assert.deepEqual((await capture([record('review_log',v.review_log[0])])).review_log,v.review_log,key);
 }
});
test('regression: nested surface object with synthetic token/foreign material is rejected on both independent paths',async()=>{
 await rejectBoth(withMeta({surface:{token:'SYNTHETIC_NOT_A_SECRET',foreign_material:'a97002'}}),'original counterexample');
});
test('every metadata field rejects incompatible objects, arrays, booleans, null, numeric strings and nonfinite values',async()=>{
 for(const [key,allowed]of Object.entries(validMeta)){
  const bad=[{token:'SYNTHETIC_NOT_A_SECRET'},['a97002'],true,null];
  if(typeof allowed!=='string')bad.push('1');else bad.push(1);
  for(const value of bad)await rejectBoth(withMeta({[key]:value}),key+' '+JSON.stringify(value));
 }
 for(const m of [{surface:JSON.stringify({token:'SYNTHETIC_NOT_A_SECRET'})},{surface:'x'.repeat(1025)},{interval:-1},{reps:1.5},{keyer_version:2},{evidence_scope:'a97002'},{raw_grade:5},{pos:'token-secret'},{source:{surface:'mass'}},{scheduler:{scheme:'fsrs'}},{scheduler:{scheme:'sm2',engine_version:'fsrs6-core-v3'}},{scheduler:{scheme:'fsrs',engine_version:'unknown',request_retention:0.9}}])await rejectBoth(withMeta(m),JSON.stringify(m));
});
test('structured source/scheduler members have strict leaf types and reject foreign atlas/corpus fields',async()=>{
 for(const [key,value]of Object.entries(validMeta.source))for(const bad of [{foreign_material:'a97002'},['a97002'],true,null])await rejectBoth(withMeta({source:{...validMeta.source,[key]:bad}}),'source.'+key);
 for(const [key,value]of Object.entries(validMeta.scheduler))for(const bad of [{token:'SYNTHETIC_NOT_A_SECRET'},['a97002'],true,null])await rejectBoth(withMeta({scheduler:{...validMeta.scheduler,[key]:bad}}),'scheduler.'+key);
 for(const m of [{corpus:'a97002'},{source:{...validMeta.source,atlas_id:'a97002'}},{source:{...validMeta.source,textKey:'atlas-block-v1:a97002:s01-units:x'}},{text_key:'atlas-block-v1:a97002:s01-units:x'},{sentence_id:'a97002:p1:b001'},JSON.parse('{"__proto__":{"token":"synthetic"}}')])await rejectBoth(withMeta(m),'foreign/unknown');
 const v=clone(stored);v.review_log[0].item_key='at1:a97002:mass#mechanics';await rejectBoth(seal(v),'foreign item with own source');
});
test('all row fields have strict scalar/null types; a valid first row never produces a partial export',async()=>{
 for(const table of ['word_status','review_log'])for(const key of Object.keys(stored[table][0]))for(const bad of [{token:'synthetic'},['a97002']]){
  const v=clone(stored);v[table].push({...v[table][0],[key]:bad});await rejectBoth(seal(v),table+'.'+key);
 }
 for(const [table,key,value]of [['word_status','srs_interval',null],['word_status','srs_reps',null],['word_status','srs_lapses',null],['word_status','srs_reps',-1],['word_status','srs_difficulty',11],['word_status','srs_due','2026-02-30T00:00:00Z'],['review_log','latency_ms',1.5],['review_log','grade','3'],['review_log','kind','alias']]){const v=clone(stored);v[table][0][key]=value;await rejectBoth(seal(v),key);}
});
test('validate rejects correctly rehashed foreign/nested header fields and non-JSON objects without using capture',async()=>{
 for(const [key,bad]of [['scope',{token:'synthetic'}],['scope','foreign corpus'],['captured_at',[]],['captured_at','2026-02-30T00:00:00Z'],['atlas_id','a97002'],['word_status',{}],['find_history',[{...stored.find_history[0],ms:{token:'synthetic'}}]],['find_stale',[['a97002']]]])await assert.rejects(E.validate(seal({...clone(stored),[key]:bad}),crypto.webcrypto),e=>/^ATLAS_PROGRESS_/.test(e.code)&&e.code!=='ATLAS_PROGRESS_HASH',key);
 for(const bad of [Infinity,NaN,undefined,()=>{},new Date(),new String('mass')]){const v=clone(stored);v.word_status[0].srs_surface=bad;await assert.rejects(E.validate(v,crypto.webcrypto),/ATLAS_PROGRESS_/);}
 const v=clone(stored);Object.defineProperty(v,'scope',{get(){throw Error('getter must not run');},enumerable:true});await assert.rejects(E.validate(v,crypto.webcrypto),/ATLAS_PROGRESS_SCHEMA/);
});

test('duplicate decoded JSON keys cannot hide a disallowed value in the preserved raw metadata string',async()=>{
 for(const raw of ['{"surface":{"token":"synthetic"},"surface":"mass"}','{"scheduler":{"token":"synthetic"},"scheduler":{"scheme":"sm2"}}','{"surface":{"token":"synthetic"},"surf\\u0061ce":"mass"}'.replace('\\\\u','\\u')]){
  const v=clone(stored);v.review_log[0].meta_json=raw;await rejectBoth(seal(v),'duplicate raw metadata');
 }
 const v=clone(stored);v.review_log[0].meta_json=' { "surface": "a\\"b", "pos": "noun" } ';assert.deepEqual((await E.validate(seal(v),crypto.webcrypto)).review_log,v.review_log);
});
test('history rejects coercion objects/arrays and never silently drops malformed own records',async()=>{
 for(const key of Object.keys(stored.find_history[0]))for(const value of [{token:'synthetic'},[stored.find_history[0][key]]]){
  const v=clone(stored);v.find_history[0][key]=value;await assert.rejects(E.validate(seal(v),crypto.webcrypto),/ATLAS_PROGRESS_/);
  await assert.rejects(E.capture({db:{getOwnershipState:()=> 'shared',dbAtlasProgressSnapshot:async()=>[]},storage:{getItem:k=>k==='room.atlas.find.v1'?JSON.stringify(v.find_history):null},crypto:crypto.webcrypto}),/ATLAS_PROGRESS_/);
 }
});

test('capture never falls back to unguarded dbQuery on an older bridge',async()=>{
 let queries=0;await assert.rejects(E.capture({db:{getOwnershipState:()=> 'shared',dbQuery:()=>{queries++;throw Error('unguarded path');}},storage,crypto:crypto.webcrypto}),/ATLAS_PROGRESS_DB_NOT_OPEN/);assert.equal(queries,0);
});

test('canonical reading-tap provenance labels remain exact, without accepting arbitrary confidence payloads',async()=>{
 for(const confidence of ['exact','likely','guessed','function','unknown','dicta','context','owner','teacher']){
  const v=withMeta({confidence});assert.deepEqual((await E.validate(v,crypto.webcrypto)).review_log,v.review_log);
  assert.deepEqual((await capture([record('review_log',v.review_log[0])])).review_log,v.review_log);
 }
 for(const confidence of [0.9,'made-up',{token:'SYNTHETIC_NOT_A_SECRET'},['exact'],null])await rejectBoth(withMeta({confidence}),'confidence must be a canonical provenance label');
});
