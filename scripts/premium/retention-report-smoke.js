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

// ── Suite 5: true retention ──────────────────────────────────────────────────
const iso = (d) => new Date(NOW - d * DAY).toISOString();
const rows = [
  { id: "1", item_key: "w1", kind: "review", grade: 3, reviewed_at: iso(5), channel: "read:mc", meta_json: JSON.stringify({ evidence_scope: "recognition" }) },
  { id: "2", item_key: "w1", kind: "review", grade: 1, reviewed_at: iso(4), channel: "read:mc", meta_json: JSON.stringify({ evidence_scope: "recognition" }) },
  { id: "3", item_key: "w2", kind: "review", grade: 4, reviewed_at: iso(3), channel: "reverse:type", meta_json: JSON.stringify({ evidence_scope: "unsupported_production" }) },
  { id: "4", item_key: "w2", kind: "review", grade: 1, reviewed_at: iso(2), channel: "reverse:type", meta_json: JSON.stringify({ evidence_scope: "unsupported_production" }) },
  { id: "5", item_key: "w3", kind: "skip", grade: 1, reviewed_at: iso(1), channel: "read:mc", meta_json: JSON.stringify({ evidence_scope: "recognition" }) },
  { id: "6", item_key: "w4", kind: "mark", grade: null, reviewed_at: iso(1), meta_json: JSON.stringify({ status: "known" }) },
  { id: "7", item_key: "w5", kind: "seed", grade: null, reviewed_at: iso(9), meta_json: "{}" },
];

const tr = RR.trueRetention(rows, { nowMs: NOW, days: 30 });
check(tr.overall.attempts === 4, "only graded review rows count as attempts, got " + tr.overall.attempts);
check(tr.overall.passed === 2, "pass is grade > 1, got " + tr.overall.passed);
check(Math.abs(tr.overall.rate - 0.5) < 1e-9, "overall rate must be 2/4, got " + tr.overall.rate);
check(tr.skipped === 1, "a skip must be reported SEPARATELY, never folded into either side, got " + tr.skipped);
check(tr.byChannel.read && tr.byChannel.read.attempts === 2, "channel families must group by prefix, got " + JSON.stringify(tr.byChannel));
check(tr.byChannel.reverse && tr.byChannel.reverse.attempts === 2, "reverse channel must be counted");
check(tr.byScope.recognition && tr.byScope.recognition.attempts === 2,
  "evidence_scope must finally be read — it has been written since 2026-08-11 and never consumed");
check(tr.byScope.unsupported_production && Math.abs(tr.byScope.unsupported_production.rate - 0.5) < 1e-9,
  "unsupported production must be reported separately from recognition");

// an annulled row must vanish from the numbers exactly as it vanishes from the fold
const annulled = rows.concat([
  { id: "8", item_key: "w1", kind: "annul", grade: null, reviewed_at: iso(0), meta_json: JSON.stringify({ annul_of: "2" }) },
]);
const trA = RR.trueRetention(annulled, { nowMs: NOW, days: 30 });
check(trA.overall.attempts === 3 && trA.overall.passed === 2,
  "an annulled grade must leave the numbers, got " + JSON.stringify(trA.overall));

// an empty bucket reports null, never a misleading zero
const trEmpty = RR.trueRetention([], { nowMs: NOW, days: 30 });
check(trEmpty.overall.attempts === 0 && trEmpty.overall.rate === null,
  "no attempts must yield a null rate, not 0% — an empty bucket is unknown, not perfect failure");

// the window actually filters
const trShort = RR.trueRetention(rows, { nowMs: NOW, days: 3 });
check(trShort.overall.attempts < tr.overall.attempts, "a shorter window must exclude older rows");

// ── Suite 6: leech list ──────────────────────────────────────────────────────
const lsched = {
  hot: { due: NOW, interval: 0, lapses: 9 },
  warm: { due: NOW, interval: 3, lapses: 4 },
  cool: { due: NOW, interval: 20, lapses: 1 },
  gone: { due: NOW, interval: 5, lapses: 7 },
};
const lrows = [
  { id: "a", item_key: "hot", kind: "review", grade: 1, reviewed_at: iso(1), channel: "read:mc", meta_json: "{}" },
  { id: "b", item_key: "hot", kind: "review", grade: 3, reviewed_at: iso(6), channel: "read:mc", meta_json: "{}" },
  { id: "c", item_key: "gone", kind: "mark", grade: null, reviewed_at: iso(0), meta_json: JSON.stringify({ leech_released: 1 }) },
];
const leeches = RR.leechList(lsched, { gone: "" }, lrows, 4, 50);
const lkeys = leeches.map((x) => x.key);
check(lkeys.indexOf("cool") < 0, "a word below the threshold is not a leech, got " + lkeys.join(","));
check(lkeys.indexOf("hot") >= 0 && lkeys.indexOf("warm") >= 0, "words at or over the threshold must be listed, got " + lkeys.join(","));
check(lkeys[0] === "hot", "the worst word must come first, got " + lkeys.join(","));
const goneRow = leeches.find((x) => x.key === "gone");
check(goneRow && goneRow.released === true,
  "a released leech must be shown AS released, not hidden — hiding it would hide the learner's own assertion");
const hotRow = leeches.find((x) => x.key === "hot");
check(hotRow && hotRow.attempts === 2 && hotRow.passed === 1 && Math.abs(hotRow.rate - 0.5) < 1e-9,
  "the list must carry each word's own retention, got " + JSON.stringify(hotRow));
check(RR.leechList(lsched, null, lrows, 4, 1).length === 1, "the limit must be honoured");
check(RR.leechList(null, null, null, 4, 50).length === 0, "null inputs yield an empty list, never a throw");

if (failures.length) {
  console.error(`retention-report-smoke: FAIL ${failures.length}/${checks}`);
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`retention-report-smoke: PASS ${checks}/${checks}`);
