/* Local tutor conversation history. No learner grades or cloud sync. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.LPTutorNotebook=api;})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const NAME='lp-tutor-notebook-v1',LIMIT=200;
  function validate(record){
    if(!record||record.schema!==1||record.status!=='accepted'||!record.context?.source)throw Error('invalid_archive');
    const c=record.context,s=c.source;
    if(!['studio','room','mediatheque','review'].includes(c.surface)||!['ru','en','he'].includes(c.locale)||c.instructional_intent!=='explain')throw Error('invalid_archive');
    if(!['local_snapshot','caption'].includes(s.kind)||!['material_id','revision_id','sentence_id','excerpt'].every(k=>typeof s[k]==='string'&&s[k].length>0))throw Error('invalid_archive');
    if(record.session_id!=null&&(typeof record.session_id!=='string'||!/^[a-f0-9-]{36}$/.test(record.session_id)))throw Error('invalid_archive');
    if(typeof record.question!=='string'||typeof record.answer!=='string'||!record.answer||record.question.length>1000||record.answer.length>16000||s.excerpt.length>8000||JSON.stringify(record).length>40000)throw Error('invalid_archive');
    return JSON.parse(JSON.stringify(record));
  }
  function createStore(indexedDB){
    let opening;
    const db=()=>opening||(opening=new Promise((resolve,reject)=>{const q=indexedDB.open(NAME,1);q.onupgradeneeded=()=>{const s=q.result.createObjectStore('explanations',{keyPath:'id'});s.createIndex('owner','owner');};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}));
    async function run(mode,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('explanations',mode);let result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('storage_unavailable'));fn(tx.objectStore('explanations'),v=>result=v,tx);});}
    async function digest(owner,clean){
      const bytes=new TextEncoder().encode(JSON.stringify([String(owner),clean.context.source,clean.session_id||'',clean.question,clean.answer]));
      return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    }
    return {
      async list(owner){if(!owner)throw Error('owner_required');return run('readonly',(s,done)=>{const q=s.index('owner').getAll(String(owner));q.onsuccess=()=>done(q.result.sort((a,b)=>b.saved_at-a.saved_at));});},
      async save(owner,record){
        if(!owner)throw Error('owner_required');const clean=validate(record);
        const id=await digest(owner,clean);
        return run('readwrite',(s,done,tx)=>{const q=s.index('owner').getAll(String(owner));q.onsuccess=()=>{if(q.result.length>=LIMIT&&!q.result.some(r=>r.id===id)){tx.abort();return;}const row={...clean,id,owner:String(owner),saved_at:Date.now()};s.put(row);done(row);};});
      },
      async remove(owner,id){return run('readwrite',(s,done)=>{const q=s.get(id);q.onsuccess=()=>{if(q.result?.owner===String(owner))s.delete(id);done(true);};});},
      async removeAll(owner){if(!owner)throw Error('owner_required');return run('readwrite',(s,done)=>{const q=s.index('owner').getAll(String(owner));q.onsuccess=()=>{for(const row of q.result)s.delete(row.id);done(q.result.length);};});},
      async exportBundle(owner){if(!owner)throw Error('owner_required');const rows=await this.list(owner);return {schema:'lp-tutor-notebook.1',owner_id:String(owner),records:rows.map(({owner:omitOwner,id,...record})=>validate(record))};},
      async importBundle(owner,bundle){
        if(!owner)throw Error('owner_required');
        if(!bundle||bundle.schema!=='lp-tutor-notebook.1'||bundle.owner_id!==String(owner)||!Array.isArray(bundle.records)||bundle.records.length>LIMIT)throw Error('invalid_archive_bundle');
        const entries=[];
        for(const raw of bundle.records){if(!raw||'owner'in raw||'id'in raw)throw Error('invalid_archive_bundle');const clean=validate(raw);entries.push({...clean,id:await digest(owner,clean),owner:String(owner),saved_at:Number.isFinite(raw.saved_at)&&raw.saved_at>0?raw.saved_at:Date.now()});}
        return run('readwrite',(s,done,tx)=>{const q=s.index('owner').getAll(String(owner));q.onsuccess=()=>{const existing=new Set(q.result.map(r=>r.id)),fresh=new Map();for(const row of entries)if(!existing.has(row.id))fresh.set(row.id,row);if(existing.size+fresh.size>LIMIT){tx.abort();return;}for(const row of fresh.values())s.put(row);done({imported:fresh.size,existing:entries.length-fresh.size});};});
      },
    };
  }
  const copy={
    ru:{title:'История с наставником',local:'Хранится в этом браузере. Можно вернуться к любому разговору.',empty:'Пока нет разговоров с наставником.',close:'Закрыть',open:'Открыть разговор',export:'Скачать',remove:'Удалить',failed:'Не удалось сохранить или открыть историю. Проверьте место в браузере.',stale:'Исходный фрагмент изменился. Это объяснение относится к сохранённой версии.',snapshot:'Фрагмент · ответ ИИ не проверен преподавателем',exportAll:'Скачать все',importAll:'Восстановить из файла',deleteAll:'Удалить все',importConfirm:'Восстановить сохранённые объяснения из файла для этого аккаунта?',deleteConfirm:'Удалить все сохранённые объяснения этого аккаунта в этом браузере?',imported:'Объяснения восстановлены.',wrongAccount:'Файл относится к другому аккаунту или повреждён.',restoreFailed:'Не удалось восстановить объяснения. Проверьте файл и свободное место.',notIncluded:'Объяснения не вошли в ZIP: войдите в аккаунт.'},
    en:{title:'Tutor conversations',local:'Saved in this browser so you can return to a conversation.',empty:'No tutor conversations yet.',close:'Close',open:'Open conversation',export:'Download',remove:'Delete',failed:'Storage could not be opened. Check available browser storage.',stale:'The source passage has changed. This explanation refers to the saved version.',snapshot:'Saved passage · AI answer not reviewed by a teacher',exportAll:'Download all',importAll:'Restore from file',deleteAll:'Delete all',importConfirm:'Restore saved explanations from this file for this account?',deleteConfirm:'Delete all saved explanations for this account in this browser?',imported:'Explanations restored.',wrongAccount:'This file belongs to another account or is invalid.',restoreFailed:'Could not restore explanations. Check the file and available storage.',notIncluded:'Explanations were left out of the ZIP: sign in first.'},
    he:{title:'שיחות עם המורה',local:'השיחות נשמרות בדפדפן הזה ואפשר לחזור אליהן.',empty:'עדיין אין שיחות עם המורה.',close:'סגירה',open:'פתיחת שיחה',export:'הורדה',remove:'מחיקה',failed:'לא ניתן לפתוח את האחסון. בדקו את המקום הפנוי בדפדפן.',stale:'קטע המקור השתנה. ההסבר מתייחס לגרסה השמורה.',snapshot:'קטע שמור · תשובת AI לא נבדקה בידי מורה',exportAll:'הורדת הכול',importAll:'שחזור מקובץ',deleteAll:'מחיקת הכול',importConfirm:'לשחזר הסברים שמורים מהקובץ לחשבון הזה?',deleteConfirm:'למחוק את כל ההסברים השמורים של החשבון הזה בדפדפן?',imported:'ההסברים שוחזרו.',wrongAccount:'הקובץ שייך לחשבון אחר או אינו תקין.',restoreFailed:'לא ניתן לשחזר את ההסברים. בדקו את הקובץ ואת המקום הפנוי.',notIncluded:'ההסברים לא נכללו בקובץ ZIP: יש להתחבר לחשבון.'}
  };
  let store;
  const local=()=>store||(store=createStore(window.indexedDB));
  const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text||'';return n;};
  async function show({api,locale='ru',currentSource,onContinue,management=false}){
    const c=copy[locale]||copy.ru,origin=document.activeElement,dialog=el('dialog');dialog.setAttribute('data-lp-tutor','');dialog.setAttribute('aria-label',c.title);
    dialog.style.cssText='width:min(620px,calc(100vw - 28px));max-height:calc(100dvh - 28px);border:1px solid #bbc9be;border-radius:18px;padding:22px;background:#f9f8f3;color:#203c36;';
    const host=el('div');dialog.append(host);const shadow=host.attachShadow({mode:'open'});
    const style=el('style','*{box-sizing:border-box}h2{margin:0 0 12px}p{line-height:1.65;overflow-wrap:anywhere;white-space:pre-wrap}article{border-top:1px solid #bccbbe;padding:18px 0}button{font:inherit;min-height:44px;padding:10px 14px;border:1px solid #aabdaf;border-radius:9px;background:transparent;color:inherit;cursor:pointer}button:focus-visible,summary:focus-visible{outline:3px solid #51866d;outline-offset:3px}.actions{display:flex;gap:8px;flex-wrap:wrap}summary{cursor:pointer;padding:12px 0;overflow-wrap:anywhere}blockquote{margin:12px 0;padding:12px;background:#edf0e5;font-size:22px;white-space:pre-wrap;overflow-wrap:anywhere}small{line-height:1.6;display:block;color:#52695e}');shadow.append(style);
    const section=el('section');section.dir=locale==='he'?'rtl':'ltr';shadow.append(section);
    section.append(el('h2',c.title),el('p',c.local));const close=el('button',c.close);close.onclick=()=>dialog.close();section.append(close);
    const list=el('div');section.append(list);document.body.append(dialog);dialog.showModal();close.focus();
    dialog.addEventListener('close',()=>{dialog.remove();origin?.focus();});
    try{
      const owner=await api.identity();
      const controls=el('div');controls.className='actions';section.insertBefore(controls,list);
      const message=el('p');message.setAttribute('role','status');section.insertBefore(message,list);
      const downloadBundle=el('button',c.exportAll),uploadBundle=el('button',c.importAll),deleteBundle=el('button',c.deleteAll),input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
      if(management)controls.append(downloadBundle,uploadBundle,deleteBundle,input);
      downloadBundle.onclick=async()=>{try{if(await api.identity()!==owner)return;const bundle=await local().exportBundle(owner);if(!dialog.open||await api.identity()!==owner)return;const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));const link=el('a');link.href=url;link.download='linguistpro-explanations.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(_){message.textContent=c.failed;}};
      uploadBundle.onclick=()=>input.click();
      input.onchange=async()=>{const file=input.files?.[0];input.value='';if(!file)return;try{if(await api.identity()!==owner)return;const bundle=JSON.parse(await file.text());if(!dialog.open||await api.identity()!==owner||!window.confirm(c.importConfirm))return;if(await api.identity()!==owner)return;await local().importBundle(owner,bundle);message.textContent=c.imported;await paint();}catch(_){message.textContent=c.wrongAccount;}};
      deleteBundle.onclick=async()=>{try{if(await api.identity()!==owner||!window.confirm(c.deleteConfirm))return;await local().removeAll(owner);await paint();close.focus();}catch(_){message.textContent=c.failed;}};
      async function paint(){
        const rows=await local().list(owner);if(!dialog.open)return;list.replaceChildren();
        if(!rows.length)list.append(el('p',c.empty));
        for(const row of rows){
          validate(row);const a=el('article'),details=el('details'),summary=el('summary',row.question||row.context.source.excerpt);summary.dir='auto';details.append(summary);
          const source=el('blockquote',row.context.source.excerpt),answer=el('p',row.answer);source.dir='rtl';answer.dir='auto';details.append(el('small',c.snapshot),source,answer);
          if(currentSource?.material_id===row.context.source.material_id&&currentSource.revision_id!==row.context.source.revision_id)details.append(el('p',c.stale));
          const actions=el('div');actions.className='actions';
          if(onContinue){const open=el('button',c.open);open.onclick=async()=>{try{if(await api.identity()!==owner)return;dialog.close();await onContinue(row);}catch(_){list.append(el('p',c.failed));}};actions.append(open);}
          const download=el('button',c.export);download.onclick=async()=>{try{if(await api.identity()!==owner)return;const{owner:omitOwner,id,...portable}=row;const url=URL.createObjectURL(new Blob([JSON.stringify(portable,null,2)],{type:'application/json'}));const link=el('a');link.href=url;link.download='linguistpro-explanation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(_){list.append(el('p',c.failed));}};
          const remove=el('button',c.remove);remove.onclick=async()=>{try{if(await api.identity()!==owner)return;await local().remove(owner,row.id);await paint();close.focus();}catch(_){list.append(el('p',c.failed));}};
          if(management)actions.append(download,remove);details.append(actions);a.append(details);list.append(a);
        }
      }
      await paint();
    }catch(_){list.append(el('p',c.failed));}
  }
  return {validate,createStore,local,show,copy};
});
