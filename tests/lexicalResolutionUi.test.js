'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('../public/js/lexical-resolution-ui.js');

const occurrences = [
  { lp_occurrence_id: 'o1', sentence_he_niqqud: 'אֶת הַבַּיִת', sentence_ru: 'дом' },
  { lp_occurrence_id: 'o2', sentence_he_niqqud: 'אֶת הַסֵּפֶר', sentence_ru: 'книгу' }
];

test('exact batch impact enumerates every and only cluster occurrence', () => {
  const impact = UI.exactImpact({ batch_review_eligible: true, occurrences }, 'o1', true);
  assert.equal(impact.occurrence_count, 2);
  assert.deepEqual(impact.occurrence_ids, ['o1', 'o2']);
  assert.deepEqual(impact.contexts.map((row) => row.sentence_ru), ['дом', 'книгу']);
});

test('single impact stays occurrence-scoped and ineligible batch fails closed', () => {
  assert.deepEqual(UI.exactImpact({ batch_review_eligible: false, occurrences }, 'o2', false).occurrence_ids, ['o2']);
  assert.throws(() => UI.exactImpact({ batch_review_eligible: false, occurrences }, 'o1', true), /LEXICAL_BATCH_NOT_ELIGIBLE/);
  assert.throws(() => UI.exactImpact({ batch_review_eligible: true, occurrences }, 'missing', false), /LEXICAL_IMPACT_EMPTY/);
});
