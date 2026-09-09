'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const ORIGIN=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3336';
async function waitTask(page){for(let i=0;i<450;i++){const job=await page.evaluate(async()=>{const jobs=await LearningMaterialTask.createStore().list();return jobs[0]&&{state:jobs[0].state,phase:jobs[0].phase};});if(job&&job.phase!=='imported'&&['ready','paused'].includes(job.state))return;await new Promise(r=>setTimeout(r,100));}throw new Error('TASK_WAIT_TIMEOUT');}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],providerCalls=[];
  async function fresh(){
    const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1180,height:900}}),page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{for(const key of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(key,'1');localStorage.setItem('v3.geminiApiKey','AIza'+'f'.repeat(35));});
    await page.route('**/api/translate-table',async route=>{
      const body=route.request().postDataJSON();providerCalls.push({segments:body.segments?.length||0});
      const rows=(body.segments||body.text.split('\n').map((text,i)=>({i,text}))).map((row,i)=>({segment_index:i,he:row.text,he_niqqud:row.text,translit:'shalom',ru:['Привет','Доброе утро','Спасибо'][i]||'Текст'}));
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows,model:'gemini-3.8-flash',requestedModel:'gemini-3.8-flash',promptId:'he-ru-table-seg-v3',schemaId:'studio-table-rows-schema-v1',warnings:[]})});
    });
    await page.goto(ORIGIN+'/index.html?localMode=1',{waitUntil:'load'});await page.evaluate(async()=>{if(window.__localDBInitPromise)await window.__localDBInitPromise;await ensureLocalDB();});
    return {ctx,page};
  }
  try{
    const {ctx,page}=await fresh();
    assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
    await page.evaluate(async()=>{
      appSetLocale('ru');
      const meta={kind:'captions',source:'browser fixture',method:'captions',captions:{v:1,captions:{origin:'file',format:'srt',language:'he',fileName:'test.srt'},video:{platform:'youtube',videoId:'djzKaEoqka8',url:'https://www.youtube.com/watch?v=djzKaEoqka8'},segments:[{i:0,start:1,end:3,text:'שלום'},{i:1,start:4,end:6,text:'בוקר טוב'},{i:2,start:7,end:9,text:'תודה'}],timing:null}};
      const made=await StudioMediaPackage.createFromImportMeta(meta),projection=StudioMediaPackage.buildCompatibilityProjection(made.revision,{kind:made.input.kind,media:made.input.media});
      meta.media_package_ref=projection.media_package_ref;meta.captions=Object.assign({},meta.captions,projection.captions);
      v3LastImportMeta=meta;await StudioMediaPackage.setActiveWorkspace(meta.media_package_ref);
      document.getElementById('inputText').value=made.revision.segments.map(s=>s.text).join('\n');
      document.getElementById('providerSelect').value='gemini';
      await LearningMaterialTaskUI.start();
    });
    await page.locator('dialog input[type=text]').fill('YouTube task fixture');
    await page.locator('dialog').getByRole('button',{name:'Подготовить и сохранить',exact:true}).click();
    await waitTask(page);
    const task=await page.evaluate(async()=>{const jobs=await LearningMaterialTask.createStore().list();return {state:jobs[0].state,phase:jobs[0].phase,error:jobs[0].error,id:jobs[0].id,saved_text_id:jobs[0].saved_text_id,package:jobs[0].package};});
    console.log(JSON.stringify({task,providerCalls}));assert.equal(task.state,'ready');assert.equal(task.package.type,'learning-material');assert.equal(providerCalls.length,1);
    const before=await page.evaluate(async id=>{const db=await ensureLocalDB();return {text:await db.getTextById(id),rows:await db.getSentences(id),reviews:await db.dbQuery('SELECT * FROM review_log')};},task.saved_text_id);
    // Reopen after reload and rerun a journal with a lost save acknowledgement: same text ID.
    await page.reload({waitUntil:'load'});await page.evaluate(async()=>{if(window.__localDBInitPromise)await window.__localDBInitPromise;});
    await page.evaluate(async id=>{const store=LearningMaterialTask.createStore();await store.update(id,j=>({...j,saved_text_id:null,package:null,state:'paused',phase:'saving'}));await LearningMaterialTaskUI.list();},task.id);
    await page.locator('dialog').getByRole('button',{name:/YouTube task fixture/}).click();
    await page.locator('dialog').getByRole('button',{name:'Продолжить',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent.includes('Материал готов'));
    assert.equal(providerCalls.length,1);
    await page.locator('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
    const source=await page.evaluate(async id=>{
      const context=await StudyVideoSourceUI.context(id),repo=PlaybackSource.createRepository(context.ldb);
      const binding=await repo.save(id,{url:'https://www.youtube.com/watch?v=djzKaEoqka8',offset_ms:2000,confirmed:true},{expected_revision:0,basis_sha256:context.basis});
      const view=await PlaybackSource.youtubeView(context.audio,context.rows,binding);
      const texts=await context.ldb.dbQuery('SELECT id FROM texts');
      return {binding,view,texts: texts.length,rows:await context.ldb.getSentences(id),reviews:await context.ldb.dbQuery('SELECT * FROM review_log')};
    },task.saved_text_id);
    assert.equal(source.texts,1);assert.deepEqual(source.rows,before.rows);assert.deepEqual(source.reviews,before.reviews);assert.equal(source.view.entries[0].t,3);
    await page.setViewportSize({width:380,height:820});
    for(const locale of ['ru','he']){
      await page.evaluate(async({id,locale})=>{appSetLocale(locale);await StudyVideoSourceUI.manage(id);},{id:task.saved_text_id,locale});
      fs.mkdirSync('artifacts/study-video',{recursive:true});await page.screenshot({path:'artifacts/study-video/source-'+locale+'-380.png',fullPage:true});
      assert.equal(await page.evaluate(()=>document.querySelector('dialog').getBoundingClientRect().right<=innerWidth),true);
      await page.evaluate(()=>document.querySelector('dialog').close());
    }
    const files=await page.evaluate(async material=>await StudioPortableLearningPackage.buildMaterialFiles(material,'archive'),task.package.material_id);
    const publication=await page.evaluate(id=>v3PublicationBuildSelectedItems([id]),task.saved_text_id);
    assert.deepEqual(publication[0].snapshot.library.texts[0].source_meta.playback_source,source.binding);
    const {page:target}=await fresh();
    const imported=await target.evaluate(async files=>{
      const verified=await PortableLearningPackageCore.verifyPackageFiles(files),repo=PortableLearningPackageRepository.createRepository(await ensureLocalDB(),PortableLearningPackageCore);
      const plan=await repo.dryRun(verified);const result=await repo.applyVerified(verified,plan);const receipt=result.receipt;
      const context=await StudyVideoSourceUI.context(receipt.id_map.text.local_id);
      const view=await PlaybackSource.youtubeView(context.audio,context.rows,context.record);
      return {schema:receipt.schema_version,media:plan.media.status,binding:context.record,view,rowCount:context.rows.length};
    },files);
    assert.equal(JSON.parse(files['manifest.json']).schema_version,3);
    assert.equal(imported.media,'external');assert.deepEqual(imported.binding,source.binding);assert.deepEqual(imported.view.entries,source.view.entries);assert.equal(imported.rowCount,3);
    const {page:plain}=await fresh();
    await plain.evaluate(async()=>{appSetLocale('ru');document.getElementById('inputText').value='שלום';document.getElementById('providerSelect').value='gemini';await LearningMaterialTaskUI.start();});
    await plain.locator('dialog input[type=text]').fill('Plain task fixture');
    await plain.locator('dialog').getByRole('button',{name:'Подготовить и сохранить',exact:true}).click();await waitTask(plain);
    const plainJob=await plain.evaluate(async()=>(await LearningMaterialTask.createStore().list())[0]);assert.equal(plainJob.package.type,'text-card');
    const download=plain.waitForEvent('download');await plain.locator('dialog').getByRole('button',{name:'Скачать ZIP',exact:true}).click();assert.match((await download).suggestedFilename(),/\.zip$/);
    await plain.locator('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
    await plain.evaluate(id=>StudyVideoSourceUI.manage(id),plainJob.saved_text_id);
    await plain.locator('dialog input[type=url]').fill('https://www.youtube.com/watch?v=iG9CE55wbtY');
    await plain.locator('dialog').getByRole('button',{name:'Сохранить привязку',exact:true}).click();await plain.waitForFunction(()=>document.querySelector('dialog [role=status]').textContent==='Привязка сохранена. Синхронизация не подтверждена.');
    const popup=plain.waitForEvent('popup');await plain.locator('dialog').getByRole('button',{name:'Проверить видео и строки',exact:true}).click();const preview=await popup;await preview.waitForSelector('#proTable tbody tr');assert.equal(await preview.evaluate(()=>crossOriginIsolated),false);await preview.close();
    await plain.locator('dialog').getByRole('button',{name:'Отвязать YouTube',exact:true}).click();
    for(let attempt=0;attempt<50;attempt++){const detached=await plain.evaluate(async id=>PlaybackSource.selected((await StudyVideoSourceUI.context(id)).record).source===null,plainJob.saved_text_id);if(detached)break;if(attempt===49)throw new Error('DETACH_TIMEOUT');await plain.waitForTimeout(100);}
    const cleanSnapshot=require('../../db/publicationRepo').sanitizeSnapshot(publication[0].snapshot);
    const item={public_work_id:'youtube-fixture',position_no:1,title:'Public YouTube fixture',snapshot_sha256:require('node:crypto').createHash('sha256').update(require('../../db/publicationRepo').canonicalJson(cleanSnapshot)).digest('hex'),public_read_allowed:true,public_stream_allowed:true,package_download_allowed:true,expected_audio_count:0,included_audio_count:0,asset_missing:0,package_complete:true,snapshot:cleanSnapshot};
    const corpus={corpus_id:'youtube-fixture',slug:'youtube-fixture',title:'Public YouTube fixture'},edition={edition_id:'youtube-edition',edition_number:1,manifest_sha256:'a'.repeat(64),item_count:1,asset_count:0,asset_missing:0,package_complete:true};
    const guestContext=await browser.newContext({serviceWorkers:'block',viewport:{width:380,height:844}}),guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));
    await guest.route('**/api/public-corpora**',route=>{const pathname=new URL(route.request().url()).pathname;let value,status=200;if(pathname==='/api/public-corpora')value={corpora:[corpus]};else if(pathname==='/api/public-corpora/youtube-fixture')value={corpus,edition,items:[item]};else if(pathname==='/api/public-corpora/youtube-fixture/works/youtube-fixture')value={corpus,edition,item,assets:[]};else{status=404;value={error:'FIXTURE_RESOURCE_UNAVAILABLE'};}return route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});});
    await guest.goto(ORIGIN+'/library.html?canon=skip&public_corpus=youtube-fixture&public_work=youtube-fixture',{waitUntil:'load'});await guest.waitForSelector('#proTable tbody tr');assert.equal(await guest.locator('#roomMediaPlayBtn').count(),0);assert.equal(await guest.locator('#proTable tbody tr').count(),3);assert.ok(guest.url().includes('/library.html'));
    const publicView=await guest.evaluate(async()=>{const actions=document.querySelector('#roomMediaBar .playback-source-actions'),texts=await __localDB.dbQuery("SELECT id FROM texts WHERE source_meta_json LIKE '%playback_source%'");const ctx=await StudyVideoSourceUI.context(texts[0].id),view=await PlaybackSource.youtubeView(ctx.audio,ctx.rows,ctx.record);return {video_id:view.video?.videoId||null,rows:ctx.rows,entries:view.entries,reason:document.querySelector('#roomMediaBarNote').textContent,links:actions.querySelectorAll('a').length,sources:[...actions.querySelectorAll('[data-playback-source]')].map(button=>({source:button.dataset.playbackSource,pressed:button.getAttribute('aria-pressed'),label:button.textContent}))};});assert.equal(publicView.video_id,'djzKaEoqka8');assert.equal(publicView.links,0);assert.deepEqual(publicView.sources,[{source:'local',pressed:'false',label:'Локальный файл'},{source:'youtube',pressed:'true',label:'YouTube-видео'}]);assert.deepEqual(publicView.entries,source.view.entries);
    console.log(JSON.stringify({publicReader:{rows:publicView.rows.length,timingEntries:publicView.entries?.length||0,reason:publicView.reason}}));
    await guest.screenshot({path:'artifacts/study-video/public-reader-380.png',fullPage:true});await guestContext.close();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,providerFixtureCalls:providerCalls.length,checks:['task-end-to-end','crash-after-commit-no-duplicate','source-offset','rows-unchanged','review-log-unchanged','source-RU-HE-380','clean-profile-package','plain-text-ZIP','source-UI-save-preview-detach','public-reader-YouTube']}));
    await ctx.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
