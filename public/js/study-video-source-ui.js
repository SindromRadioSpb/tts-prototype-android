(function () {
  'use strict';
  const text = {
    ru:{open:'Видео и строки',source:'Источник видео',url:'Ссылка YouTube',offset:'Смещение, секунды (время видео − время таблицы)',preview:'Проверить видео и строки',confirmed:'Я сверил начало, середину и конец: строки соответствуют этому видео с указанным смещением',save:'Сохранить привязку',detach:'Отвязать YouTube',close:'Закрыть',history:'История источников',saved:'Привязка сохранена',error:'Не удалось выполнить действие. Проверьте ссылку и повторите открытие карточки.',missing:'Добавьте ссылку YouTube к этому материалу.',readOnly:'Источник опубликованного материала доступен только для чтения.',noTiming:'У таблицы нет подтверждаемой временной разметки. Видео можно сохранить без синхронизации.',note:'Положительное смещение сдвигает строки вперёд по видео. Предпросмотр позволяет проверить начало, середину и конец; вернитесь сюда для подтверждения.',replaced:'Без YouTube'},
    en:{open:'Video and rows',source:'Video source',url:'YouTube link',offset:'Offset, seconds (video time − table time)',preview:'Check video and rows',confirmed:'I checked the start, middle and end: the rows match this video with this offset',save:'Save video source',detach:'Detach YouTube',close:'Close',history:'Source history',saved:'Video source saved',error:'Could not complete the action. Check the link and reopen the material.',missing:'Add a YouTube link to this material.',readOnly:'Published video sources are read-only.',noTiming:'This table has no timing that can be confirmed. Video can be saved without synchronization.',note:'A positive offset moves rows forward in the video. Check the start, middle and end in preview; return here to confirm.',replaced:'No YouTube'},
    he:{open:'וידאו ושורות',source:'מקור הסרטון',url:'קישור YouTube',offset:'היסט בשניות (זמן הסרטון פחות זמן הטבלה)',preview:'בדיקת הסרטון והשורות',confirmed:'בדקתי את ההתחלה, האמצע והסוף: השורות תואמות לסרטון עם ההיסט הזה',save:'שמירת מקור הסרטון',detach:'ניתוק YouTube',close:'סגירה',history:'היסטוריית מקורות',saved:'מקור הסרטון נשמר',error:'הפעולה נכשלה. בדקו את הקישור ופתחו שוב את החומר.',missing:'הוסיפו קישור YouTube לחומר הזה.',readOnly:'מקור של חומר שפורסם זמין לקריאה בלבד.',noTiming:'אין בטבלה תזמון שניתן לאמת. אפשר לשמור סרטון ללא סנכרון.',note:'היסט חיובי מזיז את השורות קדימה בסרטון. בדקו את ההתחלה, האמצע והסוף בתצוגה המקדימה וחזרו לכאן לאישור.',replaced:'ללא YouTube'}
  };
  function locale(){return ['ru','en','he'].includes(document.documentElement.lang)?document.documentElement.lang:'ru';}
  function label(key){return text[locale()][key];}
  const playerText={
    ru:{youtube:'YouTube-видео',local:'Локальный файл',sourceGroup:'Источник воспроизведения',pending:'YouTube · синхронизация не подтверждена. Проверьте её в «Источник видео».',changed:'YouTube · строки или тайминги изменились. Проверьте синхронизацию заново.',ready:'YouTube · строки синхронизированы',denied:'YouTube запретил встраивание этого ролика. Проверьте источник видео или выберите локальный файл.',failed:'YouTube недоступен. Повторите воспроизведение или выберите локальный файл.',blocked:'Нажмите ▶ в самом плеере YouTube.',savedPending:'Привязка сохранена. Синхронизация не подтверждена.',savedReady:'Привязка сохранена. Синхронизация включена.',savedLocal:'YouTube отвязан. Доступен исходный локальный файл.'},
    en:{youtube:'YouTube video',local:'Local file',sourceGroup:'Playback source',pending:'YouTube · synchronization is unconfirmed. Check Video source.',changed:'YouTube · rows or timing changed. Check synchronization again.',ready:'YouTube · rows synchronized',denied:'YouTube does not allow this video to be embedded. Check Video source or use the local file.',failed:'YouTube is unavailable. Retry playback or use the local file.',blocked:'Press ▶ in the YouTube player.',savedPending:'Video source saved. Synchronization is unconfirmed.',savedReady:'Video source saved. Synchronization enabled.',savedLocal:'YouTube detached. The original local file is available.'},
    he:{youtube:'סרטון YouTube',local:'קובץ מקומי',sourceGroup:'מקור ההפעלה',pending:'YouTube · הסנכרון לא אושר. בדקו את מקור הסרטון.',changed:'YouTube · השורות או התזמון השתנו. בדקו שוב את הסנכרון.',ready:'YouTube · השורות מסונכרנות',denied:'YouTube אינו מאפשר להטמיע את הסרטון. בדקו את מקור הסרטון או בחרו בקובץ המקומי.',failed:'YouTube אינו זמין. נסו שוב או בחרו בקובץ המקומי.',blocked:'לחצו על ▶ בנגן YouTube.',savedPending:'מקור הסרטון נשמר. הסנכרון לא אושר.',savedReady:'מקור הסרטון נשמר. הסנכרון מופעל.',savedLocal:'YouTube נותק. הקובץ המקומי המקורי זמין.'}
  };
  function playbackNote(audio){const t=playerText[locale()];return audio.playbackReason?(audio.playbackReason==='PLAYBACK_TIMING_CHANGED'?t.changed:t.pending):t.ready;}
  function playerError(node,error){if(!node)return;node.dataset.youtubeError=String(error.ytCode || error || '');node.textContent=[101,150].includes(Number(error.ytCode || error))?playerText[locale()].denied:playerText[locale()].failed;}
  function watchPlayer(adapter,node,audio){adapter.addEventListener('error',e=>playerError(node,e));adapter.addEventListener('blocked',()=>{node.textContent=playerText[locale()].blocked;});adapter.addEventListener('play',()=>{delete node.dataset.youtubeError;node.textContent=playbackNote(audio);});}
  function playerActions(bar,options){
    if(!bar)return;let actions=bar.querySelector('.playback-source-actions');if(actions)actions.remove();
    if(!options.id)return;
    actions=document.createElement('div');actions.className='study-source-actions playback-source-actions';
    function button(parent,caption,fn,key,pressed){const b=document.createElement('button');b.type='button';b.textContent=caption;b.className='btn-secondary';b.dataset.playbackLabel=key;if(pressed!=null){b.dataset.playbackSource=key;b.setAttribute('aria-pressed',String(pressed));}if(fn)b.onclick=fn;parent.append(b);return b;}
    button(actions,label('source'),options.onSource,'source');
    const youtubeSelected=!!(options.audio && options.audio.playbackKind==='youtube');
    const hasYoutube=youtubeSelected || typeof options.onYoutube==='function';
    const switcher=document.createElement('div');switcher.className='playback-source-switcher';switcher.setAttribute('role','group');switcher.dataset.playbackGroupLabel='sourceGroup';switcher.setAttribute('aria-label',playerText[locale()].sourceGroup);
    if(options.local)button(switcher,playerText[locale()].local,youtubeSelected?options.onLocal:null,'local',!youtubeSelected);
    if(hasYoutube)button(switcher,playerText[locale()].youtube,youtubeSelected?null:options.onYoutube,'youtube',youtubeSelected);
    if(switcher.childElementCount)actions.append(switcher);
    const note=bar.querySelector('[id$="BarNote"]');
    if(note){delete note.dataset.youtubeError;if(options.audio && options.audio.playbackKind==='youtube')note.dataset.playbackReason=options.audio.playbackReason || '';else delete note.dataset.playbackReason;}
    bar.append(actions);
  }
  function compatibleShell(){
    const url=new URL(location.href);url.pathname=url.pathname.includes('library')?'/study-library.html':'/study-studio.html';
    if(typeof window.v3NavAwayWithDbClose==='function')return window.v3NavAwayWithDbClose(url.pathname+url.search+url.hash);
    location.assign(url.href);
  }
  function pauseEmbeddedVideo(){const player=window.StudioMediaKaraoke && StudioMediaKaraoke.getAudioEl();if(player && player.isYouTube)StudioMediaKaraoke.pause();}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')pauseEmbeddedVideo();});
  window.addEventListener('pagehide',pauseEmbeddedVideo);
  document.addEventListener('i18n:changed',()=>{
    document.querySelectorAll('[data-playback-label]').forEach(node=>{const key=node.dataset.playbackLabel;node.textContent=key==='source'?label(key):playerText[locale()][key];});
    document.querySelectorAll('[data-playback-group-label]').forEach(node=>node.setAttribute('aria-label',playerText[locale()][node.dataset.playbackGroupLabel]));
    document.querySelectorAll('[data-playback-reason]').forEach(node=>{if(!node.dataset.youtubeError)node.textContent=playbackNote({playbackReason:node.dataset.playbackReason || null});});
  });
  async function db(){
    const ldb=window.__localDB || (typeof window.ensureLocalDB==='function'?await window.ensureLocalDB():await import('/db/local-db.js?v=488'));
    // Cached tables can paint before the database worker finishes initialization.
    // The module reference alone is not a readiness signal.
    if(typeof ldb.initLocalDB==='function')await ldb.initLocalDB();
    return ldb;
  }
  async function context(id){
    const ldb=await db(), card=await ldb.getTextById(String(id));if(!card)throw new Error('PLAYBACK_TEXT_MISSING');
    const sentences=await ldb.getSentences(String(id));
    const rows=sentences.map(row=>({...row,he:row.he || row.he_plain || '',ru:row.ru || '',tr:row.tr || row.translit || ''}));
    let audio=MediaHost.passportFromTextRow(card);if(audio)MediaHost.restoreForRows(audio,rows);
    if(window.StudioMediaPackage)try{const active=await StudioMediaPackage.activateTextBinding(String(id));audio=MediaHost.pickExactBindingPassport(audio,active && active.media_passport,rows.length);}catch(_){}
    if(audio)MediaHost.restoreForRows(audio,rows);
    const record=PlaybackSource.fromText(card,audio);
    return {ldb,card,rows,audio,record,basis:await PlaybackSource.timingBasis(audio,rows)};
  }
  function returnPath(id){const raw=JSON.stringify({v:1,type:'text',id:String(id)});const bytes=new TextEncoder().encode(raw);const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return '/index.html?room=1#/t/'+encoded;}
  async function launch(ctx,record,preview,target){
    const view=await PlaybackSource.youtubeView(ctx.audio,ctx.rows,record);
    if(!view.video)throw new Error('PLAYBACK_SOURCE_MISSING');
    // Preview uses a temporary assertion solely to audition the proposed mapping. No DB write.
    const token=await StudyVideoTransfer.put({schema:1,title:ctx.card.title,video_id:view.video.videoId,locale:locale(),return_path:returnPath(ctx.card.id),
      reason:preview?'PREVIEW':view.reason,rows:ctx.rows.map(row=>({he:row.he_niqqud || row.he,ru:row.ru,tr:row.tr})),entries:view.entries});
    try{if(window.v3StopRowAudio)window.v3StopRowAudio();if(window.StudioMediaKaraoke)StudioMediaKaraoke.stop();}catch(_){}
    (target || window).location.assign('/study-video.html#'+token);
  }
  async function open(id){const ctx=await context(id);if(!ctx.record || !PlaybackSource.selected(ctx.record).source)return manage(id);if(window.StudyVideoInlineOpen)return window.StudyVideoInlineOpen(id);return launch(ctx,ctx.record,false);}
  async function manage(id){
    const ctx=await context(id), t=text[locale()], oldFocus=document.activeElement;
    const dialog=document.createElement('dialog');dialog.className='study-source-dialog';dialog.setAttribute('aria-label',t.source);
    const h=document.createElement('h2');h.textContent=t.source;dialog.append(h);
    const status=document.createElement('p');status.setAttribute('role','status');
    function field(caption,input){const wrap=document.createElement('label');wrap.textContent=caption;wrap.append(input);dialog.append(wrap);}
    const url=document.createElement('input');url.type='url';url.dir='ltr';url.placeholder='https://www.youtube.com/watch?v=…';
    const offset=document.createElement('input');offset.type='number';offset.step='.001';offset.min='-10800';offset.max='10800';offset.value='0';
    const current=ctx.record?PlaybackSource.selected(ctx.record):null;
    if(current && current.source){url.value=current.source.url;offset.value=String(current.offset_ms/1000);}
    field(t.url,url);field(t.offset,offset);
    const note=document.createElement('p');note.textContent=ctx.basis?t.note:t.noTiming;dialog.append(note);
    const confirm=document.createElement('input');confirm.type='checkbox';confirm.disabled=!ctx.basis;field(t.confirmed,confirm);
    confirm.checked=!!(current && current.timing.status==='owner-confirmed' && current.timing.basis_sha256===ctx.basis);
    const reset=()=>{confirm.checked=false;};url.oninput=reset;offset.oninput=reset;
    const actions=document.createElement('div');actions.className='study-source-actions';dialog.append(actions,status);
    const input=()=>({url:url.value,offset_ms:Math.round(Number(offset.value)*1000),confirmed:confirm.checked});
    const published=PlaybackSource.isPublished(PlaybackSource.parseMeta(ctx.card.source_meta_json));
    function button(caption,action){const b=document.createElement('button');b.type='button';b.textContent=caption;b.onclick=async()=>{b.disabled=true;try{await action();}catch(error){status.textContent=t.error;status.dataset.code=error.code || error.message;}finally{b.disabled=false;}};actions.append(b);return b;}
    button(t.preview,async()=>{
      const target=window.open('about:blank','_blank');
      if(!target)throw new Error('PLAYBACK_POPUP_BLOCKED');
      target.opener=null;
      try{const proposal=PlaybackSource.append(null,{...input(),confirmed:!!ctx.basis},{basis_sha256:ctx.basis});await launch(ctx,proposal,true,target);}
      catch(error){target.close();throw error;}
    });
    const repo=PlaybackSource.createRepository(ctx.ldb);
    async function save(remove){
      const fresh=await context(id);
      if(fresh.basis!==ctx.basis)throw new Error('PLAYBACK_TIMING_CHANGED');
      ctx.record=await repo.save(id,remove?{remove:true}:input(),{expected_revision:ctx.explicitRevision,basis_sha256:ctx.basis});
      ctx.explicitRevision=ctx.record.revision;status.textContent=playerText[locale()][remove?'savedLocal':confirm.checked?'savedReady':'savedPending'];renderHistory();
      window.dispatchEvent(new CustomEvent('playback-source-changed',{detail:{textId:String(id)}}));
    }
    const explicit=PlaybackSource.parseMeta(ctx.card.source_meta_json).playback_source;ctx.explicitRevision=explicit?explicit.revision:0;
    if(!published){button(t.save,()=>save(false));button(t.detach,()=>save(true));}else{url.readOnly=true;offset.readOnly=true;confirm.disabled=true;status.textContent=t.readOnly;}
    button(t.close,()=>dialog.close());
    const history=document.createElement('details'), summary=document.createElement('summary'), list=document.createElement('ol');summary.textContent=t.history;history.append(summary,list);dialog.append(history);
    function renderHistory(){list.replaceChildren();if(ctx.record)ctx.record.history.forEach(entry=>{const li=document.createElement('li');li.textContent=(entry.source?entry.source.url:t.replaced)+' · '+entry.offset_ms/1000+' s';list.append(li);});}renderHistory();
    dialog.addEventListener('close',()=>{dialog.remove();if(oldFocus && oldFocus.isConnected)oldFocus.focus();});document.body.append(dialog);dialog.showModal();url.focus();
  }
  window.StudyVideoSourceUI={open,manage,context,launch,label,playbackNote,playerError,watchPlayer,playerActions,compatibleShell};
})();
