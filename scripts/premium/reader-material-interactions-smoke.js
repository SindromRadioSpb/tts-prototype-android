// Anonymous disposable browsers; intercept this checkout's changed modules. No server material writes or paid providers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'.tmp/reader-material-interactions');fs.mkdirSync(out,{recursive:true});
const url='https://linguistpro.kolosei.com/library.html?public_corpus=media-8bf803ec75e71e8b87d0&public_work=work-eeb47e95ad7e278cd95d1b6b&from=mediatheque';
(async()=>{for(const engine of (process.argv.includes('--webkit')?[webkit]:[chromium,webkit])) {
const browser=await engine.launch({headless:true});
try { const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
await ctx.addInitScript(()=>{localStorage.setItem('app.locale','ru');});
for(const name of ['library-ui.js','lexical-resolution-service.js','world-engine.js','reader-morph.js'])await ctx.route('**/js/'+name+'*',r=>r.fulfill({body:fs.readFileSync(path.join(root,'public/js',name)),contentType:'application/javascript'}));
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await page.locator('#roomReaderTable .rm-w').first().waitFor({timeout:90000});
await page.waitForFunction(()=>document.querySelectorAll('#roomReaderTable .row-bookmark-btn').length>2000,{timeout:60000});
// Same rows as the owner's screenshots, no learner reviews or paid providers.
const timings=[];for(const row of [589,589,702,703]) {
const word=page.locator('#roomReaderTable tr[data-row-idx="'+row+'"] td[data-col="niqqud"] .rm-w').first();
await word.scrollIntoViewIfNeeded();
const ms=await word.evaluate(async el=>{const start=performance.now();el.click();while(document.querySelector('.rm-loading')&&performance.now()-start<15000)await new Promise(r=>setTimeout(r,10));return Math.round(performance.now()-start);});
timings.push(ms);assert.ok((await page.locator('.rm-sheet-body').textContent()).length>100);
await page.locator('.rm-sheet-x').click();
}
// The sign is measured asynchronously and remains within its stage.
const geometry=await page.evaluate(()=>{const s=document.querySelector('.lp-world-sign'),r=s?.getBoundingClientRect();return r?{hidden:s.hidden,width:r.width,left:r.left,stage:s.parentElement.getBoundingClientRect().width}:null;});
if(geometry&&geometry.width>0){assert.ok(geometry.left>=0);}
const btn=page.locator('#roomReaderTable tr[data-row-idx="702"] .row-bookmark-btn');
await btn.scrollIntoViewIfNeeded();await btn.click();await page.waitForFunction(()=>document.querySelector('#roomReaderTable tr[data-row-idx="702"] .row-bookmark-btn').getAttribute('aria-busy')==='false');
assert.equal(await btn.getAttribute('aria-pressed'),'true');await btn.click();await page.waitForFunction(()=>document.querySelector('#roomReaderTable tr[data-row-idx="702"] .row-bookmark-btn').getAttribute('aria-pressed')==='false');
console.log(JSON.stringify({engine:engine.name(),rows:await page.locator('#roomReaderTable tr[data-row-idx]').count(),timings,geometry,errors}));assert.deepEqual(errors,[]);
await page.screenshot({path:path.join(out,'interaction-'+engine.name()+'.png')});
} finally {await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
