'use strict';
// Browser/DOM qualification, not an iPhone emulator or native acceptance claim.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..');
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1';

async function main() {
  let child, dataDir, base = process.env.LP_IPHONE_DOWNLOAD_BASE;
  const label = base ? 'production' : 'local';
  const out = path.join(ROOT, 'docs/research/studio-iphone-downloader/2026-09-08', label);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const checks = [], errors = [], acquisitionCalls = [];
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, userAgent, serviceWorkers: 'block' });
  try {
    if (!base) {
      dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-phone-download-smoke-'));
      child = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(dataDir, 0), silent: true });
      child.stderr.on('data', () => {}); child.stdout.on('data', () => {});
      base = 'http://127.0.0.1:' + await waitForSmokeServer(child, 30000);
    }
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => {
      const url = new URL(req.url());
      if (/\/api\/|googleapis|youtube|googlevideo|pythonhosted/.test(url.href)) acquisitionCalls.push(url.href);
    });
    const cdp = await context.newCDPSession(page); await cdp.send('Page.enable');
    const launches = [];
    cdp.on('Page.frameRequestedNavigation', event => { if (event.url.startsWith('ashellmini:')) launches.push(event.url); });
    await page.goto(base + '/download-media.html#source=njtNjn4ya2U', { waitUntil: 'networkidle' });
    await page.locator('#phoneStart').waitFor();
    assert.equal(await page.inputValue('#phoneSource'), 'https://www.youtube.com/watch?v=njtNjn4ya2U');
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.locator('#phonePlatform').isVisible(), false);
    await page.locator('#phoneStart').click();
    assert.match(await page.locator('#phoneFormError').textContent(), /право/);
    assert.equal(await page.evaluate(() => localStorage.getItem('studio.iphone-downloads.v1')), null);
    checks.push('source fragment consumed; rights required before launch or journal write');
    await page.selectOption('#phoneRights', 'permission');
    await page.screenshot({ path: path.join(out, 'download-380-ru.png') });
    await page.locator('#phoneStart').click();
    await page.waitForFunction(() => !!localStorage.getItem('studio.iphone-downloads.v1'));
    await page.waitForTimeout(400);
    assert.equal(launches.length, 1, 'real custom-scheme navigation requested');
    const decodedCommand = decodeURIComponent(launches[0].slice('ashellmini://'.length));
    const payload = decodedCommand.split(' ').at(-1);
    const request = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    assert.equal(request.source, 'njtNjn4ya2U'); assert.equal(request.rights, 'permission');
    assert.equal(launches[0].length < 4096, true);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('studio.iphone-downloads.v1'))[0].state), 'requested');
    assert.equal(await page.locator('.phone-success').count(), 0);
    checks.push('real deep-link request; no copied commands; launch is not success');
    for (let i = 0; i < 2; i++) await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.phone-history-item').count(), 1);
    assert.equal(await page.locator('.phone-success').count(), 0);
    assert.equal(await page.inputValue('#phoneRights'), '');
    checks.push('two reloads retain pending job, not success or reusable rights consent');
    const result = { v: 1, job: request.job, source: request.source, state: 'ready', kind: 'video', quality: 360,
      name: 'בדידות בערב החג - njtNjn4ya2U-360p-test.mp4', bytes: 31975909, sha256: 'b'.repeat(64) };
    const returnFragment = value => '#result=' + Buffer.from(JSON.stringify(value)).toString('base64url');
    await page.goto(base + '/download-media.html' + returnFragment({ ...result, job: 'c'.repeat(32) }), { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#phoneReturnError').isVisible(), true);
    assert.equal(await page.locator('.phone-success').count(), 0);
    checks.push('unbound return cannot create a completed job');
    await page.goto(base + '/download-media.html' + returnFragment(result), { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.phone-success').count(), 1);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('studio.iphone-downloads.v1'))[0]);
    assert.equal(stored.browser_file_verified, false); assert.equal(stored.evidence, 'HELPER_REPORTED');
    await page.locator('#phoneHistory').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'download-380-return-fixture.png') });
    checks.push('bound TEST_FIXTURE_ONLY return stays helper-reported, not OPFS/File verification');
    await page.locator('[data-action="open"]').click(); await page.waitForTimeout(300);
    assert.equal(launches.length, 2);
    const reopened = JSON.parse(Buffer.from(decodeURIComponent(launches[1].slice('ashellmini://'.length)).split(' ').at(-1), 'base64url').toString());
    assert.equal(reopened.action, 'open'); assert.equal(reopened.job, request.job);
    checks.push('reopen uses same job, never a new download command');
    await page.locator('[data-action="forget"]').click();
    assert.equal(await page.locator('.phone-history-item').count(), 0);
    assert.match(await page.locator('#phoneNotice').textContent(), /не удалён/);
    checks.push('forget removes journal entry only');
    const release = await page.evaluate(() => window.IPhoneDownloaderRelease);
    const response = await context.request.get(base + release.path);
    assert.equal(response.ok(), true);
    assert.equal(crypto.createHash('sha256').update(await response.body()).digest('hex'), release.sha256);
    checks.push('actual published helper archive bytes match launch SHA256');
    await page.selectOption('#phoneLanguage', 'he'); await page.evaluate(() => scrollTo(0, 0));
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, 'download-380-he.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: path.join(out, 'download-380-he-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' }); await page.selectOption('#phoneLanguage', 'en');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(out, 'download-desktop-en.png') });
    const controls = await page.locator('button,input,select,.phone-button,summary').evaluateAll(nodes => nodes
      .filter(n => n.getClientRects().length).map(n => ({ label: n.textContent.trim().slice(0, 40), height: n.getBoundingClientRect().height })));
    assert.equal(controls.every(n => n.height >= 44), true);
    checks.push('RU/EN/HE RTL, 380px/desktop/dark, no overflow, 44px controls');
    assert.deepEqual(acquisitionCalls, []);
    checks.push('download surface makes no API/provider/ASR/media request');

    // Native UI renderer is exercised with a recorded input bridge, explicitly
    // not with a native WebKit runtime or an actual a-Shell command executor.
    const nativePage = await context.newPage();
    nativePage.on('pageerror', e => errors.push(e.message));
    await nativePage.goto(base + '/download-media.html', { waitUntil: 'networkidle' });
    await nativePage.setViewportSize({ width: 380, height: 844 });
    await nativePage.evaluate(() => { window.__nativeMessages = []; window.webkit = { messageHandlers: { aShell: { postMessage: text => __nativeMessages.push(text) } } }; });
    await nativePage.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'scripts/premium/iphone-downloader/native-ui.js'), 'utf8') });
    const css = fs.readFileSync(path.join(ROOT, 'public/css/iphone-downloader.css'), 'utf8');
    await nativePage.evaluate(css => LPPhoneNative.install({ session: 'fixture-session', language: 'ru', copy: I18N_LOCALES.ru.phoneDownload, css }), css);
    await nativePage.waitForFunction(() => __nativeMessages.length >= 1);
    const handshake = await nativePage.evaluate(() => JSON.parse(__nativeMessages[0].slice(6)));
    assert.equal(handshake.action, 'ui-ready');
    await nativePage.evaluate(() => LPPhoneNative.render({ phase: 'options', ack: 1, title: 'בדידות בערב החג', duration: 959,
      options: [{ key: 'video-720', kind: 'video', quality: 720, bytes: 50000000 }, { key: 'video-360', kind: 'video', quality: 360, bytes: 31975909 }, { key: 'audio', kind: 'audio', quality: null, bytes: 15509473 }] }));
    await nativePage.waitForTimeout(200);
    await nativePage.screenshot({ path: path.join(out, 'native-options-380-fixture.png') });
    await nativePage.locator('#lp-phone-native input[value="video-360"]').check();
    await nativePage.locator('#lp-phone-native [data-action="download"]').click();
    await nativePage.waitForFunction(() => __nativeMessages.some(x => x.includes('"action":"download"')));
    const selection = await nativePage.evaluate(() => __nativeMessages.map(x => JSON.parse(x.slice(6))).find(x => x.action === 'download'));
    assert.equal(selection.option, 'video-360'); assert.equal(selection.session, 'fixture-session');
    await nativePage.evaluate(ack => LPPhoneNative.render({ phase: 'downloading', ack, title: 'בדידות בערב החג', bytes: 16000000, total: 32000000 }), selection.seq);
    await nativePage.screenshot({ path: path.join(out, 'native-progress-380-fixture.png') });
    await nativePage.locator('#lp-phone-native [data-action="cancel"]').click();
    await nativePage.waitForFunction(() => __nativeMessages.some(x => x.includes('"action":"cancel"')));
    assert.match(await nativePage.locator('#lp-phone-native h1').textContent(), /Отменяем/);
    assert.equal(await nativePage.locator('#lp-phone-native [data-action="preview"]').isVisible(), false);
    await nativePage.evaluate(() => LPPhoneNative.render({ phase: 'ready', ack: 100, kind: 'video', name: 'Fixture.mp4', bytes: 31975909, sha256: 'b'.repeat(64) }));
    await nativePage.screenshot({ path: path.join(out, 'native-ready-380-fixture.png') });
    assert.equal(await nativePage.locator('#lp-phone-native [data-action="preview"]').isVisible(), true);
    assert.equal(await nativePage.locator('#lp-phone-native [data-action="cancel"]').isVisible(), false);
    checks.push('native UI TEST_FIXTURE_ONLY handshake, selection, progress, cancel acknowledgement and ready rendering');
    const studio = await context.newPage();
    studio.on('pageerror', e => errors.push(e.message));
    await studio.goto(base + '/index.html', { waitUntil: 'load' });
    await studio.waitForFunction(() => !!window.StudioImport);
    await studio.evaluate(() => {
      for (const id of ['v3OnboardingModal', 'v3Phase6Modal']) document.getElementById(id)?.remove();
      appSetLocale('ru'); StudioImport.open(); StudioImport.switchTab('video');
    });
    await studio.locator('#v3PhoneDownloader').waitFor({ state: 'visible' });
    assert.equal(await studio.locator('#v3DownrHandoff').isVisible(), false);
    assert.equal(await studio.locator('#v3PhoneDownloadLink').evaluate(n => n.getBoundingClientRect().height >= 44), true);
    await studio.fill('#v3ImportVideoUrl', 'https://youtu.be/njtNjn4ya2U?t=20');
    await studio.locator('#v3PhoneDownloadLink').scrollIntoViewIfNeeded();
    await studio.screenshot({ path: path.join(out, 'studio-entry-380-ru.png') });
    await studio.locator('#v3PhoneDownloadLink').click();
    await studio.waitForURL('**/download-media.html*');
    await studio.waitForFunction(() => document.getElementById('phoneSource')?.value.includes('njtNjn4ya2U'));
    checks.push('actual Studio Video entry hands off the selected source without changing ASR');
    assert.deepEqual(errors, []);
    const report = { result: 'PASS', base, checks, page_errors: errors, acquisition_calls: acquisitionCalls,
      archive_sha256: release.sha256, physical_iphone_new_flow: 'NOT_TESTED', native_bridge: 'TEST_FIXTURE_ONLY',
      source_download: 'NOT_RUN', transcription: 'NOT_TOUCHED' };
    fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
    if (child) { child.kill(); await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve)); }
    if (dataDir && path.dirname(path.resolve(dataDir)) === path.resolve(os.tmpdir()) && path.basename(dataDir).startsWith('lp-phone-download-smoke-')) fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
