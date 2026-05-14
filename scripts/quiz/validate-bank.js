#!/usr/bin/env node
// scripts/quiz/validate-bank.js — Calibrated Quiz item bank schema validator.
//
// Enforces the §4 schema invariants from docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md:
//   - exactly 20 items
//   - CEFR distribution A1=4, A2=4, B1=5, B2=4, C1=3
//   - each item id matches ^Q\d{2}$ and is unique
//   - cefr_level ∈ {A1, A2, B1, B2, C1}
//   - difficulty_logit ∈ [-4, 4]
//   - exactly 4 options with unique ids ∈ {a, b, c, d}
//   - correct_option_id references a real option
//   - prompt_he / prompt_ru / prompt_en all non-empty
//   - cefr_bands cover [0, 100] without gaps/overlaps
//
// Usage:
//   node scripts/quiz/validate-bank.js [path]
//     default path: public/quiz/ulpan_diagnostic_v1.json
//
// Exit:
//   0 — bank validates
//   1 — IO error
//   3 — schema violation (with details on stderr)

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PATH = path.join(REPO_ROOT, "public/quiz/ulpan_diagnostic_v1.json");

const REQUIRED_BANDS = ["A1", "A2", "B1", "B2", "C1"];
const REQUIRED_DISTRIBUTION = { A1: 4, A2: 4, B1: 5, B2: 4, C1: 3 };
const REQUIRED_OPTION_IDS = ["a", "b", "c", "d"];
const ITEM_ID_RE = /^Q\d{2}$/;
const LOGIT_MIN = -4.0;
const LOGIT_MAX = 4.0;

function fail(msg, detail) {
  console.error(`[validate-bank] FAIL: ${msg}`);
  if (detail) console.error("  " + detail);
  process.exit(3);
}

