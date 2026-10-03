'use strict';
// Disposable persistent profile: cold import + competing tab + byte-level row
// comparison + partial import rollback + interrupted transaction recovery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');
const AdmZip = require('adm-zip');
const { smokeServerEnv, SMOKE_SERVER_BOOTSTRAP, waitForSmokeServer } = require('../smoke-server-env');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, '.tmp/cold-canon');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const zip = new AdmZip(path.join(ROOT, 'public/data/benyehuda/canon-v4.zip'));
  const library = JSON.parse(zip.readAsText('library/library.json'));
  const expectedRows = library.texts.flatMap(t => t.rows.map((r, i) => ({ text_key: t.text_key, order_index: i,
    he_plain: r.hebrew_plain || '', he_niqqud: r.hebrew_niqqud || '', translit: r.translit || '',
    translit_ru: r.translit_ru || '', ru: r.russian || '', audio_asset_key: r.audio_asset_key || null })));
  const sortRows = rows => rows.sort((a, b) => a.text_key < b.text_key ? -1 : a.text_key > b.text_key ? 1 : a.order_index - b.order_index);
  sortRows(expectedRows);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-cold-canon-profile-'));
  const server = fork('-e', [SMOKE_SERVER_BOOTSTRAP], { cwd: ROOT, silent: true, windowsHide: true,
    env: smokeServerEnv(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-cold-canon-server-')), 0) });
  const logs = []; server.stdout.on('data', d => logs.push(String(d))); server.stderr.on('data', d => logs.push(String(d)));
  let context;
  try {
    const base = `http://127.0.0.1:${await waitForSmokeServer(server, 30000)}`;
    async function launch() {
      const ctx = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'block' });
      await ctx.route(url => !url.href.startsWith(base), route => route.abort());
      await ctx.addInitScript(() => {
        window.txProbe = { begin: null, end: null, count: 0 };
        const post = Worker.prototype.postMessage, seen = new WeakSet();
        Worker.prototype.postMessage = function (message, ...rest) {
          if (!seen.has(this)) {
            seen.add(this); window.dbWorkerForTest = this;
            this.addEventListener('message', e => {
              if (e.data.id === window.txProbe.beginId) {
                window.txProbe.beginAck = performance.now(); window.canonImportStarted?.();
              }
              if (e.data.id === window.txProbe.commitId) window.txProbe.end = performance.now();
            });
          }
          if (message?.sql) {
            const p = window.txProbe;
            if (/^BEGIN/i.test(message.sql.trim()) && p.begin === null) {
              p.begin = performance.now(); p.beginId = message.id;
            }
            if (p.begin !== null && p.end === null) p.count++;
            if (/^COMMIT/i.test(message.sql.trim()) && p.end === null) p.commitId = message.id;
          }
          return post.call(this, message, ...rest);
        };
        if (location.protocol === 'http:') {
          localStorage.setItem('onboardingSeen_v1', '1'); localStorage.setItem('phase6Decision_v1', 'declined');
        }
      });
      return ctx;
    }
    async function studioPage() {
      const page = await context.newPage();
      await page.goto(base + '/?localMode=1', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__localDB?.isReady(), null, { timeout: 45000 });
      return page;
    }
    context = await launch();
    let studio = await studioPage();
    const room = await context.newPage();
    let concurrent, started, signalBegin;
    const begun = new Promise(resolve => { signalBegin = resolve; });
    await room.exposeFunction('canonImportStarted', () => {
      started = Date.now();
      concurrent = studio.evaluate(() => __localDB.createText({ id: 'concurrent-fixture', text_key: 'concurrent-fixture', title: 'Concurrent fixture', source_text: 'fixture' }));
      // Attach immediately so a rejected competing write is never unhandled.
      concurrent.catch(() => {});
      signalBegin();
    });
    await room.goto(base + '/library.html', { waitUntil: 'domcontentloaded' });
    await room.waitForFunction(() => window.txProbe.beginAck != null, null, { timeout: 30000 });
    await begun;
    assert.ok(concurrent, 'competing write starts at BEGIN, not after import completion');
    await concurrent;
    const waitMs = Date.now() - started;
    await room.waitForFunction(() => window.txProbe.end !== null, null, { timeout: 30000 });
    const transaction = await room.evaluate(() => window.txProbe);
    await room.close();
    async function verifyCanon() {
      const actual = await studio.evaluate(() => __localDB.dbQuery(`SELECT t.text_key, s.order_index,
        s.he_plain, s.he_niqqud, s.translit, s.translit_ru, s.ru, a.asset_key AS audio_asset_key
        FROM sentences s JOIN texts t ON t.id=s.text_id
        LEFT JOIN sentence_audio sa ON sa.sentence_id=s.id AND sa.is_default=1
        LEFT JOIN audio_assets a ON a.id=sa.audio_id WHERE t.text_key != 'concurrent-fixture'
        AND t.text_key NOT LIKE 'import-fixture-%'`));
      sortRows(actual);
      assert.equal(actual.length, expectedRows.length);
      assert.equal(digest(actual), digest(expectedRows), 'every canon row field and default audio key must survive');
      const texts = await studio.evaluate(() => __localDB.dbQuery("SELECT text_key,title,source_text,created_at,updated_at FROM texts WHERE text_key != 'concurrent-fixture' AND text_key NOT LIKE 'import-fixture-%'"));
      assert.equal(texts.length, library.texts.length);
      const byKey = new Map(texts.map(t => [t.text_key, t]));
      for (const t of library.texts) {
        const stored = byKey.get(t.text_key); assert.ok(stored);
        for (const key of ['title', 'source_text', 'created_at', 'updated_at']) if (t[key] != null) assert.equal(stored[key], t[key], key);
      }
      assert.deepEqual(await studio.evaluate(() => __localDB.dbQuery('PRAGMA foreign_key_check')), []);
    }
    await verifyCanon();
    const imported = await studio.evaluate(async () => {
      const derived = { niqqud_derived: { value: 'שָׁלוֹם', source_hash: 'fixture', provider: 'fixture' } };
      const result = await __localDB.importBundle({ texts: [
        { id: 'old-good', text_key: 'import-fixture-good', title: 'Good', source_text: 'שלום',
          bookmarks: [{ order_index: 0, title: 'Bookmark' }], progress: { last_row_idx: 0, last_step_id: 'ru' },
          sentences: [{ id: 'old-row', he_plain: 'שלום', ru: 'Привет', meta_json: JSON.stringify(derived),
            translation_provider: 'fixture', translation_meta_json: '{"revision":1}', note: 'Kept note', audio_asset_key: 'fixture-audio' }] },
        { text_key: 'import-fixture-bad', title: 'Bad', source_text: 'bad', sentences: [{ he_plain: 'bad', note: {} }] },
        { text_key: 'import-fixture-after', title: 'After', source_text: 'after', sentences: [{ he_plain: 'אחרי' }] },
      ] });
      const facts = await __localDB.dbQuery(`SELECT s.*, t.text_key FROM sentences s JOIN texts t ON t.id=s.text_id WHERE t.text_key='import-fixture-good'`);
      const row = facts[0];
      return { result, row, derived, notes: await __localDB.dbQuery('SELECT note FROM sentence_notes WHERE sentence_id=?', [row.id]),
        bookmarks: await __localDB.dbQuery('SELECT sentence_id FROM bookmarks WHERE text_id=?', [row.text_id]),
        bad: await __localDB.dbQuery("SELECT id FROM texts WHERE text_key='import-fixture-bad'"),
        after: await __localDB.dbQuery("SELECT s.he_plain FROM sentences s JOIN texts t ON t.id=s.text_id WHERE t.text_key='import-fixture-after'") };
    });
    assert.equal(imported.result.imported, 2); assert.equal(imported.result.errors.length, 1);
    assert.deepEqual(imported.bad, []); assert.equal(imported.after[0].he_plain, 'אחרי');
    assert.deepEqual(JSON.parse(imported.row.meta_json), imported.derived);
    assert.equal(imported.row.translation_provider, 'fixture');
    assert.deepEqual(JSON.parse(imported.row.translation_meta_json), { revision: 1 });
    assert.equal(imported.notes[0].note, 'Kept note');
    assert.equal(imported.bookmarks[0].sentence_id, imported.row.id); assert.notEqual(imported.row.id, 'old-row');
    const pragmas = await studio.evaluate(async () => ({ temp: await __localDB.dbQuery('PRAGMA temp_store'), journal: await __localDB.dbQuery('PRAGMA journal_mode'), sync: await __localDB.dbQuery('PRAGMA synchronous') }));
    assert.equal(pragmas.temp[0].temp_store, 2);
    assert.ok(!['off', 'memory'].includes(pragmas.journal[0].journal_mode));
    assert.ok(pragmas.sync[0].synchronous >= 2);
    // Terminate the worker with an uncommitted mutation; recovery must use the
    // durable rollback journal rather than committing an abandoned editor write.
    await studio.evaluate(async () => {
      await __localDB.execRaw('BEGIN;');
      await __localDB.dbRun("UPDATE texts SET title='UNCOMMITTED' WHERE id='concurrent-fixture'");
      // Exceed the default page cache so recovery covers spilled main-DB pages,
      // not only a small mutation that never left SQLite's memory.
      await __localDB.dbRun('UPDATE sentences SET ru=?', ['UNCOMMITTED '.repeat(300)]);
      window.dbWorkerForTest.terminate();
    });
    await context.close(); context = null;
    context = await launch(); studio = await studioPage();
    assert.equal((await studio.evaluate(() => __localDB.getTextById('concurrent-fixture'))).title, 'Concurrent fixture');
    await verifyCanon();
    const result = { ok: true, waitMs, transactionMs: transaction.end - transaction.begin, sqlMessages: transaction.count,
      texts: library.texts.length, rows: expectedRows.length, rowDigest: digest(expectedRows), pragmas,
      partialRollback: true, interruptedTransactionRecovery: true, browserRestart: true };
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(OUT, 'server.log'), logs.join(''));
    throw error;
  } finally {
    if (context) await context.close();
    server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
