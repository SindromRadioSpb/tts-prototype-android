// tests/tableChunkRestitch.test.js — a chunk must return the row skeleton it was given.
//
// Regression (2026-09-18, live, 617-row card): the last chunk was handed 10 segments and
// returned 17 rows. offsetRows() shifted whatever local segment_index the model chose, and
// coverageForRows() drops any index >= the segment count, so the seven extras were ignored
// and the build reported success. No text was lost — the concatenation still matched the
// draft exactly — but the row skeleton silently changed, and SRS state, notes and word
// status all hang off that skeleton.
//
// The repair is structural, never a prompt: rows are re-joined to the input segments by
// TEXT, and the join is only accepted when it reproduces the input character for character.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const TableChunks = require(path.join(root, "public/js/table-chunks.js"));
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

const segs = [{ i: 0, text: "שלום עולם" }, { i: 1, text: "מה נשמע" }];

test("a chunk that honoured the skeleton passes through untouched", () => {
  const rows = [
    { segment_index: 0, he: "שלום עולם", ru: "мир" },
    { segment_index: 1, he: "מה נשמע", ru: "как дела" },
  ];
  const out = TableChunks.restitchChunkRows(rows, segs);
  assert.equal(out.ok, true);
  assert.deepEqual(out.merged, []);
  assert.deepEqual(out.rows.map((r) => r.he), ["שלום עולם", "מה נשמע"]);
});

test("a segment the model split into two rows is joined back into one", () => {
  const rows = [
    { segment_index: 0, he: "שלום", ru: "привет" },
    { segment_index: 1, he: "עולם", ru: "мир" },
    { segment_index: 2, he: "מה נשמע", ru: "как дела" },
  ];
  const out = TableChunks.restitchChunkRows(rows, segs);
  assert.equal(out.ok, true);
  assert.deepEqual(out.merged, [0], "segment 0 consumed two rows");
  assert.equal(out.rows.length, 2, "the skeleton it was given is the skeleton it returns");
  assert.equal(out.rows[0].he, "שלום עולם", "the joined row carries the INPUT text verbatim");
  assert.deepEqual(out.rows.map((r) => r.segment_index), [0, 1], "indexes are re-derived, not trusted");
});

test("the split pieces' derived columns survive the join in order", () => {
  const rows = [
    { segment_index: 0, he: "שלום", ru: "привет", niqqud: "שָׁלוֹם", translit: "shalom" },
    { segment_index: 1, he: "עולם", ru: "мир", niqqud: "עוֹלָם", translit: "olam" },
    { segment_index: 2, he: "מה נשמע", ru: "как дела" },
  ];
  const out = TableChunks.restitchChunkRows(rows, segs);
  assert.equal(out.rows[0].ru, "привет мир");
  assert.equal(out.rows[0].niqqud, "שָׁלוֹם עוֹלָם");
  assert.equal(out.rows[0].translit, "shalom olam");
});

test("out-of-range indexes are re-joined by text, exactly as the live defect produced them", () => {
  // The model numbered its extras past the end of the chunk it was given.
  const rows = [
    { segment_index: 0, he: "שלום", ru: "привет" },
    { segment_index: 7, he: "עולם", ru: "мир" },
    { segment_index: 8, he: "מה נשמע", ru: "как дела" },
  ];
  const out = TableChunks.restitchChunkRows(rows, segs);
  assert.equal(out.ok, true);
  assert.deepEqual(out.merged, [0]);
  assert.deepEqual(out.rows.map((r) => r.he), ["שלום עולם", "מה נשמע"]);
});

test("a join that does not reproduce the input is refused, not guessed", () => {
  const rows = [
    { segment_index: 0, he: "שלום", ru: "привет" },
    { segment_index: 1, he: "חברים", ru: "друзья" },  // not what the input said
    { segment_index: 2, he: "מה נשמע", ru: "как дела" },
  ];
  const out = TableChunks.restitchChunkRows(rows, segs);
  assert.equal(out.ok, false);
  assert.match(String(out.reason), /TEXT/, "the refusal names why");
});

test("a chunk that dropped text outright is refused rather than silently shortened", () => {
  const rows = [{ segment_index: 0, he: "שלום", ru: "привет" }];
  const out = TableChunks.restitchChunkRows(rows, segs);
  assert.equal(out.ok, false);
});

test("niqqud and spacing differences never block a join that is really the same text", () => {
  const rows = [
    { segment_index: 0, he: "שָׁלוֹם", ru: "привет" },
    { segment_index: 1, he: "  עולם ", ru: "мир" },
    { segment_index: 2, he: "מה נשמע", ru: "как дела" },
  ];
  const out = TableChunks.restitchChunkRows(rows, segs);
  assert.equal(out.ok, true);
  assert.equal(out.rows[0].he, "שלום עולם", "the input spelling wins over the model's");
});

test("the seg-mode build restitches and names it, and leaves the premium path alone", () => {
  assert.match(html, /restitchChunkRows\(/, "the seg-mode build must re-join split rows");
  assert.match(html, /SEG_ROWS_RESTITCHED/, "a changed skeleton is named, not swallowed");
  assert.match(html, /studio\.import\.warnRestitched/, "and it reaches the user");
  // translate-table-v2 legitimately splits a segment into sentences (sentence_index), so the
  // gate must not be applied there.
  assert.doesNotMatch(html, /translate-table-v2[\s\S]{0,400}restitchChunkRows\(/,
    "the premium sentence split must not be re-joined");
});

test("the restitch message exists in every locale", () => {
  for (const locale of ["ru", "en", "he"]) {
    const source = fs.readFileSync(path.join(root, "public/i18n/locales", `${locale}.js`), "utf8");
    assert.match(source, /warnRestitched:\s*"[^"]*\{count\}[^"]*"/,
      `${locale} is missing studio.import.warnRestitched (with a {count} placeholder)`);
  }
});
