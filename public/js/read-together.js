/* Explicit foreground fragment sharing. No automatic scroll, playback, screen capture or wake-up. */
(function () {
  'use strict';
  const copies={
    ru:{title:'Читать вместе с dot',start:'Начать передачу',stop:'Остановить передачу',share:'Передать выбранную строку',line:'Строка',connection:'Разрешённое подключение агента',consent:'Передаётся только выбранная строка и выделение. Спросите dot в разговоре; автоматического пробуждения нет.',idle:'Передача выключена.',active:'Передача включена до',offline:'Связь потеряна. Контекст перестанет быть доступен через две минуты. Повторите остановку после восстановления связи.',unsupported:'Нужен текст или медиа с подготовленными строками субтитров.',apply:'Применить',save:'Сохранить заметку на устройстве',dismiss:'Отклонить',saved:'Заметка сохранена.',failed:'Не удалось выполнить действие',selection:'Выделение',none:'Вся строка',reload:'Обновить подключения',removeNote:'Удалить заметку'},
    en:{title:'Read together with dot',start:'Start sharing',stop:'Stop sharing',share:'Share selected line',line:'Line',connection:'Authorized agent connection',consent:'Only the selected line and selection are shared. Ask dot in the conversation; there is no automatic wake-up.',idle:'Sharing is off.',active:'Sharing is on until',offline:'Connection lost. Context becomes unavailable within two minutes. Retry stopping after reconnect.',unsupported:'Text or media with prepared caption rows is required.',apply:'Apply',save:'Save note on this device',dismiss:'Dismiss',saved:'Note saved.',failed:'Could not complete action',selection:'Selection',none:'Whole line',reload:'Refresh connections',removeNote:'Delete note'},
    he:{title:'לקרוא יחד עם dot',start:'התחלת שיתוף',stop:'עצירת שיתוף',share:'שיתוף השורה הנבחרת',line:'שורה',connection:'חיבור סוכן מורשה',consent:'רק השורה והבחירה משותפות. שאלו את dot בשיחה; אין התעוררות אוטומטית.',idle:'השיתוף כבוי.',active:'השיתוף פעיל עד',offline:'החיבור אבד. ההקשר יפסיק להיות זמין תוך שתי דקות. נסו לעצור שוב לאחר החיבור.',unsupported:'נדרש טקסט או מדיה עם שורות כתוביות מוכנות.',apply:'החלה',save:'שמירת הערה במכשיר',dismiss:'דחייה',saved:'ההערה נשמרה.',failed:'הפעולה נכשלה',selection:'בחירה',none:'כל השורה',reload:'רענון חיבורים',removeNote:'מחיקת הערה'}
  };
  function errorMessage(error){
    const code=error.code||error.message,lang=source?.locale||'ru';
    const messages={
      ru:{RT_BUSY:'Другая вкладка уже передаёт контекст. Остановите её сессию или дождитесь истечения.',RT_TAB_CONFLICT:'Управляйте передачей в той вкладке, где включили её.',RT_STALE:'Материал изменился. Начните новую сессию.',RT_UNAVAILABLE:'Сессия завершена или истекла. Можно начать новую.',RT_ACCESS_REVOKED:'Доступ отозван. Нужно новое разрешение и новая сессия.',UNAUTHENTICATED:'Войдите в свой аккаунт.',OWNER_CHANGED:'Аккаунт изменился. Передача остановлена.',CONNECTION_REQUIRED:'Сначала разрешите подключение агента в настройках доступа.',RT_TOO_LARGE:'Строка слишком длинная для передачи. Выберите более короткий фрагмент.'},
      en:{RT_BUSY:'Another tab is sharing context. Stop its session or wait for expiry.',RT_TAB_CONFLICT:'Control sharing in the tab where you started it.',RT_STALE:'The material changed. Start a new session.',RT_UNAVAILABLE:'The session ended or expired. You can start another.',RT_ACCESS_REVOKED:'Access was revoked. New permission and a new session are required.',UNAUTHENTICATED:'Sign in to your account.',OWNER_CHANGED:'The account changed. Sharing stopped.',CONNECTION_REQUIRED:'Authorize an agent connection in access settings first.',RT_TOO_LARGE:'This line is too long to share. Choose a shorter passage.'},
      he:{RT_BUSY:'לשונית אחרת משתפת הקשר. עצרו אותה או המתינו לפקיעת התוקף.',RT_TAB_CONFLICT:'נהלו את השיתוף בלשונית שבה התחלתם.',RT_STALE:'החומר השתנה. התחילו מפגש חדש.',RT_UNAVAILABLE:'המפגש הסתיים או פג תוקפו. אפשר להתחיל מחדש.',RT_ACCESS_REVOKED:'הגישה בוטלה. נדרשים אישור ומפגש חדשים.',UNAUTHENTICATED:'היכנסו לחשבון שלכם.',OWNER_CHANGED:'החשבון השתנה. השיתוף נעצר.',CONNECTION_REQUIRED:'אשרו קודם חיבור סוכן בהגדרות הגישה.',RT_TOO_LARGE:'השורה ארוכה מדי לשיתוף. בחרו קטע קצר יותר.'}
    };
    return messages[lang]?.[code]||words.failed;
  }
  const tab=crypto.randomUUID();
  let host, source, session, csrf, owner, key, busy=false, timer, generation=0, stopped=false, pendingStop=null;
  let words=copies.ru, connections=[], inflightStart=null;
  const applied=new Set();
  function showNotes(){if(!host||!owner)return;const out=host.querySelector('[data-notes]');out.replaceChildren();const summary=node('summary',source.locale==='he'?'הערות במכשיר':source.locale==='en'?'Notes on this device':'Заметки на устройстве');out.append(summary);try{const notes=JSON.parse(localStorage.getItem('lp-read-together-notes:'+owner)||'{}');for(const n of Object.values(notes)){const article=node('article');article.dir='auto';article.append(node('p',n.body),node('small',n.context.text));const remove=node('button',words.removeNote);remove.type='button';const noteOwner=owner;remove.onclick=async()=>{try{await identity();if(owner!==noteOwner)return;const k='lp-read-together-notes:'+owner,records=JSON.parse(localStorage.getItem(k)||'{}');delete records[n.id];localStorage.setItem(k,JSON.stringify(records));showNotes();}catch(e){status(errorMessage(e));}};article.append(remove);out.append(article);}}catch(e){status(words.failed+': STORAGE_UNAVAILABLE');}}
  const node=(tag,value)=>{const e=document.createElement(tag);if(value)e.textContent=value;return e;};
  function status(value){if(host)host.querySelector('[role=status]').textContent=value;}
  async function request(path,body){
    const r=await fetch('/api/read-together'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(body===undefined?{}:{'X-LP-CSRF':csrf})},body:body===undefined?undefined:JSON.stringify(body)});
    const d=await r.json();if(!r.ok||!d.ok)throw Object.assign(Error(d.error||'offline'),{code:d.error});return d;
  }
  async function identity(){const r=await fetch('/api/auth/me',{cache:'no-store',credentials:'same-origin'});const d=await r.json();if(!r.ok||!d.user||!d.csrf){owner=null;session=null;host?.querySelector('[data-notes]')?.replaceChildren();host?.querySelector('[data-results]')?.replaceChildren();throw Error('UNAUTHENTICATED');}if(owner&&owner!==d.user.id){session=null;throw Error('OWNER_CHANGED');}owner=d.user.id;csrf=d.csrf;}
  const materialRevision = snapshot => JSON.stringify({materialKey:snapshot.materialKey,rows:snapshot.rows.map((r,i)=>[r._v3_sentenceId??r.id??i,r.he_niqqud||r.he||r.he_plain||'']),captionRevision:snapshot.mediaPassport?.timingMap?.revision_id||null,captionHash:snapshot.mediaPassport?.timingMap?.revision_sha256||null});
  const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
  function buttons(){stopDock.hidden=!session&&!pendingStop&&!inflightStart;stopDock.textContent=words.stop;if(!host)return;host.querySelector('[data-start]').disabled=busy||!!session||!!pendingStop||!connections.length||!source?.get().rows.length;host.querySelector('[data-share]').disabled=busy||!session;host.querySelector('[data-stop]').disabled=!session&&!pendingStop&&!inflightStart;}
  async function refreshConnections(){
    try{await identity();const r=await fetch('/api/agent-access/connections',{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'ACCESS_UNAVAILABLE');connections=(d.connections||[]).filter(c=>['ACTIVE','SCOPE_REDUCED'].includes(c.status)&&(!c.grants||c.grants.some(g=>g.scope==='tutor.context.read'&&g.status==='ACTIVE')));const select=host.querySelector('[data-connection]');select.replaceChildren();for(const c of connections){const o=node('option',c.display_label||c.client_display_name||c.connection_id);o.value=c.connection_id||c.id;select.append(o);}if(!connections.length)status(errorMessage({code:'CONNECTION_REQUIRED'}));}catch(e){status(errorMessage(e));}showNotes();buttons();
  }
  async function capture(adapter=source,panel=host){
    // All mutable browser state is captured before crypto/network yields.
    const index=Number(panel.querySelector('[data-line]').value), snapshot=adapter.get();const row=snapshot.rows[index];
    if(!row)throw Error('UNSUPPORTED');const text=String(row.he_niqqud||row.he||row.he_plain||'');if(!text)throw Error('UNSUPPORTED');
    const media=window.LPTutorClient?.captionWindow(snapshot.mediaPassport,index);
    const preview=panel.querySelector('[data-preview]');if(preview.value!==text)throw Error('RT_STALE');const start=preview.selectionStart,end=preview.selectionEnd;
    const materialKey=snapshot.materialKey, revision=materialRevision(snapshot), fragment=String(row._v3_sentenceId??row.id??index),locale=adapter.locale;
    const [material,version,id]=await Promise.all([sha(materialKey),sha(revision),sha(fragment)]);
    return {material_id:'local:'+material,material_version:'revision:'+version,fragment_id:'row:'+id,line:index,text,selection:end>start?{start,end}:null,timecode:media?{start_ms:media.start_ms,end_ms:media.end_ms}:null,locale};
  }
  async function start(){
    if(busy||session||pendingStop)return;
    const operation={epoch:generation,adapter:source,panel:host,key:key||crypto.randomUUID()};
    key=operation.key;inflightStart=operation;busy=true;stopped=false;buttons();
    try{
      await identity();if(operation.epoch!==generation||stopped)return;
      const context=await capture(operation.adapter,operation.panel);if(operation.epoch!==generation||stopped)return;
      const s=await request('/sessions',{tab_id:tab,connection_id:operation.panel.querySelector('[data-connection]').value,request_key:operation.key,context});
      if(operation.epoch!==generation||stopped){await request('/stop-pending',{tab_id:tab,request_key:operation.key});return;}
      session=s;status(words.active+' '+new Date(s.expires_at).toLocaleTimeString(source.locale));timer=setTimeout(poll,250);
    }catch(e){if(operation.epoch===generation&&!stopped)status(errorMessage(e));}
    finally{if(inflightStart===operation)inflightStart=null;busy=false;buttons();}
  }
  async function share(){
    if(busy||!session)return;busy=true;generation++;buttons();const epoch=generation,current=session;
    try{
      const c=await capture();if(epoch!==generation||session!==current||stopped)return;
      const s=await request('/sessions/'+current.session_id+'/context',{tab_id:tab,state_version:current.state_version,context:c});
      if(epoch!==generation||stopped)return;session=s;host.querySelector('[data-results]').replaceChildren();status(words.active+' '+new Date(s.expires_at).toLocaleTimeString(source.locale));
    }catch(e){if(epoch===generation)handle(e);}
    finally{busy=false;buttons();if(session&&!stopped)timer=setTimeout(poll,250);}
  }
  async function stop(){
    stopped=true;generation++;clearTimeout(timer);
    const target=pendingStop||((session||inflightStart||key)?{session_id:session?.session_id,request_key:inflightStart?.key||key}:null);
    pendingStop=target;session=null;key=null;applied.clear();
    if(host)host.querySelector('[data-results]').replaceChildren();source?.highlight(-1);buttons();
    try{
      if(target){
        if(target.request_key)await request('/stop-pending',{tab_id:tab,request_key:target.request_key});
        else if(target.session_id)await request('/sessions/'+target.session_id+'/stop',{tab_id:tab});
        if(pendingStop===target)pendingStop=null;
      }
      status(words.idle);
    }catch(e){status(words.offline);}
    buttons();
  }
  function handle(e){if(/^RT_/.test(e.code||'')){session=null;clearTimeout(timer);host?.querySelector('[data-results]')?.replaceChildren();source?.highlight(-1);status(errorMessage(e));}else status(words.offline);buttons();}
  function render(s){
    const out=host.querySelector('[data-results]');out.replaceChildren();
    for(const p of s.proposals||[]){if(p.state==='DISMISSED')continue;const box=node('article');box.dir='auto';box.append(node('p',p.body));if(p.state==='ACCEPTED'&&p.kind!=='note'){out.append(box);continue;}
      for(const decision of (p.state==='ACCEPTED'?['ACCEPTED']:['ACCEPTED','DISMISSED'])){const b=node('button',decision==='DISMISSED'?words.dismiss:p.kind==='note'?words.save:words.apply);b.type='button';b.onclick=async()=>{b.disabled=true;try{
        const epoch=generation;await identity();if(epoch!==generation||!session||session.session_id!==s.session_id||session.state_version!==s.state_version)return;if('revision:'+await sha(materialRevision(source.get()))!==s.context.material_version){await stop();return;}if(epoch!==generation||!session)return;const response=await request('/sessions/'+s.session_id+'/decision',{tab_id:tab,state_version:s.state_version,proposal_id:p.proposal_id,decision});
        if(epoch!==generation||!session||session.session_id!==s.session_id||session.state_version!==s.state_version)return;
        if(decision==='ACCEPTED'&&!applied.has(p.proposal_id)){
          if(p.kind==='note'){const k='lp-read-together-notes:'+owner;const notes=JSON.parse(localStorage.getItem(k)||'{}');notes[p.proposal_id]={id:p.proposal_id,body:p.body,context:s.context};localStorage.setItem(k,JSON.stringify(notes));showNotes();status(words.saved);}
          else if(p.kind==='navigate')source.navigate(s.context.line);
          else if(p.kind==='highlight')source.highlight(s.context.line);
          else { /* Explanation already appears beside the material. */ }
          applied.add(p.proposal_id);
        }if(p.kind==='explanation'&&decision==='ACCEPTED'){box.querySelectorAll('button').forEach(e=>e.remove());}else box.remove();
      }catch(e){status(errorMessage(e));b.disabled=false;}};box.append(b);}out.append(box);
    }
  }
  async function poll(){clearTimeout(timer);if(!session||stopped||document.hidden)return;if(busy){timer=setTimeout(poll,250);return;}const epoch=generation,currentSession=session;try{await identity();if(epoch!==generation||!session||stopped)return;const s=await request('/sessions/'+currentSession.session_id+'?tab_id='+tab);if(epoch!==generation||stopped)return;session=s;
      const current=source.get();const row=current.rows[s.context.line];const text=String(row?.he_niqqud||row?.he||row?.he_plain||'');
      if(text!==s.context.text||'revision:'+await sha(materialRevision(current))!==s.context.material_version){await stop();return;}
      if(epoch!==generation||stopped||document.hidden)return;render(s);status(words.active+' '+new Date(s.expires_at).toLocaleTimeString(source.locale));
      const renewed=await request('/sessions/'+s.session_id+'/context',{tab_id:tab,state_version:s.state_version,context:s.context});if(epoch!==generation||stopped)return;session=renewed;}catch(e){if(epoch===generation)handle(e);}if(session&&!stopped)timer=setTimeout(poll,2500);buttons();}
  function mount(adapter){
    if(host){void stop();host.remove();}source=adapter;owner=null;connections=[];words=copies[source.locale]||copies.ru;generation++;
    host=node('section');host.id='readTogether';host.dir=source.locale==='he'?'rtl':'ltr';host.setAttribute('aria-label',words.title);
    host.innerHTML='<h3></h3><p data-consent></p><label data-con-label><select data-connection></select></label><button data-refresh type="button"></button><label data-line-label><select data-line></select></label><label data-preview-label><textarea data-preview dir="auto" readonly rows="3"></textarea></label><div class="rt-actions"><button data-start type="button"></button><button data-share type="button"></button><button data-stop type="button"></button></div><p role="status" aria-live="polite"></p><div data-results aria-live="polite"></div><details data-notes></details>';
    host.querySelector('h3').textContent=words.title;host.querySelector('[data-consent]').textContent=words.consent;
    for(const [attr,label] of [['start',words.start],['stop',words.stop],['share',words.share],['refresh',words.reload]])host.querySelector('[data-'+attr+']').textContent=label;
    host.querySelector('[data-con-label]').prepend(document.createTextNode(words.connection+' '));host.querySelector('[data-line-label]').prepend(document.createTextNode(words.line+' '));host.querySelector('[data-preview-label]').prepend(document.createTextNode(words.selection+' '));
    const rows=source.get().rows;const select=host.querySelector('[data-line]');rows.forEach((r,i)=>{const o=node('option',String(i+1)+' · '+String(r.he_niqqud||r.he||r.he_plain||'').slice(0,65));o.value=i;select.append(o);});
    const preview=()=>{const value=String(rows[Number(select.value)]?.he_niqqud||rows[Number(select.value)]?.he||rows[Number(select.value)]?.he_plain||'');const input=host.querySelector('[data-preview]');input.value=value;input.setSelectionRange(0,0);};select.onchange=preview;preview();
    host.querySelector('[data-start]').onclick=start;host.querySelector('[data-share]').onclick=share;host.querySelector('[data-stop]').onclick=stop;host.querySelector('[data-refresh]').onclick=refreshConnections;
    source.mount.parentElement.classList.add('rt-reader-container');source.mount.before(host);status(rows.length?words.idle:words.unsupported);buttons();
  }
  const stopDock=node('button',words.stop);stopDock.type='button';stopDock.className='rt-stop-dock';stopDock.hidden=true;stopDock.onclick=stop;document.body.append(stopDock);
  const style=node('style');style.textContent='#readTogether{padding:16px;border:1px solid #81978d;border-radius:12px;margin-block:12px;max-width:100%;overflow-wrap:anywhere;background:#f5f8f4;color:#193c31}#readTogether h3{margin:0}#readTogether button{width:auto!important;min-height:44px;padding:8px;font:inherit;margin:4px}#readTogether label{display:block;margin-block:8px}#readTogether select{max-width:100%;font:inherit}#readTogether [data-preview]{display:block;width:100%;font:inherit;white-space:pre-wrap;resize:vertical;border:1px solid #81978d;border-radius:8px;padding:10px;background:white;color:inherit}#readTogether article{border-block-start:1px solid #81978d}#readTogether :focus-visible{outline:3px solid #315db5;outline-offset:3px}.rt-stop-dock{position:fixed;inset-inline-end:16px;inset-block-end:16px;z-index:1000;width:auto!important;min-height:44px;border:1px solid #193c31;border-radius:12px;background:#234e40;color:white;font:inherit;padding:10px 16px;box-shadow:0 3px 12px #0003}.rt-stop-dock:focus-visible{outline:3px solid #315db5;outline-offset:3px}.rt-reader-container::after{content:"";display:block;clear:both}.rt-highlight{outline:3px solid #a8790e;outline-offset:-3px}@media(min-width:1100px){#readTogether{float:inline-end;width:320px;margin-inline-start:16px;margin-block-start:0}#readTogether+#roomReaderTable{width:calc(100% - 336px)}#roomReaderTable~*{clear:both}}';document.head.append(style);
  addEventListener('online',()=>{if(pendingStop)void stop();else if(session)void poll();});
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden&&session)void poll();});
  addEventListener('pagehide',()=>{if(session||inflightStart)void stop();});
  window.LPReadTogether={mount,stop,detach(){void stop();source?.mount.parentElement.classList.remove('rt-reader-container');host?.remove();host=null;source=null;}};
})();
