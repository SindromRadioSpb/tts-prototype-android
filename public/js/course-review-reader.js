(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const R=node?require('./course-review.js'):root.CourseReview;
  // Reviews deliberately do not call CourseEvidence.record or the lesson checker.
  function mount(container,opts){
    const doc=container.ownerDocument,plan=opts.plan;
    const now=()=>opts.now?opts.now():Date.now();
    const T=(key,fallback)=>opts.T?opts.T('course.review.'+key,fallback):fallback;
    const language=()=>opts.lang||doc.documentElement.lang||'ru';
    const text=x=>typeof x==='string'?x:(x?.[language()]||x?.ru||'');
    const authored=x=>({lang:x?.[language()]?language():'ru',dir:x?.[language()]&&language()==='he'?'rtl':'ltr'});
    let alive=true,generation=0,offs=[],view=null,notice='';
    const shown=new Set();
    const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
    function slot(parent,key,value){if(!Object.hasOwn(parent,key)||!object(parent[key]))Object.defineProperty(parent,key,{value,writable:true,enumerable:true,configurable:true});return parent[key];}
    function el(tag,attrs={},value){const n=doc.createElement(tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(value!=null)n.textContent=String(value);return n;}
    function listen(n,type,fn){const g=generation,handler=e=>{if(alive&&g===generation)fn(e);};n.addEventListener(type,handler);offs.push(()=>n.removeEventListener(type,handler));return n;}
    function button(label,attrs,fn){
      const n=el('button',{type:'button',...attrs},label);
      // A physical double click can hit the next task's freshly rendered button.
      listen(n,'keydown',e=>{if(e.repeat&&(e.key==='Enter'||e.key===' '))e.preventDefault();});
      return listen(n,'click',e=>{if(e.detail>1)return;fn(e);});
    }
    function reset(){generation++;for(const off of offs.splice(0))off();container.replaceChildren();}
    function focusAfterAction(preferred){
      const target=container.querySelector(preferred)||container.querySelector('[data-review-finish], [data-review-keys], [data-review-start]');
      if(!target)return;if(!['BUTTON','TEXTAREA','INPUT','SELECT'].includes(target.tagName))target.setAttribute('tabindex','-1');target.focus?.();
    }
    const get=()=>opts.getProgress();
    function reader(){const p=get();if(!p.reader||typeof p.reader!=='object'||Array.isArray(p.reader))p.reader={};if(!p.reader.review||typeof p.reader.review!=='object'||Array.isArray(p.reader.review))p.reader.review={};return p.reader.review;}
    function drafts(runId){return slot(slot(reader(),'drafts',{}),runId,{});}
    function change(fn){
      try{if(opts.transact(fn)===false)throw Error('SAVE_FAILED');notice='';return true;}
      catch(error){notice=error?.message==='ACTIVITY_BREAK_REQUIRED'
        ?T('breakRequired','Сначала сделайте паузу после урока и займитесь другим делом, затем отметьте это перед R00.')
        :T('saveFailed','Изменение не сохранено. Повторите действие; ответы и ключи не будут показаны до сохранения.');return false;}
    }
    function saveDraft(){if(opts.persist()===false){notice=T('draftFailed','Черновик не сохранён на устройстве. Не закрывайте страницу.');const n=container.querySelector('[data-review-notice]');if(n){n.textContent=notice;n.hidden=false;}}}
    function date(at){if(at===null||at===undefined)return T('noDate','Дата ещё не определена');return new Date(at).toLocaleString(language(),{dateStyle:'medium',timeStyle:'short'});}
    function message(){const n=el('p',{'data-review-notice':'',role:'alert'},notice);n.hidden=!notice;container.append(n);}
    function statusName(status){return ({blocked:T('blocked','Пока недоступно'),upcoming:T('upcoming','Запланировано'),due:T('due','Пора пройти'),overdue:T('overdue','Срок прошёл'),in_progress:T('inProgress','Не закончено'),completed:T('completed','Завершено')})[status];}
    function schedule(){
      if(!alive)return;view=null;shown.clear();reset();opts.onState?.(null);
      container.append(el('h3',{},T('schedule','Повторы и отсроченные проверки')));
      container.append(el('p',{},T('fixedDates','Даты отсчитываются от первой сохранённой попытки B001. Пропуск не сдвигает следующие даты.')));
      container.append(el('p',{},T('deviceTime','1 день = 24 часа. Сроки и интервалы рассчитаны по часам устройства, без серверной проверки времени.')));
      const summary=R.summary(get(),plan,now());
      if(summary.anchor.status==='missing')container.append(el('p',{},T('missingAnchor','Сначала выполните задание B001. Затем здесь появятся даты.')));
      else if(summary.conflict&&summary.anchor.reason!=='anchor_choices'){
        container.append(el('p',{'data-review-integrity-error':'',role:'alert'},T('integrityConflict','В сохранённой истории найдены противоречивые записи. Повторы приостановлены; исходные данные сохранены. Выбором даты этот конфликт не исправить.')));
      }else if(summary.conflict){
        container.append(el('p',{role:'alert'},T('anchorConflict','Устройства сохранили разные начала. Выберите настоящую первую попытку; даты не будут изменены молча.')));
        const ids=[...new Set(summary.anchor.candidates.map(c=>c.id))];
        for(const candidate of summary.anchor.candidates){
          const row=el('p');row.append(button(date(candidate.anchorAt)+' · '+candidate.attemptId,{'data-review-anchor':candidate.id},()=>{
            if(change(p=>R.append(p,plan,'resolve_anchor',{candidateIds:ids,anchorId:candidate.id,supersedes:(p.reviewEvents||[]).filter(e=>e.planId===plan.id&&e.planVersion===plan.version&&e.type==='resolve_anchor').map(e=>e.id)},now())))schedule();else render();
          }));container.append(row);
        }
      }else container.append(el('p',{'data-review-anchor-date':''},T('anchor','Первая попытка: {date}').replace('{date}',date(summary.anchor.at))));
      message();
      const list=el('div',{class:'course-lessons','data-review-schedule':''});
      for(const session of plan.sessions){
        const state=summary.sessions.find(s=>s.id===session.id),row=el('section',{'data-review-session':session.id});
        row.append(el('h4',authored(session.title),session.id+' · '+text(session.title)));
        row.append(el('p',{'data-review-due':session.id},T('day','День {day}').replace('{day}',session.day)+' · '+date(state.dueAt)+' · '+statusName(state.status)));
        if(state.dueAt!==null&&now()>state.dueAt&&!state.runs.some(r=>r.completed))row.append(el('p',{'data-review-overdue':''},T('late','Просрочено на {days} дн.').replace('{days}',((now()-state.dueAt)/R.DAY).toFixed(1))));
        if(state.status==='blocked'&&session.after)row.append(el('p',{},T('after','Сначала завершите {id}; ответы этого повтора раньше не показываются.').replace('{id}',session.after)));
        for(const run of state.runs)row.append(el('p',{'data-review-delay':run.runId},T('delay','Фактический интервал: {days} дн.').replace('{days}',run.actualDelayDays===null?'?':run.actualDelayDays.toFixed(2))+' · '+classification(run)));
        const open=button(state.status==='in_progress'?T('resume','Продолжить'):state.status==='completed'?T('results','Ответы и результаты'):T('open','Открыть'),{'data-review-open':session.id},()=>{openSession(session.id);focusAfterAction('[data-review-input], [data-review-disclosure], [data-review-keys]');});
        open.disabled=['blocked','upcoming'].includes(state.status);row.append(open);list.append(row);
      }
      container.append(list);
    }
    function classification(run){return run.independentEligible?T('independent','Самостоятельная отсроченная проверка, письменный канал'):run.practice?T('practice','Практика, не независимая проверка'):T('review','Повторение, письменный канал');}
    function openSession(sessionId,runId){
      const s=R.sessionState(get(),plan,sessionId,now());if(!s){schedule();return;}
      const run=(runId&&s.runs.find(r=>r.runId===runId))||s.runs.find(r=>!r.completed)||s.runs.at(-1);
      view={sessionId,runId:run?.runId||null};shown.clear();render();
    }
    function select(label,key,value,onChange){
      const wrapper=el('label',{class:'course-niqqud-control'},label),s=el('select',{'data-review-disclosure':key,'aria-label':label});
      for(const [v,title]of [['unknown',T('unknown','Не знаю / не отмечено')],['no',T('no','Нет')],['yes',T('yes','Да')]]){const o=el('option',{value:v},title);o.selected=value===v;s.append(o);}
      listen(s,'change',()=>onChange(s.value));wrapper.append(s);return wrapper;
    }
    function render(){
      if(!alive)return;if(!view){schedule();return;}
      const session=plan.sessions.find(s=>s.id===view.sessionId);if(!session){schedule();return;}
      const state=R.sessionState(get(),plan,session.id,now());
      const run=view.runId?state.runs.find(r=>r.runId===view.runId):null;
      opts.onState?.({reviewSessionId:session.id,...(run?{reviewRunId:run.runId}:{})});
      reset();container.append(button(T('home','К расписанию'),{'data-review-home':''},()=>opts.onHome?opts.onHome():schedule()));
      container.append(el('h3',authored(session.title),session.id+' · '+text(session.title)));
      container.append(el('p',{},T('textOnly','Только письменные ответы. Это не проверка аудирования или устной речи.')));
      container.append(el('p',{'data-review-current-due':''},date(state.dueAt)));
      message();
      if(state.status==='blocked'||!run&&state.status==='upcoming'){container.append(el('p',{role:'status'},statusName(state.status)));return;}
      if(!run){renderStart(session,state);return;}
      container.append(el('p',{'data-review-classification':''},classification(run)));
      container.append(el('p',{'data-review-actual-delay':''},T('delay','Фактический интервал: {days} дн.').replace('{days}',run.actualDelayDays===null?'?':run.actualDelayDays.toFixed(2))));
      reader().sessionId=session.id;reader().runId=run.runId;
      if(run.completed)renderResults(session,run);else renderTask(session,run);
    }
    function renderStart(session,state){
      container.append(el('p',authored(session.instructions),text(session.instructions)));
      const stateReader=reader();if(!stateReader.preflight||stateReader.preflight.sessionId!==session.id)stateReader.preflight={sessionId:session.id,externalExposure:'unknown',priorStimuli:'unknown',priorKey:'unknown',aided:'unknown',activityBreak:false};
      const form=stateReader.preflight;
      for(const key of ['externalExposure','priorStimuli','priorKey','aided'])if(!['yes','no','unknown'].includes(form[key]))form[key]='unknown';
      form.activityBreak=form.activityBreak===true;
      for(const [key,label]of [['externalExposure',T('external','Занимались ивритом вне этого курса после первой попытки?')],['priorStimuli',T('seenStimuli','Уже видели именно задания этой серии?')],['priorKey',T('seenKey','Уже видели ключи или ответы этой серии?')],['aided',T('assistance','Будете использовать подсказки, переводчик или чужую помощь?')]])container.append(select(label,key,form[key],value=>{form[key]=value;saveDraft();}));
      if(session.requiresActivityBreak){const label=el('label',{class:'course-niqqud-control'}),check=el('input',{type:'checkbox','data-review-break':''});check.checked=form.activityBreak===true;listen(check,'change',()=>{form.activityBreak=check.checked;saveDraft();});label.append(check,doc.createTextNode(T('break','После урока я сделал(а) паузу и занялся(-ась) другим делом.')));container.append(label);}
      container.append(el('p',{},T('disclosureNote','Занятия вне курса сохраняются как контекст. Повтор этой серии, просмотр её заданий/ключей и помощь не считаются независимой проверкой. Неизвестные условия тоже не дают такого статуса.')));
      const start=button(state.runs.length?T('retryPractice','Повторить как практику'):T('start','Начать серию'),{'data-review-start':''},()=>{
        let runId;const saved=change(p=>{const result=R.start(p,plan,session.id,{...form,aided:form.aided==='unknown'?'unknown':form.aided==='yes'},now());runId=result.runId;return result.progress;});if(saved){view.runId=runId;reader().runId=runId;reader().sessionId=session.id;saveDraft();}render();focusAfterAction(saved?'[data-review-task] h4':'[data-review-break]');
      });container.append(start);
    }
    function renderTask(session,run){
      const task=session.tasks.find(t=>!run.responses.some(r=>r.taskId===t.id));
      if(!task){container.append(el('p',{},T('allSaved','Все ответы сохранены. Завершите серию, чтобы открыть ключи и оценку.')));container.append(button(T('finish','Завершить серию'),{'data-review-finish':''},()=>{const saved=change(p=>R.complete(p,plan,run.runId,now()));render();focusAfterAction(saved?'[data-review-keys]':'[data-review-finish]');}));return;}
      // Persist the exposure before placing even the task prompt in the DOM.
      if(!(get().reviewEvents||[]).some(e=>e.planId===plan.id&&e.planVersion===plan.version&&e.type==='stimulus'&&e.runId===run.runId&&e.taskId===task.id)){
        if(!change(p=>R.append(p,plan,'stimulus',{runId:run.runId,taskId:task.id},now()))){
          const n=container.querySelector('[data-review-notice]');if(n){n.textContent=notice;n.hidden=false;}
          container.append(button(T('retryDisplay','Повторить показ задания'),{'data-review-retry-display':''},()=>render()));return;
        }
      }
      const index=session.tasks.indexOf(task),box=el('section',{class:'course-step','data-review-task':task.id});
      box.append(el('p',{},T('task','Задание {n} из {total}').replace('{n}',index+1).replace('{total}',session.tasks.length)),el('h4',authored(task.prompt),text(task.prompt)));
      if(task.stimulus){
        const key=run.runId+'/'+task.id,visible=shown.has(key);
        box.append(button(visible?T('hideStimulus','Скрыть материал'):T('showStimulus','Показать материал'),{'data-review-stimulus-toggle':'','aria-expanded':String(visible)},()=>{
          if(visible){shown.delete(key);render();focusAfterAction('[data-review-stimulus-toggle]');return;}
          if(change(p=>R.append(p,plan,'stimulus',{runId:run.runId,taskId:task.id},now())))shown.add(key);render();focusAfterAction('[data-review-stimulus-toggle]');
        }));
        // Do not put unrevealed or future stimuli in the DOM, even in hidden nodes.
        if(visible)box.append(el('p',{'data-review-stimulus':'',...authored(task.stimulus)},text(task.stimulus)));
      }
      const ui=slot(drafts(run.runId),task.id,{input:'',aided:false});
      const label=el('label',{},T('response','Ваш ответ'));
      const field=el('textarea',{'data-review-input':'',rows:'4',dir:'auto',maxlength:'8000','aria-label':T('response','Ваш ответ')});field.value=typeof ui.input==='string'?ui.input:'';
      listen(field,'input',()=>{ui.input=field.value;saveDraft();});label.append(field);box.append(label);
      const aid=el('label',{class:'course-niqqud-control'}),check=el('input',{type:'checkbox','data-review-response-aided':''});check.checked=ui.aided===true;
      listen(check,'change',()=>{ui.aided=check.checked;saveDraft();});aid.append(check,doc.createTextNode(T('usedAssistance','При этом ответе использовал(а) помощь.')));box.append(aid);
      box.append(el('p',{'data-review-neutral':'',role:'status'},T('neutral','Ответ сохраняется без проверки правильности. Ключи появятся только после всей серии. Пустой ответ тоже можно сохранить.')));
      box.append(button(T('submit','Сохранить ответ и дальше'),{'data-review-submit':''},()=>{
        const saved=change(p=>R.respond(p,plan,run.runId,task.id,field.value,{aided:check.checked},now()));if(saved)shown.clear();render();focusAfterAction(saved?'[data-review-task] h4':'[data-review-input]');
      }));container.append(box);
    }
    function renderResults(session,run){
      container.append(el('p',{},T('finished','Серия закончена. Исходные ответы сохранены; повтор не заменяет первую попытку.')));
      const allKeysExposed=(get().reviewEvents||[]).some(e=>e.planId===plan.id&&e.planVersion===plan.version&&e.type==='key'&&e.runId===run.runId&&e.taskId===undefined);
      if(!allKeysExposed){container.append(button(T('showKeys','Открыть ключи и оценку'),{'data-review-keys':''},()=>{const saved=change(p=>R.append(p,plan,'key',{runId:run.runId},now()));render();focusAfterAction(saved?'[data-review-result] h4':'[data-review-keys]');}));}
      else{
        for(const task of session.tasks){
          const row=el('section',{'data-review-result':task.id}),responses=run.responses.filter(r=>r.taskId===task.id);
          row.append(el('h4',authored(task.prompt),text(task.prompt)));
          for(const answer of responses)row.append(el('p',{'data-review-saved-response':'',dir:'auto'},answer.input||T('empty','Без ответа')));
          row.append(el('p',{'data-review-key':'',...authored(task.key)},text(task.key)));
          if(task.accepts&&run.ambiguousFirstTaskIds?.includes(task.id)){
            row.append(el('p',{'data-review-ambiguous':''},T('ambiguousFirst','Первые ответы записаны в один момент и различаются. Их порядок неизвестен; автоматический балл не назначен.')));
          }else if(task.accepts){
            const matched=task.accepts.some(a=>a.normalize('NFC').trim()===String(responses[0]?.input||'').normalize('NFC').trim());
            row.append(el('p',{'data-review-exact':''},T('exact','Точное совпадение с допустимой формой (не оценка всей реплики): ')+(matched?T('yes','Да'):T('no','Нет'))));
            if(!run.scores.some(s=>s.taskId===task.id&&s.source==='auto_exact'))row.append(button(T('saveExact','Сохранить точное совпадение'),{'data-review-auto-score':task.id},()=>{change(p=>{
              let next=p;for(const rubric of task.rubric)next=R.append(next,plan,'score',{runId:run.runId,taskId:task.id,rubricId:rubric.id,value:matched?rubric.max:0,source:'auto_exact'},now());return next;
            });render();focusAfterAction('[data-review-result="'+task.id+'"] h4');}));
          }
          for(const rubric of task.rubric){
            const score=run.scores.findLast(s=>s.taskId===task.id&&s.rubricId===rubric.id),part=el('div');
            part.append(el('p',authored(rubric.label),text(rubric.label)+' · '+(score?(score.source==='self'?T('self','Самооценка'):T('auto','Точное совпадение'))+': '+score.value+'/'+rubric.max:T('unassessed','Не оценено'))));
            if(!task.accepts){
              const label=el('label',{class:'course-niqqud-control'},T('self','Самооценка')),select=el('select',{'data-review-rubric':rubric.id,'aria-label':text(rubric.label)});
              const empty=el('option',{value:''},T('unassessed','Не оценено'));select.append(empty);
              for(let value=0;value<=rubric.max;value++){const option=el('option',{value},String(value));option.selected=score?.source==='self'&&score.value===value;select.append(option);}label.append(select);part.append(label);
              part.append(button(T('saveSelf','Сохранить самооценку'),{'data-review-self-score':task.id+'/'+rubric.id},()=>{if(select.value==='')return;change(p=>R.append(p,plan,'score',{runId:run.runId,taskId:task.id,rubricId:rubric.id,value:Number(select.value),source:'self'},now()));render();focusAfterAction('[data-review-self-score="'+task.id+'/'+rubric.id+'"]');}));
            }row.append(part);
          }
          if(task.repair)renderRepair(row,task,run);
          container.append(row);
        }
      }
      container.append(el('p',{},T('noTotal','Критерии показаны отдельно. Общий процент владения языком из них не вычисляется.')));
      container.append(button(T('retryPractice','Повторить как практику'),{'data-review-retry':''},()=>{view.runId=null;reader().preflight=null;render();focusAfterAction('[data-review-disclosure]');}));
    }

    function renderRepair(row,task,run){
      const box=el('section',{'data-review-repair':task.id});
      box.append(el('h5',{},T('repair','Дополнительная практика после сверки')),
        el('p',authored(task.repair.prompt),text(task.repair.prompt)));
      const saved=run.responses.filter(r=>r.taskId===task.id&&r.phase==='repair');
      for(const answer of saved)box.append(el('p',{'data-review-repair-answer':'',dir:'auto'},answer.input||T('empty','Без ответа')));
      // Repair keys are also deferred until a practice answer is saved.
      if(saved.length)box.append(el('p',{'data-review-repair-key':'',...authored(task.repair.key)},text(task.repair.key)));
      else{
        const draft=drafts(run.runId),key=task.id+'@repair';
        const ui=slot(draft,key,{input:''});
        const label=el('label',{},T('response','Ваш ответ')),
          field=el('textarea',{'data-review-repair-input':task.id,rows:'4',dir:'auto',maxlength:'8000','aria-label':T('response','Ваш ответ')});
        field.value=typeof ui.input==='string'?ui.input:'';listen(field,'input',()=>{ui.input=field.value;saveDraft();});label.append(field);box.append(label);
        box.append(button(T('saveRepair','Сохранить практику и открыть сверку'),{'data-review-repair-submit':task.id},()=>{
          const saved=change(p=>R.respond(p,plan,run.runId,task.id,field.value,{phase:'repair',aided:true},now()));render();focusAfterAction(saved?'[data-review-repair="'+task.id+'"] [data-review-repair-key]':'[data-review-repair-input="'+task.id+'"]');
        }));
      }
      row.append(box);
    }
    function destroy(){alive=false;reset();}
    if(opts.sessionId)openSession(opts.sessionId,opts.runId);else schedule();
    return {openSession,refresh:render,destroy};
  }
  const api={mount};root.CourseReviewReader=api;if(node)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
