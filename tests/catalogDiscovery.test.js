const test = require('node:test');
const assert = require('node:assert/strict');
const discovery = require('../public/js/catalog-discovery-core.js');
const familiarity = require('../public/js/local-text-familiarity.js');
const compass = require('../public/js/learning-compass-core.js');

test('query separates tags and phrases, ignoring Hebrew marks consistently', () => {
  const q = discovery.parseQuery('שָׁלוֹם "two words" #Physics tag:year-1');
  assert.deepEqual(q.tags, ['Physics', 'year-1']);
  assert.deepEqual(q.textTokens, ['שלום', 'two words']);
  assert.equal(discovery.matchesText('שָׁלוֹם — two words', q.textTokens), true);
  assert.equal(discovery.matchesText('two other words', q.textTokens), false);
  assert.equal(discovery.matchesTags(['physics'], q.tags, 'all'), false);
  assert.equal(discovery.matchesTags(['physics'], q.tags, 'any'), true);
});

test('only valid rank-eligible familiarity sorts ahead; zero is a valid score', () => {
  const fit = (pct, status = 'AVAILABLE', eligible = true) => ({ status, rank_eligible: eligible, recorded_familiar_pct_lower_bound: pct });
  const rows = [{ id: 'limited', fit: fit(99, 'AVAILABLE_LIMITED', false) }, { id: 'missing' },
    { id: 'zero', fit: fit(0) }, { id: 'invalid', fit: fit(null) }, { id: 'high', fit: fit(75) }];
  const sorted = rows.slice().sort((a, b) => discovery.compareFamiliarity(a.fit, b.fit));
  assert.deepEqual(sorted.map(x => x.id), ['high', 'zero', 'limited', 'missing', 'invalid']);
  assert.equal(discovery.familiarityValue(fit(101)), null);
  assert.equal(discovery.familiarityValue(fit(NaN)), null);
});

test('all tags remain discoverable and selected rare tags survive the preview', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ tags: ['common', 'tag-' + i] }));
  const facets = discovery.tagFacets(items, x => x.tags, ['tag-29'], 8);
  assert.equal(facets.total, 31);
  assert.equal(facets.items[0].value, 'common');
  assert.equal(facets.items[0].count, 30);
  assert.ok(facets.items.some(x => x.value === 'tag-29'));
  assert.equal(discovery.tagFacets(items, x => x.tags, [], Infinity).items.length, 31);
});

test('shared descriptors match Room cache identity and source revision exactly', () => {
  assert.deepEqual(familiarity.descriptor({ id: '7', text_key: 'key', updated_at: 'rev' }, compass), {
    cache_key: 'mytext:7', source_class: 'mytext', source_key: 'key', local_id: '7',
    content_revision: 'rev', content_sha256: '', entitlement_revision: null, resolver_version: compass.RESOLVER_VERSION,
  });
});

const ingredients = (revision = 'rev') => ({ schema_version: compass.INGREDIENTS_SCHEMA, resolver_version: compass.RESOLVER_VERSION,
  source_class: 'mytext', source_key: 'key', content_revision: revision, content_sha256: 'a'.repeat(64),
  key_frequencies: [['p:1', 3], ['p:2', 1]], unresolved_token_count: 0, proper_name_token_count: 0, total_token_count: 4 });

test('local familiarity reuses the shared cache; no sentence reads or review writes for cached cards', async () => {
  let analyses = 0;
  const calls = [];
  const db = {
    getLearningCompassProjection: async () => ({ schema_version: compass.PROJECTION_SCHEMA, version: 'p1', tracked_lexeme_count: 1, state_by_key: { 'p:1': 'known' } }),
    getLearningCompassIngredientsBatch: async () => ({ entries: { 'mytext:7': ingredients() } }),
    getSentences: async () => { throw new Error('unexpected sentence read'); },
    putLearningCompassIngredients: async () => { throw new Error('unexpected cache write'); },
  };
  const service = familiarity.createService({ db, compass, analyze: async () => { analyses++; }, onUpdate: value => calls.push(value) });
  await service.prepare([{ id: '7', text_key: 'key', updated_at: 'rev' }]);
  assert.equal(analyses, 0);
  assert.equal(service.get('7').recorded_familiar_pct_lower_bound, 75);
  assert.ok(calls.length);
});

test('failed projection is not presented as an empty profile or zero familiarity', async () => {
  const db = { getLearningCompassProjection: async () => { throw new Error('offline'); } };
  const service = familiarity.createService({ db, compass });
  await service.prepare([{ id: '7', updated_at: 'rev' }]);
  assert.equal(service.get('7').status, 'UNAVAILABLE');
  assert.equal(service.get('7').recorded_familiar_pct_lower_bound, null);
});

