#!/usr/bin/env node
'use strict';
// Isolated browser profile: real Room and SQLite, synthetic cross-tab commit notices.
const express=require('express'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const app=express();
 app.use((_q,s,n)=>{s.set('Cross-Origin-Opener-Policy','same-origin');s.set('Cross-Origin-Embedder-Policy','require-corp');n();});
 const version=require('node:fs').readFileSync(path.resolve(__dirname,'../../public/index.html'),'utf8').match(/window.APP_VERSION = "([^"]+)"/)[1];
 app.get('/api/client-config',(_q,s)=>s.json({version,tts:{enabled:false}}));
 app.use('/api',(_q,s)=>s.status(401).json({ok:false}));
 app.use(express.static(path.resolve(__dirname,'../../public')));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  const origin=process.argv.includes('--production')?'https://linguistpro.kolosei.com':'http://127.0.0.1:'+server.address().port,errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/library.html?canon=skip#room=hub');
  await page.locator('.learning-home').waitFor({timeout:60000});
  await page.getByRole('button',{name:/Мои тексты Ваши тексты/}).focus();
  await page.evaluate(()=>{
   window.__hubBefore=document.querySelector('.learning-home');window.__skeletons=0;
   window.__focusBefore=document.activeElement;
   window.__hubObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&(n.matches('.learning-home-loading')||n.querySelector('.learning-home-loading')))window.__skeletons++;});
   window.__hubObserver.observe(document.querySelector('#roomContent'),{childList:true,subtree:true});
  });
  const peer=await context.newPage();await peer.goto(origin+'/typo-test.html');
  await peer.evaluate(async()=>{const channel=new BroadcastChannel('localdb-commits-v2');for(let i=0;i<10;i++){channel.postMessage({changed:true});await new Promise(r=>setTimeout(r,250));}channel.close();});
  await page.waitForTimeout(1000);
  const result=await page.evaluate(()=>({sameHome:window.__hubBefore===document.querySelector('.learning-home'),sameFocus:window.__focusBefore===document.activeElement,skeletons:window.__skeletons}));
  console.log(JSON.stringify(result));
  assert.equal(result.skeletons,0,'external commits must not blank the mounted home');
  assert.equal(result.sameHome,true,'external commits must preserve current controls');
  assert.equal(result.sameFocus,true,'external commits must preserve keyboard focus');
  assert.equal(await page.locator('#roomLibraryChanges').count(),1);
  await page.setViewportSize({width:380,height:844});
  await page.locator('#roomLibraryChanges').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.tmp/room-hub-refresh-mobile.png'});
  await page.locator('#roomLibraryChanges button').click();
  await page.waitForFunction(()=>document.querySelector('.learning-home')&&document.querySelector('.learning-home')!==window.__hubBefore);
  assert.equal(await page.locator('#roomLibraryChanges').count(),0);
  // A real write from another tab must become visible after the explicit refresh.
  await peer.evaluate(async()=>{const db=await import('/db/local-db.js');await db.initLocalDB();await db.createText({id:'hub-refresh-fixture',text_key:'hub:refresh:fixture',title:'Hub refresh fixture',source_text:'שלום',source_meta_json:JSON.stringify({origin:'studio',material_kind:'user_text'})});});
  await page.locator('#roomLibraryChanges').waitFor();
  await page.locator('#roomLibraryChanges button').click();
  await page.waitForFunction(()=>!document.querySelector('#roomLibraryChanges')&&document.querySelector('.learning-home'));
  assert.match(await page.getByRole('button',{name:/Мои тексты Ваши тексты/}).innerText(),/1 текст/);
  assert.deepEqual(errors,[]);
  console.log('PASS: 10 cross-tab notices, stable home, one explicit refresh, no page errors');
 } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
