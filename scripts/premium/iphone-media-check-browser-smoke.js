'use strict';
// Isolated desktop browser QA only. Does not launch/install iOS apps or fetch media.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..');
const base = process.env.LP_IPHONE_CHECK_BASE || 'http://localhost:3298';
const label = base.startsWith('https://linguistpro.kolosei.com') ? 'production' : 'local';
const out = path.join(ROOT, 'docs/research/studio-iphone-local-media/2026-09-08', label);
const expectedHash = '0744253ad45912fd53f641b10f9832e68511641f211d1bf82ae8151d6f7e4282';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [], apiCalls = [], checks = [];
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url()); });
    await page.goto(base + '/iphone-media-check.html', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Загрузка на iPhone', exact: true }).waitFor();
    assert.equal(await page.locator('#downloadCommands').isVisible(), false);
    checks.push('commands hidden before explicit rights');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, 'iphone-check-380-top.png') });
    checks.push('380px top no overflow');
    await page.selectOption('#rights', 'permission');
    assert.match(await page.locator('#audioCommand').textContent(), /--kind audio --rights permission$/);
    assert.match(await page.locator('#videoCommand').textContent(), /--kind video --quality 360 --rights permission$/);
    await page.locator('#audioCommand').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'iphone-check-380-commands.png') });
    checks.push('safe audio/video command generation');
    await page.fill('#source', 'https://youtu.be/dH_OkB7Uym4;open bad');
    assert.equal(await page.locator('#downloadCommands').isVisible(), false);
    assert.equal(await page.locator('#audioCommand').textContent(), '');
    checks.push('invalid source clears stale commands');
    await page.fill('#source', 'https://youtu.be/dH_OkB7Uym4');
    await page.locator('[data-copy="preflight"]').click();
    await page.waitForFunction(() => document.getElementById('copyStatus').textContent.startsWith('Скопировано'));
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'python3 run.py --preflight');
    checks.push('actual clipboard write');
    await page.fill('#jobId', 'a'.repeat(32));
    assert.equal(await page.locator('#returnCommand').textContent(), 'python3 run.py --return-chrome ' + 'a'.repeat(32));
    await page.fill('#jobId', '../owner');
    assert.equal(await page.locator('#returnBlock').isVisible(), false);
    checks.push('return command cannot carry arbitrary input');
    const controls = await page.locator('button, input, select, .action').evaluateAll(elements => elements
      .filter(el => el.getClientRects().length).map(el => ({ text: el.textContent.trim().slice(0, 50), height: el.getBoundingClientRect().height })));
    assert.equal(controls.every(item => item.height >= 44), true);
    checks.push('all visible controls at least 44px');
    const zipLink = page.getByRole('link', { name: /Скачать комплект/ });
    const downloadWait = page.waitForEvent('download');
    await zipLink.click();
    const download = await downloadWait;
    const downloaded = await download.path();
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(downloaded)).digest('hex'), expectedHash);
    checks.push('actual browser ZIP download SHA256');
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('#downloadCommands').isVisible(), false);
      assert.match(await page.locator('footer').textContent(), /3\.11\.490/);
    }
    checks.push('two reloads, no persisted rights or stale commands');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'iphone-check-desktop.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 380, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(15, 23, 42)');
    await page.screenshot({ path: path.join(out, 'iphone-check-380-dark.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    checks.push('desktop and dark 380px layout');
    assert.deepEqual(errors, []);
    assert.deepEqual(apiCalls, []);
    checks.push('no page errors or API/provider requests');
    const report = { result: 'PASS', base, checks, page_errors: errors, api_calls: apiCalls,
      archive_sha256: expectedHash, physical_iphone: 'NOT_TESTED', native_app: 'NOT_TESTED' };
    fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
