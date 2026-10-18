// O-103: a material from a subtitle file and a translation file runs through the same task:
// named, saved, bound and packaged by the task; the table comes from the two files.
const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../public/js/learning-material-task');
const rows=[{segment_index:0,he:'שלום.',ru:'Привет.'},{segment_index:1,he:'מה נשמע?',ru:'Как дела?'}];
const input={source_text:'שלום.\nמה נשמע?',title:'Mivtza Savta',provider:'subtitle-files',
  subtitle_table:{rows,dicta_consent:true,translation_file:{name:'film.sub',sha256:'a'.repeat(64),coverage:0.997}}};

test('the subtitle-file provider is accepted and keeps its prepared rows and consent in the journal',async()=>{
  const job=await T.create(input);
  assert.equal(job.input.provider,'subtitle-files');
  assert.equal(job.input.subtitle_table.rows.length,2);
  assert.equal(job.input.subtitle_table.dicta_consent,true);
  await assert.rejects(T.create({...input,subtitle_table:null}),/TASK_INPUT_INVALID/,'rows are required');
  await assert.rejects(T.create({...input,subtitle_table:{rows:[]}}),/TASK_INPUT_INVALID/);
  await assert.rejects(T.create({...input,provider:'gemini',subtitle_table:{rows}}),/TASK_INPUT_INVALID/,'rows belong to this provider only');
});

test('the task asks translate() for the table, then saves and packages as for any material',async()=>{
  const store=(()=>{const m=new Map();return {add:async j=>(m.set(j.id,structuredClone(j)),j),get:async id=>structuredClone(m.get(id)),update:async(id,fn)=>{const j=fn(structuredClone(m.get(id)));m.set(id,structuredClone(j));return j;}};})();
  const job=await T.create(input);await store.add(job);const log=[];
  const done=await T.createRunner(store,{
    translate:async i=>{log.push(['translate',i.provider,i.subtitle_table.rows.length]);return {rows:i.subtitle_table.rows.map(r=>({...r,niqqud:'x'}))};},
    save:async j=>{log.push(['save',j.input.title]);return {id:'t1'};},
    preparePackage:async()=>{log.push(['package']);return {sha256:'b'.repeat(64)};},
  }).run(job.id);
  assert.equal(done.state,'ready');
  assert.deepEqual(log,[['translate','subtitle-files',2],['save','Mivtza Savta'],['package']]);
});

test('without any media the subtitle-files task does not demand ▶; with media it proves them',async()=>{
  const mk=()=>{const m=new Map();return {add:async j=>(m.set(j.id,structuredClone(j)),j),get:async id=>structuredClone(m.get(id)),update:async(id,fn)=>{const j=fn(structuredClone(m.get(id)));m.set(id,structuredClone(j));return j;}};};
  const ref={media_package_ref:{package_id:'mpkg:unbound:x'}};
  const ops=proofs=>({translate:async i=>({rows:i.subtitle_table.rows}),save:async()=>({id:'t'}),preparePackage:async()=>({sha256:'c'.repeat(64)}),
    provePlayback:async()=>{proofs.push(1);return {bound_rows:0,total_rows:2};}});
  for(const [meta,expectProof] of [[{...ref,captions:{media:{sha256:null}}},false],[{...ref,captions:{media:{sha256:'d'.repeat(64)}}},true],[{...ref,captions:{video:{videoId:'eLYgTqNFn-s'}}},true]]){
    const store=mk(),proofs=[],job=await T.create({...input,import_meta:meta});await store.add(job);
    const run=T.createRunner(store,ops(proofs)).run(job.id);
    if(expectProof){await assert.rejects(run,/TASK_PLAYBACK_UNBOUND/);assert.equal(proofs.length,1);}
    else{assert.equal((await run).state,'ready');assert.equal(proofs.length,0);}
  }
});
