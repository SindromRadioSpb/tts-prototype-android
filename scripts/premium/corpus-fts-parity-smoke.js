#!/usr/bin/env node
"use strict";
// smoke:corpus-fts-parity — BRR-P2-001 the R10 "normaliser drift" guard.
// The build (build-corpus-fts.js) and the client query both go through the SAME corpus-fts.js
// functions; this gate pins their PURE behaviour so a future edit can't silently break recall:
//   • normalizeToken: strip niqqud + fold finals (ך→כ ם→מ ן→נ ף→פ ץ→צ) + lowercase; '' if no Hebrew.
//   • tokenizeText: only Hebrew tokens, niqqud preserved for the lemma resolver.
//   • bucketOf / decodePostings / scoreHits (AND across terms, exact boosted over lemma).
const path = require("path");
const FTS = require(path.resolve(__dirname, "../../public/js/corpus-fts.js"));

let pass = 0, fail = 0;
function eq(got, want, msg) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++; else { fail++; console.error(`FAIL ${msg}: got ${a} want ${b}`); }
}

for (const fn of ["normalizeToken", "tokenizeText", "bucketOf", "decodePostings", "scoreHits"]) {
  if (typeof FTS[fn] !== "function") { console.error("FAIL: corpus-fts." + fn + " not exported"); process.exit(1); }
}

// normalizeToken — niqqud strip + final fold ( end ם→מ) + lowercase
eq(FTS.normalizeToken("שָׁלוֹם"), "שלומ", "niqqud stripped + final ם→מ");
eq(FTS.normalizeToken("מַיִם"), "מימ", "final ם folded → מ");
eq(FTS.normalizeToken("אֶרֶץ"), "ארצ", "final ץ folded → צ");
eq(FTS.normalizeToken("הַמֶּלֶךְ"), "המלכ", "final ך folded → כ");
eq(FTS.normalizeToken("עֶצֶם"), "עצמ", "internal+final fold");
eq(FTS.normalizeToken("hello"), "", "non-Hebrew → ''");
eq(FTS.normalizeToken("  "), "", "blank → ''");
// idempotence: normalising an already-normalised skeleton is a fixed point
eq(FTS.normalizeToken(FTS.normalizeToken("שָׁלוֹם")), "שלומ", "idempotent");

// tokenizeText — Hebrew tokens only, niqqud preserved
eq(FTS.tokenizeText("שלום, עולם! hello 123"), ["שלום", "עולם"], "splits, drops non-Hebrew");
eq(FTS.tokenizeText("הַשַּׁחַר נִדְמֹה").length, 2, "keeps niqqud-bearing tokens");
eq(FTS.tokenizeText(""), [], "empty → []");

// bucketOf — first Hebrew letter
eq(FTS.bucketOf("שלום"), "ש", "bucket = first letter");
eq(FTS.bucketOf("המלכ"), "ה", "bucket ה");

// decodePostings — delta + prefix-sum round-trip
eq(FTS.decodePostings([2, 5, 3, 1, 10, 2]), [{ w: 2, c: 5 }, { w: 5, c: 1 }, { w: 15, c: 2 }], "delta decode");
eq(FTS.decodePostings([]), [], "empty postings");

// scoreHits — AND across terms, exact boosted over lemma-only
const lookups = {
  exact: { "שלום": [{ w: 1, c: 2 }, { w: 3, c: 1 }], "מלכ": [{ w: 1, c: 1 }] },
  lemma: { "מלכ": [{ w: 1, c: 4 }, { w: 2, c: 1 }] },
};
// single term "שלום": works 1 (tf2) & 3 (tf1), exact-boosted
let r = FTS.scoreHits(["שלום"], lookups);
eq(r.map((x) => x.w), [1, 3], "single term ranks by tf");
eq(r[0].exact, 2, "exact tf recorded");
// AND "שלום" + "מלכ": only work 1 has BOTH
r = FTS.scoreHits(["שלום", "מלכ"], lookups);
eq(r.map((x) => x.w), [1], "AND keeps only works hitting every term");
// lemma-only term: "מלכ" via exact(w1) + lemma(w1,w2) → w1 exact (not double-counted), w2 lemma-only
r = FTS.scoreHits(["מלכ"], lookups);
eq(r.find((x) => x.w === 2) ? r.find((x) => x.w === 2).exact : null, 0, "w2 is lemma-only (exact=0)");
eq(FTS.scoreHits([], lookups), [], "no terms → []");

console.log(`smoke:corpus-fts-parity — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
