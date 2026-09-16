const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../public/js/learning-material-task');
const input={source_text:'שלום',title:'Greeting',provider:'gemini'};
function memory(){const rows=new Map();return {add:async j=>(rows.set(j.id,structuredClone(j)),j),get:async id=>structuredClone(rows.get(id)),update:async(id,fn)=>{const j=fn(structuredClone(rows.get(id)));rows.set(id,structuredClone(j));return j;}};}
test('task journal refuses credentials and learning profile',async()=>{await assert.rejects(T.create({...input,import_meta:{apiKey:'secret'}}),/PRIVATE_DATA/);await assert.rejects(T.create({...input,import_meta:{review_log:[]}}),/PRIVATE_DATA/);});
for(const failAt of ['translate','save','preparePackage'])test('resume after '+failAt+' failure reuses completed stages',async()=>{
  const store=memory(),job=await T.create(input);await store.add(job);let failing=true;const calls={translate:0,save:0,preparePackage:0};
  const ops={translate:async()=>({rows:[{he:'שלום',ru:'Привет'}]}),save:async j=>({id:j.id}),preparePackage:async()=>({sha256:'a'.repeat(64)})};
  for(const k of Object.keys(ops)){const original=ops[k];ops[k]=async(...args)=>{calls[k]++;if(k===failAt&&failing){failing=false;throw new Error('injected');}return original(...args);};}
  const runner=T.createRunner(store,ops);await assert.rejects(runner.run(job.id),/injected/);await runner.run(job.id);
  assert.equal((await store.get(job.id)).state,'ready');assert.equal(calls[failAt],2);for(const k of Object.keys(calls).filter(k=>k!==failAt))assert.equal(calls[k],1);
});
test('cancel during translation retains result and prevents saving; explicit resume uses result',async()=>{
  const store=memory(),job=await T.create(input);await store.add(job);let translate=0,save=0,runner;
  runner=T.createRunner(store,{translate:async()=>{translate++;await runner.cancel(job.id);return {rows:[{he:'שלום'}]};},save:async j=>(save++,{id:j.id}),preparePackage:async()=>({sha256:'b'.repeat(64)})});
  await runner.run(job.id);assert.equal(save,0);assert.equal((await store.get(job.id)).state,'cancelled');await runner.run(job.id);assert.equal(translate,1);assert.equal(save,1);
});

// ── P5: материал начинается со ссылки, а не с готового текста ──
const sourceMeta={captions:{video:{videoId:'eLYgTqNFn-s',url:'https://www.youtube.com/watch?v=eLYgTqNFn-s'}}};
const link={youtube_source:{video_id:'eLYgTqNFn-s',url:'https://www.youtube.com/watch?v=eLYgTqNFn-s'},title:'Kan 11',provider:'gemini'};
function linkOps(log){return {
  transcribe:async()=>{log.transcribe++;return {text:'שלום עולם',segments:[{startSec:7,text:'שלום עולם'}],durationSec:1560,timing:{verdict:'verified'},blind:false,import_meta:sourceMeta};},
  translate:async i=>{log.translate++;log.translatedText=i.source_text;return {rows:[{he:'שלום עולם',ru:'Привет мир'}]};},
  verifySaved:async()=>true,
  save:async j=>{log.save++;return {id:'text-1'};},
  bindPlaybackSource:async(j,src)=>{log.bind++;log.bound=src;return {revision:1};},
  preparePackage:async()=>{log.pkg++;return {sha256:'c'.repeat(64)};}};}

test('a link alone is enough to create a task',async()=>{
  const job=await T.create(link);
  assert.equal(job.input.youtube_source.video_id,'eLYgTqNFn-s');
  assert.equal(job.phase,'imported');
  await assert.rejects(T.create({title:'x',provider:'gemini'}),/TASK_INPUT_INVALID/);
});

test('the link runs all the way to a saved card with its video source attached',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(link);await store.add(job);
  const runner=T.createRunner(store,linkOps(log));
  const done=await runner.run(job.id);
  assert.equal(done.state,'ready');
  assert.equal(log.translatedText,'שלום עולם','the table is built from the transcript');
  assert.deepEqual(log.bound,{url:'https://www.youtube.com/watch?v=eLYgTqNFn-s',offset_ms:0});
  assert.equal(done.transcript.segments.length,1);
  assert.equal(done.saved_text_id,'text-1');
});

