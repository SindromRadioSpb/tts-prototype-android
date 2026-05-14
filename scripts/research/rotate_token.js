#!/usr/bin/env node
// scripts/research/rotate_token.js — Workstream A2 (v3.3.1).
//
// Rotates the researcher token of a live cohort in-place. Wraps the
// manual procedure documented in RESEARCHER_GUIDE §2.1.1 (Procedure B)
// so the operator doesn't have to assemble the openssl/sha256/jq
// pipeline by hand.
//
// Behavior:
//   1. Read <RESEARCH_DATA_DIR>/<code>/cohort_meta.json (throws on missing).
//   2. Generate a new plaintext token (32 base64url chars, crypto.randomBytes)
//      OR use --token <plaintext> if explicitly provided.
//   3. Compute its sha256 hash.
//   4. Atomically rewrite cohort_meta.json:
//        - researcher_token_hash = new hash
//        - token_rotations = [...existing, { rotated_at, prev_hash_prefix, reason? }]
//      Written to <meta>.tmp then renamed (POSIX atomic rename).
//   5. Print the new plaintext token to stdout ONCE — the operator must
//      capture it now. The plaintext is never stored on disk.
//   6. Append a one-line entry to <cohort>/deletions.log for cross-audit.
//
// Old token stops working immediately on the next request (no grace
// period). This matches Procedure B semantics: rotation is meant for
// "token compromise" scenarios where you want the old credential
// invalidated NOW.
//
// Usage:
//   node scripts/research/rotate_token.js --cohort ULPAN-A-W2026
//   node scripts/research/rotate_token.js --cohort ULPAN-A-W2026 --token <custom>
//   node scripts/research/rotate_token.js --cohort ULPAN-A-W2026 --reason "compromised in screenshot"
//
// Exits:
//   0 — rotation succeeded
//   1 — generic error (e.g. cohort not found)
//   2 — argv validation error

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { cohortDir, cohortMetaPath, cohortExists } = require("../../research/storage");

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
  node scripts/research/rotate_token.js --cohort <COHORT_CODE> [options]

Options:
  --cohort <STR>     (required) cohort code to rotate.
  --token <STR>      Optional pre-chosen plaintext token (≥ 16 chars).
                     If omitted, a fresh 32-byte random token is generated.
  --reason <STR>     Optional audit reason — appears in token_rotations[].reason
                     and in deletions.log. Recommended for compliance.
  --dry-run          Compute new token + hash + audit line but do NOT write
                     cohort_meta.json or append to deletions.log. Stdout
                     shows what would happen, prefixed by "[DRY RUN]".
  --help, -h         Show this help and exit 0.

Exit codes:
  0  rotation succeeded (or --help / --dry-run)
  1  IO error — cohort not found or filesystem fault
  2  argv validation error

Examples:
  rotate_token.js --cohort ULPAN-A-W2026
  rotate_token.js --cohort ULPAN-A-W2026 --reason "compromised in screenshot"
  rotate_token.js --cohort ULPAN-A-W2026 --dry-run    # preview without writing
`);
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function atomicWriteJson(target, obj) {
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, target);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // Help short-circuit BEFORE any validation so `--help` always exits 0
  // even when required flags are absent. -h is an alias.
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.cohort) {
    console.error("error: --cohort is required");
    printHelp();
    process.exit(2);
  }
  const dryRun = !!args["dry-run"];

  const code = String(args.cohort).trim();
  if (!cohortExists(code)) {
    console.error(`error: cohort "${code}" not found at ${cohortMetaPath(code)}`);
    process.exit(1);
  }

  const newPlaintext = args.token ? String(args.token) : generateToken();
  if (newPlaintext.length < 16) {
    console.error(`error: --token must be ≥ 16 chars (got ${newPlaintext.length})`);
    process.exit(2);
  }
  const newHash = sha256(newPlaintext);

  const metaPath = cohortMetaPath(code);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const prevHash = meta.researcher_token_hash || null;
  const prevHashPrefix = prevHash ? prevHash.slice(0, 12) + "…" : null;

  // Append audit entry. token_rotations is initialized lazily for cohorts
  // provisioned before this CLI existed.
  if (!Array.isArray(meta.token_rotations)) meta.token_rotations = [];
  meta.token_rotations.push({
    rotated_at: new Date().toISOString(),
    prev_hash_prefix: prevHashPrefix,
    reason: args.reason ? String(args.reason) : null,
  });
  meta.researcher_token_hash = newHash;

  const auditLine =
    `${new Date().toISOString()} token_rotation cohort=${code} ` +
    `prev_hash_prefix=${prevHashPrefix || "—"} ` +
    `reason=${args.reason ? JSON.stringify(args.reason) : "—"}\n`;

  if (dryRun) {
    console.log("[DRY RUN] rotate_token — no files modified.");
    console.log(`[DRY RUN]   cohort:           ${code}`);
    console.log(`[DRY RUN]   would write:      ${metaPath}`);
    console.log(`[DRY RUN]   prev_hash_prefix: ${prevHashPrefix || "—"}`);
    console.log(`[DRY RUN]   new_hash_prefix:  ${newHash.slice(0, 12)}…`);
    console.log(`[DRY RUN]   would append:     ${path.join(cohortDir(code), "deletions.log")}`);
    console.log(`[DRY RUN]   audit_line:       ${auditLine.trimEnd()}`);
    console.log(`[DRY RUN]   new_token (would print to stdout — NOT WRITTEN):`);
    console.log(`[DRY RUN]     ${newPlaintext}`);
    process.exit(0);
  }

  atomicWriteJson(metaPath, meta);

  // Cross-audit log line so deletions.log captures all sensitive
  // server-side actions (deletions + rotations) in one place.
  fs.appendFileSync(path.join(cohortDir(code), "deletions.log"), auditLine, "utf8");

  console.log("Token rotated:");
  console.log(`  cohort:               ${code}`);
  console.log(`  prev_hash_prefix:     ${prevHashPrefix || "—"}`);
  console.log(`  new_hash_prefix:      ${newHash.slice(0, 12)}…`);
  console.log(`  rotation_count:       ${meta.token_rotations.length}`);
  console.log(`  audit_log:            ${path.join(cohortDir(code), "deletions.log")}`);
  console.log("");
  console.log("New researcher token (plaintext — SAVE NOW, NOT STORED ON DISK):");
  console.log(`  ${newPlaintext}`);
  console.log("");
  console.log("The previous token stops working IMMEDIATELY. Distribute the new");
  console.log("plaintext to the authorized researcher(s) and update any dashboards.");
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error("rotate_token failed:", e && e.message ? e.message : e); process.exit(1); }
}
