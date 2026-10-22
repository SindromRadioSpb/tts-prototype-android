'use strict';
// Ф3б: the AI word-gloss layer in the media-material ZIP (portable learning package) and in the
// Mediatheque publication. The layer is a derived cache, not content: the package keeps one content
// root with or without it, and a tampered layer fails the checksum like any other entry.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/portable-learning-package-core.js');
const Portable = require('../public/js/studio-portable-learning-package');
const Playback = require('../public/js/playback-source');
const Archive = require('../publication/materialArchive');
const fixture = require('./helpers/mediathequeArchiveFixture.cjs');
const TextCard = require('../public/js/text-card-format.js');

const LAYER = { schema: 'word-gloss-ai-layer-v1', rows: [{ order_index: 0, key: 'r2abc:1', model: 'gemini-3.8-flash', glosses: [{ gloss: 'привет', wrong_hint: false }], mwe: [] }] };
const OPTS = { mode: 'snapshot', exported_at: '2026-10-12T00:00:00Z', app_version: '3.11.742' };

test('package: the layer travels as a non-semantic entry and verification returns it', async () => {
  const plain = await Core.buildPackageFiles(fixture(), OPTS);
  const glossed = await Core.buildPackageFiles({ ...fixture(), word_gloss_ai_layer: LAYER }, OPTS);
  assert.ok(glossed['learning/word-gloss-ai.json']);
  assert.equal(JSON.parse(glossed['manifest.json']).content_root_sha256, JSON.parse(plain['manifest.json']).content_root_sha256,
    'one material identity with or without the AI layer');
  const verified = await Core.verifyPackageFiles(glossed);
  assert.deepEqual(verified.payload.word_gloss_ai_layer, LAYER);
  assert.equal((await Core.verifyPackageFiles(plain)).payload.word_gloss_ai_layer, undefined);
});

test('package: a tampered layer fails like any other manifested entry', async () => {
  const files = await Core.buildPackageFiles({ ...fixture(), word_gloss_ai_layer: LAYER }, OPTS);
  files['learning/word-gloss-ai.json'] = files['learning/word-gloss-ai.json'].replace('привет', 'пока');
  await assert.rejects(Core.verifyPackageFiles(files), /PACKAGE_(SIZE|CHECKSUM)_MISMATCH/);
});

test('publication: the owner\'s layer reaches the public snapshot, bounded', async () => {
  const input = { ...fixture(), word_gloss_ai_layer: LAYER };
  input.playback_source = Playback.append(null, { url: 'https://www.youtube.com/watch?v=sYd4zgR7f6w' });
  const bytes = Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input, { mode: 'snapshot' }), 'nodebuffer'));
  const out = await Archive.inspectArchive(bytes, { mode: 'youtube' });
  assert.equal(out.wordGlossRows, 1);
  assert.deepEqual(out.snapshot.library.texts[0].word_gloss_ai_layer, LAYER);

  assert.equal(Archive.wordGlossLayer({ ...LAYER, schema: 'x' }, 1), null);
  assert.equal(Archive.wordGlossLayer({ schema: LAYER.schema, rows: [{ ...LAYER.rows[0], order_index: 5 }] }, 1), null, 'row outside the card');
  assert.equal(Archive.wordGlossLayer({ schema: LAYER.schema, rows: [{ ...LAYER.rows[0], glosses: [{ gloss: 'x'.repeat(121) }] }] }, 1), null);
  const extra = Archive.wordGlossLayer({ schema: LAYER.schema, rows: [{ ...LAYER.rows[0], secret: 'drop me' }] }, 1);
  assert.equal('secret' in extra.rows[0], false, 'only known fields are kept');
});

test('publication: long rows keep their layer — the word count comes from the row key, not a fixed cap', () => {
  const n = 784; // the longest real learning row (Modern release, 2026-10-22)
  const glosses = Array.from({ length: n }, (_, i) => ({ gloss: 'слово' + i }));
  const mwe = Array.from({ length: 164 }, (_, i) => ({ from: i, to: i + 1, gloss: 'сочетание' }));
  const layer = { schema: LAYER.schema, rows: [{ order_index: 0, key: 'r2abc:' + n, model: 'm', glosses, mwe }] };
  const report = Archive.wordGlossLayerReport(layer, 1);
  assert.equal(report.layer.rows[0].glosses.length, n);
  assert.equal(report.layer.rows[0].mwe.length, 164);
  assert.deepEqual(report.rejected, []);
});

