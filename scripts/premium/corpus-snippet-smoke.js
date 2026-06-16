#!/usr/bin/env node
"use strict";
// smoke:corpus-snippet — BRR Search-block P0 gate (S1 snippet selection · S2 <mark> · S3 progressive phrase).
// Pure-JS, no browser/DB/network: drives the new corpus-fts.js primitives the result-row snippet,
// query-highlight, and progressive-phrase group depend on.
//   • markSegments  (S2): niqqud-insensitive word-level highlight; lossless re-concatenation (XSS-safe
//                          DOM build); proclitic/substring match (שחר∈שחרור); empty/no-token degrade.
//   • phraseOnlySearch (S3): exact-shard-only phrase hits (NO lemma load) → identical phrase set, painted
//                          before the 6.5MB lemma layer. Injected manifest+shard (no fetch).
//   • firstPhraseRow/firstMatchRow on RAW body rows (S1): the matched line is located on works/<id>.json
//                          rows ({hebrew_niqqud}) exactly as the lazy snippet loader will.
const path = require("path");
const FTS = require(path.resolve(__dirname, "../../public/js/corpus-fts.js"));

let pass = 0, fail = 0;
function ok(cond, msg, extra) { if (cond) { pass++; console.log("  ✓ " + msg); } else { fail++; console.log("  ✗ " + msg + (extra ? " — " + extra : "")); } }
const join = (segs) => segs.map((s) => s.t).join("");
const marked = (segs) => segs.filter((s) => s.m).map((s) => s.t);

