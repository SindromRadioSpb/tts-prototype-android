'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
  const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3336';
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:380,height:820}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync('artifacts/study-video',{recursive:true});
  try{
    const response=await page.goto(origin+'/study-video.html');
    assert.equal(response.headers()['cross-origin-embedder-policy'],undefined);assert.equal(response.headers()['x-frame-options'],'DENY');
    assert.equal(await page.evaluate(()=>crossOriginIsolated),false);
    await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.length>0);
    for(const locale of ['ru','he']){
      const id=await page.evaluate(async locale=>StudyVideoTransfer.put({schema:1,title:locale==='he'?'וידאו ללימוד עברית':'Видео для изучения иврита',locale,video_id:'djzKaEoqka8',return_path:'/index.html',rows:[{he:'שלום וברוכים הבאים',ru:'Здравствуйте и добро пожаловать',tr:'shalom u-vrukhim ha-baim'},{he:'היום אנחנו לומדים עברית',ru:'Сегодня мы изучаем иврит'}],entries:[{o:0,t:0,end:2},{o:1,t:3,end:5}]}),locale);
      await page.goto(origin+'/study-video.html#'+id);await page.waitForSelector('#proTable tbody tr');
      assert.equal(await page.locator('#proTable tbody tr').count(),2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:'artifacts/study-video/'+locale+'-380.png',fullPage:true});
      await page.reload();await page.waitForSelector('#proTable tbody tr');assert.equal(await page.locator('#proTable tbody tr').count(),2);
      await context.setOffline(true);await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.length>0);
      assert.equal(await page.locator('#proTable tbody tr').count(),2);await context.setOffline(false);
    }
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
    await page.reload();await page.waitForSelector('#proTable tbody tr');
    await context.setOffline(true);await page.reload();await page.waitForSelector('#proTable tbody tr');
    assert.equal(await page.locator('#proTable tbody tr').count(),2);assert.equal(await page.evaluate(()=>crossOriginIsolated),false);
    await context.setOffline(false);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['ordinary-top-level','frame-deny','RU-380','HE-380-RTL','reload','offline-text','service-worker-offline-reload'],pageErrors:errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
