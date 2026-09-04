'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('../public/js/lexical-resolution-ui.js');
const fs = require('node:fs');
const path = require('node:path');

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

test('review editor and exact impact stay before the bounded context list', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public/js/lexical-resolution-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/lexical-resolution.css'), 'utf8');
  assert.match(ui, /inner\.append\(editor,contexts\)/);
  assert.match(ui, /card\.insertBefore\(impact,anchor\)/);
  assert.match(css, /\.lexres-context-list\{[^}]*max-height:[^;}]+;[^}]*overflow:auto/);
});
