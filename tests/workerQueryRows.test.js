'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/db/db-worker-runtime.js'), 'utf8');
const querySource = source.slice(source.indexOf('async function queryRows('), source.indexOf('async function runSingle('));
let sqlite;
test.before(async () => {
  const { default: SQLiteModule } = await import(pathToFileURL(path.join(root, 'public/db/wa-sqlite.mjs')).href);
  const { Factory } = await import(pathToFileURL(path.join(root, 'public/db/sqlite-api.js')).href);
  sqlite = Factory(await SQLiteModule({ wasmBinary: fs.readFileSync(path.join(root, 'public/db/wa-sqlite.wasm')) }));
});

async function fixture(t) {
  const db = await sqlite.open_v2(':memory:');
  t.after(() => sqlite.close(db));
  let nameReads = 0;
  const api = { ...sqlite, column_names(stmt) { nameReads++; return sqlite.column_names(stmt); } };
  const context = vm.createContext({ sqlite3: api, db });
  vm.runInContext(querySource, context);
  return { query: async (...args) => JSON.parse(JSON.stringify(await context.queryRows(...args))), nameReads: () => nameReads };
}

test('worker query preserves aliases, Hebrew text, nulls and parameter bindings across separate statements', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.query('SELECT ? AS "שם", NULL AS empty, 17 AS value', ['שלום']), [{ שם: 'שלום', empty: null, value: 17 }]);
  assert.equal(f.nameReads(), 1);
  assert.deepEqual(await f.query('SELECT 1 AS first UNION ALL SELECT 2; SELECT 3 AS second, 4 AS different'),
    [{ first: 1 }, { first: 2 }, { second: 3, different: 4 }]);
  assert.equal(f.nameReads(), 3, 'each statement owns its column-name list');
});

test('empty and non-result statements do not lend their columns to later results', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.query('CREATE TABLE words(value TEXT); SELECT value AS unused FROM words; SELECT 7 AS present'), [{ present: 7 }]);
  assert.equal(f.nameReads(), 1);
  assert.deepEqual(await f.query('SELECT value AS missing FROM words'), []);
  assert.equal(f.nameReads(), 1);
});

test('2477 rows with 30 columns decode the names once and retain every result', async t => {
  const f = await fixture(t);
  const columns = Array.from({ length: 30 }, (_, i) => `n + ${i} AS col_${i}`).join(', ');
  const rows = await f.query(`WITH RECURSIVE seq(n) AS (VALUES(0) UNION ALL SELECT n+1 FROM seq WHERE n<2476) SELECT ${columns} FROM seq`);
  assert.equal(rows.length, 2477);
  assert.equal(f.nameReads(), 1);
  for (let row = 0; row < rows.length; row++) {
    assert.equal(Object.keys(rows[row]).length, 30);
    for (let col = 0; col < 30; col++) assert.equal(rows[row]['col_' + col], row + col);
  }
});
