'use strict';
// Real unmodified SW + streamed HTTP fixtures, disposable origin/server/profile.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, '.tmp/room-discovery-sw-preview'), LIMIT = 131072, CHUNK = 16384;
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const child = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-preview-sw-')), 0), silent: true, windowsHide: true });
  child.stdout.resume(); child.stderr.resume();
  const transfers = [], checks = []; let proxy, browser;
  try {
    const appPort = await waitForSmokeServer(child, 30000);
    proxy = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://fixture');
      if (url.pathname === '/preview-probe.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<!doctype html><title>Disposable SW preview probe</title><script src="/js/corpus-discovery-core.js"></script><script src="/js/corpus-discovery-browser.js"></script>');
      }
      const match = /^\/data\/benyehuda\/works\/(91000[1-5])\.json$/.exec(url.pathname);
      if (match) {
        const id = match[1], large = !['910001','910005'].includes(id), honorsRange = id !== '910003' && id !== '910004';
        const json = JSON.stringify({ library: { texts: [{ rows: [{ hebrew_plain: 'שלום', russian: 'Fixture only' }] }] } });
        const bytes = Buffer.from(large ? json + ' '.repeat(1048576 - Buffer.byteLength(json)) : json);
        const ranged = req.headers.range === 'bytes=0-131071' && honorsRange;
        const payload = ranged ? bytes.subarray(0, LIMIT) : bytes;
        const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
        if (ranged) { headers['Content-Range'] = 'bytes 0-' + (payload.length - 1) + '/' + bytes.length; headers['Content-Length'] = String(payload.length); }
        else if (honorsRange) headers['Content-Length'] = String(payload.length);
        res.writeHead(ranged ? 206 : 200, headers);
        const transfer = { id, preview: url.searchParams.has('preview'), range: req.headers.range || null, total: bytes.length, sent: 0, finished: false, closed: false }; transfers.push(transfer);
        let timer;
        const send = () => {
          if (res.destroyed) return;
          if (transfer.sent >= payload.length) { transfer.finished = true; return res.end(); }
          const end = Math.min(transfer.sent + CHUNK, payload.length); res.write(payload.subarray(transfer.sent, end)); transfer.sent = end;
          timer = setTimeout(send, 15);
        };
        res.on('close', () => { transfer.closed = true; clearTimeout(timer); }); send(); return;
      }
      const upstream = http.request({ hostname: '127.0.0.1', port: appPort, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:' + appPort } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(upstream);
    });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + proxy.address().port;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'allow' }); context.setDefaultTimeout(30000);
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/preview-probe.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await Promise.race([navigator.serviceWorker.ready, new Promise((_,reject) => setTimeout(() => reject(new Error('SW ready timeout')), 25000))]);
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const worker = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    assert.equal(worker, base + '/sw.js');
    const load = id => page.evaluate(async id => {
      try { const rows = await CorpusDiscoveryBrowser.loadRows({ id, file: 'works/' + id + '.json' }); return { rows: rows.length }; }
      catch (error) { return { error: error.message }; }
    }, id);
    assert.deepEqual(await load('910001'), { rows: 1 });
    checks.push({ name: 'small preview succeeds under actual active SW', result: 'pass' });
    assert.match((await load('910002')).error, /budget/);
    await page.waitForTimeout(150);
    const rangeTransfer = transfers.find(t => t.id === '910002'); assert.ok(rangeTransfer.sent <= LIMIT); assert.equal(rangeTransfer.range, 'bytes=0-131071');
    checks.push({ name: 'range-enabled large work never sends more than the byte limit', result: 'pass', evidence: rangeTransfer });
    assert.match((await load('910003')).error, /budget/);
    await page.waitForTimeout(300);
    const chunked = transfers.find(t => t.id === '910003'); assert.ok(chunked.closed); assert.ok(!chunked.finished); assert.ok(chunked.sent <= LIMIT + 2 * CHUNK); assert.ok(chunked.sent < chunked.total);
    checks.push({ name: 'range-ignoring chunked response stops at stream cancellation; no background full fetch', result: 'pass', evidence: chunked });
    const canceled = await page.evaluate(async () => {
      const controller = new AbortController(); setTimeout(() => controller.abort(), 50);
      try { await CorpusDiscoveryBrowser.loadRows({ id: '910004', file: 'works/910004.json' }, { signal: controller.signal }); return false; }
      catch (error) { return error.name === 'AbortError'; }
    });
    assert.equal(canceled, true); await page.waitForTimeout(300);
    const cancellation = transfers.find(t => t.id === '910004'); assert.ok(cancellation.closed); assert.ok(!cancellation.finished); assert.ok(cancellation.sent < LIMIT);
    checks.push({ name: 'closing an in-flight preview cancels the native transfer under active SW', result: 'pass', evidence: cancellation });
    const previewEntries = await page.evaluate(async () => {
      const result = []; for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) if (new URL(req.url).searchParams.has('preview')) result.push(req.url); return result;
    }); assert.deepEqual(previewEntries, []);
    checks.push({ name: 'preview requests create no CacheStorage entries', result: 'pass' });
    const normalPath = '/data/benyehuda/works/910005.json?v=7';
    assert.equal(await page.evaluate(async path => (await (await fetch(path)).json()).library.texts[0].rows.length, normalPath), 1);
    await page.waitForFunction(async path => !!(await caches.match(path)), normalPath);
    await context.setOffline(true);
    assert.equal(await page.evaluate(async path => (await (await fetch(path)).json()).library.texts[0].rows.length, normalPath), 1);
    await context.setOffline(false);
    checks.push({ name: 'ordinary full reading still caches and remains readable offline', result: 'pass' });
    assert.deepEqual(errors, []);
    const report = { checks, worker, swSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'public/sw.js'))).digest('hex'), scope: 'Actual production SW source with streamed disposable HTTP fixtures; no owner data or production mutation' };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: 'pass', checks: checks.length, transfers, out: OUT }));
  } finally { await browser?.close(); proxy?.closeAllConnections(); if (proxy) await new Promise(resolve => proxy.close(resolve)); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
