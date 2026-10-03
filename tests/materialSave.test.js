'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Save = require('../public/js/material-save');

function fixture(meta = {}) {
  const state = { session: { textId: 'A', baseUpdatedAt: 'rev-A' }, sourceText: 'source-A',
    rows: [{ _v3_textId: 'A', he: 'שלום', he_niqqud: 'שָׁלוֹם', ru: 'привет', translit: 'shalom',
      edit_meta_json: '{"owner":"kept"}' }], tableModelMeta: { provider: 'paid', source: { sha: 'original' } },
    audio: { media_sha256: 'original' }, ttsProfile: { voice: 'saved-voice' } };
  const save = Save.capture(() => state);
  const prepared = Save.prepare(save, meta, tags => Array.isArray(tags) ? tags : []);
  const calls = [], texts = new Map(); let backup;
  const db = {
    async execRaw(sql) { calls.push(sql); if (sql === 'BEGIN;') backup = new Map(texts); if (sql === 'ROLLBACK;') { texts.clear(); for (const x of backup) texts.set(...x); } },
    async createText(text) { calls.push('text'); texts.set(text.id, { ...text }); },
    async addSentences(id, rows, options) { calls.push('rows'); texts.get(id).rows = rows; options.onProgress(rows.length, rows.length); },
    async updateText(id, fields) { calls.push('meta'); Object.assign(texts.get(id), fields); },
    async getTextById(id) { return texts.get(id); },
  };
  let serial = 0;
  const deps = { localMode: true, getDb: async () => db, resolveMedia: async () => ({ context: null, resolution: null }),
    mediaPassport: () => null, translationFields: () => ({ translation_provider: 'paid', translation_meta_json: '{"receipt":"kept"}' }),
    newId: () => 'new-' + ++serial, onProgress: event => calls.push(event.phase) };
  return { state, save, prepared, deps, db, texts, calls };
}

test('preparation owns metadata, paid rows, media and TTS before an asynchronous preflight', async () => {
  const meta = { title: ' original title ', tags: ['original'] }, f = fixture(meta);
  meta.title = 'later'; meta.tags.push('later');
  f.state.tableModelMeta.source.sha = 'later'; f.state.ttsProfile.voice = 'later';
  const result = await Save.commitCreate(f.prepared, f.deps);
  assert.equal(result.text.title, 'original title');
  assert.deepEqual(JSON.parse(result.text.tags_json), ['original']);
  assert.equal(JSON.parse(result.text.source_meta_json).source.sha, 'original');
  assert.equal(JSON.parse(result.text.tts_profile_json).voice, 'saved-voice');
  assert.equal(result.text.rows[0].translation_provider, 'paid');
  assert.equal(result.text.rows[0].translation_meta_json, '{"receipt":"kept"}');
  assert.equal(result.text.rows[0].edit_meta_json, '{"owner":"kept"}');
  assert.equal(result.text.rows[0].ru, 'привет');
  assert.deepEqual(f.calls, ['BEGIN;', 'text', 'rows', 'rows', 'rows', 'commit', 'COMMIT;']);
});

test('row-write failure rolls back the new card and rejects instead of returning success', async () => {
  const f = fixture();
  f.db.addSentences = async () => { throw new Error('quota'); };
  await assert.rejects(Save.commitCreate(f.prepared, f.deps), /quota/);
  assert.equal(f.texts.size, 0);
  assert.deepEqual(f.calls, ['BEGIN;', 'text', 'rows', 'ROLLBACK;']);
});

test('binding disagreement commits all text with an explicit unbound outcome', async () => {
  const f = fixture();
  f.deps.resolveMedia = async () => ({ context: { ref: { revision_id: 'r' }, passport: {}, package: {} }, resolution: {} });
  f.deps.mediaPackage = { resolveBindTarget: async () => ({ package_id: 'p' }),
    browserRepository: () => ({ bindText: async () => { throw Object.assign(new Error('identity'), { code: 'BINDING_PROVENANCE_MISMATCH' }); } }),
    buildMediaSaveOutcome: ({ reason }) => ({ status: 'not_bound', reason }),
    attachMediaSaveOutcome: (meta, outcome) => ({ ...meta, media_save_outcome: outcome }) };
  const result = await Save.commitCreate(f.prepared, f.deps);
  assert.deepEqual(result.warnings, ['media-not-bound']);
  assert.equal(JSON.parse(result.text.source_meta_json).media_save_outcome.reason, 'BINDING_PROVENANCE_MISMATCH');
  assert.equal(result.text.rows[0].he_plain, 'שלום');
  assert.ok(f.calls.indexOf('meta') < f.calls.indexOf('COMMIT;'));
});

test('unexpected binding failure rolls back text, rows and metadata together', async () => {
  const f = fixture();
  f.deps.resolveMedia = async () => ({ context: { ref: {}, passport: {}, package: {} } });
  f.deps.mediaPackage = { resolveBindTarget: async () => { throw new Error('storage-failed'); } };
  await assert.rejects(Save.commitCreate(f.prepared, f.deps), /storage-failed/);
  assert.equal(f.texts.size, 0); assert.equal(f.calls.at(-1), 'ROLLBACK;');
});

test('duplicate media is a decision without writes; explicit copy permits a new card', async () => {
  const f = fixture();
  f.deps.resolveMedia = async () => ({ context: { package: { media_sha256: 'abc' } } });
  f.db.findTextsByMediaSha = async () => [{ id: 'existing' }];
  assert.deepEqual(await Save.commitCreate(f.prepared, f.deps), { reason: 'duplicate-media', existing: { id: 'existing' } });
  assert.deepEqual(f.calls, []);
  const copy = Save.prepare(f.save, { allowDuplicateMedia: true }, () => []);
  assert.equal((await Save.commitCreate(copy, f.deps)).text.id, 'new-1');
});

test('revision conflict from canonical replacement is propagated without fallback creation', async () => {
  const f = fixture(); f.texts.set('A', { id: 'A' });
  f.db.replaceStudioText = async (id, payload) => {
    assert.equal(id, 'A'); assert.equal(payload.expectedUpdatedAt, 'rev-A');
    assert.equal(payload.rows[0].ru, 'привет');
    throw Object.assign(new Error('conflict'), { code: 'DB_TEXT_CHANGED' });
  };
  await assert.rejects(Save.commitUpdate('A', f.prepared, f.deps), { code: 'DB_TEXT_CHANGED' });
  assert.deepEqual(f.calls, []); assert.equal(f.texts.size, 1);
});

test('remote create/update use the same prepared snapshot and cannot write after context changes', async () => {
  const f = fixture({ title: 'A' }), requests = [];
  const deps = { localMode: false, postJson: async (url, payload) => { requests.push({ url, payload }); return { text: { id: 'copy' } }; },
    putJson: async (url, payload) => { requests.push({ url, payload }); return { text: { id: 'A' } }; } };
  assert.equal((await Save.commitCreate(f.prepared, deps)).text.id, 'copy');
  assert.equal((await Save.commitUpdate('A', f.prepared, deps)).text.id, 'A');
  assert.deepEqual(requests.map(r => r.url), ['/api/library/texts', '/api/library/texts/A']);
  assert.equal(requests[1].payload.sourceText, 'source-A');
  f.state.rows[0].ru = 'changed while awaiting';
  await assert.rejects(Save.commitCreate(f.prepared, deps), { code: 'MATERIAL_CONTEXT_CHANGED' });
  assert.equal(requests.length, 2);
});
