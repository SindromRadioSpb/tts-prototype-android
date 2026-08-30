"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  determineBoundary,
  isSolutionHeading,
  normalizeText,
  rowSimilarity
} = require("../scripts/premium/materials-pb2-solution-recon");

function canonical(id, text, kind = "condition") {
  return {
    row_id: id,
    hebrew_plain: text,
    meta: { materials_science: { kind } }
  };
}

function legacy(text, ru = "") {
  return { he_plain: text, ru };
}

test("normalization removes niqqud but preserves formula symbols as comparable words", () => {
  assert.equal(normalizeText("הַמַּאֲמָץ σ = F / A"), "המאמץ σ f a");
  assert.ok(rowSimilarity("הַמַּאֲמָץ שווה לכוח חלקי שטח", "המאמץ שווה לכוח חלקי שטח") > 0.99);
});

test("explicit Hebrew or Russian solution headings are authoritative boundaries", () => {
  assert.equal(isSolutionHeading(legacy("פִּתְרוֹן", "Решение")), true);
  const result = determineBoundary(
    [canonical("r1", "מהו החומר")],
    [legacy("שאלה 1"), legacy("מהו החומר"), legacy("פתרון", "Решение"), legacy("החומר הוא פלדה")]
  );
  assert.equal(result.status, "BOUNDARY_ACCEPTED");
  assert.equal(result.method, "EXPLICIT_SOLUTION_HEADING");
  assert.equal(result.solution_start_offset, 3);
});

test("high-coverage monotonic condition alignment accepts the first solution row", () => {
  const result = determineBoundary(
    [
      canonical("h", "שאלה 4", "task_heading"),
      canonical("r1", "חשב את המאמץ במוט"),
      canonical("r2", "השווה בין התוצאות")
    ],
    [
      legacy("4"),
      legacy("שאלה 4"),
      legacy("חשב את המאמץ במוט"),
      legacy("השווה בין התוצאות"),
      legacy("המאמץ מוגדר כיחס בין כוח לשטח")
    ]
  );
  assert.equal(result.status, "BOUNDARY_ACCEPTED");
  assert.equal(result.method, "CANONICAL_SEQUENCE_ALIGNMENT");
  assert.equal(result.solution_start_offset, 4);
});

test("weak or tail-incomplete alignment never asserts candidate solution rows", () => {
  const result = determineBoundary(
    [canonical("r1", "חשב את מודול האלסטיות"), canonical("r2", "נמק את הבחירה")],
    [legacy("נתונים אחרים"), legacy("תשובה אפשרית ארוכה")]
  );
  assert.equal(result.status, "BOUNDARY_REVIEW_REQUIRED");
  assert.equal(result.solution_start_offset, null);
});
