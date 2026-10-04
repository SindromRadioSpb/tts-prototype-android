'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const discovery = require('../public/js/corpus-discovery-core.js');
const data = filename => JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/benyehuda', filename), 'utf8'));
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const ready = () => ({ id: '101', era: 'modern', segments: 2, review_status: 'machine', audio_status: 'none',
  coverage: { text: true, translation: 'machine', niqqud: 1 }, text_key: 'work-101', file: 'works/101.json' });
const rows = () => [
  { row_id: '1', hebrew_plain: 'שלום', hebrew_niqqud: 'שָׁלוֹם', russian: 'Мир', translit: 'shalom', audio_asset_key: 'audio-1' },
  { row_id: '2', hebrew_plain: 'עולם', hebrew_niqqud: 'עולם', russian: '', translit: '' },
];

test('legacy publication is distinct from complete translation, audio and freshness', () => {
  const card = frozen(ready());
  const result = discovery.describeMaterial(card, { catalogRevision: 7 });
  assert.equal(result.availability.state, 'published');
  assert.deepEqual(result.coverage.translation, { status: 'present', basis: 'catalog', numerator: null, denominator: null, scope: 'work' });
  assert.equal(result.coverage.niqqud.status, 'present');
  assert.equal(result.coverage.audio.status, 'none');
  assert.equal(result.provenance.provider, null);
  assert.equal(result.provenance.processing, 'machine');
  assert.equal(result.provenance.review, 'unknown');
  assert.equal(Object.hasOwn(result.provenance, 'qualityScore'), false);
  assert.equal(result.version.learningEditionId, null);
  assert.equal(result.version.revision, null);
  assert.equal(result.version.currentLocalVersion, 'unverified');
});

test('metadata-only and transient errors remain distinguishable and do not erase publication', () => {
  const unpublished = { id: 99, coverage: { text: false, translation: 'none' } };
  assert.equal(discovery.describeMaterial(unpublished).availability.state, 'metadata-only');
  const failure = discovery.describeMaterial(ready(), { loadError: true });
  assert.equal(failure.availability.state, 'error');
  assert.equal(failure.availability.published, true);
  assert.equal(failure.availability.reason, 'load-failed');
  assert.equal(discovery.describeMaterial({}, { published: true }).availability.state, 'published');
  assert.equal(discovery.describeMaterial({}, { rows: rows(), rowsComplete: true }).availability.state, 'metadata-only');
});

test('coverage measures supplied rows, without upgrading a sample to the full work', () => {
  const measured = discovery.measureCoverage(rows());
  assert.deepEqual(measured.translation, { status: 'partial', basis: 'measured', numerator: 1, denominator: 2, scope: 'provided-rows' });
  assert.equal(measured.niqqud.status, 'partial');
  assert.equal(measured.transliteration.status, 'partial');
  assert.equal(measured.audio.status, 'unknown');
  assert.equal(measured.audioReferences.numerator, 1);
  assert.equal(measured.audioReferences.basis, 'row-references');
  assert.equal(measured.completeWork, false);
  const samplePassport = discovery.describeMaterial(ready(), { rows: rows().slice(0, 1) });
  assert.equal(samplePassport.coverage.translation.status, 'present');
  assert.equal(samplePassport.measuredSample.translation.scope, 'provided-rows');
  const mismatch = discovery.measureCoverage(rows(), { completeWork: true, expectedRows: 3 });
  assert.equal(mismatch.completeWork, false);
  assert.deepEqual(mismatch.warnings, ['row-count-mismatch']);
});

test('measured whole-work coverage counts zeros accurately and validates playable audio separately', () => {
  const complete = discovery.describeMaterial(ready(), { rows: rows(), rowsComplete: true, verifiedAudioRowIds: ['1'] });
  assert.equal(complete.coverage.translation.status, 'partial');
  assert.equal(complete.coverage.translation.scope, 'work');
  assert.equal(complete.coverage.translation.denominator, 2);
  assert.equal(complete.coverage.audio.status, 'partial');
  assert.equal(complete.coverage.audio.basis, 'verified-assets');
  assert.equal(discovery.measureCoverage([{ he_plain: 'עולם', ru: '' }]).translation.status, 'none');
  assert.equal(discovery.measureCoverage([]).translation.status, 'unknown');
  for (const [n, d] of [[null, 2], [1, 0], [3, 2], [-1, 2], [true, 2]]) assert.equal(discovery.measuredLayer(n, d).status, 'unknown');
  assert.equal(discovery.measuredLayer(0, 2).numerator, 0);
  assert.equal(discovery.measureCoverage([{ id: 0, he_plain: 'שלום' }], { verifiedAudioRowIds: ['0'] }).audio.numerator, 1);
});

