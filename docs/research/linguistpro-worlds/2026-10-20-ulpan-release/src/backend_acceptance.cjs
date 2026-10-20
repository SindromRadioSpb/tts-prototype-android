'use strict';
// Anonymous, isolated backend/SW acceptance. Never invokes a paid provider.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const {spawn}=require('child_process'),{chromium}=require('playwright');
const root=process.cwd(),out=path.resolve(process.env.ULPAN_NATIVE_OUT),report={checks:[]};
fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 let child,browser;
 try{
  let base=process.env.ULPAN_NATIVE_BASE;
  if(!base){
   const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require(path.join(root,'scripts/smoke-server-env'));
   child=spawn(process.execPath,['-e',SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(),'lp-ulpan-')),0),stdio:['ignore','ignore','ignore','ipc']});
   base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);
  }
  report.base=base;
  const get=async url=>{const r=await fetch(base+url,{headers:{'Cache-Control':'no-cache'}});assert.ok(r.ok,url+' '+r.status);return r};
  let health;for(let i=0;i<60;i++){health=await(await get('/healthz?ulpan='+Date.now())).json();if(health.ok&&health.db.ready&&health.migrations.ready)break;await new Promise(r=>setTimeout(r,1000))}report.health=health;assert.equal(health.ok,true);assert.equal(health.db.ready,true);assert.equal(health.migrations.ready,true);report.health=health;
  const cfg=await(await get('/api/client-config?ulpan='+Date.now())).json();assert.equal(cfg.version,'3.11.799');report.version=cfg.version;
  for(const [url,expected] of Object.entries(cfg.shellIntegrity)){
   const bytes=Buffer.from(await(await get(url+(url.includes('?')?'&':'?')+'ulpan='+Date.now())).arrayBuffer());assert.equal(hash(bytes),expected,url);
   let pathname=new URL(url,base).pathname;pathname=({'/study-studio.html':'/index.html','/study-library.html':'/library.html'})[pathname]||pathname;
   const local=fs.readFileSync(path.join(root,'public',pathname));assert.equal(hash(bytes),hash(/\.(js|html|css|json|svg|txt)$/.test(pathname)?Buffer.from(local.toString('utf8').replace(/\r\n/g,'\n')):local),url+' vs checkout');
  }
  report.checks.push('health, DB/migrations, version, '+Object.keys(cfg.shellIntegrity).length+' served shell hashes vs checkout');
  for(const f of fs.readdirSync(path.join(root,'public/worlds/ulpan-journey'))){
   const bytes=Buffer.from(await(await get('/worlds/ulpan-journey/'+f+'?ulpan='+Date.now())).arrayBuffer());
   assert.equal(hash(bytes),hash(fs.readFileSync(path.join(root,'public/worlds/ulpan-journey',f))),f);
  }
  report.checks.push('all Ulpan pack bytes exact');
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(base+'/healthz');await page.evaluate(async()=>{await caches.open('linguistpro-precache-v3.11.798')});
  await page.goto(base+'/?ulpan_sw='+Date.now(),{waitUntil:'load'});
  const reg=await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;return true});assert.equal(reg,true);
  await page.waitForFunction(async()=>!!navigator.serviceWorker.controller&&(await caches.keys()).includes('linguistpro-precache-v3.11.799'),{},{timeout:120000});
  const sw=await page.evaluate(async()=>{const c=await caches.open('linguistpro-precache-v3.11.799');return {keys:(await c.keys()).length,painter:!!(await c.match('/js/ulpan-world.js?v=799')),boot:!!(await c.match('/js/world-boot.js?v=799'))}});
  assert.ok(sw.painter&&sw.boot);assert.equal(await page.evaluate(async()=>(await caches.keys()).includes('linguistpro-precache-v3.11.798')),false);report.sw=sw;report.checks.push('real Chrome SW activated, shell integrity install succeeded, exact painter/boot cache keys');
  await page.waitForFunction(()=>window.LPWorld?.current()?.id==='memorial-three-scenes'&&LPWorld.current().active);report.checks.push('fresh profile retains Memorial default and activation removes stale precache');await page.evaluate(()=>LPWorld.set('ulpan-journey'));await page.waitForFunction(()=>LPWorld.current()?.id==='ulpan-journey'&&LPWorld.current().active);await page.reload();await page.waitForFunction(()=>window.LPWorld?.current()?.id==='ulpan-journey'&&LPWorld.current().active);report.checks.push('explicit Ulpan choice survives reload with SW control');
  await context.close();
  if(!process.env.ULPAN_SKIP_MATRIX){const matrix=spawn(process.execPath,[path.join(__dirname,'native_browser_smoke.cjs')],{cwd:root,env:{...process.env,ULPAN_NATIVE_BASE:base,ULPAN_NATIVE_ROOT:path.join(root,'public'),ULPAN_NATIVE_OUT:path.join(out,'matrix')},stdio:'inherit'});
  assert.equal(await new Promise(r=>matrix.on('exit',r)),0);report.checks.push('35 browser matrix checks against live backend');}report.result='passed';
 }catch(e){report.result='failed';report.failure=e.stack;console.error(e);process.exitCode=1}
 finally{fs.writeFileSync(path.join(out,'backend-acceptance.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();if(child)child.kill();}
})();
