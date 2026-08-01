const test = require('node:test');
const assert = require('node:assert/strict');
const Editor = require('../public/js/studio-media-editor.js');

test('editor presents one focused cue and bounded navigation for 2,800 segments', () => {
  assert.deepEqual(Editor.focusModel(2800, 0), { index: 0, number: 1, total: 2800, has_prev: false, has_next: true });
  assert.deepEqual(Editor.focusModel(2800, 2799), { index: 2799, number: 2800, total: 2800, has_prev: true, has_next: false });
  assert.deepEqual(Editor.focusModel(2, 99), { index: 1, number: 2, total: 2, has_prev: true, has_next: false });
});

test('split is allowed only at an explicit playback cursor strictly inside the cue', () => {
  const cue = { start_ms: 1000, end_ms: 3000 };
  assert.equal(Editor.canSplitAt(cue, null), false);
  assert.equal(Editor.canSplitAt(cue, 1000), false);
  assert.equal(Editor.canSplitAt(cue, 2000), true);
  assert.equal(Editor.canSplitAt(cue, 3000), false);
});

test('time parser/formatter uses milliseconds without float drift', () => {
  assert.equal(Editor.formatMs(3723456), '01:02:03.456');
  assert.equal(Editor.parseMs('01:02:03.456'), 3723456);
  assert.equal(Editor.parseMs('bad'), null);
});

test('media time selects the matching cue and remains bounded across gaps', () => {
  const segments = [
    { start_ms: 0, end_ms: 1000 },
    { start_ms: 1200, end_ms: 2200 },
    { start_ms: 2500, end_ms: 4000 },
  ];
  assert.equal(Editor.cueIndexForTime(segments, 0), 0);
  assert.equal(Editor.cueIndexForTime(segments, 1199), 0, 'a gap keeps the last honest cue selected');
  assert.equal(Editor.cueIndexForTime(segments, 1200), 1);
  assert.equal(Editor.cueIndexForTime(segments, 3999), 2);
  assert.equal(Editor.cueIndexForTime(segments, 9000), 2);
  assert.equal(Editor.cueIndexForTime([], 100), -1);
});

test('direct cue jump is one-based, finite and clamped', () => {
  assert.equal(Editor.cueJumpIndex(514, '1'), 0);
  assert.equal(Editor.cueJumpIndex(514, '287'), 286);
  assert.equal(Editor.cueJumpIndex(514, '999'), 513);
  assert.equal(Editor.cueJumpIndex(514, '0'), 0);
  assert.equal(Editor.cueJumpIndex(514, 'bad'), null);
});
