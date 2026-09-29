#!/usr/bin/env node
'use strict';
// Fresh guest context only. No owner storage, cookies, model calls or mutations.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const argv=process.argv.slice(2),out=argv.includes('--out')?argv[argv.indexOf('--out')+1]:'docs/research/mentor-byoa/2026-09-29/M3_PRODUCTION_BROWSER.json';
(async()=>{
 const browser=await chromium.launch({headless:true}),checks=[];
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  for(const path of ['/library.html?canon=skip','/index.html']){
   await page.goto('https://linguistpro.kolosei.com'+path,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.LPTutor&&!!window.LPTutorClient&&!!window.LPTutorPractice&&!!window.LPTutorNotebook);
   const cap=await page.evaluate(async()=>{const r=await fetch('/api/tutor/capabilities',{cache:'no-store'});return r.json();});
   assert.equal(cap.enabled,false);checks.push({path,modules_loaded:true,guest_capability:false});
  }
  await page.goto('https://linguistpro.kolosei.com/mediatheque.html',{waitUntil:'domcontentloaded'});
  await page.locator('#ml-root[aria-busy="false"]').waitFor();assert.equal(await page.locator('.ml-tutor').count(),0);
  checks.push({path:'/mediatheque.html',guest_tutor_links:0});
  await page.goto('https://linguistpro.kolosei.com/tutor-connect.html');
  await page.getByRole('heading',{name:'Войдите в LinguistPro',exact:true}).waitFor();
  checks.push({path:'/tutor-connect.html',guest_login:true});
  const denied=await page.request.get('https://linguistpro.kolosei.com/api/tutor/downloads/latest.json');
  assert.equal(denied.status(),401);assert.match(denied.headers()['cache-control'],/no-store/);
  assert.deepEqual(errors,[]);
  const config=await(await page.request.get('https://linguistpro.kolosei.com/api/client-config')).json();
  const result={date:new Date().toISOString(),version:config.version,evidence:'AUTOMATED_PRODUCTION_GUEST_BROWSER',checks,download_guest_status:denied.status(),pageErrors:errors};
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
