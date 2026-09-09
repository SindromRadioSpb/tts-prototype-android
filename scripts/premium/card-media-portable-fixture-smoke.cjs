'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),Zip=require('adm-zip');
const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3340';
if(!process.argv[2])throw new Error('Pass the local learning-package ZIP path');
const zip=new Zip(process.argv[2]),files=Object.fromEntries(zip.getEntries().filter(e=>!e.isDirectory).map(e=>[e.entryName,e.getData().toString('utf8')]));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1180,height:900}}),page=await context.newPage();
  await page.addInitScript(()=>{for(const key of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(key,'1');});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/study-studio.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof ensureLocalDB==='function'&&!!window.StudyVideoSourceUI);
  const initial=await page.evaluate(async files=>{
   const db=await ensureLocalDB();appSetLocale('ru');
   const verified=await PortableLearningPackageCore.verifyPackageFiles(files),repo=PortableLearningPackageRepository.createRepository(db,PortableLearningPackageCore);
   const plan=await repo.dryRun(verified),result=await repo.applyVerified(verified,plan),id=result.receipt.id_map.text.local_id;
   await v3LibraryOpenText(id);
   const c=await StudyVideoSourceUI.context(id);
   return {id,rows:c.rows.length,coverage:MediaHost.replayCoverage(c.audio,c.rows.length),source:c.card.source_meta_json,reviews:await db.dbQuery('SELECT * FROM review_log')};
  },files);
  try { await page.waitForFunction(()=>!!window.v3YtStageAdapter||!!document.querySelector('#v3MediaBarNote')?.dataset.youtubeError,null,{timeout:35000}); }
  catch(error){console.log('player diagnostic',await page.evaluate(async()=>({sameBase:v3PlaybackBase===window.v3ActiveMediaAudio,kind:v3MediaCurrentAudio()?.playbackKind,projection:v3PlaybackAudio?.playbackReason,baseTiming:window.v3ActiveMediaAudio?.timing?.entries?.length,bar:document.querySelector('#v3MediaBar')?.outerHTML,session:v3SessionGet(),rows:currentTableData.length,errors:await v3MediaResolveBlob(v3PlaybackAudio).then(x=>!!x,e=>String(e))})));throw error;}
  const initialReason=await page.evaluate(()=>v3MediaCurrentAudio()?.playbackReason);
  if(initialReason){
   assert.equal(initialReason,'PLAYBACK_TIMING_CHANGED');
   assert.equal(await page.locator('#proTable .smk-row-replay').count(),0);
   // Isolated fixture only: exercise replay without changing the owner's confirmation.
   initial.source=await page.evaluate(async id=>{const c=await StudyVideoSourceUI.context(id),s=PlaybackSource.selected(c.record);await PlaybackSource.createRepository(c.ldb).save(id,{url:s.source.url,offset_ms:s.offset_ms,confirmed:true},{expected_revision:c.record.revision,basis_sha256:c.basis});await v3MediaBarRefresh();return (await c.ldb.getTextById(id)).source_meta_json;},initial.id);
   await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl()?.isYouTube||!!document.querySelector('#v3MediaBarNote')?.dataset.youtubeError);
  }
  await page.waitForFunction(n=>document.querySelectorAll('#proTable .smk-row-replay').length===n,initial.coverage.playable_rows);
  const denial=await page.locator('#v3MediaBarNote').getAttribute('data-youtube-error');
  if(denial)assert.ok(['101','150'].includes(denial),denial);
  else{
    await page.locator('#proTable .smk-row-replay').first().click();
    await page.waitForFunction(()=>{const a=StudioMediaKaraoke.getAudioEl();return a&&!a.paused;},null,{timeout:15000});
    await page.evaluate(()=>StudioMediaKaraoke.pause());
  }
  for(let cycle=0;cycle<3;cycle++){
   await page.locator('[data-playback-source="local"]').click();
   await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='local');
   assert.equal(await page.locator('#v3MediaYtMount iframe').count(),0);
   if(cycle===0){await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='local');}
   if(cycle<2){await page.locator('[data-playback-source="youtube"]').click();await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='youtube');}
  }
  await page.evaluate(id=>v3LibraryOpenText(id),initial.id);
  await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='local');
  const after=await page.evaluate(async id=>({source:(await __localDB.getTextById(id)).source_meta_json,reviews:await __localDB.dbQuery('SELECT * FROM review_log')}),initial.id);
  assert.equal(after.source,initial.source);assert.deepEqual(after.reviews,initial.reviews);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,rows:initial.rows,playable:initial.coverage.playable_rows,initialReason,fixtureOnlyConfirmation:!!initialReason,sourcePreservedAfterFixtureSetup:true,localPersists:true,repeatedSwitch:true,youtubeDenial:denial||null,realYoutubeRowReplay:!denial,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
