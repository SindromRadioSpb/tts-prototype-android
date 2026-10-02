const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {fork,execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
const ROOT=path.resolve(__dirname,'../..'),OLD='d0dc571c81f1f7017a65325bb0ad5fbbdfba1376';
const SHOTS=path.join(ROOT,'.tmp','read-together-ui-removal');
// Actual previous shell/SW bytes + actual current server, one persistent browser profile.
// Synthetic OPFS text/video only. No owner data, paid provider, OAuth grant or dot call.
const oldFiles=new Map(['/index.html','/library.html','/sw.js','/js/library-ui.js'].map(url=>[url,execFileSync('git',['show',OLD+':public'+url],{cwd:ROOT,maxBuffer:8*1024*1024})]));
let phase='old',readingCalls=0;
async function main(){
 fs.mkdirSync(SHOTS,{recursive:true});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-rt-ui-removal-'));
 const child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:ROOT,env:smokeServerEnv(path.join(dir,'server'),0),stdio:['ignore','pipe','pipe','ipc']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 let proxy,context;
 try{
  const port=await waitForSmokeServer(child,30000),upstream='http://127.0.0.1:'+port;
  proxy=http.createServer(async(req,res)=>{try{
   const url=new URL(req.url,upstream),pathname=url.pathname==='/'?'/index.html':url.pathname;
   if(pathname.startsWith('/api/read-together'))readingCalls++;
   const headers={...req.headers,host:'127.0.0.1:'+port,'accept-encoding':'identity'};
   delete headers['if-none-match'];delete headers['if-modified-since'];
   const up=await fetch(upstream+req.url,{headers});let body=Buffer.from(await up.arrayBuffer());
   if(phase==='old'&&oldFiles.has(pathname))body=oldFiles.get(pathname);
   if(phase==='old'&&pathname==='/api/client-config'){
    const config=JSON.parse(body);config.version='3.11.716';
    delete config.shellIntegrity['/js/library-ui.js?v=717'];
    config.shellIntegrity['/js/library-ui.js?v=704']=crypto.createHash('sha256').update(oldFiles.get('/js/library-ui.js')).digest('hex');
    config.shellIntegrity['/js/read-together.js?v=1']=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'public/js/read-together.js'))).digest('hex');
    for(const [url,bytes] of oldFiles)if(config.shellIntegrity[url])config.shellIntegrity[url]=crypto.createHash('sha256').update(bytes).digest('hex');
    body=Buffer.from(JSON.stringify(config));
   }
   const out={};up.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding','connection','etag','last-modified'].includes(k))out[k]=v;});
   out['content-length']=body.length;res.writeHead(up.status,out);res.end(body);
  }catch(e){res.writeHead(502);res.end('LOCAL_PROXY_ERROR');}});
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+proxy.address().port;
  context=await chromium.launchPersistentContext(path.join(dir,'profile'),{viewport:{width:1280,height:900},headless:true});
  await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['blob:','data:'].includes(u.protocol)?r.continue():r.abort();});
  const page=context.pages()[0];page.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text().slice(0,250));});context.on('serviceworker',w=>w.on('console',m=>console.log('worker:',m.text().slice(0,250))));await page.addInitScript(()=>{for(const k of ['localMode','phase6FirstOpenSeen','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])if(!localStorage.getItem(k))localStorage.setItem(k,'1');});
  await page.goto(base+'/index.html',{waitUntil:'load'});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:60000});
  await page.reload();await page.waitForFunction(()=>typeof ensureLocalDB==='function');
  await page.evaluate(async()=>{
   const db=await ensureLocalDB();appSetLocale('ru');
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='#193c31';ctx.fillRect(0,0,320,180);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText('LOCAL VIDEO FIXTURE',35,90);
   const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
   const done=new Promise(r=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>r(new Blob(chunks,{type:'video/webm'}));});
   recorder.start();let frame=0;const animation=setInterval(()=>{ctx.fillStyle='#193c31';ctx.fillRect(0,0,320,180);ctx.fillStyle='white';ctx.fillText('LOCAL VIDEO '+(++frame),35,90);},80);await new Promise(r=>setTimeout(r,1600));clearInterval(animation);recorder.stop();const buffer=await(await done).arrayBuffer();stream.getTracks().forEach(t=>t.stop());
   await MediaStore.saveMedia(buffer,'rt-removal.webm');
   const rows=Array.from({length:16},(_,i)=>({id:'rt-layout-row-'+i,he_plain:'משפט מספר '+(i+1)+' שלום עולם',he_niqqud:'משפט מספר '+(i+1)+' שלום עולם',ru:'Синтетическая строка '+(i+1),translit:'shalom'}));
   const audio={v:1,media:{opfsPath:'rt-removal.webm',mime:'video/webm',sha256:await MediaStore.sha256Hex(buffer),durationSec:1.2},segments:rows.map((r,i)=>({start_ms:i*50,end_ms:(i+1)*50,text:r.he_plain,caption_segment_id:'layout-cue-'+i,quality_flags:[]})),timing:true};
   await db.createText({id:'rt-layout-video',text_key:'rt-layout-video',title:'Reader layout video fixture',source_text:rows.map(r=>r.he_plain).join('\n'),source_meta_json:JSON.stringify({source:{audio}})});await db.addSentences('rt-layout-video',rows);
   await db.createText({id:'rt-layout-text',text_key:'rt-layout-text',title:'Reader layout plain fixture',source_text:'שלום עולם'});await db.addSentences('rt-layout-text',[{id:'rt-layout-plain-row',he_plain:'שלום עולם',he_niqqud:'שלום עולם',ru:'Привет, мир'}]);
   localStorage.setItem('lp-read-together-notes:fixture-owner',JSON.stringify({retained:{body:'Synthetic retained note'}}));
  });
  const url=base+'/library.html?canon=skip&corpus=skip#room=mytexts';
  await page.goto(url);await page.waitForFunction(()=>!!document.querySelector('.mytext-card'));if(await page.locator('#readerBack').isVisible())await page.locator('#readerBack').click();await page.locator('.mytext-card').filter({hasText:'Reader layout video fixture'}).locator('.mytext-open').click();
  await page.locator('#readTogether').waitFor();await page.locator('#roomMediaBar').waitFor({state:'visible'});
  assert.equal(await page.locator('#roomReaderTable tbody tr').count(),16);
  await page.screenshot({path:path.join(SHOTS,'before-716.png'),fullPage:false});
  console.log('PASS previous 716 shell/SW/profile reproduce Read Together block');
  phase='new';await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration('/');await reg.update();});
  await page.locator('.room-update-toast .ru-upd').waitFor({state:'visible',timeout:60000});
  await page.locator('.room-update-toast .ru-upd').click();
  await page.waitForFunction(()=>document.querySelector('#roomFooterVersion')?.textContent.includes('3.11.717'),null,{timeout:60000});
  assert.equal(await page.locator('#readTogether').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('lp-read-together-notes:fixture-owner')),JSON.stringify({retained:{body:'Synthetic retained note'}}));
  console.log('PASS actual 716→717 waiting SW, user Update, retained OPFS text/video and local note');
  const results=[];
  for(const locale of ['ru','he','en'])for(const theme of ['light','dark'])for(const width of [380,768,1280]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(({locale,theme})=>{localStorage.setItem('app.locale',locale);localStorage.setItem('appTheme_v1',theme);},{locale,theme});
   await page.goto(url);await page.waitForFunction(()=>!!document.querySelector('.mytext-card'));if(await page.locator('#readerBack').isVisible())await page.locator('#readerBack').click();await page.locator('.mytext-card').filter({hasText:'Reader layout video fixture'}).locator('.mytext-open').click();
   await page.locator('#roomMediaBar').waitFor({state:'visible'});await page.locator('#roomReaderTable tbody tr').first().waitFor();
   await page.evaluate(()=>window.scrollTo(0,0));
   const geometry=await page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};return {reader:rect('roomReader'),bar:rect('roomMediaBar'),table:rect('roomReaderTable'),header:document.querySelector('.reader-bar').getBoundingClientRect().bottom,dir:document.documentElement.dir,theme:document.body.classList.contains('theme-dark')?'dark':document.body.classList.contains('theme-light')?'light':'auto',ui:!!window.LPReadTogether,panel:!!document.querySelector('#readTogether,.rt-stop-dock,.rt-reader-container'),module:!!document.querySelector('script[src*="read-together"]'),overflow:document.documentElement.scrollWidth>innerWidth+2};});
   assert(!geometry.ui&&!geometry.panel&&!geometry.module,'removed UI mounted');assert(!geometry.overflow,'page overflow');
   assert(geometry.bar.y-geometry.header<170,'blank gap above video');assert(geometry.table.y-geometry.bar.bottom<100,'blank gap before table');
   assert(geometry.table.width>=geometry.reader.width-50,'reader table lost width');
   assert.equal(await page.locator('#roomReaderTable tbody tr').count(),16);
   if(locale==='he')assert.equal(geometry.dir,'rtl');assert.equal(geometry.theme,theme);
   assert.equal(await page.locator('#roomMediaLocalStage video').count(),1,'real OPFS video player');
   const player=page.locator('#roomMediaLocalStage video');await player.evaluate(async e=>{e.currentTime=0;await e.play();e.pause();if(e.error)throw Error('VIDEO_DECODE_ERROR');});
   await page.locator('#readerBack').focus();await page.keyboard.press('Enter');await page.locator('.mytext-card').filter({hasText:'Reader layout plain fixture'}).locator('.mytext-open').click();
   await page.locator('#roomReaderTable tbody tr').first().waitFor();assert.equal(await page.locator('#readTogether').count(),0);assert.equal(await page.locator('#roomReaderTable tbody tr').count(),1);assert(!await page.locator('#roomMediaBar').isVisible());
   await page.locator('#readerBack').click();await page.locator('.mytext-card').filter({hasText:'Reader layout video fixture'}).locator('.mytext-open').click();
   await page.locator('#roomMediaBar').waitFor({state:'visible'});
   await page.screenshot({path:path.join(SHOTS,`${width}-${locale}-${theme}.png`),fullPage:false});results.push({width,locale,theme,...geometry});console.log('PASS layout '+width+' '+locale+' '+theme);
  }
  await context.setOffline(true);await page.reload();await page.locator('#roomReaderTable tbody tr').first().waitFor();assert.equal(await page.locator('#readTogether').count(),0);assert.equal(await page.locator('#roomReaderTable tbody tr').count(),16);await context.setOffline(false);console.log('PASS upgraded offline shell retains reader without RT UI');assert.equal(readingCalls,0,'removed UI must not transmit context');
  const cachesNow=await page.evaluate(()=>caches.keys());assert(!cachesNow.some(n=>n.includes('3.11.716')),'old caches retained');
  fs.writeFileSync(path.join(SHOTS,'geometry.json'),JSON.stringify({results,readingCalls,caches:cachesNow},null,2));
  console.log('PASS 18 real browser layouts: RU/HE/EN × light/dark × 380/768/1280, OPFS video/table/plain text, keyboard, no RT calls or old caches');
 }finally{await context?.close();if(proxy)await new Promise(r=>proxy.close(r));child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
