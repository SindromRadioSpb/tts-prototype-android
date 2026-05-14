#!/usr/bin/env node
// scripts/research/link_student_ids.js — Workstream A3 (v3.3.1, CLI part only).
//
// Manual researcher-side merging of two anonymous student IDs that
// belong to the SAME real person (e.g. a student who used LinguistPro
// on their desktop and their PWA-installed phone, generating two
// independent localStorage UUIDs).
//
// The CLI is the only path shipped in v3.3.1 — per the v3.3 master plan
// D-decision and the user constraint ("if current UI cannot display
// one-time pass codes on both devices, implement only the CLI/protocol/
// audit-log part in v3.3.1 and defer student-facing UI to a later patch").
//
// Protocol design for the deferred in-app companion (specified here so
// the CLI can be wired up to it later without changing semantics):
//
//   1. The student opens 📊 Research panel on Device A and clicks an
//      eventual "🔗 Link with another device" button. Client generates
//      a 6-digit OTP, stores it locally with a 10-minute TTL, displays
//      it on screen alongside the student_id (anonymous UUID).
//   2. Student opens the same flow on Device B, types the OTP from
//      Device A, sees Device A's student_id_prefix for a visual sanity
//      check, and confirms.
//   3. Device B sends a research-channel message to the researcher
//      (out-of-band — Telegram, email, etc. — exact transport TBD)
//      naming PRIMARY=DeviceA's student_id, SECONDARY=DeviceB's
//      student_id, OTP=the 6 digits.
//   4. Researcher verifies the OTP matches what the student stated, then
//      runs THIS CLI to perform the merge.
//
// In v3.3.1 we ship steps 3-4 ONLY (the manual researcher CLI). Steps
// 1-2 (the in-app OTP UI) defer to a later patch when there's an
// established student-researcher communication channel for step 3.
//
// CLI behavior:
//   1. Read <RESEARCH_DATA_DIR>/<cohort>/cohort_meta.json (must exist).
//   2. Walk every <date>.jsonl in the cohort dir; rewrite each line
//      where student_id === secondary so student_id = primary. Counts
//      relocated rows.
//   3. Rewrite outcomes.csv if present: any row with student_id ===
//      secondary is rewritten to primary. If primary already has an
//      outcome row, the secondary's row is dropped (NOT merged — the
//      first outcome wins; merging is too error-prone). Counts dropped
//      conflicts.
//   4. Append a structured line to <cohort>/deletions.log naming the
//      operation, the IDs, the count, and the operator-provided reason.
//   5. Print a summary to stdout.
//
// The merge is one-way: primary STAYS, secondary VANISHES. Choose primary
// = the ID the student wants to keep (usually their main / oldest device).
//
// Usage:
//   node scripts/research/link_student_ids.js --cohort <CODE> \
//                                              --primary <uuid> \
//                                              --secondary <uuid> \
//                                              --reason "<text>" \
//                                              [--otp <6-digits>]
//
// Exits:
//   0 — merge succeeded
//   1 — IO error or cohort/student not found
//   2 — argv validation error

"use strict";

const fs = require("fs");
const path = require("path");

const {
  cohortDir, cohortMetaPath, cohortExists,
} = require("../../research/storage");

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const OTP_RE = /^[0-9]{6}$/;

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
  node scripts/research/link_student_ids.js \\
       --cohort <CODE> --primary <uuid> --secondary <uuid> --reason "<text>" \\
       [--otp <6 digits>] [--dry-run] [--json]

Options:
  --cohort <STR>     (required) cohort code.
  --primary <UUID>   (required) UUID kept after the link.
  --secondary <UUID> (required) UUID whose rows relocate to primary.
  --reason <STR>     (required) audit reason written to deletions.log.
  --otp <DIGITS>     Optional 6-digit OTP — captured in audit log but
                     NOT verified by the CLI (out-of-band verification).
  --dry-run          Scan jsonl + outcomes.csv to count what WOULD relocate,
                     but write nothing. Useful for previewing a merge.
  --json             Emit a single JSON line on stdout instead of human-
                     readable output. Schema: {ok, cli, action, dry_run,
                     args, result, audit_appended, timestamp}.
  --help, -h         Show this help and exit 0.

Notes:
  - The operation is one-way: primary stays, secondary's rows are
    relocated to primary. If both have outcome rows, primary wins.
  - --dry-run never writes any file (jsonl preserved, outcomes.csv
    preserved, deletions.log NOT appended).

Exit codes:
  0  succeeded (or --help / --dry-run)
  1  IO / cohort / student-not-found / no rows relocated
  2  argv validation error

Examples:
  link_student_ids.js --cohort X --primary a... --secondary b... --reason "duplicate signup"
  link_student_ids.js --cohort X --primary a... --secondary b... --reason "..." --dry-run
  link_student_ids.js --cohort X --primary a... --secondary b... --reason "..." --json
