'use strict';
// Actual application, fresh local data and disposable browser. No production or owner profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const {chromium}=require('playwright'),E=require('../../public/js/atlas-edition'),{prepare}=require('./rc32-context.cjs');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const [dataArg,sourceArg,outArg]=process.argv.slice(2),out=path.resolve(outArg),root=path.resolve(__dirname,'../..');fs.mkdirSync(out,{recursive:true});
let child,browser;const report={scope:'local actual server, fresh synthetic browser and DB; GET/HEAD only',checks:[],cards:[],errors:[]};
const remoteBase=process.argv.find(a=>a.startsWith('--base='))?.slice(7);if(remoteBase&&remoteBase!=='https://linguistpro.kolosei.com')throw Error('Unexpected production origin');
(async()=>{try{
 const context=path.join(root,'atlas-context/a97001rc32',E.contextPinFor('a97001rc32')),prepared=await prepare(path.resolve(sourceArg),context);
 let base=remoteBase;if(!base){
 child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(path.resolve(dataArg),0),silent:true,windowsHide:true});child.stdout.pipe(fs.createWriteStream(path.join(out,'server.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'server-error.log')));
 base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);
 }report.origin=base;if(remoteBase)report.scope='actual production, new synthetic Chromium profile; only GET/HEAD network; no owner profile or cloud learner writes';await waitForSmokeHealth(base,{timeoutMs:60000});
 browser=await chromium.launchPersistentContext(path.join(out,'synthetic-profile'),{headless:true,viewport:{width:1280,height:1000},serviceWorkers:'block'});
 await browser.route('**/*',route=>route.request().url().startsWith(base)&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 const page=await browser.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>report.errors.push(e.message));
 const url=(sid,pg,id='a97001rc32')=>base+'/study-library.html#room=atlas%3A'+id+'&sec='+sid+'&pg='+pg;
 await page.goto(url('s00-front',1),{waitUntil:'domcontentloaded'});await page.locator('.atlas-row .rm-w').first().waitFor({state:'attached'});
 const state=()=>page.evaluate(async()=>({words:await __localDB.dbQuery('SELECT * FROM word_status',[]),reviews:await __localDB.dbQuery('SELECT * FROM review_log',[]),terms:Object.entries(localStorage).filter(([k])=>/atlas.*(terms|srs|progress)/i.test(k))}));
 const before=await state();
 const map=JSON.parse(fs.readFileSync(path.join(context,'addressed-map.json'))),cases=[];
 // Every expansion class, punctuation-only quote cases, ordinary row, table parts/aliases, long sections and source hold.
 for(const kind of ['expanded_abbreviation','expanded_unit_abbreviation','expanded_singular_plural_alternatives','acronym_tokenization','tokenizer_punctuation']){
  for(const e of map.entries.filter(e=>e.segments.some(s=>s.kind===kind)).slice(0,kind==='tokenizer_punctuation'?2:1)){const segment=e.segments.find(s=>s.kind===kind);cases.push({sid:e.section,row:e.guard,he:segment.source_from===null?Math.min(1,e.source_words.length-1):segment.source_from,niq:segment.pointed_from,kind});}
 }
 for(const sid of ['s00-front','s01-units','s17-steels','s19-aluminium','s20-composites']){const s=prepared.sections.find(s=>s.id===sid),r=s.rows.find(r=>s.loaded.checked.rows.some(a=>a.row_id===r.id)&&!map.entries.some(e=>e.row_id===r.id));cases.push({sid,row:r,he:0,niq:0,kind:'ordinary-or-long'});}
 for(const s of prepared.sections){const r=s.rows.find(r=>/table/.test(r.row_type)&&s.loaded.checked.rows.some(a=>a.row_id===r.id));if(r){cases.push({sid:s.id,row:r,he:0,niq:0,kind:'table-parts'});break;}}
 for(const id of ['a97001rc32:p12:b001','a97001rc32:p12:b009']){const e=map.entries.find(e=>e.row_id===id),sp=e.segments.find(s=>s.pointed_to>s.pointed_from);cases.push({sid:e.section,row:e.guard,he:sp.source_from,niq:sp.pointed_from,kind:'explicit-expanded-example'});}
 const hold=prepared.sections.flatMap(s=>s.rows.filter(r=>r.source_context.page===203&&s.loaded.checked.rows.some(a=>a.row_id===r.id)).map(row=>({sid:s.id,row,he:0,niq:0,kind:'source-hold-p203'})))[0];if(hold)cases.push(hold);
 const uncertain=prepared.sections.flatMap(s=>s.loaded.checked.rows.filter(a=>a.mwe.some(m=>m.uncertain)).map(a=>({sid:s.id,row:s.rows.find(r=>r.id===a.row_id),he:0,niq:a.mwe.find(m=>m.uncertain).from,kind:'uncertain-mwe'})))[0];assert(uncertain);cases.push(uncertain);
 for(const c of cases){
  report.stage=c.kind+':'+c.row.id;console.log(report.stage);
  await page.goto(url(c.sid,c.row.source_context.page),{waitUntil:'domcontentloaded'});
  const selector='[data-ref="'+c.row.id+'"]';
  await page.waitForFunction(({selector,index})=>{const el=document.querySelector(selector);return el&&el.__lpPreparedContextLookup&&el.__lpPreparedContextLookup(index,'niqqud');},{selector,index:c.niq});
  const s=prepared.sections.find(s=>s.id===c.sid),answer=s.loaded.checked.rows.find(a=>a.row_id===c.row.id);
  for(const [column,index] of [['he',c.he],['niqqud',c.niq]]){
   const expected=s.loaded.adapter.lookup(c.row,answer,column,index);
   const got=await page.locator(selector).first().evaluate((el,{index,column})=>WordGlossAI.wordAt(el,index,column),{index,column});assert.equal(got.gloss,expected.gloss,c.row.id+':'+column);
   const span=page.locator(selector+' [data-col="'+column+'"] .rm-w[data-w-offset="'+index+'"]');
   await span.first().evaluate(el=>el.click());await page.locator('.rm-sheet [data-rm-ai-line]').waitFor();
   assert.equal(await page.locator('.rm-sheet .rm-ai-gloss').innerText(),expected.gloss);
   assert.equal(await page.locator('.rm-sheet [data-rm-ai-edit],.rm-sheet [data-rm-ai-save],.rm-sheet [data-rm-status],.rm-sheet [data-rm-save],.rm-sheet [data-rm-enroll]').count(),0);
   if(c.kind==='uncertain-mwe'&&column==='niqqud')assert((await page.locator('.rm-sheet').innerText()).includes(answer.mwe.find(m=>m.uncertain).reason));
   if(c.kind==='expanded_unit_abbreviation'&&column==='he')await page.screenshot({path:path.join(out,'expanded-he-desktop.png')});
   report.cards.push({id:c.row.id,column,kind:c.kind,gloss:got.gloss});await page.keyboard.press('Escape');
  }
 }
 report.checks.push('HE and niqqud cards: expansions, both p9 quotes, table parts, long sections, p203, uncertain MWE; no write controls');
 await page.setViewportSize({width:380,height:1000});await page.goto(url('s00-front',1));await page.waitForFunction(()=>document.querySelector('[data-ref="a97001rc32:p1:b003"]')?.__lpPreparedContextLookup?.(0,'niqqud'));
 await page.locator('[data-ref="a97001rc32:p1:b003"] [data-col="niqqud"] .rm-w').first().evaluate(el=>el.click());await page.locator('.rm-sheet [data-rm-ai-line]').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,'candidate-mobile-380.png')});await page.keyboard.press('Escape');
 await page.getByRole('combobox',{name:'Язык / Language / שפה'}).selectOption('he');await page.waitForFunction(()=>document.documentElement.dir==='rtl');await page.locator('[data-ref="a97001rc32:p1:b003"] [data-col="niqqud"] .rm-w').first().evaluate(el=>el.click());await page.locator('.rm-sheet [data-rm-ai-line]').waitFor();await page.screenshot({path:path.join(out,'candidate-he-rtl-380.png')});await page.keyboard.press('Escape');
 assert.deepEqual(await state(),before);report.learner_state_unchanged=true;
 const personal='синтетическая ручная правка';await page.locator('[data-ref="a97001rc32:p1:b003"]').evaluate(async(el,{personal,answer})=>{const saved=await WordGlossAI.remember({schema:WordGlossAI.LAYER_SCHEMA,rows:[answer]},[el.__lpLearningRow]);if(saved.stored!==1||!await WordGlossAI.setOccurrenceGloss(el,0,personal))throw Error('Manual fixture was not saved');},{personal,answer:prepared.sections.find(s=>s.id==='s00-front').loaded.checked.rows.find(r=>r.row_id==='a97001rc32:p1:b003')});await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(personal=>{const el=document.querySelector('[data-ref="a97001rc32:p1:b003"]');return el&&WordGlossAI.wordAt(el,0,'niqqud')?.gloss===personal;},personal);report.checks.push('synthetic personal correction survives full reload and candidate revalidation');
 report.stage='original-edition';console.log(report.stage);
 // Original edition and pin remain independent and its ordinary card still works.
 await page.goto(url('s00-front',1,'a97001'));await page.locator('.atlas-row .rm-w').first().waitFor({state:'attached'});await page.waitForFunction(()=>{const r=document.querySelector('[data-ref="a97001:p1:b003"]');return r&&WordGlossAI.wordAt(r,0);});await page.locator('[data-ref="a97001:p1:b003"] [data-col="niqqud"] .rm-w').first().evaluate(el=>el.click());await page.locator('.rm-sheet [data-rm-ai-line]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>AtlasEdition.client('a97001').revision),E.pin.revision);report.checks.push('original edition context and pin still work after corpus switch');
 report.stage='corrupt-manifest';console.log(report.stage);
 // An already cached answer cannot bypass a broken manifest or source on a new open.
 await browser.route('**/atlas-context/a97001rc32/**/manifest.json',route=>route.fulfill({status:200,body:'{}',contentType:'application/json'}));
 await page.goto(url('s00-front',1));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-context-error]'));assert.match(await page.locator('[data-context-error]').getAttribute('data-context-error'),/MANIFEST_HASH/);assert.equal(await page.locator('[data-ref="a97001rc32:p1:b003"]').evaluate(el=>WordGlossAI.wordAt(el,1,'niqqud')),null);assert.equal(await page.locator('[data-ref="a97001rc32:p1:b003"]').evaluate(el=>WordGlossAI.wordAt(el,0,'niqqud')?.gloss),personal);report.checks.push('corrupted pinned manifest after reopen blocks prepared context despite prior cache');
 assert.deepEqual(await state(),before);assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.errors.push(e.stack);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(browser)await browser.close();if(child)child.kill();}
})();
