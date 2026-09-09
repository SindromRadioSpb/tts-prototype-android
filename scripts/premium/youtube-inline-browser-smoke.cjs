'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3336';
const video=process.env.STUDY_VIDEO_ID||'iG9CE55wbtY';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],browserLogs=[];
try{
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1180,height:900}}),page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))browserLogs.push(m.type()+': '+m.text());});
  async function sourceSelectorState(prefix){return page.locator('#'+prefix+'MediaBar .playback-source-actions').evaluate(actions=>({links:actions.querySelectorAll('a').length,labels:[...actions.querySelectorAll('[data-playback-source]')].map(button=>button.textContent),sources:[...actions.querySelectorAll('[data-playback-source]')].map(button=>button.dataset.playbackSource),pressed:[...actions.querySelectorAll('[data-playback-source][aria-pressed="true"]')].map(button=>button.dataset.playbackSource),group:actions.querySelector('[role="group"]')?.getAttribute('aria-label')}));}
 await page.addInitScript(()=>{for(const key of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(key,'1');});
 await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof ensureLocalDB==='function' && !!window.StudyVideoSourceUI);
 const fixture=await page.evaluate(async video=>{
   const db=await ensureLocalDB();appSetLocale('ru');
   const rows=['שלום עולם','בוקר טוב','תודה רבה'].map((he,i)=>({id:'inline-row-'+i,he_plain:he,he_niqqud:he,ru:'Проверка строки '+i,translit:'shalom',edit_meta_json:{ru:{locked:true}}}));
   // A real local WAV in OPFS coexists with a selected YouTube source.
   const buffer=new ArrayBuffer(44+8000*2*30),d=new DataView(buffer);function str(o,s){for(let i=0;i<s.length;i++)d.setUint8(o+i,s.charCodeAt(i));}str(0,'RIFF');d.setUint32(4,buffer.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,8000,true);d.setUint32(28,16000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,buffer.byteLength-44,true);
   await MediaStore.saveMedia(buffer,'inline.wav');
   const audio={v:1,video:{videoId:video},media:{opfsPath:'inline.wav',mime:'audio/wav',sha256:await MediaStore.sha256Hex(buffer),durationSec:30},segments:rows.map((r,i)=>({start_ms:[2,12,24][i]*1000,end_ms:[4,14,26][i]*1000,text:r.he_plain,caption_segment_id:'cue-'+i,quality_flags:[]})),timing:true};
   MediaHost.restoreForRows(audio,rows.map(r=>({he:r.he_plain})));audio.timing.entries.forEach((entry,i)=>entry.end=[4,14,26][i]);
   await db.createText({id:'inline',text_key:'inline-key',title:'Inline YouTube fixture',source_text:rows.map(r=>r.he_plain).join('\n'),source_meta_json:JSON.stringify({source:{audio}})});await db.addSentences('inline',rows);
   const c=await StudyVideoSourceUI.context('inline');if(!c.basis)throw new Error('NO_TIMING');
   await PlaybackSource.createRepository(db).save('inline',{url:'https://youtu.be/'+video,confirmed:true},{expected_revision:0,basis_sha256:c.basis});
   await v3LibraryOpenText('inline');
   return {rows:await db.getSentences('inline'),reviews:await db.dbQuery('SELECT * FROM review_log'),source: (await db.getTextById('inline')).source_meta_json};
 },video);
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='youtube' && ((!!document.querySelector('#v3MediaYtMount iframe') && StudioMediaKaraoke.getAudioEl()?.isYouTube)||!!document.querySelector('#v3MediaBarNote').dataset.youtubeError));
 assert.equal(await page.locator('#v3MediaPlayBtn').count(),0);
 if(process.env.STUDY_VIDEO_EXPECT_DENIED!=='1'){assert.equal(await page.locator('#v3MediaYtMount iframe').count(),1);assert.equal(await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().paused),true);}
  assert.deepEqual(await sourceSelectorState('v3'),{links:0,labels:['Локальный файл','YouTube-видео'],sources:['local','youtube'],pressed:['youtube'],group:'Источник воспроизведения'});
 assert.equal(await page.locator('#v3MediaLocalPlayer').isVisible(),false);
 assert.equal(await page.locator('#proTable .smk-row-replay').count(),3);
 // First switch, repeated switches, reopening and F5 retain exactly one selected source.
 for(let cycle=0;cycle<3;cycle++){
   await page.locator('[data-playback-source="local"]').click();
   await page.locator('#v3MediaLocalPlayer').waitFor({state:'visible'});
   assert.equal(await page.locator('#v3MediaYtMount').isVisible(),false);
   assert.equal(await page.locator('#v3MediaYtMount iframe').count(),0);
   assert.equal(await page.locator('#proTable .smk-row-replay').count(),3);
   if(cycle===0){
     await page.reload({waitUntil:'domcontentloaded'});
     await page.locator('#v3MediaLocalPlayer').waitFor({state:'visible'});
     assert.deepEqual((await sourceSelectorState('v3')).pressed,['local']);
     assert.equal(await page.locator('#v3MediaYtMount iframe').count(),0);
     await page.evaluate(()=>v3LibraryOpenText('inline'));
     await page.locator('#v3MediaLocalPlayer').waitFor({state:'visible'});
     assert.deepEqual((await sourceSelectorState('v3')).pressed,['local']);
   }
   await page.locator('[data-playback-source="youtube"]').click();
   await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='youtube'&&!!StudioMediaKaraoke.getAudioEl()?.isYouTube);
   assert.equal(await page.locator('#v3MediaYtMount iframe').count(),1);
   assert.equal(await page.locator('#v3MediaLocalPlayer').isVisible(),false);
 }
 // Saving a source refreshes the open player immediately, including a pending mapping.
 await page.evaluate(()=>v3TextMetaOpen('inline'));
 await page.locator('#v3TextMetaVideoSource').waitFor({state:'visible'});
 assert.equal(await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'Источник видео',exact:true}).count(),0);
 await page.locator('#v3TextMetaVideoSource').click();
 await page.locator('dialog.study-source-dialog input[type=checkbox]').uncheck();
 await page.locator('dialog.study-source-dialog').getByRole('button',{name:'Сохранить привязку',exact:true}).click();
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackReason==='PLAYBACK_TIMING_UNVERIFIED');
 assert.equal(await page.locator('#proTable .smk-row-replay').count(),0);
 await page.locator('dialog.study-source-dialog input[type=checkbox]').check();
 await page.locator('dialog.study-source-dialog').getByRole('button',{name:'Сохранить привязку',exact:true}).click();
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackReason===null && document.querySelectorAll('#proTable .smk-row-replay').length===3);
 await page.locator('dialog.study-source-dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.evaluate(()=>v3TextMetaClose());
 fixture.source=await page.evaluate(async()=>(await (await ensureLocalDB()).getTextById('inline')).source_meta_json);
 await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl()||!!document.querySelector('#v3MediaBarNote').dataset.youtubeError,null,{timeout:35000});
 if(process.env.STUDY_VIDEO_EXPECT_DENIED==='1'){
   for(const surface of ['studio','room']){
     const prefix=surface==='studio'?'v3':'room';
     if(surface==='room'){await page.goto(origin+'/study-library.html?canon=skip&open=inline-key');await page.waitForFunction(()=>!!document.querySelector('#roomMediaBarNote').dataset.youtubeError,null,{timeout:35000});}
     await page.waitForFunction(id=>!!document.getElementById(id).dataset.youtubeError,prefix+'MediaBarNote',{timeout:35000});
      const code=await page.locator('#'+prefix+'MediaBarNote').getAttribute('data-youtube-error');assert.ok(['101','150'].includes(code),JSON.stringify({surface,code,note:await page.locator('#'+prefix+'MediaBarNote').textContent()}));
      assert.equal((await sourceSelectorState(prefix)).links,0);
     assert.equal(await page.locator('#proTable tbody tr').count(),3);
     await page.locator('#'+prefix+'MediaBar .playback-source-actions').getByRole('button',{name:'Локальный файл',exact:true}).click();
     await page.locator('#'+prefix+'MediaLocalPlayer').waitFor({state:'visible'});
   }
   const after=await page.evaluate(async()=>({rows:await __localDB.getSentences('inline'),reviews:await __localDB.dbQuery('SELECT * FROM review_log'),source:(await __localDB.getTextById('inline')).source_meta_json}));assert.deepEqual(after,fixture);
   console.log(JSON.stringify({ok:true,video,embedDenied:true,localFallback:['studio','room'],rowsAndReviewsUnchanged:true}));return;
 }
 if(!await page.evaluate(()=>!!StudioMediaKaraoke.getAudioEl()))throw new Error(await page.locator('#v3MediaBarNote').textContent());
 const results=[];
 async function nativePlay(surface){
   const mount=surface==='studio'?'#v3MediaYtMount':'#roomMediaYtMount',iframe=page.locator(mount+' iframe');await iframe.scrollIntoViewIfNeeded();
   const resumed=await page.evaluate(()=>Number(StudioMediaKaraoke.getAudioEl()?.currentTime||0)>0);
   const selector=resumed?'.player-control-play-pause-icon:visible,.ytp-play-button:visible':'.ytmCuedOverlayPlayButton:visible,.ytp-large-play-button:visible,.player-control-play-pause-icon:visible,.ytp-play-button:visible';
   const control=page.frameLocator(mount+' iframe').locator(selector).first();
   if(await control.count())await control.click();else{const box=await iframe.boundingBox();assert.ok(box,surface+' YouTube player is visible');await page.mouse.click(box.x+box.width/2,box.y+box.height/2);}
 }
 async function replay(surface){
   await page.evaluate(async()=>{const a=StudioMediaKaraoke.getAudioEl();StudioMediaKaraoke.pause();await a.seekAndWait(1.5);StudioMediaKaraoke.syncCurrent();});
   const nativeStart=await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().currentTime);
   await nativePlay(surface);
   await page.waitForFunction(()=>{const a=StudioMediaKaraoke.getAudioEl();return a&&!a.paused&&a.currentTime>=2&&a.currentTime<4&&!!document.querySelector('tr[data-row-idx="0"].smk-row-active');},null,{timeout:15000});
   results.push({surface,nativePlayerFollow:true,from:nativeStart,to:await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().currentTime),activeRow:0});
   await page.evaluate(()=>StudioMediaKaraoke.pause());
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
   await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().play());
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
   await page.locator('#v3MediaBar').evaluate(node=>node.scrollIntoView({block:'start'}));await page.evaluate(()=>window.scrollBy(0,-100));await page.waitForTimeout(500);await page.screenshot({path:'artifacts/youtube-inline/studio-'+lang+'-380.png'});
 }
 await page.evaluate(()=>appSetLocale('ru'));await page.setViewportSize({width:1180,height:900});
 await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'Локальный файл',exact:true}).click();
 await page.locator('#v3MediaLocalPlayer').waitFor({state:'visible'});assert.equal(await page.locator('#v3MediaYtMount iframe').count(),0);
 assert.deepEqual((await sourceSelectorState('v3')).pressed,['local']);
 await page.evaluate(async()=>{const a=StudioMediaKaraoke.getAudioEl();a.currentTime=1.5;await a.play();});
 await page.waitForFunction(()=>{const a=StudioMediaKaraoke.getAudioEl();return a&&!a.paused&&a.currentTime>=2&&a.currentTime<4&&!!document.querySelector('tr[data-row-idx="0"].smk-row-active');},null,{timeout:10000});
 results.push({surface:'studio-local',nativeMediaFollow:true,activeRow:0});
 await page.evaluate(()=>StudioMediaKaraoke.pause());
 await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'YouTube-видео',exact:true}).click();
 await page.waitForFunction(()=>v3MediaCurrentAudio()?.playbackKind==='youtube' && !!document.querySelector('#v3MediaYtMount iframe') && StudioMediaKaraoke.getAudioEl()?.isYouTube);
 assert.equal(await page.locator('#v3MediaYtMount iframe').count(),1);
 assert.equal(await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().paused),true);
 assert.deepEqual((await sourceSelectorState('v3')).pressed,['youtube']);
 const after=await page.evaluate(async()=>{const db=await ensureLocalDB();return {rows:await db.getSentences('inline'),reviews:await db.dbQuery('SELECT * FROM review_log'),source:(await db.getTextById('inline')).source_meta_json};});assert.deepEqual(after,fixture);
 // Same OPFS card through the compatible full Studio shell.
 // Reproduce the owner's F5 failure: the generic Classic cache belongs to a
 // different task, while the saved session and card-scoped cache point here.
 await page.evaluate(()=>{
  localStorage.setItem('ttsDashboard_text_v1','PHYSICS_SENTINEL_TEXT');
  localStorage.setItem('ttsDashboard_table_cache_v1',JSON.stringify({text:'PHYSICS_SENTINEL_TEXT',rows:[{he:'PHYSICS_SENTINEL_ROW',heNiqqud:'PHYSICS_SENTINEL_ROW',tr:'',ru:'wrong cached task'}]}));
 });
 await page.addInitScript(()=>{
  window.__tablePaints=[];
  new MutationObserver(records=>{for(const record of records)for(const added of record.addedNodes){
   const rows=[];
   if(added.nodeType===1 && added.matches?.('#proTable tbody tr'))rows.push(added);
   if(added.nodeType===1)rows.push(...added.querySelectorAll?.('#proTable tbody tr')||[]);
   for(const row of rows){const value=row.innerText||row.textContent||'';if(value&&!window.__tablePaints.includes(value))window.__tablePaints.push(value);}
  }})
    .observe(document,{subtree:true,childList:true});
 });
 // A late image intentionally never finishes. The real app must restore on
 // DOM readiness instead of waiting for an unrelated resource to release
 // window.load (the production regression this gate was added for).
 await page.route('**/__linguistpro_load_stall__',()=>{});
 await page.addInitScript(()=>{
  if(location.pathname!=='/study-studio.html')return;
  document.addEventListener('DOMContentLoaded',()=>{
   const img=document.createElement('img');
   img.hidden=true;
   img.alt='';
   img.src='/__linguistpro_load_stall__';
   document.body.appendChild(img);
  },{once:true});
 });
 await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'Локальный файл',exact:true}).click();
 await page.locator('#v3MediaLocalPlayer').waitFor({state:'visible'});
 await page.evaluate(()=>{StudioYtPlayer.capability=()=>({supported:false});});
 await page.evaluate(async()=>{
  const db=await ensureLocalDB();
  const physicsRows=Array.from({length:16},(_,index)=>({id:'physics-row-'+index,he_plain:'PHYSICS_IDE_SENTINEL_ROW_'+index,he_niqqud:'PHYSICS_IDE_SENTINEL_ROW_'+index,ru:'wrong IDE task '+index,translit:'physics'}));
  await db.createText({id:'physics-card',text_key:'physics-key',title:'Physics 1.1',source_text:'PHYSICS_SENTINEL_TEXT'});
  await db.addSentences('physics-card',physicsRows);
  localStorage.setItem('v3_ide_mode_enabled','1');
  localStorage.setItem('v3_ide_state_v1',JSON.stringify({leftTab:'search',rightTab:'notes',leftOpen:true,rightOpen:true,mobileInitCollapsed:false,selectedRowIdx:null,activeTextId:'physics-card',searchQuery:'',searchScope:'both'}));
 });
 await page.locator('#v3MediaBar .playback-source-actions').getByRole('button',{name:'YouTube-видео',exact:true}).click();await page.waitForURL('**/study-studio.html',{waitUntil:'domcontentloaded'});
 async function waitForRestored(label){await page.waitForFunction(()=>{const ide=document.body.classList.contains('v3-ide-mode');const rows=ide?document.querySelectorAll('#v3IdeCenterContent #proTable tbody tr').length:document.querySelectorAll('#tableContainer #proTable tbody tr').length;return v3MediaCurrentAudio()?.playbackKind==='youtube'&&rows===3;},null,{timeout:15000}).catch(async e=>{console.log({label,browserLogs:browserLogs.slice(-20),state:await page.evaluate(async()=>{let context;try{const c=await StudyVideoSourceUI.context('inline');context={audio:!!c.audio,record:!!c.record,sourceMeta:c.card.source_meta_json,basis:c.basis};}catch(error){context={error:error.message,stack:error.stack};}return{session:v3SessionGet(),rows:document.querySelectorAll('#proTable tbody tr').length,ideRows:document.querySelectorAll('#v3IdeCenterContent #proTable tbody tr').length,base:window.v3ActiveMediaAudio,playback:v3MediaCurrentAudio(),context,text:document.getElementById('v3MediaBarNote').textContent};})});throw e;});const paints=await page.evaluate(()=>window.__tablePaints||[]);assert.equal(paints.some(value=>value.includes('PHYSICS_SENTINEL_ROW')||value.includes('PHYSICS_IDE_SENTINEL_ROW')),false,label+' must never paint an unrelated Classic cache or stale IDE card');}
 await waitForRestored('compatible-0');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('v3_ide_state_v1')).activeTextId),'inline');
 assert.equal(await page.evaluate(()=>crossOriginIsolated),false);
 assert.equal(await page.evaluate(async()=>!!(await (await ensureLocalDB()).getTextById('inline'))),true);
 await page.evaluate(()=>{localStorage.setItem('v3_ide_mode_enabled','0');v3NavAwayWithDbClose('/index.html');});
  await page.waitForURL('**/index.html',{waitUntil:'domcontentloaded'});await waitForRestored('classic-after-ide-conflict');
  for(let cycle=1;cycle<=3;cycle++){
  await page.evaluate(()=>v3NavAwayWithDbClose('/study-studio.html'));
  await page.waitForURL('**/study-studio.html',{waitUntil:'domcontentloaded'});await waitForRestored('compatible-'+cycle);
  await page.evaluate(()=>v3NavAwayWithDbClose('/index.html'));
  await page.waitForURL('**/index.html',{waitUntil:'domcontentloaded'});await waitForRestored('isolated-'+cycle);
 }
 await page.goto(origin+'/study-library.html?canon=skip&open=inline-key');await page.locator('#roomMediaYtMount iframe').waitFor({state:'visible'});
 assert.equal(await page.locator('#roomMediaPlayBtn').count(),0);
 await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl(),null,{timeout:35000});
 assert.equal(await page.locator('#roomMediaYtMount iframe').count(),1);
 assert.equal(await page.evaluate(()=>StudioMediaKaraoke.getAudioEl().paused),true);
 const roomWidths=await page.evaluate(()=>{const box=id=>document.getElementById(id).getBoundingClientRect().width;return{bar:box('roomMediaBar'),mount:box('roomMediaYtMount'),iframe:document.querySelector('#roomMediaYtMount iframe').getBoundingClientRect().width,table:box('roomReaderTable')};});
 assert.ok(roomWidths.mount>=roomWidths.bar*.9,JSON.stringify(roomWidths));
 assert.ok(roomWidths.iframe>=roomWidths.mount*.98,JSON.stringify(roomWidths));
 results.push({surface:'room',youtubeFullWidth:roomWidths});
 assert.deepEqual(await sourceSelectorState('room'),{links:0,labels:['Локальный файл','YouTube-видео'],sources:['local','youtube'],pressed:['youtube'],group:'Источник воспроизведения'});
 assert.equal(await page.locator('#proTable .smk-row-replay').count(),3);
 await replay('room');
 fs.mkdirSync('artifacts/youtube-inline',{recursive:true});
 for(const lang of ['ru','he']){
   await page.evaluate(l=>localStorage.setItem('app.locale',l),lang);await page.reload({waitUntil:'load'});
   await page.locator('#roomMediaBar .playback-source-actions').waitFor({state:'visible'});await page.setViewportSize({width:380,height:820});
   await page.locator('#roomMediaYtMount iframe').waitFor({state:'visible'});await page.waitForFunction(()=>!!StudioMediaKaraoke.getAudioEl(),null,{timeout:35000});assert.equal(await page.locator('#roomMediaYtMount iframe').count(),1);
   await page.locator('#proTable tr[data-row-idx="0"] .smk-row-replay').click();await page.waitForFunction(()=>StudioMediaKaraoke.getAudioEl()?.currentTime>2,null,{timeout:15000});
   await page.evaluate(()=>StudioMediaKaraoke.pause());await page.screenshot({path:'artifacts/youtube-inline/room-'+lang+'-380.png'});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,results,errors}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