test('a superseded analysis never paints or caches an older text revision', async () => {
  let finish;
  const written = [];
  const db = {
    getLearningCompassProjection: async () => ({ tracked_lexeme_count: 1 }),
    getLearningCompassIngredientsBatch: async () => ({ entries: {} }),
    getSentences: async () => [{ he_plain: 'שלום' }],
    putLearningCompassIngredients: async x => written.push(x),
  };
  const service = familiarity.createService({ db, compass, analyze: () => new Promise(resolve => { finish = resolve; }) });
  const first = service.prepare([{ id: '7', updated_at: 'old' }]);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  service.cancel();
  finish(ingredients('old'));
  await first;
  assert.equal(written.length, 0);
  assert.equal(service.get('7'), null);
});

// Perf 2026-09-27: on the owner profile 36 of 519 cached cards overflowed the 256 KiB page and
// were re-analysed on every Library open (~300 ms each). Overflow is deferred, not missing.
test('cards deferred by the packet budget are read again, never re-analysed', async () => {
  let analyses = 0;
  const requests = [];
  const db = {
    getLearningCompassProjection: async () => ({ schema_version: compass.PROJECTION_SCHEMA, version: 'p1', tracked_lexeme_count: 1, state_by_key: { 'p:1': 'known' } }),
    getLearningCompassIngredientsBatch: async (batch) => {
      requests.push(batch.map(item => item.local_id));
      const [first, ...rest] = batch;
      return { entries: { [first.cache_key]: ingredients() }, deferred_keys: rest.map(item => item.cache_key) };
    },
    getSentences: async () => { throw new Error('unexpected sentence read'); },
    putLearningCompassIngredients: async () => { throw new Error('unexpected cache write'); },
  };
  const service = familiarity.createService({ db, compass, analyze: async () => { analyses++; } });
  await service.prepare(['1', '2', '3'].map(id => ({ id, updated_at: 'rev' })));
  assert.equal(analyses, 0);
  for (const id of ['1', '2', '3']) assert.equal(service.get(id).recorded_familiar_pct_lower_bound, 75);
  assert.deepEqual(requests, [['1', '2', '3'], ['2', '3'], ['3']]);
});

test('a card the budget can never return falls back to analysis instead of looping', async () => {
  let analyses = 0;
  const db = {
    getLearningCompassProjection: async () => ({ schema_version: compass.PROJECTION_SCHEMA, version: 'p1', tracked_lexeme_count: 1, state_by_key: { 'p:1': 'known' } }),
    getLearningCompassIngredientsBatch: async (batch) => ({ entries: {}, deferred_keys: batch.map(item => item.cache_key) }),
    getSentences: async () => [{ he_plain: 'שלום' }],
    putLearningCompassIngredients: async () => {},
  };
  const service = familiarity.createService({ db, compass, analyze: async () => { analyses++; return ingredients(); } });
  await service.prepare([{ id: '1', updated_at: 'rev' }]);
  assert.equal(analyses, 1);
});

// O-025: a text with no Hebrew tokens can never be analysed; it was re-read and re-analysed on
// every Library open (3 owner texts, ~1 s of 3 s). The outcome is remembered per revision.
test('an unsupported text is not re-analysed until its revision changes', async () => {
  let analyses = 0;
  const store = new Map();
  const memo = { get: key => store.get(key), set: (key, value) => store.set(key, value) };
  const db = {
    getLearningCompassProjection: async () => ({ schema_version: compass.PROJECTION_SCHEMA, version: 'p1', tracked_lexeme_count: 1, state_by_key: { 'p:1': 'known' } }),
    getLearningCompassIngredientsBatch: async () => ({ entries: {} }),
    getSentences: async () => [{ he_plain: 'hello' }],
    putLearningCompassIngredients: async () => {},
  };
  const analyze = async () => { analyses++; throw new Error('NO_HEBREW_TOKENS'); };
  const first = familiarity.createService({ db, compass, analyze, unsupportedMemo: memo });
  await first.prepare([{ id: '9', updated_at: 'r1' }]);
  assert.equal(first.get('9').status, 'UNSUPPORTED');
  const updates = [];
  const second = familiarity.createService({ db: { ...db, getSentences: async () => { throw new Error('unexpected sentence read'); } }, compass, analyze, unsupportedMemo: memo, onUpdate: value => updates.push(value.state) });
  await second.prepare([{ id: '9', updated_at: 'r1' }]);
  assert.equal(updates[updates.length - 1], 'ready', 'a remembered last card still completes the progress');
  assert.equal(second.get('9').status, 'UNSUPPORTED');
  assert.equal(analyses, 1);
  const edited = familiarity.createService({ db, compass, analyze, unsupportedMemo: memo });
  await edited.prepare([{ id: '9', updated_at: 'r2' }]);
  assert.equal(analyses, 2);
});
