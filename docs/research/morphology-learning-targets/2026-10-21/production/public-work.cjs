const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd(),base='https://linguistpro.kolosei.com';
const url=base+'/library.html?public_corpus=media-8c30cc63a5e5e39a0acd&public_work=work-341364ac1ee94dba4f026846#room=public%3Amedia-8c30cc63a5e5e39a0acd';
(async()=>{
 const config=await (await fetch(base+'/api/client-config?probe='+Date.now(),{cache:'no-store'})).json();
 console.log(JSON.stringify({version:config.version,health:await(await fetch(base+'/healthz')).json()}));
 if(process.env.EXPECT_VERSION&&config.version!==process.env.EXPECT_VERSION)throw Error('Version has not converged');
 if(process.env.EXPECT_VERSION)for(const [file,query] of [['public/js/reader-morph.js','?v=804'],['public/css/reader-morph.css','?v=804'],['public/sw.js',''],['public/index.html',''],['public/library.html','']]){
  const local=crypto.createHash('sha256').update(execFileSync('git',['show','b3ebc514:'+file],{cwd:root,maxBuffer:20*1024*1024})).digest('hex');
  const response=await fetch(base+'/'+file.replace(/^public\//,'')+query+(query?'&':'?')+'probe='+Date.now(),{cache:'no-store'});
  const remote=crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  console.log(JSON.stringify({file,status:response.status,match:local===remote,sha256:remote}));
  if(local!==remote)throw Error('Served hash mismatch: '+file);
 }
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  await context.addInitScript(()=>{localStorage.setItem('room.wordStatus','1');localStorage.setItem('room.wordGloss','1');localStorage.setItem('room.wordGlossAi','0');localStorage.setItem('room.contextConsent','declined');});
  let paid=0;await context.route('**/api/word-gloss-ctx',r=>{paid++;return r.abort();});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#proTable tbody tr').length>22&&window.ReaderMorph&&window.__localDB?.isReady(),null,{timeout:90000});
  const before=await page.evaluate(async()=>JSON.stringify(await __localDB.dbQuery('SELECT * FROM review_log ORDER BY rowid')));
  const target='#proTable tr[data-row-idx="21"] [data-col="niqqud"] .rm-w[data-surface="שפחדת"]';
  await page.waitForSelector(target,{timeout:60000});
  for(const width of [1280,380]){
   await page.setViewportSize({width,height:900});
   await page.locator(target).click();
   await page.waitForSelector('.rm-analysis-source',{state:'attached',timeout:30000});
   const details=page.locator('.rm-dictionary-reading');if(await details.count()&&!await details.evaluate(e=>e.open))await details.locator('summary').click();
   const card=await page.locator('.rm-sheet-card').evaluate(e=>({statusTarget:e.querySelector('.rm-status-target')?.innerText,targetKey:e.querySelector('[data-rm-status-key]')?.getAttribute('data-rm-status-key'),canEnroll:!!e.querySelector('[data-rm-enroll="ft1:1612:PERF-2ms:sh"]'),word:e.querySelector('.rm-word')?.textContent,source:e.querySelector('.rm-analysis-source')?.textContent,lemma:e.querySelector('.rm-dictionary-lemma')?.innerText,form:e.querySelector('.rm-form-line')?.innerText,overflow:e.scrollWidth>e.clientWidth+1}));
   console.log(JSON.stringify({title:await page.title(),width,card}));
   await page.locator('.rm-analysis-source').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(root,'.tmp','production-morph-card-'+width+'.png')});
   if(process.env.EXPECT_VERSION&&(!card.lemma?.includes('бояться, опасаться, страшиться')||!card.form?.includes('שֶׁפָּחַדְתָּ')||!card.form?.includes('что ты боялся')||card.overflow||card.targetKey!=='pid:1612'||!card.statusTarget?.includes('לפחוד')||!card.canEnroll))throw Error('Grouped reading is incorrect');
   await page.locator('.rm-sheet-x').click();
  }
  const after=await page.evaluate(async()=>JSON.stringify(await __localDB.dbQuery('SELECT * FROM review_log ORDER BY rowid')));
  console.log(JSON.stringify({errors,paidCalls:paid,reviewsUnchanged:before===after}));
  if(errors.length||paid||before!==after)throw Error('Browser/data check failed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
