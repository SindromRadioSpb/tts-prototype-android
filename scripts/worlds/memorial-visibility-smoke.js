"use strict";
// A normal browser default context without Playwright's focus emulation.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'lp-memorial-tabs-'));
 const proc=spawn(chromium.executablePath(),['--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
 let browser;
 try {
  const file=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(file);i++)await new Promise(r=>setTimeout(r,100));
  const port=fs.readFileSync(file,'utf8').split('\n')[0];browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});
  const ctx=browser.contexts()[0],p=ctx.pages()[0];await p.goto((process.env.AUDIT_BASE||'http://127.0.0.1:62907')+'/mediatheque.html');await p.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);
  await p.evaluate(()=>{LPMemorialAdapter.select(2);LPMemorialAdapter.setAuto()});
  const c=await ctx.newCDPSession(p),q=await c.send('Target.createTarget',{url:'about:blank',newWindow:false});await c.send('Target.activateTarget',{targetId:q.targetId});
  await p.waitForFunction(()=>document.hidden);assert.equal(await p.evaluate(()=>LPMemorialAdapter.debug().scheduled),false);assert.equal(await p.evaluate(()=>LPWorld.debugState().animating),false);
  const before=await p.evaluate(()=>LPMemorialAdapter.state());await new Promise(r=>setTimeout(r,2500));assert.deepEqual(await p.evaluate(()=>LPMemorialAdapter.state()),before);
  await p.bringToFront();await p.waitForFunction(()=>!document.hidden&&LPMemorialAdapter.debug().scheduled);assert.equal(await p.evaluate(()=>LPMemorialAdapter.state().scene),2);
  console.log('PASS native background tab stops timer and movement; return has no catchup',JSON.stringify(before));
 }finally{if(browser)await browser.close();proc.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
