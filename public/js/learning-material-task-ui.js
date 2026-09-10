(function(){
  'use strict';
  let operations=null,store=null,runner=null,currentDialog=null;
  const words={
    ru:{title:'Подготовка материала',tasks:'Задачи подготовки',name:'Название материала',start:'Подготовить и сохранить',resume:'Продолжить',cancel:'Остановить после текущего шага',close:'Закрыть',download:'Скачать ZIP',open:'Открыть материал',empty:'Сохранённых задач пока нет.',note:'Будет создана новая карточка и подготовлен ZIP. Используется выбранный в Студии переводчик: ',cost:'Перевод может расходовать вашу квоту. Готовые шаги сохраняются на этом устройстве.',imported:'Источник сохранён',transcribing:'Распознаём речь по ссылке',transcribed:'Транскрипт получен',binding:'Привязываем видео к карточке',bound:'Видео привязано',price:'Ролик {d} · распознавание речи ≈${p}',parts:'{n} частей',estimating:'Считаем стоимость…',estimateFailed:'Стоимость посчитать не удалось.',retryEstimate:'Повторить оценку',linkNote:'Материал будет создан прямо из ссылки: скачивать видео не нужно.',captionsFree:'Если у ролика есть свои субтитры, их можно импортировать бесплатно кнопкой «Показать видео».',blindNote:'Часть строк осталась без надёжной привязки ко времени — там караоке молчит.',translating:'Создаём учебную таблицу',table_ready:'Таблица сохранена',saving:'Сохраняем карточку',saved:'Карточка сохранена',exporting:'Проверяем пакет',ready:'Материал готов. Скачайте ZIP и сохраните его в Файлы.',paused:'Задача приостановлена. Источник и готовые шаги сохранены.',cancelled:'Задача остановлена. Можно продолжить с сохранённого шага.',stopping:'Остановимся после текущего шага; его результат сохраним.',error:'Не удалось завершить шаг. Проверьте выбранного переводчика, сеть и доступное место; затем продолжите.',busy:'Другая вкладка уже выполняет подготовку.',remove:'Удалить задачу из списка',missing:'Сначала добавьте текст или субтитры.',downloaded:'Загрузка ZIP запущена. Проверьте, что файл сохранён на устройстве.'},
    en:{title:'Prepare material',tasks:'Preparation tasks',name:'Material title',start:'Prepare and save',resume:'Continue',cancel:'Stop after current step',close:'Close',download:'Download ZIP',open:'Open material',empty:'No saved tasks yet.',note:'A new card and a ZIP package will be prepared. Selected Studio translator: ',cost:'Translation may use your quota. Completed steps are saved on this device.',imported:'Source saved',transcribing:'Recognising speech from the link',transcribed:'Transcript received',binding:'Attaching the video to the card',bound:'Video attached',price:'Video {d} · speech recognition ≈${p}',parts:'{n} parts',estimating:'Working out the cost…',estimateFailed:'The cost could not be worked out.',retryEstimate:'Try the estimate again',linkNote:'The material is built straight from the link: nothing has to be downloaded.',captionsFree:'If the video has captions of its own, importing them with “Show video” costs nothing.',blindNote:'Some rows have no trustworthy timing — karaoke stays silent there.',translating:'Building study table',table_ready:'Table saved',saving:'Saving card',saved:'Card saved',exporting:'Checking package',ready:'Material ready. Download the ZIP and save it in Files.',paused:'Task paused. Source and completed steps are saved.',cancelled:'Task stopped. Continue from the saved step.',stopping:'Stopping after the current step; its result will be saved.',error:'Could not finish this step. Check the selected translator, network and free storage, then continue.',busy:'Another tab is already preparing a material.',remove:'Remove task from list',missing:'Add text or captions first.',downloaded:'ZIP download started. Check that the file was saved on your device.'},
    he:{title:'הכנת חומר',tasks:'משימות הכנה',name:'שם החומר',start:'הכנה ושמירה',resume:'המשך',cancel:'עצירה אחרי השלב הנוכחי',close:'סגירה',download:'הורדת ZIP',open:'פתיחת החומר',empty:'אין עדיין משימות שמורות.',note:'ייווצר כרטיס חדש ותוכן חבילת ZIP. המתרגם שנבחר בסטודיו: ',cost:'התרגום עשוי לנצל את המכסה שלכם. שלבים שהושלמו נשמרים במכשיר הזה.',imported:'המקור נשמר',transcribing:'מזהים דיבור מתוך הקישור',transcribed:'התמלול התקבל',binding:'מקשרים את הווידאו לכרטיס',bound:'הווידאו קושר',price:'סרטון {d} · זיהוי דיבור ≈${p}',parts:'{n} חלקים',estimating:'מחשבים עלות…',estimateFailed:'לא הצלחנו לחשב את העלות.',retryEstimate:'לחשב שוב',linkNote:'החומר נוצר ישירות מהקישור: אין צורך להוריד דבר.',captionsFree:'אם לסרטון יש כתוביות משלו, אפשר לייבא אותן בחינם דרך «הצגת וידאו».',blindNote:'לחלק מהשורות אין תזמון אמין — שם הקריוקי שותק.',translating:'יוצרים טבלת לימוד',table_ready:'הטבלה נשמרה',saving:'שומרים כרטיס',saved:'הכרטיס נשמר',exporting:'בודקים את החבילה',ready:'החומר מוכן. הורידו ZIP ושמרו אותו בקבצים.',paused:'המשימה הושהתה. המקור והשלבים שהושלמו נשמרו.',cancelled:'המשימה נעצרה. אפשר להמשיך מהשלב שנשמר.',stopping:'המשימה תיעצר אחרי השלב הנוכחי; התוצאה שלו תישמר.',error:'השלב לא הושלם. בדקו את המתרגם שנבחר, הרשת והמקום הפנוי ואז המשיכו.',busy:'חומר כבר נמצא בהכנה בלשונית אחרת.',remove:'הסרת המשימה מהרשימה',missing:'הוסיפו קודם טקסט או כתוביות.',downloaded:'הורדת ZIP החלה. ודאו שהקובץ נשמר במכשיר.'}
  };
  const t=key=>(words[document.documentElement.lang]||words.ru)[key];
  function ready(){if(!operations)throw new Error('TASK_UI_NOT_READY');if(!store){store=LearningMaterialTask.createStore();runner=LearningMaterialTask.createRunner(store,operations);}return store;}
  function element(tag,content){const el=document.createElement(tag);if(content)el.textContent=content;return el;}
  function dialog(title){if(currentDialog)currentDialog.close();const d=element('dialog');d.className='study-source-dialog';d.setAttribute('aria-label',title);d.append(element('h2',title));const focus=document.activeElement;d.addEventListener('close',()=>{d.remove();if(currentDialog===d)currentDialog=null;if(focus&&focus.isConnected)focus.focus();});document.body.append(d);d.showModal();currentDialog=d;return d;}
  function button(parent,label,fn){const b=element('button',label);b.type='button';b.onclick=fn;parent.append(b);return b;}
  async function showTask(job,d){
    d=d||dialog(t('title'));d.replaceChildren(element('h2',job.input.title));
    const status=element('p',t(job.state==='running'?job.phase:job.state));status.setAttribute('role','status');d.append(status);
    const steps=element('ol');for(const phase of (job.input.youtube_source?['transcribing','translating','saved','bound']:['imported','translating','saved','ready']))steps.append(element('li',t(phase)));d.append(steps);
    // Отозванные часы — факт материала, а не деталь прогона: он виден там же, где итог.
    if(job.transcript&&job.transcript.blind){const b=element('p',t('blindNote'));b.dataset.code='ASR_CLOCK_UNVERIFIED';d.append(b);}
    if(job.error){const error=element('p',t('error'));error.setAttribute('role','alert');d.append(error);const details=element('details');details.append(element('summary',({ru:'Подробности',en:'Details',he:'פרטים'})[document.documentElement.lang]||'Details'),element('code',job.error));d.append(details);}
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
      try{const job=await runner.run(id,next=>{if(d.isConnected)showTask(next,d);});await showTask(job,d);}
      catch(_){await showTask(await store.get(id),d);}
    };
    // Studio globals cannot run two independent table jobs concurrently.
    if(navigator.locks)await navigator.locks.request('linguistpro-material-preparation',{ifAvailable:true},work);
    else await work(true);
  }
  function money(usd){return (usd<0.01?usd.toFixed(4):usd.toFixed(2));}
  function clock(sec){const s=Math.max(0,Math.round(sec||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  async function start(){
    ready();const input=operations.capture(),d=dialog(t('title'));
    const link=input.youtube_source || null;
    if(!input.source_text && !link){d.append(element('p',t('missing')));button(d,t('close'),()=>d.close());return;}
    const title=element('input');title.type='text';title.maxLength=160;title.value=input.title || '';
    const label=element('label',t('name'));label.append(title);d.append(label,element('p',t('note')+input.provider),element('p',t('cost')));
    if(link)d.append(element('p',t('linkNote')),element('p',t('captionsFree')));
    const actions=element('div');actions.className='study-source-actions';d.append(actions);
    const startButton=button(actions,t('start'),async()=>{startButton.disabled=true;try{const job=await LearningMaterialTask.create({...input,title:title.value});await store.add(job);await execute(job.id,d);}catch(_){d.append(element('p',t('error')));startButton.disabled=false;}});
    button(actions,t('close'),()=>d.close());title.focus();
    // Платный шаг не начинается вслепую: пока цена не показана, «Подготовить» недоступно. Смета
    // берётся бесплатным countTokens, поэтому сам показ цены ничего не стоит.
    if(link){
      const price=element('p','');price.setAttribute('role','status');d.insertBefore(price,actions);
      const retry=button(actions,t('retryEstimate'),()=>quote());retry.hidden=true;
      async function quote(){
        startButton.disabled=true;retry.hidden=true;price.textContent=t('estimating');delete price.dataset.code;
        try{
          const e=await operations.estimate(input);
          price.textContent=t('price').replace('{d}',clock(e.durationSec)).replace('{p}',money(e.estimatedUsd))+
            (e.windows>1?' · '+t('parts').replace('{n}',String(e.windows)):'');
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
  window.LearningMaterialTaskUI={configure:value=>{operations=value;},start,list,labels};
  document.addEventListener('DOMContentLoaded',labels);document.addEventListener('i18n:changed',labels);
})();
