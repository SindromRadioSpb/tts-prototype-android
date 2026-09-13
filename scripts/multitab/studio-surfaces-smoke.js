'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, '.tmp/multitab');
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-multitab-'));
  const server = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT,
    env: smokeServerEnv(data, 0), silent: true, windowsHide: true });
  const logs = [];
  server.stdout.on('data', d => logs.push(String(d)));
  server.stderr.on('data', d => logs.push(String(d)));
  let browser;
  try {
    const port = await waitForSmokeServer(server, 30000);
    const base = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 850 } });
    await context.route(url => !url.href.startsWith(base), route => route.abort());
    await context.addInitScript(() => { localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); });
    const pages = await Promise.all(Array.from({ length: 4 }, () => context.newPage()));
    const [a, b, m, r] = pages;
    const errors = [];
    for (const p of pages) p.on('pageerror', e => errors.push(e.message));
    await Promise.all(pages.map((p, i) => p.goto(base + (i < 2 ? '/?localMode=1' : i === 2 ? '/mediatheque.html?space=personal' : '/library.html'), { waitUntil: 'domcontentloaded' })));
    for (const p of [a, b, r]) await p.waitForFunction(() => window.__localDB?.isReady(), null, { timeout: 45000 });
    await a.evaluate(async () => {
      await __localDB.createText({ id: 'mt-studio-a', text_key: 'mt-studio-a', title: 'Multitab alpha', source_text: 'שלום' });
      await __localDB.createText({ id: 'mt-studio-b', text_key: 'mt-studio-b', title: 'Multitab beta', source_text: 'תודה' });
    });
    await m.getByText('Multitab alpha', { exact: true }).first().waitFor({ timeout: 15000 });
    await a.fill('#inputText', 'Черновик первой Студии');
    await b.fill('#inputText', 'Черновик второй Студии');
    await Promise.all([a, b].map(p => p.waitForFunction(() => sessionStorage.getItem('ttsDashboard_text_v1') === document.getElementById('inputText').value)));
    await a.evaluate(() => v3SessionSet({ mode: 'draft', textId: 'mt-studio-a', baseTextId: 'mt-studio-a' }));
    await b.evaluate(() => v3SessionSet({ mode: 'draft', textId: 'mt-studio-b', baseTextId: 'mt-studio-b' }));
    assert.equal(await a.evaluate(() => v3SessionGet().textId), 'mt-studio-a');
    assert.equal(await b.evaluate(() => v3SessionGet().textId), 'mt-studio-b');
    // Closing the first Studio must not navigate/reload the remaining Studio.
    await b.evaluate(() => { window.mtDraftSentinel = 'still-here'; });
    await a.close();
    assert.equal((await b.evaluate(() => __localDB.listTexts())).length >= 2, true);
    assert.equal(await b.evaluate(() => window.mtDraftSentinel), 'still-here');
    assert.equal(await b.inputValue('#inputText'), 'Черновик второй Студии');
    await b.reload({ waitUntil: 'domcontentloaded' });
    await b.waitForFunction(() => window.__localDB?.isReady());
    assert.equal(await b.inputValue('#inputText'), 'Черновик второй Студии');
    assert.equal(await b.evaluate(() => v3SessionGet().textId), 'mt-studio-b');
    await b.evaluate(() => __localDB.createText({ id: 'mt-studio-c', text_key: 'mt-studio-c', title: 'Multitab gamma', source_text: 'ספר' }));
    await m.getByText('Multitab gamma', { exact: true }).first().waitFor({ timeout: 15000 });
    // A commit arriving while a dialog is open must refresh after it closes.
    await m.evaluate(() => {
      document.getElementById('ml-dialog').showModal();
      window.mtDeferredCommit = new Promise(resolve => window.addEventListener('localdb:changed', resolve, { once: true }));
    });
    await b.evaluate(() => __localDB.createText({ id: 'mt-deferred', text_key: 'mt-deferred', title: 'Multitab deferred', source_text: 'ספר' }));
    await m.evaluate(() => window.mtDeferredCommit.then(() => true));
    await m.evaluate(() => document.getElementById('ml-dialog').close());
    await m.getByText('Multitab deferred', { exact: true }).first().waitFor({ timeout: 15000 });
    for (const p of [b, m, r]) {
      const body = await p.locator('body').innerText();
      assert.doesNotMatch(body, /Запросы идут через одну вкладку|Закройте другие вкладки|Библиотека открыта в другой вкладке|memory access out of bounds/);
    }
    await m.screenshot({ path: path.join(OUT, 'mediatheque-desktop.png') });
    await m.setViewportSize({ width: 380, height: 820 });
    await m.screenshot({ path: path.join(OUT, 'mediatheque-380-ru.png') });
    await b.screenshot({ path: path.join(OUT, 'studio-desktop.png') });
    await m.evaluate(() => window.appSetLocale('he'));
    await m.screenshot({ path: path.join(OUT, 'mediatheque-380-he.png') });
    await m.evaluate(() => window.appSetLocale('ru'));
    const videoBytes = Array.from(fs.readFileSync(path.join(ROOT, 'scripts/premium/fixtures/material-lifecycle/three-second.mp4')));
    await b.evaluate(async bytes => {
      const data = new Uint8Array(bytes);
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), n => n.toString(16).padStart(2, '0')).join('');
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('media', { create: true });
      const handle = await dir.getFileHandle('mt-video.mp4', { create: true });
      const writer = await handle.createWritable(); await writer.write(data); await writer.close();
      const passport = { source: { audio: { v: 1,
        media: { opfsPath: 'media/mt-video.mp4', sha256: sha, mime: 'video/mp4', sizeBytes: data.length, durationSec: 3, originalName: 'Fixture.mp4' },
        segments: [{ i: 0, start: 0, end: 2, text: 'שלום עולם' }],
        timing: { v: 1, unit: 'row', entries: [{ o: 0, t: 0, end: 2 }] }
      } } };
      await __localDB.createText({ id: 'mt-video', text_key: 'mt-video', title: 'Multitab video', source_text: 'שלום עולם', table_model_meta_json: JSON.stringify(passport) });
      await __localDB.addSentence('mt-video', { id: 'mt-video-row', he_plain: 'שלום עולם', ru: 'Привет, мир' });
    }, videoBytes);
    await m.locator('.ml-item').filter({ hasText: 'Multitab video' }).locator('a.ml-open').first().click();
    await m.locator('#roomReaderTable').getByText('Привет, мир', { exact: true }).waitFor({ timeout: 20000 });
    await m.locator('#roomMediaLocalPlayer').waitFor({ state: 'visible' });
    await m.evaluate(async () => { const media = document.getElementById('roomMediaLocalPlayer'); media.muted = true; await media.play(); });
    await m.waitForFunction(() => document.getElementById('roomMediaLocalPlayer').currentTime > 0.2);
    // Freeze an idle Studio as a background-tab simulation. Media remains usable.
    const cdp = await context.newCDPSession(b);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    assert.ok((await m.evaluate(() => __localDB.listTexts())).some(text => text.id === 'mt-video'));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    assert.equal(await b.inputValue('#inputText'), 'Черновик второй Студии');
    await m.screenshot({ path: path.join(OUT, 'video-playing-380.png') });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', studios: 2, room: 1, mediatheque: 1, draftsIsolated: true, noReloadOnPeerClose: true, liveCatalogueRefresh: true, deferredDialogRefresh: true, localVideoPlayback: true, frozenIdleStudio: true, errors }));
  } catch (e) { fs.writeFileSync(path.join(OUT, 'server-failure.log'), logs.join('')); throw e; }
  finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
    // Isolated server data is retained in OS temp on failure for diagnosis.
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
