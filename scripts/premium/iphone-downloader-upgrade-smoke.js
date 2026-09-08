'use strict';
// Start against 3.11.491 BEFORE deployment, then verify the ordinary Update button.
// Disposable Chromium profile; no owner account, iPhone, media or ASR invocation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const mime = require('mime-types');
const ROOT = path.resolve(__dirname, '../..');
const production = 'https://linguistpro.kolosei.com';
let base = production;
const target = '3.11.492';
const fixtureMode = process.argv.includes('--fixture');
const out = path.join(ROOT, 'docs/research/studio-iphone-downloader/2026-09-08/native-ui-fix', fixtureMode ? 'upgrade-fixture' : 'upgrade');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function releaseFixture() {
  const old = 'c91023c1', next = '70b779d7'; let active = old;
  const git = (ref, file) => execFileSync('git', ['show', ref + ':' + file], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const current = await (await fetch(production + '/api/client-config?fixture=' + Date.now())).json();
  const configs = {}, overrides = {};
  const changed = execFileSync('git', ['diff', '--name-only', old, next, '--', 'public'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  for (const ref of [old, next]) {
    overrides[ref] = new Map();
    for (const file of changed) { try { overrides[ref].set('/' + file.slice(7), git(ref, file)); } catch (_) {} }
    const integrity = {};
    for (const key of Object.keys(current.shellIntegrity)) {
      const url = ref === old ? key.replace('v=210', 'v=209') : key;
      integrity[url] = crypto.createHash('sha256').update(git(ref, 'public' + url.split('?')[0])).digest('hex');
    }
    configs[ref] = { ...current, version: ref === old ? '3.11.491' : target, shellIntegrity: integrity };
  }
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      if (pathname === '/api/client-config') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(configs[active])); return; }
      if (req.method !== 'GET') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"AUTH_REQUIRED"}'); return; }
      const route = pathname === '/' ? '/index.html' : pathname;
      const file = path.resolve(ROOT, 'public', '.' + decodeURIComponent(route));
      if (!file.startsWith(path.join(ROOT, 'public') + path.sep)) { res.writeHead(404); res.end(); return; }
      const body = overrides[active].get(route) || (fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null);
      if (body) { res.setHeader('Content-Type', mime.lookup(file) || 'application/octet-stream'); res.end(body); return; }
      const response = await fetch(production + req.url);
      res.writeHead(response.status, { 'Content-Type': response.headers.get('Content-Type') || 'text/plain' });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { base: 'http://127.0.0.1:' + server.address().port, advance: () => { active = next; },
    close: () => new Promise(resolve => server.close(resolve)) };
}

async function main() {
  const fixture = fixtureMode ? await releaseFixture() : null;
  if (fixture) base = fixture.base;
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
    if (fixture) fixture.advance();
    let updated = false;
    for (let attempt = 0; attempt < 96; attempt++) {
      await pause(5000);
      const config = await (await fetch(base + '/api/client-config?upgrade=' + Date.now())).json();
      if (config.version === target) { updated = true; break; }
      if (attempt % 4 === 0) console.log('Waiting for production ' + target);
    }
    assert.ok(updated, 'deployment did not become ready within the bounded window');
    await page.goto(base + '/', { waitUntil: 'load' });
    for (let retry = 0; retry < 24 && !await page.evaluate(() => !!window.__v3WaitingWorker); retry++) {
      await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration('/'); if (reg && !reg.installing) await reg.update(); });
      await pause(5000);
    }
    assert.ok(await page.evaluate(() => !!window.__v3WaitingWorker), 'new worker did not become waiting');
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
    const report = { status: 'PASS', mode: fixtureMode ? 'EXACT_GIT_RELEASE_FIXTURE' : 'PRODUCTION_ROLLOUT', from: initial.version, to: target, actual_service_worker: true,
      normal_update_button: true, reloads: 2, helper_sha256: expected.window.IPhoneDownloaderRelease.sha256,
      page_errors: errors, physical_iphone: 'NOT_TESTED', media_download: 'NOT_RUN', asr: 'NOT_RUN' };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); if (fixture) await fixture.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
