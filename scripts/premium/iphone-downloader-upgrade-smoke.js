'use strict';
// Start against 3.11.491 BEFORE deployment, then verify the ordinary Update button.
// Disposable Chromium profile; no owner account, iPhone, media or ASR invocation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const base = 'https://linguistpro.kolosei.com';
const target = '3.11.492';
const out = path.join(ROOT, 'docs/research/studio-iphone-downloader/2026-09-08/native-ui-fix/upgrade');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const initial = await (await fetch(base + '/api/client-config?upgrade=' + Date.now())).json();
  assert.equal(initial.version, '3.11.491', 'must start before the new deployment');
  const expected = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/js/iphone-downloader-release.js'), 'utf8'), expected);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 120000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.APP_VERSION === '3.11.491');
    await page.goto(base + '/download-media.html', { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => IPhoneDownloaderRelease.sha256), 'e1e5906d9803b052899ed729e05fdc02b38284ddaaa6f55758c0dd54eec22000');
    console.log('BASELINE_CACHED_491_READY');
    let updated = false;
    for (let attempt = 0; attempt < 96; attempt++) {
      await pause(5000);
      const config = await (await fetch(base + '/api/client-config?upgrade=' + Date.now())).json();
      if (config.version === target) { updated = true; break; }
      if (attempt % 4 === 0) console.log('Waiting for production ' + target);
    }
    assert.ok(updated, 'deployment did not become ready within the bounded window');
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__v3WaitingWorker, null, { timeout: 120000 });
    await page.evaluate(() => {
      for (const id of ['v3OnboardingModal', 'v3Phase6Modal']) document.getElementById(id)?.remove();
    });
    await page.locator('#v3PwaUpdateToast button').first().click();
    await page.waitForFunction(() => window.APP_VERSION === '3.11.492', null, { timeout: 60000 });
    await page.goto(base + '/download-media.html', { waitUntil: 'load' });
    for (let run = 0; run < 3; run++) {
      if (run) await page.reload({ waitUntil: 'load' });
      assert.equal(await page.evaluate(() => IPhoneDownloaderRelease.sha256), expected.window.IPhoneDownloaderRelease.sha256);
      assert.match(await page.locator('body').textContent(), /3\.11\.492/);
      assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    }
    assert.deepEqual(errors, []);
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'updated-380.png') });
    const report = { status: 'PASS', from: initial.version, to: target, actual_service_worker: true,
      normal_update_button: true, reloads: 2, helper_sha256: expected.window.IPhoneDownloaderRelease.sha256,
      page_errors: errors, physical_iphone: 'NOT_TESTED', media_download: 'NOT_RUN', asr: 'NOT_RUN' };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
