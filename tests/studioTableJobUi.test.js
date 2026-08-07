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