test('publication: every dropped layer row is reported with its reason', () => {
  const ok = LAYER.rows[0];
  const layer = { schema: LAYER.schema, rows: [
    ok,
    { ...ok, order_index: 1, key: 'r2abc:2' },                                         // 1 gloss for 2 words
    { ...ok, order_index: 2, mwe: [{ from: 0, to: 3, gloss: 'x' }] },                   // phrase outside the row
    { ...ok, order_index: 3, glosses: [{ gloss: 'x'.repeat(121) }] },                   // gloss too long
    { ...ok, order_index: 9 },                                                           // row outside the card
    { ...ok, order_index: 4, key: 'no-count' },                                          // key without word count
  ] };
  const report = Archive.wordGlossLayerReport(layer, 5);
  assert.deepEqual(report.layer.rows.map(r => r.order_index), [0]);
  assert.deepEqual(report.rejected.map(r => [r.order_index, r.reason]), [
    [1, 'GLOSS_COUNT_MISMATCH'], [2, 'MWE_OUT_OF_ROW'], [3, 'GLOSS_TOO_LONG'], [9, 'ROW_OUTSIDE_CARD'], [4, 'KEY_INVALID']]);
  assert.deepEqual(Archive.wordGlossLayer(layer, 5), report.layer, 'the compact form stays the same layer');
});

test('text card: the layer is exported and handed to the bundle import', () => {
  const payload = TextCard.buildCardPayload({ text: { title: 'T' }, sentences: [{ id: 's', order_index: 0, he_plain: 'שלום', he_niqqud: 'שָׁלוֹם', ru: 'привет' }], wordGlossAiLayer: LAYER });
  assert.deepEqual(payload.card.word_gloss_ai_layer, LAYER);
  const bundle = TextCard.cardToBundle(payload, { textKey: 'k', now: '2026-10-12T00:00:00Z' });
  assert.deepEqual(bundle.library.texts[0].word_gloss_ai_layer, LAYER);
  const none = TextCard.buildCardPayload({ text: { title: 'T' }, sentences: [] });
  assert.equal('word_gloss_ai_layer' in none.card, false);
});

test('publication keeps an occurrence correction with its AI original (bounded)', () => {
  const fixed = { schema: LAYER.schema, rows: [{ ...LAYER.rows[0], glosses: [{ gloss: 'здравствуй', manual: true, ai_gloss: 'привет', ai_wrong_hint: false, extra: 1 }] }] };
  const out = Archive.wordGlossLayer(fixed, 1);
  assert.deepEqual(out.rows[0].glosses[0], { gloss: 'здравствуй', wrong_hint: false, manual: true, ai_gloss: 'привет', ai_wrong_hint: false });
  assert.equal(Archive.wordGlossLayer({ schema: LAYER.schema, rows: [{ ...LAYER.rows[0], glosses: [{ gloss: 'x', manual: true, ai_gloss: 'y'.repeat(121) }] }] }, 1), null);
});

test('publication retains per-field attribution and restores it outside an immutable old snapshot', async () => {
  const input=fixture();
  input.table_revisions[0].rows[0].field_meta.he_niqqud={authority:'provider',provider:'OpenAI assistant',status:'current',secret:'discard'};
  const bytes=Buffer.from(await Portable.zipFiles(await Core.buildPackageFiles(input,OPTS),'nodebuffer'));
  const parsed=await Archive.inspectArchive(bytes,{mode:'media'});
  const row=parsed.snapshot.library.texts[0].rows[0];
  assert.equal(row.edit_meta._studio_material.field_meta.he_niqqud.provider,'OpenAI assistant');
  assert.equal(row.edit_meta._studio_material.field_meta.he_niqqud.secret,undefined);
  const old=structuredClone(parsed.snapshot);
  delete old.library.texts[0].rows[0].edit_meta;
  const before=JSON.stringify(old);
  const evidence=await Archive.fieldEvidence(bytes,old);
  assert.equal(JSON.stringify(old),before,'snapshot is immutable');
  assert.equal(evidence.rows[0].field_meta.he_niqqud.provider,'OpenAI assistant');
  old.library.texts[0].rows[0].hebrew_niqqud='אַחֵר';
  assert.equal((await Archive.fieldEvidence(bytes,old)).rows[0].field_meta.he_niqqud,undefined,'never attribute a changed value');
});
