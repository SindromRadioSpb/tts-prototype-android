const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKET = path.join(ROOT, 'docs', 'research', 'physics-learning-derivatives', '2026-08-27');
const CORPUS = path.join(ROOT, 'docs', 'research', 'physics-corpus', '2026-08-24', 'physics-year1-corpus-records.json');
const BUILDER = path.join(ROOT, 'scripts', 'premium', 'build-physics-learning-derivatives.js');
const OUT = path.join(PACKET, 'artifacts');

function json(relative) {
  return JSON.parse(fs.readFileSync(path.join(PACKET, relative), 'utf8'));
}

function ids(entries) {
  return entries.map((entry) => entry.task_number).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('all ledgers match the exact 74-task corpus set', () => {
  const canonical = ids(JSON.parse(fs.readFileSync(CORPUS, 'utf8')).tasks);
  const answer = json('answer-ledger.json');
  const solution = json('solution-ledger.json');
  const localized = json('solution-ledger.ru.json');
  assert.equal(new Set(canonical).size, 74);
  assert.deepEqual(ids(answer.entries), canonical);
  assert.deepEqual(ids(solution.entries), canonical);
  assert.deepEqual(ids(localized.entries), canonical);
  assert.equal(solution.review.handwritten_solution_used, false);
  assert.equal(solution.review.answer_key_role, 'post_derivation_comparison_only');
  assert.equal(solution.entries.filter((entry) => entry.comparison === 'MISMATCH').length, 10);
});

test('builder is deterministic and manifests every generated learning artifact', () => {
  execFileSync(process.execPath, [BUILDER], { cwd: ROOT });
  const firstManifest = sha256(path.join(OUT, 'manifest.json'));
  const firstHtml = sha256(path.join(OUT, 'physics-year1-solutions.html'));
  execFileSync(process.execPath, [BUILDER], { cwd: ROOT });
  assert.equal(sha256(path.join(OUT, 'manifest.json')), firstManifest);
  assert.equal(sha256(path.join(OUT, 'physics-year1-solutions.html')), firstHtml);

  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.task_count, 74);
  assert.equal(manifest.mismatch_count, 10);
  assert.equal(manifest.handwritten_solution_used, false);
  assert.equal(manifest.files.filter((file) => /^tasks\/task-\d+\.\d+\.md$/.test(file.path)).length, 74);
  assert.ok(manifest.files.some((file) => file.path === 'physics-year1-agent-guide.md'));
  for (const entry of manifest.files) {
    assert.equal(sha256(path.join(OUT, entry.path)), entry.sha256, entry.path);
  }
});

test('premium guide exposes provenance, Russian solution text and mismatch states', () => {
  const html = fs.readFileSync(path.join(OUT, 'physics-year1-solutions.html'), 'utf8');
  assert.match(html, /74 задачи/);
  assert.match(html, /Грузовик: 180=10v₀/);
  assert.match(html, /рукописные решения не распознавались/i);
  assert.equal((html.match(/class="task(?: |")/g) || []).length, 74);
  assert.equal((html.match(/class="task task--mismatch"/g) || []).length, 10);
  assert.doesNotMatch(html, /G:\\|Andasa|Чистовик/);
});
