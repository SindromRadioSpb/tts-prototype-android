'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),sqlite=require('sqlite3'),crypto=require('node:crypto').webcrypto;
const E=require('../public/js/atlas-progress-export');
const open=()=>new sqlite.Database(':memory:');
const run=(db,sql,p=[])=>new Promise((yes,no)=>db.run(sql,p,e=>e?no(e):yes()));
const all=(db,sql,p=[])=>new Promise((yes,no)=>db.all(sql,p,(e,r)=>e?no(e):yes(r)));
const term='at1:a97001:mass#mechanics',source='atlas-block-v1:a97001:s15-materials-basics:old-revision';
function word(key=term,text=source){return Object.fromEntries(E.wordColumns.map(k=>[k,({lemma_key:key,status:'known',updated_at:'2026-11-03T12:00:00Z',srs_due:'2026-11-08T12:00:00Z',srs_interval:5,srs_reps:3,srs_lapses:1,srs_text_key:text,srs_sentence_id:text?'a97001:p122:b004':null,srs_order_index:116,srs_surface:'מסה',srs_stability:6.4,srs_difficulty:4.3,srs_reviewed_at:'2026-11-03T12:00:00Z',srs_scheme:'fsrs'})[k]??null]));}
function review(key=term,meta={scheduler:{scheme:'fsrs',engine_version:'1',request_retention:0.9},evidence_scope:'recognition'}){return {id:'review:'+key,item_key:key,kind:'review',reviewed_at:'2026-11-03T12:00:00Z',grade:3,source:'atlas-term',channel:'atlas:term',latency_ms:60,meta_json:JSON.stringify(meta)};}
async function schema(db){for(const [name,cols]of [['word_status',E.wordColumns],['review_log',E.reviewColumns]])await run(db,'CREATE TABLE '+name+' ('+cols.map(k=>k+(/^(srs_(interval|reps|lapses|order_index|stability|difficulty)|grade|latency_ms)$/.test(k)?' NUMERIC':' TEXT')).join(',')+')');}
async function insert(db,table,row){const keys=Object.keys(row);await run(db,'INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')',keys.map(k=>row[k]));}
function storage(h=[],s=[]){const data={'room.atlas.find.v1':JSON.stringify(h),'room.atlas.find.stale.v1':JSON.stringify(s)};return {getItem:k=>{assert(Object.hasOwn(data,k),'only two precise storage keys');return data[k];}};}
function adapter(db){return {getOwnershipState:()=> 'shared',dbQuery:(sql,p)=>{assert.equal(sql,E.SQL);assert.equal((sql.match(/SELECT/g)||[]).length,2);assert(!/\b(INSERT|UPDATE|DELETE|PRAGMA|BEGIN|COMMIT|CREATE)\b/.test(sql));return all(db,sql,p);}};}
test('native SQLite capture selects only explicit atlas records, preserves exact fields and never writes',async t=>{
 const db=open();t.after(()=>db.close());await schema(db);
 const skipped={...review(),id:'fixture:skip',kind:'skip'};
 const w=word(),generic=word('מסה:noun'),r=review(),explicit=review('מסה:noun',{text_key:source,sentence_id:'a97001:p122:b004',surface:'מסה'});
 for(const x of [w,generic,word('at1:a97002:mass#mechanics',null),word('foreign',null)])await insert(db,'word_status',x);
 for(const x of [r,explicit,skipped,review('other-book',{token:'DO_NOT_EXPORT'}),review('at1:a97002:mass#mechanics',{password:'DO_NOT_EXPORT'})])await insert(db,'review_log',x);
 const before=[await all(db,'SELECT * FROM word_status'),await all(db,'SELECT * FROM review_log')];
 const h={id:'find:a97001:p178:b003',sid:'s17-steels',...require('../public/js/atlas-train').checkFind({sid:'s17-steels',page:178},{sid:'s17-steels',page:179}),ms:1234,at:12345};
 const out=await E.capture({db:adapter(db),storage:storage([h,{id:'find:a97002:p1:b001',token:'DO_NOT_EXPORT'}],['find:a97001:p122:b004','find:a97002:p1:b001']),crypto});
 assert.deepEqual(out.word_status,[w,generic].sort((a,b)=>a.lemma_key.localeCompare(b.lemma_key)));assert.deepEqual(out.review_log,[r,explicit,skipped].sort((a,b)=>a.id.localeCompare(b.id)));
 assert.deepEqual(out.find_history,[h]);assert.deepEqual(out.find_stale,['find:a97001:p122:b004']);assert(!JSON.stringify(out).includes('DO_NOT_EXPORT'));assert(!JSON.stringify(out).includes('a97002'));
 assert.deepEqual([await all(db,'SELECT * FROM word_status'),await all(db,'SELECT * FROM review_log')],before);
 assert.deepEqual(await E.validate(out,crypto),out);
 const copy=open();t.after(()=>copy.close());await schema(copy);for(const x of out.word_status)await insert(copy,'word_status',x);for(const x of out.review_log)await insert(copy,'review_log',x);
 assert.deepEqual(await all(copy,'SELECT * FROM word_status ORDER BY lemma_key'),out.word_status.slice().sort((a,b)=>a.lemma_key.localeCompare(b.lemma_key)));
 assert.deepEqual(await all(copy,'SELECT * FROM review_log ORDER BY id'),out.review_log.slice().sort((a,b)=>a.id.localeCompare(b.id)));
 assert.equal((await all(copy,'SELECT * FROM word_status')).length,2);assert(!JSON.stringify(await all(copy,'SELECT * FROM word_status')).includes(':s01'),'no parent grade cloned to children');
});
test('export refuses unopened DB and does not initialize a worker or access storage',async()=>{
 let calls=0;await assert.rejects(E.capture({db:{getOwnershipState:()=> 'unknown',dbQuery:()=>{calls++;},initLocalDB:()=>{throw Error('not allowed');}},storage:{getItem:()=>{throw Error('not allowed');}}}),/DB_NOT_OPEN/);assert.equal(calls,0);
});
test('foreign anchors, unsupported metadata and changed history fail closed instead of making a partial file',async()=>{
 for(const row of [review(term,{token:'secret'}),review(term,{scheduler:{scheme:'fsrs',cookie:'secret'}}),review('at1:a97002:mass#mechanics',{text_key:source})]){
  const db={getOwnershipState:()=> 'shared',dbQuery:async()=>[{record_type:'review_log',record_json:JSON.stringify(row)}]};await assert.rejects(E.capture({db,storage:storage(),crypto}),/ATLAS_PROGRESS_/);
 }
 const db={getOwnershipState:()=> 'shared',dbQuery:async()=>[]};let n=0;await assert.rejects(E.capture({db,storage:{getItem:()=>JSON.stringify([++n])},crypto}),/SOURCE_CHANGED/);
});
test('snapshot integrity rejects changes, extra fields and unknown kinds before isolated import',async()=>{
 const s=await E.capture({db:{getOwnershipState:()=> 'shared',dbQuery:async()=>[]},storage:storage(),crypto});
 await assert.rejects(E.validate({...s,word_status:[word()]},crypto),/HASH/);await assert.rejects(E.validate({...s,token:'x'},crypto),/SCHEMA/);
});
