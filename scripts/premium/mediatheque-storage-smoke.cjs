#!/usr/bin/env node
'use strict';
// Real SQLite/OPFS contention in a disposable profile. No owner data is accessed.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..'), BASE = process.env.MEDIATHEQUE_STORAGE_BASE || 'http://127.0.0.1:3347';
const OUT = process.env.MEDIATHEQUE_EVIDENCE_DIR || path.join(ROOT, 'docs/research/mediatheque-iphone-storage/2026-09-12/local');
const TEMP = fs.mkdtempSync(path.join(ROOT, '.tmp/ml-storage-'));
const evidence = { base:BASE,mode: 'real OPFS contention, disposable Chromium profile; not physical iPhone', checks: [],remoteWrites:[] };
const check = (name, ok) => { assert.ok(ok, name); evidence.checks.push(name); console.log('PASS', name); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ready = page => page.locator('#ml-root[aria-busy="false"]').waitFor({ timeout: 60000 });
async function main() {
 fs.mkdirSync(OUT, { recursive: true });
 const server = process.env.MEDIATHEQUE_STORAGE_BASE ? null : spawn(process.execPath, ['server.js'], { cwd: ROOT, windowsHide: true,
  env: { ...process.env, PORT: '3347', BIND_HOST: '127.0.0.1', DATA_DIR: TEMP, DB_PATH: path.join(TEMP, 'app.db') }, stdio: 'ignore' });
 let browser;
 try {
  for (let n=0; n<150; n++) { try { const config=await fetch(BASE+'/api/client-config');if(config.ok) { evidence.version=(await config.json()).version;break; } } catch {} await wait(200); }
  if(process.env.MEDIATHEQUE_STORAGE_BASE) assert.equal(evidence.version,'3.11.524','verify completed target deployment before testing');
  browser = await chromium.launch();
  const monitor=context=>context.on('request',r=>{if(r.method()==='POST'&&/\/api\/(publication|translate|gemini|tts|ingest)/.test(r.url()))evidence.remoteWrites.push(new URL(r.url()).pathname);});
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 380, height: 844 } });
  monitor(context);
  await context.addInitScript(() => {
   const send=Worker.prototype.postMessage;
   Worker.prototype.postMessage=function(message,...args) {
    if(message?.type==='close') sessionStorage.setItem('fixture.closePaths',JSON.stringify([...JSON.parse(sessionStorage.getItem('fixture.closePaths')||'[]'),location.pathname]));
    return send.call(this,message,...args);
   };
  });
  await context.route('**/__storage-holder', r => r.fulfill({ contentType:'text/html', body:'<!doctype html><title>Disposable storage fixture</title>' }));
  const holder = await context.newPage();
  // Emulate an outgoing page whose worker still holds sync handles after its Web Lock ended.
  await holder.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
  await holder.goto(BASE+'/__storage-holder');
  const secondary = await holder.evaluate(async () => {
   localStorage.setItem('opfsVfsPreference_v1','tts-opfs-idb');
   const db = await import('/db/local-db.js?v=520'); await db.initLocalDB();
   await db.createText({id:'secondary-proof',text_key:'secondary-proof',title:'Другая физическая библиотека'});
   const before=await db.dbQuery('SELECT * FROM texts ORDER BY id',[]);
   await db.closeLocalDB();localStorage.setItem('opfsVfsPreference_v1','AccessHandlePool');return before;
  });
  await holder.reload();
  await holder.evaluate(async () => {
   const db = window.fixtureDb = await import('/db/local-db.js?v=520'); await db.initLocalDB();
   await db.dbRun("INSERT INTO texts(id,text_key,title,source_text,created_at,updated_at) VALUES('storage-fixture','storage-fixture','Исходная библиотека','שלום',datetime('now'),datetime('now'))", []);
   await db.dbRun("INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,channel,latency_ms,meta_json) VALUES('storage-proof','lemma:proof','review',datetime('now'),3,'fixture','lab',123,'{}')",[]);
  });
  const original = await holder.evaluate(async()=>({texts:await fixtureDb.dbQuery('SELECT * FROM texts ORDER BY id',[]),reviews:await fixtureDb.dbQuery('SELECT * FROM review_log ORDER BY id',[])}));
  const page = await context.newPage();
  await page.goto(BASE+'/mediatheque.html?space=personal&section=catalog'); await ready(page);
  evidence.blockedText = await page.locator('.ml-banner-error').innerText();
  await page.screenshot({ path:path.join(OUT,'blocked-380.png') });
  check('locked original store never appears as an empty personal library', await page.locator('.ml-item').count()===0 && await page.locator('.ml-banner-error').count()===1);
  await holder.close();
  await page.locator('.ml-banner-error button').click(); await ready(page);
  await page.waitForFunction(() => document.querySelector('.ml-item h3')?.textContent.includes('Исходная библиотека'), null, { timeout:15000 });
  check('Retry reconnects to the original OPFS library after its lock is released', await page.locator('.ml-banner-error').count()===0);
  check('sticky storage identity is preserved', await page.evaluate(()=>localStorage.getItem('opfsVfsPreference_v1'))==='AccessHandlePool');
  const restored = await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');return {texts:await db.dbQuery('SELECT * FROM texts ORDER BY id',[]),reviews:await db.dbQuery('SELECT * FROM review_log ORDER BY id',[])};});
  check('original material and nonempty review log remain byte-equivalent',JSON.stringify(original)===JSON.stringify(restored));
  await page.screenshot({ path:path.join(OUT,'recovered-380.png') });
  for(const lang of ['en','he']) { await page.evaluate(l=>window.appSetLocale(l),lang);await page.screenshot({path:path.join(OUT,'recovered-380-'+lang+'.png')}); }
  await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');await db.closeLocalDB();localStorage.setItem('opfsVfsPreference_v1','tts-opfs-idb');});
  await page.reload();await ready(page);
  const secondaryAfter=await page.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');return db.dbQuery('SELECT * FROM texts ORDER BY id',[]);});
  check('separate IndexedDB library remains byte-equivalent and can still be opened',JSON.stringify(secondary)===JSON.stringify(secondaryAfter));
  await page.locator('.ml-crossnav a[href="/library.html"]').click();
  await page.waitForFunction(()=>window.__localDB?.isReady(),null,{timeout:60000});
  await page.locator('.room-mediatheque-entry a').click();await ready(page);
  check('Room and Mediatheque release their connection before cross-navigation',await page.evaluate(()=>{const p=JSON.parse(sessionStorage.getItem('fixture.closePaths'));return p.includes('/mediatheque.html')&&p.includes('/library.html');}));
  check('personal library remains available after Room roundtrip',await page.locator('.ml-banner-error').count()===0);
  // An outgoing OPFS worker releases its handles during the automatic retry window.
  await context.close();
  const transient=await browser.newContext({serviceWorkers:'block'});
  monitor(transient);
  await transient.route('**/__storage-holder',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Transient lock fixture</title>'}));
  const outgoing=await transient.newPage();await outgoing.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
  await outgoing.goto(BASE+'/__storage-holder');await outgoing.evaluate(async()=>{const db=await import('/db/local-db.js?v=520');await db.initLocalDB();await db.createText({id:'transient',text_key:'transient',title:'После перехода'});});
  const incoming=await transient.newPage();let release=null;
  incoming.on('console',msg=>{if(msg.text().includes('AccessHandlePool VFS init failed')&&!release)release=outgoing.close();});
  await incoming.goto(BASE+'/mediatheque.html?space=personal&section=catalog');await ready(incoming);if(release)await release;
  check('real transient OPFS lock heals automatically without a Retry click',!!release&&await incoming.locator('.ml-banner-error').count()===0&&(await incoming.locator('.ml-item h3').innerText()).includes('После перехода'));
  await transient.close();
  check('storage tests perform no remote publication or provider writes',evidence.remoteWrites.length===0);
  evidence.status='PASS';
 } catch(e) { evidence.status='FAIL'; evidence.failure=e.stack; throw e; }
 finally { if(browser) await browser.close(); if(server)server.kill(); fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)); }
}
main().catch(e=>{ console.error(e); process.exitCode=1; });
