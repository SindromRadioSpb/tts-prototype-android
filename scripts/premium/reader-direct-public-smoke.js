'use strict';
// Anonymous public GETs in disposable Chromium. --candidate injects only local
// library-ui; --expect-blocked demonstrates the published 815 dependency chain.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const root = path.resolve(__dirname, '../..');
const candidate = process.argv.includes('--candidate');
const expectBlocked = process.argv.includes('--expect-blocked');
const base = arg('base') || 'https://linguistpro.kolosei.com';
const out = path.resolve(arg('out') || path.join(root, '.tmp/reader-performance/direct-public.json'));
const slug = 'media-8c30cc63a5e5e39a0acd', work = 'work-830a3ab937fc3c3f70c60533';
const catalogPath = '/api/public-corpora/' + slug;
const target = base + '/library.html?public_corpus=' + slug + '&public_work=' + work;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = { candidate, expectBlocked, scope: 'Disposable anonymous Chromium; public GETs only, no owner profile. Delayed dependencies test, not normal-network timing benchmark.', checks: {}, errors: [] };
  try {
    async function scenario(kind) {
      const unrelated = deferred(), catalog = deferred(), material = deferred();
      const requests = [], responses = [], warnings = []; let heldUnrelated = 0, catalogAttempts = 0, enteredMaterial = false;
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } });
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base || !['GET', 'HEAD'].includes(request.method())) return route.abort();
        requests.push(url.pathname);
        // Canon is deliberately unavailable in these focused routing checks;
        // no canon transaction is needed to read the requested public work.
        if (/\/canon-v\d+\.zip$/.test(url.pathname) && kind !== 'material-switch') return route.abort();
        if (url.pathname === '/api/group-corpora' || /\/corpus-catalog-v\d+\.json$/.test(url.pathname)) {
          heldUnrelated++; await unrelated.promise;
        }
        if (url.pathname === catalogPath) {
          catalogAttempts++;
          if (kind === 'retry' && catalogAttempts === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          if (kind === 'catalog-race') await catalog.promise;
        }
        if (url.pathname === catalogPath + '/works/' + work && ['material-race', 'material-switch'].includes(kind)) {
          enteredMaterial = true; await material.promise;
        }
        return route.continue();
      });
      await context.route('**/js/library-ui.js?*', async route => {
        const response = await route.fetch();
        const source = candidate ? fs.readFileSync(path.join(root, 'public/js/library-ui.js'), 'utf8') : await response.text();
        report.testedModuleSha256 = crypto.createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
        await route.fulfill({ response, body: source + '\nwindow.__directPublicTest = { navigate: corpusNavToCorpus, ensurePublicCatalog, closeReader, openPublicCorpusWork };' });
      });
      await context.addInitScript(() => {
        localStorage.setItem('app.locale', 'ru'); localStorage.setItem('phase6Decision_v1', 'declined');
      });
      const page = await context.newPage(); page.setDefaultTimeout(60000);
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400 || new URL(response.url()).pathname.startsWith('/api/public-corpora')) responses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
      page.on('console', message => { if (['warning', 'error'].includes(message.type()) && warnings.length < 20) warnings.push(message.text().slice(0, 400)); });
      const started = Date.now();
      try {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        if (expectBlocked) {
          await page.waitForFunction(() => window.__localDB?.isReady());
          await page.waitForTimeout(3000);
          assert.ok(heldUnrelated > 0); assert.equal(catalogAttempts, 0);
          assert.equal(await page.locator('#roomReaderTable tbody tr').count(), 0);
          return { blockedBeforeRequestedCatalog: true, unrelatedHeld: heldUnrelated };
        }
        if (kind === 'retry') {
          await page.locator('#roomContent .room-state-retry').waitFor();
          assert.equal(new URL(page.url()).searchParams.get('public_work'), work);
          await page.locator('#roomContent .room-state-retry').click();
        }
        if (kind === 'material-switch') {
          const until = Date.now() + 60000;
          while (!enteredMaterial && Date.now() < until) await page.waitForTimeout(50);
          assert.ok(enteredMaterial, 'initial material request entered');
          const next = await page.evaluate(async ({ slug, work }) => {
            const catalog = await __directPublicTest.ensurePublicCatalog(slug);
            const card = catalog.items.find(item => item.public_work_id !== work);
            if (!card) throw new Error('Second public work required');
            window.__nextPublicOpen = __directPublicTest.openPublicCorpusWork(slug, card);
            return card.public_work_id;
          }, { slug, work });
          material.resolve(); unrelated.resolve();
          assert.equal(await page.evaluate(() => window.__nextPublicOpen), true);
          await page.evaluate(() => window.__roomSettled);
          assert.equal(new URL(page.url()).searchParams.get('public_work'), next);
          assert.equal(await page.locator('#roomReader').evaluate(el => el.hidden), false);
          const canon = await page.evaluate(() => __localDB.getShelves());
          assert.ok(canon.some(shelf => Number(shelf.canon_version) >= 4), 'background canon actually imported');
          assert.equal(catalogAttempts, 1);
          return { newerMaterialPreserved: true, backgroundCanonImported: true, catalogAttempts,
            rows: await page.locator('#roomReaderTable tbody tr').count() };
        }
        if (kind === 'catalog-race' || kind === 'material-race') {
          await page.waitForFunction(() => window.__directPublicTest && window.__localDB?.isReady());
          const until = Date.now() + 60000;
          while (!(kind === 'catalog-race' ? catalogAttempts : enteredMaterial) && Date.now() < until) await page.waitForTimeout(50);
          assert.ok(kind === 'catalog-race' ? catalogAttempts : enteredMaterial, 'requested dependency entered');
          await page.evaluate(() => __directPublicTest.navigate('mytexts'));
          catalog.resolve(); material.resolve(); unrelated.resolve();
          await page.evaluate(() => window.__roomSettled);
          assert.equal(await page.locator('#roomReader').evaluate(el => el.hidden), true);
          assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('room'), 'mytexts');
          return { lateOpenSuppressed: true, catalogAttempts };
        }
        await page.waitForFunction(() => {
          const table = document.querySelector('#roomReaderTable');
          const reader = document.getElementById('roomReader');
          if (!reader || reader.hidden || !table || table.querySelectorAll('tbody tr').length !== 499) return false;
          return Array.from(table.querySelectorAll('.rm-w')).some(word => { const r = word.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; });
        });
        const firstVisibleWordMs = Date.now() - started;
        assert.equal(new URL(page.url()).searchParams.get('public_work'), work);
        assert.equal(catalogAttempts, kind === 'retry' ? 2 : 1);
        assert.equal(requests.filter(url => /\/corpus-index-v\d+\.json$/.test(url)).length, 0, 'no unrelated full index');
        const table = await page.locator('#roomReaderTable tbody tr').count();
        // Releasing background catalog/group work must not replace the reader.
        unrelated.resolve();
        await page.evaluate(() => window.__roomSettled);
        assert.equal(await page.locator('#roomReader').evaluate(el => el.hidden), false);
        assert.equal(await page.locator('#roomReaderTable tbody tr').count(), table);
        if (kind === 'open') {
          await page.evaluate(() => __directPublicTest.closeReader());
          await page.waitForFunction(() => document.getElementById('roomReader').hidden);
          assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('room'), 'public:' + slug);
          assert.equal(catalogAttempts, 1, 'Back reuses the validated catalog');
        }
        return { rows: table, firstVisibleWordMs, catalogAttempts, unrelatedHeld: heldUnrelated, backgroundPreservedReader: true };
      } catch (error) {
        report.diagnostic = { scenario: kind, catalogAttempts, heldUnrelated, requests, responses, warnings,
          page: await page.evaluate(() => ({ url: location.href, dbReady: window.__localDB?.isReady(), rows: document.querySelectorAll('#roomReaderTable tbody tr').length, text: document.getElementById('roomContent')?.innerText?.slice(0, 1600) })).catch(() => null) };
        throw error;
      } finally { unrelated.resolve(); catalog.resolve(); material.resolve(); await context.close(); }
    }
    for (const name of expectBlocked ? ['baseline'] : ['open', 'retry', 'catalog-race', 'material-race', 'material-switch']) {
      report.checks[name] = await scenario(name); console.log(name, JSON.stringify(report.checks[name]));
    }
    assert.deepEqual(report.errors, []); report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.failure = error.stack; throw error; }
  finally { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
