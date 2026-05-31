#!/usr/bin/env node
// scripts/premium/morphid-decode-smoke.js — Phase ①.
//
// Pins the Dicta morphId bit-decoder against ground-truth morphIds captured
// from the live Nakdan addmorph API (no network here — values are frozen).
// Validates binyan (all 7) + grammatical features (gender/number/person/tense).

"use strict";

const path = require("path");
const { decodeMorphId } = require(path.resolve(__dirname, "..", "..", "db", "premium", "morph", "dictaMorphId"));

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

// [label, morphId, expectedBinyan, expectedFeats]
const CASES = [
  ["paal past 3ms (כתב)",   "2251808825999360",  "paal",    { gender: "m",  number: "sg", person: "3", tense: "past" }],
  ["paal present fs (כותבת)", "2251826142183424", "paal",    { gender: "f",  number: "sg", person: null, tense: "present" }],
  ["paal present mp (כותבים)", "2251826156863488", "paal",   { gender: "m",  number: "pl", person: null, tense: "present" }],
  ["paal future 1s (אכתוב)", "2251834331561984",  "paal",    { gender: "mf", number: "sg", person: "1", tense: "future" }],
  ["nifal (נכנס)",          "4503608639684608",  "nifal",   {}],
  ["hifil (הדליק)",         "6755408453369856",  "hifil",   {}],
  ["hufal (הודלק)",         "9007208267055104",  "hufal",   {}],
  ["piel (דיבר)",           "11259008080740352", "piel",    {}],
  ["pual (סופר)",           "13510807894425600", "pual",    {}],
  ["hitpael (התלבש)",       "15762607708110848", "hitpael", {}],
];

for (const [label, id, expBinyan, expFeats] of CASES) {
  const d = decodeMorphId(id);
  test(`${label}: binyan=${expBinyan}`, d.valid && d.binyan === expBinyan, JSON.stringify(d));
  for (const dim of Object.keys(expFeats)) {
    test(`${label}: ${dim}=${expFeats[dim]}`, d.feats[dim] === expFeats[dim], JSON.stringify(d.feats));
  }
}

// Non-verb / invalid handling
test("zero id → invalid, no binyan", (() => { const d = decodeMorphId("0"); return !d.valid && d.binyan === null; })(), "");
test("garbage id → invalid (no throw)", (() => { const d = decodeMorphId("not-a-number"); return !d.valid; })(), "");
test("BigInt > 2^53 handled (no precision loss)", decodeMorphId("15762607708110848").binyan === "hitpael", "");

console.log(`\n[morphid-decode-smoke] ${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
