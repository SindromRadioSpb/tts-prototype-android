#!/usr/bin/env node
// scripts/research/admin-cli-flags-smoke.js — admin CLI maturity smoke.
//
// Verifies cross-CLI flag standardization shipped in the polish pass:
//   - All 4 admin CLIs (rotate_token, link_student_ids,
//     reset_quiz_for_student, validate-cli) accept --help and -h,
//     exit 0, print non-empty stdout.
//   - --help short-circuits BEFORE argv validation (so missing required
//     flags don't mask the help output).
//   - The 3 destructive CLIs (rotate_token, link_student_ids,
//     reset_quiz_for_student) accept --dry-run and never modify
//     filesystem state when it's set, but still produce a clear
//     "[DRY RUN]" stdout report.
//
// Total: 16 cases. Pure Node — seeds a temp data dir, snapshots file
// contents/mtimes, runs CLIs with --dry-run, re-snapshots to verify
// no state changed.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLIS = {
  rotate:   path.join(REPO_ROOT, "scripts/research/rotate_token.js"),
  link:     path.join(REPO_ROOT, "scripts/research/link_student_ids.js"),
  reset:    path.join(REPO_ROOT, "scripts/research/reset_quiz_for_student.js"),
  validate: path.join(REPO_ROOT, "scripts/research/validate-cli.js"),
};

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

function run(cliPath, args, env) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: REPO_ROOT, env: { ...process.env, ...env }, encoding: "utf8",
  });
}

function snapshot(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false };
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    sha: crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"),
  };
}

function snapshotsEqual(a, b) {
  if (!a.exists && !b.exists) return true;
  if (a.exists !== b.exists) return false;
  return a.size === b.size && a.sha === b.sha;
}

function provisionCohortForLink(dataDir, cohort) {
  const cdir = path.join(dataDir, cohort);
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, "cohort_meta.json"), JSON.stringify({
    code: cohort, schema_version: "v1", created_at: new Date().toISOString(),
    k_anonymity_threshold: 1, retention_until: "2028-12-31",
    outcome_scale: "0-100", consent_version_minimum: "1.0",
    researcher_token_hash: crypto.createHash("sha256").update("seed").digest("hex"),
  }, null, 2));
  return cdir;
}

function seedJsonlForReset(cdir) {
  const sidA = "00000000-0000-4000-8000-0000000000aa";
  const day = "2026-05-15";
  const line = {
    format: "linguistpro-research-v1", student_id: sidA,
    cohort_code: path.basename(cdir), upload_ts: day, since_ts: day,
    consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: {
      outcome: {
        quiz_score_normalized: 72, quiz_cefr_band: "B2", quiz_se: 0.41,
        quiz_completed_at: day, quiz_version: "ulpan_diagnostic_v1",
        outcome_capture_method: "calibrated-quiz",
      },
    },
  };
  fs.writeFileSync(path.join(cdir, `${day}.jsonl`), JSON.stringify(line) + "\n", "utf8");
  return { sidA, day };
}

function seedJsonlForLink(cdir) {
  const sidA = "00000000-0000-4000-8000-0000000000aa";  // primary
  const sidB = "00000000-0000-4000-8000-0000000000bb";  // secondary
  const day = "2026-05-15";
  const line = {
    format: "linguistpro-research-v1", student_id: sidB,
    cohort_code: path.basename(cdir), upload_ts: day, since_ts: day,
    consent_version: "1.0",
    context: { app_version: "3.3.5", platform: "web/desktop" },
    metrics: { sessions_count: 1, active_minutes_real: 15 },
  };
  fs.writeFileSync(path.join(cdir, `${day}.jsonl`), JSON.stringify(line) + "\n", "utf8");
  return { sidA, sidB, day };
}

