"use strict";
// Real Studio/Room + isolated OPFS. Fake only the external YouTube API, including
// its cued zero clock and native-control Play; no network video or owner data.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {fork} = require('node:child_process');
const {chromium} = require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer} = require('../smoke-server-env');
const ROOT=path.resolve(__dirname,'../..');
async function main(){
 const server=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:ROOT,env:smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(),'lp-yt-resume-')),0),silent:true,windowsHide:true});
 let browser;
 try{
  const base='http://127.0.0.1:'+await waitForSmokeServer(server,30000);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'}), errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await context.route('**/js/library-ui.js?*',async route=>{
   const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__resumeTest={openReader,rerenderReader};'});
  });
  await context.addInitScript(()=>{
   if(!['http:','https:'].includes(location.protocol))return;
   localStorage.setItem('app.locale','ru');localStorage.setItem('phase6Decision_v1','declined');
   window.__ytPlayers=[];
   window.YT={Player:function(iframe,opts){
    this.time=0;this.state=-1;this.cues=[];this.plays=0;this.destroyed=false;
    this.getCurrentTime=()=>this.time;this.getPlayerState=()=>this.state;this.getOption=()=>[];
    this.cueVideoById=spec=>{this.target=spec.startSeconds;this.cues.push(spec);this.state=5;opts.events.onStateChange({data:5});};
    this.playVideo=()=>{this.plays++;this.state=1;opts.events.onStateChange({data:1});setTimeout(()=>{this.time=this.target||0;},80);};
    this.pauseVideo=()=>{this.state=2;opts.events.onStateChange({data:2});};
    this.seekTo=t=>{this.time=t;};this.destroy=()=>{this.destroyed=true;};
    window.__ytPlayers.push(this);setTimeout(()=>opts.events.onReady(),150);
   }};
  });
  const studio=await context.newPage();await studio.goto(base+'/?localMode=1',{waitUntil:'domcontentloaded'});
  await studio.waitForFunction(()=>window.__localDB?.isReady(),null,{timeout:45000});
  await studio.evaluate(async()=>{
   for(const id of ['yt-resume-A','yt-resume-B']){
    const rows=Array.from({length:40},(_,i)=>({id:id+'-'+i,he_plain:'שלום עולם',he:'שלום עולם',ru:id+' row '+i,order_index:i}));
    const audio={v:1,video:{videoId:'iG9CE55wbtY'},segments:rows.map((r,i)=>({i,start:i*4+.25,end:i*4+3,text:r.he_plain})),timing:{v:1,unit:'row',entries:rows.map((r,i)=>({o:i,t:i*4+.25,end:i*4+3}))}};
    await __localDB.createText({id,text_key:id,title:id,source_text:rows.map(r=>r.he_plain).join('\n'),table_model_meta_json:JSON.stringify({source:{audio}})});
    await __localDB.addSentences(id,rows);await __localDB.setProgress(id,{last_row_idx:id.endsWith('A')?12:24,last_step_id:'ru'});
   }
  });
  async function verify(page,id,row,surface){
   await page.waitForFunction(()=>window.__ytPlayers.some(p=>!p.destroyed&&p.cues.length),null,{timeout:30000});
   await page.waitForFunction(({target})=>window.__ytPlayers.filter(p=>!p.destroyed).at(-1)?.target===target,{target:row*4+.25},{timeout:10000});
   await page.waitForTimeout(400);
   const before=await page.evaluate(async id=>({progress:(await __localDB.getProgress(id)).last_row_idx,player:window.__ytPlayers.filter(p=>!p.destroyed).at(-1).plays,review:JSON.stringify(await __localDB.dbQuery('SELECT * FROM review_log'))}),id);
   assert.equal(before.progress,row);assert.equal(before.player,0,'no autoplay');
   await page.evaluate(()=>window.__ytPlayers.filter(p=>!p.destroyed).at(-1).playVideo());
   await page.waitForTimeout(700);
   assert.equal(await page.evaluate(async id=>(await __localDB.getProgress(id)).last_row_idx,id),row);
   assert.equal(await page.evaluate(async()=>JSON.stringify(await __localDB.dbQuery('SELECT * FROM review_log'))),before.review);
   const selected=surface==='room'?'#roomReaderTable tr.rm-row-current':'#proTable tr.smk-row-active';
   await page.locator(selected+'[data-row-idx="'+row+'"]').waitFor();
   console.log('PASS '+surface+' '+id+' row '+(row+1));
  }
  await studio.evaluate(()=>v3LibraryOpenText('yt-resume-A',{resume:true}));await verify(studio,'yt-resume-A',12,'classic');
  await studio.reload({waitUntil:'domcontentloaded'});await verify(studio,'yt-resume-A',12,'classic reload');
  const fresh=await context.newPage();await fresh.goto(base+'/?localMode=1',{waitUntil:'domcontentloaded'});await verify(fresh,'yt-resume-A',12,'classic new tab');
  await fresh.close();
  await studio.evaluate(async()=>{v3IdeApplyMode(true,'yt-resume-A');await v3IdeOpenTextInCenter('yt-resume-B');});await verify(studio,'yt-resume-B',24,'ide');
  await studio.evaluate(async()=>{const a=v3LibraryOpenText('yt-resume-A',{resume:true});const b=v3LibraryOpenText('yt-resume-B',{resume:true});await Promise.all([a,b]);});await verify(studio,'yt-resume-B',24,'studio rapid A-B');
  const room=await context.newPage();await room.goto(base+'/library.html?my_text=yt-resume-A',{waitUntil:'domcontentloaded'});await verify(room,'yt-resume-A',12,'room');
  await room.reload({waitUntil:'domcontentloaded'});await verify(room,'yt-resume-A',12,'room reload');
  await room.evaluate(async()=>{await __resumeTest.openReader('yt-resume-B','',{resume:true});});await verify(room,'yt-resume-B',24,'room switch');
  const cuesBefore=await room.evaluate(()=>window.__ytPlayers.filter(p=>!p.destroyed).at(-1).cues.length);
  await room.evaluate(()=>__resumeTest.rerenderReader());
  await room.waitForTimeout(350);
  assert.equal(await room.evaluate(()=>window.__ytPlayers.filter(p=>!p.destroyed).at(-1).cues.length),cuesBefore,'rerender preserves player position');
  console.log('PASS room rerender retains player and does not cue again');
  assert.deepEqual(errors,[]);console.log('PASS no page errors, unchanged review_log, isolated fixtures');
 }finally{await browser?.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
