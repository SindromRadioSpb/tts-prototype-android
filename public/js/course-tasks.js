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

  // Stable per-task shuffle, so the bank does not jump between visits.
  function seededOrder(n,seed){
    let h=2166136261;
    for(const ch of String(seed)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}
    const order=[...Array(n).keys()];
    for(let i=n-1;i>0;i--){h=Math.imul(h^(h>>>15),2246822507)>>>0;const j=h%(i+1);[order[i],order[j]]=[order[j],order[i]];}
    return order;
  }
  register('tiles',{render(ctx){
    const {task,body,T,el}=ctx;
    const all=[...(task.tiles||[]),...(task.distractors||[])];
    const bankOrder=seededOrder(all.length,task.id);
    const valid=x=>Number.isInteger(x)&&x>=0&&x<all.length;
    let picked=Array.isArray(ctx.ui.tiles)?ctx.ui.tiles.filter(valid).filter((x,i,a)=>a.indexOf(x)===i):[];
    const answer=el('div',{class:'course-tiles-answer','data-tiles-answer':'',dir:'rtl',lang:'he','aria-label':T('tiles.answer','Ваша фраза')});
    const bank=el('div',{class:'course-tiles-bank','data-tiles-bank':'',dir:'rtl',lang:'he','aria-label':T('tiles.bank','Слова')});
    function save(){ctx.ui.tiles=picked;ctx.ui.input=picked.map(i=>all[i].plain).join(' ');ctx.persist();}
    function paint(){
      answer.replaceChildren();bank.replaceChildren();
      for(const i of picked)answer.append(ctx.hebrewButton(all[i],{'data-tile':i,class:'course-tile'},()=>{picked=picked.filter(x=>x!==i);save();paint();}));
      if(!picked.length)answer.append(el('span',{class:'course-tiles-empty'},T('tiles.empty','Касайтесь слов ниже')));
      for(const i of bankOrder)if(!picked.includes(i))bank.append(ctx.hebrewButton(all[i],{'data-tile':i,class:'course-tile'},()=>{picked=[...picked,i];save();paint();}));
    }
    paint();
    body.append(answer,bank,ctx.button(T('check','Проверить'),{'data-course-check':''},()=>ctx.submit(picked.map(i=>all[i].plain).join(' '),'cards')));
  }});

  // Order card: the picture (or its words-only fallback) says what to order; the learner says it in Hebrew.
  register('order',{render(ctx){
    const {task,body,T,el}=ctx;
    const card=el('div',{class:'course-order-card','data-course-order-card':'','aria-label':T('order.card','Заказ')});
    const fig=task.cardMedia?ctx.mediaFigure(task.cardMedia):null;
    if(fig)card.append(fig);
    else{
      const list=el('ul',{class:'course-order-items'});
      for(const [slot,key] of Object.entries(task.card||{}))list.append(el('li',{'data-order-slot':slot},ctx.slotLabel(slot,key)));
      card.append(list);
    }
    body.append(card);
    freeAnswer(ctx);
  }});

  const api={register,get,freeAnswer};
  root.CourseTasks=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
