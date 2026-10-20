'use strict';
// Disposable owner/DB, canonical archive preparation; never publishes to production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer}=require('../smoke-server-env');
const root=path.resolve(__dirname,'../..'),arg=n=>process.argv[process.argv.indexOf(n)+1];
const input=process.argv.includes('--archive')?path.resolve(arg('--archive')):null;
const out=path.resolve(root,'docs/research/mediatheque-preview/2026-10-20');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(root,'.tmp/preview-regression-')),secret='isolated-preview-'+crypto.randomUUID();
const evidence={mode:'ISOLATED_BROWSER_CANONICAL_API',checks:[],errors:[]};
const check=(name,ok)=>{assert.ok(ok,name);evidence.checks.push(name);};
(async()=>{
 const child=spawn(process.execPath,['-e',SMOKE_SERVER_BOOTSTRAP],{cwd:root,windowsHide:true,env:{...smokeServerEnv(temp,0),AUTH_BOOTSTRAP_SECRET:secret},stdio:['ignore','ignore','ignore','ipc']});
 let browser,db;
 try{
  const port=await waitForSmokeServer(child),base='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){try{if((await(await fetch(base+'/healthz')).json()).db?.ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:900}}),page=await context.newPage();
  page.on('pageerror',e=>evidence.errors.push(e.message));await page.goto(base+'/mediatheque.html');
  const owner=await page.evaluate(async secret=>{
   const data=await(await fetch('/api/auth/bootstrap-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret})})).json();
   if(!data.ok)throw Error('bootstrap failed');localStorage.setItem('cloud.csrf',data.csrf);return (await(await fetch('/api/auth/me')).json()).user;
  },secret);
  const sqlite=require('sqlite3');db=new sqlite.Database(path.join(temp,'app.db'));
  const {createPublicationRepo}=require('../../db/publicationRepo'),repo=createPublicationRepo({db,dataDir:temp}),actor={id:owner.id,role:owner.role};
  const category='preview-test-channel',slug='media-'+crypto.createHash('sha256').update(category).digest('hex').slice(0,20),opts=n=>({idempotencyKey:'preview-'+n});
  const corpus=await repo.createCorpus(actor,{slug,title:'Тестовый канал'},opts('create'));
  const snapshot={library:{texts:[{text_key:'large',rows:[{order_index:0,hebrew_plain:'שלום',translit:'x'.repeat(720000)}]}],audio_assets:[]}};
  const copied=await repo.copyMyTextItems(actor,corpus.corpus_id,{expectedVersion:1,items:Array.from({length:25},(_,i)=>({sourceWorkId:'large-'+i,title:'Existing '+i,expectedAudioCount:0,snapshot}))},opts('copy'));
  await repo.recordMaterialRights(actor,corpus.corpus_id,{itemIds:copied.items.map(i=>i.item_id),expectedVersion:copied.draft_version,preset:{public_read_allowed:true,public_stream_allowed:true,package_download_allowed:false,basis:'OWNER_ATTESTATION_MEDIA_2026_10_20',asserted_at:'2026-10-20'}},opts('rights'));
  await page.evaluate(async category=>{
   const C=window.MediathequeCore,d=await(await fetch('/api/publication/mediatheque')).json();
   let structure=C.command(d.structure,{type:'category.create',id:category,title:'Тестовый канал'});
   structure=C.command(structure,{type:'collection.create',id:'preview-series',title:'Тестовая подборка',categoryId:category});
   const r=await fetch('/api/publication/mediatheque/draft',{method:'POST',headers:{'Content-Type':'application/json','X-LP-CSRF':localStorage.getItem('cloud.csrf'),'X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({structure,expectedVersion:d.revision})});if(!r.ok)throw Error('fixture structure failed');
  },category);
  let file=input;
  if(!file){
   const fixture=require('../../tests/helpers/mediathequeArchiveFixture.cjs')(),P=require('../../public/js/playback-source'),Core=require('../../public/js/portable-learning-package-core'),Portable=require('../../public/js/studio-portable-learning-package');
   fixture.playback_source=P.append(null,{url:'https://youtu.be/HRGrOjl4P9k'});file=path.join(temp,'fixture.zip');fs.writeFileSync(file,await Portable.zipFiles(await Core.buildPackageFiles(fixture,{mode:'snapshot'}),'nodebuffer'));
  }
  const before=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  await page.reload();await page.locator('[data-action=publish-material]').click();await page.locator('[name=archive]').setInputFiles(file);
  await page.locator('[name=youtube]').fill('https://youtu.be/HRGrOjl4P9k');await page.locator('#ml-form button[type=submit]').click();await page.locator('[name=title]').waitFor();
  await page.locator('[name=title]').fill('Хаммам, серия 3 — проверка предпросмотра');await page.locator('[name=category]').selectOption(category);await page.locator('[name=collection]').selectOption('preview-series');await page.locator('[name=rights]').check();
  let release;const paused=new Promise(r=>release=r);let held=true;
  await page.route('**/api/publication/corpora/'+corpus.corpus_id,async route=>{if(held){held=false;await paused;}await route.continue();});
  await page.locator('#ml-form button[type=submit]').click();await page.locator('#ml-form[aria-busy=true]').waitFor();
  check('busy label is visible and submit cannot be repeated',await page.locator('#ml-form button[type=submit]').isDisabled()&&(await page.locator('#ml-form button[type=submit]').innerText())==='Выполняется…');
  for(const [locale,width] of [['ru',1366],['ru',380],['he',380]]){
   await page.setViewportSize({width,height:900});await page.evaluate(l=>window.appSetLocale(l),locale);
   check(locale+' '+width+' dialog fits',await page.locator('#ml-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   await page.locator('#ml-form button[type=submit]').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,'busy-'+locale+'-'+width+'.png')});
  }
  release();const start=Date.now();await page.locator('.ml-publisher-steps li[aria-current=step]').filter({hasText:'3'}).waitFor({timeout:30000});
  evidence.previewMs=Date.now()-start;
  check('actual archive reaches material preview beside 25 large materials',!(await page.locator('#ml-form-error').isVisible()));
  const response=await context.request.get(base+'/api/publication/corpora/'+corpus.corpus_id),body=await response.body(),detail=JSON.parse(body).corpus;
  evidence.detailBytes=body.length;evidence.items=detail.items.length;evidence.archiveSha256=before;
  check('metadata response stays below 100 KB for 26 items',body.length<100000&&detail.items.length===26&&detail.items.every(i=>!('snapshot_json'in i)));
  check('source archive remains byte-identical',before===crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  await page.screenshot({path:path.join(out,'material-preview.png')});
  check('preview does not publish a corpus',!(await repo.listPublicCorpora()).length);
  check('no browser errors',!evidence.errors.length);evidence.status='PASS';
 }catch(e){evidence.status='FAIL';evidence.error=e.stack;throw e;}
 finally{fs.writeFileSync(path.join(out,'browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');if(db)await new Promise(r=>db.close(r));if(browser)await browser.close();child.kill();}
 console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e);process.exitCode=1;});
