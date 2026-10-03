"use strict";
// Real SQLite commits and BroadcastChannel, disposable profiles only.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork } = require('node:child_process'), { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const root = path.resolve(__dirname, '../..'), remote = arg('base');
const out = path.resolve(arg('out') || path.join(root, '.tmp/scoped-changes'));
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const server = remote ? null : fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: root,
    env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-scopes-')), 0), silent: true, windowsHide: true });
  const logs = []; server?.stdout.on('data', d => logs.push(String(d))); server?.stderr.on('data', d => logs.push(String(d)));
  let browser;
  try {
    const base = remote || 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
    if (remote) { assert.ok(arg('version')); assert.equal((await (await fetch(base + '/api/client-config?verify=' + Date.now())).json()).version, arg('version')); }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 850 } });
    await context.route('**/*', route => !route.request().url().startsWith(base) || (remote && !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) ? route.abort() : route.continue());
    // Count actual production handlers without adding an application debug surface.
    await context.route('**/js/library-ui.js?*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__scopes = { catalogReads: 0, wordInvalidations: 0, events: [] };
const scopeLoad = loadData; loadData = (...args) => { __scopes.catalogReads++; return scopeLoad(...args); };
const scopeWords = morphHost.invalidateWordStates; morphHost.invalidateWordStates = (...args) => { __scopes.wordInvalidations++; return scopeWords.apply(morphHost,args); };
window.__lastScopeEvent = performance.now();
window.addEventListener('localdb:changed', e => { __scopes.events.push(e.detail); window.__lastScopeEvent = performance.now(); });
window.__scopeReady = () => _roomPresentationReady;
` });
    });
    await context.route('**/js/mediatheque-ui.js?*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
window.__scopes = { metadataReads: 0, refreshes: 0, renders: 0, events: [] };
const scopeLocal = loadLocal; loadLocal = (...args) => { __scopes.metadataReads++; return scopeLocal(...args); };
const scopeRefresh = refreshLocalChanges; refreshLocalChanges = (...args) => { __scopes.refreshes++; return scopeRefresh(...args); };
const scopeRender = render; render = (...args) => { __scopes.renders++; return scopeRender(...args); };
window.__lastScopeEvent = performance.now();
window.addEventListener('localdb:changed', e => { __scopes.events.push(e.detail); window.__lastScopeEvent = performance.now(); });
window.__scopeReady = () => state.localReady && !state.loading && !localRefresh;
window.__scopeItems = () => state.localItems;
` });
    });
    await context.addInitScript(() => { if (!['http:', 'https:'].includes(location.protocol)) return; localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined'); localStorage.setItem('onboardingSeen_v1', '1'); });
    if (arg('vfs')) await context.addInitScript(value => { if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('opfsVfsPreference_v1', value); }, arg('vfs'));
    const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    const writer = await context.newPage();
    await writer.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded' });
    await writer.waitForFunction(() => window.__localDB?.isReady());
    await writer.evaluate(async () => {
      await __localDB.createText({ id: 'scope-A', text_key: 'scope-A', title: 'Scope original', source_text: 'source-marker' });
      await __localDB.addSentences('scope-A', [{ id: 'scope-row', he_plain: 'שלום', ru: 'Scope row' }]);
      await __localDB.setProgress('scope-A', { last_row_idx: 0, last_step_id: 'ru' });
    });
    const home = await context.newPage(), media = await context.newPage(), reader = await context.newPage();
    await home.goto(base + '/library.html?canon=skip#room=hub', { waitUntil: 'domcontentloaded' });
    await home.waitForFunction(() => window.__scopeReady?.());
    await home.locator('.learning-home').waitFor();
    await media.goto(base + '/mediatheque.html?space=personal&section=catalog', { waitUntil: 'domcontentloaded' });
    await media.waitForFunction(() => window.__scopeReady?.());
    await media.getByText('Scope original', { exact: true }).first().waitFor();
    await reader.goto(base + '/library.html?canon=skip&my_text=scope-A', { waitUntil: 'domcontentloaded' });
    await reader.locator('#roomReaderTable').getByText('Scope row', { exact: false }).waitFor();
    // Finish incidental boot/touch commits before measuring a transaction family.
    await home.waitForFunction(() => performance.now() - window.__lastScopeEvent > 1000);
    await home.evaluate(() => { document.querySelector('.learning-home button')?.focus(); window.__accepted = document.querySelector('.learning-home'); window.__focus = document.activeElement; });
    await media.evaluate(() => { window.__accepted = document.querySelector('#ml-root').firstElementChild; });
    await reader.evaluate(() => { window.__accepted = document.querySelector('#roomReaderTable').firstElementChild; window.__sentinel = true; });
    const reset = async () => { for (const p of [home, media, reader]) await p.evaluate(() => { for (const key of Object.keys(__scopes)) __scopes[key] = key === 'events' ? [] : 0; }); };
    const settle = () => home.waitForTimeout(300);
    await reset();
    await writer.evaluate(async () => {
      await __localDB.execRaw('BEGIN;');
      await __localDB.setProgress('scope-A', { last_row_idx: 1, last_step_id: 'ru' });
      await __localDB.execRaw('COMMIT;');
    });
    await media.waitForFunction(() => window.__scopeItems().find(i => i.localId === 'scope-A')?.progress === 'in_progress');
    await settle();
    const progress = { home: await home.evaluate(() => __scopes), media: await media.evaluate(() => __scopes), reader: await reader.evaluate(() => __scopes) };
    fs.writeFileSync(path.join(out, 'progress-debug.json'), JSON.stringify(progress, null, 2));
    assert.equal(progress.home.catalogReads, 0); assert.equal(progress.home.wordInvalidations, 0);
    assert.equal(progress.media.metadataReads, 0); assert.equal(progress.media.refreshes, 1);
    assert.deepEqual(progress.home.events, [{ schema: 1, all: false, tables: ['text_progress'] }]);
    assert.equal(await home.evaluate(() => __accepted === document.querySelector('.learning-home') && __focus === document.activeElement), true);
    assert.equal(await reader.evaluate(() => __accepted === document.querySelector('#roomReaderTable').firstElementChild && __sentinel), true);
    // Row-to-row progress inside the same status does not replace catalog controls.
    await reset(); await media.evaluate(() => { window.__accepted = document.querySelector('#ml-root').firstElementChild; });
    await writer.evaluate(() => __localDB.setProgress('scope-A', { last_row_idx: 2, last_step_id: 'ru' })); await settle();
    assert.equal(await media.evaluate(() => __scopes.renders), 0);
    assert.equal(await media.evaluate(() => __accepted === document.querySelector('#ml-root').firstElementChild), true);
    await reset();
    await media.locator('#ml-search').focus();
    await writer.evaluate(() => __localDB.setTextFinished('scope-A'));
    await media.waitForFunction(() => window.__scopeItems().find(i => i.localId === 'scope-A')?.progress === 'finished');
    await settle();
    assert.equal(await media.evaluate(() => __scopes.metadataReads), 0);
    assert.equal(await media.evaluate(() => document.activeElement.id), 'ml-search');
    assert.equal(await home.evaluate(() => __scopes.catalogReads), 0);
    await reset();
    await writer.evaluate(async () => {
      const current = await __localDB.getMediathequeStructure();
      current.structure.home.title = 'Scope personal structure';
      await __localDB.saveMediathequeStructure(current.structure, current.revision);
    });
    await media.getByText('Scope personal structure', { exact: true }).waitFor();
    await settle();
    assert.equal(await media.evaluate(() => __scopes.metadataReads), 0);
    assert.equal(await home.evaluate(() => __scopes.catalogReads + __scopes.wordInvalidations), 0);
    await reset();
    await writer.evaluate(async () => {
      await __localDB.execRaw('BEGIN;');
      await __localDB.dbRun('INSERT INTO word_status(lemma_key,status) VALUES (?,?)', ['scope-secret-word', 'known']);
      await __localDB.execRaw('COMMIT;');
    }); await settle();
    const words = { home: await home.evaluate(() => __scopes), media: await media.evaluate(() => __scopes) };
    assert.equal(words.home.wordInvalidations, 1); assert.equal(words.home.catalogReads, 0);
    assert.equal(words.media.refreshes, 0); assert.equal(words.media.renders, 0);
    assert.equal(JSON.stringify(words.home.events).includes('scope-secret-word'), false);
    await reset();
    await writer.evaluate(async () => {
      await __localDB.execRaw('BEGIN;'); await __localDB.dbRun('UPDATE texts SET title=? WHERE id=?', ['rolled-back', 'scope-A']);
      await __localDB.execRaw('ROLLBACK;');
      await __localDB.dbQuery('WITH marker AS (SELECT 1) SELECT * FROM marker');
    }); await settle();
    assert.deepEqual(await home.evaluate(() => __scopes.events), []);
    assert.equal(await media.evaluate(() => __scopes.refreshes), 0);
    await reset();
    await writer.evaluate(async () => {
      await __localDB.execRaw('BEGIN; SAVEPOINT cancelled;');
      await __localDB.dbRun('UPDATE texts SET title=? WHERE id=?', ['rolled-back-savepoint', 'scope-A']);
      await __localDB.execRaw('ROLLBACK TO cancelled; RELEASE cancelled; COMMIT;');
    }); await settle();
    assert.deepEqual(await home.evaluate(() => __scopes.events), []);
    await writer.evaluate(() => __localDB.updateText('scope-A', { title: 'Scope changed' }));
    await media.getByText('Scope changed', { exact: true }).first().waitFor();
    assert.equal(await media.evaluate(() => __scopes.metadataReads), 1);
    assert.equal(await home.evaluate(() => __accepted === document.querySelector('.learning-home') && __focus === document.activeElement), true);
    await home.locator('#roomLibraryChanges button').click();
    await home.waitForFunction(() => document.querySelector('.learning-home') !== window.__accepted && !document.querySelector('#roomLibraryChanges'));
    await reset();
    await writer.evaluate(() => { const c = new BroadcastChannel('localdb-commits-v2'); for (let i = 0; i < 10; i++) c.postMessage({ changed: true }); c.close(); });
    await settle();
    const legacy = await home.evaluate(() => __scopes.events);
    assert.deepEqual(legacy, [{ schema: 1, all: true, tables: [] }]);
    assert.equal(await media.evaluate(() => __scopes.metadataReads), 1);
    await home.setViewportSize({ width: 380, height: 820 });
    await home.screenshot({ path: path.join(out, 'home-380.png') });
    assert.equal(await home.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    const report = { result: 'PASS', base, vfs: await writer.evaluate(() => localStorage.getItem('opfsVfsPreference_v1')), remoteReadOnly: !!remote, disposableBrowserProfile: true,
      progress, words, rolledBackTransactionSilent: true, rolledBackSavepointSilent: true,
      unchangedProgressPreservesCatalogDom: true, finishedStatusAndFocus: true, structureOnlyRefresh: true, actualMetadataRefresh: true, homeAndReaderPreserved: true,
      legacyBurst: legacy, errors };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } catch (error) {
    fs.writeFileSync(path.join(out, 'server.log'), logs.join(''));
    if (browser) for (const [i, page] of browser.contexts().flatMap(c => c.pages()).entries()) {
      await page.screenshot({ path: path.join(out, `failure-${i}.png`), timeout: 5000 }).catch(() => {});
      fs.writeFileSync(path.join(out, `failure-${i}.txt`), page.url() + '\n' + await page.locator('body').innerText({ timeout: 5000 }).catch(() => 'unavailable'));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) { server.kill(); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); }); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
