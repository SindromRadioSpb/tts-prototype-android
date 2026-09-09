'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=process.env.STUDY_VIDEO_ORIGIN||'http://127.0.0.1:3340';
const output=process.env.CARD_FIX_EVIDENCE||'docs/research/card-media-fixes/2026-09-10/local';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const errors=[];
  try{
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1180,height:900}});
    await context.addInitScript(()=>{for(const key of ['localMode','v3OnboardingSeenV1','onboardingSeen_v1','v3.byokOnboardingDismissed','v3.byokTourCompleted'])localStorage.setItem(key,'1');});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof ensureLocalDB==='function'&&!!window.StudyVideoSourceUI);
    const before=await page.evaluate(async()=>{
      const db=await ensureLocalDB();appSetLocale('ru');
      await db.createText({id:'archive-check',text_key:'archive-check-key',title:'Возврат учебной карточки',source_text:'שלום עולם'});
      await db.addSentences('archive-check',[{id:'archive-check-row',he_plain:'שלום עולם',ru:'Привет, мир'}]);
      v3LibraryOpen();await v3LibraryRefresh();
      return {rows:await db.getSentences('archive-check'),reviews:await db.dbQuery('SELECT * FROM review_log')};
    });
    const card=page.locator('#v3LibraryList .v3-lib-card[data-text-id="archive-check"]');
    await card.locator('[data-act="archive"]').click();
    await page.waitForFunction(async()=>!!(await __localDB.getTextById('archive-check')).is_archived);
    await page.getByRole('button',{name:'Вернуть из архива',exact:true}).click();
    await card.waitFor({state:'visible'});
    assert.equal(await page.evaluate(async()=>(await __localDB.getTextById('archive-check')).is_archived),0);
    await card.locator('[data-act="archive"]').click();
    await card.waitFor({state:'detached'});
    await page.locator('#v3LibraryIncludeArchived').check();
    await card.waitFor({state:'visible'});
    assert.equal(await card.locator('[data-act="archive"]').textContent(),'Вернуть из архива');
    fs.mkdirSync(output,{recursive:true});
    for(const lang of ['ru','he']){
      await page.evaluate(async lang=>{appSetLocale(lang);await v3LibraryRefresh();},lang);
      await page.setViewportSize({width:380,height:844});
      await card.waitFor({state:'visible'});
      await page.screenshot({path:path.join(output,'archive-'+lang+'-380.png')});
      const geometry=await page.locator('#v3LibraryIncludeArchived').evaluate(el=>({width:el.getBoundingClientRect().width,display:getComputedStyle(el).display}));
      assert.ok(geometry.width>0&&geometry.width<40,JSON.stringify(geometry));
    }
    await card.locator('[data-act="archive"]').click();
    await page.waitForFunction(async()=>!(await __localDB.getTextById('archive-check')).is_archived);
    await page.locator('#v3LibraryIncludeArchived').uncheck();
    await card.waitFor({state:'visible'});
    const after=await page.evaluate(async()=>({rows:await __localDB.getSentences('archive-check'),reviews:await __localDB.dbQuery('SELECT * FROM review_log')}));
    assert.deepEqual(after,before);
    assert.deepEqual(errors,[]);
    const evidence={ok:true,immediateUndo:true,archiveFilter:true,restore:true,rowsAndReviewsUnchanged:true,mobile:['ru','he'],errors};
    fs.writeFileSync(path.join(output,'archive.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
