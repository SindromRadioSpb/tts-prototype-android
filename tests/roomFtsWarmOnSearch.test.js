"use strict";
// O-023 (owner-approved 2026-09-27): the always-needed FTS layer grew from ~6.5 MB to ~26 MB of
// JSON. Warming it on every Room load cost memory on phones for users who never search. It now
// warms when the corpus search field gains focus or the first query is typed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ui = fs.readFileSync(path.join(__dirname, "..", "public", "js", "library-ui.js"), "utf8");

test("Room load no longer warms the FTS lemma layer", () => {
  const catalog = ui.slice(ui.indexOf("async function loadCorpusCatalog()"), ui.indexOf("async function loadCorpusCatalog()") + 2500);
  assert.doesNotMatch(catalog, /CorpusFTS\.warm\(\)/);
  assert.doesNotMatch(catalog, /warmFtsForSearch\(/);
});

test("the search field warms the layer on focus and on the first query", () => {
  assert.match(ui, /function warmFtsForSearch\(\) \{[\s\S]{0,300}window\.CorpusFTS\.warm\(\)/);
  assert.match(ui, /corpusSearchInputEl\.addEventListener\('focus', warmFtsForSearch/);
  const onChange = ui.slice(ui.indexOf("if (key === 'q') {"), ui.indexOf("if (key === 'q') {") + 300);
  assert.match(onChange, /warmFtsForSearch\(\)/);
  assert.equal((ui.match(/CorpusFTS\.warm\(\)/g) || []).length, 1, "warm() is reached only through warmFtsForSearch");
});
