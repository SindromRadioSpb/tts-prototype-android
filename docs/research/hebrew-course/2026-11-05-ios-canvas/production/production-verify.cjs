'use strict';
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const {webkit,devices}=require('playwright');
const base='https://linguistpro.kolosei.com', root=process.cwd();
const out=root+'/docs/research/hebrew-course/2026-11-05-ios-canvas/production';fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const report={version:'3.11.856',health:[],assets:[],worlds:[]};
for(let i=0;i<3;i++){let h=await(await fetch(base+'/healthz?verify='+Date.now(),{cache:'no-store'})).json();report.health.push(h);assert.equal(h.ok,true);assert.equal(h.db.ready,true);assert.equal(h.migrations.ready,true);if(i<2)await pause(1000);}
for(const f of ['sw.js','index.html','library.html','mediatheque.html','js/world-engine.js','js/world-render.js','js/world-boot.js','js/ulpan-world.js','js/memorial-adapter.js']){const r=await fetch(base+'/'+f+'?v=856&verify='+Date.now(),{cache:'no-store'});assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer()),local=require('child_process').execFileSync('git',['show','HEAD:public/'+f],{maxBuffer:20*1024*1024});assert.equal(crypto.createHash('sha256').update(b).digest('hex'),crypto.createHash('sha256').update(local).digest('hex'),f);report.assets.push(f);}
const browser=await webkit.launch();
try{const context=await browser.newContext({...devices['iPhone 15'],serviceWorkers:'block'});await context.addInitScript(()=>{window.canvasWrites=0;for(const p of ['width','height']){const d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,p);Object.defineProperty(HTMLCanvasElement.prototype,p,{...d,set(v){window.canvasWrites++;d.set.call(this,v)}})}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/library.html?canon=skip',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.LPWorld&&window.__roomReady,{},{timeout:60000});
for(const w of ['memorial-three-scenes','sukkot','ulpan-journey','israel-elections-2026']){await page.evaluate(w=>LPWorld.set(w),w);await pause(1000);const before=await page.evaluate(()=>canvasWrites);for(let i=0;i<10;i++){await page.evaluate(()=>dispatchEvent(new Event('resize')));await pause(60)}const state=await page.evaluate(()=>({writes:canvasWrites,canvas:[...document.querySelectorAll('[data-world-slot] canvas')].map(c=>({width:c.width,height:c.height})),footer:document.querySelector('#roomFooterVersion')?.textContent}));assert.equal(state.writes,before);assert.ok(state.canvas.length>0);assert.ok(state.canvas.every(c=>c.width*c.height<=4000000));assert.match(state.footer,/3.11.856/);report.worlds.push({world:w,before,...state});await page.screenshot({path:out+'/'+w+'.png'});}
assert.equal(errors.length,0);report.pageerrors=errors;report.ok=true;
}finally{await Promise.race([browser.close(),pause(5000)]);fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
