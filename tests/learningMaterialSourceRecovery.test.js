'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../public/js/learning-material-task'),R=require('../public/js/table-source-recovery'),P=require('../public/js/playback-source');
const source='וכשמגיע האוכל, פה שוכחים מהכל. על מה הבחירות האלה?';
const row={segment_index:0,he:source.replace('וכש','וככש'),he_niqqud:'וּכְכְשֶׁמַּגִּיעַ הָאוֹכֶל, פֹּה שׁוֹכְחִים מֵהַכֹּל. עַל מָה הַבְּחִירוֹת הָאֵלֶּה?',translit:'provider echo',ru:'Когда приносят еду, всё забывают.'};
async function jobFor(texts=[source],rows=[row]){
  const input={title:'Recovery fixture',provider:'gemini',youtube_source:{url:'https://www.youtube.com/watch?v=0h7uhp2l-lo'}};
  const job=await T.create(input);
  job.transcript={text:texts.join('\n'),import_meta:{video:{videoId:'0h7uhp2l-lo'},captions:{segments:texts.map((text,i)=>({i,text,start:i*5,end:(i+1)*5}))}}};
  job.table={rows:structuredClone(rows),source_receipt:{source_sha256:await P.digest(job.transcript.text),rows_sha256:await P.digest(JSON.stringify(rows))}};
  job.phase='table_ready';return job;
}
function storeFor(job){let current=structuredClone(job);return {get:async()=>structuredClone(current),update:async(id,fn)=>{current=fn(structuredClone(current));return structuredClone(current);}};}
test('paid adjacent-letter echo recovers locally and resumes across a transliteration failure',async()=>{
  const job=await jobFor(),store=storeFor(job);let failed=false,saves=0;
  const ops={transcribe:()=>assert.fail('paid ASR'),translate:()=>assert.fail('paid translation'),
    completeSourceRecovery:async table=>{if(!failed){failed=true;throw Error('offline');}table.rows[0].translit='local';table.rows[0].source_recovery.translit_status='local';},
    save:async()=>({id:'recovered-'+(++saves)}),verifySaved:async()=>{},bindPlaybackSource:async()=>({revision:1}),preparePackage:async()=>({sha256:'a'.repeat(64)})};
  const runner=T.createRunner(store,ops);await assert.rejects(runner.run(job.id),/offline/);
  const paused=await store.get();assert.equal(paused.table.rows[0].he,source);assert.deepEqual(paused.table.source_recovery.original_table,job.table);
  const done=await runner.run(job.id);assert.equal(done.state,'ready');assert.equal(saves,1);await T.verifySource(done);
  assert.equal(R.plain(done.table.rows[0].he_niqqud),source);
  assert.deepEqual(done.transcript,job.transcript);assert.equal(done.signature,job.signature);
});
test('source recovery never reseals a corrupted receipt, transcript or source input',async()=>{
  for(const corrupt of [j=>j.table.rows[0].ru='edited',j=>j.input.title='edited',j=>j.transcript.text+=' אחר',j=>j.transcript.import_meta.video.videoId='eLYgTqNFn-s']){
    const job=await jobFor();corrupt(job);await assert.rejects(T.recoverSourceTable(job),/TASK_SOURCE_MISMATCH/);
    await assert.rejects(T.sourceReview(job),/TASK_SOURCE_MISMATCH/);
  }
});
test('retained original paid table is also protected after recovery',async()=>{
  const job=await jobFor();job.table=await T.recoverSourceTable(job);job.table.source_recovery.original_table.rows[0].ru='corrupt';
  await assert.rejects(T.verifySource(job),/TASK_SOURCE_MISMATCH/);
});
test('no fuzzy repair of numbers, lexical rewrites, short utterances or missing words',()=>{
  for(const [a,b]of [['שלום עולם','שלוםם עולם'],[source,source.replace('האוכל','הכסף')],[source,source.replace('פה ','')],['יש כאן 123 אנשים שמחכים לאוכל','יש כאן 1223 אנשים שמחכים לאוכל']])assert.equal(R.recoverRow({...row,he:b},a),null);
  const differing=R.recoverRow({...row,he_niqqud:row.he_niqqud.replace('כְכְ','כַכְ')},source);
  assert.equal(differing.he_niqqud,'');assert.equal(differing.niqqud_status,'not_vocalized');
});
test('general review handles a changed split segment and a missing segment without inventing translation',async()=>{
  const texts=['שלום עולם יפה','היום אנחנו לומדים'],rows=[{segment_index:0,he:'שלום',ru:'Привет'},{segment_index:0,he:'טקסט אחר',ru:'Другой текст'}];
  const job=await jobFor(texts,rows),review=await T.sourceReview(job);
  assert.equal(review.groups.length,2);assert.equal(review.groups[0].rows.length,2);assert.equal(review.groups[1].rows.length,0);
  const choices=review.groups.map(g=>({segment_index:g.segment_index,ru:'Проверенный перевод '+g.segment_index,confirmed:true}));
  await assert.rejects(T.applySourceReview(job,review,choices.map(c=>({...c,confirmed:false}))),/TASK_REVIEW_INCOMPLETE/);
  await assert.rejects(T.applySourceReview(job,review,[choices[0],choices[0]]),/TASK_REVIEW_INCOMPLETE/);
  const table=await T.applySourceReview(job,review,choices);await T.verifySource({...job,table});
  assert.deepEqual(table.rows.map(r=>r.he),texts);assert.deepEqual(table.source_recovery.original_table,job.table);
  assert.ok(table.rows.every(r=>r.translation_provider==='manual'&&JSON.parse(r.translation_meta_json).reviewed));
  for(const r of table.rows){assert.equal(r.he_niqqud,'');assert.equal(r.translit,'');assert.equal(r.niqqud_status,'not_vocalized');assert.equal(r.source_recovery.reviewed,true);}
});
test('review leaves correct split rows untouched and refuses stale or invalid mapping',async()=>{
  const rows=[{segment_index:0,he:'שלום',ru:'Привет'},{segment_index:0,he:'עולם',ru:'мир'},{segment_index:1,he:'אחר',ru:'иной'}];
  const job=await jobFor(['שלום עולם','משפט חדש'],rows),review=await T.sourceReview(job);
  assert.equal(review.groups.length,1);
  const table=await T.applySourceReview(job,review,[{segment_index:1,ru:'Новое предложение',confirmed:true}]);
  assert.deepEqual(table.rows.slice(0,2),rows.slice(0,2));
  review.groups[0].source='stale';await assert.rejects(T.applySourceReview(job,review,[]),/TASK_SOURCE_MISMATCH/);
  for(const index of [-1,99,0.5]){const malformed=await jobFor([source],[{...row,segment_index:index}]);await assert.rejects(T.sourceReview(malformed),/TASK_SOURCE_MISMATCH/);}
});
test('diagnosis distinguishes input, video, receipt, table, mapping and saved failures',async()=>{
  const job=await jobFor();assert.equal(await T.sourceDiagnosis(job),'table');
  for(const [reason,change]of [['input',j=>j.input.title='changed'],['video',j=>j.transcript.import_meta.video.videoId='eLYgTqNFn-s'],['receipt',j=>j.table.rows[0].ru='changed'],['saved',j=>j.saved_text_id='existing']]){const j=structuredClone(job);change(j);assert.equal(await T.sourceDiagnosis(j),reason);}
  assert.equal(await T.sourceDiagnosis(await jobFor([source],[{...row,segment_index:7}])),'mapping');
});
