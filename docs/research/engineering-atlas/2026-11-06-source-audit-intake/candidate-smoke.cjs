'use strict';
// Isolated anonymous browser. Production shell, candidate atlas data intercepted locally.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../../..'),out=path.join(root,'.tmp/atlas97001-source-review/browser');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch();const reports=[];
 try{
 for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await context.route('**/css/atlas-reader.css?*',route=>route.fulfill({path:path.join(root,'public/css/atlas-reader.css')}));
 await context.route('**/js/library-ui.js?*',route=>route.fulfill({path:path.join(root,'public/js/library-ui.js')}));
 await context.route('**/data/atlas/a97001/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  const file=path.resolve(root,'.'+p);
  if(!file.startsWith(path.join(root,'data','atlas','a97001')+path.sep))throw Error('Unexpected path');
  if(fs.existsSync(file))await route.fulfill({path:file});else await route.continue();
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const r={width,data:'local candidate',productionShell:true,checks:[]};reports.push(r);
 await page.goto('https://linguistpro.kolosei.com/library.html#room=atlas%3Aa97001');
 await page.waitForSelector('.atlas-home',{timeout:120000});
 await page.evaluate(()=>localStorage.setItem('atlas.audit.preservation','unchanged'));
 await page.locator('[data-section="s17-steels"]').click();await page.waitForSelector('#atlas-p154');
 assert((await page.locator('#atlas-p154').innerText()).replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g,'').includes('במשך זמן קצר'));
 r.checks.push('p154 short-duration qualifier rendered');
 for(const n of [154,157,160,169,170,171,175,179,191]){
  await page.locator('#atlas-p'+n).evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(250);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(overflow>1){
   r.layoutFailures=r.layoutFailures||[];
   r.layoutFailures.push({page:n,overflow,elements:await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!e.closest('.atlas-tablewrap,.atlas-formula')}).sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right).slice(0,10).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80),rect:e.getBoundingClientRect().toJSON()})))});
   await page.screenshot({path:path.join(out,'overflow-'+n+'-'+width+'.png')});
  }
 }
 r.checks.push(r.layoutFailures?'layout failures recorded':'representative affected pages: no viewport overflow');
 if(width===390){
  r.memory=[];
  for(let n=154;n<=191;n++){
   await page.locator('#atlas-p'+n).evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(250);
   r.memory.push(await page.evaluate(n=>({page:n,imagesWithSource:document.querySelectorAll('.atlas-section img[src]').length}),n));
  }
  assert(Math.max(...r.memory.map(x=>x.imagesWithSource))<20,'mobile image sources remain bounded');
  r.checks.push('3.11.863 memory regression: all 38 steel pages keep <20 image sources');
 }
 await page.locator('.atlas-pagejump input').fill('160');await page.locator('.atlas-pagejump').evaluate(f=>f.requestSubmit());
 await page.screenshot({path:path.join(out,'p160-'+width+'.png')});
 await page.locator('#atlas-p160 .atlas-thumb img').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#atlas-p160 .atlas-thumb img')?.naturalWidth>0);
 await page.locator('#atlas-p160 .atlas-thumb').click();
 r.scan=await page.locator('.atlas-overlay').count();assert.equal(r.scan,1);
 await page.keyboard.press('Escape');
 await page.locator('#atlas-p154').evaluate(el=>el.scrollIntoView({block:'start'}));
 const word=page.locator('#atlas-p154 .rm-w:visible').first();await word.click();await page.waitForSelector('.rm-sheet.rm-open');await page.keyboard.press('Escape');r.checks.push('word card opens');
 await page.locator('.atlas-train-btn').click();await page.locator('.atlas-train-panel [data-stage="3"]').click();
 assert(await page.locator('.atlas-stage-3').count());r.checks.push('training stage 3');
 if(await page.locator('.atlas-train-panel').isHidden())await page.locator('.atlas-train-btn').click();
 await page.locator('.atlas-train-panel [data-stage="0"]').click();
 r.print=await page.evaluate(async()=>{
  const s=await(await fetch('/data/atlas/a97001/sections/s17-steels.json')).json();const clear=AtlasReader.preparePrint(document,s);
  const result={sheets:document.querySelectorAll('.atlas-psheet').length,images:document.querySelectorAll('.atlas-print-root img[src]').length};clear();return result;
 });assert.equal(r.print.sheets,38);r.checks.push('print renderer: 38 sheets');
 await page.locator('.atlas-back').click();await page.waitForSelector('.atlas-home');
 await page.locator('.atlas-search').fill('במשך זמן קצר');await page.locator('.atlas-book-search').press('Enter');
 await page.waitForSelector('[data-search-result]');assert((await page.locator('[data-search-result]').allTextContents()).join(' ').includes('154'));
 await page.locator('[data-search-result]').filter({hasText:/154/}).first().click();await page.waitForSelector('#atlas-p154 .atlas-hit');r.checks.push('rebuilt search finds restored qualifier');
 r.reopenUrl=page.url();await page.reload();await page.waitForSelector('#atlas-p154',{timeout:120000});
 await page.waitForTimeout(1500);
 r.reopen=await page.evaluate(()=>({url:location.href,page154:!!document.getElementById('atlas-p154')}));assert(r.reopen.page154,'page survives projection refresh after reload');
 assert.equal(await page.evaluate(()=>localStorage.getItem('atlas.audit.preservation')),'unchanged');r.checks.push('reopen and unrelated storage sentinel preserved');
 r.errors=errors;assert.deepEqual(errors,[]);r.status=r.layoutFailures?'layout_failed':'passed';
 await page.locator('#atlas-p154').evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:path.join(out,'final-'+width+'.png')});await context.close();
 }
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await browser.close();}
 console.log(JSON.stringify(reports.map(({width,checks,status,errors,layoutFailures,print})=>({width,checks,status,errors,layoutFailures:layoutFailures?.length||0,print}))));
})().catch(e=>{console.error(e);process.exitCode=1;});
