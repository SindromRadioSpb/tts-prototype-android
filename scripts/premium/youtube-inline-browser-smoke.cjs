'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3336';
const video=process.env.STUDY_VIDEO_ID||'iG9CE55wbtY';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1180,height:900}}),page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{for(const key of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(key,'1');});
 await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof ensureLocalDB==='function' && !!window.StudyVideoSourceUI);
 const fixture=await page.evaluate(async video=>{
   const db=await ensureLocalDB();appSetLocale('ru');
   const rows=['שלום עולם','בוקר טוב','תודה רבה'].map((he,i)=>({id:'inline-row-'+i,he_plain:he,he_niqqud:he,ru:'Проверка строки '+i,translit:'shalom',edit_meta_json:{ru:{locked:true}}}));
   // A real local WAV in OPFS coexists with a selected YouTube source.
   const buffer=new ArrayBuffer(44+8000*2),d=new DataView(buffer);function str(o,s){for(let i=0;i<s.length;i++)d.setUint8(o+i,s.charCodeAt(i));}str(0,'RIFF');d.setUint32(4,buffer.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,8000,true);d.setUint32(28,16000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,16000,true);
   await MediaStore.saveMedia(buffer,'inline.wav');
   const audio={v:1,media:{opfsPath:'inline.wav',mime:'audio/wav',sha256:await MediaStore.sha256Hex(buffer),durationSec:1},segments:rows.map((r,i)=>({start_ms:[2,12,24][i]*1000,end_ms:[4,14,26][i]*1000,text:r.he_plain,caption_segment_id:'cue-'+i,quality_flags:[]})),timing:true};
   MediaHost.restoreForRows(audio,rows.map(r=>({he:r.he_plain})));audio.timing.entries.forEach((entry,i)=>entry.end=[4,14,26][i]);
   await db.createText({id:'inline',text_key:'inline-key',title:'Inline YouTube fixture',source_text:rows.map(r=>r.he_plain).join('\n'),source_meta_json:JSON.stringify({source:{audio}})});await db.addSentences('inline',rows);
   const c=await StudyVideoSourceUI.context('inline');if(!c.basis)throw new Error('NO_TIMING');
   await PlaybackSource.createRepository(db).save('inline',{url:'https://youtu.be/'+video,confirmed:true},{expected_revision:0,basis_sha256:c.basis});
   await v3LibraryOpenText('inline');
   return {rows:await db.getSentences('inline'),reviews:await db.dbQuery('SELECT * FROM review_log'),source: (await db.getTextById('inline')).source_meta_json};
 },video);
 await page.waitForFunction(()=>document.querySelector('#v3MediaPlayBtn')?.hidden===false && v3MediaCurrentAudio()?.playbackKind==='youtube');
 assert.equal(await page.locator('#v3MediaLocalPlayer').isVisible(),false);
 assert.equal(await page.locator('#proTable .smk-row-replay').count(),3);
 // Saving a source refreshes the open player immediately, including a pending mapping.
 await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'Источник видео',exact:true}).click();
 await page.locator('dialog.study-source-dialog input[type=checkbox]').uncheck();
 await page.locator('dialog.study-source-dialog').getByRole('button',{name:'Сохранить привязку',exact:true}).click();
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackReason==='PLAYBACK_TIMING_UNVERIFIED');
 assert.equal(await page.locator('#proTable .smk-row-replay').count(),0);
 await page.locator('dialog.study-source-dialog input[type=checkbox]').check();
 await page.locator('dialog.study-source-dialog').getByRole('button',{name:'Сохранить привязку',exact:true}).click();
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackReason===null && document.querySelectorAll('#proTable .smk-row-replay').length===3);
 await page.locator('dialog.study-source-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
 fixture.source=await page.evaluate(async()=>(await (await ensureLocalDB()).getTextById('inline')).source_meta_json);
 await page.locator('#v3MediaPlayBtn').click();
 await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl()||!!document.querySelector('#v3MediaBarNote').dataset.youtubeError,null,{timeout:35000});
 if(process.env.STUDY_VIDEO_EXPECT_DENIED==='1'){
   for(const surface of ['studio','room']){
     const prefix=surface==='studio'?'v3':'room';
     if(surface==='room'){await page.goto(origin+'/study-library.html?canon=skip&open=inline-key');await page.locator('#roomMediaPlayBtn').click();await page.waitForFunction(()=>!!document.querySelector('#roomMediaBarNote').dataset.youtubeError,null,{timeout:35000});}
     await page.waitForFunction(id=>!!document.getElementById(id).dataset.youtubeError,prefix+'MediaBarNote',{timeout:35000});
     const code=await page.locator('#'+prefix+'MediaBarNote').getAttribute('data-youtube-error');assert.ok(['101','150'].includes(code),JSON.stringify({surface,code,note:await page.locator('#'+prefix+'MediaBarNote').textContent()}));
     assert.equal(await page.locator('#proTable tbody tr').count(),3);
     await page.locator('#'+prefix+'MediaBar .playback-source-actions').getByRole('button',{name:'Локальный файл',exact:true}).click();
     await page.locator('#'+prefix+'MediaLocalPlayer').waitFor({state:'visible'});
   }
   const after=await page.evaluate(async()=>({rows:await __localDB.getSentences('inline'),reviews:await __localDB.dbQuery('SELECT * FROM review_log'),source:(await __localDB.getTextById('inline')).source_meta_json}));assert.deepEqual(after,fixture);
   console.log(JSON.stringify({ok:true,video,embedDenied:true,localFallback:['studio','room'],rowsAndReviewsUnchanged:true}));return;
 }
 if(!await page.evaluate(()=>!!StudioMediaKaraoke.getAudioEl()))throw new Error(await page.locator('#v3MediaBarNote').textContent());
 const results=[];
 async function replay(surface){
   const mount=surface==='studio'?'#v3MediaYtMount':'#roomMediaYtMount';
   const play=page.frameLocator(mount+' iframe').locator('.ytp-large-play-button');if(await play.isVisible())await play.click();
   for(const row of [2,0,1]){
     await page.locator('#proTable tr[data-row-idx="'+row+'"] .smk-row-replay').click();
     await page.waitForFunction(({row,t})=>{const a=StudioMediaKaraoke.getAudioEl();return a&&a.currentTime>=t&&a.currentTime<t+2&&!!document.querySelector('tr[data-row-idx="'+row+'"].smk-row-active');},{row,t:[2,12,24][row]},{timeout:15000}).catch(async e=>{console.log(await page.evaluate(()=>({t:StudioMediaKaraoke.getAudioEl()?.currentTime,paused:StudioMediaKaraoke.getAudioEl()?.paused,active:[...document.querySelectorAll('tr.smk-row-active')].map(x=>x.dataset.rowIdx),note:document.querySelector('#v3MediaBarNote')?.textContent})));throw e;});
     await page.waitForFunction(end=>{const a=StudioMediaKaraoke.getAudioEl();return a.paused&&a.currentTime>=end;},[4,14,26][row],{timeout:12000});
     results.push({surface,row,time:await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().currentTime)});
   }
   // Pause -> word morphology -> resume must keep the same full table and source clock.
   const word=page.locator('#proTable .rm-w').first();assert.ok(await word.count());await word.click();
   if(await page.locator('.room-consent-no').isVisible())await page.locator('.room-consent-no').click();
   await page.locator('.rm-sheet.rm-open').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().paused),true);
   await page.keyboard.press('Escape');
   const pausedAt=await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().currentTime);
   await page.locator(surface==='studio'?'#v3MediaPlayBtn':'#roomMediaPlayBtn').click();
   await page.waitForFunction(t=>{const a=StudioMediaKaraoke.getAudioEl();return a&&!a.paused&&a.currentTime>t+.3;},pausedAt,{timeout:15000});
   results.push({surface,morphologyPauseResume:true,from:pausedAt,to:await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().currentTime)});
   await page.evaluate(()=>StudioMediaKaraoke.pause());
 }
 await replay('studio');
 fs.mkdirSync('artifacts/youtube-inline',{recursive:true});
 for(const lang of ['ru','he']){
   await page.evaluate(l=>appSetLocale(l),lang);await page.setViewportSize({width:380,height:820});
   await page.locator('#v3MediaYtMount iframe').waitFor({state:'visible'});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.evaluate(()=>window.scrollTo(0,scrollY+document.getElementById('v3MediaYtMount').getBoundingClientRect().top-100));await page.screenshot({path:'artifacts/youtube-inline/studio-'+lang+'-380.png'});
 }
 await page.evaluate(()=>appSetLocale('ru'));await page.setViewportSize({width:1180,height:900});
 await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'Локальный файл',exact:true}).click();
 await page.locator('#v3MediaLocalPlayer').waitFor({state:'visible'});assert.equal(await page.locator('#v3MediaYtMount iframe').count(),0);
 await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'YouTube',exact:true}).click();
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='youtube');
 const after=await page.evaluate(async()=>{const db=await ensureLocalDB();return {rows:await db.getSentences('inline'),reviews:await db.dbQuery('SELECT * FROM review_log'),source:(await db.getTextById('inline')).source_meta_json};});assert.deepEqual(after,fixture);
 // Same OPFS card through the compatible full Studio shell.
 await page.evaluate(()=>{StudioYtPlayer.capability=()=>({supported:false});});
 await page.locator('#v3MediaPlayBtn').click();await page.waitForURL('**/study-studio.html');
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='youtube' && document.querySelectorAll('#proTable tbody tr').length===3).catch(async e=>{console.log(await page.evaluate(()=>({session:v3SessionGet(),rows:document.querySelectorAll('#proTable tbody tr').length,base:window.v3ActiveMediaAudio,playback:v3MediaCurrentAudio(),text:document.getElementById('v3MediaBarNote').textContent})));throw e;});
 assert.equal(await page.evaluate(()=>crossOriginIsolated),false);
 assert.equal(await page.evaluate(async()=>!!(await (await ensureLocalDB()).getTextById('inline'))),true);
 await page.goto(origin+'/study-library.html?canon=skip&open=inline-key');await page.locator('#roomMediaPlayBtn').waitFor({state:'visible'});
 assert.equal(await page.locator('#proTable .smk-row-replay').count(),3);
 await page.locator('#roomMediaPlayBtn').click();await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl(),null,{timeout:35000});await replay('room');
 fs.mkdirSync('artifacts/youtube-inline',{recursive:true});
 for(const lang of ['ru','he']){
   await page.evaluate(l=>localStorage.setItem('app.locale',l),lang);await page.reload({waitUntil:'load'});
   await page.locator('#roomMediaBar .playback-source-actions').waitFor({state:'visible'});await page.setViewportSize({width:380,height:820});
   await page.locator('#roomMediaPlayBtn').click();await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl(),null,{timeout:35000});
   await page.locator('#proTable tr[data-row-idx="0"] .smk-row-replay').click();await page.waitForFunction(()=>StudioMediaKaraoke.getAudioEl()?.currentTime>2,null,{timeout:15000});
   await page.evaluate(()=>StudioMediaKaraoke.pause());await page.screenshot({path:'artifacts/youtube-inline/room-'+lang+'-380.png'});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,results,errors}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
