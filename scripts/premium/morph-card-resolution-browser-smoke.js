'use strict';
// Isolated browser profiles only; mock publication, real OPFS and shared Studio/Room code. No paid calls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const baseline=process.argv.includes('--baseline');
const baselineSource=baseline?require('node:child_process').execFileSync('git',['show','32204e7c:public/js/reader-morph.js'],{encoding:'utf8'}):null;
const RM=require('../../public/js/reader-morph');
const base=process.env.CONTEXT_BASE||'http://127.0.0.1:3324';
const shots=path.resolve(__dirname,'../../.tmp/morph-resolution-smoke');
fs.mkdirSync(shots,{recursive:true});
function fnv(s){let h1=0x811c9dc5,h2=0x01000193;for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);h1=Math.imul(h1^c,16777619)>>>0;h2=Math.imul(h2^c,2246822519)>>>0;}return h1.toString(16)+h2.toString(16);}
const metadata={_studio_material:{schema:'material-projection-v1',imported:true,field_meta:{he_niqqud:{authority:'provider',provider:'OpenAI assistant',status:'current'}}}};
const rows=[0,1].map(i=>({order_index:i,hebrew_plain:'שאול,',hebrew_niqqud:'שָׁאוּל,',russian:'Шауль,',translit:"Sha'ul",edit_meta:metadata}));
rows.push({order_index:2,hebrew_plain:'יופי',hebrew_niqqud:'יוֹפִי',russian:'Отлично',edit_meta:metadata});
rows.push({order_index:3,hebrew_plain:'שפחדת',hebrew_niqqud:'שֶׁפָּחַדְתָּ',russian:'что ты боялся',edit_meta:metadata});
rows.push({order_index:4,hebrew_plain:'נותר',hebrew_niqqud:'נוֹתַר',russian:'осталось',edit_meta:metadata});
rows.push({order_index:5,hebrew_plain:'זזזזז',hebrew_niqqud:'זזזזז',russian:'неизвестное слово',edit_meta:metadata});
function layer(rows){return {schema:'word-gloss-ai-layer-v1',rows:rows.map((r,i)=>{let words=RM.words(r.hebrew_niqqud);return {order_index:i,key:'r2'+fnv(words.join(' ')+'\u0001'+r.russian)+':'+words.length,model:'OpenAI assistant',glosses:[{gloss:i===2?'отлично':i===3?'что ты испугался':i===4?'осталось':i?'Шауль':'Шауль, имя',wrong_hint:false}],mwe:[]};})};}
const snapshot={library:{texts:[{title:'Контекст: проверка',text_key:'context-browser',source_text:'שאול,\nשאול,\nשלום',rows,word_gloss_ai_layer:layer(rows)}]}};
const item={public_work_id:'work-1',position_no:1,title:'Контекст: проверка',snapshot_sha256:'c'.repeat(64),public_read_allowed:1,public_stream_allowed:0,package_download_allowed:0,asset_missing:0,package_complete:0,expected_audio_count:0,included_audio_count:0};
const published={ok:true,corpus:{corpus_id:'pc_context',slug:'test-context',title:'Контекст'},edition:{edition_id:'ed_context',edition_number:1,manifest_sha256:'b'.repeat(64),item_count:1,asset_count:0,asset_missing:0,package_complete:false},items:[item]};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const surface of (process.env.CONTEXT_SURFACE?[process.env.CONTEXT_SURFACE]:['studio','room'])){
   const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
   let paid=0;const errors=[];
   const page=await context.newPage();page.setDefaultTimeout(20000);
   if(baseline)await page.route('**/js/reader-morph.js*',r=>r.fulfill({contentType:'application/javascript',body:baselineSource}));
   page.on('pageerror',error=>errors.push(String(error)));
   page.on('console',msg=>{if(msg.text().includes('[lexical-choice]'))console.log(msg.text());});
   await page.addInitScript(()=>{localStorage.setItem('room.wordStatus','1');localStorage.setItem('room.wordGloss','1');localStorage.setItem('studio.wordGloss','1');localStorage.setItem('room.wordRibbon','1');localStorage.setItem('studio.wordRibbon','1');localStorage.setItem('room.wordGlossAi','0');localStorage.setItem('studio.wordGlossAi','0');});
   await page.route('**/api/word-gloss-ctx',route=>{paid++;return route.abort();});
   await page.route('**/api/public-corpora',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,corpora:[published.corpus]})}));
   await page.route('**/api/public-corpora/test-context**',route=>{
    const body=route.request().url().includes('/works/work-1')?{...published,item:{...item,snapshot},assets:[]}:published;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   if(surface==='room'){
    // Serve the shell for our mocked publication, bypassing server-side SEO material lookup.
    await page.route('**/library.html?public_corpus=test-context**',async route=>{
      const response=await route.fetch({url:base+'/library.html'});await route.fulfill({response});
    });
    await page.goto(base+'/library.html?public_corpus=test-context&public_work=work-1&canon=skip&corpus=skip#room=public:test-context',{waitUntil:'domcontentloaded'});
   }else{
    await page.goto(base+'/?canon=skip',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__localDB?.isReady()&&window.StudioMorph&&window.WordGlossAI&&window.v3RenderTableFromLibrary,null,{timeout:60000});
    await page.evaluate(async bundle=>{
     const db=window.__localDB;
     await db.importBundle(bundle,{mode:'skip'});
     const text=(await db.listTexts({query:'Контекст: проверка'})).find(t=>t.text_key==='context-browser');
     const sentences=await db.getSentences(text.id);
     const ui=sentences.map(r=>({he:r.he_plain,he_niqqud:r.he_niqqud,ru:r.ru,translit:r.translit,edit_meta_json:r.edit_meta_json,_v3_textId:text.id,_v3_sentenceId:r.id,_v3_orderIndex:r.order_index}));
     window.applyPreset('full');window.v3RenderTableFromLibrary(ui);
     document.querySelectorAll("[id*='OnboardingModal'],#v3Phase6Modal").forEach(e=>e.remove());
    },snapshot);
   }

   await page.waitForFunction(n=>document.querySelectorAll('#proTable tbody tr').length===n,rows.length,{timeout:60000});
   const dbBefore=await page.evaluate(async()=>({reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY rowid'),marks:await __localDB.dbQuery('SELECT * FROM word_status ORDER BY rowid')}));
   if(!baseline){
    const open=async i=>{await page.locator('#proTable tr[data-row-idx="'+i+'"] [data-col=niqqud] .rm-w').click();await page.waitForSelector('.rm-sheet.rm-open .rm-current-reading');};
    const close=()=>page.locator('.rm-sheet-x').click();
    await open(3);
    assert.match(await page.locator('.rm-current-reading').innerText(),/לפחוד/);
    assert.match(await page.locator('.rm-form-line').innerText(),/שֶׁפָּחַדְתָּ[\s\S]*что ты боялся/);
    assert.match(await page.locator('.rm-form-grammar').innerText(),/ты.*прош/);
    assert.equal(await page.locator('.rm-analysis-choices').getAttribute('open'),null);
    await page.locator('.rm-analysis-choices > summary').click();
    assert.equal(await page.locator('[data-rm-candidate="1612"]').count(),1);
    assert.match(await page.locator('.rm-analysis-choices h3').innerText(),/Найденный разбор/);
    assert.equal(await page.locator('[data-rm-analysis-save]').isVisible(),false);
    for(const width of [1280,380]){await page.setViewportSize({width,height:900});await page.locator('.rm-sheet-card').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(shots,surface+'-'+width+'-fear.png')});assert.equal(await page.locator('.rm-sheet-card').evaluate(e=>e.scrollWidth<=e.clientWidth+2),true);}
    await close();await open(4);console.log(surface+": form candidates passed");
    await page.locator('.rm-analysis-choices > summary').click();
    assert.equal(await page.locator('[data-rm-candidate]').count(),1);
    assert.match(await page.locator('[data-rm-candidate="867"]').innerText(),/נוֹתַר[\s\S]*להיוותר/);
    await page.evaluate(()=>__localDB.dbRun("CREATE TRIGGER name_fail BEFORE INSERT ON lexical_resolution_events BEGIN SELECT RAISE(FAIL,'injected name failure'); END"));
    await page.locator('[data-rm-analysis-name]').click();
    await page.waitForFunction(()=>/Не удалось/.test(document.querySelector('[data-rm-analysis-preview]')?.textContent||''));
    assert.equal(await page.locator('[data-rm-analysis-name]').isEnabled(),true);
    await page.evaluate(()=>__localDB.dbRun('DROP TRIGGER name_fail'));
    await page.locator('[data-rm-analysis-name]').evaluate(e=>{e.click();e.click();});
    await page.waitForSelector('[data-rm-analysis-undo]');console.log(surface+': name saved');
    assert.match(await page.locator('.rm-analysis-reviewed').innerText(),/отмечено как имя/);
    const named=await page.evaluate(async()=>({events:await __localDB.dbQuery('SELECT * FROM lexical_resolution_events'),reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY rowid'),marks:await __localDB.dbQuery('SELECT * FROM word_status ORDER BY rowid')}));
    assert.equal(named.events.length,1);assert.equal(JSON.parse(named.events[0].chosen_json).meaning_ru,'');
    assert.deepEqual(named.reviews,dbBefore.reviews);assert.deepEqual(named.marks,dbBefore.marks);
    await page.locator('[data-rm-analysis-undo]').click();
    await page.waitForFunction(()=>!document.querySelector('.rm-analysis-reviewed'));
    assert.match(await page.locator('.rm-current-reading').innerText(),/להיוותר/);console.log(surface+': name undone');
    // A name over an existing human choice must undo to that choice, not erase it.
    await page.locator('.rm-analysis-choices > summary').click();
    await page.locator('[data-rm-candidate="867"]').click();await page.locator('[data-rm-analysis-save]').click();
    await page.waitForSelector('.rm-analysis-reviewed');
    await page.locator('.rm-analysis-choices > summary').click();await page.locator('[data-rm-analysis-name]').click();
    await page.waitForSelector('[data-rm-analysis-undo]');await close();await open(4);
    await page.waitForSelector('[data-rm-analysis-undo]');await page.locator('[data-rm-analysis-undo]').click();
    await page.waitForFunction(()=>/להיוותר/.test(document.querySelector('.rm-dictionary-lemma')?.textContent||'')&&!document.querySelector('[data-rm-analysis-undo]'));
    await close();await open(5);await page.locator('.rm-analysis-choices > summary').click();
    assert.equal(await page.locator('.rm-analysis-choices h3').count(),0);
    assert.equal(await page.locator('[data-rm-candidate]').count(),0);
    assert.equal(await page.locator('[data-rm-analysis-save]').isVisible(),false);
    await close();
   }
   const target='#proTable tr[data-row-idx="2"] [data-col=niqqud] .rm-w';
   const started=Date.now();await page.locator(target).click();
   if(baseline){await page.waitForSelector('.rm-sheet.rm-open .rm-word');console.log(JSON.stringify({surface,baselineColdMs:Date.now()-started}));await context.close();continue;}
   await page.waitForSelector('[data-rm-candidate="5857"]');
   const coldMs=Date.now()-started;
   assert.equal(await page.locator('[data-rm-candidate="5856"]').count(),1);
   assert.equal(await page.locator('.rm-status-btn').count(),0);
   assert.equal(await page.locator('[data-rm-name-propose]').count(),0);
   assert.equal(await page.locator('.rm-head .rm-prov:visible').count(),0);
   await page.locator('[data-rm-candidate="5857"]').click();
   assert.match(await page.locator('[data-rm-analysis-preview]').innerText(),/отлично/);
   assert.equal(await page.evaluate(async()=> (await __localDB.dbQuery('SELECT * FROM lexical_resolution_events WHERE order_index=2')).length),0,'preview must not persist');
   await page.locator('[data-rm-analysis-save]').click();
   try {await page.waitForSelector('.rm-analysis-reviewed',{timeout:8000});}catch(e){console.log(await page.locator('[data-rm-analysis-preview]').innerText());throw e;}
   assert.match(await page.locator('.rm-status-target').innerText(),/отлично.*наречие/);
   const chosen=await page.evaluate(async()=>({reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY rowid'),marks:await __localDB.dbQuery('SELECT * FROM word_status ORDER BY rowid'),events:await __localDB.dbQuery('SELECT * FROM lexical_resolution_events WHERE order_index=2')}));
   assert.deepEqual(chosen.reviews,dbBefore.reviews);assert.deepEqual(chosen.marks,dbBefore.marks);
   assert.equal(chosen.events.length,1);assert.equal(chosen.events[0].action,'confirm_candidate');
   await page.setViewportSize({width:380,height:850});
   await page.locator('.rm-sheet-card').evaluate(e=>e.scrollTop=0);
   await page.screenshot({animations:'disabled',path:path.join(shots,surface+'-380-chosen.png')});
   await page.locator('.rm-sheet-x').click();await page.locator(target).click();
   await page.waitForSelector('.rm-analysis-reviewed');
   assert.match(await page.locator('.rm-status-target').innerText(),/отлично.*наречие/);
   if(surface==='room'){
    await page.locator('[data-rm-status="l2"]').click();
    await page.waitForFunction(async()=>!!(await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:5857' AND status='l2'")).length);
    await page.waitForSelector('[data-rm-status="l2"].rm-status-active');
    assert.equal(await page.evaluate(async()=> (await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:5856'")).length),0);
    await page.locator('.rm-sheet-x').click();
    try { await page.waitForFunction(()=>document.querySelector('#proTable tr[data-row-idx="2"] [data-col=niqqud] .rm-w')?.classList.contains('rm-w-l2'),null,{timeout:6000}); }
    catch(e){console.log(await page.evaluate(async()=>{const span=document.querySelector('#proTable tr[data-row-idx="2"] [data-col=niqqud] .rm-w'),place=ReaderMorph.placeOfSpan(span),eng=await ReaderMorph.ensureEngine(),c=await ReaderMorph.resolveCore(eng,'יופי','יוֹפִי',{place});return{place,span:span.outerHTML,key:ReaderMorph.statusKeyForCard(NotesAutoGen,c,'יוֹפִי','יופי'),label:c.label,marks:await __localDB.getKnownWordStates()};}));throw e;}
    await page.locator(target).click();await page.waitForSelector('.rm-analysis-reviewed');
   }
   const exported=await page.evaluate(async()=>{
    const text=(await __localDB.listTexts({query:'Контекст: проверка'}))[0];
    const rows=await __localDB.getSentences(text.id);
    const e=await ReaderMorph.ensureEngine(),r=rows[2];await ReaderMorph.ensurePlaces([r.id]);
    const c=await ReaderMorph.resolveCore(e,r.he_plain,r.he_niqqud,{place:{sid:r.id,off:0}});
    const items=await ReaderMorph.collectReviewItems(document.querySelector('#proTable'),{},{});
    return{reviewKeys:items.map(i=>i.lemmaKey),key:ReaderMorph.statusKeyForCard(NotesAutoGen,c,r.he_niqqud,r.he_plain),pos:c.pos,events:await __localDB.listLexicalResolutionEventsForText(text.id)};
   });
   if(!exported.reviewKeys.includes('pid:5857'))console.log(JSON.stringify({reviewDiagnostic:exported,spans:await page.evaluate(()=>Array.from(document.querySelectorAll('#proTable .rm-w')).map(s=>({surface:s.dataset.surface,niqqud:s.dataset.niqqud,place:ReaderMorph.placeOfSpan(s),col:s.closest('[data-col]')?.dataset.col})))}));
   assert.equal(exported.key,'pid:5857');assert.equal(exported.pos,'adverb');assert.ok(exported.reviewKeys.includes('pid:5857'));
   for(const slim of [false,true]){
    const bundle=await page.evaluate(async slim=>{const text=(await __localDB.listTexts({query:'Контекст: проверка'}))[0];return __localDB.exportBundle({textIds:[text.id],slim});},slim);
    const importedContext=await browser.newContext({serviceWorkers:'block'}),importedPage=await importedContext.newPage();
    await importedPage.route('**/api/word-gloss-ctx',r=>{paid++;return r.abort();});
    await importedPage.goto(base+'/library.html?canon=skip&corpus=skip#room=mytexts',{waitUntil:'domcontentloaded'});
    await importedPage.waitForFunction(()=>window.__localDB?.isReady()&&window.ReaderMorph&&window.LexicalResolutionService,null,{timeout:60000});
    const result=await importedPage.evaluate(async bundle=>{
     await __localDB.importBundle(bundle,{mode:'skip'});
     const text=(await __localDB.listTexts({query:'Контекст: проверка'}))[0],rows=await __localDB.getSentences(text.id),r=rows[2],u=TextKeyScan.unitAt(r,0);
     const occ={text_id:text.id,sentence_id:r.id,text_key:text.text_key,order_index:r.order_index,word_offset:0,surface:u.surface,niqqud:u.niqqud,sentence_he:r.he_plain,sentence_he_niqqud:r.he_niqqud};
     const eng=await ReaderMorph.ensureEngine(),candidates=ReaderMorph.analysisCandidates(eng,u.surface,u.niqqud);
     const projection=await LexicalResolutionService.lookupExactOccurrence(occ,__localDB,LexicalResolutionCore,candidates);
     await __localDB.importBundle(bundle,{mode:'skip'});
     return{state:projection?.state,pid:projection?.analysis?.pealim_id,events:(await __localDB.listLexicalResolutionEventsForText(text.id)).filter(e=>e.order_index===2).length};
    },bundle);
    assert.deepEqual(result,{state:'resolved',pid:'5857',events:1});
    await importedContext.close();
   }
   await page.locator('.rm-analysis-choices > summary').click();
   await page.locator('[data-rm-analysis-clear]').click();
   await page.waitForFunction(()=>!document.querySelector('.rm-analysis-reviewed'));
   assert.equal(await page.locator('.rm-status-btn').count(),0);
   const cleared=await page.evaluate(async()=>({events:await __localDB.dbQuery('SELECT * FROM lexical_resolution_events WHERE order_index=2'),marks:await __localDB.dbQuery("SELECT * FROM word_status WHERE lemma_key='pid:5857'")}));
   assert.equal(cleared.events.length,2);assert.equal(cleared.events[1].action,'clear');
   if(surface==='room')assert.equal(cleared.marks[0].status,'l2');
   await page.locator('[data-rm-candidate="5856"]').click();await page.locator('[data-rm-analysis-save]').click();
   await page.waitForFunction(()=>/красота/.test(document.querySelector('.rm-status-target')?.textContent||'')&&!!document.querySelector('.rm-analysis-reviewed'));
   await page.locator('.rm-sheet-x').click();await page.locator(target).click();await page.waitForSelector('.rm-analysis-reviewed');
   assert.match(await page.locator('.rm-status-target').innerText(),/красота.*существительное/);
   assert.equal(await page.locator('.rm-acc-conj').count(),1,'chosen noun keeps its own form table after reopening');
   assert.equal(await page.locator('[data-rm-status="l2"].rm-status-active').count(),0,'knowledge must not move from adverb to noun');
   await page.evaluate(()=>window.appSetLocale('he'));
   if(await page.locator('.rm-sheet-x').isVisible())await page.locator('.rm-sheet-x').click();await page.locator(target).click();
   await page.locator('.rm-analysis-choices > summary').click();
   await page.waitForSelector('[data-rm-candidate="5857"]');
   await page.screenshot({animations:'disabled',path:path.join(shots,surface+'-380-hebrew.png')});
   assert.equal(await page.locator('.rm-sheet-card').evaluate(e=>e.scrollWidth<=e.clientWidth+2),true);
   assert.deepEqual(errors,[]);assert.equal(paid,0);
   console.log(JSON.stringify({surface,pass:true,coldMs,choiceKey:exported.key,paidCalls:paid}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
