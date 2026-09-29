#!/usr/bin/env node
"use strict";
// Isolated browser + SQLite fixtures. Uses shipped Studio/Room entry points,
// production transport routes and shared panel. Never contacts a model by default.
const fs=require('node:fs'),path=require('node:path');
const express=require('express'),sqlite3=require('sqlite3');
const {chromium}=require('playwright');
const JSZip=require('jszip');
const assert=require('node:assert/strict');
const {createStore}=require('../../agent/tutor/store');
const {installRoutes}=require('../../agent/tutor/routes');
const ROOT=path.resolve(__dirname,'../..');
const practiceMode=process.argv.includes('--practice');
const surfacesMode=process.argv.includes('--surfaces');
async function main(){
 const db=new sqlite3.Database(':memory:');
 await new Promise((r,j)=>db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('fixture-A');"+fs.readFileSync(path.join(ROOT,'migrations/070_tutor_transport.sql'),'utf8')+fs.readFileSync(path.join(ROOT,'migrations/071_tutor_practice.sql'),'utf8')+fs.readFileSync(path.join(ROOT,'migrations/072_tutor_onboarding.sql'),'utf8')+fs.readFileSync(path.join(ROOT,'migrations/073_tutor_practice_proposals.sql'),'utf8')+fs.readFileSync(path.join(ROOT,'migrations/074_tutor_conversation.sql'),'utf8'),e=>e?j(e):r()));
 const store=createStore(()=>db),app=express();app.use(express.json({limit:'40kb'}));
 app.use((_q,s,n)=>{s.set('Cross-Origin-Opener-Policy','same-origin');s.set('Cross-Origin-Embedder-Policy','require-corp');n();});
 const auth={user:{id:'fixture-A'},session:{csrf:'fixture-csrf'}};let accountDeleted=false;
 app.get('/api/auth/me',(_q,s)=>accountDeleted?s.status(401).json({ok:false}):s.json({ok:true,user:auth.user,csrf:auth.session.csrf,consents:{}}));
 app.post('/api/auth/logout',(_q,s)=>s.json({ok:true}));
 app.get('/api/account/export',(_q,s)=>accountDeleted?s.status(401).json({ok:false}):s.json({ok:true,table_list:['tutor_practice'],tables:{tutor_practice:[{id:'fixture-practice'}]}}));
 app.post('/api/account/delete',(q,s)=>{if(q.get('X-LP-CSRF')!=='fixture-csrf'||q.body?.confirm!=='DELETE')return s.status(403).json({ok:false});accountDeleted=true;s.json({ok:true});});
 installRoutes(app,{store,enabled:()=>true,requireUser:async()=>auth,requireCsrf:(q,s)=>{if(q.get('X-LP-CSRF')!==auth.session.csrf){s.status(403).json({ok:false,error:'BAD_CSRF'});return false;}return true;},limiter:(_q,_s,n)=>n()});
 app.get('/api/client-config',(_q,s)=>s.json({ok:true,version:'3.11.700',tts:{enabled:false},agent:{enabled:false}}));
 app.get('/api/mediatheque',(_q,s)=>s.json({ok:true,structure:require('../../public/js/mediatheque-core').empty(),items:[],revision:0}));
 app.use('/api',(_q,s)=>s.status(404).json({ok:false,error:'FIXTURE_ROUTE_NOT_AVAILABLE'}));
 if(surfacesMode)app.get('/js/library-ui.js',(_q,res)=>res.type('js').send(fs.readFileSync(path.join(ROOT,'public/js/library-ui.js'),'utf8')+`
window.__m4Fixture={launch:async()=>{ensureStudySheet();_studySheet.hidden=false;_studySheet.classList.add('room-study-open');_studyMode='train';await _launchTrainSession([{lemmaKey:'pid:1',surface:'הייתי',niqqud:'הייתי',gloss:'я был',status:'known',_built:{sentence:'כשהייתי ילד גרתי בחיפה',cz:{answer:'הייתי',segments:[{text:'כשהייתי ילד גרתי בחיפה'}]},rowIdx:0},_source:{textKey:'m1:fixture:text',sentenceId:'m1-s0',orderIndex:0,surface:'הייתי'}}],{cross:true});},state:()=>({idx:_trainSession?.idx,answered:_trainSession?.answered,total:_trainSession?.total}),close:closeStudySheet};`));
 app.use(express.static(path.join(ROOT,'public')));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await ctx.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||url.protocol==='blob:'?route.continue():route.abort();});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const waitArchiveCount=async count=>{for(let i=0;i<60;i++){if(await page.evaluate(async()=>(await window.LPTutorNotebook.local().list('fixture-A')).length)===count)return;await page.waitForTimeout(100);}throw Error('ARCHIVE_COUNT_'+count);};
 const shots=path.join(ROOT,'docs/research/mentor-byoa/2026-09-29/'+(surfacesMode?'m4-screenshots':practiceMode?'m2-screenshots':'m1-screenshots'));fs.mkdirSync(shots,{recursive:true});
 let token,worker,busy=false,hold=false,deliveries=[];
 const waitDelivery=async previous=>{for(let i=0;i<100;i++){if(deliveries.length>previous)return;await page.waitForTimeout(100);}throw Error('TUTOR_DELIVERY_TIMEOUT');};
 try{
  const p=await store.pair('fixture-A');token=(await store.claim({pairing_code:p.pairing_code,client_nonce:'n'.repeat(43)})).token;
  await store.next(token);
  worker=setInterval(async()=>{if(busy||hold)return;busy=true;try{const {job}=await store.next(token);if(job){deliveries.push(job);await store.complete(token,job.session_id,job.lease,{schema_version:'lp-tutor-response.1',context_id:job.context.context_id,excerpt_digest:job.context.excerpt_digest,text:'[Fixture response] הייתי — «я был». <img src=x onerror="window.__tutorXss=1">'});}}catch(_){}finally{busy=false;}},300);
  await page.goto(origin+'/library.html?canon=skip',{waitUntil:'load'});
  await page.waitForFunction(()=>window.__localDB&&window.LPTutor,{timeout:30000});
  await page.evaluate(async()=>{
   const db=window.__localDB;
   await db.createText({id:'m1-text',text_key:'m1:fixture:text',title:'M1 Hebrew fixture',source_text:'כשהייתי ילד גרתי בחיפה',source_meta_json:JSON.stringify({origin:'studio',material_kind:'user_text'})});
   await db.addSentence('m1-text',{id:'m1-s0',he_plain:'כשהייתי ילד גרתי בחיפה',he_niqqud:'כשהייתי ילד גרתי בחיפה',ru:'Когда я был ребёнком, я жил в Хайфе.'});
  });
  await page.goto(origin+'/library.html?canon=skip&open=m1%3Afixture%3Atext',{waitUntil:'load'});
  await page.waitForFunction(()=>window.__localDB);
  let before=await page.evaluate(()=>window.__localDB.countReviewLog());
  await page.locator('.row-explain-btn').first().click({timeout:30000});
  await page.getByRole('dialog',{name:'Разберём вместе'}).waitFor();
  await page.locator('dialog[data-lp-tutor] #send').click();
  await page.getByText('[Fixture response]',{exact:false}).last().waitFor({timeout:15000});
  assert.equal(await page.evaluate(()=>window.__tutorXss),undefined);
  assert.equal(deliveries[0].context.surface,'room');
  assert.equal(deliveries[0].context.source.excerpt,'כשהייתי ילד גרתי בחיפה');
  assert.equal(await page.locator('dialog').locator('img').count(),0);
  await page.screenshot({path:path.join(shots,'room-desktop.png')});
  await page.setViewportSize({width:surfacesMode?380:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(shots,'room-mobile.png')});
  if(surfacesMode){
   await waitArchiveCount(1);
   assert.equal(await page.getByRole('button',{name:'Сохранить на этом устройстве'}).count(),0);
   assert.equal((await page.evaluate(()=>window.LPTutorNotebook.local().list('fixture-A'))).length,1);
   assert.equal((await page.evaluate(()=>window.LPTutorNotebook.local().list('fixture-B'))).length,0);
   await page.evaluate(async()=>{const rows=await window.LPTutorNotebook.local().list('fixture-A');await window.LPTutorNotebook.local().remove('fixture-B',rows[0].id);});
   assert.equal((await page.evaluate(()=>window.LPTutorNotebook.local().list('fixture-A'))).length,1);
   await page.evaluate(()=>window.LPTutorNotebook.show({api:window.LPTutorClient.createApi(),locale:'ru'}));
   const notebook=page.getByRole('dialog',{name:'История с наставником',exact:true});
   await notebook.locator('summary').first().click();
   assert.equal(await notebook.locator('img').count(),0);
   assert.equal(await notebook.getByRole('button',{name:'Скачать все'}).count(),0,'data controls stay outside learning history');
   await page.screenshot({path:path.join(shots,'notebook-mobile.png')});
   await notebook.getByRole('button',{name:'Закрыть',exact:true}).click();
  }
  if(practiceMode){
   const proposalRow=await new Promise((resolve,reject)=>db.get('SELECT proposal_state FROM tutor_practice LIMIT 1',(e,row)=>e?reject(e):resolve(row)));
   assert.equal(proposalRow?.proposal_state,'proposed','practice should be proposed after explanation');
   await page.getByRole('button',{name:'Закрепить за минуту',exact:true}).click();
   await page.getByRole('textbox',{name:'Слово из исходника',exact:true}).fill('כשהייתי');
   let lostReceipt=true;
   await page.route('**/api/tutor/sessions/*/practice/attempt',async route=>{
    if(!lostReceipt)return route.continue();lostReceipt=false;
    await route.fetch();await route.abort('failed');
   });
   await page.getByRole('button',{name:'Сверить с исходником',exact:true}).click();
   await page.getByText('Не удалось сохранить ответ. Он остаётся в поле; повторите отправку.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Сверить с исходником',exact:true}).click();
   await page.getByRole('heading',{name:'Совпало с исходником',exact:true}).waitFor();
   await page.getByText('Слово дополнительно не раскрывалось.',{exact:true}).waitFor();
   await page.screenshot({path:path.join(shots,'practice-match-mobile.png')});
  }
  await page.getByRole('button',{name:'Вернуться к тексту',exact:true}).click();
  await page.reload();
  await page.locator('.row-explain-btn').first().click({timeout:30000});
  await page.getByText('[Fixture response]',{exact:false}).last().waitFor({timeout:15000});
  assert.equal(deliveries.length,1,'reload resumes result, does not regenerate');
  if(surfacesMode&&!practiceMode){
   await page.locator('dialog[data-lp-tutor] #question').fill('А почему эта форма?');
   await page.locator('dialog[data-lp-tutor] #question').press('Shift+Enter');
   assert.match(await page.locator('dialog[data-lp-tutor] #question').inputValue(),/\n/);
   await page.locator('dialog[data-lp-tutor] #question').fill('А почему эта форма?');
   await page.locator('dialog[data-lp-tutor] #question').press('Enter');
   await waitArchiveCount(2);
   assert.deepEqual(deliveries.at(-1).history,[{question:deliveries[0].question,answer:'[Fixture response] הייתי — «я был». <img src=x onerror="window.__tutorXss=1">'}]);
   const count=deliveries.length;
   await page.evaluate(()=>window.LPTutorNotebook.show({api:window.LPTutorClient.createApi(),locale:'ru',management:true,onContinue:window.LPTutor.openSaved}));
   const notebook=page.getByRole('dialog',{name:'История с наставником',exact:true});
   await notebook.locator('summary').first().click();
   const download=page.waitForEvent('download');await notebook.getByRole('button',{name:'Скачать',exact:true}).click();assert.equal((await download).suggestedFilename(),'linguistpro-explanation.json');
   const allDownload=page.waitForEvent('download');await notebook.getByRole('button',{name:'Скачать все',exact:true}).click();assert.equal((await allDownload).suggestedFilename(),'linguistpro-explanations.json');
   await notebook.getByRole('button',{name:'Открыть разговор',exact:true}).click();
   await page.getByText('Продолжим разговор об этом фрагменте.',{exact:true}).waitFor();
   assert.equal(deliveries.length,count,'opening archive never generates');
   assert.equal(await page.getByRole('dialog',{name:'Разберём вместе'}).getByRole('checkbox').count(),0,'asking needs no repeated checkbox');
  }
  if(practiceMode){
   await page.getByRole('button',{name:'Посмотреть итог упражнения',exact:true}).click();
   await page.getByRole('heading',{name:'Совпало с исходником',exact:true}).waitFor();
   await page.getByRole('button',{name:'К объяснению',exact:true}).click();
  }

  await page.getByRole('button',{name:'Вернуться к тексту',exact:true}).click();
  if(surfacesMode){
   await page.evaluate(()=>window.LPTutor.tryOpen({surface:'room',materialKey:'video:fixture',rows:[{id:'video-row',he:'שלום בעולם'}],index:0,
    mediaPassport:{timingMap:{authority:'studio-exact-binding',revision_id:'video-r1',revision_sha256:'a'.repeat(64),row_caption_segment_ids:['caption-1']},timing:{entries:[{o:0,t:25,end:31}]}}}));
   await page.locator('dialog[data-lp-tutor] #send').click();
   await page.getByText('[Fixture response]',{exact:false}).last().waitFor();
   assert.equal(deliveries.at(-1).context.source.kind,'caption');
   assert.equal(deliveries.at(-1).context.source.media.start_ms,25000);
   await page.getByRole('button',{name:'Вернуться к тексту',exact:true}).click();
   await page.evaluate(()=>window.__m4Fixture.launch());
   assert.equal(await page.getByRole('button',{name:'Разобрать с наставником',exact:true}).count(),0);
   await page.locator('[data-train-input]').fill('שלום');
   const updateLater=page.locator('.room-update-toast .ru-later');if(await updateLater.isVisible())await updateLater.click();
   await page.locator('[data-train-submit]').click();
   const help=page.getByRole('button',{name:'Разобрать с наставником',exact:true});await help.waitFor({state:'visible'});
   const count=await page.evaluate(()=>window.__localDB.countReviewLog()),queue=await page.evaluate(()=>window.__m4Fixture.state());
   assert.ok(count>before,'real answer committed before help');
   await help.click();
   await page.getByRole('button',{name:'Вернуться к повторению',exact:true}).waitFor();
   const beforeReview=deliveries.length,beforeReviewTurns=await page.locator('dialog[data-lp-tutor] .turn').count();
   await page.locator('dialog[data-lp-tutor] #send').click();
   await waitDelivery(beforeReview);
   await page.locator('dialog[data-lp-tutor] .turn').nth(beforeReviewTurns).waitFor();
   await page.getByText('[Fixture response]',{exact:false}).last().waitFor();
   assert.equal(deliveries.at(-1).context.surface,'review');
   assert.ok(deliveries.at(-1).history.length>=1,'review keeps the same-source conversation');
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.querySelector('dialog[open]').contains(document.activeElement)),true);
   await page.screenshot({path:path.join(shots,'review-help-mobile.png')});
   await page.getByRole('button',{name:'Вернуться к повторению',exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>window.__m4Fixture.state()),queue);
   assert.equal(await page.evaluate(()=>window.__localDB.countReviewLog()),count);
   await page.evaluate(()=>window.__m4Fixture.close());
   await page.goto(origin+'/library.html?canon=skip&open=m1%3Afixture%3Atext&from=mediatheque&return_to=%2Fmediatheque.html&tutor=choose');
   await page.locator('.row-explain-btn').first().click({timeout:30000});
   await page.locator('dialog[data-lp-tutor] #question').fill('Проверка материала Медиатеки');
   const beforeMediatheque=deliveries.length,beforeMediathequeTurns=await page.locator('dialog[data-lp-tutor] .turn').count();
   await page.locator('dialog[data-lp-tutor] #send').click();
   await waitDelivery(beforeMediatheque);
   await page.locator('dialog[data-lp-tutor] .turn').nth(beforeMediathequeTurns).waitFor();
   await page.getByText('[Fixture response]',{exact:false}).last().waitFor();
   assert.equal(deliveries.at(-1).context.surface,'mediatheque');
   assert.ok(deliveries.at(-1).history.length>=1,'mediatheque keeps the same-source conversation');
   assert.equal(await page.evaluate(()=>window.__localDB.countReviewLog()),count);
   await page.getByRole('button',{name:'Вернуться к тексту',exact:true}).click();
   // The only canonical change above was the deliberately submitted fixture answer.
   before=count;
  }
  await page.evaluate(()=>window.__localDB.closeLocalDB());
  const payload=Buffer.from(JSON.stringify({v:1,type:'text',id:'m1-text'})).toString('base64url');
  await page.goto(origin+'/index.html#/t/'+payload,{waitUntil:'load'});
  await page.waitForFunction(()=>window.StudioAgentHost?.getRow(0)?._v3_sentenceId,{timeout:30000});
  await page.evaluate(()=>window.StudioAgent.explainRow(0));
  await page.getByRole('dialog',{name:'Разберём вместе'}).waitFor();
  // Exact same fragment resumes the Room answer across surfaces if its identity matches.
  await page.locator('dialog[data-lp-tutor] #question').fill('Другой вопрос для проверки Студии');
  const beforeStudio=deliveries.length,beforeStudioTurns=await page.locator('dialog[data-lp-tutor] .turn').count();
  await page.locator('dialog[data-lp-tutor] #send').click();
  await waitDelivery(beforeStudio);
  await page.locator('dialog[data-lp-tutor] .turn').nth(beforeStudioTurns).waitFor();
  await page.waitForFunction(()=>document.querySelector('dialog')?.textContent!==undefined);
  await page.getByText('[Fixture response]',{exact:false}).last().waitFor({timeout:15000});
  assert.equal(deliveries.at(-1).context.surface,'studio');
  if(surfacesMode)assert.ok(deliveries.at(-1).history.length>=1,'studio keeps the same-source conversation');
  const after=await page.evaluate(async()=>{const db=await window.StudioAgentHost.ldb();return db.countReviewLog();});
  assert.equal(after,before,'tutor never writes review_log');
  await page.screenshot({path:path.join(shots,'studio-mobile.png')});
  if(surfacesMode&&!practiceMode){
   for(let i=0;i<60;i++){if(await page.evaluate(async()=>(await window.LPTutorNotebook.local().list('fixture-A')).length)>=3)break;await page.waitForTimeout(100);}
   await page.getByRole('button',{name:'Вернуться к тексту',exact:true}).click();
   await page.evaluate(()=>{v3LibraryExportBundle();});
   const zipEvent=page.waitForEvent('download',{timeout:30000});
   await page.locator('#v3ExpPfMeta').click();
   const zipDownload=await zipEvent;
   const zip=await JSZip.loadAsync(fs.readFileSync(await zipDownload.path()));
   const manifest=JSON.parse(await zip.file('manifest.json').async('string'));
   const notebook=JSON.parse(await zip.file('personal/tutor-explanations.json').async('string'));
   assert.equal(manifest.tutor_explanations.status,'included');
   assert.equal(notebook.owner_id,'fixture-A');
   assert.ok(notebook.records.length>=1);
   assert.equal(notebook.records.some(r=>r.owner||r.id),false);
   await page.evaluate(()=>window.StudioAgent.explainRow(0));
   await page.getByRole('dialog',{name:'Разберём вместе'}).waitFor();
  }
  if(practiceMode){
   await page.getByRole('button',{name:'Закрепить за минуту',exact:true}).click();
   await page.getByRole('button',{name:'Отменить упражнение',exact:true}).click();
   await page.getByRole('button',{name:'Закрепить за минуту',exact:true}).click();
   await page.getByRole('button',{name:'Показать слово',exact:true}).click();
   await page.getByRole('textbox',{name:'Слово из исходника',exact:true}).fill('כשהיה');
   await page.getByRole('button',{name:'Сверить с исходником',exact:true}).click();
   await page.getByRole('heading',{name:'В исходнике было иначе',exact:true}).waitFor();
   await page.getByText('Слово было показано перед ответом.',{exact:true}).waitFor();
   await page.screenshot({path:path.join(shots,'practice-help-mobile.png')});
   await page.getByRole('button',{name:'К объяснению',exact:true}).click();
  }

  hold=true;
  await page.locator('dialog[data-lp-tutor] #question').fill('Проверка отмены');
  await page.locator('dialog[data-lp-tutor] #send').click();
  await page.getByRole('button',{name:'Остановить',exact:true}).click();
  await page.getByText('Запрос остановлен.',{exact:false}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.setViewportSize({width:380,height:844});
  await page.evaluate(()=>{document.documentElement.lang='he';const b=document.createElement('button');b.id='tutor-focus-origin';b.textContent='Tutor fixture';document.body.append(b);b.focus();return window.LPTutor.tryOpen({surface:'room',materialKey:'rtl:fixture',rows:[{id:'prev',he:'לפני כן גרתי בתל אביב.'},{id:'rtl',he:'כשהייתי ילד גרתי בחיפה'},{id:'next',he:'אחר כך עברתי לירושלים.'}],index:1});});
  const rtl=page.getByRole('dialog',{name:'נבין יחד'});await rtl.waitFor();
  await rtl.locator('summary').first().click();
  assert.equal(await rtl.locator('section.body').getAttribute('dir'),'rtl');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.querySelector('dialog[open]').contains(document.activeElement)),true);
  await page.screenshot({path:path.join(shots,'room-he-mobile.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'tutor-focus-origin');
  if(practiceMode){
   hold=false;
   await page.evaluate(()=>window.LPTutor.tryOpen({surface:'room',materialKey:'rtl:exercise',rows:[{id:'rtl',he:'כשהייתי ילד גרתי בחיפה'}],index:0}));
   await page.locator('dialog[data-lp-tutor] #send').click();
   await page.getByRole('button',{name:'דקה של תרגול',exact:true}).click();
   await page.getByRole('textbox',{name:'המילה מהמקור',exact:true}).waitFor();
   await page.screenshot({path:path.join(shots,'practice-he-mobile.png')});
   await page.getByRole('button',{name:'דילוג',exact:true}).click();
   await page.getByRole('heading',{name:'הניסיון דולג',exact:true}).waitFor();
   await page.keyboard.press('Escape');
   const finalCount=await page.evaluate(async()=>{const db=await window.StudioAgentHost.ldb();return db.countReviewLog();});
   assert.equal(finalCount,before,'practice never writes review_log');
  }
  await store.revoke('fixture-A');
  await page.evaluate(()=>{document.documentElement.lang='ru';return window.LPTutor.tryOpen({surface:'room',materialKey:'revoked:fixture',rows:[{id:'revoked',he:'שלום'}],index:0});});
  await page.getByText('Подключите личного агента, чтобы задать вопрос.',{exact:true}).waitFor();
  await page.keyboard.press('Escape');
  if(surfacesMode){
   await page.evaluate(async()=>{const db=await window.StudioAgentHost.ldb();await db.closeLocalDB();});
   await page.goto(origin+'/mediatheque.html?space=personal');
   const link=page.getByRole('link',{name:'Читать с наставником',exact:true});await link.first().waitFor();
   await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(shots,'mediatheque-desktop.png')});
   await page.setViewportSize({width:380,height:844});await link.first().evaluate(e=>e.scrollIntoView({block:'center'}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(shots,'mediatheque-mobile.png')});
   await link.first().click();await page.locator('.row-explain-btn').first().waitFor();
   await page.getByText('Выберите предложение и нажмите кнопку наставника рядом с ним.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('row-explain-btn')),true);
   await page.evaluate(()=>window.LPTutorNotebook.show({api:window.LPTutorClient.createApi(),locale:'he',management:true}));
   const heNotebook=page.getByRole('dialog',{name:'שיחות עם המורה',exact:true});await heNotebook.locator('summary').first().click();
   await page.screenshot({path:path.join(shots,'notebook-he-mobile.png')});
   page.once('dialog',dialog=>dialog.accept());
   await heNotebook.getByRole('button',{name:'מחיקת הכול',exact:true}).click();
   await heNotebook.getByText('עדיין אין שיחות עם המורה.',{exact:true}).waitFor();
   assert.equal((await page.evaluate(()=>window.LPTutorNotebook.local().list('fixture-A'))).length,0);
   await heNotebook.getByRole('button',{name:'סגירה',exact:true}).click();
   await page.evaluate(async()=>{
    const store=window.LPTutorNotebook.local(),context=await window.LPTutorClient.build(window.LPTutorClient.capture({surface:'room',materialKey:'backup-fixture',rows:[{id:'1',he:'שלום עולם'}],index:0,locale:'ru'}));
    await store.save('fixture-A',{schema:1,status:'accepted',context,question:'Почему?',answer:'Из сохранённого ответа.'});
    const bundle=await store.exportBundle('fixture-A');
    if(bundle.records.length!==1||bundle.records[0].owner||bundle.records[0].id)throw Error('ARCHIVE_EXPORT_FAILED');
    await store.removeAll('fixture-A');
    let rejected=false;try{await store.importBundle('fixture-B',bundle);}catch(_){rejected=true;}
    if(!rejected||(await store.list('fixture-B')).length)throw Error('ARCHIVE_ACCOUNT_BINDING_FAILED');
    rejected=false;try{await store.importBundle('fixture-A',{...bundle,records:[bundle.records[0],{...bundle.records[0],answer:''}]});}catch(_){rejected=true;}
    if(!rejected||(await store.list('fixture-A')).length)throw Error('ARCHIVE_ATOMIC_VALIDATION_FAILED');
    const restored=await store.importBundle('fixture-A',bundle),duplicate=await store.importBundle('fixture-A',bundle);
    if(restored.imported!==1||duplicate.imported!==0||(await store.list('fixture-A')).length!==1)throw Error('ARCHIVE_RESTORE_FAILED');
    await store.removeAll('fixture-A');
   });
   await page.evaluate(async()=>{
    const store=window.LPTutorNotebook.local(),context=await window.LPTutorClient.build(window.LPTutorClient.capture({surface:'room',materialKey:'limit',rows:[{id:'1',he:'שלום עולם'}],index:0,locale:'ru'}));
    const record={schema:1,status:'accepted',context,question:'0',answer:'fixture'};
    for(let i=0;i<200;i++)await store.save('fixture-limit',{...record,question:String(i)});
    await store.save('fixture-limit',record);
    let rejected=false;try{await store.save('fixture-limit',{...record,question:'overflow'});}catch(_){rejected=true;}
    if(!rejected||(await store.list('fixture-limit')).length!==200)throw Error('ARCHIVE_LIMIT_FAILED');
   for(const row of await store.list('fixture-limit'))await store.remove('fixture-limit',row.id);
   });
   if(!practiceMode){
    await page.goto(origin+'/library.html?canon=skip',{waitUntil:'load'});
    await page.locator('#roomCloud').waitFor({state:'visible'});
    await page.evaluate(async()=>{document.documentElement.lang='ru';const context=await window.LPTutorClient.build(window.LPTutorClient.capture({surface:'room',materialKey:'account-fixture',rows:[{id:'1',he:'שלום עולם'}],index:0,locale:'ru'}));await window.LPTutorNotebook.local().save('fixture-A',{schema:1,status:'accepted',context,question:'Почему?',answer:'Ответ для удаления.'});});
    await page.locator('#roomCloud').click();
    await page.locator('#roomAccountData').waitFor({state:'visible'});
    await page.locator('#roomAccountData summary').click();
    await page.setViewportSize({width:1280,height:900});
    await page.locator('#roomAccountData').scrollIntoViewIfNeeded();
    await page.locator('#roomCloudModal .room-about-card').evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.screenshot({path:path.join(shots,'account-data-desktop.png')});
    await page.setViewportSize({width:380,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#roomAccountData').scrollIntoViewIfNeeded();
    await page.locator('#roomAccountData').screenshot({path:path.join(shots,'account-data-mobile.png')});
    await page.evaluate(()=>window.appSetLocale('he'));
    await page.locator('#roomAccountData').screenshot({path:path.join(shots,'account-data-he-mobile.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.evaluate(()=>window.appSetLocale('ru'));
    const serverDownload=page.waitForEvent('download');await page.locator('#roomAccountServerExport').click();
    const downloaded=await serverDownload;assert.equal(downloaded.suggestedFilename(),'linguistpro-server-data.json');
    assert.equal(JSON.parse(fs.readFileSync(await downloaded.path(),'utf8')).tables.tutor_practice.length,1);
    await page.route('**/api/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,user:{id:'fixture-B'},csrf:'foreign'})}));
    await page.locator('#roomAccountServerExport').click();
    await page.getByText('Не удалось выполнить действие. Проверьте вход и повторите.',{exact:true}).waitFor();
    await page.unroute('**/api/auth/me');
    await page.locator('#roomAccountLocalArchive').click();
    const archive=page.getByRole('dialog',{name:'История с наставником'});await archive.waitFor();
    await archive.getByRole('button',{name:'Закрыть'}).click();
    await Promise.all([page.waitForEvent('dialog').then(dialog=>dialog.dismiss()),page.locator('#roomAccountDelete').click()]);assert.equal(accountDeleted,false);
    await Promise.all([page.waitForEvent('dialog').then(dialog=>dialog.accept('WRONG')),page.locator('#roomAccountDelete').click()]);assert.equal(accountDeleted,false);
    await page.route('**/api/account/delete',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({ok:false,error:'FIXTURE_FAILURE'})}));
    await Promise.all([page.waitForEvent('dialog').then(dialog=>dialog.accept('DELETE')),page.locator('#roomAccountDelete').click()]);
    await page.getByText('Не удалось выполнить действие. Проверьте вход и повторите.',{exact:true}).waitFor();
    assert.equal(accountDeleted,false);assert.equal((await page.evaluate(()=>window.LPTutorNotebook.local().list('fixture-A'))).length,1);
    await page.unroute('**/api/account/delete');
    await Promise.all([page.waitForEvent('dialog').then(dialog=>dialog.accept('DELETE')),page.locator('#roomAccountDelete').click()]);
    await page.getByText('Аккаунт удалён. Локальные материалы на других устройствах удалите там отдельно.',{exact:true}).waitFor();
    assert.equal(accountDeleted,true);
    assert.equal((await page.evaluate(()=>window.LPTutorNotebook.local().list('fixture-A'))).length,0);
   }
  }
  assert.deepEqual(errors,[]);
  const result={date:new Date().toISOString(),ok:true,practice:practiceMode,surfaces:surfacesMode,deliveries:deliveries.map(j=>({surface:j.context.surface,revision:j.context.source.revision_id})),tutor_review_log_unchanged:true,fixture_training_attempt:surfacesMode,archive_dedup_isolation_reload_export:surfacesMode,archive_continuation:surfacesMode&&!practiceMode,archive_delete_limit:surfacesMode,pageErrors:errors};
  if(surfacesMode)fs.writeFileSync(path.join(ROOT,'docs/research/mentor-byoa/2026-09-29/'+(practiceMode?'M4_PRACTICE_BROWSER_RESULT.json':'M4_BROWSER_RESULT.json')),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
 }catch(e){await page.screenshot({path:path.join(shots,'failure.png')});console.error('PANEL_STATE',await page.locator('dialog').innerText().catch(()=>''));console.error('PAGE_ERRORS',errors.slice(-5));throw e;}
 finally{clearInterval(worker);await browser.close();await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
