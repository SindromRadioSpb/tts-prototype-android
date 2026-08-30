"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const PACKET = path.join(__dirname, "..", "docs", "research", "materials-science-problem-solutions", "2026-08-30");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(PACKET, name), "utf8"));

test("student solution table is the sole presentation truth with four parallel language columns", () => {
  const spec = readJson("solution-program-spec.json");
  const table = spec.student_solution_table;
  assert.equal(table.single_truth_rule, "TABLE_ROWS_ARE_PRIMARY_SOLUTION_PRESENTATION_NO_PARALLEL_FREE_TEXT_SOLUTION");
  assert.deepEqual(table.columns, ["he", "he_niqqud", "transliteration", "ru"]);
  assert.equal(table.long_theory_policy.includes("NO_CONTENT_COMPRESSION"), true);
  assert.equal(spec.print_outputs.compact_means_fewer_language_columns_not_fewer_solution_rows, true);
  assert.equal(spec.print_outputs.compact_exam_projection, "ALL_AND_ONLY_EXAM_COPY_ROWS_IN_SOURCE_ORDER");
});

test("machine-readable row schema pins source and review truth and supports formulas, tables, diagrams and audio speech", () => {
  const schema = readJson(path.join("schemas", "student-solution-table.schema.json"));
  const required = new Set(schema.required);
  for (const key of ["task_id", "source_anchor", "review", "rows", "render_contract"]) assert.equal(required.has(key), true);
  const row = schema.$defs.row.properties;
  for (const key of ["text", "formulae", "data_table", "diagram_ref", "source_refs", "exam_copy"]) assert.ok(row[key], key);
  const parallel = schema.$defs.parallelText.properties;
  for (const key of ["he", "he_niqqud", "transliteration", "ru", "spoken_he", "spoken_he_niqqud"]) assert.ok(parallel[key], key);
});