async function main() {
  console.log("markSegments (S2 — query highlight):");
  // niqqud-insensitive: query skeleton אהבה marks the voweled display word; re-concatenates losslessly.
  {
    const text = "עַל אַהֲבָה גְּדוֹלָה";
    const toks = FTS.tokenizeText("אהבה").map(FTS.normalizeToken).filter(Boolean);
    const segs = FTS.markSegments(text, toks);
    ok(join(segs) === text, "lossless re-concatenation (== input)", JSON.stringify(join(segs)));
    ok(marked(segs).length === 1 && marked(segs)[0] === "אַהֲבָה", "marks the voweled word that matches the un-voweled query", JSON.stringify(marked(segs)));
  }
  // substring / proclitic: query שחר marks the whole word שחרור (same rule as firstMatchRow).
  {
    const segs = FTS.markSegments("יום שחרור", FTS.tokenizeText("שחר").map(FTS.normalizeToken));
    ok(marked(segs).join("") === "שחרור", "substring query marks the whole containing word (שחר∈שחרור)", JSON.stringify(marked(segs)));
  }
  // final-letter fold: query מלך (skeleton מלכ) marks display מלך.
  {
    const segs = FTS.markSegments("הַמֶּלֶךְ דָּוִד", FTS.tokenizeText("מלך").map(FTS.normalizeToken));
    ok(marked(segs).length === 1 && marked(segs)[0] === "הַמֶּלֶךְ", "final-form fold matches (מלך → המלך), voweled word marked whole", JSON.stringify(marked(segs)));
  }
  // no match → no marks; whole text is one unmarked segment.
  {
    const segs = FTS.markSegments("שלום עולם", FTS.tokenizeText("אהבה").map(FTS.normalizeToken));
    ok(marked(segs).length === 0 && join(segs) === "שלום עולם", "no match → zero marks, text intact");
  }
  // degrade: empty query tokens → single unmarked segment; empty text → [].
  ok(JSON.stringify(FTS.markSegments("שלום", [])) === JSON.stringify([{ t: "שלום", m: false }]), "no query tokens → one unmarked segment");
  ok(JSON.stringify(FTS.markSegments("", ["אהבה"])) === "[]", "empty text → []");
  // Russian (non-Hebrew) snippet side: never marked by a Hebrew query.
  {
    const segs = FTS.markSegments("Любовь великая", FTS.tokenizeText("אהבה").map(FTS.normalizeToken));
    ok(marked(segs).length === 0, "non-Hebrew text is never marked by a Hebrew query");
  }

  console.log("phraseOnlySearch (S3 — exact-shard-only phrase, no lemma):");
  FTS._resetForTest();
  // Inject a positional index WITHOUT any lemma layer: phraseOnlySearch must succeed purely from EXACT
  // shards (proving the «Точная фраза» group can paint before the 6.5MB lemma load).
  FTS._setManifestForTest({ schema: 2, positions: true, sharded_letters: [], bucket_files: { "מ": ["x"], "א": ["x"] } });
  const skMelekh = FTS.normalizeToken("מלך");   // → מלכ (final fold)
  const skAhava = FTS.normalizeToken("אהבה");
  // work 0: מלך@2, אהבה@3 (consecutive → phrase); work 1: מלך@0, אהבה@5 (gap → no phrase).
  FTS._setBucketForTest("מ", { [skMelekh]: [{ w: 0, pos: [2] }, { w: 1, pos: [0] }] });
  FTS._setBucketForTest("א", { [skAhava]: [{ w: 0, pos: [3] }, { w: 1, pos: [5] }] });
  {
    const r = await FTS.phraseOnlySearch("מלך אהבה");
    ok(r.results.length === 1, "exactly one exact-phrase work (adjacency enforced)", "got " + r.results.length);
    ok(r.results[0] && r.results[0].w === 0, "the consecutive work (ordinal 0) is the phrase hit");
    ok(r.results[0] && r.results[0].phraseStart === 2, "phraseStart = first token offset (drill-in target)", String(r.results[0] && r.results[0].phraseStart));
  }
  {
    const r = await FTS.phraseOnlySearch("מלך");           // single token → no phrase group (full search owns it)
    ok(r.results.length === 0, "single-token query → no phrase-only results");
  }
  {
    FTS._setManifestForTest({ schema: 1, positions: false });   // non-positional index → no phrase-only
    const r = await FTS.phraseOnlySearch("מלך אהבה");
    ok(r.results.length === 0, "non-positional manifest → no phrase-only results");
  }
  FTS._resetForTest();

  console.log("phraseSearch exactOnly (S9 — «точная форма» vs «по корню/все формы»):");
  // Inject EXACT (literal form in work 0) + a LEMMA layer (same root, inflected form, in work 1).
  // Default search returns both; exactOnly returns only the literal-form work.
  FTS._setManifestForTest({ schema: 2, positions: true, sharded_letters: [], bucket_files: { "מ": ["x"] } });
  const skM = FTS.normalizeToken("מלך");
  FTS._setBucketForTest("מ", { [skM]: [{ w: 0, pos: [0] }] });        // literal מלך in work 0
  FTS._setLemmaForTest({ "777": [{ w: 1, c: 2 }] }, { [skM]: "777" }); // root pid 777 (e.g. מלכים) in work 1
  {
    const all = await FTS.phraseSearch("מלך");                         // default = по корню / all forms
    const ws = all.results.map((r) => r.w).sort();
    ok(ws.length === 2 && ws[0] === 0 && ws[1] === 1, "default «по корню» returns literal + inflected works", JSON.stringify(ws));
    const ex = await FTS.phraseSearch("מלך", { exactOnly: true });     // S9 «точная форма»
    const wx = ex.results.map((r) => r.w);
    ok(wx.length === 1 && wx[0] === 0, "exactOnly returns ONLY the literal-form work (no lemma expansion)", JSON.stringify(wx));
  }
  FTS._resetForTest();

  console.log("pidForToken (S10 — ground a saved word in the authoritative Pealim pid):");
  FTS._setLemmaMapForTest({ [FTS.normalizeToken("אהבה")]: "777" });
  ok(FTS.pidForToken("אַהֲבָה") === "777", "pidForToken resolves a voweled query to its lemmamap pid (folds via skeleton)");
  ok(FTS.pidForToken("כלבלב") == null, "pidForToken → null for an unmapped token (orphan note avoided honestly)");
  FTS._resetForTest();

  console.log("firstPhraseRow / firstMatchRow on RAW body rows (S1 — snippet line selection):");
  // The lazy snippet loader passes works/<id>.json rows (hebrew_niqqud) straight into these.
  const rows = [
    { row_id: "r0", order_index: 0, hebrew_niqqud: "לְמִרְיָם", russian: "К Мириам" },
    { row_id: "r1", order_index: 1, hebrew_niqqud: "עַל שְׁמֵי חַיַּיִךְ", russian: "По небу жизни твоей" },
    { row_id: "r2", order_index: 2, hebrew_niqqud: "אַהֲבַת נְעוּרַיִךְ", russian: "Любовь юности твоей" },
  ];
  ok(FTS.firstMatchRow(rows, "מרים") === 0, "firstMatchRow finds the line containing the query word (substring למרים∋מרים)");
  ok(FTS.firstMatchRow(rows, "שמי") === 1, "firstMatchRow is niqqud-insensitive on body rows");
  ok(FTS.firstMatchRow(rows, "כלבלב") === -1, "firstMatchRow → -1 when absent (honest: no snippet)");
  ok(FTS.firstPhraseRow(rows, "שמי חייך") === 1, "firstPhraseRow finds the consecutive phrase line");
  ok(FTS.firstPhraseRow(rows, "שמי נעוריך") === -1, "firstPhraseRow → -1 for a non-adjacent pair");

  console.log("\n" + (fail ? "✗ " + fail + " FAILED" : "✓ ALL PASS") + " (" + pass + " checks)");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
