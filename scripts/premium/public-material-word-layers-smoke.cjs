'use strict';
// The owner's two public URLs, with their real publication/evidence pipeline.
// Disposable profile; same-origin GET/HEAD only. Never uses the owner profile.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const { createHash } = require('node:crypto');
const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const base = arg('base') || 'https://linguistpro.kolosei.com', version = arg('version');
const candidate = process.argv.includes('--candidate'), root = path.resolve(__dirname, '../..');
const out = path.resolve(arg('out') || '.tmp/reader-performance/public-word-layers.json');
const materials = [
 { name: 'Hamam', rows: 499, url: '/library.html?public_corpus=media-8c30cc63a5e5e39a0acd&public_work=work-830a3ab937fc3c3f70c60533#room=public%3Amedia-8c30cc63a5e5e39a0acd&sort=position&scope=all&rv=2' },
 { name: 'Ben-Yehuda 66120', rows: 34, url: '/library.html?corpus_work=66120#room=benyehuda&mode=explore&sort=ready&scope=corpus&readyOnly=0&hasAudio=0&reviewed=0&aiContext=0&exactForm=0&rv=2' },
];
(async () => {
 assert.ok(version, '--version is required');
 assert.equal((await (await fetch(base + '/api/client-config?verify=' + Date.now())).json()).version, version);
 const report = { checkedAtUtc: new Date().toISOString(), version, candidate, scope: 'Actual public GETs and saved evidence in disposable Chromium. Empty-profile import, no owner data, no paid generation. Not an owner cache/startup comparison.', cases: [] };
 const files = ['js/library-ui.js', 'js/reader-morph.js', 'js/word-gloss.js', 'js/word-gloss-ai.js', 'css/reader-morph.css'];
 const sources = new Map(candidate ? files.map(file => [file, fs.readFileSync(path.join(root, 'public', file), 'utf8').replace(/\r\n/g, '\n')]) : []);
 if (candidate) report.candidateHashes = Object.fromEntries([...sources].map(([file, body]) => [file, createHash('sha256').update(body).digest('hex')]));
 const browser = await chromium.launch({ headless: true });
 try {
  for (const material of materials) {
   const result = { name: material.name, errors: [], deniedWrites: [] }; report.cases.push(result);
   const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
   await context.addInitScript(() => {
    localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1');
    localStorage.setItem('room.wordGloss', '1'); localStorage.setItem('room.wordStatus', '1'); localStorage.setItem('room.wordGlossAi', '0'); localStorage.setItem('room.wordRibbon', '0');
   });
   await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) result.deniedWrites.push({ path: url.pathname, method: req.method() });
    if (url.origin !== base || !['GET', 'HEAD'].includes(req.method())) return route.abort();
    const body = sources.get(url.pathname.slice(1));
    if (body) { const response = await route.fetch(); return route.fulfill({ response, body }); }
    return route.continue();
   });
   const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', error => result.errors.push(error.message));
   try {
    const started = Date.now();
    await page.goto(base + material.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(count => document.querySelectorAll('#roomReaderTable #proTable tbody tr').length === count &&
     !!document.querySelector('#roomReaderTable .rm-w[data-gloss]') && !!document.querySelector('.rm-context-coverage:not([hidden])'), material.rows);
    result.glossReadyFromNavigationMs = Date.now() - started;
    await page.waitForFunction(() => !!document.querySelector('#roomReaderTable .rm-w-unassessed, #roomReaderTable .rm-w-known, #roomReaderTable .rm-w-l1'));
    result.layers = await page.evaluate(() => {
     const mount = document.getElementById('roomReaderTable'), words = [...mount.querySelectorAll('.rm-w[data-gloss]')], sources = {};
     for (const word of words) sources[word.dataset.glossSource] = (sources[word.dataset.glossSource] || 0) + 1;
     return { title: document.title, url: location.pathname + location.search, rows: mount.querySelectorAll('#proTable tbody tr').length,
      wordsWithGloss: words.length, bySource: sources, pendingRows: mount.querySelectorAll('tr.rm-gloss-pending').length,
      coverage: document.querySelector('.rm-context-coverage')?.textContent };
    });
    assert.ok(result.layers.wordsWithGloss > 0); assert.ok(result.layers.pendingRows > 0);
    assert.ok(result.layers.title.includes(material.name === 'Hamam' ? 'Хаммам' : 'מדבריו'), 'Selected material identity');
    if (material.name === 'Hamam') assert.ok((result.layers.bySource.ai || 0) + (result.layers.bySource.user || 0) > 0, 'Published saved context is restored on first import');
    const later = Math.floor(material.rows * 0.7);
    const row = page.locator('#roomReaderTable tr[data-row-idx="' + later + '"]');
    await row.locator('.rm-w[data-gloss]').first().evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForFunction(later => !document.querySelector('#roomReaderTable tr[data-row-idx="' + later + '"]').classList.contains('rm-gloss-pending'), later);
    const word = row.locator('.rm-w[data-gloss]').first(), clickedGloss = await word.getAttribute('data-gloss'); await word.click();
    await page.waitForSelector('.rm-sheet.rm-open');
    await page.waitForFunction(() => !!document.querySelector('.rm-sheet.rm-open .rm-current-reading'));
    result.wordCard = true; result.wordCardGlossMatches = (await page.locator('.rm-sheet.rm-open .rm-current-reading').textContent()).includes(clickedGloss);
    assert.equal(result.wordCardGlossMatches, true, 'Card retains this exact occurrence context');
    await page.locator('.rm-sheet.rm-open .rm-sheet-x').click();
    result.reviewRows = await page.evaluate(async () => {
     const db = await import('/db/local-db.js?v=815'); return (await db.dbQuery('SELECT COUNT(*) n FROM review_log'))[0].n;
    });
    assert.equal(result.reviewRows, 0); assert.deepEqual(result.deniedWrites, []); assert.deepEqual(result.errors, []);
    result.result = 'PASS'; console.log(JSON.stringify(result));
   } catch (error) {
    result.result = 'FAIL'; result.failure = error.stack;
    result.diagnostic = await page.evaluate(() => ({ title: document.title, url: location.href, rows: document.querySelectorAll('#roomReaderTable tbody tr').length,
     words: document.querySelectorAll('#roomReaderTable .rm-w').length, glosses: document.querySelectorAll('#roomReaderTable .rm-w[data-gloss]').length, coverage: document.querySelector('.rm-context-coverage')?.textContent, openCard: !!document.querySelector('.rm-sheet.rm-open') })).catch(() => null);
    throw error;
   } finally { await context.close(); }
  }
  report.result = 'PASS';
 } finally { await browser.close(); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
})().catch(error => { console.error(error); process.exitCode = 1; });
