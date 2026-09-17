// Local product-shell smoke. Synthetic revision history; no owner data or providers.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({serviceWorkers:'block'});
 await page.goto('http://localhost:3000/?subtitle-status=581',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.SubtitleTimingStatus&&window.StudyVideoSourceUI);
 await page.evaluate(()=>{
  const bar=document.createElement('section');bar.id='timing-status-fixture';
  bar.style.cssText='position:fixed;inset:60px 12px auto;z-index:2147483647;background:white;color:#17232b;padding:16px;border:1px solid #777';
  document.body.append(bar);
  window.__subtitleState='unverified';
  StudioMediaPackage.browserRepository=()=>({getTextBinding:async()=>({revision_id:'raw'}),getRevision:async()=>({
   provenance:{captions:{origin:'container-track',source_sha256:'a'.repeat(64),subtitle_track_sha256:'b'.repeat(64),audio_stream_index:2,
    subtitle_sync:{schema:'subtitle-speech-sync-v1',status:window.__subtitleState,apply_offset_ms:0,input_sha256:'c'.repeat(64),source_sha256:'a'.repeat(64),subtitle_sha256:'b'.repeat(64),audio_stream_index:2}}}
  })});
 });
 for(const locale of ['ru','he'])for(const width of [380,1280]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(locale=>{appSetLocale(locale);window.__subtitleState='unverified';StudyVideoSourceUI.playerActions(document.getElementById('timing-status-fixture'),{id:'fixture',local:true});},locale);
  const note=page.locator('#timing-status-fixture [data-subtitle-timing-status]');
  await note.waitFor();assert.equal(await note.getAttribute('data-subtitle-timing-status'),'unverified');
  const bounds=await note.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
  await page.screenshot({path:`.tmp/subtitle-status-${locale}-${width}.png`});
  await page.evaluate(()=>{window.__subtitleState='aligned';StudyVideoSourceUI.playerActions(document.getElementById('timing-status-fixture'),{id:'fixture',local:true});});
  await page.waitForFunction(()=>document.querySelector('#timing-status-fixture [data-subtitle-timing-status]')?.dataset.subtitleTimingStatus==='aligned');
  assert.equal(await note.count(),1);
  console.log(JSON.stringify({locale,width,statuses:['unverified','aligned']}));
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
