#!/usr/bin/env node
"use strict";
// proclitic-segment-smoke.js — BRR Phase-3 gate `smoke:reader-proclitic`.
//
// The do-no-harm gate for the proclitic-on-tap detector (public/js/proclitic-segment.js). It is
// HERMETIC + deterministic (no live Dicta): it replays the FROZEN R1 gold (human verdicts,
// independent of Dicta) + the FROZEN Dicta overlay fixture (build-proclitic-overlay.js
// --gold-fixture). "diffs = bugs". Runs in Node against the shipped 9279-paradigm dataset.
//
// R11/R10 invariants asserted:
//   1. HARD-NEGATIVE zero-tolerance — the classic traps (בית משה מורה ביחוד …) NEVER segment,
//      even offline (no overlay). Fabricating a prefix on a root letter is the cardinal sin.
//   2. CONFIDENT existence-precision == 100% (≥99 do-no-harm) — 0 confident FP on the whole gold.
//   3. per-category existence floors (names ≥99.5 · content ≥97 · fossil/vav ≥99 …).
//   4. core-labeled-seg ≥95 (article-agnostic full segmentation on confirmed rows).
//   5. article sub-mark never a FALSE POSITIVE on a confident row (R1: a reconstructed article
//      is a niqqud-derived hint, never asserted where the gold has none).
//   6. split-rejoin parity — every verdict is proclitic letters that PREFIX the word skeleton.
//   7. niqqud-absent abstains from the fused article (the article is niqqud-licensed only).
//   8. additive purity — detect() never mutates its inputs (the render adds a chip-row, never
//      touches the stem analysis; byte-parity of the stem reading is smoke:reader-parity's job).
//   9. abstain-rate band — confident recall within a band (catches recall-chasing that would
//      erode precision) and offline-only recall floor (catches a dead detector).
//  10. oracle-independence — the gold builder and the detector share NO module (a self-consistent
//      bug can't pass both); the gate scores the FROZEN human gold, never re-derives it.
//
// Run: node scripts/premium/proclitic-segment-smoke.js   (npm run smoke:reader-proclitic)

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const PS = require(path.join(REPO, "public", "js", "proclitic-segment.js"));
const RM = require(path.join(REPO, "public", "js", "reader-morph.js"));
const GOLD_F = path.join(REPO, "docs", "research", "epic-proclitic-phase2", "2026-07-01", "gold-frozen.json");
const FIX_F = path.join(REPO, "docs", "research", "epic-proclitic-phase2", "2026-07-01", "overlay-fixture.json");
const DICT = path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz");

let FAIL = 0, PASS = 0;
const ok = (cond, msg) => { if (cond) { PASS++; } else { FAIL++; console.log("  ✗ " + msg); } };
const section = (t) => console.log("\n── " + t + " ──");

// ── load fixtures + build the lexicon (single source: reader-morph gazetteers) ──
// Includes the SHIPPED corpus-attested-words vocab (committed .gz) when present, so the gate
// measures exactly what production runs — a future re-baked vocab that introduced a confident FP
// would fail assert #2. Hermetic: the artifact is committed, not read from the .tmp Dicta cache.
const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(DICT)).toString("utf8"));
let attested = null;
try { attested = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "corpus-attested-words-v1.json.gz"))).toString("utf8")); } catch (_) { attested = null; }
const lex = PS.buildLexicon(ds.paradigms, {
  names: Object.keys(RM.NAME_PROPER), func: Object.keys(RM.FUNCTION_GLOSS),
  attested: attested ? { content: attested.content, nominal: attested.nominal } : null,
});
const gold = JSON.parse(fs.readFileSync(GOLD_F, "utf8")).gold;
const fixture = JSON.parse(fs.readFileSync(FIX_F, "utf8")).fixture;
const core = (v) => v.replace(/ה/g, "");   // article-agnostic core (ה is always the article among proclitics)

console.log("proclitic-segment-smoke — gold=" + gold.length + " rows, fixture=" + Object.keys(fixture).length + " entries");

