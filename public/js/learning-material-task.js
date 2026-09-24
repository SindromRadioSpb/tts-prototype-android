// Resumable orchestration over the existing import, table, save and package engines.
// This journal is temporary work, never learner/SRS state and never provider credentials.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LearningMaterialTask=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCHEMA='learning-material-task-v1',MAX_BYTES=20*1024*1024;
  const P=()=>typeof require==='function'?require('./playback-source'):globalThis.PlaybackSource;
  const R=()=>typeof require==='function'?require('./table-source-recovery'):globalThis.TableSourceRecovery;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function safe(value){
    function walk(v,depth){if(depth>64)throw new Error('TASK_INPUT_INVALID');if(!v||typeof v!=='object')return;
      for(const [key,child]of Object.entries(v)){if(/api.?key|access.?token|secret|password|private.?key|review_log|word_status|srs_/i.test(key))throw new Error('TASK_PRIVATE_DATA');walk(child,depth+1);}}
    walk(value,0);if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)throw new Error('TASK_TOO_LARGE');return clone(value);
  }
  function youtubeSource(value){
    const id=P().parseVideoId(value&&value.url);
    if(!id||(value.video_id&&value.video_id!==id))return null;
    return {video_id:id,url:P().canonicalUrl(id)};
  }
  // Один ответ на вопрос «откуда этот текст» для ВСЕХ потребителей задачи: транскрипт, который
  // задача оплатила, приносит свой провенанс сам и перекрывает пустой провенанс входа.
  function effectiveImportMeta(job){return (job&&job.transcript&&job.transcript.import_meta)||(job&&job.input&&job.input.import_meta)||null;}
  function assertVideoSource(expected,meta){
    if(!expected)return;
    const videos=[meta&&meta.video,meta&&meta.captions&&meta.captions.video,
      meta&&meta.source&&meta.source.captions&&meta.source.captions.video];
    if(meta&&meta.playback_source)videos.push(P().selected(meta.playback_source).source);
    const present=videos.filter(Boolean);
    if(!present.length||present.some(v=>{
      const id=v.video_id||v.videoId;
      return id!==expected.video_id||(v.url&&P().parseVideoId(v.url)!==id);
    }))throw new Error('TASK_SOURCE_MISMATCH');
  }
  // Медиа-задача: у транскрипта есть пакет медиа. Её таблица и карточка обязаны доказать медиа,
  // иначе потеря привязки проходит молча до конца (владелец, «Хан Юнес», 2026-09-24).
  function hasMedia(job){const meta=effectiveImportMeta(job);return !!(meta&&meta.media_package_ref);}
  function codeError(code){const e=new Error(code);e.code=code;return e;}
  function sourceText(job){return job.transcript?job.transcript.text:job.input.source_text;}
  const textIdentity=value=>String(value||'').normalize('NFD').replace(/[^\p{L}\p{N}]/gu,'');
  function assertSavedRows(job,rows){
    if(rows.length!==job.table.rows.length||rows.some((r,i)=>textIdentity(r.he_plain)!==textIdentity(job.table.rows[i].he)))throw new Error('TASK_SOURCE_MISMATCH');
  }
  async function tableReceipt(job,table){return {source_sha256:await P().digest(sourceText(job)),rows_sha256:await P().digest(JSON.stringify(table.rows))};}
  async function verifyIntegrity(job){
    if(await P().digest(JSON.stringify(job.input))!==job.signature)throw new Error('TASK_SOURCE_MISMATCH');
    if(job.input.youtube_source){
      if(!job.transcript)throw new Error('TASK_TRANSCRIPT_INCOMPLETE');
      assertVideoSource(job.input.youtube_source,job.transcript.import_meta);
    }
    if(job.table&&job.table.source_receipt){
      const receipt=await tableReceipt(job,job.table);
      if(JSON.stringify(receipt)!==JSON.stringify(job.table.source_receipt))throw new Error('TASK_SOURCE_MISMATCH');
    }
    const archive=job.table?.source_recovery;
    if(archive){
      const original=archive.original_table||{rows:job.table.rows.map(r=>r.source_recovery?.original||r)};
      const expected=archive.original_table?.source_receipt||archive.original_receipt;
      if(!expected||JSON.stringify(await tableReceipt(job,original))!==JSON.stringify(expected))throw new Error('TASK_SOURCE_MISMATCH');
    }
  }
  async function verifySource(job){
    await verifyIntegrity(job);
    if(job.input.youtube_source&&job.table&&textIdentity(job.table.rows.map(r=>r.he).join(''))!==textIdentity(sourceText(job)))throw new Error('TASK_SOURCE_MISMATCH');
  }
  async function recoverSourceTable(job){
    await verifyIntegrity(job); // Do not re-sign changed input or corrupted paid results.
    if(!job.input.youtube_source||!job.table||textIdentity(job.table.rows.map(r=>r.he).join(''))===textIdentity(sourceText(job)))return null;
    if(job.saved_text_id||!job.table.source_receipt||!R())throw new Error('TASK_SOURCE_MISMATCH');
    const segments=job.transcript.import_meta?.captions?.segments;
    const rows=job.table.rows;
    if(!Array.isArray(segments)||segments.length!==rows.length||textIdentity(segments.map(s=>s.text).join(''))!==textIdentity(sourceText(job)))throw new Error('TASK_SOURCE_MISMATCH');
    const repaired=rows.map((row,i)=>{
      if(row.segment_index!==i)throw new Error('TASK_SOURCE_MISMATCH');
      if(textIdentity(row.he)===textIdentity(segments[i].text))return clone(row);
      const fixed=R().recoverRow(row,segments[i].text);
      if(!fixed)throw new Error('TASK_SOURCE_MISMATCH');
      return fixed;
    });
    const indexes=repaired.flatMap((r,i)=>r.source_recovery?[i]:[]);
    if(indexes.length>3)throw new Error('TASK_SOURCE_MISMATCH');
    const table={...clone(job.table),rows:repaired,source_recovery:{version:R().VERSION,row_indexes:indexes,original_table:clone(job.table)}};
    table.source_receipt=await tableReceipt(job,table);
    await verifySource({...job,table});
    return table;
  }
  // A review is bound to the immutable transcript and the retained table receipt.
  // Many rows may belong to one segment; comparing whole groups preserves splits.
  async function sourceReview(job){
    await verifyIntegrity(job);
    if(!job.input.youtube_source||!job.table||job.saved_text_id||!job.table.source_receipt)throw new Error('TASK_SOURCE_MISMATCH');
    const segments=job.transcript.import_meta?.captions?.segments;
    if(!Array.isArray(segments)||textIdentity(segments.map(s=>s.text).join(''))!==textIdentity(sourceText(job)))throw new Error('TASK_SOURCE_MISMATCH');
    const groups=segments.map((s,i)=>({segment_index:i,source:s.text,rows:[],row_indexes:[]}));
    let previous=-1;
    job.table.rows.forEach((row,i)=>{
      const index=row.segment_index;
      if(!Number.isInteger(index)||index<previous||!groups[index])throw new Error('TASK_SOURCE_MISMATCH');
      previous=index;groups[index].rows.push(clone(row));groups[index].row_indexes.push(i);
    });
    return {receipt:clone(job.table.source_receipt),groups:groups.filter(g=>textIdentity(g.rows.map(r=>r.he).join(''))!==textIdentity(g.source))};
  }
  async function applySourceReview(job,review,choices){
    const current=await sourceReview(job);
    if(JSON.stringify(current)!==JSON.stringify(review)||!current.groups.length||!Array.isArray(choices)||choices.length!==current.groups.length)throw new Error('TASK_SOURCE_MISMATCH');
    const replacements=new Map();
    for(const group of current.groups){
      const selected=choices.filter(c=>c.segment_index===group.segment_index);
      if(selected.length!==1||selected[0].confirmed!==true||!String(selected[0].ru||'').trim())throw new Error('TASK_REVIEW_INCOMPLETE');
      replacements.set(group.segment_index,{segment_index:group.segment_index,he:group.source,ru:String(selected[0].ru).trim(),he_niqqud:'',translit:'',niqqud_status:'not_vocalized',
        translation_provider:'manual',translation_meta_json:JSON.stringify({provider:'manual',reviewed:true,task_id:job.id}),
        source_recovery:{version:'source-review-v1',translit_status:'unavailable',reviewed:true}});
    }
    const rows=[];
    const segments=job.transcript.import_meta.captions.segments;
    for(let i=0;i<segments.length;i++)rows.push(...(replacements.has(i)?[replacements.get(i)]:job.table.rows.filter(r=>r.segment_index===i).map(clone)));
    const table={...clone(job.table),rows,source_recovery:{version:'source-review-v1',original_table:clone(job.table),segment_indexes:[...replacements.keys()]}};
    table.source_receipt=await tableReceipt(job,table);
    await verifySource({...job,table});
    return table;
  }
  async function sourceDiagnosis(job){
    if(await P().digest(JSON.stringify(job.input))!==job.signature)return 'input';
    try{if(job.input.youtube_source)assertVideoSource(job.input.youtube_source,job.transcript?.import_meta);}catch(_){return 'video';}
    try{await verifyIntegrity(job);}catch(_){return 'receipt';}
    if(job.saved_text_id)return 'saved';
    try{const review=await sourceReview(job);return review.groups.length?'table':'mapping';}catch(_){return 'mapping';}
  }
  async function create(input){
    // P5: материал начинается ЛИБО с готового текста, ЛИБО со ссылки, транскрипт за которую
    // задача добудет и заплатит сама. Ссылка проверяется тем же разбором, что и канон источника.
    const link=input&&input.youtube_source?youtubeSource(input.youtube_source):null;
    if(!input||(input.youtube_source&&!link)||(!String(input.source_text||'').trim()&&!link)||!String(input.title||'').trim()||!['gemini','gcp','google-free','madlad'].includes(input.provider))throw new Error('TASK_INPUT_INVALID');
    // Согласованная цена — часть того, на что человек согласился, поэтому живёт в журнале задачи,
    // а не в переменной страницы: иначе возобновление её теряет и маршрут спрашивает заново.
    const source=safe({source_text:input.source_text||'',youtube_source:link,table_quote:input.table_quote||null,...(input.timing_quote?{timing_quote:input.timing_quote}:{}),title:input.title,import_meta:input.import_meta||null,provider:input.provider,model:input.model||null,translit_profile:input.translit_profile||'learner-latin',direction:input.direction||'he-ru'});
    return {schema:SCHEMA,id:crypto.randomUUID(),signature:await P().digest(JSON.stringify(source)),input:source,phase:'imported',state:'paused',cancel_requested:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),transcript:null,table:null,saved_text_id:null,playback_bound:null,package:null,stage_times:{},error:null};
  }
  function createStore(){
    const open=()=>new Promise((resolve,reject)=>{
      const r=indexedDB.open('linguistpro-material-tasks-v1',2);
      r.onupgradeneeded=()=>{
        const db=r.result;
        if(!db.objectStoreNames.contains('tasks'))db.createObjectStore('tasks',{keyPath:'id'});
        if(!db.objectStoreNames.contains('completed'))db.createObjectStore('completed',{keyPath:'id'});
        // Move old completed jobs atomically, retaining every paid result.
        const active=r.transaction.objectStore('tasks'),history=r.transaction.objectStore('completed');
        const cursor=active.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;
          if(c.value.state==='ready'){history.put(c.value);c.delete();}c.continue();};
      };
      r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
      r.onerror=()=>reject(r.error);
      r.onblocked=()=>reject(new Error('TASK_STORAGE_UPGRADE_BLOCKED'));
    });
    async function transaction(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction(['tasks','completed'],mode);let value,failure;
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(failure||tx.error);
      tx.onabort=()=>reject(failure||tx.error||new Error('TASK_STORAGE_FAILED'));
      fn(tx.objectStore('tasks'),tx.objectStore('completed'),v=>value=v,error=>{failure=error;tx.abort();});
    });}finally{db.close();}}
    const sorted=rows=>rows.sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
    return {
      list:()=>transaction('readonly',(s,h,done)=>{const r=s.getAll();r.onsuccess=()=>done(sorted(r.result));}),
      listCompleted:()=>transaction('readonly',(s,h,done)=>{const r=h.getAll();r.onsuccess=()=>done(sorted(r.result));}),
      get:id=>transaction('readonly',(s,h,done)=>{const r=s.get(id);r.onsuccess=()=>{
        if(r.result){done(r.result);return;}const old=h.get(id);old.onsuccess=()=>done(old.result||null);};}),
      add:job=>transaction('readwrite',(s,h,done,abort)=>{try{s.add(safe(job));done(job);}catch(e){abort(e);}}),
      update:(id,mutate)=>transaction('readwrite',(s,h,done,abort)=>{
        const apply=(old,from)=>{try{if(!old)throw new Error('TASK_MISSING');const value=safe(mutate(old));
          value.updated_at=new Date().toISOString();const target=value.state==='ready'?h:s;
          target.put(value);if(from.name!==target.name)from.delete(id);done(value);
        }catch(e){abort(e);}};
        const r=s.get(id);r.onsuccess=()=>{if(r.result){apply(r.result,s);return;}
          const old=h.get(id);old.onsuccess=()=>apply(old.result,h);};}),
      remove:id=>transaction('readwrite',(s,h,done)=>{s.delete(id);h.delete(id);done(true);})
    };
  }
  // An explicit provider change may recover a saved transcript, but cannot rewrite a paid
  // translation, a saved card, or the video identity. Re-sign the complete input atomically.
  async function switchTranslationProvider(store,id,provider,model){
    if(provider!=='gemini'||!String(model||'').trim())throw new Error('TASK_PROVIDER_INVALID');
    const old=await store.get(id);
    if(!old||old.state==='running'||!old.transcript||old.table||old.saved_text_id)throw new Error('TASK_PROVIDER_CHANGE_BLOCKED');
    const source=safe({...old.input,provider,model:String(model)});
    const signature=await P().digest(JSON.stringify(source));
    return store.update(id,current=>{
      if(current.signature!==old.signature||current.state==='running'||!current.transcript||current.table||current.saved_text_id)throw new Error('TASK_SOURCE_MISMATCH');
      return {...current,input:source,signature,error:null,error_reason:null};
    });
  }
  function closeOpen(times,now){const out={...(times||{})};for(const k of Object.keys(out))if(out[k]&&!out[k].endedAt)out[k]={...out[k],endedAt:now};return out;}
  function createRunner(store,operations){
    const active=new Set();
    async function run(id,onChange){
      if(active.has(id))throw new Error('TASK_ALREADY_RUNNING');active.add(id);
      // Время этапов пишет ОДНО место — переход фазы. Отдельный секундомер в UI мерил бы, сколько
      // открыт диалог, а не сколько работал этап, и врал бы после перезагрузки и возобновления.
      const update=async patch=>{
        const job=await store.update(id,old=>{
          const next={...old,...patch};
          // ЛЮБОЕ объявление фазы заводит ей свежие часы: повтор того же этапа после сбоя — это
          // новая попытка, и мерить её от первой значило бы показать время, которого не было.
          if(patch.phase){
            const now=Date.now(),times={...(old.stage_times||{})};
            if(old.phase&&times[old.phase]&&!times[old.phase].endedAt)times[old.phase]={...times[old.phase],endedAt:now};
            times[patch.phase]={startedAt:now};   // повтор этапа заводит СВОИ часы, а не продолжает старые
            next.stage_times=times;
          }
          return next;
        });
        if(onChange)onChange(job);
        return job;
      };
      const cancelled=async()=>!!(await store.get(id)).cancel_requested;
      try{
        let job=await store.get(id);if(!job||job.schema!==SCHEMA)throw new Error('TASK_MISSING');
        if(await P().digest(JSON.stringify(job.input))!==job.signature)throw new Error('TASK_SOURCE_MISMATCH');
        await update({cancel_requested:false,state:'running',error:null,error_reason:null});
        if(job.input.youtube_source&&!job.transcript){
          await update({phase:'transcribing'});
          const transcript=await operations.transcribe(clone(job.input),job.id);
          if(!transcript||!String(transcript.text||'').trim())throw new Error('TASK_TRANSCRIPT_INCOMPLETE');
          job=await update({transcript:safe(transcript),asr_checkpoint:null,phase:'transcribed'});
        }
        if(await cancelled())return await update({state:'cancelled'});
        const recovered=await recoverSourceTable(job);
        if(recovered)job=await update({table:safe(recovered)});
        await verifySource(job);
        if(!job.table){
          await update({phase:'translating'});
          // Таблица всегда строится из уже оплаченного транскрипта, а не из повторного запроса.
          const table=await operations.translate(clone(job.transcript?{...job.input,source_text:job.transcript.text,import_meta:effectiveImportMeta(job)}:job.input),job.id);
          if(!table||!Array.isArray(table.rows)||!table.rows.length)throw new Error('TASK_TABLE_INCOMPLETE');
          // Без номера реплики у строки нет ▶: такая таблица для медиа-материала не результат.
          if(hasMedia(job)&&!table.rows.every(r=>Number.isInteger(r&&r.segment_index)))throw codeError('TASK_TABLE_UNSEGMENTED');
          table.source_receipt=await tableReceipt(job,table);
          job=await update({table:safe(table),phase:'table_ready'});
        }
        const freshRecovery=await recoverSourceTable(job);
        if(freshRecovery)job=await update({table:safe(freshRecovery)});
        if(job.table.rows.some(r=>r.source_recovery?.translit_status==='pending')&&operations.completeSourceRecovery){
          const table=clone(job.table);
          await operations.completeSourceRecovery(table,clone(job.input));
          table.source_receipt=await tableReceipt(job,table);
          job=await update({table:safe(table)});
        }
        await verifySource(job);
        if(await cancelled())return await update({state:'cancelled'});
        if(!job.saved_text_id){
          await update({phase:'saving'});
          const saved=await operations.save(clone(job));
          if(!saved||!saved.id)throw new Error('TASK_SAVE_INCOMPLETE');
          job=await update({saved_text_id:String(saved.id),phase:'saved'});
        }
        if(await cancelled())return await update({state:'cancelled'});
        if(job.input.youtube_source)await operations.verifySaved(clone(job));
        if(job.input.youtube_source&&!job.playback_bound){
          // «Источник видео» подставляется сам: пользователь больше не открывает метаданные руками.
          await update({phase:'binding'});
          const bound=await operations.bindPlaybackSource(clone(job),{url:job.input.youtube_source.url,offset_ms:0});
          if(!bound)throw new Error('TASK_BINDING_INCOMPLETE');
          job=await update({playback_bound:safe(bound),phase:'bound'});
        }
        if(job.input.youtube_source)await operations.verifySaved(clone(job));
        // ⑥ Привязка ▶ доказывается подсчётом на сохранённой карточке тем же путём, что рисует Зал.
        if(hasMedia(job)&&operations.provePlayback&&!job.playback_proof){
          await update({phase:'binding'});
          const proof=await operations.provePlayback(clone(job));
          // Часы распознавания не подтверждены: ▶ честно нет ни у одной строки, и «Продолжить» этого не
          // исправит. Такой итог принимается и называется на финале, а не стопорит задачу навсегда.
          const clockUnverified=!!(job.transcript&&job.transcript.blind);
          if(!proof||(!(Number(proof.bound_rows)>0)&&!clockUnverified))throw codeError('TASK_PLAYBACK_UNBOUND');
          job=await update({playback_proof:safe(proof),phase:'bound'});
        }
        if(await cancelled())return await update({state:'cancelled'});
        if(!job.package){
          await update({phase:'exporting'});
          const artifact=await operations.preparePackage(clone(job));
          if(!artifact||!artifact.sha256)throw new Error('TASK_PACKAGE_INCOMPLETE');
          job=await update({package:safe(artifact),phase:'ready'});
        }
        const finishedAt=Date.now();
        return await update({state:(await cancelled())?'cancelled':'ready',
          stage_times:closeOpen((await store.get(id)).stage_times,finishedAt)});
      }catch(error){
        if(error&&error.code==='TASK_CANCELLED'){await update({state:'cancelled',error:null});return await store.get(id);}
        const code=String(error.code||error.message||'TASK_FAILED').slice(0,120);
        let reason=error&&error.reason?String(error.reason).slice(0,120):null;
        if(code==='TASK_SOURCE_MISMATCH')try{reason=await sourceDiagnosis(await store.get(id));}catch(_){}
        await update({state:'paused',error:code,error_reason:reason});throw error;
      }
      finally{active.delete(id);}
    }
    return {run,cancel:id=>store.update(id,old=>({...old,cancel_requested:true,state:active.has(id)?'stopping':'cancelled'})),isRunning:id=>active.has(id)};
  }
  return {SCHEMA,MAX_BYTES,safe,create,createStore,createRunner,switchTranslationProvider,effectiveImportMeta,youtubeSource,assertVideoSource,assertSavedRows,verifySource,recoverSourceTable,sourceReview,applySourceReview,sourceDiagnosis};
});
