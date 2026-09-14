'use strict';
// Real-browser routing gate for browsers without iframe credentialless.
// Owner iPhone videos (3.11.545): the isolated Room booted its database and
// reader, then compatibleShell() navigated to /study-library.html and booted
// again before YouTube could play. The isolated shell must now hand over to the
// compatible shell before any DB worker starts, keeping search and hash.
// COMPAT_SHELL_EXPECT_RED=1 serves the 3.11.545 shells and expects the isolated
// Room to start its own worker. Isolated profile; no provider calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../public');
const engine = process.env.MULTITAB_ENGINE || 'webkit';
const red = process.env.COMPAT_SHELL_EXPECT_RED === '1';
const baseline = execFileSync('git', ['rev-parse', '98ee06be'], { cwd: path.resolve(root, '..'), encoding: 'utf8' }).trim();
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const COMPATIBLE = { '/study-studio.html': '/index.html', '/study-library.html': '/library.html' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Same header split as server.js: compatible shells are the only non-COEP pages.
  if (!COMPATIBLE[url.pathname]) res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (url.pathname === '/probe') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Isolation probe</title>'); return; }
  const pathname = COMPATIBLE[url.pathname] || url.pathname;
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  if (red && ['/index.html', '/library.html'].includes(pathname)) {
    return res.end(execFileSync('git', ['show', `${baseline}:public${pathname}`], { cwd: path.resolve(root, '..') }));
  }
  fs.createReadStream(file).pipe(res);
});

async function openShell(context, base, entry) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  let current = '';
  const commits = [], workers = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) { current = new URL(frame.url()).pathname; commits.push(frame.url()); } });
  page.on('worker', worker => workers.push({ url: new URL(worker.url()).pathname, during: current }));
  // A client redirect interrupts the first document's load: wait for commit only.
  await page.goto(base + entry, { waitUntil: 'commit' });
  return { page, commits, workers };
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[engine].launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const watchdog = setTimeout(() => { console.error('WATCHDOG'); process.exit(2); }, 150000);
  try {
    const probe = await context.newPage(); await probe.goto(base + '/probe');
    // historyLength is the control: one navigation in a fresh tab without a redirect.
    const env = await probe.evaluate(() => ({ isolated: window.crossOriginIsolated === true, credentialless: 'credentialless' in HTMLIFrameElement.prototype, historyLength: history.length }));
    await probe.close();
    assert.equal(env.isolated, true, `${engine} fixture must model a COEP-isolated shell`);
    const compatible = !env.credentialless;

    const room = await openShell(context, base, '/library.html?compat_fixture=1#probe');
    if (compatible && !red) await room.page.waitForURL(url => new URL(url).pathname === '/study-library.html');
    await room.page.waitForLoadState('load');
    await room.page.waitForFunction(() => document.body && document.body.textContent.includes('Читальный зал'));
    await sleep(3000);
    const roomFinal = await room.page.evaluate(() => ({ path: location.pathname, search: location.search, isolated: window.crossOriginIsolated === true,
      historyLength: history.length, player: window.StudioYtPlayer ? window.StudioYtPlayer.capability() : null }));
    const dbWorkers = room.workers.filter(worker => worker.url === '/db/db-worker-runtime.js');
    if (red) {
      assert.equal(compatible, true, 'RED needs a browser without iframe credentialless');
      assert.equal(roomFinal.path, '/library.html');
      assert.ok(dbWorkers.some(worker => worker.during === '/library.html'), 'baseline isolated Room starts its database worker');
      console.log(JSON.stringify({ engine, baseline, result: 'EXPECTED RED', finalPath: roomFinal.path, isolatedRoomWorkers: dbWorkers.length }));
      return;
    }
    if (!compatible) {
      assert.equal(roomFinal.path, '/library.html', 'Chromium keeps the isolated Room');
      assert.equal(roomFinal.isolated, true);
      console.log(JSON.stringify({ engine, result: 'PASS', credentialless: true, redirect: false }));
      return;
    }
    assert.equal(roomFinal.path, '/study-library.html');
    assert.equal(roomFinal.search, '?compat_fixture=1');
    assert.ok(room.commits.some(url => url.endsWith('/study-library.html?compat_fixture=1#probe')), `hash kept through the redirect: ${room.commits}`);
    assert.equal(roomFinal.isolated, false);
    assert.equal(roomFinal.historyLength, env.historyLength, 'replace adds no history entry beyond one plain navigation');
    assert.equal(dbWorkers.some(worker => worker.during === '/library.html'), false, `no DB worker in the isolated Room: ${JSON.stringify(room.workers)}`);
    assert.equal(dbWorkers.length, 1, 'the compatible Room boots its database once');
    if (roomFinal.player) assert.equal(roomFinal.player.supported, true, 'YouTube embeds without another navigation');

    const studio = await openShell(context, base, '/index.html?room=1#/t/fixture');
    await studio.page.waitForURL(url => new URL(url).pathname === '/study-studio.html');
    await studio.page.waitForLoadState('load');
    await studio.page.waitForFunction(() => !!window.__localDB);
    const studioFinal = await studio.page.evaluate(() => ({ path: location.pathname, search: location.search, isolated: window.crossOriginIsolated === true }));
    assert.deepEqual(studioFinal, { path: '/study-studio.html', search: '?room=1', isolated: false });
    assert.equal(studio.workers.some(worker => worker.during === '/index.html'), false, 'no worker in the isolated Studio');
    console.log(JSON.stringify({ engine, result: 'PASS', credentialless: false, roomRedirect: roomFinal.path, studioRedirect: studioFinal.path,
      isolatedShellWorkers: 0, compatibleRoomDbWorkers: dbWorkers.length, historyLength: roomFinal.historyLength }));
  } finally { clearTimeout(watchdog); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
