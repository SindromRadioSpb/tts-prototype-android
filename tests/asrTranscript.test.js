"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const A = require("../public/js/asr-transcript.js");

test("secondsFromTimestamp parses M:SS / H:MM:SS / fractional, rejects junk", () => {
  assert.equal(A.secondsFromTimestamp("0:03"), 3);
  assert.equal(A.secondsFromTimestamp("2:15"), 135);
  assert.equal(A.secondsFromTimestamp("1:02:05"), 3725);
  assert.equal(A.secondsFromTimestamp("0:03.5"), 3.5);
  for (const bad of [null, "", "abc", "1:75", "-1:00", "3", {}, "1:2:3:4"]) {
    assert.equal(A.secondsFromTimestamp(bad), null, String(bad));
  }
});

test("parseAsrResponse strips fences, normalizes, throws ASR_BAD_JSON", () => {
  const raw = '```json\n{"language":"he","segments":[{"start":"0:02","text":" שלום "}],"warnings":[]}\n```';
  const p = A.parseAsrResponse(raw);
  assert.equal(p.language, "he");
  assert.deepEqual(p.segments, [{ start: 2, text: "שלום" }]);
  assert.throws(() => A.parseAsrResponse("not json"), (e) => e.code === "ASR_BAD_JSON");
});

test("validateSegments: keeps texts, nulls bad starts, monotonic filter, thresholds", () => {
  const segs = [
    { start: 1, text: "א" }, { start: 5, text: "ב" }, { start: 3, text: "ג" }, // 3 < 5 → non-monotonic
    { start: 9999, text: "ד" },                                                // за пределами длительности
    { start: 12, text: "ה" },
  ];
  const v = A.validateSegments(segs, 60);
  assert.equal(v.segments.length, 5);                    // тексты не потеряны
  assert.deepEqual(v.segments.map((s) => s.start), [1, 5, null, null, 12]);
  assert.deepEqual(v.segments.map((s) => s.i), [0, 1, 2, 3, 4]);
  assert.equal(v.timingOk, false);                       // 3/5 = 60% < 80%
  assert.equal(v.dropReason, "ASR_TIMING_INVALID");
  const ok = A.validateSegments([{ start: 0, text: "א" }, { start: 4, text: "ב" }, { start: 8, text: "ג" }], 30);
  assert.equal(ok.timingOk, true);
  assert.equal(ok.dropReason, null);
  const late = A.validateSegments([{ start: 95, text: "א" }, { start: 100, text: "ב" }], 200);
  assert.equal(late.timingOk, true);                     // поздний первый сегмент — warning, не провал
  assert.ok(late.warnings.includes("LATE_FIRST_SEGMENT"));
  assert.equal(A.validateSegments([{ start: 1, text: "א" }], 60).timingOk, false); // < 2 валидных
});

test("buildRowTiming: first row per segment, needs >=2 entries", () => {
  const segs = [{ i: 0, start: 0, text: "a" }, { i: 1, start: 5, text: "b" }, { i: 2, start: null, text: "c" }];
  // 5 строк таблицы: сегмент0 → строки 0-1, сегмент1 → строки 2-3, сегмент2 → строка 4
  const t = A.buildRowTiming(segs, [0, 0, 1, 1, 2]);
  assert.deepEqual(t, { v: 1, unit: "row", entries: [{ o: 0, t: 0 }, { o: 2, t: 5 }] });
  assert.equal(A.buildRowTiming(segs, [null, null, null, null, null]), null);
  assert.equal(A.buildRowTiming([{ i: 0, start: 0, text: "a" }], [0]), null); // 1 entry < 2
});

test("estimateAsrCostUsd is positive and roughly linear", () => {
  const one = A.estimateAsrCostUsd(60), twenty = A.estimateAsrCostUsd(1200);
  assert.ok(one > 0 && twenty > one * 15 && twenty < 1); // 20 мин — центы, не доллары
});
