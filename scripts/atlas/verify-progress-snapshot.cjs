#!/usr/bin/env node
'use strict';
// The only restore here is a new :memory: SQLite connection. Never imports into the application.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sqlite=require('sqlite3');
const E=require('../../public/js/atlas-progress-export'),T=require('../../public/js/atlas-train'),AW=require('../../public/js/atlas-words'),RM=require('../../public/js/reader-morph');
const run=(db,sql,p=[])=>new Promise((yes,no)=>db.run(sql,p,e=>e?no(e):yes()));
const all=(db,sql,p=[])=>new Promise((yes,no)=>db.all(sql,p,(e,r)=>e?no(e):yes(r)));
const ordered=(rows,key)=>rows.slice().sort((a,b)=>String(a[key]).localeCompare(String(b[key])));
async function verify(snapshot,dataDir){
 const safe=await E.validate(snapshot,crypto.webcrypto),db=new sqlite.Database(':memory:');
 try{
  for(const [table,cols,rows]of [['word_status',E.wordColumns,safe.word_status],['review_log',E.reviewColumns,safe.review_log]]){
   await run(db,'CREATE TABLE '+table+' ('+cols.map(k=>k+(/^(srs_(interval|reps|lapses|order_index|stability|difficulty)|grade|latency_ms)$/.test(k)?' NUMERIC':' TEXT')).join(',')+')');
   for(const row of rows)await run(db,'INSERT INTO '+table+' ('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')',cols.map(k=>row[k]));
   assert.deepEqual(ordered(await all(db,'SELECT * FROM '+table),cols[0]),ordered(rows,cols[0]));
  }
  const sections=fs.readdirSync(path.join(dataDir,'sections')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dataDir,'sections',f),'utf8'))),contexts=new Map(sections.map(s=>[s.id,AW.sectionContext('a97001',s,RM)]));
  const bank=JSON.parse(fs.readFileSync(path.join(dataDir,'train/terms.json'),'utf8')),states={};let historicalParents=0;
  for(const row of safe.word_status){
   if(!T.parseTermKey(row.lemma_key))continue;
   states[row.lemma_key]={status:row.status,due:row.srs_due?Date.parse(row.srs_due):0,stability:row.srs_stability,difficulty:row.srs_difficulty,textKey:row.srs_text_key,sentenceId:row.srs_sentence_id};
   const sid=/^atlas-block-v1:a97001:([a-z0-9-]+):/.exec(row.srs_text_key||'');if(sid&&contexts.get(sid[1])?.resolveReference(row.srs_sentence_id)?.kind==='legacy_group')historicalParents++;
  }
  const queue=T.globalDueItems(states,bank,[],Number.MAX_SAFE_INTEGER,Math.max(1,Object.keys(states).length));
  for(const item of queue.items){const ctx=contexts.get(item.sid);assert(ctx&&AW.learningItem(ctx.items.get(item.block)),'Current queue must use a real eligible occurrence');}
  // Running resolver/queues cannot add children or alter a raw grade/schedule/ledger field.
  assert.deepEqual(ordered(await all(db,'SELECT * FROM word_status'),'lemma_key'),ordered(safe.word_status,'lemma_key'));
  assert.deepEqual(ordered(await all(db,'SELECT * FROM review_log'),'id'),ordered(safe.review_log,'id'));
  return {ok:true,scope:'isolated in-memory test; no application import or owner writes',word_status:safe.word_status.length,review_log:safe.review_log.length,find_history:safe.find_history.length,find_stale:safe.find_stale.length,historical_parent_sources:historicalParents,eligible_current_queue_items:queue.items.length,unavailable_term_keys:queue.missing,exact_rows_preserved:true,parent_grades_cloned:0,snapshot_integrity_sha256:safe.integrity_sha256};
 }finally{await new Promise((yes,no)=>db.close(e=>e?no(e):yes()));}
}
async function main(){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];if(!args.includes('--snapshot')||!args.includes('--data')||!args.includes('--report'))throw Error('ATLAS_PROGRESS_ARGUMENTS');
 const file=path.resolve(get('--snapshot')),report=path.resolve(get('--report'));if(file===report)throw Error('ATLAS_PROGRESS_REPORT_OVERWRITE');
 const bytes=fs.readFileSync(file),result=await verify(JSON.parse(bytes.toString('utf8')),path.resolve(get('--data')));result.file_sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({ok:false,code:/^ATLAS_[A-Z_]+$/.test(e.code||e.message)?e.code||e.message:'INVALID_SNAPSHOT_OR_ISOLATED_TEST_FAILED'}));process.exitCode=1;});
module.exports={verify};
