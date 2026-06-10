#!/usr/bin/env node
"use strict";

// full-catalog-smoke.js — BRR-P1-014 A2.3 gate for the coverage-aware v3 catalog
// (build-corpus-catalog.js --full). Two parts:
//   1. Integrity of the COMMITTED v3 artifact (root index + per-era manifests) — guards
//      the shipped output against a bad rebuild (CI-safe; no CSV/network).
//   2. Deterministic LOGIC test via fixtures + child_process: CSV-merge + era-map +
//      baked overlay + author-block split @cap + honest unprocessed cards + R1 abort.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PRODUCER = path.join(REPO, "scripts", "premium", "build-corpus-catalog.js");
const OUT = path.join(REPO, "public", "data", "benyehuda");

let pass = 0, fail = 0;
function test(name, cond, info) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name + (info ? " — " + info : "")); } }

const VALID_ERAS = new Set(["biblical", "rabbinic", "medieval", "haskalah", "tehiya", "mandate", "modern", "contemporary", "unknown"]);

// ── Part 1: committed v3 artifact integrity ──────────────────────────────────
console.log("=== full-catalog-smoke (BRR-P1-014 A2.3) ===");
const rootPath = path.join(OUT, "corpus-catalog-v3.json");
test("corpus-catalog-v3.json exists", fs.existsSync(rootPath));
if (fs.existsSync(rootPath)) {
  const root = JSON.parse(fs.readFileSync(rootPath, "utf8"));
  test("root schema=1 version=3", root.schema === 1 && root.version === 3);
  test("root counts + manifests + taxonomy present", !!root.counts && Array.isArray(root.manifests) && Array.isArray(root.era_taxonomy));
  test("pointers.ready length == counts.baked", root.pointers && Array.isArray(root.pointers.ready) && root.pointers.ready.length === root.counts.baked, `${root.pointers && root.pointers.ready && root.pointers.ready.length} vs ${root.counts.baked}`);

  let manSum = 0, bakedSeen = 0, unprocSeen = 0, capViol = 0, fileMissing = 0, fileOnUnproc = 0, r1Lie = 0, badEra = 0;
  const CAP = 2000;
  for (const m of root.manifests || []) {
    const p = path.join(OUT, m.file);
    if (!fs.existsSync(p)) { test("manifest exists: " + m.file, false); continue; }
    const man = JSON.parse(fs.readFileSync(p, "utf8"));
    if (man.works.length !== m.count) test("manifest count matches works[] (" + m.file + ")", false, man.works.length + " vs " + m.count);
    if (m.count > CAP) capViol++;
    if (!VALID_ERAS.has(m.era)) badEra++;
    manSum += man.works.length;
    for (const c of man.works) {
      if (c.coverage && c.coverage.text) {
        bakedSeen++;
        if (!c.file) fileMissing++;
        if (c.review_status !== "machine" && c.review_status !== "machine_assisted") r1Lie++;
        if (c.audio_status === "human") r1Lie++;
      } else {
        unprocSeen++;
        if (c.coverage && c.coverage.tier !== "unprocessed") test("unprocessed tier honest", false, c.id + " tier=" + (c.coverage && c.coverage.tier));
        if (c.file) fileOnUnproc++;
      }
    }
  }
  test("Σ manifest works == counts.works", manSum === root.counts.works, manSum + " vs " + root.counts.works);
  test("baked cards == counts.baked", bakedSeen === root.counts.baked, bakedSeen + " vs " + root.counts.baked);
  test("no manifest exceeds cap " + CAP, capViol === 0, capViol + " over");
  test("every baked card has work_ref (file)", fileMissing === 0, fileMissing + " missing");
  test("no unprocessed card has a work_ref", fileOnUnproc === 0, fileOnUnproc + " bad");
  test("all manifest eras valid", badEra === 0, badEra + " invalid");
  test("R1: baked cards never human-review/human-audio", r1Lie === 0, r1Lie + " lies");
  test("unprocessed dominates (full corpus listed)", unprocSeen > bakedSeen, `unproc=${unprocSeen} baked=${bakedSeen}`);
}

