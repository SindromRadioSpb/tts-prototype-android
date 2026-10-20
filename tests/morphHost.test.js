const test = require('node:test');
const assert = require('node:assert/strict');

const MorphHost = require('../public/js/morph-host.js');

test('confirming a name appends only an anchored owner decision and refuses a stale word', async () => {
  const previousWindow=global.window,previousRM=global.ReaderMorph;
  const RM=require('../public/js/reader-morph.js'),Core=require('../public/js/lexical-resolution-core.js');
  const Scan=require('../public/js/text-key-scan.js');
  global.ReaderMorph=RM;
  global.window={ReaderMorph:RM,LexicalResolutionCore:Core,TextKeyScan:Scan};
  const row={id:'sid',text_id:'tid',text_key:'key',order_index:0,he_plain:'שאול,',he_niqqud:'שָׁאוּל,'};
  const events=[];
  const db={dbQuery:async()=>[row],appendLexicalResolutionEvent:async event=>events.push(Core.normalizeEvent(event))};
  try {
    const host=MorphHost.createHost({ldb:async()=>db});
    const occ={text_id:'tid',sentence_id:'sid',word_offset:0,surface:'שאול',sentence_he:row.he_plain,sentence_he_niqqud:row.he_niqqud};
    const result=await host.confirmOccurrenceName(occ,'Шауль');
    assert.equal(result.analysis.lp_pos,'propernoun');
    assert.equal(result.analysis.root,'');
    assert.equal(events.length,1);
    const service=require('../public/js/lexical-resolution-service.js');
    const exact={...row,sentence_id:row.id,text_id:row.text_id,text_key:row.text_key,word_offset:0,surface:'שאול',niqqud:'שָׁאוּל',sentence_he:row.he_plain,sentence_he_niqqud:row.he_niqqud};
    assert.equal((await service.projectExactOccurrence(exact,events,Core)).state,'resolved');
    await assert.rejects(host.confirmOccurrenceName({...occ,surface:'אחר'},'Другое'),/LEXICAL_SOURCE_CHANGED/);
    await assert.rejects(host.confirmOccurrenceName({...occ,sentence_he_niqqud:'אַחֵר'},'Другое'),/LEXICAL_SOURCE_CHANGED/);
    assert.equal(events.length,1,'stale confirmations have no side effects');
  } finally {global.window=previousWindow;global.ReaderMorph=previousRM;}
});

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

test('MorphHost plays one shared public word asset before BYOK or browser synthesis', async () => {
  const previousAudio = global.Audio;
  const previousWindow = global.window;
  let played = '', resolved = 0, keyReads = 0;
  global.Audio = class {
    pause() {}
    set src(value) { played = value; }
    async play() {}
  };
  global.window = { speechSynthesis: { cancel() {}, speak() { throw new Error('browser fallback must not run'); } } };
  try {
    const host = MorphHost.createHost({
      resolvePublicWordAudio: async text => { resolved += 1; return { audio_url: '/api/audio/public-word', text }; },
      getTtsKey: () => { keyReads += 1; return 'private-key-must-not-be-read'; },
    });
    await host.speakWord('מִלָּה');
  } finally {
    global.Audio = previousAudio;
    global.window = previousWindow;
  }
  assert.equal(resolved, 1);
  assert.equal(played, '/api/audio/public-word');
  assert.equal(keyReads, 0);
});
