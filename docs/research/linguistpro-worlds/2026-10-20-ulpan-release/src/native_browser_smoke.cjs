'use strict';
// Real app shells, isolated local static server and disposable browser storage.
// Backend/API, production, physical devices and screen readers are outside this check.
const { chromium }=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const artifact=path.resolve(__dirname,'..'),root=process.env.ULPAN_NATIVE_ROOT?path.resolve(process.env.ULPAN_NATIVE_ROOT):path.resolve(artifact,'../../../../.tmp/ulpan-integration/public');
const out=process.env.ULPAN_NATIVE_OUT?path.resolve(process.env.ULPAN_NATIVE_OUT):path.join(artifact,'reports/native');fs.mkdirSync(out,{recursive:true});
const report={evidence:'Local Chrome, real app shells served statically; isolated profiles; backend and production not exercised.',checks:[],errors:[]};
function pass(name,details){report.checks.push({name,details});console.log('PASS',name)}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 fs.readFile(file,(error,bytes)=>{if(error){res.writeHead(404);res.end()}else{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes)}});
});
async function canvasHash(page){return page.locator('[data-world-slot$="stage"] > canvas').evaluate(async c=>{const hash=await crypto.subtle.digest('SHA-256',c.getContext('2d').getImageData(0,0,c.width,c.height).data);return Array.from(new Uint8Array(hash)).join(',')})}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=process.env.ULPAN_NATIVE_BASE||'http://127.0.0.1:'+server.address().port;report.evidence=process.env.ULPAN_NATIVE_BASE?'Real Chrome against '+base+'; disposable anonymous storage; service workers blocked in interaction matrix.':report.evidence;
 const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(()=>{localStorage.setItem('onboardingSeen_v1','1');localStorage.setItem('lp_world_memorial_trial_v1','1');localStorage.setItem('lp_world_v1',JSON.stringify({id:'ulpan-journey',mode:'live',paused:false,lighting:'day'}))});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({message:e.message,stack:e.stack}));
  const ids=['promenade','market','workshop','jaffa','travel','reading','cinema'];
  for(const route of ['/','/library.html','/mediatheque.html']){
   await page.goto(base+route,{waitUntil:'load'});
   await page.waitForFunction(()=>window.LPWorld?.current()?.id==='ulpan-journey'&&LPWorld.current().active,{timeout:30000});
   await page.waitForFunction(()=>document.querySelectorAll('.lp-world-actor').length>=2);
   for(const width of [1280,380]){
    await page.setViewportSize({width,height:1000});
    for(const lang of ['ru','he','en']){
     await page.evaluate(l=>window.appSetLocale(l),lang);
     for(const id of ids){
      await page.locator(`.lp-world-stop[data-loc="${id}"]`).click();
      await page.waitForFunction(id=>LPWorld.debugState().location===id,id);
      if(lang==='ru'&&(id==='reading'||id==='cinema')){await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(out,`${route==='/'?'studio':route.includes('library')?'room':'media'}-${width}-${id}-sign.png`)});}
      const hero=page.locator('.lp-world-actor[data-actor="hero"]');await hero.click();
      await page.waitForFunction(()=>document.querySelector('.lp-world-bubble')?.textContent.length>10);
      const first=await page.locator('.lp-world-bubble').innerText();
      await hero.press('Enter');const second=await page.locator('.lp-world-bubble').innerText();
      if(id==='workshop'||id==='reading')assert.equal(first,second);else assert.notEqual(first,second);
      await page.locator('.lp-world-actor[data-actor="timsah"]').click();
      const g=await page.evaluate(()=>{
       const box=e=>e.getBoundingClientRect().toJSON(),stage=document.querySelector('[data-world-slot$="stage"]');
       const canvas=stage.querySelector('canvas'),until=document.querySelector(stage.dataset.worldBottom),titleChildren=[...until.children].filter(e=>getComputedStyle(e).display!=='none');
       return{location:LPWorld.debugState().location,route:box(stage.querySelector('.lp-world-route')),canvas:box(canvas),bubble:box(stage.querySelector('.lp-world-bubble')),headingBottom:Math.max(...titleChildren.map(e=>e.getBoundingClientRect().bottom)),targets:[...stage.querySelectorAll('.lp-world-actor:not([hidden])')].map(e=>({name:e.getAttribute('aria-label'),box:box(e)})),text:stage.querySelector('.lp-world-bubble').textContent,overflow:document.documentElement.scrollWidth>innerWidth,canvases:stage.querySelectorAll('canvas').length,controls:stage.querySelectorAll('#play,#seek,#learning,.lp-memorial-panel').length};
      });
      assert.equal(g.canvases,1);assert.equal(g.controls,0);assert.equal(g.overflow,false,JSON.stringify(g));
      assert.ok(g.canvas.top>=g.headingBottom-3,JSON.stringify(g));
      assert.ok(g.route.top>=g.canvas.bottom-1,JSON.stringify(g));
      assert.ok(g.bubble.left>=-1&&g.bubble.right<=width+1,JSON.stringify(g));
      for(const t of g.targets){assert.ok(t.name);assert.ok(t.box.width>=43.9&&t.box.height>=43.9);assert.ok(t.box.left>=0&&t.box.right<=width)}
      if(lang==='ru'){await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(out,`${route==='/'?'studio':route.includes('library')?'room':'media'}-${width}-${id}.png`),fullPage:false});}
     }
     pass(`native ${route} ${width}px ${lang}: seven locations, actor taps and keyboard, geometry`);
    }
   }
   await page.evaluate(()=>appSetLocale('ru'));
   for(const [id,actor]of [['market','seller'],['workshop','master'],['reading','teacher']]){
    await page.locator(`.lp-world-stop[data-loc="${id}"]`).click();await page.locator(`.lp-world-actor[data-actor="${actor}"]`).click();assert.ok((await page.locator('.lp-world-bubble').innerText()).length>30);
   }
   pass('NPC dialogue '+route);
   const a=await canvasHash(page);await page.waitForTimeout(120);assert.equal(await canvasHash(page),a);pass('OS reduced motion '+route);
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(200);const moving=await canvasHash(page);await page.waitForTimeout(240);assert.notEqual(await canvasHash(page),moving);
   await page.locator('.lp-world-pause').click();const frozen=await canvasHash(page);await page.waitForTimeout(240);assert.equal(await canvasHash(page),frozen);await page.locator('.lp-world-actor[data-actor="hero"]').click();assert.ok(await page.locator('.lp-world-bubble').isVisible());pass('motion, pause and speech while paused '+route);
   await page.evaluate(()=>LPWorld.set('israel-elections-2026'));await page.waitForFunction(()=>LPWorld.current()?.active);assert.equal(await page.locator('.lp-world-actor').count(),0);pass('switch back to elections and cleanup '+route);
   await page.evaluate(()=>LPWorld.set('ulpan-journey'));await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.waitForFunction(()=>LPWorld.current()?.id==='ulpan-journey'&&LPWorld.current()?.active&&document.querySelectorAll('.lp-world-actor').length>=2);
   await page.emulateMedia({reducedMotion:'reduce'});
  }
  await page.evaluate(()=>LPWorld.set('memorial-three-scenes'));await page.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);assert.equal(await page.locator('.lp-memorial-panel').count(),1);assert.equal(await page.locator('.lp-world-actor').count(),0);pass('Memorial still mounts after Ulpan');
  await page.evaluate(()=>LPWorld.set('ulpan-journey'));await page.waitForFunction(()=>LPWorld.current()?.id==='ulpan-journey'&&LPWorld.current()?.active);
  await page.locator('.lp-world-stop[data-loc="travel"]').click();await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(200);
  await page.evaluate(()=>LPWorldActivity.setAudio('ulpan-test',true));const held=await canvasHash(page);await page.waitForTimeout(220);assert.equal(await canvasHash(page),held);await page.evaluate(()=>LPWorldActivity.setAudio('ulpan-test',false));await page.waitForTimeout(220);assert.notEqual(await canvasHash(page),held);pass('existing audio activity bridge holds and resumes train');
  await page.evaluate(()=>LPWorld.set(null));assert.equal(await page.locator('.lp-world-actor').count(),0);assert.equal(await page.locator('[data-world-slot$="stage"] canvas').count(),0);pass('Classic removes Ulpan canvas and controls');
  await page.evaluate(()=>LPWorld.openPicker());
  await page.locator('input[name="lpWorld"][value="ulpan-journey"]').check();
  await page.waitForFunction(()=>LPWorld.current()?.id==='ulpan-journey'&&LPWorld.current()?.active);
  await page.locator('#lpWorldPicker').evaluate(dialog=>dialog.close());
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await page.waitForFunction(()=>document.querySelectorAll('.lp-world-actor').length>=2);
  pass('standard world picker selects Ulpan from Classic');
  await page.evaluate(async()=>{await Promise.allSettled([LPWorld.set('israel-elections-2026'),LPWorld.set('memorial-three-scenes'),LPWorld.set('ulpan-journey')]);});
  await page.waitForFunction(()=>LPWorld.current()?.id==='ulpan-journey'&&LPWorld.current()?.active);
  pass('rapid world switching keeps the last selection');
  const worldErrors=report.errors.filter(e=>/ulpan-world|world-engine|world-render|memorial-adapter/.test(e.stack));assert.deepEqual(worldErrors,[]);
  report.result='passed';
 }catch(e){report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1}
 finally{fs.writeFileSync(path.join(out,'browser-qa.json'),JSON.stringify(report,null,2)+'\n');await browser.close();server.close()}
})();
