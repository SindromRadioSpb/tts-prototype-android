'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const MaterialOpen = require('../public/js/material-open');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(db) {
  let session = { mode: 'library', textId: 'A', baseUpdatedAt: 'revision-A' }, text = 'source-A';
  const ctx = { console, crypto: require('node:crypto').webcrypto, MaterialOpen, LOCAL_MODE: true,
    v3MaterialOpens: MaterialOpen.create(), currentTableData: [{ _v3_textId: 'A', he: 'AAAA' }],
    v3LastGeminiMeta: { material: 'A' }, window: {}, getText: () => text,
    v3SessionGet: () => session, v3SessionSet: value => { session = value; },
    v3BuildTtsProfileForSave: () => ({}), v3NormalizeTagsInput: () => [],
    v3TranslationFieldsForSave: () => ({}), ensureLocalDB: async () => db,
    showToast() {}, t: k => k };
  vm.createContext(ctx);
  const helper = source.slice(source.indexOf('function v3CaptureSaveContext('), source.indexOf('\nasync function v3LibrarySaveCurrentCore'));
  const update = source.slice(source.indexOf('async function v3LibraryUpdateCurrentCore('), source.indexOf('\nfunction v3LibraryMakeExportFilename'));
  const save = source.slice(source.indexOf('async function v3LibrarySaveCurrentCore('), source.indexOf('\nasync function v3LibraryUpdateCurrentCore'));
  vm.runInContext(helper + '\n' + update + '\n' + save, ctx);
  return { ctx, session: () => session, switchToB() {
    session = { mode: 'library', textId: 'B' }; text = 'source-B';
    ctx.currentTableData = [{ _v3_textId: 'B', he: 'BBBB' }];
    ctx.v3MaterialOpens.begin('B');
  }};
}
test('updating B with rows belonging to A is rejected before any database call', async () => {
  const f = fixture({ getTextById() { assert.fail('must not read or write'); } });
  assert.equal(await f.ctx.v3LibraryUpdateCurrentCore('B', {}), null);
});
test('a newer open during save preflight prevents writing different rows into the target', async () => {
  const gate = deferred(), writes = [];
  const f = fixture({ getTextById: () => gate.promise, replaceStudioText: (...args) => writes.push(args) });
  const saving = f.ctx.v3LibraryUpdateCurrentCore('A', {});
  await new Promise(r => setImmediate(r)); f.switchToB(); gate.resolve({ id: 'A' });
  assert.equal(await saving, null); assert.deepEqual(writes, []); assert.equal(f.session().textId, 'B');
});
test('a committed snapshot remains A and its late completion never rebinds the editor from B', async () => {
  const gate = deferred(), writes = [];
  const f = fixture({ getTextById: async () => ({ id: 'A' }), replaceStudioText: (id, payload) => { writes.push({ id, payload }); return gate.promise; } });
  const saving = f.ctx.v3LibraryUpdateCurrentCore('A', {});
  await new Promise(r => setImmediate(r)); assert.equal(writes.length, 1);
  f.switchToB(); gate.resolve({ id: 'A' });
  assert.equal((await saving).id, 'A'); assert.equal(f.session().textId, 'B');
  assert.equal(writes[0].payload.rows[0].he_plain, 'AAAA');
  assert.equal(writes[0].payload.expectedUpdatedAt, 'revision-A');
});
test('Save as new cannot mix an earlier source with a new table after a quota await', async () => {
  const gate = deferred();
  const f = fixture({}); f.ctx.v3StorageCheckThresholds = () => gate.promise;
  f.ctx.v3ResolveMediaContext = () => assert.fail('must stop before resolving different media');
  const saving = f.ctx.v3LibrarySaveCurrentCore({});
  f.switchToB(); gate.resolve({ ok: true });
  assert.equal(await saving, null);
});
test('saving while another material is loading is rejected even before its session is committed', () => {
  const f = fixture({}); f.ctx.v3MaterialOpens.begin('B');
  assert.throws(() => f.ctx.v3CaptureSaveContext('A'), /MATERIAL_CONTEXT_CHANGED/);
});
