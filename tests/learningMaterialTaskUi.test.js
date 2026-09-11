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

test('a running stage never paints from a snapshot taken before the run started',()=>{
  // Наблюдение 2026-09-11: таймер перерисовывал этапы захваченным ДО старта объектом задачи,
  // и всё 4-минутное ожидание экран показывал «остановлено» при работающем прогоне.
  const stale = linkJob('imported', 'paused');
  const fresh = linkJob('transcribing', 'running');
  assert.equal(UI.stageModel(fresh).find((s) => s.key === 'transcribing').mark, 'current');
  assert.equal(UI.stageModel(stale).find((s) => s.key === 'transcribing').mark, 'stalled');
});

test('a running stage always shows how long it has been running, even before any provider signal',()=>{
  // Для одного ASR-вызова провайдер шлёт ровно одно событие. Пока оно не пришло, секундомер —
  // единственная честная динамика, и молчать всё это время нельзя.
  const d = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 47 });
  assert.match(d.text, /0:47/);
  assert.equal(d.percent, null);
});

test('a silent retry is not silent: the wait says why and which attempt it is',()=>{
  const d = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 60, retry: { code: 'YT_OVERLOADED', attempt: 2, attempts: 3, waitSec: 12 } });
  assert.equal(d.percent, null);
  assert.equal(d.text.includes('2') && d.text.includes('3') && d.text.includes('12'), true, d.text);
});

test('every stage mark carries a word, not only a glyph',()=>{
  const model = UI.stageModel(linkJob('translating'));
  const words = model.map((s) => s.markLabel);
  assert.equal(words.every((w) => typeof w === 'string' && w.length > 0), true, JSON.stringify(words));
  assert.notEqual(words[0], words[1], 'done and running must not read the same');
});

test('the wait between attempts never tells the person to do what the app is already doing',()=>{
  // Наблюдение 2026-09-11: строка повтора брала ТЕРМИНАЛЬНУЮ фразу ошибки и предлагала нажать
  // «Продолжить» в тот момент, когда прогон продолжался сам. Совет не для этой фазы.
  const d = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 60, retry: { code: 'YT_OVERLOADED', attempt: 2, attempts: 3, waitSec: 12 } });
  assert.doesNotMatch(d.text, /Продолжить|Continue/);
  assert.ok(d.text.length < 70, 'a live line must stay a line, not a paragraph: ' + d.text);
  assert.match(d.text, /12/);
});

test('the estimate says how long this will take, not only what it costs',()=>{
  const shown = UI.quoteLine({ durationSec: 701, estimatedUsd: 0.044, windows: 1,
    table: { lowUsd: 0.042, highUsd: 0.084, lowRows: 75, highRows: 149, chunks: 2 }, minutes: 9 });
  assert.match(shown, /11:41/);
  assert.match(shown, /9/, 'the person waiting minutes deserves to know how many: ' + shown);
});

test('the chunk counter shows the chunk being worked on, not one ahead of it',()=>{
  // Наблюдение 2026-09-11: телеметрия уже 1-based, а строка прибавляла ещё единицу — первый
  // кусок объявлялся вторым, то есть работа выглядела почти законченной, едва начавшись.
  const d = UI.liveDetail(linkJob('translating'), { table: { chunk: 1, chunks: 2, readyRows: 0, totalRows: 193 } });
  assert.match(d.text, /1.*2/, d.text);
  assert.doesNotMatch(d.text, /2 из 2|2 of 2/, d.text);
  const last = UI.liveDetail(linkJob('translating'), { table: { chunk: 2, chunks: 2, readyRows: 120, totalRows: 193 } });
  assert.match(last.text, /2/, last.text);
});

test('a table that came back empty is explained, not left to the generic sentence',()=>{
  const fs2 = require('node:fs');
  const src = fs2.readFileSync(require.resolve('../public/js/learning-material-task-ui.js'), 'utf8');
  assert.equal((src.match(/[,{]TASK_TABLE_INCOMPLETE:/g) || []).length, 3,
    'the table failure the owner actually hit must be phrased in ru, en and he');
});

test('when a run outlasts its estimate the screen admits it instead of pretending',()=>{
  // Наблюдение 2026-09-11: смета обещала «обычно 5 мин», а прогон под нагрузкой провайдера шёл
  // вдвое дольше. Молчать в этот момент — значит подтверждать обещание, которое уже нарушено.
  const inTime = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 120, expectedSec: 300 });
  assert.doesNotMatch(inTime.text, /дольше|longer/i, inTime.text);
  const late = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 520, expectedSec: 300 });
  assert.match(late.text, /дольше/i, late.text);
  assert.match(late.text, /8:40/, 'the clock keeps running while it says so: ' + late.text);
});
