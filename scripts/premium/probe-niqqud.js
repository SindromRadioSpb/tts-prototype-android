#!/usr/bin/env node
"use strict";

// probe-niqqud.js — BRR-P1-015 (probe / quality gate for the wide bake). Scans the bake's
// per-era shards and reports niqqud (vocalization) + translation coverage per shard + overall,
// with a PASS/WARN verdict — so the operator can confirm the in-flight corpus bake isn't
// filling the library with poorly-vocalized works (R1/R8: vocalization is core to reading
// Hebrew). Reuses the producer's vocalizedRatio definition (vocalized he-rows / he-rows).
//
//   node scripts/premium/probe-niqqud.js              # scan .tmp/benyehuda/shards
//   node scripts/premium/probe-niqqud.js --json       # machine-readable
//   node scripts/premium/probe-niqqud.js --min-voc 0.92
//
// Read-only; safe to run while a bake is in progress (a shard mid-flush is skipped, not fatal).

const fs = require("fs");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const JSZip = require(path.join(REPO, "public", "db", "jszip.min.js"));

function arg(name, def) { const i = process.argv.indexOf("--" + name); return i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith("--") ? process.argv[i + 1] : def; }
const SHARD_DIR = path.resolve(arg("shard-dir", path.join(REPO, ".tmp", "benyehuda", "shards")));
const JSON_OUT = process.argv.includes("--json");
const VOC_WARN = Number(arg("min-voc", 0.90)) || 0.90; // overall vocalization warn threshold
const NIQQUD = /[֑-ׇ]/;

async function measure(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const e = zip.files["library/library.json"] || zip.files["library.json"];
  if (!e) throw new Error("no library.json");
  const lib = JSON.parse(await e.async("string"));
  let he = 0, voc = 0, ru = 0; const low = [];
  for (const t of (lib.texts || [])) {
    const rows = t.rows || [];
    const heRows = rows.filter((r) => (r.hebrew_plain || "").trim());
    const vocRows = heRows.filter((r) => NIQQUD.test(r.hebrew_niqqud || ""));
    const ruRows = rows.filter((r) => (r.russian || "").trim());
    he += heRows.length; voc += vocRows.length; ru += ruRows.length;
    const vr = heRows.length ? vocRows.length / heRows.length : 1;
    if (vr < 0.85 && heRows.length >= 5) low.push({ title: (t.title || "").slice(0, 40), vr: +(vr * 100).toFixed(0), rows: heRows.length });
  }
  return { texts: (lib.texts || []).length, he, voc, ru, vr: he ? voc / he : 1, rr: he ? ru / he : 1, low };
}

(async () => {
  let files = []; try { files = fs.readdirSync(SHARD_DIR).filter((f) => /\.zip$/.test(f)).sort(); } catch (_) {}
  if (!files.length) { console.error("[probe-niqqud] no shards in " + SHARD_DIR + " (run a bake first)"); process.exit(2); }
  const results = []; let He = 0, Voc = 0, Ru = 0; const allLow = [];
  for (const f of files) {
    try { const r = await measure(path.join(SHARD_DIR, f)); results.push({ shard: f, ...r }); He += r.he; Voc += r.voc; Ru += r.ru; for (const l of r.low) allLow.push({ shard: f, ...l }); }
    catch (e) { results.push({ shard: f, error: e.message }); } // mid-flush shard → skip, not fatal
  }
  const overallVoc = He ? Voc / He : 0, overallRu = He ? Ru / He : 0;
  const verdict = overallVoc >= VOC_WARN ? "PASS" : "WARN";
  if (JSON_OUT) { console.log(JSON.stringify({ shard_dir: SHARD_DIR, overall: { he_rows: He, vocalized: overallVoc, translated: overallRu, verdict }, shards: results, low_texts: allLow }, null, 2)); return; }
  console.log("=== BRR-P1-015 probe-niqqud (shard vocalization gate) ===");
  console.log("shard dir: " + path.relative(REPO, SHARD_DIR) + " | shards: " + files.length);
  for (const r of results) {
    if (r.error) { console.log("  ⊘ " + r.shard + " — skipped (" + r.error + ")"); continue; }
    console.log("  " + (r.vr * 100).toFixed(1).padStart(5) + "% voc · " + (r.rr * 100).toFixed(0).padStart(3) + "% ru · " + String(r.texts).padStart(3) + " texts · " + String(r.he).padStart(5) + " he-rows · " + r.shard);
  }
  console.log("---");
  console.log("OVERALL: " + (overallVoc * 100).toFixed(1) + "% vocalized · " + (overallRu * 100).toFixed(0) + "% translated · " + He + " he-rows · " + files.length + " shards");
  if (allLow.length) { console.log("low-vocalization texts (<85%, ≥5 rows): " + allLow.length); for (const l of allLow.slice(0, 10)) console.log("   " + l.vr + "%  " + l.rows + " rows  [" + l.shard + "]  " + l.title); }
  console.log("VERDICT: " + verdict + " (threshold " + (VOC_WARN * 100).toFixed(0) + "% vocalized)" + (verdict === "PASS" ? " — niqqud quality holds; wide bake green-lit." : " — investigate the niqqud pipeline before baking wide."));
})().catch((e) => { console.error("[probe-niqqud] fatal", e); process.exit(1); });
