"use strict";
// Regression coverage for the W2-S4 Task 6 review-round-1 Critical finding:
// buildRowsFromGeminiPayload's legacy segMap/segIndex lookup is 1-based
// ("index <= 0 -> idx + 1" normalization) and silently collides on 0-based
// segment_index 0 (both segment 0 and segment 1 normalize to key 1),
// corrupting row 0's he with segment 1's text. The fix bypasses the segMap
// lookup entirely when opts.keepSegmentIndex is set (seg-mode), taking heBase
// directly from the row's own "he" field. This file locks in both:
//   (a) the seg-mode fix (0-based, no collision), and
//   (b) byte-identical legacy behavior (1-based, segMap fallback) with no opts.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRowsFromGeminiPayload,
  validateHebrewSourceCoverage,
} = require("../ingest/tableRows.js");

test("seg-mode (opts.keepSegmentIndex): row 0 gets its OWN segment's he, not segment 1's (reviewer's repro)", () => {
  const parsed = {
    segments: [
      { index: 0, he: "שלום" },
      { index: 1, he: "עולם" },
      { index: 2, he: "טוב" },
    ],
    rows: [
      { segment_index: 0, he: "שלום", he_niqqud: "שָׁלוֹם", translit: "shalom", ru: "привет" },
      { segment_index: 1, he: "עולם", he_niqqud: "עוֹלָם", translit: "olam", ru: "мир" },
      { segment_index: 2, he: "טוב", he_niqqud: "טוֹב", translit: "tov", ru: "хорошо" },
    ],
  };

  const rows = buildRowsFromGeminiPayload(parsed, { direction: "he-ru" }, { keepSegmentIndex: true });

  assert.equal(rows.length, 3);
  // The exact reviewer repro: row 0's he must be segment 0's he ("שלום"), never
  // segment 1's ("עולם") — the old code returned "עולם" here due to the 1-based
  // collision described above.
  assert.equal(rows[0].he, "שלום");
  assert.equal(rows[1].he, "עולם");
  assert.equal(rows[2].he, "טוב");

  // segment_index passthrough must survive (opted-in), and every row's he must
  // match its OWN declared segment_index — not some neighbor's.
  const expectedHeBySegIndex = { 0: "שלום", 1: "עולם", 2: "טוב" };
  rows.forEach((r, i) => {
    assert.equal(r.segment_index, i);
    assert.equal(r.he, expectedHeBySegIndex[r.segment_index]);
  });
});

test("legacy mode (no opts): byte-identical to the pre-fix behavior — 1-based segMap fallback, no segment_index on output", () => {
  // Old-shape payload: segments indexed 1..n (as the legacy HE_RU_PROMPT/
  // ANY_HE_PROMPT prompts require), one row with an empty he relying on the
  // segMap fallback (exactly the pre-existing fallback path this task must
  // NOT alter).
  const parsed = {
    segments: [
      { index: 1, he: "אחד" },
      { index: 2, he: "שתיים" },
    ],
    rows: [
      { segment_index: 1, he: "", he_niqqud: "אֶחָד", translit: "echad", ru: "один" },
      { segment_index: 2, he: "שתיים", he_niqqud: "שְׁתַּיִם", translit: "shtayim", ru: "два" },
    ],
  };

  const rows = buildRowsFromGeminiPayload(parsed, { direction: "he-ru" });

  assert.equal(rows.length, 2);
  // row 0's he is empty in the raw payload -> must fall back to segMap.get(1).
  assert.equal(rows[0].he, "אחד");
  assert.equal(rows[1].he, "שתיים");

  // Legacy path: no opts passed -> no segment_index leaks onto output rows.
  rows.forEach((r) => {
    assert.equal(Object.prototype.hasOwnProperty.call(r, "segment_index"), false);
  });

  // segmentId (internal, pre-existing) still reflects the 1-based segment_index.
  assert.equal(rows[0].segmentId, 1);
  assert.equal(rows[1].segmentId, 2);
});

test("niqqud allows full/defective spelling but may not change the consonantal word", () => {
  const good = {
    segments: [{ index: 1, he: 'אופנוע נוסע 72 קמ"ש.' }],
    rows: [{ segment_index: 1, he: 'אופנוע נוסע 72 קמ"ש.', he_niqqud: 'אוֹפַנּוֹעַ נוֹסֵעַ 72 קמ"ש.', translit: "ofanua", ru: "мотоцикл" }],
  };
  const rows = buildRowsFromGeminiPayload(good, { direction: "he-ru" });
  assert.equal(rows.length, 1);
  validateHebrewSourceCoverage(rows, 'אופנוע נוסע 72 קמ"ש.');

  const defectiveSpelling = {
    segments: [{ index: 1, he: 'שתיים ואופקי' }],
    rows: [{ segment_index: 1, he: 'שתיים ואופקי', he_niqqud: 'שְׁתַּיִם וְאָפְקִי', translit: "shtayim ve-ofki", ru: "два и горизонтальный" }],
  };
  assert.equal(buildRowsFromGeminiPayload(defectiveSpelling, { direction: "he-ru" }).length, 1);

  const changedConsonant = {
    segments: [{ index: 1, he: 'שווה תאוצה' }],
    rows: [{ segment_index: 1, he: 'שווה תאוצה', he_niqqud: 'שְׁוַת תְּאוּצָה', translit: "shvat te'utsa", ru: "равноускоренное" }],
  };
  assert.throws(
    () => buildRowsFromGeminiPayload(changedConsonant, { direction: "he-ru" }),
    (error) => error && error.code === "HE_NIQQUD_CONSONANT_MISMATCH",
  );
});

test("source coverage rejects dropped or rewritten Hebrew before cache publication", () => {
  assert.throws(
    () => validateHebrewSourceCoverage([{ he: "בנקודה N עוזב הרכב" }], "בנקודה N מאיץ הנהג את הרכב"),
    (error) => error && error.code === "HE_SOURCE_COVERAGE_MISMATCH",
  );
});
