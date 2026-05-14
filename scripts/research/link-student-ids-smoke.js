#!/usr/bin/env node
// scripts/research/link-student-ids-smoke.js — A3 happy-path smoke (v3.3.1).
//
// Verifies link_student_ids.js round-trip:
//   1. Provision cohort.
//   2. Seed 2 students: primary (2 jsonl rows + 1 outcome), secondary
//      (1 jsonl row + 1 outcome with DIFFERENT score).
//   3. Run link CLI with --otp 123456 and --reason "smoke test".
//   4. Verify secondary's jsonl row is now primary's (3 primary rows).
//   5. Verify secondary's outcome was DROPPED (primary already has one;
//      primary wins per CLI semantics).
//   6. Verify deletions.log captured the merge with OTP + reason.
//
// Exits 0 on success, 1 on any failure.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(REPO_ROOT, "scripts/research/link_student_ids.js");

function uuid4() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function provisionCohort(researchDir, code) {
  const cdir = path.join(researchDir, code);
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, "cohort_meta.json"), JSON.stringify({
    code, schema_version: "v1", created_at: new Date().toISOString(),
    k_anonymity_threshold: 5, retention_until: "2028-12-31",
    outcome_scale: "0-100", consent_version_minimum: "1.0",
    researcher_token_hash: crypto.createHash("sha256").update("smoke").digest("hex"),
  }, null, 2));
  return cdir;
}

function payload(sid, code, date) {
  return JSON.stringify({
    format: "linguistpro-research-v1",
    student_id: sid, cohort_code: code,
    upload_ts: date, since_ts: date,
    consent_version: "1.0",
    context: { app_version: "3.3.1", platform: "web/desktop" },
    metrics: { sessions_count: 2, active_minutes_real: 20 },
  });
}

function main() {
  const researchDir = fs.mkdtempSync(path.join(os.tmpdir(), "link-smoke-"));
  const code = "LINK-SMOKE";
  const cdir = provisionCohort(researchDir, code);

  const primary = uuid4();
  const secondary = uuid4();

  // Seed jsonl: 2 rows for primary on 2026-05-12, 1 row for secondary on 2026-05-13.
  fs.writeFileSync(path.join(cdir, "2026-05-12.jsonl"),
    payload(primary, code, "2026-05-12") + "\n" +
    payload(primary, code, "2026-05-12") + "\n");
  fs.writeFileSync(path.join(cdir, "2026-05-13.jsonl"),
    payload(secondary, code, "2026-05-13") + "\n");

  // Seed outcomes: BOTH primary AND secondary have outcome rows (with
  // different scores) → on merge, primary's wins.
  fs.writeFileSync(path.join(cdir, "outcomes.csv"),
    "student_id,pre_test_score,post_test_score,exam_date,uploaded_by\n" +
    `${primary},65,80,2026-05-15,teacher\n` +
    `${secondary},60,75,2026-05-15,teacher\n`);

  let passed = 0, failed = 0;
  const test = (name, cond, extra) => {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
  };

  // Run CLI.
  const r = spawnSync(process.execPath, [
    CLI, "--cohort", code, "--primary", primary, "--secondary", secondary,
    "--otp", "123456", "--reason", "smoke test",
  ], {
    cwd: REPO_ROOT,
    env: { ...process.env, RESEARCH_DATA_DIR: researchDir },
    encoding: "utf8",
  });

  test("CLI exit code = 0", r.status === 0,
       "exit=" + r.status + " stderr=" + (r.stderr || "").slice(0, 200));

  // Verify jsonl: 2026-05-13.jsonl now references primary, not secondary.
  const may13 = fs.readFileSync(path.join(cdir, "2026-05-13.jsonl"), "utf8").trim();
  test("2026-05-13.jsonl no longer contains secondary id",
       !may13.includes(secondary), "still: " + may13.slice(0, 200));
  test("2026-05-13.jsonl now contains primary id",
       may13.includes(primary));

  // Count total rows attributed to primary.
  let primaryRows = 0, secondaryRows = 0;
  for (const fname of fs.readdirSync(cdir)) {
    if (!fname.endsWith(".jsonl")) continue;
    const lines = fs.readFileSync(path.join(cdir, fname), "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      const row = JSON.parse(line);
      if (row.student_id === primary) primaryRows++;
      if (row.student_id === secondary) secondaryRows++;
    }
  }
  test("primary now has 3 jsonl rows (2 original + 1 relocated)",
       primaryRows === 3, "got " + primaryRows);
  test("secondary has 0 jsonl rows after link",
       secondaryRows === 0, "got " + secondaryRows);

  // Verify outcomes.csv: secondary's row was DROPPED (primary already had one).
  const outcomes = fs.readFileSync(path.join(cdir, "outcomes.csv"), "utf8");
  test("outcomes.csv no longer contains secondary id",
       !outcomes.includes(secondary));
  test("outcomes.csv still contains primary row (preserved score=80)",
       outcomes.includes(primary) && outcomes.includes(",80,"));

  // Verify deletions.log audit.
  const audit = fs.readFileSync(path.join(cdir, "deletions.log"), "utf8");
  test("deletions.log contains 'student_link' record",
       audit.includes("student_link"));
  test("deletions.log mentions primary + secondary IDs",
       audit.includes(primary) && audit.includes(secondary));
  test("deletions.log captured OTP 123456", audit.includes("otp=123456"));
  test("deletions.log captured reason 'smoke test'",
       audit.includes("\"smoke test\""));
  test("deletions.log captured outcomes_dropped=1",
       audit.includes("outcomes_dropped=1"));

  // Clean up.
  try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n[link-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("[link-smoke] unhandled:", e); process.exit(1); }
}
