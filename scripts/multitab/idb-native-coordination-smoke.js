// Isolated real-browser regression: an unrelated legacy OPFS ownership lock
// must not block IDB. Actual old/new SQLite transactions must still exclude
// each other. No owner profile, production writes or backend migration.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const playwright = require('playwright');
const baseline = 'f19ca3e50ae2988a3152b008b52d9099324cec0e';
const engine = process.env.MULTITAB_ENGINE || 'webkit';
const red = process.env.IDB_NATIVE_EXPECT_RED === '1';
const root = path.resolve(__dirname, '../../public');
const legacy = new Map(['db-worker-runtime.js', 'operation-lease.js', 'storage-identity.js', 'IDBBatchAtomicVFS.js'].map(name =>
  [name, execFileSync('git', ['show', `${baseline}:public/db/${name}`], { cwd: path.resolve(root, '..') })]));
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>IDB coordination fixture</title>'); return; }
  const isLegacy = url.pathname.startsWith('/legacy-db/');
  const pathname = isLegacy ? url.pathname.replace('/legacy-db/', '/db/') : url.pathname;
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', path.extname(file) === '.wasm' ? 'application/wasm' : 'text/javascript');
  const old = legacy.get(path.basename(pathname));
  if (old && (isLegacy || red)) res.end(old); else fs.createReadStream(file).pipe(res);
});
const query = (page, sql) => page.evaluate(sql => db.dbQuery(sql), sql);
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright[engine].launch({ headless: true });
  try {
    if (engine === 'webkit' && !red) {
      // A new ephemeral profile, no VFS preference and no existing identity.
      const fresh = await browser.newContext({ serviceWorkers: 'block' });
      const tabs = await Promise.all([fresh.newPage(), fresh.newPage()]);
      await Promise.all(tabs.map(async page => {
        await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
        const info = await page.evaluate(async () => {
          const db = await import('/db/local-db.js'); await db.initLocalDB();
          await db.dbQuery('SELECT COUNT(*) AS n FROM texts'); return db.getVfsInfo();
        });
        assert.equal(info.name, 'tts-opfs-idb');
      }));
      await fresh.close();
    }
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const [holder, current, old] = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
    const base = `http://127.0.0.1:${server.address().port}/fixture`;
    await Promise.all([holder, current, old].map(page => page.goto(base)));
    await holder.evaluate(() => new Promise(resolve => {
      localStorage.setItem('opfsVfsPreference_v1', 'tts-opfs-idb');
      navigator.locks.request('linguistpro-opfs-db-owner-v1', () => new Promise(release => {
        window.releaseFixture = release; resolve();
      }));
    }));
    const boot = await current.evaluate(async () => {
      window.db = await import('/db/local-db.js');
      return Promise.race([db.initLocalDB().then(() => 'ready', error => error.code), new Promise(resolve => setTimeout(() => resolve('blocked'), 5000))]);
    });
    if (red) { assert.equal(boot, 'blocked'); console.log(JSON.stringify({engine, baseline, result:'EXPECTED RED: IDB boot blocked by unrelated ownership lock'})); return; }
    assert.equal(boot, 'ready', 'IDB must open while unrelated OPFS owner remains held');
    assert.equal((await query(current, 'SELECT 1 AS ready'))[0].ready, 1);
    assert.equal(await holder.evaluate(async () => (await navigator.locks.query()).held.some(l => l.name === 'linguistpro-opfs-db-owner-v1')), true, 'the fix must not steal/release the holder');
    await holder.evaluate(() => releaseFixture());
    await query(current, 'CREATE TABLE native_fixture (id INTEGER PRIMARY KEY, value TEXT)');
    await query(current, "INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,meta_json) VALUES('native-review','lemma:שלום','review','2026-09-14',3,'fixture','{}')");
    const reviews = await query(current, 'SELECT * FROM review_log ORDER BY id');
    await old.evaluate(async () => {
      const worker = new Worker('/legacy-db/db-worker-runtime.js', { type:'module' });
      let seq = 0; const pending = new Map();
      worker.onmessage = ({data}) => { const h = pending.get(data.id); if (!h) return; pending.delete(data.id); data.ok ? h.resolve(data.rows) : h.reject(new Error(data.error)); };
      window.rpc = (type, sql) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, {resolve,reject}); worker.postMessage({id,type,sql,preferVfs:'tts-opfs-idb'}); });
      await rpc('init');
    });
    await old.evaluate(() => rpc('query', 'BEGIN IMMEDIATE'));
    await old.evaluate(() => rpc('query', "INSERT INTO native_fixture VALUES(1,'legacy uncommitted')"));
    let resolved = false;
    const waiting = query(current, 'SELECT * FROM native_fixture').then(value => { resolved = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(resolved, false, 'native client must respect a legacy SQLite transaction');
    await old.evaluate(() => rpc('query', 'ROLLBACK'));
    assert.deepEqual(await waiting, []);
    await old.evaluate(() => rpc('query', 'BEGIN IMMEDIATE'));
    await old.evaluate(() => rpc('query', "INSERT INTO native_fixture VALUES(3,'legacy committed')"));
    const legacyCommitRead = query(current, 'SELECT * FROM native_fixture');
    await new Promise(resolve => setTimeout(resolve, 150));
    await old.evaluate(() => rpc('query', 'COMMIT'));
    assert.deepEqual(await legacyCommitRead, [{id:3,value:'legacy committed'}], 'legacy commit must be visible as soon as its native lock is released');
    await query(current, 'DELETE FROM native_fixture');
    await query(current, 'BEGIN IMMEDIATE');
    await query(current, "INSERT INTO native_fixture VALUES(2,'new committed')");
    resolved = false;
    const reverse = old.evaluate(() => rpc('query', 'SELECT * FROM native_fixture')).then(value => { resolved = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(resolved, false, 'legacy client must respect a new SQLite transaction');
    await query(current, 'COMMIT');
    assert.deepEqual(await reverse, [{id:2,value:'new committed'}]);
    assert.deepEqual(await query(current, 'PRAGMA integrity_check'), [{integrity_check:'ok'}]);
    assert.deepEqual(await query(current, 'SELECT * FROM review_log ORDER BY id'), reviews);
    assert.deepEqual(await current.evaluate(async () => (await navigator.locks.query()).held), []);
    console.log(JSON.stringify({engine, result:'PASS', legacyAndNativeIsolation:true, backend:'tts-opfs-idb', reviewLogUnchanged:true}));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
