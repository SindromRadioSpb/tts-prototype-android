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
  async function create(input){
    if(!input||!String(input.source_text||'').trim()||!String(input.title||'').trim()||!['gemini','gcp','google-free','madlad'].includes(input.provider))throw new Error('TASK_INPUT_INVALID');
    const source=safe({source_text:input.source_text,title:input.title,import_meta:input.import_meta||null,provider:input.provider,model:input.model||null,translit_profile:input.translit_profile||'learner-latin',direction:input.direction||'he-ru'});
    return {schema:SCHEMA,id:crypto.randomUUID(),signature:await P().digest(JSON.stringify(source)),input:source,phase:'imported',state:'paused',cancel_requested:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),table:null,saved_text_id:null,package:null,error:null};
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
  function createRunner(store,operations){
    const active=new Set();
    async function run(id,onChange){
      if(active.has(id))throw new Error('TASK_ALREADY_RUNNING');active.add(id);
      const update=async patch=>{const job=await store.update(id,old=>({...old,...patch}));if(onChange)onChange(job);return job;};
      const cancelled=async()=>!!(await store.get(id)).cancel_requested;
      try{
        let job=await store.get(id);if(!job||job.schema!==SCHEMA)throw new Error('TASK_MISSING');
        await update({cancel_requested:false,state:'running',error:null});
        if(!job.table){
          await update({phase:'translating'});
          const table=await operations.translate(clone(job.input),job.id);
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
        if(!job.package){
          await update({phase:'exporting'});
          const artifact=await operations.preparePackage(clone(job));
          if(!artifact||!artifact.sha256)throw new Error('TASK_PACKAGE_INCOMPLETE');
          job=await update({package:safe(artifact),phase:'ready'});
        }
        return await update({state:(await cancelled())?'cancelled':'ready'});
      }catch(error){await update({state:'paused',error:String(error.code||error.message||'TASK_FAILED').slice(0,120)});throw error;}
      finally{active.delete(id);}
    }
    return {run,cancel:id=>store.update(id,old=>({...old,cancel_requested:true,state:active.has(id)?'stopping':'cancelled'})),isRunning:id=>active.has(id)};
  }
  return {SCHEMA,MAX_BYTES,MAX_TASKS,safe,create,createStore,createRunner};
});
