'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

test('Studio exposes one honest long-job HUD with all named states and media continuity', () => {
  assert.match(html, /id="v3TableJobHud"/);
  assert.match(html, /id="v3TableJobMedia"/);
  for (const state of ['cache', 'generate', 'retry', 'repair', 'split', 'done', 'stopped']) {
    assert.match(html, new RegExp(`tableJob\\.state\\.${state}`), `missing visible state ${state}`);
  }
  for (const key of ['chunk', 'attempt', 'rows', 'elapsed', 'nextAction']) {
    assert.match(html, new RegExp(`tableJob\\.${key}`), `missing HUD field ${key}`);
  }
});

test('reload restore is local-only and provider work starts only inside an explicit translation click', () => {
  const restoreStart = html.indexOf('function v3TableJobRestoreLocalOnly');
  assert.notEqual(restoreStart, -1);
  const restoreEnd = html.indexOf('\n    function ', restoreStart + 20);
  const body = html.slice(restoreStart, restoreEnd);
  assert.doesNotMatch(body, /apiCall\(|fetch\(|translateTable\(|v3RequestGeminiChunk\(/);
  assert.match(body, /TableJob\.resume/);
  assert.match(html, /TableJob\.acceptChunk/);
});

test('completion is coverage-gated, repairs only missing segments and retains a durable snapshot', () => {
  assert.match(html, /TableChunks\.coverageForRows/);
  assert.match(html, /TableChunks\.buildRepairChunks/);
  assert.match(html, /TableJob\.acceptRepair/);
  assert.match(html, /missingGlobal\.length[\s\S]*v3RequestGeminiChunk/);
  assert.match(html, /if \(missingGlobal\.length\)[\s\S]*TableJob\.storeDurable/);
  assert.match(html, /TableJob\.markState\(jobJournal, "done"[\s\S]*TableJob\.storeDurable/);
  const completion = html.slice(html.indexOf('// Initial chunks can all return successfully'), html.indexOf('// PROVIDER SELECTOR'));
  assert.doesNotMatch(completion, /TableJob\.clear/);
});

// Владелец, 2026-09-24: короткая сборка одним запросом пропадала без следа — ни сводки при
// успехе, ни причины при отказе. Каждый путь «одним запросом» обязан оставить итоговую карточку.
test('short single-request builds end in a done or stopped card instead of vanishing', () => {
  for (const fn of ['async function translateTableRun', 'async function v3TranslateTablePremiumChunked', 'async function v3TranslateTableLocalMt']) {
    const start = html.indexOf(fn);
    assert.notEqual(start, -1, fn);
    const body = html.slice(start, html.indexOf('\n    async function ', start + 20));
    assert.match(body, /v3TablePlainFinish\(\{ kind: "done" \}\)/, `${fn} never reports success`);
    assert.match(body, /v3TablePlainFinish\(v3TablePlainStopOutcome\(/, `${fn} never reports a stop`);
  }
  const start = html.indexOf('function v3TablePlainStopOutcome');
  const src = html.slice(start, html.indexOf('\n    function ', start + 20));
  const outcome = new Function('t', `${src}; return v3TablePlainStopOutcome;`)((key) => key);
  // Смысловой отказ повтором не лечится: сервер отдаст тот же сохранённый ответ.
  assert.deepEqual(outcome({ raw: { error_code: 'HE_SOURCE_COVERAGE_MISMATCH' } }),
    { kind: 'stopped', reason: 'tableJob.reasonSemantic', canRetry: false });
  assert.equal(outcome({ httpStatus: 429 }).canRetry, false);
  assert.deepEqual(outcome(new Error('network')),
    { kind: 'stopped', reason: 'tableJob.reasonInterrupted', canRetry: true });
});
