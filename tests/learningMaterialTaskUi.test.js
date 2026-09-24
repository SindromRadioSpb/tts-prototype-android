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

test('completed material names unavailable row replay and does not recommend the measured offset',()=>{
  const notes=UI.qualityNotes({state:'ready',transcript:{blind:true,
    timing:{verdict:'suspect',matched:17,medianErrorSec:299}}});
  assert.match(notes[0],/повторение строк недоступно/);
  assert.match(notes[0],/автоматически не запускается/);
  assert.match(notes[1],/17.*299/);
  assert.match(notes[1],/не рекомендуемое смещение/);
});
test('switching to Gemini retains the YouTube source after the import handoff is cleared', async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.style = {}; }
    append(...nodes) { this.children.push(...nodes); }
    insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
    setAttribute() {}
    addEventListener(name, fn) { this.events[name] = fn; }
    focus() {}
    showModal() {}
    close() { if (this.events.close) this.events.close(); }
    remove() {}
    querySelector() { return null; }
  }
  const body = new Element('body');
  const document = { body, documentElement: { lang: 'ru' }, createElement: tag => new Element(tag), addEventListener() {} };
  const window = {};
  let created, pending = true, provider = 'google-free';
  const quotes = [];
  const link = { video_id: 'MlX2x9QJIMk', url: 'https://www.youtube.com/watch?v=MlX2x9QJIMk' };
  vm.runInNewContext(source, { window, document, LearningMaterialTask: {
    createStore: () => ({ add: async () => { throw new Error('stop before provider calls'); } }),
    createRunner: () => ({}), create: async input => { created = input; return input; }
  } });
  const ui = window.LearningMaterialTaskUI;
  ui.configure({
    capture: () => ({ source_text: pending ? '' : 'old card text', youtube_source: pending ? link : null,
      title: pending ? 'New video' : 'Old card', import_meta: pending ? null : { old: true },
      provider, model: provider === 'gemini' ? 'current-model' : null, direction: 'he-ru' }),
    hasGeminiKey: () => true, selectGemini: async () => { provider = 'gemini'; },
    estimate: async input => { quotes.push(input); return { durationSec: 703, estimatedUsd: 0.04 }; }
  });
  await ui.start();
  pending = false; // prepareFromYoutubeLink's finally has now run.
  const first = body.children.at(-1);
  first.children.find(n => n.tag === 'label').children[0].value = 'Edited video title';
  const buttons = d => d.children.find(n => n.className === 'study-source-actions').children;
  await buttons(first).find(n => n.textContent === 'Использовать Gemini').onclick();
  await Promise.resolve();
  assert.equal(quotes.length, 2, 'the new dialog must still estimate the linked video');
  const second = body.children.at(-1);
  await buttons(second).find(n => n.textContent === 'Собрать учебный материал').onclick();
  assert.equal(created.youtube_source.video_id, 'MlX2x9QJIMk');
  assert.equal(created.source_text, '');
  assert.equal(created.import_meta, null);
  assert.equal(created.title, 'Edited video title');
  assert.equal(created.provider, 'gemini');
  assert.equal(created.model, 'current-model');
});
const linkJob = (phase, state) => ({
  input: { title: 'x', youtube_source: { video_id: 'eLYgTqNFn-s', url: 'u' } },
  phase, state: state || 'running', transcript: null, table: null, saved_text_id: null,
});
const marks = (model) => model.map((s) => s.key + ':' + s.mark).join(' ');

// Массивы приходят из другого realm (vm), поэтому сравниваем содержимое, а не прототип.
const keys = (model) => model.map((s) => s.key).join(',');

// Ведущий путь (2026-09-24): медиа-материал — ссылка или локальный файл — идёт по одной шкале из
// семи этапов от медиа до готового материала; у текста без медиа прежние четыре.
const MEDIA_KEYS = 'media,transcript,review,translating,saved,bound,ready';
const localJob = (phase, state, extra) => Object.assign({
  input: { title: 'x', import_meta: { media_package_ref: { package_id: 'mpkg:a' } } },
  phase, state: state || 'running', transcript: null, table: null, saved_text_id: null,
}, extra || {});

