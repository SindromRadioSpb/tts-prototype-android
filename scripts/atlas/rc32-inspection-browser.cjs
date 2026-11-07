'use strict';
// Anonymous disposable profile; dictionary inspection only. No owner credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const {chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const [data,outArg,live]=process.argv.slice(2),out=path.resolve(outArg),root=path.resolve(__dirname,'../..');fs.mkdirSync(out,{recursive:true});
let child,browser;
(async()=>{const report={scope:'GET/HEAD only, anonymous disposable persistent Chromium; no owner data',checks:[],errors:[]};try{
 let base=live;
 if(!base){child=fork('-e',[SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:smokeServerEnv(path.resolve(data),0),silent:true,windowsHide:true});base='http://127.0.0.1:'+await waitForSmokeServer(child,60000);}
 await waitForSmokeHealth(base,{timeoutMs:60000});report.origin=base;
 browser=await chromium.launchPersistentContext(path.join(out,'synthetic-profile'),{headless:true,serviceWorkers:'block',viewport:{width:380,height:1000}});
 await browser.route('**/*',route=>route.request().url().startsWith(base)&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
 const page=await browser.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>report.errors.push(e.message));
 const url=id=>base+'/study-library.html#room=atlas%3A'+id+'&sec=s16-mechanical-properties&pg=124';
 const target='#atlas-p124 [data-ref$=":b002"] [data-col="niqqud"] .rm-w';
 await page.goto(url('a97001rc32'),{waitUntil:'domcontentloaded'});await page.locator(target).first().waitFor();
 const state=()=>page.evaluate(async()=>({words:await __localDB.dbQuery('SELECT COUNT(*) AS n FROM word_status',[]),reviews:await __localDB.dbQuery('SELECT COUNT(*) AS n FROM review_log',[])}));
 const before=await state();
 const noWriters=async()=>assert.equal(await page.locator('.rm-sheet [data-rm-status],.rm-sheet [data-rm-save],.rm-sheet [data-rm-enroll],.rm-sheet [data-rm-recall-grade],.rm-sheet [data-rm-surface-action]').count(),0);
 await page.locator(target).first().click();await page.locator('.rm-acc-conj').waitFor();await noWriters();
 await page.locator('.rm-sheet details').filter({has:page.locator('.rm-rootfam')}).locator('summary').click();
 await page.locator('.rm-rootfam-chip').first().click();await page.locator('.rm-back').waitFor();await noWriters();await page.locator('.rm-back').click();await noWriters();
 report.checks.push('root-family child card and Back retain inspection-only actions');await page.keyboard.press('Escape');
 await page.getByRole('combobox',{name:'Язык / Language / שפה'}).selectOption('he');await page.waitForFunction(()=>document.documentElement.dir==='rtl');
 await page.goto(url('a97001rc32'),{waitUntil:'domcontentloaded'});await page.locator(target).first().click();await page.locator('.rm-acc-conj').waitFor();await page.locator('.rm-acc-conj summary').click();await page.locator('.rm-conj-body .v3-conj-cell').first().waitFor();await noWriters();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,'morph-p124-he-380.png')});
 report.checks.push('Hebrew RTL 380px: dictionary, root and Pealim forms render without viewport overflow');await page.keyboard.press('Escape');
 await page.goto(url('a97001'),{waitUntil:'domcontentloaded'});await page.locator(target).first().click();await page.locator('.rm-sheet [data-rm-status]').first().waitFor();
 report.checks.push('original corpus retains its existing card actions after leaving RC3.2');
 assert.deepEqual(await state(),before);report.learner_counts_unchanged=true;assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(e){report.status='failed';report.errors.push(e.stack);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(browser)await browser.close();if(child)child.kill();}})();
