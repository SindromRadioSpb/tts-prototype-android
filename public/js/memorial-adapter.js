/* App-owned integration for memorial-three-scenes@1.0.0.
 * Native pack = JSON + original PNG backgrounds + small transparent PNG frame atlases.
 * This adapter adds fixed 2048x683 fitting, cached redraw, a 90 s carousel, localised controls,
 * header reservation and a temporary one-canvas crossfade. Reference engine code is unchanged.
 */
(function (root) {
 'use strict';
 const WORLD='memorial-three-scenes',KEY='lp_memorial_three_v1',PERIOD=90000;
 function clean(v){v=v||{};return {scene:Number.isInteger(v.scene)&&v.scene>=1&&v.scene<=3?v.scene:1,auto:v.auto!==false,paused:v.paused===true,elapsed:Math.max(0,Math.min(PERIOD,Number(v.elapsed)||0))};}
 function clockState(initial){let s=clean(initial),last=null;return {
  value:()=>Object.assign({},s),resetClock(){last=null},pause(v){s.paused=!!v;last=null},manual(n){s.scene=n;s.auto=false;s.elapsed=0;last=null},auto(){s.auto=true;s.elapsed=0;last=null},
  tick(now,blocked){if(last===null){last=now;return null;}const dt=Math.min(1000,Math.max(0,now-last));last=now;if(blocked||s.paused||!s.auto)return null;s.elapsed+=dt;if(s.elapsed<PERIOD)return null;s.elapsed=0;s.scene=s.scene%3+1;return s.scene;}
 };}
 if(typeof module==='object'&&module.exports)module.exports={clockState,clean,PERIOD};
 if(!root||!root.document)return;
 if(root.LPMemorialAdapter){root.LPMemorialAdapter.refresh();return;}
 const doc=root.document,engine=root.LPWorld,render=root.LPWorldRender;
 if(!engine||!render)throw new Error('Memorial adapter requires LPWorld and LPWorldRender first');
 let saved;try{saved=JSON.parse(root.localStorage.getItem(KEY)||'null')}catch(_){saved=null}
 const model=clockState(saved),activity={reading:false,editing:false,audio:false},media=new Set(),originalCreate=render.createRenderer;
 let context=null,timer=0,fadeTimer=0,fadeNode=null,disposed=false,lastSaved='',restoreEpoch=0;
 const mq=root.matchMedia('(prefers-reduced-motion: reduce)');
 const TEXT={ru:{caption:'7 октября. Помним.',auto:'Авто',pause:'Пауза',resume:'Продолжить',scene:'Сцена',names:['Мемориальная площадь','Свеча у окна','Тихий закат'],group:'Выбор сцены памяти',automatic:'Автосмена каждые 90 секунд',fixed:'Выбранная сцена закреплена'},en:{caption:'October 7. We remember.',auto:'Auto',pause:'Pause',resume:'Resume',scene:'Scene',names:['Memorial square','A candle by the window','A quiet sunset'],group:'Choose a remembrance scene',automatic:'Automatic change every 90 seconds',fixed:'Selected scene stays fixed'},he:{caption:'7 באוקטובר. זוכרים.',auto:'אוטומטי',pause:'השהיה',resume:'המשך',scene:'סצנה',names:['כיכר זיכרון','נר ליד החלון','שקיעה שקטה'],group:'בחירת סצנת זיכרון',automatic:'החלפה אוטומטית כל 90 שניות',fixed:'הסצנה שנבחרה נשארת קבועה'}};
 function lang(){const l=(doc.documentElement.getAttribute('lang')||'ru').toLowerCase().slice(0,2);return TEXT[l]?l:'ru';}
 const style=doc.createElement('style');style.id='lp-memorial-adapter-style';style.textContent=`
 html[data-world="${WORLD}"] body .classic-shell-copy,html[data-world="${WORLD}"] body .room-header-row,html[data-world="${WORLD}"] body .ml-heading{padding-bottom:calc(var(--lp-memorial-art-height,384px) + 104px)!important}
 .lp-memorial-photo{position:absolute;inset-inline:0;bottom:104px;overflow:hidden;background:#101e32;pointer-events:none}
 .lp-memorial-photo canvas{position:absolute!important;image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none}
 .lp-memorial-panel{position:absolute;z-index:8;inset-inline:0;bottom:0;height:104px;background:#182737;color:#f6e5c0;border-top:1px solid #7d776b;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:7px;padding:7px 10px;box-sizing:border-box;pointer-events:auto;font-family:system-ui,sans-serif}
 .lp-memorial-caption{margin:0;font-size:16px;font-weight:500;line-height:1.2;text-align:center;color:#f6e5c0}
 .lp-memorial-controls{display:flex;gap:6px;align-items:center;justify-content:center}
 .lp-memorial-controls button{width:auto!important;flex:none;min-width:44px;height:44px;border:1px solid #8b887c;background:#243c50;color:#f6e5c0;font:500 13px/1 system-ui,sans-serif;padding:5px 10px;cursor:pointer;border-radius:3px}
 .lp-memorial-controls button[aria-pressed="true"]{background:#d9c79e;color:#182737;border-color:#f6e5c0}
 .lp-memorial-controls button:focus-visible{outline:2px solid #f6e5c0;outline-offset:2px}
 @media(max-width:400px){.lp-memorial-caption{font-size:14px}.lp-memorial-controls{gap:4px}.lp-memorial-controls button{width:auto!important;flex:none;padding:5px 8px;min-width:44px}}
 `;doc.head.appendChild(style);
 function save(){const json=JSON.stringify(model.value());if(json===lastSaved)return;lastSaved=json;try{root.localStorage.setItem(KEY,json)}catch(_){}}
 function clearFade(){if(fadeTimer)root.clearTimeout(fadeTimer);fadeTimer=0;if(fadeNode&&fadeNode.parentElement)fadeNode.parentElement.removeChild(fadeNode);fadeNode=null;}
 function fit(meta){const isStage=meta.isStage,w=isStage?Math.min(meta.cssW||380,1152):Math.min(meta.cssW||380,(meta.cssH||144)*2048/683),h=Math.round(w*683/2048);meta.artHeight=h;meta.photo.style.height=(isStage?h:meta.cssH||144)+'px';meta.photo.style.bottom=isStage?'104px':'0px';meta.canvas.style.width=w+'px';meta.canvas.style.height=h+'px';meta.canvas.style.left=Math.round(((meta.cssW||380)-w)/2)+'px';meta.canvas.style.top=(isStage?0:Math.round(((meta.cssH||144)-h)/2))+'px';if(isStage)doc.documentElement.style.setProperty('--lp-memorial-art-height',h+'px');if(isStage&&context===meta&&fadeNode){fadeNode.style.width=meta.canvas.style.width;fadeNode.style.height=meta.canvas.style.height;fadeNode.style.left=meta.canvas.style.left;fadeNode.style.top='0px';}}
 // Only this world's renderer is adapted. Other worlds retain the original implementation.
 render.createRenderer=function(canvas,opts){
  if(opts.pack.id!==WORLD)return originalCreate(canvas,opts);
  const parent=canvas.parentElement,photo=doc.createElement('div');photo.className='lp-memorial-photo';parent.appendChild(photo);photo.appendChild(canvas);
  const inner=originalCreate(canvas,opts),meta={canvas,photo,cssW:380,dirty:true,key:'',draws:0,skips:0,scene:1,panel:null};
  const isStage=!!(parent.hasAttribute&&parent.hasAttribute('data-world-slot'));meta.isStage=isStage;if(isStage)context=meta;else{photo.style.position='relative';photo.style.insetInline='auto';photo.style.left='auto';photo.style.right='auto';photo.style.width='100%';photo.style.marginTop='6px';canvas.style.margin='0';canvas.style.border='0';}
  function setPose(pose){
   // Overlay layers are additive background-painted sprites: no character contact shadows.
   const safe=pose.filter(p=>p.actor&&Object.prototype.hasOwnProperty.call(opts.pack.actors,p.actor)).map(p=>p.actor.startsWith('light-')?Object.assign({},p,{back:true,ground:0}):p);
   // Current engine staticPose may omit location props under pause/reduced motion.
   if(!safe.some(p=>p.actor.startsWith("background-")))safe.unshift({actor:"background-"+meta.scene,frame:"still",worldX:(meta.scene-1)*10000,y:0,z:0,back:true,ground:0});
   const key=JSON.stringify(safe);if(key!==meta.key){meta.key=key;meta.dirty=true;inner.setPose(safe);}
  }
  return Object.assign({},inner,{
   resize(cssW,cssH,scale){meta.cssW=cssW;meta.cssH=cssH;inner.resize(2048,683,1);fit(meta);meta.dirty=true;},
   panTo(x,ms,now){const locs=Object.values(opts.pack.locations),loc=locs.reduce((a,b)=>Math.abs(a.x-x)<Math.abs(b.x-x)?a:b);inner.panTo(loc.x-1024,0,now);meta.scene=loc.x/10000+1;meta.dirty=true;},
   setPose,
   setLighting(l){inner.setLighting(l);meta.dirty=true;},
   render(kind,now,dt){if(meta.dirty){inner.render(kind,now,dt);meta.dirty=false;meta.draws++;}else meta.skips++;}
  });
 };
 function active(){const c=engine.current();return !!(c&&c.id===WORLD&&c.active&&context);}
 function stop(){if(timer)root.clearTimeout(timer);timer=0;model.resetClock();}
 function isEditing(){const el=doc.activeElement;return !!(activity.editing||(el&&!el.closest('[data-world-ui]')&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))));}
 function blocked(){return doc.hidden||model.value().paused||mq.matches||activity.reading||isEditing()||activity.audio||media.size>0;}
 function schedule(){stop();if(disposed||!active()||!model.value().auto||blocked())return;model.tick(root.performance.now(),true);timer=root.setTimeout(pulse,250);}
 function pulse(){timer=0;if(disposed||!active()||blocked()){model.resetClock();save();return;}const cur=engine.current();if(cur.paused!==model.value().paused){model.pause(cur.paused);save();labels();}const next=model.tick(root.performance.now(),blocked());if(next)show(next,true);save();if(model.value().auto&&!blocked())timer=root.setTimeout(pulse,250);}
 function labels(){if(!context||!context.panel)return;const l=lang(),t=TEXT[l],s=model.value(),p=context.panel;p.lang=l;p.dir=l==='he'?'rtl':'ltr';context.caption.lang=l;context.caption.dir=p.dir;context.caption.textContent=t.caption;context.controls.setAttribute('aria-label',t.group);context.buttons.forEach((b,i)=>{b.textContent=String(i+1);b.setAttribute('aria-label',t.scene+' '+(i+1)+': '+t.names[i]);b.setAttribute('aria-pressed',s.scene===i+1?'true':'false')});context.auto.textContent=t.auto;context.auto.setAttribute('aria-pressed',s.auto?'true':'false');context.auto.title=s.auto?t.automatic:t.fixed;context.pause.textContent=s.paused?t.resume:t.pause;context.pause.setAttribute('aria-pressed',s.paused?'true':'false');}
 function surface(){const el=context&&context.photo.parentElement,slot=el&&el.getAttribute('data-world-slot');return {'room-stage':'room','studio-stage':'studio','media-stage':'mediatheque'}[slot]||'room';}
 function show(n,transition){if(!active())return false;clearFade();const ctx=context;
  if(transition&&!blocked()){fadeNode=doc.createElement('canvas');fadeNode.width=2048;fadeNode.height=683;fadeNode.getContext('2d').drawImage(ctx.canvas,0,0);fadeNode.style.opacity='1';fadeNode.style.transition='opacity 1000ms linear';fadeNode.setAttribute('aria-hidden','true');ctx.photo.appendChild(fadeNode);fit(ctx);}
  const result=engine.play('scene-'+n+'-'+surface()+'-select');
  if(fadeNode){const fading=fadeNode;void fading.getBoundingClientRect();fading.style.opacity='0';fadeTimer=root.setTimeout(()=>{if(fadeNode===fading)clearFade()},1050);}
  labels();save();return !!result.played;
 }
 function select(n){if(!Number.isInteger(n)||n<1||n>3)return;model.manual(n);show(n,true);stop();labels();save();}
 function setAuto(){model.auto();labels();save();schedule();}
 function setPaused(v){model.pause(v);clearFade();if(active()&&engine.current().paused!==v)engine.togglePause();labels();save();schedule();}
 function panel(){if(!context)return;const stage=context.photo.parentElement;if(context.panel)context.panel.remove();const p=doc.createElement('div');p.className='lp-memorial-panel';p.setAttribute('data-world-ui','');const c=doc.createElement('p');c.className='lp-memorial-caption';c.setAttribute('role','note');const controls=doc.createElement('div');controls.className='lp-memorial-controls';controls.setAttribute('role','group');const buttons=[];
  for(let i=1;i<=3;i++){const b=doc.createElement('button');b.type='button';b.addEventListener('click',()=>select(i));controls.appendChild(b);buttons.push(b)}
  const auto=doc.createElement('button');auto.type='button';auto.addEventListener('click',setAuto);controls.appendChild(auto);const pause=doc.createElement('button');pause.type='button';pause.addEventListener('click',()=>setPaused(!model.value().paused));controls.appendChild(pause);p.appendChild(c);p.appendChild(controls);stage.appendChild(p);Object.assign(context,{panel:p,caption:c,controls,buttons,auto,pause});const native=stage.querySelector('.lp-world-pause');if(native)native.hidden=true;labels();}
 function changed(){const cur=engine.current();restoreEpoch++;if(!cur||cur.id!==WORLD||!cur.active){if(cur&&cur.id===WORLD)model.pause(cur.paused);save();stop();clearFade();context=null;return;}panel();if(cur.paused!==model.value().paused)engine.togglePause();show(model.value().scene,false);labels();schedule();}
 function activityChanged(e){const v=e&&e.detail||{};let changed=false;['reading','editing','audio'].forEach(k=>{if(typeof v[k]==='boolean'&&activity[k]!==v[k]){activity[k]=v[k];changed=true}});if(changed)schedule();}
 function visibility(){clearFade();save();schedule();}
 function mediaEvent(e){if(e.type==='play')media.add(e.target);else media.delete(e.target);schedule();}
 const events=[[doc,'lp-world:changed',changed],[doc,'i18n:changed',labels],[doc,'visibilitychange',visibility],[doc,'focusin',schedule],[doc,'focusout',()=>root.setTimeout(schedule,0)],[doc,'lp-memorial:activity',activityChanged],[doc,'play',mediaEvent,true],[doc,'pause',mediaEvent,true],[doc,'ended',mediaEvent,true],[doc,'close',schedule,true],[root,'pagehide',()=>{save();stop();clearFade()}]];
 events.forEach(([target,name,fn,capture])=>target.addEventListener(name,fn,capture));
 const localeObserver=new root.MutationObserver(labels);localeObserver.observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
 function motion(){clearFade();schedule();}if(mq.addEventListener)mq.addEventListener('change',motion);
 function destroy(){if(disposed)return;disposed=true;save();stop();clearFade();events.forEach(([target,name,fn,capture])=>target.removeEventListener(name,fn,capture));localeObserver.disconnect();if(mq.removeEventListener)mq.removeEventListener('change',motion);if(context&&context.panel)context.panel.remove();style.remove();render.createRenderer=originalCreate;context=null;const current=engine.current();if(current&&current.id===WORLD)engine.set(null);try{delete root.LPMemorialAdapter}catch(_){root.LPMemorialAdapter=null}}
 root.LPMemorialAdapter={select,setAuto,setPaused,setActivity(v){activityChanged({detail:v})},state:()=>model.value(),destroy,refresh(){labels();schedule()},
  debug(){return {state:model.value(),active:active(),blocked:blocked(),scheduled:!!timer,fade:!!fadeNode,draws:context&&context.draws,skips:context&&context.skips,nativeScene:context&&context.scene}},
  advanceForTest(now){const n=model.tick(now,blocked());if(n)show(n,true);return n;}};
 if(root.LPWorldActivity)root.LPWorldActivity.sync();
 if(active())changed();
})(typeof window==='undefined'?null:window);
