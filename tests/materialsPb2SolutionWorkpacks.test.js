"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const DIR = path.join(
  __dirname,
  "..",
  "docs",
  "research",
  "materials-science-problem-solutions",
  "2026-08-30",
  "solution-batches"
);

function allKeys(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) allKeys(entry, output);
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      output.push(key);
      allKeys(entry, output);
    }
  }
  return output;
}

test("solution source workpacks pin exactly 60 unique tasks in six source-only batches", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "solution-workpack-manifest.json"), "utf8"));
  assert.equal(manifest.status, "PASS_6_BATCHES_X_10_TASKS_SOURCE_ONLY");
  assert.equal(manifest.batch_count, 6);
  assert.equal(manifest.task_count, 60);
  const ids = [];
  for (const output of manifest.outputs) {
    const workpack = JSON.parse(fs.readFileSync(path.join(DIR, output.filename), "utf8"));
    assert.equal(workpack.task_count, 10);
    assert.equal(workpack.truth_boundary, "CONDITIONS_DIAGRAMS_AND_DECLARED_SOURCE_METADATA_ONLY");
    const keys = allKeys(workpack);
    assert.equal(keys.includes("candidate_solution_rows"), false);
    assert.equal(keys.includes("legacy_solution"), false);
    ids.push(...workpack.tasks.map((task) => task.task_id));
  }
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60);
});
