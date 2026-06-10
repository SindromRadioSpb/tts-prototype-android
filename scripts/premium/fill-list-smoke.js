#!/usr/bin/env node
"use strict";

// fill-list-smoke.js — BRR-P1-015 A5 (targeting slice) gate. OFFLINE (no network/Gemini):
//   • build-fill-list emits the EXACT catalog-era id-set (count == era_taxonomy.count) and
//     tags every id with its era
//   • multi-era lists preserve the requested era ORDER (modern before mandate)
//   • an unknown era is rejected (non-zero exit, no silent empty list)
//   • run-corpus-prebake `--plan --ids-file` recognises the targeted set, prints TARGETED in
//     bake order, and seeds ONLY the targeted subset into a fresh ledger
//
// The build-fill-list assertions need only the committed v3 catalog. The runner --plan
// assertion additionally needs the operator-local CSV (.tmp/benyehuda/pseudocatalogue.csv,
// same dependency as full-catalog-smoke) — skipped with a note if absent.

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const REPO = path.resolve(__dirname, "..", "..");
const NODE = process.execPath;

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); } }
function run(args) { return spawnSync(NODE, args, { cwd: REPO, encoding: "utf8" }); }

const TMP = path.join(REPO, ".tmp", "benyehuda");
const FILL = path.join(TMP, "fill-ids-smoke.json");
const LEDGER = path.join(TMP, "fill-smoke-ledger.json");
const CSV = path.join(TMP, "pseudocatalogue.csv");

function rm(p) { try { fs.unlinkSync(p); } catch (_) {} }

function main() {
  console.log("[fill-list-smoke] offline (no network / Gemini)");
  const root = JSON.parse(fs.readFileSync(path.join(REPO, "public", "data", "benyehuda", "corpus-catalog-v3.json"), "utf8"));
  const modernCount = (root.era_taxonomy.find((e) => e.era === "modern") || {}).count;

  // 1. build-fill-list modern → ids count == catalog modern; every id tagged era=modern
  rm(FILL);
  const r1 = run(["scripts/premium/build-fill-list.js", "--eras", "modern", "--out", FILL]);
  test("build-fill-list modern exits 0", r1.status === 0, (r1.stderr || "").slice(0, 160));
  let fill = null; try { fill = JSON.parse(fs.readFileSync(FILL, "utf8")); } catch (_) {}
  test("fill-list emitted ids for modern", !!fill && Array.isArray(fill.ids) && fill.ids.length > 0);
  test("modern id-count matches catalog era_taxonomy.count", !!fill && fill.ids.length === modernCount, "list=" + (fill && fill.ids.length) + " catalog=" + modernCount);
  test("every id tagged era=modern", !!fill && fill.ids.every((x) => x.era === "modern"));

  // 2. multi-era order preserved (all modern before any mandate)
  const r2 = run(["scripts/premium/build-fill-list.js", "--eras", "modern,mandate", "--out", FILL]);
  test("build-fill-list modern,mandate exits 0", r2.status === 0, (r2.stderr || "").slice(0, 160));
  const fill2 = JSON.parse(fs.readFileSync(FILL, "utf8"));
  const eras = fill2.ids.map((x) => x.era);
  const lastModern = eras.lastIndexOf("modern");
  const firstMandate = eras.indexOf("mandate");
  test("era order preserved (all modern before any mandate)", lastModern >= 0 && firstMandate > lastModern, "lastModern=" + lastModern + " firstMandate=" + firstMandate);

  // 3. unknown era → non-zero exit (no silent empty list)
  const r3 = run(["scripts/premium/build-fill-list.js", "--eras", "nosuchera", "--out", FILL]);
  test("unknown era rejected (non-zero exit)", r3.status !== 0);

  // 4. runner --plan --ids-file → TARGETED, seeds only the subset (needs the operator CSV)
  if (fs.existsSync(CSV)) {
    run(["scripts/premium/build-fill-list.js", "--eras", "modern", "--out", FILL]); // modern-only again
    rm(LEDGER);
    const r4 = run(["scripts/premium/run-corpus-prebake.js", "--plan", "--ids-file", FILL, "--ledger", LEDGER]);
    test("--plan --ids-file exits 0", r4.status === 0, (r4.stderr || "").slice(0, 160));
    test("plan marks the run TARGETED", /TARGETED/.test(r4.stdout || ""), (r4.stdout || "").split("\n").find((l) => /TARGET/.test(l)));
    test("plan shows the era in bake order", /modern \d+/.test(r4.stdout || ""));
    let seeded = -1; try { seeded = Object.keys(JSON.parse(fs.readFileSync(LEDGER, "utf8")).works || {}).length; } catch (_) {}
    test("fresh ledger seeded ONLY the targeted subset (>0, ≤ catalog modern)", seeded > 0 && seeded <= modernCount, "seeded=" + seeded + " catalog=" + modernCount);
    rm(LEDGER);
  } else {
    console.log("  ⊘ runner --plan --ids-file assertions SKIPPED (no .tmp/benyehuda/pseudocatalogue.csv — operator CSV absent)");
  }

  rm(FILL);
  console.log("\n[fill-list-smoke] " + passed + "/" + (passed + failed) + " passed");
  process.exit(failed ? 1 : 0);
}
main();
