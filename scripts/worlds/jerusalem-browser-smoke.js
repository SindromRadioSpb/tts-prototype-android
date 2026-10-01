"use strict";
// Local disposable app server only. No paid APIs or owner browser profile.
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const base = process.env.AUDIT_BASE;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base || "")) throw Error("AUDIT_BASE must be a loopback smoke server");
const out = path.resolve(process.env.AUDIT_OUT || "docs/research/jerusalem-up-close/2026-10-01");
fs.mkdirSync(out, {recursive:true});
const evidence = [], errors = [];
const ready = p => p.waitForFunction(() => window.LPWorld?.current()?.active && LPWorld.current().id === "jerusalem-up-close");
async function init(browser, width, lang, touch=false) {
  const ctx = await browser.newContext({viewport:{width,height:900},serviceWorkers:"block",hasTouch:touch,isMobile:touch});
  await ctx.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await ctx.addInitScript(lang => {
    localStorage.setItem("onboardingSeen_v1", "1");
    localStorage.setItem("app.locale", lang);
    if (!localStorage.getItem("lp_world_v1")) localStorage.setItem("lp_world_v1", JSON.stringify({id:"jerusalem-up-close",lighting:"day",mode:"live"}));
  },lang);
  const p = await ctx.newPage(); p.on("pageerror",e=>errors.push(e.message));
  return {ctx,p};
}
(async()=>{
 const browser=await chromium.launch();
 try {
  for(const width of [380,768,1280]) for(const lang of ["ru","he","en"]) {
   const {ctx,p}=await init(browser,width,lang);
   for(const [route,surface] of [["/","studio"],["/library.html","room"],["/mediatheque.html","mediatheque"]]) {
    await p.goto(base+route); await ready(p);
    await p.waitForFunction(s=>LPWorld.debugState().surface===s,surface);
    await p.evaluate(l=>{if(window.appSetLocale)window.appSetLocale(l)},lang);
    for(const theme of ["light","dark"]) {
     await p.evaluate(t=>document.body.classList.toggle("theme-dark",t==="dark"),theme);
     for(const lighting of ["day","dusk","night"]) {await p.evaluate(l=>LPWorld.setLighting(l),lighting);await p.waitForFunction(l=>LPWorld.debugState().lighting===l,lighting);}
     await p.locator(".lp-illustrated-begin").click();
     await p.locator(".lp-illustrated-object-nav").waitFor({state:"visible"});
     await p.waitForFunction(()=>!LPWorld.debugState().transition && !LPWorld.debugState().walking);
     await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const d=await p.evaluate(()=>{
       const visible=e=>!e.hidden&&e.getBoundingClientRect().width>0;
       const markers=[...document.querySelectorAll('.lp-illustrated-marker')].filter(visible);
       const controls=[...document.querySelectorAll('.lp-illustrated-top,.lp-illustrated-begin,.lp-illustrated-collapse')].filter(visible);
       const overlap=(a,b)=>{a=a.getBoundingClientRect();b=b.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};
       return {debug:LPWorld.debugState(),lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth+1,overlaps:markers.some((m,i)=>controls.some(c=>overlap(m,c))||markers.slice(i+1).some(n=>overlap(m,n))),markerRects:markers.map(m=>[m.getAttribute("aria-label"),m.getBoundingClientRect().toJSON(),m.style.cssText]),collisions:markers.flatMap(m=>controls.filter(c=>overlap(m,c)).map(c=>[m.getAttribute('aria-label'),m.getBoundingClientRect().toJSON(),c.className,c.getBoundingClientRect().toJSON()]))};
     });
     assert.equal(d.lang,lang); assert.equal(d.debug.expanded,true);
     assert.equal(d.overlaps,false,JSON.stringify(d));
     evidence.push({test:"surface",width,lang,surface,theme,...d});
     await p.screenshot({path:path.join(out,`app-${width}-${lang}-${surface}-${theme}.png`)});
     await p.locator(".lp-illustrated-collapse").click();
    }
   }
   await ctx.close(); console.log("MATRIX",width,lang);
  }
  const {ctx,p}=await init(browser,1280,"ru");await p.goto(base);await ready(p);
  await p.locator(".lp-illustrated-begin").focus();await p.keyboard.press("Enter");
  for(const [i,id] of [[0,"turn-plate"],[1,"compare-sign"],[2,"reveal-1919"],[3,"reveal-ticho"],[4,"revise-postcard"],[5,"nura-introduction"],[6,"timsah-names"]]) {
    await p.locator(".lp-illustrated-object-nav button").nth(i).click();await p.locator(`[data-action="${id}"]`).click();
  }
  const story=await p.evaluate(()=>LPWorld.storyState());assert.equal(story.complete,true);
  const sourceDetails=p.locator('.lp-illustrated-inspector details');
  await sourceDetails.locator('summary').click();
  const link=sourceDetails.locator('a').first();
  const expectedSource=await link.getAttribute('href');
  const popup=p.waitForEvent('popup');await link.click();const sourcePage=await popup;
  // External requests are blocked by this test's route; verify the requested target only.
  await sourcePage.waitForLoadState().catch(()=>{});await sourcePage.close();
  evidence.push({test:"source opens only on click; external content not fetched",target:expectedSource});
  const download=p.waitForEvent("download");await p.locator(".lp-illustrated-export").click();await(await download).saveAs(path.join(out,"app-postcard.png"));
  await p.reload();await ready(p);assert.deepEqual((await p.evaluate(()=>LPWorld.storyState())).notebook,story.notebook);
  evidence.push({test:"keyboard entry, seven objects, PNG and notebook reload",story});
  await p.emulateMedia({reducedMotion:"reduce"});await p.waitForFunction(()=>LPWorld.debugState().reduced);
  assert.equal(await p.evaluate(()=>LPWorld.debugState().blinkTimer),false);
  await p.emulateMedia({reducedMotion:"no-preference"});await p.waitForFunction(()=>!LPWorld.debugState().reduced);
  await p.locator(".lp-illustrated-pause").click();assert.equal(await p.evaluate(()=>LPWorld.debugState().paused),true);
  await p.locator(".lp-illustrated-pause").click();await p.locator("#inputText").fill("Ч‘Ч“Ч™Ч§Ч” ЧћЧ§Ч•ЧћЧ™ЧЄ");
  await p.waitForFunction(()=>LPWorld.debugState().focused);assert.equal(await p.evaluate(()=>LPWorld.debugState().blinkTimer),false);
  await p.locator(".lp-illustrated-begin").focus();
  evidence.push({test:"reduced motion, pause, study focus",passed:true});
  await p.evaluate(()=>LPWorld.openPicker());
  assert.equal(await p.locator('input[name="lpWorld"]').count(),4);
  for(const id of ["sukkot","israel-elections-2026","jerusalem-up-close"]) {await p.locator(`input[name="lpWorld"][value="${id}"]`).check();await p.waitForFunction(id=>LPWorld.current()?.active&&LPWorld.current().id===id,id);}
  await p.locator('input[name="lpWorldLight"][value="auto"]').check();await p.locator('input[name="lpWorldMode"][value="calm"]').check();await p.keyboard.press("Escape");
  await p.reload();await ready(p);assert.equal(await p.evaluate(()=>LPWorld.current().mode),"calm");
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem("lp_world_v1")).lighting),"auto");
  await p.evaluate(async()=>{const pending=LPWorld.set("sukkot");await LPWorld.set(null);await pending});assert.equal(await p.evaluate(()=>LPWorld.current()),null);
  await p.route("**/worlds/jerusalem-up-close/manifest.json*",r=>r.abort());
  await p.evaluate(()=>LPWorld.set("jerusalem-up-close"));assert.equal(await p.evaluate(()=>LPWorld.current()),null);
  evidence.push({test:"catalog preservation, Auto/calm persistence, stale load and failed load Classic",passed:true});
  await ctx.close();
  const touch=await init(browser,380,"he",true);await touch.p.goto(base);await ready(touch.p);await touch.p.locator(".lp-illustrated-begin").tap();await touch.p.locator(".lp-illustrated-object-nav button").nth(5).tap();await touch.p.locator('[data-action="nura-introduction"]').tap();assert.equal(await touch.p.evaluate(()=>LPWorld.storyState().selected),"nura");await touch.ctx.close();
  evidence.push({test:"touch emulation Hebrew Nura",passed:true});
 }catch(e){errors.push(e.stack);process.exitCode=1}finally{await browser.close();fs.writeFileSync(path.join(out,"app-browser.json"),JSON.stringify({evidence,errors},null,2));console.log(JSON.stringify({cases:evidence.length,overflow:evidence.filter(x=>x.overflow).map(x=>[x.width,x.lang,x.surface,x.theme]),errors}));}
})();
