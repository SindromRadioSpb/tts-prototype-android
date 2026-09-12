#!/usr/bin/env node
'use strict';
// Own server + fresh Chromium profiles. All publication attestations below are synthetic fixtures.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const P=require('../../public/js/playback-source');
const ROOT=path.resolve(__dirname,'../..'),PORT=3343,BASE='http://127.0.0.1:'+PORT;
const OUT=process.env.MEDIATHEQUE_EVIDENCE_DIR || path.join(ROOT,'docs/research/room-mediatheque-stage2/2026-09-12/local');
const TEMP=fs.mkdtempSync(path.join(ROOT,'.tmp/mediatheque-smoke-'));
const SECRET='isolated-mediatheque-fixture-only-'+Date.now();
const evidence={checks:[],errors:[],screenshots:[],mode:'isolated local server; synthetic content; fresh browser profiles'};
const check=(name,ok)=>{assert.ok(ok,name);evidence.checks.push(name);console.log('PASS',name);};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(OUT,{recursive:true});
async function ready(page){await page.locator('#ml-root[aria-busy="false"]').waitFor({timeout:60000});}
async function act(page,action){await page.locator('[data-action="'+action+'"]').first().click();}
async function submit(page){await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-dialog').waitFor({state:'hidden',timeout:10000});}
async function structure(page){return page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');return db.getMediathequeStructure();});}
async function shot(page,name){await page.locator('#ml-status:empty').waitFor({state:'attached',timeout:13000});await page.screenshot({path:path.join(OUT,name+'.png')});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);check(name+' no horizontal overflow',!overflow);evidence.screenshots.push(name+'.png');}
async function post(page,url,body,headers={}){return page.evaluate(async({url,body,headers})=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-LP-CSRF':localStorage.getItem('cloud.csrf')||'','X-Idempotency-Key':crypto.randomUUID(),...headers},body:JSON.stringify(body)});return {status:response.status,...await response.json()};},{url,body,headers});}
async function publishFixture(page){
 const create=await post(page,'/api/publication/corpora',{slug:'media-fixture',title:'Учебные видео — тестовый корпус'});assert.ok(create.ok,JSON.stringify(create));
 const id=create.corpus_id,record=P.append(null,{url:'https://www.youtube.com/watch?v=iG9CE55wbtY'},{now:'2026-09-12T00:00:00Z'});
 const copied=await post(page,`/api/publication/corpora/${id}/draft/items:copy`,{expectedVersion:create.draft_version,items:[{sourceWorkId:'public-video',title:'Открытый учебный материал',expectedAudioCount:0,snapshot:{library:{texts:[{text_key:'public-video',source_meta:{playback_source:record},rows:[{order_index:0,hebrew_plain:'שלום עולם',russian:'Привет, мир'}]}],audio_assets:[]}}}]});assert.ok(copied.ok,JSON.stringify(copied));
 const rights=await post(page,`/api/publication/corpora/${id}/draft/rights:apply-study-songs-preset`,{expectedVersion:copied.draft_version,itemIds:copied.items.map(i=>i.item_id),preset:{public_read_allowed:true,public_stream_allowed:true,package_download_allowed:true,basis:'OWNER_ATTESTATION_SYNTHETIC_LOCAL_TEST_2026_09_12',asserted_at:'2026-09-12'}});assert.ok(rights.ok,JSON.stringify(rights));
 const published=await post(page,`/api/publication/corpora/${id}:publish`,{expectedVersion:rights.draft_version});assert.ok(published.ok,JSON.stringify(published));return id;
}
async function personal(page){
 await page.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(page);
 const before=await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');
  for(let n=0;n<45;n++){const id='ml-fixture-'+String(n).padStart(2,'0');await db.createText({id,text_key:id,title:n===0?'שָׁלוֹם — Жизнь в Израиле':n===1?'Интервью о космосе':'Учебный материал '+String(n).padStart(2,'0'),source:'Тестовый источник',tags_json:JSON.stringify(n===1?['космос']:['иврит']),source_meta_json:n<3?JSON.stringify({source:{audio:{video:{videoId:'iG9CE55wbtY',author:'Тестовый источник'},durationSec:480}}}):'{}'});await db.addSentence(id,{id:'row-'+n,order_index:0,he_plain:'שלום עולם',ru:'Привет, мир'});}
  await db.dbRun("INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json) VALUES('ml-proof','lemma:proof','review',datetime('now'),3,'fixture','lab',123,'{}')",[]);
  return db.dbQuery('SELECT * FROM review_log ORDER BY id',[]);
 });
 await page.reload();await ready(page);check('45 materials render in bounded 36-card page',await page.locator('.ml-item').count()===36);
 await act(page,'next-page');check('second page contains remaining nine materials',await page.locator('.ml-item').count()===9);await page.reload();await ready(page);check('pagination survives reload',await page.locator('.ml-item').count()===9);
 await act(page,'organize');
 for(const title of ['Наука','История']){await act(page,'new-category');await page.locator('[name=title]').fill(title);await submit(page);}
 let s=await structure(page);const science=s.structure.categories[0].id,history=s.structure.categories[1].id;
 await act(page,'new-category');await page.locator('[name=title]').fill('Космос');await page.locator('[name=parentId]').selectOption(science);await submit(page);
 await act(page,'new-collection');await page.locator('[name=title]').fill('На каждый день');await page.locator('[name=pinned]').check();await submit(page);
 await page.locator('#ml-search').fill('космос');await page.waitForFunction(()=>document.querySelectorAll('.ml-item').length===1);check('search reaches material outside current page',true);
 await page.locator('[data-select]').check();await act(page,'assign');await page.locator('[name=target]').selectOption('category:'+science);await submit(page);
 await page.locator('[data-select]').check();await act(page,'assign');await page.locator('[name=target]').selectOption('category:'+history);await submit(page);
 s=await structure(page);check('same material belongs to two categories without copying',s.structure.categories[0].items[0]===s.structure.categories[1].items[0]);
 await act(page,'save-view');await page.locator('[name=title]').fill('Космос — поиск');await submit(page);
 await page.locator('[data-action=section][data-section=topics]').click();
 await page.locator('[data-action=edit-category][data-id="'+science+'"]').click();await act(page,'merge-category');await page.locator('[name=targetId]').selectOption(history);await page.locator('#ml-form button[type=submit]').click();await page.locator('.ml-change-preview').waitFor();check('merge preview does not write',(await structure(page)).structure.categories.length===3);await submit(page);
 s=await structure(page);check('merge deduplicates material and moves child branch',s.structure.categories.length===2&&s.structure.categories.find(c=>c.id===history).items.length===1&&s.structure.categories.find(c=>c.title==='Космос').parentId===history);
 await act(page,'undo');await page.waitForFunction(()=>document.querySelectorAll('[data-action=edit-category]').length>=3);s=await structure(page);check('undo restores category branch',s.structure.categories.length===3);
 await page.locator('[data-action=edit-category][data-id="'+science+'"]').click();await page.locator('[name=title]').fill('Наука и технологии');await submit(page);
 s=await structure(page);check('rename preserves category identity',s.structure.categories.find(c=>c.id===science).title==='Наука и технологии');
 const downloadPromise=page.waitForEvent('download');await act(page,'export');const file=await downloadPromise;const backup=fs.readFileSync(await file.path());
 await act(page,'new-category');await page.locator('[name=title]').fill('Временная');await submit(page);
 await act(page,'import');await page.locator('[name=file]').setInputFiles({name:'structure.json',mimeType:'application/json',buffer:backup});await page.locator('#ml-form button[type=submit]').click();await page.locator('.ml-change-preview').waitFor();check('restore preview names removed category and does not write',(await page.locator('.ml-change-preview').innerText()).includes('Временная')&&(await structure(page)).structure.categories.length===4);await submit(page);check('structure restore returns exact prior categories',(await structure(page)).structure.categories.length===3);
 await act(page,'organize');await page.locator('[data-action=section][data-section=catalog]').click();await page.locator('#ml-view-select').selectOption((await structure(page)).structure.views[0].id);
 for(let i=0;i<3;i++){await page.reload();await ready(page);check('saved search survives reload '+(i+1),await page.locator('.ml-item').count()===1&&await page.locator('#ml-search').inputValue()==='космос');}
 await act(page,'reset-filters');await page.locator('#ml-sort').selectOption('title');await shot(page,'catalog-desktop-ru');
 await page.locator('#ml-theme').click();await shot(page,'catalog-desktop-dark');await page.locator('#ml-theme').click();
 for(const locale of ['ru','en','he']){await page.setViewportSize({width:380,height:844});await page.evaluate(l=>window.appSetLocale(l),locale);await shot(page,'catalog-380-'+locale);}
 await page.evaluate(()=>window.appSetLocale('ru'));await page.setViewportSize({width:1280,height:900});
 await page.locator('#ml-search').fill('космос');await page.waitForFunction(()=>document.querySelectorAll('.ml-item').length===1);
 await page.locator('[data-action=layout][data-layout=list]').click();await page.locator('.ml-item .ml-open').click();await page.locator('#roomReader').waitFor({timeout:60000});await page.waitForFunction(()=>document.querySelector('#roomReader')?.innerText.includes('שלום'),null,{timeout:60000});check('material opens original Hebrew rows in Room reader',true);
 const after=await page.evaluate(()=>window.__localDB.dbQuery('SELECT * FROM review_log ORDER BY id',[]));check('organization and reader navigation preserve review_log exactly',JSON.stringify(before)===JSON.stringify(after));
 await page.locator('#readerBack').click();await ready(page);check('reader returns to exact personal search and list view',await page.locator('#ml-search').inputValue()==='космос'&&await page.locator('.ml-materials[data-layout=list]').count()===1&&await page.locator('.ml-item').count()===1);
 await page.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(page);check('original 45 materials remain after all organizational edits',await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');return (await db.dbQuery("SELECT COUNT(*) n FROM texts WHERE id LIKE 'ml-fixture-%'",[]))[0].n===45;}));
}
async function stageTwo(page) {
 await page.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(page);
 await act(page,'next-page');await page.goBack();await page.waitForFunction(()=>document.querySelectorAll('.ml-item').length===36);
 check('browser Back restores the preceding catalogue page',true);
 await page.goForward();await page.waitForFunction(()=>document.querySelectorAll('.ml-item').length===9);check('browser Forward restores the next catalogue page',true);
 await act(page,'previous-page');await act(page,'organize');
 const checkbox=page.locator('[data-select]').nth(4),key=await checkbox.getAttribute('data-select');await checkbox.focus();await page.keyboard.press('Space');
 check('keyboard selection keeps focus on the same checkbox',await page.evaluate(k=>document.activeElement.dataset.select===k,key));
 await page.setViewportSize({width:380,height:844});await shot(page,'selected-mobile');
 check('mobile bulk actions stay inside the viewport',await page.locator('.ml-bulk[data-has-selection=true]').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
 await act(page,'clear-selection');await act(page,'organize');
 await act(page,'open-filters');await page.locator('#ml-picker-search').fill('Наука');await page.locator('.ml-picker-options [data-action=filter-topic]').first().click();
 await shot(page,'topics-panel-mobile');const previousUrl=page.url();for(let n=0;n<18;n++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('#ml-dialog')));}
 check('keyboard focus remains inside the modal panel',true);await page.keyboard.press('Escape');check('Escape closes filters and preserves the original catalogue',page.url()===previousUrl&&!await page.locator('#ml-dialog').isVisible());
 await act(page,'open-filters');await page.locator('#ml-picker-search').fill('Наука');await page.locator('.ml-picker-options [data-action=filter-topic]').first().click();await submit(page);
 check('mobile topic scope reaches actual material',await page.locator('.ml-item').count()===1&&(await page.locator('.ml-breadcrumbs').innerText()).includes('Наука'));
 const saved=(await structure(page)).structure.views[0];await page.locator('#ml-view-select').selectOption(saved.id);await page.locator('#ml-sort').selectOption('added_desc');
 check('modified saved view is explicitly marked',(await page.locator('.ml-view-state').innerText()).includes('Условия изменены'));
 await page.reload();await ready(page);check('reload preserves modified view conditions',await page.locator('#ml-sort').inputValue()==='added_desc'&&(await page.locator('.ml-view-state').innerText()).includes('Условия изменены'));
 await page.locator('.ml-view-state [data-action=view-rules]').click();check('saved rules are reviewable',(await page.locator('#ml-dialog').innerText()).includes('космос'));await act(page,'cancel-dialog');
 await page.locator('.ml-view-state [data-action=use-view]').click();check('restore saved conditions is immediate',await page.locator('#ml-sort').inputValue()===saved.filters.sort);
 await act(page,'reset-filters');await page.setViewportSize({width:1280,height:900});
 await act(page,'organize');await act(page,'new-category');await page.locator('[name=title]').fill('Мой несохранённый ввод');
 const other=await page.context().newPage();await other.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(other);await act(other,'organize');await act(other,'new-category');await other.locator('[name=title]').fill('Из другой вкладки');await submit(other);
 await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-form[data-conflict=true]').waitFor();
 check('two-tab conflict preserves entered form and prevents stale overwrite',await page.locator('[name=title]').inputValue()==='Мой несохранённый ввод'&&await page.locator('#ml-form button[type=submit]').isDisabled());
 await act(page,'refresh-structure');check('conflict recovery exposes committed other-tab change',(await structure(page)).structure.categories.some(c=>c.title==='Из другой вкладки'));await act(page,'undo');await other.close();
 await act(page,'organize');
 const card=page.locator('.ml-item').nth(12),anchor=card.locator('.ml-open');await anchor.scrollIntoViewIfNeeded();
 const position=await card.evaluate(n=>({key:n.dataset.key,top:n.getBoundingClientRect().top}));await anchor.click();await page.locator('#roomReader').waitFor({timeout:60000});await page.locator('#readerBack').click();await ready(page);
 await page.waitForFunction(p=>{const n=Array.from(document.querySelectorAll('.ml-item')).find(n=>n.dataset.key===p.key);return n&&Math.abs(n.getBoundingClientRect().top-p.top)<3;},position);
 check('reader return restores the original card position and keyboard focus',await page.evaluate(p=>document.activeElement.closest('.ml-item')?.dataset.key===p.key,position));
 await act(page,'organize');for(const index of [0,1,3])await page.locator('[data-select]').nth(index).check();await act(page,'assign');const collection=(await structure(page)).structure.collections[0];await page.locator('[name=target]').selectOption('collection:'+collection.id);await submit(page);
 await page.locator('[data-action=section][data-section=collections]').click();await page.locator('[data-action=edit-collection]').first().click();await page.locator('[name=description]').fill('Короткие материалы для ежедневного чтения и просмотра.');await submit(page);await act(page,'organize');
 check('collection summary distinguishes known and unknown duration',(await page.locator('.ml-collection').innerText()).includes('16:00')&&(await page.locator('.ml-collection').innerText()).includes('неизвест'));
 await page.locator('.ml-collection a[data-nav]').first().click();check('collection detail offers actual reading continuation',await page.locator('.ml-collection-context a').count()===1);
 await page.locator('[data-action=section][data-section=home]').click();await page.evaluate(()=>scrollTo(0,0));await shot(page,'home-desktop');
 await page.setViewportSize({width:380,height:844});await page.evaluate(()=>scrollTo(0,0));await shot(page,'home-mobile');await page.setViewportSize({width:1280,height:900});
}
async function editorial(page,guest){
 await page.goto(BASE+'/mediatheque.html?space=public');await ready(page);
 const auth=await post(page,'/api/auth/bootstrap-login',{secret:SECRET});assert.ok(auth.ok);await page.evaluate(csrf=>localStorage.setItem('cloud.csrf',csrf),auth.csrf);
 const corpusId=await publishFixture(page);await page.reload();await ready(page);
 check('public catalogue shows actual immutable publication',await page.locator('.ml-item').count()===1);
 await act(page,'organize');await act(page,'new-category');await page.locator('[name=title]').fill('Публичная наука');
 await page.route('**/api/publication/mediatheque/draft',route=>route.abort('failed'));await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-form-error:not([hidden])').waitFor();
 check('failed editorial request retains form input',await page.locator('[name=title]').inputValue()==='Публичная наука');await page.unroute('**/api/publication/mediatheque/draft');await submit(page);
 await page.locator('[data-action=section][data-section=catalog]').click();await page.locator('[data-select]').check();await act(page,'assign');await page.locator('[name=target]').selectOption({index:1});await submit(page);
 await guest.goto(BASE+'/mediatheque.html?space=public&section=topics');await ready(guest);check('visitor cannot see draft category',!(await guest.locator('#ml-root').innerText()).includes('Публичная наука'));
 await act(page,'preview');check('preview hides editorial category controls',await page.locator('[data-action=new-category]').count()===0);await act(page,'publish');check('publication preview names actual changed topic and material',(await page.locator('.ml-change-preview').innerText()).includes('Публичная наука'));await shot(page,'publication-preview');await submit(page);
 await guest.reload();await ready(guest);check('visitor receives published structure',(await guest.locator('#ml-root').innerText()).includes('Публичная наука'));
 const noCsrf=await post(page,'/api/publication/mediatheque/draft',{}, {'X-LP-CSRF':'bad'});check('editorial writes reject incorrect CSRF',noCsrf.status===403);
 const guestWrite=await post(guest,'/api/publication/mediatheque/draft',{});check('anonymous editor writes rejected',guestWrite.status===401);
 await guest.locator('[data-action=section][data-section=catalog]').click();await act(guest,'add-item');await guest.locator('[name=newTitle]').fill('Моя публичная подборка');await submit(guest);
 await guest.locator('[data-action=space][data-space=personal]').click();await guest.locator('[data-action=section][data-section=collections]').click();check('public reference saved in visitor personal collection',await guest.locator('.ml-collection').count()===1);
 const saved=await structure(guest);check('saving public reference does not clone material content',await guest.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');return (await db.dbQuery('SELECT COUNT(*) n FROM texts',[]))[0].n===0;}));
 const withdrawal=await post(page,`/api/publication/corpora/${corpusId}:withdraw`,{reason:'SYNTHETIC_TEST_WITHDRAWAL'});assert.ok(withdrawal.ok,JSON.stringify(withdrawal));
 await guest.reload();await ready(guest);await guest.locator('.ml-collection a').first().click();check('withdrawn public material remains an honest unavailable personal reference',(await guest.locator('.ml-item').innerText()).includes('недоступ'));
 check('withdrawal does not rewrite private collection',JSON.stringify((await structure(guest)).structure)===JSON.stringify(saved.structure));
}
async function offline(browser){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(page);
 await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');await db.createText({id:'offline-proof',text_key:'offline-proof',title:'Офлайн-материал'});await db.addSentence('offline-proof',{id:'offline-row',order_index:0,he_plain:'שלום',ru:'Привет'});});
 await page.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:90000});
 await context.setOffline(true);await page.reload();await ready(page);await page.locator('.ml-item').waitFor();
 check('fresh service-worker installation supports offline personal catalogue',await page.locator('.ml-item').innerText().then(t=>t.includes('Офлайн-материал')));
 await act(page,'organize');await act(page,'new-category');await page.locator('[name=title]').fill('Офлайн-тема');await submit(page);
 await page.reload();await ready(page);check('offline organization survives reload',(await structure(page)).structure.categories[0].title==='Офлайн-тема');
 await context.setOffline(false);
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js?stage2_update=1',{scope:'/'});});await page.locator('[data-action=update-app]').waitFor({timeout:90000});
 await act(page,'organize');await act(page,'new-category');await page.locator('[name=title]').fill('Несохранённая форма');await page.waitForTimeout(250);
 check('waiting service worker does not reload an unsaved form',await page.locator('[name=title]').inputValue()==='Несохранённая форма');await act(page,'cancel-dialog');
 await Promise.all([page.waitForEvent('load'),act(page,'update-app')]);await ready(page);
 check('explicit service-worker update preserves the saved OPFS structure',(await structure(page)).structure.categories[0].title==='Офлайн-тема');
 await context.close();
}
async function scaleBrowser(browser) {
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await context.newPage();
 page.on('pageerror',e=>evidence.errors.push(e.message));await page.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(page);
 await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');await db.dbRun("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<5000) INSERT INTO texts(id,text_key,title,source,source_text,source_meta_json,created_at,updated_at) SELECT 'scale-'||printf('%05d',n),'scale-'||n,'Материал '||printf('%05d',n),'Источник '||(n%250),'שלום','{}',datetime('now'),datetime('now') FROM seq",[]);});
 const start=Date.now();await page.reload();await ready(page);const loadMs=Date.now()-start;
 check('5000-material OPFS library loads within 15 seconds and keeps bounded DOM',loadMs<15000&&await page.locator('.ml-item').count()===36);
 const searchStart=Date.now();await page.locator('#ml-search').fill('04999');await page.waitForFunction(()=>document.querySelectorAll('.ml-item').length===1);const searchMs=Date.now()-searchStart;
 check('large library title search returns actual result within 1500 ms',searchMs<1500&&(await page.locator('.ml-item h3').innerText()).includes('04999'));
 evidence.scale={materials:5000,loadMs,searchMs,sourceCount:250};await context.close();
}
async function main(){
 const server=spawn(process.execPath,['server.js'],{cwd:ROOT,windowsHide:true,env:{...process.env,PORT:String(PORT),BIND_HOST:'127.0.0.1',DATA_DIR:TEMP,DB_PATH:path.join(TEMP,'app.db'),AUTH_BOOTSTRAP_SECRET:SECRET},stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
 let browser,page;
 try{for(let n=0;n<150;n++){if(server.exitCode!==null)throw Error('server exited '+server.exitCode);try{const r=await fetch(BASE+'/api/client-config');if(r.ok)break;}catch{}await delay(200);}
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),guestContext=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 for(const c of [context,guestContext]){await c.addInitScript(()=>{try { localStorage.setItem('localMode','1');localStorage.setItem('onboardingSeen_v1','1'); } catch (_) {}});c.on('page',p=>p.on('pageerror',e=>evidence.errors.push(e.message)));}
 page=await context.newPage();const guest=await guestContext.newPage();await personal(page);await stageTwo(page);await editorial(page,guest);await offline(browser);await scaleBrowser(browser);check('zero browser page errors',evidence.errors.length===0);evidence.status='PASS';
 }catch(e){evidence.status='FAIL';evidence.failure=e.stack;if(page)await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});throw e;}
 finally{fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));if(browser)await browser.close();server.kill();fs.writeFileSync(path.join(TEMP,'server.log'),log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