test('asserted TTS or human audio does not prove full coverage; machine-assisted is separate from proofread', () => {
  for (const audio_status of ['tts', 'human']) assert.equal(discovery.describeMaterial({ ...ready(), audio_status }).coverage.audio.status, 'present');
  assert.equal(discovery.describeMaterial({ ...ready(), review_status: 'machine_assisted' }).provenance.review, 'machine-assisted');
  assert.equal(discovery.describeMaterial({ ...ready(), review_status: 'human_proofread' }).provenance.review, 'human-proofread');
});

test('offline claims require explicit local text and asset evidence, never online state alone', () => {
  assert.equal(discovery.describeMaterial(ready()).localState.text, 'unknown');
  assert.equal(discovery.describeMaterial(ready(), { localText: true }).localState.completeOffline, false);
  assert.equal(discovery.describeMaterial(ready(), { localText: false, localAudio: true, allRequiredAssetsLocal: true }).localState.completeOffline, false);
  const result = discovery.describeMaterial(ready(), { localText: true, localAudio: false, allRequiredAssetsLocal: true });
  assert.equal(result.localState.completeOffline, true);
  assert.equal(result.localState.audio, 'absent');
});

test('official periods require work identity and source snapshot; app-era never supplies them', () => {
  const inferred = discovery.describeMaterial({ ...ready(), birth: 1921, death: 1944 });
  assert.equal(inferred.sourcePeriod.status, 'unchecked');
  assert.equal(inferred.sourcePeriod.value, null);
  assert.equal(inferred.appEra.value, 'modern');
  assert.equal(inferred.appEra.official, false);
  const period = { status: 'known', scope: 'work', work_id: '101', value: 'modern', source_label: 'source period label',
    source_url: 'https://benyehuda.org/read/101', snapshot: 'metadata:sha256-123' };
  assert.equal(discovery.normalizeSourcePeriod(period, '101').status, 'known');
  for (const change of [{ scope: 'author' }, { work_id: '102' }, { snapshot: null }, { source_label: null }, { source_url: 'javascript:alert(1)' }]) {
    assert.equal(discovery.normalizeSourcePeriod({ ...period, ...change }, '101').status, 'unchecked');
  }
});

test('unchecked sources and checked sources without classification remain distinct', () => {
  assert.equal(discovery.normalizeSourcePeriod(null, '101').status, 'unchecked');
  assert.equal(discovery.normalizeSourcePeriod({ status: 'checked-absent' }, '101').status, 'unchecked');
  const absent = { status: 'checked-absent', scope: 'work', work_id: '101',
    source_url: 'https://benyehuda.org/read/101', snapshot: 'metadata-v1' };
  const result = discovery.normalizeSourcePeriod(absent, '101');
  assert.equal(result.status, 'checked-absent');
  assert.equal(result.sourceUrl, absent.source_url);
  assert.equal(result.snapshot, 'metadata-v1');
  assert.equal(discovery.normalizeSourcePeriod({ ...absent, value: 'modern' }, '101').status, 'unchecked');
});

test('catalog group count and drill use the same projection and preserve solo/coauthored records', () => {
  const index = data('corpus-index-v7.json'), authority = data('corpus-authors-v7.json');
  const initial = JSON.stringify(index.authors.modern);
  const groups = discovery.groupCatalogAuthors(frozen(index.authors.modern), frozen(authority));
  assert.equal(groups.length, 17); // baseline for this catalog, not a runtime constant or all-human count
  const group = groups.find(group => group.qid === 'Q12407209');
  assert.equal(group.catalogRows, 2);
  assert.equal(group.works, 15);
  assert.equal(group.ready, 14);
  assert.deepEqual(group.originalNames, ['זהרה לביָטוב', 'זהרה לביָטוב; שמואל קופמן']);
  assert.deepEqual(group.blocks, [null]);
  assert.equal(group.coauthored, true);
  assert.match(group.name, /שמואל קופמן/);
  assert.ok(group.contributors.some(person => person.name === 'שמואל קופמן' && person.qid === null));
  assert.ok(group.contributors.some(person => person.qid === 'Q12407209'));
  assert.equal(JSON.stringify(index.authors.modern), initial);
});

