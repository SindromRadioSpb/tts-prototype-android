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
