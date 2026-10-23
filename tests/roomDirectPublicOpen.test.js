'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/library-ui.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const gate = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('concurrent public catalog consumers share one request, including validation and body reading', async () => {
  const body = gate(); let requests = 0, normalized = 0;
  const ctx = vm.createContext({ publicCatalogs: new Map(), publicCatalogLoads: new Map(),
    fetch: async () => { requests++; return { ok: true, json: () => body.promise }; },
    window: { PublicCorpusAdapter: { normalizeCorpus: value => { normalized++; return value; } } } });
  vm.runInContext(section('async function ensurePublicCatalog(', 'async function ensurePhysicsPublicEnhancement('), ctx);
  const calls = [ctx.ensurePublicCatalog('one'), ctx.ensurePublicCatalog('one')];
  assert.equal(requests, 1); body.resolve({ items: ['fixture'] });
  const [a, b] = await Promise.all(calls);
  assert.equal(a, b); assert.equal(normalized, 1); assert.equal(ctx.publicCatalogLoads.size, 0);
  assert.equal(await ctx.ensurePublicCatalog('one'), a); assert.equal(requests, 1);
  await ctx.ensurePublicCatalog('two'); assert.equal(requests, 2);
});

for (const failure of ['http', 'body', 'adapter']) test('public catalog failure is shared and a later request retries: ' + failure, async () => {
  const fetchGate = gate(); let requests = 0, valid = false;
  const ctx = vm.createContext({ publicCatalogs: new Map(), publicCatalogLoads: new Map(),
    fetch: async () => { requests++; await fetchGate.promise; return { ok: valid || failure !== 'http', status: 503,
      json: async () => { if (!valid && failure === 'body') throw new SyntaxError('broken body'); return { items: [] }; } }; },
    window: { PublicCorpusAdapter: { normalizeCorpus: value => { if (!valid && failure === 'adapter') throw new Error('invalid catalog'); return value; } } } });
  vm.runInContext(section('async function ensurePublicCatalog(', 'async function ensurePhysicsPublicEnhancement('), ctx);
  const failed = Promise.allSettled([ctx.ensurePublicCatalog('one'), ctx.ensurePublicCatalog('one')]); fetchGate.resolve();
  assert.ok((await failed).every(value => value.status === 'rejected'));
  assert.equal(requests, 1); assert.equal(ctx.publicCatalogs.size, 0); assert.equal(ctx.publicCatalogLoads.size, 0);
  valid = true; await ctx.ensurePublicCatalog('one'); assert.equal(requests, 2);
});

function fixture(overrides = {}) {
  const events = [], content = { appendChild: button => events.push(['retry', button]) }, reader = { hidden: true };
  const ctx = vm.createContext({ URLSearchParams, readerOpenEpoch: 0, corpusRenderToken: 0, corpusNav: {}, corpusReveal: 0,
    _roomPresentationReady: false, _roomInitialState: null, publicCorpora: [{ slug: 'fixture' }],
    roomApplyStateFields: state => events.push(['state', state]), setActiveTrack: (track, options) => events.push(['track', track, options]),
    roomCurrentPresentationState: state => state, roomStorePresentation: state => events.push(['store', state]),
    history: { replaceState: (state, _, url) => events.push(['history', url]) }, location: { href: '/library.html?public_corpus=fixture&public_work=A', reload: () => events.push(['reload']) },
    showState: key => events.push(['visible', key]), loadPublicCorpora: async () => ({ ok: true }),
    ensurePublicCatalog: async () => ({ items: [{ public_work_id: 'A', snapshot_sha256: 's1' }] }),
    openPublicCorpusWork: async (...args) => { events.push(['open', ...args]); return true; }, mediathequeReturnHref: () => '',
    $: id => id === 'roomReader' ? reader : content,
    el: () => ({ addEventListener: (_, fn) => { content.retry = fn; } }), tt: key => key,
    readerOpenFailedBox: () => events.push(['readerError']), ...overrides });
  vm.runInContext(section('async function openInitialPublicMaterial(', '// Restricted group corpus'), ctx);
  return { ctx, events, query: new URLSearchParams('public_corpus=fixture&public_work=A'), content };
}

test('direct public link establishes its parent and retains its URL without rendering the unrelated catalog', async () => {
  const f = fixture(); assert.equal(await f.ctx.openInitialPublicMaterial(f.query, null), true);
  assert.equal(f.events.filter(e => e[0] === 'open').length, 1);
  assert.equal(f.events.find(e => e[0] === 'track')[2].deferRender, true);
  assert.equal(f.events.find(e => e[0] === 'history')[1], f.ctx.location.href);
  assert.equal(f.ctx.corpusNav.corpus, 'public:fixture');
  assert.equal(f.events.find(e => e[0] === 'open')[3]._readerOpenEpoch, f.ctx.readerOpenEpoch);
  assert.equal(f.events.some(e => e[0] === 'retry'), false);
});

