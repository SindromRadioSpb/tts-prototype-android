#!/usr/bin/env node
"use strict";
// smoke:retention-report — T4 analytics gate.
// Pure Node assertions over public/js/retention-report.js. The module is an INDEPENDENT fold:
// it must not reach into the selection/scheduling path, and where it overlaps TrainQueue it
// must AGREE rather than delegate (R17 — whoever teaches does not certify).
// Plan: docs/superpowers/plans/2026-09-03-room-trainer-t4-retention-analytics.md

const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..");
const RR = require(path.join(ROOT, "public/js/retention-report.js"));
const TQ = require(path.join(ROOT, "public/js/train-queue.js"));

const failures = [];
let checks = 0;
const check = (ok, m) => { checks++; if (!ok) failures.push(m); };

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 3, 9, 0, 0);

// ── Suite 1: independence + determinism ──────────────────────────────────────
const raw = fs.readFileSync(path.join(ROOT, "public/js/retention-report.js"), "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
check(!/Math\.random/.test(code), "the report module must contain no Math.random");
check(!/Date\.now/.test(code), "the report module must contain no Date.now (nowMs is injected)");
check(!/composeSession|bucketOf|fsrsStep|TrainQueue/.test(code),
  "R17: the report must not reach into the selection or scheduling path — a fold that calls the "
  + "scheduler cannot contradict it, and a metric that cannot contradict is not evidence");
check(RR.ENGINE_VERSION === "retention-report-v1", "ENGINE_VERSION must be retention-report-v1");

// ── Suite 2: forecast ────────────────────────────────────────────────────────
const sched = {};
for (let i = 0; i < 10; i++) sched["a" + i] = { due: NOW + 2 * DAY, interval: 5 };
for (let i = 0; i < 4; i++) sched["b" + i] = { due: NOW + 9 * DAY, interval: 12 };
sched.past = { due: NOW - 3 * DAY, interval: 4 };

const fc = RR.forecast(sched, NOW, 30);
check(fc.days.length === 30, "forecast must return one entry per requested day, got " + fc.days.length);
check(fc.days[2].due === 10, "day +2 must carry the ten words due then, got " + fc.days[2].due);
check(fc.days[9].due === 4, "day +9 must carry four, got " + fc.days[9].due);
check(fc.days[0].due === 1, "an overdue word must land on day 0, not vanish, got " + fc.days[0].due);
check(fc.peak === 10, "peak must be the busiest day, got " + fc.peak);
check(fc.total === 15, "total must count every scheduled word inside the horizon, got " + fc.total);
check(RR.forecast(null, NOW, 30).total === 0, "a null schedule forecasts nothing, never throws");

// ── Suite 3: interval histogram ──────────────────────────────────────────────
const hist = RR.intervalHistogram(sched);
check(Array.isArray(hist) && hist.length > 0, "the histogram must return buckets");
check(hist.reduce((n, b) => n + b.count, 0) === Object.keys(sched).length,
  "every scheduled word must land in exactly one bucket");
check(hist.every((b) => typeof b.label === "string" && b.label.length > 0), "each bucket must carry a label");

// ── Suite 4: load balance agrees with the scheduler's own arithmetic ─────────
const mine = RR.loadBalance(sched, null, NOW, 12);
const theirs = TQ.queueLoad({ schedule: sched, statusMap: null, nowMs: NOW, reviewsPerDay: 12 });
check(mine.dueNow === theirs.dueNow, `dueNow disagrees: report ${mine.dueNow} vs scheduler ${theirs.dueNow}`);
check(mine.scheduled === theirs.scheduled, "scheduled count disagrees");
check(Math.abs(mine.inflowPerDay - theirs.inflowPerDay) < 1e-9, "inflow disagrees");
check(mine.requiredPerDay === theirs.requiredPerDay, "requiredPerDay disagrees");
check(mine.growing === theirs.growing, "growing verdict disagrees");
check(typeof mine.daysToDrain === "number", "the report must add a drain estimate the scheduler does not compute");

const ign = RR.loadBalance({ z: { due: NOW - DAY, interval: 3 } }, { z: "ignore" }, NOW, 60);
check(ign.dueNow === 0 && ign.scheduled === 0, "ignored words must count in neither, got " + JSON.stringify(ign));

if (failures.length) {
  console.error(`retention-report-smoke: FAIL ${failures.length}/${checks}`);
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`retention-report-smoke: PASS ${checks}/${checks}`);
