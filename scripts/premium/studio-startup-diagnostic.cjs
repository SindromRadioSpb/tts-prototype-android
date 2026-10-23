'use strict';
// O-132: separate module readiness from DB/worker readiness before retrying.
// Every profile is disposable; remote requests are same-origin GET/HEAD only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const arg = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const root = path.resolve(__dirname, '../..');
const out = path.resolve(arg('out') || path.join(root, '.tmp/reader-performance/studio-startup.json'));
const remote = arg('base');
const rounds = Number(arg('rounds') || 4);
const fault = arg('fault');
assert.ok(Number.isInteger(rounds) && rounds > 0 && rounds <= 20);
assert.ok(!fault || ['module', 'worker', 'wasm'].includes(fault));
const report = { startedAtUtc: new Date().toISOString(), scope: 'Disposable Chromium profiles; empty local DB, cold document then warm reload. No owner data or paid calls.',
  cachePolicy: 'fresh browser context then same-context reload; routing disables HTTP cache; service workers blocked; DB phase journal enabled', runs: [] };

async function snapshot(page) {
  return page.evaluate(() => {
    window.__startupSample?.();
    return {
    url: location.pathname, readyState: document.readyState, ...window.__startupDiagnostic,
    initError: window.__localDBInitError?.message || null,
    dbError: window.__localDB?.getDbError?.()?.code || null,
    dbDiagnostics: window.__localDB?.getLastDbDiagnostics?.() || null,
    vfs: window.__localDB?.getVfsInfo?.() || null,
    journal: JSON.parse(localStorage.getItem('localdb-diagnostic-journal-v1') || '[]'),
    resources: performance.getEntriesByType('resource').filter(e => /\/db\/|\/js\/(?:word-gloss-ai|studio-morph)\.js/.test(e.name))
      .map(e => ({ path: new URL(e.name).pathname, start: e.startTime, duration: e.duration, bytes: e.transferSize })),
    capturedAtMs: performance.now(),
  }; });
}

