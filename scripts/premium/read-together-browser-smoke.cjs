#!/usr/bin/env node
'use strict';
// Disposable auth fixture, REAL OPFS Reading Room, HTTP routes and SDK MCP transport.
// No production server, OAuth grants, external API, or actual dot connection.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const express=require('express'),{chromium}=require('playwright');
const {createStore,TTL}=require('../../agent/readTogether/store');
const {installRoutes}=require('../../agent/readTogether/routes');
const {createAgentAccessService}=require('../../agent/access/service');
const {createMcpDefaultOffGate}=require('../../agent/access/mcpAdapter');
const {createMcpRateLimiter}=require('../../agent/access/mcpRateLimiter');
const ROOT=path.resolve(__dirname,'../..');
const KEEP_OPEN=process.argv.includes('--keep-open');
const names=['read_active_reading_session','get_reading_session_fragment','propose_reading_session_action'];
async function main(){
 let clock=Date.now(),revoked=false,authDelay=null,authSeen=null,useActualClock=false;
 const store=createStore({now:()=>useActualClock?Date.now():clock,liveConnection:async(u,c)=>{if(authDelay){authSeen?.();await authDelay;}if(u!=='browser-test-user'||c!=='browser-test-connection'||revoked)throw Object.assign(Error('revoked'),{code:'RT_ACCESS_REVOKED'});}});
 const app=express();
 const principal={user_id:'browser-test-user',oauth_client_id:'browser-test-client',connection_id:'browser-test-connection',external_actor_id:'browser-test-agent',request_id:'browser-test',scopes:['read_together.context.read','read_together.action.propose'],connection_status:'ACTIVE',access_expires_at:new Date(clock+3600000).toISOString()};
 const runtime={service:createAgentAccessService({enabled:true,ownerIds:[principal.user_id],now:()=>useActualClock?Date.now():clock,handlers:Object.fromEntries(names.map(n=>[n,(p,a)=>store.agent(p,n,a)]))}),limiter:createMcpRateLimiter(),validator:{validate:async(header,rid)=>{if(header!=='Bearer browser-fixture-only')throw Error('unauthorized');return {principal:{...principal,request_id:rid},audit:{}};}}};
 app.all('/agent-access/read-together/mcp',createMcpDefaultOffGate({path:'/agent-access/read-together/mcp',getRuntime:async()=>runtime,resolveFlags:async()=>({ui:'1',oauth:'1',clients:'1',mcp:'1'})}));
 app.use(express.json({limit:'20kb'}));
 app.get('/api/auth/me',(_q,r)=>r.json({user:{id:principal.user_id},csrf:'browser-fixture-csrf'}));
 app.get('/api/agent-access/connections',(_q,r)=>r.json({ok:true,connections:[{connection_id:principal.connection_id,status:'ACTIVE',display_label:'Test agent · disposable fixture'}]}));
 installRoutes(app,{store,requireUser:async(q,r)=>{if(!q.headers.cookie?.includes('test_owner=1')){r.status(401).json({ok:false,error:'UNAUTHENTICATED'});return null;}return {user:{id:principal.user_id}};},requireCsrf:(q,r)=>{if(q.headers['x-lp-csrf']==='browser-fixture-csrf')return true;r.status(403).json({ok:false,error:'BAD_CSRF'});return false;}});
 app.get('/healthz',(_q,r)=>r.json({db:{ready:true},migrations:{ready:true}}));
 app.use(express.static(path.join(ROOT,'public')));
 const server=await new Promise(r=>{const s=app.listen(KEEP_OPEN?3318:0,'127.0.0.1',()=>r(s));});const base='http://127.0.0.1:'+server.address().port;
 process.env.NODE_ENV='test';process.env.AGENT_ACCESS_LOOPBACK_FIXTURE='1';process.env.AGENT_ACCESS_CANONICAL_ORIGIN=base;
 const {Client,StreamableHTTPClientTransport}=require('@modelcontextprotocol/client');
 const agent=new Client({name:'read-together-test-agent',version:'1'});
 let browser;
 try{
  assert.equal((await fetch(base+'/api/read-together/sessions/invalid')).status,401);
  assert.equal((await fetch(base+'/api/read-together/sessions',{method:'POST',headers:{Cookie:'test_owner=1','Content-Type':'application/json'},body:'{}'})).status,403);
  await agent.connect(new StreamableHTTPClientTransport(new URL(base+'/agent-access/read-together/mcp'),{requestInit:{headers:{Authorization:'Bearer browser-fixture-only'}}}));
  const list=await agent.listTools();assert.deepEqual(list.tools.map(t=>t.name).sort(),names.slice().sort());
  const call=async(name,args={})=>{const r=await agent.callTool({name,arguments:args});return JSON.parse(r.content[0].text);};
  browser=await chromium.launch({headless:!KEEP_OPEN});
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addCookies([{name:'test_owner',value:'1',url:base}]);
  const page=await context.newPage();await page.goto(base+'/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.ensureLocalDB==='function');
  await page.evaluate(async()=>{const db=await window.ensureLocalDB();for(const [id,key,title,lines] of [['rt-dot-one','rt-dot-key-one','Read together test one',['שלום עולם','מה נשמע']],['rt-dot-two','rt-dot-key-two','Read together test two',['טקסט חדש']]]){await db.createText({id,text_key:key,title,source_text:lines.join('\n')});for(let i=0;i<lines.length;i++)await db.dbRun('INSERT INTO sentences (id,text_id,order_index,he_plain,he_niqqud,translit,ru) VALUES (?,?,?,?,?,?,?)',[id+'-'+i,id,i,lines[i],lines[i],'','']);}localStorage.setItem('app.locale','ru');});
  await page.goto(base+'/library.html?canon=skip&corpus=skip#room=mytexts',{waitUntil:'load'});
  await page.locator('.mytext-card').filter({hasText:'Read together test one'}).locator('.mytext-open').click();
  await page.waitForSelector('#readTogether');
  await page.locator('#readTogether [data-refresh]').click();await page.locator('#readTogether [data-preview]').evaluate(e=>e.setSelectionRange(0,4));await page.locator('#readTogether [data-start]').click();
  await page.waitForFunction(()=>!document.querySelector('#readTogether [data-share]').disabled);let read=await call(names[0]);assert(read.ok,JSON.stringify(read));let s=read.result;assert.equal(s.context.text,'שלום עולם');assert.deepEqual(s.context.selection,{start:0,end:4});
  const a={session_id:s.session_id,state_version:s.state_version,fragment_id:s.context.fragment_id,idempotency_key:'test-explanation',kind:'explanation',body:'שלום means peace or hello.'};
  const first=await call(names[2],a);assert(first.ok,JSON.stringify(first));assert.deepEqual((await call(names[2],a)).result,first.result);
  await page.locator('#readTogether article').filter({hasText:a.body}).waitFor();
  await page.locator('#readTogether article').filter({hasText:a.body}).getByRole('button',{name:'Применить',exact:true}).click();
  for(const width of [380,768,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(ROOT,'.tmp','read-together-'+width+'.png'),fullPage:true});assert(await page.locator('#readTogether').evaluate(e=>e.scrollWidth<=e.clientWidth+2),'panel overflows '+width);}
  await page.locator('#readTogether [data-line]').selectOption('1');await page.locator('#readTogether [data-share]').click();
  read=await call(names[0]);assert.equal(read.result.context.text,'מה נשמע');assert.equal(read.result.state_version,s.state_version+1);
  assert.equal((await call(names[2],a)).error.code,'RT_STALE');s=read.result;
  const note={...a,state_version:s.state_version,fragment_id:s.context.fragment_id,idempotency_key:'test-note',kind:'note',body:'Saved only by the user'};
  await call(names[2],note);await page.getByRole('button',{name:'Сохранить заметку на устройстве',exact:true}).click();
  await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('lp-read-together-notes:browser-test-user')||'{}')).length===1);
  const page2=await context.newPage();await page2.goto(base+'/library.html?canon=skip&corpus=skip#room=mytexts');await page2.locator('.mytext-card').filter({hasText:'Read together test one'}).locator('.mytext-open').click();await page2.locator('#readTogether [data-refresh]').click();await page2.locator('#readTogether [data-start]').click();await page2.getByRole('status').filter({hasText:'Другая вкладка'}).waitFor();await page2.close();
  await context.setOffline(true);await page.locator('#readTogether [data-stop]').click();assert(await page.locator('#readTogether [role=status]').innerText());await context.setOffline(false);
  await page.waitForFunction(()=>document.querySelector('#readTogether [data-stop]').disabled);assert.equal((await call(names[0])).error.code,'RT_UNAVAILABLE');
  await page.locator('#readTogether [data-start]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('#readTogether [data-share]').disabled);
  read=await call(names[0]);assert(read.ok);clock+=TTL+1;assert.equal((await call(names[0])).error.code,'RT_UNAVAILABLE');
  await page.locator('#readTogether [data-stop]').click();await page.locator('#readTogether [data-start]').click();await page.waitForFunction(()=>!document.querySelector('#readTogether [data-share]').disabled);revoked=true;assert.equal((await call(names[0])).error.code,'RT_ACCESS_REVOKED');revoked=false;
  await page.locator('#readTogether [data-stop]').click();
  // Actual delayed server authorization: Stop is usable before Start returns.
  let releaseAuth,seenAuth;authDelay=new Promise(r=>releaseAuth=r);const seen=new Promise(r=>seenAuth=r);authSeen=seenAuth;
  await page.locator('#readTogether [data-start]').click();await seen;
  await page.locator('#readTogether [data-stop]').click();releaseAuth();authDelay=null;authSeen=null;
  await page.waitForFunction(()=>!document.querySelector('#readTogether [data-start]').disabled);
  assert.equal((await call(names[0])).error.code,'RT_UNAVAILABLE');
  await page.locator('#readTogether [data-start]').click();await page.waitForFunction(()=>!document.querySelector('#readTogether [data-share]').disabled);
  let safe=await call(names[0]);const html={session_id:safe.result.session_id,state_version:safe.result.state_version,fragment_id:safe.result.context.fragment_id,idempotency_key:'test-hostile-html',kind:'explanation',body:'<img src=x onerror="window.rtUnsafe=true">'};
  await call(names[2],html);await page.locator('#readTogether article').filter({hasText:html.body}).waitFor();assert.equal(await page.locator('#readTogether img').count(),0);assert.equal(await page.evaluate(()=>window.rtUnsafe),undefined);
  // A material close while Start is still pending also cancels the old request.
  await page.locator('#readTogether [data-stop]').click();authDelay=new Promise(r=>releaseAuth=r);const seenChange=new Promise(r=>seenAuth=r);authSeen=seenAuth;
  await page.locator('#readTogether [data-start]').click();await seenChange;await page.goBack();releaseAuth();authDelay=null;authSeen=null;
  await page.locator('.mytext-card').filter({hasText:'Read together test one'}).locator('.mytext-open').click();await page.waitForSelector('#readTogether');assert.equal((await call(names[0])).error.code,'RT_UNAVAILABLE');
  await page.evaluate(()=>{localStorage.setItem('app.locale','he');});await page.reload();await page.waitForSelector('#readTogether');assert.equal(await page.locator('#readTogether').getAttribute('dir'),'rtl');
  await page.setViewportSize({width:380,height:900});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(ROOT,'.tmp','read-together-rtl.png'),fullPage:true});assert(await page.locator('#readTogether').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
  await page.locator('#readTogether [data-refresh]').click();await page.locator('#readTogether [data-start]').click();await page.waitForFunction(()=>!document.querySelector('#readTogether [data-share]').disabled);
  const old=await call(names[0]);await page.goBack();assert.equal((await call(names[0],{session_id:old.result.session_id})).error.code,'RT_UNAVAILABLE');
  await page.locator('.mytext-card').filter({hasText:'Read together test two'}).locator('.mytext-open').click();await page.locator('#readTogether [data-refresh]').click();await page.locator('#readTogether [data-start]').click();await page.waitForFunction(()=>!document.querySelector('#readTogether [data-share]').disabled);const changed=await call(names[0]);assert.equal(changed.result.context.text,'טקסט חדש');assert.notEqual(changed.result.context.material_id,old.result.context.material_id);await page.locator('#readTogether [data-stop]').click();
  await page.evaluate(()=>localStorage.setItem('app.locale','en'));await page.reload();await page.waitForSelector('#readTogether');assert.equal(await page.locator('#readTogether h3').innerText(),'Read together with dot');
  if(KEEP_OPEN){useActualClock=true;console.log('Fixture preview: '+base+'/library.html — disposable auth, not dot. Press Ctrl+C to close.');await new Promise(r=>process.once('SIGINT',r));}
  console.log('PASS: REAL Reading Room / OPFS + HTTP owner session + SDK MCP agent; explanation, note, versions, duplicates, multitab, offline stop/reconnect, expiry/revoke, pending Start cancellation, rapid material switch, hostile HTML, keyboard, RU/HE/EN RTL, 380/768/1280. Fixture auth only; not dot.');
 }finally{await agent.close().catch(()=>{});await browser?.close();await new Promise(r=>server.close(r));}
}
fs.mkdirSync(path.join(ROOT,'.tmp'),{recursive:true});main().catch(e=>{console.error(e);process.exitCode=1;});
