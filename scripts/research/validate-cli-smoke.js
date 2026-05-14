#!/usr/bin/env node
// scripts/research/validate-cli-smoke.js — A5 happy-path smoke (v3.3.1).
//
// Verifies the validate-cli.js round-trip:
//   1. Valid payload via stdin → exit 0 + "OK".
//   2. Invalid payload (missing field) → exit 3.
//   3. Forbidden field (e.g. raw search_query in metrics) → exit 3.
//   4. Bad JSON → exit 3 with PARSE_ERROR.
//   5. --json mode → machine-readable diagnostic.
//   6. --jsonl mode → mixed valid/invalid file → exit 3, count surfaced.
//
// Exits 0 on success, 1 on any failure.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(REPO_ROOT, "scripts/research/validate-cli.js");

function run(input, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT, input, encoding: "utf8",
  });
  return { stdout: r.stdout || "", stderr: r.stderr || "", code: r.status };
}

const VALID = {
  format: "linguistpro-research-v1",
  student_id: "abc12340-0000-4000-8000-000000000001",
  cohort_code: "SMOKE-V1",
  upload_ts: "2026-05-14",
  since_ts: "2026-05-14",
  consent_version: "1.0",
  context: { app_version: "3.3.1", platform: "web/desktop" },
  metrics: { sessions_count: 3, active_minutes_real: 42 },
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function main() {
  let passed = 0, failed = 0;
  const test = (name, cond, extra) => {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
  };

  // 1. valid via stdin.
  let r = run(JSON.stringify(VALID), []);
  test("valid payload exit 0", r.code === 0, "exit=" + r.code + " stderr=" + r.stderr.slice(0, 200));
  test("valid payload stdout contains 'OK'", /\bOK\b/.test(r.stdout), "stdout=" + r.stdout.slice(0, 200));

  // 2. invalid: missing cohort_code.
  const noCohort = clone(VALID); delete noCohort.cohort_code;
  r = run(JSON.stringify(noCohort), []);
  test("missing cohort_code → exit 3", r.code === 3, "exit=" + r.code);
  test("missing cohort_code stderr mentions FAIL", /FAIL/.test(r.stderr));

  // 3. invalid: forbidden field 'search_query' nested in metrics.
  const forbidden = clone(VALID); forbidden.metrics.search_query = "secret";
  r = run(JSON.stringify(forbidden), []);
  test("forbidden field 'search_query' → exit 3", r.code === 3, "exit=" + r.code);

  // 4. bad JSON.
  r = run("{ not valid json,,", []);
  test("bad JSON → exit 3", r.code === 3);
  test("bad JSON diagnostic is PARSE_ERROR or SCHEMA",
       /PARSE_ERROR|SCHEMA/.test(r.stderr), "stderr=" + r.stderr.slice(0, 200));

  // 5. --json mode emits structured diagnostic to stdout.
  r = run(JSON.stringify(noCohort), ["--json"]);
  test("--json mode exit 3 for invalid", r.code === 3);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout.trim()); } catch (_) {}
  test("--json mode stdout is parseable JSON",
       parsed && typeof parsed === "object", "stdout=" + r.stdout.slice(0, 200));
  test("--json mode diagnostic has ok=false",
       parsed && parsed.ok === false);
  test("--json mode diagnostic has field + message",
       parsed && parsed.field && parsed.message);

  // 5b. --json mode for valid emits ok:true.
  r = run(JSON.stringify(VALID), ["--json"]);
  test("--json mode valid payload exit 0", r.code === 0);
  let okParsed = null;
  try { okParsed = JSON.parse(r.stdout.trim()); } catch (_) {}
  test("--json mode valid stdout has ok=true",
       okParsed && okParsed.ok === true, "stdout=" + r.stdout.slice(0, 200));

  // 6. --jsonl mode: write temp file with mixed lines.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-cli-smoke-"));
  const jsonlPath = path.join(tmpDir, "mixed.jsonl");
  const lines = [
    JSON.stringify(VALID),
    JSON.stringify(VALID), // intentional duplicate, still valid
    "{ not valid",         // PARSE_ERROR
    JSON.stringify(forbidden), // SCHEMA_VIOLATION
    "",                     // blank, skipped
    JSON.stringify(VALID), // valid
  ];
  fs.writeFileSync(jsonlPath, lines.join("\n"), "utf8");

  r = run("", ["--jsonl", jsonlPath, "--json"]);
  test("--jsonl mixed file → exit 3 (any failure)", r.code === 3, "exit=" + r.code);
  // Each invalid line emits a JSON diagnostic. Count by parsing lines.
  const stdoutLines = r.stdout.trim().split(/\r?\n/).filter(Boolean);
  // 2 invalid lines → 2 diagnostics expected on stdout.
  test("--jsonl --json emits 2 diagnostic lines for 2 bad rows",
       stdoutLines.length === 2, "got " + stdoutLines.length + " lines: " + JSON.stringify(stdoutLines));

  // Clean up.
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n[validate-cli-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("[validate-cli-smoke] unhandled:", e); process.exit(1); }
}
