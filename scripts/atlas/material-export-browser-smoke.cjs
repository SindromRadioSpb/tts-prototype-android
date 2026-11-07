'use strict';
// Real app / real material, disposable browser profile. No learner mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const {chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const get=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];};
const out=path.resolve(get('--out')),work=path.resolve(__dirname,'../..'),data=get('--data');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 let child,browser,logoutSession;const report={disposable_profile:true,service_workers:'blocked; separate release check required',corpora:[],blocked_mutations:[],blocked_learner_reads:[],page_errors:[]};
 try{
  let base=get('--base'),secret=process.env.ATLAS_EXPORT_SMOKE_SECRET;
  if(!base){
   secret='local-export-test-only-credential-not-production';
   child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:work,env:{...smokeServerEnv(path.resolve(data),0),AUTH_BOOTSTRAP_SECRET:secret},silent:true,windowsHide:true});
   child.stdout.pipe(fs.createWriteStream(path.join(out,'server.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'server-error.log')));
   base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);await waitForSmokeHealth(base,{timeoutMs:60000});
  }
  if(!secret)throw Error('Missing smoke credential');
  const profile=path.join(out,'browser-profile');
  assert(!fs.existsSync(profile),'verification requires a new isolated profile');
  const context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block',acceptDownloads:true});
  browser={close:()=>context.close()};report.profile='new isolated persistent Chromium profile';
  await context.addInitScript(()=>{try{localStorage.setItem('app.locale',location.hash.includes('a97002')?'he':'ru');}catch(_){}});
  const login=await context.request.post(base+'/api/auth/bootstrap-login',{data:{secret,deviceLabel:'Atlas export verification (disposable)'}});secret=null;
  assert.equal(login.status(),200,'official login');const auth=await login.json();assert.equal(auth.user.role,'owner');
  logoutSession=async()=>{const response=await context.request.post(base+'/api/auth/logout',{headers:{'X-LP-CSRF':auth.csrf}});return response.status();};
  // Keep native ZIP transfers out of CDP interception: large intercepted bodies
  // can be buffered in the test driver. The export endpoint is GET-only.
  await context.route(url=>!url.pathname.endsWith('/material-export.zip'),route=>{
   const req=route.request(),url=new URL(req.url());
   if(!['GET','HEAD','OPTIONS'].includes(req.method())){report.blocked_mutations.push({method:req.method(),path:url.pathname});return route.abort();}
   if(url.pathname.startsWith('/api/learner/')){report.blocked_learner_reads.push(url.pathname);return route.abort();}
   if(url.origin!==new URL(base).origin && /^https?:/.test(url.protocol))return route.abort();
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>report.page_errors.push(e.message));
  for(const id of ['a97001','a97002']){
   report.stage=id+':open';
   await page.setViewportSize({width:380,height:900});
   await page.goto(base+'/study-library.html#room=atlas%3A'+id,{waitUntil:'load'});
   const link=page.locator('.atlas-material-export a');await link.waitFor({timeout:90000});
   await page.waitForFunction(()=>window.__localDB?.getOwnershipState()==='shared',null,{timeout:60000});
   // This is an empty disposable profile. Prove it stays empty without copying
   // arbitrary learner rows through the automation transport.
   const state=()=>page.evaluate(async()=>({words:await __localDB.dbQuery('SELECT COUNT(*) AS n FROM word_status',[]),reviews:await __localDB.dbQuery('SELECT COUNT(*) AS n FROM review_log',[])}));
   const before=await state();
   assert.equal(before.words[0].n,0);assert.equal(before.reviews[0].n,0);
   for(const width of [380,1280]){
    await page.setViewportSize({width,height:900});
    // The owner link can arrive before the atlas index and the initial DB
    // projection remount. Measure the settled reader, not the interim shell.
    await page.waitForFunction(()=>{
     const link=document.querySelector('.atlas-material-export a');
     if(!link || !document.querySelector('.atlas-home'))return false;
     const rect=link.getBoundingClientRect(),shape=[innerWidth,document.documentElement.scrollWidth,rect.width,rect.height].join(':');
     const old=window.__atlasExportLayoutProbe;
     if(!old || old.link!==link || old.shape!==shape)window.__atlasExportLayoutProbe={link,shape,since:performance.now()};
     return rect.width>0 && performance.now()-window.__atlasExportLayoutProbe.since>=1000;
    },null,{timeout:60000});
    await link.evaluate(e=>e.scrollIntoView({block:'center'}));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    (report.layouts ||= []).push({atlas_id:id,...layout});
    if(layout.scrollWidth>layout.width+1){
     report.overflow_elements=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})));
     await page.screenshot({path:path.join(out,id+'-'+width+'-overflow.png')});
    }
    assert(layout.scrollWidth<=layout.width+1,JSON.stringify(layout));
    await page.locator('.atlas-material-export').screenshot({path:path.join(out,id+'-'+width+'.png')});
   }
   report.stage=id+':download';
   const pending=page.waitForEvent('download',{timeout:300000});await link.click();const download=await pending;
   report.stage=id+':save-download';
   const file=path.join(out,id+'-full-material.zip');await download.saveAs(file);assert.equal(await download.failure(),null);
   report.stage=id+':verify-empty-profile';
   assert.deepEqual(await state(),before,'export preserved disposable learner tables');
   report.corpora.push({atlas_id:id,file:path.basename(file),bytes:fs.statSync(file).size,download:'passed',learner_tables_unchanged:true});
  }
  report.logout_status=await logoutSession();logoutSession=null;
  assert.equal((await context.request.get(base+'/api/atlas/a97001/material-export')).status(),401);
  report.status='passed';await context.close();console.log(JSON.stringify(report));
 }catch(e){report.status='failed';report.error=e.stack;console.error(e);process.exitCode=1;}
 finally{if(logoutSession){try{report.cleanup_logout_status=await logoutSession();}catch(_){report.cleanup_logout_status='failed';}}fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();if(child)child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
