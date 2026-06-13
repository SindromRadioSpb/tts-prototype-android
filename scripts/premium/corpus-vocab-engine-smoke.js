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

// strict cfg (old 80–95% / known+learning) for bound-INDEPENDENT logic tests — decoupled from the
// shipped CV.CFG, which is recalibrated to the real profile (70–90% / saved=familiar).
const SC = { ZONE_LO: 0.80, ZONE_HI: 0.95, KNOWN_STATES: { known: true, learning: true } };

// ── 2. classifyZone bounds (explicit cfg) ─────────────────────────────────────
ok(CV.classifyZone(0.79, SC) === "hard", "0.79→hard");
ok(CV.classifyZone(0.80, SC) === "in", "0.80→in (lo inclusive)");
ok(CV.classifyZone(0.94, SC) === "in", "0.94→in");
ok(CV.classifyZone(0.95, SC) === "easy", "0.95→easy (hi inclusive)");
// shipped CV.CFG is the recalibrated config (§7 real-profile)
ok(CV.CFG.ZONE_LO === 0.70 && CV.CFG.ZONE_HI === 0.90, "shipped zone = 70–90% (recalibrated)");
ok(CV.CFG.KNOWN_STATES.new === true && CV.CFG.KNOWN_STATES.known === true, "shipped KNOWN_STATES = saved-as-familiar");

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
r = CV.coverageForWork(work, dict, { "pid:10": "known", "pid:20": "learning" }, SC);
ok(r && approx(r.matchedDrillCov, 0.75), "drill-cov token-weighted 15/20=0.75 (known+learning both count)");
ok(r && approx(r.totalCov, 15 / 25), "totalCov 15/25 over ALL tokens");
ok(r && r.zone === "hard", "0.75 < 0.80 → hard (strict cfg)");
ok(r && r.frontierCount === 2 && r.frontier[0].pid === "30", "frontier = 2 unknowns, most-frequent (pid:30 tok3) first");

// token-weighting proof: knowing the SINGLE highest-token lemma (pid:10 tok10) = 0.50,
// NOT 0.25 (which a type-coverage 1-of-4 would give)
r = CV.coverageForWork(work, dict, { "pid:10": "known" });
ok(r && approx(r.matchedDrillCov, 0.50), "token-weighted: 1 high-freq known → 0.50 not type-0.25");

// strict cfg EXCLUDES 'new'/'weak'; shipped CFG (saved=familiar) INCLUDES them
r = CV.coverageForWork(work, dict, { "pid:10": "new", "pid:20": "weak" }, SC);
ok(r && approx(r.matchedDrillCov, 0), "strict cfg: new/weak are not 'known'");
r = CV.coverageForWork(work, dict, { "pid:10": "new", "pid:20": "weak" });   // shipped CFG
ok(r && approx(r.matchedDrillCov, 0.75), "shipped cfg: saved (new/weak) count as familiar → 15/20");

// in-zone: know everything but the smallest (tok2) → 18/20 = 0.90 → in (strict cfg)
r = CV.coverageForWork(work, dict, { "pid:10": "known", "pid:20": "known", "pid:30": "known" }, SC);
ok(r && approx(r.matchedDrillCov, 0.90) && r.zone === "in", "18/20=0.90 → in-zone (strict cfg)");

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

// ── 5. S4 pickPersonalRail (pure rail decision) ───────────────────────────────
const mkCov = (zone, cov) => ({ zone, matchedDrillCov: cov, knownDistinct: zone === "hard" ? 1 : 5 });
// too-new (all hard) → null
ok(CV.pickPersonalRail([{ id: "a", author: "A", cov: mkCov("hard", .3) }, { id: "b", author: "B", cov: mkCov("hard", .5) }, { id: "c", author: "C", cov: mkCov("hard", .6) }]) === null, "too-new → null");
// 5 in-zone diff authors → next, ranked coverage desc
let pr = CV.pickPersonalRail([
  { id: "a", author: "X", cov: mkCov("in", .82) }, { id: "b", author: "Y", cov: mkCov("in", .93) },
  { id: "c", author: "Z", cov: mkCov("in", .88) }, { id: "d", author: "W", cov: mkCov("in", .85) },
  { id: "e", author: "V", cov: mkCov("in", .90) }, { id: "f", author: "U", cov: mkCov("hard", .5) },
]);
ok(pr && pr.kind === "next", "in-zone≥MIN → next");
ok(pr && pr.ids.length === 5, "next picks all 5 in-zone");
ok(pr && pr.ids[0] === "b" && pr.ids[1] === "e", "next ranked coverage desc (.93,.90 first)");
// author-cap LOGIC (when a cap is set via cfg): 6 same-author in-zone, cap 2 → 2 < MIN → null
const PCAP = { MIN_RAIL: 3, RAIL_TOP: 12, AUTHOR_CAP: 2 };
ok(CV.pickPersonalRail([0, 1, 2, 3, 4, 5].map((i) => ({ id: "s" + i, author: "SAME", cov: mkCov("in", .85) })), PCAP) === null, "cfg AUTHOR_CAP=2: all-same-author → <MIN → null");
// shipped CFG has AUTHOR_CAP=0 (NO cap) → same 6 same-author works all show
pr = CV.pickPersonalRail([0, 1, 2, 3, 4, 5].map((i) => ({ id: "s" + i, author: "SAME", cov: mkCov("in", .85) })));
ok(CV.CFG.AUTHOR_CAP === 0 && pr && pr.kind === "next" && pr.ids.length === 6, "shipped: no author-cap → all 6 in-zone shown");
// outgrown (4 easy, 3 hard, 0 in-zone) → challenge, hardest-closest-first
pr = CV.pickPersonalRail([
  ...["e0", "e1", "e2", "e3"].map((id) => ({ id, author: id, cov: mkCov("easy", .98) })),
  { id: "h0", author: "P", cov: mkCov("hard", .78) }, { id: "h1", author: "Q", cov: mkCov("hard", .60) }, { id: "h2", author: "R", cov: mkCov("hard", .72) },
]);
ok(pr && pr.kind === "challenge", "outgrown → challenge");
ok(pr && pr.ids[0] === "h0" && pr.ids[1] === "h2", "challenge ranked hardest-closest-first (.78,.72)");
ok(pr && pr.ids.length === 3, "challenge picks 3 hard");
// 2 in-zone (<MIN), not outgrown → null
ok(CV.pickPersonalRail([{ id: "i0", author: "A", cov: mkCov("in", .85) }, { id: "i1", author: "B", cov: mkCov("in", .9) }, { id: "h", author: "C", cov: mkCov("hard", .5) }]) === null, "2 in-zone (<MIN), not outgrown → null");
// outgrown but <MIN hard → null (no thin challenge)
ok(CV.pickPersonalRail([...["e0", "e1", "e2", "e3"].map((id) => ({ id, author: id, cov: mkCov("easy", .98) })), { id: "h0", author: "P", cov: mkCov("hard", .7) }, { id: "h1", author: "Q", cov: mkCov("hard", .6) }]) === null, "outgrown but <MIN hard → null");

console.log(`[corpus-vocab-engine-smoke] ${pass} pass / ${fail} fail`);
if (fail) { console.error(`✗ smoke:corpus-vocab-engine FAILED (${fail})`); process.exit(1); }
console.log("✓ smoke:corpus-vocab-engine PASS");
