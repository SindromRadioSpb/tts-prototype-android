'use strict';
// O-036 (вариант Б, владелец 2026-10-17): исправление ошибки распознавания в иврите строки не отнимает ▶ медиа.
// В момент правки строка закрепляет реплику, доказанную ДО правки; при открытии закреплённая строка заполняет
// только свой пробел (её реплика ничья и порядок строк сохраняется) — правило доказательства по тексту не ослаблено.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MH = require('../public/js/media-host.js');
const AT = require('../public/js/asr-transcript.js');
const deps = { AT, appVersion: 'test' };

const SHA = 'a'.repeat(64);
const segments = () => [
  { start: 0, end: 2, text: 'שלום עולם', source_segment_id: 'asrseg:' + SHA + ':0' },
  { start: 3, end: 5, text: 'אוווו מה קורה פה', source_segment_id: 'asrseg:' + SHA + ':1' },
  { start: 6, end: 8, text: 'מיה באה הביתה', source_segment_id: 'asrseg:' + SHA + ':2' },
  { start: 9, end: 11, text: 'ערב טוב לכולם', source_segment_id: 'asrseg:' + SHA + ':3' },
];
const audioOf = () => ({ media: { sha256: SHA }, segments: segments(), timing: null });
const before = ['שלום עולם', 'אוווו מה קורה פה', 'מיה באה הביתה', 'ערב טוב לכולם'];
const after = ['שלום עולם', 'או... מה קורה פה', 'מיה באה הביתה', 'ערב טוב לכולם'];

function pinFromBefore() {
  const a = audioOf();
  MH.restoreForRows(a, before.map((he) => ({ he })), deps);
  assert.equal(MH.rowReplayAllowed(a, 1), true, 'before the edit the row plays');
  return MH.provenRowSource(a, 1, before[1], deps);
}

test('the edited row keeps its ▶ through the source pinned before the edit', () => {
  const pin = pinFromBefore();
  assert.equal(pin.pinned_by, 'manual-edit');
  assert.equal(pin.source_line_index, 1);
  assert.equal(pin.source_segment_id, 'asrseg:' + SHA + ':1');

  const control = audioOf();
  MH.restoreForRows(control, after.map((he) => ({ he })), deps);
  assert.equal(MH.rowReplayAllowed(control, 1), false, 'without the pin the edit loses the row (the reported defect)');

  const a = audioOf();
  const rows = after.map((he, i) => (i === 1 ? { he, edit_meta_json: JSON.stringify({ edited: { he_plain: true }, _studio_source: pin }) } : { he }));
  MH.restoreForRows(a, rows, deps);
  assert.equal(MH.rowReplayAllowed(a, 1), true);
  assert.deepEqual(a.timingMap.row_seg_idx, [0, 1, 2, 3]);
  for (const i of [0, 2, 3]) assert.equal(MH.rowReplayAllowed(a, i), true);
});

test('a pin never borrows: another media, another row\'s segment, or out of order stays blind', () => {
  const pin = pinFromBefore();
  const other = audioOf(); other.media.sha256 = 'b'.repeat(64);
  MH.restoreForRows(other, after.map((he, i) => (i === 1 ? { he, edit_meta_json: { _studio_source: pin } } : { he })), deps);
  assert.equal(MH.rowReplayAllowed(other, 1), false, 'a pin made on another media file');
  assert.deepEqual(MH.mergePinnedRows([0, null, 2, 3], [null, 2, null, null]).rowSegIdx, [0, null, 2, 3], 'segment already taken');
  assert.deepEqual(MH.mergePinnedRows([0, null, 2, 3], [null, 3, null, null]).rowSegIdx, [0, null, 2, 3], 'out of order');
  assert.deepEqual(MH.mergePinnedRows([0, null, 2, 3], [null, 1, null, null]).added, 1);
});

test('nothing is pinned when the row is not proven by its own text', () => {
  const a = audioOf();
  MH.restoreForRows(a, before.map((he) => ({ he })), deps);
  assert.equal(MH.provenRowSource(a, 1, 'טקסט אחר לגמרי', deps), null, 'the old text must be inside the segment');
  assert.equal(MH.provenRowSource({ segments: segments(), timingSource: 'studio-exact-binding', timingMap: { row_seg_idx: [0, 1] } }, 1, before[1], deps), null);
});

test('Studio pins at a Hebrew edit; the revision keeps the pin and the projection writes it once', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const html = read('public/index.html');
  assert.match(html, /MediaHost\.provenRowSource\(window\.v3ActiveMediaAudio, rowIdx, row\.he\)/);
  assert.match(html, /commitInlineCell\(tid, sid, apiField, newVal, \{ pin: pinSource \}\)/);
  assert.match(html, /if \(pinSource && !newMeta\._studio_source\) newMeta\._studio_source = pinSource;/);
  assert.match(read('public/js/studio-material-revision.js'), /pinned_source:pin/);
  assert.match(read('public/js/material-revision-repository.js'), /if \(pinned && !existing\._studio_source\) existing\._studio_source = pinned;/);
});
