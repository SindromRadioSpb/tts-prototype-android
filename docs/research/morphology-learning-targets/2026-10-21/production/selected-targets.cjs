'use strict';
// Disposable application storage and browser profiles; real resolver, OPFS and FSRS. No provider calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=process.cwd(),port=3339,base='https://linguistpro.kolosei.com',out=path.join(root,'.tmp/learning-targets-production');
fs.mkdirSync(out,{recursive:true});
const rows=[['שפחדת.','שֶׁפָּחַדְתָּ.','что ты боялся'],['תפחד.','תִּפְחַד.','ты будешь бояться / она будет бояться'],['פחדת.','פָּחַדְתָּ.','ты боялся']].map((r,i)=>({order_index:i,hebrew_plain:r[0],hebrew_niqqud:r[1],russian:r[2]}));
const snapshot={library:{texts:[{title:'Учебные цели: формы',text_key:'learning-targets-fixture',source_text:rows.map(r=>r.hebrew_plain).join('\n'),rows}]}};
const item={public_work_id:'work-1',position_no:1,title:'Учебные цели: формы',snapshot_sha256:'c'.repeat(64),public_read_allowed:1,public_stream_allowed:0,package_download_allowed:0,asset_missing:0,package_complete:0,expected_audio_count:0,included_audio_count:0};
const published={ok:true,corpus:{corpus_id:'pc_targets',slug:'test-targets',title:'Учебные цели'},edition:{edition_id:'ed_targets',edition_number:1,manifest_sha256:'b'.repeat(64),item_count:1,asset_count:0,asset_missing:0,package_complete:false},items:[item]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=null; // Published production assets; no remote server mutations.
 let logs='';
 let browser;
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch(_){}await sleep(200);}
  if(!ready)throw Error('Server not ready: '+logs.slice(-2000));
  browser=await chromium.launch();
  for(const surface of (process.env.LP_TARGET_SURFACES||'room,studio').split(',')){
   const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await context.newPage();
   const errors=[];let paid=0;page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(()=>{localStorage.setItem('room.wordStatus','1');localStorage.setItem('studio.wordStatus','1');localStorage.setItem('room.wordGlossAi','0');localStorage.setItem('studio.wordGlossAi','0');localStorage.setItem('room.contextConsent','declined');localStorage.setItem('app.locale','ru');});
   await context.route('**/api/word-gloss-ctx',r=>{paid++;return r.abort();});
   await context.route('**/api/tts',r=>{paid++;return r.abort();});
   await page.route('**/api/public-corpora',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,corpora:[published.corpus]})}));
   await page.route('**/api/public-corpora/test-targets**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().includes('/works/')?{...published,item:{...item,snapshot},assets:[]}:published)}));
   if(surface==='room'){
    await page.route('**/library.html?public_corpus=test-targets**',async r=>r.fulfill({response:await r.fetch({url:base+'/library.html'})}));
    await page.goto(base+'/library.html?public_corpus=test-targets&public_work=work-1&canon=skip&corpus=skip#room=public:test-targets',{waitUntil:'domcontentloaded'});
   }else{
    await page.goto(base+'/?canon=skip',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__localDB?.isReady()&&window.v3RenderTableFromLibrary&&window.StudioMorph,null,{timeout:60000});
    await page.evaluate(async bundle=>{await __localDB.importBundle(bundle,{mode:'skip'});const t=(await __localDB.listTexts({query:'Учебные цели: формы'}))[0],ss=await __localDB.getSentences(t.id);applyPreset('full');v3RenderTableFromLibrary(ss.map(r=>({he:r.he_plain,he_niqqud:r.he_niqqud,ru:r.ru,_v3_textId:t.id,_v3_sentenceId:r.id,_v3_orderIndex:r.order_index})));},snapshot);
    await page.evaluate(()=>{const clean=()=>document.querySelectorAll("[id*='OnboardingModal'],#v3Phase6Modal").forEach(e=>e.remove());clean();setInterval(clean,300);});
   }
   await page.waitForFunction(()=>document.querySelectorAll('#proTable tbody tr').length===3&&window.LearningTargets,null,{timeout:60000});
   const parentBefore=await page.evaluate(async()=>{
     const at=Date.now(),seed=ReaderMorph.manualMarkSeed(FsrsCore,'l4',at),meta={...seed.seedMeta,keyer_version:LemmaCanon.KEYER_VERSION};
     await __localDB.appendReviewLog({id:LemmaCanon.seedId('pid:1612',meta),item_key:'pid:1612',kind:'seed',reviewed_at:new Date(at-1).toISOString(),source:'seed-manual',meta});
     const text=(await __localDB.listTexts({query:'Учебные цели: формы'}))[0],sentence=(await __localDB.getSentences(text.id))[0];
     await __localDB.setWordStatus('pid:1612','l4',seed.sched,{textKey:text.text_key,sentenceId:sentence.id,orderIndex:0,surface:'שפחדת'});
     return {row:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:1612'"),log:await __localDB.getReviewLog('pid:1612')};
   });
   const target='#proTable tr[data-row-idx="0"] [data-col="niqqud"] .rm-w';
   await page.locator(target).first().click();await page.waitForSelector('[data-rm-enroll="ft1:1612:PERF-2ms:sh"]',{timeout:30000});
   assert.match(await page.locator('.rm-status-target').innerText(),/לפחוד/);
   await page.evaluate(()=>__localDB.dbRun("CREATE TRIGGER target_mark_fail BEFORE INSERT ON review_log WHEN NEW.item_key='ft1:1612:PERF-2ms:sh' BEGIN SELECT RAISE(FAIL,'injected target write failure'); END"));
   await page.locator('[data-rm-enroll="ft1:1612:PERF-2ms:sh"]').click();
   await page.waitForSelector('[data-rm-target-error]:visible');
   assert.equal(await page.evaluate(async()=> (await __localDB.listLearningTargets('pid:1612')).length),0);
   assert.equal(await page.locator('.rm-status-target').getAttribute('data-rm-status-key'),'pid:1612');
   await page.evaluate(()=>__localDB.dbRun('DROP TRIGGER target_mark_fail'));
   await page.locator('[data-rm-enroll="ft1:1612:PERF-2ms:sh"]').click();
   await page.waitForSelector('[data-rm-status-key="ft1:1612:PERF-2ms:sh"]');
   assert.match(await page.locator('.rm-status-target').innerText(),/что ты боялся/);
   assert.equal(await page.locator('[data-rm-status="new"].rm-status-active').count(),1);
   await page.locator('[data-rm-status="l2"]').click();
   await page.waitForSelector('[data-rm-status="l2"].rm-status-active');
   const stored=await page.evaluate(async()=>({parent:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:1612'"),parentLog:await __localDB.getReviewLog('pid:1612'),child:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='ft1:1612:PERF-2ms:sh'")}));
   assert.deepEqual(stored.parent,parentBefore.row);assert.deepEqual(stored.parentLog,parentBefore.log);assert.equal(stored.child[0].status,'l2');assert.ok(stored.child[0].srs_due);
   await page.locator('[data-rm-target="word"]').click();assert.equal(await page.locator('[data-rm-status="l4"].rm-status-active').count(),1);
   await page.locator('[data-rm-target="ft1:1612:PERF-2ms:sh"]').click();assert.equal(await page.locator('[data-rm-status="l2"].rm-status-active').count(),1);
   for(const width of [1280,380]){await page.setViewportSize({width,height:900});await page.locator('.rm-status-target').scrollIntoViewIfNeeded();assert.equal(await page.locator('.rm-sheet-card').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:path.join(out,surface+'-'+width+'.png')});}
   await page.locator('.rm-sheet-x').click();await page.locator(target).first().click();await page.waitForSelector('[data-rm-target="ft1:1612:PERF-2ms:sh"]');
   assert.equal(await page.locator('.rm-status-target').getAttribute('data-rm-status-key'),'pid:1612');
   await page.locator('.rm-sheet-x').click();
   assert.equal(await page.evaluate(async()=>{
     const opening=ReaderMorph.openWordCard('שפחדת','שֶׁפָּחַדְתָּ',{lemmaKey:'ft1:1612:PERF-2ms:sh'});
     document.querySelector('.rm-sheet-x').click();await opening;return ReaderMorph.isSheetOpen();
   }),false);
   for(const locale of ['en','he','ru']){
     await page.evaluate(locale=>window.appSetLocale(locale),locale);
     await page.locator(target).first().click();
     const tab=page.locator('[data-rm-target="ft1:1612:PERF-2ms:sh"]');await tab.waitFor();await tab.focus();await page.keyboard.press('Enter');
     await page.waitForSelector('[data-rm-status-key="ft1:1612:PERF-2ms:sh"]').catch(async error=>{await page.screenshot({path:path.join(out,surface+'-'+locale+'-failure.png')});console.log(await page.evaluate(()=>({active:document.activeElement?.outerHTML,sheet:document.querySelector('.rm-sheet')?.innerText})));throw error;});
     assert.equal(await page.locator('html').getAttribute('dir'),locale==='he'?'rtl':'ltr');
     assert.equal(await tab.getAttribute('aria-pressed'),'true');
     await page.locator('.rm-status-target').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,surface+'-'+locale+'.png')});
     await page.keyboard.press('Escape');assert.equal(await page.locator('.rm-sheet.rm-open').count(),0);
   }
   await page.locator(target).first().click();
   await page.locator('.rm-sheet-x').click();await page.locator('#proTable tr[data-row-idx="1"] [data-col="niqqud"] .rm-w').first().click();
   await page.waitForSelector('.rm-target-choices');await page.locator('.rm-target-choices summary').click();
   assert.equal(await page.locator('[data-rm-enroll]').count(),2);
   await page.locator('[data-rm-enroll="ft1:1612:IMPF-2ms:_"]').click();await page.waitForSelector('[data-rm-status-key="ft1:1612:IMPF-2ms:_"]');
   assert.equal(await page.evaluate(async()=> (await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='ft1:1612:IMPF-3fs:_'")).length),0);
   await page.locator('.rm-sheet-x').click();
   await page.locator(target).first().click();
   await page.locator('[data-rm-target="ft1:1612:PERF-2ms:sh"]').click();
   await page.locator('[data-rm-status="known"]').click();
   await page.waitForSelector('[data-rm-status="known"].rm-status-active');
   await page.locator('[data-rm-practice-target]').click();
   await page.waitForSelector('[data-train-target="ft1:1612:PERF-2ms:sh"]',{timeout:60000});
   await page.locator('[data-train-input]').fill('פחדת');
   await page.locator('[data-train-submit]').click();
   await page.waitForSelector('[data-train-next]');
   const graded=await page.evaluate(async()=>({parent:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:1612'"),parentLog:await __localDB.getReviewLog('pid:1612'),childLog:await __localDB.getReviewLog('ft1:1612:PERF-2ms:sh')}));
   assert.deepEqual(graded.parent,parentBefore.row);assert.deepEqual(graded.parentLog,parentBefore.log);
   assert.equal(graded.childLog.filter(r=>r.kind==='review').length,1);assert.equal(graded.childLog.find(r=>r.kind==='review').grade,1);
   await page.locator('button[data-study-close]').click();
   const bundle=await page.evaluate(()=>__localDB.exportBundle());
   const clone=await browser.newContext({serviceWorkers:'block'}),clonePage=await clone.newPage();
   await clonePage.goto(base+'/library.html?canon=skip&corpus=skip');
   await clonePage.waitForFunction(()=>window.__localDB?.isReady(),null,{timeout:60000});
   const roundtrip=await clonePage.evaluate(async bundle=>{
     await __localDB.importBundle(bundle,{mode:'skip'});
     const first=await __localDB.dbQuery('SELECT * FROM review_log ORDER BY id');
     await __localDB.importBundle(bundle,{mode:'skip'});
     const second=await __localDB.dbQuery('SELECT * FROM review_log ORDER BY id');
     return {first,second,status:await __localDB.getAllWordStatuses(),schedule:await __localDB.getSrsSchedule(),known:await __localDB.getKnownWordStates(),targets:await __localDB.listLearningTargets('pid:1612')};
   },bundle);
   assert.deepEqual(roundtrip.first,roundtrip.second);
   assert.deepEqual(roundtrip.first,bundle.notes_advanced.review_log.slice().sort((a,b)=>a.id.localeCompare(b.id)));
   assert.equal(roundtrip.status['pid:1612'],'l4');assert.equal(roundtrip.status['ft1:1612:PERF-2ms:sh'],'known');
   assert.ok(roundtrip.schedule['ft1:1612:PERF-2ms:sh'].due);assert.ok(!roundtrip.known['ft1:1612:PERF-2ms:sh']);
   await clone.close();
   await page.goto(base+'/dictionary.html?word=pid%3A1612');
   await page.waitForSelector('[data-learning-target-key="ft1:1612:PERF-2ms:sh"]',{timeout:60000});
   await page.evaluate(async()=>{window.__localDB=await import('/db/local-db.js?v=804');});
   assert.match(await page.locator('[data-learning-target-key="ft1:1612:PERF-2ms:sh"]').innerText(),/что ты боялся/);
   await page.getByRole('button',{name:'Тренировать формы',exact:true}).click();
   const drill=page.locator('.dict-drill-area');await drill.waitFor();
   const drillKey=await drill.getAttribute('data-drill-target-key'),answer=await drill.getAttribute('data-answer');
   const drillBefore=await page.evaluate(async key=>{
     await __localDB.commitLearningTargetMark({key,status:'new',enrollOnly:true});
     return {parent:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:1612'"),log:await __localDB.getReviewLog(key)};
   },drillKey);
   await page.locator('.dict-drill-opt').filter({hasText:answer}).click();
   await page.waitForSelector('.dict-drill-fb');
   await page.waitForFunction(async key=>(await __localDB.getReviewLog(key)).some(r=>r.kind==='review'),drillKey);
   const drillAfter=await page.evaluate(async key=>({parent:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:1612'"),log:await __localDB.getReviewLog(key)}),drillKey);
   assert.deepEqual(drillAfter.parent,drillBefore.parent);assert.equal(drillAfter.log.filter(r=>r.kind==='review').length,drillBefore.log.filter(r=>r.kind==='review').length+1);
   await page.evaluate(()=>LPDictionary.reload());
   assert.equal(await page.locator('.dict-drill-fb').count(),1);
   assert.equal(paid,0);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({surface,enrollment:true,parentUnchanged:true,formScheduled:true,scopeSwitch:true,ambiguityChoice:true,failedWriteRollback:true,lateClose:true,keyboard:true,locales:['ru','en','he'],completeAnswerRequired:true,bundleRoundtrip:true,duplicateImport:true,dictionaryTargets:true,formDrillBridge:true,refreshKeepsDrill:true,paid,errors}));
   await context.close();
  }
 }finally{if(browser)await browser.close();if(server)server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
