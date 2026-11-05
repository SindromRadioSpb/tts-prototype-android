(function(root){
  'use strict';
  const node=typeof module!=='undefined'&&module.exports;
  const E=node?require('./course-evidence.js'):root.CourseEvidence;
  const C=node?require('./course-checker.js'):root.CourseChecker;
  const S=node?require('./course-store.js'):root.CourseStore;
  const F=node?require('./course-format.js'):root.CourseFormat;
  const H=node?require('./course-hebrew.js'):root.CourseHebrew;
  const K=node?require('./course-keyboard.js'):null;
  const A=node?require('./course-audio.js'):null;
  const TK=node?require('./course-tasks.js'):root.CourseTasks;
  const SC=node?require('./course-scene.js'):root.CourseScene;
  const MD=node?require('./course-media.js'):root.CourseMedia;
  const own=(o,k)=>Object.hasOwn(o,k);
  const idOk=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s);
  function factory(doc){
    function el(tag,attrs={},text){
      const n=doc.createElement(tag);
      for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));
      if(text!=null)n.textContent=String(text);
      return n;
    }
    function mount(container,opts={}){
      const T=(k,fb)=>opts.T?opts.T('course.'+k,fb):fb, now=()=>opts.now?opts.now():Date.now();
      const courseId=opts.courseId||'ulpan', store=opts.store||S.memoryStore(), fetcher=opts.fetch||root.fetch.bind(root);
      const loaded=store.load(courseId);
      let progress=loaded.progress,alive=true,epoch=0,controller=null,bundle=null,bundlePromise=null,current=null,step=0,wordHandle=null,keyboardHandle=null,listeners=[],saveError=false,returnChoice=null;
      let audioHost=null, audioRate=1, syncStatus=opts.sync?.status||'local_only';
      const overrideKey='course.'+courseId+'.niqqudOverride';
      let preferenceStorage,niqqudOverride='lesson';
      try{preferenceStorage=opts.storage||root.localStorage;const saved=preferenceStorage?.getItem(overrideKey);if(['lesson','always','never'].includes(saved))niqqudOverride=saved;}catch(_){}
      const revealed=new Set(),tapReveals=new WeakMap();
      const translit=root.TranslitDisplay?.createDisplay(root.LocalTranslit?.transliterateWithProfile);
      const base=(opts.base||'/data/course').replace(/\/$/,'')+'/'+encodeURIComponent(courseId)+'/';
      container.classList.add('course-reader');
      function readerState(){
        if(!progress.reader||typeof progress.reader!=='object'||Array.isArray(progress.reader))progress.reader={};
        return progress.reader;
      }
      function uiFor(task){
        const key=taskKey(task);
        const state=readerState();
        if(!state.tasks||typeof state.tasks!=='object'||Array.isArray(state.tasks))state.tasks={};
        if(!own(state.tasks,key)||!state.tasks[key]||typeof state.tasks[key]!=='object')Object.defineProperty(state.tasks,key,{
          value:{
            input:'',model:false,baseFp:E.fingerprint(current.id,task)
          },writable:true,enumerable:true,configurable:true
        });
        return state.tasks[key];
      }
      function taskKey(task){return current.id+'/'+task.id+(returnChoice?.taskId===task.id&&returnChoice.variantId?'@'+returnChoice.variantId:'');}
      function persist(){
        // Another open tab may have committed evidence since this reader loaded.
        // Reconcile before every write, including drafts, so neither tab erases attempts.
        const localReader=progress.reader;
        const stored=store.load(courseId).progress;
        const incoming=current?E.migrate(stored,current).progress:stored;
        if(current)for(const [key,draft]of Object.entries(incoming.reader?.tasks||{})){
          if(!key.startsWith(current.id+'/'))continue;
          const task=current.tasks.find(t=>key===current.id+'/'+t.id);
          if(!task||draft?.baseFp!==E.fingerprint(current.id,task))delete incoming.aids[key];
        }
        progress=E.mergeProgress(progress,incoming);
        if(localReader)progress.reader=localReader;
        const r=store.save(progress);
        saveError=!r.ok;
        const n=container.querySelector('[data-course-save-error]');
        if(n)n.hidden=!saveError;
        return r.ok;
      }
      function on(n,type,fn,capture=false){
        n.addEventListener(type,fn,capture);
        listeners.push(()=>n.removeEventListener(type,fn,capture));
        return n;
      }
      function button(text,attr,fn){
        return on(el('button',{
          type:'button',...attr
        },text),'click',fn);
      }
      function clear(){
        audioHost?.stop();
        keyboardHandle?.detach();
        keyboardHandle=null;
        for(const off of listeners.splice(0))off();
        if(wordHandle){
          try{
            wordHandle.detach?.();
          }
          catch(_){}
          wordHandle=null;
        }
        container.replaceChildren();
      }
      function shell(title,attrs={}){
        clear();
        container.append(el('h2',attrs,title));
        container.append(el('p',{'data-course-sync-status':'',role:'status'},T('sync.'+syncStatus, syncText(syncStatus))));
        const error=el('p',{
          'data-course-save-error':'',role:'alert'
        },T('saveError','Не удалось сохранить прогресс на этом устройстве.'));
        error.hidden=!saveError;
        container.append(error);
        if(loaded.notice)container.append(el('p',{
          role:'status'
        },T('resetNotice','Сохранённые данные не удалось прочитать. Начат новый прогресс.')));
      }
      function syncText(status){return ({synced:'Сохранено в облаке',local_only:'Данные на этом устройстве',pending:'Ждёт синхронизации',error:'Не удалось синхронизировать — повторим позже'})[status]||'';}
      function setSyncStatus(status){
        syncStatus=status;
        const n=container.querySelector('[data-course-sync-status]');
        if(n)n.textContent=T('sync.'+status,syncText(status));
      }
      function applyProgress(incoming){
        const reader=progress.reader;
        progress=E.mergeProgress(progress,incoming);
        if(reader)progress.reader=reader;
        if(!current)void home();
      }
      const text=x=>typeof x==='string'?x:(x?.[opts.lang||doc.documentElement.lang]||x?.ru||'');
      const authoredAttrs=x=>{const requested=opts.lang||doc.documentElement.lang;const lang=x&&typeof x==='object'&&x[requested]?requested:'ru';return {lang,dir:lang==='he'?'rtl':'ltr'};};
      const mode=()=>niqqudOverride==='always'?'full':niqqudOverride==='never'?'plain':current?.niqqud||'full';
      const parts=value=>[...String(value||'').matchAll(/[\u05D0-\u05EA][\u0591-\u05BD\u05BF-\u05C2\u05C4-\u05C5\u05C7\u05D0-\u05EA]*/g)];
      function hebrew(pair){
        if(!pair)return '';
        if(mode()==='full')return pair.niqqud;
        if(mode()!=='new')return pair.plain;
        const plain=parts(pair.plain),vocal=parts(pair.niqqud);
        // Only aligned authored tokens may replace plain tokens; never synthesize plain spelling.
        if(plain.length!==vocal.length)return pair.plain;
        const fresh=new Set([...(current.introduces?.active||[]),...(current.introduces?.receptive||[])]),keys=[];
        for(const entry of bundle.lexicon.entries)for(const form of [entry,...(entry.forms||[])]){
          if(fresh.has(entry.id)||fresh.has(form.id))keys.push(...H.formKeys(form.he).map(k=>k.split(' ')));
        }
        const selected=new Set(),forms=[plain.map(p=>H.stripMarks(p[0])),vocal.map(p=>H.stripMarks(p[0]))];
        for(const words of forms)for(let start=0;start<words.length;start++)for(const key of keys){
          if(key.every((word,i)=>words[start+i]===word))for(let i=0;i<key.length;i++)selected.add(start+i);
        }
        let out='',end=0;
        plain.forEach((p,i)=>{out+=pair.plain.slice(end,p.index)+(selected.has(i)?vocal[i][0]:p[0]);end=p.index+p[0].length;});
        return out+pair.plain.slice(end);
      }
      function paintHebrew(node,pair){
        if(!pair)return node;
        const key=current.id+'/'+JSON.stringify(pair),tap=mode()==='tap';
        node.textContent=tap&&revealed.has(key)?pair.niqqud:hebrew(pair);
        node.setAttribute('lang','he');node.setAttribute('dir','rtl');
        if(tap){
          node.setAttribute('data-course-niqqud-tap','');
          node.setAttribute('aria-label',T('niqqudTap','Показать огласовки')+': '+node.textContent);
          if(node.tagName!=='BUTTON'){node.setAttribute('tabindex','0');node.setAttribute('role','button');}
          const reveal=e=>{
            if(revealed.has(key))return;
            e.preventDefault();e.stopImmediatePropagation();revealed.add(key);node.textContent=pair.niqqud;
            node.removeAttribute('data-rm-wrapped');
            node.setAttribute('aria-label',pair.niqqud);
            // A previous morphology wrapper refers to old text; rebuild the current surface.
            const body=container.querySelector('.course-step');
            if(opts.onWords&&body){wordHandle?.detach?.();wordHandle=opts.onWords(body,current)||null;}
          };
          tapReveals.set(node,reveal);
          on(node,'click',reveal);
          if(node.tagName!=='BUTTON')on(node,'keydown',e=>{if(e.key==='Enter'||e.key===' '){reveal(e);}});
        }
        return node;
      }
      function hebrewElement(tag,attrs,pair){return paintHebrew(el(tag,attrs),pair);}
      function hebrewButton(pair,attrs,action){
        const node=paintHebrew(el('button',{type:'button',...attrs}),pair);
        on(node,'click',action);return node;
      }
      function niqqudControl(){
        const label=el('label',{class:'course-niqqud-control'},T('niqqudLabel','Огласовки'));
        const select=el('select',{'data-course-niqqud-override':'','aria-label':T('niqqudLabel','Огласовки')});
        for(const [value,title] of [['lesson',T('niqqudLesson','Как в уроке')],['always',T('niqqudAlways','Всегда')],['never',T('niqqudNever','Никогда')]]){
          const option=el('option',{value},title);option.selected=value===niqqudOverride;select.append(option);
        }
        on(select,'change',()=>{niqqudOverride=select.value;try{preferenceStorage?.setItem(overrideKey,niqqudOverride);}catch(_){}renderLesson();});
        label.append(select);container.append(label);
      }
      async function data(){
        if(bundle)return bundle;
        if(bundlePromise)return bundlePromise;
        controller=new AbortController();
        const signal=controller.signal;
        const json=async path=>{
          const r=await fetcher(base+path,{
            signal,cache:'no-cache'
          });
          if(!alive||signal.aborted)throw Error('aborted');
          if(!r.ok)throw Error('course data unavailable');
          return r.json();
        };
        bundlePromise=(async()=>{
          const course=await json('course.json');
          if(!course||course.format!=='course-v1'||course.id!==courseId||!Array.isArray(course.lessons)||!course.lessons.every(idOk)||!idOk(course.lexicon)||!course.lexicon.endsWith('.json'))throw Error('invalid course');
          const lexicon=await json(encodeURIComponent(course.lexicon));
          if(F.validateLexicon(lexicon).some(i=>i.level==='error'))throw Error('invalid lexicon');
          const lexIndex=new Map(lexicon.entries.flatMap(e=>[[e.id,e],...(e.forms||[]).map(f=>[f.id,f])]));
          const lessons=await Promise.all(course.lessons.map(async id=>{
            const l=await json('lessons/'+encodeURIComponent(id)+'.json');
            if(l?.id!==id||F.validateLesson(l,lexIndex).some(i=>i.level==='error'))throw Error('invalid lesson');
            return l;
          }));
          const index=C.buildIndex(lexicon.entries);
          index.preknown=course.preknown||[];
          if(alive)bundle={
            course,lexicon,lessons,index
          };
          return {
            course,lexicon,lessons,index
          };
        })();
        try{
          return await bundlePromise;
        }
        catch(e){
          bundlePromise=null;
          throw e;
        }
      }
      async function run(fn){
        const ticket=++epoch;
        try{
          const b=await data();
          if(alive&&ticket===epoch)await fn(b,ticket);
        }
        catch(_){
          if(alive&&ticket===epoch){
            shell(T('error','Урок не удалось загрузить. Попробуйте ещё раз.'));
            container.append(button(T('retry','Повторить'),{},()=>home()));
          }
        }
      }
      function notify(){
        if(opts.onState)opts.onState(current?{
          lessonId:current.id,step
        }
        :{
          lessonId:'',step:0
        });
      }
      function home(){
        audioHost?.stop(); audioHost=null;
        return run(b=>{
          current=null;
          shell(text(b.course.title),authoredAttrs(b.course.title));
          const counts=E.courseCounts(progress,b.lexicon,b.lessons);
          container.append(el('p',{
            'data-course-counts':''
          },T('counts','Введено {introduced} · Узнаёте {recognized} · Отвечаете сами {produced} · Применили после перерыва {appliedAfterBreak}').replace(/\{(\w+)\}/g,(_,k)=>counts[k]??'')));
          const list=el('div',{
            class:'course-lessons'
          });
          const names={
            not_started:T('status.not_started','Не начат'),in_progress:T('status.in_progress','В процессе'),supported:T('status.supported','Пройден с опорой'),independent:T('status.independent','Пройден самостоятельно'),needs_review:T('status.needs_review','Нужен повтор')
          };
          for(const l of b.lessons){
            const btn=button('',{
              'data-course-lesson':l.id
            },()=>openLesson(l.id));
            btn.append(el('strong',authoredAttrs(l.title),text(l.title)),el('span',{},names[E.lessonSkill(progress,l)]));
            list.append(btn);
          }
          container.append(list);
          const due=E.dueReturns(progress,b.lessons,now());
          if(due.length){
            const returns=el('section',{'data-course-returns':''});
            returns.append(el('h3',{},T('return.title','Вернуться')));
            for(const item of due){
              const lesson=b.lessons.find(l=>l.id===item.lessonId);
              const task=lesson.tasks.find(t=>t.transfer===true);
              const index=lesson.tasks.indexOf(task),variants=task?.variants||[];
              const done=progress.attempts.filter(a=>a.lessonId===lesson.id&&a.taskId===task.id&&a.fp!==a.baseFp&&a.kind==='accepted').length;
              const variant=variants.length?variants[done%variants.length]:null;
              const label=variant?T('return.newVariant','Новый вариант ситуации'):T('return.repeat','Повторить урок');
              const row=el('div');row.append(el('span',authoredAttrs(lesson.title),text(lesson.title)));
              row.append(button(label,{'data-course-return':lesson.id},()=>openLesson(lesson.id,stepOfTask(lesson,task.id),
                variant?{taskId:task.id,variantId:variant.id}:null)));
              returns.append(row);
            }
            container.append(returns);
          }
          notify();
        });
      }
      function openLesson(id,wantedStep,returnVariant=null){
        audioHost?.stop(); audioHost=null;
        return run(async (b,ticket)=>{
          const l=b.lessons.find(l=>l.id===id);
          if(!l){
            shell(T('error','Урок не удалось загрузить. Попробуйте ещё раз.'));
            return;
          }
          const audioApi=A||root.CourseAudio;
          const host=audioApi.create({base:opts.base||'/data/course',courseId,lessonId:id,fetch:fetcher,AudioCtor:opts.AudioCtor,
            onEnded:turnId=>{
              const task=current?.id===id&&activeTask();
              if(alive&&audioHost===host&&task?.channel?.includes('listen')&&task.audioTurnId===turnId){
                uiFor(task).heard=true; persist();
              }
            }});
          audioHost=host;host.setRate(audioRate);
          await host.load();
          if(!alive||ticket!==epoch||audioHost!==host){host.stop();return;}
          current=l;
          returnChoice=returnVariant;
          const migration=E.migrate(progress,l);
          progress=migration.progress;
          // Drafts exist before any attempt, so evidence migration alone cannot invalidate them.
          const drafts=progress.reader?.tasks;
          if(drafts&&typeof drafts==='object')for(const [key,draft] of Object.entries(drafts)){
            if(!key.startsWith(l.id+'/'))continue;
            const task=l.tasks.find(t=>key===l.id+'/'+t.id);
            if(!task||draft?.baseFp!==E.fingerprint(l.id,task)){
              delete drafts[key];delete progress.aids[key];
            }
          }
          for(const change of migration.changes)if(change.change!=='unchanged'&&progress.reader?.tasks)delete progress.reader.tasks[l.id+'/'+change.taskId];
          progress=E.markMet(progress,[...l.introduces.active,...l.introduces.receptive],now());
          const state=readerState();
          const saved=state.position;
          step=Number.isInteger(wantedStep)?wantedStep:(saved?.lessonId===id?Number(saved.step)||0:0);
          step=Math.max(0,Math.min(totalSteps()-1,step));
          renderLesson();
        });
      }
      // Flow lessons walk authored parts; legacy lessons keep scene → text → tasks.
      function flatSteps(lesson=current){
        if(!Array.isArray(lesson.flow))return null;
        const out=[];
        lesson.flow.forEach((part,i)=>part.steps.forEach(st=>out.push({...st,part:i})));
        return out;
      }
      function stepOfTask(lesson,taskId){
        const flat=flatSteps(lesson);
        if(!flat)return 1+(lesson.text?1:0)+lesson.tasks.findIndex(t=>t.id===taskId);
        const i=flat.findIndex(st=>st.kind==='task'&&st.ref===taskId);
        return i<0?0:i;
      }
      function currentStep(){
        const flat=flatSteps();
        if(flat)return flat[step]||null;
        if(step===0)return {kind:'scene'};
        if(current.text&&step===1)return {kind:'text'};
        const task=current.tasks[step-1-(current.text?1:0)];
        return task?{kind:'task',ref:task.id}:null;
      }
      function totalSteps(){
        const flat=flatSteps();
        return flat?flat.length:1+(current.text?1:0)+current.tasks.length;
      }
      function activeTask(){
        const st=currentStep();
        return st?.kind==='task'?current.tasks.find(t=>t.id===st.ref)||null:null;
      }
      function aid(task,name){
        progress=E.openAid(progress,taskKey(task),name,now());
        persist();
      }
      function playButton(turnId){
        return button('▶',{'data-course-play':turnId,'aria-label':T('audioPlay','Слушать реплику')},async()=>{
          const host=audioHost;
          const ok=await host.play(turnId);
          if(!ok&&alive&&host===audioHost){
            const note=container.querySelector('[data-course-audio-error]');if(note)note.hidden=false;
          }
        });
      }
      function line(item,scene=false){
        const row=el('div',{
          class:'course-line','data-ref':current.id+'/'+item.id
        });
        const he=hebrewElement('div',{
          'data-col':'he',dir:'rtl',lang:'he'
        },item.he);
        row.append(he);
        if(audioHost?.has(item.id))row.append(playButton(item.id));
        for(const task of current.tasks)if(task.channel?.includes('listen')&&task.audioTurnId===item.id)aid(task,'transcript');
        if(opts.layers?.translitOn&&translit){
          const value=translit({
            he:item.he.plain,he_niqqud:item.he.niqqud
          },opts.layers.translitProfile||'ru-phonetic');
          if(value)row.append(el('div',{
            'data-col':'translit',dir:'ltr'
          },value));
        }
        const ru=el('div',{
          'data-col':'ru',lang:'ru',dir:'ltr'
        },text(item.ru));
        ru.hidden=scene||opts.layers?.ruMode!=='show';
        if(!ru.hidden)for(const task of current.tasks)aid(task,'translation');
        row.append(ru);
        const reveal=button(T('translation','Перевод'),{
          'aria-expanded':String(!ru.hidden)
        },()=>{
          ru.hidden=!ru.hidden;
          reveal.setAttribute('aria-expanded',String(!ru.hidden));
          if(!ru.hidden)for(const task of current.tasks)aid(task,'translation');
        });
        row.append(reveal);
        return row;
      }
      function renderLesson(){
        if(!alive||!current)return;
        shell(text(current.title),authoredAttrs(current.title));
        niqqudControl();
        const here=currentStep();
        if(Array.isArray(current.flow)&&here){
          const part=current.flow[here.part];
          container.append(el('p',{'data-course-part':'',class:'course-part'},
            T('part','Часть {n} из {total}').replace('{n}',here.part+1).replace('{total}',current.flow.length)+' · '+text(part.title)));
        }
        readerState().position={
          lessonId:current.id,step,...(here&&Number.isInteger(here.part)?{part:here.part}:{})
        };
        persist();
        container.append(button(T('lessons','К урокам'),{
          'data-course-home':''
        },()=>home()));
        if(audioHost&&current.scene.turns.some(t=>audioHost.has(t.id))){
          const label=el('label',{},T('audioRate','Скорость'));
          const select=el('select',{'data-course-rate':'','aria-label':T('audioRate','Скорость')});
          for(const value of [1,.85,.75]){const option=el('option',{value},String(value));option.selected=value===audioRate;select.append(option);}
          on(select,'change',()=>{audioRate=Number(select.value);audioHost?.setRate(audioRate);});label.append(select);container.append(label);
          const error=el('p',{'data-course-audio-error':'',role:'status'},T('audioError','Запись не удалось воспроизвести. Попробуйте ещё раз.'));error.hidden=true;container.append(error);
        }
        const body=el('section',{
          class:'course-step','data-course-step':step
        });
        // Register before ReaderMorph's capture delegate so first activation reveals, not opens a card.
        const revealBeforeMorph=e=>{
          if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;
          const target=e.target.closest?.('[data-course-niqqud-tap]');
          if(target&&body.contains(target))tapReveals.get(target)?.(e);
        };
        on(body,'click',revealBeforeMorph,true);on(body,'keydown',revealBeforeMorph,true);
        container.append(body);
        const baseTask=activeTask();
        const variant=baseTask&&returnChoice?.taskId===baseTask.id?baseTask.variants?.find(v=>v.id===returnChoice.variantId):null;
        const task=variant?{...baseTask,prompt:variant.prompt,spec:variant.spec,...(variant.model?{model:variant.model}:{})}:baseTask;
        if(here?.kind==='summary')renderSummary(body);
        else if(here?.kind==='grammar')renderGrammarStep(body,here.ref);
        else if(here?.kind==='scene'){
          body.append(el('p',{
            class:'course-goal',...authoredAttrs(current.goal)
          },text(current.goal)));
          for(const f of [current.scene.image&&mediaFigure(current.scene.image),...mediaFor(current.scene.id)].filter(Boolean))body.append(f);
          const state=readerState();
          if(!state.scenes||typeof state.scenes!=='object'||Array.isArray(state.scenes))state.scenes={};
          if(!own(state.scenes,current.id)||typeof state.scenes[current.id]!=='object')state.scenes[current.id]={choices:{}};
          body.append(SC.render({
            scene:current.scene,el,button,hebrewButton,text,T,state:state.scenes[current.id],persist,
            line,roleLabel:role=>T('role.'+role,role),learnerRole:'learner',audio:audioHost,
            rerender:()=>renderLesson(),
            onReveal:ids=>{for(const task of current.tasks)if(task.channel?.includes('listen')&&ids.includes(task.audioTurnId))aid(task,'transcript');}
          },{mode:here.mode||'read'}));
        }
        else if(here?.kind==='text'){
          body.append(el('h3',{},T('studyText','Учебный текст')));
          for(const f of mediaFor(current.text.id))body.append(f);
          for(const para of current.text.paras){for(const f of mediaFor(para.id))body.append(f);body.append(line(para));}
        }
        else if(task)renderTask(body,task);
        const nav=el('nav',{
          class:'course-nav','aria-label':T('navigation','Шаги урока')
        });
        const back=button(T('back','Назад'),{
          'data-course-back':''
        },()=>{
          if(step===0)home();
          else{
            step--;
            renderLesson();
          }
        });
        const next=button(step===totalSteps()-1?T('finish','К урокам'):T('next','Дальше'),{
          'data-course-next':''
        },()=>{
          if(step===totalSteps()-1)home();
          else{
            step++;
            renderLesson();
          }
        });
        if(task)next.disabled=!canContinue(task);
        nav.append(back,el('span',{},T('step','Шаг {n} из {total}').replace('{n}',step+1).replace('{total}',totalSteps())),next);
        container.append(nav);
        if(opts.onWords)wordHandle=opts.onWords(body,current)||null;
        notify();
      }
      // Media used inside a task (order card, match picture) are not repeated as decoration.
      function taskMediaIds(){
        const ids=new Set();
        for(const t of current.tasks){if(t.cardMedia)ids.add(t.cardMedia);for(const p of t.pairs||[])if(p.media)ids.add(p.media);}
        if(current.scene?.image)ids.add(current.scene.image);
        return ids;
      }
      function mediaFigure(id,{essential=false}={}){
        const m=(current.media||[]).find(x=>x.id===id);
        if(!m)return null;
        return MD.figure(m,{base,doc,essential,reducedMotion:opts.reducedMotion??MD.prefersReducedMotion(root)});
      }
      function mediaFor(targetId){
        const used=taskMediaIds();
        return (current.media||[]).filter(m=>m.target===targetId&&!used.has(m.id)).map(m=>mediaFigure(m.id)).filter(Boolean);
      }
      function microCard(g){
        const box=el('div',{class:'course-microcard','data-course-microcard':''});
        const tokens=hebrew(g.line.he).split(/\s+/);
        const line=el('div',{class:'course-microcard-line','data-microcard-line':'',dir:'rtl',lang:'he'});
        const covered=new Set();
        g.line.slots.forEach((s,i)=>{for(let k=s.from;k<=s.to;k++)covered.add(k);});
        let k=0;
        while(k<tokens.length){
          const slot=g.line.slots.find(s=>s.from===k);
          if(slot){
            const group=el('span',{class:'course-microcard-slot','data-slot':String(g.line.slots.indexOf(slot))});
            group.append(el('span',{class:'course-microcard-words'},tokens.slice(slot.from,slot.to+1).join(' ')),el('span',{class:'course-microcard-label',dir:'ltr',lang:'ru'},text(slot.label)));
            line.append(group);k=slot.to+1;
          }else{line.append(el('span',{class:'course-microcard-plain'},tokens[k]));k++;}
        }
        box.append(line);
        return box;
      }
      function renderSummary(body){
        const box=el('section',{'data-course-summary':''});
        box.append(el('h3',{},T('summary.title','Что вы теперь умеете')));
        const list=el('ul',{class:'course-skills'});
        const words={independent:T('summary.independent','сами'),supported:T('summary.supported','с опорой'),not_yet:T('summary.notYet','ещё не пробовали')};
        for(const s of E.skillSummary(progress,current)){
          list.append(el('li',{'data-skill':s.id,'data-level':s.level},text(s.label)+' — '+words[s.level]));
        }
        box.append(list);
        const detail=el('details');
        detail.append(el('summary',{},T('evidence','Как это засчитано')),el('p',{},T('summary.how','«Сами» — с первой попытки, без подсказок, образца, перевода и текста реплики. «С опорой» — ответ принят, но с помощью или не с первой попытки.')));
        box.append(detail);
        body.append(box);
      }
      function renderGrammarStep(body,ref){
        const g=current.grammar?.[ref];
        if(!g)return;
        body.append(el('h3',authoredAttrs(g.title),text(g.title)));
        if(g.line)body.append(microCard(g));
        body.append(el('p',authoredAttrs(g.body),text(g.body)));
      }
      function latest(task){
        const variant=returnChoice?.taskId===task.id&&returnChoice.variantId?{id:returnChoice.variantId}:undefined;
        const fp=E.fingerprint(current.id,task,variant);
        return progress.attempts.findLast(a=>a.lessonId===current.id&&a.taskId===task.id&&
          (variant?a.fp===fp:(a.baseFp||a.fp)===fp));
      }
      function canContinue(task){
        return latest(task)?.kind==='accepted';
      }
      function record(task,input,result,channel){
        const variant=returnChoice?.taskId===task.id&&returnChoice.variantId?{id:returnChoice.variantId}:undefined;
        const r=E.record(progress,{
          lessonId:current.id,lessonVersion:current.version,lesson:current,task,
          baseTask:current.tasks.find(t=>t.id===task.id),variant,channel,input,result,at:now()
        });
        progress=r.progress;
        if(persist()&&!r.duplicate)opts.sync?.schedule();
        return r.attempt;
      }
      function renderTask(body,task){
        const ui=uiFor(task);
        body.setAttribute('data-course-task',task.id);
        for(const f of mediaFor(task.id))body.append(f);
        body.append(el('h3',authoredAttrs(task.prompt),text(task.prompt)));
        const feedback=el('div',{
          'data-course-feedback':'',role:'status'
        });
        let field;
        const listening=task.channel?.includes('listen')&&audioHost?.has(task.audioTurnId);
        if(listening){
          const turn=current.scene.turns.find(t=>t.id===task.audioTurnId);
          body.append(playButton(task.audioTurnId));
          const transcript=hebrewElement('p',{'data-course-transcript':'',dir:'rtl',lang:'he'},turn.he);
          transcript.hidden=!ui.transcript;
          const toggle=button(T('audioTranscript','Текст реплики'),{'data-course-transcript-toggle':'','aria-expanded':String(!transcript.hidden)},()=>{
            transcript.hidden=!transcript.hidden;uiFor(task).transcript=!transcript.hidden;
            toggle.setAttribute('aria-expanded',String(!transcript.hidden));
            if(!transcript.hidden)aid(task,'transcript');else persist();
          });
          body.append(toggle,transcript);
        }
        const updateFeedback=(result,attempt)=>{
          feedback.replaceChildren();
          feedback.textContent=result.kind==='accepted'?T('accepted','Смысл передан.'):result.kind==='unknown'?T('unknown','Проверка недоступна для этого варианта.'):result.message?.ru||T('tryAgain','Попробуйте ещё.');
          if(result.kind==='unknown'&&task.model){
            feedback.append(button(T('selfCheck','Сверить с образцом'),{
              'data-course-self':''
            },()=>{
              aid(task,'model');
              uiFor(task).model=true;
              uiFor(task).feedback={kind:'accepted'};
              record(task,String(uiFor(task).input||''),{
                kind:'accepted'
              },'self');
              renderLesson();
            }));
          }
          if(result.kind==='unknown'&&!task.model){
            feedback.append(el('p',{},T('noModel','Образец для этого задания пока не добавлен.')),button(T('skip','Пропустить'),{
              'data-course-skip':''
            },()=>{
              if(step===totalSteps()-1)home();
              else{
                step++;
                renderLesson();
              }
            }));
          }
          const next=container.querySelector('[data-course-next]');
          if(next)next.disabled=attempt?.kind!=='accepted';
          paintEvidence(attempt);
        };
        const submit=(value,channel='write_he',custom)=>{
          uiFor(task).input=String(value);
          const result=custom||C.assess(value,task,current,bundle.index);
          const attempt=record(task,String(value),result,listening&&uiFor(task).heard?'listen':channel);
          uiFor(task).feedback=result;
          persist();
          updateFeedback(result,attempt);
        };
        const kind=Object.hasOwn(Object(task),'type')?TK.get(task.type):null;
        if(!kind)body.append(el('p',{'data-course-unsupported':'',role:'status'},T('unsupported','Задание этого типа не поддерживается в этой версии.')));
        else kind.render({
          get ui(){return uiFor(task);},task,body,T,el,button,hebrewElement,hebrewButton,text,authoredAttrs,on,submit,persist,listening,doc,
          lang:opts.lang||doc.documentElement.lang,rawT:opts.T,keyboard:K||root.CourseKeyboard,
          setKeyboard:h=>{keyboardHandle=h;},
          mediaFigure:id=>mediaFigure(id,{essential:true}),
          slotLabel:(slotId,key)=>{const v=current.slots.find(s=>s.id===slotId)?.values.find(x=>x.key===key);return v?text(v.label):key;}
        });
        body.append(feedback);
        const help=el('div',{
          class:'course-help'
        });
        const hints=progress.aids[taskKey(task)]?.hint||0;
        const hint=button(T('hint','Подсказка'),{
          'data-course-hint':''
        },()=>{
          if((progress.aids[taskKey(task)]?.hint||0)>=2)return;
          aid(task,'hint');
          const n=progress.aids[taskKey(task)].hint;
          hintNote.textContent=text(task.hints?.[n-1])||T('hintText','Сверьте условие задания и нужные слова.');
          hint.disabled=n>=2;
          paintEvidence(latest(task));
        });
        hint.disabled=hints>=2;
        const hintNote=el('p',{
          'data-course-hint-text':''
        });
        if(hints)hintNote.textContent=text(task.hints?.[Math.min(hints,2)-1])||T('hintText','Сверьте условие задания и нужные слова.');
        help.append(hint,hintNote);
        const model=hebrewElement('p',{
          'data-course-model-text':'',dir:'rtl',lang:'he'
        },task.model);
        if(!task.model)model.textContent=T('noModel','Образец для этого задания пока не добавлен.');
        model.hidden=!ui.model;
        const modelBtn=button(ui.model?T('hideModel','Скрыть образец'):T('showModel','Показать образец'),{
          'data-course-model':'','aria-expanded':String(!!ui.model)
        },()=>{
          uiFor(task).model=!uiFor(task).model;
          if(uiFor(task).model)aid(task,'model');
          model.hidden=!uiFor(task).model;
          modelBtn.textContent=uiFor(task).model?T('hideModel','Скрыть образец'):T('showModel','Показать образец');
          modelBtn.setAttribute('aria-expanded',String(uiFor(task).model));
          persist();
        });
        help.append(modelBtn,model);
        if(task.grammarRef&&own(current.grammar||{},task.grammarRef))help.append(button(T('rule','Правило'),{
          'data-course-rule':''
        },()=>{
          const g=current.grammar[task.grammarRef],dialog=el('section',{
            class:'course-grammar',role:'dialog','aria-modal':'true','aria-label':text(g.title)
          });
          dialog.append(el('h3',authoredAttrs(g.title),text(g.title)));
          if(g.line)dialog.append(microCard(g));
          dialog.append(el('p',authoredAttrs(g.body),text(g.body)));
          for(const h of g.pattern||[])dialog.append(hebrewElement('p',{
            dir:'rtl',lang:'he'
          },h));
          const close=button(T('close','Закрыть'),{},()=>{
            dialog.remove();
            body.querySelector('[data-course-rule]').focus();
          });
          dialog.append(close);
          on(dialog,'keydown',e=>{
            if(e.key==='Escape'){e.preventDefault();close.click();}
            if(e.key==='Tab'){e.preventDefault();close.focus();}
          });
          body.append(dialog);
          close.focus();
        }));
        body.append(help);
        const detail=el('details');
        detail.append(el('summary',{},T('evidence','Как это засчитано')),el('p',{
          'data-course-evidence':''
        }));
        body.append(detail);
        function paintEvidence(a){
          const p=body.querySelector('[data-course-evidence]');
          if(!p)return;
          p.textContent=a?T('evidenceText','Канал: {channel}. Помощь: {aids}. {level}. Первая попытка: {first}.').replace('{channel}',T('channel.'+a.channel,a.channel)).replace('{aids}',Object.entries(a.aids).filter(([,v])=>v).map(([k])=>T('aid.'+k,k)).join(', ')||T('none','нет')).replace('{level}',E.attemptLevel(a)==='independent'?T('independent','самостоятельно'):T('supported','с опорой')).replace('{first}',a.first?T('yes','да'):T('no','нет')):T('noAttempt','Ответ ещё не проверен.');
        }
        const last=latest(task);
        if(last)updateFeedback(ui.feedback||{
          kind:last.kind
        },last);
        else paintEvidence(null);
      }
      function destroy(){
        if(!alive)return;
        alive=false;
        epoch++;
        controller?.abort();
        audioHost?.stop(); audioHost=null;
        opts.stopAudio?.();
        opts.sync?.dispose?.();
        clear();
        container.classList.remove('course-reader');
      }
      return {
        home,openLesson,destroy,setSyncStatus,applyProgress
      };
    }
    return {
      mount
    };
  }
  const api={
    factory,mount:(container,opts)=>factory(container.ownerDocument).mount(container,opts)
  };
  root.CourseReader=api;
  if(node)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
