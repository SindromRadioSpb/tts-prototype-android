(function(){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const text={
    ru:{title:'Восстановить синхронизацию',intro:'Текст и перевод сохранятся. Новая версия заменит только временную разметку; прежняя версия останется в истории.',unavailable:'Для этой карточки нет редактируемой привязки к исходному видео.',subtitle:'Загрузить проверенные субтитры SRT/VTT',row:'Номер реплики',start:'Начало, секунды',end:'Конец, секунды',set:'Применить время к реплике',manual:'Ручная разметка',quote:'Рассчитать стоимость проверки',run:'Запустить проверку за ≈ ${price}',cost:'Три контрольных участка: ≈ ${price}. Перевод не повторяется. Проверка может восстановить только часть строк. Повторные запросы автоматически не выполняются.',key:'Добавьте ключ Gemini в настройках Студии.',confirm:'Я проверил соответствие выбранному видео и прослушал изменённые интервалы.',save:'Сохранить новую разметку',close:'Закрыть',stop:'Остановить после текущего запроса',coverage:'Размечено реплик: {n} из {total}.',waiting:'Проверяется участок {n} из {total}…',saved:'Новая разметка сохранена. Откройте карточку заново. Прежние архивы остаются прежними; новый экспорт включает исправление.',error:'Не удалось выполнить действие. Скачайте данные проверки перед закрытием окна. Если карточка изменилась, откройте восстановление заново.',export:'Скачать данные проверки',noMarks:'Нет пригодных интервалов для сохранения.',stale:'Карточка или её разметка изменились. Откройте восстановление заново.',done:'Проверка завершена. Просмотрите интервалы перед сохранением.'},
    en:{title:'Restore synchronization',intro:'Text and translation stay unchanged. A new version replaces timing only; the previous version remains in history.',unavailable:'This card has no editable binding to its original video.',subtitle:'Load verified SRT/VTT subtitles',row:'Utterance number',start:'Start, seconds',end:'End, seconds',set:'Apply timing to utterance',manual:'Manual timing',quote:'Estimate verification cost',run:'Run verification for ≈ ${price}',cost:'Three sample windows: ≈ ${price}. Translation is not repeated. Verification may restore only some rows. Failed calls are not retried automatically.',key:'Add your Gemini key in Studio settings.',confirm:'I checked the selected video and listened to the changed intervals.',save:'Save new timing',close:'Close',stop:'Stop after current request',coverage:'Timed utterances: {n} of {total}.',waiting:'Checking window {n} of {total}…',saved:'New timing saved. Reopen the card. Existing archives remain unchanged; a new export includes the repair.',error:'Could not complete the action. Download verification data before closing this window. If the card changed, reopen timing recovery.',export:'Download verification data',noMarks:'No usable intervals to save.',stale:'The card or its timing changed. Reopen recovery.',done:'Verification finished. Review intervals before saving.'},
    he:{title:'שחזור סנכרון',intro:'הטקסט והתרגום יישמרו. גרסה חדשה תחליף רק את התזמון; הגרסה הקודמת תישאר בהיסטוריה.',unavailable:'לכרטיס אין קישור ניתן לעריכה לסרטון המקורי.',subtitle:'טעינת כתוביות SRT/VTT בדוקות',row:'מספר קטע',start:'התחלה בשניות',end:'סיום בשניות',set:'החלת התזמון על הקטע',manual:'תזמון ידני',quote:'חישוב עלות הבדיקה',run:'הפעלת בדיקה תמורת ≈ ${price}',cost:'שלושה קטעי בדיקה: ≈ ${price}. התרגום לא יחזור. ייתכן שיחזור של חלק מהשורות בלבד. בקשות שנכשלו לא יישלחו שוב אוטומטית.',key:'הוסיפו מפתח Gemini בהגדרות הסטודיו.',confirm:'בדקתי את ההתאמה לסרטון והאזנתי לקטעים שהשתנו.',save:'שמירת תזמון חדש',close:'סגירה',stop:'עצירה לאחר הבקשה הנוכחית',coverage:'קטעים מתוזמנים: {n} מתוך {total}.',waiting:'בודקים קטע {n} מתוך {total}…',saved:'התזמון נשמר. פתחו את הכרטיס מחדש. ארכיונים קודמים לא השתנו; ייצוא חדש יכלול את התיקון.',error:'לא ניתן להשלים. הורידו את נתוני הבדיקה לפני סגירת החלון. אם הכרטיס השתנה, פתחו שוב את השחזור.',export:'הורדת נתוני הבדיקה',noMarks:'אין זמנים תקינים לשמירה.',stale:'הכרטיס או התזמון השתנו. פתחו שוב את השחזור.',done:'הבדיקה הסתיימה. בדקו את הזמנים לפני שמירה.'}
  };
  const tr=(key,values={})=>Object.entries(values).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',String(v)),(text[document.documentElement.lang]||text.ru)[key]||key);
  function journal(key,value){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('linguistpro-timing-repair-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('evidence');req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{const db=req.result,tx=db.transaction('evidence',value===undefined?'readonly':'readwrite'),store=tx.objectStore('evidence');
      const op=value===undefined?store.get(key):store.put(copy(value),key);let result;
      op.onsuccess=()=>{result=op.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};
  });}
  async function context(id){
    const ctx=await StudyVideoSourceUI.context(id),repo=StudioMediaPackage.browserRepository();
    if(PlaybackSource.isPublished(PlaybackSource.parseMeta(ctx.card.source_meta_json)))throw new Error('TIMING_REPAIR_READ_ONLY');
    const binding=await repo.getTextBinding(String(id));if(!binding)throw new Error('TIMING_REPAIR_UNAVAILABLE');
    const revision=await repo.getRevision(binding.revision_id),media=await repo.getPackage(binding.package_id);
    const projection=StudioMediaPackage.buildCompatibilityProjection(revision,{kind:'captions',media});
    const selected=ctx.record&&PlaybackSource.selected(ctx.record),video=projection.captions.video;
    if(!selected?.source||!video||selected.source.video_id!==video.videoId)throw new Error('TIMING_SOURCE_MISMATCH');
    const rows=await ctx.ldb.dbQuery('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index',[String(id)]);
    return {...ctx,id:String(id),repo,binding,revision,media,rowsSnapshot:JSON.stringify(rows),
      source:{video_id:video.videoId,url:video.url,durationSec:media.duration_ms/1000},
      journalKey:String(id)+':'+revision.revision_id+':'+video.videoId};
  }
  function proposed(ctx,times,authority){
    if(times.length!==ctx.revision.segments.length)throw new Error('TIMING_REPAIR_TEXT_CHANGED');
    return ctx.revision.segments.map((s,i)=>{
      if(times[i].text!==s.text)throw new Error('TIMING_REPAIR_TEXT_CHANGED');
      const valid=times[i].startSec!=null&&times[i].endSec!=null;
      return {...s,start_ms:valid?Math.round(times[i].startSec*1000):null,end_ms:valid?Math.round(times[i].endSec*1000):null,
        quality_flags:[...(s.quality_flags||[]).filter(f=>f!=='blind'),...(valid?[]:['blind'])],
        authority:{...s.authority,timing:valid?authority:'unknown'}};
    });
  }
  async function apply(ctx,times,evidence,authority){
    if(!times.some(s=>s.startSec!=null&&s.endSec!=null))throw new Error('TIMING_REPAIR_EMPTY');
    const materialRepo=MaterialRevisionRepository.createRepository(ctx.ldb,MaterialRevisionCore);
    return ctx.repo.commitTimingRepair({text_id:ctx.id,expected_binding_json:JSON.stringify(ctx.binding),
      expected_source_meta_json:ctx.card.source_meta_json,expected_rows_json:ctx.rowsSnapshot,
      segments:proposed(ctx,times,authority),author_kind:authority==='user'?'user':'provider',
      mapping:StudioMediaPackage.verifiedRowMapping(ctx.revision,ctx.binding,ctx.rows),
      provenance:{schema:'timing-repair-v1',source:ctx.source,evidence:copy(evidence),preserves_text:true},
      onTimingBinding:(old,next)=>materialRepo.rebindTimingWithinTransaction(ctx.id,old,next),
      prepareSourceMeta:async(revision,binding,media)=>{
        const meta=PlaybackSource.parseMeta(ctx.card.source_meta_json),audio=StudioMediaPackage.buildExactBindingPassport(revision,binding,media);
        const projection=StudioMediaPackage.buildCompatibilityProjection(revision,{kind:'captions',media});
        meta.source={...(meta.source||{}),...projection};
        meta.source.captions=audio;delete meta.source.audio;
        meta.timing_repair={schema:'timing-repair-v1',previous_revision_id:ctx.revision.revision_id,revision_id:revision.revision_id,
          playable:times.filter(s=>s.startSec!=null).length,total:times.length};
        meta.playback_source=PlaybackSource.append(meta.playback_source,{url:ctx.source.url,offset_ms:0},
          {basis_sha256:await PlaybackSource.timingBasis(audio,ctx.rows)});
        return JSON.stringify(meta);
      }});
  }
  async function open(id){
    const d=document.createElement('dialog');d.className='study-source-dialog';d.setAttribute('aria-label',tr('title'));
    const el=(tag,value)=>{const n=document.createElement(tag);if(value)n.textContent=value;return n;};
    d.append(el('h2',tr('title')),el('p',tr('intro')));document.body.append(d);d.showModal();
    const oldFocus=document.activeElement;d.addEventListener('close',()=>{d.remove();oldFocus?.focus();});
    const status=el('p');status.setAttribute('role','status');d.append(status);
    const button=(parent,key,fn)=>{const b=el('button',tr(key));b.type='button';b.onclick=async()=>{if(d.dataset.running==='true'&&!['stop','close'].includes(key))return;b.disabled=true;try{await fn();}catch(e){status.textContent=tr(String(e.message).includes('STALE')?'stale':'error');status.dataset.code=e.code||e.message;}finally{b.disabled=false;}};parent.append(b);return b;};
    let ctx;try{ctx=await context(id);}catch(e){status.textContent=tr('unavailable');status.dataset.code=e.message;button(d,'close',()=>d.close());return d;}
    const link=el('a',ctx.source.url);link.href=ctx.source.url;link.target='_blank';link.rel='noopener noreferrer';d.append(link);
    let times=ctx.revision.segments.map(s=>({text:s.text,startSec:s.start_ms==null?null:s.start_ms/1000,endSec:s.end_ms==null?null:s.end_ms/1000}));
    const savedMeta=PlaybackSource.parseMeta(ctx.card.source_meta_json);
    let evidence=await journal(ctx.journalKey)||savedMeta.source?.captions?.captions?.timing_evidence||null,authority='user',stopped=false,running=false;
    if(evidence?.source?.video_id===ctx.source.video_id&&evidence.timeline?.length===times.length&&evidence.timeline.every((s,i)=>s.text===times[i].text)){
      if(evidence.schema==='youtube-asr-timing-evidence-v2'){times=YoutubeTiming.diagnose(evidence).segments;authority='provider';}
    }
    if(evidence?.proposed?.length===times.length&&evidence.proposed.every((s,i)=>s.text===times[i].text))times=copy(evidence.proposed);
    const coverage=el('p'),preview=el('pre');preview.style.cssText='max-height:220px;overflow:auto;white-space:pre-wrap';d.append(coverage,preview);
    const confirmed=el('input');confirmed.type='checkbox';const check=el('label',tr('confirm'));check.prepend(confirmed);
    const update=()=>{confirmed.checked=false;coverage.textContent=tr('coverage',{n:times.filter(s=>s.startSec!=null).length,total:times.length});preview.textContent=times.map((s,i)=>(i+1)+'. '+(s.startSec==null?'—':s.startSec+'–'+s.endSec)+'  '+s.text).join('\n');};update();
    const fileLabel=el('label',tr('subtitle')),file=el('input');file.type='file';file.accept='.srt,.vtt';fileLabel.append(file);d.append(fileLabel);
    file.onchange=async()=>{try{const raw=await file.files[0].text(),cues=MediaPackageCore.parseSubtitles(raw).segments;
      times=YoutubeTiming.fromSubtitles(times,cues,ctx.source.durationSec).map((s,i)=>({...s,text:times[i].text}));
      evidence={schema:'timing-subtitles-v1',source:ctx.source,raw,proposed:times};authority='user';await journal(ctx.journalKey,evidence);update();
    }catch(e){status.textContent=tr('error');status.dataset.code=e.message;}};
    const manual=el('details');manual.append(el('summary',tr('manual')));const controls={};
    for(const key of ['row','start','end']){const label=el('label',tr(key)),input=el('input');input.type='number';input.step=key==='row'?'1':'0.001';input.min=key==='row'?'1':'0';input.max=String(key==='row'?times.length:ctx.source.durationSec);input.value=key==='row'?'1':'';label.append(input);manual.append(label);controls[key]=input;}
    button(manual,'set',async()=>{const i=Number(controls.row.value)-1,start=Number(controls.start.value),end=Number(controls.end.value);
      if(!Number.isInteger(i)||!times[i]||!controls.start.value||!controls.end.value||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>ctx.source.durationSec)throw new Error('SEGMENT_TIMING_INVALID');
      times[i]={...times[i],startSec:start,endSec:end};evidence={schema:'timing-manual-v1',source:ctx.source,previous:evidence?.schema==='timing-manual-v1'?evidence.previous:evidence,proposed:copy(times)};authority='user';await journal(ctx.journalKey,evidence);update();});d.append(manual);
    const paid=el('div'),price=el('p');d.append(paid,price);let quote=null;
    const key=()=>typeof window.geminiKeyGet==='function'?window.geminiKeyGet():localStorage.getItem('v3.geminiApiKey')||'';
    const run=button(paid,'run',async()=>{
      if(!quote||!key())throw new Error('TIMING_QUOTE_REQUIRED');
      const work=async lock=>{if(!lock)throw new Error('TIMING_REPAIR_BUSY');
      const fresh=await context(ctx.id);if(fresh.rowsSnapshot!==ctx.rowsSnapshot||fresh.card.source_meta_json!==ctx.card.source_meta_json||JSON.stringify(fresh.binding)!==JSON.stringify(ctx.binding))throw new Error('TIMING_REPAIR_STALE');
      evidence=await journal(ctx.journalKey)||evidence;
      running=true;d.dataset.running='true';stopped=false;file.disabled=true;manual.hidden=true;
      try{const prior=evidence?.schema==='youtube-asr-timing-evidence-v2'?evidence:null;
        const timeline=prior?prior.timeline:times.map(s=>({...s}));
        const result=await YoutubeAsr.verifySavedTiming({fetch:(u,i)=>fetch(u,i),apiKey:key(),shouldStop:()=>stopped,savedTimingEvidence:prior},ctx.source,timeline,quote,
          (_,at)=>{status.textContent=tr('waiting',{n:(at.index||0)+1,total:at.total});},async value=>{evidence=value;await journal(ctx.journalKey,value);});
        times=result.diagnosis.segments;authority='provider';update();status.textContent=tr('done');
      }finally{running=false;delete d.dataset.running;file.disabled=false;manual.hidden=false;run.hidden=true;quote=null;}
      };
      if(navigator.locks)await navigator.locks.request('linguistpro-timing-verification:'+ctx.id,{ifAvailable:true},work);else await work(true);
    });run.hidden=true;
    button(paid,'quote',async()=>{if(!key()){status.textContent=tr('key');return;}const estimate=await YoutubeAsr.estimate({fetch:(u,i)=>fetch(u,i),apiKey:key()},ctx.source.url);
      if(estimate.durationSec!==ctx.source.durationSec)throw new Error('TIMING_SOURCE_MISMATCH');quote=estimate.timingQuote;price.textContent=tr('cost',{price:quote.estimatedUsd.toFixed(4)});run.textContent=tr('run',{price:quote.estimatedUsd.toFixed(4)});run.hidden=false;});
    button(paid,'stop',()=>{stopped=true;});
    d.append(check);const actions=el('div');actions.className='study-source-actions';d.append(actions);
    button(actions,'save',async()=>{if(running||!confirmed.checked)throw new Error('TIMING_REVIEW_REQUIRED');
      const work=async lock=>{if(!lock)throw new Error('TIMING_REPAIR_BUSY');await apply(ctx,times,evidence||{schema:'manual-review'},authority);};
      if(navigator.locks)await navigator.locks.request('linguistpro-material-preparation',{ifAvailable:true},work);else await work(true);
      status.textContent=tr('saved');actions.querySelectorAll('button').forEach(b=>{b.disabled=true;});
      window.dispatchEvent(new CustomEvent('playback-source-changed',{detail:{textId:ctx.id}}));
    });
    button(actions,'export',()=>{const u=URL.createObjectURL(new Blob([JSON.stringify({source:ctx.source,base_revision_id:ctx.revision.revision_id,evidence,proposed:times},null,2)],{type:'application/json'}));const a=el('a');a.href=u;a.download='timing-review-'+ctx.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
    button(actions,'close',()=>{if(running){stopped=true;return;}d.close();});d.oncancel=e=>{if(running){e.preventDefault();stopped=true;}};return d;
  }
  window.StudyTimingRepair={open,context,apply,proposed,journal};
})();
