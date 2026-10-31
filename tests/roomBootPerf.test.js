'use strict';
// Perf 2026-10-31 (3.11.825): Room open on the owner profile — the home waited for the
// recommendation (~4 s), and every auto-sync refetched 35 legacy public-corpus artifacts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Cloud = require('../public/js/cloud-sync');

const ui = fs.readFileSync(path.join(__dirname, '../public/js/library-ui.js'), 'utf8');
const fnSource = (name) => {
  const start = ui.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name + ' exists');
  const next = ui.slice(start + 10).search(/\n(?:async )?function |\n\/\/ «Мои тексты» as a FULL corpus/);
  return ui.slice(start, start + 10 + next);
};

function fakeLdb({ corpusKeys = [], ownTexts = [], state = {} } = {}) {
  const calls = { imports: [] };
  return {
    calls, state,
    listOwnTextsForSync: async () => ownTexts,
    exportBundle: async () => ({ texts: [] }),
    dbQuery: async (sql) => (/SELECT text_key FROM texts/.test(sql)
      ? corpusKeys.concat(ownTexts.map((t) => t.text_key)).map((text_key) => ({ text_key })) : []),
    getSyncState: async (key) => (key in state ? state[key] : null),
    setSyncState: async (key, value) => { state[key] = value; },
    importBundle: async (payload, opts) => { calls.imports.push({ payload, opts }); return { imported: 0, skipped: 1 }; },
  };
}

function stubFetch(rows) {
  const seen = [];
  global.fetch = async (url) => {
    seen.push(String(url));
    let json;
    if (url === '/api/learner/artifacts') json = { ok: true, rows, tombstones: [] };
    else if (String(url).startsWith('/api/learner/artifacts/get')) json = { ok: true, payload: { texts: [] } };
    else json = { ok: true };
    return { status: 200, json: async () => json };
  };
  return seen;
}

const session = { consents: { cloud_texts: { granted: true, version: Cloud.CLOUD_TEXTS_CONSENT_VERSION } } };
const gets = (seen) => seen.filter((u) => u.startsWith('/api/learner/artifacts/get')).length;

test('a corpus copy reconciled once is not refetched on the next sync; a newer server version is', async () => {
  const key = 'public:study-songs:work-1';
  const ldb = fakeLdb({ corpusKeys: [key] });
  let seen = stubFetch([{ artifact_key: key, updated_at: '2026-08-30T00:00:00Z' }]);
  await Cloud.syncArtifacts(ldb, session, { auto: true });
  assert.equal(gets(seen), 1, 'first sync still reconciles the server copy once');
  assert.equal(ldb.calls.imports[0].opts.mode, 'skip');

  seen = stubFetch([{ artifact_key: key, updated_at: '2026-08-30T00:00:00Z' }]);
  await Cloud.syncArtifacts(ldb, session, { auto: true });
  assert.equal(gets(seen), 0, 'unchanged server version is not downloaded again');

  seen = stubFetch([{ artifact_key: key, updated_at: '2026-09-01T00:00:00Z' }]);
  await Cloud.syncArtifacts(ldb, session, { auto: true });
  assert.equal(gets(seen), 1, 'a newer server version is fetched');
});

test('a key missing locally is always fetched (restore on a new device is unchanged)', async () => {
  const key = 'public:study-songs:work-2';
  const ldb = fakeLdb({ corpusKeys: [], state: { artifact_down_reconciled_v1: JSON.stringify({ [key]: '2026-08-30T00:00:00Z' }) } });
  const seen = stubFetch([{ artifact_key: key, updated_at: '2026-08-30T00:00:00Z' }]);
  await Cloud.syncArtifacts(ldb, session, { auto: true });
  assert.equal(gets(seen), 1);
});

test('the Room home paints before the recommendation and due count settle', () => {
  const hub = fnSource('renderCorpusHub');
  const firstAwait = hub.slice(hub.indexOf('await Promise.all(['), hub.indexOf(']);') + 3);
  assert.doesNotMatch(firstAwait, /buildNextTextPicks|refreshDueBadge/, 'slow projections must not gate the first paint');
  assert.match(hub, /const picksLoad = buildNextTextPicks\(\)/);
  assert.match(hub, /const dueLoad = refreshDueBadge\(\)/);
  assert.doesNotMatch(hub, /await picksLoad/, 'boot must not wait for the recommendation either');
  assert.ok(hub.indexOf('const picksLoad') > hub.indexOf('main.appendChild(wrap)'),
    'the FIFO DB worker serves the fast home reads first: slow reads start after the first paint');
  assert.match(firstAwait, /loadCorpusIndex\(\)/,
    'the ready shelf must not depend on the recommendation having loaded the catalog index');
  const feature = fnSource('learningHomeFeature');
  assert.match(feature, /nextPicks === LEARNING_HOME_PICKS_PENDING[\s\S]*'pending'[\s\S]*aria-busy/,
    'a pending recommendation is a busy slot, not the «оценка не рассчитана» browse claim');
});

test('concurrent due refreshes share one run plus at most one follow-up', () => {
  const due = fnSource('refreshDueBadge');
  assert.match(due, /if \(!_dueRefreshInFlight\)/);
  assert.match(due, /_dueRefreshQueued = _dueRefreshInFlight\.catch/);
});

test('an initial pageshow no longer forces a second full sync; empty auto-syncs skip the familiarity rebuild', () => {
  assert.match(ui, /addEventListener\('pageshow', \(event\) => \{ if \(event\.persisted\) roomCloudMaybeResync\(true\); \}\)/);
  const changed = fnSource('cloudSyncChangedLocalTruth');
  assert.match(changed, /if \(!\('lwwApplied' in down\)\) return true;/, 'an older result shape keeps the full refresh');
  const run = fnSource('_cloudRunSync');
  assert.match(run, /if \(auto && !cloudSyncChangedLocalTruth\(res\)\)[\s\S]*ensureLearningCompassProjection\(true\)/);
});
