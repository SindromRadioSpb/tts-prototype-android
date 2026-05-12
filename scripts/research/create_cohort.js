#!/usr/bin/env node
// scripts/research/create_cohort.js — admin CLI to provision a research cohort.
//
// Usage:
//   node scripts/research/create_cohort.js --code ULPAN-A-W2026 \
//     [--retention-days 730] [--outcome-scale 0-100] \
//     [--consent-min 1.0] [--k 5] [--token <plaintext>]
//
// Creates <RESEARCH_DATA_DIR>/<code>/cohort_meta.json. The plaintext
// researcher token is printed ONCE to stdout (the cohort_meta only stores
// its sha256). Teacher distributes the plaintext to the researcher OOB.

const crypto = require("crypto");
const { createCohort, cohortExists } = require("../../research/storage");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function isoDatePlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.code) {
    console.log(`
Usage:
  node scripts/research/create_cohort.js --code <COHORT_CODE> [options]

Options:
  --code <STR>            (required) 4–16 chars, [A-Z0-9-].
  --retention-days <N>    Default 730 (2 years).
  --outcome-scale <STR>   Default "0-100".
  --consent-min <SEMVER>  Default "1.0".
  --k <N>                 k-anonymity threshold. Default 5.
  --token <STR>           Custom researcher token plaintext. Default: random 32-char base64url.
`);
    process.exit(args.code ? 0 : 1);
  }
  const code = String(args.code).trim();
  if (!/^[A-Z0-9-]{4,16}$/.test(code)) {
    console.error(`error: --code "${code}" must match [A-Z0-9-]{4,16}`);
    process.exit(2);
  }
  if (cohortExists(code)) {
    console.error(`error: cohort "${code}" already exists`);
    process.exit(3);
  }
  const tokenPlain = args.token ? String(args.token) : generateToken();
  const retentionDays = Number(args["retention-days"]) || 730;
  const kThresh = Number(args.k) || 5;
  const meta = createCohort({
    code,
    researcherTokenPlain: tokenPlain,
    retentionUntil: isoDatePlusDays(retentionDays),
    outcomeScale: args["outcome-scale"] || "0-100",
    kAnonymityThreshold: kThresh,
    consentVersionMinimum: args["consent-min"] || "1.0",
  });
  console.log("Cohort created:");
  console.log(`  code:                   ${meta.code}`);
  console.log(`  schema_version:         ${meta.schema_version}`);
  console.log(`  created_at:             ${meta.created_at}`);
  console.log(`  k_anonymity_threshold:  ${meta.k_anonymity_threshold}`);
  console.log(`  retention_until:        ${meta.retention_until}`);
  console.log(`  outcome_scale:          ${meta.outcome_scale}`);
  console.log(`  consent_version_min:    ${meta.consent_version_minimum}`);
  console.log("");
  console.log("Researcher token (plaintext — SAVE NOW, NOT STORED ON DISK):");
  console.log(`  ${tokenPlain}`);
  console.log("");
  console.log("Distribute the COHORT CODE to students (in-app join screen).");
  console.log("Distribute the RESEARCHER TOKEN to the researcher (teacher dashboard auth).");
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("create_cohort failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
}