// ── Part 2: deterministic logic via fixtures ─────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lp-fullcat-"));
function writeFixtures(bakedReview) {
  const csv = [
    "ID,path,title,authors,translators,author_uris,translator_uris,original_language,genre,source_edition",
    "1,/p/m1,שיר א,מחבר א,,https://wikidata.org/wiki/Q1,,,Translation missing: he.poetry,",
    "2,/p/m2,שיר ב,מחבר ב,,https://wikidata.org/wiki/Q2,,,Translation missing: he.prose,",
    "3,/p/m3,שיר ג,מחבר ג,,https://wikidata.org/wiki/Q3,,,Translation missing: he.poetry,",
    "4,/p/m4,שיר ד,מחבר ד,,,,de,Translation missing: he.prose,",
    "5,/p/m5,שיר ה,מחבר ה,,https://wikidata.org/wiki/Q1,,,Translation missing: he.article,",
  ].join("\n");
  fs.writeFileSync(path.join(tmp, "cat.csv"), csv, "utf8");
  fs.writeFileSync(path.join(tmp, "era.json"), JSON.stringify({ schema: 1, version: 1, authors: {
    Q1: { era: "tehiya" }, Q2: { era: "tehiya" }, Q3: { era: "tehiya" },
  } }));
  fs.writeFileSync(path.join(tmp, "baked.json"), JSON.stringify({ works: [
    { id: "1", title: "שיר א", author: "מחבר א", era: "tehiya", register: "poetic", track: "accessible", genre: "poetry", parts: 1, segments: 5, vocalized_ratio: 1, review_status: bakedReview || "machine", audio_status: "none", file: "works/1.json", coverage: { text: true, niqqud: 1, translation: "machine", audio: "none", era_known: true, tier: "machine-known" } },
  ] }));
}
function runFull(outDir, extra) {
  return spawnSync(process.execPath, [PRODUCER, "--full", "--csv", path.join(tmp, "cat.csv"), "--era-map", path.join(tmp, "era.json"), "--baked-from", path.join(tmp, "baked.json"), "--out-dir", outDir, "--shard-cap", "2", ...(extra || [])], { encoding: "utf8" });
}

writeFixtures();
const out1 = path.join(tmp, "o1");
const r = runFull(out1);
test("producer exits 0 on valid fixtures", r.status === 0, "status=" + r.status + " " + (r.stderr || "").slice(0, 160));
const froot = path.join(out1, "corpus-catalog-v3.json");
if (fs.existsSync(froot)) {
  const root = JSON.parse(fs.readFileSync(froot, "utf8"));
  test("fixture works == 5", root.counts.works === 5, "got " + root.counts.works);
  test("fixture baked == 1", root.counts.baked === 1, "got " + root.counts.baked);
  test("fixture ready pointer == [1]", root.pointers.ready.length === 1 && root.pointers.ready[0] === "1");
  // tehiya has 4 works, cap 2 → 2 author-block manifests; unknown has 1 → single
  const tehiyaMans = root.manifests.filter((m) => m.era === "tehiya");
  test("tehiya split into ≥2 author-blocks @cap2", tehiyaMans.length >= 2, "blocks=" + tehiyaMans.length);
  test("every tehiya block ≤ cap 2", tehiyaMans.every((m) => m.count <= 2));
  const unknownMan = root.manifests.find((m) => m.era === "unknown");
  test("no-QID work → era unknown", !!unknownMan && unknownMan.count === 1, unknownMan ? ("count=" + unknownMan.count) : "no unknown manifest");
  // inspect cards: id1 baked (file+text), id2 unprocessed (no file)
  let card1 = null, card2 = null;
  for (const m of root.manifests) { const man = JSON.parse(fs.readFileSync(path.join(out1, m.file), "utf8")); for (const c of man.works) { if (c.id === "1") card1 = c; if (c.id === "2") card2 = c; } }
  test("baked card1 has file + coverage.text", !!card1 && !!card1.file && card1.coverage.text === true);
  test("unprocessed card2 tier=unprocessed + no file", !!card2 && card2.coverage.tier === "unprocessed" && !card2.file);
  test("card1 era from baked/map = tehiya", !!card1 && card1.era === "tehiya");
}

// R1 negative: a baked overlay claiming human review must abort the build (exit 1).
writeFixtures("human_proofread");
const out2 = path.join(tmp, "o2");
const rn = runFull(out2);
test("R1 gate: human_proofread baked → exit 1", rn.status === 1, "status=" + rn.status);
test("R1 gate: nothing written on abort", !fs.existsSync(path.join(out2, "corpus-catalog-v3.json")));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log(`\n[full-catalog-smoke] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
