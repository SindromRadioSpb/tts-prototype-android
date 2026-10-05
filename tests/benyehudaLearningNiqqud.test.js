'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const Layer = require('../public/js/benyehuda-learning-niqqud');
const { projectRows } = require('../scripts/premium/build-learning-niqqud');
const Translit = require('../db/premium/translit'), Display = require('../public/js/translit-display');
async function fixture() {
  const sentences = [{ id: 'saved-id', text_id: 'fixture', order_index: 0, he_plain: 'הבוקר הטהורים.', he_niqqud: 'הבוֹקר הטהוֹרים.', ru: 'Перевод', translit: 'old', audio_asset_key: 'saved-audio', edit_meta_json: null }];
  const text = { id: 'fixture', text_key: 'saved-key', source_meta_json: JSON.stringify({ corpus: { byehuda_id: '34190' } }) };
  const layer = { schema: Layer.SCHEMA, work_id: '34190', row_count: 1, source_rows_sha256: await Layer.sha256(Layer.sourceBytes(sentences)),
    provider: 'dicta-cloud', model_version: 'fixture-model', rows: [{ order_index: 0, he_plain: sentences[0].he_plain, source_niqqud: sentences[0].he_niqqud, learning_niqqud: 'הַבּוֹקֶר הַטְּהוֹרִים.' }] };
  return { text, sentences, layer };
}
test('presentation fixes row 06 in all profiles while source IDs, notes, audio and translation remain intact', async () => {
  const f = await fixture(), before = structuredClone(f), result = await Layer.apply(f.text, f.sentences, f.layer);
  assert.deepEqual(f, before); assert.equal(result.applied, 1);
  assert.deepEqual({ ...result.sentences[0], he_niqqud: f.sentences[0].he_niqqud, niqqud_authority: undefined, niqqud_provenance: undefined }, { ...f.sentences[0], niqqud_authority: undefined, niqqud_provenance: undefined });
  const display = Display.createDisplay(Translit.transliterateWithProfile);
  assert.equal(display(result.sentences[0], 'learner-latin'), 'Haboker hatehorim.');
  assert.equal(display(result.sentences[0], 'sbl'), 'habbôqer haṭṭəhôrîm.');
  assert.equal(display(result.sentences[0], 'ru-phonetic'), 'хабокэр хатэхорим.');
  assert.equal(result.sentences[0].niqqud_provenance.source, 'הבוֹקר הטהוֹרים.');
});
test('manual pointing and altered pointing without edit metadata are preserved; manual translit still wins', async () => {
  const f = await fixture();
  for (const edited of [{ he_niqqud: true }, { he: true }, { niqqud: true }]) {
    f.sentences[0].edit_meta_json = JSON.stringify({ edited });
    assert.equal((await Layer.apply(f.text, f.sentences, f.layer)).applied, 0);
  }
  f.sentences[0].edit_meta_json = JSON.stringify({ edited: { translit: true, translit_ru: true } });
  f.sentences[0].translit = 'My Latin'; f.sentences[0].translit_ru = 'Мой транслит';
  const out = await Layer.apply(f.text, f.sentences, f.layer), display = Display.createDisplay(Translit.transliterateWithProfile);
  assert.equal(display(out.sentences[0], 'sbl'), 'My Latin'); assert.equal(display(out.sentences[0], 'ru-phonetic'), 'Мой транслит');
  f.sentences[0].edit_meta_json = null; f.sentences[0].he_niqqud = 'הַבּוֹקֶר הַטְּהוֹרִים.';
  assert.equal((await Layer.apply(f.text, f.sentences, f.layer)).applied, 0);
  f.sentences[0].he_niqqud = f.layer.rows[0].source_niqqud;
  for (const extra of [{ niqqud_authority: 'USER' }, { field_meta: { he_niqqud: { locked: true } } }, { field_meta: { he_plain: { authority: 'user' } } }]) {
    assert.equal((await Layer.apply(f.text, [{ ...f.sentences[0], ...extra }], f.layer)).applied, 0);
  }
});
test('different work, private/group/public material, changed source, row count and order reject the layer', async () => {
  const f = await fixture();
  for (const meta of [{}, { corpus: { byehuda_id: '3557' } }, { corpus: { byehuda_id: '34190' }, group_corpus: {} }, { corpus: { byehuda_id: '34190' }, public_corpus: {} }]) {
    assert.equal((await Layer.apply({ ...f.text, source_meta_json: JSON.stringify(meta) }, f.sentences, f.layer)).applied, 0);
  }
  for (const rows of [[], [...f.sentences, ...f.sentences], [{ ...f.sentences[0], he_plain: 'שונה' }], [{ ...f.sentences[0], order_index: 9 }]]) assert.equal((await Layer.apply(f.text, rows, f.layer)).applied, 0);
  assert.throws(() => Layer.validateLayer({ ...f.layer, rows: [{ ...f.layer.rows[0], learning_niqqud: 'שָׁלוֹם' }] }), /Invalid/);
});
test('hash corruption and unavailable layers fall back and retry; late responses cannot project onto a new open', async () => {
  const f = await fixture(), bytes = new TextEncoder().encode(JSON.stringify(f.layer)), manifest = { works: { '34190': { file: 'learning-niqqud/34190-' + 'a'.repeat(32) + '.json', sha256: await Layer.sha256(bytes) } } };
  let calls = 0, mode = 'error';
  const loader = Layer.createLoader(manifest, { fetch: async () => { calls++; if (mode === 'error') throw Error('offline'); return { ok: true, arrayBuffer: async () => mode === 'corrupt' ? bytes.slice(2) : bytes }; } });
  const material = { text: f.text, sentences: f.sentences };
  assert.strictEqual(await loader.prepare(material), material);
  mode = 'corrupt'; assert.strictEqual(await loader.prepare(material), material);
  mode = 'ok'; assert.strictEqual(await loader.prepare(material, () => false), material);
  assert.equal((await loader.prepare(material)).learningNiqqud.applied, 1);
  assert.equal(calls, 3);
});
test('source spelling and punctuation survive full-spelling projection; changed letters and missing tokens are not guessed', () => {
  const rows = [{ order_index: 0, hebrew_plain: 'הבוקר הטהורים.', hebrew_niqqud: 'הבוֹקר הטהוֹרים.' }];
  const out = projectRows(rows, 'הַבֹּקֶר הַטְּהוֹרִים.');
  assert.equal(out.entries[0].learning_niqqud, 'הַבּוֹקֶר הַטְּהוֹרִים.');
  assert.equal(Layer.canonical(out.entries[0].learning_niqqud), rows[0].hebrew_plain);
  assert.throws(() => projectRows(rows, 'הַבֹּקֶר'), /count changed/);
  assert.equal(projectRows(rows, 'הַבֹּקֶר הַשְּׁחוֹרִים.').entries[0].learning_niqqud, 'הַבּוֹקֶר הטהוֹרים.');
  assert.equal(projectRows([{ ...rows[0], hebrew_plain: 'מול', hebrew_niqqud: 'מוּל' }], 'מוּל').matched, 1);
});
test('ReaderCore rejects a superseded asynchronous preparation before painting, and provider failure retains source', async t => {
  const core = await import('data:text/javascript;base64,' + fs.readFileSync(require.resolve('../public/js/reader-core.js')).toString('base64'));
  const f = await fixture(), original = globalThis.MaterialOpen;
  globalThis.MaterialOpen = { load: async () => ({ ok: true, text: f.text, sentences: f.sentences }) };
  t.after(() => { globalThis.MaterialOpen = original; });
  const mount = { innerHTML: 'before' }; let current = true, release;
  const pending = core.openText('fixture', { localDb: {}, mount, isCurrent: () => current,
    prepareMaterial: () => new Promise(resolve => { release = resolve; }) });
  await new Promise(resolve => setImmediate(resolve)); current = false;
  release({ text: f.text, sentences: (await Layer.apply(f.text, f.sentences, f.layer)).sentences });
  assert.equal((await pending).reason, 'superseded'); assert.equal(mount.innerHTML, 'before');
  const result = await core.openText('fixture', { localDb: {}, mount, prepareMaterial: async () => { throw Error('offline'); } });
  assert.equal(result.ok, true); assert.equal(result.rows[0].he_niqqud, f.sentences[0].he_niqqud);
});