// ── 1. HARD-NEGATIVE zero-tolerance (offline, no overlay) ──────────────────────
section("1. hard-negative zero-tolerance (offline — no overlay)");
// Curated classic traps: a leading proclitic letter that is actually a ROOT / name / lexicalized
// letter. These must abstain even without Dicta. (With niqqud, as a learner would tap them.)
const HARD_NEG = [
  ["בית", "בַּיִת"],
  ["ביחוד", "בְּיִחוּד"], ["באמת", "בֶּאֱמֶת"], ["בעצם", "בְּעֶצֶם"], ["בכלל", "בִּכְלָל"], ["בערך", "בְּעֵרֶךְ"],
  ["מיכה", "מִיכָה"], ["משה", "מֹשֶׁה"], ["מרים", "מִרְיָם"], ["לאה", "לֵאָה"], ["לבן", "לָבָן"],
  ["מים", "מַיִם"], ["שמן", "שֶׁמֶן"], ["כלב", "כֶּלֶב"], ["מורה", "מוֹרֶה"],
  ["כדי", "כְּדֵי"], ["לפי", "לְפִי"], ["מפני", "מִפְּנֵי"], ["כמו", "כְּמוֹ"], ["כאשר", "כַּאֲשֶׁר"], ["לכן", "לָכֵן"],
];
for (const [surf, niq] of HARD_NEG) {
  const d = PS.detect(surf, niq, { lex });                 // NO overlay — must hold offline
  ok(!d.hasProclitic, "hard-negative '" + surf + "' must NOT segment offline (got '" + d.verdict + "' via " + d.source + ")");
}

// ── 2/3/4/5. gold-driven precision (offline vs FSA+overlay) ────────────────────
function run(useOverlay) {
  let exTP = 0, exFP = 0, exFN = 0, cTP = 0, cFP = 0, coreOK = 0, coreN = 0, artFP = 0;
  const byCat = {}, cFPlist = [], catFPlist = [];
  for (const g of gold) {
    const ov = useOverlay ? (fixture[String(g.id)] || null) : null;
    const d = PS.detect(g.surface, g.niqqud, { lex, overlay: ov });
    const gH = g.has_proclitic, dH = d.hasProclitic;
    (byCat[g.stratum] = byCat[g.stratum] || { tp: 0, fp: 0 });
    if (dH && d.confident) { if (gH) cTP++; else { cFP++; cFPlist.push(g.surface + "→" + d.verdict); } }
    if (gH && dH) {
      exTP++; byCat[g.stratum].tp++; coreN++;
      if (core(d.verdict) === core(g.verdict)) coreOK++;
      if (!g.verdict.includes("ה") && d.verdict.includes("ה") && d.confident) artFP++;   // confident spurious article
    } else if (!gH && dH) { exFP++; byCat[g.stratum].fp++; if (d.confident) catFPlist.push(g.surface); }
    else if (gH && !dH) exFN++;
  }
  return { exTP, exFP, exFN, cTP, cFP, coreOK, coreN, artFP, byCat, cFPlist, recall: exTP / (exTP + exFN) };
}
const off = run(false), on = run(true);

section("2. confident existence-precision == 100% (≥99 do-no-harm)");
const cPrec = on.cTP + on.cFP ? on.cTP / (on.cTP + on.cFP) : 1;
ok(cPrec >= 0.99, "confident existence-precision " + (100 * cPrec).toFixed(1) + "% < 99% (FPs: " + on.cFPlist.join(", ") + ")");
ok(on.cFP === 0, "confident existence FPs must be 0 (got " + on.cFP + ": " + on.cFPlist.join(", ") + ")");
console.log("  confident: TP" + on.cTP + " FP" + on.cFP + " → " + (100 * cPrec).toFixed(1) + "%");

section("3. per-category existence-precision floors (FSA+overlay)");
const FLOOR = { "name-suspect": 0.995, content: 0.97, other: 0.97, fossil: 0.99, "vav-consecutive": 0.99, archaic: 0.97 };
for (const cat of Object.keys(on.byCat)) {
  const b = on.byCat[cat], p = (b.tp + b.fp) ? b.tp / (b.tp + b.fp) : 1, fl = FLOOR[cat];
  if (fl != null) ok(p + 1e-9 >= fl, "category '" + cat + "' precision " + (100 * p).toFixed(1) + "% < " + (100 * fl) + "% (tp" + b.tp + " fp" + b.fp + ")");
  console.log("  " + cat.padEnd(16) + (100 * p).toFixed(1) + "% (tp" + b.tp + " fp" + b.fp + ")");
}