test('a media material shows seven stages; a plain text keeps its four',()=>{
  assert.equal(keys(UI.stageModel(linkJob('transcribing'))), MEDIA_KEYS);
  assert.equal(keys(UI.stageModel(localJob('imported'))), MEDIA_KEYS);
  assert.equal(keys(UI.stageModel({ input: { title: 'x' }, phase: 'imported', state: 'running' })),
    'imported,translating,saved,ready');
});

test('a local file starts at the table: media, transcript and review are already behind it',()=>{
  assert.equal(marks(UI.stageModel(localJob('translating'))),
    'media:done transcript:done review:done translating:current saved:pending bound:pending ready:pending');
});

test('a link material walks recognition, table, saving and binding in order',()=>{
  assert.equal(marks(UI.stageModel(linkJob('transcribing'))),
    'media:done transcript:current review:pending translating:pending saved:pending bound:pending ready:pending');
  assert.equal(marks(UI.stageModel(linkJob('translating'))),
    'media:done transcript:done review:done translating:current saved:pending bound:pending ready:pending');
  assert.equal(marks(UI.stageModel(linkJob('binding'))),
    'media:done transcript:done review:done translating:done saved:done bound:current ready:pending');
});

test('a completed run leaves every stage marked done, none still running',()=>{
  const model = UI.stageModel(linkJob('ready', 'ready'));
  assert.equal(model.every((s) => s.mark === 'done'), true, marks(model));
});

test('a paused run stops claiming its stage is still working',()=>{
  const model = UI.stageModel(linkJob('translating', 'paused'));
  assert.equal(model.find((s) => s.key === 'translating').mark, 'stalled');
  assert.equal(model.find((s) => s.key === 'transcript').mark, 'done');
  const unbound = UI.stageModel(localJob('binding', 'paused'));
  assert.equal(unbound.find((s) => s.key === 'bound').mark, 'stalled');
});

test('the finish line names rows, play buttons and where a local video lives',()=>{
  const job = localJob('ready', 'ready', { saved_text_id: 't', table: { rows: [{}, {}, {}] },
    playback_proof: { kind: 'local', bound_rows: 2, total_rows: 3, missing_rows: 1 } });
  const lines = UI.finishLines(job);
  assert.match(lines.join(' | '), /3/);
  assert.match(lines.join(' | '), /2/);
  assert.equal(lines.length, 3, 'summary, missing rows, local storage');
  assert.equal(UI.finishLines(localJob('translating')).length, 0, 'nothing to announce before the end');
});

test('on a narrow screen the scale collapses to one named step',()=>{
  assert.equal(UI.stageSummary(UI.stageModel(localJob('translating'))), 'Этап 4 из 7 · Учебная таблица');
});

test('recognition reports the window it is on, and nothing it cannot know',()=>{
  // Один вызов: провайдер не отдаёт долю выполненного, и выдумывать её нельзя.
  const single = UI.liveDetail(linkJob('transcribing'), { asr: { index: 0, total: 1, elapsedSec: 83 } });
  assert.equal(single.percent, null, 'a single call has no honest percentage');
  assert.match(single.text, /1:23/);
  const many = UI.liveDetail(linkJob('transcribing'), { asr: { index: 1, total: 3, elapsedSec: 5 } });
  assert.equal(many.text.includes('2') && many.text.includes('3'), true, many.text);
  // Законченные окна — настоящий знаменатель (в отличие от доли ВНУТРИ окна, которой нет).
  assert.equal(many.percent, 33, 'one of three windows is behind');
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
  assert.equal(UI.stageModel(fresh).find((s) => s.key === 'transcript').mark, 'current');
  assert.equal(UI.stageModel(stale).find((s) => s.key === 'transcript').mark, 'stalled');
});

