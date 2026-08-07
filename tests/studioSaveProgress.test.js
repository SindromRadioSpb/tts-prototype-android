// tests/studioSaveProgress.test.js — P0 contract for atomic large-card saves.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const db = fs.readFileSync(path.join(root, 'public', 'db', 'local-db.js'), 'utf8');

test('large-card save uses one guarded batch writer instead of per-row addSentence', () => {
  assert.match(db, /export async function addSentences\(textId, rows, opts\)/);
  assert.match(html, /await ldb\.addSentences\(newTextId, sentenceRows, \{/);
  const saveStart = html.indexOf('async function v3LibrarySaveCurrentCore(meta)');
  const saveEnd = html.indexOf('\nasync function ', saveStart + 20);
  const body = html.slice(saveStart, saveEnd);
  assert.doesNotMatch(body, /for \([^\n]+currentTableData\.entries\(\)[\s\S]+await ldb\.addSentence\(/,
    'save must not perform max-index/derived-clear/text-touch once per row');

  const batchStart = db.indexOf('export async function addSentences(textId, rows, opts)');
  const batchEnd = db.indexOf('\n// PAS-B0.5', batchStart + 20);
  const batch = db.slice(batchStart, batchEnd);
  const count = (pattern) => (batch.match(pattern) || []).length;
  assert.equal(count(/_assertLegacySentenceWriter\(/g), 1, 'material guard once per batch');
  assert.equal(count(/MAX\(order_index\)/g), 1, 'order lookup once per batch');
  assert.equal(count(/clearDerivedNiqqud\(/g), 1, 'derived clear once per batch');
  assert.equal(count(/_touchTextUpdatedAt\(/g), 1, 'text touch once per batch');
  assert.doesNotMatch(batch, /\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/,
    'batch writer must not steal transaction ownership from the atomic save');
});

test('save modal exposes monotonic row progress and named commit/binding phases', () => {
  assert.match(html, /saveMeta\.progressRows/);
  assert.match(html, /saveMeta\.progressCommit/);
  assert.match(html, /saveMeta\.progressMedia/);
  assert.match(html, /onProgress:\s*\(written, total\)/);
  for (const locale of ['ru', 'en', 'he']) {
    const source = fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', `${locale}.js`), 'utf8');
    assert.match(source, /progressRows:/, `${locale}: rows progress copy`);
    assert.match(source, /progressCommit:/, `${locale}: commit phase copy`);
    assert.match(source, /progressMedia:/, `${locale}: media phase copy`);
  }
});
