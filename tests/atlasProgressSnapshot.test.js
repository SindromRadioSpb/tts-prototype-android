'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),sqlite=require('sqlite3'),fs=require('node:fs');
const E=require('../public/js/atlas-progress-export'),valid=require('./fixtures/atlas97001-progress-valid.json');
const all=(db,sql,p=[])=>new Promise((yes,no)=>db.all(sql,p,(e,r)=>e?no(e):yes(r)));
async function fixture(t){
 const db=new sqlite.Database(':memory:');t.after(()=>new Promise(resolve=>db.close(resolve)));
 let active=false,rollbacks=0,queries=0;
 const exec=sql=>new Promise((yes,no)=>db.exec(sql,e=>{if(e)return no(e);if(/\bBEGIN\b/i.test(sql))active=true;if(/\b(COMMIT|ROLLBACK)\b/i.test(sql))active=false;if(/\bROLLBACK\b/i.test(sql))rollbacks++;yes();}));
 for(const [name,cols]of [['word_status',E.wordColumns],['review_log',E.reviewColumns]])await exec('CREATE TABLE '+name+' ('+cols.map(c=>c+' '+(/^(srs_(interval|reps|lapses|order_index|stability|difficulty)|grade|latency_ms)$/.test(c)?'NUMERIC':'TEXT')).join(',')+')');
 const insert=async(table,row)=>{const cols=Object.keys(row);await all(db,'INSERT INTO '+table+' ('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')',Object.values(row));};
 const {OperationLease}=await import('../public/db/operation-lease.js');
 const lease=new OperationLease({locks:{request(){}},requiresExternalLock:()=>false,keepConnectionOpen:()=>true,open:async()=>{},close:async()=>{},inTransaction:()=>active,rollback:()=>exec('ROLLBACK')});
 const helper=await import('../public/db/atlas-progress-snapshot.js');assert.equal(helper.SQL,E.SQL);
 const api={inTransaction:()=>active,query:async(sql,params)=>{assert.equal(sql,E.SQL);queries++;return all(db,sql,params);}};
 const read=()=>lease.run(()=>helper.readCommittedAtlasProgress(api),{requireCommitted:true});
 t.after(()=>clearTimeout(lease.timer));
 return {db,lease,api,exec,insert,read,active:()=>active,rollbacks:()=>rollbacks,queries:()=>queries};
}
test('interleaved BEGIN/INSERT/export/ROLLBACK rejects dirty history and retry sees only committed rows',async t=>{
 const f=await fixture(t);
 await f.lease.run(async()=>{await f.lease.ensureOpen();await f.exec('BEGIN');},{sql:'BEGIN'});
 await f.lease.run(()=>f.insert('review_log',valid.review_log[0]),{sql:'INSERT INTO review_log'});
 assert.equal((await all(f.db,'SELECT * FROM review_log')).length,1,'native SQLite really contains an uncommitted review');
 const timer=f.lease.timer,lastActivity=f.lease.lastTransactionActivity;
 const capture=f.read(),rollback=f.lease.run(()=>f.exec('ROLLBACK'),{sql:'ROLLBACK'});
 await assert.rejects(capture,{code:'ATLAS_PROGRESS_TRANSACTION_ACTIVE'});await rollback;
 assert.equal(f.queries(),0,'export refused before querying');assert.equal(f.rollbacks(),1,'only caller rollback');
 assert.deepEqual(await f.read(),[]);assert.equal((await all(f.db,'SELECT * FROM review_log')).length,0);
 assert(timer);assert(lastActivity>0);
});
test('reject between review INSERT and projection UPDATE, then accept complete committed snapshot',async t=>{
 const f=await fixture(t);
 await f.lease.run(async()=>{await f.lease.ensureOpen();await f.exec('BEGIN');},{sql:'BEGIN'});
 await f.lease.run(()=>f.insert('review_log',valid.review_log[0]),{sql:'INSERT INTO review_log'});
 await assert.rejects(f.read(),{code:'ATLAS_PROGRESS_TRANSACTION_ACTIVE'});
 assert.equal(f.active(),true);assert.equal(f.rollbacks(),0);
 await f.lease.run(()=>f.insert('word_status',valid.word_status[0]),{sql:'INSERT INTO word_status'});
 await f.lease.run(()=>f.exec('COMMIT'),{sql:'COMMIT'});
 const rows=await f.read();assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.record_type==='review_log').length,1);assert.equal(rows.filter(r=>r.record_type==='word_status').length,1);
 assert.equal(f.active(),false);assert.equal(f.rollbacks(),0);
});
test('one worker lease holds the full snapshot against a queued writer; exporter never issues transaction SQL',async t=>{
 const f=await fixture(t);let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let writerStarted=false;
 f.api.query=async(sql,p)=>{assert.equal(sql,E.SQL);entered();await gate;return all(f.db,sql,p);};
 const reading=f.lease.run(async()=>{await f.lease.ensureOpen();return (await import('../public/db/atlas-progress-snapshot.js')).readCommittedAtlasProgress(f.api);},{requireCommitted:true});
 await started;
 const writer=f.lease.run(async()=>{writerStarted=true;await f.exec('BEGIN');await f.insert('review_log',valid.review_log[0]);await f.insert('word_status',valid.word_status[0]);await f.exec('COMMIT');},{sql:'BEGIN; INSERT INTO review_log; INSERT INTO word_status; COMMIT'});
 await new Promise(r=>setImmediate(r));assert.equal(writerStarted,false);release();assert.deepEqual(await reading,[]);await writer;assert.equal((await f.read()).length,2);
});
test('committed-only refusal leaves idle timer and an expired caller transaction untouched',async t=>{
 const f=await fixture(t);await f.lease.run(async()=>{await f.lease.ensureOpen();await f.exec('BEGIN');},{sql:'BEGIN'});
 const timer=f.lease.timer,last=f.lease.lastTransactionActivity;f.lease.now=()=>last+60000;
 await assert.rejects(f.read(),{code:'ATLAS_PROGRESS_TRANSACTION_ACTIVE'});
 assert.equal(f.lease.timer,timer);assert.equal(f.lease.lastTransactionActivity,last);assert.equal(f.active(),true);assert.equal(f.rollbacks(),0);
 f.lease.now=()=>last;await f.lease.run(()=>f.exec('ROLLBACK'),{sql:'ROLLBACK'});assert.deepEqual(await f.read(),[]);
});
test('worker RPC uses actual get_autocommit under committed-only lease; host never initializes a worker for export',()=>{
 const runtime=fs.readFileSync(__dirname+'/../public/db/db-worker-runtime.js','utf8'),host=fs.readFileSync(__dirname+'/../public/db/local-db.js','utf8');
 assert(runtime.includes("requireCommitted: type === 'atlasProgressSnapshot'"));assert(runtime.includes('inTransaction:() => !sqlite3.get_autocommit(db)'));
 const begin=host.indexOf('export async function dbAtlasProgressSnapshot()'),end=host.indexOf('export async function dbRun',begin),body=host.slice(begin,end);
 assert(body.includes("_call('atlasProgressSnapshot')"));assert(!/initLocalDB|new Worker|dbRun|BEGIN|COMMIT/.test(body));
});
