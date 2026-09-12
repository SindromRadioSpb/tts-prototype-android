#!/usr/bin/env node
'use strict';
// Destructive cases run only in this disposable browser profile, against real OPFS SQLite.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),PORT=3347,REMOTE=process.env.MATERIAL_LIFECYCLE_BASE_URL,BASE=REMOTE||'http://127.0.0.1:'+PORT;
const OUT=process.env.MATERIAL_LIFECYCLE_EVIDENCE_DIR||path.join(ROOT,'docs/research/studio-material-lifecycle/2026-09-12');
fs.mkdirSync(path.join(ROOT,'.tmp'),{recursive:true});fs.mkdirSync(OUT,{recursive:true});
const TEMP=fs.mkdtempSync(path.join(ROOT,'.tmp/material-lifecycle-'));
const evidence={checks:[],errors:[],provider_requests:[],screenshots:[],mode:'fresh Chromium profile; real OPFS SQLite; synthetic materials only'};
const check=(name,ok)=>{assert.ok(ok,name);evidence.checks.push(name);console.log('PASS',name);};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function shot(page,name){
  await page.screenshot({path:path.join(OUT,name+'.png')});evidence.screenshots.push(name+'.png');
  check(name+' no overflow',await page.evaluate(()=>{const d=document.querySelector('.p2-portable-dialog');return document.documentElement.scrollWidth<=innerWidth+1&&(!d||d.scrollWidth<=d.clientWidth+1);}));
}
async function setup(page){return page.evaluate(async()=>{
  const db=await window.ensureLocalDB(),media=window.StudioMediaPackage.browserRepository();
  const raw=await window.MediaPackageCore.createRawRevision({media_sha256:'a'.repeat(64),format:'captions',provider:'fixture',segments:[{start_ms:0,end_ms:1000,text:'שלום עולם'}],provenance:{source:'local-lifecycle-test',zero_provider_calls:true}});
  const pkg=await media.createPackage({media:{sha256:'a'.repeat(64),mime:'video/mp4',duration_ms:1000,size_bytes:10,original_name:'Shared source.mp4'},raw_revision:raw});
  const caption=await media.getCurrentRevision(pkg.corrected_track_id),mr=window.MaterialRevisionRepository.createRepository(db,window.MaterialRevisionCore);
  for(const [id,title,archived] of [['lifecycle-main','В тайне — учебная версия',false],['lifecycle-archived','В сокрытии — madlad',true],['lifecycle-neighbor','Соседняя версия',false]]){
    await db.createText({id,text_key:id,title,source_text:'שלום עולם',tags_json:'[]'});
    await db.addSentence(id,{id:id+'-row',order_index:0,he_plain:'שלום עולם',ru:'Привет, мир'});
    await media.bindText({text_id:id,package_id:pkg.package_id,track_id:pkg.corrected_track_id,revision_id:caption.revision_id,revision_sha256:caption.canonical_sha256,mapping:{rows:[{row_index:0,corrected_caption_segment_id:caption.segments[0].caption_segment_id,raw_source_segment_ids:caption.segments[0].source_segment_ids}]}});
    await mr.promoteLegacyText(id);if(archived)await db.archiveText(id);
  }
  await db.dbRun("INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,meta_json) VALUES('lifecycle-review','lemma:שלום','review','2026-09-12',3,'fixture','{}')",[]);
  await db.dbRun("INSERT INTO word_status(lemma_key,status,updated_at) VALUES('שלום','learning','2026-09-12')",[]);
  const C=window.MediathequeCore||await import('/js/mediatheque-core.js').then(()=>window.MediathequeCore);
  let state=C.command(C.empty(),{type:'collection.create',id:'series',title:'Сериал. В тайне.'});
  state=C.command(state,{type:'items.add',target:'collection',id:'series',references:[{kind:'personal',textKey:'lifecycle-main'},{kind:'personal',textKey:'lifecycle-archived'},{kind:'personal',textKey:'lifecycle-gone'}]});
  await db.saveMediathequeStructure(state,0);
  return {packageId:pkg.package_id,review:await db.dbQuery('SELECT * FROM review_log ORDER BY id'),words:await db.dbQuery('SELECT * FROM word_status ORDER BY lemma_key'),neighbor:await db.dbQuery("SELECT * FROM texts WHERE id='lifecycle-neighbor'")};
});}
async function main(){
  const server=REMOTE?null:spawn(process.execPath,['server.js'],{cwd:ROOT,windowsHide:true,env:{...process.env,PORT:String(PORT),BIND_HOST:'127.0.0.1',DATA_DIR:TEMP,DB_PATH:path.join(TEMP,'app.db')},stdio:['ignore','pipe','pipe']});
  let log='',browser,page;if(server){server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);}
  evidence.base=BASE;evidence.runtime=REMOTE?'production; synthetic browser-local writes only':'local isolated server';
  try{
    for(let i=0;i<160;i++){if(server&&server.exitCode!==null)throw Error('SERVER_EXITED');try{if((await fetch(BASE+'/api/client-config')).ok)break;}catch{}await delay(250);}
    browser=await chromium.launch();const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
    context.on('page',p=>{p.on('pageerror',e=>evidence.errors.push(e.message));p.on('request',r=>{if(/\/api\/(translate|gemini|asr|tts\/synthesize)/.test(r.url()))evidence.provider_requests.push(r.url());});});
    await context.addInitScript(()=>{try{for(const key of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(key,'1');}catch(_){/* sandboxed embedded frames have no localStorage */}});
    page=await context.newPage();await page.goto(BASE+'/index.html?localMode=1',{waitUntil:'load'});await page.evaluate(async()=>{await window.__localDBInitPromise;window.appSetLocale('ru');});
    evidence.version=await page.evaluate(()=>window.APP_VERSION);check('expected app version',evidence.version===(process.env.MATERIAL_LIFECYCLE_EXPECT_VERSION||'3.11.527'));
    const baseline=await setup(page);
    check('failed material lookup cannot fall through to plain-text deletion',await page.evaluate(async()=>{
      const api=window.StudioPortableLearningPackage,original=api.materialForText;
      try{api.materialForText=async()=>{throw Error('synthetic lookup failure');};await window.v3LibraryDeleteText('lifecycle-main');}
      finally{api.materialForText=original;}
      return (await window.__localDB.dbQuery("SELECT id FROM texts WHERE id='lifecycle-main'")).length===1;
    }));
    const ml=await context.newPage();await ml.goto(BASE+'/mediatheque.html?space=personal&section=catalog&collection=series');await ml.locator('#ml-root[aria-busy="false"]').waitFor({timeout:60000});
    check('collection hides archived and absent personal references',await ml.locator('.ml-item').count()===1);
    check('no missing-personal placeholder',!(await ml.locator('#ml-content').innerText()).includes('Личный материал не найден'));
    await page.bringToFront();await page.evaluate(()=>window.StudioPortableLearningPackage.open({view:'materials'}));
    await page.locator('#p4MaterialSearch').fill('сокрытии');await page.locator('.p4-material-card').waitFor();check('search selects exact archived material',await page.locator('.p4-material-card').count()===1);
    await page.locator('button[data-next="more"]').last().click();await page.locator('[data-material-action="restore"]').waitFor();
    check('archived native material exposes restore/export/delete/rename',await page.locator('[data-material-action]').count()===5);
    await shot(page,'archived-actions-desktop-ru');
    await page.locator('[data-material-action="restore"]').click();await page.locator('[data-material-action="archive"]').waitFor();
    await ml.bringToFront();await ml.evaluate(()=>window.dispatchEvent(new Event('focus')));await ml.waitForFunction(()=>document.querySelectorAll('.ml-item').length===2);
    check('returning to Mediatheque restores collection membership without reload',true);
    await page.bringToFront();await page.locator('#p4MaterialName').fill('В сокрытии — новое название');await page.locator('[data-material-action="rename"]').click();await page.locator('.p4-material-detail h4').filter({hasText:'новое название'}).waitFor();
    check('rename persists to canonical text',await page.evaluate(async()=>(await window.__localDB.dbQuery("SELECT title FROM texts WHERE id='lifecycle-archived'"))[0].title==='В сокрытии — новое название'));
    await page.locator('[data-material-action="archive"]').click();await page.locator('[data-material-action="restore"]').waitFor();
    await ml.bringToFront();await ml.evaluate(()=>window.dispatchEvent(new Event('focus')));await ml.waitForFunction(()=>document.querySelectorAll('.ml-item').length===1);check('archive removes collection card on tab return',true);
    await page.bringToFront();await page.evaluate(()=>window.StudioPortableLearningPackage.open({view:'materials'}));await page.locator('[data-filter="archived"]').click();check('archive filter finds saved archived material',await page.locator('.p4-material-card').count()===1);
    await page.evaluate(()=>window.StudioPortableLearningPackage.openMaterialActions('lifecycle-main'));
    await page.locator('[data-material-action="study"]').click();await page.locator('#proTable tbody tr[data-row-idx]').waitFor();
    check('study action opens the selected Hebrew table',await page.locator('#proTable tbody tr[data-row-idx]').count()===1&&(await page.locator('#proTable').innerText()).includes('שלום עולם'));
    await page.evaluate(()=>window.StudioPortableLearningPackage.openMaterialActions('lifecycle-main'));await page.locator('[data-material-action="source"]').click();await page.locator('#l3MediaEditorModal:not(.hidden)').waitFor();
    check('source action opens the real shared transcript',await page.locator('#l3CueText').inputValue()==='שלום עולם');
    await page.evaluate(()=>window.StudioMediaEditor.close(true));
    for(const locale of ['ru','en','he']){
      await page.setViewportSize({width:380,height:844});await page.evaluate(async lang=>{window.appSetLocale(lang);await window.StudioPortableLearningPackage.openMaterialActions('lifecycle-main');},locale);
      await shot(page,'material-actions-380-'+locale);
    }
    await page.evaluate(()=>{window.appSetLocale('ru');document.querySelector('#p2PortableModal').hidden=true;return window.v3LibraryDeleteText('lifecycle-main');});
    await page.locator('[data-delete-preview="lifecycle-main"]').waitFor();
    check('Library Delete opens explicit material deletion instead of archive',await page.locator('[data-delete-confirm]').innerText()==='Удалить материал');
    await shot(page,'delete-preview-380-ru');
    await page.locator('[data-delete-back]').click();check('cancel changes no material',await page.evaluate(async()=>(await window.__localDB.dbQuery("SELECT is_archived FROM texts WHERE id='lifecycle-main'"))[0].is_archived===0));
    await page.locator('[data-material-action="delete"]').click();await page.locator('[data-delete-confirm]').waitFor();
    const download=page.waitForEvent('download');await page.locator('[data-delete-export]').click();const saved=await download;await saved.saveAs(path.join(TEMP,'material.lplp.zip'));
    check('export before deletion downloads a real archive',fs.statSync(path.join(TEMP,'material.lplp.zip')).size>100);
    await page.locator('[data-delete-confirm]:not([disabled])').waitFor();
    await page.evaluate(()=>window.__localDB.updateText('lifecycle-main',{title:'Изменено после предпросмотра'}));
    await page.locator('[data-delete-confirm]').click();await page.locator('#p4MaterialStatus').filter({hasText:'изменился'}).waitFor();check('stale preview refuses deletion',await page.evaluate(async()=>(await window.__localDB.dbQuery("SELECT id FROM texts WHERE id='lifecycle-main'")).length===1));
    await page.locator('[data-delete-back]').click();await page.locator('[data-material-action="delete"]').click();await page.locator('[data-delete-confirm]').click();await page.locator('.p4-materials').waitFor();
    check('confirmed delete actually removes text and its version history',await page.evaluate(async()=>{const db=window.__localDB;return !(await db.dbQuery("SELECT id FROM texts WHERE id='lifecycle-main'")).length&&!(await db.dbQuery("SELECT material_id FROM studio_learning_materials WHERE text_id='lifecycle-main'")).length;}));
    await ml.bringToFront();await ml.evaluate(()=>window.dispatchEvent(new Event('focus')));await ml.waitForFunction(()=>document.querySelectorAll('.ml-item').length===0);check('deleted text disappears from existing collection tab',true);
    await page.bringToFront();await page.reload();await page.evaluate(async()=>{await window.__localDBInitPromise;await window.ensureLocalDB();});
    const final=await page.evaluate(async()=>{const db=window.__localDB;return {review:await db.dbQuery('SELECT * FROM review_log ORDER BY id'),words:await db.dbQuery('SELECT * FROM word_status ORDER BY lemma_key'),neighbor:await db.dbQuery("SELECT * FROM texts WHERE id='lifecycle-neighbor'"),sources:await db.dbQuery('SELECT package_id FROM studio_media_packages'),fk:await db.dbQuery('PRAGMA foreign_key_check'),gone:await db.dbQuery("SELECT id FROM texts WHERE id='lifecycle-main'")};});
    check('cold reopen preserves completed deletion',final.gone.length===0);check('neighbor unchanged',JSON.stringify(final.neighbor)===JSON.stringify(baseline.neighbor));check('shared source retained',final.sources.some(p=>p.package_id===baseline.packageId));check('review_log unchanged',JSON.stringify(final.review)===JSON.stringify(baseline.review));check('word_status unchanged',JSON.stringify(final.words)===JSON.stringify(baseline.words));check('no FK or browser errors',!final.fk.length&&!evidence.errors.length);check('zero provider calls',!evidence.provider_requests.length);
    evidence.status='PASS';
  }catch(error){evidence.status='FAIL';evidence.failure=error.stack;if(page)await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});throw error;}
  finally{fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));if(browser)await browser.close();if(server)server.kill();fs.writeFileSync(path.join(TEMP,'server.log'),log);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
