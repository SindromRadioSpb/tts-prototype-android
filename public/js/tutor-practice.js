/* M2: source-backed recall. No model grading or canonical progress writes. */
(function(){
 'use strict';
 const copy={
  ru:{start:'Закрепить за минуту',title:'Вспомните слово',intro:'Восстановите пропуск по только что прочитанному фрагменту. Можно писать без огласовок.',answer:'Слово из исходника',submit:'Сверить с исходником',hint:'Показать слово',skip:'Пропустить',back:'К объяснению',close:'Вернуться к тексту',loading:'Готовим упражнение…',saved:'Итог попытки',match:'Совпало с исходником',different:'В исходнике было иначе',skipped:'Попытка пропущена',original:'В исходнике',yours:'Ваш ответ',help:'Слово было показано перед ответом.',noHelp:'Слово дополнительно не раскрывалось.',limits:'Это короткое закрепление после объяснения. Оно не подтверждает самостоятельное владение словом и не меняет расписание повторений.',differenceNote:'Другой вариант может подходить по смыслу. Здесь проверяется только восстановление исходного слова, а не грамматическая правильность.',error:'Не удалось сохранить ответ. Он остаётся в поле; повторите отправку.',unavailable:'Для этого фрагмента упражнение пока недоступно. Можно продолжить разбор или вернуться к чтению.',expired:'Контекст истёк или подключение изменилось. Откройте наставника у нужной строки заново.',empty:'Введите слово или пропустите попытку.',ttl:'Итог доступен в этой сессии до истечения контекста (15 минут).'},
  en:{start:'Practise for a minute',title:'Recall the word',intro:'Restore the missing word from the passage you just read. Vowel marks are optional.',answer:'Word from the source',submit:'Compare with source',hint:'Show the word',skip:'Skip',back:'Back to explanation',close:'Return to reading',loading:'Preparing practice…',saved:'Attempt summary',match:'Matches the source',different:'The source used another word',skipped:'Attempt skipped',original:'In the source',yours:'Your answer',help:'The word was revealed before answering.',noHelp:'The word was not revealed again.',limits:'This is practice after an explanation. It does not establish independent mastery or change your review schedule.',differenceNote:'Another word may make sense. This checks source recall, not grammatical correctness.',error:'Could not save your answer. It remains here; try sending again.',unavailable:'Practice is not available for this passage yet. Continue the explanation or return to reading.',expired:'Context expired or connection changed. Open the tutor at the sentence again.',empty:'Enter a word or skip this attempt.',ttl:'This summary remains in the session until its context expires (15 minutes).'},
  he:{start:'דקה של תרגול',title:'נסו להיזכר במילה',intro:'השלימו את המילה החסרה מהקטע שקראתם עכשיו. אפשר לכתוב בלי ניקוד.',answer:'המילה מהמקור',submit:'השוואה למקור',hint:'הצגת המילה',skip:'דילוג',back:'חזרה להסבר',close:'חזרה לקריאה',loading:'מכינים תרגול…',saved:'סיכום הניסיון',match:'תואם למקור',different:'במקור הופיעה מילה אחרת',skipped:'הניסיון דולג',original:'במקור',yours:'התשובה שלכם',help:'המילה הוצגה לפני התשובה.',noHelp:'המילה לא הוצגה שוב.',limits:'זהו תרגול אחרי הסבר. הוא אינו מעיד על שליטה עצמאית ואינו משנה את לוח החזרות.',differenceNote:'ייתכן שמילה אחרת מתאימה למשמעות. כאן בודקים שחזור של המקור, לא תקינות דקדוקית.',error:'לא ניתן לשמור את התשובה. היא נשארת בשדה; נסו לשלוח שוב.',unavailable:'התרגול עדיין אינו זמין לקטע הזה. אפשר להמשיך בהסבר או לחזור לקריאה.',expired:'תוקף ההקשר פג או החיבור השתנה. פתחו שוב את המורה בשורה המתאימה.',empty:'הזינו מילה או דלגו על הניסיון.',ttl:'הסיכום זמין במפגש עד שתוקף ההקשר יפוג (15 דקות).'}
 };
 function node(tag,text,attrs={}){const n=document.createElement(tag);if(text)n.textContent=text;Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));return n;}
 function create({host,api,sessionId,locale,owner,onBack,onClose,isCurrent}){
  const w=copy[locale]||copy.ru;let state,pending=false,key=null;
  const title=node('h3',w.title,{tabindex:'-1'}),intro=node('p',w.intro),stimulus=node('div','',{class:'source',dir:'rtl'});
  const label=node('label',w.answer,{for:'practiceAnswer'}),input=node('input','',{id:'practiceAnswer',type:'text',dir:'rtl',maxlength:'160',autocomplete:'off'});
  input.style.cssText='width:100%;height:52px;padding:10px;font:24px system-ui;border:1px solid #aebdb1;border-radius:10px;background:white;color:#203c36';
  const status=node('p',w.loading,{role:'status','aria-live':'polite'}),result=node('section','',{class:'practice-result'});
  const actions=node('div','',{class:'actions'}),send=node('button',w.submit,{type:'button',class:'primary'}),hint=node('button',w.hint,{type:'button'}),skip=node('button',w.skip,{type:'button'});
  const navigation=node('div','',{class:'actions'}),back=node('button',w.back,{type:'button'}),close=node('button',w.close,{type:'button'});
  actions.append(send,hint,skip);navigation.append(back,close);
  host.replaceChildren(title,intro,stimulus,label,input,status,result,actions,navigation,node('p',w.limits,{class:'meta'}));
  host.style.cssText='display:grid;gap:16px';back.onclick=onBack;close.onclick=onClose;
  function lock(value){pending=value;send.disabled=hint.disabled=skip.disabled=value;input.readOnly=value;}
  async function call(path,body){const user=await api.identity();if(user!==owner)throw Object.assign(new Error(),{code:'context_unavailable'});return api.call('/sessions/'+encodeURIComponent(sessionId)+'/practice'+path,body);}
  function render(value){
   state=value;status.textContent='';stimulus.textContent=state.masked;result.replaceChildren();
   const receipt=state.receipt;
   if(receipt){
    title.textContent=w.saved;intro.hidden=true;input.hidden=label.hidden=actions.hidden=true;
    result.append(node('h3',w[receipt.outcome==='source_match'?'match':receipt.outcome==='source_diff'?'different':'skipped']));
    if(receipt.answer && receipt.outcome!=='source_match')result.append(node('p',w.yours,{class:'meta'}),node('p',receipt.answer,{class:'source',dir:'rtl'}));
    result.append(node('p',w.original,{class:'meta'}),node('p',receipt.expected,{class:'source',dir:'rtl'}));
    if(receipt.outcome==='source_diff')result.append(node('p',w.differenceNote));
    result.append(node('p',receipt.hint_seen?w.help:w.noHelp,{class:'meta'}),node('p',w.ttl,{class:'meta'}));
    title.focus();
   }else if(state.hint_seen){result.append(node('p',w.original,{class:'meta'}),node('p',state.expected,{class:'source',dir:'rtl'}));hint.disabled=true;input.focus();}
   else input.focus();
  }
  function failure(e){lock(false);status.textContent=['context_unavailable','context_expired','connection_required','UNAUTHENTICATED'].includes(e.code)?w.expired:e.code==='practice_unavailable'?w.unavailable:w.error;if(!state)actions.hidden=input.hidden=label.hidden=true;}
  async function load(){lock(true);try{const value=await call('',{});if(!isCurrent())return;lock(false);render(value.practice);}catch(e){if(isCurrent())failure(e);}}
  hint.onclick=async()=>{if(pending)return;lock(true);try{const value=await call('/hint',{});if(!isCurrent())return;lock(false);render(value.practice);}catch(e){if(isCurrent())failure(e);}};
  async function attempt(skipped){
   if(pending)return;if(!skipped&&!input.value.trim()){status.textContent=w.empty;input.focus();return;}
   const answer=skipped?'':input.value.trim(),signature=JSON.stringify([answer,skipped]);
   if(!key||key.signature!==signature)key={signature,id:crypto.randomUUID().replace(/-/g,'')};
   lock(true);
   try{const value=await call('/attempt',{answer,skipped,attempt_key:key.id});if(!isCurrent())return;lock(false);render(value.practice);}
   catch(e){if(!isCurrent())return;if(e.code==='attempt_closed'){await load();return;}failure(e);}
  }
  send.onclick=()=>attempt(false);skip.onclick=()=>attempt(true);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();attempt(false);}};
  title.focus();load();
 }
 window.LPTutorPractice={create,label:locale=>(copy[locale]||copy.ru).start};
})();