function main() {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PATH;
  if (!fs.existsSync(target)) {
    console.error(`[validate-bank] file not found: ${target}`);
    process.exit(1);
  }
  let bank;
  try {
    bank = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (e) {
    console.error(`[validate-bank] parse error: ${e.message}`);
    process.exit(1);
  }

  if (bank.format !== "linguistpro-quiz-v1") {
    fail("bank.format mismatch", `got "${bank.format}"; expected "linguistpro-quiz-v1"`);
  }
  if (!bank.instrument_id || typeof bank.instrument_id !== "string") {
    fail("bank.instrument_id missing or not a string");
  }
  if (!Array.isArray(bank.items)) {
    fail("bank.items not an array");
  }
  if (bank.items.length !== 20) {
    fail("bank.items.length !== 20", `got ${bank.items.length}`);
  }

  // Distribution check.
  const counts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };
  const seenIds = new Set();
  for (let i = 0; i < bank.items.length; i++) {
    const item = bank.items[i];
    const ctx = `items[${i}] (id=${item && item.id})`;

    if (!item.id || !ITEM_ID_RE.test(item.id)) {
      fail(`${ctx}: id must match ^Q\\d{2}$`);
    }
    if (seenIds.has(item.id)) {
      fail(`${ctx}: duplicate id`);
    }
    seenIds.add(item.id);

    if (!REQUIRED_BANDS.includes(item.cefr_level)) {
      fail(`${ctx}: cefr_level invalid`, `got "${item.cefr_level}"; expected one of ${REQUIRED_BANDS.join(", ")}`);
    }
    counts[item.cefr_level]++;

    if (typeof item.difficulty_logit !== "number" || !Number.isFinite(item.difficulty_logit)) {
      fail(`${ctx}: difficulty_logit not a finite number`);
    }
    if (item.difficulty_logit < LOGIT_MIN || item.difficulty_logit > LOGIT_MAX) {
      fail(`${ctx}: difficulty_logit out of [${LOGIT_MIN}, ${LOGIT_MAX}]`, `got ${item.difficulty_logit}`);
    }

    for (const key of ["prompt_he", "prompt_ru", "prompt_en"]) {
      if (!item[key] || typeof item[key] !== "string" || item[key].trim().length === 0) {
        fail(`${ctx}: ${key} missing or empty`);
      }
    }

    if (!Array.isArray(item.options) || item.options.length !== 4) {
      fail(`${ctx}: options must be array of length 4`, `got length ${item.options && item.options.length}`);
    }
    const optionIds = item.options.map((o) => o && o.id);
    for (const wantId of REQUIRED_OPTION_IDS) {
      if (!optionIds.includes(wantId)) {
        fail(`${ctx}: missing option id "${wantId}"`);
      }
    }
    if (new Set(optionIds).size !== 4) {
      fail(`${ctx}: option ids must be unique`, `got ${JSON.stringify(optionIds)}`);
    }
    for (const opt of item.options) {
      for (const key of ["text_he", "text_ru", "text_en"]) {
        if (typeof opt[key] !== "string") {
          fail(`${ctx}: option ${opt.id}.${key} not a string`);
        }
      }
    }

    if (!REQUIRED_OPTION_IDS.includes(item.correct_option_id)) {
      fail(`${ctx}: correct_option_id invalid`, `got "${item.correct_option_id}"`);
    }
  }

  // Distribution exact match.
  for (const band of REQUIRED_BANDS) {
    if (counts[band] !== REQUIRED_DISTRIBUTION[band]) {
      fail(`CEFR distribution off for ${band}`, `got ${counts[band]}, expected ${REQUIRED_DISTRIBUTION[band]}`);
    }
  }

  // CEFR bands coverage check.
  const bands = (bank.scoring && bank.scoring.cefr_bands) || [];
  if (bands.length !== 5) {
    fail("scoring.cefr_bands.length !== 5", `got ${bands.length}`);
  }
  // Sort by lower and verify [0, 100] contiguous coverage.
  const sorted = bands.slice().sort((a, b) => a.lower - b.lower);
  if (sorted[0].lower !== 0) fail("first band lower must be 0", `got ${sorted[0].lower}`);
  if (sorted[sorted.length - 1].upper !== 100) {
    fail("last band upper must be 100", `got ${sorted[sorted.length - 1].upper}`);
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].upper < sorted[i].lower) {
      fail(`band[${i}] upper < lower`);
    }
    if (i > 0 && sorted[i].lower !== sorted[i - 1].upper + 1) {
      fail(`bands gap/overlap between [${i - 1}] and [${i}]`,
           `${sorted[i - 1].upper} → ${sorted[i].lower}`);
    }
  }

  // Monotonic mean-difficulty check.
  const meanByBand = {};
  for (const band of REQUIRED_BANDS) {
    const items = bank.items.filter((it) => it.cefr_level === band);
    meanByBand[band] = items.reduce((s, it) => s + it.difficulty_logit, 0) / items.length;
  }
  for (let i = 1; i < REQUIRED_BANDS.length; i++) {
    const prev = REQUIRED_BANDS[i - 1];
    const cur  = REQUIRED_BANDS[i];
    if (meanByBand[cur] <= meanByBand[prev]) {
      fail("mean difficulty not monotonic across CEFR bands",
           `mean(${prev})=${meanByBand[prev].toFixed(2)}, mean(${cur})=${meanByBand[cur].toFixed(2)}`);
    }
  }

  console.log(`[validate-bank] OK · ${bank.items.length} items · ${counts.A1}/${counts.A2}/${counts.B1}/${counts.B2}/${counts.C1} (A1/A2/B1/B2/C1)`);
  console.log(`  mean difficulty per band: A1=${meanByBand.A1.toFixed(2)}, A2=${meanByBand.A2.toFixed(2)}, B1=${meanByBand.B1.toFixed(2)}, B2=${meanByBand.B2.toFixed(2)}, C1=${meanByBand.C1.toFixed(2)}`);
  console.log(`  CEFR bands cover [0, 100] · monotonic difficulty across bands · all options have 4 unique IDs · all correct refs resolve`);
}

if (require.main === module) {
  try { main(); }
  catch (e) {
    console.error("[validate-bank] unhandled error:", e && e.message ? e.message : e);
    process.exit(1);
  }
}
