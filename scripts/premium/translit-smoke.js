#!/usr/bin/env node
"use strict";
// smoke:translit — BRR-S18 reverse-transliteration gate. Tests the fold (phonetic skeleton — must stay
// parity with the client foldCyrLib) + buildIndex (alignment, MIN_COUNT, clean Hebrew, top-K ranking).
const path = require("path");
const T = require(path.resolve(__dirname, "build-translit-index.js"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m + (x ? " — " + x : "")); } };

console.log("foldCyr (phonetic skeleton — PARITY with client foldCyrLib):");
ok(T.foldCyr("шалом") === "шалом", "plain word unchanged");
ok(T.foldCyr("Шалом!") === "шалом", "lowercase + strip non-cyrillic");
ok(T.foldCyr("лэмирйам") === T.foldCyr("лемирйам"), "э → е (typed-spelling variance)");
ok(T.foldCyr("аввв") === "ав", "collapse doubles");
ok(T.foldCyr("боль") === "бол" && T.foldCyr("болъ") === "бол", "drop soft/hard signs");
ok(T.foldCyr("shalom") === "", "non-cyrillic → empty (latin handled separately)");

console.log("cleanHeb (strip punctuation, keep letters + maqaf):");
ok(T.cleanHeb("שלום,") === "שלום", "trailing comma stripped");
ok(T.cleanHeb('"מלך') === "מלך", "leading quote stripped");
ok(T.cleanHeb("זר-העדנים") === "זר-העדנים", "internal hyphen kept");
ok(T.cleanHeb("...") === "", "punctuation-only → empty");

console.log("buildIndex (alignment · MIN_COUNT · clean · top-K):");
const rows = [
  { hebrew_plain: "שלום עולם", translit_ru: "шалом олам" },
  { hebrew_plain: "שלום, אדם", translit_ru: "шалом, адам" },   // punctuation on both; aligns 2:2
  { hebrew_plain: "שלום", translit_ru: "шалом" },
  { hebrew_plain: "אדם", translit_ru: "адам" },
  { hebrew_plain: "א ב ג", translit_ru: "a b" },                // length mismatch → skipped
];
const built = T.buildIndex(rows);
ok(built.mismatched === 1, "length-mismatched row counted, not paired", "mismatched=" + built.mismatched);
ok(Array.isArray(built.cyr["шалом"]) && built.cyr["шалом"][0] === "שלום", "«шалом» → שלום (clean, freq-ranked)", JSON.stringify(built.cyr["шалом"]));
ok(built.cyr["адам"] && built.cyr["адам"][0] === "אדם", "«адам» → אדם (count 2 ≥ MIN_COUNT)");
ok(built.cyr["олам"] === undefined, "hapax «олам» (count 1) dropped by MIN_COUNT");
ok(!Object.keys(built.cyr).some((k) => built.cyr[k].some((h) => /[,"]/.test(h))), "no punctuation leaks into any candidate");

console.log("\n" + (fail ? "✗ " + fail + " FAILED" : "✓ ALL PASS") + " (" + pass + " checks)");
process.exit(fail ? 1 : 0);
