'use strict';
// Isolated browser profiles only; mock publication, real OPFS and shared Studio/Room code. No paid calls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const RM=require('../../public/js/reader-morph');
const base=process.env.CONTEXT_BASE||'http://127.0.0.1:3324';
const shots=path.resolve(__dirname,'../../.tmp/context-provenance-smoke');
fs.mkdirSync(shots,{recursive:true});
function fnv(s){let h1=0x811c9dc5,h2=0x01000193;for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);h1=Math.imul(h1^c,16777619)>>>0;h2=Math.imul(h2^c,2246822519)>>>0;}return h1.toString(16)+h2.toString(16);}
const metadata={_studio_material:{schema:'material-projection-v1',imported:true,field_meta:{he_niqqud:{authority:'provider',provider:'OpenAI assistant',status:'current'}}}};
const rows=[0,1].map(i=>({order_index:i,hebrew_plain:'שאול,',hebrew_niqqud:'שָׁאוּל,',russian:'Шауль,',translit:"Sha'ul",edit_meta:metadata}));
rows.push({order_index:2,hebrew_plain:'שלום',hebrew_niqqud:'שָׁלוֹם',russian:'Привет'});
function layer(rows){return {schema:'word-gloss-ai-layer-v1',rows:rows.slice(0,2).map((r,i)=>{let words=RM.words(r.hebrew_niqqud);return {order_index:i,key:'r2'+fnv(words.join(' ')+'\u0001'+r.russian)+':'+words.length,model:'OpenAI assistant',glosses:[{gloss:i?'Шауль':'Шауль, имя',wrong_hint:false}],mwe:[]};})};}
const snapshot={library:{texts:[{title:'Контекст: проверка',text_key:'context-browser',source_text:'שאול,\nשאול,\nשלום',rows,word_gloss_ai_layer:layer(rows)}]}};
const item={public_work_id:'work-1',position_no:1,title:'Контекст: проверка',snapshot_sha256:'c'.repeat(64),public_read_allowed:1,public_stream_allowed:0,package_download_allowed:0,asset_missing:0,package_complete:0,expected_audio_count:0,included_audio_count:0};
const published={ok:true,corpus:{corpus_id:'pc_context',slug:'test-context',title:'Контекст'},edition:{edition_id:'ed_context',edition_number:1,manifest_sha256:'b'.repeat(64),item_count:1,asset_count:0,asset_missing:0,package_complete:false},items:[item]};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const surface of (process.env.CONTEXT_SURFACE?[process.env.CONTEXT_SURFACE]:['studio','room'])){
   const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
   let paid=0;const errors=[];
   const page=await context.newPage();
   page.on('pageerror',error=>errors.push(String(error)));
   await page.addInitScript(()=>{localStorage.setItem('room.wordGloss','1');localStorage.setItem('studio.wordGloss','1');localStorage.setItem('room.wordRibbon','1');localStorage.setItem('studio.wordRibbon','1');localStorage.setItem('room.wordGlossAi','0');localStorage.setItem('studio.wordGlossAi','0');});
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
   try {await page.waitForFunction(()=>document.querySelectorAll('#proTable tbody tr').length===3&&document.querySelectorAll('#proTable [data-gloss-label=ai]').length===2,null,{timeout:60000});} catch(error) {console.log(await page.evaluate(()=>({url:location.href,text:document.body.innerText.slice(-5000),rows:document.querySelectorAll('#proTable tbody tr').length,ai:document.querySelectorAll('#proTable [data-gloss-label=ai]').length})));console.log(errors);await page.screenshot({animations:'disabled',path:path.join(shots,surface+'-failed.png')});throw error;}
   await page.waitForFunction(()=>/2.*3/.test(document.querySelector('.rm-context-coverage')?.textContent||''),null,{timeout:60000});
   const before=await page.evaluate(async()=>({reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY id'),coverage:document.querySelector('.rm-context-coverage')?.textContent,glosses:[...document.querySelectorAll('#proTable [data-col=niqqud] .rm-w')].map(s=>({gloss:s.dataset.gloss,source:s.dataset.glossSource}))}));
   if(!/2.*3/.test(before.coverage||''))console.log(await page.evaluate(()=>[...document.querySelectorAll('.rm-context-coverage')].map(e=>({text:e.textContent,parent:e.parentElement.id,hidden:e.hidden,html:e.previousElementSibling?.id,next:e.nextElementSibling?.id}))));
   assert.match(before.coverage,/2.*3/);assert.equal(before.glosses[0].gloss,'Шауль, имя');assert.equal(before.glosses[1].gloss,'Шауль');assert.equal(before.glosses[2].source,'dictionary');
   await page.locator('#proTable [data-col=niqqud] .rm-w').first().click();
   await page.waitForSelector('.rm-sheet.rm-open .rm-ai-gloss');
   assert.match(await page.locator('.rm-niqqud-prov').innerText(),/OpenAI assistant.*архиве/);
   assert.match(await page.locator('.rm-head .rm-prov').innerText(),/форма совпадает/);
   assert.equal(await page.locator('.rm-dictionary-reading .rm-meaning').isVisible(),false);
   for(const width of [1280,380]){
    await page.setViewportSize({width,height:900});
    await page.waitForFunction(()=>{const r=document.querySelector('.rm-sheet.rm-open .rm-head')?.getBoundingClientRect();return r&&r.top<innerHeight-200;});
    await page.screenshot({animations:'disabled',path:path.join(shots,surface+'-'+width+'-unconfirmed.png')});
   }
   await page.locator('.rm-analysis-correction summary').click();await page.locator('[data-rm-candidate="name"]').click();await page.locator('[data-rm-analysis-save]').click();
   await page.waitForSelector('.rm-analysis-reviewed');
   assert.equal(await page.locator('.rm-dictionary-reading').count(),0);
   assert.doesNotMatch(await page.locator('.rm-rows').innerText(),/שאל|прилагательное/);
   assert.match(await page.locator('.rm-rows').innerText(),/имя/);
   await page.screenshot({animations:'disabled',path:path.join(shots,surface+'-380-confirmed.png')});
   await page.locator('.rm-sheet-x').click();
   await page.evaluate(async surface=>{
    WordGloss.setEnabled(surface,'GlossStrict',true);
    const cb=document.getElementById(surface==='room'?'readerWordGlossStrictToggle':'studioWordGlossStrictToggle');
    if(cb){cb.checked=true;cb.dispatchEvent(new Event('change'));}
    else await WordGloss.apply(document.querySelector(surface==='room'?'#roomReaderTable':'#tableContainer'),{gloss:true,ribbon:true,ai:false,strict:true});
   },surface);
   await page.waitForFunction(()=>document.querySelector('#proTable tr[data-row-idx="2"] [data-col=niqqud] .rm-w')?.dataset.glossSource==='missing');
   const result=await page.evaluate(async()=>({reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY id'),events:await __localDB.dbQuery('SELECT chosen_json FROM lexical_resolution_events'),missing:getComputedStyle(document.querySelector('#proTable tr[data-row-idx="2"] [data-col=niqqud] .rm-w'),'::before').opacity}));
   assert.deepEqual(result.reviews,before.reviews);assert.ok(Number(result.missing)>0);assert.equal(paid,0);
   const race=await page.evaluate(async surface=>{
    const mount=document.querySelector(surface==='room'?'#roomReaderTable':'#tableContainer'),original=ReaderMorph.resolveForGloss;
    let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
    WordGloss._memo.clear();
    ReaderMorph.resolveForGloss=async(...args)=>{started();await gate;return original(...args);};
    try{
     const older=WordGloss.apply(mount,{gloss:true,ribbon:false,ai:false,strict:false});
     await entered;
     await WordGloss.apply(mount,{gloss:true,ribbon:false,ai:false,strict:true});
     release();await older;
     return document.querySelector('#proTable tr[data-row-idx="2"] [data-col=niqqud] .rm-w').dataset.glossSource;
    }finally{release();ReaderMorph.resolveForGloss=original;}
   },surface);
   assert.equal(race,'missing','late dictionary result must not overwrite the newer strict mode');
   // Hebrew UI/RTL uses the same state, with no horizontal spill from the card.
   await page.evaluate(()=>window.appSetLocale('he'));
   await page.locator('#proTable [data-col=niqqud] .rm-w').first().click();
   await page.waitForSelector('.rm-sheet.rm-open .rm-head');
   await page.waitForFunction(()=>{const r=document.querySelector('.rm-sheet.rm-open .rm-head')?.getBoundingClientRect();return r&&r.top<innerHeight-200;});
   await page.screenshot({animations:'disabled',path:path.join(shots,surface+'-380-hebrew.png')});
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({surface,pass:true,reviewLogUnchanged:true,paidCalls:paid,coverage:before.coverage}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
