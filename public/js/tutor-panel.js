/* Shared M1 panel. Legacy entry points remain when server capability is disabled. */
(function () {
  'use strict';
  const C = window.LPTutorClient, api = C.createApi();
  const notebookCopy={ru:{save:'Сохранить на этом устройстве',saved:'Объяснение сохранено в этом браузере.',failed:'Не удалось сохранить. Проверьте место в браузере; предел — 50 объяснений.',archived:'Сохранённая версия фрагмента. Новый вопрос отправится только после вашего согласия.'},en:{save:'Save on this device',saved:'Explanation saved in this browser.',failed:'Could not save. Check browser storage; the limit is 50 explanations.',archived:'Saved version of the passage. A new question is sent only with your consent.'},he:{save:'שמירה במכשיר הזה',saved:'ההסבר נשמר בדפדפן הזה.',failed:'השמירה נכשלה. בדקו מקום פנוי; המגבלה היא 50 הסברים.',archived:'גרסה שמורה של הקטע. שאלה חדשה תישלח רק בהסכמתכם.'}};
  const copy = {
    ru: { title:'Разберём вместе', eyebrow:'ЛИЧНЫЙ НАСТАВНИК', source:'Ваш фрагмент',neighbors:'Соседние предложения, которые получит наставник', question:'Что хотите понять?', placeholder:'Например: почему здесь эта форма?', send:'Спросить наставника', close:'Вернуться к тексту', cancel:'Остановить', connect:'Подключить личного агента', refresh:'Проверить соединение', revoke:'Отключить агента', acknowledge:'Разрешаю передать этот фрагмент, соседние предложения и мой вопрос личному агенту и его модели.', waiting:'Наставник готовит объяснение…', queued:'Передаём вопрос вашему агенту…', ready:'Агент подключён', stopped:'Запрос остановлен. Можно вернуться к чтению или задать другой вопрос.', answer:'Объяснение', pair:'Одноразовый код подключения', pairHelp:'Введите этот код в личном коннекторе в течение 5 минут. Новый коннектор заменит прежнее подключение. Не передавайте код другим людям.', retry:'Повторить', login:'Войти в LinguistPro', note:'Ответ помогает разобраться, но не изменяет ваши оценки или расписание повторения.', sourceChanged:'Ответ относится к фрагменту, показанному выше.', defaultQuestion:'Объясни смысл этого предложения и одну важную грамматическую особенность простыми словами.', expired:'Срок контекста истёк. Откройте наставника у нужной строки заново.' },
    en: { title:'Let’s work through it',eyebrow:'YOUR PERSONAL TUTOR',source:'Your passage',neighbors:'Adjacent sentences shared with your tutor',question:'What would you like to understand?',placeholder:'For example: why is this form used?',send:'Ask your tutor',close:'Return to reading',cancel:'Stop',connect:'Connect your agent',refresh:'Check connection',revoke:'Disconnect agent',acknowledge:'Allow this passage, adjacent sentences and my question to be sent to my agent and its model.',waiting:'Your tutor is preparing an explanation…',queued:'Sending your question to your agent…',ready:'Agent connected',stopped:'Request stopped. Return to reading or ask another question.',answer:'Explanation',pair:'One-time connection code',pairHelp:'Enter this code in your personal connector within 5 minutes. A new connector replaces the previous connection. Do not share this code with others.',retry:'Retry',login:'Sign in to LinguistPro',note:'This explanation does not change your grades or review schedule.',sourceChanged:'This answer refers to the passage shown above.',defaultQuestion:'Explain this sentence and one useful grammar feature in simple terms.',expired:'This context has expired. Open the tutor at the relevant sentence again.' },
    he: { title:'נבין יחד',eyebrow:'המורה האישי שלך',source:'הקטע שלך',neighbors:'המשפטים הסמוכים שיישלחו למורה',question:'מה תרצו להבין?',placeholder:'למשל: למה משתמשים בצורה הזאת?',send:'לשאול את המורה',close:'חזרה לקריאה',cancel:'עצירה',connect:'חיבור הסוכן האישי',refresh:'בדיקת חיבור',revoke:'ניתוק הסוכן',acknowledge:'אני מסכים לשלוח את הקטע, המשפטים הסמוכים והשאלה לסוכן האישי ולמודל שלו.',waiting:'המורה מכין הסבר…',queued:'השאלה נשלחת לסוכן האישי…',ready:'הסוכן מחובר',stopped:'הבקשה נעצרה. אפשר לחזור לקריאה או לשאול שאלה אחרת.',answer:'הסבר',pair:'קוד חיבור חד־פעמי',pairHelp:'יש להזין את הקוד במחבר האישי בתוך 5 דקות. חיבור חדש יחליף את החיבור הקודם. אין לשתף את הקוד עם אחרים.',retry:'ניסיון נוסף',login:'כניסה ל־LinguistPro',note:'ההסבר אינו משנה ציונים או את לוח החזרות.',sourceChanged:'התשובה מתייחסת לקטע שמופיע למעלה.',defaultQuestion:'הסבר את המשפט ותופעה דקדוקית אחת במילים פשוטות.',expired:'תוקף ההקשר פג. פתחו שוב את המורה בשורה המתאימה.' },
  };
  const errors = {
    ru: {invalid_context:'Не удалось подготовить фрагмент. Откройте наставника у нужной строки заново.',context_too_large:'Фрагмент слишком длинный. Выберите более короткую строку.',session_limit:'Слишком много недавних вопросов. Повторите через 15 минут.',BAD_CSRF:'Обновите вход в LinguistPro и повторите вопрос.',UNAUTHENTICATED:'Войдите в LinguistPro. Синхронизация библиотеки и Telegram для этого не нужны.',connection_required:'Подключите личного агента, чтобы задать вопрос.',agent_offline:'Агент не в сети. Запустите коннектор на своём компьютере и проверьте соединение.',agent_disconnected:'Связь с агентом прервалась. Повторная генерация автоматически не запускается.',reauth_required:'Личному агенту нужен повторный вход в ChatGPT.',quota_exhausted:'Лимит вашей подписки исчерпан. Вопрос сохранён в этом окне; повторите позже.',invalid_output:'Не удалось получить корректное объяснение. Можно повторить вопрос.',session_busy:'Агент ещё отвечает на другой вопрос. Дождитесь ответа или остановите тот запрос.',service_unavailable:'Сервис связи временно недоступен. Ваш вопрос остаётся в окне.',context_unavailable:'Контекст больше недоступен. Откройте наставника у нужной строки заново.',runtime_failed:'Агент не смог ответить. Проверьте его подключение и повторите запрос.'},
    en: {invalid_context:'Could not prepare this passage. Open the tutor at the sentence again.',context_too_large:'This passage is too long. Select a shorter sentence.',session_limit:'Too many recent questions. Try again in 15 minutes.',BAD_CSRF:'Refresh your LinguistPro sign-in and retry.',UNAUTHENTICATED:'Sign in to LinguistPro. Library sync and Telegram are not required.',connection_required:'Connect your personal agent to ask a question.',agent_offline:'Agent offline. Start your connector and check the connection.',agent_disconnected:'Agent disconnected. Generation will not restart automatically.',reauth_required:'Your agent needs to sign in to ChatGPT again.',quota_exhausted:'Your subscription limit has been reached. Your question remains here; retry later.',invalid_output:'The agent returned an invalid explanation. You can retry.',session_busy:'Your agent is answering another question. Wait or stop that request.',service_unavailable:'The connection service is temporarily unavailable. Your question remains here.',context_unavailable:'Context is no longer available. Open the tutor at the relevant sentence again.',runtime_failed:'The agent could not answer. Check its connection and retry.'},
    he: {invalid_context:'לא ניתן להכין את הקטע. פתחו שוב את המורה בשורה המתאימה.',context_too_large:'הקטע ארוך מדי. בחרו משפט קצר יותר.',session_limit:'יותר מדי שאלות אחרונות. נסו שוב בעוד 15 דקות.',BAD_CSRF:'רעננו את הכניסה ל־LinguistPro ונסו שוב.',UNAUTHENTICATED:'יש להיכנס ל־LinguistPro. אין צורך בסנכרון הספרייה או בטלגרם.',connection_required:'חברו את הסוכן האישי כדי לשאול שאלה.',agent_offline:'הסוכן אינו מחובר. הפעילו את המחבר ובדקו את החיבור.',agent_disconnected:'החיבור לסוכן נותק. הבקשה לא תופעל שוב אוטומטית.',reauth_required:'הסוכן צריך להיכנס שוב ל־ChatGPT.',quota_exhausted:'הגעתם למגבלת המנוי. השאלה נשמרת בחלון; נסו שוב מאוחר יותר.',invalid_output:'לא התקבל הסבר תקין. אפשר לנסות שוב.',session_busy:'הסוכן עונה לשאלה אחרת. המתינו או עצרו את הבקשה ההיא.',service_unavailable:'שירות החיבור אינו זמין כרגע. השאלה נשמרת בחלון.',context_unavailable:'ההקשר אינו זמין עוד. פתחו את המורה בשורה המתאימה.',runtime_failed:'הסוכן לא הצליח לענות. בדקו את החיבור ונסו שוב.'},
  };
  let panel, root, words, lang, draft, context, connection, session, requestKey, timer, busy = false, generation = 0, opening = 0, origin, owner;
  function remember() {
    try { sessionStorage.setItem('lp.tutor.resume',JSON.stringify({owner,id:session.id,revision:context.source.revision_id,material:context.source.material_id})); } catch (_) {}
  }
  function node(tag, text, attrs = {}) { const n = document.createElement(tag); if (text) n.textContent = text; Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v)); return n; }
  function $(id) { return root.getElementById(id); }
  function status(text) { $('status').textContent = text; }
  function error(e) {
    busy = false; $('send').disabled = false; $('question').readOnly=false; $('cancel').hidden = true;
    const code = e.code || e.message;
    status(code === 'context_expired' ? words.expired : errors[lang][code] || errors[lang].service_unavailable);
    $('login').hidden = code !== 'UNAUTHENTICATED';
  }
  function mount() {
    if (panel) panel.remove();
    panel = document.createElement('dialog'); panel.setAttribute('aria-label', words.title);panel.setAttribute('data-lp-tutor','');
    if(!document.getElementById('lpTutorBackdrop')){const backdrop=node('style');backdrop.id='lpTutorBackdrop';backdrop.textContent='dialog[data-lp-tutor]::backdrop{background:rgba(20,35,30,.48);backdrop-filter:blur(5px)}';document.head.append(backdrop);}
    panel.style.cssText='padding:0;border:0;border-radius:20px;width:min(640px,calc(100vw - 24px));max-height:calc(100dvh - 24px);background:#f9f8f3;color:#203c36;box-shadow:0 20px 80px #152e3840';
    const shadowHost=document.createElement('div');panel.append(shadowHost);
    root = shadowHost.attachShadow({mode:'open'});
    const style = node('style'); style.textContent = `:host{font-family:system-ui,sans-serif;color-scheme:light}*{box-sizing:border-box}.body{padding:26px;display:grid;gap:16px;max-height:calc(100dvh - 24px);overflow:auto}h2{font-size:26px;margin:0;letter-spacing:-.6px}p{margin:0;line-height:1.6}h3{font-size:20px;margin:0}.practice-result{display:grid;gap:10px}.practice-result:empty,#practiceHost [role=status]:empty{display:none}.eyebrow{font-size:11px;font-weight:700;letter-spacing:1.8px;color:#587467}.source{border-inline-start:3px solid #b4c9a3;background:#edf0e5;padding:16px;font-size:24px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}label{display:block;font-size:14px;line-height:1.55}textarea{width:100%;font:inherit;padding:12px;border:1px solid #aebdb1;border-radius:10px;resize:vertical;min-height:84px;background:white;color:#203c36}button,a{font:inherit;min-height:44px;border-radius:10px;padding:10px 15px;cursor:pointer}button{border:1px solid #aebdb1;background:transparent;color:#203c36}button.primary{background:#234e40;color:white;border-color:#234e40}button:disabled{opacity:.55;cursor:wait}button:focus-visible,a:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid #51866d;outline-offset:3px}.actions{display:flex;flex-wrap:wrap;gap:8px}.meta{font-size:13px;color:#53675d}#status{min-height:24px;font-size:14px;line-height:1.5}#answer{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75;font-size:17px;border-top:1px solid #ccd5c8;padding-top:18px}#pairCode{font:14px monospace;display:block;overflow-wrap:anywhere;user-select:all;background:white;padding:12px}input{width:20px;height:20px;vertical-align:middle;accent-color:#234e40;margin-inline-end:8px}[hidden]{display:none!important}summary{cursor:pointer;min-height:44px;padding-block:12px}@media(max-width:480px){.body{padding:18px;gap:13px}h2{font-size:23px}.source{font-size:22px}.actions button{flex:1 1 auto}}`;
    root.append(style);
    const body=node('section',null,{class:'body',dir:lang==='he'?'rtl':'ltr'}); root.append(body);
    body.append(node('p',words.eyebrow,{class:'eyebrow'}),node('h2',words.title),node('p',words.source,{class:'meta'}),node('div',context?.source.excerpt || '',{id:'source',class:'source',dir:'rtl'}));
    if(context?.source.media){const m=context.source.media,clock=ms=>new Date(ms).toISOString().slice(11,19);body.append(node('p',(lang==='ru'?'Фрагмент субтитров':lang==='he'?'קטע כתוביות':'Caption segment')+' · '+clock(m.start_ms)+'–'+clock(m.end_ms),{class:'meta'}));}
    if(context?.source.before || context?.source.after){const surrounding=node('details');surrounding.append(node('summary',words.neighbors),node('p',[context.source.before,context.source.after].filter(Boolean).join('\n'),{class:'source',dir:'rtl'}));body.append(surrounding);}
    const label=node('label',words.question,{for:'question'}), question=node('textarea',null,{id:'question',placeholder:words.placeholder,maxlength:'1000',dir:'auto'});
    question.value=draft||''; body.append(label,question);
    const consent=node('label'); consent.append(node('input',null,{type:'checkbox',id:'consent'}),document.createTextNode(words.acknowledge)); body.append(consent);
    body.append(node('p',null,{id:'status',role:'status','aria-live':'polite'}));
    const answer=node('div',null,{id:'answer',dir:'auto','aria-label':words.answer}); answer.hidden=true; body.append(answer);
    const actions=node('div',null,{class:'actions'});
    const send=node('button',words.send,{id:'send',class:'primary',type:'button'}),cancel=node('button',words.cancel,{id:'cancel',type:'button'}); cancel.hidden=true;
    const close=node('button',words.close,{type:'button'}), login=node('a',words.login,{id:'login',href:'/library.html#cloud'}); login.hidden=true;
    const practiceButton=node('button',window.LPTutorPractice.label(lang),{id:'practiceStart',type:'button'});practiceButton.hidden=true;
    actions.append(send,practiceButton,cancel,close,login);body.append(actions);
    const save=node('button',notebookCopy[lang].save,{id:'saveExplanation',type:'button'});save.hidden=true;body.append(save);
    save.onclick=async()=>{try{
      if(session?.state!=='completed')return;
      const wantedOwner=owner,wantedPanel=panel,record={schema:1,status:'accepted',context,question:session.question,answer:session.result.text};
      const user=await api.identity();if(user!==wantedOwner||panel!==wantedPanel)throw Error('owner_changed');
      await window.LPTutorNotebook.local().save(user,record);if(panel===wantedPanel)status(notebookCopy[lang].saved);
    }catch(_){status(notebookCopy[lang].failed);}};
    const notebook=node('button',window.LPTutorNotebook.copy[lang].title,{type:'button'});
    notebook.onclick=()=>window.LPTutorNotebook.show({api,locale:lang,currentSource:context?.source,onContinue:openSaved});body.append(notebook);
    const setup=node('a',words.connect,{href:'/tutor-connect.html#lang='+lang,target:'_blank',rel:'noopener'});body.append(setup);
    const details=node('details'); details.append(node('summary',lang==='ru'?'Ручное подключение':lang==='he'?'חיבור ידני':'Manual connection'));
    const connect=node('button',words.connect,{type:'button'}), refresh=node('button',words.refresh,{type:'button'}),revoke=node('button',words.revoke,{type:'button'});
    const pair=node('section',null,{id:'pair'}); pair.hidden=true; pair.append(node('p',words.pairHelp,{class:'meta'}),node('code',null,{id:'pairCode',dir:'ltr','aria-label':words.pair}));
    const connectionActions=node('div',null,{class:'actions'});connectionActions.append(connect,refresh,revoke); details.append(connectionActions,pair); body.append(details,node('p',words.note,{class:'meta'}));
    const explanationView=node('div',null,{id:'explanationView'});explanationView.style.cssText='display:grid;gap:16px';
    Array.from(body.children).slice(2).forEach(child=>explanationView.append(child));body.append(explanationView);
    const practiceHost=node('section',null,{id:'practiceHost'});practiceHost.hidden=true;body.append(practiceHost);
    practiceButton.onclick=()=>{
      if(!session||session.state!=='completed')return;
      const openedPanel=panel,id=session.id;
      explanationView.hidden=true;practiceHost.hidden=false;
      window.LPTutorPractice.create({host:practiceHost,api,sessionId:id,locale:lang,owner,
        isCurrent:()=>panel===openedPanel&&panel.open&&session?.id===id&&!practiceHost.hidden,
        onBack:()=>{practiceHost.hidden=true;explanationView.hidden=false;practiceButton.focus();},onClose:()=>openedPanel.close()});
    };
    send.onclick=sendQuestion;
    cancel.onclick=()=>cancelQuestion(); close.onclick=()=>panel.close();
    refresh.onclick=()=>refreshConnection().catch(error);
    connect.onclick=async()=>{try{owner=await api.identity();const p=await api.call('/pair',{});$('pairCode').textContent=p.pairing_code;$('pair').hidden=false;status(words.pair);}catch(e){error(e);}};
    revoke.onclick=async()=>{try{await api.identity();await api.call('/revoke',{});connection=null;session=null;clearTimeout(timer);generation++;busy=false;$('send').disabled=false;$('question').readOnly=false;$('cancel').hidden=true;$('answer').hidden=true;$('practiceStart').hidden=true;$('pair').hidden=true;status(errors[lang].connection_required);}catch(e){error(e);}};
    panel.addEventListener('close',()=>{draft=$('question').value;clearTimeout(timer);generation++;if(busy)cancelQuestion().catch(()=>{});origin?.focus();});
    document.body.append(panel);panel.showModal();question.focus();
  }
  async function refreshConnection() {
    const user=await api.identity();
    if(owner && owner!==user){session=null;requestKey=null;context=null;$('source').textContent='';$('answer').hidden=true;$('practiceStart').hidden=true;throw Object.assign(new Error('context_unavailable'),{code:'context_unavailable'});}
    owner=user; connection=await api.call('/connection');status(connection.status==='online'?words.ready:errors[lang][connection.status]);
  }
  async function poll(turn) {
    if(turn!==generation||!session) return;
    try {
      const current=await api.call('/sessions/'+encodeURIComponent(session.id)+'?since='+session.version);
      if(turn!==generation) return;
      if(!current.unchanged) session=current;
      if(session.state==='completed') {busy=false;$('send').disabled=false;$('question').readOnly=false;$('cancel').hidden=true;$('answer').textContent=session.result.text;$('answer').hidden=false;$('saveExplanation').hidden=false;$('practiceStart').hidden=session.practice_available!==true;status(words.sourceChanged);requestKey=null;return;}
      if(session.state==='failed'){requestKey=null;throw Object.assign(new Error(session.error),{code:session.error});}
      if(session.state==='cancelled'){busy=false;$('send').disabled=false;$('question').readOnly=false;$('cancel').hidden=true;requestKey=null;status(words.stopped);return;}
      status(session.state==='queued'?words.queued:words.waiting);
    }catch(e){if(turn!==generation)return;if(['context_unavailable','connection_required','UNAUTHENTICATED'].includes(e.code)){session=null;error(e);return;}if(session?.state==='failed'){error(e);return;}status(errors[lang].service_unavailable);}
    timer=setTimeout(()=>poll(turn),1500);
  }
  async function sendQuestion() {
    if(busy) return;
    if(!$('consent').checked){$('consent').focus();status(words.acknowledge);return;}
    if(!context){status(words.expired);return;}
    busy=true;$('send').disabled=true;$('question').readOnly=true;$('cancel').hidden=false;$('answer').hidden=true;$('practiceStart').hidden=true;$('saveExplanation').hidden=true;status(words.queued);
    const turn=++generation;
    try {
      await refreshConnection();
      draft=$('question').value.trim()||words.defaultQuestion;
      // Only an explicit new question creates a new request key; network retry reuses it.
      const signature=JSON.stringify([context,draft,connection.connection_id]);
      if(!requestKey||requestKey.signature!==signature)requestKey={signature,id:crypto.randomUUID().replace(/-/g,'')};
      const created=await api.call('/sessions',{connection_id:connection.connection_id,request_key:requestKey.id,context,question:draft,consent:'selected_fragment_v1'});
      if(turn!==generation){await api.call('/sessions/'+created.id+'/cancel',{});return;}
      session=created;
      remember();
      poll(turn);
    }catch(e){if(turn===generation)error(e);}
  }
  async function cancelQuestion() {
    clearTimeout(timer);generation++;
    const cancelTurn=generation;
    const pending=session;busy=false;$('send').disabled=false;$('question').readOnly=false;$('cancel').hidden=true;
    if(pending && ['queued','running'].includes(pending.state)){
      try{await api.identity();const cancelled=await api.call('/sessions/'+pending.id+'/cancel',{});if(cancelTurn!==generation)return;session=cancelled;status(words.stopped);requestKey=null;}
      catch(e){if(cancelTurn===generation)status(errors[lang].service_unavailable);}
    }else status(words.stopped);
  }
  async function tryOpen(input) {
    if(panel?.open&&busy){panel.focus();return true;}
    const openId=++opening;
    let snapshot,captureError;try{snapshot=C.capture({...input,locale:document.documentElement.lang.split('-')[0]});}catch(e){captureError=e;}
    let capability;
    try{capability=await api.call('/capabilities');}catch(e){capability={enabled:true,error:e};}
    if(openId!==opening)return true;
    if(!capability.enabled)return false;
    clearTimeout(timer);generation++;session=null;requestKey=null;connection=null;owner=null;busy=false;draft='';
    if(captureError){lang=['ru','en','he'].includes(document.documentElement.lang)?document.documentElement.lang:'ru';words=copy[lang];origin=document.activeElement;context=null;mount();error(captureError);return true;}
    let built;try{built=await C.build(snapshot);}catch(e){lang=snapshot.locale;words=copy[lang];origin=document.activeElement;context=null;mount();error({code:'invalid_context'});return true;}if(openId!==opening)return true;
    lang=snapshot.locale;words={...copy[lang]};
    if(input.surface==='review')words.close=lang==='ru'?'Вернуться к повторению':lang==='he'?'חזרה לחזרה':'Return to review';
    origin=document.activeElement;context=built;draft=typeof input.question==='string'?input.question.slice(0,1000):'';mount();
    $('consent').disabled=true;$('send').disabled=true;
    panel.setAttribute('data-lp-tutor','');
    input.onOpened?.();
    if(capability.error)error(capability.error);else {
      try {
        await refreshConnection();
        if(openId!==opening)return true;
        let saved;try{saved=JSON.parse(sessionStorage.getItem('lp.tutor.resume')||'null');}catch(_){}
        if(saved && saved.owner===owner && saved.revision===context.source.revision_id && saved.material===context.source.material_id){
          try {
            const restored=await api.call('/sessions/'+encodeURIComponent(saved.id));
            if(openId!==opening)return true;
            if(!input.question || restored.question===input.question){
            session=restored;$('question').value=restored.question;$('consent').checked=true;
            busy=['queued','running'].includes(session.state);$('send').disabled=busy;$('question').readOnly=busy;$('cancel').hidden=!busy;
            poll(++generation);
            }
          }catch(_){try{sessionStorage.removeItem('lp.tutor.resume');}catch(_){}}
        }
      }catch(e){if(openId===opening)error(e);}
    }
    if(openId===opening){$('consent').disabled=false;$('send').disabled=busy;}
    return true;
  }
  async function openSaved(record){
    const user=await api.identity();if(String(user)!==record.owner)return;
    if(busy)await cancelQuestion();
    const previousOrigin=panel?.open?origin:document.activeElement;
    clearTimeout(timer);generation++;opening++;session=null;requestKey=null;connection=null;owner=user;busy=false;
    context=JSON.parse(JSON.stringify(record.context));lang=context.locale;words={...copy[lang]};draft='';origin=previousOrigin;
    if(context.surface==='review')words.close=lang==='ru'?'Вернуться к повторению':lang==='he'?'חזרה לחזרה':'Return to review';
    mount();$('answer').textContent=record.answer;$('answer').hidden=false;status(notebookCopy[lang].archived);
  }
  window.LPTutor={tryOpen,openSaved};
})();
