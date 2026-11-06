'use strict';
// Anonymous, isolated profile; no account or paid-provider requests.
// Usage: node scripts/atlas/atlas-mobile-memory-smoke.cjs [--baseline] [--live] [--webkit]
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const baseline = process.argv.includes('--baseline');
const live = process.argv.includes('--live');
const engine = process.argv.includes('--webkit') ? webkit : chromium;
(async () => {
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/canon|import failed/i.test(m.text())) console.log(m.text().slice(0,500)); });
  page.on('request', r => requests.push(r.url()));
  if (!baseline && !live) for (const file of ['atlas-reader.js', 'library-ui.js']) {
    await page.route('**/js/' + file + '?*', route => route.fulfill({ path: path.join(root, 'public/js', file), contentType: 'text/javascript' }));
  }
  const stats = () => page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.atlas-section img')].filter(i => i.hasAttribute('src'));
    return { imagesWithSource: imgs.length, decodedRGBABytes: imgs.reduce((n, i) => n + i.naturalWidth * i.naturalHeight * 4, 0), nodes: document.querySelectorAll('*').length, heap: performance.memory?.usedJSHeapSize || null };
  });
  try {
    const start = Date.now();
    await page.goto('https://linguistpro.kolosei.com/library.html#room=atlas%3Aa97001');
    await page.waitForSelector('.atlas-home', { timeout: 120000 });
    console.log('home loaded');
    const homeMs = Date.now() - start;
    if (!baseline) assert(!requests.some(u => /canon-v\d+\.zip/.test(u)), 'atlas cold open must not unpack the unrelated canon');
    await page.locator('[data-section="s17-steels"]').click();
    await page.waitForSelector('#atlas-p154');
    const measurements = [];
    for (let n = 154; n <= 191; n++) {
      await page.locator('#atlas-p' + n).evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(400);
      measurements.push({ page: n, ...await stats() });
      if (n % 10 === 0) console.log('read page', n);
    }
    if (!baseline) assert(Math.max(...measurements.map(x => x.imagesWithSource)) < 20, 'image sources must stay bounded after traversing all 38 pages');
    // A jump back reloads an evicted scan without changing the URL or page content.
    await page.locator('.atlas-pagejump input').fill('157');
    await page.locator('.atlas-pagejump').evaluate(f => f.requestSubmit());
    await page.locator('#atlas-p157 .atlas-thumb img').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#atlas-p157 .atlas-thumb img')?.naturalWidth > 0);
    assert(await page.locator('#atlas-p157 .atlas-table').count());
    const word = page.locator('#atlas-p157 .rm-w:visible').first();
    await word.click();
    await page.waitForSelector('.rm-sheet.rm-open');
    await page.keyboard.press('Escape');
    // Dedicated print renderer retains all figures, including off-screen ones.
    const print = await page.evaluate(async () => {
      const d = await (await fetch('/data/atlas/a97001/sections/s17-steels.json')).json();
      const clear = AtlasReader.preparePrint(document, d);
      const r = { sheets: document.querySelectorAll('.atlas-psheet').length, images: document.querySelectorAll('.atlas-print-root img[src]').length };
      clear(); return r;
    });
    assert.equal(print.sheets, 38);
    await page.locator('.atlas-back').click();
    await page.waitForSelector('.atlas-home');
    // The deferred canon remains available on explicit shelf navigation.
    await page.locator('#tabAccessible').click();
    await page.waitForFunction(() => document.querySelector('.shelf, .shelf-section, .work-card'), null, { timeout: 120000 });
    assert(requests.some(u => /canon-v\d+\.zip/.test(u)), 'canon shelf must still import on demand');
    assert.deepEqual(errors, []);
    const result = { baseline, live, engine: engine.name(), homeMs, coldCanonImported: baseline, measurements, print, errors };
    const dir = path.join(root, 'docs/research/engineering-atlas/2026-11-06-mobile-memory');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, (baseline ? 'baseline' : live ? 'production' : 'candidate') + '-' + engine.name() + '.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ baseline, live, engine: engine.name(), homeMs, peakSources: Math.max(...measurements.map(x => x.imagesWithSource)), peakRGBA: Math.max(...measurements.map(x => x.decodedRGBABytes)), errors }));
  } catch (e) {
    console.log(await page.evaluate(() => ({ url: location.href, y: scrollY, input: document.querySelector('.atlas-pagejump input')?.value, pages: [157,191].map(n => {const p=document.querySelector('#atlas-p'+n),i=p?.querySelector('img');return {n,rect:p?.getBoundingClientRect().toJSON(),img:i?.getBoundingClientRect().toJSON(),style:i?getComputedStyle(i).cssText:null,src:i?.getAttribute('src')};}) })));
    throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
