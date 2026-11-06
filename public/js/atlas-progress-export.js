/* Explicit, local-only capture through the host's already-open DB. No imports, worker, writes or network. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AtlasProgressExport=api;})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  var SCHEMA='linguistpro.atlas-progress.1',ATLAS='a97001';
  var W=['lemma_key','status','updated_at','srs_due','srs_interval','srs_reps','srs_lapses','srs_text_key','srs_sentence_id','srs_order_index','srs_surface','srs_stability','srs_difficulty','srs_reviewed_at','srs_scheme'];
  var R=['id','item_key','kind','reviewed_at','grade','source','channel','latency_ms','meta_json'];
  var HISTORY='room.atlas.find.v1',STALE='room.atlas.find.stale.v1';
  var TERM=/^at1:a97001:[a-z0-9-]+#[A-Za-z0-9_-]+$/,TEXT=/^atlas-block-v1:a97001:[a-z0-9-]+:[A-Za-z0-9_-]+$/;
  var BLOCK=/^a97001:p[1-9][0-9]*:[A-Za-z0-9:_-]+$/,FIND=/^find:a97001:p[1-9][0-9]*:[A-Za-z0-9:_-]+$/;
  var SCOPE='atlas-specific term history and explicitly atlas-bound word state/history; no history inferred from shared lemma keys';
  var STATUS=['','new','l1','l2','l3','l4','known','ignore'];
  function fail(code){var e=new Error(code);e.code=code;throw e;}
  function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);}
  function exact(v,keys){if(!object(v)||Reflect.ownKeys(v).some(k=>typeof k!=='string'||!keys.includes(k)))fail('ATLAS_PROGRESS_SCHEMA');}
  function required(v,keys){exact(v,keys);if(!keys.every(k=>Object.hasOwn(v,k)))fail('ATLAS_PROGRESS_SCHEMA');}
  // validate accepts JSON data, never class instances, accessors, toJSON hooks or coercion objects.
  function jsonTree(v,seen,depth){
    if(v===null||typeof v==='string'||typeof v==='boolean')return;
    if(typeof v==='number'&&Number.isFinite(v))return;
    if(!v||typeof v!=='object'||depth>8||seen.has(v))fail('ATLAS_PROGRESS_SCHEMA');
    seen.add(v);var keys=Reflect.ownKeys(v);
    if(Array.isArray(v)){
      if(keys.length!==v.length+1||!keys.every(k=>k==='length'||typeof k==='string'&&/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<v.length))fail('ATLAS_PROGRESS_SCHEMA');
      for(var i=0;i<v.length;i++){var d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail('ATLAS_PROGRESS_SCHEMA');jsonTree(d.value,seen,depth+1);}
    }else{
      if(!object(v))fail('ATLAS_PROGRESS_SCHEMA');
      for(var k of keys){var desc=Object.getOwnPropertyDescriptor(v,k);if(typeof k!=='string'||!desc.enumerable||!Object.hasOwn(desc,'value'))fail('ATLAS_PROGRESS_SCHEMA');jsonTree(desc.value,seen,depth+1);}
    }
    seen.delete(v);
  }
  function text(v,max,empty){
    if(typeof v!=='string'||v.length>max||(!empty&&!v.length)||/[\u0000-\u001f\u007f]/.test(v))return false;
    // A JSON container encoded as text is not a word/surface/id in this export contract.
    if(/^[\s]*[\[{]/.test(v)){try{if(typeof JSON.parse(v)==='object')return false;}catch(_){}}
    return true;
  }
  function number(v,max){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;}
  function integer(v,max){return Number.isSafeInteger(v)&&v>=0&&v<=max;}
  function date(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19);}
  function one(values){return v=>values.includes(v);}
  function nullable(rule){return v=>v===null||rule(v);}
  function pattern(re,max){return v=>text(v,max,false)&&re.test(v);}
  function check(v,rule){if(!rule(v))fail('ATLAS_PROGRESS_SCHEMA');}
  function fields(v,rules){exact(v,Object.keys(rules));for(var k of Object.keys(v))check(v[k],rules[k]);return true;}
  var COUNTER=v=>integer(v,Number.MAX_SAFE_INTEGER),DAYS=v=>number(v,Number.MAX_SAFE_INTEGER),GRADE=v=>integer(v,4)&&v>=1;
  var WORD=v=>text(v,1024,true),ID=v=>text(v,1024,false),TOKEN=pattern(/^[A-Za-z][A-Za-z0-9:_-]*$/,96);
  var TEXT_REF=pattern(TEXT,256),BLOCK_REF=pattern(BLOCK,256);
  var SOURCE_RULES={text_key:TEXT_REF,textKey:TEXT_REF,sentence_id:BLOCK_REF,sentenceId:BLOCK_REF,order_index:COUNTER,orderIndex:COUNTER,surface:WORD};
  function source(v){fields(v,SOURCE_RULES);return Object.hasOwn(v,'text_key')||Object.hasOwn(v,'textKey');}
  function scheduler(v){
    fields(v,{scheme:one(['fsrs','sm2','sm2-lite']),engine_version:one(['fsrs6-core-v1','fsrs6-core-v2','fsrs6-core-v3']),request_retention:r=>typeof r==='number'&&Number.isFinite(r)&&r>0&&r<1});
    if(v.scheme==='fsrs')required(v,['scheme','engine_version','request_retention']);else required(v,['scheme']);
    return true;
  }
  var META={
    status:one(STATUS),keyer_version:one([1]),backfill:one([0,1]),interval:DAYS,reps:COUNTER,lapses:COUNTER,
    scheme:one(['fsrs','sm2','sm2-lite','manual-mark']),level:one(STATUS),seedAlgoVersion:one([1]),scheduler:scheduler,
    evidence_scope:one(['lexeme','cloze','context_supported','recognition','assisted_production','unsupported_production']),
    fuzz_days:COUNTER,annul_of:ID,surface:WORD,
    pos:one(['','verb','noun','adjective','adverb','preposition','pronoun','propernoun','determiner','conjunction','interjection','particle','numeral','number','prefix','suffix','copula','question','punctuation','other','unknown']),
    text_key:TEXT_REF,textKey:TEXT_REF,sentence_id:BLOCK_REF,sentenceId:BLOCK_REF,order_index:COUNTER,orderIndex:COUNTER,source:source,
    postTeach:one([0,1]),word_only:one([0,1]),training_stage:one(STATUS),grade_policy_version:one(['d1.v1']),
    raw_grade:GRADE,effective_grade:GRADE,policy_reason:one(['correct','skip','receptive-fail','production-fail','skip-production-receptive-strong','production-fail-receptive-strong']),
    // Exact values emitted by GradePolicy.policyMeta and the manual leech-release writer.
    grade_policy:one(['d1.v1']),grader:one(['deterministic']),leech_released:one([0,1])
  };
  function jsonObject(v){if(typeof v!=='string')fail('ATLAS_PROGRESS_METADATA');try{var o=JSON.parse(v);if(object(o))return o;}catch(_){}fail('ATLAS_PROGRESS_METADATA');}
  function anchored(m){return !!m&&(TEXT_REF(m.text_key)||TEXT_REF(m.textKey)||object(m.source)&&(TEXT_REF(m.source.text_key)||TEXT_REF(m.source.textKey)));}
  function uniqueKeys(raw){
    var stack=[];
    for(var i=0;i<raw.length;i++){
      var c=raw[i];if(c==='{')stack.push(new Set());else if(c==='[')stack.push(null);else if(c==='}'||c===']')stack.pop();
      else if(c==='"'){
        var start=i;for(i++;i<raw.length;i++){if(raw[i]==='\\'){i++;continue;}if(raw[i]==='"')break;}
        var next=i+1;while(/\s/.test(raw[next]||'')&&next<raw.length)next++;
        if(raw[next]===':'){var key=JSON.parse(raw.slice(start,i+1)),keys=stack[stack.length-1];if(!keys||keys.has(key))fail('ATLAS_PROGRESS_DUPLICATE_METADATA');keys.add(key);}
      }
    }
  }
  function meta(v){
    if(typeof v!=='string'||v.length>16384)fail('ATLAS_PROGRESS_METADATA');
    var m=jsonObject(v);uniqueKeys(v);fields(m,META);return m;
  }
  var WORD_RULES={lemma_key:ID,status:one(STATUS),updated_at:date,srs_due:nullable(date),srs_interval:DAYS,srs_reps:COUNTER,srs_lapses:COUNTER,srs_text_key:nullable(TEXT_REF),srs_sentence_id:nullable(BLOCK_REF),srs_order_index:nullable(COUNTER),srs_surface:nullable(WORD),srs_stability:nullable(DAYS),srs_difficulty:nullable(v=>number(v,10)),srs_reviewed_at:nullable(date),srs_scheme:nullable(one(['fsrs','sm2','sm2-lite','manual-mark']))};
  function word(row){
    required(row,W);fields(row,WORD_RULES);
    if(!TERM.test(row.lemma_key)&&(/^at1:/.test(row.lemma_key)||!TEXT_REF(row.srs_text_key)))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    return row;
  }
  var REVIEW_RULES={id:ID,item_key:ID,kind:one(['review','skip','seed','mark','annul']),reviewed_at:date,grade:nullable(GRADE),source:TOKEN,channel:nullable(TOKEN),latency_ms:nullable(COUNTER),meta_json:v=>typeof v==='string'&&v.length<=16384};
  function review(row){
    required(row,R);fields(row,REVIEW_RULES);var m=meta(row.meta_json);
    if(!TERM.test(row.item_key)&&(/^at1:/.test(row.item_key)||!anchored(m)))fail('ATLAS_PROGRESS_FOREIGN_SOURCE');
    if(row.kind==='review'||row.kind==='skip')check(row.grade,GRADE);else if(row.grade!==null)fail('ATLAS_PROGRESS_SCHEMA');
    if(row.kind==='annul'&&!Object.hasOwn(m,'annul_of'))fail('ATLAS_PROGRESS_SCHEMA');
    return row;
  }
  function parseList(raw){if(raw==null)return [];try{var v=JSON.parse(raw);if(Array.isArray(v))return v;}catch(_){}fail('ATLAS_PROGRESS_HISTORY_SCHEMA');}
  var HISTORY_RULES={id:pattern(FIND,256),sid:pattern(/^s[0-9]{2}-[a-z0-9-]+$/,96),section:v=>typeof v==='boolean',page:one(['exact','near','wrong']),ms:COUNTER,at:COUNTER};
  function history(list){var selected=[];for(var x of list){
    if(!object(x)||typeof x.id!=='string')fail('ATLAS_PROGRESS_HISTORY_SCHEMA');
    if(x.id.startsWith('find:a97001:')){required(x,Object.keys(HISTORY_RULES));fields(x,HISTORY_RULES);selected.push(x);}
    else if(!/^find:a[0-9]+:p[1-9][0-9]*:[A-Za-z0-9:_-]+$/.test(x.id))fail('ATLAS_PROGRESS_HISTORY_SCHEMA');
  }return selected;}
  function stale(list){var selected=[];for(var x of list){
    if(typeof x!=='string')fail('ATLAS_PROGRESS_HISTORY_SCHEMA');
    if(x.startsWith('find:a97001:')){check(x,pattern(FIND,256));selected.push(x);}
    else if(!/^find:a[0-9]+:p[1-9][0-9]*:[A-Za-z0-9:_-]+$/.test(x))fail('ATLAS_PROGRESS_HISTORY_SCHEMA');
  }return selected;}
  function pairs(cols){return cols.map(k=>"'"+k+"',"+k).join(',');}
  // This fixed SELECT is only used behind the committed worker guard; one SELECT alone is insufficient inside a caller transaction.
  var SQL="SELECT 'word_status' AS record_type,json_object("+pairs(W)+") AS record_json FROM word_status WHERE lemma_key LIKE 'at1:a97001:%' OR srs_text_key LIKE 'atlas-block-v1:a97001:%' UNION ALL SELECT 'review_log',json_object("+pairs(R)+") FROM review_log WHERE item_key LIKE 'at1:a97001:%' OR (json_valid(meta_json) AND (json_extract(meta_json,'$.text_key') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.textKey') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.source.text_key') LIKE 'atlas-block-v1:a97001:%' OR json_extract(meta_json,'$.source.textKey') LIKE 'atlas-block-v1:a97001:%'))";
  async function digest(value,cryptoApi){
    var c=cryptoApi||(typeof globalThis!=='undefined'&&globalThis.crypto);if(!c||!c.subtle)fail('ATLAS_PROGRESS_CRYPTO');
    var b=await c.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
  }
  async function capture(options){
    var db=options&&options.db,storage=options&&options.storage;
    if(!db||typeof db.getOwnershipState!=='function'||db.getOwnershipState()!=='shared'||typeof db.dbAtlasProgressSnapshot!=='function')fail('ATLAS_PROGRESS_DB_NOT_OPEN');
    if(!storage||typeof storage.getItem!=='function')fail('ATLAS_PROGRESS_STORAGE_UNAVAILABLE');
    var rawHistory=storage.getItem(HISTORY),rawStale=storage.getItem(STALE),rows=await db.dbAtlasProgressSnapshot(),ws=[],rl=[];
    if(!Array.isArray(rows))fail('ATLAS_PROGRESS_SCHEMA');
    for(var row of rows){required(row,['record_type','record_json']);var v=jsonObject(row.record_json);if(row.record_type==='word_status')ws.push(word(v));else if(row.record_type==='review_log')rl.push(review(v));else fail('ATLAS_PROGRESS_SCHEMA');}
    if(rawHistory!==storage.getItem(HISTORY)||rawStale!==storage.getItem(STALE))fail('ATLAS_PROGRESS_SOURCE_CHANGED');
    ws.sort((a,b)=>a.lemma_key.localeCompare(b.lemma_key));rl.sort((a,b)=>a.id.localeCompare(b.id));
    var body={schema:SCHEMA,atlas_id:ATLAS,captured_at:new Date().toISOString(),scope:SCOPE,word_status:ws,review_log:rl,find_history:history(parseList(rawHistory)),find_stale:stale(parseList(rawStale))};
    return Object.assign(body,{integrity_sha256:await digest(body,options.crypto)});
  }
  async function validate(snapshot,cryptoApi){
    jsonTree(snapshot,new Set(),0);
    required(snapshot,['schema','atlas_id','captured_at','scope','word_status','review_log','find_history','find_stale','integrity_sha256']);
    if(snapshot.schema!==SCHEMA||snapshot.atlas_id!==ATLAS||snapshot.scope!==SCOPE||!date(snapshot.captured_at)||typeof snapshot.integrity_sha256!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.integrity_sha256))fail('ATLAS_PROGRESS_SCHEMA');
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
  return {capture:capture,validate:validate,mount:mount,SQL:SQL,wordColumns:W.slice(),reviewColumns:R.slice(),schema:SCHEMA,metadataFields:Object.freeze(Object.keys(META))};
});
