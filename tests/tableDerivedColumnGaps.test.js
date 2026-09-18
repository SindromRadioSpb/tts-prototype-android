// tests/tableDerivedColumnGaps.test.js — a chunk may return every ROW and still drop the
// derived columns on some of them. Coverage must name that, not render it silently.
//
// Regression (2026-09-18, live, 617-row card): rows 373, 385, 386, 401, 406, 436, 438, 440
// and 459 — all inside one chunk — came back with Hebrew and translation present but niqqud
// and translit empty. coverageForRows() saw every segment_index answered, so the build
// reported success and the user was never told which rows lost two columns.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const TableChunks = require(path.join(root, "public/js/table-chunks.js"));
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

const full = (i) => ({ segment_index: i, he: "שלום", ru: "мир", niqqud: "שָׁלוֹם", translit: "shalom" });

test("a fully answered chunk reports no derived-column gaps", () => {
  const gaps = TableChunks.derivedColumnGaps([full(0), full(1), full(2)]);
  assert.deepEqual(gaps.niqqud, []);
  assert.deepEqual(gaps.translit, []);
  assert.equal(gaps.rows.length, 0);
});

test("rows that kept Hebrew and translation but lost niqqud and translit are named", () => {
  const rows = [full(0), { segment_index: 1, he: "שלום", ru: "мир", niqqud: "", translit: "" }, full(2)];
  const gaps = TableChunks.derivedColumnGaps(rows);
  assert.deepEqual(gaps.niqqud, [1]);
  assert.deepEqual(gaps.translit, [1]);
  assert.deepEqual(gaps.rows, [1], "one row lost both columns, and it is counted once");
});

test("the renderer's field aliases are not reported as gaps", () => {
  // The table reads `row.he_niqqud || row.niqqud` and `row.translit || row.transliteration`.
  // An oracle that only knew the primary names would invent gaps on every aliased row.
  const rows = [{ segment_index: 0, he: "שלום", ru: "мир", he_niqqud: "שָׁלוֹם", transliteration: "shalom" }];
  const gaps = TableChunks.derivedColumnGaps(rows);
  assert.deepEqual(gaps.niqqud, []);
  assert.deepEqual(gaps.translit, []);
});

test("a row with no Hebrew of its own is not owed derived columns", () => {
  const rows = [{ segment_index: 0, he: "— 1998 —", ru: "— 1998 —", niqqud: "", translit: "" }];
  assert.deepEqual(TableChunks.derivedColumnGaps(rows).rows, []);
});

test("a missing row is the other oracle's business, not this one's", () => {
  // Gaps are about columns on rows that DID land; absent rows stay with coverageForRows.
  const gaps = TableChunks.derivedColumnGaps([full(0), full(2)]);
  assert.deepEqual(gaps.rows, []);
});

test("the build names a partial-column result instead of rendering it silently", () => {
  assert.match(html, /derivedColumnGaps\(/, "the build must consult the column oracle");
  assert.match(html, /SEG_COLUMNS_PARTIAL/, "the gap needs a named warning of its own");
  assert.match(html, /studio\.import\.warnColumns/, "and a user-visible message");
});

test("the partial-column message exists in every locale", () => {
  for (const locale of ["ru", "en", "he"]) {
    const source = fs.readFileSync(path.join(root, "public/i18n/locales", `${locale}.js`), "utf8");
    // Locale files nest their keys, so the dotted path never appears literally: the entry
    // lives as `warnColumns:` beside `warnCoverage:` under studio.import.
    assert.match(source, /warnColumns:\s*"[^"]*\{count\}[^"]*"/,
      `${locale} is missing studio.import.warnColumns (with a {count} placeholder)`);
  }
});