test('a resumed task never pays for the same transcript twice',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(link);await store.add(job);
  const ops=linkOps(log);let fail=true;
  ops.translate=async i=>{log.translate++;if(fail){fail=false;throw new Error('injected');}log.translatedText=i.source_text;return {rows:[{he:i.source_text,ru:'а'}]};};
  const runner=T.createRunner(store,ops);
  await assert.rejects(runner.run(job.id),/injected/);
  assert.equal((await store.get(job.id)).transcript.text,'שלום עולם','a paid transcript survives a failed step');
  await runner.run(job.id);
  assert.equal(log.transcribe,1,'the provider must not be asked for the transcript again');
  assert.equal(log.translate,2);
});

test('explicit translation-provider switch preserves the paid transcript and re-signs only unfinished work',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0};
  const job=await T.create({...link,provider:'google-free'});await store.add(job);
  const ops=linkOps(log);ops.translate=async()=>{log.translate++;if(log.translate===1)throw new Error('google unavailable');return {rows:[{he:'שלום עולם',ru:'Привет мир'}]};};
  const runner=T.createRunner(store,ops);
  await assert.rejects(runner.run(job.id),/google unavailable/);
  const changed=await T.switchTranslationProvider(store,job.id,'gemini','gemini-3.8-flash');
  assert.equal(changed.input.provider,'gemini');
  assert.equal(changed.transcript.text,'שלום עולם');
  assert.notEqual(changed.signature,job.signature);
  await runner.run(job.id);
  assert.equal(log.transcribe,1);
  assert.equal((await store.get(job.id)).state,'ready');
  await assert.rejects(T.switchTranslationProvider(store,job.id,'gemini','gemini-3.8-flash'),/TASK_PROVIDER_CHANGE_BLOCKED/);
});

test('a text-only task never reaches the transcribe or bind stages',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(input);await store.add(job);
  await T.createRunner(store,linkOps(log)).run(job.id);
  assert.equal(log.transcribe,0);
  assert.equal(log.bind,0);
  assert.equal(log.translatedText,'שלום');
});

test('cancelling before the table is built stops without paying for translation',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(link);await store.add(job);
  const ops=linkOps(log);let runner;
  ops.transcribe=async()=>{log.transcribe++;await runner.cancel(job.id);return {text:'שלום',segments:[],durationSec:10,timing:{verdict:'inconclusive'},blind:false};};
  runner=T.createRunner(store,ops);
  await runner.run(job.id);
  assert.equal((await store.get(job.id)).state,'cancelled');
  assert.equal(log.translate,0);
  assert.equal((await store.get(job.id)).transcript.text,'שלום','the paid result is kept for the resume');
});

test('the transcript carries its own provenance into the table and the saved card',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(link);await store.add(job);
  const ops=linkOps(log);
  ops.transcribe=async()=>({text:'שלום',segments:[{startSec:7,text:'שלום'}],durationSec:1560,timing:{verdict:'verified'},blind:false,
    import_meta:{v:1,captions:{origin:'gemini-url-asr'},video:{platform:'youtube',videoId:'eLYgTqNFn-s'}}});
  ops.translate=async i=>{log.translate++;log.meta=i.import_meta;return {rows:[{he:'שלום',ru:'Привет'}]};};
  await T.createRunner(store,ops).run(job.id);
  assert.equal(log.meta.captions.origin,'gemini-url-asr','the table must be built against the transcript it came from');
  assert.equal((await store.get(job.id)).input.import_meta,null,'the immutable task input is not rewritten');
});

test('the journal records when each stage began and ended',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(link);await store.add(job);
  await T.createRunner(store,linkOps(log)).run(job.id);
  const done=await store.get(job.id);
  for(const key of ['transcribing','translating','saving','binding']){
    const rec=done.stage_times[key];
    assert.ok(rec&&Number.isFinite(rec.startedAt),key+' must have a start: '+JSON.stringify(done.stage_times));
    assert.ok(Number.isFinite(rec.endedAt),key+' must be closed when the next stage begins');
    assert.ok(rec.endedAt>=rec.startedAt,key+' cannot end before it starts');
  }
});

test('a resumed stage is timed by its own attempt, not by the wall clock since the first one',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(link);await store.add(job);
  const ops=linkOps(log);let fail=true;
  ops.translate=async i=>{log.translate++;if(fail){fail=false;throw new Error('injected');}return {rows:[{he:i.source_text,ru:'а'}]};};
  const runner=T.createRunner(store,ops);
  await assert.rejects(runner.run(job.id),/injected/);
  const afterFail=(await store.get(job.id)).stage_times.translating.startedAt;
  await new Promise(r=>setTimeout(r,25));
  await runner.run(job.id);
  const afterResume=(await store.get(job.id)).stage_times.translating;
  assert.ok(afterResume.startedAt>afterFail,'the retried attempt restarts its own clock');
  assert.ok(Number.isFinite(afterResume.endedAt));
});

