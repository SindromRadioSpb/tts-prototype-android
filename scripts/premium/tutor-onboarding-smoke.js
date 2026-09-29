#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const express=require('express'),sqlite3=require('sqlite3'),{chromium}=require('playwright');
const {createStore}=require('../../agent/tutor/store'),{createRollout}=require('../../agent/tutor/rollout'),{installRoutes}=require('../../agent/tutor/routes');
(async()=>{
 const db=new sqlite3.Database(':memory:');await new Promise((r,j)=>db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('A'),('B');"+['070_tutor_transport','071_tutor_practice','072_tutor_onboarding'].map(f=>fs.readFileSync('migrations/'+f+'.sql','utf8')).join('\n'),e=>e?j(e):r()));
 await new Promise((r,j)=>db.run("INSERT INTO tutor_rollout VALUES('A',?,'fixture',?)",[Date.now()+600000,Date.now()],e=>e?j(e):r()));
 const gate=createRollout(()=>db,{}),store=createStore(()=>db,Date.now,gate.allowed),app=express();app.use(express.json({limit:'40kb'}));
 let user='A';const auth=()=>user?{user:{id:user},session:{csrf:'fixture'}}:null;
 app.get('/api/auth/me',(_q,s)=>s.json({user:auth()?.user,csrf:'fixture'}));
 installRoutes(app,{store,enabled:gate.enabled,capability:()=>gate.allowed(user),requireUser:async(_q,s)=>{if(!auth()){s.status(401).json({error:'UNAUTHENTICATED'});return null;}return auth();},requireCsrf:(q,s)=>{if(q.get('X-LP-CSRF')!=='fixture'){s.status(403).json({error:'BAD_CSRF'});return false;}return true;},limiter:(_q,_s,n)=>n()});
 app.use(express.static('public'));const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));const shots='docs/research/mentor-byoa/2026-09-29/m3-screenshots';fs.mkdirSync(shots,{recursive:true});
 try{
  const e=await store.enroll({client_nonce:'n'.repeat(43),device_name:'Hermes on Windows'});
  await page.goto(origin+'/tutor-connect.html#connect='+e.user_code);
  await page.getByRole('heading',{name:'Подтвердите подключение',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Подключить этого агента',exact:true}).isDisabled(),true);
  await page.screenshot({path:path.join(shots,'approve-desktop.png')});await page.setViewportSize({width:380,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Подключить этого агента',exact:true}).click();
  await page.getByText('Подтверждено. Ожидаем соединения помощника…',{exact:true}).waitFor();
  const conn=await store.enrollmentPoll({device_code:e.device_code,client_nonce:'n'.repeat(43)});await store.next(conn.token);
  await page.getByRole('heading',{name:'Наставник подключён',exact:true}).waitFor({timeout:10000});
  await page.screenshot({path:path.join(shots,'connected-mobile.png')});
  await page.getByRole('button',{name:'Отозвать подключение',exact:true}).click();
  await page.getByText('Подключение отозвано. Новые вопросы этому агенту больше не передаются.',{exact:true}).waitFor();
  await assert.rejects(store.next(conn.token),e=>e.code==='connection_required');
  await page.locator('#language').selectOption('he');await page.getByRole('heading',{name:'חיבור הסוכן האישי',exact:true}).waitFor();
  await page.screenshot({path:path.join(shots,'setup-he-mobile.png')});
  user='B';await page.reload();await page.getByRole('heading',{name:'השקה מוגבלת',exact:true}).waitFor();
  user=null;await page.reload();await page.getByRole('heading',{name:'כניסה ל־LinguistPro',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['approval_consent','browser_enrollment','connected','revoke','cross_user_rollout','signed_out','380_RTL'],pageErrors:errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
