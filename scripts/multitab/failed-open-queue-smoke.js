'use strict';
// Isolated browser fixture. No production API, owner profile or external traffic.
// Shorten only fixture-served lock deadlines; exercise the real facade/worker/VFS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../public');
const engine = process.env.MULTITAB_ENGINE || 'chromium';
const backend = process.env.STUDIO_BACKEND || 'AccessHandlePool';
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Failed open fixture</title>'); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  if (url.pathname === '/db/operation-lease.js') return res.end(fs.readFileSync(file, 'utf8').replace('waitMs = 30000', 'waitMs = 100'));
  if (url.pathname === '/db/db-worker-runtime.js') return res.end(fs.readFileSync(file, 'utf8').replace('lockTimeoutMillis: 30000', 'lockTimeoutMillis: 100'));
  fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[engine].launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const watchdog = setTimeout(() => void browser.close(), 45000);
  try {
    const page = await context.newPage(); await page.goto(base + '/fixture');
    await page.evaluate(async backend => {
      localStorage.setItem('opfsVfsPreference_v1', backend);
      window.db = await import('/db/local-db.js');
      await db.initLocalDB();
      await db.dbRun("CREATE TABLE IF NOT EXISTS recovery_fixture(id PRIMARY KEY)");
      await db.closeLocalDB();
    }, backend);
    const holder = await context.newPage(); await holder.goto(base + '/fixture');
    const lockName = backend === 'AccessHandlePool' ? 'linguistpro-opfs-db-owner-v1' : '/app.db-outer';
    await holder.evaluate(name => new Promise(resolve => navigator.locks.request(name, () => new Promise(release => {
      window.releaseFixture = release; resolve();
    }))), lockName);
    // Force a fresh worker whose init cannot acquire the fixture-held lock.
    await page.reload();
    const failed = await page.evaluate(async () => {
      window.db = await import('/db/local-db.js');
      const results = await Promise.allSettled([db.initLocalDB(), ...Array.from({ length: 8 }, (_, i) =>
        db.dbRun('INSERT INTO recovery_fixture VALUES (?)', [i]))]);
      const start = performance.now(); await db.closeLocalDB();
      return { rejected: results.filter(row => row.status === 'rejected').length, closeMs: performance.now() - start };
    });
    assert.equal(failed.rejected, 9);
    assert.ok(failed.closeMs < 1000, 'close is not stuck behind repeated failed opens');
    await holder.evaluate(() => releaseFixture());
    const recovered = await page.evaluate(async () => {
      await db.recoverLocalDB();
      const rows = await db.dbQuery('SELECT * FROM recovery_fixture');
      await db.dbRun('INSERT INTO recovery_fixture VALUES (99)');
      const after = await db.dbQuery('SELECT * FROM recovery_fixture');
      const integrity = await db.dbQuery('PRAGMA integrity_check');
      await db.closeLocalDB();
      return { rows, after, integrity };
    });
    assert.deepEqual(recovered.rows, [], 'failed startup writes never execute later');
    assert.deepEqual(recovered.after, [{ id: 99 }]);
    assert.equal(Object.values(recovered.integrity[0])[0], 'ok');
    console.log(JSON.stringify({ engine, backend, result: 'PASS', ...failed, noLateWrites: true, recovery: true, integrity: 'ok' }));
  } finally { clearTimeout(watchdog); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
