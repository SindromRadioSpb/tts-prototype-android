#!/usr/bin/env node
"use strict";
// BRR-P1-009 Slice 1 — audit-corpus-niqqud.
//
// Per-work niqqud (vocalization) coverage audit over baked corpus works. The dominant
// cause of "tap didn't surface the right word" is measured to be NIQQUD coverage, not
// the resolver: ~57% overall but bimodal — some works are 90-100% vocalized, others
// <20%. Resolution quality (and word-status colouring) tracks vocalization, so this
// tool flags the weakly-vocalized works for a TARGETED re-bake.
//
// Emits an `--ids-file`-compatible list ({ids:[...]}) the prebake runner consumes:
//   node scripts/premium/audit-corpus-niqqud.js
//   node scripts/premium/run-corpus-prebake.js --bake --provider gemini --ids-file .tmp/benyehuda/reniqqud-ids.json
//   node scripts/premium/publish-corpus-batch.js --apply   (re-publish)
//
// Complements probe:niqqud (overall % over bake shards) with PER-WORK granularity.
// Read-only over the corpus; only writes the id-list to .tmp (gitignored).
//
// Flags: --dir <path> (default public/data/benyehuda/works) · --threshold <pct> (default 60)
//        --out <path> (default .tmp/benyehuda/reniqqud-ids.json) · --json (machine summary)

const fs = require("fs");
const path = require("path");
const RM = require(path.join(__dirname, "..", "..", "public", "js", "reader-morph.js"));

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
}
const REPO = path.resolve(__dirname, "..", "..");
const DIR = path.resolve(arg("dir", path.join(REPO, "public", "data", "benyehuda", "works")));
const THRESHOLD = Number(arg("threshold", 60));
const OUT = path.resolve(arg("out", path.join(REPO, ".tmp", "benyehuda", "reniqqud-ids.json")));
const JSON_OUT = process.argv.includes("--json");
const VOWEL = /[ְ-ׇ]/; // any niqqud / dagesh / cantillation mark → the word is vocalized
const rel = (p) => path.relative(process.cwd(), p);

function workId(w, file) {
  try {
    const t = (w.library && w.library.texts && w.library.texts[0]) || {};
    const c = t.corpus || (t.source_meta && t.source_meta.corpus) || {};
    if (c.byehuda_id) return String(c.byehuda_id);
  } catch (_) {}
  return path.basename(file, ".json");
}

let files;
try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")); }
catch (e) { console.error("[audit] dir not readable: " + DIR + " (" + e.message + ")"); process.exit(1); }

const rows = [];
for (const f of files) {
  let w; try { w = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch (_) { continue; }
  let words = 0, voc = 0;
  for (const t of (w.library && w.library.texts) || [])
    for (const r of t.rows || [])
      for (const tok of RM.words(r.hebrew_niqqud || "")) {
        if (RM.stripNiqqud(tok).length < 2) continue;
        words++; if (VOWEL.test(tok)) voc++;
      }
  if (words > 0) rows.push({ id: workId(w, f), file: f, words: words, rate: voc / words });
}
rows.sort((a, b) => a.rate - b.rate);

const low = rows.filter((r) => r.rate * 100 < THRESHOLD);
const totW = rows.reduce((s, r) => s + r.words, 0);
const totV = rows.reduce((s, r) => s + r.words * r.rate, 0);
const buckets = { "0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 };
for (const r of rows) {
  const p = r.rate * 100;
  buckets[p < 20 ? "0-20" : p < 40 ? "20-40" : p < 60 ? "40-60" : p < 80 ? "60-80" : "80-100"]++;
}
const overall = totW ? 100 * totV / totW : 0;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated_for: "reniqqud", threshold: THRESHOLD, count: low.length, ids: low.map((r) => String(r.id)) }, null, 2) + "\n");

if (JSON_OUT) {
  console.log(JSON.stringify({ dir: rel(DIR), works: rows.length, overall_pct: Number(overall.toFixed(1)), threshold: THRESHOLD, below: low.length, buckets, out: rel(OUT) }, null, 2));
} else {
  console.log("dir:", rel(DIR), "| works:", rows.length, "| threshold:", THRESHOLD + "%");
  console.log("overall niqqud-word coverage:", overall.toFixed(1) + "%");
  console.log("per-work buckets (% vocalized):", JSON.stringify(buckets));
  console.log("works below " + THRESHOLD + "%:", low.length, "(re-bake candidates)");
  for (const r of low.slice(0, 30)) console.log("  " + String(r.id).padEnd(8), (r.rate * 100).toFixed(0).padStart(3) + "%", (r.words + "w").padStart(6), r.file);
  if (low.length > 30) console.log("  …+" + (low.length - 30) + " more");
  console.log("\nid-list (" + low.length + " works) -> " + rel(OUT));
  if (low.length) console.log("re-bake: node scripts/premium/run-corpus-prebake.js --bake --provider gemini --ids-file " + rel(OUT));
}
