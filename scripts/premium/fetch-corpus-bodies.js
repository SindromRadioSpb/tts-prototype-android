#!/usr/bin/env node
"use strict";
// fetch-corpus-bodies.js — BRR-P2-001 helper: politely fill the local Hebrew-body cache
// (.tmp/benyehuda/txt) from the Project Ben-Yehuda dump so build-corpus-fts.js can index
// more works. Resumable (skips cached), backoff via ingestCore. NOT a bake — just the raw
// txt. Coverage of the FTS index grows as this cache fills (same model as the corpus bake).
//
//   node scripts/premium/fetch-corpus-bodies.js [--limit N] [--by-dir DIR]

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const by = require("./lib/benyehuda.js");
const { createIngestCore } = require("./lib/ingestCore.js");

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }

(async () => {
  const byDir = arg("by-dir", path.join(REPO, ".tmp", "benyehuda"));
  const limit = Number(arg("limit", 0)) || 0;
  const csv = by.parseCsv(fs.readFileSync(path.join(byDir, "pseudocatalogue.csv"), "utf8"));
  const paths = csv.rows.map((r) => by.cleanField(r.path)).filter(Boolean);
  const core = createIngestCore({ byDir, noFetch: false, log: () => {} });
  let fetched = 0, cached = 0, failed = 0, n = 0;
  const todo = limit ? paths.slice(0, limit) : paths;
  for (const p of todo) {
    n++;
    const cacheFile = path.join(byDir, "txt", String(p).replace(/^\//, "") + ".txt");
    if (fs.existsSync(cacheFile)) { cached++; continue; }
    try { await core.fetchTxt(p); fetched++; } catch (_) { failed++; }
    if (n % 200 === 0) console.log("[fetch] " + n + "/" + todo.length + " · new " + fetched + " · cached " + cached + " · failed " + failed);
  }
  console.log("[fetch] DONE — scanned " + n + " · new " + fetched + " · already-cached " + cached + " · failed " + failed);
})().catch((e) => { console.error(e); process.exit(1); });
