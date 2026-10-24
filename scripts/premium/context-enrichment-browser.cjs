'use strict';
// Anonymous production or isolated loopback; disposable learner profiles, zero paid calls.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {fork}=require('node:child_process');const {chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
const ROOT=path.resolve(__dirname,'../..'),task=path.join(ROOT,'.tmp/context-ai'),candidate=path.join(task,'candidate');
const read=p=>JSON.parse(fs.readFileSync(p));
const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
(async()=>{
 let child,browser,base=arg('base');const result={scope:base?'production anonymous disposable browser':'isolated loopback browser',cases:[],errors:[],denied:[]};
 if(!base){child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:ROOT,env:smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(),'lp-context-')),0),silent:true,windowsHide:true});const logs=[];child.stdout.on('data',b=>logs.push(String(b)));child.stderr.on('data',b=>logs.push(String(b)));try{base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);console.log('Isolated server '+base);}catch(e){console.error(logs.join('').slice(-5000));child.kill();throw e;}}
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  await context.addInitScript(()=>{localStorage.setItem('app.locale','ru');localStorage.setItem('phase6Decision_v1','declined');localStorage.setItem('onboardingSeen_v1','1');localStorage.setItem('room.wordGloss','1');localStorage.setItem('room.wordGlossAi','0');});
  await context.route('**/*',async route=>{
   const r=route.request(),url=new URL(r.url());
   if(url.origin!==base||!['GET','HEAD'].includes(r.method())){if(!['GET','HEAD'].includes(r.method()))result.denied.push(url.pathname);return route.abort();}
   if(child&&url.pathname.startsWith('/data/benyehuda/')){
    const file=path.join(candidate,url.pathname.slice('/data/benyehuda/'.length));
    if(fs.existsSync(file))return route.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(file)});
   }
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>result.errors.push(e.message));
  const cards=read(path.join(candidate,'corpus-index-v12.json')).ready;
  // The real deep link imports and displays the publisher layer without a model key.
  for(const id of ['3557','42674','10291']){
   let card=cards.find(c=>c.id===id),part='';
   if(card.toc_file){const toc=read(path.join(candidate,card.toc_file));const selected=toc.parts[1];part=selected.part_id;card={...card,segments:selected.rows};}
   console.log('Opening '+id);await page.goto(base+'/library.html?canon=skip&corpus_work='+id+(part?'&part='+encodeURIComponent(part):''),{waitUntil:'domcontentloaded'});
   try { await page.waitForFunction(n=>document.querySelectorAll('#roomReaderTable #proTable tbody tr').length===n&&!!document.querySelector('#roomReaderTable .rm-w[data-gloss-source="ai"]'),card.segments); }
   catch(e){console.log(await page.evaluate(()=>({url:location.href,errors:document.body.innerText.slice(-1800),rows:document.querySelectorAll('#roomReaderTable tbody tr').length,words:document.querySelectorAll('.rm-w').length,gloss:document.querySelector('.rm-w[data-gloss]')?.outerHTML})));throw e;}
   const evidence=await page.evaluate(()=>({rows:document.querySelectorAll('#roomReaderTable #proTable tbody tr').length,ai:document.querySelectorAll('#roomReaderTable .rm-w[data-gloss-source="ai"]').length,coverage:document.querySelector('.rm-context-coverage')?.textContent}));
   assert.ok(evidence.ai>0);result.cases.push({work:id,...evidence});console.log('Visible context '+id);
  }
  await page.screenshot({path:path.join(task,child?'candidate-reader.png':'production-reader.png')});
  // Existing saved edition: a user translation and manual gloss must survive.
  const card=cards.find(c=>c.id==='3557'),entry=read(path.join(task,'enrichment-report.json')).works.find(w=>w.work_id==='3557').parts[0];
  const baseline=read(path.join(task,'baseline',entry.old_file));
  await page.goto(base+'/library.html?canon=skip&corpus=skip',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__localDB&&window.WordGlossAI&&window.CorpusMaterialize);
  const preserved=await page.evaluate(async({card,baseline})=>{
   const db=window.__localDB,AI=WordGlossAI;
   await db.importBundle(baseline,{mode:'skip'});
   const id=(await db.dbQuery('SELECT id FROM texts WHERE text_key=?',[card.text_key]))[0].id,rows=await db.getSentences(id);
   await db.updateSentence(id,rows[1].id,{ru:'Мой собственный перевод'});
   await db.addBookmark({text_id:id,text_key:card.text_key,sentence_id:rows[0].id,order_index:0,title:'Сохранить'});
   await db.setProgress(id,{last_row_idx:3,last_step_id:'translation'});
   const now='2026-10-25T00:00:00Z';await db.dbRun('INSERT INTO review_log (id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json) VALUES (?,?,?,?,?,?,?,?,?)',['context-fixture-review','lemma:fixture','review',now,3,'fixture','lab',123,'{}']);
   await db.dbRun('INSERT INTO notes_v2 (id,target_kind,target_id,text_id,note_type,title,body_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',['context-fixture-note','sentence',rows[0].id,id,'free','Заметка','{"markdown":"Не менять"}',now,now]);
   // Clear only this disposable test profile's AI store, then seed one manual occurrence.
   await new Promise((resolve,reject)=>{const rq=indexedDB.open('lp-word-gloss-ai',1);rq.onsuccess=()=>{const handle=rq.result,tx=handle.transaction('rows','readwrite');tx.objectStore('rows').clear();tx.oncomplete=()=>{handle.close();resolve();};tx.onerror=reject;};rq.onerror=reject;});AI._mem.clear();
   const source=await(await fetch('/data/benyehuda/'+card.word_gloss_ai.file)).json();const manual=source.library.texts[0].word_gloss_ai_layer.rows.find(e=>e.order_index===0);manual.glosses[0]={gloss:'Моя правка слова',manual:true,ai_gloss:manual.glosses[0].gloss};
   await AI.remember({schema:AI.LAYER_SCHEMA,rows:[manual]},rows);
   const snapshot=async()=>({rows:await db.dbQuery('SELECT * FROM sentences WHERE text_id=? ORDER BY order_index',[id]),progress:await db.dbQuery('SELECT * FROM text_progress WHERE text_id=?',[id]),bookmarks:await db.dbQuery('SELECT * FROM bookmarks WHERE text_id=?',[id]),notes:await db.dbQuery('SELECT * FROM notes_v2 WHERE text_id=?',[id]),reviews:await db.dbQuery('SELECT * FROM review_log ORDER BY id')});
   const before=await snapshot();
   const refresh=await CorpusMaterialize.ensureBenYehudaWork(card,{db,Edition:BenYehudaLearningEdition,fetch:(u,o)=>fetch(u,o),catalogVersion:12});
   const after=await snapshot(),gloss=await AI.wordAtData((await db.getSentences(id))[0],0);
   return{same:JSON.stringify(before)===JSON.stringify(after),manual:gloss.gloss,refresh,reviewCount:after.reviews.length};
  },{card,baseline});
  assert.equal(preserved.same,true);assert.equal(preserved.manual,'Моя правка слова');assert.equal(preserved.refresh.imported,false);assert.equal(preserved.refresh.wordGlossAi.rejected,1);assert.equal(preserved.reviewCount,1);
  result.preservation=preserved;assert.deepEqual(result.errors,[]);assert.deepEqual(result.denied,[]);result.result='PASS';console.log(JSON.stringify(result));
 }finally{if(browser)await browser.close();if(child)child.kill();fs.writeFileSync(path.join(task,arg('base')?'production-browser.json':'candidate-browser.json'),JSON.stringify(result,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
