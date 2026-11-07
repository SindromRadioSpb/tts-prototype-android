'use strict';
// Component interaction test of the actual library-ui.js block; no owner profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../public/js/library-ui.js'),'utf8');
 const code=source.slice(source.indexOf('  // Export is owner-only'),source.indexOf("  if (atlasId === 'a97001' && window.AtlasProgressExport)"));
 assert(code.includes('/material-export'));
 const out=path.join(__dirname,'../../docs/research/atlas-export-ui/2026-11-07');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true}),results=[];
 try {for(const [lang,width,role,ready] of [['ru',380,'owner',true],['he',1280,'owner',true],['ru',380,'owner',false],['ru',380,'member',true]]){
  const page=await browser.newPage({viewport:{width,height:800}});
  await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body><main id="wrap"></main></body>'}));
  await page.goto('https://fixture.test/');
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../../public/i18n/locales/'+lang+'.js'),'utf8')});
  await page.evaluate(({code,role,ready,lang})=>{
   document.documentElement.dir=lang==='he'?'rtl':'ltr';
   window.CloudSync={me:async()=>({user:{role}})};
   window.fetch=async()=>({ok:ready,json:async()=>ready?{ok:true}:{error:'SOURCE_PACKAGE_REQUIRED'}});
   const wrap=document.getElementById('wrap'),token=1,corpusRenderToken=1,atlasId='a97002';
   const tt=key=>key.split('.').reduce((o,k)=>o[k],window.I18N_LOCALES[lang]);
   const el=(tag,a)=>{const e=document.createElement(tag);if(a.text)e.textContent=a.text;if(a.class)e.className=a.class;return e;};
   eval(code);
  },{code,role,ready,lang});
  if(role==='owner'){
   await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent && !document.querySelector('[role=status]').textContent.includes('…'));
   assert.equal(await page.locator('.atlas-material-export a').count(),ready?1:0);
   if(ready)assert.match(await page.locator('.atlas-material-export a').getAttribute('href'),/a97002\/material-export.zip$/);
   await page.screenshot({path:path.join(out,lang+'-'+width+'-'+ready+'.png')});
  }else {await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));assert.equal(await page.locator('.atlas-material-export').count(),0);}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push({lang,width,role,ready,passed:true});await page.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(out,'component-smoke.json'),JSON.stringify({scope:'actual UI block, mocked session and availability; backend tested separately',results},null,2));console.log('4 component cases passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