function main() {
  // ── Case bundle 1: --help across all 4 CLIs ──────────────────────────
  for (const [name, cli] of Object.entries(CLIS)) {
    const r = run(cli, ["--help"]);
    test(`${name}: --help → exit 0 + non-empty stdout`,
         r.status === 0 && (r.stdout || "").trim().length > 50,
         `exit=${r.status} stdoutLen=${(r.stdout || "").length}`);
  }

  // ── Case bundle 2: -h short alias across all 4 CLIs ──────────────────
  for (const [name, cli] of Object.entries(CLIS)) {
    const r = run(cli, ["-h"]);
    test(`${name}: -h alias → exit 0 + identical-shape stdout`,
         r.status === 0 && (r.stdout || "").trim().length > 50,
         `exit=${r.status}`);
  }

  // ── Case bundle 3: --help short-circuits BEFORE argv validation ──────
  // I.e. running --help WITHOUT any required flags still exits 0.
  // (The pre-fix behavior: reset_quiz_for_student.js --help → exit 2.)
  for (const [name, cli] of Object.entries(CLIS)) {
    const r = run(cli, ["--help"]);
    test(`${name}: --help works even WITHOUT required flags (no validation race)`,
         r.status === 0,
         `exit=${r.status} stderr=${(r.stderr || "").slice(0, 100)}`);
  }

  // ── Case bundle 4: --dry-run on rotate_token preserves cohort_meta.json + deletions.log ──
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-cli-flags-"));
  const cohortRotate = "DRYRUN-RT";
  const cdirRotate = provisionCohortForLink(dataDir, cohortRotate);
  const metaPath = path.join(cdirRotate, "cohort_meta.json");
  const logPath  = path.join(cdirRotate, "deletions.log");
  const metaBefore = snapshot(metaPath);
  const logBefore  = snapshot(logPath);

  const rRotate = run(CLIS.rotate, [
    "--cohort", cohortRotate, "--reason", "smoke-dryrun", "--dry-run",
  ], { RESEARCH_DATA_DIR: dataDir });

  const metaAfter = snapshot(metaPath);
  const logAfter  = snapshot(logPath);
  test("rotate_token --dry-run → exit 0",
       rRotate.status === 0,
       `exit=${rRotate.status} stderr=${(rRotate.stderr || "").slice(0, 150)}`);
  test("rotate_token --dry-run → stdout has '[DRY RUN]' marker",
       /\[DRY RUN\]/.test(rRotate.stdout || ""),
       `stdout=${(rRotate.stdout || "").slice(0, 100)}`);
  test("rotate_token --dry-run → cohort_meta.json unchanged",
       snapshotsEqual(metaBefore, metaAfter),
       `before.sha=${metaBefore.sha} after.sha=${metaAfter.sha}`);
  test("rotate_token --dry-run → deletions.log NOT created",
       !logAfter.exists && !logBefore.exists,
       `before=${logBefore.exists} after=${logAfter.exists}`);

  // ── Case bundle 5: --dry-run on link_student_ids preserves jsonl + deletions.log ──
  const cohortLink = "DRYRUN-LN";
  const cdirLink = provisionCohortForLink(dataDir, cohortLink);
  const linkSids = seedJsonlForLink(cdirLink);
  const jsonlPath = path.join(cdirLink, `${linkSids.day}.jsonl`);
  const linkLogPath = path.join(cdirLink, "deletions.log");
  const jsonlBefore = snapshot(jsonlPath);
  const linkLogBefore = snapshot(linkLogPath);

  const rLink = run(CLIS.link, [
    "--cohort", cohortLink,
    "--primary", linkSids.sidA,
    "--secondary", linkSids.sidB,
    "--reason", "smoke-dryrun",
    "--dry-run",
  ], { RESEARCH_DATA_DIR: dataDir });

  const jsonlAfter = snapshot(jsonlPath);
  const linkLogAfter = snapshot(linkLogPath);
  test("link_student_ids --dry-run → exit 0",
       rLink.status === 0,
       `exit=${rLink.status} stderr=${(rLink.stderr || "").slice(0, 200)}`);
  test("link_student_ids --dry-run → stdout has '[DRY RUN]' marker",
       /\[DRY RUN\]/.test(rLink.stdout || ""),
       `stdout=${(rLink.stdout || "").slice(0, 100)}`);
  test("link_student_ids --dry-run → jsonl unchanged",
       snapshotsEqual(jsonlBefore, jsonlAfter),
       `before.sha=${jsonlBefore.sha} after.sha=${jsonlAfter.sha}`);
  test("link_student_ids --dry-run → deletions.log NOT appended",
       snapshotsEqual(linkLogBefore, linkLogAfter),
       `before=${linkLogBefore.exists} after=${linkLogAfter.exists}`);

  // ── Case bundle 6: --dry-run on reset_quiz preserves jsonl + audit log ──
  const cohortReset = "DRYRUN-RS";
  const cdirReset = provisionCohortForLink(dataDir, cohortReset);
  const resetIds = seedJsonlForReset(cdirReset);
  const resetJsonlPath = path.join(cdirReset, `${resetIds.day}.jsonl`);
  const resetAuditPath = path.join(cdirReset, "quiz_reset_audit.log");
  const resetJsonlBefore = snapshot(resetJsonlPath);
  const resetAuditBefore = snapshot(resetAuditPath);

  const rReset = run(CLIS.reset, [
    "--cohort", cohortReset,
    "--student-id", resetIds.sidA,
    "--reason", "smoke-dryrun",
    "--dry-run",
  ], { RESEARCH_DATA_DIR: dataDir });

  const resetJsonlAfter = snapshot(resetJsonlPath);
  const resetAuditAfter = snapshot(resetAuditPath);
  test("reset_quiz --dry-run → exit 0",
       rReset.status === 0,
       `exit=${rReset.status} stderr=${(rReset.stderr || "").slice(0, 200)}`);
  test("reset_quiz --dry-run → stdout has '[DRY RUN]' marker",
       /\[DRY RUN\]/.test(rReset.stdout || ""),
       `stdout=${(rReset.stdout || "").slice(0, 100)}`);
  test("reset_quiz --dry-run → jsonl unchanged",
       snapshotsEqual(resetJsonlBefore, resetJsonlAfter),
       `before.sha=${resetJsonlBefore.sha} after.sha=${resetJsonlAfter.sha}`);
  test("reset_quiz --dry-run → quiz_reset_audit.log NOT created",
       !resetAuditAfter.exists && !resetAuditBefore.exists,
       `before=${resetAuditBefore.exists} after=${resetAuditAfter.exists}`);

  // ── Case bundle 7: --json output shape across destructive CLIs ───────
  //
  // For each CLI: --json --dry-run produces ONE parseable JSON line on
  // stdout with the standardized shape, ok=true, cli, action, dry_run,
  // args, result, audit_appended=null (since dry-run), timestamp ISO.

  function parseJsonStdout(stdout) {
    const lines = String(stdout || "").split(/\r?\n/).filter(Boolean);
    // First parseable line wins. The CLI is supposed to emit exactly one.
    for (const line of lines) {
      try { return JSON.parse(line); } catch (_) {}
    }
    return null;
  }

  // rotate_token --json --dry-run on a freshly provisioned cohort.
  const cohortRotJson = "DRYJSN-RT";
  provisionCohortForLink(dataDir, cohortRotJson);
  const rRotJson = run(CLIS.rotate,
    ["--cohort", cohortRotJson, "--reason", "smoke", "--dry-run", "--json"],
    { RESEARCH_DATA_DIR: dataDir });
  const rotJson = parseJsonStdout(rRotJson.stdout);
  test("rotate_token --json --dry-run → exit 0 + parseable JSON",
       rRotJson.status === 0 && rotJson && rotJson.ok === true,
       `exit=${rRotJson.status} parseable=${!!rotJson}`);
  test("rotate_token --json → schema {cli, action, dry_run, args, result, audit_appended, timestamp}",
       rotJson &&
       rotJson.cli === "rotate_token" &&
       rotJson.action === "rotate" &&
       rotJson.dry_run === true &&
       typeof rotJson.args === "object" &&
       typeof rotJson.result === "object" &&
       rotJson.audit_appended === null &&
       /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rotJson.timestamp || ""),
       JSON.stringify({ cli: rotJson && rotJson.cli, action: rotJson && rotJson.action }));
  test("rotate_token --json result has new_token_plaintext + new_hash_full",
       rotJson && rotJson.result &&
       typeof rotJson.result.new_token_plaintext === "string" &&
       rotJson.result.new_token_plaintext.length >= 16 &&
       typeof rotJson.result.new_hash_full === "string" &&
       rotJson.result.new_hash_full.length === 64);

  // link_student_ids --json --dry-run.
  const cohortLinkJson = "DRYJSN-LN";
  const cdirLinkJson = provisionCohortForLink(dataDir, cohortLinkJson);
  const linkJsonIds = seedJsonlForLink(cdirLinkJson);
  const rLinkJson = run(CLIS.link, [
    "--cohort", cohortLinkJson,
    "--primary", linkJsonIds.sidA,
    "--secondary", linkJsonIds.sidB,
    "--reason", "smoke", "--dry-run", "--json",
  ], { RESEARCH_DATA_DIR: dataDir });
  const linkJson = parseJsonStdout(rLinkJson.stdout);
  test("link_student_ids --json --dry-run → exit 0 + parseable JSON, ok=true",
       rLinkJson.status === 0 && linkJson && linkJson.ok === true && linkJson.cli === "link_student_ids",
       `exit=${rLinkJson.status} parseable=${!!linkJson}`);
  test("link_student_ids --json result counts rows_relocated + files_touched",
       linkJson && linkJson.result &&
       Number.isInteger(linkJson.result.rows_relocated) &&
       Number.isInteger(linkJson.result.files_touched) &&
       linkJson.result.rows_relocated >= 1,
       JSON.stringify(linkJson && linkJson.result));

  // reset_quiz --json --dry-run.
  const cohortResetJson = "DRYJSN-RS";
  const cdirResetJson = provisionCohortForLink(dataDir, cohortResetJson);
  const resetJsonIds = seedJsonlForReset(cdirResetJson);
  const rResetJson = run(CLIS.reset, [
    "--cohort", cohortResetJson,
    "--student-id", resetJsonIds.sidA,
    "--reason", "smoke", "--dry-run", "--json",
  ], { RESEARCH_DATA_DIR: dataDir });
  const resetJson = parseJsonStdout(rResetJson.stdout);
  test("reset_quiz --json --dry-run → exit 0 + parseable JSON, ok=true",
       rResetJson.status === 0 && resetJson && resetJson.ok === true && resetJson.cli === "reset_quiz_for_student",
       `exit=${rResetJson.status} parseable=${!!resetJson}`);
  test("reset_quiz --json result has reset_count + lines_modified + files_touched",
       resetJson && resetJson.result &&
       Number.isInteger(resetJson.result.reset_count) &&
       Number.isInteger(resetJson.result.lines_modified) &&
       Number.isInteger(resetJson.result.files_touched) &&
       resetJson.result.reset_count >= 1,
       JSON.stringify(resetJson && resetJson.result));

  // ── Case bundle 8: --json error paths emit {ok:false} with non-zero exit ──
  const rRotErr = run(CLIS.rotate, ["--json"], { RESEARCH_DATA_DIR: dataDir });
  const rotErrJson = parseJsonStdout(rRotErr.stdout);
  test("rotate_token missing --cohort + --json → exit 2 + ok:false JSON",
       rRotErr.status === 2 && rotErrJson && rotErrJson.ok === false &&
       /cohort/.test(rotErrJson.error || ""),
       `exit=${rRotErr.status} json=${JSON.stringify(rotErrJson)}`);

  const rLinkErr = run(CLIS.link, ["--json"], { RESEARCH_DATA_DIR: dataDir });
  const linkErrJson = parseJsonStdout(rLinkErr.stdout);
  test("link_student_ids missing flags + --json → exit 2 + ok:false JSON with missing[]",
       rLinkErr.status === 2 && linkErrJson && linkErrJson.ok === false &&
       Array.isArray(linkErrJson.missing) && linkErrJson.missing.length >= 1,
       `exit=${rLinkErr.status} json=${JSON.stringify(linkErrJson)}`);

  const rResetErr = run(CLIS.reset, ["--json"], { RESEARCH_DATA_DIR: dataDir });
  const resetErrJson = parseJsonStdout(rResetErr.stdout);
  test("reset_quiz missing --cohort + --json → exit 2 + ok:false JSON",
       rResetErr.status === 2 && resetErrJson && resetErrJson.ok === false &&
       /cohort/i.test(resetErrJson.error || ""),
       `exit=${rResetErr.status} json=${JSON.stringify(resetErrJson)}`);

  // ── Case bundle 9: --json real write writes audit_appended path ──
  // rotate_token without --dry-run should report audit_appended set.
  const cohortRealJson = "REALJSN-RT";
  provisionCohortForLink(dataDir, cohortRealJson);
  const rRotReal = run(CLIS.rotate,
    ["--cohort", cohortRealJson, "--reason", "smoke-real", "--json"],
    { RESEARCH_DATA_DIR: dataDir });
  const rotRealJson = parseJsonStdout(rRotReal.stdout);
  const realAuditExists = rotRealJson && rotRealJson.audit_appended &&
                           fs.existsSync(rotRealJson.audit_appended);
  test("rotate_token --json (no --dry-run) → audit_appended path is set AND file exists",
       rRotReal.status === 0 && rotRealJson && rotRealJson.dry_run === false && realAuditExists,
       `audit_appended=${rotRealJson && rotRealJson.audit_appended} exists=${realAuditExists}`);

  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n[admin-cli-flags-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) main();
