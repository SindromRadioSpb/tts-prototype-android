const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('retry after local vocalization failure preserves prepared and stored video renditions', async () => {
  // Execute the actual browser orchestration with its I/O seams replaced; never copy its algorithm.
  const source = fs.readFileSync(path.join(__dirname, '../public/js/studio-import.js'), 'utf8');
  const start = source.indexOf('  async function buildSubtitleMaterial()');
  const end = source.indexOf('  function renderAudioMeta()', start);
  assert.ok(start > 0 && end > start);
  const calls = [], rows = [{ he: 'שלום', ru: 'Привет' }];
  const material = { plan: { status: 'ready', plan_sha256: 'a'.repeat(64),
    lite_plan_sha256: 'b'.repeat(64), lite: { available: true } } };
  let attempts = 0;
  const context = {
    pendingSubtitleMaterial: material,
    pendingAudio: { mediaJobId: 'job', mediaReadiness: { plan: { mode: 'audio_transcode' } } },
    localAsrClient: { getMediaJob:async()=>({}) }, mediaJobStatus() {}, setBusy() {}, setSubtitlePlanStatus() {},
    renderSubtitlePlan() {}, renderMediaReadiness() {}, $: () => ({ checked: true }),
    buildSubtitleTable: async () => { material.tableRows = rows; return rows; },
    applySubtitleMaterial: async () => { calls.push('apply'); return true; },
    window: {
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
  assert.equal(attempts, 2);
  assert.deepEqual(calls, ['prepare:full', 'store:full', 'prepare:lite', 'store:lite', 'apply']);
  assert.deepEqual(rows, [{ he: 'שלום', ru: 'Привет' }]);
});
