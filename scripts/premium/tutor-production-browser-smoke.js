#!/usr/bin/env node
'use strict';
// Fresh guest context only. No owner storage, cookies, model calls or mutations.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true}),checks=[];
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  for(const path of ['/library.html?canon=skip','/index.html']){
   await page.goto('https://linguistpro.kolosei.com'+path,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.LPTutor&&!!window.LPTutorClient&&!!window.LPTutorPractice);
   const cap=await page.evaluate(async()=>{const r=await fetch('/api/tutor/capabilities',{cache:'no-store'});return r.json();});
   assert.equal(cap.enabled,false);checks.push({path,modules_loaded:true,guest_capability:false});
  }
  await page.goto('https://linguistpro.kolosei.com/tutor-connect.html');
  await page.getByRole('heading',{name:'Войдите в LinguistPro',exact:true}).waitFor();
  checks.push({path:'/tutor-connect.html',guest_login:true});
  const denied=await page.request.get('https://linguistpro.kolosei.com/api/tutor/downloads/latest.json');
  assert.equal(denied.status(),401);assert.match(denied.headers()['cache-control'],/no-store/);
  assert.deepEqual(errors,[]);
  const result={date:new Date().toISOString(),evidence:'AUTOMATED_PRODUCTION_GUEST_BROWSER',checks,download_guest_status:denied.status(),pageErrors:errors};
  fs.writeFileSync('docs/research/mentor-byoa/2026-09-29/M3_PRODUCTION_BROWSER.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
