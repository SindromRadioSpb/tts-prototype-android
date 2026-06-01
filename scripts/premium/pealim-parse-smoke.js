"use strict";

// Pealim parser smoke. Offline by default (parses saved fixtures); pass
// --live to also hit www.pealim.com (network-gated, polite single fetches).
//
//   node scripts/premium/pealim-parse-smoke.js
//   node scripts/premium/pealim-parse-smoke.js --live

const fs = require("fs");
const path = require("path");
const P = require("../../db/premium/providers/pealim");

const FX = path.join(__dirname, "fixtures");
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name + (extra ? "  — " + extra : "")); } }

function testVerb() {
  console.log("VERB fixture — לכתוב (paal):");
  const html = fs.readFileSync(path.join(FX, "pealim-verb-lichtov.html"), "utf8");
  const p = P.parsePealimPage(html);
  ok("parsed", !!p);
  if (!p) return;
  ok("kind=verb", p.kind === "verb", p.kind);
  ok("binyan=paal", p.binyan === "paal", p.binyan);
  ok("root=כתב", p.root === "כתב", p.root);
  ok("present AP-ms present", p.cells["AP-ms"] && p.cells["AP-ms"].he === "כּוֹתֵב", p.cells["AP-ms"] && p.cells["AP-ms"].he);
  ok("AP-ms translit", p.cells["AP-ms"] && /котев/i.test(p.cells["AP-ms"].translit), p.cells["AP-ms"] && p.cells["AP-ms"].translit);
  ok("past PERF-3ms = כתב", p.cells["PERF-3ms"] && P.stripNiqqud(p.cells["PERF-3ms"].he) === "כתב", p.cells["PERF-3ms"] && p.cells["PERF-3ms"].he);
  ok("future IMPF-3ms present", !!p.cells["IMPF-3ms"], JSON.stringify(Object.keys(p.cells).filter(k => k.startsWith("IMPF")).slice(0, 4)));
  ok("imperative IMP-2ms present", !!p.cells["IMP-2ms"]);
  ok("infinitive INF-L present", !!p.cells["INF-L"], p.cells["INF-L"] && p.cells["INF-L"].he);
  ok("≥18 cells", Object.keys(p.cells).length >= 18, String(Object.keys(p.cells).length));
  // v2: stress <b> preserved in translit_html; imperative clean (no &rlm;/!).
  ok("AP-ms translit_html has stress span", p.cells["AP-ms"] && /<b class="v3-conj-stress">/.test(p.cells["AP-ms"].translit_html), p.cells["AP-ms"] && p.cells["AP-ms"].translit_html);
  const imp = p.cells["IMP-2ms"] || {};
  ok("IMP-2ms clean (no &rlm;/&/;/!)", !/[&;!]|rlm/i.test(String(imp.he) + String(imp.translit) + String(imp.translit_html)), JSON.stringify(imp));
}

function testNoun() {
  console.log("NOUN fixture — ספר (sefer):");
  const html = fs.readFileSync(path.join(FX, "pealim-noun-sefer.html"), "utf8");
  const p = P.parsePealimPage(html);
  ok("parsed", !!p);
  if (!p) return;
  ok("kind=noun", p.kind === "noun", p.kind);
  ok("pos=noun", p.pos === "noun", p.pos);
  ok("root=ספר", p.root === "ספר", p.root);
  ok("binyan=null", p.binyan === null, String(p.binyan));
  ok("absolute sg 's'", p.cells["s"] && /סֵפֶר/.test(p.cells["s"].he), p.cells["s"] && p.cells["s"].he);
  ok("absolute pl 'p'", !!p.cells["p"], p.cells["p"] && p.cells["p"].he);
  ok("construct sg 'sc'", !!p.cells["sc"], p.cells["sc"] && p.cells["sc"].he);
  ok("construct pl 'pc'", !!p.cells["pc"]);
  ok("possessive s-P-3ms", !!p.cells["s-P-3ms"], p.cells["s-P-3ms"] && p.cells["s-P-3ms"].he);
  ok("possessive p-P-3ms", !!p.cells["p-P-3ms"]);
}

