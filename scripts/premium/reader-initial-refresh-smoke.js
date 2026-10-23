'use strict';
// A real first-open pipeline with a controlled DB change at each async boundary.
// Synthetic publication, disposable origin/OPFS, no owner profile or paid calls.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork, execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const root = path.resolve(__dirname, '../..');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const baseline = process.argv.includes('--baseline'), ref = arg('ref') || 'a0621a71';
const out = path.resolve(arg('out') || '.tmp/reader-performance/initial-refresh-818.json');
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const slug = 'test-initial-refresh', work = 'work-1';
const item = { public_work_id: work, position_no: 1, title: 'First open fixture', snapshot_sha256: 'c'.repeat(64),
  public_read_allowed: 1, public_stream_allowed: 0, package_download_allowed: 0, asset_missing: 0, package_complete: 0,
  expected_audio_count: 0, included_audio_count: 0 };
const published = { ok: true, corpus: { corpus_id: 'pc_refresh', slug, title: 'Refresh fixture' },
  edition: { edition_id: 'ed_refresh', edition_number: 1, manifest_sha256: 'b'.repeat(64), item_count: 1,
    asset_count: 0, asset_missing: 0, package_complete: false }, items: [item] };
const snapshot = { library: { texts: [{ title: item.title, text_key: 'initial-refresh', source_text: 'שלום עולם',
  rows: [0, 1].map(i => ({ order_index: i, hebrew_plain: 'שלום עולם', hebrew_niqqud: 'שָׁלוֹם עוֹלָם', russian: 'Тест ' + i, translit: 'shalom olam' })) }] } };
(async () => {
  const server = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: root,
    env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-initial-refresh-')), 0), silent: true, windowsHide: true });
  server.stdout.resume(); server.stderr.resume(); let browser, page;
  const report = { baseline, ref, scope: 'Disposable synthetic first-open pipeline; initial DB notifications held until the chosen boundary, then one actual localdb:changed event; GET-only same-origin network.', checks: {}, errors: [] };
  try {
    const base = 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
    browser = await chromium.launch({ headless: true });
    for (const boundary of baseline ? ['snapshot'] : ['publication', 'catalog', 'snapshot']) {
      const held = gate(), entered = gate();
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        await context.addInitScript(() => {
          localStorage.setItem('app.locale', 'ru');
          window.__holdInitialRefresh = true;
          for (const type of ['localdb:changed', 'localdb:refresh']) window.addEventListener(type, event => {
            if (window.__holdInitialRefresh) event.stopImmediatePropagation();
          }, true);
        });
        await context.route('**/*', route => {
          const req = route.request(), url = new URL(req.url());
          return url.origin === base && ['GET', 'HEAD'].includes(req.method()) ? route.continue() : route.abort();
        });
        await context.route('**/api/public-corpora**', async route => {
          const pathname = new URL(route.request().url()).pathname;
          const phase = pathname === '/api/public-corpora' ? 'publication' : pathname.endsWith('/works/' + work) ? 'snapshot' : pathname === '/api/public-corpora/' + slug ? 'catalog' : null;
          if (phase === boundary) { entered.resolve(true); await held.promise; }
          const body = phase === 'publication' ? { ok: true, corpora: [published.corpus] } : phase === 'snapshot' ? { ...published, item: { ...item, snapshot }, assets: [] } : published;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await context.route('**/js/library-ui.js?*', async route => {
          const response = await route.fetch();
          const source = baseline ? execFileSync('git', ['show', ref + ':public/js/library-ui.js'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 }) : await response.text();
          return route.fulfill({ response, body: source + '\nwindow.__initialRefreshTest = { state: () => ({ epoch: readerOpenEpoch, token: corpusRenderToken, dirty: externalLibraryDirty, hidden: document.getElementById("roomReader").hidden }), waitExternal: () => externalLibraryRefresh };' });
        });
        await context.route('**/library.html?public_corpus=' + slug + '**', async route => {
          const response = await route.fetch({ url: base + '/library.html' }); return route.fulfill({ response });
        });
        page = await context.newPage(); page.setDefaultTimeout(30000);
        page.on('pageerror', error => report.errors.push(error.message));
        await page.goto(base + '/library.html?public_corpus=' + slug + '&public_work=' + work + '&canon=skip&corpus=skip', { waitUntil: 'domcontentloaded' });
        let timer;
        try { await Promise.race([entered.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Boundary not reached: ' + boundary)), 30000); })]); }
        finally { clearTimeout(timer); }
        const trace = await page.evaluate(async () => {
          const before = __initialRefreshTest.state(); window.__holdInitialRefresh = false;
          window.dispatchEvent(new CustomEvent('localdb:changed'));
          await __initialRefreshTest.waitExternal();
          return { before, after: __initialRefreshTest.state() };
        });
        held.resolve(); await page.evaluate(() => __roomSettled);
        const result = { trace, rows: await page.locator('#roomReaderTable tbody tr').count(), state: await page.evaluate(() => __initialRefreshTest.state()) };
        report.checks[boundary] = result;
        assert.equal(result.rows, baseline ? 0 : 2);
        assert.equal(result.state.hidden, baseline);
        if (baseline) assert.ok(trace.after.token > trace.before.token);
        else { assert.equal(trace.before.token, trace.after.token); assert.equal(trace.after.dirty, true); }
        console.log(boundary, JSON.stringify(result));
      } catch (error) {
        report.diagnostic = await page?.evaluate(() => ({ url: location.href, dbReady: window.__localDB?.isReady(), state: window.__initialRefreshTest?.state(), text: document.getElementById('roomContent')?.innerText?.slice(0, 1200) })).catch(() => null);
        throw error;
      } finally { held.resolve(); await context.close(); }
    }
    assert.deepEqual(report.errors, []); report.result = 'PASS';
  } catch (error) {
    report.result = 'FAIL'; report.failure = error.stack;
    throw error;
  } finally { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); await browser?.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
