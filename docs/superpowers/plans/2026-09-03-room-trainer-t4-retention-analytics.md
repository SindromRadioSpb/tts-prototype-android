# Room Trainer T4 — Retention Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the trainer an instrument. Right now nothing is computed over `review_log`, so no claim about the scheduler — including the ones this program already shipped — can be checked by the learner.

**Architecture:** One new pure UMD module `public/js/retention-report.js` folds raw `review_log` rows and the schedule map into reports. It is an **independent fold**: it never calls the selection or scheduling path, and where it overlaps with `TrainQueue.queueLoad` the gate asserts the two agree rather than letting one define the other (R17 — whoever teaches does not certify). The UI is an overlay sheet built exactly like `openStudyHeatmap`, opened from a 📊 button beside the existing 📅 one.

**Tech Stack:** Vanilla ES5-style UMD JavaScript, Node 20 gates, Playwright for live-OPFS and screenshots.

## Global Constraints

- Spec of record: `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md` §8.
- **Read-only.** T4 writes nothing: no `review_log` row, no `word_status` column, no schema change. A report that can alter what it measures is not a report.
- **Independent fold (R17).** `retention-report.js` computes from raw rows. It must not import or call `composeSession`, `bucketOf`, `fsrsStep` or any selection code. Where it duplicates `TrainQueue.queueLoad`, the gate asserts agreement — a cross-check, not a dependency.
- **Honest denominators.** A `skip` is an explicit refusal, not a retrieval outcome: it is excluded from retention and reported separately. Never silently fold it into either side.
- **Deterministic.** `nowMs` injected; no `Math.random()`; no `Date.now()` inside the module.
- New UI strings land in all three locales. **Check for an existing key of the same name in the SAME object first** — `scopeAll` already collided once and the later literal silently wins.
- **Release moves SIX version stamps** (`docs/planning/PROD_INCIDENT_SW_INTEGRITY_AND_DISK_2026_09_02.md` §1.2), three of them gated.
- Check prod `disk_pct_used` **before** pushing; every commit triggers a full ~1.25 GB build, documentation-only ones included.
- Baseline runtime: `3.11.459`.
- Gates green at every commit: `smoke:fsrs`, `smoke:memory-canon`, `smoke:train-queue`, `smoke:word-context`, `smoke:grade-policy`, `smoke:room-training-premium`, `smoke:studio-room-srs`, `smoke:reader-word-status`, `smoke:reader-morph`, `smoke:i18n`.

## What the data actually supports

Checked before designing, so the reports promise only what the log can answer.

