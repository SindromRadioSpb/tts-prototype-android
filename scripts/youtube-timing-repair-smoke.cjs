'use strict';
// Full real-OPFS synthetic card -> timing-only revision -> archive, with provider calls blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('./smoke-server-env');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-timing-'));
const mode=process.argv.includes('--full')?'full':process.argv.includes('--auto')?'auto':process.argv.includes('--paid')?'paid':'manual';
const output=path.join(root,'.tmp/election-row-playback/browser-'+mode);fs.mkdirSync(output,{recursive:true});
const child=spawn(process.execPath,['-e',SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(dir,0),stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});let browser;
(async()=>{
  const port=await waitForSmokeServer(child,30000),base='http://127.0.0.1:'+port;browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),page=await context.newPage(),paid=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();if(/generativelanguage|\/api\/translate-table|\/api\/tts(?:\?|$)/.test(url)){paid.push(url);return route.abort();}if(!url.startsWith(base))return route.abort();return route.continue();});
  await page.goto(base+'/?timing-smoke=1');await page.waitForFunction(()=>window.StudyTimingRepair&&window.LearningMaterialTaskUI);
  const id=await page.evaluate(async()=>{
    await ensureLocalDB();document.documentElement.lang='ru';
    const texts=['היום אנחנו לומדים משפט חדש בעברית.','מחר אנחנו נלמד מילים חדשות ביחד.','אחר כך אנחנו נשמע שיחה אחרת.'];
    const job=await LearningMaterialTask.create({title:'Synthetic missing timing',provider:'gemini',youtube_source:{url:'https://www.youtube.com/watch?v=cPooKT5rFxc'}});
    const meta=YoutubeAsr.buildImportMeta({video_id:'cPooKT5rFxc',url:job.input.youtube_source.url,durationSec:30,blind:true,segments:texts.map(text=>({startSec:null,text})),timing:{verdict:'suspect',matched:17,medianErrorSec:299}},'synthetic');
    const pkg=await StudioMediaPackage.createFromImportMeta(meta),projection=StudioMediaPackage.buildCompatibilityProjection(pkg.revision,{kind:'captions',media:pkg.input.media});
    meta.media_package_ref=projection.media_package_ref;meta.captions={...meta.captions,...projection.captions,timingDropReason:'ASR_CLOCK_UNVERIFIED'};
    job.transcript={text:meta.textSnapshot,import_meta:meta,blind:true,timing:{verdict:'suspect',matched:17,medianErrorSec:299}};
    job.table={rows:texts.map((he,i)=>({segment_index:i,he,he_niqqud:he,translit:'preserved '+i,ru:'Перевод '+i}))};
    job.table.source_receipt={source_sha256:await PlaybackSource.digest(job.transcript.text),rows_sha256:await PlaybackSource.digest(JSON.stringify(job.table.rows))};
    job.phase='table_ready';await LearningMaterialTask.createStore().add(job);await LearningMaterialTaskUI.list();return job.id;
  });
  await page.getByRole('button',{name:/Synthetic missing timing/}).click();await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  try{await page.waitForFunction(()=>document.querySelector('dialog.study-source-dialog')?.__job?.state==='ready',null,{timeout:45000});}
  catch(e){console.error(await page.evaluate(async id=>await LearningMaterialTask.createStore().get(id),id));throw e;}
  const before=await page.evaluate(async({id,mode})=>{
    document.querySelectorAll('dialog').forEach(d=>d.close());
    // Reproduce legacy Number(null) -> 0 corruption without changing sentence content.
    const repo=StudioMediaPackage.browserRepository(),old=await repo.getTextBinding(id);
    await repo.bindText({...old,mapping:{...old.mapping,rows:old.mapping.rows.map(row=>({...row,caption_segment_id:old.mapping.rows[0].caption_segment_id}))}});
    const ctx=await StudyTimingRepair.context(id);window.timingBefore=ctx;
    const mr=MaterialRevisionRepository.createRepository(ctx.ldb,MaterialRevisionCore),material=await mr.getMaterialByText(id),revision=await mr.getCurrentRevision(material.material_id);
    window.timingMaterial=material;window.tableBefore=revision;
    const timeline=ctx.revision.segments.map(s=>({text:s.text,startSec:null,endSec:null}));
    const evidence={schema:'youtube-asr-timing-evidence-v2',source:ctx.source,timeline,probes:YoutubeTiming.windows(30).map((window,i)=>({window,state:'complete',segments:i?[]:[{text:timeline[0].text,startSec:1},{text:'גבול נוסף שאינו משפט זהה',startSec:5}]}))};
    window.recoveryCalls={estimates:0,paid:0};
    if(mode==='auto'||mode==='full')await StudyTimingRepair.journal(ctx.journalKey,evidence);
    if(mode==='paid'){
      localStorage.setItem('v3.geminiApiKey','synthetic');window.geminiKeyGet=()=> 'synthetic';
      YoutubeAsr.estimate=async()=>{recoveryCalls.estimates++;return {durationSec:30,timingQuote:{estimatedUsd:0.001}};};
      YoutubeAsr.verifySavedTiming=async(opts,source,timeline,quote,progress,persist)=>{recoveryCalls.paid++;await persist(evidence);return {diagnosis:YoutubeTiming.diagnose(evidence)};};
    }
    await StudyTimingRepair.open(id);return {rows:ctx.rowsSnapshot,revision:ctx.revision.revision_id,table:revision.table_revision_id};
  },{id,mode});
  assert.equal(await page.locator('dialog input[type=number]').first().isVisible(),false,'manual timing is not the default route');
  if(mode==='manual'){
    await page.getByText('Дополнительные способы',{exact:true}).click();
    await page.getByText('Ручная разметка',{exact:true}).click();await page.getByLabel('Начало, секунды',{exact:true}).fill('1');await page.getByLabel('Конец, секунды',{exact:true}).fill('5');
    await page.getByRole('button',{name:'Применить время к реплике',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('dialog.study-source-dialog')?.innerText.includes('Кнопки воспроизведения: 1 из 3'));
  }
  for(const [lang,width]of [['ru',380],['he',380],['en',1280]]){
    if(lang!=='ru')await page.evaluate(async({id,lang})=>{document.querySelectorAll('dialog').forEach(d=>d.close());document.documentElement.lang=lang;document.documentElement.dir=lang==='he'?'rtl':'ltr';await StudyTimingRepair.open(id);},{id,lang});
    await page.setViewportSize({width,height:900});assert.equal(await page.locator('dialog.study-source-dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1),false);
    await page.screenshot({path:path.join(output,`repair-${lang}-${width}.png`),fullPage:true});
  }
  if(mode==='manual')await page.locator('dialog.study-source-dialog input[type=checkbox]').check();
  else assert.equal(await page.locator('dialog input[type=checkbox]').isVisible(),false,'provider evidence does not demand a false listening confirmation');
  if(mode==='paid'){
    assert.deepEqual(await page.evaluate(()=>recoveryCalls),{estimates:0,paid:0});
    await page.getByRole('button',{name:'Restore automatically',exact:true}).click();
    await page.getByRole('button',{name:/Restore for ≈/}).waitFor();
    assert.deepEqual(await page.evaluate(()=>recoveryCalls),{estimates:1,paid:0},'show price before spending');
  }
  await page.locator('dialog [data-action=recover]').click();
  try{await page.waitForFunction(()=>document.querySelector('dialog.study-source-dialog [role=status]')?.textContent.startsWith('Synchronization incomplete'));}
  catch(e){console.error(await page.locator('dialog.study-source-dialog').innerText());console.error(await page.locator('dialog.study-source-dialog [role=status]').getAttribute('data-code'));throw e;}
  assert.deepEqual(await page.evaluate(()=>recoveryCalls),{estimates:mode==='paid'?1:0,paid:mode==='paid'?1:0});
  if(mode==='full'){
    await page.evaluate(()=>{
      window.fullRecoveryCalls={estimate:0,paid:0};window.geminiKeyGet=()=> 'synthetic';
      YoutubeFullTiming.estimate=async()=>{fullRecoveryCalls.estimate++;return {maxUsd:.01,maxCalls:1};};
      YoutubeFullTiming.run=async(deps,source,rows,quote,progress,persist)=>{
        fullRecoveryCalls.paid++;const evidence={schema:'youtube-full-timing-v1',runId:'synthetic-full',source,timeline:rows,calls:[{state:'complete',window:{startSec:0,endSec:30},segments:rows.map((s,i)=>({row:i+1,startSec:i*6+1,endSec:i*6+5,heard:s.text}))}]};
        await persist(evidence);return {evidence,...YoutubeFullTiming.collect(evidence),completedWindows:1,totalWindows:1};
      };
    });
    const full=page.locator('dialog [data-action=full]');assert.equal(await full.isVisible(),true,'partial saved cards still offer full recovery');
    await full.click();await page.getByRole('button',{name:/Run full recovery/}).waitFor();
    assert.deepEqual(await page.evaluate(()=>fullRecoveryCalls),{estimate:1,paid:0});
    await full.click();await page.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent.startsWith('Synchronization recovered for all'));
    assert.deepEqual(await page.evaluate(()=>fullRecoveryCalls),{estimate:1,paid:1});assert.equal(await full.isVisible(),true,'repeat remains available');
  }
  await page.evaluate(async id=>{document.querySelectorAll('dialog').forEach(d=>d.close());await StudyVideoInlineOpen(id);},id);
  try{await page.waitForFunction(n=>document.querySelectorAll('#proTable .smk-row-replay').length===n,mode==='full'?3:1,{timeout:10000});}
  catch(e){console.error(JSON.stringify(await page.evaluate(async id=>{const c=await StudyVideoSourceUI.context(id);return {buttons:document.querySelectorAll('.smk-row-replay').length,audio:c.audio,bar:document.querySelector('#v3MediaBar')?.innerText};},id)));throw e;}
  const after=await page.evaluate(async id=>{
    const ctx=await StudyTimingRepair.context(id),mr=MaterialRevisionRepository.createRepository(ctx.ldb,MaterialRevisionCore),rev=await mr.getCurrentRevision(timingMaterial.material_id);
    const archive=await StudioPortableLearningPackage.exportMaterial(timingMaterial.material_id,'archive',{no_download:true,no_receipt:true});
    const audio=(await StudyVideoSourceUI.context(id)).audio;
    return {rows:ctx.rowsSnapshot,revision:ctx.revision.revision_id,oldRevisionPreserved:!!(await ctx.repo.getRevision(timingBefore.revision.revision_id)),
      tableChanged:rev.table_revision_id!==tableBefore.table_revision_id,tableContentPreserved:rev.content_sha256===tableBefore.content_sha256,
      tableBinding:rev.bound_caption_revision_id,playable:audio.timing.entries.length,
      reviewCount:(await ctx.ldb.dbQuery('SELECT COUNT(*) AS n FROM review_log'))[0].n,archiveRoot:archive.manifest.content_root_sha256,
      archiveHasNewRevision:Object.values(archive.files).some(value=>(typeof value==='string'?value:new TextDecoder().decode(value)).includes(ctx.revision.canonical_sha256))};
  },id);
  assert.equal(after.rows,before.rows);assert.notEqual(after.revision,before.revision);assert.ok(after.oldRevisionPreserved);assert.ok(after.tableChanged);assert.ok(after.tableContentPreserved);assert.equal(after.tableBinding,after.revision);assert.equal(after.playable,mode==='full'?3:1);assert.equal(after.reviewCount,0);assert.ok(after.archiveHasNewRevision);assert.deepEqual(paid,[]);assert.deepEqual(errors,[]);
  const transfer=await page.evaluate(async id=>{const c=await StudyVideoSourceUI.context(id);return StudyVideoTransfer.put({schema:1,title:'Synthetic partial playback',video_id:'cPooKT5rFxc',rows:c.rows.map(r=>({he:r.he,ru:r.ru})),entries:c.audio.timing.entries});},id);
  const videoPage=await context.newPage();await videoPage.goto(base+'/study-video.html#'+transfer);await videoPage.waitForSelector('#proTable tbody tr');assert.equal(await videoPage.locator('#proTable tbody button').count(),mode==='full'?3:1,'isolated video view must not offer replay on gaps');await videoPage.close();
  const receipt={...after,rows:JSON.parse(after.rows).length,paidCalls:paid.length,errors};fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();child.kill();});
