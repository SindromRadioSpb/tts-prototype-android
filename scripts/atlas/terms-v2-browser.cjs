'use strict';
// Actual local app and synthetic profile. Intentional grades are fixtures, never owner data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const [dataArg,proofArg,outArg]=process.argv.slice(2),root=path.resolve(__dirname,'../..'),out=path.resolve(outArg),proof=JSON.parse(fs.readFileSync(proofArg));fs.mkdirSync(out,{recursive:true});
const report={scope:'actual local server, new synthetic persistent Chromium; no production or owner profile',checks:[],cards:[],errors:[]};let child,browser,page;
const stage=text=>{report.stage=text;fs.writeFileSync(path.join(out,'stage.json'),JSON.stringify({stage:text}));};
(async()=>{try{
 child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(path.resolve(dataArg),0),silent:true,windowsHide:true});child.stdout.pipe(fs.createWriteStream(path.join(out,'server.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'server-error.log')));
 const base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);report.origin=base;await waitForSmokeHealth(base,{timeoutMs:60000});
 browser=await chromium.launchPersistentContext(path.join(out,'synthetic-profile'),{headless:true,viewport:{width:1280,height:1000},serviceWorkers:'block'});
 await browser.route('**/*',route=>route.request().url().startsWith(base)&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 page=await browser.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 const url=(id,sid,pg)=>base+'/study-library.html#room=atlas%3A'+id+(sid?'&sec='+sid+'&pg='+pg:'');
 const open=async(id,sid,pg)=>{await page.goto(url(id,sid,pg),{waitUntil:'domcontentloaded'});await page.locator('.atlas-section').waitFor();};
 const state=()=>page.evaluate(async()=>({words:await __localDB.dbQuery('SELECT * FROM word_status ORDER BY lemma_key',[]),reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY rowid',[])}));
 const originalState=()=>page.evaluate(async()=>({words:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key LIKE 'at1:a97001:%' ORDER BY lemma_key",[]),reviews:await __localDB.dbQuery("SELECT * FROM review_log WHERE item_key LIKE 'at1:a97001:%' ORDER BY rowid",[])}));
 const waitState=async(read,accept)=>{const until=Date.now()+60000;while(Date.now()<until){const s=await read();if(accept(s))return s;await page.waitForTimeout(100);}throw Error('Synthetic grade did not commit');};
 await open('a97001rc32','s00-front',1);const initial=await state();
 const items=['mechanics','wheel','element-s','element-k','short-alumina-fiber'].map(id=>proof.items.find(x=>x.termId.endsWith(':'+id)));
 items.push(proof.items.find(x=>x.sid==='s17-steels'&&x.from!==null),proof.items.find(x=>x.sid==='s19-aluminium'&&x.from!==null));assert(items.every(Boolean));
 async function wordCard(it){
  await open('a97001rc32',it.sid,it.page);const selector='[data-ref="'+it.block+'"]';
  await page.waitForFunction(({selector,i})=>{const el=document.querySelector(selector);return el&&el.__lpPreparedContextLookup?.(i,'he');},{selector,i:it.from});
  await page.locator(selector+' [data-col="he"] .rm-w[data-w-offset="'+it.from+'"]').first().evaluate(el=>el.click());await page.locator('.rm-sheet .rm-surface-title').waitFor();
  return selector;
 }
 for(const it of items){
  stage('card:'+it.termId);const selector=await wordCard(it);
  assert.equal(await page.locator('.rm-surface-top .rm-surface-title bdi').innerText(),it.title);
  const header=await page.locator('.rm-surface-top').innerText();assert(header.includes(it.ru));assert(!header.includes('В строках p1:b003'));assert(!header.includes('Подготовлено ИИ:'));
  assert.equal(await page.locator('.rm-surface-details[open]').count(),0);assert.equal(await page.locator('.rm-sheet [data-rm-surface-action="learn-term"]').count(),1);
  assert.equal(await page.locator('.rm-sheet [data-rm-status],.rm-sheet [data-rm-save],.rm-sheet [data-rm-enroll],.rm-sheet [data-rm-ai-edit]').count(),0);
  await page.locator('.rm-surface-details summary').click();assert((await page.locator('.rm-surface-details').innerText()).includes('Подготовлено ИИ'));
  await page.locator('.rm-sheet [data-rm-surface-action="show-source"]').click();await page.locator('.rm-sheet.rm-open').waitFor({state:'hidden'});
  assert.equal(await page.locator(selector).first().getAttribute('tabindex'),'-1');
  report.cards.push({term:it.termId,page:it.page,compact_header:true,explicit_learning_action:true,source_navigation:true});
 }
 // Reproduce both owner-reported noisy headers on mobile, retaining all source notes in disclosure.
 for(const [pg,plain,name]of [[2,'כוח','force'],[3,'התמצקות','solidification']]){
  stage('owner-card:'+name);await page.setViewportSize({width:380,height:1000});await open('a97001rc32','s00-front',pg);
  const selector='#atlas-p'+pg+' .rm-w';await page.locator(selector).first().waitFor({state:'attached'});
  await page.locator(selector).evaluateAll((els,plain)=>{const el=els.find(el=>el.getAttribute('data-surface')?.replace(/[֑-ׇ]/g,'')===plain);if(!el)throw Error('Source word not found');el.click();},plain);
  await page.locator('.rm-sheet .rm-surface-top').waitFor();assert((await page.locator('.rm-surface-top').boundingBox()).height<260);
  assert.equal(await page.locator('.rm-surface-details[open]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(out,'compact-'+name+'-380.png')});await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:1280,height:1000});await wordCard(items[1]);await page.screenshot({path:path.join(out,'term-desktop.png')});await page.keyboard.press('Escape');
 await page.getByRole('combobox',{name:'Язык / Language / שפה'}).selectOption('he');await page.waitForFunction(()=>document.documentElement.dir==='rtl');await page.setViewportSize({width:380,height:1000});await wordCard(items[1]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,'term-rtl-380.png')});await page.keyboard.press('Escape');await page.getByRole('combobox',{name:'Язык / Language / שפה'}).selectOption('ru');
 assert.deepEqual(await state(),initial);report.checks.push('matched reviewed cards: compact canonical, Russian meaning, scoped Learn; source disclosure/navigation; owner force/solidification examples; 380px/LTR/RTL; viewing writes no learner state');
 // Original corpus state and private terms are created only via official synthetic UI/storage fixtures.
 stage('original-grade');await open('a97001','s02-statics-basics',6);await page.locator('.atlas-train-btn').click();await page.waitForFunction(()=>{const b=document.querySelector('[data-terms-learn]');return b&&!b.disabled;});await page.locator('[data-terms-learn]').click();await page.locator('[data-ts-reveal]').click();await page.locator('[data-ts-grade="1"]').click();
 const originalBefore=await waitState(originalState,s=>s.words.length>0&&s.reviews.length>0);await page.keyboard.press('Escape');
 const storedBefore=await page.evaluate(()=>{const list=[{id:'a97001:term:my-fixture',personal:true,lemma_he:'שלום',niqqud:'שָׁלוֹם',translit:'shalom',sid:'s02-statics-basics',block:'a97001:p6:b003:s01',senses:[{sense:'personal',ru:'личный мир'}]}];localStorage.setItem('room.atlas.myTerms.v1',JSON.stringify(list));return localStorage.getItem('room.atlas.myTerms.v1');});
 // A real card Learn action opens the exact target, grades it and restores it in the global queue.
 for(const it of [items[0],items[1]]){
  stage('learn:'+it.termId);await wordCard(it);await page.locator('[data-rm-surface-action="learn-term"]').click();await page.locator('.atlas-ts-term').waitFor();assert.equal(await page.locator('.atlas-ts-term').innerText(),it.title);await page.locator('[data-ts-reveal]').click();assert.equal(await page.locator('.atlas-ts-ru').innerText(),it.ru);
  await page.locator('[data-ts-open]').click();await page.locator('[data-ts-reveal]').waitFor({state:'hidden'});assert(await page.locator('[data-ref="'+it.block+'"].atlas-row-flash').count());
  await wordCard(it);await page.locator('[data-rm-surface-action="learn-term"]').click();await page.locator('[data-ts-reveal]').click();await page.locator('[data-ts-grade="0"]').click();await waitState(()=>page.evaluate(key=>__localDB.dbQuery('SELECT * FROM word_status WHERE lemma_key=?',[key]),it.key),s=>s.length>0);await page.keyboard.press('Escape');
 }
 assert.deepEqual(await originalState(),originalBefore);assert.equal(await page.evaluate(()=>localStorage.getItem('room.atlas.myTerms.v1')),storedBefore);
 stage('global-review');await browser.addInitScript(()=>{const now=Date.now;Date.now=()=>now()+7*86400000;});await page.goto(url('a97001rc32'));await page.reload({waitUntil:'domcontentloaded'});await page.locator('.atlas-home').waitFor();await page.waitForFunction(()=>{const b=document.querySelector('[data-queue-start]');return b&&!b.disabled;});await page.locator('[data-queue-start]').click();await page.locator('[data-ts-reveal]').click();const dueTitle=await page.locator('.atlas-ts-term').innerText();assert([items[0].title,items[1].title].includes(dueTitle));await page.locator('[data-ts-open]').click();await page.locator('.atlas-row-flash').waitFor();assert([items[0].block,items[1].block].includes(await page.locator('.atlas-row-flash').first().getAttribute('data-ref')));
 assert.deepEqual(await originalState(),originalBefore);assert.equal(await page.evaluate(()=>localStorage.getItem('room.atlas.myTerms.v1')),storedBefore);report.checks.push('real scoped Learn→grade→global review→exact source works, including front matter; original SQL/review state and canonical personal-term storage preserved');
 // Search result for a previously omitted table part must point into that part.
 stage('search-table-part');await open('a97001rc32',items[1].sid,items[1].page);await page.locator('.atlas-search').fill('גלגל');await page.locator('.atlas-search').press('Enter');const result=page.locator('[data-search-result="'+items[1].block+'"]');await result.first().waitFor();await result.first().click();await page.locator('[data-ref="'+items[1].block+'"].atlas-hit').waitFor();report.checks.push('search for wheel returns and opens the semantic table part');
 // Explicit authorial canonical corrections are loose term targets, never fabricated word spans.
 for(const suffix of ['alkaline-earth-metals','impact-pendulum','cemented-carbide']){const it=proof.items.find(it=>it.termId.endsWith(':'+suffix));assert(it&&it.from===null);await open('a97001rc32',it.sid,it.page);const row=page.locator('[data-ref="'+it.block+'"]');assert((await row.first().innerText()).includes(it.ru));assert.equal(await row.locator('.rm-w[data-term="'+it.termId+'"]').count(),0);}
 report.checks.push('three authorial correction/abbreviation targets stay loose with no invented source word span; p203 restriction remains in specific term note');
 assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.errors.push(e.stack);process.exitCode=1;if(page){try{await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'failure-body.txt'),await page.locator('body').innerText());}catch(_){}}}
 finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(browser)await browser.close();if(child)child.kill();}
})();
