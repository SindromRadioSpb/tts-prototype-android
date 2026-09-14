// Real SQLite/OPFS + IDB, isolated browser profiles. No application server,
// owner data, network provider or production writes. Failures never pass as skips.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require('playwright');
const engine = process.env.MULTITAB_ENGINE || 'chromium';
const tabCount = Number(process.env.MULTITAB_TABS || 4);
const root = path.resolve(__dirname, '../../public');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Isolated DB fixture</title>'); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const sql = (page, statement, params = []) => page.evaluate(([s, p]) => window.db.dbQuery(s, p), [statement, params]);
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const backend of (process.env.MULTITAB_BACKENDS || 'AccessHandlePool,tts-opfs-idb').split(',')) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const pages = await Promise.all(Array.from({ length: tabCount }, () => context.newPage()));
      const errors = [];
      const migrationRetries = [];
      for (const p of pages) p.on('pageerror', error => errors.push(error.message));
      for (const p of pages) p.on('console', msg => {
        if (msg.text().includes('[db-worker] init attempt')) migrationRetries.push(msg.text());
      });
      if (process.env.MULTITAB_LOG === '1') for (const p of pages) p.on('console', msg => {
        if (['warning', 'error'].includes(msg.type())) console.log(msg.type(), msg.text());
      });
      const started = Date.now();
      await Promise.all(pages.map(async p => {
        await p.goto(base + '/fixture');
        await p.evaluate(async backend => {
          localStorage.setItem('opfsVfsPreference_v1', backend);
          window.db = await import('/db/local-db.js');
          await window.db.initLocalDB();
        }, backend);
      }));
      assert.deepEqual(migrationRetries, [], 'simultaneous cold boots must not rely on migration failure/retry');
      const [a, b, c, d] = pages;
      await sql(a, "INSERT INTO review_log(id,item_key,kind,reviewed_at,grade,source,meta_json) VALUES('mt-review','lemma:שלום','review','2026-09-13',3,'fixture','{}')");
      await sql(a, "INSERT INTO word_status(lemma_key,status,updated_at) VALUES('שלום','learning','2026-09-13')");
      const reviews = await sql(a, 'SELECT * FROM review_log ORDER BY id');
      const words = await sql(a, 'SELECT * FROM word_status ORDER BY lemma_key');
      await a.evaluate(async () => {
        await db.createText({ id: 'cas-material', text_key: 'cas-material', title: 'Original', source_text: 'שלום' });
        await db.addSentence('cas-material', { id: 'cas-original', he_plain: 'שלום', ru: 'Привет' });
      });
      const baseline = (await sql(a, "SELECT updated_at FROM texts WHERE id='cas-material'"))[0].updated_at;
      const saves = await Promise.all(pages.slice(0, 2).map((p, i) => p.evaluate(async ([stamp, i]) => {
        try { await db.replaceStudioText('cas-material', { expectedUpdatedAt: stamp,
          fields: { title: 'Editor ' + i }, rows: [{ id: 'cas-' + i, he_plain: 'תודה', ru: 'Спасибо' }] }); return 'saved'; }
        catch (error) { return error.code; }
      }, [baseline, i])));
      assert.deepEqual(saves.sort(), ['DB_TEXT_CHANGED', 'saved'], 'one revision can only be replaced once');
      const beforeFailedSave = await sql(c, "SELECT * FROM sentences WHERE text_id='cas-material'");
      const currentStamp = (await sql(c, "SELECT updated_at FROM texts WHERE id='cas-material'"))[0].updated_at;
      await assert.rejects(c.evaluate(stamp => db.replaceStudioText('cas-material', { expectedUpdatedAt: stamp,
        fields: { title: 'Must roll back' }, rows: [{ id: 'duplicate', he_plain: 'א' }, { id: 'duplicate', he_plain: 'ב' }] }), currentStamp));
      assert.deepEqual(await sql(c, "SELECT * FROM sentences WHERE text_id='cas-material'"), beforeFailedSave, 'failed replacement restores all original rows');
      await sql(a, 'CREATE TABLE mt_fixture (id INTEGER PRIMARY KEY, value TEXT)');
      await sql(a, "INSERT INTO mt_fixture VALUES (99, 'constraint-fixture')");
      for (let i = 0; i < 10; i++) {
        await assert.rejects(sql(a, "INSERT INTO mt_fixture VALUES (99, 'duplicate')"), /UNIQUE constraint failed/);
        assert.equal((await sql(a, 'SELECT 1 AS ready'))[0].ready, 1, 'SQL failure must finish cleanup before the next operation');
        assert.equal((await sql(b, 'SELECT 1 AS ready'))[0].ready, 1, 'SQL failure must release the physical lease for another client');
      }
      await sql(a, 'DELETE FROM mt_fixture WHERE id=99');
      await Promise.all(pages.map((p, i) => sql(p, 'INSERT INTO mt_fixture VALUES (?, ?)', [i, `tab-${i}`])));
      for (const p of pages) assert.equal((await sql(p, 'SELECT * FROM mt_fixture')).length, tabCount);
      await sql(a, 'BEGIN IMMEDIATE');
      await sql(a, "INSERT INTO mt_fixture VALUES (10, 'uncommitted')");
      const blocked = sql(b, 'SELECT * FROM mt_fixture WHERE id=10');
      let resolved = false; blocked.then(() => { resolved = true; });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(resolved, false, 'another tab must not read uncommitted changes');
      await sql(a, 'ROLLBACK');
      assert.equal((await blocked).length, 0);
      await sql(b, 'BEGIN IMMEDIATE');
      await sql(b, "INSERT INTO mt_fixture VALUES (11, 'committed')");
      await sql(b, 'SAVEPOINT nested');
      await sql(b, "INSERT INTO mt_fixture VALUES (12, 'rolled-back')");
      await sql(b, 'ROLLBACK TO nested');
      await sql(b, 'RELEASE nested');
      await sql(b, 'COMMIT');
      assert.equal((await sql(c, 'SELECT * FROM mt_fixture WHERE id=11')).length, 1);
      assert.equal((await sql(c, 'SELECT * FROM mt_fixture WHERE id=12')).length, 0);
      await sql(a, 'BEGIN IMMEDIATE');
      await sql(a, "INSERT INTO mt_fixture VALUES (20, 'crashed')");
      await a.close();
      assert.equal((await sql(d, 'SELECT * FROM mt_fixture WHERE id=20')).length, 0, 'closed transaction rolls back');
      assert.deepEqual(await sql(d, 'PRAGMA integrity_check'), [{ integrity_check: 'ok' }]);
      const locks = await d.evaluate(() => navigator.locks.query());
      assert.equal(locks.held.some(l => l.name === 'linguistpro-opfs-db-owner-v1'), false, 'idle pages release physical ownership');
      await b.evaluate(() => window.db.closeLocalDB());
      assert.equal((await sql(b, 'SELECT * FROM mt_fixture')).length, tabCount + 1, 'close/reopen in place');
      await b.reload();
      await b.evaluate(async () => { window.db = await import('/db/local-db.js'); await db.initLocalDB(); });
      assert.equal((await sql(b, 'SELECT * FROM mt_fixture')).length, tabCount + 1);
      assert.deepEqual(await sql(b, 'SELECT * FROM review_log ORDER BY id'), reviews);
      assert.deepEqual(await sql(b, 'SELECT * FROM word_status ORDER BY lemma_key'), words);
      if (process.env.MULTITAB_DIAGNOSTICS === '1') {
        // A synthetic external holder emulates a legacy/unresponsive client.
        // Exercise the real 30s deadline, without replacing production code.
        await c.evaluate(() => new Promise(resolve => {
          navigator.locks.request('linguistpro-opfs-db-owner-v1', () => new Promise(release => {
            window.releaseFixtureLock = release; resolve();
          }));
        }));
        const failure = await b.evaluate(async () => {
          try { await db.dbQuery('SELECT 1'); return null; }
          catch (error) { return { code: error.code, message: error.message, diagnostics: error.diagnostics }; }
        });
        if (backend === 'tts-opfs-idb') {
          assert.equal(failure, null, 'IDB uses native SQLite locks, not OPFS ownership');
        } else {
          assert.equal(failure.code, 'DB_LOCK_WAIT_TIMEOUT');
          assert.match(failure.message, /held=1; holder=unknown/);
          assert.equal(failure.diagnostics.locks.held.length, 1);
        }
        await c.evaluate(() => window.releaseFixtureLock());
        assert.equal((await sql(b, 'SELECT 1 AS ready'))[0].ready, 1);
        if (backend !== 'tts-opfs-idb') assert.equal(await b.evaluate(() => db.getLastDbDiagnostics().code), 'DB_LOCK_WAIT_TIMEOUT', 'successful reads preserve diagnostic evidence');
        assert.deepEqual(await sql(b, 'SELECT * FROM review_log ORDER BY id'), reviews);
      }
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ engine, backend, tabs: tabCount, result: 'PASS', elapsedMs: Date.now() - started }));
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
