'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const Core = require('../public/js/lexical-resolution-core.js');
const Repository = require('../public/js/lexical-resolution-repository.js');

let SQL, migration;
test.before(async () => {
  SQL = await initSqlJs();
  const { MIGRATIONS } = await import('../public/db/migrations.js');
  migration = MIGRATIONS[50];
});

function database(textId, sentenceId) {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys=ON; CREATE TABLE texts(id TEXT PRIMARY KEY); CREATE TABLE sentences(id TEXT PRIMARY KEY,text_id TEXT);');
  db.run(migration);
  db.run('INSERT INTO texts VALUES (?)', [textId]);
  db.run('INSERT INTO sentences VALUES (?,?)', [sentenceId, textId]);
  const rows = (sql, params = []) => {
    const statement = db.prepare(sql); statement.bind(params); const out = [];
    while (statement.step()) out.push(statement.getAsObject());
    statement.free(); return out;
  };
  const adapter = {
    dbQuery: async (sql, params) => rows(sql, params),
    dbRun: async (sql, params) => { const statement = db.prepare(sql); statement.run(params || []); statement.free(); return { changes: db.getRowsModified() }; },
    execRaw: async (sql) => db.run(sql)
  };
  return { db, repo: Repository.createRepository(adapter, Core) };
}

function sourceEvent(id, textId, sentenceId, offset) {
  return {
    id, occurrence_id: `lpro:${textId}:${sentenceId}:${offset}`, text_id: textId, sentence_id: sentenceId,
    word_offset: offset, text_key: `key-${textId}`, order_index: 0, surface_norm: 'נטע',
    source_anchor: 'sha256:source', action: 'manual_correction',
    chosen_analysis: { lemma: 'נטע', lp_pos: 'propernoun' }, candidate_fingerprint: 'sha256:candidates',
    morph_model_version: 'dicta-v1', actor_kind: 'owner', created_at: '2026-09-04T00:00:00Z'
  };
}

for (const mode of ['full', 'slim']) {
  test(`${mode} notes_advanced roundtrip preserves and rebinds scoped lexical decisions`, async () => {
    const source = database('old-text', 'old-sentence');
    await source.repo.append(sourceEvent(`event-${mode}`, 'old-text', 'old-sentence', 2));
    const payload = { schema_version: 3, lexical_resolution_events: await source.repo.listForTexts(['old-text']) };
    assert.equal(payload.lexical_resolution_events.length, 1);

    const destination = database('new-text', 'new-sentence');
    for (const raw of payload.lexical_resolution_events) {
      await destination.repo.append(Core.rebindPortableEvent(raw, { text_id: 'new-text', sentence_id: 'new-sentence' }));
    }
    const restored = await destination.repo.listForText('new-text');
    assert.equal(restored.length, 1);
    assert.equal(restored[0].occurrence_id, 'lpro:new-text:new-sentence:2');
    assert.deepEqual(restored[0].chosen_analysis, { lemma: 'נטע', lp_pos: 'propernoun', pealim_id: '', root: '', binyan: '', meaning_ru: '' });

    const again = await destination.repo.append(Core.rebindPortableEvent(payload.lexical_resolution_events[0], { text_id: 'new-text', sentence_id: 'new-sentence' }));
    assert.equal(again.inserted, false);
    assert.equal((await destination.repo.listForText('new-text')).length, 1);
  });
}

test('text-scoped export never over-carries another text decisions', async () => {
  const source = database('t1', 's1');
  source.db.run("INSERT INTO texts VALUES ('t2'); INSERT INTO sentences VALUES ('s2','t2');");
  await source.repo.append(sourceEvent('e1', 't1', 's1', 0));
  await source.repo.append(sourceEvent('e2', 't2', 's2', 0));
  const rows = await source.repo.listForTexts(['t1']);
  assert.deepEqual(rows.map((row) => row.id), ['e1']);
});
