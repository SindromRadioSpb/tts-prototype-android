'use strict';
// Disposable production profile, prepared before release and reopened after it.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.AUDIT_BASE||'https://linguistpro.kolosei.com';
const dir=path.resolve('.tmp/memorial-sw-profile'),out=path.resolve('.tmp/memorial-production');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const ctx=await chromium.launchPersistentContext(dir,{headless:true});
 try {
 const page=ctx.pages()[0]||await ctx.newPage();await page.goto(base+'/',{waitUntil:'load'});
 await page.evaluate(()=>localStorage.setItem('onboardingSeen_v1','1'));
 await page.evaluate(()=>navigator.serviceWorker.ready);
 const version=()=>page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration('/');return new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data.version);reg.active.postMessage({type:'GET_VERSION'},[c.port2]);});});
 if(process.argv.includes('--before')) {
  assert.equal(await version(),'3.11.735');await page.reload({waitUntil:'load'});
  assert.ok(await page.evaluate(()=>navigator.serviceWorker.controller));
  fs.writeFileSync(path.join(out,'sw-before.json'),JSON.stringify({version:await version(),caches:await page.evaluate(()=>caches.keys())},null,2));
  console.log('PASS old production SW profile prepared');
 } else {
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/');await r.update();});
  await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration('/');return !!r.waiting;},{},{timeout:90000});
  await page.locator('#v3PwaUpdateToast button').first().click();
  await page.waitForFunction(()=>window.LPMemorialAdapter?.debug().active,{},{timeout:90000});
  await page.waitForFunction(()=>window.APP_VERSION==='3.11.737');
  assert.equal(await version(),'3.11.737');
  assert.equal(await page.evaluate(()=>LPWorld.current().id),'memorial-three-scenes');
  const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.includes('linguistpro-precache-v3.11.737'));assert.ok(!keys.some(k=>/3\.11\.73[56]/.test(k)));
  await page.evaluate(()=>{LPMemorialAdapter.select(2);LPMemorialAdapter.setPaused(true)});
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);
  assert.equal(await page.evaluate(()=>LPMemorialAdapter.state().scene),2);assert.equal(await page.evaluate(()=>LPMemorialAdapter.state().paused),true);
  fs.writeFileSync(path.join(out,'sw-after.json'),JSON.stringify({version:await version(),caches:keys,state:await page.evaluate(()=>LPMemorialAdapter.state())},null,2));console.log('PASS real SW guarded update, cache replacement and persisted scene');
 }
 }finally{await ctx.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
