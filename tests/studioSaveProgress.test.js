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

test('save modal localizes its accessible dialog name in RU/EN/HE', () => {
  assert.match(
    html,
    /id="v3SaveMetaModal"[^>]+data-i18n-aria-label="saveMeta\.title"/,
    'the dialog accessibility name must follow the selected locale',
  );
});

test('successful save ends in a persistent receipt instead of the update form', () => {
  assert.match(
    html,
    /id="v3SaveMetaReceipt"[^>]+role="status"[^>]+aria-live="polite"/,
    'success must have a persistent, screen-reader-visible receipt',
  );
  assert.match(html, /function v3SaveMetaShowReceipt\(receipt\)/);
  assert.match(html, /async function v3SaveMetaBuildReceipt\(text\)/);

  const saveStart = html.indexOf('async function v3SaveMetaSave()');
  const saveEnd = html.indexOf('\nasync function v3SaveMetaSaveAsNew()', saveStart);
  const save = html.slice(saveStart, saveEnd);
  assert.match(save, /v3SaveMetaBuildReceipt\(text\)/);
  assert.match(save, /v3SaveMetaShowReceipt\(receipt\)/);
  assert.doesNotMatch(
    save,
    /v3SaveMetaClose\(\);/,
    'the success path must not be swallowed by the busy close guard',
  );

  for (const locale of ['ru', 'en', 'he']) {
    const source = fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', `${locale}.js`), 'utf8');
    for (const key of [
      'completeTitle', 'completeSummary', 'rowsLabel', 'providerLabel', 'mediaLabel',
      'cacheLabel', 'savedAtLabel', 'done', 'openLibrary', 'openTransfer',
    ]) {
      assert.match(source, new RegExp(`${key}:`), `${locale}: ${key} receipt copy`);
    }
  }
});

test('an unchanged saved card cannot be saved twice', () => {
  const syncStart = html.indexOf('function v3UiSyncSaveButtons()');
  const syncEnd = html.indexOf('\nfunction ', syncStart + 20);
  const sync = html.slice(syncStart, syncEnd);
  assert.match(sync, /unchangedSaved/);
  assert.match(sync, /saveMeta\.savedButton/);
  assert.match(sync, /disabled\s*=\s*[^;]*unchangedSaved/);

  for (const locale of ['ru', 'en', 'he']) {
    const source = fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', `${locale}.js`), 'utf8');
    assert.match(source, /savedButton:/, `${locale}: persistent saved button label`);
    assert.match(source, /savedButtonTitle:/, `${locale}: saved button next action`);
  }
});

test('a provider-specific table restored from local cache becomes a saveable draft', () => {
  const translateStart = html.indexOf('async function translateTable()');
  const cacheStart = html.indexOf('// 1) local table cache first', translateStart);
  const cacheEnd = html.indexOf('// Mark draft:', cacheStart);
  const cacheBranch = html.slice(cacheStart, cacheEnd);
  assert.match(cacheBranch, /cache\.provider === requestedProvider/);
  assert.match(
    cacheBranch,
    /v3SessionMarkDraft\(\)/,
    'restoring a different provider result must not leave the previous saved card terminal',
  );
});

test('media-bound drafts offer a new version, never an update that will be refused', () => {
  assert.match(html, /let v3SaveMetaBoundUpdate = false;/);
  assert.match(html, /async function v3SaveMetaResolveMode\(updateId\)/);
  assert.match(html, /v3SaveMetaBoundUpdate\s*=\s*!!binding/);
  assert.match(html, /saveMeta\.saveBoundVersion/);

  const saveStart = html.indexOf('async function v3SaveMetaSave()');
  const saveEnd = html.indexOf('\nasync function v3SaveMetaSaveAsNew()', saveStart);
  const save = html.slice(saveStart, saveEnd);
  assert.match(save, /v3SaveMetaBoundUpdate/);
  assert.match(save, /allowDuplicateMedia:\s*true/);
});

test('optional table cache failure is named and does not impersonate card-save failure', () => {
  assert.match(html, /function v3StoreTableCache\(payload\)/);
  assert.match(html, /v3TableCacheWriteOutcome\s*=\s*\{\s*status:\s*"failed"/);
  assert.match(html, /saveMeta\.cacheUnavailableNext/);
  assert.equal(
    (html.match(/localStorage\.setItem\(TABLE_CACHE_KEY/g) || []).length,
    1,
    'all table-cache writes must flow through the named outcome helper',
  );
});

test('a saved-card receipt never tells the user to save the card again', () => {
  const start = html.indexOf('async function v3SaveMetaBuildReceipt(text)');
  const end = html.indexOf('\nfunction v3SaveMetaShowReceipt(receipt)', start);
  const receipt = html.slice(start, end);
  assert.match(receipt, /saveMeta\.cacheUnavailableAfterSaveNext/);
  assert.doesNotMatch(
    receipt,
    /nextActions\.push\(t\("saveMeta\.cacheUnavailableNext"\)\)/,
    'the pre-save recovery action contradicts a terminal successful receipt',
  );

  for (const locale of ['ru', 'en', 'he']) {
    const source = fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', `${locale}.js`), 'utf8');
    assert.match(source, /cacheUnavailableAfterSaveNext:/, `${locale}: post-save cache next action`);
  }
});

test('save-as-new failure stays in the modal and names the retry action', () => {
  const start = html.indexOf('async function v3SaveMetaSaveAsNew()');
  const end = html.indexOf('\n// expose globally', start);
  const saveAsNew = html.slice(start, end);
  assert.match(saveAsNew, /catch\s*\(e\)/, 'save-as-new must not leak an unhandled rejection');
  assert.match(saveAsNew, /v3SaveMetaShowFailure\("saveMeta\.failed",\s*"saveMeta\.failedNext"\)/);
});

test('save receipt is a 380px-safe terminal action surface', () => {
  assert.match(html, /#v3SaveMetaReceipt[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(html, /#v3SaveMetaCompleteActions[\s\S]*min-height:\s*(?:4[4-9]|[5-9]\d)px/);
  assert.match(html, /@media\s*\(max-width:\s*600px\)[\s\S]*#v3SaveMetaCompleteActions/);
});

test('the unrelated TTS credential action is not another generic Save button', () => {
  for (const locale of ['ru', 'en', 'he']) {
    const source = fs.readFileSync(path.join(root, 'public', 'i18n', 'locales', `${locale}.js`), 'utf8');
    const match = source.match(/gcpTtsKeySave:\s*"([^"]+)"/);
    assert.ok(match, `${locale}: gcpTtsKeySave exists`);
    assert.notEqual(match[1], { ru: 'Сохранить', en: 'Save', he: 'שמור' }[locale], `${locale}: action names the key`);
  }
});
