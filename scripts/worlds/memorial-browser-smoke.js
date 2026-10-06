"use strict";
// Real Chromium acceptance; fresh disposable profiles. AUDIT_BASE may select production.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:62907';
const out = process.env.AUDIT_OUT || path.resolve('.tmp/memorial-browser');
fs.mkdirSync(out, {recursive:true});
const results=[];
function pass(name,details) { results.push({name,details}); console.log('PASS',name); }
const captions={ru:'7 октября. Помним.',he:'7 באוקטובר. זוכרים.',en:'October 7. We remember.'};
(async()=>{
 const browser=await chromium.launch();
 try {
  for(const width of [320,380,1280]) {
   const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
   await ctx.addInitScript(()=>localStorage.setItem('onboardingSeen_v1','1'));
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
   for(const route of ['/', '/library.html','/mediatheque.html']) {
    await page.goto(base+route,{waitUntil:'load'});
    await page.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);
    if(route==='/')assert.equal(await page.evaluate(()=>APP_VERSION),await page.evaluate(async()=> (await (await fetch('/api/client-config',{cache:'no-store'})).json()).version),'inline shell version must match the release');
    for(const lang of ['ru','he','en']) {
     await page.evaluate(l=>window.appSetLocale(l),lang);
     await page.waitForFunction(l=>document.documentElement.lang===l,lang);
     for(const scene of [1,2,3]) {
      await page.locator('.lp-memorial-controls button').nth(scene-1).click();
      await page.waitForTimeout(120);
      const identity=await page.evaluate(async n=>{
       const img=new Image();img.src="/worlds/memorial-three-scenes/scene-"+n+"-original.png?v=1.0.0";await img.decode();
       const expected=document.createElement("canvas");expected.width=2048;expected.height=683;expected.getContext("2d").drawImage(img,0,0);
       const actual=document.querySelector(".lp-memorial-photo canvas").getContext("2d").getImageData(0,0,2048,683).data;
       const reference=expected.getContext("2d").getImageData(0,0,2048,683).data;
       return actual.every((v,i)=>v===reference[i]);
      },scene);assert.equal(identity,true,"native pixels must match scene "+scene);
      const g=await page.evaluate(()=>{
       const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();
       const stage=document.querySelector('[data-world-slot$="stage"]'),target=document.querySelector(stage.dataset.worldBottom);
       const children=[...target.children].filter(e=>getComputedStyle(e).display!=='none');
       return {state:LPMemorialAdapter.debug(),caption:document.querySelector('.lp-memorial-caption').textContent,dir:document.querySelector('.lp-memorial-panel').dir,photo:box('.lp-memorial-photo'),canvas:box('.lp-memorial-photo canvas'),panel:box('.lp-memorial-panel'),headingBottom:Math.max(...children.map(e=>e.getBoundingClientRect().bottom)),buttons:[...document.querySelectorAll('.lp-memorial-controls button')].map(e=>({name:e.getAttribute('aria-label')||e.textContent,box:e.getBoundingClientRect().toJSON()})),canvases:stage.querySelectorAll('canvas').length,location:LPWorld.debugState().location};
      });
      assert.equal(g.caption,captions[lang]);assert.equal(g.dir,lang==='he'?'rtl':'ltr');
      assert.equal(g.location,'scene-'+scene);assert.equal(g.canvases,1);
      assert.ok(Math.abs(g.canvas.width/g.canvas.height-2048/683)<0.025);
      assert.ok(g.photo.top>=g.headingBottom-2,JSON.stringify(g));
      assert.ok(g.canvas.top>=g.photo.top-1 && g.canvas.bottom<=g.panel.top+1);
      assert.ok(g.panel.bottom<=900 || width===320 || width===380);
      for(const b of g.buttons){assert.ok(b.name);assert.ok(b.box.width>=44 && b.box.height>=44);assert.ok(b.box.left>=0&&b.box.right<=width);}
      await page.screenshot({path:path.join(out,`${width}-${route==='/'?'studio':route.includes('library')?'room':'media'}-${lang}-${scene}.png`)});
      pass(`matrix ${width} ${route} ${lang} scene ${scene}`,g);
     }
    }
    const before=await page.evaluate(()=>({state:LPMemorialAdapter.state(),h:document.querySelector('.lp-memorial-photo').getBoundingClientRect().height}));
    await page.evaluate(()=>LPWorld.openPicker());
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(()=>LPMemorialAdapter.state()),before.state);
    assert.equal(await page.locator('.lp-memorial-photo').first().evaluate(e=>e.getBoundingClientRect().height),before.h);
    await page.keyboard.press('Escape');
    await page.locator('.lp-memorial-controls button').nth(0).focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>LPMemorialAdapter.state().scene),1);
    await page.keyboard.press('Tab');await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>LPMemorialAdapter.state().scene),2);
    pass(`picker and keyboard ${width} ${route}`);
   }
   assert.deepEqual(errors,[]);await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await ctx.newPage();
  await page.goto(base+'/mediatheque.html',{waitUntil:'load'});await page.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);
  await page.evaluate(()=>{LPMemorialAdapter.select(1);LPMemorialAdapter.setAuto()});
  // Wall-clock test: no fake clock or test advance.
  if(!process.env.SKIP_LONG) {
  for(let i=0;i<3;i++){await page.waitForTimeout(30000);console.log('AUTO wall clock',30*(i+1));}
  await page.waitForFunction(()=>LPMemorialAdapter.state().scene===2,{},{timeout:10000});
  await page.waitForTimeout(1200);assert.equal(await page.locator('[data-world-slot] canvas').count(),1);pass('real 90-second auto and fade cleanup');
  await page.locator('.lp-memorial-controls button').nth(2).click();
  for(let i=0;i<3;i++){await page.waitForTimeout(31000);console.log('MANUAL wall clock',31*(i+1));}
  assert.equal(await page.evaluate(()=>LPMemorialAdapter.state().scene),3);pass('manual remains fixed beyond 90 seconds');
  }
  await page.evaluate(()=>{LPMemorialAdapter.select(3);LPMemorialAdapter.setAuto();LPMemorialAdapter.setPaused(true)});
  for(const light of ['night','dusk','day']){await page.evaluate(l=>LPWorld.set('memorial-three-scenes','live',l),light);assert.equal(await page.evaluate(()=>LPMemorialAdapter.state().paused),true);assert.equal(await page.evaluate(()=>LPWorld.current().paused),true);assert.equal(await page.evaluate(()=>LPWorld.debugState().location),'scene-3');}
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);
  assert.equal(await page.evaluate(()=>LPWorld.current().paused),true);assert.equal(await page.evaluate(()=>LPMemorialAdapter.state().scene),3);
  await page.evaluate(()=>LPMemorialAdapter.setPaused(false));await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!LPMemorialAdapter.debug().scheduled);await page.waitForTimeout(200);await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>LPMemorialAdapter.debug().scheduled);
  await page.evaluate(()=>{LPMemorialAdapter.select(1);LPMemorialAdapter.select(2);LPWorld.set(null)});
  await page.waitForTimeout(1200);assert.equal(await page.locator('.lp-memorial-photo').count(),0);
  await page.evaluate(async()=>{const a=LPWorld.set('memorial-three-scenes');const b=LPWorld.set('sukkot');const c=LPWorld.set(null);await Promise.all([a,b,c]);});assert.equal(await page.evaluate(()=>LPWorld.current()),null);
  await page.evaluate(()=>LPWorld.set('memorial-three-scenes'));assert.equal(await page.locator('.lp-memorial-panel').count(),1);
  pass('paused lighting/reload, reduced motion and latest off wins');
  await ctx.close();
 } finally {await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1});
