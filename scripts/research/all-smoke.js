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
  { name: "Teacher multicohort (v3.3.2 D12)",   script: "scripts/research/teacher-multicohort-smoke.js", countLabel: "8 cases" },
  { name: "Preview UI (transparency modal)",    script: "scripts/research/preview-ui-smoke.js", countLabel: "12 cases" },
  { name: "Admin CLI: rotate_token (v3.3.1 A2)",     script: "scripts/research/rotate-token-smoke.js",     countLabel: "12 cases" },
  { name: "Admin CLI: link_student_ids (v3.3.1 A3)", script: "scripts/research/link-student-ids-smoke.js", countLabel: "12 cases" },
  { name: "Admin CLI: validate-cli (v3.3.1 A5)",     script: "scripts/research/validate-cli-smoke.js",     countLabel: "15 cases" },
  { name: "Admin CLI flags polish",                  script: "scripts/research/admin-cli-flags-smoke.js",   countLabel: "24 cases" },
  { name: "Cross-text lookup service (v3.3.2 D15)",  script: "scripts/morph/crosstext-smoke.js",            countLabel: "8 cases" },
  { name: "Search fallback regression (v3.3.3)",     script: "scripts/research/search-fallback-regression.js", countLabel: "7 cases" },
  { name: "Quiz item bank validation (v3.3.5 C1)",   script: "scripts/quiz/bank-validate-smoke.js",         countLabel: "8 cases" },
  { name: "Quiz scoring engine (v3.3.5 C2)",         script: "scripts/quiz/scoring-smoke.js",               countLabel: "6 cases" },
  { name: "Quiz UI modal (v3.3.5 C3)",               script: "scripts/quiz/ui-smoke.js",                    countLabel: "8 cases" },
  { name: "Quiz UI accessibility (post-v3.3.5)",     script: "scripts/quiz/ui-a11y-smoke.js",               countLabel: "7 cases" },
  { name: "Quiz privacy hardening (v3.3.5 C4)",      script: "scripts/quiz/privacy-smoke.js",               countLabel: "5 cases" },
  { name: "Quiz client submit (v3.3.5 C5)",          script: "scripts/quiz/client-submit-smoke.js",         countLabel: "8 cases" },
  { name: "Quiz server validator (v3.3.5 C6)",       script: "scripts/research/quiz-validator-smoke.js",    countLabel: "7 cases" },
  { name: "Teacher dashboard quiz cols (v3.3.5 C7)", script: "scripts/research/teacher-quiz-smoke.js",      countLabel: "3 cases" },
  { name: "Quiz reset CLI (v3.3.5 C8)",              script: "scripts/research/quiz-reset-cli-smoke.js",    countLabel: "6 cases" },
  { name: "Graph lazy-load (v3.3.6 C0+C1+C4+C8)",    script: "scripts/notes-graph/lazyload-smoke.js",       countLabel: "9 cases" },
  { name: "Graph data layer (v3.3.6 C2)",            script: "scripts/notes-graph/build-data-smoke.js",     countLabel: "7 cases" },
  { name: "Graph renderer perf (v3.3.6 C3)",         script: "scripts/notes-graph/perf-smoke.js",           countLabel: "6 cases" },
  { name: "Graph keyboard + a11y (v3.3.6 C5)",       script: "scripts/notes-graph/render-a11y-smoke.js",    countLabel: "6 cases" },
  { name: "Graph mobile fallback (v3.3.6 C6)",       script: "scripts/notes-graph/mobile-fallback-smoke.js",countLabel: "5 cases" },
  { name: "Graph privacy hardening (v3.3.6 C7)",     script: "scripts/notes-graph/privacy-smoke.js",        countLabel: "8 cases" },
  { name: "Graph interaction/drag (v3.3.6)",         script: "scripts/notes-graph/interaction-smoke.js",    countLabel: "7 cases" },
  { name: "Graph UX uplift Tier-1 (v3.3.7)",         script: "scripts/notes-graph/graph-ux-smoke.js",       countLabel: "5 cases" },
  { name: "Graph UX Tier-2 U5/U6/U7 (v3.4 B)",       script: "scripts/notes-graph/graph-tier2-smoke.js",    countLabel: "5 cases" },
  { name: "Mobile notes pass (v3.4 C6)",             script: "scripts/notes-ui/mobile-notes-smoke.js",      countLabel: "5 cases" },
  { name: "Inline [[ link autocomplete (v3.4 C1)",   script: "scripts/notes-ui/link-autocomplete-smoke.js", countLabel: "6 cases" },
  { name: "Onboarding + empty-state teach (v3.4 C3+U8)", script: "scripts/notes-ui/onboarding-empty-smoke.js", countLabel: "5 cases" },
  { name: "Create→link→graph loop (v3.4 C2)",         script: "scripts/notes-ui/graph-loop-smoke.js",        countLabel: "5 cases" },
  { name: "Autosave feedback + new-note entry (v3.4 C5+C7)", script: "scripts/notes-ui/autosave-entry-smoke.js", countLabel: "5 cases" },
  { name: "Non-destructive type switch (v3.4 C4)",    script: "scripts/notes-ui/type-switch-smoke.js",       countLabel: "5 cases" },
  ...(skipScreenshots ? [] : [
    { name: "Visual regression captures",       script: "scripts/research/teacher-screenshots.js", countLabel: "9 PNGs" },
    { name: "Graph visual regression (v3.3.6 C9)", script: "scripts/notes-graph/visual-regression.js", countLabel: "31 self-test assertions / 10 PNGs" },
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
