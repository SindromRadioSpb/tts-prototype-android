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
  assert.deepEqual(Layer.restoreSource(result.sentences[0]), { ...f.sentences[0], niqqud_authority: undefined, niqqud_provenance: undefined });
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
  assert.equal((await loader.prepare(material)).studyNiqqudStatus, 'unavailable');
  mode = 'corrupt'; assert.equal((await loader.prepare(material)).studyNiqqudStatus, 'unavailable');
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
  assert.equal(projectRows([{ ...rows[0], hebrew_plain: '11.jpg', hebrew_niqqud: '' }], '11.jpg').entries[0].learning_niqqud, '');
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
test('an edited source row does not disable the verified layer on its neighbours; saving preserves source and explicit edits', async () => {
  const f = await fixture();
  f.sentences.push({ ...f.sentences[0], id: 'second', order_index: 1 });
  f.layer.rows.push({ ...f.layer.rows[0], order_index: 1 });
  f.layer.row_count = 2; f.layer.source_rows_sha256 = await Layer.sha256(Layer.sourceBytes(f.sentences));
  f.sentences[0] = { ...f.sentences[0], he_plain: 'בדיקה', he_niqqud: 'בְּדִיקָה', edit_meta_json: '{"edited":{"he":true}}' };
  const result = await Layer.apply(f.text, f.sentences, f.layer);
  assert.equal(result.applied, 1); assert.equal(result.sentences[0], f.sentences[0]);
  assert.equal(result.sentences[1].he_niqqud, f.layer.rows[1].learning_niqqud);
  assert.equal(Layer.restoreSource(result.sentences[1]).he_niqqud, f.sentences[1].he_niqqud);
  const manual = { ...result.sentences[1], he_niqqud: 'בְּדִיקָה' };
  assert.equal(Layer.restoreSource(manual), manual);
  f.sentences[1].he_plain = 'OTHER SOURCE'; assert.equal((await Layer.apply(f.text, f.sentences, f.layer)).applied, 0);
});
test('validated layers persist offline across loader instances; corrupt cache is repaired and corrupt import rejected', async t => {
  const f = await fixture(), bytes = JSON.stringify(f.layer), sha256 = await Layer.sha256(new TextEncoder().encode(bytes));
  const manifest = { works: { '34190': { file: 'learning-niqqud/34190-' + sha256.slice(0, 32) + '.json', sha256 } } };
  const records = new Map(), bucket = { match: async key => records.get(key)?.clone(), put: async (key, response) => records.set(key, response.clone()), delete: async key => records.delete(key) };
  const storage = { open: async name => { assert.equal(name, Layer.CACHE); return bucket; } }; let calls = 0;
  const fetch = async () => { calls++; return new Response(bytes); };
  assert.equal((await Layer.createLoader(manifest, { fetch, cacheStorage: storage }).prepare(f)).learningNiqqud.applied, 1);
  assert.equal((await Layer.createLoader(manifest, { fetch: () => { throw Error('offline'); }, cacheStorage: storage }).prepare(f)).learningNiqqud.applied, 1);
  assert.equal(calls, 1);
  records.set('/data/benyehuda/' + manifest.works['34190'].file, new Response('{"corrupt":true}'));
  await Layer.createLoader(manifest, { fetch, cacheStorage: storage }).prepare(f); assert.equal(calls, 2);
  const previous = { caches: globalThis.caches, manifest: globalThis.BenYehudaLearningNiqqudManifest };
  globalThis.caches = storage; globalThis.BenYehudaLearningNiqqudManifest = manifest;
  t.after(() => { globalThis.caches = previous.caches; globalThis.BenYehudaLearningNiqqudManifest = previous.manifest; });
  const pin = await Layer.remember({ layer: f.layer, sha256 }, f.text);
  assert.equal(pin.sha256, sha256);
  const frozen = { ...f.text, source_meta_json: JSON.stringify({ corpus: { byehuda_id: '34190' }, _learning_niqqud_pin: pin }) };
  const newer = { works: { '34190': { ...pin, sha256: 'f'.repeat(64) } } };
  assert.equal((await Layer.createLoader(newer, { fetch: () => { throw Error('offline'); }, cacheStorage: storage }).prepare({ ...f, text: frozen })).sentences[0].he_niqqud, f.layer.rows[0].learning_niqqud);
  await assert.rejects(Layer.remember({ layer: f.layer, sha256: '0'.repeat(64) }, f.text), /Invalid portable/);
});
test('preparation is byte-stable on rerun, keeps complete source rows, and never repeats a cached provider request', async t => {
  const os = require('node:os'), path = require('node:path'), { build } = require('../scripts/premium/build-learning-niqqud');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-niqqud-stable-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'source.json');
  fs.writeFileSync(source, JSON.stringify({ library: { texts: [{ source_meta: { corpus: { byehuda_id: '34190' } }, rows: [
    { order_index: 0, hebrew_plain: 'הבוקר הטהורים.', hebrew_niqqud: 'הבוֹקר הטהוֹרים.' },
    { order_index: 1, hebrew_plain: 'שלום לכם.', hebrew_niqqud: 'שָׁלוֹם לָכֶם.' }
  ] }] } }));
  let calls = 0;
  const options = { source, out: path.join(dir, 'out'), cache: path.join(dir, 'cache'), quiet: true, provider: async () => {
    calls++; return { body: { model_version: 'dicta-nakdan-cloud-v1', results: ['הַבֹּקֶר הַטְּהוֹרִים. שָׁלוֹם לָכֶם.'] } };
  } };
  const one = await build(options), two = await build(options);
  assert.equal(one.sha256, two.sha256); assert.equal(calls, 1); assert.equal(two.requested_fragments, 0);
  const layer = JSON.parse(fs.readFileSync(path.join(options.out, path.basename(one.file))));
  assert.equal(layer.rows[1].learning_niqqud, 'שָׁלוֹם לָכֶם.');
});
test('a private copy carries a frozen derived binding while its source and edits stay canonical', async t => {
  const f = await fixture(), old = globalThis.BenYehudaLearningNiqqudManifest;
  const sha256 = await Layer.sha256(new TextEncoder().encode(JSON.stringify(f.layer)));
  globalThis.BenYehudaLearningNiqqudManifest = { works: { '34190': { file: 'learning-niqqud/34190-' + sha256.slice(0,32) + '.json', sha256 } } };
  t.after(() => { globalThis.BenYehudaLearningNiqqudManifest = old; });
  const binding = Layer.copyBinding(f.text);
  const copy = { id: 'private-copy', source_meta_json: JSON.stringify({ provider: 'preserved', ...binding }) };
  assert.equal(Layer.workId(copy), '34190'); assert.equal(Layer.pinFor(copy).sha256, sha256);
  assert.equal((await Layer.apply(copy, f.sentences, f.layer)).applied, 1);
  assert.equal((await Layer.apply(copy, [{...f.sentences[0], he_plain: 'שונה'}], f.layer)).applied, 0);
  assert.equal(Layer.copyBinding({ id: '34190' }), null);
  assert.equal(Layer.workId({ source_meta: {...binding, public_corpus: {}} }), null);
});

