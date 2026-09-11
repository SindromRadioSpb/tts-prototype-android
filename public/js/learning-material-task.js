// Resumable orchestration over the existing import, table, save and package engines.
// This journal is temporary work, never learner/SRS state and never provider credentials.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LearningMaterialTask=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCHEMA='learning-material-task-v1',MAX_BYTES=20*1024*1024,MAX_TASKS=10;
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
  async function create(input){
    // P5: материал начинается ЛИБО с готового текста, ЛИБО со ссылки, транскрипт за которую
    // задача добудет и заплатит сама. Ссылка проверяется тем же разбором, что и канон источника.
    const link=input&&input.youtube_source?youtubeSource(input.youtube_source):null;
    if(!input||(!String(input.source_text||'').trim()&&!link)||!String(input.title||'').trim()||!['gemini','gcp','google-free','madlad'].includes(input.provider))throw new Error('TASK_INPUT_INVALID');
    const source=safe({source_text:input.source_text||'',youtube_source:link,title:input.title,import_meta:input.import_meta||null,provider:input.provider,model:input.model||null,translit_profile:input.translit_profile||'learner-latin',direction:input.direction||'he-ru'});
    return {schema:SCHEMA,id:crypto.randomUUID(),signature:await P().digest(JSON.stringify(source)),input:source,phase:'imported',state:'paused',cancel_requested:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),transcript:null,table:null,saved_text_id:null,playback_bound:null,package:null,stage_times:{},error:null};
  }
  function createStore(){
    const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('linguistpro-material-tasks-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('tasks',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    async function transaction(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('tasks',mode);let value;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('TASK_STORAGE_FAILED'));fn(tx.objectStore('tasks'),v=>value=v,tx);});}finally{db.close();}}
    return {
      list:()=>transaction('readonly',(s,done)=>{const r=s.getAll();r.onsuccess=()=>done(r.result.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)));}),
      get:id=>transaction('readonly',(s,done)=>{const r=s.get(id);r.onsuccess=()=>done(r.result||null);}),
      add:job=>transaction('readwrite',(s,done,tx)=>{const r=s.count();r.onsuccess=()=>{if(r.result>=MAX_TASKS){tx.abort();return;}s.add(safe(job));done(job);};}),
      update:(id,mutate)=>transaction('readwrite',(s,done,tx)=>{const r=s.get(id);r.onsuccess=()=>{try{if(!r.result)throw new Error('TASK_MISSING');const value=safe(mutate(r.result));value.updated_at=new Date().toISOString();s.put(value);done(value);}catch(_){tx.abort();}};}),
      remove:id=>transaction('readwrite',(s,done)=>{s.delete(id);done(true);})
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
        await update({cancel_requested:false,state:'running',error:null});
        if(job.input.youtube_source&&!job.transcript){
          await update({phase:'transcribing'});
          const transcript=await operations.transcribe(clone(job.input),job.id);
          if(!transcript||!String(transcript.text||'').trim())throw new Error('TASK_TRANSCRIPT_INCOMPLETE');
          job=await update({transcript:safe(transcript),phase:'transcribed'});
        }
        if(await cancelled())return await update({state:'cancelled'});
        if(!job.table){
          await update({phase:'translating'});
          // Таблица всегда строится из уже оплаченного транскрипта, а не из повторного запроса.
          const table=await operations.translate(clone(job.transcript?{...job.input,source_text:job.transcript.text,import_meta:effectiveImportMeta(job)}:job.input),job.id);
          if(!table||!Array.isArray(table.rows)||!table.rows.length)throw new Error('TASK_TABLE_INCOMPLETE');
          job=await update({table:safe(table),phase:'table_ready'});
        }
        if(await cancelled())return await update({state:'cancelled'});
        if(!job.saved_text_id){
          await update({phase:'saving'});
          const saved=await operations.save(clone(job));
          if(!saved||!saved.id)throw new Error('TASK_SAVE_INCOMPLETE');
          job=await update({saved_text_id:String(saved.id),phase:'saved'});
        }
        if(await cancelled())return await update({state:'cancelled'});
        if(job.input.youtube_source&&!job.playback_bound){
          // «Источник видео» подставляется сам: пользователь больше не открывает метаданные руками.
          await update({phase:'binding'});
          const bound=await operations.bindPlaybackSource(clone(job),{url:job.input.youtube_source.url,offset_ms:0});
          if(!bound)throw new Error('TASK_BINDING_INCOMPLETE');
          job=await update({playback_bound:safe(bound),phase:'bound'});
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
        await update({state:'paused',error:String(error.code||error.message||'TASK_FAILED').slice(0,120)});throw error;
      }
      finally{active.delete(id);}
    }
    return {run,cancel:id=>store.update(id,old=>({...old,cancel_requested:true,state:active.has(id)?'stopping':'cancelled'})),isRunning:id=>active.has(id)};
  }
  return {SCHEMA,MAX_BYTES,MAX_TASKS,safe,create,createStore,createRunner,effectiveImportMeta,youtubeSource};
});
