#!/usr/bin/env node
"use strict";
// Isolated browser + SQLite fixtures. Uses shipped Studio/Room entry points,
// production transport routes and shared panel. Never contacts a model by default.
const fs=require('node:fs'),path=require('node:path');
const express=require('express'),sqlite3=require('sqlite3');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {createStore}=require('../../agent/tutor/store');
const {installRoutes}=require('../../agent/tutor/routes');
const ROOT=path.resolve(__dirname,'../..');
const practiceMode=process.argv.includes('--practice');
async function main(){
 const db=new sqlite3.Database(':memory:');
 await new Promise((r,j)=>db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('fixture-A');"+fs.readFileSync(path.join(ROOT,'migrations/070_tutor_transport.sql'),'utf8')+fs.readFileSync(path.join(ROOT,'migrations/071_tutor_practice.sql'),'utf8')+fs.readFileSync(path.join(ROOT,'migrations/072_tutor_onboarding.sql'),'utf8'),e=>e?j(e):r()));
 const store=createStore(()=>db),app=express();app.use(express.json({limit:'40kb'}));
 app.use((_q,s,n)=>{s.set('Cross-Origin-Opener-Policy','same-origin');s.set('Cross-Origin-Embedder-Policy','require-corp');n();});
 const auth={user:{id:'fixture-A'},session:{csrf:'fixture-csrf'}};
 app.get('/api/auth/me',(_q,s)=>s.json({ok:true,user:auth.user,csrf:auth.session.csrf,consents:{}}));
 installRoutes(app,{store,enabled:()=>true,requireUser:async()=>auth,requireCsrf:(q,s)=>{if(q.get('X-LP-CSRF')!==auth.session.csrf){s.status(403).json({ok:false,error:'BAD_CSRF'});return false;}return true;},limiter:(_q,_s,n)=>n()});
 app.get('/api/client-config',(_q,s)=>s.json({ok:true,version:'3.11.691',tts:{enabled:false},agent:{enabled:false}}));
 app.use('/api',(_q,s)=>s.status(404).json({ok:false,error:'FIXTURE_ROUTE_NOT_AVAILABLE'}));
 app.use(express.static(path.join(ROOT,'public')));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await ctx.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||url.protocol==='blob:'?route.continue():route.abort();});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const shots=path.join(ROOT,'docs/research/mentor-byoa/2026-09-29/'+(practiceMode?'m2-screenshots':'m1-screenshots'));fs.mkdirSync(shots,{recursive:true});
 let token,worker,busy=false,hold=false,deliveries=[];
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
  const before=await page.evaluate(()=>window.__localDB.countReviewLog());
  await page.locator('.row-explain-btn').first().click({timeout:30000});
  await page.getByRole('dialog',{name:'Разберём вместе'}).waitFor();
  await page.getByRole('checkbox').filter({visible:true}).last().check();
  await page.getByRole('button',{name:'Спросить наставника',exact:true}).click();
  await page.getByText('[Fixture response]',{exact:false}).waitFor({timeout:15000});
  assert.equal(await page.evaluate(()=>window.__tutorXss),undefined);
  assert.equal(deliveries[0].context.surface,'room');
  assert.equal(deliveries[0].context.source.excerpt,'כשהייתי ילד גרתי בחיפה');
  assert.equal(await page.locator('dialog').locator('img').count(),0);
  await page.screenshot({path:path.join(shots,'room-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(shots,'room-mobile.png')});
  if(practiceMode){
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
  await page.getByText('[Fixture response]',{exact:false}).waitFor({timeout:15000});
  assert.equal(deliveries.length,1,'reload resumes result, does not regenerate');
  if(practiceMode){
   await page.getByRole('button',{name:'Закрепить за минуту',exact:true}).click();
   await page.getByRole('heading',{name:'Совпало с исходником',exact:true}).waitFor();
   await page.getByRole('button',{name:'К объяснению',exact:true}).click();
  }

  await page.getByRole('button',{name:'Вернуться к тексту',exact:true}).click();
  await page.evaluate(()=>window.__localDB.closeLocalDB());
  const payload=Buffer.from(JSON.stringify({v:1,type:'text',id:'m1-text'})).toString('base64url');
  await page.goto(origin+'/index.html#/t/'+payload,{waitUntil:'load'});
  await page.waitForFunction(()=>window.StudioAgentHost?.getRow(0)?._v3_sentenceId,{timeout:30000});
  await page.evaluate(()=>window.StudioAgent.explainRow(0));
  await page.getByRole('dialog',{name:'Разберём вместе'}).waitFor();
  // Exact same fragment resumes the Room answer across surfaces if its identity matches.
  await page.getByRole('textbox',{name:'Что хотите понять?'}).fill('Другой вопрос для проверки Студии');
  await page.getByRole('checkbox').filter({visible:true}).last().check();
  await page.getByRole('button',{name:'Спросить наставника',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('dialog')?.textContent!==undefined);
  await page.getByText('[Fixture response]',{exact:false}).waitFor({timeout:15000});
  assert.equal(deliveries.at(-1).context.surface,'studio');
  const after=await page.evaluate(async()=>{const db=await window.StudioAgentHost.ldb();return db.countReviewLog();});
  assert.equal(after,before,'tutor never writes review_log');
  await page.screenshot({path:path.join(shots,'studio-mobile.png')});
  if(practiceMode){
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
  await page.getByRole('textbox',{name:'Что хотите понять?'}).fill('Проверка отмены');
  await page.getByRole('button',{name:'Спросить наставника',exact:true}).click();
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
   await page.getByRole('checkbox').filter({visible:true}).last().check();
   await page.getByRole('button',{name:'לשאול את המורה',exact:true}).click();
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
  console.log(JSON.stringify({ok:true,practice:practiceMode,deliveries:deliveries.map(j=>({surface:j.context.surface,revision:j.context.source.revision_id})),review_log_unchanged:true,pageErrors:errors.slice(0,8)}));
 }catch(e){console.error('PANEL_STATE',await page.locator('dialog').innerText().catch(()=>''));console.error('PAGE_ERRORS',errors.slice(-5));throw e;}
 finally{clearInterval(worker);await browser.close();await new Promise(r=>server.close(r));await new Promise(r=>db.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
