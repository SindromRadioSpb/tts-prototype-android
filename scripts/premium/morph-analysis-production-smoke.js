'use strict';
// Read-only acceptance of the real public material in a disposable browser profile.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const base=process.env.LP_PROD_BASE||'https://linguistpro.kolosei.com';
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/research/morph-analysis-editor/2026-10-21');
const version='3.11.805',sha=x=>createHash('sha256').update(x).digest('hex');
const assets=['/js/reader-morph.js?v=805','/js/morph-host.js?v=805','/css/reader-morph.css?v=805',...['ru','en','he'].map(l=>'/i18n/locales/'+l+'.js?v=805')];
async function get(url){const r=await fetch(base+url+(url.includes('?')?'&':'?')+'verify='+Date.now(),{headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200,url);return r;}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const probes=[];
 for(let i=0;i<3;i++){
  const config=await (await get('/api/client-config')).json(),health=await (await get('/healthz')).json();
  assert.equal(config.version,version);assert.equal(health.ok,true);assert.equal(health.db.ready,true);assert.equal(health.migrations.ready,true);
  assert.match(await (await get('/index.html')).text(),/window\.APP_VERSION = "3\.11\.805"/);
  assert.match(await (await get('/sw.js')).text(),/CACHE_VERSION = "v3\.11\.805"/);
  const hashes=[];for(const url of assets){const bytes=Buffer.from(await (await get(url)).arrayBuffer()),expected=fs.readFileSync(path.join(root,'public'+url.split('?')[0]));assert.equal(sha(bytes),sha(expected),url);hashes.push({url,sha256:sha(bytes)});}
  probes.push({at:new Date().toISOString(),version:config.version,healthReady:true,diskWarn:health.disk_warn,assets:hashes});
 }
 const browser=await chromium.launch();let result;
 try{
  const context=await browser.newContext({viewport:{width:380,height:900},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(60000);
  const errors=[];let paid=0;page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('room.wordStatus','1');localStorage.setItem('room.wordGloss','1');localStorage.setItem('room.wordGlossAi','0');localStorage.setItem('room.contextConsent','declined');});
  for(const endpoint of ['word-gloss-ctx','tts'])await context.route('**/api/'+endpoint,r=>{paid++;return r.abort();});
  await page.goto(base+'/library.html?public_corpus=media-8c30cc63a5e5e39a0acd&public_work=work-341364ac1ee94dba4f026846&verify=805#room=public:media-8c30cc63a5e5e39a0acd',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#proTable tr[data-row-idx="25"] [data-col=niqqud] [data-surface="נותר"]');
  const state=()=>page.evaluate(async()=>({reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY id'),events:await __localDB.dbQuery('SELECT * FROM lexical_resolution_events ORDER BY id')}));
  const before=await state(),cases=[];
  for(const [row,word,pid,lemma] of [[21,'שפחדת','1612','לפחוד'],[25,'נותר','867','להיוותר']]){
   const target='#proTable tr[data-row-idx="'+row+'"] [data-col=niqqud] [data-surface="'+word+'"]';
   await page.locator(target).click();await page.waitForSelector('.rm-current-reading');
   assert.match(await page.locator('.rm-current-reading').innerText(),new RegExp(lemma));
   assert.equal(await page.locator('.rm-form-grammar').count(),1);
   assert.equal(await page.locator('.rm-analysis-choices').getAttribute('open'),null);
   await page.locator('.rm-analysis-choices > summary').click();
   assert.equal(await page.locator('[data-rm-candidate]').count(),1);
   assert.equal(await page.locator('[data-rm-candidate="'+pid+'"]').count(),1);
   assert.equal(await page.locator('[data-rm-analysis-save]').isVisible(),false);
   assert.equal(await page.locator('[data-rm-analysis-name]').isVisible(),true);
   for(const width of [380,1280]){await page.setViewportSize({width,height:900});await page.locator('.rm-sheet-card').evaluate(e=>e.scrollTop=0);assert.equal(await page.locator('.rm-sheet-card').evaluate(e=>e.scrollWidth<=e.clientWidth+2),true);await page.screenshot({path:path.join(out,'production-'+row+'-'+width+'.png')});}
   cases.push({line:row+1,word,lemma,candidate:pid,grammar:await page.locator('.rm-form-grammar').innerText()});
   await page.locator('.rm-sheet-x').click();
  }
  assert.deepEqual(await state(),before);assert.deepEqual(errors,[]);assert.equal(paid,0);
  result={version:await page.locator('#roomFooterVersion').innerText(),cases,learnerHistoryUnchanged:true,paidCalls:paid,errors};
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'production-verification.json'),JSON.stringify({probes,browser:result},null,2)+'\n');
 console.log('PASS production: three version/health/hash probes and real Hamam lines 22/26',JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});