test('the line under the stages never repeats the clock the stage already shows',()=>{
  // Часы теперь стоят у самого этапа, поэтому дублировать их строкой ниже — шум. Строка
  // оставлена тому, чего часы сказать не могут: окну, строкам, повтору, затянувшемуся прогону.
  const plain = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 47 });
  assert.equal(plain.text, '', 'a bare elapsed time is the stage clock’s job');
  const slow = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 520, expectedSec: 300 });
  assert.match(slow.text, /дольше/i, slow.text);
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
  const word = (mark) => model.find((s) => s.mark === mark).markLabel;
  assert.notEqual(word('done'), word('current'), 'done and running must not read the same');
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

test('a linked video recommends Gemini before continuing with Google Translate',()=>{
  const withKey = UI.geminiRecommendation('google-free', true, { video_id: 'x' });
  assert.equal(withKey.canContinue, true);
  assert.match(withKey.message, /Gemini/);
  assert.equal(UI.geminiRecommendation('gemini', true, { video_id: 'x' }), null);
  assert.equal(UI.geminiRecommendation('google-free', true, null), null);
  assert.equal(typeof UI.confirmGeminiRecommendation, 'function');
});

test('a linked video without a Gemini key cannot pretend Google Translate can recognise speech',()=>{
  const missing = UI.geminiRecommendation('google-free', false, { video_id: 'x' });
  assert.equal(missing.canContinue, false);
  assert.match(missing.message, /распознавания видео/i);
  assert.equal(UI.geminiRecommendation('gcp', false, { video_id: 'x' }).canContinue, false);
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
  assert.equal(inTime.text, '', 'on time there is nothing extra to say');
  const late = UI.liveDetail(linkJob('transcribing'), { elapsedSec: 520, expectedSec: 300 });
  assert.match(late.text, /дольше/i, late.text);
  assert.match(late.text, /8:40/, 'the clock keeps running while it says so: ' + late.text);
});

// ── E: у длинного ролика окна дают настоящий знаменатель ──
test('a long video measures recognition by the windows it has finished',()=>{
  const start = UI.liveDetail(linkJob('transcribing'), { asr: { index: 0, total: 4, elapsedSec: 5 } });
  assert.equal(start.percent, 0, 'nothing is finished yet at the first window');
  const mid = UI.liveDetail(linkJob('transcribing'), { asr: { index: 2, total: 4, elapsedSec: 300 } });
  assert.equal(mid.percent, 50, 'two of four windows behind');
  const single = UI.liveDetail(linkJob('transcribing'), { asr: { index: 0, total: 1, elapsedSec: 5 } });
  assert.equal(single.percent, null, 'one window is not a scale');
});

// ── B: время каждого этапа — и по ходу, и в итоге ──
test('each stage carries its own clock, running and finished alike',()=>{
  const job = linkJob('translating');
  job.stage_times = { transcribing: { startedAt: 1000, endedAt: 582000 }, translating: { startedAt: 582000 } };
  const model = UI.stageModel(job, { now: 700000 });
  const done = model.find((s) => s.key === 'transcript');
  const current = model.find((s) => s.key === 'translating');
  assert.equal(done.elapsedSec, 581, 'a finished stage reports what it actually took');
  assert.equal(current.elapsedSec, 118, 'a running stage counts from its own start, not the run start');
  assert.equal(model.find((s) => s.key === 'saved').elapsedSec, null, 'a stage that has not started has no clock');
});

test('stage clocks are shown next to their stage, in mm:ss',()=>{
  const job = linkJob('ready', 'ready');
  job.stage_times = { transcribing: { startedAt: 0, endedAt: 581000 }, translating: { startedAt: 581000, endedAt: 711000 } };
  const model = UI.stageModel(job, { now: 711000 });
  assert.equal(model.find((s) => s.key === 'transcript').elapsedText, '9:41');
  assert.equal(model.find((s) => s.key === 'translating').elapsedText, '2:10');
});

