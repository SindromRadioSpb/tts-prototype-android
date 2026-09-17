const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({serviceWorkers:'block'});
 await page.addInitScript(()=>{localStorage.setItem('localMode','1');localStorage.setItem('v3OnboardingSeenV1','1');});
 await page.goto('http://localhost:3000/?local-timing=580',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StudyTimingRepair&&window.StudyVideoSourceUI);
 await page.evaluate(()=>{
  const sha='a'.repeat(64),revision={revision_id:'r',segments:[{text:'שלום',start_ms:1000,end_ms:2000,authority:{timing:'source'}}]},binding={package_id:'p',track_id:'t',revision_id:'r'};
  const card={source_meta_json:JSON.stringify({source:{audio:{captions:{subtitle_sync:{status:'unverified'}}}}})},rows=[{he_plain:'שלום',translation:'Привет'}],media={media_sha256:sha,duration_ms:10000,mime:'audio/wav'};
  const repo={getTextBinding:async()=>binding,getRevision:async()=>revision,getPackage:async()=>media,commitTimingRepair:async input=>{window.__savedTiming=input.segments;return {};}};
  StudioMediaPackage.browserRepository=()=>repo;
  StudioMediaPackage.buildCompatibilityProjection=()=>({captions:{segments:revision.segments}});
  StudioMediaPackage.verifiedRowMapping=()=>({rows:[]});
  StudyVideoSourceUI.context=async()=>({card,rows,record:null,ldb:{dbQuery:async()=>rows,dbRun:async()=>{},execRaw:async()=>{}},audio:{media:{sha256:sha}}});
  MediaHost.createBlobResolver=()=>({resolve:async()=>{const b=new ArrayBuffer(44+16000*2*10),v=new DataView(b);function str(i,s){for(let j=0;j<s.length;j++)v.setUint8(i+j,s.charCodeAt(j));}str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,b.byteLength-44,true);return new Blob([b],{type:'audio/wav'});}});
  window.__remoteCalls=[];const fetchOriginal=window.fetch;window.fetch=(url,...args)=>{if(/gemini|youtube\/|translate/.test(String(url)))window.__remoteCalls.push(String(url));return fetchOriginal(url,...args);};
 });
 for(const locale of ['ru','he'])for(const width of [380,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(async locale=>{window.__savedTiming=null;appSetLocale(locale);await StudyTimingRepair.open('local-fixture');},locale);
  const dialog=page.locator('dialog.study-source-dialog');
  assert.equal(await dialog.locator('[data-action="full"]').isVisible(),false);
  assert.equal(await dialog.locator('[data-action="recover"]').isEnabled(),false);
  const inputs=dialog.locator('input[type=number]');assert.equal(await inputs.count(),4);
  await inputs.nth(1).fill('1.5');await inputs.nth(2).fill('2.5');
  await dialog.getByRole('button',{name:locale==='ru'?'Применить время к реплике':'החלת התזמון על הקטע',exact:true}).click();
  assert.equal(await dialog.locator('[data-action="recover"]').isEnabled(),false);
  await dialog.locator('input[type=checkbox]').check();
  assert.equal(await dialog.locator('[data-action="recover"]').isEnabled(),true);
  await dialog.getByRole('button',{name:locale==='ru'?'Прослушать интервал':'האזנה לקטע',exact:true}).click();
  await page.waitForFunction(()=>{const a=document.querySelector('dialog audio');return a?.paused&&a.currentTime>=2.5;});
  await dialog.getByRole('button',{name:locale==='ru'?'Применить сдвиг':'החלת ההזזה',exact:true}).scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:`.tmp/local-timing-${locale}-${width}.png`});
  const bounds=await dialog.evaluate(d=>({left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right}));assert.ok(bounds.left>=0&&bounds.right<=width+1);
  await dialog.locator('[data-action="recover"]').click();
  await page.waitForFunction(()=>window.__savedTiming||document.querySelector('dialog [role=status]')?.dataset.code);
  console.log(await dialog.locator('[role=status]').evaluate(e=>({text:e.textContent,code:e.dataset.code})));
  assert.equal(await page.evaluate(()=>window.__savedTiming[0].start_ms),1500);
  assert.equal(await page.evaluate(()=>window.__savedTiming[0].text),'שלום');
  await dialog.locator('[data-action="close"]').click();
  console.log(JSON.stringify({locale,width,manualSave:true}));
 }
 assert.deepEqual(await page.evaluate(()=>window.__remoteCalls),[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
