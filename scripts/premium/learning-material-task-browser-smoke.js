'use strict';
// Isolated Chromium, real IndexedDB migration and UI; synthetic provider results only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.tmp/learning-material-task-smoke');
const shell=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const styles=(shell.match(/<style[^>]*>[\s\S]*?<\/style>/g)||[]).join('\n')+'<style>'+fs.readFileSync(path.join(root,'public/css/study-video-source.css'),'utf8')+'</style>'; 
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="ru"><head>'+styles+'</head><body><button id="entry">Добавить материал</button></body></html>');return;}
  const file=path.resolve(root,'public','.'+name);
  if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
});
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    const page=await context.newPage();await page.goto(base);
    await page.evaluate(async()=>{
      await new Promise((resolve,reject)=>{const r=indexedDB.open('linguistpro-material-tasks-v1',1);
        r.onupgradeneeded=()=>r.result.createObjectStore('tasks',{keyPath:'id'});
        r.onsuccess=()=>{const db=r.result,tx=db.transaction('tasks','readwrite');
          for(let i=0;i<10;i++)tx.objectStore('tasks').add({id:'legacy-'+i,state:i<8?'ready':'paused',updated_at:'2026-09-14',input:{title:'Legacy '+i},table:{rows:[{he:'paid result '+i}]}});
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
    });
    for(const name of ['playback-source','learning-material-task','learning-material-task-ui'])await page.addScriptTag({url:base+'/js/'+name+'.js'});
    const migrated=await page.evaluate(async()=>{
      const store=LearningMaterialTask.createStore();
      const active=await store.list(),history=await store.listCompleted();
      const preserved=await store.get('legacy-0');
      return {active:active.length,history:history.length,paid:preserved.table.rows[0].he};
    });
    assert.deepEqual(migrated,{active:2,history:8,paid:'paid result 0'});
    await page.evaluate(()=>{
      window.fixture={pending:true,provider:'google-free',saved:[],quotes:[],calls:0};
      const link={video_id:'MlX2x9QJIMk',url:'https://www.youtube.com/watch?v=MlX2x9QJIMk'};
      window.fixtureOps={
        capture:()=>({source_text:fixture.pending?'':'OLD CARD',title:fixture.pending?'Новый материал':'Старая карточка',youtube_source:fixture.pending?link:null,provider:fixture.provider,model:fixture.provider==='gemini'?'fixture-model':null}),
        hasGeminiKey:()=>true,selectGemini:async()=>{fixture.provider='gemini';},
        estimate:async input=>{fixture.quotes.push(input.youtube_source.video_id);return {durationSec:703,estimatedUsd:0.04};},
        transcribe:async input=>{fixture.calls++;return {text:'שלום עולם',import_meta:{captions:{video:{videoId:input.youtube_source.video_id,url:input.youtube_source.url}}}};},
        translate:async input=>({rows:[{he:input.source_text,ru:'Привет мир'}]}),
        save:async job=>{fixture.saved.push({id:job.id,source:job.input.youtube_source,title:job.input.title});return {id:job.id};},
        verifySaved:async()=>true,bindPlaybackSource:async()=>({revision:1}),
        preparePackage:async()=>({sha256:'a'.repeat(64)}),openMaterial:async()=>{},download:async()=>{}
      };
      LearningMaterialTaskUI.configure(fixtureOps);
      document.querySelector('#entry').onclick=()=>LearningMaterialTaskUI.start();
    });
    await page.click('#entry');await page.locator('dialog[open] input').fill('Мой новый ролик');
    await page.evaluate(()=>{fixture.pending=false;});
    await page.getByRole('button',{name:'Использовать Gemini',exact:true}).click();
    assert.equal(await page.locator('dialog[open] input').inputValue(),'Мой новый ролик');
    assert.equal(await page.locator('dialog[open] a').getAttribute('href'),'https://www.youtube.com/watch?v=MlX2x9QJIMk');
    for(const lang of ['ru','he']){
      await page.setViewportSize({width:380,height:820});
      await page.evaluate(lang=>{document.documentElement.lang=lang;document.documentElement.dir=lang==='he'?'rtl':'ltr';},lang);
      if(lang==='he')await page.evaluate(()=>LearningMaterialTaskUI.start({...fixtureOps.capture(),source_text:'',youtube_source:{video_id:'MlX2x9QJIMk',url:'https://www.youtube.com/watch?v=MlX2x9QJIMk'},title:'Мой новый ролик'}));
      await page.screenshot({path:path.join(out,lang+'-380.png')});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow '+lang);
    }
    await page.locator('dialog[open] .study-source-actions button').first().click();
    await page.waitForFunction(()=>fixture.saved.length===1);
    await page.waitForFunction(()=>document.querySelector('dialog[open] p[role="status"]')?.textContent.includes('החומר מוכן')); 
    const result=await page.evaluate(async()=>({saved:fixture.saved,quotes:fixture.quotes,active:(await LearningMaterialTask.createStore().list()).length}));
    assert.equal(result.saved[0].source.video_id,'MlX2x9QJIMk');assert.equal(result.saved[0].title,'Мой новый ролик');assert.equal(result.active,2);
    // More than the old limit: each completion leaves the queue, history stays readable.
    const many=await page.evaluate(async()=>{
      const s=LearningMaterialTask.createStore(),r=LearningMaterialTask.createRunner(s,fixtureOps);
      for(let i=0;i<12;i++){const j=await LearningMaterialTask.create({source_text:'שלום',title:'Batch '+i,provider:'gemini'});await s.add(j);await r.run(j.id);}
      return {active:(await s.list()).length,history:(await s.listCompleted()).length};
    });
    assert.deepEqual(many,{active:2,history:21});
    await page.evaluate(()=>{document.documentElement.lang='ru';document.documentElement.dir='ltr';LearningMaterialTaskUI.list();});
    await page.getByText('Завершённые материалы',{exact:true}).click();
    await page.getByRole('button',{name:/Мой новый ролик/}).waitFor();
    await page.screenshot({path:path.join(out,'history-380.png')});
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(out,'history-desktop.png')});
    console.log(JSON.stringify({ok:true,migrated,many,source:result.saved[0].source,screenshots:out}));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
