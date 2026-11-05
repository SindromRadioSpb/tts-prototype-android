(function(root){
  'use strict';
  const own=(o,k)=>o&&Object.hasOwn(o,k);
  // Path through a scene: next links and chosen branches, stopping at the first unanswered choice.
  function path(scene,choices){
    const turns=scene.turns||[];
    const byId=new Map(turns.map(t=>[t.id,t]));
    const graph=turns.some(t=>t.next!==undefined||t.choices!==undefined);
    if(!graph)return turns.map(t=>t.id);
    const out=[],seen=new Set();
    let turn=turns[0];
    while(turn&&!seen.has(turn.id)){
      seen.add(turn.id);out.push(turn.id);
      if(Array.isArray(turn.choices)){
        const picked=own(choices,turn.id)?turn.choices.find(c=>c.id===choices[turn.id]):null;
        if(!picked)break;
        turn=byId.get(picked.next);
      }else turn=turn.next!==undefined?byId.get(turn.next):null;
    }
    return out;
  }
  function chosenLine(turn,choices){
    const picked=Array.isArray(turn.choices)&&own(choices,turn.id)?turn.choices.find(c=>c.id===choices[turn.id]):null;
    return picked?{...turn,he:picked.he,ru:picked.ru}:turn;
  }
  // ctx: {scene, el, button, hebrewButton, line(turn), roleLabel(role), T, state, persist, rerender, audio, onReveal(turnIds), learnerRole}
  function render(ctx,{mode='read'}={}){
    const {scene,el,T,state}=ctx;
    if(!state.choices||typeof state.choices!=='object')state.choices={};
    const ids=path(scene,state.choices);
    const byId=new Map(scene.turns.map(t=>[t.id,t]));
    const voiced=ids.filter(id=>ctx.audio?.has(id));
    const listen=mode==='listen'&&voiced.length>0;
    const box=el('div',{class:'course-scene','data-course-scene':'','data-mode':listen?'listen':'read'});
    if(mode==='listen'&&!listen)box.append(el('p',{class:'course-scene-note',role:'status'},T('scene.noAudio','Запись недоступна — читаем.')));
    const revealed=listen&&state.revealed===true;
    const rows=new Map();
    for(const id of ids){
      const turn=chosenLine(byId.get(id),state.choices);
      const learner=turn.role===ctx.learnerRole;
      const unanswered=Array.isArray(byId.get(id).choices)&&!own(state.choices,id);
      let row;
      if(!listen||revealed){
        row=ctx.line(turn,true);
        if(unanswered)row.querySelector('[data-col="he"]')?.remove();
      }else{
        row=el('div',{class:'course-line'});
        row.append(el('span',{class:'course-scene-hidden','aria-hidden':'true'},'· · ·'));
      }
      row.setAttribute('data-turn',id);
      row.setAttribute('data-role',turn.role);
      row.classList.add(learner?'course-line-response':'course-line-speaker');
      row.prepend(el('span',{class:'course-role'},ctx.roleLabel(turn.role)));
      if(unanswered){
        const options=el('div',{class:'course-scene-choices',role:'group','aria-label':T('scene.choose','Что ответить?')});
        for(const c of byId.get(id).choices){
          const pick=()=>{state.choices[id]=c.id;ctx.persist();ctx.rerender();};
          const attrs={'data-scene-choice':c.id};
          options.append(listen&&!revealed?ctx.button(ctx.text(c.ru),attrs,pick):ctx.hebrewButton(c.he,{...attrs,dir:'rtl'},pick));
        }
        row.append(options);
      }
      rows.set(id,row);
      box.append(row);
    }
    if(listen){
      const controls=el('div',{class:'course-scene-controls'});
      const play=ctx.button(T('scene.play','Слушать сцену'),{'data-scene-play':''},()=>{
        ctx.audio.playSequence(ids,{onTurn:id=>{
          for(const [rid,r] of rows)r.classList.toggle('is-speaking',rid===id);
        }}).then(()=>{for(const r of rows.values())r.classList.remove('is-speaking');});
      });
      controls.append(play);
      if(!revealed)controls.append(ctx.button(T('scene.reveal','Показать текст'),{'data-scene-reveal':''},()=>{
        state.revealed=true;ctx.onReveal(ids);ctx.persist();ctx.rerender();
      }));
      box.prepend(controls);
    }
    return box;
  }
  const api={path,render};
  root.CourseScene=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
