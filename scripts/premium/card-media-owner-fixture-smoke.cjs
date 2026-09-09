'use strict';
// Read an owner-exported text-card locally into an isolated browser profile.
// Existing unverified metadata must play by default without any confirmation or DB rewrite.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3340';
const source=process.argv[2];
if(!source)throw new Error('Pass the local exported text-card JSON path');
const card=JSON.parse(fs.readFileSync(source,'utf8')).card;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1180,height:900}}),page=await context.newPage();
  await page.addInitScript(()=>{for(const key of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(key,'1');});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+(process.env.CARD_FIX_SHELL||'/index.html'),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof ensureLocalDB==='function'&&!!window.StudyVideoSourceUI);
  const initial=await page.evaluate(async card=>{
   const db=await ensureLocalDB();appSetLocale('ru');
   const rows=card.rows.map((r,i)=>({id:'owner-fixture-'+i,he_plain:r.hebrew_plain,he_niqqud:r.hebrew_niqqud,ru:r.russian,translit:r.translit,edit_meta_json:r.edit_meta}));
   await db.createText({id:'owner-fixture',text_key:'owner-fixture-key',title:'Media regression fixture',source_text:card.source_text,source_meta_json:JSON.stringify(card.source_meta),table_model_meta_json:JSON.stringify(card.table_model_meta)});
   await db.addSentences('owner-fixture',rows);
   // A previously displayed unrelated card must not contaminate the new source projection.
   await db.createText({id:'unrelated',text_key:'unrelated-key',title:'Previous card',source_text:'שלום'});
   await db.addSentences('unrelated',[{id:'unrelated-row',he_plain:'שלום',ru:'Previous card'}]);
   await v3LibraryOpenText('unrelated');await v3LibraryOpenText('owner-fixture');
   const c=await StudyVideoSourceUI.context('owner-fixture');
   return {reason:v3MediaCurrentAudio()?.playbackReason,basis:!!c.basis,coverage:MediaHost.replayCoverage(c.audio,c.rows.length),rows:c.rows.length,reviews:await db.dbQuery('SELECT * FROM review_log'),source:(await db.getTextById('owner-fixture')).source_meta_json,sentences:await db.getSentences('owner-fixture')};
  },card);
  assert.equal(initial.reason,null);assert.equal(initial.basis,true);
  assert.ok(initial.coverage.playable_rows>0);
  await page.evaluate(()=>StudyVideoSourceUI.manage('owner-fixture'));
  assert.equal(await page.locator('dialog.study-source-dialog input[type=checkbox]').count(),0);
  await page.locator('dialog.study-source-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl()?.isYouTube||!!document.querySelector('#v3MediaBarNote')?.dataset.youtubeError,null,{timeout:35000}).catch(async error=>{
    console.log(await page.evaluate(()=>({note:document.querySelector('#v3MediaBarNote')?.textContent,kind:v3MediaCurrentAudio()?.playbackKind,reason:v3MediaCurrentAudio()?.playbackReason,rows:currentTableData.length,iframes:document.querySelectorAll('#v3MediaYtMount iframe').length,barHidden:document.querySelector('#v3MediaBar').hidden})));
    throw error;
  });
  assert.equal(await page.locator('#proTable tbody tr').count(),initial.rows);
  await page.waitForFunction(n=>document.querySelectorAll('#proTable .smk-row-replay').length===n,initial.coverage.playable_rows);
  const result=await page.evaluate(()=>({reason:v3MediaCurrentAudio().playbackReason,entries:v3MediaCurrentAudio().timing.entries.length,first:currentTableData[0].he}));
  assert.equal(result.reason,null);assert.equal(result.first,card.rows[0].hebrew_plain);
  // Native YouTube may require a first gesture; the ordinary user row action should advance it.
  let denied=await page.locator('#v3MediaBarNote').getAttribute('data-youtube-error');
  if(denied)assert.ok(['101','150'].includes(denied),denied);
  else{
    await page.locator('#proTable .smk-row-replay').first().click();
    await page.waitForFunction(()=>{const a=StudioMediaKaraoke.getAudioEl();return a&&!a.paused&&a.currentTime>8||document.querySelector('#v3MediaBarNote')?.dataset.youtubeError;},null,{timeout:15000});
    denied=await page.locator('#v3MediaBarNote').getAttribute('data-youtube-error');
    if(denied)assert.ok(['101','150'].includes(denied),denied);
  }
  await page.evaluate(()=>StudioMediaKaraoke.pause());
  await page.locator('[data-playback-source="local"]').click();
  await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='local');
  assert.equal(await page.locator('#v3MediaYtMount iframe').count(),0);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='local');
  assert.equal(await page.locator('#v3MediaYtMount iframe').count(),0);
  const after=await page.evaluate(async()=>({reviews:await __localDB.dbQuery('SELECT * FROM review_log'),coverage:MediaHost.replayCoverage(v3MediaCurrentAudio(),currentTableData.length)}));
  assert.deepEqual(after.reviews,initial.reviews);assert.equal(after.coverage.playable_rows,initial.coverage.playable_rows);
  assert.equal(await page.evaluate(async()=>(await __localDB.getTextById('owner-fixture')).source_meta_json),initial.source);
  assert.deepEqual(await page.evaluate(()=>__localDB.getSentences('owner-fixture')),initial.sentences);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,rows:initial.rows,playable:initial.coverage.playable_rows,defaultPlayback:true,noConfirmation:true,sourceRowsReviewsUnchanged:true,realYoutubeRowReplay:!denied,youtubeDenial:denied||null,localPersists:true,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
