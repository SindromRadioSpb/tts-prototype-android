"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const SI = require("../public/js/studio-import.js"); // node-ветка dual-export
const A = require("../public/js/asr-transcript.js");

function fakeParse(raw) { return JSON.parse(raw); }
function seg(start, text) { return { start, text }; }
const R = (o) => JSON.stringify(Object.assign({ language: "he", warnings: [] }, o));

test("короткий файл (одно окно): transcribe вызывается с null-диапазоном, plain-путь", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 150,
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: [seg(1, "א"), seg(5, "ב")] }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null]]); // без range — байт-в-байт прежний промт
  assert.equal(res.segments.length, 2);
  assert.deepEqual(res.coverageGaps, []);
});

test("два окна: последовательность, merge, прогресс, язык/warnings агрегируются", async () => {
  const calls = [], progress = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000,
    transcribe: async (a, b) => {
      calls.push([a, b]);
      return a === 0 ? R({ segments: [seg(820, "א"), seg(890, "ב")], warnings: ["PARTIALLY_UNCLEAR"] })
                     : R({ segments: [seg(905, "ג"), seg(975, "ד")] });
    },
    parse: fakeParse, onProgress: (k, m) => progress.push([k, m]),
  });
  assert.deepEqual(calls, [[0, 900], [900, 1000]]);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.deepEqual(res.segments.map((s) => s.start), [820, 890, 905, 975]);
  assert.deepEqual(res.warnings, ["PARTIALLY_UNCLEAR"]);
  assert.equal(res.language, "he");
});

test("BAD_JSON окна: retry ×1 и успех; счётчик retries в windows", async () => {
  let first = true;
  const res = await SI.runWindowedAsr({
    durationSec: 150,
    transcribe: async () => {
      if (first) { first = false; return "мусор"; }
      return R({ segments: [seg(1, "א"), seg(2, "ב")] });
    },
    parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                      return fakeParse(raw); },
    onProgress: () => {},
  });
  assert.equal(res.windows[0].retries, 1);
  assert.equal(res.segments.length, 2);
});

test("BAD_JSON дважды: throw c windowIndex и частичными windowSegments", async () => {
  await assert.rejects(
    SI.runWindowedAsr({
      durationSec: 1400,
      transcribe: async (a) => {
        if (a === 0) return R({ segments: [seg(1, "א"), seg(2, "б")] });
        return "мусор";
      },
      parse: (raw) => { if (raw === "мусор") { const e = new Error("bad"); e.code = "ASR_BAD_JSON"; throw e; }
                        return fakeParse(raw); },
      onProgress: () => {},
    }),
    (e) => e.code === "ASR_BAD_JSON" && e.windowIndex === 1 && e.windowSegments.length === 1);
});

test("резюм: startWindow/priorWindows продолжают без повторного вызова готовых окон", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, startWindow: 1,
    priorWindows: [[seg(850, "א"), seg(870, "б")]],
    transcribe: async (a, b) => { calls.push([a, b]); return R({ segments: [seg(905, "ג")] }); },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[900, 1000]]);
  assert.deepEqual(res.segments.map((s) => s.text), ["א", "б", "ג"]);
});

test("дыра >90с внутри → добор range-вызовом ровно дыры; merge упорядочен; healedGaps в провенанс", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 300, // одно окно
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === null) return R({ segments: [seg(10, "א"), seg(200, "ב"), seg(230, "ג")] }); // дыра 10→200
      return R({ segments: [seg(90, "д1"), seg(150, "д2")] }); // добор
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[null, null], [10, 200]]);
  assert.deepEqual(res.segments.map((s) => s.start), [10, 90, 150, 200, 230]);
  assert.deepEqual(res.healedGaps, [{ fromSec: 10, toSec: 200 }]);
  assert.deepEqual(res.coverageGaps, []); // после добора дыр нет
});

test("остаточная дыра после добора → coverageGaps + warning ASR_COVERAGE_GAP, максимум 3 добора", async () => {
  let healCalls = 0;
  const res = await SI.runWindowedAsr({
    durationSec: 300,
    transcribe: async (a) => {
      if (a === null) return R({ segments: [seg(10, "א"), seg(200, "ב"), seg(230, "ג")] });
      healCalls++;
      return R({ segments: [], warnings: ["NO_SPEECH"] }); // добор ничего не нашёл
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.equal(healCalls, 1); // на одну дыру — один добор, не цикл
  assert.deepEqual(res.coverageGaps, [{ fromSec: 10, toSec: 200 }]);
  assert.ok(res.warnings.includes("ASR_COVERAGE_GAP"));
});

test("все окна пустые → NO_SPEECH в warnings, segments []", async () => {
  const res = await SI.runWindowedAsr({
    durationSec: 1200,
    transcribe: async () => R({ language: null, segments: [], warnings: ["NO_SPEECH"] }),
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(res.segments, []);
  assert.ok(res.warnings.includes("NO_SPEECH"));
});

// fix1 (ревью после T3, R11-порядок): null-start сегмент возникает у немонотонного стыка окон
// (mergeWindowSegments честно обнуляет start, когда следующий сегмент раньше предыдущего по
// времени) — и такой сегмент может структурно стоять ПОСЛЕ дыры, которую добираем. Позиционная
// (по индексу) вставка добора обязана оставить его там же, а не тянуть перед heal-вставкой
// только из-за null-значения start. Арифметика дыр здесь проверена прямыми вызовами
// mergeWindowSegments/findCoverageGaps ДО фиксации фикстуры (см. журнал сессии) — тем же
// приёмом, что и при перемасштабировании остальных тестов файла.
test("null-start сегмент ПОСЛЕ дыры не переезжает при доборе (позиционная вставка, не по start)", async () => {
  const calls = [];
  const res = await SI.runWindowedAsr({
    durationSec: 1000, // 2 окна: [0,900) и [900,1000)
    transcribe: async (a, b) => {
      calls.push([a, b]);
      if (a === 0) return R({ segments: [seg(10, "a"), seg(890, "b")] }); // окно0: дыра 10→890
      if (a === 900) return R({ segments: [seg(950, "c"), seg(5, "d")] }); // окно1: 5<950 → "d" немонотонен → start:null после merge
      return R({ segments: [seg(100, "h1"), seg(400, "h2")] }); // добор дыры (10,890)
    },
    parse: fakeParse, onProgress: () => {},
  });
  assert.deepEqual(calls, [[0, 900], [900, 1000], [10, 890]]);
  // (а) порядок текстов: heal-сегменты встают СРАЗУ ПОСЛЕ границы дыры (10), "d" остаётся на
  // своей структурной позиции — последним, после "c", а не перед heal-вставкой.
  assert.deepEqual(res.segments.map((s) => s.text), ["a", "h1", "h2", "b", "c", "d"]);
  // (б) null-start сегмент физически последний и после heal-сегментов, не между "a" и heal.
  const dIdx = res.segments.findIndex((s) => s.text === "d");
  assert.equal(dIdx, res.segments.length - 1);
  assert.equal(res.segments[dIdx].start, null);
  assert.deepEqual(res.healedGaps, [{ fromSec: 10, toSec: 890 }]);
});
