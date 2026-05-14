#!/usr/bin/env node
// scripts/quiz/generate-mirt-fixture.js — regenerates mirt-reference.json.
//
// Run when item difficulties change. Produces deterministic output via a
// seeded Mulberry32 PRNG, so subsequent runs are byte-identical unless the
// item bank changes.
//
// Output: scripts/quiz/__fixtures__/mirt-reference.json
//
// The fixture stores 100 synthetic respondents:
//   - truth_theta : drawn uniformly in [-3, +3]
//   - responses   : { Q01..Q20 → 0/1 } from Rasch generative model
//   - ref_theta_ml: theta_hat from our MLE (this implementation)
//   - ref_se      : SE(theta_hat)
//
// **Self-consistency note** — ref_theta_ml is computed by THIS impl until an
// external R `mirt` cross-check has been recorded. The companion script
// `scripts/quiz/validate-against-mirt.R` will, when a reviewer has R available,
// regenerate ref_theta_ml from `mirt::fscores(..., method="ML")` so that the
// JS↔R divergence (r > 0.99, MAD < 0.05) is verifiable.

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BANK_PATH = path.join(REPO_ROOT, "public/quiz/ulpan_diagnostic_v1.json");
const OUT_PATH  = path.join(REPO_ROOT, "scripts/quiz/__fixtures__/mirt-reference.json");
const SCORING   = require(path.join(REPO_ROOT, "public/js/quiz-scoring.js"));

const SEED = 0x517A9F1C;     // fixed for reproducibility
const N_RESPONDENTS = 100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
  const items = bank.items;
  const rng = mulberry32(SEED);

  const respondents = [];
  for (let r = 0; r < N_RESPONDENTS; r++) {
    const truth_theta = -3 + 6 * rng();
    const responses_grade = {};
    const responses_picks = {};
    for (const item of items) {
      const p = sigmoid(truth_theta - item.difficulty_logit);
      const u = rng();
      const correct = u < p ? 1 : 0;
      responses_grade[item.id] = correct;
      const correctId = item.correct_option_id;
      if (correct) {
        responses_picks[item.id] = correctId;
      } else {
        const wrongs = item.options.map((o) => o.id).filter((id) => id !== correctId);
        const pick = wrongs[Math.floor(rng() * wrongs.length) % wrongs.length];
        responses_picks[item.id] = pick;
      }
    }
    const scored = SCORING.scoreQuiz({ bank, responses: responses_picks });
    respondents.push({
      truth_theta: round6(truth_theta),
      responses_picks,
      responses_grade,
      ref_theta_ml: round6(scored.theta),
      ref_se: round6(scored.se),
      ref_raw_score: scored.raw_score,
      ref_cefr_band: scored.cefr_band,
    });
  }

  const out = {
    fixture_version: 1,
    generated_by: "scripts/quiz/generate-mirt-fixture.js",
    generator_seed: "0x" + SEED.toString(16).toUpperCase(),
    bank_instrument_id: bank.instrument_id,
    bank_item_difficulties: items.map((i) => ({ id: i.id, beta: i.difficulty_logit })),
    self_consistency_note: "ref_theta_ml computed by public/js/quiz-scoring.js until external R mirt cross-check (validate-against-mirt.R) replaces it.",
    n_respondents: N_RESPONDENTS,
    respondents,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`[generate-mirt-fixture] wrote ${OUT_PATH} (${N_RESPONDENTS} respondents)`);
}

function round6(x) { return Math.round(x * 1e6) / 1e6; }

if (require.main === module) main();
