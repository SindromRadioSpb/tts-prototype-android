// Real Studio/Room, isolated synthetic IDB profile, static local assets only.
// No provider calls, server mutations, or owner learner data.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../public');
const engine = process.env.MULTITAB_ENGINE || 'webkit';
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Isolated lifecycle fixture</title>'); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[engine].launch();
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: Number(process.env.STUDIO_WIDTH || 380), height: 844 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const watchdog = setTimeout(() => { console.error('FAIL: lifecycle gate exceeded 120s'); void browser.close(); }, 120000);
  try {
    await page.goto(base + '/fixture');
    await page.evaluate(async () => {
      localStorage.setItem('opfsVfsPreference_v1', 'tts-opfs-idb');
      const db = await import('/db/local-db.js');
      await db.initLocalDB();
      for (let i = 0; i < 20; i++) {
        await db.createText({ id: `lifecycle-${i}`, text_key: `lifecycle-${i}`, title: `Lifecycle fixture ${i}`, source_text: 'שלום' });
        await db.addSentence(`lifecycle-${i}`, { id: `lifecycle-row-${i}`, he_plain: 'שלום', ru: 'Привет' });
      }
      await db.dbRun("INSERT INTO word_status(lemma_key,status,updated_at) VALUES('שלום','learning','2026-09-14')");
      await db.dbRun("INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,meta_json) VALUES('lifecycle-review','lemma:שלום','review','2026-09-14',3,'fixture','{}')");
      await db.closeLocalDB();
    });
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.refreshStudioReviewStatus === 'function' && !!window.__localDB);
    const reviewBefore = await page.evaluate(async () => {
      await window.__localDBInitPromise;
      return __localDB.dbQuery('SELECT * FROM review_log ORDER BY id');
    });
    for (let i = 0; i < 5; i++) {
      await page.evaluate(locale => window.appSetLocale(locale), ['ru', 'en', 'he', 'ru', 'ru'][i]);
      await page.evaluate(async () => {
        await Promise.all([refreshStudioReviewStatus(), v3LibraryOpen(), ...Array.from({length: 20}, () => __localDB.dbQuery('SELECT COUNT(*) AS n FROM texts'))]);
      });
      await page.waitForFunction(() => document.querySelector('#v3LibraryList')?.textContent.includes('Lifecycle fixture'));
      assert.match(await page.locator('[data-studio-due]').first().textContent(), /^\d+$/);
      assert.match(await page.locator('[data-studio-progress]').first().textContent(), /^\d+$/);
      await page.evaluate(() => window.applyI18n());
      assert.notEqual(await page.locator('#studioReviewState').getAttribute('data-i18n'), 'studioReview.loading');
      assert.doesNotMatch(await page.locator('#studioReviewState').textContent(), /Загрузка|Loading/);
    }
    await page.evaluate(() => { void v3NavAwayWithDbClose('/library.html'); });
    await page.waitForURL('**/library.html');
    // The Room's actual import (including its release URL), not another module instance.
    await page.waitForFunction(() => document.body.textContent.includes('Читальный зал'));
    const info = await page.evaluate(async () => {
      const source = await (await fetch('/js/library-ui.js')).text();
      const url = source.match(/from ['"]([^'"]*local-db\.js[^'"]*)['"]/)[1];
      const db = await import(url);
      await db.initLocalDB();
      return { texts: await db.dbQuery("SELECT id FROM texts WHERE id LIKE 'lifecycle-%'"),
        reviews: await db.dbQuery('SELECT * FROM review_log ORDER BY id'), integrity: await db.dbQuery('PRAGMA integrity_check') };
    });
    assert.equal(info.texts.length, 20);
    assert.deepEqual(info.reviews, reviewBefore);
    assert.deepEqual(info.integrity, [{ integrity_check: 'ok' }]);
    console.log(JSON.stringify({ engine, result: 'PASS', studioLibraryCycles: 5, queuedReads: 100, numericReviewCounters: true, studioToRoom: true, reviewLogUnchanged: true }));
  } finally { clearTimeout(watchdog); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