| Field | Written by | Usable for |
|---|---|---|
| `kind` | every row | separating `review` / `skip` / `mark` / `seed` / `annul` |
| `grade` 1–4 | review/skip | retention (pass = grade > 1, the reference's own rule) |
| `channel` e.g. `read:mc` | the trainer | retention per extraction channel; family via the prefix |
| `meta.evidence_scope` | the predecessor release | retention per evidence class — **written since 2026-08-11 and never read; T4 is its first consumer** |
| `meta.fuzz_days` | T3 | how often fuzz moved an interval |
| `word_status.srs_*` | the projection | forecast, interval histogram, leech list |

`evidence_scope` takes exactly four values (`grade-policy.js`): `recognition`, `assisted_production`,
`context_supported`, `unsupported_production`. Reporting retention per scope is the honest way to
answer "do I actually know this, or do I recognise it?" — the question the scaffolding contract
(predecessor packet §1) deliberately left open.

---

### Task 1: The pure report engine — forecast, histogram, load

**Files:**
- Create: `public/js/retention-report.js`
- Create: `scripts/premium/retention-report-smoke.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `RetentionReport.ENGINE_VERSION: string` — `"retention-report-v1"`
  - `forecast(schedule, nowMs, days) -> { days: [{ day, due }], total, peak }`
  - `intervalHistogram(schedule) -> [{ label, min, max, count }]`
  - `loadBalance(schedule, statusMap, nowMs, reviewsPerDay) -> { dueNow, scheduled, inflowPerDay, requiredPerDay, growing, daysToDrain }`

`loadBalance` deliberately re-derives what `TrainQueue.queueLoad` computes. Task 1's gate asserts the two agree on the same input: a report that simply echoed the scheduler could not contradict it, and a metric that cannot contradict is not evidence.

- [ ] **Step 1: Write the failing test**

Create `scripts/premium/retention-report-smoke.js`:

```js
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

// ignored words count in neither
const ign = RR.loadBalance({ z: { due: NOW - DAY, interval: 3 } }, { z: "ignore" }, NOW, 60);
check(ign.dueNow === 0 && ign.scheduled === 0, "ignored words must count in neither, got " + JSON.stringify(ign));

if (failures.length) {
  console.error(`retention-report-smoke: FAIL ${failures.length}/${checks}`);
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`retention-report-smoke: PASS ${checks}/${checks}`);
```

Register in `package.json`, after `"smoke:word-context"`:

```json
    "smoke:retention-report": "node scripts/premium/retention-report-smoke.js",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:retention-report`
Expected: FAIL — `Cannot find module '.../public/js/retention-report.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `public/js/retention-report.js`:

```js
/* retention-report.js — Room Trainer T4 analytics (UMD, pure).
 *
 * Plan: docs/superpowers/plans/2026-09-03-room-trainer-t4-retention-analytics.md
 * Spec: docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md §8
 *
 * The trainer had no instrument: nothing was computed over review_log, so no claim about the
 * scheduler could be checked by the learner. This module folds the raw log and the schedule map
 * into reports.
 *
 * INDEPENDENT FOLD (R17 — whoever teaches does not certify). It never calls the selection or
 * scheduling path. Where it overlaps TrainQueue.queueLoad it RE-DERIVES the arithmetic and the
 * gate asserts the two agree: a report that echoed the scheduler could not contradict it, and a
 * metric that cannot contradict is not evidence.
 *
 * Read-only and deterministic: nowMs is injected, nothing is written, no Math.random.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.RetentionReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENGINE_VERSION = "retention-report-v1";
  var DAY_MS = 86400000;

  function _live(schedule, statusMap) {
    var out = [];
    if (!schedule) return out;
    for (var k in schedule) {
      var row = schedule[k];
      if (!row) continue;
      if (statusMap && statusMap[k] === "ignore") continue;
      out.push({ key: k, due: Number(row.due) || 0, interval: Number(row.interval) || 0 });
    }
    return out;
  }

  // Daily load for the next `days` days. Anything already overdue lands on day 0 rather than
  // disappearing — a backlog you cannot see is the thing that let this one grow.
  function forecast(schedule, nowMs, days) {
    var now = Number(nowMs) || 0;
    var n = Math.max(1, Math.min(365, Math.round(Number(days) || 30)));
    var rows = _live(schedule, null);
    var buckets = [];
    for (var i = 0; i < n; i++) buckets.push({ day: i, due: 0 });
    var total = 0;
    for (var j = 0; j < rows.length; j++) {
      var offset = Math.floor((rows[j].due - now) / DAY_MS);
      if (offset < 0) offset = 0;
      if (offset >= n) continue;
      buckets[offset].due++;
      total++;
    }
    var peak = 0;
    for (var b = 0; b < buckets.length; b++) if (buckets[b].due > peak) peak = buckets[b].due;
    return { days: buckets, total: total, peak: peak };
  }

  var HIST_BUCKETS = [
    { label: "0–1", min: 0, max: 1 },
    { label: "2–6", min: 2, max: 6 },
    { label: "7–20", min: 7, max: 20 },
    { label: "21–60", min: 21, max: 60 },
    { label: "61–180", min: 61, max: 180 },
    { label: "181+", min: 181, max: Infinity }
  ];

  function intervalHistogram(schedule) {
    var rows = _live(schedule, null);
    var out = HIST_BUCKETS.map(function (b) { return { label: b.label, min: b.min, max: b.max, count: 0 }; });
    for (var i = 0; i < rows.length; i++) {
      var iv = rows[i].interval;
      for (var b = 0; b < out.length; b++) {
        if (iv >= out[b].min && iv <= out[b].max) { out[b].count++; break; }
      }
    }
    return out;
  }

  // Re-derived, NOT delegated — see the header. A scheduled word with interval I returns 1/I
  // times per day, so the steady-state inbound flow is the sum of 1/max(I,1).
  function loadBalance(schedule, statusMap, nowMs, reviewsPerDay) {
    var now = Number(nowMs) || 0;
    var cap = Number(reviewsPerDay);
    if (!isFinite(cap) || cap < 0) cap = 0;
    var rows = _live(schedule, statusMap);
    var dueNow = 0, inflow = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].due <= now) dueNow++;
      inflow += 1 / Math.max(1, rows[i].interval);
    }
    var required = Math.ceil(inflow - 1e-9);
    if (required < 0) required = 0;
    var growing = rows.length > 0 && cap < required;
    // How long the current backlog takes to clear at the configured pace, once the inbound flow
    // is paid for. Infinity when the pace cannot even cover the inflow.
    var surplus = cap - inflow;
    var daysToDrain = (dueNow === 0) ? 0 : (surplus > 0 ? Math.ceil(dueNow / surplus) : Infinity);
    return {
      dueNow: dueNow, scheduled: rows.length, inflowPerDay: inflow,
      requiredPerDay: required, growing: growing, daysToDrain: daysToDrain
    };
  }

  return {
    ENGINE_VERSION: ENGINE_VERSION,
    forecast: forecast,
    intervalHistogram: intervalHistogram,
    loadBalance: loadBalance
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:retention-report`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/retention-report.js scripts/premium/retention-report-smoke.js package.json
git commit -m "feat(room): add the pure retention-report engine as an independent fold"
```

---

### Task 2: True retention by channel and by evidence scope

**Files:**
- Modify: `public/js/retention-report.js`
- Modify: `scripts/premium/retention-report-smoke.js`

**Interfaces:**
- Consumes: Task 1's module.
- Produces: `trueRetention(rows, opts) -> { overall, byChannel, byScope, skipped, window }`
  - each bucket is `{ attempts, passed, rate }`; `rate` is `null` when `attempts === 0` rather than a misleading `0`.

**The honesty rules, which are the whole point of this task:**

1. A `skip` is an explicit refusal, not a retrieval outcome. It is excluded from both numerator and denominator and reported separately as `skipped`. Folding it in either direction would be a lie in a different direction each time.
2. Annulled rows are excluded, exactly as `FsrsCore.withoutAnnulled` excludes them.
3. `mark` and `seed` rows are not retrievals and never count.
4. Pass is `grade > 1` — the reference's own rule, where only Again is a failure.
5. `evidence_scope` finally gets read. A high `recognition` rate next to a low `unsupported_production` rate is the honest answer to "do I know this word or do I merely recognise it?", which the scaffolding contract deliberately left open.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/retention-report-smoke.js` before the report block:

```js
// ── Suite 5: true retention ──────────────────────────────────────────────────
const iso = (d) => new Date(NOW - d * DAY).toISOString();
const rows = [
  { id: "1", item_key: "w1", kind: "review", grade: 3, reviewed_at: iso(5), channel: "read:mc", meta_json: JSON.stringify({ evidence_scope: "recognition" }) },
  { id: "2", item_key: "w1", kind: "review", grade: 1, reviewed_at: iso(4), channel: "read:mc", meta_json: JSON.stringify({ evidence_scope: "recognition" }) },
  { id: "3", item_key: "w2", kind: "review", grade: 4, reviewed_at: iso(3), channel: "reverse:type", meta_json: JSON.stringify({ evidence_scope: "unsupported_production" }) },
  { id: "4", item_key: "w2", kind: "review", grade: 1, reviewed_at: iso(2), channel: "reverse:type", meta_json: JSON.stringify({ evidence_scope: "unsupported_production" }) },
  { id: "5", item_key: "w3", kind: "skip",   grade: 1, reviewed_at: iso(1), channel: "read:mc", meta_json: JSON.stringify({ evidence_scope: "recognition" }) },
  { id: "6", item_key: "w4", kind: "mark",   grade: null, reviewed_at: iso(1), meta_json: JSON.stringify({ status: "known" }) },
  { id: "7", item_key: "w5", kind: "seed",   grade: null, reviewed_at: iso(9), meta_json: "{}" },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:retention-report`
Expected: FAIL — `RR.trueRetention is not a function`.

- [ ] **Step 3: Write minimal implementation**

Insert into `public/js/retention-report.js` before the `return` block:

```js
  function _bucket() { return { attempts: 0, passed: 0, rate: null }; }
  function _seal(b) { b.rate = b.attempts ? b.passed / b.attempts : null; return b; }

  // Channel family = the prefix before ':' — the trainer writes '<channel>[:<mode>]'.
  function _family(channel) {
    var c = String(channel == null ? "" : channel);
    var i = c.indexOf(":");
    return (i >= 0 ? c.slice(0, i) : c) || "unknown";
  }

  // True retention over a window. The honesty rules ARE the feature:
  //   • a skip is an explicit refusal, not a retrieval outcome — excluded from both sides and
  //     reported separately, because folding it either way lies in a different direction;
  //   • annulled rows leave the numbers exactly as they leave the fold;
  //   • mark and seed rows are not retrievals;
  //   • pass is grade > 1 (the reference's own rule: only Again is a failure);
  //   • an empty bucket reports null, not 0% — unknown is not the same as total failure.
  function trueRetention(rows, opts) {
    opts = opts || {};
    var now = Number(opts.nowMs) || 0;
    var days = Math.max(1, Math.min(3650, Math.round(Number(opts.days) || 30)));
    var since = now - days * DAY_MS;
    var list = Array.isArray(rows) ? rows : [];

    var annulled = {};
    for (var a = 0; a < list.length; a++) {
      var ar = list[a];
      if (!ar || ar.kind !== "annul") continue;
      var m = {};
      try { m = typeof ar.meta_json === "string" ? JSON.parse(ar.meta_json) : (ar.meta || {}); } catch (_) { m = {}; }
      if (m && m.annul_of != null) annulled[String(m.annul_of)] = 1;
    }

    var overall = _bucket(), byChannel = {}, byScope = {}, skipped = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r) continue;
      if (r.kind !== "review" && r.kind !== "skip") continue;
      if (annulled[String(r.id)]) continue;
      var at = Date.parse(r.reviewed_at || "") || 0;
      if (at < since) continue;
      if (r.kind === "skip") { skipped++; continue; }
      var g = Number(r.grade) || 0;
      if (!(g >= 1 && g <= 4)) continue;
      var meta = {};
      try { meta = typeof r.meta_json === "string" ? JSON.parse(r.meta_json) : (r.meta || {}); } catch (_) { meta = {}; }
      var fam = _family(r.channel);
      var scope = meta && meta.evidence_scope ? String(meta.evidence_scope) : "unknown";
      if (!byChannel[fam]) byChannel[fam] = _bucket();
      if (!byScope[scope]) byScope[scope] = _bucket();
      var pass = g > 1 ? 1 : 0;
      overall.attempts++; overall.passed += pass;
      byChannel[fam].attempts++; byChannel[fam].passed += pass;
      byScope[scope].attempts++; byScope[scope].passed += pass;
    }
    _seal(overall);
    for (var c in byChannel) _seal(byChannel[c]);
    for (var s in byScope) _seal(byScope[s]);
    return { overall: overall, byChannel: byChannel, byScope: byScope, skipped: skipped, window: days };
  }
```

Add `trueRetention: trueRetention` to the `return` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:retention-report`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/retention-report.js scripts/premium/retention-report-smoke.js
git commit -m "feat(room): report true retention by channel and by evidence scope"
```

---

### Task 3: The leech list

**Files:**
- Modify: `public/js/retention-report.js`
- Modify: `scripts/premium/retention-report-smoke.js`

**Interfaces:**
- Produces: `leechList(schedule, statusMap, rows, threshold, limit) -> [{ key, lapses, attempts, passed, rate, lastFailedAt, released }]`

A released leech (T3's `meta.leech_released` mark) is reported as released rather than dropped: the learner asserted it is workable, and hiding it would hide the assertion.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/retention-report-smoke.js`:

```js
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
const keys = leeches.map((x) => x.key);
check(keys.indexOf("cool") < 0, "a word below the threshold is not a leech, got " + keys.join(","));
check(keys.indexOf("hot") >= 0 && keys.indexOf("warm") >= 0, "words at or over the threshold must be listed, got " + keys.join(","));
check(keys[0] === "hot", "the worst word must come first, got " + keys.join(","));
const gone = leeches.find((x) => x.key === "gone");
check(gone && gone.released === true,
  "a released leech must be shown AS released, not hidden — hiding it would hide the learner's own assertion");
const hot = leeches.find((x) => x.key === "hot");
check(hot && hot.attempts === 2 && hot.passed === 1 && Math.abs(hot.rate - 0.5) < 1e-9,
  "the list must carry each word's own retention, got " + JSON.stringify(hot));
check(RR.leechList(lsched, null, lrows, 4, 1).length === 1, "the limit must be honoured");
check(RR.leechList(null, null, null, 4, 50).length === 0, "null inputs yield an empty list, never a throw");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:retention-report`
Expected: FAIL — `RR.leechList is not a function`.

- [ ] **Step 3: Write minimal implementation**

Insert before the `return` block:

```js
  // Words the scheduler keeps bringing back. Ordered worst-first (lapses, then a weaker rate),
  // each carrying its OWN retention so the learner can see whether it is failing everywhere or
  // only on one channel. A leech released in T3 is shown as released rather than dropped: the
  // learner asserted it is workable, and hiding it would hide the assertion.
  function leechList(schedule, statusMap, rows, threshold, limit) {
    var thr = Math.max(1, Math.round(Number(threshold) || 4));
    var cap = Math.max(1, Math.min(500, Math.round(Number(limit) || 50)));
    var list = Array.isArray(rows) ? rows : [];

    var released = {}, stats = {}, lastFail = {};
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.item_key) continue;
      var meta = {};
      try { meta = typeof r.meta_json === "string" ? JSON.parse(r.meta_json) : (r.meta || {}); } catch (_) { meta = {}; }
      var key = String(r.item_key);
      if (r.kind === "mark" && meta && meta.leech_released) { released[key] = 1; continue; }
      if (r.kind !== "review") continue;
      var g = Number(r.grade) || 0;
      if (!(g >= 1 && g <= 4)) continue;
      if (!stats[key]) stats[key] = { attempts: 0, passed: 0 };
      stats[key].attempts++;
      if (g > 1) stats[key].passed++;
      else {
        var at = Date.parse(r.reviewed_at || "") || 0;
        if (!lastFail[key] || at > lastFail[key]) lastFail[key] = at;
      }
    }

    var out = [];
    if (schedule) {
      for (var k in schedule) {
        var row = schedule[k];
        if (!row) continue;
        if (statusMap && statusMap[k] === "ignore") continue;
        var lapses = Number(row.lapses) || 0;
        if (lapses < thr) continue;
        var st = stats[k] || { attempts: 0, passed: 0 };
        out.push({
          key: k, lapses: lapses, attempts: st.attempts, passed: st.passed,
          rate: st.attempts ? st.passed / st.attempts : null,
          lastFailedAt: lastFail[k] || null,
          released: !!released[k]
        });
      }
    }
    out.sort(function (a, b) {
      if (b.lapses !== a.lapses) return b.lapses - a.lapses;
      var ra = a.rate == null ? 1 : a.rate, rb = b.rate == null ? 1 : b.rate;
      if (ra !== rb) return ra - rb;
      return String(a.key) < String(b.key) ? -1 : 1;
    });
    return out.slice(0, cap);
  }
```

Add `leechList: leechList` to the `return` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:retention-report`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/retention-report.js scripts/premium/retention-report-smoke.js
git commit -m "feat(room): list the words the scheduler keeps bringing back"
```

---

### Task 4: The report sheet

**Files:**
- Modify: `public/js/library-ui.js`
- Modify: `public/library.html` (script tag + CSS)
- Modify: `public/sw.js` (precache)
- Modify: `public/i18n/locales/{ru,en,he}.js`
- Modify: `scripts/premium/train-queue-smoke.js`
- Modify: `scripts/premium/train-queue-shots.js`

**Interfaces:**
- Consumes: `RetentionReport.*` (Tasks 1–3), `localDb.getReviewLog`, `localDb.getSrsSchedule`, `localDb.getAllWordStatuses`.
- Produces: `openRetentionReport()` in `library-ui.js`, opened from a 📊 button beside the existing 📅 one.

Built exactly like `openStudyHeatmap` (`list-picker-ov` overlay, Escape to close, focus returned), so it inherits a shape already proven at 380 px and in RTL.

New locale keys, **checked for collisions first**: `reportTitle`, `reportForecast`, `reportRetention`, `reportIntervals`, `reportLeeches`, `reportEmpty`, `reportSkipped`, `reportNoData`, `reportDrain`, `reportDrainNever`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js`:

```js
// ── Suite 18: retention report sheet (T4) ────────────────────────────────────
const REPORT_KEYS = ["reportTitle", "reportForecast", "reportRetention", "reportIntervals",
  "reportLeeches", "reportEmpty", "reportSkipped", "reportNoData", "reportDrain", "reportDrainNever"];
REPORT_KEYS.forEach((k) => {
  check(new RegExp("room\\.morph\\.study\\." + k + "\\b").test(room), `library-ui must use the ${k} string`);
  localeSrc.forEach((L) => check(new RegExp("\\b" + k + "\\s*:").test(L.src), `locale ${L.name} must define ${k}`));
});
check(/function openRetentionReport\s*\(/.test(room), "the Room must open a retention report");
check(/data-report-open/.test(room), "the report must have an entry point");
check(/<script src="\/js\/retention-report\.js(\?v=\d+)?"><\/script>/.test(html), "library.html must load retention-report.js");
check(/"\/js\/retention-report\.js(\?v=\d+)?"/.test(sw), "sw.js must precache retention-report.js");
// Read-only is the contract: a report that can change what it measures is not a report.
const reportBody = (room.match(/async function openRetentionReport[\s\S]*?\n}\n/) || [""])[0];
check(reportBody.length > 0, "openRetentionReport must be locatable");
check(!/setWordStatus|commitReviewAttempt|appendReviewLog|updateSrs/.test(reportBody),
  "the report must be READ-ONLY — it may not write a status, an event or a schedule");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL on every Suite 18 check.

- [ ] **Step 3: Add the locale strings**

First confirm no collision: `grep -n "reportTitle\|reportForecast\|reportRetention\|reportIntervals\|reportLeeches\|reportEmpty\|reportSkipped\|reportNoData\|reportDrain" public/i18n/locales/ru.js` must print nothing.

Then add to each locale's `study:` object:

`ru.js`:
```js
        reportTitle: "Как идёт запоминание",
        reportForecast: "Нагрузка на 30 дней",
        reportRetention: "Удержание",
        reportIntervals: "Интервалы",
        reportLeeches: "Залипшие слова",
        reportEmpty: "Пока нечего показать. Пройдите несколько повторений — отчёт наполнится сам.",
        reportSkipped: "Пропущено (не засчитано ни в ту, ни в другую сторону): {n}",
        reportNoData: "нет данных",
        reportDrain: "Текущий долг разойдётся примерно за {n} дн.",
        reportDrainNever: "При текущем лимите долг не разойдётся — очередь растёт.",
```

`en.js`:
```js
        reportTitle: "How your memory is doing",
        reportForecast: "Load over 30 days",
        reportRetention: "Retention",
        reportIntervals: "Intervals",
        reportLeeches: "Stuck words",
        reportEmpty: "Nothing to show yet. Do a few reviews and this fills itself in.",
        reportSkipped: "Skipped (counted on neither side): {n}",
        reportNoData: "no data",
        reportDrain: "The current backlog clears in about {n} days.",
        reportDrainNever: "At this limit the backlog will not clear — the queue is growing.",
```

`he.js`:
```js
        reportTitle: "איך הזיכרון מתקדם",
        reportForecast: "עומס ל-30 יום",
        reportRetention: "שימור",
        reportIntervals: "מרווחים",
        reportLeeches: "מילים תקועות",
        reportEmpty: "אין עדיין מה להציג. בצעו כמה חזרות והדוח יתמלא מעצמו.",
        reportSkipped: "דילוגים (לא נספרים לאף צד): {n}",
        reportNoData: "אין נתונים",
        reportDrain: "הפיגור הנוכחי ייסגר בערך תוך {n} ימים.",
        reportDrainNever: "במגבלה הנוכחית הפיגור לא ייסגר — התור גדל.",
```

- [ ] **Step 4: Register the module**

`public/library.html`: add `<script src="/js/retention-report.js?v=460"></script>` next to the other engine scripts.
`public/sw.js`: add `"/js/retention-report.js?v=460",` to the precache list.
`server.js`: add `"/js/retention-report.js?v=460",` to `SHELL_INTEGRITY_PATHS` — the shell-integrity cohort and the precache must agree or the service-worker install fails closed.

- [ ] **Step 5: Render the sheet**

Add the entry button next to the existing calendar button in `ensureStudySheet`:

```js
  const repBtn = el('button', { class: 'room-study-cal', attrs: { type: 'button', 'data-report-open': '1',
    'aria-label': tt('room.morph.study.reportTitle', 'Как идёт запоминание'), title: tt('room.morph.study.reportTitle', 'Как идёт запоминание') } });
  repBtn.textContent = '📊';
  head.appendChild(repBtn);
```

Wire it in the sheet delegate next to `[data-heatmap-toggle]`:

```js
    if (t.closest('[data-report-open]')) { openRetentionReport(); return; }
```

Add `openRetentionReport` modelled on `openStudyHeatmap`: fetch `getReviewLog()`, `getSrsSchedule()`, `getAllWordStatuses()`, fold with `RetentionReport`, render four sections (forecast sparkline, retention rows, interval bars, leech list), an honest empty state when there is nothing, Escape to close and focus returned.

Every rate renders as `reportNoData` when it is `null` — never as `0%`.

- [ ] **Step 6: Style it**

Add `.room-report-*` rules to `public/library.html` mirroring `.heatmap-sheet`: a scrollable body, bars as flex rows with `min-height: 44px` on anything interactive, and `overflow-x: auto` on the forecast strip so a wide chart scrolls inside its own container rather than the page.

- [ ] **Step 7: Run tests and capture screenshots**

Run: `npm run smoke:train-queue && npm run smoke:retention-report && npm run smoke:i18n`
Extend `scripts/premium/train-queue-shots.js` with a pass that seeds graded history, opens the report, asserts all four sections rendered, and captures at 380 RU and 380 HE/RTL. Look at the images.

- [ ] **Step 8: Commit**

```bash
git add public/js/library-ui.js public/library.html public/sw.js server.js public/i18n/locales/*.js scripts/premium/train-queue-smoke.js scripts/premium/train-queue-shots.js docs/research/room-trainer-maturity
git commit -m "feat(room): show how memory is actually doing"
```

---

### Task 5: Release

- [ ] **Step 1: Check the prod disk BEFORE pushing**

Run: `curl -s https://linguistpro.kolosei.com/healthz`
Above 85%, prune unused images and build cache first. Every commit triggers a full ~1.25 GB build.

- [ ] **Step 2: Move all six version stamps to `3.11.460` / locale `194`**

`APP_VERSION`; `CACHE_VERSION`; locale `?v=` in both shells; `#roomFooterVersion`; per-module `?v=` for `library-ui.js`, `train-queue.js` **and** the new `retention-report.js` in the shell and the precache; `SHELL_INTEGRITY_PATHS` in `server.js`. Then `node tests/i18n.smoke.js --write-lock`.

- [ ] **Step 3: Full gate sweep**

`smoke:retention-report`, `smoke:train-queue`, `smoke:word-context`, `smoke:i18n`, `smoke:fsrs`, `smoke:grade-policy`, `smoke:memory-canon`, `smoke:room-training-premium`, `smoke:studio-room-srs`, `smoke:reader-word-status`, `smoke:reader-morph`, `smoke:reader-parity`, `smoke:canon-version`, `git diff --check`. OPFS gates one at a time.

- [ ] **Step 4: Commit, push, verify**

After the build lands, confirm `/api/client-config` reports `3.11.460` with `retention-report.js` in `shellIntegrity`, and that a fresh browser reaches service-worker state `activated` with a `linguistpro-precache-v3.11.460` bucket. Prune afterwards. Do not grade any word on the owner's profile.

- [ ] **Step 5: Update the canon**

Mark T4 SHIPPED in `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md`, which completes the owner's stated release boundary (T1–T4). T5 and T6 remain as the maturity tail.

---

## Self-Review

**Spec coverage (§8):**

| Spec requirement | Task |
|---|---|
| read-only over `review_log` | 1–3 (pure module), 4 (gate asserts no writes) |
| independent fold, not the scheduling path | 1 (gate forbids the imports and cross-checks `queueLoad`) |
| 30-day load forecast | 1 (`forecast`) |
| true retention by channel | 2 (`byChannel`) |
| true retention by `evidence_scope` | 2 (`byScope`) — its first consumer |
| interval histogram | 1 (`intervalHistogram`) |
| leech list | 3 (`leechList`) |
| daily count required for the queue to stop growing | 1 (`loadBalance.requiredPerDay`) |
| coverage by scope | reused from T2's `getScopeCounts` on the launch screen rather than duplicated |
| six version stamps | 5 |

**Placeholder scan:** every code step carries literal code; Task 4's render is described structurally because it mirrors `openStudyHeatmap`, whose shape is already in the file.

**Type consistency:** `forecast -> { days:[{day,due}], total, peak }`, `intervalHistogram -> [{label,min,max,count}]`, `loadBalance -> { dueNow, scheduled, inflowPerDay, requiredPerDay, growing, daysToDrain }`, `trueRetention -> { overall, byChannel, byScope, skipped, window }` with buckets `{attempts,passed,rate}`, and `leechList -> [{key,lapses,attempts,passed,rate,lastFailedAt,released}]` are defined in Tasks 1–3 and read with exactly those names in Task 4.

**Risks flagged for execution:**

1. **`getReviewLog()` with no key reads the entire history** (up to 100 000 rows). On the owner's profile that is ~5 500 keys' worth of rows. Measure the fold's cost during Task 4 and, if the sheet is slow to open, bound the window at the query rather than folding everything and discarding.
2. **The new module is a fourth shell asset**, so it must be added to the precache **and** `SHELL_INTEGRITY_PATHS` together. Those two lists disagreeing is exactly what broke the service worker on 2026-09-02; `smoke:train-queue` now gates the subset relation.
3. **`0%` versus `no data`.** An empty bucket must never render as `0%`. The module returns `null` for that reason and Task 2 asserts it; the renderer has to honour it.
