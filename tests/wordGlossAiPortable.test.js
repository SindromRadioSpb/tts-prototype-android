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

test('text card: the layer is exported and handed to the bundle import', () => {
  const payload = TextCard.buildCardPayload({ text: { title: 'T' }, sentences: [{ id: 's', order_index: 0, he_plain: 'שלום', he_niqqud: 'שָׁלוֹם', ru: 'привет' }], wordGlossAiLayer: LAYER });
  assert.deepEqual(payload.card.word_gloss_ai_layer, LAYER);
  const bundle = TextCard.cardToBundle(payload, { textKey: 'k', now: '2026-10-12T00:00:00Z' });
  assert.deepEqual(bundle.library.texts[0].word_gloss_ai_layer, LAYER);
  const none = TextCard.buildCardPayload({ text: { title: 'T' }, sentences: [] });
  assert.equal('word_gloss_ai_layer' in none.card, false);
});
