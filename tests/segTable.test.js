"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../ingest/segTable.js");

test("validateSegmentsInput: shape, count, index-parity", () => {
  assert.equal(S.validateSegmentsInput([{ i: 0, text: "שלום" }, { i: 1, text: "עולם" }]).ok, true);
  for (const bad of [null, [], "x",
    [{ i: 1, text: "a" }],                       // i != позиции
    [{ i: 0, text: "" }],                        // пустой текст
    [{ i: 0, text: "x".repeat(2001) }],          // слишком длинный
    Array.from({ length: 401 }, (_, k) => ({ i: k, text: "a" })),
  ]) assert.equal(S.validateSegmentsInput(bad).ok, false);
});

test("buildSegInput numbers lines and collapses inner whitespace", () => {
  assert.equal(S.buildSegInput([{ i: 0, text: " שלום  לך " }, { i: 1, text: "טוב" }]), "[0] שלום לך\n[1] טוב");
});

test("HE_RU_SEG_PROMPT embeds input and demands segment_index JSON", () => {
  const p = S.HE_RU_SEG_PROMPT("[0] שלום");
  assert.ok(p.includes("[0] שלום") && p.includes("segment_index") && p.includes("NEVER merge"));
});

test("validateSegMapping: in-range non-decreasing ints", () => {
  assert.equal(S.validateSegMapping([{ segment_index: 0 }, { segment_index: 0 }, { segment_index: 1 }], 2), true);
  assert.equal(S.validateSegMapping([{ segment_index: 1 }, { segment_index: 0 }], 2), false); // убывание
  assert.equal(S.validateSegMapping([{ segment_index: 2 }], 2), false);                        // вне диапазона
  assert.equal(S.validateSegMapping([{}], 1), false);
  assert.equal(S.validateSegMapping([], 1), false);
});

test("segCoverage: full coverage", () => {
  assert.deepEqual(
    S.segCoverage([{ segment_index: 0 }, { segment_index: 1 }, { segment_index: 1 }, { segment_index: 2 }], 3),
    { covered: true, missing: [] }
  );
});

test("segCoverage: one missing segment", () => {
  assert.deepEqual(
    S.segCoverage([{ segment_index: 0 }, { segment_index: 2 }], 3),
    { covered: false, missing: [1] }
  );
});

test("segCoverage: empty rows", () => {
  assert.deepEqual(S.segCoverage([], 3), { covered: false, missing: [0, 1, 2] });
  assert.deepEqual(S.segCoverage([], 0), { covered: true, missing: [] });
  assert.deepEqual(S.segCoverage(null, 2), { covered: false, missing: [0, 1] });
});
