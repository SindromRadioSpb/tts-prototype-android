#!/usr/bin/env node
"use strict";

// corpus-authority-smoke.js — BRR Epic-6 · authority-consistency gate (R6/R9).
// Pure Node (no browser/OPFS). Asserts the QID-keyed author-node contract on the
// SHIPPED data + that the committed sidecar is in lockstep with the builder (so a
// re-publish can't silently fragment an identity or drop a curated value later).
//   • one node per real QID; Q0/malformed NEVER becomes a node
//   • the measured 14-QID fragmentation is collapsed (one human = one node)
//   • life-dates are promoted from the era-map (≥90% coverage), both-or-neither
//   • the shipped corpus-authors-v<N>.json deep-equals a fresh build (no drift)
//   • the validator itself rejects a planted Q0 node and a duplicate (gate teeth)

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const DATA = path.join(REPO, "public", "data", "benyehuda");
const AN = require(path.join(REPO, "db", "premium", "authorNodes.js"));

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); } }

const CV = (fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8").match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/) || [])[1] || "7";
const index = JSON.parse(fs.readFileSync(path.join(DATA, "corpus-index-v" + CV + ".json"), "utf8"));
const eraMap = JSON.parse(fs.readFileSync(path.join(DATA, "author-era-map-v1.json"), "utf8"));

console.log("corpus-authority: QID author-node identity + Q0-exclusion + fragmentation-collapse + date-promotion + lockstep (v" + CV + ")");

const nodes = AN.buildAuthorNodes(index.authors || {}, eraMap);
const v = AN.validateAuthorNodes(nodes, index.authors || {});

// ── core contract ─────────────────────────────────────────────────────────────
test("validateAuthorNodes → ok (0 errors)", v.ok, (v.errors[0] || ""));
test("node count == distinct valid QIDs", v.stats.nodes === v.stats.expected_qids, v.stats.nodes + " vs " + v.stats.expected_qids);
test("no Q0 / malformed node (the 7-human merge bug stays fixed)", nodes.every((n) => AN.QID_RE.test(n.qid)) && !nodes.some((n) => n.qid === "Q0"));
test("no duplicate node for a QID (fragmentation collapsed)", new Set(nodes.map((n) => n.qid)).size === nodes.length);
test("every node has display + variants + works>0 + refs", nodes.every((n) => n.display && n.name_variants.length && n.works > 0 && n.refs.length));
test("Q0/invalid index rows were excluded (measured 7)", v.stats.q0_or_invalid_rows >= 1, "got " + v.stats.q0_or_invalid_rows);
test("name-only rows excluded (stay name-keyed, honest)", v.stats.name_only_rows > 0 && nodes.length < v.stats.index_rows);

// ── date promotion (the discarded richness, now surfaced) ──────────────────────
test("life-dates promoted for ≥90% of nodes", v.stats.dated_pct >= 90, v.stats.dated_pct + "%");
test("no node has death < birth", !nodes.some((n) => n.birth != null && n.death != null && Number(n.death) < Number(n.birth)));
test("fully-dated nodes carry date_source + prov.dates='derived' (R9)", nodes.filter((n) => n.birth != null && n.death != null).every((n) => !!n.date_source && n.prov.dates === "derived"));
test("half-dated nodes still carry date_source + prov.dates='partial' (R9)", nodes.filter((n) => (n.birth == null) !== (n.death == null)).every((n) => !!n.date_source && n.prov.dates === "partial"));
test("every node carries honest per-field prov (identity asserted)", nodes.every((n) => n.prov && n.prov.identity === "asserted"));
test("no node display is a co-author composite (primary derived for all-composite)", !nodes.some((n) => /;/.test(n.display)));

// ── fragmentation-collapse, deterministic case (Bialik = solo + co-author row) ──
const bialik = nodes.find((n) => n.qid === "Q359705");
test("Bialik (Q359705) is ONE node", !!bialik && new Set(nodes.filter((n) => n.qid === "Q359705")).size === 1, bialik ? "found" : "missing");
test("Bialik display is the solo name, composite kept as variant", !!bialik && bialik.display === "חיים נחמן ביאליק" && bialik.coauthored === true && bialik.name_variants.length >= 2, bialik ? bialik.display : "");
test("Bialik has promoted life-dates", !!bialik && bialik.birth != null && bialik.death != null && Number(bialik.death) > Number(bialik.birth));

// ── lockstep: the shipped sidecar must equal a fresh build (no drift) ──────────
const shippedPath = path.join(DATA, "corpus-authors-v" + CV + ".json");
test("shipped corpus-authors-v" + CV + ".json exists", fs.existsSync(shippedPath));
if (fs.existsSync(shippedPath)) {
  const shipped = JSON.parse(fs.readFileSync(shippedPath, "utf8"));
  test("shipped sidecar deep-equals fresh build (run build-author-nodes to refresh)", JSON.stringify(shipped.authors) === JSON.stringify(nodes), "drift: re-run `node scripts/premium/build-author-nodes.js`");
  test("shipped sidecar count matches", shipped.count === nodes.length);
}

// ── gate teeth: the validator must REJECT a planted Q0 node and a duplicate ─────
const planted = AN.validateAuthorNodes(nodes.concat([{ qid: "Q0", display: "x", name_variants: ["x"], works: 1, refs: [{ era: "unknown", block: null }] }]), index.authors || {});
test("validator rejects a planted Q0 node", !planted.ok && planted.errors.some((e) => /Q0|Wikidata QID/.test(e)));
const dup = AN.validateAuthorNodes(nodes.concat([nodes[0]]), index.authors || {});
test("validator rejects a duplicate node", !dup.ok && dup.errors.some((e) => /duplicate|count/.test(e)));
// independent-oracle teeth: a self-consistent aggregation bug (passes lockstep) must still fail validate
const tw = AN.validateAuthorNodes(nodes.map((n, i) => (i === 0 ? { ...n, works: n.works + 1 } : n)), index.authors || {});
test("validator catches a tampered works count (independent oracle, HIGH-1)", !tw.ok && tw.errors.some((e) => /works .* ≠ index sum/.test(e)));
const trf = AN.validateAuthorNodes(nodes.map((n, i) => (i === 0 ? { ...n, refs: [{ era: "zzz", block: null }] } : n)), index.authors || {});
test("validator catches a wrong refs set", !trf.ok && trf.errors.some((e) => /refs ≠ index/.test(e)));

console.log("\n[corpus-authority] " + passed + "/" + (passed + failed) + " passed");
process.exit(failed ? 1 : 0);
