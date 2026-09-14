'use strict';
// Real Studio -> Room navigation with a working row selected less than the
// 350 ms debounce before leaving. A page entering the back/forward cache stops
// its DB worker at pagehide, so the navigation helper must write the pending
// row first. Isolated synthetic profile; no provider calls or owner data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../public');
const engine = process.env.MULTITAB_ENGINE || 'chromium';
const backend = process.env.STUDIO_BACKEND || (engine === 'webkit' ? 'tts-opfs-idb' : 'AccessHandlePool');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Navigation progress fixture</title>'); return; }
  // Same split as server.js: compatible shells serve the same files without COEP.
  const compatible = { '/study-studio.html': '/index.html', '/study-library.html': '/library.html' }[url.pathname];
  if (compatible) res.removeHeader('Cross-Origin-Embedder-Policy');
  const file = path.resolve(root, '.' + (compatible || url.pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[engine].launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const watchdog = setTimeout(() => { console.error('WATCHDOG'); process.exit(2); }, 150000);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(base + '/fixture');
    await page.evaluate(async backend => {
      localStorage.setItem('opfsVfsPreference_v1', backend);
      localStorage.setItem('localMode', '1');
      const db = await import('/db/local-db.js');
      await db.initLocalDB();
      await db.createText({ id: 'nav-flush-text', text_key: 'nav-flush-text', title: 'Navigation flush fixture', source_text: 'שלום' });
      await db.setProgress('nav-flush-text', { last_row_idx: 2 });
      await db.closeLocalDB();
    }, backend);
    // Browsers without iframe credentialless use the compatible shells (compatibleShellRedirect).
    const shells = await page.evaluate(() => window.crossOriginIsolated === true && !('credentialless' in HTMLIFrameElement.prototype))
      ? { studio: '/study-studio.html', room: '/study-library.html' } : { studio: '/index.html', room: '/library.html' };
    await page.goto(base + shells.studio, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.v3NavAwayWithDbClose === 'function' && typeof window.v3FlushPendingProgress === 'function' && !!window.__localDB);
    const pending = await page.evaluate(async () => {
      await window.__localDBInitPromise;
      window.v3SetActiveTextId('nav-flush-text');
      v3DebouncedSaveProgress(7);
      const timerPending = !!v3ProgressTimers['nav-flush-text'];
      void window.v3NavAwayWithDbClose('/library.html');
      return timerPending;
    });
    assert.equal(pending, true, 'the row write is still debounced when navigation starts');
    await page.waitForURL(url => new URL(url).pathname === shells.room);
    const saved = await page.evaluate(async () => {
      const db = await import('/db/local-db.js');
      await db.initLocalDB();
      const progress = await db.getProgress('nav-flush-text');
      await db.closeLocalDB();
      return progress && progress.last_row_idx;
    });
    assert.equal(saved, 7, 'Room sees the row selected just before leaving Studio');
    console.log(JSON.stringify({ engine, backend, result: 'PASS', debouncedRowWrittenBeforeNavigation: true, savedRow: saved }));
  } finally { clearTimeout(watchdog); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
