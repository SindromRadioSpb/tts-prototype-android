'use strict';
// Actual sealed bodies and HTTP routes; disposable loopback server and learner profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {fork}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'.tmp/learning-release/cold-links');
const index=require('../../public/data/benyehuda/corpus-index-v8.json'),seo=require('../../public-work-seo');
async function main(){
 fs.mkdirSync(OUT,{recursive:true});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-cold-links-'));
 const child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:ROOT,env:smokeServerEnv(dir,0),silent:true,windowsHide:true});child.stdout.resume();child.stderr.resume();let browser;
 const checks=[],record=(name,evidence)=>{checks.push({name,result:'pass',evidence});console.log('PASS '+name);};
 try{
  const origin='http://127.0.0.1:'+await waitForSmokeServer(child,60000);
  // Every ready ID resolves through exactly the same projection as the real HTTP route.
  for(const card of index.ready){const data=seo.benyehuda(card.id,dir);assert.ok(data,card.id);assert.equal(data.rows.length,card.segments,card.id);}
  record('all current editions have readable cold public projections',{ready:index.ready.length});
  const xml=await(await fetch(origin+'/sitemap.xml')).text(),ids=[...xml.matchAll(/corpus_work=(\d+)/g)].map(x=>x[1]);
  assert.equal(ids.length,1421);assert.equal(new Set(ids).size,1421);assert.deepEqual([...ids].sort(),index.ready.map(c=>c.id).sort());
  record('sitemap contains all 1421 distinct ready works',{ready:ids.length});
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'});
  context.setDefaultTimeout(30000);await context.route('**/*',async route=>{
   if(!route.request().url().startsWith(origin))return route.abort();
   if(new URL(route.request().url()).pathname==='/js/library-ui.js'){const response=await route.fetch();return route.fulfill({response,body:await response.text()+'\nwindow.__releaseReaderSnapshot=()=>({id:readerTextId,key:readerTextKey,rows:readerRows.length});'});}
   return route.continue();
  });
  await context.addInitScript(()=>{localStorage.setItem('app.locale','ru');localStorage.setItem('phase6Decision_v1','declined');localStorage.setItem('onboardingSeen_v1','1');});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const id of ['24249','3557','10']){
   const card=index.ready.find(c=>c.id===id),expected=seo.benyehuda(id,dir),url=origin+'/library.html?canon=skip&corpus_work='+id;
   const response=await page.goto(url);assert.equal(response.status(),200,id);
   assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),seo.canonical({corpus_work:id}));
   const ld=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());assert.equal(ld['@type'],'CreativeWork');assert.equal(ld.name,card.title);assert.equal(ld.url,seo.canonical({corpus_work:id}));
   const excerpt=expected.rows[0].hebrew_niqqud||expected.rows[0].hebrew_plain;
   assert.equal(await page.locator('.room-public-work-summary p[lang=he]').first().textContent(),excerpt);
   await page.locator('#roomReaderTable tbody tr').first().waitFor({state:'visible'});
   const snapshot=()=>page.evaluate(()=>window.__releaseReaderSnapshot());
   const before=await snapshot();assert.equal(before.key,card.text_key);assert.equal(before.rows,card.segments);
   await page.reload();await page.locator('#roomReaderTable tbody tr').first().waitFor({state:'visible'});assert.deepEqual(await snapshot(),before);
   record('cold HTTP, canonical JSON-LD, current excerpt and client refresh '+id,{status:200,rows:before.rows,key:before.key});
  }
  for(const id of ['../3557','3557<script>','99999999']){const r=await fetch(origin+'/library.html?corpus_work='+encodeURIComponent(id));assert.equal(r.status,404);}
  record('invalid and unknown work IDs cannot enter a public projection',{cases:3});assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({checks,pageerrors:errors,fixture_scope:'Actual sealed bodies and HTTP server; disposable profile, blocked service workers/external traffic; appended read-only reader observer, unchanged application handlers'},null,2));
 }finally{await browser?.close();child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
