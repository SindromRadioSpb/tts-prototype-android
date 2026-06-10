#!/usr/bin/env node
"use strict";

// era-map-smoke.js — BRR-P1-014 A2.0 gate. Validates the COMMITTED, reproducible
// author-era map (public/data/benyehuda/author-era-map-v1.json) without network or CSV
// (CI-safe). Guards R7 era correctness + R9 honesty invariants against a bad rebuild.

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const MAP_PATH = path.join(REPO, "public", "data", "benyehuda", "author-era-map-v1.json");

let pass = 0, fail = 0;
function test(name, cond, info) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name + (info ? " — " + info : "")); } }

const VALID_ERAS = new Set(["biblical", "rabbinic", "medieval", "haskalah", "tehiya", "mandate", "modern", "contemporary"]);
const VALID_CONF = new Set(["high", "medium", "none"]);

// R7 anchors: stable Wikidata QIDs whose floruit-derived era must not regress. Floruit
// bucketing (not death year) is the load-bearing rule — Bialik (d.1934) MUST be tehiya,
// never mandate.
const ANCHORS = {
  Q467161: { era: "medieval", who: "Shmuel HaNagid" },
  Q239355: { era: "medieval", who: "Ibn Gabirol" },
  Q299200: { era: "medieval", who: "Yehuda HaLevi" },
  Q1376036: { era: "haskalah", who: "Y.L. Gordon" },
  Q359705: { era: "tehiya", who: "Bialik" },
};

console.log("=== era-map-smoke (BRR-P1-014 A2.0) ===");
test("author-era-map-v1.json exists", fs.existsSync(MAP_PATH));
if (!fs.existsSync(MAP_PATH)) { console.error("\n[era-map-smoke] FAIL — run: node scripts/premium/build-era-map.js"); process.exit(1); }

const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
test("schema=1", map.schema === 1, "got " + map.schema);
test("generated_from=wikidata", map.generated_from === "wikidata");
test("rule.floruit_offset present", map.rule && typeof map.rule.floruit_offset === "number");
test("rule.boundaries present", map.rule && Array.isArray(map.rule.boundaries) && map.rule.boundaries.length > 0);
test("authors object present", map.authors && typeof map.authors === "object");

// R7 anchors
for (const [qid, exp] of Object.entries(ANCHORS)) {
  const a = map.authors[qid];
  test(`anchor ${qid} (${exp.who}) → ${exp.era}`, !!a && a.era === exp.era, a ? ("got " + a.era + " fl=" + a.floruit) : "missing from map");
}

// R9/R1 honesty + integrity over EVERY author entry
let badEra = 0, badConf = 0, fabDate = 0, eraWithoutFloruit = 0;
for (const [qid, a] of Object.entries(map.authors || {})) {
  if (a.era !== null && !VALID_ERAS.has(a.era)) badEra++;
  if (!VALID_CONF.has(a.confidence)) badConf++;
  if (a.birth != null && !Number.isInteger(a.birth)) fabDate++;
  if (a.death != null && !Number.isInteger(a.death)) fabDate++;
  // a derived era requires a finite floruit (no era conjured without a date — R1)
  if (a.era !== null && !Number.isFinite(a.floruit)) eraWithoutFloruit++;
  if (a.source !== "wikidata") badConf++; // provenance must be honest
}
test("all eras valid or null", badEra === 0, badEra + " invalid");
test("all confidence/source honest", badConf === 0, badConf + " bad");
test("no fabricated (non-integer) dates", fabDate === 0, fabDate + " bad");
test("no era without a floruit (R1: no guess)", eraWithoutFloruit === 0, eraWithoutFloruit + " bad");

// coverage threshold (actual ~89.4%; guard against a gutted rebuild)
const c = map.counts || {};
test("works coverage ≥ 85%", c.works_total > 0 && (c.works_with_era / c.works_total) >= 0.85,
  `${c.works_with_era}/${c.works_total} = ${c.works_total ? (100 * c.works_with_era / c.works_total).toFixed(1) : "?"}%`);
test("resolved QIDs ≥ 90% of total", c.qids > 0 && (c.resolved / c.qids) >= 0.90, `${c.resolved}/${c.qids}`);

console.log(`\n[era-map-smoke] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
