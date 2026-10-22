'use strict';
// Modern release F2: the public body keeps the owner's AI word layer and proves it with the live client code.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../scripts/premium/build-modern-release.js');

const W = B.loadClient();
const row = (i, he, ru, extra = {}) => ({ row_id: 'r' + i, order_index: i, hebrew_plain: he, hebrew_niqqud: he, russian: ru, translit: 'x', translit_ru: 'x', ...extra });
function layerFor(rows) {
  return { schema: 'word-gloss-ai-layer-v1', rows: rows.map((r) => { const p = W.rowPayloadFromData(r); return { order_index: r.order_index, key: p.key, model: 'OpenAI assistant', glosses: p.words.map((w) => ({ gloss: 'g:' + w.w })), mwe: [] }; }) };
}
const PART = { part_uid: 'p', archive: 'a.zip' };

test('cleanEntities turns HTML entities into text and tidies spaces', () => {
  assert.equal(B.cleanEntities('Plinius, hist. nat., III, 39 &nbsp;↩︎'), 'Plinius, hist. nat., III, 39 ↩︎');
  assert.equal(B.cleanEntities('a &amp; b'), 'a & b');
  assert.equal(B.cleanEntities('без сущностей'), 'без сущностей');
});

test('the AI layer travels with its text and every row passes the client re-proof', () => {
  const rows = [row(0, 'שָׁלוֹם עוֹלָם', 'привет мир'), row(1, 'זֶה סֵפֶר', 'это книга')];
  const built = B.buildPart(W, { text_id: 't', rows, word_gloss_ai_layer: layerFor(rows) }, PART, [], []);
  assert.equal(built.layer.rows.length, 2);
  assert.equal(built.report.client_stored, 2);
  assert.equal(built.report.client_rejected, 0);
  assert.deepEqual(built.report.layer_dropped, []);
});

test('a moved byline leaves the rows, goes to About, and the layer follows the renumbering', () => {
  const rows = [row(0, 'מאת ישעיהו פרס', 'Исайя Перс'), row(1, 'זֶה סֵפֶר', 'это книга')];
  const about = [];
  const built = B.buildPart(W, { text_id: 't', rows, word_gloss_ai_layer: layerFor(rows) }, PART, [{ order_index: 0, about_kind: 'byline' }], about);
  assert.deepEqual(built.rows.map((r) => r.order_index), [0]);
  assert.equal(built.rows[0].hebrew_plain, 'זֶה סֵפֶר');
  assert.deepEqual(about, [{ kind: 'byline', text: 'מאת ישעיהו פרס' }]);
  assert.deepEqual(built.layer.rows.map((r) => r.order_index), [0]);
  assert.equal(built.report.client_stored, 1);
});

test('cleaning an entity in the translation re-keys the layer row instead of losing it', () => {
  const rows = [row(0, 'זֶה סֵפֶר', 'это&nbsp;книга')];
  const built = B.buildPart(W, { text_id: 't', rows, word_gloss_ai_layer: layerFor(rows) }, PART, [], []);
  assert.equal(built.rows[0].russian, 'это книга');
  assert.equal(built.report.rekeyed_layer_rows, 1);
  assert.equal(built.report.client_stored, 1);
  assert.equal(built.report.client_rejected, 0);
});

test('a heavy part is cut at row boundaries; every fragment keeps and re-proves its layer', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i, 'זֶה סֵפֶר טוֹב מְאוֹד ' + 'א'.repeat(i + 1), 'это очень хорошая книга ' + i));
  const built = B.buildPart(W, { text_id: 't', rows, word_gloss_ai_layer: layerFor(rows) }, PART, [], []);
  const total = built.rows.reduce((s, r) => s + Buffer.byteLength(JSON.stringify(r)), 0);
  const chunks = B.splitBuilt(W, built, Math.ceil(total / 3));
  assert.ok(chunks.length >= 3);
  assert.equal(chunks.reduce((s, c) => s + c.rows.length, 0), 12);
  assert.deepEqual(chunks.flatMap((c) => c.rows.map((r) => r.hebrew_plain)), built.rows.map((r) => r.hebrew_plain), 'order kept, nothing lost or repeated');
  for (const c of chunks) {
    assert.deepEqual(c.rows.map((r) => r.order_index), c.rows.map((_, i) => i));
    assert.equal(c.layer.rows.length, c.rows.length);
    assert.equal(c.client_rejected, 0);
  }
});

test('fields outside the public contract are dropped and counted, never silently', () => {
  const rows = [row(0, 'זֶה סֵפֶר', 'это книга', { edit_meta: { x: 1 }, meta: { source_line_index: 3, canonical_batch_index: 7 } })];
  const built = B.buildPart(W, { text_id: 't', rows }, PART, [], []);
  assert.equal(built.rows[0].meta.source_line_index, 3);
  assert.equal('canonical_batch_index' in built.rows[0].meta, false);
  assert.deepEqual(built.report.droppedRowFields, { edit_meta: 1 });
  assert.deepEqual(built.report.droppedMetaFields, { canonical_batch_index: 1 });
});
