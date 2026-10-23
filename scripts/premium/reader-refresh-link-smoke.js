'use strict';
// Anonymous production GETs in disposable Chromium; never uses the owner profile.
// --candidate substitutes only the local Reader module. --expect-bug reproduces 813.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const candidate = process.argv.includes('--candidate');
const expectBug = process.argv.includes('--expect-bug');
const base = 'https://linguistpro.kolosei.com';
const work = 'work-830a3ab937fc3c3f70c60533';
const target = base + '/library.html?public_corpus=media-8c30cc63a5e5e39a0acd&public_work=' + work;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const evidence = { candidate, expectBug, scope: 'Disposable anonymous Chromium; public GETs only', checkpoints: [] };
  let page;
  const responses = [], warnings = [];
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin !== base || !['GET', 'HEAD'].includes(request.method())) return route.abort();
      return route.continue();
    });
    await context.route('**/js/library-ui.js?*', async route => {
      const response = await route.fetch();
      const source = candidate ? fs.readFileSync(path.join(root, 'public/js/library-ui.js'), 'utf8') : await response.text();
      await route.fulfill({ response, body: source + `\n{
        const original = window.CorpusMaterialize.ensurePublicWork;
        window.CorpusMaterialize.ensurePublicWork = async function(...args) {
          window.__refreshLinkWaiting = true;
          await new Promise(resolve => { window.__refreshLinkRelease = resolve; });
          return original.apply(this, args);
        };
      }` });
    });
    page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('response', response => { if (response.status() >= 400 || new URL(response.url()).pathname.startsWith('/api/public-corpora')) responses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    page.on('console', message => { if (['warning', 'error'].includes(message.type()) && warnings.length < 20) warnings.push(message.text().slice(0, 400)); });
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('Browser page error:', e.message); });
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__refreshLinkWaiting);
    evidence.checkpoints.push({ stage: 'materialization paused', url: page.url() });
    console.log('Materialization paused');
    if (expectBug) {
      assert.equal(new URL(page.url()).searchParams.has('public_work'), false);
    } else {
      assert.equal(new URL(page.url()).searchParams.get('public_work'), work);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__refreshLinkWaiting);
      evidence.checkpoints.push({ stage: 'refresh while materialization paused', url: page.url() });
      console.log('Refresh preserved pending material');
      assert.equal(new URL(page.url()).searchParams.get('public_work'), work);
      await page.evaluate(() => window.__refreshLinkRelease());
      await page.waitForFunction(() => document.querySelectorAll('#roomReaderTable tbody tr').length === 499 && !document.getElementById('roomReader').hidden);
      evidence.checkpoints.push({ stage: 'Reader opened', url: page.url(), rows: await page.locator('#roomReaderTable tbody tr').count() });
      assert.equal(new URL(page.url()).searchParams.get('public_work'), work);
    }
    assert.deepEqual(errors, []);
    evidence.pass = true;
    const output = path.join(root, '.tmp/reader-performance/refresh-link-' + (candidate ? 'candidate' : expectBug ? 'baseline' : 'production') + '.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence));
  } catch (error) {
    evidence.pass = false; evidence.failure = error.stack;
    evidence.diagnostic = { responses, warnings, page: await page?.evaluate(() => ({ url: location.href,
      dbReady: window.__localDB?.isReady(), rows: document.querySelectorAll('#roomReaderTable tbody tr').length,
      text: document.getElementById('roomContent')?.innerText?.slice(0, 1600), waiting: window.__refreshLinkWaiting })).catch(() => null) };
    const output = path.join(root, '.tmp/reader-performance/refresh-link-failed.json');
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
