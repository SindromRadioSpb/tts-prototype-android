const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/material-revision-core.js');

const rows = [
  { stable_row_id: 'r-0', caption_segment_id: null },
  { stable_row_id: 'r-1', caption_segment_id: 'cap-1' },
  { stable_row_id: 'r-2', caption_segment_id: 'cap-2' },
  { stable_row_id: 'r-3', caption_segment_id: 'cap-2' },
  { stable_row_id: 'r-4', caption_segment_id: 'cap-3' },
];

test('playback focus is exact and honest for 0/1/N mapping', () => {
  assert.deepEqual(Core.buildPlaybackFocus({ rows, caption_segment_id: 'missing' }), {
    caption_segment_id: 'missing', row_indexes: [], row_ids: [], selected_index: -1,
    selected_row_id: null, selected_position: 0, mapping_count: 0,
  });
  assert.deepEqual(Core.buildPlaybackFocus({ rows, caption_segment_id: 'cap-1' }), {
    caption_segment_id: 'cap-1', row_indexes: [1], row_ids: ['r-1'], selected_index: 1,
    selected_row_id: 'r-1', selected_position: 1, mapping_count: 1,
  });
  assert.deepEqual(Core.buildPlaybackFocus({ rows, caption_segment_id: 'cap-2', selected_row_id: 'r-3' }), {
    caption_segment_id: 'cap-2', row_indexes: [2, 3], row_ids: ['r-2', 'r-3'], selected_index: 3,
    selected_row_id: 'r-3', selected_position: 2, mapping_count: 2,
  });
});

test('review modes keep the exact primary/reference field contract', () => {
  assert.deepEqual(Core.fieldsForReviewMode('all'), Core.FIELD_NAMES);
  assert.deepEqual(Core.fieldsForReviewMode('he'), ['he_plain']);
  assert.deepEqual(Core.fieldsForReviewMode('niqqud'), ['he_plain', 'he_niqqud']);
  assert.deepEqual(Core.fieldsForReviewMode('latin'), ['he_niqqud', 'translit']);
  assert.deepEqual(Core.fieldsForReviewMode('ru-translit'), ['he_niqqud', 'translit_ru']);
  assert.deepEqual(Core.fieldsForReviewMode('translation'), ['he_plain', 'he_niqqud', 'ru']);
  assert.deepEqual(Core.fieldsForReviewMode('custom', ['ru', 'he_plain', 'ru', 'unknown']), ['he_plain', 'ru']);
  assert.deepEqual(Core.fieldsForReviewMode('custom', []), Core.FIELD_NAMES);
});

test('context anchor places current row after one previous row and clamps boundaries', () => {
  assert.equal(Core.computeContextScrollTop({
    scroll_top: 300, container_top: 100, container_height: 500,
    row_top: 420, previous_row_height: 72, gap: 8, max_scroll_top: 2000,
  }), 540);
  assert.equal(Core.computeContextScrollTop({
    scroll_top: 0, container_top: 100, container_height: 500,
    row_top: 100, previous_row_height: 0, gap: 8, max_scroll_top: 2000,
  }), 0);
  assert.equal(Core.computeContextScrollTop({
    scroll_top: 1950, container_top: 100, container_height: 500,
    row_top: 600, previous_row_height: 72, gap: 8, max_scroll_top: 2000,
  }), 2000);
});
