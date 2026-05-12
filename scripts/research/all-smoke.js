#!/usr/bin/env node
// scripts/research/all-smoke.js — combined runner for Direction 11B.
// Runs all 4 smoke suites sequentially (each spawns its own server +
// temp RESEARCH_DATA_DIR), reports total pass/fail, exits 0 if all green.
//
// Suites (in order):
//   1. smoke.js               — 23 server-side cases (Phase 11.4 + 11.6)
//   2. browser-smoke.js       — 16 client opt-in flow cases (Phase 11.2 + 11.3)
//   3. teacher-smoke.js       — 12 teacher dashboard assertions (Phase 11.5)
//   4. teacher-screenshots.js — 9 visual captures → Smoke-check/teacher-dashboard/<ts>/
//
// Usage:
//   node scripts/research/all-smoke.js [--skip-screenshots]

"use strict";

const path = require("path");
const { spawn } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const args = process.argv.slice(2);
const skipScreenshots = args.includes("--skip-screenshots");

const SUITES = [
  { name: "Server smoke (Phase 11.4 + 11.6)",   script: "scripts/research/smoke.js",        countLabel: "23 cases" },
  { name: "Client opt-in (Phase 11.2 + 11.3)",  script: "scripts/research/browser-smoke.js", countLabel: "16 cases" },
  { name: "Teacher dashboard (Phase 11.5)",     script: "scripts/research/teacher-smoke.js", countLabel: "12 cases" },
  ...(skipScreenshots ? [] : [
    { name: "Visual regression captures",       script: "scripts/research/teacher-screenshots.js", countLabel: "9 PNGs" },
  ]),
];

function runSuite(script) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(process.execPath, [script], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => { const s = String(c); process.stdout.write(s); stdout += s; });
    child.stderr.on("data", (c) => { const s = String(c); process.stderr.write(s); stderr += s; });
    child.on("close", (code) => {
      resolve({ code, ms: Date.now() - start, stdout, stderr });
    });
  });
}

async function main() {
  const results = [];
  console.log(`[all-smoke] running ${SUITES.length} suites…\n`);
  for (const suite of SUITES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`▶ ${suite.name} (${suite.countLabel})`);
    console.log(`  $ node ${suite.script}\n`);
    const r = await runSuite(suite.script);
    results.push({ ...suite, ...r });
    console.log(`\n${r.code === 0 ? "  ✓ green" : "  ✗ FAIL (exit=" + r.code + ")"} (${(r.ms / 1000).toFixed(1)}s)`);
  }
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log("[all-smoke] summary:");
  let failures = 0;
  for (const r of results) {
    const tag = r.code === 0 ? "✓" : "✗";
    if (r.code !== 0) failures++;
    console.log(`  ${tag} ${r.name.padEnd(48)} ${(r.ms / 1000).toFixed(1)}s`);
  }
  console.log("");
  if (failures === 0) {
    console.log("[all-smoke] ALL GREEN ✓");
    process.exit(0);
  } else {
    console.log(`[all-smoke] ${failures} suite(s) FAILED`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[all-smoke] unhandled:", e); process.exit(1); });
}
