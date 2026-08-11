"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const TC = require("../public/js/table-chunks.js");

function segs(n, from) {
  return Array.from({ length: n }, (_, k) => ({ i: (from || 0) + k, text: "s" + ((from || 0) + k) }));
}

test("buildChunks: нарезка по 120, локальный renumber 0..n-1, base глобальный", () => {
  const chunks = TC.buildChunks(segs(300));
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.base), [0, 120, 240]);
  assert.equal(chunks[1].segs.length, 120);
  assert.equal(chunks[2].segs.length, 60);
  assert.deepEqual(chunks[1].segs[0], { i: 0, text: "s120" }); // локальный i, глобальный текст
  assert.equal(TC.buildChunks(segs(120)).length, 1);
});

test("offsetRows: сдвигает только целочисленные segment_index, не мутирует вход", () => {
  const rows = [{ he: "א", segment_index: 0 }, { he: "ב" }, { he: "ג", segment_index: 2 }];
  const out = TC.offsetRows(rows, 120);
  assert.deepEqual(out.map((r) => r.segment_index), [120, undefined, 122]);
  assert.equal(rows[0].segment_index, 0); // вход не тронут
});

test("coverageForChunk + aggregateMissing: локальные пропуски → глобальные", () => {
  const rows = [{ segment_index: 0 }, { segment_index: 0 }, { segment_index: 2 }];
  assert.deepEqual(TC.coverageForChunk(rows, 4), { missing: [1, 3] });
  assert.deepEqual(TC.coverageForChunk([{}, {}], 2), { missing: [0, 1] }); // строки без индексов
  assert.deepEqual(
    TC.aggregateMissing([{ base: 0, missing: [1] }, { base: 120, missing: [0, 5] }]),
    [1, 120, 125]);
});

test("repair plan targets only proven missing segments and restores global indexes", () => {
  const source = segs(8);
  const repairs = TC.buildRepairChunks(source, [6, 2, 6, 99, -1], 2);
  assert.equal(repairs.length, 1);
  assert.deepEqual(repairs[0].indexes, [2, 6]);
  assert.deepEqual(repairs[0].segs, [{ i: 0, text: "s2" }, { i: 1, text: "s6" }]);
  assert.deepEqual(TC.restoreRepairRows([
    { segment_index: 0, he: "two" }, { segment_index: 1, he: "six" },
  ], repairs[0].indexes).map((row) => row.segment_index), [2, 6]);
  assert.deepEqual(TC.coverageForRows([{ segment_index: 0 }, { segment_index: 2 }], 4), {
    covered: 2, missing: [1, 3],
  });
});

test("repair merge is deterministic and does not duplicate an already covered segment", () => {
  const existing = [{ segment_index: 0, he: "zero" }, { segment_index: 2, he: "two" }];
  const repaired = [{ segment_index: 1, he: "one-a" }, { segment_index: 1, he: "one-b" }, { segment_index: 2, he: "duplicate" }];
  assert.deepEqual(TC.mergeRepairRows(existing, repaired).map((row) => [row.segment_index, row.he]), [
    [0, "zero"], [1, "one-a"], [1, "one-b"], [2, "two"],
  ]);
});

test("estimatePlainRows: max(строки, символы/100)", () => {
  assert.equal(TC.estimatePlainRows("а\nб\nв"), 3);
  assert.equal(TC.estimatePlainRows("x".repeat(1000)), 10);
  assert.equal(TC.estimatePlainRows("  \n \n"), 0);
});
