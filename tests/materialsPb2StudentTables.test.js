"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { build, karaokeTokens, normalizedComparison } = require("../scripts/premium/build-materials-pb2-student-tables");

const ROOT = path.join(__dirname, "..");
const BUNDLE = path.join(ROOT, "tests", "fixtures", "materials-pb2", "canonical-source.zip");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

test("student presentation tables rebuild deterministically for all 60 reviewed tasks", async () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-student-a-"));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-student-b-"));
  const a = await build({ bundlePath: BUNDLE, output: first });
  const b = await build({ bundlePath: BUNDLE, output: second });
  assert.equal(a.task_count, 60);
  assert.equal(a.publication_blocking_count, 0);
  assert.equal(a.source_only_task_count, 2);
  assert.equal(a.presentation_replacement_count, 19);
  assert.equal(a.manifest_sha256, b.manifest_sha256);
  const manifest = JSON.parse(fs.readFileSync(path.join(first, "manifest.json"), "utf8"));
  assert.equal(manifest.audio_boundary.full_tts_generated, false);
  assert.equal(manifest.audio_boundary.row_contract_checked, true);
  assert.equal(manifest.rights.status, "OWNER_ATTESTATION_REQUIRED_BEFORE_PUBLICATION");
  for (const entry of manifest.tasks) {
    const left = fs.readFileSync(path.join(first, entry.file));
    const right = fs.readFileSync(path.join(second, entry.file));
    assert.equal(sha256(left), entry.sha256);
    assert.deepEqual(left, right);
  }
});

test("known rejected legacy claims are absent and their source-backed replacements are visible", async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-student-repairs-"));
  await build({ bundlePath: BUNDLE, output });
  const load = id => JSON.parse(fs.readFileSync(path.join(output, "tasks", `${id}.json`), "utf8"));
  const q018 = load("materials-science-y1-pb2-q018");
  const q025 = load("materials-science-y1-pb2-q025");
  const q026 = load("materials-science-y1-pb2-q026");
  const q028 = load("materials-science-y1-pb2-q028");
  const q029 = load("materials-science-y1-pb2-q029");
  assert.doesNotMatch(q018.rows.map(row => row.text.ru).join("\n"), /SAE\/AISI 1045/u);
  assert.match(q018.rows.map(row => row.text.ru).join("\n"), /SAE 1040/u);
  assert.match(q025.rows.map(row => row.text.ru).join("\n"), /2×10\^7–3×10\^7/u);
  assert.doesNotMatch(q025.rows.map(row => row.text.ru).join("\n"), /5\.4×10\^6/u);
  assert.match(q026.rows.map(row => row.text.ru).join("\n"), /точное значение по рисунку не определяется/u);
  assert.match(q028.rows.map(row => row.text.ru).join("\n"), /2,14% C/u);
  assert.match(q029.rows.map(row => row.text.ru).join("\n"), /единственный диапазон отпуска.*нельзя/u);
});

test("source-only tasks have full four-language reviewed rows", async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "materials-pb2-student-source-only-"));
  await build({ bundlePath: BUNDLE, output });
  for (const id of ["materials-science-y1-pb2-q002", "materials-science-y1-pb2-q032"]) {
    const table = JSON.parse(fs.readFileSync(path.join(output, "tasks", `${id}.json`), "utf8"));
    assert.equal(table.review.legacy_comparison, "NO_LEGACY_SOLUTION");
    assert.ok(table.rows.filter(row => row.exam_copy).length >= 6);
    for (const row of table.rows) {
      for (const key of ["he", "he_niqqud", "transliteration", "ru"]) assert.ok(row.text[key].trim());
    }
  }
});

test("row-level karaoke contract tokenizes locally while timings and synthesis stay deferred", () => {
  assert.deepEqual(karaokeTokens("הַחֹזֶק הוא 200 MPa").map(token => token.index), [0, 1, 2, 3]);
  assert.equal(normalizedComparison("LEGACY_GRADE_REJECTED_SOURCE_APPENDIX_REVIEW_PASS", 18), "MISMATCH");
  assert.equal(normalizedComparison("MATCH", 25), "MATCH");
  assert.equal(normalizedComparison("SOURCE_ONLY_TECHNICAL_REVIEW_PASS_NO_LEGACY_CARD", 0), "NO_LEGACY_SOLUTION");
});
