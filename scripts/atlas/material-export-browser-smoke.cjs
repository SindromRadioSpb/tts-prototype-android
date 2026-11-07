'use strict';
// Real app / real material, disposable browser profile. No learner mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const {chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const get=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];};
const out=path.resolve(get('--out')),work=path.resolve(__dirname,'../..'),data=get('--data');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 let child,browser;const report={disposable_profile:true,service_workers:'blocked; separate release check required',corpora:[],blocked_mutations:[],page_errors:[]};
 try{
  let base=get('--base'),secret=process.env.ATLAS_EXPORT_SMOKE_SECRET;
  if(!base){
   secret='local-export-test-only-credential-not-production';
   child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:work,env:{...smokeServerEnv(path.resolve(data),0),AUTH_BOOTSTRAP_SECRET:secret},silent:true,windowsHide:true});
   child.stdout.pipe(fs.createWriteStream(path.join(out,'server.log')));child.stderr.pipe(fs.createWriteStream(path.join(out,'server-error.log')));
   base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);await waitForSmokeHealth(base,{timeoutMs:60000});
  }
  if(!secret)throw Error('Missing smoke credential');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true});
  await context.addInitScript(()=>{try{localStorage.setItem('app.locale',location.hash.includes('a97002')?'he':'ru');}catch(_){}});
  const login=await context.request.post(base+'/api/auth/bootstrap-login',{data:{secret,deviceLabel:'Atlas export verification (disposable)'}});secret=null;
  assert.equal(login.status(),200,'official login');const auth=await login.json();assert.equal(auth.user.role,'owner');
  await context.route('**/*',route=>{
   const req=route.request(),url=new URL(req.url());
   if(!['GET','HEAD','OPTIONS'].includes(req.method())){report.blocked_mutations.push({method:req.method(),path:url.pathname});return route.abort();}
   if(url.origin!==new URL(base).origin && /^https?:/.test(url.protocol))return route.abort();
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>report.page_errors.push(e.message));
  for(const id of ['a97001','a97002']){
   await page.setViewportSize({width:380,height:900});
   await page.goto(base+'/study-library.html#room=atlas%3A'+id,{waitUntil:'domcontentloaded'});
   const link=page.locator('.atlas-material-export a');await link.waitFor({timeout:90000});
   await page.waitForFunction(()=>window.__localDB?.getOwnershipState()==='shared',null,{timeout:60000});
   const state=()=>page.evaluate(async()=>({words:await __localDB.dbQuery('SELECT * FROM word_status ORDER BY lemma_key',[]),reviews:await __localDB.dbQuery('SELECT * FROM review_log ORDER BY id',[])}));
   const before=await state();
   for(const width of [380,1280]){
    await page.setViewportSize({width,height:900});await link.evaluate(e=>e.scrollIntoView({block:'center'}));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('.atlas-material-export').screenshot({path:path.join(out,id+'-'+width+'.png')});
   }
   const pending=page.waitForEvent('download',{timeout:300000});await link.click();const download=await pending;
   const file=path.join(out,id+'-full-material.zip');await download.saveAs(file);assert.equal(await download.failure(),null);
   assert.deepEqual(await state(),before,'export preserved disposable learner tables');
   report.corpora.push({atlas_id:id,file:path.basename(file),bytes:fs.statSync(file).size,download:'passed',learner_tables_unchanged:true});
  }
  const logout=await context.request.post(base+'/api/auth/logout',{headers:{'X-LP-CSRF':auth.csrf}});report.logout_status=logout.status();
  assert.equal((await context.request.get(base+'/api/atlas/a97001/material-export')).status(),401);
  report.status='passed';await context.close();console.log(JSON.stringify(report));
 }catch(e){report.status='failed';report.error=e.stack;console.error(e);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();if(child)child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
