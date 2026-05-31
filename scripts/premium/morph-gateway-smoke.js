#!/usr/bin/env node
// scripts/premium/morph-gateway-smoke.js — Phase B.
//
// Pins the Dicta morphology token parser (no network): the contextual prefix
// segmentation + lemma extraction that fixes the שאין → ש+אין (particle, not
// the root נשא) class of bug. Feeds canned Dicta `addmorph` token shapes
// through dictaMorph._parseToken and asserts the normalized record.

"use strict";

const path = require("path");
const { _parseToken, stripNiqqud } = require(path.resolve(__dirname, "..", "..", "db", "premium", "providers", "dictaMorph"));

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

// Canned Dicta tokens (shape: { word, sep, options: [ [niqqud, [[id, lemma, bool],…]], … ], fconfident }).
const TOK_SHAIN = {
  word: "שאין", sep: false, fconfident: false,
  options: [["שֶׁ|אֵין", [["x1", "אֵין", false], ["x2", "אֵין", false]]]],
};
const TOK_VBORHAT = {
  word: "ובורחת", sep: false, fconfident: false,
  options: [["וּ|בוֹרַחַת", [["y1", "ברח", false], ["y2", "בּוֹרֵחַ", false]]]],
};
const TOK_KESEF = {
  word: "כסף", sep: false, fconfident: true,
  options: [["כֶּסֶף", [["z1", "כֶּסֶף", false]]]],
};

const shain = _parseToken(TOK_SHAIN);
test("Case 1: שאין → prefix ש segmented from the | marker",
     shain.prefix === "ש", JSON.stringify(shain));
test("Case 2: שאין → stem אין, lemma אין (particle, NOT נשא)",
     shain.stem === "אין" && shain.lemma === "אין", JSON.stringify(shain));

const vb = _parseToken(TOK_VBORHAT);
test("Case 3: ובורחת → prefix ו, stem בורחת, lemma ברח",
     vb.prefix === "ו" && vb.stem === "בורחת" && vb.lemma === "ברח", JSON.stringify(vb));

const ke = _parseToken(TOK_KESEF);
test("Case 4: כסף → no prefix, lemma כסף, confident",
     ke.prefix === "" && ke.lemma === "כסף" && ke.confident === true, JSON.stringify(ke));

test("Case 5: stripNiqqud removes points + | but keeps letters",
     stripNiqqud("שֶׁ|אֵין") === "שאין", JSON.stringify({ got: stripNiqqud("שֶׁ|אֵין") }));

test("Case 6: empty / no-options token degrades safely",
     (() => { const r = _parseToken({ word: "x", options: [] }); return r.prefix === "" && r.lemma === ""; })(), "");

console.log(`\n[morph-gateway-smoke] ${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
