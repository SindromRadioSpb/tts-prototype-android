// Resumable orchestration over the existing import, table, save and package engines.
// This journal is temporary work, never learner/SRS state and never provider credentials.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LearningMaterialTask=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCHEMA='learning-material-task-v1',MAX_BYTES=20*1024*1024;
  const P=()=>typeof require==='function'?require('./playback-source'):globalThis.PlaybackSource;
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
  function sourceText(job){return job.transcript?job.transcript.text:job.input.source_text;}
  const textIdentity=value=>String(value||'').normalize('NFD').replace(/[^\p{L}\p{N}]/gu,'');
  function assertSavedRows(job,rows){
    if(rows.length!==job.table.rows.length||rows.some((r,i)=>textIdentity(r.he_plain)!==textIdentity(job.table.rows[i].he)))throw new Error('TASK_SOURCE_MISMATCH');
  }
  async function tableReceipt(job,table){return {source_sha256:await P().digest(sourceText(job)),rows_sha256:await P().digest(JSON.stringify(table.rows))};}
  async function verifySource(job){
    if(await P().digest(JSON.stringify(job.input))!==job.signature)throw new Error('TASK_SOURCE_MISMATCH');
    if(job.input.youtube_source){
      if(!job.transcript)throw new Error('TASK_TRANSCRIPT_INCOMPLETE');
      assertVideoSource(job.input.youtube_source,job.transcript.import_meta);
      if(job.table&&textIdentity(job.table.rows.map(r=>r.he).join(''))!==textIdentity(sourceText(job)))throw new Error('TASK_SOURCE_MISMATCH');
    }
    if(job.table&&job.table.source_receipt){
      const receipt=await tableReceipt(job,job.table);
      if(JSON.stringify(receipt)!==JSON.stringify(job.table.source_receipt))throw new Error('TASK_SOURCE_MISMATCH');
    }
  }
  async function create(input){
    // P5: материал начинается ЛИБО с готового текста, ЛИБО со ссылки, транскрипт за которую
    // задача добудет и заплатит сама. Ссылка проверяется тем же разбором, что и канон источника.
    const link=input&&input.youtube_source?youtubeSource(input.youtube_source):null;
    if(!input||(input.youtube_source&&!link)||(!String(input.source_text||'').trim()&&!link)||!String(input.title||'').trim()||!['gemini','gcp','google-free','madlad'].includes(input.provider))throw new Error('TASK_INPUT_INVALID');
    // Согласованная цена — часть того, на что человек согласился, поэтому живёт в журнале задачи,
    // а не в переменной страницы: иначе возобновление её теряет и маршрут спрашивает заново.
    const source=safe({source_text:input.source_text||'',youtube_source:link,table_quote:input.table_quote||null,title:input.title,import_meta:input.import_meta||null,provider:input.provider,model:input.model||null,translit_profile:input.translit_profile||'learner-latin',direction:input.direction||'he-ru'});
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
        await update({cancel_requested:false,state:'running',error:null});
        if(job.input.youtube_source&&!job.transcript){
          await update({phase:'transcribing'});
          const transcript=await operations.transcribe(clone(job.input),job.id);
          if(!transcript||!String(transcript.text||'').trim())throw new Error('TASK_TRANSCRIPT_INCOMPLETE');
          job=await update({transcript:safe(transcript),phase:'transcribed'});
        }
        if(await cancelled())return await update({state:'cancelled'});
        await verifySource(job);
        if(!job.table){
          await update({phase:'translating'});
          // Таблица всегда строится из уже оплаченного транскрипта, а не из повторного запроса.
          const table=await operations.translate(clone(job.transcript?{...job.input,source_text:job.transcript.text,import_meta:effectiveImportMeta(job)}:job.input),job.id);
          if(!table||!Array.isArray(table.rows)||!table.rows.length)throw new Error('TASK_TABLE_INCOMPLETE');
          table.source_receipt=await tableReceipt(job,table);
          job=await update({table:safe(table),phase:'table_ready'});
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
        await update({state:'paused',error:String(error.code||error.message||'TASK_FAILED').slice(0,120)});throw error;
      }
      finally{active.delete(id);}
    }
    return {run,cancel:id=>store.update(id,old=>({...old,cancel_requested:true,state:active.has(id)?'stopping':'cancelled'})),isRunning:id=>active.has(id)};
  }
  return {SCHEMA,MAX_BYTES,safe,create,createStore,createRunner,effectiveImportMeta,youtubeSource,assertVideoSource,assertSavedRows,verifySource};
});
