'use strict';
// Isolated real-browser regression for the IndexedDB VFS lock lifetime.
// Fault: exactly one IndexedDB readwrite transaction aborts (the class of
// failure a browser can report for quota, interruption or I/O errors).
//   IDB_FAULT_TX=commit      aborts the transaction carrying the commit record.
//   IDB_FAULT_TX=first-write aborts the first write (abandoned-version cleanup).
// Required: that single failure must not keep `/app.db-outer` held by a live
// worker, must not block another document, and must not poison later writes.
// IDB_FAULT_EXPECT_RED=1 serves the 3.11.542 VFS files and expects the leak.
// No owner profile, production API, backend switch, lock stealing or reset.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../public');
const engine = process.env.MULTITAB_ENGINE || 'webkit';
const faultTx = process.env.IDB_FAULT_TX || 'commit';
const red = process.env.IDB_FAULT_EXPECT_RED === '1';
const baseline = 'b4806833aff958937faf94ec56dbf260c3956efd';
assert.ok(['commit', 'first-write'].includes(faultTx));

function inject(source, from, to) {
  assert.ok(source.includes(from), `fixture injection point missing: ${from}`);
  return source.replace(from, to);
}
const read = name => red && ['IDBContext.js', 'IDBBatchAtomicVFS.js'].includes(name)
  ? execFileSync('git', ['show', `${baseline}:public/db/${name}`], { cwd: path.resolve(root, '..'), encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'db', name), 'utf8');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>IDB failed sync fixture</title>'); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', path.extname(file) === '.wasm' ? 'application/wasm' : 'text/javascript');
  if (url.pathname === '/db/db-worker-runtime.js') {
    let source = read('db-worker-runtime.js');
    // Fixture-only deadline: a blocked reader reports within seconds.
    source = inject(source, 'lockTimeoutMillis: 30000', 'lockTimeoutMillis: 1500');
    source = inject(source, "if (type === 'query') return",
      "{ const arm = /^SELECT 'fixture-arm-idb-abort:(commit|first-write)'$/.exec(sql || ''); if (arm) globalThis.__fixtureAbort = arm[1]; }\n    if (type === 'query') return");
    return res.end(source);
  }
  if (url.pathname === '/db/IDBBatchAtomicVFS.js') {
    return res.end(inject(read('IDBBatchAtomicVFS.js'), '// Write block 0 to commit the new version.',
      '// Write block 0 to commit the new version.\n            globalThis.__fixtureCommitTx = true;'));
  }
  if (url.pathname === '/db/IDBContext.js') {
    return res.end(inject(read('IDBContext.js'), 'return await f(stores);',
      "const value = await f(stores);\n" +
      "        if (mode === 'readwrite') {\n" +
      "          const commit = globalThis.__fixtureCommitTx; globalThis.__fixtureCommitTx = false;\n" +
      "          const target = globalThis.__fixtureAbort;\n" +
      "          if (target === 'first-write' || (target === 'commit' && commit)) { globalThis.__fixtureAbort = null; this.#tx.abort(); }\n" +
      "        }\n" +
      "        return value;"));
  }
  fs.createReadStream(file).pipe(res);
});