section("4/5. core-labeled-seg ≥95 + no confident article FALSE POSITIVE");
const corePrec = on.coreN ? on.coreOK / on.coreN : 1;
ok(corePrec >= 0.95, "core-labeled-seg " + (100 * corePrec).toFixed(1) + "% < 95% (" + on.coreOK + "/" + on.coreN + ")");
ok(on.artFP === 0, "confident article false-positives must be 0 (got " + on.artFP + ")");
console.log("  core-labeled-seg " + (100 * corePrec).toFixed(1) + "%  · confident article FP " + on.artFP);

// ── 6. split-rejoin parity ──────────────────────────────────────────────────────
section("6. split-rejoin parity (verdict letters PREFIX the word skeleton)");
let rejoinBad = 0;
for (const g of gold) {
  const d = PS.detect(g.surface, g.niqqud, { lex, overlay: fixture[String(g.id)] || null });
  if (!d.hasProclitic) continue;
  const sk = PS.skeleton(g.surface);
  // every segment letter is a proclitic letter; the WRITTEN (non-fused) prefix is a prefix of sk.
  const written = d.segments.filter((s) => !s.fused).map((s) => s.letter).join("");
  const allProc = d.segments.every((s) => s.letter.split("").every((c) => PS.PROCLITIC_LETTERS[c]));
  if (!allProc || (written && sk.slice(0, written.length) !== written)) { rejoinBad++; if (rejoinBad <= 5) console.log("    ✗ " + g.surface + " verdict=" + d.verdict + " written=" + written); }
}
ok(rejoinBad === 0, rejoinBad + " rows fail split-rejoin parity");

// ── 7. niqqud-absent abstains from the fused article ───────────────────────────
section("7. niqqud-absent → no reconstructed (fused) article");
// Same word with vs without niqqud: the un-vocalized form must not invent a fused article.
let fusedNoNiqqud = 0;
for (const g of gold) {
  if (!g.verdict.includes("ה") || g.niqqud === g.surface) continue;
  const d = PS.detect(g.surface, PS.stripNiqqud(g.niqqud), { lex, overlay: fixture[String(g.id)] || null });
  if (d.segments.some((s) => s.fused)) { fusedNoNiqqud++; if (fusedNoNiqqud <= 5) console.log("    ✗ " + g.surface + " invented a fused article with no niqqud"); }
}
ok(fusedNoNiqqud === 0, fusedNoNiqqud + " rows reconstruct a fused article WITHOUT niqqud (must be niqqud-licensed)");

// ── 8. additive purity — detect() does not mutate its inputs ───────────────────
section("8. additive purity (detect is pure — no input mutation, deterministic)");
{
  const surf = "בבית", niq = "בַּבַּיִת", snap = niq;
  const ov = { pre: "ב", pn: false }, ovSnap = JSON.stringify(ov);
  const a = PS.detect(surf, niq, { lex, overlay: ov });
  const b = PS.detect(surf, niq, { lex, overlay: ov });
  ok(niq === snap && JSON.stringify(ov) === ovSnap, "detect() mutated its inputs");
  ok(JSON.stringify(a) === JSON.stringify(b), "detect() is not deterministic");
}

// ── 9. abstain-rate band + offline-tier precision (recall/precision guardrails) ─
section("9. recall band + offline-tier precision (catch recall-chasing / a dead detector)");
console.log("  offline recall " + (100 * off.recall).toFixed(1) + "%  ·  +overlay recall " + (100 * on.recall).toFixed(1) + "%");
ok(off.recall >= 0.15, "offline recall " + (100 * off.recall).toFixed(1) + "% < 15% floor — detector may be dead");
ok(off.recall <= 0.45, "offline recall " + (100 * off.recall).toFixed(1) + "% > 45% ceiling — offline recall-chasing (the FSA lexicon/rules loosened; verify precision)");
const offPrec = (off.exTP + off.exFP) ? off.exTP / (off.exTP + off.exFP) : 1;
console.log("  offline-only existence-precision " + (100 * offPrec).toFixed(1) + "% (hedged tier, un-baked works)");
ok(offPrec >= 0.90, "offline-only precision " + (100 * offPrec).toFixed(1) + "% < 90% — the hedged tier over-segments");

