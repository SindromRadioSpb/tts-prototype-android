const test = require('node:test');
const assert = require('node:assert/strict');

const MorphHost = require('../public/js/morph-host.js');

test('MorphHost exposes one reference-stable word-state cache to Room consumers', async () => {
  const loaded = { 'pid:1': 'l2' };
  const primed = { 'pid:2': 'known' };
  let reads = 0;
  const host = MorphHost.createHost({
    ldb: async () => ({
      getKnownWordStates: async () => {
        reads += 1;
        return loaded;
      },
    }),
  });

  assert.equal(host.peekWordStates(), null);
  assert.strictEqual(await host.ensureWordStates(), loaded);
  assert.strictEqual(host.peekWordStates(), loaded);
  assert.strictEqual(await host.ensureWordStates(), loaded);
  assert.equal(reads, 1);

  host.primeWordStates(primed);
  assert.strictEqual(host.peekWordStates(), primed);
  assert.strictEqual(await host.ensureWordStates(), primed);
  assert.equal(reads, 1);

  host.invalidateWordStates();
  assert.equal(host.peekWordStates(), null);
  assert.strictEqual(await host.ensureWordStates(), loaded);
  assert.equal(reads, 2);
});

test('MorphHost accepts an explicitly verified derivative occurrence without falling back to the open condition text', async () => {
  let localLookups = 0;
  const expected = { textKey: 'public-solution:exact-derivative', sentenceId: 'solution-row-7', orderIndex: 7, surface: 'יסוד' };
  const host = MorphHost.createHost({
    getTextKey: async () => 'public:condition:wrong-source',
    verifyOccurrence: async occ => occ && occ.source_kind === 'reviewed_solution' ? expected : null,
    ldb: async () => ({ getSentenceForReview: async () => { localLookups += 1; return null; } }),
  });
  assert.deepEqual(await host.occToVerifiedSource({ source_kind: 'reviewed_solution', surface: 'יסוד' }), expected);
  assert.equal(localLookups, 0, 'a validated immutable derivative must not be reinterpreted as a local condition row');
});

test('MorphHost fails closed when an external derivative occurrence cannot be verified', async () => {
  let localLookups = 0;
  const host = MorphHost.createHost({
    getTextKey: async () => 'public:condition:wrong-source',
    verifyOccurrence: async () => null,
    ldb: async () => ({ getSentenceForReview: async () => { localLookups += 1; return { id: 'wrong' }; } }),
  });
  assert.equal(await host.occToVerifiedSource({ source_kind: 'reviewed_solution', surface: 'יסוד', sentence_id: 'solution-row-7' }), null);
  assert.equal(localLookups, 0, 'an invalid external anchor must not fall through to the active condition text');
});

test('an invalid external derivative is never relabelled as the open condition in a review row', async () => {
  const appended = [];
  const ldb = {
    getWordStatus: async () => '', updateSrsState: async () => {},
    appendReviewLog: async row => { appended.push(row); },
  };
  const host = MorphHost.createHost({
    getTextKey: async () => 'public:condition:must-not-leak',
    verifyOccurrence: async () => null,
    ldb: async () => ldb,
  });
  const previousWindow = global.window;
  global.window = {
    ReaderMorph: { nextSrs: () => ({ due: Date.now() + 1000 }) },
    LemmaCanon: { KEYER_VERSION: 'test', reviewId: () => 'review:1' },
  };
  try {
    await host.gradeReadingTap({ lemmaKey: 'lemma:1', word: 'יסוד' }, {
      source_kind: 'reviewed_solution', surface: 'יסוד', sentence_id: 'solution-row-7',
    }, true, null);
  } finally {
    global.window = previousWindow;
  }
  assert.equal(appended.length, 1);
  assert.equal(appended[0].meta.text_key, undefined);
});
