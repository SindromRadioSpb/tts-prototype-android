#!/usr/bin/env node
// scripts/research/reset_quiz_for_student.js — v3.3.5 D13 C8.
//
// Admin CLI: clears calibrated-quiz outcome fields for one student in
// one cohort. Used when a student needs to retake the diagnostic, or
// when the researcher needs to remove a quiz outcome (e.g. test row).
//
// Usage:
//   node scripts/research/reset_quiz_for_student.js \
//     --cohort <CODE> --student-id <UUID> --reason "<text>"
//     [--audit-log <path>]
//     [--data-dir <path>]    (defaults to RESEARCH_DATA_DIR env)
//
// Action (per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §13 reset cases):
//   1. Walk every .jsonl in the cohort dir.
//   2. For each line whose metrics.outcome contains any quiz_* key, strip
//      ALL of:   quiz_score_normalized, quiz_cefr_band, quiz_se,
//                quiz_completed_at, quiz_version
//      and also strip outcome_capture_method when it equals "calibrated-quiz".
//   3. If metrics.outcome is empty after stripping (no other outcome
//      fields like post_test_score / confidence_self_report), DROP the
//      enclosing line.
//   4. Append an audit log line in the cohort's quiz_reset_audit.log file
//      (or the path passed via --audit-log).
//
// Idempotent: if no quiz fields are present for that student, the CLI
// completes with reset_count=0 and the audit line still records the
// attempt with reset_count=0 — operators can grep for double-resets
// without errors.
//
// Exit:
//   0 — completed (including no-op reset)
//   2 — argv validation error
//   1 — IO error / cohort or student not found

"use strict";

const fs = require("fs");
const path = require("path");

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const COHORT_RE = /^[A-Z0-9-]{4,16}$/;
const QUIZ_FIELDS = [
  "quiz_score_normalized", "quiz_cefr_band", "quiz_se",
  "quiz_completed_at", "quiz_version",
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { args[key] = true; }
    else { args[key] = next; i++; }
  }
  return args;
}

function usage() {
  console.error(`Usage:
  reset_quiz_for_student.js --cohort <CODE> --student-id <UUID> --reason "<text>"
    [--audit-log <path>] [--data-dir <path>]

Strips calibrated-quiz outcome fields for one student from the cohort's
jsonl payloads + appends an audit log line.`);
}

function atomicWriteText(target, text) {
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, target);
}

function isOutcomeEmpty(out) {
  if (!out || typeof out !== "object") return true;
  const keys = Object.keys(out);
  if (keys.length === 0) return true;
  // outcome_capture_method alone is metadata; if nothing else, drop it too.
  if (keys.length === 1 && keys[0] === "outcome_capture_method") return true;
  return false;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cohort = args["cohort"];
  const sid = args["student-id"];
  const reason = args["reason"];
  if (!cohort || typeof cohort !== "string" || !COHORT_RE.test(cohort)) {
    console.error("Missing or invalid --cohort"); usage(); process.exit(2);
  }
  if (!sid || typeof sid !== "string" || !UUID_RE.test(sid)) {
    console.error("Missing or invalid --student-id"); usage(); process.exit(2);
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    console.error("Missing or empty --reason"); usage(); process.exit(2);
  }

  const dataDir = args["data-dir"] || process.env.RESEARCH_DATA_DIR;
  if (!dataDir) {
    console.error("Missing --data-dir and RESEARCH_DATA_DIR not set");
    process.exit(2);
  }
  const cdir = path.join(dataDir, cohort);
  if (!fs.existsSync(cdir)) {
    console.error(`Cohort directory not found: ${cdir}`);
    process.exit(1);
  }

  let linesScanned = 0, linesModified = 0, linesDropped = 0, filesTouched = 0;
  const filesInDir = fs.readdirSync(cdir).filter((f) => f.endsWith(".jsonl"));
  for (const fname of filesInDir) {
    const full = path.join(cdir, fname);
    const text = fs.readFileSync(full, "utf8");
    const lines = text.split(/\r?\n/);
    const out = [];
    let fileChanged = false;
    for (const line of lines) {
      if (!line) { out.push(line); continue; }
      linesScanned++;
      let row;
      try { row = JSON.parse(line); }
      catch (_) { out.push(line); continue; }
      if (row.student_id !== sid) { out.push(line); continue; }
      const outcome = row.metrics && row.metrics.outcome;
      if (!outcome) { out.push(line); continue; }
      const hasAnyQuiz = QUIZ_FIELDS.some((k) => k in outcome);
      if (!hasAnyQuiz) { out.push(line); continue; }
      // Strip quiz fields.
      for (const k of QUIZ_FIELDS) delete outcome[k];
      if (outcome.outcome_capture_method === "calibrated-quiz") {
        delete outcome.outcome_capture_method;
      }
      // Drop line if outcome now empty AND metrics had nothing else.
      if (isOutcomeEmpty(outcome)) {
        delete row.metrics.outcome;
      }
      const metricsKeys = row.metrics ? Object.keys(row.metrics) : [];
      if (metricsKeys.length === 0) {
        linesDropped++; fileChanged = true; continue;
      }
      linesModified++; fileChanged = true;
      out.push(JSON.stringify(row));
    }
    if (fileChanged) {
      atomicWriteText(full, out.join("\n").replace(/\n+$/, "\n"));
      filesTouched++;
    }
  }

  const resetCount = linesModified + linesDropped;
  const auditLogPath = args["audit-log"] || path.join(cdir, "quiz_reset_audit.log");
  const auditLine = [
    new Date().toISOString(),
    `cohort=${cohort}`,
    `student_id=${sid}`,
    `reset_count=${resetCount}`,
    `lines_modified=${linesModified}`,
    `lines_dropped=${linesDropped}`,
    `files_touched=${filesTouched}`,
    `reason=${JSON.stringify(reason)}`,
  ].join(" ") + "\n";
  fs.appendFileSync(auditLogPath, auditLine, "utf8");

  console.log(`[reset_quiz] cohort=${cohort} student=${sid} reset_count=${resetCount} ` +
              `(modified=${linesModified} dropped=${linesDropped} files=${filesTouched})`);
  console.log(`[reset_quiz] audit appended: ${auditLogPath}`);
  process.exit(0);
}

if (require.main === module) {
  try { main(); }
  catch (e) {
    console.error("[reset_quiz] fatal:", (e && e.message) || e);
    process.exit(1);
  }
}
