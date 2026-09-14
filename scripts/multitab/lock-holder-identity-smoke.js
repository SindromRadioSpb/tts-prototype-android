'use strict';
// Isolated real-browser gate for opt-in DB lock-holder identity diagnostics.
// A real worker holds the library's DB lock in an open transaction; another
// document's worker waits. The support page must identify both by labels,
// without raw client ids, SQL, titles, lock stealing, reset or backend switch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../public');
const engine = process.env.MULTITAB_ENGINE || 'chromium';
const backend = process.env.STUDIO_BACKEND || (engine === 'webkit' ? 'tts-opfs-idb' : 'AccessHandlePool');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };
const DB_LOCKS = new Set(['linguistpro-opfs-db-owner-v1', '/app.db-outer', '/app.db-reserved']);
const inject = (source, from, to) => { assert.ok(source.includes(from), `fixture injection point missing: ${from}`); return source.replace(from, to); };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Lock identity fixture</title>'); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  // Fixture-only deadlines so the waiter's timeout is observed within seconds.
  if (url.pathname === '/db/operation-lease.js') return res.end(inject(fs.readFileSync(file, 'utf8'), 'waitMs = 30000', 'waitMs = 4000'));
  if (url.pathname === '/db/db-worker-runtime.js') return res.end(inject(fs.readFileSync(file, 'utf8'), 'lockTimeoutMillis: 30000', 'lockTimeoutMillis: 4000'));
  fs.createReadStream(file).pipe(res);
});
const readReport = async inspector => JSON.parse(await inspector.locator('#report').inputValue());

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[engine].launch();
  const watchdog = setTimeout(() => { console.error('WATCHDOG'); process.exit(2); }, 150000);
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    // Observer-effect guard: without opt-in recording no identity lock exists.
    const plain = await context.newPage(); await plain.goto(base + '/fixture');
    const plainLocks = await plain.evaluate(async backend => {
      localStorage.setItem('opfsVfsPreference_v1', backend);
      localStorage.removeItem('localdb-diagnostic-until-v1');
      const db = await import('/db/local-db.js'); await db.initLocalDB();
      await db.dbRun('CREATE TABLE IF NOT EXISTS identity_fixture (id INTEGER PRIMARY KEY)');
      await db.dbRun("INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,meta_json) VALUES('identity-review','lemma:שלום','review','2026-09-14',3,'fixture','{}')");
      await db.closeLocalDB();
      return (await navigator.locks.query()).held.map(row => row.name);
    }, backend);
    assert.equal(plainLocks.some(name => name.startsWith('linguistpro-diag-id-v1')), false, 'identity locks are opt-in');
    const reviewsBefore = await plain.evaluate(async () => { const db = await import('/db/local-db.js'); const rows = await db.dbQuery('SELECT * FROM review_log ORDER BY id'); await db.closeLocalDB(); return rows; });
    await plain.close();

    const holder = await context.newPage(); await holder.goto(base + '/fixture');
    await holder.evaluate(async () => {
      localStorage.setItem('localdb-diagnostic-until-v1', String(Date.now() + 15 * 60 * 1000));
      window.db = await import('/db/local-db.js'); await db.initLocalDB();
      await db.dbRun('BEGIN IMMEDIATE');
      await db.dbRun('INSERT INTO identity_fixture VALUES (1)');
    });
    const inspector = await context.newPage(); await inspector.goto(base + '/db-diagnostics.html');
    await inspector.waitForFunction(() => document.querySelector('#report')?.value.includes('reportVersion'));

    const waiter = await context.newPage(); await waiter.goto(base + '/fixture');
    await waiter.evaluate(async () => {
      window.db = await import('/db/local-db.js');
      window.waiterInit = db.initLocalDB().then(() => ({ ok: true }), error => ({ ok: false, code: error.code || null, message: String(error.message || error) }));
    });
    const lockName = backend === 'AccessHandlePool' ? 'linguistpro-opfs-db-owner-v1' : '/app.db-outer';
    await new Promise(resolve => setTimeout(resolve, 800));
    await inspector.click('#refresh');
    await inspector.waitForFunction(name => {
      try { return JSON.parse(document.querySelector('#report').value).locks.pending.some(row => row.name === name); } catch (_) { return false; }
    }, lockName, { timeout: 5000 });
    const report = await readReport(inspector);
    const status = await inspector.locator('#status').textContent();
    const rawClientIds = await inspector.evaluate(async () => { const q = await navigator.locks.query(); return [...q.held, ...q.pending].map(row => row.clientId).filter(Boolean); });
    const text = JSON.stringify(report) + status;

    assert.equal(report.reportVersion, 2);
    assert.ok(report.locks.held.every(row => DB_LOCKS.has(row.name)), 'identity locks are not reported as DB locks');
    for (const id of rawClientIds) assert.equal(text.includes(id), false, 'raw Web Lock client ids never appear in the report');
    assert.equal(/identity_fixture|INSERT|BEGIN|Lock identity fixture/.test(text), false, 'no SQL or titles in the report');
    const relation = report.locks.relations.find(row => row.lock === lockName);
    assert.ok(relation?.holderIdentified, `holder must be identified: ${JSON.stringify(report.locks)}`);
    const holderIdentity = report.locks.clients.find(client => client.client === relation.holder).identity;
    const waiterRow = relation.waiters.find(row => row.identified && !row.sameClientAsHolder);
    assert.ok(waiterRow, 'waiting worker must be identified as a different client');
    assert.equal(waiterRow.sameDocumentAsHolder, false);
    assert.equal(holderIdentity.release, '3.11.545');
    assert.equal(holderIdentity.generation, 1);
    const historyRow = workerId => report.history.find(row => row.workerId === workerId);
    const waiterIdentity = report.locks.clients.find(client => client.client === waiterRow.client).identity;
    const startedAt = identity => historyRow(identity.workerId)?.lifecycle.find(row => row.event === 'page-db-start')?.at;
    assert.ok(startedAt(holderIdentity) < startedAt(waiterIdentity), 'the identified holder is the earlier page holding the open transaction');
    assert.match(status, new RegExp(`${lockName.replace(/[/.]/g, '\\$&')}: держит ${relation.holder} — worker «other», релиз 3\\.11\\.545`));

    const waited = await waiter.evaluate(() => window.waiterInit);
    assert.equal(waited.ok, false, 'the waiter must not bypass a live transaction');
    if (backend === 'AccessHandlePool') {
      assert.equal(waited.code, 'DB_LOCK_WAIT_TIMEOUT');
      assert.match(waited.message, /holderId=other\/3\.11\.545\/other-document\/gen1\/age\d+s/);
    }
    await holder.evaluate(async () => { await db.dbRun('COMMIT'); await db.closeLocalDB(); });
    const recovered = await waiter.evaluate(async () => {
      await db.recoverLocalDB();
      return { rows: await db.dbQuery('SELECT id FROM identity_fixture ORDER BY id'), integrity: await db.dbQuery('PRAGMA integrity_check'),
        reviews: await db.dbQuery('SELECT * FROM review_log ORDER BY id') };
    });
    assert.deepEqual(recovered.rows, [{ id: 1 }]);
    assert.deepEqual(recovered.integrity, [{ integrity_check: 'ok' }]);
    assert.deepEqual(recovered.reviews, reviewsBefore);
    console.log(JSON.stringify({ engine, backend, result: 'PASS', optIn: true, holderIdentified: true, waiterOtherDocument: true,
      rawClientIdsAbsent: true, errorHolderId: backend === 'AccessHandlePool' ? 'other-document' : 'n/a', integrity: 'ok', reviewLogUnchanged: true }));
  } finally { clearTimeout(watchdog); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
