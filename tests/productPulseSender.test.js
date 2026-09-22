"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const {webcrypto}=require("node:crypto");
const {normalizeEvent}=require("../product-pulse/contract");
async function fixture(options={}) {
  let time=Date.parse("2026-09-22T10:00:00Z");const events=[],handlers={},timers=[];
  const doc={visibilityState:"visible",readyState:"complete",hasFocus:()=>true,addEventListener:(name,fn)=>(handlers[name]||=[]).push(fn)};
  class Clock extends Date {constructor(...a){super(...(a.length?a:[time]));}static now(){return time;}}
  const root={addEventListener:doc.addEventListener},nav={onLine:true,webdriver:false};
  vm.runInNewContext(fs.readFileSync("public/js/product-telemetry.js","utf8"),{window:root,document:doc,location:{hostname:"app.test",pathname:options.pathname||"/library.html",search:options.search||""},URLSearchParams,navigator:nav,sessionStorage:{setItem(){}},crypto:webcrypto,Date:Clock,fetch:async(url,opts)=>{if(opts&&opts.body)events.push(JSON.parse(opts.body));return{ok:true,json:async()=>url.includes("client-config")?{version:"3.11.606"}:{collect:true}};},setInterval:fn=>timers.push(fn)});
  await new Promise(r=>setImmediate(r));
  return {events,doc,root,nav,advance:ms=>{time+=ms;timers.forEach(fn=>fn());},dispatch:(name,event)=>handlers[name]?.forEach(fn=>fn(event)),now:()=>time};
}
test("idle before first action, hidden tabs, idle cutoff and repeated actions",async()=>{
  const f=await fixture(),interaction={isTrusted:true,target:{closest:()=>true}};
  f.advance(60000);assert.deepEqual(f.events.map(x=>x.event_name),["app_open"]);
  f.dispatch("pointerdown",interaction);assert.equal(f.events.at(-1).event_name,"study_started");assert.equal(f.events.length,2);
  f.advance(60000);assert.equal(f.events.length,2); // only 15s credited
  f.doc.visibilityState="hidden";f.dispatch("visibilitychange");f.dispatch("keydown",interaction);f.advance(60000);assert.equal(f.events.length,2);
  f.doc.visibilityState="visible";f.dispatch("visibilitychange");f.dispatch("keydown",interaction);f.advance(15000);assert.equal(f.events.at(-1).event_name,"study_engaged");
  f.dispatch("keydown",interaction);f.advance(30000);assert.equal(f.events.length,3);
  f.events.forEach(e=>assert.equal(normalizeEvent(e,f.now()).ok,true));
});
test("non-study and untrusted actions cannot start, audio seek cannot manufacture engagement",async()=>{
  const f=await fixture();f.dispatch("pointerdown",{isTrusted:false,target:{closest:()=>true}});f.dispatch("pointerdown",{isTrusted:true,target:{closest:()=>false}});assert.equal(f.events.length,1);
  const media={tagName:"AUDIO",currentSrc:"private-media-url",currentTime:0,paused:false,seeking:false,readyState:4,playbackRate:1};
  f.dispatch("timeupdate",{target:media});f.advance(1000);media.currentTime=120;f.dispatch("seeking",{target:media});f.dispatch("timeupdate",{target:media});assert.equal(f.events.length,1);
  for(let i=0;i<9;i++){f.advance(1000);media.currentTime++;f.dispatch("timeupdate",{target:media});}
  assert.equal(f.events.filter(x=>x.event_name==="audio_engaged").length,1);
  media.currentTime=0;f.dispatch("seeking",{target:media});for(let i=0;i<12;i++){f.advance(1000);media.currentTime++;f.dispatch("timeupdate",{target:media});}
  assert.equal(f.events.filter(x=>x.event_name==="audio_engaged").length,1);assert.equal(JSON.stringify(f.events).includes("private-media-url"),false);
});
test("new documents/tabs have distinct IDs and offline drops do not retry",async()=>{
  const a=await fixture(),b=await fixture();assert.notEqual(a.events[0].session_id,b.events[0].session_id);
  a.nav.onLine=false;assert.equal(await a.root.ProductTelemetry.emit("material_open",{surface:"reading_room",media_kind:"text"}),false);
  a.nav.onLine=true;a.advance(60000);assert.equal(a.events.length,1);
});
test("confirmed materials create independent privacy-safe material engagement segments",async()=>{
  const f=await fixture({search:"?from=mediatheque&public_work=private-id"}),interaction={isTrusted:true,target:{closest:()=>true}};
  const privateText={title:"private title",source_meta_json:JSON.stringify({public_corpus:{slug:"study-songs",public_work_id:"private-id"},note:"private note"})};
  await f.root.ProductTelemetry.confirmMaterialOpen({text:privateText,media:{known:true,hasAudio:true,hasVideo:false}});
  f.dispatch("pointerdown",interaction);f.advance(15000);f.dispatch("keydown",interaction);f.advance(15000);
  await f.root.ProductTelemetry.confirmMaterialOpen({text:{source_meta_json:JSON.stringify({corpus:{author:"private author"}})},media:{known:true,hasAudio:false,hasVideo:false}});
  f.dispatch("pointerdown",interaction);f.advance(15000);f.dispatch("keydown",interaction);f.advance(15000);
  const names=f.events.map(x=>x.event_name);assert.equal(names.filter(x=>x==="material_open").length,2);assert.equal(names.filter(x=>x==="material_started").length,2);assert.equal(names.filter(x=>x==="material_engaged").length,2);assert.equal(names.filter(x=>x==="study_started").length,1);assert.equal(names.filter(x=>x==="study_engaged").length,1);
  const first=f.events.find(x=>x.event_name==="material_open");assert.deepEqual({...first.properties},{surface:"reading_room",entry_point:"mediatheque",material_collection:"public_study_songs",material_media:"audio",media_kind:"text"});
  assert.equal(JSON.stringify(f.events).includes("private"),false);f.events.forEach(e=>assert.equal(normalizeEvent(e,f.now()).ok,true));
});
test("Studio material confirmation uses the Studio library route and closed corpus/media enums",async()=>{
  const f=await fixture({pathname:"/index.html"});
  await f.root.ProductTelemetry.confirmMaterialOpen({text:{id:"private-id",source_meta_json:JSON.stringify({public_corpus:{slug:"materials-science-year1-problem-book-2"}})},media:{known:true,hasAudio:true,hasVideo:true}});
  const opened=f.events.find(x=>x.event_name==="material_open");
  assert.deepEqual({...opened.properties},{surface:"studio",entry_point:"studio_library",material_collection:"materials_science_pb2",material_media:"audio_video",media_kind:"text"});
  assert.equal(JSON.stringify(opened).includes("private-id"),false);assert.equal(normalizeEvent(opened,f.now()).ok,true);
});