test('model-merged quoted abbreviations cannot shift pointing onto neighbours or become invented pronunciation', () => {
  const rows=[{order_index:0,hebrew_plain:'קיבוץ מססס"ר בכנרת.',hebrew_niqqud:''}];
  const out=projectRows(rows,'קִבּוּץ מָסַסַסַר בַּכִּנֶּרֶת.');
  assert.equal(out.entries[0].learning_niqqud.normalize('NFC'),'קִיבּוּץ מססס"ר בַּכִּנֶּרֶת.'.normalize('NFC'));
  assert.equal(out.entries[0].unresolved_words,1);
  assert.equal(Layer.canonical(out.entries[0].learning_niqqud),rows[0].hebrew_plain);
  const split=projectRows([{...rows[0],hebrew_plain:'יוםיומיות כאן.'}],'יוֹם יוֹמִיּוֹת כָּאן.');
  assert.equal(split.entries[0].learning_niqqud.normalize('NFC'),'יוםיומיות כָּאן.'.normalize('NFC'));
  assert.equal(split.entries[0].unresolved_words,1);
  assert.throws(()=>projectRows([{...rows[0],hebrew_plain:'שלום לכם כאן.'}],'שָׁלוֹם כָּאן.'),/count changed/);
});

test('review hints distinguish incomplete words from unusual signs and disappear after an owner edit', async () => {
  const f=await fixture();f.layer.rows[0].unresolved_words=1;f.layer.rows[0].review_signals=2;
  const row=(await Layer.apply(f.text,f.sentences,f.layer)).sentences[0];
  assert.equal(Layer.isLearning(row),true);
  assert.match(Layer.reviewHint(row,key=>key+' {count}'),/unresolved 1.*reviewSignals 2/);
  const manual={...row,he_niqqud:'בְּדִיקָה',edit_meta_json:'{"edited":{"he_niqqud":true}}'};
  assert.equal(Layer.isLearning(manual),false);assert.equal(Layer.reviewHint(manual,key=>key),'');
});

test('a slow immutable download does not delay the view and warms the next open without a repeated request', async () => {
  const f=await fixture(),bytes=JSON.stringify(f.layer),sha256=await Layer.sha256(new TextEncoder().encode(bytes));
  const manifest={works:{'34190':{file:'learning-niqqud/34190-'+sha256.slice(0,32)+'.json',sha256}}};
  let release,calls=0;const loader=Layer.createLoader(manifest,{timeoutMs:5,fetchTimeoutMs:1000,cacheStorage:null,
    fetch:()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  assert.equal((await loader.prepare(f)).studyNiqqudStatus,'unavailable');
  release(new Response(bytes));await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await loader.prepare(f)).learningNiqqud.applied,1);assert.equal(calls,1);
});
