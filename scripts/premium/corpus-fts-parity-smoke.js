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

for (const fn of ["normalizeToken", "tokenizeText", "bucketOf", "decodePostings", "decodePositions", "phraseHit", "scoreHits", "shardKeyFor"]) {
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

// decodePostings — lemma COUNT field `[w0,c0,dw1,c1,…]`, delta + prefix-sum round-trip
eq(FTS.decodePostings([2, 5, 3, 1, 10, 2]), [{ w: 2, c: 5 }, { w: 5, c: 1 }, { w: 15, c: 2 }], "count delta decode");
eq(FTS.decodePostings([]), [], "empty postings");
// decodePositions — exact POSITIONAL field (schema 2): per work [w, n, off0, dΔ…], offsets prefix-summed.
//   work@ord2: 3 offsets [0,5,6]; work@ord5: 1 offset [2]; work@ord15: 2 offsets [0,1]
eq(FTS.decodePositions([2, 3, 0, 5, 1, 3, 1, 2, 10, 2, 0, 1]),
  [{ w: 2, pos: [0, 5, 6] }, { w: 5, pos: [2] }, { w: 15, pos: [0, 1] }], "positions delta decode");
eq(FTS.decodePositions([]), [], "empty positions");

// phraseHit — pure adjacency (slop 0 = consecutive; slop widens the allowed gap)
eq(FTS.phraseHit([[0], [1], [2]], 0).hit, true, "phraseHit consecutive run");
eq(FTS.phraseHit([[0], [2]], 0).hit, false, "phraseHit gap blocks at slop 0");
eq(FTS.phraseHit([[0], [2]], 1).hit, true, "phraseHit gap allowed at slop 1");
eq(FTS.phraseHit([[4], []], 0).hit, false, "phraseHit empty token list → no hit");

// shardKeyFor — BRR-P2-006a: heavy letters (manifest sharded_letters) key by 2-letter prefix,
// light letters by the single first letter, length-1 skeletons by the letter itself.
FTS._setManifestForTest({ sharded_letters: ["ש", "ה"] });
eq(FTS.shardKeyFor("שלומ"), "של", "shardKeyFor heavy len≥2 → 2-letter prefix");
eq(FTS.shardKeyFor("הנופל"), "הנ", "shardKeyFor heavy ה → הנ");
eq(FTS.shardKeyFor("מלכ"), "מ", "shardKeyFor light → single letter");
eq(FTS.shardKeyFor("ש"), "ש", "shardKeyFor heavy length-1 → letter");
FTS._setManifestForTest(null);

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