(async () => {
  const server = remote ? null : fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: root,
    env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-studio-startup-')), 0), silent: true, windowsHide: true });
  server?.stdout.resume(); server?.stderr.resume();
  let browser;
  try {
    const base = remote || 'http://127.0.0.1:' + await waitForSmokeServer(server, 30000);
    if (remote) {
      assert.ok(arg('version'), '--version is required for production diagnostics');
      report.version = (await (await fetch(base + '/api/client-config?verify=' + Date.now())).json()).version;
      assert.equal(report.version, arg('version'));
    }
    browser = await chromium.launch({ headless: true });
    report.browserVersion = browser.version();
    for (let round = 0; round < rounds; round++) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
      const denied = [], held = [];
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== base || !['GET', 'HEAD'].includes(req.method())) {
          denied.push({ path: url.pathname, method: req.method() });
          return route.abort();
        }
        if ((fault === 'module' && url.pathname === '/js/word-gloss-ai.js') || (fault === 'worker' && url.pathname === '/db/db-worker-runtime.js')) return route.abort();
        if (fault === 'wasm' && url.pathname === '/db/wa-sqlite.mjs') { held.push(route); return; }
        return route.continue();
      });
      await context.addInitScript(() => {
        localStorage.setItem('app.locale', 'ru');
        localStorage.setItem('phase6Decision_v1', 'declined');
        localStorage.setItem('onboardingSeen_v1', '1');
        localStorage.setItem('studio.wordGlossAi', '0');
        localStorage.setItem('localdb-diagnostic-until-v1', String(Date.now() + 15 * 60 * 1000));
        const d = window.__startupDiagnostic = { transitions: [], first: {}, longTasks: [] };
        let previous;
        const sample = () => {
          const flags = { dbModule: !!window.__localDB, dbReady: !!window.__localDB?.isReady(),
            morph: !!window.StudioMorph, gloss: !!window.WordGlossAI, initPromise: !!window.__localDBInitPromise };
          for (const [key, value] of Object.entries(flags)) if (value && d.first[key] == null) d.first[key] = performance.now();
          if (JSON.stringify(flags) !== previous) {
            previous = JSON.stringify(flags); d.transitions.push({ at: performance.now(), ...flags });
          }
          d.flags = flags;
        };
        window.__startupSample = sample;
        setInterval(sample, 50); sample();
        try { new PerformanceObserver(list => {
          for (const e of list.getEntries()) if (d.longTasks.length < 100) d.longTasks.push({ at: e.startTime, duration: e.duration });
        }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
      });
      const page = await context.newPage();
      for (const phase of ['cold', 'reload']) {
        const run = { round: round + 1, phase, fault: fault || null, errors: [], warnings: [], failedRequests: [], httpErrors: [], workers: [] };
        report.runs.push(run);
        const pending = new Map();
        const request = req => pending.set(req, { path: new URL(req.url()).pathname, started: Date.now() });
        const finished = req => pending.delete(req);
        const pageError = e => run.errors.push(e.message);
        const consoleMessage = msg => { if (['warning', 'error'].includes(msg.type()) && run.warnings.length < 20) run.warnings.push(msg.text().slice(0, 400)); };
        const failed = req => run.failedRequests.push({ path: new URL(req.url()).pathname, error: req.failure()?.errorText });
        const response = res => { if (res.status() >= 400) run.httpErrors.push({ path: new URL(res.url()).pathname, status: res.status() }); };
        const worker = w => { const entry = { path: new URL(w.url()).pathname, closed: false }; run.workers.push(entry); w.on('close', () => { entry.closed = true; }); };
        page.on('pageerror', pageError); page.on('console', consoleMessage); page.on('requestfailed', failed); page.on('response', response); page.on('worker', worker);
        context.on('request', request); context.on('requestfinished', finished); context.on('requestfailed', finished);
        try {
          await page.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForFunction(() => window.__localDB?.isReady() && window.StudioMorph && window.WordGlossAI, null, { timeout: fault ? 5000 : 60000 });
          run.result = 'PASS';
        } catch (e) { run.result = 'FAIL'; run.failure = e.message.split('\n')[0]; }
        run.diagnostic = await snapshot(page).catch(e => ({ snapshotError: e.message }));
        run.pendingRequests = Array.from(pending.values(), ({ path, started }) => ({ path, elapsedMs: Date.now() - started }));
        page.off('pageerror', pageError); page.off('console', consoleMessage); page.off('requestfailed', failed); page.off('response', response); page.off('worker', worker);
        context.off('request', request); context.off('requestfinished', finished); context.off('requestfailed', finished);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ round: run.round, phase, result: run.result, flags: run.diagnostic.flags, first: run.diagnostic.first, vfs: run.diagnostic.vfs }));
        if (run.result === 'FAIL') break; // Save the original failure before any retry.
      }
      report.deniedRequests = [...(report.deniedRequests || []), ...denied];
      for (const route of held) await route.abort().catch(() => {});
      await context.close();
      if (report.runs.some(r => r.result === 'FAIL')) break;
    }
    if (fault) {
      const run = report.runs.at(-1);
      assert.equal(run.result, 'FAIL', 'Injected failure must be detected');
      assert.equal(run.diagnostic.flags?.[fault === 'module' ? 'gloss' : 'dbReady'], false);
      if (fault === 'wasm') {
        assert.ok(run.pendingRequests.some(r => r.path === '/db/wa-sqlite.mjs'));
        assert.ok(run.diagnostic.journal.some(j => j.events.some(e => e.phase === 'loading-wasm-sync-module')));
      } else assert.ok(run.failedRequests.some(r => r.path === (fault === 'module' ? '/js/word-gloss-ai.js' : '/db/db-worker-runtime.js')));
      report.result = 'EXPECTED_FAILURE_CAPTURED';
    } else {
      assert.ok(report.runs.every(r => r.result === 'PASS'), 'Unexplained startup failure; inspect original diagnostic before retry');
      report.result = 'PASS';
    }
    assert.ok(!(report.deniedRequests || []).some(r => !['GET', 'HEAD'].includes(r.method)), 'No application writes or paid requests');
  } finally {
    await browser?.close(); server?.kill();
    report.completedAtUtc = new Date().toISOString();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
