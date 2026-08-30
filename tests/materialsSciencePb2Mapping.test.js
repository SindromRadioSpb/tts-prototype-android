const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const STABLE = path.join(ROOT, 'docs', 'research', 'materials-science-problem-corpus', '2026-08-30', 'prepare');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(STABLE, name), 'utf8'));
}

test('reviewed mapping targets all 58 cards and 2469 rows without gaps', () => {
  const mapping = readJson('reviewed-legacy-row-mapping.json');
  assert.equal(mapping.status, 'PASS_ALL_58_CARDS_AND_2469_ROWS_EXACTLY_TARGETED');
  assert.equal(mapping.card_count, 58);
  assert.equal(mapping.row_count, 2469);
  assert.equal(mapping.mapped_row_count, 2469);
  assert.equal(mapping.unmapped_row_count, 0);
  for (const card of mapping.cards) {
    assert.equal(card.rows.length, card.row_count);
    assert.deepEqual(card.rows.map((row) => row.row_index),
      Array.from({ length: card.row_count }, (_, index) => index));
    assert.ok(card.rows.every((row) => /^[a-f0-9]{64}$/.test(row.aligned_row_sha256)));
    assert.ok(card.rows.every((row) => row.target_id && row.legacy_row_role));
  }
});

test('reviewed mapping preserves known multi-task row boundaries', () => {
  const mapping = readJson('reviewed-legacy-row-mapping.json');
  const expected = new Map([
    ['Задачник 2. Страница 48-49', [[0, 36, 'materials-science-y1-pb2-q039'], [37, 68, 'materials-science-y1-pb2-q040']]],
    ['Задачник 2. Страница 63 (1,2 и 3)', [[0, 27, 'materials-science-y1-pb2-q053'], [28, 47, 'materials-science-y1-pb2-q054'], [48, 90, 'materials-science-y1-pb2-q055']]],
    ['Задачник 2. Страница 64 (1 и 2), 65', [[0, 29, 'materials-science-y1-pb2-q056'], [30, 49, 'materials-science-y1-pb2-q057'], [50, 81, 'materials-science-y1-pb2-q058']]],
  ]);
  for (const [title, segments] of expected) {
    const card = mapping.cards.find((item) => item.legacy_title === title);
    assert.ok(card, title);
    assert.deepEqual(card.segments.map((item) => [item.row_start, item.row_end, item.target_id]), segments);
  }
});

test('legacy coverage gaps and duplicate-card tasks remain explicit', () => {
  const mapping = readJson('reviewed-legacy-row-mapping.json');
  assert.equal(mapping.task_ids_with_legacy_rows.length, 58);
  assert.deepEqual(mapping.task_ids_without_legacy_rows, [
    'materials-science-y1-pb2-q002',
    'materials-science-y1-pb2-q032',
  ]);
  assert.deepEqual(mapping.task_ids_with_multiple_legacy_cards, [
    'materials-science-y1-pb2-q006',
    'materials-science-y1-pb2-q016',
    'materials-science-y1-pb2-q030',
  ]);
  assert.deepEqual(mapping.reference_targets, ['source-reference-p046-a', 'source-reference-p046-bc']);
});

test('diagram manifest classifies every canonical task and keeps appendix dependencies explicit', () => {
  const diagrams = readJson('diagram-manifest.json');
  assert.equal(diagrams.status, 'PASS_ALL_60_TASKS_SEMANTICALLY_CLASSIFIED');
  assert.equal(diagrams.task_count, 60);
  const q043 = diagrams.tasks.find((task) => task.task_id === 'materials-science-y1-pb2-q043');
  assert.deepEqual(q043.external_reference_dependencies.map((item) => item.source_pages), [[71, 72, 73]]);
  assert.equal(new Set(diagrams.tasks.map((item) => item.task_id)).size, 60);
  assert.equal(diagrams.tasks_with_semantic_visuals, 43);
  assert.equal(diagrams.semantic_visual_instance_count, 90);
  assert.equal(diagrams.tasks_with_external_reference_dependencies, 12);
  assert.ok(diagrams.tasks.every((item) => item.classification_status === 'MANUAL_SOURCE_RENDER_REVIEWED_2026_08_30'));
  assert.ok(diagrams.tasks.flatMap((item) => item.semantic_visuals)
    .every((visual) => visual.preservation_status === 'PRESERVED_IN_CONDITION_SOURCE_ANCHOR'));
});

test('mapping verification proves the local-only boundary', () => {
  const verification = readJson('mapping-classification-verification.json');
  assert.equal(verification.status, 'PASS');
  assert.ok(Object.values(verification.checks).every((value) => value === true));
  const serialized = JSON.stringify({
    mapping: readJson('reviewed-legacy-row-mapping.json'),
    diagrams: readJson('diagram-manifest.json'),
    verification,
  });
  assert.doesNotMatch(serialized, /G:\\Andasa|\.key|AIza|api[_-]?key|https?:\/\//i);
});
