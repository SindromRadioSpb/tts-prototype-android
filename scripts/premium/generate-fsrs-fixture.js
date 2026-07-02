#!/usr/bin/env node
"use strict";
// generate-fsrs-fixture.js — produces the PINNED golden fixture for smoke:fsrs (Retention P1,
// RETENTION_PROGRAM_RECON_2026_07_02.md §4.1). The reference implementation is ts-fsrs (exact
// version recorded in the fixture) configured as the LONG-TERM scheduler: no learning steps, no
// fuzz — the deterministic pure-DSR regime fsrs-core.js implements. Scenarios cover init grades,
// Good-chains, Again-heavy sequences, same-day (t=0) reviews, long gaps/overdue, Hard/Easy.
// Re-run ONLY to regenerate after a deliberate generation bump (KEYER of the scheduler world);
// the fixture is committed — the gate never calls ts-fsrs.
//
// Usage: node scripts/premium/generate-fsrs-fixture.js
// Writes: scripts/premium/fixtures/fsrs/fsrs6-golden-v1.json

const fs = require("fs");
const path = require("path");
const tsfsrs = require("ts-fsrs");

const refPkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "node_modules", "ts-fsrs", "package.json"), "utf8"));

const PARAMS = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: false,   // long-term-only scheduler — the regime fsrs-core implements
  learning_steps: [],
  relearning_steps: [],
  w: tsfsrs.default_w,        // published FSRS-6 defaults (21 weights, learnable-decay w20)
};
const f = tsfsrs.fsrs(tsfsrs.generatorParameters(PARAMS));
const T0 = Date.UTC(2026, 0, 1);   // 2026-01-01T00:00:00Z — all steps stay at UTC midnight so
                                   // dateDiffInDays(last, now) === the declared integer dt exactly.

// Each scenario: from an empty card, apply steps [dtDaysSinceLastReview, grade 1..4].
const SCENARIOS = [
  { name: "init-again", steps: [[0, 1]] },
  { name: "init-hard", steps: [[0, 2]] },
  { name: "init-good", steps: [[0, 3]] },
  { name: "init-easy", steps: [[0, 4]] },
  { name: "good-chain", steps: [[0, 3], [3, 3], [14, 3], [44, 3], [120, 3], [300, 3], [700, 3], [1500, 3]] },
  { name: "again-heavy", steps: [[0, 3], [3, 1], [1, 1], [1, 3], [2, 1], [1, 3], [3, 3]] },
  { name: "same-day", steps: [[0, 3], [0, 3], [0, 1], [0, 3], [0, 4]] },
  { name: "long-gap", steps: [[0, 3], [60, 3], [365, 1], [1, 3], [500, 3]] },
  { name: "hard-easy", steps: [[0, 2], [5, 4], [17, 2], [2, 4], [40, 3]] },
  { name: "first-again-relearn", steps: [[0, 1], [1, 3], [3, 3], [9, 1], [1, 1], [1, 3]] },
  { name: "overdue", steps: [[0, 3], [30, 3], [400, 3], [1, 1], [4000, 3]] },
  { name: "max-interval-cap", steps: [[0, 4], [20, 4], [200, 4], [2000, 4], [10000, 4], [36500, 4]] },
];

const out = {
  provenance: {
    reference: "ts-fsrs",
    reference_version: refPkg.version,
    generation: "FSRS-6.0",
    algo_banner: tsfsrs.FSRSVersion,
    weights: PARAMS.w,
    decay: PARAMS.w[20],
    request_retention: PARAMS.request_retention,
    maximum_interval: PARAMS.maximum_interval,
    scheduler: "long-term (enable_short_term=false, learning_steps=[], relearning_steps=[], enable_fuzz=false)",
    elapsed_semantics: "integer UTC calendar-day diff (ts-fsrs dateDiffInDays); all fixture timestamps at UTC midnight",
    generated_by: "scripts/premium/generate-fsrs-fixture.js",
    note: "committed fixture — smoke:fsrs asserts fsrs-core.js against these vectors; ts-fsrs itself is a devDependency used only by this generator",
  },
  scenarios: [],
};

for (const sc of SCENARIOS) {
  let card = tsfsrs.createEmptyCard(new Date(T0));
  let nowMs = T0;
  const steps = [];
  for (const [dt, grade] of sc.steps) {
    nowMs += dt * 86400000;
    const rec = f.next(card, new Date(nowMs), grade);
    card = rec.card;
    steps.push({
      dt, grade,
      stability: card.stability,
      difficulty: card.difficulty,
      scheduled_days: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
    });
  }
  out.scenarios.push({ name: sc.name, steps });
}

const dir = path.join(__dirname, "fixtures", "fsrs");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, "fsrs6-golden-v1.json");
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log("wrote", file, "—", out.scenarios.length, "scenarios,",
  out.scenarios.reduce((n, s) => n + s.steps.length, 0), "steps; ref ts-fsrs@" + refPkg.version, "(" + tsfsrs.FSRSVersion + ")");
