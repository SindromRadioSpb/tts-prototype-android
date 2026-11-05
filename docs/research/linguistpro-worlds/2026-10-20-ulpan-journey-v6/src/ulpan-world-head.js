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
