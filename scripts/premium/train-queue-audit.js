#!/usr/bin/env node
"use strict";
// audit:train-queue — T1 coverage measurement (spec §5.5, acceptance §12.1).
//
// The simulation MUST model scheduling feedback AND failures. Measured while building this
// wave: a static backlog re-served every day makes both rules look identical at 100% coverage,
// and a success-only feedback model does too. The owner's loop closes through FAILURE — a wrong
// answer sets interval 0, which sets due = now, which under `lapses DESC` pins the word to the
// head of the queue for ever. An audit that never fails a word cannot see the defect it exists
// to measure.
//
// Compares over DAYS consecutive daily sessions:
//   baseline — the PRE-T1 rule, reimplemented HERE so the comparison is an independent oracle:
//              ORDER BY lapses DESC, due ASC → 24-row prefix cut → weakness rank → 12
//   composed — TrainQueue.composeSession
//
// Usage: node scripts/premium/train-queue-audit.js [--days=20] [--write]

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const TQ = require(path.join(ROOT, "public/js/train-queue.js"));

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((x) => x.indexOf("--" + name + "=") === 0);
  return hit ? hit.split("=")[1] : dflt;
};
const DAYS = Number(arg("days", 20)) || 20;
const WRITE = argv.indexOf("--write") >= 0;
const NOW = Date.UTC(2026, 8, 2, 9, 0, 0);
const DAY_MS = 86400000;

// Synthetic backlog shaped like the owner's recorded profile (208 due / 290 scheduled,
// predecessor packet §9): a realistic lapse tail, mixed intervals, a few known and new words.
function buildBacklog() {
  const out = [];
  for (let i = 0; i < 208; i++) {
    const lapses = i < 6 ? 9 : (i < 20 ? 3 : (i < 60 ? 1 : 0));
    const interval = 2 + (i % 23);
    out.push({
      lemmaKey: "w" + String(i).padStart(3, "0"),
      status: i % 9 === 0 ? "known" : "",
      _srs: {
        due: NOW - (1 + (i % 11)) * DAY_MS,
        interval: i % 17 === 0 ? 0 : interval,
        reps: i % 29 === 0 ? 0 : 2 + (i % 5),
        lapses,
        reviewedAt: NOW - (interval + 1 + (i % 11)) * DAY_MS,
      },
    });
  }
  return out;
}

// Deterministic difficulty: a word the learner keeps failing keeps failing. No Math.random.
function answersWrong(item, day) {
  const lapses = item._srs.lapses || 0;
  if (lapses >= 5) return true;                        // the entrenched leeches
  if (lapses >= 1) return (day + item.lemmaKey.length) % 3 === 0;
  return false;
}

// The PRE-T1 rule, reimplemented independently of production code.
function baselineSession(dueList) {
  const ordered = dueList.slice().sort((a, b) => {
    const la = a._srs.lapses || 0, lb = b._srs.lapses || 0;
    if (lb !== la) return lb - la;
    return (a._srs.due || 0) - (b._srs.due || 0);
  });
  const built = ordered.slice(0, 24);                  // TRAIN_N * 2 prefix cut
  const ranked = built.slice().sort((a, b) => (b._srs.lapses || 0) - (a._srs.lapses || 0));
  return ranked.slice(0, 12);                          // TRAIN_N
}

