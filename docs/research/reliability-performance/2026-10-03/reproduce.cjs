// Historical diagnostic reproductions against baseline 9d1d11e7, not the repaired checkout.
// No server, profile or provider calls. Current acceptance: npm run smoke:material-reliability.
// Run from repository root: node docs/research/reliability-performance/2026-10-03/reproduce.cjs
// A reproduced defect is NOT a passing product acceptance gate.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const read = p => execFileSync('git', ['show', '9d1d11e7:' + p], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const storage = initial => { const map = new Map(Object.entries(initial || {})); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,String(v)) }; };

async function main() {
  const result = { sourceCommit: '9d1d11e7', evidence: 'isolated source-level reproductions', defects: [] };
  const studio = read('public/index.html');
  const start = studio.indexOf('    // Snapshot the pre-multitab draft once.');
  const end = studio.indexOf('    const STORAGE_KEY', start);
  assert.ok(start > 0 && end > start);
  const key = 'ttsDashboard_session_state_v1';
  const localStorage = storage({ [key]: JSON.stringify({ textId: 'old-A', mode: 'library' }) });
  const first = storage();
  vm.runInNewContext(studio.slice(start,end), { localStorage, sessionStorage: first });
  first.setItem(key, JSON.stringify({ textId: 'new-B', mode: 'library' }));
  const fresh = storage();
  vm.runInNewContext(studio.slice(start,end), { localStorage, sessionStorage: fresh });
  assert.equal(JSON.parse(fresh.getItem(key)).textId, 'old-A');
  result.defects.push({ name: 'new-tab-reimports-stale-session', expected: 'new-B', actual: 'old-A', reproduced: true });

  const core = await import('data:text/javascript;base64,' + Buffer.from(read('public/js/reader-core.js')).toString('base64'));
  const a = deferred(), b = deferred();
  const mount = { innerHTML: '' };
  const db = { getTextByIdLite: async id => ({ id, title: id }), getSentences: id => (id === 'A' ? a.promise : b.promise) };
  let epoch = 0, accepted = null;
  // Same guard placement as library-ui.js: epoch is checked AFTER core.openText has painted.
  async function open(id) { const mine = ++epoch; const r = await core.openText(id, { localDb: db, mount }); if (mine !== epoch) return; accepted = r.text.id; }
  const openingA = open('A'), openingB = open('B');
  b.resolve([{ id:'row-B', order_index:0, he:'BBBB', ru:'material-B' }]); await openingB;
  const htmlB = mount.innerHTML;
  a.resolve([{ id:'row-A', order_index:0, he:'AAAA', ru:'material-A' }]); await openingA;
  assert.equal(accepted, 'B'); assert.notEqual(mount.innerHTML, htmlB); assert.ok(mount.innerHTML.includes('material-A'));
  result.defects.push({ name:'reader-stale-request-paints-after-newer-open', acceptedMaterial:accepted, paintedMaterial:'A', reproduced:true, limitation:'real renderer, fake DB and mount; not a reproduction of the owner click sequence' });

  const hydrationA = deferred(), hydrationB = deferred();
  let activeStudio = null, sourceStudio = null, metaStudio = null;
  const studioDb = { listNotes:async()=>[], getTextByIdLite:async id=>({id,title:id}),
    getSentences:async id=>[{id:'row-'+id,he:id,order_index:0}], touchOpened:async()=>{},
    getTextSourceText:id=>(id==='A'?hydrationA.promise:hydrationB.promise) };
  const noop = () => {};
  const studioCtx = { LOCAL_MODE:true, console, currentTableData:[],
    window:{ v3SetActiveTextId:id=>{activeStudio=id;}, v3SetActiveLibraryTextMeta:meta=>{metaStudio=meta.textId;} },
    ensureLocalDB:async()=>studioDb, v3EmitTextOpenWithClose:noop, v3SessionSet:noop,
    v3AdoptSavedTableMeta:noop, v3RestoreMediaFromMeta:noop, v3MediaBarRefresh:async()=>{},
    v3LibraryAutoApplyCardProfile:async()=>{}, v3MapSentenceApiRowToUiRow:r=>r,
    v3LibraryCacheSave:noop, v3NotesIngest:noop, v3NotesReset:noop, v3PrepareForNewTableRender:noop,
    v3RenderTableFromLibrary:rows=>{studioCtx.currentTableData=rows;return 1;},
    v3LazyFillTranslit:async()=>0, v3SetSourceTextFromLibrary:s=>{sourceStudio=s;},
    v3RestoreUnboundMediaAfterSourceHydration:async()=>{}, v3NotesRefreshAllButtons:noop,
    showToast:noop, v3LibraryClose:noop, v3UiSyncSaveButtons:noop, v3UiUpdateActiveHeader:noop,
    classicSyncMainPanels:noop, t:k=>k };
  const studioStart = studio.indexOf('async function v3LibraryOpenText(textId, opts)');
  const studioEnd = studio.indexOf('\nasync function v3LibraryArchiveText', studioStart);
  assert.ok(studioStart > 0 && studioEnd > studioStart);
  vm.createContext(studioCtx); vm.runInContext(studio.slice(studioStart,studioEnd),studioCtx);
  await vm.runInContext('v3LibraryOpenText("A", {})',studioCtx);
  await vm.runInContext('v3LibraryOpenText("B", {})',studioCtx);
  hydrationB.resolve('source-B'); await new Promise(r=>setImmediate(r));
  assert.equal(sourceStudio,'source-B');
  hydrationA.resolve('source-A'); await new Promise(r=>setImmediate(r));
  assert.equal(activeStudio,'B'); assert.equal(sourceStudio,'source-A'); assert.equal(metaStudio,'A');
  result.defects.push({ name:'studio-stale-source-hydration', activeMaterial:activeStudio,
    sourceText:sourceStudio, activeLibraryMetadata:metaStudio, reproduced:true,
    limitation:'actual opener with fake DB and UI collaborators; persistence corruption not demonstrated' });

  const ml = read('public/js/mediatheque-ui.js');
  const loadStart = ml.indexOf('async function loadAll()');
  const loadEnd = ml.indexOf('\nasync function save(',loadStart);
  assert.ok(loadStart > 0 && loadEnd > loadStart);
  const local = deferred(); let renders = 0;
  const state = { owner:false, publicReady:false, localReady:false };
  const ctx = { state, loadEpoch:0, tutorEnabled:false, pendingPosition:null, externalRefreshDirty:false,
    api:async () => ({}), loadLocal:() => local.promise, loadPublic:async () => { state.publicReady=true; },
    render:() => { renders++; }, announce() {}, errorText:e=>e.message, localStorage:storage() };
  vm.createContext(ctx); vm.runInContext(ml.slice(loadStart,loadEnd),ctx);
  const loading = vm.runInContext('loadAll()',ctx);
  await new Promise(r => setImmediate(r));
  assert.equal(state.publicReady,true); assert.equal(renders,0);
  local.resolve(); await loading; assert.equal(renders,1);
  result.defects.push({ name:'public-catalog-waits-for-local-library', publicReadyBeforeLocal:true, renderCountBeforeLocal:0, renderCountAfterLocal:renders, reproduced:true });
  console.log(JSON.stringify(result,null,2));
}
main().catch(e => { console.error(e); process.exitCode=1; });
