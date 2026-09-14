'use strict';
// Synthetic IndexedDB task journal + real UI and stateless transliteration API.
// No owner profile, provider credentials, or paid calls.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('./smoke-server-env');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lp-recovery-'));
const output=path.join(root,'.tmp/task-source-recovery/browser');fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const adapter=html.slice(html.indexOf('  async completeSourceRecovery(table,input) {'),html.indexOf('  async verifySaved(job) {'));
const child=spawn(process.execPath,['-e',SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(dir,0),stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
let browser;
(async()=>{
  const port=await waitForSmokeServer(child,30000),base='http://127.0.0.1:'+port;
  browser=await chromium.launch({headless:true});
  const receipts=[];
  for(const [lang,width]of [['ru',380],['he',380],['ru',1280]]){
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(!url.startsWith(base)){errors.push('external request: '+url);return route.abort();}
      if(url===base+'/recovery-fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}" dir="${lang==='he'?'rtl':'ltr'}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/study-video-source.css"><style>body{font:16px Arial;background:#f5f5f5}button,textarea{font:inherit}button{min-height:44px}</style></head><body></body></html>`});
      return route.continue();
    });
    await page.goto(base+'/recovery-fixture');
    for(const name of ['playback-source','table-source-recovery','learning-material-task','learning-material-task-ui'])await page.addScriptTag({url:base+'/js/'+name+'.js'});
    await page.evaluate(async adapter=>{
      const method=Function('return ({'+adapter+'})')();window.fixtureCalls={save:0,asr:0,translate:0};
      LearningMaterialTaskUI.configure({...method,transcribe:async()=>{fixtureCalls.asr++;throw Error('Forbidden ASR');},translate:async()=>{fixtureCalls.translate++;throw Error('Forbidden translation');},save:async j=>{fixtureCalls.save++;window.savedFixture=j;return {id:'fixture-card'};},verifySaved:async j=>LearningMaterialTask.assertSavedRows(j,j.table.rows.map(r=>({he_plain:r.he}))),bindPlaybackSource:async()=>({revision:1}),preparePackage:async()=>({sha256:'a'.repeat(64)}),download:async()=>{},openMaterial:async()=>{}});
      window.seed=async (kind)=>{
        const source='וכשמגיע האוכל, פה שוכחים מהכל. על מה הבחירות האלה?';
        const job=await LearningMaterialTask.create({title:kind+' fixture',provider:'gemini',youtube_source:{url:'https://www.youtube.com/watch?v=0h7uhp2l-lo'}});
        job.transcript={text:source,import_meta:{video:{videoId:'0h7uhp2l-lo'},captions:{segments:[{i:0,text:source,start:0,end:10}]}}};
        const row={segment_index:0,he:kind==='auto'?source.replace('וכש','וככש'):'טקסט אחר לגמרי',he_niqqud:'וּכְכְשֶׁמַּגִּיעַ הָאוֹכֶל, פֹּה שׁוֹכְחִים מֵהַכֹּל. עַל מָה הַבְּחִירוֹת הָאֵלֶּה?',translit:'stale',ru:'Проверяемый перевод'};
        job.table={rows:[row],source_receipt:{source_sha256:await PlaybackSource.digest(source),rows_sha256:await PlaybackSource.digest(JSON.stringify([row]))}};
        job.phase='table_ready';job.error='TASK_SOURCE_MISMATCH';if(kind==='review')job.error_reason='table';
        await LearningMaterialTask.createStore().add(job);await LearningMaterialTaskUI.list();return job.id;
      };
    },adapter);
    const auto=await page.evaluate(()=>seed('auto'));
    await page.getByRole('button',{name:/auto fixture/}).click();
    await page.getByRole('button',{name:lang==='he'?'המשך':'Продолжить',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('dialog')?.__job?.state==='ready');
    const fixed=await page.evaluate(()=>savedFixture.table.rows[0]);assert.equal(fixed.source_recovery.translit_status,'local');assert.ok(fixed.translit);assert.ok(fixed.he_niqqud);
    await page.screenshot({path:path.join(output,`ready-${lang}-${width}.png`),fullPage:true});
    const manual=await page.evaluate(()=>seed('review'));
    await page.getByRole('button',{name:/review fixture/}).click();
    assert.equal(await page.getByRole('button',{name:lang==='he'?'המשך':'Продолжить',exact:true}).count(),0);
    await page.getByRole('button',{name:lang==='he'?'בדיקת הבדלים':'Проверить расхождения',exact:true}).click();
    const apply=page.getByRole('button',{name:lang==='he'?'שמירת השורות שנבדקו והמשך':'Сохранить проверенные строки и продолжить',exact:true});
    await apply.click();assert.ok(await page.locator('[role=alert]').innerText());
    await page.getByRole('textbox').fill('Проверенный пользователем перевод');
    await page.getByRole('checkbox').check();
    await page.screenshot({path:path.join(output,`review-${lang}-${width}.png`),fullPage:true});
    const overflow=await page.locator('dialog').evaluate(d=>d.scrollWidth>d.clientWidth+1);assert.equal(overflow,false);
    await apply.click();await page.waitForFunction(()=>document.querySelector('dialog')?.__job?.state==='ready');
    const state=await page.evaluate(async()=>({calls:fixtureCalls,rows:savedFixture.table.rows,completed:(await LearningMaterialTask.createStore().listCompleted()).length}));
    assert.equal(state.calls.asr,0);assert.equal(state.calls.translate,0);assert.equal(state.calls.save,2);assert.equal(state.completed,2);
    assert.equal(state.rows[0].ru,'Проверенный пользователем перевод');assert.equal(state.rows[0].niqqud_status,'not_vocalized');
    assert.deepEqual(errors,[]);receipts.push({lang,width,calls:state.calls,completed:state.completed,overflow:false,errors});
    await context.close();
  }
  fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipts,null,2));console.log(JSON.stringify(receipts));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();child.kill();});
