'use strict';
// Separate actual-SW evidence. Corrupt only this disposable profile's immutable cache.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),{chromium}=require('playwright');
const E=require('../../public/js/atlas-edition'),{smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const [dataArg,outArg]=process.argv.slice(2),out=path.resolve(outArg),root=path.resolve(__dirname,'../..');fs.mkdirSync(out,{recursive:true});let child,browser;
const report={scope:'actual local SW, fresh disposable profile; no production or owner data',checks:[],errors:[]};
(async()=>{try{
 child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(path.resolve(dataArg),0),silent:true,windowsHide:true});child.stdout.pipe(fs.createWriteStream(path.join(out,'server.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'server-error.log')));
 const base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);await waitForSmokeHealth(base,{timeoutMs:60000});report.origin=base;
 browser=await chromium.launchPersistentContext(path.join(out,'synthetic-profile'),{headless:true,serviceWorkers:'allow',viewport:{width:380,height:900}});
 const page=await browser.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/study-library.html#room=atlas%3Aa97001rc32&sec=s00-front&pg=1');
 await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload({waitUntil:'domcontentloaded'});
 const ready=()=>page.waitForFunction(()=>{const el=document.querySelector('[data-ref="a97001rc32:p1:b003"]');return el&&WordGlossAI.wordAt(el,0,'niqqud');});await ready();
 const keys=await page.evaluate(async()=>{const c=await caches.open('atlas-editions-v1');return (await c.keys()).map(r=>r.url);});
 const prefix='/data/atlas-context/a97001rc32/'+E.contextPinFor('a97001rc32')+'/';
 for(const name of ['manifest.json','addressed-map.json','s00-front.json'])assert(keys.includes(base+prefix+name),'SW did not cache '+name);
 const original=await page.evaluate(async path=>{const r=await fetch(path);return r.text();},prefix+'addressed-map.json');
 await browser.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready();report.checks.push('full offline reload validates edition, candidate manifest, map and section from actual SW cache');
 const before=await page.evaluate(async()=>({words:await __localDB.dbQuery('SELECT * FROM word_status',[]),reviews:await __localDB.dbQuery('SELECT * FROM review_log',[])}));
 // Corrupt the same pin's map in CacheStorage: the loader must still check size/SHA.
 await page.evaluate(async path=>{const c=await caches.open('atlas-editions-v1');await c.put(path,new Response('{}',{headers:{'Content-Type':'application/json'}}));},prefix+'addressed-map.json');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-context-error]'));
 assert.match(await page.locator('[data-context-error]').getAttribute('data-context-error'),/ADAPTER_SIZE|HASH/);assert.equal(await page.locator('[data-ref="a97001rc32:p1:b003"]').evaluate(el=>WordGlossAI.wordAt(el,0,'niqqud')),null);report.checks.push('stale/corrupt map cached under correct pin fails closed offline; no fallback');
 await page.evaluate(async ({path,body})=>{const c=await caches.open('atlas-editions-v1');await c.put(path,new Response(body,{headers:{'Content-Type':'application/json'}}));},{path:prefix+'addressed-map.json',body:original});
 await page.reload({waitUntil:'domcontentloaded'});await ready();report.checks.push('restoring verified candidate bytes recovers on offline reopen without resetting learner state');
 assert.deepEqual(await page.evaluate(async()=>({words:await __localDB.dbQuery('SELECT * FROM word_status',[]),reviews:await __localDB.dbQuery('SELECT * FROM review_log',[])})),before);report.learner_state_unchanged=true;assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.errors.push(e.stack);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(browser)await browser.close();if(child)child.kill();}
})();
