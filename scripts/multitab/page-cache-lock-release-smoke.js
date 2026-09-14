'use strict';
// Isolated real-browser regression for back/forward-cache DB lock release.
// Owner iPhone evidence (3.11.544): a document entered the back/forward cache
// with DB work queued; WebKit suspended its dedicated worker while it held the
// library lock, and the next document in the tab waited indefinitely.
// Playwright never puts these pages into that cache, so the fixture controls
// both parts directly: a worker that stops running (busy loop, like a
// suspended worker that still owns its locks) and a real
// pagehide/pageshow(persisted) event pair on the page.
// PAGE_CACHE_EXPECT_RED=1 serves the 3.11.544 facade and worker and expects
// the second document to stay blocked. No owner data, reset or lock stealing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../public');
const engine = process.env.MULTITAB_ENGINE || 'chromium';
const backend = process.env.STUDIO_BACKEND || (engine === 'webkit' ? 'tts-opfs-idb' : 'AccessHandlePool');
const red = process.env.PAGE_CACHE_EXPECT_RED === '1';
const baseline = execFileSync('git', ['rev-parse', '0b0c9770'], { cwd: path.resolve(root, '..'), encoding: 'utf8' }).trim();
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };
const DB_LOCKS = ['linguistpro-opfs-db-owner-v1', '/app.db-outer', '/app.db-reserved'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const inject = (source, from, to) => { assert.ok(source.includes(from), `fixture injection point missing: ${from}`); return source.replace(from, to); };
const read = name => red && ['local-db.js', 'db-worker-runtime.js'].includes(name)
  ? execFileSync('git', ['show', `${baseline}:public/db/${name}`], { cwd: path.resolve(root, '..'), encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'db', name), 'utf8');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Page cache fixture</title>'); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  if (url.pathname === '/db/local-db.js') return res.end(read('local-db.js'));
  if (url.pathname === '/db/operation-lease.js') return res.end(inject(fs.readFileSync(file, 'utf8'), 'waitMs = 30000', 'waitMs = 3000'));
  if (url.pathname === '/db/db-worker-runtime.js') {
    let source = inject(read('db-worker-runtime.js'), 'lockTimeoutMillis: 30000', 'lockTimeoutMillis: 3000');
    source = inject(source, 'const { id, type, sql, params, preferVfs } = data;',
      "const { id, type, sql, params, preferVfs } = data;\n  if (sql === \"SELECT 'fixture-freeze'\") { const end = Date.now() + 10000; while (Date.now() < end) {} return; }");
    return res.end(source);
  }
  fs.createReadStream(file).pipe(res);
});
const cacheEvent = (page, type) => page.evaluate(type => { window.dispatchEvent(new PageTransitionEvent(type, { persisted: true })); }, type);
const heldDbLocks = page => page.evaluate(async names => (await navigator.locks.query()).held.map(row => row.name).filter(name => names.includes(name)), DB_LOCKS);
const readWithin = (page, ms) => page.evaluate(async ms => {
  window.db = window.db || await import('/db/local-db.js');
  const attempt = (async () => { await db.initLocalDB(); return { ok: true, rows: await db.dbQuery('SELECT id FROM cache_fixture ORDER BY id') }; })()
    .catch(error => ({ ok: false, code: error.code || null, message: String(error.message || error).slice(0, 120) }));
  return Promise.race([attempt, new Promise(resolve => setTimeout(() => resolve({ ok: false, code: 'FIXTURE_BLOCKED' }), ms))]);
}, ms);

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[engine].launch();
  const watchdog = setTimeout(() => { console.error('WATCHDOG'); process.exit(2); }, 150000);
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const cached = await context.newPage(); await cached.goto(base + '/fixture');
    const reviewsBefore = await cached.evaluate(async backend => {
      localStorage.setItem('opfsVfsPreference_v1', backend);
      window.db = await import('/db/local-db.js'); await db.initLocalDB();
      await db.dbRun('CREATE TABLE cache_fixture (id INTEGER PRIMARY KEY, v TEXT)');
      await db.dbRun("INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,meta_json) VALUES('cache-review','lemma:שלום','review','2026-09-14',3,'fixture','{}')");
      return db.dbQuery('SELECT * FROM review_log ORDER BY id');
    }, backend);

    // Cycle 1: an open transaction and a worker that stops running when the
    // document enters the cache (owner Incognito report: Room mid-transaction).
    await cached.evaluate(async () => {
      await db.dbRun('BEGIN IMMEDIATE');
      await db.dbRun("INSERT INTO cache_fixture VALUES (1, 'uncommitted')");
      window.frozenWork = db.dbQuery("SELECT 'fixture-freeze'").then(() => 'resolved', error => error.code || 'error');
    });
    await sleep(300);
    await cacheEvent(cached, 'pagehide');
    const next = await context.newPage(); await next.goto(base + '/fixture');
    const firstRead = await readWithin(next, 6000);
    if (red) {
      assert.equal(firstRead.ok, false, `baseline must reproduce the retained lock: ${JSON.stringify(firstRead)}`);
      console.log(JSON.stringify({ engine, backend, baseline, result: 'EXPECTED RED', secondDocument: firstRead }));
      return;
    }
    assert.deepEqual(firstRead, { ok: true, rows: [] }, 'the next document reads; the cached transaction was rolled back');
    assert.equal(await cached.evaluate(() => window.frozenWork), 'DB_PAGE_SUSPENDED');
    await next.evaluate(() => db.closeLocalDB());
    assert.deepEqual(await heldDbLocks(next), [], 'the cached document keeps no DB lock');
    await cacheEvent(cached, 'pageshow');
    const resumed = await cached.evaluate(async () => {
      const late = await db.dbRun("INSERT INTO cache_fixture VALUES (3, 'late continuation')").then(() => 'ok', error => error.code);
      const rollback = await db.dbRun('ROLLBACK').then(() => 'ok', error => error.code);
      await db.dbRun("INSERT INTO cache_fixture VALUES (4, 'after resume')");
      return { late, rollback, ready: db.isReady(), rows: await db.dbQuery('SELECT id FROM cache_fixture ORDER BY id') };
    });
    assert.deepEqual(resumed, { late: 'DB_TRANSACTION_ABORTED', rollback: 'ok', ready: true, rows: [{ id: 4 }] },
      'a rolled-back transaction never continues as autocommit writes');

    // Cycle 2: queued reads plus a write issued by a pagehide handler after
    // the worker was stopped (owner normal report: Studio boot burst).
    await cached.evaluate(() => { window.frozenRead = db.dbQuery("SELECT 'fixture-freeze'").then(() => 'resolved', error => error.code || 'error'); });
    await sleep(300);
    await cacheEvent(cached, 'pagehide');
    await cached.evaluate(() => {
      window.hideWrite = db.dbRun("INSERT INTO cache_fixture VALUES (5, 'written by pagehide handler')").then(() => 'ok', error => error.code || 'error');
      window.available = db.whenAvailable().then(() => db.isReady());
    });
    const whileCached = await readWithin(next, 6000);
    assert.deepEqual(whileCached, { ok: true, rows: [{ id: 4 }] }, 'a cached page does not block; its deferred write has not run');
    assert.equal(await cached.evaluate(() => window.frozenRead), 'DB_PAGE_SUSPENDED');
    await next.evaluate(() => db.closeLocalDB());
    await cacheEvent(cached, 'pageshow');
    const shown = await cached.evaluate(async () => ({ hideWrite: await window.hideWrite, available: await window.available,
      rows: await db.dbQuery('SELECT id FROM cache_fixture ORDER BY id'), integrity: await db.dbQuery('PRAGMA integrity_check'),
      reviews: await db.dbQuery('SELECT * FROM review_log ORDER BY id') }));
    assert.deepEqual(shown, { hideWrite: 'ok', available: true, rows: [{ id: 4 }, { id: 5 }], integrity: [{ integrity_check: 'ok' }], reviews: reviewsBefore });
    await cached.evaluate(() => db.closeLocalDB());
    console.log(JSON.stringify({ engine, backend, result: 'PASS', nextDocumentNotBlocked: true, cachedTransactionRolledBack: true,
      lateContinuationRejected: true, deferredPagehideWrite: true, integrity: 'ok', reviewLogUnchanged: true }));
  } finally { clearTimeout(watchdog); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
