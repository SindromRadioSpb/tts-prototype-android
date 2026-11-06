/* Explicit, local-only capture through the host's already-open DB. No imports, worker, writes or network. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AtlasProgressExport=api;})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  var SCHEMA='linguistpro.atlas-progress.1',ATLAS='a97001';
  var W=['lemma_key','status','updated_at','srs_due','srs_interval','srs_reps','srs_lapses','srs_text_key','srs_sentence_id','srs_order_index','srs_surface','srs_stability','srs_difficulty','srs_reviewed_at','srs_scheme'];
  var R=['id','item_key','kind','reviewed_at','grade','source','channel','latency_ms','meta_json'];
  var HISTORY='room.atlas.find.v1',STALE='room.atlas.find.stale.v1';
  var TERM=/^at1:a97001:[a-z0-9-]+#[A-Za-z0-9_-]+$/,TEXT=/^atlas-block-v1:a97001:[a-z0-9-]+:[A-Za-z0-9_-]+$/;
  var BLOCK=/^a97001:p[1-9][0-9]*:[A-Za-z0-9:_-]+$/,FIND=/^find:a97001:p[1-9][0-9]*:[A-Za-z0-9:_-]+$/;
  var META=new Set(['status','keyer_version','backfill','interval','reps','lapses','scheme','level','seedAlgoVersion','scheduler','evidence_scope','fuzz_days','annul_of','surface','pos','text_key','textKey','sentence_id','sentenceId','order_index','orderIndex','source','postTeach','word_only','training_stage','grade_policy_version','raw_grade','effective_grade','policy_reason']);
  function fail(code){var e=new Error(code);e.code=code;throw e;}
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
  function exact(v,keys){if(!object(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('ATLAS_PROGRESS_SCHEMA');}
  function jsonObject(v){try{var o=JSON.parse(v);if(object(o))return o;}catch(_){}fail('ATLAS_PROGRESS_METADATA');}
  function anchored(m){return !!m&&(TEXT.test(m.text_key||m.textKey||'')||object(m.source)&&TEXT.test(m.source.text_key||m.source.textKey||''));}
  function noForeignSource(m){
    for(var k of ['text_key','textKey'])if(m[k]!=null&&!TEXT.test(m[k]))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    for(var k2 of ['sentence_id','sentenceId'])if(m[k2]!=null&&!BLOCK.test(m[k2]))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
  }
  function meta(v){
    var m=jsonObject(v);if(Object.keys(m).some(k=>!META.has(k)))fail('ATLAS_PROGRESS_UNKNOWN_METADATA');
    noForeignSource(m);
    if(m.source!=null){exact(m.source,['text_key','textKey','sentence_id','sentenceId','order_index','orderIndex','surface']);noForeignSource(m.source);}
    if(m.scheduler!=null)exact(m.scheduler,['scheme','engine_version','request_retention']);
    if(JSON.stringify(m).length>16384)fail('ATLAS_PROGRESS_METADATA_LIMIT');
    return m;
  }
  function word(row){
    exact(row,W);if(!W.every(k=>Object.hasOwn(row,k)))fail('ATLAS_PROGRESS_SCHEMA');
    if(!TERM.test(row.lemma_key)&&(/^at1:/.test(row.lemma_key)||!TEXT.test(row.srs_text_key||'')))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    if(row.srs_text_key!=null&&!TEXT.test(row.srs_text_key))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    if(row.srs_sentence_id!=null&&!BLOCK.test(row.srs_sentence_id))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    if(!['','l1','l2','l3','l4','known','ignore','new','learning'].includes(row.status))fail('ATLAS_PROGRESS_STATUS');
    for(var k of W.filter(k=>/^srs_(interval|reps|lapses|order_index|stability|difficulty)$/.test(k)))if(row[k]!=null&&(typeof row[k]!=='number'||!Number.isFinite(row[k])))fail('ATLAS_PROGRESS_NUMBER');
    return row;
  }
  function review(row){
    exact(row,R);if(!R.every(k=>Object.hasOwn(row,k)))fail('ATLAS_PROGRESS_SCHEMA');var m=meta(row.meta_json);
    if(!TERM.test(row.item_key)&&(/^at1:/.test(row.item_key)||!anchored(m)))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    if(!['review','skip','seed','mark','annul'].includes(row.kind))fail('ATLAS_PROGRESS_REVIEW_KIND');
    if(typeof row.id!=='string'||!row.id||typeof row.reviewed_at!=='string')fail('ATLAS_PROGRESS_SCHEMA');
    return row;
  }
  function parseList(raw){if(raw==null)return [];try{var v=JSON.parse(raw);if(Array.isArray(v))return v;}catch(_){}fail('ATLAS_PROGRESS_HISTORY_SCHEMA');}
  function history(list){return list.filter(x=>object(x)&&String(x.id||'').startsWith('find:a97001:')).map(x=>{
    exact(x,['id','sid','section','page','ms','at']);if(!FIND.test(x.id)||!/^s[0-9]{2}-[a-z0-9-]+$/.test(x.sid)||typeof x.section!=='boolean'||!['exact','near','wrong'].includes(x.page)||!Number.isFinite(x.ms)||x.ms<0||!Number.isFinite(x.at)||x.at<0)fail('ATLAS_PROGRESS_HISTORY_SCHEMA');return x;
  });}
  function stale(list){return list.filter(x=>typeof x==='string'&&x.startsWith('find:a97001:')).map(x=>{if(!FIND.test(x))fail('ATLAS_PROGRESS_HISTORY_SCHEMA');return x;});}
  function pairs(cols){return cols.map(k=>"'"+k+"',"+k).join(',');}
  // One SQLite statement = one consistent read snapshot of both tables. No BEGIN/COMMIT or migration.
  var SQL="SELECT 'word_status' AS record_type,json_object("+pairs(W)+") AS record_json FROM word_status WHERE lemma_key LIKE 'at1:a97001:%' OR srs_text_key LIKE 'atlas-block-v1:a97001:%' UNION ALL SELECT 'review_log',json_object("+pairs(R)+") FROM review_log WHERE item_key LIKE 'at1:a97001:%' OR (json_valid(meta_json) AND (json_extract(meta_json,'$.text_key') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.textKey') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.source.text_key') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.source.textKey') LIKE 'atlas-block-v1:a97001:%'))";
  async function digest(value,cryptoApi){
    var c=cryptoApi||(typeof globalThis!=='undefined'&&globalThis.crypto);if(!c||!c.subtle)fail('ATLAS_PROGRESS_CRYPTO');
    var b=await c.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
  }
  async function capture(options){
    var db=options&&options.db,storage=options&&options.storage;
    if(!db||typeof db.getOwnershipState!=='function'||db.getOwnershipState()!=='shared'||typeof db.dbQuery!=='function')fail('ATLAS_PROGRESS_DB_NOT_OPEN');
    if(!storage||typeof storage.getItem!=='function')fail('ATLAS_PROGRESS_STORAGE_UNAVAILABLE');
    var rawHistory=storage.getItem(HISTORY),rawStale=storage.getItem(STALE),rows=await db.dbQuery(SQL,[]),ws=[],rl=[];
    for(var row of rows){var v=jsonObject(row.record_json);if(row.record_type==='word_status')ws.push(word(v));else if(row.record_type==='review_log')rl.push(review(v));else fail('ATLAS_PROGRESS_SCHEMA');}
    if(rawHistory!==storage.getItem(HISTORY)||rawStale!==storage.getItem(STALE))fail('ATLAS_PROGRESS_SOURCE_CHANGED');
    ws.sort((a,b)=>a.lemma_key.localeCompare(b.lemma_key));rl.sort((a,b)=>a.id.localeCompare(b.id));
    var body={schema:SCHEMA,atlas_id:ATLAS,captured_at:new Date().toISOString(),scope:'atlas-specific term history and explicitly atlas-bound word state/history; no history inferred from shared lemma keys',word_status:ws,review_log:rl,find_history:history(parseList(rawHistory)),find_stale:stale(parseList(rawStale))};
    return Object.assign(body,{integrity_sha256:await digest(body,options.crypto)});
  }
  async function validate(snapshot,cryptoApi){
    exact(snapshot,['schema','atlas_id','captured_at','scope','word_status','review_log','find_history','find_stale','integrity_sha256']);
    if(snapshot.schema!==SCHEMA||snapshot.atlas_id!==ATLAS)fail('ATLAS_PROGRESS_SCHEMA');
    for(var key of ['word_status','review_log','find_history','find_stale'])if(!Array.isArray(snapshot[key]))fail('ATLAS_PROGRESS_SCHEMA');
    var body=Object.assign({},snapshot);delete body.integrity_sha256;if(await digest(body,cryptoApi)!==snapshot.integrity_sha256)fail('ATLAS_PROGRESS_HASH');
    snapshot.word_status.forEach(word);snapshot.review_log.forEach(review);
    if(history(snapshot.find_history).length!==snapshot.find_history.length||stale(snapshot.find_stale).length!==snapshot.find_stale.length)fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    return JSON.parse(JSON.stringify(snapshot));
  }
  function mount(container,options){
    options=options||{};var doc=container.ownerDocument,l=options.labels||{},box=doc.createElement('section'),help=doc.createElement('p'),button=doc.createElement('button'),status=doc.createElement('p');
    box.className='atlas-progress-export';help.textContent=l.help||'Save only atlas 97001 learning history to a local file. The original stays unchanged. Shared-word history is included only with an explicit atlas source.';
    button.type='button';button.textContent=l.save||'Save atlas 97001 progress';button.setAttribute('data-atlas-progress-export','');status.setAttribute('role','status');
    box.append(help,button,status);container.appendChild(box);
    button.addEventListener('click',async function(){
      button.disabled=true;status.removeAttribute('data-export-error');status.textContent=l.working||'Preparing the local copy…';
      try{
        var snapshot=await capture({db:options.db,storage:options.storage,crypto:options.crypto});
        var filename='atlas97001-progress-'+snapshot.captured_at.replace(/[:.]/g,'-')+'.json';
        if(options.save)await options.save(snapshot,filename);
        else {var win=doc.defaultView,url=win.URL.createObjectURL(new win.Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'})),a=doc.createElement('a');a.href=url;a.download=filename;a.hidden=true;doc.body.appendChild(a);a.click();a.remove();win.setTimeout(function(){win.URL.revokeObjectURL(url);},1000);}
        status.textContent=(l.done||'Local file prepared: {words} states, {reviews} reviews, {find} exercise answers.').replace('{words}',snapshot.word_status.length).replace('{reviews}',snapshot.review_log.length).replace('{find}',snapshot.find_history.length);
      }catch(e){status.textContent=(e.code==='ATLAS_PROGRESS_DB_NOT_OPEN'?l.notOpen:l.error)||'The copy could not be prepared. The original is unchanged.';status.setAttribute('data-export-error',e.code||'EXPORT_FAILED');}
      finally{button.disabled=false;}
    });
    return box;
  }
  return {capture:capture,validate:validate,mount:mount,SQL:SQL,wordColumns:W.slice(),reviewColumns:R.slice(),schema:SCHEMA};
});
