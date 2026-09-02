#!/usr/bin/env node
"use strict";
// smoke:train-queue — T1 serving-order engine gate.
// Pure Node assertions over public/js/train-queue.js (no DOM, no DB, no browser).
// Plan: docs/superpowers/plans/2026-09-02-room-trainer-t1-serving-order.md

const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..");
const TQ = require(path.join(ROOT, "public/js/train-queue.js"));

const failures = [];
let checks = 0;
function check(ok, message) { checks++; if (!ok) failures.push(message); }

function item(lemmaKey, srs, status) {
  return { lemmaKey: lemmaKey, status: status || "", _srs: srs || null };
}

// ── Suite 1: determinism contract ────────────────────────────────────────────
// Strip comments first: the module's own prose says "no Math.random", and a guard that
// matched documentation instead of code would be theatre.
const rawSrc = fs.readFileSync(path.join(ROOT, "public/js/train-queue.js"), "utf8");
const src = rawSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
check(!/Math\.random/.test(src), "train-queue.js must contain no Math.random (project invariant)");
check(!/Date\.now/.test(src), "train-queue.js must contain no Date.now (nowMs is injected)");
// The stripper itself must work: the module documents the rule in a comment, so the raw
// text mentions it while the stripped code must not. If this ever inverts, the two guards
// above have stopped proving anything.
check(/Math\.random/.test(rawSrc) && !/Math\.random/.test(src),
  "the comment stripper must remove prose while leaving code — guard is only meaningful if it does");
check(TQ.ENGINE_VERSION === "train-queue-v1", "ENGINE_VERSION must be train-queue-v1, got " + TQ.ENGINE_VERSION);

// ── Suite 2: dayHash ─────────────────────────────────────────────────────────
check(TQ.dayHash("aleph", "2026-09-02") === TQ.dayHash("aleph", "2026-09-02"),
  "dayHash must be stable for the same (key, day)");
check(TQ.dayHash("aleph", "2026-09-02") !== TQ.dayHash("aleph", "2026-09-03"),
  "dayHash must differ across days for the same key");
check(TQ.dayHash("aleph", "2026-09-02") !== TQ.dayHash("bet", "2026-09-02"),
  "dayHash must differ across keys on the same day");
check(Number.isInteger(TQ.dayHash("aleph", "2026-09-02")) && TQ.dayHash("aleph", "2026-09-02") >= 0,
  "dayHash must return a non-negative integer");

// ── Suite 3: dayPermute ──────────────────────────────────────────────────────
const pool = [];
for (let i = 0; i < 40; i++) pool.push(item("w" + i, { due: 0, interval: 3, reps: 2, lapses: 0 }));

const dayA1 = TQ.dayPermute(pool, "2026-09-02").map((x) => x.lemmaKey);
const dayA2 = TQ.dayPermute(pool, "2026-09-02").map((x) => x.lemmaKey);
const dayB = TQ.dayPermute(pool, "2026-09-03").map((x) => x.lemmaKey);

check(dayA1.join(",") === dayA2.join(","), "dayPermute must be stable within a day");
check(dayA1.join(",") !== dayB.join(","), "dayPermute must reorder across days");
check(dayA1.slice().sort().join(",") === pool.map((x) => x.lemmaKey).slice().sort().join(","),
  "dayPermute must be a true permutation — no member lost or duplicated");
check(dayA1.length === pool.length, "dayPermute must preserve length");
check(TQ.dayPermute(null, "2026-09-02").length === 0, "dayPermute(null) must return []");

// how many of the first 12 change between two consecutive days — the variety signal.
// Two independent 12-subsets of 40 overlap by ~3.6 on average; 12 means the order did not
// change at all, which is exactly the defect this engine exists to fix.
const headA = new Set(dayA1.slice(0, 12));
const overlap = dayB.slice(0, 12).filter((k) => headA.has(k)).length;
check(overlap <= 8, "the served head must genuinely churn between consecutive days, overlap=" + overlap);

// Guards the defect class found while building this module: if the day is folded into the
// hash in a way that shifts every key by the same amount, the permutation is preserved and
// the same words are served for ever. The day-to-day deltas must therefore be well spread.
const deltas = new Set(pool.map((x) => (TQ.dayHash(x.lemmaKey, "2026-09-03") - TQ.dayHash(x.lemmaKey, "2026-09-02")) >>> 0));
check(deltas.size >= Math.floor(pool.length * 0.9),
  "day-to-day hash deltas must be well spread (a constant or near-constant shift preserves the order), got "
  + deltas.size + " distinct of " + pool.length);

// The permutation must also churn over a longer horizon, not just between adjacent days.
const week = [];
for (let d = 2; d <= 8; d++) week.push(TQ.dayPermute(pool, "2026-09-0" + d).slice(0, 12).map((x) => x.lemmaKey).join(","));
check(new Set(week).size === week.length, "each day in a week must produce a distinct served head");

if (failures.length) {
  console.error(`train-queue-smoke: FAIL ${failures.length}/${checks}`);
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`train-queue-smoke: PASS ${checks}/${checks}`);
