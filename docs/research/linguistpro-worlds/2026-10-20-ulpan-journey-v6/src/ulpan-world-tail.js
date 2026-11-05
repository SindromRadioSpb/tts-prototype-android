  function lang(){const l=document.documentElement.lang.slice(0,2);return LABELS[l]?l:'ru'}
  function peopleTargets(){
   const s=getState();
   if(s.id==='travel')return [{id:'hero',x:141,top:55,feet:220},{id:'timsah',x:502,top:73,feet:180}];
   const list=[{id:'hero',x:s.heroX,top:137,feet:222},{id:'timsah',x:s.timsahX,top:165,feet:223}];
   if(s.id==='market')list.push({id:'seller',x:124,top:124,feet:164});
   if(s.id==='workshop')list.push({id:'master',x:150,top:139,feet:187});
   if(s.id==='reading')list.push({id:'teacher',x:452,top:144,feet:186});
   return list;
  }
  function targetRect(target){
   const k=cssW/640,z=story[index].id==='travel'?1:1.12;
   const x=(target.x*z+320*(1-z))*k,top=(target.top*z+228*(1-z))*k;
   const feet=(target.feet*z+228*(1-z))*k;
   const width=Math.max(44,28*z*k),height=Math.max(44,feet-top);
   return {x,y:top,width,height,left:x-width/2,top,head:top};
  }
  function controls(){
   if(!isStage||!opts.onActor)return;
   const visible=new Set(),l=lang();
   for(const target of peopleTargets()){
    visible.add(target.id);let button=buttons.get(target.id);
    if(!button){button=document.createElement('button');button.type='button';button.className='lp-world-actor';button.dataset.worldUi='';button.dataset.actor=target.id;button.addEventListener('click',()=>opts.onActor(target.id));parent.appendChild(button);buttons.set(target.id,button)}
    const r=targetRect(target);button.hidden=false;
    button.setAttribute('aria-label',LABELS[l][target.id]);button.title=LABELS[l][target.id];
    Object.assign(button.style,{left:r.left+'px',top:'auto',bottom:(52+cssW*228/640-r.top-r.height)+'px',width:r.width+'px',height:r.height+'px'});
   }
   for(const [id,button]of buttons)if(!visible.has(id))button.hidden=true;
  }
  function draw(){
   if(disposed)return;
   const s=getState();ctx.setTransform(2,0,0,2,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,640,228);
   if(s.id==='travel')travel(s);
   else{ctx.save();const z=1.12;ctx.translate(320*(1-z),228*(1-z));ctx.scale(z,z);ctx.drawImage(images[s.id],0,0,640,228);ambient(s);hero(s);timsah(s);if(s.id==='reading'||s.id==='cinema')sceneSign(s.id==='reading'?'אולפן':'סרט');ctx.restore()}
   controls();dirty=false;
  }
  function resize(w,h,scale){
   cssW=w;engineScale=scale;canvas.width=1280;canvas.height=456;
   Object.assign(canvas.style,{width:w+'px',height:(w*228/640)+'px',top:'auto',left:'0px',bottom:isStage?'52px':'0px'});
   if(isStage)document.documentElement.style.setProperty('--lp-ulpan-art-height',(w*228/640)+'px');
   else{canvas.style.position='relative';canvas.style.bottom='auto';canvas.style.margin='6px 0 0';}
   dirty=true;
  }
  return {
   resize, camera:()=>cam, size:()=>({w:cssW/engineScale,h:228}),lighting:()=>light,
   setLighting(l){light=l;dirty=true},setScroll(){},setPose(){},
   panTo(x){cam=x;const next=clamp(Math.round((x+cssW*.5/engineScale)/1000),0,story.length-1);if(index!==next){index=next;elapsed=0;speech=null;anchorActor='timsah';dirty=true}},
   render(kind,t,dt){
    if(disposed)return;const wasReduced=reduced;reduced=mq.matches;
    const choice=root.LPWorld.current(),el=document.activeElement;
    const editing=el&&!el.closest('[data-world-ui]')&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const blocked=document.hidden||reduced||activity.reading||activity.audio||editing||(choice&&(choice.paused||choice.mode==='calm'));
    if(!blocked&&dt>0){elapsed+=Math.min(100,dt)/1000;dirty=true;}
    if(wasReduced!==reduced||lastLocale!==lang())dirty=true;lastLocale=lang();if(dirty)draw();
   },
   dialogue(id,l){
    const beats=story[index].beats.filter(b=>b.who===id);if(!beats.length)return null;
    const key=index+':'+id+':'+l,n=cursors[key]||0,beat=beats[n%beats.length];cursors[key]=n+1;
    speech={beat,started:elapsed};anchorActor=id;dirty=true;
    const locale=LABELS[l]?l:'ru';return LABELS[locale][id]+': '+beat.text[locale];
   },
   hitTest(x,y){for(const target of peopleTargets()){const r=targetRect(target);if(Math.abs(x-r.x)<=r.width/2&&y>=r.top&&y<=r.top+r.height)return target.id}return null},
   bubbleAnchor(){const target=peopleTargets().find(t=>t.id===anchorActor)||peopleTargets()[1],r=targetRect(target);return{x:r.x,bottom:52+cssW*228/640-r.head}},
   destroy(){disposed=true;for(const button of buttons.values())button.remove();buttons.clear();}
  };
 };
 root.LPWorldActivity?.sync();
})(window);