for (const failure of ['unpublished', 'network', 'missing', 'snapshot']) test('invalid public link never opens a local copy and offers a retry: ' + failure, async () => {
  const f = fixture();
  if (failure === 'unpublished') f.ctx.publicCorpora = [];
  if (failure === 'network') f.ctx.loadPublicCorpora = async () => ({ ok: false });
  if (failure === 'missing') f.ctx.ensurePublicCatalog = async () => ({ items: [] });
  if (failure === 'snapshot') f.query.set('public_snapshot', 'different');
  assert.equal(await f.ctx.openInitialPublicMaterial(f.query, null), true);
  assert.equal(f.events.some(e => e[0] === 'open'), false);
  assert.ok(f.content.retry); f.content.retry(); assert.equal(f.events.at(-1)[0], 'reload');
});

for (const boundary of ['publication', 'catalog']) for (const winner of ['reader', 'catalog']) test('late ' + boundary + ' resolution cannot replace newer ' + winner + ' navigation', async () => {
  const pending = gate(), f = fixture();
  if (boundary === 'publication') f.ctx.loadPublicCorpora = () => pending.promise;
  else f.ctx.ensurePublicCatalog = () => pending.promise;
  const opening = f.ctx.openInitialPublicMaterial(f.query, null);
  await Promise.resolve();
  if (winner === 'reader') f.ctx.readerOpenEpoch++;
  else f.ctx.corpusRenderToken++;
  pending.resolve(boundary === 'publication' ? { ok: true } : { items: [{ public_work_id: 'A' }] });
  assert.equal(await opening, true);
  assert.equal(f.events.some(e => e[0] === 'open' || e[0] === 'retry'), false);
});

test('protected, local, baked and ambiguous links retain their existing resolver', async () => {
  for (const query of ['group_corpus=secret&group_work=A', 'corpus_work=66120', 'public_corpus=fixture',
    'public_corpus=fixture&public_work=A&group_corpus=secret', 'public_corpus=fixture&public_work=A&corpus_work=66120']) {
    const f = fixture(); assert.equal(await f.ctx.openInitialPublicMaterial(new URLSearchParams(query), null), false);
    assert.equal(f.events.length, 0);
  }
});

test('navigation during materialization prevents late paint and outcome notices', async () => {
  const pending = gate(), events = []; let current = true;
  const ctx = vm.createContext({ readerOpenEpoch: 1, readerTextId: null, readerRows: [], localDb: {}, fetch() {},
    window: { PublicCorpusAdapter: {}, CorpusMaterialize: { ensurePublicWork: async (_, __, ___, opts) => {
      await pending.promise; assert.equal(opts.isCurrent(), false); return { localId: 'old' };
    } } }, corpusOpenQueue: { run: fn => fn() }, noticeWordGlossOutcome: () => events.push('notice'),
    openReader: () => events.push('paint'), invalidatePersonalSets() {}, roomToast: () => events.push('toast') });
  vm.runInContext(section('async function openPublicCorpusWork(', '// A direct public work needs'), ctx);
  const opening = ctx.openPublicCorpusWork('fixture', { public_work_id: 'A' }, { _readerOpenEpoch: 1, isCurrent: () => current });
  current = false; pending.resolve(); await opening;
  assert.deepEqual(events, []);
});

test('background canon waits for prior imports before gating writes and releases later imports', async () => {
  const { createSerialQueue } = require('../public/js/material-open.js');
  const queue = createSerialQueue(), prior = gate(), canon = gate(), events = [];
  const ctx = vm.createContext({ corpusOpenQueue: queue, _canonPending: false, _canonReadyPromise: null,
    autoImportCanon: async () => { events.push('canon'); await canon.promise; },
    loadData: async () => events.push('data'), activeTrack: 'corpus', readerTextId: 'new',
    renderTrack: () => events.push('paint'), console });
  const earlier = queue.run(async () => { await prior.promise; assert.equal(ctx._canonPending, false); events.push('prior'); });
  const start = source.indexOf('_canonReadyPromise = corpusOpenQueue.run(');
  const end = source.indexOf('\n        });', start) + '\n        });'.length;
  vm.runInContext(source.slice(start, end), ctx);
  const later = queue.run(() => { assert.equal(ctx._canonPending, false); events.push('later'); });
  await Promise.resolve(); assert.equal(ctx._canonPending, false);
  prior.resolve(); await earlier; await Promise.resolve();
  assert.equal(ctx._canonPending, true);
  assert.deepEqual(events, ['prior', 'canon']);
  canon.resolve(); await later;
  assert.deepEqual(events, ['prior', 'canon', 'data', 'later']);
});