function run(pick, label) {
  const backlog = buildBacklog();
  const served = new Map();
  const dueDays = new Map();       // how many days each word was actually DUE
  const perDay = [];
  const backlogTrace = [];
  for (let d = 0; d < DAYS; d++) {
    const now = NOW + d * DAY_MS;
    const dayStr = new Date(now).toISOString().slice(0, 10);
    const dueList = backlog.filter((x) => x._srs.due <= now);
    backlogTrace.push(dueList.length);
    dueList.forEach((x) => dueDays.set(x.lemmaKey, (dueDays.get(x.lemmaKey) || 0) + 1));
    const items = pick(dueList, dayStr, now);
    perDay.push(items.length);
    items.forEach((x) => {
      served.set(x.lemmaKey, (served.get(x.lemmaKey) || 0) + 1);
      x._srs.reviewedAt = now;
      if (answersWrong(x, d)) {
        x._srs.lapses = (x._srs.lapses || 0) + 1;
        x._srs.interval = 0;                           // fsrs-core: grade 1 → due now
        x._srs.due = now;
      } else {
        x._srs.reps = (x._srs.reps || 0) + 1;
        x._srs.interval = Math.max(1, Math.round((x._srs.interval || 1) * 2));
        x._srs.due = now + x._srs.interval * DAY_MS;
      }
    });
  }
  let maxCount = 0;
  served.forEach((n) => { if (n > maxCount) maxCount = n; });

  // STARVATION is the direct measure of the owner's complaint — words that waited and never
  // came. maxDayShare alone cannot express it: a word that fails every day is set to due = now
  // by the scheduler itself, so serving it every day is honest, not stuck. What is NOT honest is
  // a word due on many days that the selector never reaches.
  let starved = 0, starvedDueDays = 0, eligible = 0;
  dueDays.forEach((n, key) => {
    if (n < 5) return;                       // only words that genuinely waited a while
    eligible++;
    if (!served.has(key)) { starved++; starvedDueDays += n; }
  });

  return {
    label,
    days: DAYS,
    backlogSize: 208,
    uniqueServed: served.size,
    coverage: Number((served.size / 208).toFixed(4)),
    maxDayShare: Number((maxCount / DAYS).toFixed(4)),
    starvedWords: starved,                   // due on >=5 days, served 0 times
    starvedShare: eligible ? Number((starved / eligible).toFixed(4)) : 0,
    starvedWaitedDays: starvedDueDays,
    meanSession: Number((perDay.reduce((a, b) => a + b, 0) / DAYS).toFixed(2)),
    dueAtStart: backlogTrace[0],
    dueAtEnd: backlogTrace[backlogTrace.length - 1],
  };
}

const baseline = run((dueList) => baselineSession(dueList), "baseline (pre-T1)");
const composed = run((dueList, dayStr, now) => TQ.composeSession(dueList, {
  nowMs: now, dayStr, sessionSize: TQ.DEFAULTS.sessionSize,
  reviewsRemaining: TQ.DEFAULTS.reviewsPerDay, newRemaining: TQ.DEFAULTS.newPerDay,
}).items, "composed (T1, default 20/session)");

// Size-matched control. The default session grew from 12 to 20, so part of the headline gain is
// simply more throughput. Running the new ordering at the OLD size isolates what the ORDERING
// itself bought — reporting only the unmatched figure would overstate the change.
const composedMatched = run((dueList, dayStr, now) => TQ.composeSession(dueList, {
  nowMs: now, dayStr, sessionSize: 12, reviewsRemaining: 12, newRemaining: 0,
}).items, "composed (T1, size-matched 12/session)");

const schedule = {};
buildBacklog().forEach((x) => { schedule[x.lemmaKey] = { due: x._srs.due, interval: x._srs.interval }; });
const loadAtOldSessionSize = TQ.queueLoad({ schedule, statusMap: null, nowMs: NOW, reviewsPerDay: 12 });

const report = {
  generatedFor: "docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md §5.5",
  generatedBy: "scripts/premium/train-queue-audit.js",
  engine: TQ.ENGINE_VERSION,
  days: DAYS,
  model: "scheduling feedback + deterministic difficulty (a failure sets interval 0 → due now)",
  baseline,
  composed,
  composedMatched,
  loadAtOldSessionSize,
};

console.log(JSON.stringify(report, null, 2));

if (WRITE) {
  const dir = path.join(ROOT, "docs/research/room-trainer-maturity/2026-09-02");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "t1-baseline-vs-composed.json"), JSON.stringify(report, null, 2) + "\n");
  console.error("written: docs/research/room-trainer-maturity/2026-09-02/t1-baseline-vs-composed.json");
}
