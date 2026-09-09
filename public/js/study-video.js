(async function () {
  'use strict';
  window.addEventListener('hashchange',()=>location.reload());
  const $ = id => document.getElementById(id);
  const labels = {
    ru:{title:'Видео и учебные строки',back:'← К материалу',load:'Открыть видео',retry:'Попробовать снова',loading:'Подключаем YouTube…',ready:'Видео готово. Нажмите воспроизведение в плеере.',missing:'Снимок просмотра истёк или недоступен. Откройте видео снова из материала.',offline:'Нет сети. Учебные строки доступны; видео требует интернета.',unverified:'Видео доступно. Синхронизация строк не подтверждена.',verified:'Выберите повтор у строки, чтобы прослушать её фрагмент.',blocked:'Нажмите воспроизведение в самом плеере.',error:'Видео сейчас недоступно для встраивания. Можно открыть его на YouTube; таблица остаётся доступной.',seek:'Не удалось подтвердить перемотку. Повторите действие в плеере.',he:'Иврит',ru:'Перевод',repeat:'Повтор',row:'Повторить фрагмент строки'},
    en:{title:'Video and study rows',back:'← Back to material',load:'Open video',retry:'Try again',loading:'Connecting to YouTube…',ready:'Video ready. Press play in the player.',missing:'This viewing snapshot expired or is unavailable. Open video again from the material.',offline:'Offline. Study rows are available; video needs an internet connection.',unverified:'Video is available. Row synchronization has not been verified.',verified:'Choose a row replay button to hear its segment.',blocked:'Press play inside the video player.',error:'Video cannot be embedded right now. Open it on YouTube; the study table remains available.',seek:'Seek could not be confirmed. Try again in the player.',he:'Hebrew',ru:'Translation',repeat:'Replay',row:'Replay segment for row'},
    he:{title:'וידאו ושורות לימוד',back:'← חזרה לחומר',load:'פתיחת הסרטון',retry:'ניסיון נוסף',loading:'מתחברים ל־YouTube…',ready:'הסרטון מוכן. לחצו על ניגון בנגן.',missing:'תצוגת החומר פגה או אינה זמינה. פתחו שוב את הסרטון מתוך החומר.',offline:'אין חיבור לרשת. שורות הלימוד זמינות; הסרטון דורש אינטרנט.',unverified:'הסרטון זמין. סנכרון השורות לא אומת.',verified:'בחרו חזרה ליד שורה כדי לשמוע את הקטע שלה.',blocked:'לחצו על ניגון בתוך הנגן.',error:'לא ניתן להטמיע את הסרטון כרגע. אפשר לפתוח ב־YouTube; הטבלה נשארת זמינה.',seek:'לא ניתן לאמת את המעבר. נסו שוב בנגן.',he:'עברית',ru:'תרגום',repeat:'חזרה',row:'ניגון קטע של שורה'}
  };
  let snapshot = null, adapter = null, serial = 0;
  try {snapshot = await StudyVideoTransfer.get(location.hash.slice(1));} catch (_) {}
  const locale = snapshot ? snapshot.locale : (['ru','en','he'].includes(localStorage.getItem('app.locale')) ? localStorage.getItem('app.locale') : 'ru');
  const t = labels[locale]; document.documentElement.lang=locale; document.documentElement.dir=locale==='he'?'rtl':'ltr';
  function showVideoError(code){
    $('videoStatus').dataset.youtubeError=String(code || 'unknown');
    const reason=[101,150].includes(Number(code))?({ru:'Автор запретил встраивание. Откройте ролик на YouTube; учебные строки доступны здесь.',en:'The publisher disabled embedding. Open the video on YouTube; study rows remain available here.',he:'המפרסם חסם הטמעה. פתחו את הסרטון ב־YouTube; שורות הלימוד זמינות כאן.'})[locale]
      :Number(code)===100?({ru:'Ролик удалён или доступ к нему ограничен. Учебные строки остаются доступными.',en:'The video was removed or access is restricted. Study rows remain available.',he:'הסרטון הוסר או שהגישה אליו מוגבלת. שורות הלימוד נשארות זמינות.'})[locale]:t.error;
    $('videoStatus').textContent=reason;
  }
  $('loadVideo').textContent=t.load; $('returnLink').textContent=t.back;
  $('heHeading').textContent=t.he; $('ruHeading').textContent=t.ru; $('playHeading').textContent=t.repeat;
  if (!snapshot) {$('materialTitle').textContent=t.title; $('videoStatus').textContent=t.missing; $('loadVideo').hidden=true; return;}
  $('materialTitle').textContent=snapshot.title || t.title; document.title=($('materialTitle').textContent)+' · LinguistPro';
  $('returnLink').href=snapshot.return_path;
  if(snapshot.reason==='PREVIEW')$('returnLink').onclick=event=>{event.preventDefault();window.close();};
  $('youtubeLink').href=PlaybackSource.canonicalUrl(snapshot.video_id); $('youtubeLink').hidden=false;
  $('timingNote').textContent=snapshot.entries ? t.verified : t.unverified;
  if(snapshot.reason==='PREVIEW')$('timingNote').textContent=({ru:'Предпросмотр непроверенной привязки. Сверьте начало, середину и конец; затем вернитесь в исходную вкладку для сохранения.',en:'Preview of an unverified mapping. Check the start, middle and end, then return to the original tab to save.',he:'תצוגה מקדימה של התאמה שלא אומתה. בדקו את ההתחלה, האמצע והסוף ואז חזרו ללשונית המקורית לשמירה.'})[locale];
  const tbody=document.querySelector('#proTable tbody'), buttons=[];
  let cue=-1;
  snapshot.rows.forEach((row,index) => {
    const tr=document.createElement('tr'); tr.dataset.rowIdx=String(index);
    const he=document.createElement('td'); he.lang='he'; he.dir='rtl'; he.textContent=row.he;
    if(row.tr){const translit=document.createElement('div'); translit.className='transliteration'; translit.textContent=row.tr; he.append(translit);}
    const ru=document.createElement('td'); ru.lang='ru'; ru.dir='ltr'; ru.textContent=row.ru;
    const action=document.createElement('td');
    if(snapshot.entries){
      while(cue+1<snapshot.entries.length && snapshot.entries[cue+1].o<=index)cue++;
      const k=cue;
      if(k>=0 && !snapshot.entries[k].blind){
        const button=document.createElement('button'); button.type='button'; button.textContent='↻'; button.disabled=true; button.setAttribute('aria-label',t.row+' '+(index+1));
        button.onclick=async()=>{const result=await StudioMediaKaraoke.playSegment(index);if(result && !result.ok && result.reason!=='YT_SEEK_CANCELLED') $('videoStatus').textContent=t.seek;};
        buttons.push(button);action.append(button);
      }
    }
    tr.append(he,ru,action);tbody.append(tr);
  });
  function teardown(){serial++;StudioMediaKaraoke.stop();if(adapter)adapter.destroy();adapter=null;buttons.forEach(b=>b.disabled=true);}
  $('loadVideo').onclick=async()=>{
    teardown(); const run=serial;
    if(!navigator.onLine){$('videoStatus').textContent=t.offline;return;}
    $('loadVideo').disabled=true;$('videoStatus').textContent=t.loading;
    try{
      const next=await StudioYtPlayer.create($('videoMount'),snapshot.video_id);
      if(run!==serial){next.destroy();return;} adapter=next;
      adapter.addEventListener('error',code=>{showVideoError(code);buttons.forEach(b=>b.disabled=true);});
      adapter.addEventListener('blocked',()=>{$('videoStatus').textContent=t.blocked;});
      StudioMediaKaraoke.bind({media:adapter,entries:snapshot.entries,rowCount:snapshot.rows.length});
      buttons.forEach(b=>b.disabled=false);$('videoStatus').textContent=t.ready;
    }catch(error){if(run===serial){if(navigator.onLine)showVideoError(error.ytCode || error.code);else $('videoStatus').textContent=t.offline;}}
    finally{if(run===serial){$('loadVideo').disabled=false;$('loadVideo').textContent=t.retry;}}
  };
  window.addEventListener('offline',()=>{if(adapter)StudioMediaKaraoke.pause();$('videoStatus').textContent=t.offline;});
  window.addEventListener('online',()=>{$('videoStatus').textContent=adapter?t.ready:'';});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && adapter)StudioMediaKaraoke.pause();else StudioMediaKaraoke.syncCurrent();});
  window.addEventListener('pagehide',teardown);
  if(!navigator.onLine)$('videoStatus').textContent=t.offline;
})();