test('a material that shipped rows without niqqud says so on the result screen',()=>{
  // Вариант A владельца: пробел допустим, молчание — нет. Цена качества обязана быть на экране
  // там же, где объявлен успех, а не обнаруживаться потом в таблице.
  const job = linkJob('ready','ready');
  job.table = { rows: [
    { he: 'שלום', he_niqqud: 'שָׁלוֹם' },
    { he: '30 ס"מ', he_niqqud: '', niqqud_status: 'not_vocalized' },
    { he: 'מעשר', he_niqqud: '', niqqud_status: 'not_vocalized' },
  ] };
  const notes = UI.qualityNotes(job);
  assert.equal(notes.length, 1, JSON.stringify(notes));
  assert.match(notes[0], /2/, 'the count of affected rows must be named: ' + notes[0]);
  assert.equal(UI.qualityNotes(linkJob('ready','ready')).length, 0, 'a clean material claims nothing');
});

// ── Длинная сборка: не терять оплаченное и не молчать о том, что мешает ──
test('a retry caused by a frozen background tab asks for the tab, not for patience', () => {
  // Замер 2026-09-11: Chrome заморозил фоновую вкладку и убил висящий запрос куска. Обратный
  // отсчёт здесь бесполезен — пока вкладка в фоне, ждать нечего, нужно вернуться в неё.
  const d = UI.liveDetail(linkJob('translating'), { retry: { code: 'TAB_BACKGROUNDED', attempt: 1, attempts: 4, waitSec: 0, needsForeground: true } });
  assert.match(d.text, /вкладк/i, d.text);
  assert.doesNotMatch(d.text, /повтор через 0/i, d.text);
});

test('a table chunk waiting out an overloaded provider says the cause, attempt and countdown', () => {
  const d = UI.liveDetail(linkJob('translating'), { retry: { code: 'PROVIDER_OVERLOADED', attempt: 2, attempts: 4, waitSec: 12 } });
  assert.equal(d.text.includes('2') && d.text.includes('4') && d.text.includes('12'), true, d.text);
  assert.ok(d.text.length < 70, d.text);
});

test('a resumed run says which chunk it continued from, so nothing looks re-paid', () => {
  assert.match(UI.resumeNote({ resume: { from: 3, of: 6 } }), /3.*6/);
  assert.equal(UI.resumeNote({}), '');
});

test('a journal that could not be reused names what changed instead of silently re-paying', () => {
  // Прогон владельца 2026-09-11: возобновление молча прошло куски заново (спасло только серверное
  // кеширование). Отказ журнала обязан быть НАЗВАН.
  const note = UI.resumeNote({ resume: { reason: 'SIGNATURE_MISMATCH', changed: ['text'] } });
  assert.ok(note.length > 0);
  assert.match(note, /текст/i, note);
  const unknown = UI.resumeNote({ resume: { reason: 'SIGNATURE_MISMATCH', changed: null } });
  assert.ok(unknown.length > 0, 'an old journal still has to admit it was not reused');
  assert.doesNotMatch(unknown, /undefined|null/);
});

test('a long build warns that the tab has to stay in front, a short one does not', () => {
  assert.match(UI.foregroundNote({ table: { chunks: 6 } }), /вкладк/i);
  assert.equal(UI.foregroundNote({ table: { chunks: 1 } }), '');
  assert.equal(UI.foregroundNote({}), '');
});

test('every new line of this screen exists in all three locales', () => {
  const fs2 = require('node:fs');
  const src = fs2.readFileSync(require.resolve('../public/js/learning-material-task-ui.js'), 'utf8');
  for (const key of ['detailForeground', 'foregroundNote', 'resumeFrom', 'resumeRefused', 'causeTAB_BACKGROUNDED', 'causePROVIDER_OVERLOADED', 'causeNETWORK', 'geminiRecommended', 'geminiRequiredForLink', 'useGemini', 'openTranslationSettings', 'continueGoogle']) {
    assert.equal((src.match(new RegExp('[,{]' + key + ':', 'g')) || []).length, 3, key + ' must be phrased in ru, en and he');
  }
});

// ── A: готовность видна, даже когда на вкладку не смотрят ──
test('a finished run announces itself in the tab title, a running one never does', () => {
  assert.equal(UI.titleNotice(linkJob('transcribing', 'running')), null, 'a run in progress is not news');
  assert.match(UI.titleNotice(linkJob('ready', 'ready')) || '', /готов/i);
  assert.match(UI.titleNotice(linkJob('translating', 'paused')) || '', /останов/i);
  const failed = linkJob('translating', 'paused');
  failed.error = 'TASK_TABLE_INCOMPLETE';
  assert.match(UI.titleNotice(failed) || '', /останов/i);
});