// ── 11. over-peel ZERO-TOLERANCE — written prefix ⊆ gold verdict (cardinal sin) ─
section("11. over-peel zero-tolerance — written prefix never exceeds the gold verdict");
// The gate's own do-no-harm claim: peeling a root/binyan letter as a proclitic is the cardinal
// sin. Existence-precision counts «ו»→«ומ» as a TRUE POSITIVE (both have a proclitic), so it is
// invisible there; assert directly that the WRITTEN (non-fused) prefix is a prefix of the gold
// verdict on EVERY row — the detector may under-claim vs the human gold, never over-peel past it.
let overPeel = 0;
for (const g of gold) {
  if (!g.has_proclitic) continue;
  const d = PS.detect(g.surface, g.niqqud, { lex, overlay: fixture[String(g.id)] || null });
  if (!d.hasProclitic) continue;
  const written = d.segments.filter((s) => !s.fused).map((s) => s.letter).join("");
  if (written && g.verdict.indexOf(written) !== 0) { overPeel++; if (overPeel <= 8) console.log("    ✗ " + g.surface + " written '" + written + "' ⊄ gold '" + g.verdict + "'"); }
}
ok(overPeel === 0, overPeel + " rows over-peel past the gold verdict (a root/binyan letter labeled a proclitic)");

// ── 12. morpheme-label hard-negatives (fabricated article / narrative-vav / interrogative) ─
section("12. morpheme-label hard-negatives (0 gold rows exercise these — curated tripwire)");
const LABEL_NEG = [
  { s: "כזה", n: "כָּזֶה", ov: { pre: "כ" }, bad: (d) => d.segments.some((x) => x.kind === "article"), why: "כ+demonstrative must NOT reconstruct a definite article" },
  { s: "כאלה", n: "כָּאֵלֶּה", ov: { pre: "כ" }, bad: (d) => d.segments.some((x) => x.kind === "article"), why: "כ+demonstrative must NOT reconstruct an article" },
  { s: "לעשות", n: "לַעֲשׂוֹת", ov: { pre: "ל" }, bad: (d) => d.segments.some((x) => x.kind === "article"), why: "ל+infinitive must NOT reconstruct an article" },
  { s: "הידעת", n: "הֲיָדַעְתָּ", ov: { pre: "ה", v: true }, bad: (d) => d.segments.some((x) => x.kind === "article"), why: "interrogative הֲ must NOT be labeled the definite article" },
  { s: "ועבודה", n: "וַעֲבוֹדָה", ov: { pre: "ו", v: false }, bad: (d) => d.segments.some((x) => x.kind === "conj-narrative"), why: "conjunctive vav on a noun (no verb evidence) must NOT be «narrative vav»" },
];
for (const c of LABEL_NEG) {
  const d = PS.detect(c.s, c.n, { lex, overlay: c.ov });
  ok(!c.bad(d), "label-negative '" + c.s + "': " + c.why + " (kinds " + JSON.stringify(d.segments.map((x) => x.kind)) + ")");
}

// ── 13. no FOSSIL_LIST entry suppresses a real gold proclitic ───────────────────
section("13. fossil-collision — no FOSSIL_LIST skeleton is a has-proclitic gold surface");
const fossilSet = new Set(PS.FOSSIL_LIST.map(PS.skeleton));
let fossilCollide = 0;
for (const g of gold) {
  if (g.has_proclitic && fossilSet.has(PS.skeleton(g.surface))) { fossilCollide++; console.log("    ✗ fossil '" + g.surface + "' but gold verdict '" + g.verdict + "'"); }
}
ok(fossilCollide === 0, fossilCollide + " FOSSIL_LIST entries confidently suppress a real gold proclitic");

// ── 10. oracle-independence (structural) ───────────────────────────────────────
section("10. oracle-independence (gold builder ⟂ detector; no shared derivation)");
{
  const builder = fs.readFileSync(path.join(REPO, "scripts", "premium", "build-proclitic-gold.js"), "utf8");
  ok(!/require\(['"].*proclitic-segment/.test(builder), "gold builder must NOT import the detector (would make the gold self-consistent with the code under test)");
  ok(/verdict/.test(JSON.stringify(gold[0])), "gold must carry FROZEN human verdicts (not re-derived at gate time)");
}

// ── summary ─────────────────────────────────────────────────────────────────────
console.log("\n" + (FAIL ? "✗ FAIL" : "✓ PASS") + " — " + PASS + " assertions passed, " + FAIL + " failed");
process.exit(FAIL ? 1 : 0);
