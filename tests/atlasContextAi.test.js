'use strict';
// Atlas P4 W2 fallback (owner decision E5): «В контексте (ИИ)» for the atlas — the existing word-gloss-ai-layer-v1,
// one row per atlas block. The rows the export writes and the rows the reader binds are the same rows
// (AtlasWords.glossRows), so a key the agent echoes back is the key the reader computes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');

const { window, document } = parseHTML('<!doctype html><html><body><div id="m"></div></body></html>');
global.window = window; global.document = document;
window.indexedDB = undefined;   // memory only: the layer is still readable on this page
window.ReaderMorph = require('../public/js/reader-morph.js');
require('../public/js/word-gloss-ai.js');
const AI = window.WordGlossAI, RM = window.ReaderMorph;
const W = require('../public/js/atlas-words.js');

const section = { id: 's02-rivets', content_pack_sha256: 'c'.repeat(64), terms: {}, pages: [{ page: 16, items: [
  { id: 'a97002:p16:b001', he: 'קוטר מסמרה דרוש', he_niqqud: 'קֹטֶר מַסְמֵרָה דָּרוּשׁ', ru: 'Требуемый диаметр заклёпки' },
  { id: 'a97002:p16:b002', kind: 'figure_caption' },
  { id: 'a97002:p16:b003', he: 'חיבור חפיפה', he_niqqud: 'חִבּוּר חֲפִיפָה', ru: 'Соединение внахлёст' },
] }] };

test('gloss rows: one per Hebrew block, in reading order, with the block id as identity', () => {
  const rows = W.glossRows(W.sectionContext('a97002', section, RM));
  assert.deepEqual(rows.map((r) => [r.id, r.order_index]), [['a97002:p16:b001', 0], ['a97002:p16:b003', 1]]);
  assert.equal(rows[0].ru, 'Требуемый диаметр заклёпки');
});

test('a layer keyed by the export is accepted, a stale or wrong-length row is rejected, and the card finds the word', async () => {
  const ctx = W.sectionContext('a97002', section, RM), rows = W.glossRows(ctx);
  const k0 = AI.rowPayloadFromData(rows[0]).key, k1 = AI.rowPayloadFromData(rows[1]).key;
  const res = await AI.remember({ schema: AI.LAYER_SCHEMA, rows: [
    { order_index: 0, key: k0, model: 'agent', glosses: [{ gloss: 'диаметр' }, { gloss: 'заклёпки' }, { gloss: 'требуемый' }], mwe: [] },
    { order_index: 1, key: k1, model: 'agent', glosses: [{ gloss: 'соединение' }], mwe: [] },          // 1 gloss for 2 words
  ] }, rows);
  assert.deepEqual(res, { stored: 1, rejected: 1 });
  // the reader's row: divs, not a table row
  const row = document.createElement('div');
  row.className = 'atlas-row'; row.setAttribute('data-ref', rows[0].id);
  row.innerHTML = '<div class="atlas-he" data-col="he">' + RM.wrapCellHtml(rows[0].he, null, {}) + '</div>' +
    '<div class="atlas-he atlas-niqqud" data-col="niqqud">' + RM.wrapCellHtml(rows[0].he_niqqud, null, {}) + '</div>';
  W.bindGlossRow(row, ctx);
  assert.equal(row.getAttribute('data-wg-row'), '1');
  assert.equal(AI.wordAt(row, 1).gloss, 'заклёпки');
  // a corrected translation is another row: the old gloss does not attach to it
  const edited = W.sectionContext('a97002', JSON.parse(JSON.stringify(section).replace('Требуемый диаметр', 'Нужный диаметр')), RM);
  W.bindGlossRow(row, edited);
  assert.equal(AI.wordAt(row, 1), null);
});
