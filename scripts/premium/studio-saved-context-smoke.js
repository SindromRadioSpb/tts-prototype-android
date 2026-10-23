'use strict';
// Saved manual/AI context in the real Classic host while status painting waits.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
const ide=process.argv.includes('--ide');
const arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3),remote=arg('base');
const root=path.resolve(__dirname,'../..'),out=path.resolve(arg('out')||path.join(root,'.tmp/reader-performance/studio-context-'+(ide?'ide':'classic')+'-817.json'));
(async()=>{
 const server=remote?null:fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(),'lp-studio-context-')),0),silent:true,windowsHide:true});
 server?.stdout.resume();server?.stderr.resume();let browser,page;
 const report={surface:ide?'ide':'classic',scope:'Disposable Studio Chromium, synthetic saved context, blocked status boundary; no owner profile or paid generation.',errors:[],paidRequests:0};
 try{
  const base=remote||'http://127.0.0.1:'+await waitForSmokeServer(server,30000);
  if(remote){assert.ok(arg('version'));assert.equal((await(await fetch(base+'/api/client-config?verify='+Date.now())).json()).version,arg('version'));}
  browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  await context.route('**/*',route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.method()==='POST'&&['/api/word-gloss-ctx','/api/tts'].includes(url.pathname))report.paidRequests++;
   if(url.origin!==base||!['GET','HEAD'].includes(req.method()))return route.abort();
   return route.continue();
  });
  if(!remote)await context.route('**/js/studio-morph.js?*',async route=>{
   const response=await route.fetch(),source=await response.text();
   await route.fulfill({response,body:source.replace('window.StudioMorph = {','window.StudioMorph = { probe: () => ({ mount: rmMount?.id, revision: _decorRevision, busy: _decorBusy, dirty: _decorDirty }),')});
  });
  await context.addInitScript(()=>{localStorage.setItem('app.locale','ru');localStorage.setItem('phase6Decision_v1','declined');localStorage.setItem('onboardingSeen_v1','1');localStorage.setItem('studio.wordGlossAi','0');});
  page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'/?localMode=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__localDB?.isReady()&&window.StudioMorph&&window.WordGlossAI);
  await page.evaluate(async ide=>{
   const rows=Array.from({length:34},(_,i)=>({order_index:i,he_plain:Array(30).fill('שלום עולם').join(' '),he_niqqud:Array(30).fill('שָׁלוֹם עוֹלָם').join(' '),ru:'Сохранённый контекст '+i,translit:'stored'}));
   await __localDB.importBundle({texts:['A','B'].map(letter=>({text_key:'studio-context-'+letter,title:'Studio context '+letter,sentences:rows}))},{mode:'skip'});
   window.__savedContext={models:{},gates:[],painting:[],released:[]};
   for(const letter of ['A','B']){
    const [text]=await __localDB.dbQuery('SELECT id FROM texts WHERE text_key=?',['studio-context-'+letter]);
    const data=await __localDB.getSentences(text.id);
    const layer={schema:WordGlossAI.LAYER_SCHEMA,rows:data.map((r,i)=>{
     const p=WordGlossAI.rowPayloadFromData(r);
     return{order_index:i,key:p.key,model:'synthetic-saved-fixture',mwe:[],glosses:p.words.map((_,offset)=>({gloss:offset===0?letter+'-USER-'+i:letter+'-CONTEXT-'+i+':'+offset,...(offset===0?{manual:true,ai_gloss:'saved original'}:{}),wrong_hint:false}))};
    })};
    const remembered=await WordGlossAI.remember(layer,data);if(remembered.stored!==34)throw Error('Fixture context rejected');
    __savedContext.models[letter]=data.map(r=>({he:r.he_plain,he_niqqud:r.he_niqqud,ru:r.ru,translit:r.translit,_v3_sentenceId:r.id,_v3_textId:text.id,_v3_orderIndex:r.order_index}));
   }
   ReaderMorph.decorateWords=async(mount,states,opts)=>{
    const at=__savedContext.gates.length;
    await new Promise(resolve=>__savedContext.gates.push(()=>{__savedContext.released.push(at);resolve();}));
    if(opts.isCurrent()){
     __savedContext.painting.push(at);mount.querySelector('#proTable')?.setAttribute('data-status-pass',String(at));
    }
   };
   WordGloss.setEnabled('studio','Gloss',true);WordGloss.setEnabled('studio','GlossAi',false);WordGloss.setEnabled('studio','Ribbon',false);
   applyPreset('full');if(ide)v3IdeApplyMode(true);
   __savedContext.render=letter=>{
    const data=__savedContext.models[letter];
    if(document.body.classList.contains('v3-ide-mode')){currentTableData=data;v3IdeState.activeTextId=data[0]._v3_textId;v3IdeRenderTable(data,data[0]._v3_textId);}
    else v3RenderTableFromLibrary(data);
   };
   __savedContext.render('A');
  },ide);
  const first=letter=>page.waitForFunction(letter=>document.querySelector('#proTable td[data-col="niqqud"] .rm-w')?.dataset.gloss===letter+'-USER-0',letter);
  await first('A');
  assert.ok(await page.evaluate(()=>__savedContext.gates.length>0&&__savedContext.released.length===0));
  await page.evaluate(()=>__savedContext.render('B'));
  await first('B');
  await page.waitForFunction(()=>document.querySelectorAll('#proTable td[data-col="niqqud"] [data-gloss-source="user"]').length===34);
  const before=await page.evaluate(()=>({manual:document.querySelectorAll('#proTable td[data-col="niqqud"] [data-gloss-source="user"]').length,released:__savedContext.released.length}));
  assert.equal(before.manual,34);assert.equal(before.released,0,'B context appears without waiting for A status completion');
  await page.evaluate(()=>__savedContext.gates[0]());
  await page.waitForFunction(()=>__savedContext.gates.length>=2);
  assert.deepEqual(await page.evaluate(()=>__savedContext.painting),[],'late A status never paints B');
  await page.evaluate(()=>__savedContext.gates[1]());
  await page.waitForFunction(()=>__savedContext.painting.includes(1));
  await first('B');
  await page.evaluate(()=>{
   if(document.body.classList.contains('v3-ide-mode'))v3IdeToggleColumn('translation');
   else{tableVisibleColumns.ru=false;renderTable(currentTableData);}
  });
  await first('B');
  assert.equal(await page.locator('#proTable td[data-col="ru"]').count(),0);
  await page.setViewportSize({width:380,height:780});await page.evaluate(()=>appSetLocale('he'));
  await page.evaluate(()=>{if(document.body.classList.contains('v3-ide-mode')){if(v3IdeState.leftOpen)v3IdeToggleLeft();if(v3IdeState.rightOpen)v3IdeToggleRight();}});
  await first('B');assert.equal(await page.getAttribute('html','dir'),'rtl');
  const word=page.locator('#proTable tr[data-row-idx="0"] td[data-col="niqqud"] .rm-w').first();await word.scrollIntoViewIfNeeded();await word.click();
  await page.waitForFunction(()=>document.querySelector('.rm-sheet.rm-open .rm-current-reading')?.textContent.includes('B-USER-0'));
  fs.mkdirSync(path.dirname(out),{recursive:true});await page.screenshot({path:out.replace('.json','-mobile-card.png')});
  await page.locator('.rm-sheet.rm-open .rm-sheet-x').click();
  await page.evaluate(()=>{v3IdeApplyMode(!document.body.classList.contains('v3-ide-mode'));__savedContext.render('B');});
  await first('B');
  const switchedWord=page.locator('#proTable td[data-col="niqqud"] .rm-w').first();await switchedWord.scrollIntoViewIfNeeded();await switchedWord.click();
  await page.waitForFunction(()=>document.querySelector('.rm-sheet.rm-open .rm-current-reading')?.textContent.includes('B-USER-0'));
  assert.equal(await page.locator('.rm-sheet.rm-open').count(),1);
  report.checks={paragraphs:34,wordsPerParagraph:60,savedManualRows:before.manual,BGlossBeforeAStatus:true,lateAStatusSuppressed:true,hiddenTranslationKeepsContext:true,mobileRtlWordCard:true,modeSwitchKeepsWordCard:true};
  report.reviewLogCount=await page.evaluate(async()=>(await __localDB.dbQuery('SELECT COUNT(*) AS n FROM review_log'))[0].n);
  assert.equal(report.reviewLogCount,0);assert.equal(report.paidRequests,0);assert.deepEqual(report.errors,[]);report.result='PASS';console.log(JSON.stringify(report));
  }catch(error){report.result='FAIL';report.failure=error.stack;report.diagnostic=await page?.evaluate(()=>({mode:document.body.className,probe:StudioMorph.probe?.(),gates:window.__savedContext?.gates.length,rows:document.querySelectorAll('#proTable tbody tr').length,wrapped:document.querySelectorAll('#proTable .rm-w').length,first:document.querySelector('#proTable .rm-w')?.outerHTML,classicRows:document.querySelectorAll('#tableContainer tbody tr').length,ideRows:document.querySelectorAll('#v3IdeCenterContent tbody tr').length,renderWrapped:!!window.v3IdeRenderTable.__smWrapped})).catch(()=>null);throw error;}
  finally{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
