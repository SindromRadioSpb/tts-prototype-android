(function(){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const text={
    ru:{title:'Восстановить синхронизацию',intro:'Текст и перевод сохранятся. Новая версия заменит только временную разметку; прежняя версия останется в истории.',unavailable:'Для этой карточки нет редактируемой привязки к исходному видео.',subtitle:'Загрузить проверенные субтитры SRT/VTT',row:'Номер реплики',start:'Начало, секунды',end:'Конец, секунды',set:'Применить время к реплике',manual:'Ручная разметка',quote:'Рассчитать стоимость проверки',run:'Запустить проверку за ≈ ${price}',cost:'Три контрольных участка: ≈ ${price}. Перевод не повторяется. Проверка может восстановить только часть строк. Повторные запросы автоматически не выполняются.',key:'Добавьте ключ Gemini в настройках Студии.',confirm:'Я проверил соответствие выбранному видео и прослушал изменённые интервалы.',save:'Сохранить новую разметку',close:'Закрыть',stop:'Остановить после текущего запроса',coverage:'Размечено реплик: {n} из {total}.',waiting:'Проверяется участок {n} из {total}…',saved:'Новая разметка сохранена. Откройте карточку заново. Прежние архивы остаются прежними; новый экспорт включает исправление.',error:'Не удалось выполнить действие. Скачайте данные проверки перед закрытием окна. Если карточка изменилась, откройте восстановление заново.',export:'Скачать данные проверки',noMarks:'Нет пригодных интервалов для сохранения.',stale:'Карточка или её разметка изменились. Откройте восстановление заново.',done:'Проверка завершена. Просмотрите интервалы перед сохранением.'},
    en:{title:'Restore synchronization',intro:'Text and translation stay unchanged. A new version replaces timing only; the previous version remains in history.',unavailable:'This card has no editable binding to its original video.',subtitle:'Load verified SRT/VTT subtitles',row:'Utterance number',start:'Start, seconds',end:'End, seconds',set:'Apply timing to utterance',manual:'Manual timing',quote:'Estimate verification cost',run:'Run verification for ≈ ${price}',cost:'Three sample windows: ≈ ${price}. Translation is not repeated. Verification may restore only some rows. Failed calls are not retried automatically.',key:'Add your Gemini key in Studio settings.',confirm:'I checked the selected video and listened to the changed intervals.',save:'Save new timing',close:'Close',stop:'Stop after current request',coverage:'Timed utterances: {n} of {total}.',waiting:'Checking window {n} of {total}…',saved:'New timing saved. Reopen the card. Existing archives remain unchanged; a new export includes the repair.',error:'Could not complete the action. Download verification data before closing this window. If the card changed, reopen timing recovery.',export:'Download verification data',noMarks:'No usable intervals to save.',stale:'The card or its timing changed. Reopen recovery.',done:'Verification finished. Review intervals before saving.'},
    he:{title:'שחזור סנכרון',intro:'הטקסט והתרגום יישמרו. גרסה חדשה תחליף רק את התזמון; הגרסה הקודמת תישאר בהיסטוריה.',unavailable:'לכרטיס אין קישור ניתן לעריכה לסרטון המקורי.',subtitle:'טעינת כתוביות SRT/VTT בדוקות',row:'מספר קטע',start:'התחלה בשניות',end:'סיום בשניות',set:'החלת התזמון על הקטע',manual:'תזמון ידני',quote:'חישוב עלות הבדיקה',run:'הפעלת בדיקה תמורת ≈ ${price}',cost:'שלושה קטעי בדיקה: ≈ ${price}. התרגום לא יחזור. ייתכן שיחזור של חלק מהשורות בלבד. בקשות שנכשלו לא יישלחו שוב אוטומטית.',key:'הוסיפו מפתח Gemini בהגדרות הסטודיו.',confirm:'בדקתי את ההתאמה לסרטון והאזנתי לקטעים שהשתנו.',save:'שמירת תזמון חדש',close:'סגירה',stop:'עצירה לאחר הבקשה הנוכחית',coverage:'קטעים מתוזמנים: {n} מתוך {total}.',waiting:'בודקים קטע {n} מתוך {total}…',saved:'התזמון נשמר. פתחו את הכרטיס מחדש. ארכיונים קודמים לא השתנו; ייצוא חדש יכלול את התיקון.',error:'לא ניתן להשלים. הורידו את נתוני הבדיקה לפני סגירת החלון. אם הכרטיס השתנה, פתחו שוב את השחזור.',export:'הורדת נתוני הבדיקה',noMarks:'אין זמנים תקינים לשמירה.',stale:'הכרטיס או התזמון השתנו. פתחו שוב את השחזור.',done:'הבדיקה הסתיימה. בדקו את הזמנים לפני שמירה.'}
  };
  Object.assign(text.ru,{intro:'Восстановим кнопки воспроизведения там, где удалось определить время. Все строки и перевод сохранятся. Остальные строки можно оставить без кнопок.',auto:'Восстановить автоматически',run:'Восстановить — не более ${price}',cost:'Прослушаем контрольные участки видео ({n}) и автоматически сохраним найденные интервалы. Потратим не более ${price}: часть участков может не понадобиться. Повторного перевода не будет.',coverage:'Кнопки воспроизведения: {n} из {total}. Остальные строки сохранятся без кнопок; заполнять их вручную не нужно.',ready:'Найдены готовые интервалы: {n}. Сохраните их без новых платных запросов.',saveReady:'Сохранить готовые кнопки ({n})',advanced:'Дополнительные способы',details:'Посмотреть интервалы',waiting:'Автоматическая проверка видео: участок {n} из {total}. Ничего вводить не нужно.',saving:'Сохраняем найденные интервалы…',saved:'Готово: кнопки воспроизведения доступны для {n} из {total} реплик. Остальные строки сохранены без кнопок.',open:'Открыть карточку',noMarks:'Новых пригодных интервалов не найдено. Карточка и существующие кнопки сохранены. Заполнять пропуски не обязательно.',estimate:'Рассчитываем стоимость…',manualError:'Укажите номер реплики, начало и конец в секундах. Конец должен быть позже начала и внутри видео.',error:'Восстановление не завершено. Уже полученные результаты сохранены, если доступно локальное хранилище. Повторное открытие использует сохранённые данные.',review:'Подтвердите только интервалы, которые вы задали вручную или загрузили из файла.',stop:'Остановить проверку'});
  Object.assign(text.en,{intro:'Restore playback buttons where timing can be recovered. All text and translations stay. Other rows can remain without buttons.',auto:'Restore automatically',run:'Restore — up to ${price}',cost:'Listen at {n} sample windows and save recovered intervals automatically. Spends at most ${price}: some windows may not be needed. Translation is not repeated.',coverage:'Playback buttons: {n} of {total}. Other rows stay without buttons; manual timing is optional.',ready:'Recovered intervals ready: {n}. Save them without new paid requests.',saveReady:'Save recovered buttons ({n})',advanced:'More options',details:'View intervals',waiting:'Checking video automatically: sample {n} of {total}. No input needed.',saving:'Saving recovered intervals…',saved:'Done: playback buttons for {n} of {total} utterances. Other rows remain without buttons.',open:'Open card',noMarks:'No new usable intervals found. The card and existing buttons are preserved. Filling gaps is optional.',estimate:'Estimating cost…',manualError:'Enter an utterance number, start and end in seconds. End must follow start and be within the video.',error:'Recovery did not finish. Results are retained when local storage is available. Reopening uses saved evidence.',review:'Confirm only intervals you entered manually or loaded from a file.',stop:'Stop verification'});
  Object.assign(text.he,{intro:'נשחזר כפתורי ניגון במקום שבו ניתן לזהות תזמון. כל הטקסט והתרגום יישמרו. שאר השורות יכולות להישאר ללא כפתורים.',auto:'שחזור אוטומטי',run:'שחזור — עד ${price}',cost:'נאזין ל-{n} קטעי בדיקה ונשמור אוטומטית את התזמון שנמצא. ההוצאה לא תעלה על ${price}; ייתכן שחלק מהקטעים לא יידרשו. התרגום לא יחזור.',coverage:'כפתורי ניגון: {n} מתוך {total}. שאר השורות יישמרו ללא כפתורים; אין צורך בתזמון ידני.',ready:'נמצאו {n} קטעים מוכנים. ניתן לשמור ללא בקשות נוספות בתשלום.',saveReady:'שמירת הכפתורים שנמצאו ({n})',advanced:'אפשרויות נוספות',details:'הצגת התזמון',waiting:'בדיקה אוטומטית של הסרטון: קטע {n} מתוך {total}. אין צורך להזין דבר.',saving:'שומרים את התזמון שנמצא…',saved:'הושלם: כפתורי ניגון עבור {n} מתוך {total} קטעים. שאר השורות נשמרו ללא כפתורים.',open:'פתיחת הכרטיס',noMarks:'לא נמצא תזמון חדש מתאים. הכרטיס והכפתורים הקיימים נשמרו. אין חובה למלא את החסר.',estimate:'מחשבים עלות…',manualError:'הזינו מספר קטע וזמני התחלה וסיום בשניות. הסיום חייב להיות אחרי ההתחלה ובתחומי הסרטון.',error:'השחזור לא הושלם. התוצאות נשמרות כאשר האחסון המקומי זמין. פתיחה מחדש תשתמש בנתונים שנשמרו.',review:'אשרו רק תזמון שהזנתם ידנית או טענתם מקובץ.',stop:'עצירת הבדיקה'});
  const tr=(key,values={})=>Object.entries(values).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',String(v)),(text[document.documentElement.lang]||text.ru)[key]||key);
  Object.assign(text.ru,{localIntro:'Прослушайте исходное медиа и исправьте интервалы. Текст и перевод сохранятся, прежняя разметка останется в истории.',listen:'Прослушать интервал',shift:'Сдвиг всех реплик, секунды',shiftApply:'Применить сдвиг',mediaMissing:'Медиа недоступно на этом устройстве. Восстановите файл перед проверкой интервалов.'});
  Object.assign(text.en,{localIntro:'Listen to the source media and correct intervals. Text and translation stay unchanged; previous timing remains in history.',listen:'Listen to interval',shift:'Shift all utterances, seconds',shiftApply:'Apply shift',mediaMissing:'Media is unavailable on this device. Restore the file before checking intervals.'});
  Object.assign(text.he,{localIntro:'האזינו למדיה המקורית ותקנו את הזמנים. הטקסט והתרגום יישמרו והתזמון הקודם יישאר בהיסטוריה.',listen:'האזנה לקטע',shift:'הזזת כל הקטעים בשניות',shiftApply:'החלת ההזזה',mediaMissing:'המדיה אינה זמינה במכשיר זה. שחזרו את הקובץ לפני בדיקת הקטעים.'});
  Object.assign(text.ru,{trust:'Включить воспроизведение по меткам распознавания',trustNote:'Метки распознавания не сверены с речью: контрольные участки их не подтвердили. Строки получат кнопки и подсветку, но расхождение с речью возможно. Текст и перевод не меняются; проверенную разметку можно получить позже полным проходом.',trustReview:'К сохранению: {n} из {total} строк по непроверенным меткам.',trustConfirm:'Я принимаю непроверенные метки распознавания: подсветка может расходиться с речью.'});
  Object.assign(text.en,{trust:'Enable playback from recognition timestamps',trustNote:'Recognition timestamps were never confirmed against the speech: the sample windows did not certify them. Rows get buttons and highlighting, but they may drift. Text and translation stay unchanged; verified timing can still be obtained later by a full pass.',trustReview:'Ready to save: {n} of {total} rows from unverified timestamps.',trustConfirm:'I accept unverified recognition timestamps: highlighting may drift from the speech.'});
  Object.assign(text.he,{trust:'הפעלת ניגון לפי חותמות הזמן של הזיהוי',trustNote:'חותמות הזמן של הזיהוי לא אומתו מול הדיבור: קטעי הבדיקה לא אישרו אותן. השורות יקבלו כפתורים והדגשה, אך ייתכן פער. הטקסט והתרגום אינם משתנים; אפשר לקבל תזמון בדוק בהמשך במעבר מלא.',trustReview:'מוכן לשמירה: {n} מתוך {total} שורות לפי חותמות לא בדוקות.',trustConfirm:'אני מקבל חותמות זמן לא בדוקות: ההדגשה עלולה לסטות מהדיבור.'});
  text.ru.localSaved='Исправленные интервалы сохранены. Откройте карточку заново. Остальные интервалы не отмечаются как проверенные.';
  text.en.localSaved='Corrected intervals saved. Reopen the card. Other intervals are not marked as verified.';
  text.he.localSaved='הקטעים שתוקנו נשמרו. פתחו את הכרטיס מחדש. שאר הקטעים אינם מסומנים כבדוקים.';
  Object.assign(text.ru,{full:'Восстановить все реплики — повторный запрос',fullRun:'Запустить полный проход — до ${price}',fullCost:'Будет заново прослушано всё видео: {n} участков. Бюджет до ${price}. Текст, перевод и уже работающие кнопки сохранятся. Найденная разметка сохранится автоматически.',fullProgress:'Полное восстановление: участок {n} из {total}.',partial:'Синхронизация неполная: {n} из {total} реплик. Без кнопок: {missing}. Доступен полный повторный запрос.',near:'Почти полная синхронизация: {n} из {total}. Без кнопок: {missing}.',complete:'Синхронизация восстановлена для всех {total} реплик.',resume:'Продолжить полный проход',fullInterrupted:'Полный проход прерван. Полученные интервалы сохранены; можно продолжить оставшиеся участки. Неуспешные запросы автоматически не повторяются.'});
  Object.assign(text.en,{full:'Recover all utterances — new request',fullRun:'Run full recovery — up to ${price}',fullCost:'Listen to the whole video again: {n} windows. Budget up to ${price}. Text, translation and existing buttons stay. Recovered timing is saved automatically.',fullProgress:'Full recovery: window {n} of {total}.',partial:'Synchronization incomplete: {n} of {total} utterances. Missing buttons: {missing}. Full recovery is available.',near:'Almost complete: {n} of {total}. Missing buttons: {missing}.',complete:'Synchronization recovered for all {total} utterances.',resume:'Resume full recovery',fullInterrupted:'Full recovery stopped. Results are saved; remaining windows can be resumed. Failed requests are not automatically repeated.'});
  Object.assign(text.he,{full:'שחזור כל הקטעים — בקשה חדשה',fullRun:'הפעלת שחזור מלא — עד ${price}',fullCost:'הסרטון כולו ייבדק מחדש: {n} קטעים. תקציב עד ${price}. הטקסט, התרגום והכפתורים הקיימים יישמרו. התזמון שיימצא יישמר אוטומטית.',fullProgress:'שחזור מלא: קטע {n} מתוך {total}.',partial:'הסנכרון אינו מלא: {n} מתוך {total} קטעים. ללא כפתורים: {missing}. ניתן להפעיל שחזור מלא.',near:'הסנכרון כמעט מלא: {n} מתוך {total}. ללא כפתורים: {missing}.',complete:'הסנכרון שוחזר לכל {total} הקטעים.',resume:'המשך שחזור מלא',fullInterrupted:'השחזור המלא נעצר. התוצאות נשמרו; ניתן להמשיך בקטעים שנותרו. בקשות שנכשלו אינן חוזרות אוטומטית.'});
  // Часы, которые никто не сверил, — не измерение, а предложение провайдера. Принять его можно
  // только ЯВНО и только там, где метки СТРУКТУРНО целы: возрастают, лежат внутри
  // ролика и дают непустой интервал. Ни одна метка не достраивается и ни один порядок не чинится.
  function unverifiedMarks(timeline,durationSec){
    const list=Array.isArray(timeline)?timeline:[],num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
    let previous=-1;
    return list.map((s,i)=>{
      const startSec=num(s&&s.startSec);
      const endSec=num(s&&s.endSec)??(i+1<list.length?num(list[i+1]&&list[i+1].startSec):num(durationSec));
      const blank={text:s&&s.text,startSec:null,endSec:null};
      if(startSec==null||endSec==null||startSec<0||endSec<=startSec||endSec>durationSec||startSec<previous)return blank;
      previous=endSec;return {text:s&&s.text,startSec,endSec};
    });
  }
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
    const local=!video&&/^[a-f0-9]{64}$/.test(String(media.media_sha256||''));
    if(!(media.duration_ms>0)||!Number.isFinite(media.duration_ms)||
       !local&&(!selected?.source||!video||selected.source.video_id!==video.videoId))throw new Error('TIMING_SOURCE_MISMATCH');
    const rows=await ctx.ldb.dbQuery('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index',[String(id)]);
    return {...ctx,id:String(id),repo,binding,revision,media,rowsSnapshot:JSON.stringify(rows),
      source:local?{kind:'local',sha256:media.media_sha256,durationSec:media.duration_ms/1000}
        :{video_id:video.videoId,url:video.url,durationSec:media.duration_ms/1000},
      journalKey:String(id)+':'+revision.revision_id+':'+(local?media.media_sha256:video.videoId)};
  }
  function proposed(ctx,times,authority){
    if(times.length!==ctx.revision.segments.length)throw new Error('TIMING_REPAIR_TEXT_CHANGED');
    return ctx.revision.segments.map((s,i)=>{
      if(times[i].text!==s.text)throw new Error('TIMING_REPAIR_TEXT_CHANGED');
      const valid=times[i].startSec!=null&&times[i].endSec!=null;
      // Каждая строка несёт СВОЮ честность в authority.timing: ремонт вправе менять только время,
      // и пометка о качестве меток живёт там же, где их авторство, а не в опознании текста.
      return {...s,start_ms:valid?Math.round(times[i].startSec*1000):null,end_ms:valid?Math.round(times[i].endSec*1000):null,
        quality_flags:[...(s.quality_flags||[]).filter(f=>f!=='blind'),...(valid?[]:['blind'])],
        authority:{...s.authority,timing:valid?(s.start_ms===Math.round(times[i].startSec*1000)&&s.end_ms===Math.round(times[i].endSec*1000)?s.authority?.timing||authority:authority):'unknown'}};
    });
  }
  async function apply(ctx,times,evidence,authority){
    if(!times.some(s=>s.startSec!=null&&s.endSec!=null))throw new Error('TIMING_REPAIR_EMPTY');
    const materialRepo=MaterialRevisionRepository.createRepository(ctx.ldb,MaterialRevisionCore);
    return ctx.repo.commitTimingRepair({text_id:ctx.id,expected_binding_json:JSON.stringify(ctx.binding),
      expected_source_meta_json:ctx.card.source_meta_json,expected_rows_json:ctx.rowsSnapshot,
      segments:proposed(ctx,times,authority),author_kind:authority==='user'?'user':'provider',
      mapping:StudioMediaPackage.verifiedRowMapping(ctx.revision,ctx.binding,ctx.rows),
      provenance:{schema:'timing-repair-v1',source:ctx.source,evidence:copy(evidence),preserves_text:true,
        ...(evidence?.schema==='youtube-full-timing-v1'?{alignment_policy:'unique-token-edit-v1'}:{})},
      onTimingBinding:(old,next)=>materialRepo.rebindTimingWithinTransaction(ctx.id,old,next),
      prepareSourceMeta:async(revision,binding,media)=>{
        const meta=PlaybackSource.parseMeta(ctx.card.source_meta_json),audio=StudioMediaPackage.buildExactBindingPassport(revision,binding,media);
        const projection=StudioMediaPackage.buildCompatibilityProjection(revision,{kind:'captions',media});
        const local=ctx.source.kind==='local',prior=meta.source?.audio||meta.source?.captions||{};
        meta.source={...(meta.source||{}),...projection};
        if(local){
          meta.source.audio={...prior,...audio,captions:{...(prior.captions||{}),...(audio.captions||{})}};
          delete meta.source.captions;
        }else{meta.source.captions=audio;delete meta.source.audio;}
        meta.timing_repair={schema:'timing-repair-v1',previous_revision_id:ctx.revision.revision_id,revision_id:revision.revision_id,
          playable:times.filter(s=>s.startSec!=null).length,total:times.length};
        if(!local)meta.playback_source=PlaybackSource.append(meta.playback_source,{url:ctx.source.url,offset_ms:0},
          {basis_sha256:await PlaybackSource.timingBasis(audio,ctx.rows)});
        return JSON.stringify(meta);
      }});
  }
  async function open(id){
    const d=document.createElement('dialog');d.className='study-source-dialog';d.setAttribute('aria-label',tr('title'));
    const oldFocus=document.activeElement,el=(tag,value)=>{const n=document.createElement(tag);if(value)n.textContent=value;return n;};
    d.append(el('h2',tr('title')),el('p',tr('intro')));document.body.append(d);d.showModal();
    d.addEventListener('close',()=>{d.remove();oldFocus?.focus();});
    const status=el('p');status.setAttribute('role','status');d.append(status);
    let ctx;try{ctx=await context(id);}catch(e){status.textContent=tr('unavailable');status.dataset.code=e.message;const close=el('button',tr('close'));close.onclick=()=>d.close();d.append(close);return d;}
    const local=ctx.source.kind==='local';
    if(local)d.querySelector('p').textContent=tr('localIntro');
    const count=list=>list.filter(s=>s.startSec!=null&&s.endSec!=null).length;
    const initialRows=ctx.rowsSnapshot;
    const base=ctx.revision.segments.map(s=>({text:s.text,startSec:s.start_ms==null?null:s.start_ms/1000,endSec:s.end_ms==null?null:s.end_ms/1000}));
    let times=copy(base),evidence=null,authority='provider',quote=null,busy=false,stopped=false,finished=false,acceptUnverified=false;
    let fullQuote=null,fullEvidence=null,resuming=false;
    const fullKey=!local&&window.YoutubeFullTiming?ctx.id+':full:'+await YoutubeFullTiming.identity(ctx.source,base):null;
    const matches=e=>!!e?.source&&(local?e.source.kind==='local'&&e.source.sha256===ctx.source.sha256:e.source.video_id===ctx.source.video_id)&&e.source.durationSec===ctx.source.durationSec;
    const compatible=list=>list?.length===base.length&&list.every((s,i)=>s.text===base[i].text);
    // Метки, стёртые прежним правилом окна, лежат в УЖЕ ОПЛАЧЕННОМ ответе провайдера. Пересборка
    // таймлайна из него не стоит ни одного запроса; текст обязан совпасть построчно, иначе это
    // был бы другой материал, а не тот же с возвращённым временем.
    const timed=list=>(list||[]).filter(s=>s&&s.startSec!=null).length;
    function recovered(e){
      if(local||!e||!e.raw_timeline||!matches(e)||typeof window.YoutubeAsr?.restitchFromRaw!=='function')return e;
      let rebuilt=null;try{rebuilt=YoutubeAsr.restitchFromRaw(e.raw_timeline,ctx.source.durationSec);}catch(_){return e;}
      return rebuilt&&compatible(rebuilt)&&timed(rebuilt)>timed(e.timeline)?{...e,timeline:rebuilt}:e;
    }
    try{
      const meta=PlaybackSource.parseMeta(ctx.card.source_meta_json);
      evidence=recovered(await journal(ctx.journalKey)||meta.source?.captions?.captions?.timing_evidence||null);
      if(matches(evidence)&&evidence.schema==='youtube-asr-timing-evidence-v2'&&compatible(evidence.timeline))times=YoutubeTiming.mergeRecovered(base,YoutubeTiming.diagnose(evidence).segments);
      if(matches(evidence)&&compatible(evidence.proposed)){times=copy(evidence.proposed);
        // Принятые метки провайдера остаются его метками: согласие не делает человека автором разметки.
        acceptUnverified=evidence.schema==='timing-asr-unverified-v1';authority=acceptUnverified?'provider-unverified':'user';}
      if(fullKey){fullEvidence=await journal(fullKey);if(fullEvidence&&matches(fullEvidence)&&compatible(fullEvidence.timeline)&&authority!=='user'){times=YoutubeFullTiming.collect({...fullEvidence,timeline:base}).segments;if(JSON.stringify(times)!==JSON.stringify(base)){evidence=fullEvidence;authority='provider';}}}
    }catch(e){status.textContent=tr('error');status.dataset.code=e.message;}
    // Сырые метки распознавания живут в том же журнале проверки, который их не заверил.
    const rawSource=matches(evidence)&&evidence.schema==='youtube-asr-timing-evidence-v2'&&compatible(evidence.timeline)?evidence.timeline:null;
    const rawMarks=rawSource?unverifiedMarks(rawSource,ctx.source.durationSec).map((s,i)=>({...s,text:base[i].text})):null;
    const rawGain=rawMarks?count(rawMarks):0;
    const coverage=el('p');coverage.setAttribute('aria-live','polite');d.append(coverage);
    const primary=el('button'),stop=el('button',tr('stop')),close=el('button',tr('close'));primary.className='btn-primary';
    primary.dataset.action='recover';stop.dataset.action='stop';close.dataset.action='close';
    const openCard=el('button',tr('open'));openCard.type='button';openCard.dataset.action='open';
    const actions=el('div');actions.className='study-source-actions';actions.append(primary,openCard,stop,close);d.append(actions);
    const full=el('button',tr('full')),resume=el('button',tr('resume'));full.dataset.action='full';resume.dataset.action='resumeFull';actions.prepend(full);actions.append(resume);
    const advanced=el('details');advanced.dataset.section='advanced';advanced.append(el('summary',tr('advanced')));d.append(advanced);
    if(!local){const link=el('a',ctx.source.url);link.href=ctx.source.url;link.target='_blank';link.rel='noopener noreferrer';advanced.append(link);}
    const detail=el('details');detail.append(el('summary',tr('details')));const preview=el('pre');preview.style.cssText='max-height:220px;overflow:auto;white-space:pre-wrap';detail.append(preview);advanced.append(detail);
    const confirmed=el('input');confirmed.type='checkbox';const check=el('label',tr('confirm'));check.prepend(confirmed);const review=el('p',tr('review'));advanced.append(review,check);
    const trust=el('button',tr('trust'));trust.type='button';trust.dataset.action='trust';advanced.append(trust);
    const changed=()=>JSON.stringify(times)!==JSON.stringify(base);
    // Принять непроверенное можно только осознанно: та же галочка, что и у ручной правки.
    const reviewNeeded=()=>authority==='user'||acceptUnverified;
    const resultText=()=>{const n=count(times),total=times.length;return tr(n===total?'complete':n/total>=.95?'near':'partial',{n,total,missing:total-n});};
    const render=()=>{
      const n=count(times);coverage.textContent=tr('coverage',{n,total:times.length});
      preview.textContent=times.map((s,i)=>(i+1)+'. '+(s.startSec==null?'—':s.startSec+'–'+s.endSec)+'  '+s.text).join('\n');
      stop.hidden=!busy;primary.disabled=busy||(reviewNeeded()&&changed()&&!confirmed.checked);advanced.hidden=busy||(finished&&changed());
      check.hidden=review.hidden=!reviewNeeded()||!changed();
      check.lastChild.textContent=tr(acceptUnverified?'trustConfirm':'confirm');
      review.textContent=acceptUnverified?tr('trustNote'):tr('review');
      trust.hidden=!rawMarks||busy||finished||rawGain<=count(times);
      openCard.hidden=local||busy||finished||!count(base)||changed();
      primary.textContent=finished?tr('open'):changed()?tr('saveReady',{n}):quote?tr('run',{price:quote.estimatedUsd.toFixed(4)}):tr('auto');
      if(local&&!finished){primary.textContent=tr('save');primary.disabled=busy||!changed()||!confirmed.checked;}
      if(local&&finished)primary.textContent=tr('close');
      close.disabled=busy;d.dataset.running=String(busy);
      full.disabled=resume.disabled=busy;full.hidden=!fullKey;
      full.textContent=fullQuote?tr('fullRun',{price:fullQuote.maxUsd.toFixed(4)}):tr('full');
      resume.hidden=!fullEvidence||fullEvidence.calls.length>=YoutubeFullTiming.plan(ctx.source.durationSec).length;
    };
    confirmed.onchange=render;
    const fail=e=>{status.dataset.code=e.code||e.message;status.textContent=tr(/STALE/.test(e.message)?'stale':/SEGMENT_TIMING_INVALID/.test(e.message)?'manualError':'error');};
    const action=async fn=>{if(busy)return;busy=true;delete status.dataset.code;render();try{await fn();}catch(e){fail(e);}finally{busy=false;render();}};
    const button=(parent,key,fn)=>{const b=el('button',tr(key));b.type='button';b.onclick=()=>action(fn);parent.append(b);return b;};
    const save=async()=>{
      if(!changed()||!count(times)){status.textContent=tr('noMarks');return;}
      if(reviewNeeded()&&!confirmed.checked)throw new Error('TIMING_REVIEW_REQUIRED');
      status.textContent=tr('saving');
      const work=async lock=>{if(!lock)throw new Error('TIMING_REPAIR_BUSY');await apply(ctx,times,evidence,authority);};
      if(navigator.locks)await navigator.locks.request('linguistpro-material-preparation',{ifAvailable:true},work);else await work(true);
      finished=true;status.textContent=local?tr('localSaved'):resultText();
      window.dispatchEvent(new CustomEvent('playback-source-changed',{detail:{textId:ctx.id}}));
    };
    const key=()=>typeof window.geminiKeyGet==='function'?window.geminiKeyGet():localStorage.getItem('v3.geminiApiKey')||'';
    const fullAction=async resumePrevious=>{
      if(!key()){status.textContent=tr('key');return;}
      if(!fullQuote||resuming!==resumePrevious){
        status.textContent=tr('estimate');resuming=resumePrevious;
        fullQuote=await YoutubeFullTiming.estimate({fetch:(u,i)=>fetch(u,i),apiKey:key()},ctx.source,base);
        status.textContent=tr('fullCost',{n:fullQuote.maxCalls,price:fullQuote.maxUsd.toFixed(4)});return;
      }
      const work=async lock=>{
        if(!lock)throw Error('TIMING_REPAIR_BUSY');
        ctx=await context(ctx.id);
        if(ctx.rowsSnapshot!==initialRows||!compatible(ctx.revision.segments))throw Error('TIMING_REPAIR_STALE');
        const current=ctx.revision.segments.map(s=>({text:s.text,startSec:s.start_ms==null?null:s.start_ms/1000,endSec:s.end_ms==null?null:s.end_ms/1000}));
        const prior=resumePrevious?await journal(fullKey):null;stopped=false;stop.disabled=false;
        const result=await YoutubeFullTiming.run({fetch:(u,i)=>fetch(u,i),apiKey:key(),savedEvidence:prior,shouldStop:()=>stopped},ctx.source,prior?prior.timeline:current,fullQuote,
          p=>{status.textContent=tr('fullProgress',{n:p.index,total:p.total});},async e=>{fullEvidence=e;await journal(fullKey+':'+e.runId,e);await journal(fullKey,e);});
        times=YoutubeFullTiming.collect({...result.evidence,timeline:current}).segments;evidence=result.evidence;authority='provider';
        if(JSON.stringify(times)!==JSON.stringify(current)){await save();}else status.textContent=resultText();
        if(result.completedWindows<result.totalWindows)status.textContent+=' '+tr('fullInterrupted');
      };
      try{if(navigator.locks)await navigator.locks.request('linguistpro-timing-verification:'+ctx.id,{ifAvailable:true},work);else await work(true);}finally{fullQuote=null;}
    };
    full.onclick=()=>action(()=>fullAction(fullQuote?resuming:false));resume.onclick=()=>action(()=>fullAction(true));
    const estimate=async()=>{
      if(!key()){status.textContent=tr('key');return;}
      status.textContent=tr('estimate');
      const result=await YoutubeAsr.estimate({fetch:(u,i)=>fetch(u,i),apiKey:key()},ctx.source.url);
      if(result.durationSec!==ctx.source.durationSec)throw new Error('TIMING_SOURCE_MISMATCH');
      quote=result.timingQuote;status.textContent=tr('cost',{price:quote.estimatedUsd.toFixed(4),n:quote.maxCalls});
    };
    const verify=async()=>{
      if(!quote||!key())throw new Error('TIMING_QUOTE_REQUIRED');
      const work=async lock=>{
        if(!lock)throw new Error('TIMING_REPAIR_BUSY');
        const fresh=await context(ctx.id);if(fresh.rowsSnapshot!==ctx.rowsSnapshot||fresh.card.source_meta_json!==ctx.card.source_meta_json||JSON.stringify(fresh.binding)!==JSON.stringify(ctx.binding))throw new Error('TIMING_REPAIR_STALE');
        evidence=recovered(await journal(ctx.journalKey)||evidence);stopped=false;stop.disabled=false;
        const prior=matches(evidence)&&evidence.schema==='youtube-asr-timing-evidence-v2'&&compatible(evidence.timeline)?evidence:null;
        const result=await YoutubeAsr.verifySavedTiming({fetch:(u,i)=>fetch(u,i),apiKey:key(),shouldStop:()=>stopped,savedTimingEvidence:prior},ctx.source,prior?prior.timeline:base,quote,
          (_,at)=>{status.textContent=tr('waiting',{n:(at.index||0)+1,total:at.total});},async value=>{evidence=value;await journal(ctx.journalKey,value);});
        times=YoutubeTiming.mergeRecovered(base,result.diagnosis.segments);authority='provider';await save();
      };
      try{if(navigator.locks)await navigator.locks.request('linguistpro-timing-verification:'+ctx.id,{ifAvailable:true},work);else await work(true);}finally{quote=null;}
    };
    primary.onclick=()=>{if(finished){d.close();if(!local&&typeof window.StudyVideoInlineOpen==='function')window.StudyVideoInlineOpen(ctx.id);return;}return action(()=>changed()?save():local?Promise.resolve():quote?verify():estimate());};
    openCard.onclick=()=>{d.close();if(!local&&typeof window.StudyVideoInlineOpen==='function')window.StudyVideoInlineOpen(ctx.id);};
    stop.onclick=()=>{stopped=true;stop.disabled=true;};close.onclick=()=>d.close();d.oncancel=e=>{if(busy){e.preventDefault();stopped=true;}};
    trust.onclick=()=>action(async()=>{
      if(!rawMarks)throw new Error('TIMING_REPAIR_UNAVAILABLE');
      times=copy(rawMarks);acceptUnverified=true;authority='provider-unverified';confirmed.checked=false;quote=null;finished=false;
      evidence={schema:'timing-asr-unverified-v1',source:ctx.source,proposed:copy(times)};
      await journal(ctx.journalKey,evidence);
      status.textContent=tr('trustReview',{n:count(times),total:times.length});
    });
    const fileLabel=el('label',tr('subtitle')),file=el('input');file.type='file';file.accept='.srt,.vtt';fileLabel.append(file);advanced.append(fileLabel);
    file.onchange=()=>action(async()=>{
      if(!file.files[0])return;
      const raw=await file.files[0].text(),cues=MediaPackageCore.parseSubtitles(raw).segments;
      const matched=YoutubeTiming.fromSubtitles(base,cues,ctx.source.durationSec);
      times=local?base.map((s,i)=>matched[i].startSec==null?{...s}:{...s,startSec:matched[i].startSec,endSec:matched[i].endSec})
        :YoutubeTiming.mergeRecovered(base,matched);
      evidence={schema:'timing-subtitles-v1',source:ctx.source,raw,proposed:times};authority='user';confirmed.checked=false;quote=null;finished=false;
      await journal(ctx.journalKey,evidence);status.textContent=count(times)?tr('review'):tr('noMarks');
    });
    const manual=el('details');manual.append(el('summary',tr('manual')));const controls={};
    for(const name of ['row','start','end']){const label=el('label',tr(name)),input=el('input');input.type='number';input.step=name==='row'?'1':'0.001';input.min=name==='row'?'1':'0';input.max=String(name==='row'?times.length:ctx.source.durationSec);input.value=name==='row'?'1':'';label.append(input);manual.append(label);controls[name]=input;}
    button(manual,'set',async()=>{
      const i=Number(controls.row.value)-1,start=Number(controls.start.value),end=Number(controls.end.value);
      if(!Number.isInteger(i)||!times[i]||!controls.start.value||!controls.end.value||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>ctx.source.durationSec)throw new Error('SEGMENT_TIMING_INVALID');
      times[i]={...times[i],startSec:start,endSec:end};evidence={schema:'timing-manual-v1',source:ctx.source,previous:evidence?.schema==='timing-manual-v1'?evidence.previous:evidence,proposed:copy(times)};authority='user';confirmed.checked=false;quote=null;finished=false;
      await journal(ctx.journalKey,evidence);status.textContent=tr('review');
    });advanced.append(manual);
    if(local){
      advanced.open=manual.open=true;
      let player=null,stopAt=null;
      try{
        const blob=await MediaHost.createBlobResolver().resolve(ctx.audio);
        if(!blob)throw Error('MEDIA_FILE_MISSING');
        player=el(String(ctx.media.mime||'').startsWith('audio/')?'audio':'video');
        player.controls=true;player.preload='metadata';player.playsInline=true;player.style.cssText='width:100%;max-height:240px';
        const url=URL.createObjectURL(blob);player.src=url;manual.prepend(player);
        player.addEventListener('timeupdate',()=>{if(stopAt!=null&&player.currentTime>=stopAt){player.pause();stopAt=null;}});
        d.addEventListener('close',()=>{player.pause();player.removeAttribute('src');player.load();URL.revokeObjectURL(url);});
      }catch(_){manual.prepend(el('p',tr('mediaMissing')));}
      const loadRow=()=>{const s=times[Number(controls.row.value)-1];controls.start.value=s?.startSec??'';controls.end.value=s?.endSec??'';};
      controls.row.onchange=loadRow;loadRow();
      const listen=button(manual,'listen',async()=>{const start=Number(controls.start.value),end=Number(controls.end.value);
        if(!player||!controls.start.value||!controls.end.value||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>ctx.source.durationSec)throw Error('SEGMENT_TIMING_INVALID');
        stopAt=end;player.currentTime=start;await player.play();});listen.disabled=!player;
      const shiftLabel=el('label',tr('shift')),shift=el('input');shift.type='number';shift.step='0.001';shift.value='0';shiftLabel.append(shift);manual.append(shiftLabel);
      button(manual,'shiftApply',async()=>{
        const delta=Number(shift.value);if(!shift.value||!Number.isFinite(delta))throw Error('SEGMENT_TIMING_INVALID');
        const next=times.map(s=>({...s,startSec:s.startSec==null?null:s.startSec+delta,endSec:s.endSec==null?null:s.endSec+delta}));
        if(next.some(s=>s.startSec!=null&&(s.startSec<0||s.endSec<=s.startSec||s.endSec>ctx.source.durationSec)))throw Error('SEGMENT_TIMING_INVALID');
        times=next;evidence={schema:'timing-manual-v1',source:ctx.source,previous:evidence,proposed:copy(times)};
        authority='user';confirmed.checked=false;finished=false;loadRow();await journal(ctx.journalKey,evidence);status.textContent=tr('review');
      });
    }
    button(advanced,'export',()=>{const u=URL.createObjectURL(new Blob([JSON.stringify({source:ctx.source,base_revision_id:ctx.revision.revision_id,evidence,proposed:times},null,2)],{type:'application/json'}));const a=el('a');a.href=u;a.download='timing-review-'+ctx.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
    if(changed()){status.textContent=acceptUnverified?tr('trustReview',{n:count(times),total:times.length}):authority==='provider'?tr('ready',{n:count(times)}):tr('review');if(reviewNeeded())advanced.open=true;}
    else if(count(base)&&!local){
      // «Готово» — это ПОЛНОЕ покрытие. Одна работающая кнопка из четырёхсот не повод прятать
      // дешёвую повторную проверку за самым дорогим действием на экране.
      finished=count(base)===base.length;status.textContent=resultText();
    }
    render();return d;
  }
  window.StudyTimingRepair={open,context,apply,proposed,journal,unverifiedMarks};
})();
