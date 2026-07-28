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

test("estimatePlainRows: max(строки, символы/100)", () => {
  assert.equal(TC.estimatePlainRows("а\nб\nв"), 3);
  assert.equal(TC.estimatePlainRows("x".repeat(1000)), 10);
  assert.equal(TC.estimatePlainRows("  \n \n"), 0);
});
