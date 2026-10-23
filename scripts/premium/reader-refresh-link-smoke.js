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
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__refreshLinkWaiting);
    evidence.checkpoints.push({ stage: 'materialization paused', url: page.url() });
    if (expectBug) {
      assert.equal(new URL(page.url()).searchParams.has('public_work'), false);
    } else {
      assert.equal(new URL(page.url()).searchParams.get('public_work'), work);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__refreshLinkWaiting);
      evidence.checkpoints.push({ stage: 'refresh while materialization paused', url: page.url() });
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
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
