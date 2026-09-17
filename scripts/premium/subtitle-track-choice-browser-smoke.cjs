// Real import UI with isolated track fixtures and a Companion I/O seam; no owner data.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await context.addInitScript(()=>{localStorage.setItem('localMode','1');localStorage.setItem('v3OnboardingSeenV1','1');});
  const source=fs.readFileSync('public/js/studio-import.js','utf8').replace(
   'toggleSubtitlePlanEditor: toggleSubtitlePlanEditor,',
   `toggleSubtitlePlanEditor: toggleSubtitlePlanEditor,
    __choiceFixture: function(state,tracks){
      pendingAudio={mediaJobId:'fixture',mediaReadiness:state};
      pendingSubtitleMaterial={tracks:tracks,failed:[]};
      localAsrClient={chooseMediaAudioStream:async function(){throw {code:'TEST_AUDIO_REJECTED'};}};
      renderSubtitlePlan();
    },
    __audioSuccess: function(){localAsrClient={chooseMediaAudioStream:async function(job,index){
      return {job_id:job,report:Object.assign({},pendingAudio.mediaReadiness,
        {audio_selection:{index:index,language:'he'},plan_sha256:'new-audio-plan'})};
    }};},
    __choiceState: function(lock){if(lock)pendingSubtitleMaterial.preparationPlan=pendingSubtitleMaterial.plan;
      renderSubtitlePlan();return pendingSubtitleMaterial.plan;},`);
  await page.route('**/js/studio-import.js*',r=>r.fulfill({contentType:'application/javascript',body:source}));
  await page.goto('http://localhost:3000/?track-choice=local',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StudioImport&&window.appSetLocale);
  for(const locale of ['ru','he'])for(const width of [380,1280]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(locale=>{
    appSetLocale(locale);StudioImport.open();StudioImport.switchTab('file');
    document.getElementById('v3ImportAudioInfo').hidden=false;
    document.getElementById('v3ImportMediaReadiness').hidden=false;
    const he=[{start:1,end:2,text:'שלום.'},{start:3,end:4,text:'מה נשמע?'}];
    const ru=[{start:1,end:2,text:'Привет.'},{start:3,end:4,text:'Как дела?'}];
    StudioImport.__choiceFixture({outcome:'READY',audio_selection:{index:2,language:'he'},
      track_inventory:{audio:[{index:1,language:'ru'},{index:2,language:'he'}]}},[
      {index:7,language:'he',cues:he},{index:9,language:'he',cues:he},
      {index:4,language:'ru',cues:ru},{index:10,language:'ru',cues:ru},
      {index:6,language:'he',disposition:{forced:1},cues:he.slice(0,1)}]);
   },locale);
   await page.locator('#v3ImportSubtitlePlanEdit').click();
   await page.locator('#v3ImportSubtitleEditText').selectOption('9');
   await page.locator('#v3ImportSubtitleEditTranslation').selectOption('10');
   const editor=page.locator('#v3ImportSubtitlePlanEditor');
   await editor.scrollIntoViewIfNeeded();
   const box=await editor.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);
   assert.ok(!(await editor.innerText()).includes('studio.import.'));
   await page.screenshot({path:`.tmp/subtitle-track-choice-${locale}-${width}.png`});
   await editor.locator('button').click();
   const plan=await page.evaluate(()=>StudioImport.__choiceState());
   assert.equal(plan.text.index,9);assert.equal(plan.translation.index,10);
   assert.deepEqual(plan.signal_track_indexes,[6]);assert.equal(plan.status,'ready');
   assert.equal(await editor.isVisible(),false);
   // A failed audio change must not commit the accompanying subtitle changes.
   await page.locator('#v3ImportSubtitlePlanEdit').click();
   await page.locator('#v3ImportSubtitleEditAudio').selectOption('1');
   await page.locator('#v3ImportSubtitleEditText').selectOption('7');
   await editor.locator('button').click();
   const failed=await page.evaluate(()=>StudioImport.__choiceState());
   assert.equal(failed.text.index,9);assert.equal(failed.audio.index,2);
   assert.match(await page.locator('#v3ImportSubtitlePlanStatus').innerText(),/TEST_AUDIO_REJECTED/);
   await page.evaluate(()=>StudioImport.__audioSuccess());
   await page.locator('#v3ImportSubtitleEditAudio').selectOption('1');
   await page.locator('#v3ImportSubtitleEditText').selectOption('7');
   await editor.locator('button').click();
   const changed=await page.evaluate(()=>StudioImport.__choiceState());
   assert.equal(changed.audio.index,1);assert.equal(changed.text.index,7);
   assert.equal(changed.plan_sha256,'new-audio-plan');
   await page.evaluate(()=>StudioImport.__choiceState(true));
   assert.equal(await page.locator('#v3ImportSubtitlePlanEdit').isDisabled(),true);
   assert.equal(await editor.isVisible(),false);
   console.log(JSON.stringify({locale,width,selection:true,audioFailureAtomic:true,preparedLocked:true}));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
