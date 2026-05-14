#!/usr/bin/env node
// scripts/research/quiz-validator-smoke.js — v3.3.5 C6 server validator smoke.
//
// 7 cases per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §13:
//   1. Valid calibrated-quiz outcome payload → exit 0 + OK
//   2. quiz_score_normalized = 105 → exit 3 SCHEMA_VIOLATION (out of range)
//   3. quiz_cefr_band = "D1" → exit 3 SCHEMA_VIOLATION (invalid enum)
//   4. quiz_se = -1.0 → exit 3 SCHEMA_VIOLATION (negative)
//   5. quiz_completed_at = "2026-05-14T10:23:45Z" → exit 3 (sub-day rejected)
//   6. quiz_version = "Bad Format" → exit 3 SCHEMA_VIOLATION
//   7. outcome_capture_method = "calibrated-quiz" accepted (enum extended)
//
// Runs research/validate.js via the validate-cli.js wrapper so the assertion
// is the same path the live API endpoint uses (research/validate.js is the
// authoritative server-side enforcement point per phase plan §1).

"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(REPO_ROOT, "scripts/research/validate-cli.js");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

function run(payload) {
  const r = spawnSync(process.execPath, [CLI], {
    cwd: REPO_ROOT, input: JSON.stringify(payload), encoding: "utf8",
  });
  return { stdout: r.stdout || "", stderr: r.stderr || "", code: r.status };
}

function basePayload() {
  return {
    format: "linguistpro-research-v1",
    student_id: "abc12340-0000-4000-8000-000000000001",
    cohort_code: "QUIZ-SMOKE",
    upload_ts: "2026-05-15",
    since_ts: "2026-05-15",
    consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: {
      outcome: {
        quiz_score_normalized: 72,
        quiz_cefr_band: "B2",
        quiz_se: 0.412,
        quiz_completed_at: "2026-05-15",
        quiz_version: "ulpan_diagnostic_v1",
        outcome_capture_method: "calibrated-quiz",
      },
    },
  };
}

function main() {
  // 1. Valid payload.
  let r = run(basePayload());
  test("Case 1: valid calibrated-quiz payload → exit 0 + OK",
       r.code === 0 && /\bOK\b/.test(r.stdout),
       "exit=" + r.code + " stderr=" + r.stderr.slice(0, 200));

  // 2. quiz_score_normalized = 105.
  let p = basePayload(); p.metrics.outcome.quiz_score_normalized = 105;
  r = run(p);
  test("Case 2: quiz_score_normalized=105 → exit 3 + mentions quiz_score_normalized",
       r.code === 3 && /quiz_score_normalized/.test(r.stderr),
       "exit=" + r.code + " stderr=" + r.stderr.slice(0, 200));

  // 3. quiz_cefr_band = "D1".
  p = basePayload(); p.metrics.outcome.quiz_cefr_band = "D1";
  r = run(p);
  test("Case 3: quiz_cefr_band='D1' → exit 3 + mentions quiz_cefr_band",
       r.code === 3 && /quiz_cefr_band/.test(r.stderr),
       "exit=" + r.code);

  // 4. quiz_se = -1.0.
  p = basePayload(); p.metrics.outcome.quiz_se = -1.0;
  r = run(p);
  test("Case 4: quiz_se=-1.0 → exit 3 + mentions quiz_se",
       r.code === 3 && /quiz_se/.test(r.stderr),
       "exit=" + r.code);

  // 5. quiz_completed_at = sub-day timestamp.
  p = basePayload(); p.metrics.outcome.quiz_completed_at = "2026-05-14T10:23:45Z";
  r = run(p);
  test("Case 5: quiz_completed_at sub-day → exit 3 + mentions quiz_completed_at",
       r.code === 3 && /quiz_completed_at/.test(r.stderr),
       "exit=" + r.code);

  // 6. quiz_version = "Bad Format".
  p = basePayload(); p.metrics.outcome.quiz_version = "Bad Format";
  r = run(p);
  test("Case 6: quiz_version='Bad Format' → exit 3 + mentions quiz_version",
       r.code === 3 && /quiz_version/.test(r.stderr),
       "exit=" + r.code);

  // 7. outcome_capture_method = "calibrated-quiz" — enum extended, must accept.
  p = basePayload();
  p.metrics.outcome.outcome_capture_method = "calibrated-quiz";
  r = run(p);
  test("Case 7: outcome_capture_method='calibrated-quiz' accepted (enum extended)",
       r.code === 0 && /\bOK\b/.test(r.stdout),
       "exit=" + r.code + " stderr=" + r.stderr.slice(0, 200));

  console.log(`\n[quiz-validator-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) main();
