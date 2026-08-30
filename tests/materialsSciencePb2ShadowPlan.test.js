const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const STABLE = path.join(ROOT, 'docs', 'research', 'materials-science-problem-corpus', '2026-08-30');
const SHADOW = path.join(STABLE, 'shadow');

function readJson(name, root = SHADOW) {
  return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
}

function sha(file) {
  const bytes = fs.readFileSync(file);
  const canonical = path.extname(file) === '.md'
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    : bytes;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

test('shadow plan is exactly 12 stratified cases, 13 tasks, and three batches', () => {
  const sample = readJson('shadow-sample-manifest.json');
  assert.equal(sample.status, 'PLAN_COMPLETE_APPLY_BLOCKED');
  assert.equal(sample.case_count, 12);
  assert.equal(sample.task_count, 13);
  assert.equal(sample.batches.length, 3);
  assert.equal(sample.batches.reduce((sum, batch) => sum + batch.pdf_page_exposures, 0), 20);
  assert.equal(sample.batches.reduce((sum, batch) => sum + batch.estimated_pdf_image_tokens, 0), 5160);
  assert.ok(sample.cases.every((item) => item.provider_output_truth_status === 'GENERATED_UNREVIEWED_ADVISORY_ONLY'));
});

test('sample keeps no-legacy gaps, duplicate identities, visuals, and appendices explicit', () => {
  const sample = readJson('shadow-sample-manifest.json');
  const cases = new Map(sample.cases.map((item) => [item.case_id, item]));
  assert.equal(cases.get('S03-MULTIPAGE-NO-LEGACY').legacy_state, 'NO_LEGACY_ROWS');
  assert.equal(cases.get('S08-VISUAL-NO-LEGACY').legacy_state, 'NO_LEGACY_ROWS');
  assert.deepEqual(cases.get('S10-DUPLICATE-SOURCE-NUMBER-38').tasks.map((item) => item.display_alias), ['38-A', '38-B']);
  assert.deepEqual(cases.get('S10-DUPLICATE-SOURCE-NUMBER-38').input_source_pages, [45, 47, 67, 68, 69]);
  assert.deepEqual(cases.get('S11-CORRECTED-CROP-APPENDICES').input_source_pages, [54, 71, 72, 73]);
  assert.ok(cases.get('S05-DUPLICATE-LEGACY-CARDS').legacy_references.length >= 2);
});

test('cost plan has a hard arithmetic ceiling and proves zero provider/secret use', () => {
  const cost = readJson('shadow-cost-plan.json');
  assert.equal(cost.model, 'gemini-3.7-flash');
  assert.equal(cost.max_provider_calls, 4);
  assert.equal(cost.input_token_cap_per_call, 50000);
  assert.equal(cost.output_token_cap_per_call_including_thinking, 16384);
  assert.equal(cost.calculated_worst_case_usd, 0.39576);
  assert.equal(cost.proposed_hard_ceiling_usd, 0.5);
  assert.ok(cost.calculated_worst_case_usd <= cost.proposed_hard_ceiling_usd);
  assert.equal(cost.provider_calls_made, 0);
  assert.equal(cost.secret_accessed, false);
});

test('provider schema cannot return solutions and resume cache fails closed by identity', () => {
  const schema = readJson('shadow-audit-schema.json');
  const ledger = readJson('shadow-resume-ledger.template.json');
  assert.equal(schema.properties.cases.minItems, 4);
  assert.equal(schema.properties.cases.maxItems, 4);
  assert.equal(schema.properties.batch_summary.properties.solution_content_generated.type, 'boolean');
  assert.doesNotMatch(JSON.stringify(schema.properties), /worked_solution|answer_key|beginner_walkthrough/i);
  assert.equal(ledger.raw_cache_policy, 'WRITE_ONCE_ATOMIC_NEVER_EDIT_IN_PLACE');
  assert.deepEqual(ledger.cache_identity_fields, [
    'model', 'model_version', 'prompt_sha256', 'schema_sha256',
    'request_body_sha256', 'source_input_sha256',
  ]);
  assert.ok(ledger.batches.every((item) => item.state === 'PLANNED' && item.attempt_count === 0));
});

test('historical shadow packet stays immutable while final source-manifest drift is explicit', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'materials-shadow-plan-'));
  const run = spawnSync('python', [
    path.join(ROOT, 'scripts', 'premium', 'plan-materials-science-pb2-shadow.py'),
    '--stable', STABLE, '--output', tmp, '--base-head', readJson('shadow-sample-manifest.json').base_head,
  ], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const deterministicNames = [
    'README.md', 'SHADOW_PLAN.md', 'shadow-audit-prompt.md', 'shadow-audit-schema.json',
    'shadow-cost-plan.json', 'shadow-resume-ledger.template.json',
    'shadow-verification.json',
  ];
  for (const name of deterministicNames) assert.equal(sha(path.join(SHADOW, name)), sha(path.join(tmp, name)), name);
  const stableSample = readJson('shadow-sample-manifest.json');
  const generatedSample = readJson('shadow-sample-manifest.json', tmp);
  const drift = readJson('post-build-source-manifest-drift.json');
  assert.equal(stableSample.source_manifest_sha256['diagram-manifest.json'], drift.historical_shadow_input_sha256);
  assert.equal(generatedSample.source_manifest_sha256['diagram-manifest.json'], drift.final_source_manifest_sha256);
  assert.equal(sha(path.join(STABLE, 'prepare', 'diagram-manifest.json')), drift.final_source_manifest_sha256);
  generatedSample.source_manifest_sha256 = stableSample.source_manifest_sha256;
  assert.deepEqual(generatedSample, stableSample, 'only the explicitly recorded post-build source hash may differ');
  assert.equal(drift.impact.shadow_provider_output_used_as_corpus_truth, false);
  assert.equal(drift.impact.provider_retry_allowed, false);
  const names = [...deterministicNames, 'shadow-sample-manifest.json', 'post-build-source-manifest-drift.json'];
  const combined = names.map((name) => fs.readFileSync(path.join(SHADOW, name), 'utf8')).join('\n');
  assert.doesNotMatch(combined, /G:\\Andasa|\.key|AIza|api[_-]?key/i);
});
