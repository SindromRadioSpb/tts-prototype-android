'use strict';
// Same runner for historical and current runtime; disposable data, no providers.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { fork, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const AdmZip = require('adm-zip');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const arg = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
const ROOT = path.resolve(arg('root') || path.join(__dirname, '../..'));
const OUT = path.resolve(arg('out') || '.tmp/material-performance.json');
const ROUNDS = Number(arg('rounds') || 3), MODE = arg('mode') || 'workflows';
const summary = values => { const s = [...values].sort((a,b) => a-b); return { n:s.length, medianMs:(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2, minMs:s[0], maxMs:s.at(-1), samplesMs:values }; };
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main() {
  assert.ok(['workflows', 'import'].includes(MODE));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-perf-'));
  const server = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(data,0), silent:true, windowsHide:true });
  let browser; const results = [], errors = [];
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(server,30000);
    browser = await chromium.launch({headless:true});
    for (let round=0; round<ROUNDS; round++) {
      const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:850}});
      context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
      await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
      await context.addInitScript(() => {
        if (!['http:','https:'].includes(location.protocol)) return;
        localStorage.setItem('app.locale','ru'); localStorage.setItem('onboardingSeen_v1','1'); localStorage.setItem('phase6Decision_v1','declined');
      });
      const result = MODE==='import' ? await importRound(context,base) : await workflowRound(context,base);
      results.push(result); await context.close();
      console.log(`${result.competingWrite?.ok===false?'PARTIAL':'PASS'} ${MODE} round ${round+1}/${ROUNDS}`);
    }
    assert.deepEqual(errors,[]);
    const metrics = {};
    for (const r of results) for (const [key,value] of Object.entries(r.timings)) (metrics[key] ||= []).push(...(Array.isArray(value)?value:[value]));
    const report = {status:results.some(r=>r.competingWrite?.ok===false)?'PARTIAL':'PASS',at:new Date().toISOString(),mode:MODE,rounds:ROUNDS,
      commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
      version:(await (await fetch(base+'/api/client-config')).json()).version,
      environment:{os:os.platform(),release:os.release(),cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,node:process.version,chromium:browser.version()},
      conditions:{sequential:true,disposableProfiles:true,serviceWorkers:false,httpCache:false,providers:false,ownerData:false,deviceEvidence:false},
      metrics:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,summary(v)])),results,errors};
    fs.mkdirSync(path.dirname(OUT),{recursive:true}); fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
  } finally { if(browser) await browser.close(); server.kill(); }
}
async function workflowRound(context,base) {
  await context.route('**/js/library-ui.js?*',async route=>{
    const response=await route.fetch(); await route.fulfill({response,body:await response.text()+`
window.__perf = {reads:0,words:0,events:0};
const perfLoad=loadData; loadData=(...a)=>{ __perf.reads++; return perfLoad(...a); };
const perfWords=morphHost.invalidateWordStates; morphHost.invalidateWordStates=(...a)=>{__perf.words++;return perfWords.apply(morphHost,a);};
window.addEventListener('localdb:changed',()=>{__perf.events++;window.__lastPerfEvent=performance.now();});
window.__lastPerfEvent=performance.now();
window.__perfOpen=openReader;
`});
  });
  await context.route('**/js/mediatheque-ui.js?*',async route=>{
    const response=await route.fetch(); await route.fulfill({response,body:await response.text()+`
window.__perf={reads:0,renders:0,events:0,pending:0,lastDone:0,eventAt:0};
const perfNow=()=>performance.timeOrigin+performance.now();
const perfLocal=loadLocal; loadLocal=async(...a)=>{__perf.reads++;__perf.pending++;try{return await perfLocal(...a);}finally{__perf.pending--;__perf.lastDone=perfNow();}};
if(typeof refreshLocalChanges==='function'){const original=refreshLocalChanges;refreshLocalChanges=async(...a)=>{__perf.pending++;try{return await original(...a);}finally{__perf.pending--;__perf.lastDone=perfNow();}};}
const perfRender=render;render=(...a)=>{__perf.renders++;const r=perfRender(...a);__perf.lastDone=perfNow();return r;};
window.addEventListener('localdb:changed',()=>{__perf.events++;__perf.eventAt=perfNow();});
window.__perfReady=()=>state.localReady&&!state.loading&&!localRefresh;
window.__perfItems=()=>state.localItems;
`});
  });
  const timings={}, studio=await context.newPage();
  let start=performance.now();
  await studio.goto(base+'/?localMode=1',{waitUntil:'domcontentloaded'});
  await studio.waitForFunction(()=>window.__localDB?.isReady(),null,{timeout:45000});
  timings.coldStudioDbReady=performance.now()-start;
  await studio.evaluate(async()=>{
    for(const id of ['perf-A','perf-B']){
      await __localDB.createText({id,text_key:id,title:id,source_text:id+'\n'+'שלום עולם\n'.repeat(10000)});
      await __localDB.addSentences(id,Array.from({length:40},(_,i)=>({id:id+'-'+i,he_plain:'שלום עולם',he:'שלום עולם',he_niqqud:'שָׁלוֹם עוֹלָם',ru:id+'-line-'+i,translit:'shalom olam',translit_ru:'шалом олам',order_index:i})));
      await __localDB.setProgress(id,{last_row_idx:2,last_step_id:'ru'});
    }
  });
  const room=await context.newPage();start=performance.now();
  await room.goto(base+'/library.html?canon=skip&corpus=skip&my_text=perf-A',{waitUntil:'domcontentloaded'});
  await room.locator('#roomReaderTable').getByText('perf-A-line-0',{exact:false}).waitFor({timeout:45000});
  timings.coldReaderNavigation=performance.now()-start;
  await room.waitForFunction(()=>window.__perfOpen);
  for(const surface of ['classic','ide','room']){
    if(surface==='ide')await studio.evaluate(()=>v3IdeApplyMode(true,'perf-A'));
    const page=surface==='room'?room:studio;
    timings['warmOpen_'+surface]=await page.evaluate(async surface=>{
      const values=[];
      for(let i=0;i<12;i++){
        const id=i%2?'perf-B':'perf-A',start=performance.now();
        if(surface==='room')await __perfOpen(id,id,{resume:true});
        else if(surface==='ide')await v3IdeOpenTextInCenter(id);
        else await v3LibraryOpenText(id,{resume:true});
        const elapsed=performance.now()-start;
        const table=document.querySelector(surface==='room'?'#roomReaderTable #proTable':'#proTable');
        if(!table?.textContent.includes(id+'-line-0')||table.querySelectorAll('tbody tr').length!==40)throw Error('wrong open');
        if(i>=2)values.push(elapsed);
      }return values;
    },surface);
  }
  await studio.waitForFunction(()=>document.querySelector('#inputText').value.startsWith('perf-B'));
  const save=await studio.evaluate(async()=>{
    const update=[],copy=[];
    for(let i=0;i<12;i++){
      let start=performance.now();const created=await v3LibrarySaveCurrentCore({title:'Perf copy '+i});const copyMs=performance.now()-start;
      if(!created?.id)throw Error('copy failed');
      start=performance.now();const updated=await v3LibraryUpdateCurrentCore(created.id,{title:'Perf updated '+i});const updateMs=performance.now()-start;
      if(updated?.id!==created.id)throw Error('update failed');
      const rows=await __localDB.getSentences(created.id);
      if(rows.length!==40||rows[0].ru!=='perf-B-line-0')throw Error('saved rows mismatch');
      if(i>=2){update.push(updateMs);copy.push(copyMs);}
    }return{update,copy};
  });
  timings.warmSaveUpdate=save.update;timings.warmSaveCopy=save.copy;
  const media=await context.newPage();start=performance.now();
  await media.goto(base+'/mediatheque.html?space=personal&section=catalog',{waitUntil:'domcontentloaded'});
  await media.waitForFunction(()=>window.__perfReady?.());
  await media.getByText('perf-A',{exact:true}).first().waitFor();timings.coldPersonalCatalogNavigation=performance.now()-start;
  await room.waitForFunction(()=>performance.now()-window.__lastPerfEvent>1000);
  const cross=[];timings.progressCommitToMediaDone=[];timings.progressHandlerAfterEvent=[];
  for(let i=0;i<12;i++){
    await media.evaluate(()=>{for(const k in __perf)__perf[k]=0;});
    await room.evaluate(()=>{for(const k in __perf)__perf[k]=0;});
    const committed=await studio.evaluate(async i=>{const start=performance.timeOrigin+performance.now();await __localDB.setProgress('perf-A',{last_row_idx:3+i,last_step_id:'ru'});return{start,end:performance.timeOrigin+performance.now()};},i);
    await media.waitForFunction(()=>__perf.events>0&&__perf.pending===0&&__perf.lastDone>=__perf.eventAt&&window.__perfReady());
    await room.waitForFunction(()=>__perf.events>0);
    const m=await media.evaluate(()=>({...__perf})),r=await room.evaluate(()=>({...__perf}));
    if(i>=2){timings.progressCommitToMediaDone.push(m.lastDone-committed.start);timings.progressHandlerAfterEvent.push(m.lastDone-m.eventAt);cross.push({media:m,reader:r});}
  }
  assert.equal(await media.evaluate(()=>__perfItems().find(x=>x.localId==='perf-A')?.progress),'in_progress');
  return{timings,crossTab:cross,fixture:{textsBeforeCopies:2,rowsPerText:40,sourceChars:100007,warmupPerMetric:2,samplesPerMetric:10},contentVerified:true};
}
async function importRound(context,base){
  const zip=new AdmZip(path.join(ROOT,'public/data/benyehuda/canon-v4.zip'));
  const library=JSON.parse(zip.readAsText('library/library.json'));
  const sort=rows=>rows.sort((a,b)=>a.text_key.localeCompare(b.text_key)||a.order_index-b.order_index);
  const expected=sort(library.texts.flatMap(t=>t.rows.map((r,i)=>({text_key:t.text_key,order_index:i,he_plain:r.hebrew_plain||'',he_niqqud:r.hebrew_niqqud||'',translit:r.translit||'',translit_ru:r.translit_ru||'',ru:r.russian||'',audio_asset_key:r.audio_asset_key||null}))));
  await context.addInitScript(()=>{
    window.__tx={begin:null,end:null,count:0};const post=Worker.prototype.postMessage,seen=new WeakSet();
    Worker.prototype.postMessage=function(m,...rest){
      if(!seen.has(this)){seen.add(this);this.addEventListener('message',e=>{if(e.data.id===__tx.beginId){__tx.ack=performance.now();window.__canonBegin?.();}if(e.data.id===__tx.commitId)__tx.end=performance.now();});}
      if(m?.sql){if(/^BEGIN/i.test(m.sql.trim())&&__tx.begin===null){__tx.begin=performance.now();__tx.beginId=m.id;}if(__tx.begin!==null&&__tx.end===null)__tx.count++;if(/^COMMIT/i.test(m.sql.trim())&&__tx.end===null)__tx.commitId=m.id;}
      return post.call(this,m,...rest);
    };
  });
  const studio=await context.newPage();await studio.goto(base+'/?localMode=1',{waitUntil:'domcontentloaded'});
  await studio.waitForFunction(()=>window.__localDB?.isReady(),null,{timeout:45000});
  const room=await context.newPage();let competing,start,resolveBegin;const began=new Promise(r=>resolveBegin=r);
  await room.exposeFunction('__canonBegin',()=>{start=performance.now();competing=studio.evaluate(()=>__localDB.createText({id:'competing',text_key:'competing',title:'competing',source_text:'fixture'})).then(()=>({ok:true,elapsedMs:performance.now()-start}),e=>({ok:false,elapsedMs:performance.now()-start,error:e.message}));resolveBegin();});
  const nav=performance.now();await room.goto(base+'/library.html?corpus=skip',{waitUntil:'domcontentloaded'});
  await room.waitForFunction(()=>__tx.ack!=null,null,{timeout:60000});await began;const competingWrite=await competing;
  try { await room.waitForFunction(()=>__tx.end!==null,null,{timeout:120000}); }
  catch(error){fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify({status:'FAIL',error:error.message,competingWrite,transaction:await room.evaluate(()=>__tx)},null,2)+'\n');throw error;}
  const tx=await room.evaluate(()=>__tx);
  const navigationToCommit=performance.now()-nav;
  const actual=await room.evaluate(()=>__localDB.dbQuery(`SELECT t.text_key,s.order_index,s.he_plain,s.he_niqqud,s.translit,s.translit_ru,s.ru,a.asset_key AS audio_asset_key FROM sentences s JOIN texts t ON t.id=s.text_id LEFT JOIN sentence_audio sa ON sa.sentence_id=s.id AND sa.is_default=1 LEFT JOIN audio_assets a ON a.id=sa.audio_id WHERE t.text_key!='competing'`));
  assert.equal(actual.length,expected.length);assert.equal(sha(sort(actual)),sha(expected));
  return{timings:{coldCanonTransaction:tx.end-tx.begin,[competingWrite.ok?'competingWriteWait':'competingWriteTimeout']:competingWrite.elapsedMs,coldCanonNavigationToCommit:navigationToCommit},competingWrite,sqlMessages:tx.count,texts:library.texts.length,rows:expected.length,rowDigest:sha(expected),contentVerified:true};
}
main().catch(e=>{console.error(e);process.exitCode=1;});
