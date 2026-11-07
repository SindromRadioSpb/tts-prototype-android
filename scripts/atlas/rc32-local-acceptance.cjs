'use strict';
// Synthetic profile/database only. Supplier bytes verified before corpus projection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{fork}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),E=require(root+'/public/js/atlas-edition'),W=require(root+'/public/js/atlas-words'),T=require(root+'/public/js/atlas-train'),RM=require(root+'/public/js/reader-morph');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require(root+'/scripts/smoke-server-env');
const data=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),liveBase=process.argv[4];fs.mkdirSync(out,{recursive:true});
const report={scope:'local actual server, SHA-verified corpus projection, synthetic persistent Chromium; no owner data',checks:[],errors:[]};let child,browser;
(async()=>{try{
 let base=liveBase;
 if(!base){child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(data,0),silent:true});const log=fs.createWriteStream(path.join(out,'server.log'));child.stdout.pipe(log);child.stderr.pipe(log);base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);}
 report.origin=base;if(liveBase)report.scope='production GET/HEAD only; anonymous synthetic persistent Chromium, no owner profile';await waitForSmokeHealth(base,{timeoutMs:60000});
 const client=E.createClient('a97001rc32',{fetch:(u,o)=>fetch(base+u,o),crypto:crypto.webcrypto}),index=await client.json('index.json'),bank=await client.json('train/terms.json'),find=await client.json('train/find.json');
 assert.equal(T.findBankStatus(find,index,'a97001rc32'),'ready');assert.equal(find.items.length,456);
 let pages=0,targets=0,graded=0,held=0,fields=0;const controls=[];let trainingSid;
 for(const s of index.sections){const section=await client.json('sections/'+s.id+'.json'),raw=JSON.parse(fs.readFileSync(path.join(data,'atlas-editions/a97001',client.revision,'sections',s.id+'.json')));pages+=section.pages.length;
  function compare(a,b){if(Array.isArray(a)){a.forEach((v,i)=>compare(v,b[i]));return;}if(!a||typeof a!=='object')return;
   for(const key of ['he','he_raw','he_niqqud','ru','translit','translit_ru'])if(Object.hasOwn(a,key)){assert.deepEqual(b[key],a[key],s.id+':'+key);fields++;}
   if(typeof a.id==='string'&&a.id.startsWith('a97001:'))assert.equal(b.source_id,a.id);
   for(const [k,v]of Object.entries(a))if(v&&typeof v==='object')compare(v,b[k.replace(/^a97001:/,'a97001rc32:')]);
  }compare(raw,section);
  const ctx=W.sectionContext('a97001rc32',section,RM,{purpose:'term_context'}),items=T.sectionTermItems(ctx);targets+=items.length;if(items.length&&!trainingSid)trainingSid=s.id;
  for(const it of items){assert(it.key.startsWith('at1:a97001rc32:'));const states={[it.key]:{due:1,textKey:ctx.textKeys.get(it.block),sentenceId:it.block}},before=JSON.stringify(states);assert.equal(T.globalDueItems(states,bank,[],100,10).due,1);assert.equal(JSON.stringify(states),before);graded++;}
  for(const [tid,t]of Object.entries(section.terms)){if(t.training_eligible!==false)continue;const sn=t.senses?.[0],ref=t.source_refs?.[0]||t.definition_refs?.[0];if(!sn||!ref)continue;const key=T.termKey('a97001rc32',tid,sn.sense);if(!key)continue;const states={[key]:{due:1,textKey:'atlas-block-v1:a97001rc32:'+s.id+':fixture',sentenceId:ref}},before=JSON.stringify(states);assert.equal(T.globalDueItems(states,bank,[],100,10).due,0);assert.equal(JSON.stringify(states),before);held++;}
  for(const p of section.pages)if([1,56,116,124,170,171,193,203].includes(p.page))controls.push({section:s.id,page:p.page,image:p.image,items:p.items});
 }
 assert.equal(pages,203);assert.equal(targets,33);assert.equal(held,492);report.data={pages,targets,graded,held,preservedLanguageFields:fields};
 const original=E.createClient('a97001',{fetch:(u,o)=>fetch(base+u,o),crypto:crypto.webcrypto});assert.equal((await original.json('index.json')).atlas_id,'a97001');report.checks.push('both immutable editions served; new source IDs retained; language fields unchanged; 33 due cycles and 492 held grades');
 browser=await chromium.launchPersistentContext(path.join(out,'synthetic-profile'),{headless:true,viewport:{width:1440,height:1000},serviceWorkers:liveBase?'allow':'block'});const page=await browser.newPage();
 await page.route('**/*',route=>(route.request().url().startsWith(base)||route.request().url().startsWith('data:'))&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/study-library.html#room=atlas%3Aa97001rc32');await page.waitForSelector('.atlas-home',{timeout:120000});
 assert.equal(await page.evaluate(()=>AtlasEdition.client('a97001').revision),E.pin.revision);
 report.checks.push('new corpus deep link mounts alongside unchanged original client');
 if(liveBase){await page.waitForFunction(()=>navigator.serviceWorker.controller,{},{timeout:90000});report.serviceWorker=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);report.checks.push('controlling production service worker');}
 for(const c of controls){console.log('control page',c.page);await page.goto(base+'/study-library.html#room=atlas%3Aa97001rc32&sec='+c.section+'&pg='+c.page);await page.waitForSelector('#atlas-p'+c.page,{timeout:60000});await page.locator('#atlas-p'+c.page).scrollIntoViewIfNeeded();await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'page-'+c.page+'-desktop.png'),timeout:20000,animations:'disabled'});}
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/study-library.html#room=atlas%3Aa97001rc32&sec='+controls.find(x=>x.page===124).section+'&pg=124');await page.waitForSelector('#atlas-p124',{timeout:60000});await page.locator('#atlas-p124').scrollIntoViewIfNeeded();await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'page-124-mobile.png')});report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(report.mobileOverflow,false);
 report.checks.push('control pages 1,56,116,124,170,171,193,203 captured; 390px page124 no viewport overflow');
 await page.goto(base+'/study-library.html#room=atlas%3Aa97001');await page.waitForSelector('.atlas-home',{timeout:60000});report.checks.push('return to original corpus mounts successfully');

 await page.setViewportSize({width:1440,height:1000});
 async function openTraining(id){await page.goto(base+'/study-library.html#room=atlas%3A'+id+'&sec='+trainingSid);await page.waitForSelector('.atlas-train-btn',{timeout:60000});await page.locator('.atlas-train-btn').click();await page.waitForFunction(()=>{const b=document.querySelector('[data-terms-learn]');return b&&!b.disabled;},{},{timeout:30000});}
 async function grade(){await page.locator('[data-terms-learn]').click();await page.locator('[data-ts-reveal]').click();await page.locator('[data-ts-grade="1"]').click();await page.waitForTimeout(500);assert.equal(await page.locator('.atlas-ts-error:not([hidden])').count(),0);await page.keyboard.press('Escape');}
 const originalState=()=>page.evaluate(async()=>({words:await window.__localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key LIKE 'at1:a97001:%' ORDER BY lemma_key",[]),reviews:await window.__localDB.dbQuery("SELECT * FROM review_log WHERE item_key LIKE 'at1:a97001:%' ORDER BY rowid",[])}));
 await openTraining('a97001');await grade();const before=await originalState();assert(before.words.length>0);assert(before.reviews.length>0);
 const historyBefore=await page.evaluate(()=>{const s=JSON.stringify(Array.from({length:500},(_,i)=>({id:'find:a97001:p1:test'+i,sid:'s01-fixture',section:true,page:'exact',ms:100,at:i})));localStorage.setItem('room.atlas.find.v1',s);return s;});
 await openTraining('a97001rc32');await grade();
 const native=await page.evaluate(()=>window.__localDB.dbQuery("SELECT lemma_key FROM word_status WHERE lemma_key LIKE 'at1:a97001rc32:%'",[]));assert(native.length>0);assert.deepEqual(await originalState(),before);
 await page.locator('[data-find-all]').click();await page.waitForSelector('.atlas-find-text');assert(await page.locator('.atlas-source-limit-note').count());await page.locator('.atlas-find-form select').selectOption({index:1});await page.locator('.atlas-find-form input').fill('1');await page.locator('[data-find-check]').click();await page.locator('[data-find-open]').click();await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>localStorage.getItem('room.atlas.find.v1')),historyBefore);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('room.atlas.find.v1.a97001rc32')).length),1);
 assert.deepEqual(await originalState(),before);report.preservation={originalWordStates:before.words.length,originalReviews:before.reviews.length,newWordStates:native.length,originalFindHistory:500,newFindHistory:1};report.checks.push('UI grade saved in each corpus; original SQL states/review_log and 500 original find answers unchanged after native grading/find-source navigation');
 await page.locator('.atlas-search').fill('масса');await page.locator('.atlas-search').press('Enter');await page.waitForSelector('[data-search-result]',{timeout:30000});assert((await page.locator('[data-search-result]').first().getAttribute('data-search-result')).startsWith('a97001rc32:'));await page.locator('[data-search-result]').first().click();await page.waitForSelector('.atlas-section');report.checks.push('native search result opens native source reference');
 await page.locator('.atlas-thumb').first().click();await page.waitForSelector('.atlas-overlay img');await page.waitForFunction(()=>{const i=document.querySelector('.atlas-overlay img');return i&&i.complete&&i.naturalWidth>0;});await page.screenshot({path:path.join(out,'source-overlay.png'),timeout:20000});await page.keyboard.press('Escape');report.checks.push('source scan opens and decodes in browser');
 assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.errors.push(e.stack);process.exitCode=1;}finally{if(browser)await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);if(child)child.kill();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exit(process.exitCode||0);}})();