`);
}

function emitJson(result) {
  process.stdout.write(JSON.stringify(result) + "\n");
}
function failJson(message, code, extra) {
  emitJson({ ok: false, cli: "link_student_ids", error: message, ...(extra || {}) });
  process.exit(code);
}

function atomicWriteText(target, text) {
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, target);
}

// Walk every .jsonl file in the cohort dir, rewriting lines that match
// student_id === secondary to use primary. Returns { rows_relocated,
// files_touched }. When dryRun=true, scans + counts identically but
// skips the file rewrite.
function rewriteJsonlFiles(cdir, primary, secondary, dryRun = false) {
  if (!fs.existsSync(cdir)) return { rows_relocated: 0, files_touched: 0 };
  let rowsRelocated = 0, filesTouched = 0;
  for (const fname of fs.readdirSync(cdir)) {
    if (!fname.endsWith(".jsonl")) continue;
    const full = path.join(cdir, fname);
    const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
    let changed = false;
    const out = [];
    for (const line of lines) {
      if (!line) { out.push(line); continue; }
      let row;
      try { row = JSON.parse(line); }
      catch (_) { out.push(line); continue; }
      if (row.student_id === secondary) {
        row.student_id = primary;
        rowsRelocated++;
        changed = true;
        out.push(JSON.stringify(row));
      } else {
        out.push(line);
      }
    }
    if (changed) {
      if (!dryRun) atomicWriteText(full, out.join("\n").replace(/\n+$/, "\n"));
      filesTouched++;
    }
  }
  return { rows_relocated: rowsRelocated, files_touched: filesTouched };
}

// Rewrite outcomes.csv if present. Returns { outcomes_relocated,
// outcomes_dropped_conflict }. When dryRun=true, counts identically
// but skips the file rewrite.
function rewriteOutcomesCsv(cdir, primary, secondary, dryRun = false) {
  const target = path.join(cdir, "outcomes.csv");
  if (!fs.existsSync(target)) return { outcomes_relocated: 0, outcomes_dropped_conflict: 0 };
  const text = fs.readFileSync(target, "utf8");
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { outcomes_relocated: 0, outcomes_dropped_conflict: 0 };
  const header = lines[0];
  // Find student_id column index.
  const cols = header.split(",").map((s) => s.trim());
  const idx = cols.indexOf("student_id");
  if (idx < 0) return { outcomes_relocated: 0, outcomes_dropped_conflict: 0 };

  // First pass: detect whether primary already has a row.
  let primaryHasRow = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(",");
    if ((cells[idx] || "").trim() === primary) { primaryHasRow = true; break; }
  }

  let relocated = 0, dropped = 0;
  const out = [header];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) { out.push(line); continue; }
    const cells = line.split(",");
    if ((cells[idx] || "").trim() === secondary) {
      if (primaryHasRow) { dropped++; continue; } // skip — primary wins
      cells[idx] = primary;
      out.push(cells.join(","));
      relocated++;
    } else {
      out.push(line);
    }
  }
  if ((relocated > 0 || dropped > 0) && !dryRun) {
    atomicWriteText(target, out.join("\n").replace(/\n+$/, "") + "\n");
  }
  return { outcomes_relocated: relocated, outcomes_dropped_conflict: dropped };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }
  const json = !!args.json;
  if (!args.cohort || !args.primary || !args.secondary || !args.reason) {
    const missing = ["cohort", "primary", "secondary", "reason"].filter((k) => !args[k]);
    if (json) failJson(`missing required flag(s): ${missing.map((k) => "--" + k).join(", ")}`, 2, { missing });
    console.error(`error: missing required flag(s): ${missing.map((k) => "--" + k).join(", ")}`);
    printHelp();
    process.exit(2);
  }
  const dryRun = !!args["dry-run"];

  const code = String(args.cohort).trim();
  const primary = String(args.primary).trim();
  const secondary = String(args.secondary).trim();
  const reason = String(args.reason);
  const otp = args.otp ? String(args.otp).trim() : null;

  if (!UUID_RE.test(primary)) {
    if (json) failJson("--primary not UUID-shaped", 2, { field: "primary", value: primary });
    console.error("error: --primary not UUID-shaped"); process.exit(2);
  }
  if (!UUID_RE.test(secondary)) {
    if (json) failJson("--secondary not UUID-shaped", 2, { field: "secondary", value: secondary });
    console.error("error: --secondary not UUID-shaped"); process.exit(2);
  }
  if (primary === secondary) {
    if (json) failJson("--primary === --secondary", 2);
    console.error("error: --primary === --secondary"); process.exit(2);
  }
  if (otp !== null && !OTP_RE.test(otp)) {
    if (json) failJson("--otp must be 6 decimal digits", 2, { field: "otp" });
    console.error("error: --otp must be 6 decimal digits"); process.exit(2);
  }

  if (!cohortExists(code)) {
    if (json) failJson(`cohort "${code}" not found`, 1, { cohort: code, meta_path: cohortMetaPath(code) });
    console.error(`error: cohort "${code}" not found at ${cohortMetaPath(code)}`);
    process.exit(1);
  }

  const cdir = cohortDir(code);
  const jsonlSummary    = rewriteJsonlFiles(cdir, primary, secondary, dryRun);
  const outcomesSummary = rewriteOutcomesCsv(cdir, primary, secondary, dryRun);

  const totalAffected =
    jsonlSummary.rows_relocated +
    outcomesSummary.outcomes_relocated +
    outcomesSummary.outcomes_dropped_conflict;

  if (totalAffected === 0) {
    if (json) {
      failJson(`no rows found for secondary student_id=${secondary} in cohort ${code}`, 1,
               { cohort: code, primary, secondary, dry_run: dryRun, total_affected: 0 });
    }
    console.error(`warning: no rows found for secondary student_id=${secondary.slice(0,8)}… in cohort ${code}`);
    // not a hard fail — but exit non-zero so calling automation knows
    process.exit(1);
  }

  // Audit log.
  const ts = new Date().toISOString();
  const reasonEscaped = JSON.stringify(reason);
  const auditLine =
    `${ts} student_link cohort=${code} primary=${primary} secondary=${secondary} ` +
    `rows_relocated=${jsonlSummary.rows_relocated} ` +
    `outcomes_relocated=${outcomesSummary.outcomes_relocated} ` +
    `outcomes_dropped=${outcomesSummary.outcomes_dropped_conflict} ` +
    `files_touched=${jsonlSummary.files_touched} ` +
    `otp=${otp || "—"} reason=${reasonEscaped}\n`;

  const auditLogPath = path.join(cdir, "deletions.log");
  const result = {
    ok: true,
    cli: "link_student_ids",
    action: "link",
    dry_run: dryRun,
    args: { cohort: code, primary, secondary, reason, otp: otp || null },
    result: {
      cohort: code,
      primary,
      secondary,
      rows_relocated: jsonlSummary.rows_relocated,
      files_touched: jsonlSummary.files_touched,
      outcomes_relocated: outcomesSummary.outcomes_relocated,
      outcomes_dropped_conflict: outcomesSummary.outcomes_dropped_conflict,
    },
    audit_appended: dryRun ? null : auditLogPath,
    timestamp: ts,
  };

  if (!dryRun) {
    fs.appendFileSync(auditLogPath, auditLine, "utf8");
  }

  if (json) { emitJson(result); process.exit(0); }

  if (dryRun) {
    console.log("[DRY RUN] link_student_ids — no files modified.");
    console.log(`[DRY RUN]   cohort:                  ${code}`);
    console.log(`[DRY RUN]   primary (would keep):    ${primary}`);
    console.log(`[DRY RUN]   secondary (would move):  ${secondary}`);
    console.log(`[DRY RUN]   jsonl rows would relocate:    ${jsonlSummary.rows_relocated}`);
    console.log(`[DRY RUN]   jsonl files would touch:      ${jsonlSummary.files_touched}`);
    console.log(`[DRY RUN]   outcomes would relocate:      ${outcomesSummary.outcomes_relocated}`);
    console.log(`[DRY RUN]   outcomes would drop:          ${outcomesSummary.outcomes_dropped_conflict}`);
    console.log(`[DRY RUN]   would append to audit log:    ${auditLogPath}`);
    console.log(`[DRY RUN]   audit_line:                   ${auditLine.trimEnd()}`);
    process.exit(0);
  }

  console.log("Student IDs linked:");
  console.log(`  cohort:                  ${code}`);
  console.log(`  primary (kept):          ${primary}`);
  console.log(`  secondary (relocated):   ${secondary}`);
  console.log(`  jsonl rows relocated:    ${jsonlSummary.rows_relocated}`);
  console.log(`  jsonl files touched:     ${jsonlSummary.files_touched}`);
  console.log(`  outcomes relocated:      ${outcomesSummary.outcomes_relocated}`);
  console.log(`  outcomes dropped:        ${outcomesSummary.outcomes_dropped_conflict}`);
  console.log(`  audit_log:               ${auditLogPath}`);
  console.log("");
  console.log("Reverse the merge by running DELETE /api/research/v1/student/<secondary>");
  console.log("only if you specifically want to purge the SECONDARY id's traces — they");
  console.log("are already relocated to primary.");
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("link_student_ids failed:", e && e.message ? e.message : e); process.exit(1); }
}
