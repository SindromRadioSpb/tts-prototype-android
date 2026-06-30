#!/usr/bin/env node
"use strict";

// build-author-nodes.js — BRR Epic-6 · emit the QID-keyed author-authority sidecar
// (corpus-authors-v<N>.json) from the ALREADY-SHIPPED corpus index + era-map, WITHOUT
// a full 26K CSV rebuild. The node logic is the shared db/premium/authorNodes.js, so
// this standalone path and the native emission inside build-corpus-catalog.js can never
// drift. Additive: slots beside the existing v<N> files; no catalog version bump.
//
// Usage: node scripts/premium/build-author-nodes.js [--dry-run]

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const DATA = path.join(REPO, "public", "data", "benyehuda");
const { buildAuthorNodes, validateAuthorNodes } = require(path.join(REPO, "db", "premium", "authorNodes.js"));

const DRY = process.argv.includes("--dry-run");

// Version = the client's CORPUS_CATALOG_VERSION (single source of truth; a re-publish
// bump is picked up automatically, mirroring corpus-room-smoke).
const CV = (fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8").match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/) || [])[1] || "7";
const indexPath = path.join(DATA, "corpus-index-v" + CV + ".json");
const eraMapPath = path.join(DATA, "author-era-map-v1.json");
const outPath = path.join(DATA, "corpus-authors-v" + CV + ".json");

if (!fs.existsSync(indexPath)) { console.error("[author-nodes] index not found: " + indexPath); process.exit(2); }
if (!fs.existsSync(eraMapPath)) { console.error("[author-nodes] era-map not found: " + eraMapPath); process.exit(2); }

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const eraMap = JSON.parse(fs.readFileSync(eraMapPath, "utf8"));

const nodes = buildAuthorNodes(index.authors || {}, eraMap);
const v = validateAuthorNodes(nodes, index.authors || {});

console.log("[author-nodes] v" + CV + " · " + v.stats.nodes + " nodes / " + v.stats.expected_qids + " QIDs · " +
  v.stats.name_only_rows + " name-only · " + v.stats.q0_or_invalid_rows + " Q0/invalid · " +
  v.stats.dated_nodes + " dated (" + v.stats.dated_pct + "%) · " + v.stats.coauthored_nodes + " co-authored");
if (v.warnings.length) console.log("[author-nodes] warnings: " + v.warnings.length + " (e.g. " + v.warnings.slice(0, 2).join(" | ") + ")");
if (!v.ok) { console.error("[author-nodes] ✗ VALIDATION FAILED — nothing written:"); for (const e of v.errors.slice(0, 20)) console.error("   " + e); process.exit(1); }

const out = {
  schema: 1,
  version: Number(CV),
  generated_from: "corpus-index-v" + CV + " + author-era-map-v1 (authorNodes.js)",
  count: nodes.length,
  authors: nodes,
};
const bytes = Buffer.byteLength(JSON.stringify(out));
console.log("[author-nodes] sidecar " + (bytes / 1024).toFixed(0) + "KB → " + path.relative(REPO, outPath) + (DRY ? " (dry-run)" : ""));
if (DRY) return;
fs.writeFileSync(outPath, JSON.stringify(out));
console.log("[author-nodes] ✓ wrote corpus-authors-v" + CV + ".json");
