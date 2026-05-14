// public/js/quiz-scoring.js — Rasch 1PL scoring engine (v3.3.5 D13 C2).
//
// Pure JS, no dependencies. Browser + Node CommonJS compatible.
//
// Public API:
//
//   scoreQuiz({ bank, responses })
//     bank      — parsed public/quiz/ulpan_diagnostic_v1.json
//     responses — { [item_id]: selected_option_id }
//     returns: { theta, se, raw_score, cefr_band, iterations,
//                correct_count, total_items, theta_capped }
//
//   thetaToScore(theta, scoring)  — linear projection, returns int [0,100]
//   scoreToBand(raw_score, scoring) — returns band string (A1..C1) or null
//   bandForTheta(theta, scoring)    — convenience wrapper
//   scoreToTheta(raw_score, scoring) — reverse mapping for analysis
//
// Algorithm (per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §7):
//
//   P(correct on item i | theta) = sigmoid(theta - beta_i)
//   Newton-Raphson step:
//     score(theta) = Σ_i (x_i - P_i)
//     info(theta)  = Σ_i P_i (1 - P_i)
//     theta_next   = theta + score / info
//   Cap theta at [-3.0, +3.0].
//   SE(theta) = 1 / sqrt(info(theta_hat))   (boundary cases: SE = NaN-safe sentinel)
//
// Item-level responses MUST stay device-local (privacy invariant).
// This module computes scores; submission code (research.js) strips
// per-item responses before any network call.

"use strict";

const THETA_MIN = -3.0;
const THETA_MAX = 3.0;
const MAX_ITERATIONS = 50;
const CONVERGENCE_TOLERANCE = 1e-6;

function sigmoid(z) {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function gradeResponses(items, responses) {
  const x = new Array(items.length);
  let correct = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const picked = responses[item.id];
    const isCorrect = picked != null && picked === item.correct_option_id;
    x[i] = isCorrect ? 1 : 0;
    if (isCorrect) correct++;
  }
  return { x, correct };
}

function newtonRaphsonTheta(items, x) {
  let theta = 0.0;
  let iterations = 0;
  for (let it = 0; it < MAX_ITERATIONS; it++) {
    iterations++;
    let score = 0;
    let info = 0;
    for (let i = 0; i < items.length; i++) {
      const beta = items[i].difficulty_logit;
      const p = sigmoid(theta - beta);
      score += x[i] - p;
      info += p * (1 - p);
    }
    if (info < 1e-9) break;
    const step = score / info;
    theta += step;
    if (theta > THETA_MAX) { theta = THETA_MAX; break; }
    if (theta < THETA_MIN) { theta = THETA_MIN; break; }
    if (Math.abs(step) < CONVERGENCE_TOLERANCE) break;
  }
  return { theta, iterations };
}

function standardError(items, theta) {
  let info = 0;
  for (let i = 0; i < items.length; i++) {
    const p = sigmoid(theta - items[i].difficulty_logit);
    info += p * (1 - p);
  }
  if (info < 1e-9) return 1.0;
  return 1 / Math.sqrt(info);
}

function thetaToScore(theta, scoring) {
  const map = (scoring && scoring.theta_to_score) || { domain: [-3.0, 3.0], range: [0, 100] };
  const [lo, hi] = map.domain;
  const [rlo, rhi] = map.range;
  const clamped = Math.max(lo, Math.min(hi, theta));
  const norm = (clamped - lo) / (hi - lo);
  return Math.round(rlo + norm * (rhi - rlo));
}

function scoreToBand(raw_score, scoring) {
  const bands = (scoring && scoring.cefr_bands) || [];
  for (const b of bands) {
    if (raw_score >= b.lower && raw_score <= b.upper) return b.band;
  }
  return null;
}

function bandForTheta(theta, scoring) {
  return scoreToBand(thetaToScore(theta, scoring), scoring);
}

function scoreToTheta(raw_score, scoring) {
  const map = (scoring && scoring.theta_to_score) || { domain: [-3.0, 3.0], range: [0, 100] };
  const [lo, hi] = map.domain;
  const [rlo, rhi] = map.range;
  const norm = (raw_score - rlo) / (rhi - rlo);
  return lo + norm * (hi - lo);
}

function scoreQuiz({ bank, responses }) {
  if (!bank || !Array.isArray(bank.items)) {
    throw new Error("scoreQuiz: bank.items missing");
  }
  if (!responses || typeof responses !== "object") {
    throw new Error("scoreQuiz: responses missing");
  }
  const items = bank.items;
  const { x, correct } = gradeResponses(items, responses);

  const allCorrect = correct === items.length;
  const allWrong = correct === 0;

  let theta, iterations;
  if (allCorrect) {
    theta = THETA_MAX;
    iterations = 0;
  } else if (allWrong) {
    theta = THETA_MIN;
    iterations = 0;
  } else {
    const r = newtonRaphsonTheta(items, x);
    theta = r.theta;
    iterations = r.iterations;
  }

  const theta_capped = (theta <= THETA_MIN || theta >= THETA_MAX);
  const se = standardError(items, theta);
  const raw_score = thetaToScore(theta, bank.scoring);
  const cefr_band = scoreToBand(raw_score, bank.scoring);

  return {
    theta,
    se,
    raw_score,
    cefr_band,
    iterations,
    correct_count: correct,
    total_items: items.length,
    theta_capped,
  };
}

const API = { scoreQuiz, thetaToScore, scoreToBand, bandForTheta, scoreToTheta,
              THETA_MIN, THETA_MAX };

if (typeof module !== "undefined" && module.exports) {
  module.exports = API;
}
if (typeof window !== "undefined") {
  window.QuizScoring = API;
}
