// tests/mediaHost.test.js — общий паспорт-пайплайн медиа (spec 2026-08-04, Room media player).
// Pure-часть тестируется в Node против РЕАЛЬНОГО AsrTranscript (независимый оракул выравнивания).
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const MH = require("../public/js/media-host.js");
const AT = require("../public/js/asr-transcript.js");

const deps = { AT, appVersion: "test" };

test("passport: audio | captions | null", () => {
  assert.equal(MH.passport({ audio: { v: 1 } }).v, 1);
  assert.equal(MH.passport({ captions: { v: 2 } }).v, 2);
  assert.equal(MH.passport({}), null);
  assert.equal(MH.passport(null), null);
});

test("isDerivedTimingDrop", () => {
  assert.equal(MH.isDerivedTimingDrop("NO_SEGMENT_MAPPING"), true);
  assert.equal(MH.isDerivedTimingDrop("SEG_MAPPING_LOST"), true);
  assert.equal(MH.isDerivedTimingDrop("PREVIEW_EDITED"), false);
  assert.equal(MH.isDerivedTimingDrop(null), false);
});

test("clockBlindRanges: filters invalid", () => {
  const a = { asr: { clockCompressedRanges: [{ fromSec: 1, toSec: 5 }, { fromSec: 5, toSec: 5 }, null] } };
  assert.deepEqual(MH.clockBlindRanges(a), [{ fromSec: 1, toSec: 5 }]);
  assert.deepEqual(MH.clockBlindRanges({}), []);
  assert.deepEqual(MH.clockBlindRanges(null), []);
});

test("passportFromTextRow: table_model wins, source_meta only WITH passport", () => {
  const p = { v: 1, media: { opfsPath: "media/x.mp3" } };
  assert.equal(MH.passportFromTextRow({ table_model_meta_json: JSON.stringify({ source: { audio: p } }) }).media.opfsPath, "media/x.mp3");
  assert.equal(MH.passportFromTextRow({ source_meta_json: JSON.stringify({ source: { audio: p } }) }).media.opfsPath, "media/x.mp3");
  // camelCase-варианты колонок (пути импорта отдают их так)
  assert.equal(MH.passportFromTextRow({ tableModelMetaJson: JSON.stringify({ source: { captions: p } }) }).media.opfsPath, "media/x.mp3");
  // корпусная source_meta_json без паспорта — НЕ подхватывается (узкий фолбэк K3)
  assert.equal(MH.passportFromTextRow({ source_meta_json: JSON.stringify({ corpus: { byehuda_id: "1" } }) }), null);
  assert.equal(MH.passportFromTextRow({ table_model_meta_json: "{broken", source_meta_json: "{broken" }), null);
  assert.equal(MH.passportFromTextRow(null), null);
});

// 2 строки ↔ 2 сегмента, тексты пословно совпадают → align сходится, тайминг строится
function freshAudio() {
  return {
    v: 1,
    segments: [
      { i: 0, start: 0, end: 10, text: "שלום עולם" },
      { i: 1, start: 10, end: 20, text: "מה קורה היום" },
    ],
    timing: null,
  };
}
const rows2 = [{ he: "שלום עולם" }, { he: "מה קורה היום" }];

test("restoreForRows: offline align builds timing + provenance", () => {
  const a = freshAudio();
  MH.restoreForRows(a, rows2, deps);
  assert.ok(a.timing && a.timing.entries.length === 2);
  assert.equal(a.timingSource, "aligned-offline");
  assert.equal(a.timingAlign.ok, true);
  assert.equal(a.timingDropReason, null);
});

test("restoreForRows: idempotent — entries reference preserved on 2nd call", () => {
  const a = freshAudio();
  MH.restoreForRows(a, rows2, deps);
  const ref = a.timing.entries;
  MH.restoreForRows(a, rows2, deps);
  assert.equal(a.timing.entries, ref); // строгое ссылочное равенство (контракт karaoke resume)
});

test("restoreForRows: degenerate saved timing is quarantined (K1)", () => {
  // rowCount(5) > segments(3); все записи o === i сегмента → отпечаток DEGENERATE
  const a = {
    v: 1,
    segments: [
      { i: 0, start: 0, text: "אחת" },
      { i: 1, start: 10, text: "שתיים" },
      { i: 2, start: 20, text: "שלוש" },
    ],
    timing: { v: 1, unit: "row", entries: [{ o: 0, t: 0 }, { o: 1, t: 10 }, { o: 2, t: 20 }] },
  };
  const rows5 = [{ he: "x" }, { he: "y" }, { he: "z" }, { he: "w" }, { he: "v" }]; // align не сойдётся
  MH.restoreForRows(a, rows5, deps);
  assert.equal(a.timing, null);
  assert.equal(a.timingDropReason, "SEG_MAPPING_LOST");
  assert.equal(a.timingDropDetail, "DEGENERATE_1_TO_1"); // диагноз K1 первичнее ALIGN_*
  assert.equal(a.timingAlign.ok, false);                 // вердикт выравнивания записан рядом (R9)
});

test("alignSavedTimingOffline: asserted drop reason → untouched", () => {
  const a = freshAudio();
  a.timingDropReason = "PREVIEW_EDITED";
  MH.alignSavedTimingOffline(a, rows2, deps);
  assert.equal(a.timing, null);
  assert.equal(a.timingDropReason, "PREVIEW_EDITED");
});

test("Node export: pure part only (no DOM helpers)", () => {
  assert.equal(typeof MH.passport, "function");
  assert.equal(typeof MH.restoreForRows, "function");
  assert.equal(typeof MH.createStage, "undefined");
  assert.equal(typeof MH.augmentRows, "undefined");
});