function testSearch() {
  console.log("SEARCH fixture — כתב:");
  const html = fs.readFileSync(path.join(FX, "pealim-search-ktv.html"), "utf8");
  const links = P.parseSearchLinks(html);
  ok("≥1 dict link", links.length >= 1, String(links.length));
  ok("links have numeric id", links.every((l) => /^\d+$/.test(l.id)));
}

function testBinyanMap() {
  console.log("Binyan map (Pealim RU → app):");
  const cases = [["ПААЛЬ", "paal"], ["НИФЪАЛЬ", "nifal"], ["ПИЭЛЬ", "piel"], ["ПУАЛЬ", "pual"], ["hИФЪИЛЬ", "hifil"], ["hУФЪАЛЬ", "hufal"], ["hИТПАЭЛЬ", "hitpael"]];
  for (const [ru, want] of cases) ok(ru + "→" + want, P.pealimBinyanToApp(ru) === want, P.pealimBinyanToApp(ru));
}

async function testLive() {
  console.log("LIVE — resolveLemma(כתב, paal):");
  try {
    const r = await P.resolveLemma("כתב", { pos: "verb", binyan: "paal", root: "כתב" });
    ok("ok", r.ok, r.reason);
    ok("verb kind", r.ok && r.paradigm.kind === "verb");
    ok("disambig match", r.ok && r.paradigm.disambig === "match", r.ok && r.paradigm.disambig);
    ok("has present", r.ok && !!r.paradigm.cells["AP-ms"]);
  } catch (e) { ok("live no throw", false, e.message); }
  // POS-dominant homograph disambiguation: שבת as a NOUN must pick shabat
  // (id 5078), NOT the verb לשבות (id 2139) — both share root שבת. The noun is
  // the 4th search result, so this also guards the candidate-scan depth.
  try {
    const n = await P.resolveLemma("שבת", { pos: "noun", root: "שבת" });
    ok("שבת noun → noun kind", n.ok && n.paradigm.kind === "noun", n.ok && n.paradigm.kind);
    ok("שבת noun → id 5078 (shabat, not 2139 lishbot)", n.ok && String(n.paradigm.pealim_id) === "5078", n.ok && n.paradigm.pealim_id);
    const v = await P.resolveLemma("שבת", { pos: "verb", binyan: "paal", root: "שבת" });
    ok("שבת verb → verb kind id 2139 (lishbot)", v.ok && v.paradigm.kind === "verb" && String(v.paradigm.pealim_id) === "2139", v.ok && (v.paradigm.kind + ":" + v.paradigm.pealim_id));
  } catch (e) { ok("homograph live no throw", false, e.message); }
  // POS audit matrix: content words have a forms table; function words don't
  // (Pealim has no conj-td cells → resolveLemma ok:false). The client gates the
  // accordion by POS so these never reach resolveLemma, but we pin the data fact.
  try {
    console.log("POS audit matrix (live):");
    const content = [["כתב", { pos: "verb", binyan: "paal", root: "כתב" }], ["ספר", { pos: "noun", root: "ספר" }], ["יפה", { pos: "adjective", root: "יפה" }]];
    for (const [w, o] of content) { const r = await P.resolveLemma(w, o); ok("  content " + w + " → has table", r.ok && r.paradigm && Object.keys(r.paradigm.cells).length > 0, r.ok ? "ok" : r.reason); }
    const fn = ["מה", "אז"];         // pronoun/adverb, conjunction/adverb — no inflection
    for (const w of fn) { const r = await P.resolveLemma(w, {}); ok("  function " + w + " → no forms table", !r.ok, r.ok ? "unexpected table" : r.reason); }
    // Prepositions DO decline with pronoun suffixes (P-1s…) → have a table.
    for (const w of ["את", "על"]) { const r = await P.resolveLemma(w, { pos: "preposition" }); ok("  preposition " + w + " → declined table (P-*)", r.ok && r.paradigm && !!r.paradigm.cells["P-1s"], r.ok ? "ok" : r.reason); }
  } catch (e) { ok("pos-matrix live no throw", false, e.message); }
}

(async () => {
  testVerb(); testNoun(); testSearch(); testBinyanMap();
  if (process.argv.includes("--live")) await testLive();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
