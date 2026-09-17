// Product import error layout with the shared quota formatter. No media writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await context.addInitScript(()=>{localStorage.setItem('localMode','1');localStorage.setItem('v3OnboardingSeenV1','1');});
  await page.goto('http://localhost:3000/?storage-ui=584',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StudioImport&&window.appSetLocale);
  for(const locale of ['ru','he'])for(const width of [380,1280]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(locale=>{
    appSetLocale(locale);StudioImport.open();StudioImport.switchTab('file');
    document.getElementById('v3ImportAudioInfo').hidden=false;
    document.getElementById('v3ImportMediaReadiness').hidden=false;
    document.getElementById('v3ImportSubtitlePlan').hidden=false;
    const el=document.getElementById('v3ImportSubtitlePlanStatus');
    el.textContent=StudioPortableLearningPackage.formatPortableError({code:'OPFS_QUOTA_LOW',requiredBytes:1024*1024*1024,availableBytes:100*1024*1024});el.dataset.state='error';
   },locale);
   const el=page.locator('#v3ImportSubtitlePlanStatus');await el.scrollIntoViewIfNeeded();
   const result=await el.evaluate(el=>({text:el.textContent,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
   assert.ok(!result.text.includes('studio.import.'));assert.ok(result.left>=0&&result.right<=width+1);
   await page.screenshot({path:`.tmp/subtitle-quota-${locale}-${width}.png`});
   console.log(JSON.stringify({locale,width,layout:true}));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