const dbLocks = page => page.evaluate(async () => {
  const q = await navigator.locks.query();
  const pick = rows => rows.filter(row => row.name.startsWith('/app.db')).map(row => row.name).sort();
  return { held: pick(q.held), pending: pick(q.pending) };
});
const settle = (page, script) => page.evaluate(async script => {
  try { return { ok: true, value: await (0, eval)(script)() }; }
  catch (error) { return { ok: false, code: error.code ?? null, message: String(error.message || error).slice(0, 160) }; }
}, script);

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/fixture`;
  const browser = await playwright[engine].launch();
  const watchdog = setTimeout(() => { console.error('WATCHDOG'); process.exit(2); }, 150000);
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const writer = await context.newPage(); await writer.goto(base);
    await writer.evaluate(async () => {
      localStorage.setItem('opfsVfsPreference_v1', 'tts-opfs-idb');
      window.db = await import('/db/local-db.js');
      await db.initLocalDB();
      await db.dbRun('CREATE TABLE fault_fixture (id INTEGER PRIMARY KEY, value TEXT)');
      await db.dbRun("INSERT INTO fault_fixture VALUES (1, 'before')");
      await db.dbRun("INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,meta_json) VALUES('fault-review','lemma:שלום','review','2026-09-14',3,'fixture','{}')");
    });
    const reviewsBefore = await writer.evaluate(() => db.dbQuery('SELECT * FROM review_log ORDER BY id'));
    assert.deepEqual(await dbLocks(writer), { held: [], pending: [] }, 'idle IDB connection holds no SQLite lock');

    await writer.evaluate(mode => db.dbQuery(`SELECT 'fixture-arm-idb-abort:${mode}'`), faultTx);
    const faultedWrite = await settle(writer, "() => db.dbRun(\"INSERT INTO fault_fixture VALUES (2, 'faulted')\")");
    await new Promise(resolve => setTimeout(resolve, 300));
    const locksAfterFault = await dbLocks(writer);
    if (red) {
      assert.ok(locksAfterFault.held.includes('/app.db-outer'), `baseline must reproduce the retained lock: ${JSON.stringify(locksAfterFault)}`);
      const reader = await context.newPage(); await reader.goto(base);
      const blocked = await settle(reader, "async () => { window.db = await import('/db/local-db.js'); await db.initLocalDB(); return db.dbQuery('SELECT 1 AS ready'); }");
      assert.equal(blocked.ok, false, 'baseline second document must be blocked by the live worker');
      console.log(JSON.stringify({ engine, faultTx, baseline, result: 'EXPECTED RED', locksAfterFault, secondDocument: blocked.message }));
      return;
    }

    const reader = await context.newPage(); await reader.goto(base);
    const readerBoot = await settle(reader, "async () => { window.db = await import('/db/local-db.js'); await db.initLocalDB(); return db.dbQuery('SELECT id FROM fault_fixture ORDER BY id'); }");
    const writerAfter = await settle(writer, "async () => { await db.dbRun(\"INSERT INTO fault_fixture VALUES (3, 'after')\"); return db.dbQuery('SELECT id FROM fault_fixture ORDER BY id'); }");
    const writerClose = await settle(writer, '() => db.closeLocalDB()');
    const locksAfterClose = await dbLocks(writer);
    const readerAfterClose = await settle(reader, "() => db.dbQuery('SELECT id FROM fault_fixture ORDER BY id')");
    const observed = { engine, faultTx, faultedWrite, locksAfterFault, readerBoot, writerAfter, writerClose, locksAfterClose, readerAfterClose };

    assert.deepEqual(locksAfterFault, { held: [], pending: [] }, `one aborted IDB transaction must not leave /app.db-outer held: ${JSON.stringify(observed)}`);
    assert.equal(readerBoot.ok, true, `another document must open the same library: ${JSON.stringify(observed)}`);
    const committed = readerBoot.value.map(row => row.id);
    assert.ok(!faultedWrite.ok || committed.includes(2), `a write reported as successful must be durable: ${JSON.stringify(observed)}`);
    if (faultTx === 'commit') {
      assert.equal(faultedWrite.ok, false, 'an aborted commit record must be reported to the caller');
      assert.equal(committed.includes(2), false, 'a write reported as failed must not appear committed');
    }
    assert.equal(writerAfter.ok, true, `one failure must not poison later writes: ${JSON.stringify(observed)}`);
    assert.equal(writerClose.ok, true, `close must release physical resources: ${JSON.stringify(observed)}`);
    assert.deepEqual(locksAfterClose, { held: [], pending: [] });
    assert.equal(readerAfterClose.ok, true);
    assert.ok(readerAfterClose.value.some(row => row.id === 3), 'later committed write is visible to another document');
    assert.deepEqual(await reader.evaluate(() => db.dbQuery('PRAGMA integrity_check')), [{ integrity_check: 'ok' }]);
    assert.deepEqual(await reader.evaluate(() => db.dbQuery('SELECT * FROM review_log ORDER BY id')), reviewsBefore);
    console.log(JSON.stringify({ engine, faultTx, result: 'PASS', faultedWrite: faultedWrite.ok ? 'ok' : `error:${faultedWrite.code}`,
      faultedRowCommitted: committed.includes(2), lockReleasedAfterFailure: true, secondDocumentRead: true, laterWrite: true,
      closeReleased: true, integrity: 'ok', reviewLogUnchanged: true }));
  } finally { clearTimeout(watchdog); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