test('cancelling during a provider wait stops the run instead of failing it',async()=>{
  const store=memory(),log={transcribe:0,translate:0,save:0,bind:0,pkg:0},job=await T.create(link);await store.add(job);
  const ops=linkOps(log);let runner;
  ops.transcribe=async()=>{await runner.cancel(job.id);const e=new Error('TASK_CANCELLED');e.code='TASK_CANCELLED';throw e;};
  runner=T.createRunner(store,ops);
  await runner.run(job.id);
  const after=await store.get(job.id);
  assert.equal(after.state,'cancelled','a stop asked for by the person is not a failure');
  assert.equal(after.error,null,'stopping on request leaves no error to explain away');
  assert.equal(log.translate,0);
});

test('the price the person agreed to is kept with the task, not in a page variable',async()=>{
  // Наблюдение владельца 2026-09-11: после возобновления согласованная смета исчезала, маршрут
  // снова спрашивал подтверждение, и закрытый вопрос оставлял пустую таблицу (TASK_TABLE_INCOMPLETE).
  const quote={lowUsd:0.2,highUsd:0.5,lowRows:400,highRows:693,chunks:6};
  const job=await T.create({...link,table_quote:quote});
  assert.deepEqual(job.input.table_quote,quote);
  const store=memory();await store.add(job);
  const log={transcribe:0,translate:0,save:0,bind:0,pkg:0},ops=linkOps(log);
  ops.translate=async i=>{log.translate++;log.quoteSeen=i.table_quote;return {rows:[{he:i.source_text,ru:'а'}]};};
  await T.createRunner(store,ops).run(job.id);
  assert.deepEqual(log.quoteSeen,quote,'the table stage must receive the agreed price on every run, resume included');
});

test('a task created without a quote does not invent one',async()=>{
  const job=await T.create(link);
  assert.equal(job.input.table_quote,null);
});

for(const defect of ['transcript','table','input','saved'])test('source mismatch at '+defect+' retains results and prevents dependent work',async()=>{
  const store=memory(),job=await T.create(link),log={transcribe:0,translate:0,save:0,bind:0,pkg:0};await store.add(job);
  const ops=linkOps(log);
  if(defect==='transcript')ops.transcribe=async()=>({text:'שלום עולם',import_meta:{captions:{video:{videoId:'MlX2x9QJIMk'}}}});
  if(defect==='table')ops.translate=async()=>({rows:[{he:'old unrelated text'}]});
  if(defect==='input')await store.update(job.id,j=>({...j,input:{...j.input,title:'changed behind dialog'}}));
  if(defect==='saved')ops.verifySaved=async()=>{throw Error('TASK_SOURCE_MISMATCH');};
  await assert.rejects(T.createRunner(store,ops).run(job.id),/TASK_SOURCE_MISMATCH/);
  const after=await store.get(job.id);assert.equal(after.state,'paused');assert.equal(log.pkg,0);assert.equal(log.bind,0);
  if(defect!=='saved')assert.equal(log.save,0);
  if(defect==='table')assert.equal(after.table.rows[0].he,'old unrelated text','provider result retained for diagnosis');
  if(defect!=='input')assert.ok(after.transcript,'paid transcript retained');
  else assert.equal(log.transcribe,0,'modified input must fail before paid recognition');
});
test('table receipt catches a changed translation on resume without paying again',async()=>{
  const store=memory(),job=await T.create(link),log={transcribe:0,translate:0,save:0,bind:0,pkg:0};await store.add(job);
  const ops=linkOps(log);ops.save=async()=>{throw Error('save interrupted');};
  const runner=T.createRunner(store,ops);await assert.rejects(runner.run(job.id),/save interrupted/);
  await store.update(job.id,j=>{j.table.rows[0].ru='foreign translation';return j;});
  await assert.rejects(runner.run(job.id),/TASK_SOURCE_MISMATCH/);assert.equal(log.transcribe,1);assert.equal(log.translate,1);
});
test('conflicting saved video is rejected even when transcript video matches',()=>{
  assert.throws(()=>T.assertVideoSource(link.youtube_source,{...sourceMeta,video:{videoId:'MlX2x9QJIMk'}}),/TASK_SOURCE_MISMATCH/);
  assert.throws(()=>T.assertSavedRows({table:{rows:[{he:'שלום'}]}},[{he_plain:'אחר'}]),/TASK_SOURCE_MISMATCH/);
});
test('invalid explicit YouTube input never falls back to the open card text',async()=>{
  await assert.rejects(T.create({...input,youtube_source:{url:'invalid'}}),/TASK_INPUT_INVALID/);
});
