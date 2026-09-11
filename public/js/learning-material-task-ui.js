(function(){
  'use strict';
  let operations=null,store=null,runner=null,currentDialog=null;
  const words={
    ru:{title:'Подготовка материала',tasks:'Задачи подготовки',name:'Название материала',start:'Подготовить и сохранить',resume:'Продолжить',cancel:'Остановить после текущего шага',close:'Закрыть',download:'Скачать ZIP',open:'Открыть материал',empty:'Сохранённых задач пока нет.',note:'Будет создана новая карточка и подготовлен ZIP. Используется выбранный в Студии переводчик: ',cost:'Перевод может расходовать вашу квоту. Готовые шаги сохраняются на этом устройстве.',imported:'Источник сохранён',transcribing:'Распознаём речь по ссылке',transcribed:'Транскрипт получен',binding:'Привязываем видео к карточке',bound:'Видео привязано',causeYT_OVERLOADED:'провайдер перегружен',causeYT_QUOTA:'квота исчерпана',causeYT_FAILED:'сбой провайдера',markDone:'готово',markCurrent:'идёт',markPending:'ждёт',markStalled:'остановлено',stageImported:'Источник',stageTranscribing:'Распознавание речи',stageTranslating:'Учебная таблица',stageSaved:'Сохранение карточки',stageBound:'Привязка видео',stageReady:'Готовый пакет',detailRetry:'{why} · повтор через {sec} с (попытка {i} из {n})',detailSlow:'идёт {time} · дольше обычного',detailElapsed:'идёт {time}',detailWindow:'окно {i} из {n} · {time}',detailRows:'готово строк {ready} из {total} · кусок {chunk} из {chunks}',priceFull:'Ролик {d} · распознавание ≈${asr} · таблица ≈${tlo}–{thi} · всего ≈${lo}–{hi}',minutesNote:'обычно {n} мин',priceNote:'Цена таблицы — вилка: сколько получится реплик, известно только после распознавания.',price:'Ролик {d} · распознавание речи ≈${p}',parts:'{n} частей',estimating:'Считаем стоимость…',estimateFailed:'Стоимость посчитать не удалось.',retryEstimate:'Повторить оценку',linkNote:'Материал будет создан прямо из ссылки: скачивать видео не нужно.',captionsFree:'Если у ролика есть свои субтитры, их можно импортировать бесплатно кнопкой «Показать видео».',blindNote:'Часть строк осталась без надёжной привязки ко времени — там караоке молчит.',translating:'Создаём учебную таблицу',table_ready:'Таблица сохранена',saving:'Сохраняем карточку',saved:'Карточка сохранена',exporting:'Проверяем пакет',ready:'Материал готов. Скачайте ZIP и сохраните его в Файлы.',paused:'Задача приостановлена. Источник и готовые шаги сохранены.',cancelled:'Задача остановлена. Можно продолжить с сохранённого шага.',stopping:'Остановимся после текущего шага; его результат сохраним.',error:'Не удалось завершить шаг. Проверьте выбранного переводчика, сеть и доступное место; затем продолжите.',TASK_TABLE_INCOMPLETE:'Таблица не вернулась с провайдера. Транскрипт сохранён — нажмите «Продолжить», оплачен он не будет повторно.',TASK_TRANSCRIPT_INCOMPLETE:'Распознавание не вернуло текста. Нажмите «Продолжить», чтобы попробовать снова.',YT_QUOTA:'Квота ключа исчерпана. Готовые шаги сохранены — продолжите, когда квота восстановится.',YT_OVERLOADED:'Провайдер сейчас перегружен. Это временно: нажмите «Продолжить».',YT_URL_REJECTED:'Ссылка не принята. Приватные и unlisted ролики недоступны; проверьте адрес.',ASR_TRUNCATED:'Ответ распознавания не поместился целиком. Продолжите — запись будет разобрана по частям.',ASR_BLOCKED:'Провайдер отказался расшифровывать эту запись.',GEMINI_KEY_REQUIRED:'Нужен ваш ключ Gemini — добавьте его в настройках Студии.',busy:'Другая вкладка уже выполняет подготовку.',remove:'Удалить задачу из списка',missing:'Сначала добавьте текст или субтитры.',downloaded:'Загрузка ZIP запущена. Проверьте, что файл сохранён на устройстве.'},
    en:{title:'Prepare material',tasks:'Preparation tasks',name:'Material title',start:'Prepare and save',resume:'Continue',cancel:'Stop after current step',close:'Close',download:'Download ZIP',open:'Open material',empty:'No saved tasks yet.',note:'A new card and a ZIP package will be prepared. Selected Studio translator: ',cost:'Translation may use your quota. Completed steps are saved on this device.',imported:'Source saved',transcribing:'Recognising speech from the link',transcribed:'Transcript received',binding:'Attaching the video to the card',bound:'Video attached',causeYT_OVERLOADED:'provider is busy',causeYT_QUOTA:'quota exhausted',causeYT_FAILED:'provider error',markDone:'done',markCurrent:'running',markPending:'waiting',markStalled:'stopped',stageImported:'Source',stageTranscribing:'Speech recognition',stageTranslating:'Study table',stageSaved:'Saving the card',stageBound:'Video attached',stageReady:'Package',detailRetry:'{why} · retry in {sec} s (attempt {i} of {n})',detailSlow:'running {time} · longer than usual',detailElapsed:'running {time}',detailWindow:'window {i} of {n} · {time}',detailRows:'{ready} of {total} rows ready · chunk {chunk} of {chunks}',priceFull:'Video {d} · recognition ≈${asr} · table ≈${tlo}–{thi} · total ≈${lo}–{hi}',minutesNote:'usually {n} min',priceNote:'The table price is a range: how many utterances there are is known only after recognition.',price:'Video {d} · speech recognition ≈${p}',parts:'{n} parts',estimating:'Working out the cost…',estimateFailed:'The cost could not be worked out.',retryEstimate:'Try the estimate again',linkNote:'The material is built straight from the link: nothing has to be downloaded.',captionsFree:'If the video has captions of its own, importing them with “Show video” costs nothing.',blindNote:'Some rows have no trustworthy timing — karaoke stays silent there.',translating:'Building study table',table_ready:'Table saved',saving:'Saving card',saved:'Card saved',exporting:'Checking package',ready:'Material ready. Download the ZIP and save it in Files.',paused:'Task paused. Source and completed steps are saved.',cancelled:'Task stopped. Continue from the saved step.',stopping:'Stopping after the current step; its result will be saved.',error:'Could not finish this step. Check the selected translator, network and free storage, then continue.',TASK_TABLE_INCOMPLETE:'The table did not come back from the provider. The transcript is kept — press “Continue”; it is not paid for twice.',TASK_TRANSCRIPT_INCOMPLETE:'Recognition returned no text. Press “Continue” to try again.',YT_QUOTA:'The key ran out of quota. Completed steps are saved — continue once the quota is back.',YT_OVERLOADED:'The provider is busy right now. This passes: press “Continue”.',YT_URL_REJECTED:'The link was not accepted. Private and unlisted videos cannot be used; check the address.',ASR_TRUNCATED:'The recognition answer did not fit in one piece. Continue and the recording is taken in parts.',ASR_BLOCKED:'The provider refused to transcribe this recording.',GEMINI_KEY_REQUIRED:'Your Gemini key is needed — add it in Studio settings.',busy:'Another tab is already preparing a material.',remove:'Remove task from list',missing:'Add text or captions first.',downloaded:'ZIP download started. Check that the file was saved on your device.'},
    he:{title:'הכנת חומר',tasks:'משימות הכנה',name:'שם החומר',start:'הכנה ושמירה',resume:'המשך',cancel:'עצירה אחרי השלב הנוכחי',close:'סגירה',download:'הורדת ZIP',open:'פתיחת החומר',empty:'אין עדיין משימות שמורות.',note:'ייווצר כרטיס חדש ותוכן חבילת ZIP. המתרגם שנבחר בסטודיו: ',cost:'התרגום עשוי לנצל את המכסה שלכם. שלבים שהושלמו נשמרים במכשיר הזה.',imported:'המקור נשמר',transcribing:'מזהים דיבור מתוך הקישור',transcribed:'התמלול התקבל',binding:'מקשרים את הווידאו לכרטיס',bound:'הווידאו קושר',causeYT_OVERLOADED:'הספק עמוס',causeYT_QUOTA:'המכסה אזלה',causeYT_FAILED:'תקלת ספק',markDone:'הושלם',markCurrent:'בעבודה',markPending:'ממתין',markStalled:'נעצר',stageImported:'מקור',stageTranscribing:'זיהוי דיבור',stageTranslating:'טבלת לימוד',stageSaved:'שמירת הכרטיס',stageBound:'קישור הווידאו',stageReady:'חבילה',detailRetry:'{why} · ניסיון חוזר בעוד {sec} שנ׳ (ניסיון {i} מתוך {n})',detailSlow:'בעבודה {time} · יותר מהרגיל',detailElapsed:'בעבודה {time}',detailWindow:'חלון {i} מתוך {n} · {time}',detailRows:'{ready} מתוך {total} שורות מוכנות · מקטע {chunk} מתוך {chunks}',priceFull:'סרטון {d} · זיהוי ≈${asr} · טבלה ≈${tlo}–{thi} · סה\"כ ≈${lo}–{hi}',minutesNote:'בדרך כלל {n} דק׳',priceNote:'מחיר הטבלה הוא טווח: מספר המשפטים ידוע רק אחרי הזיהוי.',price:'סרטון {d} · זיהוי דיבור ≈${p}',parts:'{n} חלקים',estimating:'מחשבים עלות…',estimateFailed:'לא הצלחנו לחשב את העלות.',retryEstimate:'לחשב שוב',linkNote:'החומר נוצר ישירות מהקישור: אין צורך להוריד דבר.',captionsFree:'אם לסרטון יש כתוביות משלו, אפשר לייבא אותן בחינם דרך «הצגת וידאו».',blindNote:'לחלק מהשורות אין תזמון אמין — שם הקריוקי שותק.',translating:'יוצרים טבלת לימוד',table_ready:'הטבלה נשמרה',saving:'שומרים כרטיס',saved:'הכרטיס נשמר',exporting:'בודקים את החבילה',ready:'החומר מוכן. הורידו ZIP ושמרו אותו בקבצים.',paused:'המשימה הושהתה. המקור והשלבים שהושלמו נשמרו.',cancelled:'המשימה נעצרה. אפשר להמשיך מהשלב שנשמר.',stopping:'המשימה תיעצר אחרי השלב הנוכחי; התוצאה שלו תישמר.',error:'השלב לא הושלם. בדקו את המתרגם שנבחר, הרשת והמקום הפנוי ואז המשיכו.',TASK_TABLE_INCOMPLETE:'הטבלה לא חזרה מהספק. התמלול נשמר — לחצו «המשך», לא ישולם עליו שוב.',TASK_TRANSCRIPT_INCOMPLETE:'הזיהוי לא החזיר טקסט. לחצו «המשך» כדי לנסות שוב.',YT_QUOTA:'המכסה של המפתח אזלה. השלבים שהושלמו נשמרו — המשיכו כשהמכסה תתחדש.',YT_OVERLOADED:'הספק עמוס כרגע. זה זמני: לחצו «המשך».',YT_URL_REJECTED:'הקישור לא התקבל. סרטונים פרטיים ולא רשומים אינם נתמכים; בדקו את הכתובת.',ASR_TRUNCATED:'תשובת הזיהוי לא נכנסה בבת אחת. המשיכו וההקלטה תפוענח בחלקים.',ASR_BLOCKED:'הספק סירב לתמלל את ההקלטה הזאת.',GEMINI_KEY_REQUIRED:'נדרש מפתח Gemini שלכם — הוסיפו אותו בהגדרות הסטודיו.',busy:'חומר כבר נמצא בהכנה בלשונית אחרת.',remove:'הסרת המשימה מהרשימה',missing:'הוסיפו קודם טקסט או כתוביות.',downloaded:'הורדת ZIP החלה. ודאו שהקובץ נשמר במכשיר.'}
  };
  const t=key=>(words[document.documentElement.lang]||words.ru)[key];
  // ── Модель этапов и живой детали ──
  // Правило одно: показываем ТОЛЬКО то, чему есть знаменатель. У одного ASR-вызова провайдер не
  // отдаёт доли выполненного — там честны лишь номер окна и время, но не проценты. У таблицы
  // знаменатель есть и он уже посчитан чанк-циклом (доказанное покрытие строк) — его и берём.
  const LINK_STAGES=['transcribing','translating','saved','bound'];
  const TEXT_STAGES=['imported','translating','saved','ready'];
  // Куда попадает каждая фаза журнала на шкале этапов.
  const PHASE_AT={imported:0,transcribing:0,transcribed:1,translating:1,table_ready:2,saving:2,saved:3,binding:3,bound:4,exporting:4,ready:4};
  function stageModel(job){
    const stages=(job&&job.input&&job.input.youtube_source)?LINK_STAGES:TEXT_STAGES;
    const at=PHASE_AT[job&&job.phase];
    const reached=Number.isInteger(at)?at:0;
    const finished=job&&(job.state==='ready'||job.phase==='ready'||job.phase==='bound');
    const stalled=job&&(job.state==='paused'||job.state==='cancelled');
    return stages.map((key,i)=>({
      key,
      label:t('stage'+key.charAt(0).toUpperCase()+key.slice(1)),
      mark:mark(i),
      markLabel:t('mark'+mark(i).charAt(0).toUpperCase()+mark(i).slice(1)),
    }));
    function mark(i){return finished?'done':i<reached?'done':i===reached?(stalled?'stalled':'current'):'pending';}
  }
  function clockShort(sec){const s=Math.max(0,Math.round(Number(sec)||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  function liveDetail(job,live){
    const l=live||{},phase=job&&job.phase;
    // Молчаливый повтор перестаёт быть молчаливым: у ожидания есть причина, номер попытки и срок.
    if(l.retry&&(phase==='transcribing'||phase==='translating')){
      const dict=words[document.documentElement.lang]||words.ru;
      const why=dict['cause'+l.retry.code]||dict.causeYT_FAILED;
      return {percent:null,text:fill(t('detailRetry'),{i:l.retry.attempt,n:l.retry.attempts,sec:l.retry.waitSec,why})};
    }
    if(phase==='transcribing'&&l.asr){
      const total=Number(l.asr.total)||1,index=(Number(l.asr.index)||0)+1;
      const elapsed=clockShort(l.asr.elapsedSec);
      // Номер окна — это НЕ доля выполненного: внутри окна прогресса нам никто не сообщает.
      return {percent:null,text:total>1?fill(t('detailWindow'),{i:index,n:total,time:elapsed}):fill(t('detailElapsed'),{time:elapsed})};
    }
    if(phase==='translating'&&l.table){
      const ready=Number(l.table.readyRows)||0,total=Number(l.table.totalRows)||0;
      const percent=total>0?Math.round(ready*100/total):null;
      // Номер куска телеметрия отдаёт уже 1-based — прибавлять нечего. Зажимаем в диапазон,
      // потому что стартовый снимок из кеша приходит 0-based и «кусок 0» читался бы бессмыслицей.
      const chunks=Number(l.table.chunks)||1;
      const chunk=Math.min(Math.max(1,Number(l.table.chunk)||1),chunks);
      return {percent,text:fill(t('detailRows'),{ready,total,chunk,chunks})};
    }
    // Пока провайдер не прислал ни одного сигнала, единственная честная динамика — время работы.
    if(job&&job.state==='running'&&l.elapsedSec!=null){
      // Оценка времени — обещание. Когда прогон его перерос, экран обязан сказать это сам,
      // а не молчать, подтверждая нарушенное обещание.
      const slow=l.expectedSec&&l.elapsedSec>Number(l.expectedSec);
      return {percent:null,text:fill(t(slow?'detailSlow':'detailElapsed'),{time:clockShort(l.elapsedSec)})};
    }
    return {percent:null,text:''};
  }
  function fill(template,values){return String(template||'').replace(/\{(\w+)\}/g,(m,k)=>values[k]==null?m:String(values[k]));}
  // Живой прогресс приходит СОБЫТИЯМИ от тех, кто его действительно считает: ASR-модуль знает
  // номер окна, чанк-цикл таблицы — доказанное покрытие строк. Второго счётчика не заводим.
  let liveState={},liveTimer=null,liveDialog=null;
  function liveReset(){const keep=liveState.expectedSec;liveState={};if(keep)liveState.expectedSec=keep;if(liveTimer){clearInterval(liveTimer);liveTimer=null;}}
  // Ретрай гасим и при получении любого следующего сигнала прогресса.
  // ВСЕГДА перерисовываем из САМОГО СВЕЖЕГО состояния задачи (d.__job обновляет showTask на каждом
  // переходе фазы). Наблюдение 2026-09-11: таймер держал объект, захваченный ДО старта прогона, и
  // четыре минуты работы выглядели на экране как «остановлено» с пустой строкой под этапами.
  function liveRepaint(){
    if(!liveDialog||!liveDialog.isConnected||!liveDialog.__paintStages||!liveDialog.__job)return;
    liveDialog.__paintStages(liveDialog.__job,liveState);
  }
  function liveAttach(d){
    liveDialog=d;liveState.startedAt=Date.now();
    if(liveTimer)clearInterval(liveTimer);
    // Секундомер — единственная честная «динамика» там, где провайдер долей не сообщает.
    liveTimer=setInterval(()=>{
      const sec=Math.round((Date.now()-liveState.startedAt)/1000);
      liveState.elapsedSec=sec;
      if(liveState.asr)liveState.asr.elapsedSec=sec;
      if(liveState.table)liveState.table.elapsedSec=sec;
      if(liveState.retry){
        liveState.retry.waitSec=Math.max(0,Math.round((liveState.retry.until-Date.now())/1000));
        if(liveState.retry.waitSec<=0)liveState.retry=null;
      }
      liveRepaint();
    },1000);
  }
  function onAsrProgress(event){
    const at=event.detail&&event.detail.at;
    if(!at)return;
    liveState.retry=null;
    liveState.asr={index:Number(at.index)||0,total:Number(at.total)||1,elapsedSec:liveState.asr?liveState.asr.elapsedSec:0};
    liveState.startedAt=liveState.startedAt||Date.now();
    liveRepaint();
  }
  function onTableProgress(event){
    const s2=event.detail||{};
    liveState.retry=null;
    liveState.table={chunk:Number(s2.chunk)||0,chunks:Number(s2.chunks)||1,
      readyRows:Number(s2.readyRows)||0,totalRows:Number(s2.totalRows)||0,elapsedSec:liveState.table?liveState.table.elapsedSec:0};
    liveRepaint();
  }
  function onRetry(event){
    const r=event.detail&&event.detail.at;
    if(!r)return;
    liveState.retry={code:String(r.code||''),attempt:Number(r.attempt)||1,attempts:Number(r.attempts)||1,
      until:Date.now()+(Number(r.waitMs)||0),waitSec:Math.round((Number(r.waitMs)||0)/1000)};
    liveRepaint();
  }
  if(typeof window!=='undefined'&&window.addEventListener){
    window.addEventListener('youtube-asr-retry',onRetry);
    window.addEventListener('youtube-asr-progress',onAsrProgress);
    window.addEventListener('table-job-progress',onTableProgress);
  }
  function ready(){if(!operations)throw new Error('TASK_UI_NOT_READY');if(!store){store=LearningMaterialTask.createStore();runner=LearningMaterialTask.createRunner(store,operations);}return store;}
  function element(tag,content){const el=document.createElement(tag);if(content)el.textContent=content;return el;}
  function dialog(title){if(currentDialog)currentDialog.close();const d=element('dialog');d.className='study-source-dialog';d.setAttribute('aria-label',title);d.append(element('h2',title));const focus=document.activeElement;d.addEventListener('close',()=>{d.remove();if(currentDialog===d)currentDialog=null;if(focus&&focus.isConnected)focus.focus();});document.body.append(d);d.showModal();currentDialog=d;return d;}
  function button(parent,label,fn){const b=element('button',label);b.type='button';b.onclick=fn;parent.append(b);return b;}
  async function showTask(job,d){
    d=d||dialog(t('title'));d.replaceChildren(element('h2',job.input.title));
    const status=element('p',job.state==='running'?'':t(job.state));status.setAttribute('role','status');d.append(status);
    // Этапы с состояниями и живая деталь ТЕКУЩЕГО этапа. Полоса рисуется только когда у
    // прогресса есть настоящий знаменатель (доказанные строки таблицы); у одного ASR-вызова его
    // нет, и придумывать проценты там нельзя — это то же враньё, что и подделанные метки.
    const steps=element('ol');steps.className='lmt-stages';
    const detail=element('p');detail.className='lmt-detail';detail.setAttribute('role','status');
    const bar=document.createElement('progress');bar.className='lmt-bar';bar.max=100;bar.hidden=true;
    function paintStages(current,live){
      steps.replaceChildren();
      for(const stage of stageModel(current)){
        const li=element('li',stage.label);li.dataset.mark=stage.mark;
        const word=element('span',stage.markLabel);word.className='lmt-mark-word';li.append(word);
        li.setAttribute('aria-current',stage.mark==='current'?'step':'false');
        steps.append(li);
      }
      const info=liveDetail(current,live||{});
      detail.textContent=info.text||'';
      if(info.percent==null){bar.hidden=true;bar.removeAttribute('value');}
      else{bar.hidden=false;bar.value=info.percent;bar.textContent=info.percent+'%';}
    }
    paintStages(job,liveState);
    d.append(steps,detail,bar);
    d.__paintStages=paintStages;d.__job=job;
    // Отозванные часы — факт материала, а не деталь прогона: он виден там же, где итог.
    if(job.transcript&&job.transcript.blind){const b=element('p',t('blindNote'));b.dataset.code='ASR_CLOCK_UNVERIFIED';d.append(b);}
    if(job.error){const named=(words[document.documentElement.lang]||words.ru)[job.error];const error=element('p',named||t('error'));error.setAttribute('role','alert');d.append(error);const details=element('details');details.append(element('summary',({ru:'Подробности',en:'Details',he:'פרטים'})[document.documentElement.lang]||'Details'),element('code',job.error));d.append(details);}
    const actions=element('div');actions.className='study-source-actions';d.append(actions);
    if(runner.isRunning(job.id))button(actions,t('cancel'),async()=>{await runner.cancel(job.id);status.textContent=t('stopping');});
    else if(job.state!=='ready')button(actions,t('resume'),()=>execute(job.id,d));
    if(job.package){button(actions,t('download'),async()=>{try{await operations.download(job);status.textContent=t('downloaded');}catch(_){status.textContent=t('error');}});}
    if(job.saved_text_id)button(actions,t('open'),async()=>{try{await operations.openMaterial(job);d.close();}catch(_){status.textContent=t('error');}});
    if(!runner.isRunning(job.id)){button(actions,t('close'),()=>d.close());button(actions,t('remove'),async()=>{await store.remove(job.id);await list(d);});}
    d.oncancel=event=>{if(runner.isRunning(job.id))event.preventDefault();};
    return d;
  }
  async function execute(id,d){
    ready();
    const work=async lock=>{
      if(!lock){d.append(element('p',t('busy')));return;}
      liveReset();liveAttach(d);
      try{const job=await runner.run(id,next=>{if(d.isConnected)showTask(next,d);});await showTask(job,d);}
      catch(_){await showTask(await store.get(id),d);}
      finally{liveReset();try{delete window.v3TableCostQuote;}catch(_){}if(d.isConnected&&d.__job)showTask(d.__job,d);}
    };
    // Studio globals cannot run two independent table jobs concurrently.
    if(navigator.locks)await navigator.locks.request('linguistpro-material-preparation',{ifAvailable:true},work);
    else await work(true);
  }
  // Одна строка сметы на всех потребителей: цена, объём и ОЖИДАЕМОЕ ВРЕМЯ. Человек, которому
  // предстоит ждать минуты, имеет право знать сколько — это такая же часть согласия, как цена.
  function quoteLine(e){
    const base=e.table
      ? fill(t('priceFull'),{d:clock(e.durationSec),asr:money(e.estimatedUsd),
          tlo:money(e.table.lowUsd),thi:money(e.table.highUsd),
          lo:money(e.estimatedUsd+e.table.lowUsd),hi:money(e.estimatedUsd+e.table.highUsd)})
      : fill(t('price'),{d:clock(e.durationSec),p:money(e.estimatedUsd)});
    return e.minutes ? base+' · '+fill(t('minutesNote'),{n:e.minutes}) : base;
  }
  function money(usd){return (usd<0.01?usd.toFixed(4):usd.toFixed(2));}
  function clock(sec){const s=Math.max(0,Math.round(sec||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  async function start(){
    ready();const input=operations.capture(),d=dialog(t('title'));
    const link=input.youtube_source || null;
    if(!input.source_text && !link){d.append(element('p',t('missing')));button(d,t('close'),()=>d.close());return;}
    const title=element('input');title.type='text';title.maxLength=160;title.value=input.title || '';
    const label=element('label',t('name'));label.append(title);d.append(label);
    // Порядок экрана: имя → ЦЕНА → действие → пояснения. Раньше решающая кнопка пряталась под
    // четырьмя абзацами прозы, и на 380 px до неё надо было доскроллить (наблюдение 2026-09-11).
    const actions=element('div');actions.className='study-source-actions';d.append(actions);
    const notes=element('div');notes.className='lmt-notes';
    notes.append(element('p',t('note')+input.provider),element('p',t('cost')));
    if(link)notes.append(element('p',t('linkNote')),element('p',t('captionsFree')));
    d.append(notes);
    const startButton=button(actions,t('start'),async()=>{startButton.disabled=true;try{const job=await LearningMaterialTask.create({...input,title:title.value});await store.add(job);if(quoted)window.v3TableCostQuote=quoted;liveState.expectedSec=expectedSec;await execute(job.id,d);}catch(_){d.append(element('p',t('error')));startButton.disabled=false;}});
    button(actions,t('close'),()=>d.close());title.focus();
    // Платный шаг не начинается вслепую: пока цена не показана, «Подготовить» недоступно. Смета
    // берётся бесплатным countTokens, поэтому сам показ цены ничего не стоит.
    let quoted=null,expectedSec=null;
    if(link){
      const price=element('p','');price.setAttribute('role','status');d.insertBefore(price,actions);
      const retry=button(actions,t('retryEstimate'),()=>quote());retry.hidden=true;
      async function quote(){
        startButton.disabled=true;retry.hidden=true;price.textContent=t('estimating');delete price.dataset.code;
        try{
          const e=await operations.estimate(input);
          quoted=e.table||null;expectedSec=e.minutes?e.minutes*60:null;
          // Обе цены сразу — именно этот показ снимает второй window.confirm посреди прогона.
          price.textContent=quoteLine(e);
          if(e.table&&!d.querySelector('.lmt-price-note')){const n=element('p',t('priceNote'));n.className='lmt-price-note';d.insertBefore(n,actions);}
          if(e.windows>1)price.textContent+=' · '+fill(t('parts'),{n:e.windows});
          startButton.disabled=false;
        }catch(error){
          price.textContent=t('estimateFailed');price.dataset.code=error.code || error.message;retry.hidden=false;
        }
      }
      quote();
    }
  }
  async function list(d){ready();d=d||dialog(t('tasks'));d.replaceChildren(element('h2',t('tasks')));const jobs=await store.list();if(!jobs.length)d.append(element('p',t('empty')));for(const job of jobs){const item=element('p');button(item,job.input.title+' · '+t(job.state),()=>showTask(job,d));d.append(item);}button(d,t('close'),()=>d.close());}
  function labels(){const start=document.getElementById('v3ImportPrepareTask');if(start)start.textContent=t('start');const tasks=document.getElementById('v3LearningTasks');if(tasks)tasks.textContent=t('tasks');}
  window.LearningMaterialTaskUI={configure:value=>{operations=value;},start,list,labels,stageModel,liveDetail,quoteLine};
  document.addEventListener('DOMContentLoaded',labels);document.addEventListener('i18n:changed',labels);
})();
