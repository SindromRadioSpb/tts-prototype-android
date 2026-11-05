(function(root){
  'use strict';
  // Task type registry: each type renders its own answer controls; the reader owns prompt, help and feedback.
  const types=new Map();
  function register(type,module){
    if(typeof type!=='string'||!type||typeof module?.render!=='function')throw new Error('BAD_TASK_TYPE');
    types.set(type,module);
  }
  function get(type){return types.get(type)||null;}

  register('choice',{render(ctx){
    const {task,body,T}=ctx;
    for(const option of task.options||[]){
      const attrs={'data-option':option.id,dir:option.he?'rtl':'auto'};
      const pick=()=>{
        const correct=option.id===task.correctOption;
        ctx.submit(option.id,'cards',{kind:correct?'accepted':'mismatch',message:{ru:T('tryAgain','Попробуйте ещё.')}});
      };
      body.append(option.he?ctx.hebrewButton(option.he,attrs,pick):ctx.button(ctx.text(option.label),attrs,pick));
    }
  }});

  register('match',{render(ctx){
    const {task,body,T,el}=ctx;const ui=ctx.ui;
    const pairIds=new Set((task.pairs||[]).map(p=>p.id));
    let selected=pairIds.has(ui.matchSelected)?ui.matchSelected:null;
    const chosen=new Map((Array.isArray(ui.matchPairs)?ui.matchPairs:[]).filter(p=>Array.isArray(p)&&p[0]===p[1]&&pairIds.has(p[0])));
    function saveMatches(){ctx.ui.matchSelected=selected;ctx.ui.matchPairs=[...chosen];ctx.persist();}
    const pairs=task.pairs||[],grid=el('div',{class:'course-match'}),left=el('div'),right=el('div');
    for(const pair of pairs){
      left.append(ctx.hebrewButton(pair.he,{'data-match-left':pair.id,dir:'rtl'},()=>{
        selected=pair.id;saveMatches();
        for(const b of left.children)b.setAttribute('aria-pressed',String(b.getAttribute('data-match-left')===selected));
      }));
      const b=left.lastChild;b.disabled=chosen.has(pair.id);b.setAttribute('aria-pressed',String(selected===pair.id));
    }
    for(const pair of [...pairs].reverse()){
      const onPick=()=>{
        if(!selected)return;
        chosen.set(selected,pair.id);
        const leftId=selected;
        selected=null;
        if(leftId!==pair.id){
          ctx.submit(JSON.stringify([...chosen]),'cards',{kind:'mismatch',message:{ru:T('tryAgain','Попробуйте ещё.')}});
          chosen.delete(leftId);
        }else{
          left.querySelector('[data-match-left="'+leftId+'"]').disabled=true;
          right.querySelector('[data-match-right="'+pair.id+'"]').disabled=true;
          if(chosen.size===pairs.length)ctx.submit(JSON.stringify([...chosen]),'cards',{kind:'accepted'});
        }
        saveMatches();
        for(const x of left.children)x.setAttribute('aria-pressed','false');
      };
      const attrs={'data-match-right':pair.id};
      if(pair.media&&ctx.mediaFigure){
        const btn=ctx.button('',{...attrs,class:'course-match-media'},onPick);
        btn.append(ctx.mediaFigure(pair.media));
        right.append(btn);
      }else right.append(ctx.button(ctx.text(pair.label),{...attrs,...ctx.authoredAttrs(pair.label)},onPick));
    }
    for(const b of right.children)b.disabled=chosen.has(b.getAttribute('data-match-right'));
    grid.append(left,right);
    body.append(grid);
  }});

  // Free Hebrew answer with the on-screen keyboard; shared by text, cloze and scene tasks.
  function freeAnswer(ctx,{before}={}){
    const {body,T,el}=ctx;
    if(before)before();
    const field=el('textarea',{'data-course-input':'',dir:'rtl',lang:'he','aria-label':T('answer','Ваш ответ'),rows:'2'});
    field.value=typeof ctx.ui.input==='string'?ctx.ui.input:'';
    ctx.on(field,'input',()=>{ctx.ui.input=field.value;ctx.persist();});
    const keyboard=ctx.keyboard;
    const keyboardBox=el('div',{'data-course-keyboard':''});
    keyboardBox.hidden=true;
    const keyboardText=key=>T(key,keyboard.label(key,ctx.lang));
    const toggle=ctx.button(keyboardText('keyboardShow'),{'data-course-keyboard-toggle':'','aria-expanded':'false'},()=>{
      keyboardBox.hidden=!keyboardBox.hidden;
      toggle.setAttribute('aria-expanded',String(!keyboardBox.hidden));
      toggle.textContent=keyboardText(keyboardBox.hidden?'keyboardShow':'keyboardHide');
    });
    ctx.setKeyboard(keyboard.attach(field,keyboardBox,{lang:ctx.lang,T:ctx.rawT}));
    body.append(field,toggle,keyboardBox,ctx.button(T('check','Проверить'),{'data-course-check':''},()=>ctx.submit(field.value)));
    return field;
  }
  register('text',{render:ctx=>freeAnswer(ctx)});
  register('cloze',{render:ctx=>freeAnswer(ctx)});
  register('scene',{render:ctx=>freeAnswer(ctx,{before(){
    if(ctx.task.cue&&!ctx.listening)ctx.body.append(ctx.hebrewElement('p',{dir:'rtl',lang:'he'},ctx.task.cue));
  }})});

  const api={register,get,freeAnswer};
  root.CourseTasks=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
