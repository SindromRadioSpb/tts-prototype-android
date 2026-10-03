'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const initSqlJs = require('sql.js');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/db/local-db.js'), 'utf8');
let SQL;
test.before(async () => { SQL = await initSqlJs(); });

async function harness() {
  const db = new SQL.Database();
  const { MIGRATIONS } = await import('../public/db/migrations.js');
  for (const migration of MIGRATIONS) db.run(migration);
  db.run('PRAGMA foreign_keys=ON');
  const calls = [], effects = [];
  const q = async (sql, params = []) => {
    const stmt = db.prepare(sql), rows = [];
    try { stmt.bind(params); while (stmt.step()) rows.push(stmt.getAsObject()); }
    finally { stmt.free(); }
    return rows;
  };
  const r = async (sql, params = []) => { calls.push({ sql, params }); db.run(sql, params); };
  const context = vm.createContext({ q, r,
    _assertLegacySentenceWriter: async id => {
      effects.push('guard'); if (id === 'promoted') throw new Error('PROMOTED');
    },
    clearDerivedNiqqud: async () => { effects.push('clear'); },
    _touchTextUpdatedAt: async () => { effects.push('touch'); },
  });
  const batch = source.slice(source.indexOf('export async function addSentences('), source.indexOf('// PAS-B0.5'));
  const audio = source.slice(source.indexOf('async function upsertAudioAssets('), source.indexOf('export async function linkSentenceAudio('));
  vm.runInContext((batch + audio).replaceAll('export ', ''), context);
  return { db, q, calls, effects, add: context.addSentences, audio: context.upsertAudioAssets, single: context.upsertAudioAsset };
}

test('bound row batches retain every field, append order and monotonic progress across chunk boundaries', async () => {
  const h = await harness();
  try {
    h.db.run("INSERT INTO texts(id,text_key,title,source_text) VALUES ('t','t','','');");
    h.db.run("INSERT INTO sentences(id,text_id,order_index) VALUES ('prior','t',7)");
    const rows = Array.from({ length: 123 }, (_, i) => ({ id: 's' + i, he_plain: "שלום '); DROP TABLE texts;-- " + i,
      he_niqqud: 'שָׁלוֹם', translit: 'shalom', translit_ru: 'шалом', ru: 'Привет ' + i,
      meta_json: { note: i }, edit_meta_json: { origin: 'fixture' }, translation_provider: 'fixture', translation_meta_json: { revision: i } }));
    const progress = [];
    h.db.run('BEGIN');
    assert.equal(await h.add('t', rows, { onProgress: (n, total) => progress.push([n, total]) }), 123);
    h.db.run('COMMIT');
    const actual = await h.q("SELECT * FROM sentences WHERE id != 'prior' ORDER BY order_index");
    for (const [i, row] of actual.entries()) {
      assert.equal(row.order_index, i + 8);
      for (const key of ['id', 'he_plain', 'he_niqqud', 'translit', 'translit_ru', 'ru', 'translation_provider']) assert.equal(row[key], rows[i][key]);
      for (const key of ['meta_json', 'edit_meta_json', 'translation_meta_json']) assert.deepEqual(JSON.parse(row[key]), rows[i][key]);
    }
    assert.deepEqual(progress, [[50, 123], [100, 123], [123, 123]]);
    assert.deepEqual(h.effects, ['guard', 'clear', 'touch']);
    assert.equal(h.calls.length, 3);
    assert.ok(h.calls.every(call => call.params.length <= 650));
    await assert.rejects(h.add('promoted', rows), /PROMOTED/);
    assert.equal((await h.q('SELECT count(*) n FROM sentences'))[0].n, 124);
  } finally { h.db.close(); }
});

test('a later invalid batch can be rolled back by the owning transaction without partial rows', async () => {
  const h = await harness();
  try {
    h.db.run("INSERT INTO texts(id,text_key,title,source_text) VALUES ('t','t','',''); BEGIN");
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: 's' + i, he_plain: 'שלום' }));
    rows[50].id = 's0';
    await assert.rejects(h.add('t', rows), /UNIQUE/);
    h.db.run('ROLLBACK');
    assert.equal((await h.q('SELECT count(*) n FROM sentences'))[0].n, 0);
    assert.deepEqual(h.effects, ['guard']);
  } finally { h.db.close(); }
});

test('batch and single audio upserts preserve identity, existing provenance and null-coalescing semantics', async () => {
  const h = await harness();
  try {
    await h.single({ id: 'original', asset_key: 'shared', duration_ms: 1500, size_bytes: 99, tts_profile_json: '{"provider":"fixture"}' });
    const assets = Array.from({ length: 111 }, (_, i) => ({ id: 'a' + i, asset_key: 'key-' + i }));
    assets[0] = { id: 'ignored', asset_key: 'shared', relative_path: 'new/path', mime: 'audio/ogg' };
    assets[110] = { id: 'also-ignored', asset_key: 'shared', relative_path: 'last/path', duration_ms: 1700 };
    const result = await h.audio(assets);
    assert.equal(result.size, 110);
    const shared = result.get('shared');
    assert.equal(shared.id, 'original'); assert.equal(shared.relative_path, 'last/path');
    assert.equal(shared.duration_ms, 1700); assert.equal(shared.size_bytes, 99);
    assert.equal(shared.tts_profile_json, '{"provider":"fixture"}');
    assert.equal((await h.q('SELECT count(*) n FROM audio_assets'))[0].n, 110);
    assert.ok(h.calls.every(call => call.params.length <= 500));
    assert.equal((await h.audio([])).size, 0);
    assert.deepEqual(await h.q('PRAGMA foreign_key_check'), []);
  } finally { h.db.close(); }
});
