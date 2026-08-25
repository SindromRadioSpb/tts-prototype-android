"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PIPELINE = path.join(ROOT, "scripts", "premium", "physics-corpus-pipeline.py");
const REPAIR_TABLE = path.join(ROOT, "scripts", "premium", "repair-physics-gemini-table-cache.js");

function runPrepare(tempDir, expectedCount = 1) {
  const cache = path.join(tempDir, "ocr.json");
  const corrections = path.join(tempDir, "corrections.json");
  const output = path.join(tempDir, "table-input.txt");
  const manifest = path.join(tempDir, "manifest.json");
  fs.writeFileSync(cache, JSON.stringify({
    model: "gemini-test",
    promptId: "ocr-test-v1",
    schemaId: "ocr-schema-test-v1",
    pages: [
      { text: "פרק 1\nשאלה 1.1:\nשווה-תאוצה" },
      { text: "שאלה 1.2:\nשורה א\nשורה ב" },
    ],
  }));
  fs.writeFileSync(corrections, JSON.stringify({
    replacements: [{ from: "שווה-תאוצה", to: "שוות-תאוצה", expected_count: expectedCount }],
  }));
  const result = spawnSync("python", [
    PIPELINE,
    "prepare-table-input",
    "--ocr-cache", cache,
    "--corrections", corrections,
    "--output", output,
    "--manifest", manifest,
  ], { cwd: ROOT, encoding: "utf8" });
  return { result, output, manifest };
}

test("physics table input is deterministic, lossless apart from whitespace, and checksum-bound", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "physics-table-input-"));
  const { result, output, manifest } = runPrepare(tempDir);
  assert.equal(result.status, 0, result.stderr);
  const text = fs.readFileSync(output, "utf8");
  assert.equal(text, "פרק 1 שאלה 1.1: שוות-תאוצה\nשאלה 1.2: שורה א שורה ב\n");
  const meta = JSON.parse(fs.readFileSync(manifest, "utf8"));
  assert.deepEqual(meta.projection.task_numbers, ["1.1", "1.2"]);
  assert.equal(meta.corrections.replacements[0].count, 1);
  assert.equal(meta.projection.table_input_sha256, crypto.createHash("sha256").update(text).digest("hex"));
});

test("physics table input fails closed when an approved correction no longer matches", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "physics-table-input-mismatch-"));
  const { result, output, manifest } = runPrepare(tempDir, 2);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /correction count mismatch/);
  assert.equal(fs.existsSync(output), false);
  assert.equal(fs.existsSync(manifest), false);
});

