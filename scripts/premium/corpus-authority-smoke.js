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

// ── Increment 4 — search-qid (scoped-search by identity + L2 collapse) ──────────
const search = JSON.parse(fs.readFileSync(path.join(DATA, "corpus-search-v" + CV + ".json"), "utf8"));
const qRows = search.filter((r) => r.q);
const nodeQids = new Set(nodes.map((n) => n.qid));
test("search rows carry q for ≥85% of works", qRows.length / search.length >= 0.85, (100 * qRows.length / search.length).toFixed(1) + "%");
test("every search q is a real QID (no Q0)", qRows.every((r) => AN.QID_RE.test(r.q)));
test("every search q resolves to an author node", qRows.every((r) => nodeQids.has(r.q)));
// lockstep: re-derive q from the index (era,name join) and assert the shipped search matches
const perEra = {};
for (const era of Object.keys(index.authors || {})) { const m = {}; for (const a of index.authors[era] || []) if (a && a.name && AN.QID_RE.test(a.qid || "")) m[a.name] = a.qid; perEra[era] = m; }
const driftRow = search.find((r) => { const want = (perEra[r.e] || {})[r.a] || null; return (r.q || null) !== want; });
test("shipped search q in lockstep with index (re-run build-search-qid to refresh)", !driftRow, driftRow ? ("id " + driftRow.id) : "");
// INDEPENDENT oracle (not the deriver's index name-join): each work's own author_qid in the era
// manifests. This locks the by-name(header)↔by-qid(L3 list) reconciliation + covers the native
// build-corpus-catalog emit path (c.author_qid), per the oracle-independence norm.
const root = JSON.parse(fs.readFileSync(path.join(DATA, "corpus-catalog-v" + CV + ".json"), "utf8"));
const id2qid = new Map();
for (const m of root.manifests || []) {
  try { const man = JSON.parse(fs.readFileSync(path.join(DATA, m.file), "utf8")); for (const w of man.works || []) if (AN.QID_RE.test(w.author_qid || "")) id2qid.set(String(w.id), w.author_qid); } catch (_) {}
}
const oracleBad = search.find((r) => (r.q || null) !== (id2qid.get(String(r.id)) || null));
test("search q matches manifest author_qid per row (INDEPENDENT oracle)", !oracleBad, oracleBad ? ("id " + oracleBad.id + " q=" + oracleBad.q + " manifest=" + id2qid.get(String(oracleBad.id))) : "");

console.log("\n[corpus-authority] " + passed + "/" + (passed + failed) + " passed");
process.exit(failed ? 1 : 0);
