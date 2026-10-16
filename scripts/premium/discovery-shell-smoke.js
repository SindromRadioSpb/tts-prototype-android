#!/usr/bin/env node
'use strict';
// Fresh service-worker install → shell integrity of the precache → offline reopen of the Studio and the Room.
// O-089: the gate starts its own server unless DISCOVERY_BASE points at one, and writes its evidence under .tmp/
// (DISCOVERY_OUT to keep a copy elsewhere) — a routine run leaves the tracked tree untouched.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..','..');
const PORT=Number(process.env.DISCOVERY_PORT||3327);
const BASE=process.env.DISCOVERY_BASE||`http://127.0.0.1:${PORT}`,OUT=path.resolve(ROOT,process.env.DISCOVERY_OUT||'.tmp/discovery-shell');
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

function startServer(){
  if(process.env.DISCOVERY_BASE)return null;
  const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env:{...process.env,PORT:String(PORT)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const logs=[];child.stdout.on('data',(c)=>logs.push(String(c)));child.stderr.on('data',(c)=>logs.push(String(c)));
  return {child,logs};
}
async function waitForServer(){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){try{if((await fetch(BASE+'/healthz')).ok)return true;}catch(_){}await sleep(200);}
  return false;
}
async function stopServer(server){
  if(!server||server.child.killed)return;
  server.child.kill('SIGTERM');
  const exited=await new Promise((resolve)=>{const timer=setTimeout(()=>resolve(false),5000);server.child.once('exit',()=>{clearTimeout(timer);resolve(true);});});
  if(!exited&&process.platform==='win32')spawnSync('taskkill',['/PID',String(server.child.pid),'/T','/F'],{stdio:'ignore'});
}

(async()=>{fs.mkdirSync(OUT,{recursive:true});const server=startServer();
if(server&&!await waitForServer()){await stopServer(server);console.error('server did not become ready\n'+server.logs.join(''));process.exit(1);}
const browser=await chromium.launch(),context=await browser.newContext({serviceWorkers:'allow',viewport:{width:1280,height:850}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const evidence={base:BASE,kind:'fresh service worker install and offline reopen'};
try{await page.goto(BASE+'/index.html?localMode=1');await page.waitForFunction(()=>window.__localDB?.isReady(),null,{timeout:60000});await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active?.state==='activated';},null,{timeout:60000});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
evidence.shell=await page.evaluate(async()=>{const config=await fetch('/api/client-config',{cache:'no-store'}).then(r=>r.json());const cache=await caches.open('linguistpro-precache-v'+config.version),missing=[],mismatch=[];for(const [url,expected]of Object.entries(config.shellIntegrity)){const response=await cache.match(url);if(!response){missing.push(url);continue;}const digest=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());const actual=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');if(actual!==expected)mismatch.push(url);}return{version:config.version,scriptVersion:window.APP_VERSION,paths:Object.keys(config.shellIntegrity).length,missing,mismatch,controller:!!navigator.serviceWorker.controller};});
assert.equal(evidence.shell.scriptVersion,evidence.shell.version);assert.deepEqual(evidence.shell.missing,[]);assert.deepEqual(evidence.shell.mismatch,[]);
await context.setOffline(true);await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.__localDB?.isReady()&&window.StudioLibraryDiscovery&&window.StudioPortableLearningPackage,null,{timeout:30000});await page.evaluate(()=>window.StudioPortableLearningPackage.open({view:'overview'}));assert.equal(await page.locator('[data-start]').count(),3);evidence.studioOffline=true;
await page.goto(BASE+'/library.html?canon=skip#room=mytexts',{waitUntil:'load'});await page.waitForFunction(()=>window.__localDB?.isReady()&&window.CatalogDiscoveryUI&&window.LocalTextFamiliarity,null,{timeout:30000});evidence.roomOffline=true;evidence.errors=errors;assert.deepEqual(errors,[]);evidence.status='PASS';console.log(JSON.stringify(evidence,null,2));
}catch(error){evidence.status='FAIL';evidence.failure=error.stack;console.error(error);process.exitCode=1;}finally{fs.writeFileSync(path.join(OUT,'shell-offline.json'),JSON.stringify(evidence,null,2));await browser.close();await stopServer(server);}})();
