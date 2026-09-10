'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/js/learning-material-task-ui.js'), 'utf8');
function load() {
  const window = {};
  const context = { window, document: { documentElement: { lang: 'ru' }, addEventListener() {} } };
  context.window = window;
  vm.runInNewContext(source, context);
  return window.LearningMaterialTaskUI;
}
const UI = load();
const linkJob = (phase, state) => ({
  input: { title: 'x', youtube_source: { video_id: 'eLYgTqNFn-s', url: 'u' } },
  phase, state: state || 'running', transcript: null, table: null, saved_text_id: null,
});
const marks = (model) => model.map((s) => s.key + ':' + s.mark).join(' ');

// Массивы приходят из другого realm (vm), поэтому сравниваем содержимое, а не прототип.
const keys = (model) => model.map((s) => s.key).join(',');

test('a link material shows its own four stages, not the text ones',()=>{
  assert.equal(keys(UI.stageModel(linkJob('transcribing'))), 'transcribing,translating,saved,bound');
  assert.equal(keys(UI.stageModel({ input: { title: 'x' }, phase: 'imported', state: 'running' })),
    'imported,translating,saved,ready');
});

test('a finished stage is marked done, the running one current, the rest pending',()=>{
  assert.equal(marks(UI.stageModel(linkJob('transcribing'))),
    'transcribing:current translating:pending saved:pending bound:pending');
  assert.equal(marks(UI.stageModel(linkJob('translating'))),
    'transcribing:done translating:current saved:pending bound:pending');
  assert.equal(marks(UI.stageModel(linkJob('binding'))),
    'transcribing:done translating:done saved:done bound:current');
});

test('a completed run leaves every stage marked done, none still running',()=>{
  const model = UI.stageModel(linkJob('ready', 'ready'));
  assert.equal(model.every((s) => s.mark === 'done'), true, marks(model));
});

test('a paused run stops claiming its stage is still working',()=>{
  const model = UI.stageModel(linkJob('translating', 'paused'));
  assert.equal(model.find((s) => s.key === 'translating').mark, 'stalled');
  assert.equal(model.find((s) => s.key === 'transcribing').mark, 'done');
});

test('recognition reports the window it is on, and nothing it cannot know',()=>{
  // Один вызов: провайдер не отдаёт долю выполненного, и выдумывать её нельзя.
  const single = UI.liveDetail(linkJob('transcribing'), { asr: { index: 0, total: 1, elapsedSec: 83 } });
  assert.equal(single.percent, null, 'a single call has no honest percentage');
  assert.match(single.text, /1:23/);
  const many = UI.liveDetail(linkJob('transcribing'), { asr: { index: 1, total: 3, elapsedSec: 5 } });
  assert.equal(many.text.includes('2') && many.text.includes('3'), true, many.text);
  assert.equal(many.percent, null, 'window count is not completion');
});

test('the table reports the coverage it has actually proven',()=>{
  const live = { table: { chunk: 1, chunks: 3, readyRows: 120, totalRows: 300, elapsedSec: 40 } };
  const d = UI.liveDetail(linkJob('translating'), live);
  assert.equal(d.percent, 40, 'proven rows over total rows');
  assert.equal(d.text.includes('120') && d.text.includes('300'), true, d.text);
});

test('a stage with no denominator never invents one',()=>{
  for (const phase of ['saving', 'binding', 'exporting']) {
    const d = UI.liveDetail(linkJob(phase), {});
    assert.equal(d.percent, null, phase);
  }
});
