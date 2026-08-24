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
