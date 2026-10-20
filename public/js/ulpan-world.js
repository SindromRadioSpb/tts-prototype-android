/* App-owned painter for ulpan-journey. Data/assets stay in the declarative pack.
 * Uses the native world's route, picker, pause, bubbles and host activity bridge.
 * No independent timer, network, learner data, audio or automatic dialogue.
 */
(function(root) {
 'use strict';
 if (root.LPUlpanWorld) return;
 const original = root.LPWorldRender.createRenderer;
 const activity = { reading:false, audio:false };
 const mq = root.matchMedia('(prefers-reduced-motion: reduce)');
 const LABELS = {ru:{hero:'Человек-паук',timsah:'Тимсах',seller:'Продавец',master:'Мастер',teacher:'Учитель'},en:{hero:'Spider-Man',timsah:'Timsah',seller:'Seller',master:'Craftsman',teacher:'Teacher'},he:{hero:'ספיידרמן',timsah:'תמסח',seller:'מוכר',master:'בעל המלאכה',teacher:'מורה'}};
 root.LPUlpanWorld = { setActivity(value) { Object.assign(activity,value); } };
 root.LPWorldRender.createRenderer = function(canvas, opts) {
  if (opts.pack.id !== 'ulpan-journey') return original(canvas,opts);
  const ctx = canvas.getContext('2d'), parent=canvas.parentElement;
  const isStage=parent.hasAttribute('data-world-slot');
  const assets={atlas:{clips:opts.pack.ulpan.heroClips}}, story=opts.pack.ulpan.story;
  const map={hero:'hero.png',timsah:'timsah.png',timsahAct:'timsah-act.png',cat:'cat.png',people:'people.png',trainInterior:'train-interior.png',coast:'coastal-panorama.png',heroSeated:'hero-seated.png',timsahLeisure:'timsah-leisure.png'};
  for(const scene of story)if(scene.id!=='travel')map[scene.id]='scene-'+scene.id+'.png';
  const images={}; for(const [key,file]of Object.entries(map))images[key]=opts.images[file];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ease=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
  let index=0,elapsed=3,cam=0,cssW=380,engineScale=2,light='day',reduced=mq.matches,disposed=false,dirty=true;
  let speech=null,anchorActor='timsah',lastLocale='';const cursors={},buttons=new Map();
  function getState(){
   const scene=story[index],local=elapsed,walking=!reduced&&scene.arrival&&local<2.4;
   const heroX=walking?218+52*ease(local/2.4):270,timsahX=walking?heroX+70:340;
   const pose=speech?speech.beat.pose:'idle',lineTime=speech?Math.max(0,local-speech.started):local;
   let clip='idle';if(walking)clip='walk';else if(!reduced&&['map','note'].includes(pose))clip='map';else if(!reduced&&speech&&speech.beat.who==='hero'&&pose==='greet'&&lineTime<3)clip='greet';
   return {id:scene.id,local,lineTime,walking,heroX,timsahX,pose,clip,speaker:speech?speech.beat.who:''};
  }
  function shadow(x, y, width) {
    ctx.fillStyle = '#091b2a55'; ctx.beginPath(); ctx.ellipse(x, y, width, 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  function frame(image, sx, sy, sw, sh, x, feet, width, height, flip = false, tilt = 0) {
    ctx.save(); ctx.translate(Math.round(x), feet); if (flip) ctx.scale(-1, 1); ctx.rotate(tilt);
    ctx.drawImage(image, sx, sy, sw, sh, -width / 2, -height, width, height); ctx.restore();
  }
  function hero(s) {
    const frames = assets.atlas.clips[s.clip];
    const phase = s.clip === 'walk' ? (s.local * .85) % 1 : s.clip === 'greet' ? clamp(s.lineTime / 2.4, 0, .999) : (s.local * .18) % 1;
    const f = frames[reduced ? 0 : Math.min(frames.length - 1, Math.floor(phase * frames.length))];
    shadow(s.heroX, 221, 11);
    // Gentle weight shift anchored at the feet; no vertical bounce or invented rig.
    const tilt = reduced || s.walking ? 0 : Math.sin(s.local * .85) * .008;
    frame(images.hero, f.x, f.y, 96, 96, s.heroX, 227, 96, 96, false, tilt);
  }
  function timsah(s) {
    shadow(s.timsahX, 221, 12);
    if (!reduced && !s.walking && ['map', 'note'].includes(s.pose)) {
      const page = s.lineTime % 4 > 3.1 ? 1 : 0;
      frame(images.timsahAct, page * 31, 0, 30, 41, s.timsahX, 223, 43, 59, true);
    } else if (!reduced && !s.walking && s.pose === 'laugh' && s.lineTime < 2.5) {
      frame(images.timsahLeisure, 87, 0, 28, 36, s.timsahX, 223, 43, 55, true);
    } else {
      const n = s.walking ? (Math.floor(s.local * 4) % 2 ? 3 : 2) : !reduced && s.local % 5.3 > 5.1 ? 1 : 0;
      const nod = reduced || s.walking ? 0 : Math.sin(s.lineTime * 2) * .012 * Math.max(0, 1 - s.lineTime / 2);
      frame(images.timsah, n * 32, 0, 31, 42, s.timsahX, 223, 43, 59, !s.walking, nod);
    }
  }
  function person(x, feet, scale, variant, walking, local, flip = false, talking = false) {
    const n = walking && !reduced ? Math.floor(local * 3.5) % 2 : 0;
    shadow(x, feet, 8 * scale);
    const tilt = talking && !reduced ? Math.sin(local * 1.8) * .018 : 0;
    frame(images.people, variant * 50 + n * 25, 0, 24, 44, x, feet, 24 * scale, 44 * scale, flip, tilt);
  }
  function cat(s, side, feet = 213) {
    const start = side === 'left' ? 42 : 594, end = side === 'left' ? 138 : 507;
    const travel = reduced ? 1 : (1 - Math.cos(s.local * Math.PI / 18)) / 2;
    const x = start + (end - start) * travel;
    const walking = !reduced && Math.abs(Math.sin(s.local * Math.PI / 18)) > .12;
    const n = walking ? Math.floor(s.local * 5) % 2 : 2;
    shadow(x, feet, 8);
    frame(images.cat, n * 18, 0, 17, 18, x, feet + 2, 23, 25, side === 'right' !== (!reduced && Math.sin(s.local * Math.PI / 18) < 0));
  }
  function ambient(s) {
    const p = reduced ? .65 : (1 - Math.cos(s.local * Math.PI / 22)) / 2;
    switch (s.id) {
      case 'promenade':
        person(443 + 140 * p, 191, .82, 0, !reduced && p < 1, s.local);
        cat(s, 'left', 211); break;
      case 'market':
        person(124, 164, .9, 1, false, s.local, false, s.speaker === 'seller');
        person(581 - 123 * p, 190, .85, 0, !reduced && p < 1, s.local, true);
        cat(s, 'left', 215); break;
      case 'workshop':
        person(150, 187, 1.1, 1, false, s.local, false, s.speaker === 'master');
        // A moving sheet, drawn as a prop over the unchanged bench background.
        ctx.fillStyle = '#e8d8ab'; ctx.save(); ctx.translate(150, 161);
        ctx.rotate(reduced ? 0 : Math.sin(s.local * .6) * .08); ctx.fillRect(-6, -3, 12, 8); ctx.restore(); break;
      case 'jaffa':
        person(483 + 93 * p, 186, .74, 1, !reduced && p < 1, s.local);
        cat(s, 'left', 205); break;
      case 'reading':
        person(452, 186, .95, 0, false, s.local, true, s.speaker === 'teacher');
        // Reader at the left; a small page turn rather than street traffic indoors.
        person(120, 194, .88, 1, false, s.local);
        ctx.fillStyle = '#f3dfaf'; ctx.fillRect(109, 169, 22, 9);
        ctx.fillStyle = '#8c7252'; ctx.fillRect(120 + (!reduced && s.local % 7 > 6 ? 4 : 0), 169, 1, 9); break;
      case 'cinema':
        person(487 + 48 * p, 181, .82, 0, !reduced && p < 1, s.local);
        cat(s, 'right', 207); break;
    }
  }
  function panorama(image, t, speed, source, dest) {
    const offset = (t * speed) % 1280;
    // Alternating mirrored tiles meet at identical edge pixels, even on long scenes.
    // The train moves continuously forward; no resetting the eight-second v5 strip.
    for (let k = -2; k < 5; k++) {
      const x = k * 640 + 150 - offset;
      ctx.save(); ctx.translate(x + (Math.abs(k) % 2 ? 640 : 0), 0);
      if (Math.abs(k) % 2) ctx.scale(-1, 1);
      ctx.drawImage(image, ...source, 0, dest[0], 640, dest[1]); ctx.restore();
    }
  }
  function travel(s) {
    ctx.drawImage(images.trainInterior, 0, 0, 640, 228);
    ctx.save(); ctx.beginPath();
    for (const w of [[183, 29, 122, 80], [335, 29, 122, 80]]) ctx.roundRect(...w, 4);
    ctx.clip();
    const movement = reduced ? 3 : s.local % 120;
    panorama(images.coast, movement, 21, [0, 0, images.coast.width, images.coast.height], [-18, 213]);
    ctx.save(); ctx.beginPath(); ctx.rect(180, 96, 280, 15); ctx.clip();
    panorama(images.coast, movement, 39, [0, 285, 1280, 141], [93, 42]); ctx.restore();
    ctx.fillStyle = '#ffdf9910'; ctx.fillRect(180, 29, 280, 80); ctx.restore();
    // Existing seated pose with a subtle anchored lean, not a new skeletal cycle.
    ctx.save(); ctx.translate(141, 214); ctx.rotate(reduced ? 0 : Math.sin(s.local * .7) * .004);
    ctx.drawImage(images.heroSeated, -96, -186, 192, 192); ctx.restore();
    const n = reduced ? 0 : s.pose === 'laugh' && s.lineTime < 2.5 ? 3 : s.local % 7 > 6 ? 1 : 0;
    frame(images.timsahLeisure, n * 29, 0, 28, 36, 502, 178, 84, 108, true);
  }
  function sceneSign(label) {
    ctx.save(); ctx.font = 'bold 18px Arial';
    const width = Math.ceil(ctx.measureText(label).width) + 20;
    const height = 36, x = Math.round(501 - width / 2), y = 63;
    ctx.fillStyle = '#173b47'; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#dfba76'; ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
    ctx.strokeStyle = '#a6824d'; ctx.strokeRect(x + 3.5, y + 3.5, width - 7, height - 7);
    // Small stepped corners and diamond inlays: geometric Eastern ornament.
    ctx.strokeStyle = '#f3d79b';
    for (const [cx, cy, sx, sy] of [[x,y,1,1],[x+width,y,-1,1],[x,y+height,1,-1],[x+width,y+height,-1,-1]]) {
      ctx.beginPath(); ctx.moveTo(cx + sx * 2, cy + sy * 8);
      ctx.lineTo(cx + sx * 6, cy + sy * 8); ctx.lineTo(cx + sx * 6, cy + sy * 6);
      ctx.lineTo(cx + sx * 8, cy + sy * 6); ctx.lineTo(cx + sx * 8, cy + sy * 2); ctx.stroke();
    }
    for (const cy of [y + 3, y + height - 3]) {
      ctx.fillStyle = '#dfba76'; ctx.beginPath(); ctx.moveTo(501, cy - 2);
      ctx.lineTo(503, cy); ctx.lineTo(501, cy + 2); ctx.lineTo(499, cy); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#f7d389'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillText(label, 501, y + 24); ctx.restore();
  }
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
