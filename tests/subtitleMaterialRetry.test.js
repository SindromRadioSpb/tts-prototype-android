const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('retry after local vocalization failure preserves prepared and stored video renditions', async () => {
  // Execute the actual browser orchestration with its I/O seams replaced; never copy its algorithm.
  const source = fs.readFileSync(path.join(__dirname, '../public/js/studio-import.js'), 'utf8');
  const start = source.indexOf('  function showSubtitleSaveStep()');
  const end = source.indexOf('  function renderAudioMeta()', start);
  assert.ok(start > 0 && end > start);
  const calls = [], timers = [], rows = [{ he: 'שלום', ru: 'Привет' }];
  const next = { scrollIntoView: () => calls.push('scroll-to-save') };
  const action = { dataset: { action: 'save' }, disabled: false,
    focus: () => calls.push('focus-save') };
  const material = { plan: { status: 'ready', plan_sha256: 'a'.repeat(64),
    lite_plan_sha256: 'b'.repeat(64), lite: { available: true } } };
  let attempts = 0;
  const context = {
    pendingSubtitleMaterial: material,
    pendingAudio: { mediaJobId: 'job', mediaReadiness: { plan: { mode: 'audio_transcode' } } },
    localAsrClient: { getMediaJob:async()=>({}) }, mediaJobStatus() {}, setBusy() {}, setSubtitlePlanStatus() {},
    renderSubtitlePlan() {}, renderMediaReadiness() {}, $: id =>
      id === 'classicNextStep' ? next : id === 'classicNextActionBtn' ? action : { checked: true },
    buildSubtitleTable: async () => { material.tableRows = rows; return rows; },
    applySubtitleMaterial: async () => { calls.push('apply'); return true; },
    window: {
      setTimeout: callback => timers.push(callback),
      MediaReadiness: { VIDEO_MAX_BYTES: 3 * 1024 ** 3, humanBytes: String,
        acceptPrepared: () => ({ outcome: 'READY' }) },
      LocalTranslit: { transliterateWithProfile() {} },
      SubtitleMaterialImport: {
        materialImportKey:async()=>null,
        confirmMediaPlan: async opts => { calls.push('prepare:' + (opts.rendition || 'full'));
          return { state: 'COMPLETE', output_sha256: 'c'.repeat(64) }; },
        storePreparedMedia: async opts => { calls.push('store:' + (opts.rendition || 'full'));
          return { opfsPath: 'media/' + (opts.rendition || 'full'), sizeBytes: 100, name: 'episode.mp4' }; },
      },
      SubtitleMaterialVocalization: { enrich: async () => {
        if (++attempts === 1) throw new Error('LOCAL_ASR_UNAVAILABLE');
        return { rows, warnings: [] };
      } },
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  await context.buildSubtitleMaterial();
  assert.equal(material.working, false);
  assert.notEqual(material.applied, true);
  assert.deepEqual(calls, ['prepare:full', 'store:full', 'prepare:lite', 'store:lite']);
  await context.buildSubtitleMaterial();
  assert.equal(material.applied, true);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(attempts, 2);
  assert.deepEqual(calls, ['prepare:full', 'store:full', 'prepare:lite', 'store:lite', 'apply',
    'scroll-to-save', 'focus-save']);
  assert.deepEqual(rows, [{ he: 'שלום', ru: 'Привет' }]);
});

test('active subtitle assembly hides generic draft actions without hiding other imports', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/studio-import.js'), 'utf8');
  const start = source.indexOf('  function showPreview(p)');
  const end = source.indexOf('  function refreshOcrDraftUi()', start);
  assert.ok(start > 0 && end > start);
  const elements = new Map();
  const context = {
    pendingSubtitleMaterial: { working: true },
    $: id => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
    tr: key => key,
    document: { getElementById: () => null },
    setStatus() {}, window: {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.showPreview({ kind: 'captions', method: 'container-subtitle-track', source: 'episode.mp4', text: 'שלום' });
  assert.equal(elements.get('v3ImportPreviewWrap').hidden, true);
  assert.equal(elements.get('v3ImportPreview').value, 'שלום');
  context.showPreview({ kind: 'captions', method: 'srt-file', source: 'captions.srt', text: 'שלום' });
  assert.equal(elements.get('v3ImportPreviewWrap').hidden, false);
});
