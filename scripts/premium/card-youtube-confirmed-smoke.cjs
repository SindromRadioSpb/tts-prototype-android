'use strict';
// Uses an owner-exported JSON only in a fresh test profile. Does not confirm/rewrite sources.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3340';
if(!process.argv[2])throw new Error('Pass a text-card JSON with an already confirmed YouTube source');
const card=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).card;
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.addInitScript(()=>{for(const k of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(k,'1');});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof ensureLocalDB==='function'&&!!window.StudyVideoSourceUI);
  const initial=await page.evaluate(async card=>{
   const db=await ensureLocalDB();
   await db.createText({id:'confirmed-fixture',text_key:'confirmed-fixture',title:'Confirmed timing regression',source_text:card.source_text,source_meta_json:JSON.stringify(card.source_meta),table_model_meta_json:JSON.stringify(card.table_model_meta)});
   await db.addSentences('confirmed-fixture',card.rows.map((r,i)=>({id:'confirmed-row-'+i,he_plain:r.hebrew_plain,he_niqqud:r.hebrew_niqqud,ru:r.russian,translit:r.translit,edit_meta_json:r.edit_meta})));
   await v3LibraryOpenText('confirmed-fixture');
   const c=await StudyVideoSourceUI.context('confirmed-fixture');
   const entries=c.audio.timing.entries;
   const timed=entries.map((e,i)=>({row:e.o,start:e.t,end:e.end??entries[i+1]?.t,blind:e.blind})).filter(e=>!e.blind&&e.end>e.start+.4&&e.end-e.start<12);
   const anchors=[2,0,1].map(row=>timed.find(e=>e.row===row));
   for(const ratio of [.5,.95])anchors.push(timed.reduce((a,b)=>Math.abs(b.row-c.rows.length*ratio)<Math.abs(a.row-c.rows.length*ratio)?b:a));
   return {anchors,basis:c.basis,savedBasis:PlaybackSource.selected(c.record).timing.basis_sha256,coverage:MediaHost.replayCoverage(c.audio,c.rows.length),source:(await db.getTextById('confirmed-fixture')).source_meta_json,rows:await db.getSentences('confirmed-fixture'),reviews:await db.dbQuery('SELECT * FROM review_log')};
  },card);
  assert.equal(initial.basis,initial.savedBasis,'opening must preserve the confirmed timing basis');
  if(process.env.CARD_SYNC_SCREENSHOTS){
   fs.mkdirSync(process.env.CARD_SYNC_SCREENSHOTS,{recursive:true});
   for(const locale of ['ru','he']){
    await page.evaluate(async locale=>{appSetLocale(locale);await StudyVideoSourceUI.manage('confirmed-fixture');},locale);
    await page.setViewportSize({width:380,height:844});
    const bounds=await page.locator('dialog.study-source-dialog').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=380,'source dialog must fit the mobile viewport');
    await page.locator('dialog.study-source-dialog').screenshot({path:process.env.CARD_SYNC_SCREENSHOTS+'/source-'+locale+'-380.png'});
    await page.evaluate(()=>document.querySelector('dialog.study-source-dialog').close());
   }
   await page.setViewportSize({width:1180,height:900});
   if(process.env.CARD_SYNC_SCREENSHOTS_ONLY==='1'){console.log(JSON.stringify({ok:true,screenshotsOnly:true,bindingPreserved:true}));return;}
  }
  await page.waitForFunction(n=>document.querySelectorAll('#proTable .smk-row-replay').length===n,initial.coverage.playable_rows);
  assert.equal(await page.evaluate(()=>v3MediaCurrentAudio().playbackReason),null);
  const replay=[];
  for(const anchor of initial.anchors){
   assert.ok(anchor,'fixture needs timed replay anchors');const {row,start,end}=anchor;
   await page.locator('#proTable tr[data-row-idx="'+row+'"] .smk-row-replay').click();
   await page.waitForFunction(()=>!!document.querySelector('#v3MediaBarNote').dataset.youtubeError||!!StudioMediaKaraoke.getAudioEl()?.isYouTube);
   const denial=await page.locator('#v3MediaBarNote').getAttribute('data-youtube-error');
   if(denial){replay.push({row,ok:false,denial});break;}
   await page.waitForFunction(({row,start,end})=>{const a=StudioMediaKaraoke.getAudioEl();return a&&!a.paused&&a.currentTime>start+.1&&a.currentTime<end&&document.querySelector('#proTable tr[data-row-idx="'+row+'"]')?.classList.contains('smk-row-active');},anchor,{timeout:20000});
   await page.waitForFunction(end=>{const a=StudioMediaKaraoke.getAudioEl();return a&&a.paused&&a.currentTime>=end;},end,{timeout:20000});
   const stopped=await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().currentTime);
   assert.ok(stopped<end+.75,'replay must stop near the actual next boundary');
   replay.push({row,start,end,stopped,ok:true});
  }
  await page.evaluate(()=>StudioMediaKaraoke.pause());
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='youtube');
  assert.equal(await page.evaluate(()=>v3MediaCurrentAudio().playbackReason),null);
  const after=await page.evaluate(async()=>({source:(await __localDB.getTextById('confirmed-fixture')).source_meta_json,rows:await __localDB.getSentences('confirmed-fixture'),reviews:await __localDB.dbQuery('SELECT * FROM review_log')}));
  assert.equal(after.source,initial.source);assert.deepEqual(after.rows,initial.rows);assert.deepEqual(after.reviews,initial.reviews);assert.deepEqual(errors,[]);
  const clockPass=replay.length===initial.anchors.length&&replay.every(r=>r.ok);
  console.log(JSON.stringify({ok:clockPass,bindingPreserved:true,sourceRowsReviewsUnchanged:true,coverage:initial.coverage,replay,errors}));
  if(!clockPass)process.exitCode=2;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
