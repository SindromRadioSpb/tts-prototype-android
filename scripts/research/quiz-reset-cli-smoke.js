#!/usr/bin/env node
// scripts/research/quiz-reset-cli-smoke.js — v3.3.5 C8 reset CLI smoke.
//
// 5 cases per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §13:
//   1. Reset removes quiz outcome lines from jsonl
//   2. Reset preserves other outcomes (self-report post_test_score line stays)
//   3. Reset rejects empty --reason (exit 2)
//   4. Reset appends a correctly-formatted audit log line
//   5. Reset is idempotent: second run completes with reset_count=0 and
//      does NOT re-touch the data (only appends a fresh audit entry).
//
// Pure Node — no Playwright, no server. Seeds a temp cohort dir with
// fake jsonl, invokes the CLI via spawnSync, and inspects the resulting
// files + audit log.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(REPO_ROOT, "scripts/research/reset_quiz_for_student.js");

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

function run(args, env) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT, env: { ...process.env, ...env }, encoding: "utf8",
  });
}

function seedJsonl(cdir, fname, lines) {
  const full = path.join(cdir, fname);
  fs.writeFileSync(full, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
}

function readJsonl(cdir, fname) {
  const full = path.join(cdir, fname);
  if (!fs.existsSync(full)) return [];
  return fs.readFileSync(full, "utf8")
    .split(/\r?\n/).filter(Boolean)
    .map((l) => JSON.parse(l));
}

function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "quiz-reset-smoke-"));
  const cohort = "RESETZ-V1";
  const sidA = "00000000-0000-4000-8000-0000000000aa";
  const sidB = "00000000-0000-4000-8000-0000000000bb";
  const cdir = path.join(dataDir, cohort);
  fs.mkdirSync(cdir, { recursive: true });

  // Seed two .jsonl files:
  //   - 2026-05-14.jsonl — sidA has quiz outcome only (should be dropped),
  //                        sidA has separate self-report line (should stay),
  //                        sidB has unrelated row (should stay)
  //   - 2026-05-15.jsonl — sidA has quiz outcome (should be dropped)
  const day1 = "2026-05-14";
  const day2 = "2026-05-15";
  const quizLineA1 = {
    format: "linguistpro-research-v1", student_id: sidA,
    cohort_code: cohort, upload_ts: day1, since_ts: day1, consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: {
      outcome: {
        quiz_score_normalized: 72, quiz_cefr_band: "B2", quiz_se: 0.41,
        quiz_completed_at: day1, quiz_version: "ulpan_diagnostic_v1",
        outcome_capture_method: "calibrated-quiz",
      },
    },
  };
  const selfReportA = {
    format: "linguistpro-research-v1", student_id: sidA,
    cohort_code: cohort, upload_ts: day1, since_ts: day1, consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: {
      outcome: { post_test_score: 88, outcome_capture_method: "self-report" },
    },
  };
  const unrelatedB = {
    format: "linguistpro-research-v1", student_id: sidB,
    cohort_code: cohort, upload_ts: day1, since_ts: day1, consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: { sessions_count: 4, active_minutes_real: 50 },
  };
  const quizLineA2 = {
    format: "linguistpro-research-v1", student_id: sidA,
    cohort_code: cohort, upload_ts: day2, since_ts: day2, consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: {
      outcome: {
        quiz_score_normalized: 80, quiz_cefr_band: "C1", quiz_se: 0.37,
        quiz_completed_at: day2, quiz_version: "ulpan_diagnostic_v1",
        outcome_capture_method: "calibrated-quiz",
      },
    },
  };
  seedJsonl(cdir, `${day1}.jsonl`, [quizLineA1, selfReportA, unrelatedB]);
  seedJsonl(cdir, `${day2}.jsonl`, [quizLineA2]);

  // ── Case 3 — empty reason rejected (run BEFORE the actual reset). ────
  let r = run(["--cohort", cohort, "--student-id", sidA, "--reason", "  "],
              { RESEARCH_DATA_DIR: dataDir });
  test("Case 3: empty --reason → exit 2",
       r.status === 2 && /reason/i.test(r.stderr || ""),
       "status=" + r.status + " stderr=" + (r.stderr || "").slice(0, 200));

  // Confirm nothing changed yet.
  const before1 = readJsonl(cdir, `${day1}.jsonl`);
  if (before1.length !== 3) {
    console.error("[quiz-reset-smoke] precondition failed: expected 3 lines pre-reset");
    process.exit(1);
  }

  // ── Cases 1 + 2 + 4 — real reset. ─────────────────────────────────────
  r = run(["--cohort", cohort, "--student-id", sidA, "--reason", "Test reset"],
          { RESEARCH_DATA_DIR: dataDir });
  test("Case 0 (sanity): reset exit 0 + stdout reports reset_count",
       r.status === 0 && /reset_count=2/.test(r.stdout || ""),
       "status=" + r.status + " stdout=" + (r.stdout || "").slice(0, 200));

  const after1 = readJsonl(cdir, `${day1}.jsonl`);
  const after2 = readJsonl(cdir, `${day2}.jsonl`);

  const day1HasQuizLineA = after1.some((row) =>
    row.student_id === sidA && row.metrics && row.metrics.outcome &&
    "quiz_score_normalized" in row.metrics.outcome);
  const day2HasQuizLineA = after2.some((row) =>
    row.student_id === sidA && row.metrics && row.metrics.outcome &&
    "quiz_score_normalized" in row.metrics.outcome);
  test("Case 1: quiz outcome lines for sidA removed from both day1 + day2 jsonl",
       !day1HasQuizLineA && !day2HasQuizLineA,
       "day1=" + day1HasQuizLineA + " day2=" + day2HasQuizLineA);

  const selfReportSurvived = after1.some((row) =>
    row.student_id === sidA && row.metrics && row.metrics.outcome &&
    row.metrics.outcome.post_test_score === 88);
  const unrelatedSurvived = after1.some((row) =>
    row.student_id === sidB && row.metrics && row.metrics.sessions_count === 4);
  test("Case 2: self-report row for sidA + unrelated row for sidB preserved",
       selfReportSurvived && unrelatedSurvived,
       "self=" + selfReportSurvived + " other=" + unrelatedSurvived);

  const auditPath = path.join(cdir, "quiz_reset_audit.log");
  const auditText = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, "utf8") : "";
  const auditLines = auditText.split("\n").filter(Boolean);
  const lastLine = auditLines[auditLines.length - 1] || "";
  const isoOk = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(lastLine);
  const cohortOk = lastLine.includes(`cohort=${cohort}`);
  const sidOk = lastLine.includes(`student_id=${sidA}`);
  const countOk = /reset_count=2\b/.test(lastLine);
  const reasonOk = /reason="Test reset"/.test(lastLine);
  test("Case 4: audit log line has ISO ts + cohort + student_id + reset_count + reason",
       isoOk && cohortOk && sidOk && countOk && reasonOk,
       "lastLine=" + lastLine);

  // ── Case 5 — idempotency. ─────────────────────────────────────────────
  const day1ContentBefore2nd = fs.readFileSync(path.join(cdir, `${day1}.jsonl`), "utf8");
  const day2ContentBefore2nd = fs.readFileSync(path.join(cdir, `${day2}.jsonl`), "utf8");
  r = run(["--cohort", cohort, "--student-id", sidA, "--reason", "Re-run"],
          { RESEARCH_DATA_DIR: dataDir });
  const day1ContentAfter2nd = fs.readFileSync(path.join(cdir, `${day1}.jsonl`), "utf8");
  const day2ContentAfter2nd = fs.readFileSync(path.join(cdir, `${day2}.jsonl`), "utf8");
  const auditText2 = fs.readFileSync(auditPath, "utf8");
  const auditLines2 = auditText2.split("\n").filter(Boolean);
  const idempotent = r.status === 0 &&
    /reset_count=0/.test(r.stdout || "") &&
    day1ContentAfter2nd === day1ContentBefore2nd &&
    day2ContentAfter2nd === day2ContentBefore2nd &&
    auditLines2.length === auditLines.length + 1;
  test("Case 5: second run is no-op (reset_count=0, files unchanged, audit appended)",
       idempotent,
       `status=${r.status} count_match=${/reset_count=0/.test(r.stdout || "")} ` +
       `day1_same=${day1ContentAfter2nd === day1ContentBefore2nd} ` +
       `day2_same=${day2ContentAfter2nd === day2ContentBefore2nd} ` +
       `audit_lines=${auditLines2.length} (expected ${auditLines.length + 1})`);

  console.log(`\n[quiz-reset-smoke] ${passed}/${passed + failed} passed`);
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) main();
