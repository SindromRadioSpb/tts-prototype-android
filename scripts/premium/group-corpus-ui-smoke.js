#!/usr/bin/env node
"use strict";

const path=require("path"),fs=require("fs");
const {spawn,spawnSync}=require("child_process");
const pw=require("playwright");
const ROOT=path.resolve(__dirname,"..",".."),PORT=3299,BASE=`http://127.0.0.1:${PORT}`;
const OUT=path.join(ROOT,".tmp","group-corpus-ui");
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
function start(){const c=spawn(process.execPath,["server.js"],{cwd:ROOT,env:{...process.env,PORT:String(PORT)},stdio:["ignore","pipe","pipe"]});const logs=[];c.stdout.on("data",(x)=>logs.push(String(x)));c.stderr.on("data",(x)=>logs.push(String(x)));return{c,logs};}
async function stop(c){if(!c||c.killed)return;c.kill("SIGTERM");const done=await new Promise((r)=>{const t=setTimeout(()=>r(false),5000);c.once("exit",()=>{clearTimeout(t);r(true);});});if(!done&&process.platform==="win32")spawnSync("taskkill",["/PID",String(c.pid),"/T","/F"],{stdio:"ignore"});}
async function ready(){for(let i=0;i<80;i++){try{if((await fetch(BASE+"/healthz")).ok)return true;}catch(_){}await sleep(200);}return false;}
const corpus={corpus_id:"fixture-corpus",slug:"study-songs",title:"Учебные песни",version:1,status:"PILOT",visibility:"GROUP_RESTRICTED",rights_basis:"EDUCATIONAL_GROUP_RESTRICTED_REVIEW_REQUIRED",role:"OWNER"};
const works=[
 {work_id:"song-1",text_key:"song-key-1",position_no:1,title:"אושר כהן - כולם גנבים",artist:"אושר כהן",rows_count:42,audio_count:42,audio_revision:1,tags:["hitlist.mako"],topic:"שירים"},
 {work_id:"song-2",text_key:"song-key-2",position_no:2,title:"בן צור - אהבת השם",artist:"בן צור",rows_count:34,audio_count:20,audio_revision:1,tags:["hitlist.mako"],topic:"שירים"},
 {work_id:"song-3",text_key:"song-key-3",position_no:3,title:"עומר אדם - רק שלך",artist:"עומר אדם",rows_count:58,audio_count:0,audio_revision:1,tags:[],topic:"שירים"},
];
(async()=>{fs.mkdirSync(OUT,{recursive:true});const srv=start();if(!await ready()){console.error(srv.logs.join(""));throw new Error("server failed");}const b=await pw.chromium.launch({headless:true});const failures=[];const ok=(v,m)=>{if(!v)failures.push(m);};
 try{const ctx=await b.newContext({serviceWorkers:"block",viewport:{width:380,height:844}});const pg=await ctx.newPage();const errors=[];pg.on("pageerror",(e)=>errors.push(String(e)));
  await pg.addInitScript(()=>{Object.defineProperty(navigator,"share",{value:undefined,configurable:true});Object.defineProperty(navigator,"clipboard",{value:{writeText:async(v)=>{window.__copied=v;}},configurable:true});});
  await pg.route("**/api/group-corpora**",async(route)=>{const u=new URL(route.request().url());if(u.pathname==="/api/group-corpora")return route.fulfill({json:{ok:true,schema_version:"group_corpora.1.0.0",corpora:[{...corpus,works_count:3}]}});if(u.pathname==="/api/group-corpora/fixture-corpus/works")return route.fulfill({json:{ok:true,schema_version:"group_corpus_catalog.1.0.0",corpus,works}});return route.fulfill({status:404,json:{ok:false}});});
  await pg.goto(BASE+"/library.html?canon=skip",{waitUntil:"load"});await pg.waitForFunction(()=>{const t=document.getElementById("tabCorpus");return t&&!t.hidden;},{timeout:20000});
  await pg.evaluate(async()=>{const db=await import("/db/local-db.js");await db.createText({id:"song-local-1",text_key:"song-key-1",title:"אושר כהן - כולם גנבים",source_text:"fixture"});for(let i=0;i<42;i++)await db.addSentence("song-local-1",{id:"song-s-"+i,order_index:i,he_plain:"אב",ru:"тест"});await db.setProgress("song-local-1",{last_row_idx:20,last_step_id:null});await db.touchOpened("song-local-1");});
  await pg.click("#tabCorpus");await pg.waitForSelector('.hub-card[data-corpus="group:fixture-corpus"]',{timeout:15000});await pg.click('.hub-card[data-corpus="group:fixture-corpus"]');await pg.waitForSelector(".group-corpus-grid .group-work-card",{timeout:10000});
  let s=await pg.evaluate(()=>({cards:document.querySelectorAll(".group-work-card").length,admin:document.querySelectorAll(".group-admin-action").length,cont:document.querySelectorAll(".group-action.primary").length,selects:document.querySelectorAll(".group-corpus-controls select").length,smart:document.querySelectorAll(".group-corpus-smart [data-smart]").length,progress:(document.querySelector(".group-progress-label")||{}).textContent||""}));
  ok(s.cards===3,"expected 3 cards");ok(s.admin===4,"owner backup header must have 4 actions");ok(s.cont===1,"materialized text must show Continue");ok(s.selects===3,"expected status/audio/sort filters");ok(s.smart===8,"expected Studio-parity smart filters");ok(/50%/.test(s.progress),"progress overlay should be 50%, got "+s.progress);
  await pg.selectOption('.group-corpus-controls select[aria-label="Аудио"]','partial');await sleep(100);ok((await pg.locator(".group-work-card").count())===1,"partial-audio filter failed");await pg.selectOption('.group-corpus-controls select[aria-label="Аудио"]','all');
  await pg.fill(".group-corpus-search","עומר");await sleep(250);ok((await pg.locator(".group-work-card").count())===1,"search failed");await pg.fill(".group-corpus-search","");await sleep(250);
  ok(await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"mobile layout has horizontal page overflow");
  await pg.screenshot({path:path.join(OUT,"group-corpus-380-light.png"),fullPage:true});await pg.evaluate(()=>document.body.classList.add("theme-dark"));await pg.screenshot({path:path.join(OUT,"group-corpus-380-dark.png"),fullPage:true});await pg.evaluate(()=>document.body.classList.remove("theme-dark"));
  await pg.setViewportSize({width:1280,height:900});await pg.screenshot({path:path.join(OUT,"group-corpus-1280.png"),fullPage:true});
  await pg.locator(".group-work-card").first().locator(".group-action.quiet").click();await sleep(50);const copied=await pg.evaluate(()=>window.__copied||"");ok(/group_corpus=fixture-corpus/.test(copied)&&/group_work=song-1/.test(copied),"protected deep link missing ids");ok(!errors.length,"page errors: "+errors.join(" | "));
 }finally{await b.close();await stop(srv.c);}if(failures.length){for(const f of failures)console.error("  ✗ "+f);process.exit(1);}console.log("group-corpus-ui-smoke: PASS @380/@1280 → "+path.relative(ROOT,OUT));
})().catch((e)=>{console.error(e&&e.stack||e);process.exit(1);});