test('the title is touched only while the tab is out of sight, and put back on return', () => {
  // Заголовок — чужая собственность: пока человек смотрит на вкладку, подменять его незачем,
  // а вернувшись, он должен увидеть свой прежний заголовок, а не наш след.
  const listeners = {};
  const doc = { title: 'Студия', hidden: true, visibilityState: 'hidden',
    addEventListener: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); },
    removeEventListener: (n, fn) => { listeners[n] = (listeners[n] || []).filter((x) => x !== fn); } };
  UI.applyTitleNotice(doc, linkJob('ready', 'ready'));
  assert.match(doc.title, /готов/i);
  assert.match(doc.title, /Студия/, 'the original title survives inside the notice: ' + doc.title);
  doc.hidden = false; doc.visibilityState = 'visible';
  (listeners.visibilitychange || []).slice().forEach((fn) => fn());
  assert.equal(doc.title, 'Студия');

  const seen = { title: 'Студия', hidden: false, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  UI.applyTitleNotice(seen, linkJob('ready', 'ready'));
  assert.equal(seen.title, 'Студия', 'nothing to announce to someone already looking');
});

// ── D: при возобновлении видно, что распознавание уже оплачено ──
test('a resumable job says the recognition is already paid for and will not be repeated', () => {
  const withTranscript = linkJob('translating', 'paused');
  withTranscript.transcript = { text: 'שלום', segments: [{ start: 0, text: 'שלום' }] };
  const notes = UI.paidNotes(withTranscript);
  assert.equal(notes.length, 1, JSON.stringify(notes));
  assert.match(notes[0], /распознаван/i);
  assert.match(notes[0], /не|уже/i);
});

test('nothing claims a payment that has not happened, and a finished run does not nag', () => {
  // Массив приходит из другого realm (vm) — сравниваем содержимое, а не прототип.
  assert.equal(UI.paidNotes(linkJob('transcribing', 'paused')).length, 0, 'no transcript yet, no claim');
  const done = linkJob('ready', 'ready');
  done.transcript = { text: 'שלום', segments: [] };
  assert.equal(UI.paidNotes(done).length, 0, 'a finished material has nothing left to resume');
});

test('the new lines of A and D exist in all three locales', () => {
  const fs2 = require('node:fs');
  const src = fs2.readFileSync(require.resolve('../public/js/learning-material-task-ui.js'), 'utf8');
  for (const key of ['titleReady', 'titleStopped', 'paidTranscript']) {
    assert.equal((src.match(new RegExp('[,{]' + key + ':', 'g')) || []).length, 3, key + ' must be phrased in ru, en and he');
  }
});

// Ведущий путь ③ (2026-09-24): проверка транскрипта — шаг ВНУТРИ процесса. Редактор возвращает в
// задачу с исправленной ревизией, а не бросает человека в Студии.
test('a media material offers a transcript review that returns to the task with a fresh capture', async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.style = {}; }
    append(...nodes) { this.children.push(...nodes); }
    insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
    setAttribute() {}
    addEventListener(name, fn) { this.events[name] = fn; }
    focus() {} showModal() {} remove() {}
    close() { if (this.events.close) this.events.close(); }
    querySelector() { return null; }
  }
  const body = new Element('body');
  const document = { body, documentElement: { lang: 'ru' }, createElement: tag => new Element(tag), addEventListener() {} };
  const window = {};
  vm.runInNewContext(source, { window, document, LearningMaterialTask: { createStore: () => ({}), createRunner: () => ({}) } });
  const ui = window.LearningMaterialTaskUI;
  let captures = 0, reviewed = 0, revision = 'rev:1';
  ui.configure({
    capture: () => { captures++; return { source_text: 'שלום', title: 'Local', provider: 'gemini', direction: 'he-ru',
      import_meta: { media_package_ref: { package_id: 'mpkg:a', track_id: 'trk:c', revision_id: revision } } }; },
    reviewTranscript: async () => { reviewed++; revision = 'rev:2'; return { continued: true }; },
  });
  await ui.start();
  const first = body.children.at(-1);
  const actions = d => d.children.find(n => n.className === 'study-source-actions').children;
  const review = actions(first).find(n => n.textContent === 'Проверить и исправить транскрипт');
  assert.ok(review, 'the review step is offered for a media material');
  assert.ok(actions(first).find(n => n.textContent === 'Собрать учебный материал'), 'building stays the main action');
  await review.onclick();
  assert.equal(reviewed, 1);
  assert.equal(captures, 2, 'the task re-reads the corrected transcript');
  assert.notEqual(body.children.at(-1), first, 'the task dialog comes back');
});

