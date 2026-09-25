"use strict";

// R2 (UI release program 2026-09-25): on a phone the study table split words mid-word
// («Здравств|уйте», «Огласов|ки»). Cells wrap only between words (a word longer than the cell
// may still break as a last resort); header labels stay on one line and are short.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
const ruleAfter = (css, selector) => {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, "missing rule " + selector);
  return css.slice(start, css.indexOf("}", start));
};

test("shared reader table cells never break inside a word", () => {
  const rule = ruleAfter(read("public/css/reader-core.css"), "#proTable th,\n#proTable td {");
  assert.doesNotMatch(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /word-break:\s*break-(word|all)/);
  assert.match(rule, /overflow-wrap:\s*break-word/, "last resort only for words longer than the cell");
});

test("Studio table cells never break inside a word", () => {
  const rule = ruleAfter(read("public/index.html"), "    th, td {\n        padding: 6px 8px;");
  assert.doesNotMatch(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /word-break:\s*break-(word|all)/);
});

test("table header labels stay on one line in both shells", () => {
  assert.match(read("public/css/reader-core.css"), /#proTable th \{[^}]*white-space:\s*nowrap/);
  assert.match(read("public/index.html"), /#proTable th \{[^}]*white-space:\s*nowrap/);
});

test("column titles are short: no plural «Огласовки», no transliteration profile in the header", () => {
  for (const locale of ["ru", "en", "he"]) {
    const src = read(`public/i18n/locales/${locale}.js`);
    const table = src.slice(src.indexOf("\n  table: {"), src.indexOf("\n  },", src.indexOf("\n  table: {")));
    assert.ok(table.length > 50, `${locale}: table block`);
    assert.doesNotMatch(table, /colNiqqud: "Огласовки"/);
    assert.doesNotMatch(table, /colTranslitSbl: "[^"]*\(SBL\)"/, `${locale}: SBL belongs to the Аа profile, not the header`);
  }
});
