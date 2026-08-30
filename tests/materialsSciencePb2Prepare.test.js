const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const STABLE = path.join(ROOT, 'docs', 'research', 'materials-science-problem-corpus', '2026-08-30', 'prepare');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(STABLE, name), 'utf8'));
}

test('materials PB2 page manifest is a complete source-bound 73-page ledger', () => {
  const manifest = readJson('page-manifest.json');
  assert.equal(manifest.source_pdf_sha256, '3d87b9f5b2b0f6f6a44e004e2013f226073a22e33d6f25e42373c621cef6d435');
  assert.equal(manifest.page_count, 73);
  assert.deepEqual(manifest.pages.map((item) => item.source_page), Array.from({ length: 73 }, (_, index) => index + 1));
  assert.ok(manifest.pages.every((item) => item.render_sha256 && item.ink_ratio >= 0.001));
  assert.equal(manifest.pages.find((item) => item.source_page === 68).rotation_degrees, 270);
  assert.equal(manifest.pages.find((item) => item.source_page === 69).rotation_degrees, 270);
});

test('materials PB2 preserves the owner-approved 60-task identity set', () => {
  const manifest = readJson('task-manifest.json');
  assert.equal(manifest.canonical_task_count, 60);
  assert.equal(new Set(manifest.tasks.map((item) => item.task_id)).size, 60);
  assert.equal(manifest.tasks.filter((item) => item.display_number !== null).length, 59);
  assert.equal(new Set(manifest.tasks.filter((item) => item.display_number !== null).map((item) => item.display_number)).size, 58);
  const duplicate38 = manifest.tasks.filter((item) => item.display_number === 38);
  assert.deepEqual(duplicate38.map((item) => item.source_anchors[0].source_page), [45, 47]);
  assert.deepEqual(duplicate38.map((item) => item.display_alias), ['38-A', '38-B']);
  assert.ok(duplicate38.every((item) => item.mapping_status === 'OWNER_APPROVED_CANONICAL_DUPLICATE_DISPLAY_NUMBER_2026_08_30'));
  const q2 = manifest.tasks.find((item) => item.display_number === 2);
  assert.deepEqual(q2.source_anchors.map((item) => item.source_page), [4, 5]);
  const exercise = manifest.tasks.find((item) => item.display_number === null);
  assert.equal(exercise.mapping_status, 'OWNER_APPROVED_CANONICAL_2026_08_30');
  assert.equal(exercise.display_alias, 'Упражнение — Аллотропия железа');
  assert.ok(manifest.tasks.every((item) => item.task_record_sha256));
});

test('prepared PDFs are hash-bound, nonblank, bounded, and exclude solution-only pages from task batches', () => {
  const manifest = readJson('prepared-input-manifest.json');
  assert.equal(manifest.batches.length, 4);
  const filenames = manifest.batches.map((item) => item.filename);
  assert.deepEqual(filenames, [
    'materials-pb2-task-input-01.pdf',
    'materials-pb2-task-input-02.pdf',
    'materials-pb2-task-input-03.pdf',
    'materials-pb2-reference-input-04.pdf',
  ]);
  const solutionOnly = new Set([10, 11, 13, 19, 24, 32, 50]);
  for (const batch of manifest.batches) {
    assert.ok(batch.sha256);
    assert.ok(batch.bytes < manifest.internal_pdf_size_ceiling_bytes);
    assert.ok(batch.min_ink_ratio >= 0.001);
    assert.equal(fs.statSync(path.join(STABLE, 'prepared-inputs', batch.filename)).size, batch.bytes);
    if (batch.filename.includes('task-input')) {
      assert.ok(batch.pages.every((item) => !solutionOnly.has(item.source_page)));
      assert.ok(batch.pages.every((item) => item.item_kind === 'task_condition'));
    }
  }
});

test('legacy projection is hash-only, cannot overwrite canon, and exposes mapping conflicts', () => {
  const projection = readJson('legacy-projection-manifest.json');
  const mapping = readJson('mapping-ledger.json');
  assert.equal(projection.policy, 'HASH_ONLY_COMPARISON_LAYER_NO_CANONICAL_FALLBACK');
  assert.equal(projection.card_count, 58);
  assert.equal(projection.row_count, 2469);
  assert.equal(mapping.entries.length, 58);
  assert.ok(mapping.status_counts.AMBIGUOUS_DUPLICATE_LEGACY_TITLE >= 2);
  assert.ok(mapping.status_counts.HEURISTIC_TASK_MARKER_CONFLICT_REQUIRES_MANUAL_REVIEW >= 1);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /chatgpt\.com|https?:\/\/|[A-Za-z]:\\/);
  const allowedRowKeys = [
    'aligned_row_sha256', 'field_sha256', 'has_audio_asset_key',
    'has_typed_meta_json', 'order_index', 'row_index',
  ].sort();
  assert.ok(projection.cards.every((card) => card.rows.every((row) => {
    assert.deepEqual(Object.keys(row).sort(), allowedRowKeys);
    assert.deepEqual(Object.keys(row.field_sha256).sort(), ['he', 'he_niqqud', 'ru', 'transliteration']);
    return row.aligned_row_sha256 && Object.values(row.field_sha256).every((value) => /^[a-f0-9]{64}$/.test(value));
  })));
});

test('correction ledger contains only the two reviewed condition-anchor fixes', () => {
  const correction = readJson('correction-ledger.json');
  const verification = readJson('prepare-verification.json');
  const cost = readJson('cost-envelope.json');
  assert.equal(correction.entries.length, 2);
  assert.equal(correction.status, 'LOCAL_SOURCE_ANCHOR_CORRECTIONS_APPLIED');
  assert.deepEqual(correction.entries.map((item) => item.task_id), [
    'materials-science-y1-pb2-q042',
    'materials-science-y1-pb2-q044',
  ]);
  assert.ok(correction.entries.every((item) => item.meaning_changed === false));
  assert.equal(cost.provider_calls_made, 0);
  assert.equal(cost.secret_accessed, false);
  assert.equal(verification.checks.provider_calls, 0);
  assert.equal(verification.checks.secret_access, false);
  assert.equal(verification.checks.import_or_publication, false);
  assert.ok(Object.values(verification.checks).every((value) => value === true || value === false || value === 0));
  assert.ok(Object.entries(verification.checks)
    .filter(([key]) => !['provider_calls', 'secret_access', 'import_or_publication'].includes(key))
    .every(([, value]) => value === true));
});

test('independent rebuild evidence records byte-identical generated artifacts', () => {
  const determinism = readJson('determinism-verification.json');
  assert.equal(determinism.result, 'PASS');
  assert.equal(determinism.generated_files_compared, 20);
  assert.equal(determinism.matching_files, 20);
  assert.deepEqual(determinism.mismatches, []);
  assert.equal(Object.keys(determinism.prepared_pdf_sha256).length, 4);
  assert.ok(Object.values(determinism.prepared_pdf_sha256).every((value) => /^[a-f0-9]{64}$/.test(value)));
});

test('stable textual artifacts contain no owner path, key filename, or provider credential', () => {
  const files = fs.readdirSync(STABLE).filter((name) => name.endsWith('.json') || name.endsWith('.md'));
  const combined = files.map((name) => fs.readFileSync(path.join(STABLE, name), 'utf8')).join('\n');
  assert.doesNotMatch(combined, /G:\\Andasa|\.key|AIza|api[_-]?key/i);
});
