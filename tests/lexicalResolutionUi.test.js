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

test('Pealim field accepts an id or a full official URL and stores only the id', () => {
  assert.equal(UI.parsePealimId('6014'), '6014');
  assert.equal(UI.parsePealimId('https://www.pealim.com/ru/dict/6014-le/'), '6014');
  assert.equal(UI.parsePealimId('https://www.pealim.com/dict/4158-kol/'), '4158');
  assert.equal(UI.parsePealimId('https://example.com/ru/dict/6014-le/'), '');
  assert.equal(UI.pealimUrl('6014'), 'https://www.pealim.com/ru/dict/6014/');
});

test('candidate analysis carries the Pealim URL and canonical POS into the editor', () => {
  const analysis = UI.candidateAnalysis({ lemma: 'ל', pos: 'preposition', pealim_id: '6014' }, {
    normalizePos: (value) => value
  });
  assert.deepEqual(analysis, {
    lemma: 'ל', lp_pos: 'preposition', pealim_id: '6014', pealim_url: 'https://www.pealim.com/ru/dict/6014/',
    root: '', binyan: '', meaning_ru: ''
  });
});

test('review reasons are learner-facing and never expose internal codes', () => {
  const fallbackT = (_key, fallback) => fallback;
  for (const code of ['identity_guarded', 'ambiguous', 'unknown_pos', 'collision', 'skipped_token']) {
    const info = UI.reasonInfo(code, fallbackT);
    assert.equal(info.code, code);
    assert.ok(info.label.length > 4);
    assert.ok(info.help.length > 12);
    assert.doesNotMatch(info.label, /identity_guarded|ambiguous|unknown_pos|collision|skipped_token/);
  }
});

test('word-group search ignores Hebrew vocalization and can filter by review reason', () => {
  const cluster = {
    surface: 'כל', niqqud: 'כָּל', reasons: ['collision'],
    occurrences: [{ sentence_he_niqqud: 'כָּל הָעוֹלָם', sentence_ru: 'весь мир', meaning_ru: 'каждый' }]
  };
  assert.equal(UI.matchesClusterFilter(cluster, 'כל', 'all'), true);
  assert.equal(UI.matchesClusterFilter(cluster, 'весь мир', 'all'), true);
  assert.equal(UI.matchesClusterFilter(cluster, '', 'collision'), true);
  assert.equal(UI.matchesClusterFilter(cluster, '', 'ambiguous'), false);
});

test('review editor and exact impact stay before the bounded context list', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public/js/lexical-resolution-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/lexical-resolution.css'), 'utf8');
  assert.match(ui, /inner\.append\(editor,contexts\)/);
  assert.match(ui, /card\.insertBefore\(impact,anchor\)/);
  assert.match(ui, /input\.name==='lp_pos'|name==='lp_pos'/);
  assert.match(ui, /document\.createElement\('select'\)|\$\('select'/);
  assert.match(ui, /room\.morph\.pos\./);
  assert.match(css, /\.lexres-context-list\s*\{[^}]*max-height:[^;}]+;[^}]*overflow:\s*auto/);
  assert.match(ui, /role','tooltip/);
  assert.match(ui, /aria-describedby/);
  assert.match(ui, /search\.type='search'/);
  assert.match(ui, /room\.resolution\.filterLabel/);
  assert.doesNotMatch(ui, /Occurrence и кластеры|Контексты occurrence|Точный impact до записи|решение occurrence/);
});
