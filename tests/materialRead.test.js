'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
let sqlite, readMaterial;
test.before(async () => {
  const { default: SQLiteModule } = await import(pathToFileURL(path.join(root, 'public/db/wa-sqlite.mjs')).href);
  const { Factory } = await import(pathToFileURL(path.join(root, 'public/db/sqlite-api.js')).href);
  sqlite = Factory(await SQLiteModule({ wasmBinary: fs.readFileSync(path.join(root, 'public/db/wa-sqlite.wasm')) }));
  ({ readMaterial } = await import('../public/db/material-read.js'));
});
async function fixture(t) {
  const db = await sqlite.open_v2(':memory:');
  t.after(() => sqlite.close(db));
  const source = fs.readFileSync(path.join(root, 'public/db/db-worker-runtime.js'), 'utf8');
  const ctx = vm.createContext({ sqlite3: sqlite, db });
  vm.runInContext(source.slice(source.indexOf('async function queryRows('), source.indexOf('async function runSingle(')), ctx);
  const query = async (...args) => JSON.parse(JSON.stringify(await ctx.queryRows(...args)));
  const exec = sql => query(sql);
  const inTransaction = () => !sqlite.get_autocommit(db);
  await exec(`CREATE TABLE texts(id TEXT PRIMARY KEY, title TEXT, source_text TEXT, source_meta_json TEXT, table_model_meta_json TEXT, future_field TEXT);
    CREATE TABLE sentences(id TEXT PRIMARY KEY,text_id TEXT,order_index INTEGER,he_plain TEXT,he_niqqud TEXT,ru TEXT,translit TEXT,edit_meta_json TEXT);
    CREATE TABLE sentence_audio(sentence_id TEXT,audio_id TEXT,is_default INTEGER);
    CREATE TABLE audio_assets(id TEXT,asset_key TEXT,tts_profile_json TEXT);
    CREATE TABLE review_log(id TEXT, grade INTEGER);
    CREATE TABLE text_progress(text_id TEXT, last_row_idx INTEGER);
    INSERT INTO review_log VALUES('r1',3); INSERT INTO text_progress VALUES('A',8);`);
  const meta = JSON.stringify({ source: { audio: { segments: [{ text: 'שלום', start_ms: 100, end_ms: 900 }] } }, provider: { raw: 'evidence'.repeat(4000) } });
  await query('INSERT INTO texts VALUES(?,?,?,?,?,?)', ['A', 'שלום', 'raw source', meta, '{"editorial":"preserve"}', 'future']);
  await query('INSERT INTO sentences VALUES(?,?,?,?,?,?,?,?)', ['late', 'A', 8, 'שלום', 'שָׁלוֹם', 'мир', 'manual', '{"edited":{"translit":true}}']);
  await query('INSERT INTO sentences VALUES(?,?,?,?,?,?,?,?)', ['first', 'A', 2, 'בית', null, null, null, null]);
  await exec(`INSERT INTO sentences VALUES('other','B',1,'other',NULL,NULL,NULL,NULL);
    INSERT INTO audio_assets VALUES('a','audio-key','{"voice":"saved"}');
    INSERT INTO audio_assets VALUES('b','not-default',NULL);
    INSERT INTO sentence_audio VALUES('late','a',1); INSERT INTO sentence_audio VALUES('late','b',0);`);
  return { query, exec, inTransaction, meta };
}
test('one read snapshot preserves metadata, ordered rows, nulls, default audio and all stored data', async t => {
  const f = await fixture(t), snapshots = [], statements = [];
  const snapshot = async () => {
    const rows = [];
    for (const table of ['texts', 'sentences', 'review_log', 'text_progress']) rows.push(await f.query('SELECT * FROM ' + table));
    return rows;
  };
  const before = await snapshot();
  const result = await readMaterial('A', { ...f, query: async (...args) => {
    snapshots.push(f.inTransaction()); statements.push(args[0]); return f.query(...args);
  } });
  assert.equal(result.text.source_meta_json, f.meta);
  assert.equal(result.text.table_model_meta_json, '{"editorial":"preserve"}');
  assert.equal(result.text.future_field, 'future');
  assert.equal(Object.hasOwn(result.text, 'source_text'), false);
  assert.deepEqual(result.sentences.map(r => r.id), ['first', 'late']);
  assert.equal(result.sentences[0].audio_asset_key, null);
  assert.equal(result.sentences[1].audio_asset_key, 'audio-key');
  assert.equal(result.sentences[1].audio_tts_profile_json, '{"voice":"saved"}');
  assert.equal(result.sentences[1].translit, 'manual');
  assert.equal(result.sentences[1].he_niqqud, 'שָׁלוֹם');
  assert.ok(snapshots.every(Boolean)); assert.equal(statements.length, 3);
  assert.equal(f.inTransaction(), false);
  assert.deepEqual(await snapshot(), before);
});
test('missing and hostile IDs cannot select another material and release their snapshot', async t => {
  const f = await fixture(t);
  for (const id of ['missing', "A' OR 1=1 --"]) {
    assert.deepEqual(await readMaterial(id, f), { text: null, sentences: [] });
    assert.equal(f.inTransaction(), false);
  }
});
for (const owned of [false, true]) test('read failure respects transaction ownership: caller=' + owned, async t => {
  const f = await fixture(t);
  if (owned) { await f.exec('BEGIN'); await f.exec("UPDATE texts SET title='uncommitted' WHERE id='A'"); }
  const failure = new Error('fixture read failure');
  await assert.rejects(readMaterial('A', { ...f, query: (sql, params) => sql.includes('FROM sentences') ? Promise.reject(failure) : f.query(sql, params) }), error => error === failure);
  assert.equal(f.inTransaction(), owned);
  if (owned) {
    assert.equal((await readMaterial('A', f)).text.title, 'uncommitted');
    assert.equal(f.inTransaction(), true, 'successful read must not commit caller writes either');
    await f.exec('ROLLBACK');
    assert.equal((await readMaterial('A', f)).text.title, 'שלום');
  } else assert.equal((await readMaterial('A', f)).sentences.length, 2, 'a failed read allows retry');
});
test('worker lease serializes the whole material read before the next writer without a change event', async t => {
  const f = await fixture(t), { OperationLease } = await import('../public/db/operation-lease.js');
  let opens = 0, closes = 0, commits = 0;
  const lease = new OperationLease({ locks: { request() {} }, requiresExternalLock: () => false,
    open: async () => { opens++; }, close: async () => { closes++; }, inTransaction: f.inTransaction,
    rollback: () => f.exec('ROLLBACK'), onCommit: () => { commits++; } });
  const pending = lease.run(async () => { await lease.ensureOpen(); return readMaterial('A', f); });
  const later = lease.run(async () => {
    assert.equal(commits, 0); assert.equal(closes, 1); await lease.ensureOpen();
    await f.exec("UPDATE texts SET title='new' WHERE id='A'; UPDATE sentences SET he_plain='new' WHERE text_id='A'");
  }, { sql: 'UPDATE texts SET title=?; UPDATE sentences SET he_plain=?' });
  const result = await pending; await later;
  assert.equal(result.text.title, 'שלום'); assert.equal(result.sentences[1].he_plain, 'שלום');
  assert.equal(opens, 2); assert.equal(closes, 2); assert.equal(commits, 1);
  const next = await readMaterial('A', f);
  assert.equal(next.text.title, 'new'); assert.ok(next.sentences.every(r => r.he_plain === 'new'));
});
