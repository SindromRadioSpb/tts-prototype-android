"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const support = require("../physics/physicsYear1LearningSupport");

function publishedAnchor(entry, overrides = {}) {
  return {
    slug: "physics-year1-problems",
    editionId: support.loadManifest().edition.edition_id,
    editionNumber: support.loadManifest().edition.edition_number,
    editionManifestSha256: support.loadManifest().edition.manifest_sha256,
    editionItemId: entry.edition_item_id,
    publicWorkId: entry.public_work_id,
    snapshotSha256: entry.snapshot_sha256,
    snapshot: {
      library: {
        texts: [{
          source_meta: {
            physics_task: {
              schema: "linguistpro.physics.task-card.1",
              task_number: entry.task_number,
              source_image_sha256: entry.source_image_sha256,
            },
          },
        }],
      },
    },
    ...overrides,
  };
}

test("R12 support manifest pins all 74 reviewed tasks to the immutable production edition", () => {
  const manifest = support.loadManifest();
  assert.equal(manifest.schema_version, "physics_learning_support_manifest.1.0.0");
  assert.equal(manifest.corpus_slug, "physics-year1-problems");
  assert.equal(manifest.edition.edition_number, 2);
  assert.match(manifest.edition.edition_id, /^ed_[a-f0-9]{24}$/);
  assert.match(manifest.edition.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.owner_approval.public_read_allowed, true);
  assert.equal(manifest.owner_approval.agent_derivative_text_allowed, true);
  assert.equal(manifest.owner_approval.basis, "OWNER_APPROVAL_PHYSICS_YEAR1_R12_2026_08_28");
  assert.equal(manifest.tasks.length, 74);
  assert.equal(new Set(manifest.tasks.map((entry) => entry.task_number)).size, 74);
  assert.equal(new Set(manifest.tasks.map((entry) => entry.public_work_id)).size, 74);
  assert.equal(manifest.review.open_mismatch_count, 0);
});

test("every support shard is hash-verified, bounded and complete for UI and agent use", () => {
  const manifest = support.loadManifest();
  for (const entry of manifest.tasks) {
    const body = support.resolveLearningSupport(publishedAnchor(entry));
    assert.equal(body.schema_version, "physics_learning_support.1.0.0");
    assert.equal(body.task_number, entry.task_number);
    assert.equal(body.public_work_id, entry.public_work_id);
    assert.equal(body.snapshot_sha256, entry.snapshot_sha256);
    assert.equal(body.review.open_mismatch, false);
    assert.ok(Array.isArray(body.source.condition_ru) && body.source.condition_ru.length > 0, `${entry.task_number}: Russian condition`);
    assert.ok(Array.isArray(body.source.condition_he) && body.source.condition_he.length > 0, `${entry.task_number}: Hebrew condition`);
    assert.ok(body.source.condition_ru.every(row => row.trim().length > 0), `${entry.task_number}: blank Russian condition row`);
    assert.ok(body.source.condition_he.every(row => /[\u0590-\u05ff]/.test(row)), `${entry.task_number}: Hebrew script missing`);
    assert.ok(body.beginner.physical_picture.length >= 60);
    assert.ok(body.beginner.roadmap.length >= 3);
    for (const key of ["given", "find", "si", "laws", "symbolic", "calculation", "check"])
      assert.ok(Array.isArray(body.exam_solution[key]) && body.exam_solution[key].length > 0, `${entry.task_number}: ${key}`);
    assert.ok(body.answer.result.length > 0);
    const markdown = support.toAgentMarkdown(body);
    assert.match(markdown, /## Сначала поймём задачу/);
    assert.match(markdown, /## Экзаменационное решение/);
    assert.match(markdown, /### Дано/);
    assert.match(markdown, /### Найти/);
    assert.match(markdown, /### Последовательный расчёт/);
    assert.match(markdown, /## Ответ/);
    assert.ok(Buffer.byteLength(markdown, "utf8") <= support.MAX_AGENT_MARKDOWN_BYTES, `${entry.task_number}: agent markdown too large`);
    assert.equal(fs.statSync(path.join(support.SUPPORT_ROOT, entry.file)).size, entry.bytes);
  }
});

test("support fails closed on edition, work, snapshot or source-image drift", () => {
  const entry = support.loadManifest().tasks[0];
  const cases = [
    { editionNumber: 3 },
    { editionManifestSha256: "0".repeat(64) },
    { publicWorkId: "work-" + "0".repeat(24) },
    { snapshotSha256: "0".repeat(64) },
    { snapshot: { library: { texts: [{ source_meta: { physics_task: { schema: "linguistpro.physics.task-card.1", task_number: entry.task_number, source_image_sha256: "0".repeat(64) } } }] } } },
  ];
  for (const drift of cases) assert.throws(() => support.resolveLearningSupport(publishedAnchor(entry, drift)), /PHYSICS_LEARNING_SUPPORT_NOT_FOUND/);
});