test('homonyms with different IDs and missing identities never merge by text', () => {
  const groups = discovery.groupCatalogAuthors([
    { name: 'same name', qid: 'Q123', works: 1 }, { name: 'same name', qid: 'Q124', works: 2 },
    { name: 'same name', works: 3 }, { name: 'same name', qid: 'Q0', works: 4 },
    { name: 'alias', qid: 'Q123', works: 5 },
  ]);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].works, 6);
  assert.deepEqual(groups[0].name_variants, ['same name', 'alias']);
  assert.notEqual(groups[2].groupId, groups[3].groupId);
  const explicit = discovery.groupCatalogAuthors([{ name: 'same name; second person', qid: 'Q123',
    contributors: [null, { name: 'same name', qid: 'Q123', role: 'author' }, { name: 'second person', qid: 'Q125', role: 'translator' }] }]);
  assert.equal(explicit[0].contributors.length, 2);
  assert.equal(explicit[0].contributors[1].qid, 'Q125');
  assert.equal(explicit[0].contributors[1].role, 'translator');
});

test('checked aliases are additive and identity-bound, including one name with multiple identities', () => {
  const sidecar = data('author-aliases-v1.json'), authors = data('corpus-authors-v7.json');
  assert.deepEqual(discovery.authorAliasMatches('Хана Сенеш', sidecar), ['Q236094']);
  assert.deepEqual(discovery.authorAliasMatches('Сенеш Хана', sidecar), ['Q236094']);
  assert.deepEqual(discovery.authorAliasMatches('Бялик', sidecar), ['Q359705']);
  assert.deepEqual(discovery.aliasesForAuthor('Q236094', sidecar), ['Хана Сенеш', 'Сенеш, Хана']);
  assert.deepEqual(discovery.aliasesForAuthor('Q236094', sidecar, { locale: 'he' }), []);
  for (const entry of sidecar.entries) assert.ok(authors.authors.some(node => node.qid === entry.qid));
  const evidence = { source_url: 'https://www.wikidata.org/wiki/Q123', snapshot: 'v1' };
  const namesakes = ['Q123', 'Q124'].map(qid => ({ qid, locale: 'ru', verified: true, label: 'Одно имя', evidence }));
  assert.deepEqual(discovery.authorAliasMatches('Одно имя', namesakes), ['Q123', 'Q124']);
  assert.deepEqual(discovery.authorAliasMatches('Одно имя', [{ ...namesakes[0], verified: false }]), []);
  assert.deepEqual(discovery.authorAliasMatches('', sidecar), []);
});

test('preview byte policy rejects declared large bodies and unknown-length streams before retaining excess', () => {
  assert.equal(discovery.PREVIEW_BYTES, 131072);
  assert.equal(discovery.previewPolicy({ contentLength: 131073 }).cancel, true);
  assert.equal(discovery.previewPolicy({ contentLength: 131072 }).allowed, true);
  assert.equal(discovery.previewPolicy({ contentLength: null }).allowed, true);
  assert.equal(discovery.previewPolicy({ bytesRead: 131000, nextChunkBytes: 73 }).cancel, true);
  assert.equal(discovery.previewPolicy({ bytesRead: 131000, nextChunkBytes: 72 }).retainedBytes, 131072);
  assert.equal(discovery.previewPolicy({ contentLength: -1 }).contentLength, null);
  assert.equal(discovery.previewPolicy({ bytesRead: 10, nextChunkBytes: 20, budgetBytes: 15 }).retainedBytes, 10);
  assert.equal(discovery.previewPolicy({ nextChunkBytes: Infinity }).cancel, true);
});

test('preview keeps part order, exposes only public row fields and does not modify bundle or learner data', () => {
  const first = rows(), second = Array.from({ length: 5 }, (_, i) => ({ he_plain: 'חלק ' + i, ru: 'Часть ' + i, notes: 'private', manual_lock: true }));
  const bundle = frozen({ library: { texts: [{ rows: first }, { rows: second }] }, review_log: [{ grade: 4 }], notes: ['private'] });
  const before = JSON.stringify(bundle);
  const preview = discovery.extractPreview(bundle, { maxRows: 5, completeWork: true, expectedRows: 7 });
  assert.equal(preview.rows.length, 5);
  assert.equal(preview.textCount, 2);
  assert.equal(preview.totalRows, 7);
  assert.equal(preview.rows[2].hebrew, 'חלק 0');
  assert.equal(preview.coverage.completeWork, true);
  assert.deepEqual(Object.keys(preview.rows[0]), ['hebrew', 'russian', 'transliteration']);
  assert.equal(JSON.stringify(bundle), before);
  assert.deepEqual(discovery.extractPreview(null).rows, []);
});

test('browser UMD installation has no DOM/storage/network access', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/corpus-discovery-core.js'), 'utf8');
  const sandbox = { URL, TextEncoder };
  for (const name of ['document', 'fetch', 'localStorage', 'indexedDB']) Object.defineProperty(sandbox, name, { get() { throw new Error('side effect: ' + name); } });
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.CorpusDiscovery.describeMaterial, 'function');
  assert.equal(sandbox.CorpusDiscovery.describeMaterial(ready()).availability.state, 'published');
});
