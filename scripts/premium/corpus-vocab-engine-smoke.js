#!/usr/bin/env node
"use strict";
// corpus-vocab-engine-smoke.js — gate `smoke:corpus-vocab-engine` (BRR-P1-007 Slice 2).
// Unit-tests the PURE client coverage engine public/js/corpus-vocab.js against (a) a
// hand-checkable synthetic sidecar and (b) the real in-memory build, with synthetic
// reader profiles. Asserts the two-channel maths, token-weighting, zone bounds, the
// known=known+learning rule, reading-load flag, and honest-null on malformed input.

const path = require("path");
const CV = require("../../public/js/corpus-vocab.js");
const { buildCorpusVocab } = require("./build-corpus-vocab.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const approx = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

// ── 1. reconstructIds (delta → absolute) ──────────────────────────────────────
ok(JSON.stringify(CV.reconstructIds([3, 1, 2, 5])) === JSON.stringify([3, 4, 6, 11]), "reconstructIds delta→abs");
ok(JSON.stringify(CV.reconstructIds([0, 1, 1])) === JSON.stringify([0, 1, 2]), "reconstructIds from 0");

// ── 2. classifyZone bounds ────────────────────────────────────────────────────
ok(CV.classifyZone(0.79) === "hard", "0.79→hard");
ok(CV.classifyZone(0.80) === "in", "0.80→in (lo inclusive)");
ok(CV.classifyZone(0.94) === "in", "0.94→in");
ok(CV.classifyZone(0.95) === "easy", "0.95→easy (hi inclusive)");

// ── 3. synthetic sidecar (hand-checkable) ─────────────────────────────────────
// dict ids: 0=pid:10, 1=pid:20, 2=pid:30, 3=pid:40. One work:
//   matched lemmas (abs ids) 0,1,2,3 with token counts 10,5,3,2 → m=20 matched tokens.
//   n=25 total tokens → 5 fallback tokens (proper nouns/archaic) → fallbackShare=0.20.
const dict = ["10", "20", "30", "40"];
const work = { ids: [0, 1, 1, 1], tok: [10, 5, 3, 2], m: 20, n: 25 };  // ids delta → abs 0,1,2,3

// empty profile → cov 0, all matched are frontier, zone hard
let r = CV.coverageForWork(work, dict, {});
ok(r && approx(r.matchedDrillCov, 0), "empty profile drill-cov 0");
ok(r && r.frontierCount === 4 && r.knownDistinct === 0, "empty profile: all 4 frontier");
ok(r && r.zone === "hard", "empty profile zone hard");
ok(r && approx(r.fallbackShare, 0.20) && r.loadFlag === true, "fallbackShare 0.20 → loadFlag (>0.18)");

// know the two HIGH-token lemmas (pid:10 tok10, pid:20 tok5) → knownTok=15/20=0.75 drill
r = CV.coverageForWork(work, dict, { "pid:10": "known", "pid:20": "learning" });
ok(r && approx(r.matchedDrillCov, 0.75), "drill-cov token-weighted 15/20=0.75 (known+learning both count)");
ok(r && approx(r.totalCov, 15 / 25), "totalCov 15/25 over ALL tokens");
ok(r && r.zone === "hard", "0.75 < 0.80 → hard");
ok(r && r.frontierCount === 2 && r.frontier[0].pid === "30", "frontier = 2 unknowns, most-frequent (pid:30 tok3) first");

// token-weighting proof: knowing the SINGLE highest-token lemma (pid:10 tok10) = 0.50,
// NOT 0.25 (which a type-coverage 1-of-4 would give)
r = CV.coverageForWork(work, dict, { "pid:10": "known" });
ok(r && approx(r.matchedDrillCov, 0.50), "token-weighted: 1 high-freq known → 0.50 not type-0.25");

// 'new'/'weak' do NOT count as known
r = CV.coverageForWork(work, dict, { "pid:10": "new", "pid:20": "weak" });
ok(r && approx(r.matchedDrillCov, 0), "new/weak are not 'known'");

// in-zone: know everything but the smallest (tok2) → 18/20 = 0.90 → in
r = CV.coverageForWork(work, dict, { "pid:10": "known", "pid:20": "known", "pid:30": "known" });
ok(r && approx(r.matchedDrillCov, 0.90) && r.zone === "in", "18/20=0.90 → in-zone");

// malformed → honest null
ok(CV.coverageForWork(null, dict, {}) === null, "null work → null");
ok(CV.coverageForWork({ ids: [99], tok: [1], m: 1, n: 1 }, dict, {}) === null, "out-of-range id → null");

// ── 4. integration on the REAL in-memory sidecar ──────────────────────────────
const { sidecar } = buildCorpusVocab({ quiet: true });
const ids = Object.keys(sidecar.works);
ok(ids.length > 0, "real sidecar has works");
// known = the whole dict → every work fully covered (cov 1, no frontier)
const allKnown = {}; for (const p of sidecar.dict) allKnown["pid:" + p] = "known";
let allOk = true, monotonic = true;
for (const id of ids.slice(0, 200)) {
  const c = CV.coverageForWork(sidecar.works[id], sidecar.dict, allKnown);
  if (!c || !approx(c.matchedDrillCov, 1) || c.frontierCount !== 0) allOk = false;
  if (c && c.totalCov > c.matchedDrillCov + 1e-9) monotonic = false;   // totalCov ≤ drill (n ≥ m)
}
ok(allOk, "real works: full profile → drill-cov 1, 0 frontier");
ok(monotonic, "totalCov ≤ matchedDrillCov (reading-load denominator ≥ learnable)");
// empty profile → drill-cov 0 everywhere
let emptyOk = true;
for (const id of ids.slice(0, 200)) { const c = CV.coverageForWork(sidecar.works[id], sidecar.dict, {}); if (!c || c.matchedDrillCov !== 0) emptyOk = false; }
ok(emptyOk, "real works: empty profile → drill-cov 0");

console.log(`[corpus-vocab-engine-smoke] ${pass} pass / ${fail} fail`);
if (fail) { console.error(`✗ smoke:corpus-vocab-engine FAILED (${fail})`); process.exit(1); }
console.log("✓ smoke:corpus-vocab-engine PASS");
