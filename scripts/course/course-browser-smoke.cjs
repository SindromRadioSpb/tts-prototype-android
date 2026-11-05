'use strict';
// Hermetic P3 browser acceptance: isolated server/database, real owner login, no paid/external traffic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const {smokeServerEnv,SMOKE_SERVER_BOOTSTRAP,waitForSmokeServer,waitForSmokeHealth}=require('../smoke-server-env');
const {buildCourseData}=require('./build-course-data.cjs');
const root=path.resolve(__dirname,'../..');
const out=path.resolve(process.argv[2]||path.join(root,'.tmp/course-smoke'));
const dbUrl=fs.readFileSync(path.join(root,'public/js/library-ui.js'),'utf8').match(/from '(\/db\/local-db\.js\?v=[^']+)'/)[1];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function counts(page){
 return page.evaluate(async dbUrl=>{const db=await import(dbUrl);const one=async t=>Number((await db.dbQuery('SELECT COUNT(*) n FROM '+t))[0].n);return {texts:await one('texts'),review_log:await one('review_log')};},dbUrl);
}
async function saved(page){return page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('lp.course.')&&k.endsWith('.ulpan.v1')).map(k=>JSON.parse(localStorage.getItem(k)))[0]);}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const dataParent=path.join(root,'.tmp/course-smoke-data');fs.mkdirSync(dataParent,{recursive:true});
 const data=fs.mkdtempSync(path.join(dataParent,'run-')),source=path.join(data,'source');
 fs.cpSync(path.join(root,'tests/fixtures/course/mini'),source,{recursive:true});
 const course=JSON.parse(fs.readFileSync(path.join(source,'course.json'),'utf8'));course.id='ulpan';fs.writeFileSync(path.join(source,'course.json'),JSON.stringify(course));
 buildCourseData(source,path.join(data,'course'));
 const secret='course-smoke-disposable-owner-0123456789';
 const child=spawn(process.execPath,['-e',SMOKE_SERVER_BOOTSTRAP],{cwd:root,env:{...smokeServerEnv(data,0),AUTH_BOOTSTRAP_SECRET:secret,TTS_ENABLED:'false'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 console.log(JSON.stringify({serverPid:child.pid,data,out}));
 let logs='',browser;child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 const report={data,results:[],scope:'isolated actual server and browser; no production or paid requests'};
 try{
  const port=await waitForSmokeServer(child,30000),base='http://127.0.0.1:'+port;report.base=base;await waitForSmokeHealth(base,{timeoutMs:60000});
  browser=await chromium.launch({headless:true});
  for(const [lang,width] of [['ru',390],['ru',1440],['he',380],['en',1440]]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.addInitScript(()=>{localStorage.setItem('lp_world_v1',JSON.stringify({id:'classic'}));localStorage.setItem('room.niqqudMode','off');});
   await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base?route.continue():route.abort();});
   const login=await context.request.post(base+'/api/auth/bootstrap-login',{data:{secret}});assert.equal(login.status(),200);const who=await login.json();
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(base+'/library.html#room=atlas%3Aa97002',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.corpus-switch-pill',{timeout:60000});
    await page.locator('select').filter({has:page.locator('option[value="he"]')}).first().selectOption(lang);
    await page.locator('.corpus-switch-pill').click();
    await page.locator('.corpus-switch-menu [data-corpus="course:ulpan"]').click();
    await page.waitForSelector('[data-course-lesson]',{timeout:30000});
    assert.equal(await page.locator('[data-course-lesson]').count(),2);
    await page.evaluate(async()=>{if(window.LPWorld)await window.LPWorld.set(null);});
    await page.screenshot({path:path.join(out,`${lang}-${width}-home.png`),fullPage:true});
    const before=await counts(page);
    await page.locator('[data-course-lesson="L001-cafe"]').click();
    await page.waitForSelector('.course-line .rm-w');
    assert.equal(await page.locator('.course-line').count(),8);
    assert.equal(await page.locator('.course-line [data-col=ru]:visible').count(),0);
    assert.match(await page.locator('.course-line [data-col=he]').first().textContent(),/[\u0591-\u05BD\u05BF-\u05C7]/,'lesson default must ignore Room off');
    await page.locator('[data-course-niqqud-override]').selectOption('never');
    assert.doesNotMatch(await page.locator('.course-line [data-col=he]').first().textContent(),/[\u0591-\u05BD\u05BF-\u05C7]/);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.course-line .rm-w');
    assert.equal(await page.locator('[data-course-niqqud-override]').inputValue(),'never');
    await page.locator('[data-course-niqqud-override]').selectOption('lesson');
    await page.waitForSelector('.course-line .rm-w');
    await page.screenshot({path:path.join(out,`${lang}-${width}-scene.png`),fullPage:true});
    await page.route('**/lessons/L001-cafe.json',async route=>{const response=await route.fetch();const lesson=await response.json();lesson.niqqud='tap';await route.fulfill({response,json:lesson});});
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.course-line .rm-w');
    assert.doesNotMatch(await page.locator('.course-line [data-col=he]').first().textContent(),/[\u0591-\u05BD\u05BF-\u05C7]/);
    await page.locator('.course-line .rm-w').first().click();
    assert.match(await page.locator('.course-line [data-col=he]').first().textContent(),/[\u0591-\u05BD\u05BF-\u05C7]/);
    assert.equal(await page.locator('.rm-sheet').count(),0);
    await page.locator('.course-line .rm-w').first().click();
    await page.waitForSelector('.rm-sheet');
    await page.locator('.rm-sheet-x').click();
    await page.unroute('**/lessons/L001-cafe.json');
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.course-line .rm-w');
    await page.locator('[data-course-next]').click();
    await page.waitForSelector('[data-course-task="6"]');
    const direct=page.url();assert.match(direct,/les=L001-cafe/);assert.match(direct,/st=1/);
    const input=page.locator('[data-course-input]');await input.fill('תֵּה בְּלִי סֻכָּר');await page.locator('[data-course-check]').click();
    assert.equal((await saved(page)).attempts.length,1);
    assert.equal((await saved(page)).attempts[0].kind,'accepted');
    await page.locator('[data-course-model]').click();await pause(1050);await page.locator('[data-course-check]').click();
    assert.equal((await saved(page)).attempts.at(-1).aids.model,true);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-course-input]');
    assert.equal(await page.locator('[data-course-input]').inputValue(),'תֵּה בְּלִי סֻכָּר');assert.equal(await page.locator('[data-course-model]').getAttribute('aria-expanded'),'true');
    await page.locator('[data-course-input]').fill('тэ');await page.locator('[data-course-check]').click();await page.locator('[data-course-self]').click();
    assert.equal(await page.locator('[data-course-self]').count(),0);
    assert.equal((await saved(page)).attempts.at(-1).channel,'self');assert.equal(await page.locator('[data-course-next]').isEnabled(),true);
    await page.locator('[data-course-keyboard-toggle]').click();
    await page.locator('[data-course-input]').fill('תהסוכר');await page.locator('[data-course-input]').evaluate(n=>{n.focus();n.setSelectionRange(2,2);});
    await page.locator('[data-course-keyboard] button').filter({hasText:/^ב$/}).click();
    assert.equal(await page.locator('[data-course-input]').inputValue(),'תהבסוכר');
    assert.equal(await page.locator('[data-course-input]').evaluate(n=>n.selectionStart),3);
    const keyboardRows=await page.locator('.course-keyboard-row').evaluateAll(rows=>rows.map(r=>({tops:[...new Set([...r.children].map(n=>Math.round(n.getBoundingClientRect().top)))],heights:[...r.children].map(n=>n.getBoundingClientRect().height)})));
    for(const row of keyboardRows){assert.equal(row.tops.length,1);assert.ok(row.heights.every(h=>h>=44));}
    await page.screenshot({path:path.join(out,`${lang}-${width}-task.png`),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=1,'overflow '+overflow);
    const after=await counts(page);assert.deepEqual(after,before,'course/card must not write materials or review log');
    await page.locator('[data-course-next]').click();await page.waitForSelector('[data-course-task="9"]');
    await page.goBack();await page.waitForSelector('[data-course-lesson]',{timeout:15000});
    assert.deepEqual(errors,[]);
    report.results.push({lang,width,owner:who.user.role,history:true,reload:true,unknownSelf:true,wordCard:true,caret:true,lessonNiqqud:true,overridePersistence:true,tapMorphology:true,overflow,before,after,pageerrors:errors});
   }catch(e){await page.screenshot({path:path.join(out,`${lang}-${width}-failure.png`),fullPage:true}).catch(()=>{});throw e;}
   finally{await context.close();}
  }
  const anon=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});await anon.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const p=await anon.newPage();
  await p.goto(base+'/library.html#room=course%3Aulpan',{waitUntil:'domcontentloaded'});await p.waitForSelector('[data-course-lesson]');
  assert.equal(await p.locator('[data-course-lesson]').count(),2);await p.locator('.corpus-switch-pill').click();assert.equal(await p.locator('[data-corpus="course:ulpan"]').count(),1);await p.locator('.corpus-switch-pill').click();await p.locator('[data-course-lesson="L001-cafe"]').click();await p.waitForSelector('.course-line .rm-w');await p.reload();await p.waitForSelector('.course-line .rm-w');report.nonOwner={anonymous:true,visible:true,directRoute:true,lessonReload:true};await anon.close();
  report.ok=true;
 }catch(e){report.ok=false;report.error=e.stack;throw e;}
 finally{if(browser)await browser.close();child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),pause(5000)]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(data,'server.log'),logs);}
 console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
