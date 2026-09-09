'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3336';
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const ctx=await b.newContext(),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('localMode','1');localStorage.setItem('v3OnboardingSeenV1','1');localStorage.setItem('v3.byokOnboardingDismissed','1');localStorage.setItem('v3.byokTourCompleted','1');});
 await p.goto(origin+'/index.html',{waitUntil:'load'});await p.evaluate(async()=>{await navigator.serviceWorker.ready;await ensureLocalDB();});
 if(!await p.evaluate(()=>!!navigator.serviceWorker.controller))await p.reload({waitUntil:'load'});
 const id='inline-offline-'+Date.now();
 await p.evaluate(async id=>{const db=await ensureLocalDB();await db.createText({id,text_key:id,title:'Offline same-database probe',source_text:'שלום'});await db.addSentences(id,[{id:id+'-row',he_plain:'שלום',ru:'Привет'}]);},id);
 const results=[];
 for(const path of ['/study-studio.html','/study-library.html']){
   const response=await p.goto(origin+path,{waitUntil:'load'});assert.equal(response.headers()['cross-origin-embedder-policy'],undefined);
   await p.evaluate(async()=>{const db=window.__localDB || await ensureLocalDB();await db.initLocalDB();});
   await ctx.setOffline(true);await p.reload({waitUntil:'load'});
   const state=await p.evaluate(async id=>{const db=window.__localDB || await ensureLocalDB();await db.initLocalDB();return {isolated:crossOriginIsolated,card:!!(await db.getTextById(id)),rows:(await db.getSentences(id)).length,vfs:db.getVfsInfo(),controlled:!!navigator.serviceWorker.controller};},id);
   assert.equal(state.isolated,false);assert.equal(state.card,true);assert.equal(state.rows,1);assert.equal(state.controlled,true);assert.equal(state.vfs.name,'AccessHandlePool');results.push({path,...state});await ctx.setOffline(false);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,results,errors}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