test("real Gemini batches normalize to 74 unique tasks with page and provider provenance", () => {
  const evidence = path.join(ROOT, "docs", "research", "physics-corpus", "2026-08-24");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "physics-normalized-"));
  const repairedBatch03 = path.join(tempDir, "batch-03-table-provider-cache.json");
  const repair = spawnSync("node", [
    REPAIR_TABLE,
    "--raw-cache", path.join(evidence, "batch-03-table-provider-raw-cache-retry-03.json"),
    "--corrected-input", path.join(evidence, "batch-03-table-input-corrected.txt"),
    "--corrections", path.join(evidence, "batch-03-approved-corrections.json"),
    "--output", repairedBatch03,
  ], { cwd: ROOT, encoding: "utf8" });
  assert.equal(repair.status, 0, repair.stderr);
  const repaired = JSON.parse(fs.readFileSync(repairedBatch03, "utf8"));
  assert.equal(repaired.rows.length, 107);
  assert.equal(repaired.localSourceCorrections.length, 2);

  const normalized = [];
  for (const [batch, initialChapter] of [["01", null], ["02", "4"], ["03", null]]) {
    const output = path.join(tempDir, `batch-${batch}.json`);
    const argv = [
      PIPELINE, "normalize-table-cache",
      "--table-cache", batch === "03" ? repairedBatch03 : path.join(evidence, `batch-${batch}-table-provider-cache.json`),
      "--ocr-cache", path.join(evidence, `batch-${batch}-ocr-provider-cache.json`),
      "--page-manifest", path.join(evidence, `page-manifest-batch-${batch}.json`),
      "--table-input", path.join(evidence, batch === "03" ? "batch-03-table-input-corrected.txt" : `batch-${batch}-table-input.txt`),
      "--output", output,
    ];
    if (initialChapter) argv.push("--initial-chapter", initialChapter);
    const result = spawnSync("python", argv, { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    normalized.push(JSON.parse(fs.readFileSync(output, "utf8")));
  }
  const tasks = normalized.flatMap((batch) => batch.tasks);
  assert.equal(tasks.length, 74);
  assert.equal(new Set(tasks.map((task) => task.task_number)).size, 74);
  for (const task of tasks) {
    assert.match(task.source_image_sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(task.source_page));
    assert.equal(task.ocr_provider.provider, "gemini");
    assert.equal(task.translator.provider, "gemini");
    assert.equal(task.verification_status, "generated_unreviewed");
  }
  const transposed = tasks.find((task) => task.task_number === "3.8");
  assert.equal(transposed.source_task_number, "8.3");
  assert.equal(transposed.source_page, 15);
  assert.match(normalized[0].warnings.join("\n"), /8\.3 normalized to 3\.8/);
  const firstChapterFive = tasks.find((task) => task.task_number === "5.1");
  assert.equal(firstChapterFive.chapter, 5);
  assert.match(firstChapterFive.chapter_heading.he_plain, /^פרק 5:/);
  assert.doesNotMatch(firstChapterFive.chapter_heading.he_plain, /שאלה 5\.1/);
  assert.match(firstChapterFive.task_heading.he_plain, /^שאלה 5\.1/);
  assert.equal(firstChapterFive.source_page, 23);
  const correctedNineThree = tasks.find((task) => task.task_number === "9.3");
  assert.equal(correctedNineThree.source_page, 39);
  assert.match(correctedNineThree.rows.map((row) => row.he_plain).join(" "), /1 מ' לשנייה/);
  assert.doesNotMatch(correctedNineThree.rows.map((row) => row.he_plain).join(" "), /1 מי לשנייה/);
});

test("physics corpus bundle contains 74 importable task cards with semantic rows and mandatory metadata", () => {
  const evidence = path.join(ROOT, "docs", "research", "physics-corpus", "2026-08-24");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "physics-corpus-bundle-"));
  const records = path.join(tempDir, "records.json");
  const bundle = path.join(tempDir, "physics-year1.zip");
  const manifest = path.join(tempDir, "manifest.json");
  const argv = [PIPELINE, "build-corpus"];
  for (const batch of ["01", "02", "03"]) {
    argv.push("--batch", path.join(evidence, `batch-${batch}-rendered-table.json`));
  }
  for (const batch of ["01", "02", "03"]) {
    argv.push("--comparison", path.join(evidence, `batch-${batch}-legacy-comparison.json`));
  }
  argv.push(
    "--records-output", records,
    "--bundle-output", bundle,
    "--manifest-output", manifest,
    "--generated-at", "2026-08-25T00:50:00Z",
  );
  const built = spawnSync("python", argv, { cwd: ROOT, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const checked = spawnSync("python", [
    PIPELINE, "verify-corpus-bundle", "--bundle", bundle, "--records", records,
  ], { cwd: ROOT, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  const corpus = JSON.parse(fs.readFileSync(records, "utf8"));
  assert.equal(corpus.summary.task_count, 74);
  assert.equal(corpus.summary.chapter_count, 9);
  assert.equal(corpus.summary.row_count, 425);
  assert.deepEqual(corpus.summary.by_chapter, {
    1: 10, 2: 3, 3: 8, 4: 14, 5: 3, 6: 12, 7: 8, 8: 5, 9: 11,
  });
  assert.equal(corpus.tasks.filter((task) => task.verification_status === "incomplete_missing_diagram").length, 45);
  for (const task of corpus.tasks) {
    assert.ok(task.rows.length > 0);
    assert.match(task.source_image_sha256, /^[a-f0-9]{64}$/);
    for (const row of task.rows) {
      assert.ok(["condition", "subpart", "note", "source_note"].includes(row.kind));
      assert.doesNotMatch(row.he_plain, /\n/);
      assert.doesNotMatch(row.ru, /\n/);
    }
  }
});
