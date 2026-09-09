'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const ORIGIN=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3336';
const VIDEO=process.env.STUDY_VIDEO_ID||'djzKaEoqka8';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1180,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));fs.mkdirSync('artifacts/study-video',{recursive:true});
  try{
    await page.goto(ORIGIN+'/study-video.html');
    const id=await page.evaluate(async video=>StudyVideoTransfer.put({schema:1,video_id:video,title:'YouTube clock verification',locale:'ru',return_path:'/index.html',rows:[{he:'בדיקת זמן 1',ru:'Проверка часов: 2–4 секунды'},{he:'בדיקת זמן 2',ru:'Проверка часов: 12–14 секунд'},{he:'בדיקת זמן 3',ru:'Проверка часов: 24–26 секунд'}],entries:[{o:0,t:2,end:4},{o:1,t:12,end:14},{o:2,t:24,end:26}]}),VIDEO);
    await page.goto(ORIGIN+'/study-video.html#'+id);await page.waitForSelector('#proTable tbody tr');
    await page.getByRole('button',{name:'Открыть видео',exact:true}).click();
    await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl()||!!document.querySelector('#videoStatus').dataset.youtubeError,{},{timeout:35000});
    if(!await page.evaluate(()=>!!StudioMediaKaraoke.getAudioEl())){
      const status=await page.locator('#videoStatus').textContent(),code=await page.locator('#videoStatus').getAttribute('data-youtube-error');await page.screenshot({path:'artifacts/study-video/live-unavailable-'+VIDEO+'.png'});console.log(JSON.stringify({video:VIDEO,provider_ready:false,status,code,errors}));process.exitCode=2;return;
    }
    const frame=page.frameLocator('#videoMount iframe');
    const play=frame.locator('.ytp-large-play-button');
    if(await play.count())await play.click();else await page.locator('#videoMount iframe').click({position:{x:220,y:130}});
    await page.waitForFunction(()=>StudioMediaKaraoke.getAudioEl().currentTime>0,{},{timeout:20000});
    const t1=await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().currentTime);
    await page.waitForFunction(previous=>StudioMediaKaraoke.getAudioEl().currentTime>previous+1,t1,{timeout:15000});
    const results=[];
    for(const row of [2,0,1]){
      await page.locator('#proTable tbody tr').nth(row).getByRole('button').click();
      await page.waitForFunction(({row,target})=>{const a=StudioMediaKaraoke.getAudioEl();return a.currentTime>=target&&a.currentTime<target+2&&!!document.querySelector('tr[data-row-idx="'+row+'"].smk-row-active');},{row,target:[2,12,24][row]},{timeout:12000});
      const during=await page.evaluate(()=>({time:StudioMediaKaraoke.getAudioEl().currentTime,paused:StudioMediaKaraoke.getAudioEl().paused}));
      await page.waitForFunction(end=>{const a=StudioMediaKaraoke.getAudioEl();return a.paused && a.currentTime>=end;},[4,14,26][row],{timeout:12000});
      const after=await page.evaluate(()=>({time:StudioMediaKaraoke.getAudioEl().currentTime,paused:StudioMediaKaraoke.getAudioEl().paused,highlighted:document.querySelectorAll('tr.smk-row-active').length}));
      assert.equal(after.highlighted,0);results.push({row,during,after});
    }
    await page.screenshot({path:'artifacts/study-video/live-player.png'});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({provider_ready:true,clock_advances:true,replay:results,crossOriginIsolated:await page.evaluate(()=>crossOriginIsolated),pageErrors:errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
