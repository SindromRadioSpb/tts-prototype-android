#!/usr/bin/env node
"use strict";

// corpus-editorial-smoke.js — BRR Epic-6 · curated editorial namespace + precedence guard.
// Pure Node. Validates the committed (currently empty) store AND fixture-tests the
// build-once mechanism so the contract is proven before any content is authored:
//   • validateEditorial rejects a non-QID author key, a non-string field, an
//     untitled collection-with-items; WARNS on curated text with no `curator` (R9)
//   • mergeAuthorNode: curated era/display WIN over derived (prov flipped to
//     'curated'); editorial slots attach with source='curated'; absent slots
//     self-hide; the input node is never mutated
//   • resolveField precedence curated > asserted > derived with honest source tags
//   • applyEditorialToAuthors is a no-op on the empty store (premium at 0% coverage)

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const DATA = path.join(REPO, "public", "data", "benyehuda");
const ED = require(path.join(REPO, "db", "premium", "editorialMeta.js"));

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); } }

console.log("corpus-editorial: curated namespace honesty gate + precedence merge (build-once home)");

// ── the committed store validates and is honest (empty until authored) ─────────
const store = ED.normalizeEditorial(JSON.parse(fs.readFileSync(path.join(DATA, "corpus-editorial-v1.json"), "utf8")));
const v = ED.validateEditorial(store);
test("committed corpus-editorial-v1.json validates (ok)", v.ok, (v.errors[0] || ""));
test("committed store carries curated content with curators (R9 — no anonymous claim)", v.stats.authors > 0 && v.stats.missing_curator === 0, "authors=" + v.stats.authors + " missingCurator=" + v.stats.missing_curator);
// every editorial author QID must resolve to a real author node, or the bio renders nowhere (orphan)
const CV = (fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8").match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/) || [])[1] || "7";
const nodeQids = new Set((JSON.parse(fs.readFileSync(path.join(DATA, "corpus-authors-v" + CV + ".json"), "utf8")).authors || []).map((n) => n.qid));
const orphan = Object.keys(store.authors).find((q) => !nodeQids.has(q));
test("every editorial author QID resolves to an author node (no orphan bio)", !orphan, orphan ? ("orphan " + orphan) : "");

// ── validateEditorial teeth (fixtures) ─────────────────────────────────────────
test("rejects a non-QID author key (must key on a stable identity)", !ED.validateEditorial(ED.normalizeEditorial({ authors: { "ביאליק": { one_line: "x", curator: "y" } } })).ok);
test("rejects the Q0 sentinel as an author key", !ED.validateEditorial(ED.normalizeEditorial({ authors: { Q0: { one_line: "x" } } })).ok);
test("rejects a non-string one_line", !ED.validateEditorial({ schema: 1, version: 1, authors: { Q359705: { one_line: { bad: 1 } } }, works: {}, collections: {} }).ok);
test("rejects a collection with items but no title", !ED.validateEditorial(ED.normalizeEditorial({ collections: { c1: { item_ids: ["10"], curator: "y" } } })).ok);
const noCur = ED.validateEditorial(ED.normalizeEditorial({ authors: { Q359705: { one_line: "поэт национального возрождения" } } }));
test("WARNS on curated text with no curator (R9 evidence), not an error", noCur.ok && noCur.warnings.some((w) => /curator/.test(w)));

// ── precedence guard ───────────────────────────────────────────────────────────
test("resolveField: curated wins", ED.resolveField({ derived: "d", asserted: "a", curated: "c" }).source === "curated");
test("resolveField: asserted beats derived when no curated", (() => { const r = ED.resolveField({ derived: "d", asserted: "a" }); return r.source === "asserted" && r.value === "a"; })());
test("resolveField: derived as last resort", ED.resolveField({ derived: "d" }).source === "derived");
test("resolveField: all-null → null source", ED.resolveField({}).source === null);

// ── mergeAuthorNode ─────────────────────────────────────────────────────────────
const baseNode = { qid: "Q359705", display: "חיים נחמן ביאליק", era: "tehiya", birth: 1873, death: 1934, works: 507, prov: { era: "derived", dates: "derived", identity: "asserted" } };
const frozen = JSON.stringify(baseNode);
const merged = ED.mergeAuthorNode(baseNode, ED.normalizeAuthorEntry({ one_line: "поэт национального возрождения", entry_points: ["101"], era: "mandate", curator: "owner" }));
test("merge attaches editorial slots with source='curated' + curator", merged.editorial && merged.editorial.one_line && merged.editorial.source === "curated" && merged.editorial.curator === "owner");
test("merge: curated era WINS over derived (prov flipped to 'curated')", merged.era === "mandate" && merged.prov.era === "curated");
test("merge: entry_points carried", Array.isArray(merged.editorial.entry_points) && merged.editorial.entry_points[0] === "101");
test("merge does NOT mutate the input node (pure)", JSON.stringify(baseNode) === frozen);
test("merge with no entry → node unchanged", ED.mergeAuthorNode(baseNode, null) === baseNode);
const partial = ED.mergeAuthorNode(baseNode, ED.normalizeAuthorEntry({ one_line: "x", curator: "owner" }));
test("merge honest-null: absent bio/entry_points not attached", partial.editorial && !("bio_md" in partial.editorial) && !("entry_points" in partial.editorial));

// ── applyEditorialToAuthors no-op on empty store ───────────────────────────────
const nodes = [baseNode, { qid: "Q467161", display: "שמואל הנגיד", era: "medieval", works: 1857, prov: { era: "derived", identity: "asserted" } }];
test("applyEditorialToAuthors is a no-op on an EMPTY store", JSON.stringify(ED.applyEditorialToAuthors(nodes, ED.normalizeEditorial({}))) === JSON.stringify(nodes));
const applied = ED.applyEditorialToAuthors(nodes, ED.normalizeEditorial({ authors: { Q359705: { one_line: "x", curator: "o" } } }));
test("applyEditorialToAuthors merges only the matching QID", applied[0].editorial && !applied[1].editorial);

console.log("\n[corpus-editorial] " + passed + "/" + (passed + failed) + " passed");
process.exit(failed ? 1 : 0);
