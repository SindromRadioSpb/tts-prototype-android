"use strict";
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.AUDIT_BASE||'http://127.0.0.1:62907',out=process.env.AUDIT_OUT||path.resolve('.tmp/memorial-activity');
fs.mkdirSync(out,{recursive:true});const results=[];function pass(name){results.push(name);console.log('PASS',name)}
(async()=>{const b=await chromium.launch();try{
 const ctx=await b.newContext({viewport:{width:380,height:900},serviceWorkers:'block'}),p=await ctx.newPage();
 await ctx.addInitScript(()=>localStorage.setItem('onboardingSeen_v1','1'));
 await p.goto(base+'/');await p.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);
 await p.evaluate(()=>LPMemorialAdapter.setAuto());
 await p.locator('#inputText').focus();await p.waitForFunction(()=>!LPMemorialAdapter.debug().scheduled);
 const elapsed=await p.evaluate(()=>LPMemorialAdapter.state().elapsed);await p.waitForTimeout(1500);assert.equal(await p.evaluate(()=>LPMemorialAdapter.state().elapsed),elapsed);
 await p.locator('.lp-memorial-controls button').nth(3).focus();await p.waitForFunction(()=>LPMemorialAdapter.debug().scheduled);pass('actual Studio editor focus holds and releases');
 // Exercise the existing detached custom row player with a local WAV fixture; no TTS provider.
 await p.evaluate(async()=>{
  const samples=22050*5,buf=new ArrayBuffer(44+samples*2),v=new DataView(buf);
  function str(n,s){for(let i=0;i<s.length;i++)v.setUint8(n+i,s.charCodeAt(i));}
  str(0,'RIFF');v.setUint32(4,36+samples*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,22050,true);v.setUint32(28,44100,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples*2,true);
  const player=ensureRowAudioPlayer();player.src=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));await player.play();
 });
 await p.waitForFunction(()=>!LPMemorialAdapter.debug().scheduled);
 await p.evaluate(()=>v3StopRowAudio());await p.waitForFunction(()=>LPMemorialAdapter.debug().scheduled);pass('existing detached Studio row Audio play and stop release hold');
 await p.evaluate(()=>ensureRowAudioPlayer().play());await p.waitForFunction(()=>!LPMemorialAdapter.debug().scheduled);
 await p.waitForFunction(()=>LPMemorialAdapter.debug().scheduled,{},{timeout:10000});pass('existing custom row Audio natural end releases hold');
 await p.evaluate(()=>{const phase=document.getElementById('classicNextStep');phase.dataset.phase='learn';});await p.waitForFunction(()=>!LPMemorialAdapter.debug().scheduled);
 await p.evaluate(()=>document.getElementById('classicNextStep').dataset.phase='add');await p.waitForFunction(()=>LPMemorialAdapter.debug().scheduled);pass('Studio real phase signal symmetric reading hold');
 await p.evaluate(()=>{LPMemorialAdapter.select(2);LPMemorialAdapter.setPaused(true)});
 for(const route of ['/library.html','/mediatheque.html','/']){await p.goto(base+route);await p.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);assert.deepEqual(await p.evaluate(()=>LPMemorialAdapter.state()),{scene:2,auto:false,paused:true,elapsed:0});assert.equal(await p.evaluate(()=>LPWorld.current().paused),true);}
 pass('manual scene and pause persist across all surfaces');
 await p.evaluate(()=>LPMemorialAdapter.setPaused(false));await p.evaluate(()=>LPMemorialAdapter.setAuto());
 // A second foreground tab makes the original truly hidden in Chromium.
 const other=await ctx.newPage();await other.goto('about:blank');await other.bringToFront();
 const hidden=await p.evaluate(()=>document.hidden);
 if(hidden){const before=await p.evaluate(()=>LPMemorialAdapter.state().elapsed);await p.waitForTimeout(1800);assert.equal(await p.evaluate(()=>LPMemorialAdapter.state().elapsed),before);await p.bringToFront();await p.waitForFunction(()=>!document.hidden&&LPMemorialAdapter.debug().scheduled);pass('real hidden tab and return without catchup');}
 else { // Headless foreground emulation does not implement tab occlusion; use CDP focus emulation.
  const session=await ctx.newCDPSession(p);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  console.log('INFO headless tab visibility requires headed check');
 }
 await other.close();
 await p.evaluate(()=>{LPMemorialAdapter.select(1);LPMemorialAdapter.setAuto()});
 await p.waitForTimeout(500);await p.evaluate(()=>LPMemorialAdapter.select(3));assert.equal(await p.evaluate(()=>LPMemorialAdapter.debug().fade),true);
 await p.evaluate(()=>LPWorld.set(null));await p.waitForTimeout(1100);assert.equal(await p.locator('.lp-memorial-photo,.lp-memorial-panel').count(),0);
 await p.evaluate(async()=>{await Promise.all([LPWorld.set('memorial-three-scenes'),LPWorld.set('sukkot'),LPWorld.set(null)])});assert.equal(await p.evaluate(()=>LPWorld.current()),null);
 await p.evaluate(()=>LPWorld.set('memorial-three-scenes'));await p.waitForFunction(()=>LPMemorialAdapter.debug().active);assert.equal(await p.locator('.lp-memorial-panel').count(),1);pass('off during fade and rapid latest command cleanup');
 // Other worlds keep real images and their native controls.
 for(const world of ['sukkot','israel-elections-2026']){await p.evaluate(id=>LPWorld.set(id,'live','day'),world);assert.equal(await p.locator('.lp-memorial-panel').count(),0);assert.equal(await p.locator('[data-world-slot="studio-stage"] canvas').count(),1);}
 await p.evaluate(()=>LPWorld.openPicker());await p.waitForTimeout(1500);assert.equal(await p.locator('input[name="lpWorld"]').count(),4);await p.screenshot({path:path.join(out,'picker.png')});await p.keyboard.press('Escape');pass('existing world mounts and picker options preserved');
 await ctx.close();
 // Room reading lifecycle with a disposable local text, including actual Back UI.
 const rc=await b.newContext({serviceWorkers:'block'}),room=await rc.newPage();await room.goto(base+'/library.html');await room.waitForFunction(()=>window.__localDB&&window.LPMemorialAdapter?.debug().active);
 await room.evaluate(async()=>{await __localDB.createText({id:'memorial-test',text_key:'memorial-test',title:'Memorial reading fixture',source_text:'שלום עולם'});await __localDB.addSentence('memorial-test',{id:'memorial-test-s1',he_plain:'שלום עולם',ru:'Привет мир'});});
 await room.reload();await room.waitForFunction(()=>window.LPMemorialAdapter?.debug().active);await room.evaluate(()=>LPMemorialAdapter.setAuto());
 await room.locator('.learning-corpus-entry[data-corpus="mytexts"]').click();
 await room.locator('.mytext-card-v').filter({hasText:'Memorial reading fixture'}).click();await room.waitForFunction(()=>document.body.classList.contains('room-reading'));await room.waitForFunction(()=>!LPMemorialAdapter.debug().scheduled);
 await room.locator('#readerBack').click();await room.waitForFunction(()=>!document.body.classList.contains('room-reading'));await room.waitForFunction(()=>LPMemorialAdapter.debug().scheduled);pass('actual Room open and Back reading hold symmetric');await rc.close();
}finally{await b.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,results},null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
