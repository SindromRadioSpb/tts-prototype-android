#!/usr/bin/env node
"use strict";

// build-fill-list.js — BRR-P1-015 A5 (targeting slice, lightweight fill-queue seed).
//
// Emits an ORDERED work-id list for the bake runner's `--ids-file`, derived from the SHIPPED
// v3 catalog so the targeted eras are EXACTLY the Wikidata-era buckets the owner sees in the
// Корпус UI (NOT the runner's name-heuristic, which buckets differently). The runner then
// bakes only these ids, in this order.
//
//   node scripts/premium/build-fill-list.js --eras modern,mandate,unknown
//   node scripts/premium/build-fill-list.js --eras modern --out .tmp/benyehuda/fill-ids.json
//
// Order: eras in the order given on --eras; within an era, manifest (author-sorted) order.
// Deterministic + reproducible from the catalog. Default --out is operator-local (.tmp,
// gitignored); pass --out to a tracked path if you want an audit trail of a chosen run.

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }

const CATALOG_VERSION = Number(arg("catalog-version", 3)) || 3;
const DATA_DIR = path.resolve(arg("data-dir", path.join(REPO, "public", "data", "benyehuda")));
const ROOT_PATH = path.join(DATA_DIR, "corpus-catalog-v" + CATALOG_VERSION + ".json");
const OUT_PATH = path.resolve(arg("out", path.join(REPO, ".tmp", "benyehuda", "fill-ids.json")));
const ERAS = String(arg("eras", "")).split(",").map((s) => s.trim()).filter(Boolean);

function main() {
  if (!ERAS.length) { console.error("[fill-list] --eras is required (e.g. --eras modern,mandate,unknown)"); process.exit(2); }
  if (!fs.existsSync(ROOT_PATH)) { console.error("[fill-list] catalog root not found: " + ROOT_PATH); process.exit(2); }
  const root = JSON.parse(fs.readFileSync(ROOT_PATH, "utf8"));
  const manifests = Array.isArray(root.manifests) ? root.manifests : [];
  const taxByEra = {}; for (const t of (root.era_taxonomy || [])) taxByEra[t.era] = t;

  // validate requested eras against the catalog
  const knownEras = new Set(manifests.map((m) => m.era));
  const bad = ERAS.filter((e) => !knownEras.has(e));
  if (bad.length) { console.error("[fill-list] unknown era(s): " + bad.join(", ") + " — catalog has: " + [...knownEras].join(", ")); process.exit(2); }

  const ids = [];
  const seen = new Set();
  const perEra = {};
  for (const era of ERAS) {
    // manifest blocks for this era, in block order (null < "00" < "01" …)
    const files = manifests.filter((m) => m.era === era)
      .sort((a, b) => String(a.block == null ? "" : a.block).localeCompare(String(b.block == null ? "" : b.block)))
      .map((m) => m.file);
    let n = 0;
    for (const rel of files) {
      const m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), "utf8"));
      for (const w of (m.works || [])) {
        const id = String(w.id);
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push({ id, era });
        n++;
      }
    }
    perEra[era] = n;
  }

  const out = {
    schema: 1,
    generated_from: "corpus-catalog-v" + CATALOG_VERSION,
    eras: ERAS,
    count: ids.length,
    per_era: perEra,
    ids,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log("=== BRR-P1-015 A5 fill-list (targeting slice) ===");
  console.log("eras (order): " + ERAS.join(" → "));
  for (const era of ERAS) console.log("  " + era.padEnd(10) + " " + perEra[era] + " works" + (taxByEra[era] ? " (catalog: " + taxByEra[era].count + ", ready " + taxByEra[era].ready_count + ")" : ""));
  console.log("total ids:    " + ids.length);
  console.log("wrote:        " + path.relative(REPO, OUT_PATH));
  console.log("next:         node scripts/premium/run-corpus-prebake.js --plan --ids-file " + path.relative(REPO, OUT_PATH) + "   (offline preview; --bake needs GEMINI_API_KEY)");
}
main();
