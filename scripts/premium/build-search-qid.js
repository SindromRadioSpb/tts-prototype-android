#!/usr/bin/env node
"use strict";

// build-search-qid.js — BRR Epic-6 · add the author QID (`q`) to the SHIPPED corpus-search-v<N>.json
// WITHOUT a full 26K rebuild. Derives q per row by joining (era, author-name) → the index author's
// qid (same firstQid the producer assigned), Q0/malformed omitted. This unblocks scoped-search by
// IDENTITY (and thus the L2 collapse-by-QID). Native emission lives in build-corpus-catalog.js search
// map; this standalone path keeps the shipped v<N> in sync until the next full publish. Idempotent.
//
// Usage: node scripts/premium/build-search-qid.js [--dry-run]

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const DATA = path.join(REPO, "public", "data", "benyehuda");
const { QID_RE } = require(path.join(REPO, "db", "premium", "authorNodes.js"));

const DRY = process.argv.includes("--dry-run");
const CV = (fs.readFileSync(path.join(REPO, "public", "js", "library-ui.js"), "utf8").match(/CORPUS_CATALOG_VERSION\s*=\s*(\d+)/) || [])[1] || "7";
const indexPath = path.join(DATA, "corpus-index-v" + CV + ".json");
const searchPath = path.join(DATA, "corpus-search-v" + CV + ".json");
if (!fs.existsSync(indexPath) || !fs.existsSync(searchPath)) { console.error("[search-qid] index/search not found for v" + CV); process.exit(2); }

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const search = JSON.parse(fs.readFileSync(searchPath, "utf8"));

// per-era name → qid (only real QIDs; the index author rows carry the firstQid)
const perEra = {};
for (const era of Object.keys(index.authors || {})) {
  const m = {};
  for (const a of index.authors[era] || []) if (a && a.name && QID_RE.test(a.qid || "")) m[a.name] = a.qid;
  perEra[era] = m;
}

let added = 0, cleared = 0;
for (const row of search) {
  const q = (perEra[row.e] || {})[row.a] || null;
  if (q) { if (row.q !== q) added++; row.q = q; }
  else if ("q" in row) { delete row.q; cleared++; }   // idempotent: drop a stale/no-longer-valid q
}
const withQ = search.filter((r) => r.q).length;
console.log("[search-qid] v" + CV + " · " + search.length + " rows · " + withQ + " carry q (" + (100 * withQ / search.length).toFixed(1) + "%) · +" + added + " set · -" + cleared + " cleared" + (DRY ? " (dry-run)" : ""));
// sanity: every q must be a real QID
const badQ = search.find((r) => r.q && !QID_RE.test(r.q));
if (badQ) { console.error("[search-qid] ✗ row " + badQ.id + " has non-QID q='" + badQ.q + "'"); process.exit(1); }
if (DRY) return;
fs.writeFileSync(searchPath, JSON.stringify(search));
console.log("[search-qid] ✓ wrote corpus-search-v" + CV + ".json");
