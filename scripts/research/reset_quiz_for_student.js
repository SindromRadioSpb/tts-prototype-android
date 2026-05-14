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
    const tok = argv[i];
    if (tok === "-h") { args.help = true; continue; }
    if (!tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { args[key] = true; }
    else { args[key] = next; i++; }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  reset_quiz_for_student.js --cohort <CODE> --student-id <UUID> --reason "<text>"
    [--audit-log <path>] [--data-dir <path>] [--dry-run] [--json]

Options:
  --cohort <STR>       (required) cohort code matching ^[A-Z0-9-]{4,16}$.
  --student-id <UUID>  (required) UUID v4 of the student whose quiz outcome
                       fields will be stripped.
  --reason <STR>       (required) non-empty reason written to the audit log.
  --audit-log <PATH>   Optional override for the audit log path. Default:
                       <data-dir>/<cohort>/quiz_reset_audit.log
  --data-dir <PATH>    Optional override for RESEARCH_DATA_DIR (or set the
                       env var).
  --dry-run            Scan files + count what WOULD be stripped without
                       writing anything (jsonl preserved, audit log NOT
                       appended). Useful for previewing.
  --json               Emit a single JSON line on stdout instead of human-
                       readable output. Schema: {ok, cli, action, dry_run,
                       args, result, audit_appended, timestamp}.
  --help, -h           Show this help and exit 0.

Strips calibrated-quiz outcome fields for one student from the cohort's
jsonl payloads + appends an audit log line. Idempotent: a re-run after a
successful reset reports reset_count=0 + records the attempt in the audit
log without modifying jsonl bytes.

Fields stripped from any matching outcome object:
  quiz_score_normalized, quiz_cefr_band, quiz_se,
  quiz_completed_at, quiz_version,
  outcome_capture_method (only when ==="calibrated-quiz")

If outcome becomes empty after stripping AND metrics has no other keys,
the enclosing line is DROPPED entirely from the jsonl.

Exit codes:
  0  completed (including no-op reset and --help / --dry-run)
  1  IO error / cohort or student not found
  2  argv validation error

Examples:
  reset_quiz_for_student.js --cohort X --student-id <UUID> --reason "Student request: retake"
  reset_quiz_for_student.js --cohort X --student-id <UUID> --reason "..." --dry-run
  reset_quiz_for_student.js --cohort X --student-id <UUID> --reason "..." --json
`);
}

function emitJson(result) {
  process.stdout.write(JSON.stringify(result) + "\n");
}
function failJson(message, code, extra) {
  emitJson({ ok: false, cli: "reset_quiz_for_student", error: message, ...(extra || {}) });
  process.exit(code);
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
  // Help short-circuit BEFORE any validation so --help / -h always exits 0
  // even when required flags are absent.
  if (args.help) { printHelp(); process.exit(0); }
  const json = !!args.json;

  const cohort = args["cohort"];
  const sid = args["student-id"];
  const reason = args["reason"];
  if (!cohort || typeof cohort !== "string" || !COHORT_RE.test(cohort)) {
    if (json) failJson("Missing or invalid --cohort", 2, { field: "cohort" });
    console.error("Missing or invalid --cohort"); printHelp(); process.exit(2);
  }
  if (!sid || typeof sid !== "string" || !UUID_RE.test(sid)) {
    if (json) failJson("Missing or invalid --student-id", 2, { field: "student-id" });
    console.error("Missing or invalid --student-id"); printHelp(); process.exit(2);
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    if (json) failJson("Missing or empty --reason", 2, { field: "reason" });
    console.error("Missing or empty --reason"); printHelp(); process.exit(2);
  }
  const dryRun = !!args["dry-run"];

  const dataDir = args["data-dir"] || process.env.RESEARCH_DATA_DIR;
  if (!dataDir) {
    if (json) failJson("Missing --data-dir and RESEARCH_DATA_DIR not set", 2, { field: "data-dir" });
    console.error("Missing --data-dir and RESEARCH_DATA_DIR not set");
    process.exit(2);
  }
  const cdir = path.join(dataDir, cohort);
  if (!fs.existsSync(cdir)) {
    if (json) failJson(`Cohort directory not found: ${cdir}`, 1, { cohort, cdir });
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
      if (!dryRun) atomicWriteText(full, out.join("\n").replace(/\n+$/, "\n"));
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

  const result = {
    ok: true,
    cli: "reset_quiz_for_student",
    action: "reset",
    dry_run: dryRun,
    args: { cohort, student_id: sid, reason, audit_log: auditLogPath },
    result: {
      cohort,
      student_id: sid,
      reset_count: resetCount,
      lines_modified: linesModified,
      lines_dropped: linesDropped,
      files_touched: filesTouched,
    },
    audit_appended: dryRun ? null : auditLogPath,
    timestamp: new Date().toISOString(),
  };

  if (!dryRun) {
    fs.appendFileSync(auditLogPath, auditLine, "utf8");
  }

  if (json) { emitJson(result); process.exit(0); }

  if (dryRun) {
    console.log(`[DRY RUN] reset_quiz — no files modified.`);
    console.log(`[DRY RUN]   cohort=${cohort} student=${sid}`);
    console.log(`[DRY RUN]   would reset_count=${resetCount} (modified=${linesModified} dropped=${linesDropped} files=${filesTouched})`);
    console.log(`[DRY RUN]   would append to: ${auditLogPath}`);
    console.log(`[DRY RUN]   audit_line: ${auditLine.trimEnd()}`);
    process.exit(0);
  }

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