test('a plain text material has no transcript review step', async () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.style = {}; }
    append(...nodes) { this.children.push(...nodes); }
    insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
    setAttribute() {} addEventListener(name, fn) { this.events[name] = fn; }
    focus() {} showModal() {} remove() {} close() { if (this.events.close) this.events.close(); }
    querySelector() { return null; }
  }
  const body = new Element('body');
  const document = { body, documentElement: { lang: 'ru' }, createElement: tag => new Element(tag), addEventListener() {} };
  const window = {};
  vm.runInNewContext(source, { window, document, LearningMaterialTask: { createStore: () => ({}), createRunner: () => ({}) } });
  const ui = window.LearningMaterialTaskUI;
  ui.configure({ capture: () => ({ source_text: 'שלום', title: 'Text', provider: 'gemini', direction: 'he-ru', import_meta: null }),
    reviewTranscript: async () => ({ continued: true }) });
  await ui.start();
  const actions = body.children.at(-1).children.find(n => n.className === 'study-source-actions').children;
  assert.equal(actions.some(n => n.textContent === 'Проверить и исправить транскрипт'), false);
});

// Ведущий путь 2.2 (2026-09-24): после перезагрузки Студия сама напоминает о незаконченном материале.
test('the resume banner picks the freshest unfinished task from the last two weeks', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const at = (days) => new Date(now - days * 864e5).toISOString();
  const jobs = [
    { id: 'old', state: 'paused', updated_at: at(20) },
    { id: 'done', state: 'ready', updated_at: at(0) },
    { id: 'a', state: 'paused', updated_at: at(3) },
    { id: 'b', state: 'running', updated_at: at(1) },
    { id: 'c', state: 'cancelled', updated_at: at(0.5) },
  ];
  assert.equal(UI.pickResumable(jobs, now).id, 'b');
  assert.equal(UI.pickResumable(jobs.filter((j) => j.id !== 'b'), now).id, 'a');
  assert.equal(UI.pickResumable([jobs[0], jobs[1]], now), null, 'finished or stale tasks do not nag');
});

test('a finish with no play buttons says so instead of claiming a linked video',()=>{
  const job = localJob('ready', 'ready', { saved_text_id: 't', playback_proof: { kind: 'youtube', bound_rows: 0, total_rows: 5, missing_rows: 5 } });
  const text = UI.finishLines(job).join(' | ');
  assert.doesNotMatch(text, /привязано/);
  assert.match(text, /5/);
});

// Прогон владельца 2026-09-24: у НОВОГО материала висело «журнал прошлого прогона не подошёл
// (изменился текст)» — это был журнал другого материала. Другой текст = чужой журнал, не отказ.
test('a journal of another material is not announced as a refused resume', () => {
  assert.equal(UI.resumeNote({ firstRun: true, resume: { from: 0, reason: 'FINGERPRINT_MISMATCH', changed: ['text', 'segments'] } }), '');
  assert.match(UI.resumeNote({ firstRun: true, resume: { from: 0, reason: 'FINGERPRINT_MISMATCH', changed: ['model'] } }), /модель/);
  assert.match(UI.resumeNote({ resume: { reason: 'FINGERPRINT_MISMATCH', changed: ['text'] } }), /текст/, 'a resumed task still names it');
});
