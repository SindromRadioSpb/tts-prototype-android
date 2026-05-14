#!/usr/bin/env node
// scripts/quiz/scoring-smoke.js — v3.3.5 Calibrated Quiz scoring smoke.
//
// 6 cases per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §13:
//   1. All-correct response set → theta capped at +3.0, score=100, band=C1
//   2. All-incorrect response set → theta capped at -3.0, score=0, band=A1
//   3. Mid-pattern response set → theta in expected range, SE > 0, finite
//   4. Newton-Raphson converges in ≤ 10 iterations
//   5. Score is deterministic across N=100 identical re-runs (same input → same output)
//   6. Correlation with mirt-reference fixture: r(theta_hat, ref_theta_ml) > 0.99
//      AND truth recovery r(theta_hat, truth_theta) > 0.85 (Rasch reliability bound)
//
// Pure Node — no Playwright, no server. Reads bank + fixture, exercises
// public/js/quiz-scoring.js, asserts invariants. Exit 0 if all green.

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BANK_PATH = path.join(REPO_ROOT, "public/quiz/ulpan_diagnostic_v1.json");
const FIXTURE_PATH = path.join(REPO_ROOT, "scripts/quiz/__fixtures__/mirt-reference.json");
const SCORING = require(path.join(REPO_ROOT, "public/js/quiz-scoring.js"));

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

function pearson(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i];
    sxx += xs[i] * xs[i]; syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den === 0 ? 0 : num / den;
}

function mad(xs, ys) {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += Math.abs(xs[i] - ys[i]);
  return s / xs.length;
}

function picksAllCorrect(items)   { const r = {}; for (const i of items) r[i.id] = i.correct_option_id; return r; }
function picksAllIncorrect(items) {
  const r = {};
  for (const i of items) {
    const wrong = i.options.find((o) => o.id !== i.correct_option_id);
    r[i.id] = wrong.id;
  }
  return r;
}
function picksMid(items) {
  // First 10 correct, last 10 wrong → moderate ability around 0.
  const r = {};
  items.forEach((it, idx) => {
    if (idx < 10) r[it.id] = it.correct_option_id;
    else {
      const wrong = it.options.find((o) => o.id !== it.correct_option_id);
      r[it.id] = wrong.id;
    }
  });
  return r;
}

function main() {
  const bank = JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  const items = bank.items;

  // 1. All-correct → theta at +3, score 100, band C1.
  const r1 = SCORING.scoreQuiz({ bank, responses: picksAllCorrect(items) });
  test("all-correct → theta=+3.0, score=100, band=C1, theta_capped",
       r1.theta === 3.0 && r1.raw_score === 100 && r1.cefr_band === "C1" && r1.theta_capped === true,
       `theta=${r1.theta} score=${r1.raw_score} band=${r1.cefr_band} capped=${r1.theta_capped}`);

  // 2. All-incorrect → theta at -3, score 0, band A1.
  const r2 = SCORING.scoreQuiz({ bank, responses: picksAllIncorrect(items) });
  test("all-incorrect → theta=-3.0, score=0, band=A1, theta_capped",
       r2.theta === -3.0 && r2.raw_score === 0 && r2.cefr_band === "A1" && r2.theta_capped === true,
       `theta=${r2.theta} score=${r2.raw_score} band=${r2.cefr_band} capped=${r2.theta_capped}`);

  // 3. Mid-pattern → theta finite, NOT capped, SE > 0.
  const r3 = SCORING.scoreQuiz({ bank, responses: picksMid(items) });
  test("mid-pattern → theta finite in (-3,+3), SE > 0",
       Number.isFinite(r3.theta) && r3.theta > -3 && r3.theta < 3 && r3.se > 0 && !r3.theta_capped,
       `theta=${r3.theta.toFixed(3)} se=${r3.se.toFixed(3)} capped=${r3.theta_capped}`);

  // 4. Newton-Raphson converges in ≤ 10 iterations on mid-pattern.
  test("Newton-Raphson converges in ≤ 10 iterations (mid-pattern)",
       r3.iterations > 0 && r3.iterations <= 10,
       `iterations=${r3.iterations}`);

  // 5. Determinism — re-score the same responses N=100 times, expect identical output.
  let detOk = true;
  const baseline = SCORING.scoreQuiz({ bank, responses: picksMid(items) });
  for (let k = 0; k < 100; k++) {
    const r = SCORING.scoreQuiz({ bank, responses: picksMid(items) });
    if (r.theta !== baseline.theta || r.raw_score !== baseline.raw_score ||
        r.cefr_band !== baseline.cefr_band || r.se !== baseline.se) {
      detOk = false; break;
    }
  }
  test("score deterministic across 100 identical re-runs", detOk);

  // 6. Fixture correlation: r(theta_hat, ref_theta_ml) > 0.99 (reproducibility),
  //    r(theta_hat, truth_theta) > 0.85 (Rasch recovery — generous since 20-item Rasch SE~0.5),
  //    MAD(theta_hat, ref_theta_ml) < 0.05.
  const thetaHat = [];
  const thetaRef = [];
  const thetaTruth = [];
  for (const resp of fixture.respondents) {
    const out = SCORING.scoreQuiz({ bank, responses: resp.responses_picks });
    thetaHat.push(out.theta);
    thetaRef.push(resp.ref_theta_ml);
    thetaTruth.push(resp.truth_theta);
  }
  const rRef = pearson(thetaHat, thetaRef);
  const rTruth = pearson(thetaHat, thetaTruth);
  const madRef = mad(thetaHat, thetaRef);
  test("fixture: r(theta_hat, ref_theta_ml) > 0.99, MAD < 0.05, r(theta_hat, truth_theta) > 0.85",
       rRef > 0.99 && madRef < 0.05 && rTruth > 0.85,
       `r_ref=${rRef.toFixed(4)} mad_ref=${madRef.toFixed(4)} r_truth=${rTruth.toFixed(4)}`);

  console.log(`\n[scoring-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) main();
