# Room Trainer T1 — Serving Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Reading Room cross-text review queue serve the whole due backlog with day-varying variety, configurable daily limits and session size, honest load arithmetic, and distractors drawn from outside the session — without touching the database schema or any code that writes memory.

**Architecture:** A new pure UMD module `public/js/train-queue.js` (the `grade-policy.js` / `fsrs-core.js` pattern: browser `<script>` + Node `require`, no DOM, no `Date.now()`, no `Math.random()`) owns bucketing, the day-seeded permutation, session composition and load arithmetic. `public/js/library-ui.js` stops sorting by `srs_lapses` and delegates to it. `public/db/local-db.js` drops the biased `ORDER BY` and gains one read-only query for today's answered items. Everything is a *selection* change: no migration, no new write path, no change to `review_log`, `word_status`, FSRS state or the grade path.

**Tech Stack:** Vanilla ES5-style UMD JavaScript (the project's shared-module dialect), wa-sqlite over OPFS, Node 20 test scripts, Playwright for the live OPFS gate.

## Global Constraints

- Spec of record: `docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md`. Wave T1 = §5.
- **No schema change.** `public/db/migrations.js` must not be touched in this wave.
- **No memory-writing change.** `commitReviewAttempt`, `fsrsStep`, `checkTrainAnswer`'s write block, `review_log` and `word_status` write paths stay byte-identical in behaviour.
- **No `Math.random()`** anywhere in `public/js/train-queue.js` or in the selection path.
- **No `Date.now()` inside `train-queue.js`** — `nowMs` and `dayStr` are always injected by the caller.
- Every new UI string is added to **all three** locales `public/i18n/locales/{ru,en,he}.js`; `tt(key, fallback)` fallbacks are unreachable once `t()` is loaded.
- Version lockstep on release: `window.APP_VERSION` in `public/index.html`, `CACHE_VERSION` in `public/sw.js`, the locale `?v=` tags and `tests/i18n.locale-version.lock.json` move together.
- New browser module files must be registered in **both** `public/library.html` (script tag) and `public/sw.js` (precache list).
- Baseline runtime at plan time: `3.11.456`.
- Gates that must stay green at every commit: `npm run smoke:fsrs`, `npm run smoke:memory-canon`, `npm run smoke:grade-policy`, `npm run smoke:room-training-premium`, `npm run smoke:studio-room-srs`, `npm run smoke:reader-morph`, `npm run smoke:i18n`.

---

### Task 1: Pure module skeleton and the day-seeded permutation

**Files:**
- Create: `public/js/train-queue.js`
- Create: `scripts/premium/train-queue-smoke.js`
- Modify: `package.json` (add the `smoke:train-queue` script)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `TrainQueue.ENGINE_VERSION: string` — `"train-queue-v1"`
  - `TrainQueue.DEFAULTS: { sessionSize: number, reviewsPerDay: number, newPerDay: number, weaknessShare: number, knownShare: number }`
  - `TrainQueue.dayHash(lemmaKey: string, dayStr: string) -> number` (uint32)
  - `TrainQueue.dayPermute(items: Array<{lemmaKey: string}>, dayStr: string) -> Array` (new array, same members)

- [ ] **Step 1: Write the failing test**

Create `scripts/premium/train-queue-smoke.js`:

```js
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
const src = fs.readFileSync(path.join(ROOT, "public/js/train-queue.js"), "utf8");
check(!/Math\.random/.test(src), "train-queue.js must contain no Math.random (project invariant)");
check(!/Date\.now/.test(src), "train-queue.js must contain no Date.now (nowMs is injected)");
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

// how many of the first 12 change between two consecutive days — the variety signal
const headA = new Set(dayA1.slice(0, 12));
const overlap = dayB.slice(0, 12).filter((k) => headA.has(k)).length;
check(overlap < 12, "the served head must not be identical on consecutive days, overlap=" + overlap);

if (failures.length) {
  console.error(`train-queue-smoke: FAIL ${failures.length}/${checks}`);
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`train-queue-smoke: PASS ${checks}/${checks}`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/premium/train-queue-smoke.js`
Expected: FAIL — `Cannot find module '.../public/js/train-queue.js'`

- [ ] **Step 3: Write minimal implementation**

Create `public/js/train-queue.js`:

```js
/* train-queue.js — Room Trainer T1 serving-order engine (UMD, pure).
 *
 * Plan: docs/superpowers/plans/2026-09-02-room-trainer-t1-serving-order.md
 * Spec: docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md §5
 *
 * Replaces the total order on srs_lapses that pinned a 208-word due queue to its
 * twelve highest-lapse members. Selection only: this module reads a schedule and
 * returns which words to serve. It never writes, never schedules, never grades.
 *
 * Determinism (project invariant): no Math.random, no Date.now. `nowMs` and the
 * local day string are injected by the caller, so a session is reproducible within
 * a day and different the next — variety without randomness.
 *
 * Shared-module pattern of fsrs-core.js / grade-policy.js: browser <script> global
 * + Node require, so the gate runs without a browser.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.TrainQueue = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENGINE_VERSION = "train-queue-v1";
  var DAY_MS = 86400000;

  var DEFAULTS = {
    sessionSize: 20,     // was the hard-coded TRAIN_N = 12
    reviewsPerDay: 60,
    newPerDay: 10,
    weaknessShare: 0.25, // bounded quota — weakness stops being a total order
    knownShare: 0.15     // matches buildTrainSession's open-text known-refresh share
  };

  // FNV-1a over (lemmaKey + '@' + dayStr) → uint32. Deterministic, dependency-free.
  function dayHash(lemmaKey, dayStr) {
    var s = String(lemmaKey == null ? "" : lemmaKey) + "@" + String(dayStr == null ? "" : dayStr);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  // Deterministic per-day permutation. Stable for the whole local day (a refresh
  // returns the same session), different tomorrow. Input order is the tie-break.
  function dayPermute(items, dayStr) {
    if (!Array.isArray(items)) return [];
    return items
      .map(function (x, i) { return { x: x, i: i, h: dayHash(x && x.lemmaKey, dayStr) }; })
      .sort(function (a, b) { return (a.h - b.h) || (a.i - b.i); })
      .map(function (o) { return o.x; });
  }

  return {
    ENGINE_VERSION: ENGINE_VERSION,
    DAY_MS: DAY_MS,
    DEFAULTS: DEFAULTS,
    dayHash: dayHash,
    dayPermute: dayPermute
  };
});
```

- [ ] **Step 4: Register the gate in `package.json`**

In the `scripts` block, directly after the `"smoke:room-training-premium"` line, add:

```json
    "smoke:train-queue": "node scripts/premium/train-queue-smoke.js",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run smoke:train-queue`
Expected: `train-queue-smoke: PASS 12/12`

- [ ] **Step 6: Commit**

```bash
git add public/js/train-queue.js scripts/premium/train-queue-smoke.js package.json
git commit -m "feat(room): add the pure train-queue engine with a day-seeded permutation"
```

---

### Task 2: Bucketing and session composition

**Files:**
- Modify: `public/js/train-queue.js`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `TrainQueue.dayPermute`, `TrainQueue.DEFAULTS` (Task 1).
- Produces:
  - `TrainQueue.bucketOf(item) -> "learning" | "new" | "known" | "overdue"`
  - `TrainQueue.relativeOverdueness(item, nowMs) -> number`
  - `TrainQueue.composeSession(candidates, opts) -> { items, buckets, servedNew, servedReview, excludedToday, repeatedToday, availableDue }`
    - `candidates`: `Array<{ lemmaKey: string, status: string, _srs: { due, interval, reps, lapses, reviewedAt } | null }>`
    - `opts`: `{ nowMs, dayStr, sessionSize, reviewsRemaining, newRemaining, weaknessShare, knownShare, excludeKeys }`
      — `reviewsRemaining` / `newRemaining` are `null` for "no limit"; `excludeKeys` is an array of lemma keys already answered today.

**Why buckets need no log read:** `public/js/fsrs-core.js:147` sets `intervalDays = 0` for and only for grade 1, and `reps` increments monotonically on every graded row. So `interval === 0 && reps > 0` is exactly "the most recent answer was a failure", readable straight off the `getDueWithSource` row.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js`, immediately before the final `if (failures.length)` block:

```js
// ── Suite 4: bucketOf ────────────────────────────────────────────────────────
check(TQ.bucketOf(item("a", { due: 0, interval: 0, reps: 3, lapses: 2 })) === "learning",
  "interval 0 with reps>0 is the most recent answer having been Again → learning");
check(TQ.bucketOf(item("b", { due: 0, interval: 5, reps: 0, lapses: 0 })) === "new",
  "reps 0 (manual-mark seed, never recall-tested) → new");
check(TQ.bucketOf(item("c", null)) === "new", "no schedule at all → new");
check(TQ.bucketOf(item("d", { due: 0, interval: 30, reps: 6, lapses: 0 }, "known")) === "known",
  "status 'known' with a live interval → known");
check(TQ.bucketOf(item("e", { due: 0, interval: 9, reps: 4, lapses: 1 })) === "overdue",
  "an ordinary graded due word → overdue");
check(TQ.bucketOf(item("f", { due: 0, interval: 0, reps: 2, lapses: 1 }, "known")) === "learning",
  "a KNOWN word whose last answer failed must be learning, not known");

// ── Suite 5: relativeOverdueness ─────────────────────────────────────────────
const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);
check(Math.abs(TQ.relativeOverdueness(item("g", { due: NOW, interval: 10, reps: 3, reviewedAt: NOW - 10 * 86400000 }), NOW) - 1) < 1e-9,
  "a word reviewed exactly one interval ago has relative overdueness 1");
check(TQ.relativeOverdueness(item("h", { due: NOW, interval: 10, reps: 3, reviewedAt: NOW - 30 * 86400000 }), NOW) > 2.9,
  "three intervals late must score close to 3");
check(TQ.relativeOverdueness(item("i", { due: NOW, interval: 4, reps: 3, reviewedAt: null }), NOW) >= 1,
  "a legacy row without reviewedAt must fall back to due-minus-interval, never NaN");

// ── Suite 6: composeSession ──────────────────────────────────────────────────
function due(key, opts) {
  opts = opts || {};
  return item(key, {
    due: NOW - 86400000,
    interval: opts.interval == null ? 6 : opts.interval,
    reps: opts.reps == null ? 3 : opts.reps,
    lapses: opts.lapses || 0,
    reviewedAt: NOW - (opts.elapsed == null ? 7 : opts.elapsed) * 86400000
  }, opts.status || "");
}

const big = [];
for (let i = 0; i < 208; i++) big.push(due("k" + String(i).padStart(3, "0"), { lapses: i < 6 ? 9 : 0 }));

const base = { nowMs: NOW, dayStr: "2026-09-02", sessionSize: 20, reviewsRemaining: 60, newRemaining: 10 };
const s1 = TQ.composeSession(big, base);
const s1b = TQ.composeSession(big, base);
const s2 = TQ.composeSession(big, Object.assign({}, base, { dayStr: "2026-09-03" }));

check(s1.items.length === 20, "session must honour sessionSize=20, got " + s1.items.length);
check(s1.items.map((x) => x.lemmaKey).join(",") === s1b.items.map((x) => x.lemmaKey).join(","),
  "composeSession must be deterministic for the same day");
check(s1.items.map((x) => x.lemmaKey).join(",") !== s2.items.map((x) => x.lemmaKey).join(","),
  "composeSession must produce a different session the next day");
check(new Set(s1.items.map((x) => x.lemmaKey)).size === s1.items.length,
  "a session must never repeat a word");

// bounded weakness quota — the six lapse-9 words may not take over the session
const lapsed = new Set(big.filter((x) => x._srs.lapses === 9).map((x) => x.lemmaKey));
const lapsedServed = s1.items.filter((x) => lapsed.has(x.lemmaKey)).length;
check(lapsedServed <= Math.round(20 * 0.25),
  "weakness must be a bounded quota (<=25% of the session), got " + lapsedServed);
check(lapsedServed > 0, "the weakness quota must still surface weak words, got " + lapsedServed);

// coverage across 20 simulated days — the headline T1 metric
const seen = new Set();
for (let d = 1; d <= 20; d++) {
  const day = "2026-09-" + String(d).padStart(2, "0");
  TQ.composeSession(big, Object.assign({}, base, { dayStr: day })).items.forEach((x) => seen.add(x.lemmaKey));
}
check(seen.size >= 120, "20 simulated sessions must reach a large share of a 208-word backlog, got " + seen.size);

// answered-today exclusion
const exclude = s1.items.map((x) => x.lemmaKey);
const s3 = TQ.composeSession(big, Object.assign({}, base, { excludeKeys: exclude }));
check(s3.items.every((x) => exclude.indexOf(x.lemmaKey) < 0),
  "words answered today must not be served again in the same day");
check(s3.excludedToday === exclude.length,
  "excludedToday must report how many candidates were filtered, got " + s3.excludedToday);

// exhausted day → honest repeat rather than an empty screen
const small = [due("s1"), due("s2")];
const s4 = TQ.composeSession(small, Object.assign({}, base, { excludeKeys: ["s1", "s2"] }));
check(s4.items.length === 2 && s4.repeatedToday === true,
  "with every candidate already answered the session repeats them and says so, got " + JSON.stringify({ n: s4.items.length, r: s4.repeatedToday }));

// daily limits
const s5 = TQ.composeSession(big, Object.assign({}, base, { reviewsRemaining: 5 }));
check(s5.items.length === 5, "reviewsRemaining must cap the session, got " + s5.items.length);
const s6 = TQ.composeSession(big, Object.assign({}, base, { reviewsRemaining: 0 }));
check(s6.items.length === 0, "a spent review budget must serve nothing, got " + s6.items.length);

// known refresh reaches the cross-text session (defect D-C)
const mixed = [];
for (let i = 0; i < 40; i++) mixed.push(due("m" + i));
for (let i = 0; i < 20; i++) mixed.push(due("kn" + i, { status: "known", interval: 40 }));
const s7 = TQ.composeSession(mixed, base);
const knownServed = s7.items.filter((x) => x.status === "known").length;
check(knownServed > 0 && knownServed <= Math.round(20 * 0.15) + 1,
  "the cross-text session must interleave a capped known-refresh share, got " + knownServed);
check(s7.buckets.known === 20, "buckets must report the full candidate census, got " + JSON.stringify(s7.buckets));

// new words respect newRemaining
const withNew = [];
for (let i = 0; i < 10; i++) withNew.push(due("r" + i));
for (let i = 0; i < 30; i++) withNew.push(due("n" + i, { reps: 0, interval: 1 }));
const s8 = TQ.composeSession(withNew, Object.assign({}, base, { newRemaining: 3 }));
check(s8.servedNew === 3, "newRemaining must cap new words, got " + s8.servedNew);
check(s8.servedReview === s8.items.length - s8.servedNew,
  "servedReview + servedNew must equal the session size");

check(TQ.composeSession([], base).items.length === 0, "an empty candidate list yields an empty session");
check(TQ.composeSession(null, base).items.length === 0, "a null candidate list yields an empty session");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — `TQ.bucketOf is not a function`

- [ ] **Step 3: Write minimal implementation**

In `public/js/train-queue.js`, insert after `dayPermute` and before the `return {` block:

```js
  // Bucket a due candidate. Derived entirely from the getDueWithSource row — no log read.
  // fsrs-core.nextState writes intervalDays = 0 for and only for grade 1 (Again) and
  // increments reps on every graded row, so `interval === 0 && reps > 0` IS "the most
  // recent answer was a failure". First match wins; a known word that just failed is
  // learning, not known.
  function bucketOf(item) {
    var s = (item && item._srs) || null;
    var reps = s ? (Number(s.reps) || 0) : 0;
    var interval = s ? (Number(s.interval) || 0) : 0;
    if (s && reps > 0 && interval === 0) return "learning";
    if (!s || reps === 0) return "new";
    if (item && item.status === "known") return "known";
    return "overdue";
  }

  // Anki's relative overdueness: elapsed time as a multiple of the scheduled interval.
  // Used only to order the weakness quota — never to bucket (every candidate is already due).
  function relativeOverdueness(item, nowMs) {
    var s = (item && item._srs) || null;
    if (!s) return 1;
    var iv = Math.max(1, Number(s.interval) || 0);
    var last = (s.reviewedAt != null && Number(s.reviewedAt) > 0)
      ? Number(s.reviewedAt)
      : (Number(s.due) || 0) - iv * DAY_MS;
    var elapsed = (Number(nowMs) || 0) - last;
    if (!(elapsed > 0)) return 0;
    return (elapsed / DAY_MS) / iv;
  }

  function _clampInt(v, lo, hi, dflt) {
    var n = Number(v);
    if (!isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }

  // Spread the refresh items through the active ones, mirroring buildTrainSession's
  // open-text interleave so both surfaces feel the same.
  function _interleave(active, refresh) {
    var out = active.slice();
    if (!refresh.length) return out;
    var step = Math.max(1, Math.floor((active.length + refresh.length) / (refresh.length + 1)));
    var pos = step;
    for (var i = 0; i < refresh.length; i++) {
      out.splice(Math.min(pos, out.length), 0, refresh[i]);
      pos += step + 1;
    }
    return out;
  }

  // Compose one session from the FULL due candidate list.
  //
  //   opts.nowMs             review moment (ms)
  //   opts.dayStr            local day 'YYYY-MM-DD' — seeds the permutation
  //   opts.sessionSize       max items (default DEFAULTS.sessionSize)
  //   opts.reviewsRemaining  review budget left today, null = unlimited
  //   opts.newRemaining      new-word budget left today, null = unlimited
  //   opts.weaknessShare     bounded weakness quota (default 0.25)
  //   opts.knownShare        known-refresh share (default 0.15)
  //   opts.excludeKeys       lemma keys already answered today
  function composeSession(candidates, opts) {
    opts = opts || {};
    var nowMs = Number(opts.nowMs) || 0;
    var dayStr = String(opts.dayStr || "");
    var size = _clampInt(opts.sessionSize, 1, 200, DEFAULTS.sessionSize);
    var weaknessShare = opts.weaknessShare == null ? DEFAULTS.weaknessShare : Number(opts.weaknessShare);
    var knownShare = opts.knownShare == null ? DEFAULTS.knownShare : Number(opts.knownShare);
    var reviewsLeft = opts.reviewsRemaining == null ? Infinity : Math.max(0, Number(opts.reviewsRemaining) || 0);
    var newLeft = opts.newRemaining == null ? Infinity : Math.max(0, Number(opts.newRemaining) || 0);

    var all = (Array.isArray(candidates) ? candidates : []).filter(function (x) { return x && x.lemmaKey; });
    var empty = {
      items: [], buckets: { learning: 0, overdue: 0, known: 0, "new": 0 },
      servedNew: 0, servedReview: 0, excludedToday: 0, repeatedToday: false, availableDue: all.length
    };
    if (!all.length) return empty;

    var excl = {};
    var exKeys = Array.isArray(opts.excludeKeys) ? opts.excludeKeys : [];
    for (var e = 0; e < exKeys.length; e++) excl[String(exKeys[e])] = 1;

    var fresh = all.filter(function (x) { return !excl[String(x.lemmaKey)]; });
    var excludedToday = all.length - fresh.length;
    // Everything due was already answered today: repeat rather than show an empty screen,
    // and say so — an extra retrieval is honest, a blank screen is not.
    var repeatedToday = fresh.length === 0 && all.length > 0;
    var pool = repeatedToday ? all : fresh;

    var B = { learning: [], overdue: [], known: [], "new": [] };
    for (var i = 0; i < pool.length; i++) B[bucketOf(pool[i])].push(pool[i]);

    var census = { learning: 0, overdue: 0, known: 0, "new": 0 };
    for (var c = 0; c < all.length; c++) census[bucketOf(all[c])]++;

    var k;
    for (k in B) B[k] = dayPermute(B[k], dayStr);

    var reviewBudget = Math.min(size, reviewsLeft);
    var knownSlots = Math.min(Math.round(size * knownShare), B.known.length, reviewBudget);
    var restReview = reviewBudget - knownSlots;

    var reviewPool = B.learning.concat(B.overdue);
    var weakSlots = Math.min(Math.round(size * weaknessShare), restReview, reviewPool.length);

    // Weakness quota: the weakest first, but only for its bounded share of the session.
    var weakRanked = reviewPool
      .map(function (x, ix) { return { x: x, ix: ix, lp: (x._srs && Number(x._srs.lapses)) || 0, ro: relativeOverdueness(x, nowMs) }; })
      .sort(function (a, b) {
        if (b.lp !== a.lp) return b.lp - a.lp;
        if (b.ro !== a.ro) return b.ro - a.ro;
        return String(a.x.lemmaKey) < String(b.x.lemmaKey) ? -1 : 1;
      });

    var taken = {}, reviewPicks = [];
    for (var w = 0; w < weakRanked.length && reviewPicks.length < weakSlots; w++) {
      var wk = String(weakRanked[w].x.lemmaKey);
      if (taken[wk]) continue;
      taken[wk] = 1; reviewPicks.push(weakRanked[w].x);
    }
    for (var r = 0; r < reviewPool.length && reviewPicks.length < restReview; r++) {
      var rk = String(reviewPool[r].lemmaKey);
      if (taken[rk]) continue;
      taken[rk] = 1; reviewPicks.push(reviewPool[r]);
    }

    var knownPicks = [];
    for (var kn = 0; kn < B.known.length && knownPicks.length < knownSlots; kn++) {
      var kk = String(B.known[kn].lemmaKey);
      if (taken[kk]) continue;
      taken[kk] = 1; knownPicks.push(B.known[kn]);
    }

    var items = _interleave(reviewPicks, knownPicks);
    var servedReview = items.length;

    var newSlots = Math.min(size - items.length, newLeft, B["new"].length);
    var servedNew = 0;
    for (var n = 0; n < B["new"].length && servedNew < newSlots; n++) {
      var nk = String(B["new"][n].lemmaKey);
      if (taken[nk]) continue;
      taken[nk] = 1; items.push(B["new"][n]); servedNew++;
    }

    if (items.length > size) items = items.slice(0, size);

    return {
      items: items,
      buckets: census,
      servedNew: servedNew,
      servedReview: servedReview,
      excludedToday: excludedToday,
      repeatedToday: repeatedToday,
      availableDue: all.length
    };
  }
```

Then extend the `return` block to:

```js
  return {
    ENGINE_VERSION: ENGINE_VERSION,
    DAY_MS: DAY_MS,
    DEFAULTS: DEFAULTS,
    dayHash: dayHash,
    dayPermute: dayPermute,
    bucketOf: bucketOf,
    relativeOverdueness: relativeOverdueness,
    composeSession: composeSession
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:train-queue`
Expected: PASS with every Suite 4–6 check green.

- [ ] **Step 5: Commit**

```bash
git add public/js/train-queue.js scripts/premium/train-queue-smoke.js
git commit -m "feat(room): bucket the due queue and compose sessions with a bounded weakness quota"
```

---

### Task 3: Honest load arithmetic

**Files:**
- Modify: `public/js/train-queue.js`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `TrainQueue.DEFAULTS` (Task 1).
- Produces:
  - `TrainQueue.queueLoad(input) -> { dueNow, scheduled, inflowPerDay, requiredPerDay, growing }`
    - `input`: `{ schedule: { [lemmaKey]: { due, interval } }, statusMap: { [lemmaKey]: string } | null, nowMs: number, reviewsPerDay: number }`

This is defect D-B from the spec: with ~290 scheduled words a twelve-word session cannot keep pace, and the product never said so. Each scheduled word with interval `I` returns `1/I` times per day, so the steady-state inbound flow is `Σ 1/max(I, 1)`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 7: queueLoad ───────────────────────────────────────────────────────
const sched = {};
for (let i = 0; i < 100; i++) sched["q" + i] = { due: NOW - 1000, interval: 10 };   // all due, I=10
for (let i = 0; i < 100; i++) sched["f" + i] = { due: NOW + 5 * 86400000, interval: 20 };
const load = TQ.queueLoad({ schedule: sched, statusMap: null, nowMs: NOW, reviewsPerDay: 12 });

check(load.dueNow === 100, "queueLoad must count only words due now, got " + load.dueNow);
check(load.scheduled === 200, "queueLoad must count every scheduled word, got " + load.scheduled);
check(Math.abs(load.inflowPerDay - (100 / 10 + 100 / 20)) < 1e-9,
  "inflow is the sum of 1/interval over scheduled words, got " + load.inflowPerDay);
check(load.requiredPerDay === 15, "requiredPerDay must round the inflow up, got " + load.requiredPerDay);
check(load.growing === true, "12 reviews/day against an inflow of 15 must be reported as growing");

const okLoad = TQ.queueLoad({ schedule: sched, statusMap: null, nowMs: NOW, reviewsPerDay: 60 });
check(okLoad.growing === false, "60 reviews/day against an inflow of 15 must not be reported as growing");

const ignored = { z1: { due: NOW - 1000, interval: 10 } };
const ignLoad = TQ.queueLoad({ schedule: ignored, statusMap: { z1: "ignore" }, nowMs: NOW, reviewsPerDay: 60 });
check(ignLoad.dueNow === 0 && ignLoad.scheduled === 0,
  "ignored words must not count toward due or load, got " + JSON.stringify(ignLoad));

const zero = TQ.queueLoad({ schedule: null, statusMap: null, nowMs: NOW, reviewsPerDay: 60 });
check(zero.dueNow === 0 && zero.requiredPerDay === 0 && zero.growing === false,
  "an empty schedule must produce a zeroed, non-growing load");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — `TQ.queueLoad is not a function`

- [ ] **Step 3: Write minimal implementation**

Insert into `public/js/train-queue.js` after `composeSession`:

```js
  // Defect D-B: the trainer must be able to say whether its own limit keeps up with its
  // own queue. A scheduled word with interval I returns 1/I times per day, so the
  // steady-state inbound flow is the sum of 1/max(I, 1) over scheduled, non-ignored words.
  function queueLoad(input) {
    input = input || {};
    var schedule = input.schedule || null;
    var statusMap = input.statusMap || null;
    var now = Number(input.nowMs) || 0;
    var cap = Number(input.reviewsPerDay);
    if (!isFinite(cap) || cap < 0) cap = DEFAULTS.reviewsPerDay;

    var dueNow = 0, scheduled = 0, inflow = 0;
    if (schedule) {
      for (var lk in schedule) {
        var row = schedule[lk];
        if (!row) continue;
        if (statusMap && statusMap[lk] === "ignore") continue;
        scheduled++;
        if ((Number(row.due) || 0) <= now) dueNow++;
        inflow += 1 / Math.max(1, Number(row.interval) || 0);
      }
    }
    var required = Math.ceil(inflow - 1e-9);
    if (required < 0) required = 0;
    return {
      dueNow: dueNow,
      scheduled: scheduled,
      inflowPerDay: inflow,
      requiredPerDay: required,
      growing: scheduled > 0 && cap < required
    };
  }
```

Add `queueLoad: queueLoad` to the `return` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:train-queue`
Expected: PASS, Suite 7 green.

- [ ] **Step 5: Commit**

```bash
git add public/js/train-queue.js scripts/premium/train-queue-smoke.js
git commit -m "feat(room): compute the honest daily review load the queue actually requires"
```

---

### Task 4: Neutral due ordering and today's answered set

**Files:**
- Modify: `public/db/local-db.js:3193-3221` (`getDueWithSource`)
- Modify: `public/db/local-db.js` (add `getAnsweredSince` and `getDayGradeCounts` after `getDueWithSource`)
- Modify: `scripts/premium/reader-word-status-smoke.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `getAnsweredSince(sinceIso: string) -> Promise<string[]>` — distinct `item_key`s with a non-annulled `review`/`skip` row at or after `sinceIso`.
  - `getDayGradeCounts(sinceIso: string) -> Promise<{ reviews: number, newWords: number }>` — today's non-annulled graded attempts, split by whether the item had an earlier `review` row.
  - `getDueWithSource` keeps its exact return shape; only its `ORDER BY` changes.

The annul rule must match `FsrsCore.withoutAnnulled` (`public/js/fsrs-core.js:238`): a `review`/`skip` row is excluded when some `annul` row carries `meta.annul_of` equal to its id.

- [ ] **Step 1: Write the failing test**

In `scripts/premium/reader-word-status-smoke.js`, inside the big `pg.evaluate` block, add a new section immediately before the `return {` statement:

```js
      // T1 — neutral due ordering + today's answered set (no schema change).
      let t1Order = null, t1Answered = null, t1Counts = null, t1Annul = null, t1Err = null;
      try {
        const TID = "t1-text", TKEY = "t1-key", SID = "t1-sent";
        await ldb.createText({ id: TID, text_key: TKEY, title: "T1 SRC" });
        await ldb.addSentence(TID, { id: SID, he_niqqud: "בַּיִת גָּדוֹל", ru: "большой дом" });
        const past = Date.now() - 86400000;
        // A is the LEAST lapsed but the OLDEST due; B is the most lapsed and the newest due.
        await ldb.setWordStatus("pid:99977300", "l2", { due: past - 20000, interval: 4, reps: 2, lapses: 0 }, { textKey: TKEY, sentenceId: SID, orderIndex: 0, surface: "בית" });
        await ldb.setWordStatus("pid:99977301", "l2", { due: past, interval: 4, reps: 2, lapses: 9 }, { textKey: TKEY, sentenceId: SID, orderIndex: 0, surface: "בית" });
        const rows = await ldb.getDueWithSource(Date.now());
        const only = rows.filter((x) => x.lemmaKey.indexOf("pid:999773") === 0).map((x) => x.lemmaKey);
        t1Order = only.join(",");

        const since = new Date(Date.now() - 3600000).toISOString();
        const mk = (id, key, kind, grade) => ({
          id, item_key: key, kind, reviewed_at: new Date().toISOString(),
          grade, source: "t1-smoke", meta: {}
        });
        await ldb.dbRun(
          `INSERT INTO review_log (id, item_key, kind, reviewed_at, grade, source, channel, latency_ms, meta_json)
           VALUES (?,?,?,?,?,?,NULL,NULL,'{}')`,
          ["t1-rev-a", "pid:99977300", "review", new Date().toISOString(), 3, "t1-smoke"]);
        await ldb.dbRun(
          `INSERT INTO review_log (id, item_key, kind, reviewed_at, grade, source, channel, latency_ms, meta_json)
           VALUES (?,?,?,?,?,?,NULL,NULL,'{}')`,
          ["t1-rev-b", "pid:99977301", "review", new Date().toISOString(), 1, "t1-smoke"]);
        t1Answered = (await ldb.getAnsweredSince(since)).filter((k) => k.indexOf("pid:999773") === 0).sort().join(",");
        t1Counts = await ldb.getDayGradeCounts(since);

        // annul the second row — it must vanish from both readers
        await ldb.dbRun(
          `INSERT INTO review_log (id, item_key, kind, reviewed_at, grade, source, channel, latency_ms, meta_json)
           VALUES (?,?,?,?,NULL,?,NULL,NULL,?)`,
          ["t1-annul-b", "pid:99977301", "annul", new Date().toISOString(), "t1-smoke", JSON.stringify({ annul_of: "t1-rev-b" })]);
        t1Annul = (await ldb.getAnsweredSince(since)).filter((k) => k.indexOf("pid:999773") === 0).sort().join(",");

        await ldb.dbRun(`DELETE FROM review_log WHERE source = 't1-smoke'`, []);
        await ldb.setWordStatus("pid:99977300", ""); await ldb.setWordStatus("pid:99977301", "");
        try { await ldb.deleteText(TID); } catch (_) {}
      } catch (e) { t1Err = String(e); }
```

Add `t1Order, t1Answered, t1Counts, t1Annul, t1Err` to the returned object literal.

Then add these assertions next to the existing `d2` assertions:

```js
    // T1 — neutral due ordering + today's answered readers
    eq(res.t1Err === null, "T1 due-ordering path must not error, got " + JSON.stringify(res.t1Err));
    eq(res.t1Order === "pid:99977300,pid:99977301",
      "getDueWithSource must order by srs_due ASC only — a high-lapse word must NOT jump the queue, got " + JSON.stringify(res.t1Order));
    eq(res.t1Answered === "pid:99977300,pid:99977301",
      "getAnsweredSince must return every item graded since the cutoff, got " + JSON.stringify(res.t1Answered));
    eq(res.t1Counts && res.t1Counts.reviews === 2 && res.t1Counts.newWords === 2,
      "getDayGradeCounts must split today's attempts into reviews and first-ever attempts, got " + JSON.stringify(res.t1Counts));
    eq(res.t1Annul === "pid:99977300",
      "an annulled grade must disappear from getAnsweredSince (withoutAnnulled parity), got " + JSON.stringify(res.t1Annul));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:reader-word-status`
Expected: FAIL — `getAnsweredSince is not a function`, and the ordering assertion reports `pid:99977301,pid:99977300` (lapses-first).

- [ ] **Step 3: Write minimal implementation**

In `public/db/local-db.js`, in `getDueWithSource`, change the `ORDER BY` clause from:

```sql
                           ORDER BY w.srs_lapses DESC, w.srs_due ASC`, [new Date(now).toISOString()]);
```

to:

```sql
                           ORDER BY w.srs_due ASC, w.lemma_key ASC`, [new Date(now).toISOString()]);
```

and replace the comment above the function with:

```js
// D2 — cross-text «due today»: scheduled words whose review time has ARRIVED (srs_due<=now), «ignore»
// excluded, WITH their stored source occurrence so the queue can re-cloze each one without opening its
// text. Read-only; graceful [] if the columns/table are absent.
// T1: the ORDER BY is deliberately NEUTRAL (due ASC, key ASC). Ranking is a PRODUCT decision and lives
// in TrainQueue.composeSession — the previous `srs_lapses DESC` made this query a total order on
// weakness, which pinned a large backlog to its worst dozen words forever.
```

Then insert after the closing brace of `getDueWithSource`:

```js
// T1 — the day's answered items and grade counts, folded from the append-only log so daily
// limits need NO column and stay correct after a cross-device sync. The annul rule mirrors
// FsrsCore.withoutAnnulled exactly: a review/skip row is excluded when an 'annul' row names
// its id in meta.annul_of. `sinceIso` is local midnight computed by the UI.
const _NOT_ANNULLED = `NOT EXISTS (
      SELECT 1 FROM review_log a
       WHERE a.kind = 'annul'
         AND json_valid(a.meta_json)
         AND json_extract(a.meta_json, '$.annul_of') = r.id)`;

export async function getAnsweredSince(sinceIso) {
  const since = String(sinceIso || "").trim();
  if (!since) return [];
  try {
    const rows = await q(
      `SELECT DISTINCT r.item_key FROM review_log r
        WHERE r.kind IN ('review','skip') AND r.reviewed_at >= ? AND ${_NOT_ANNULLED}`, [since]);
    return (rows || []).map((x) => String(x.item_key || "")).filter(Boolean);
  } catch (_) { return []; }
}

// reviews  = every non-annulled graded attempt today (the reviews/day budget);
// newWords = of those, the items whose FIRST-EVER non-annulled review row is also today
//            (the new/day budget). An item can count in both, exactly as Anki counts it.
export async function getDayGradeCounts(sinceIso) {
  const since = String(sinceIso || "").trim();
  if (!since) return { reviews: 0, newWords: 0 };
  try {
    const today = await q(
      `SELECT r.item_key FROM review_log r
        WHERE r.kind IN ('review','skip') AND r.reviewed_at >= ? AND ${_NOT_ANNULLED}`, [since]);
    const reviews = (today || []).length;
    if (!reviews) return { reviews: 0, newWords: 0 };
    const firsts = await q(
      `SELECT r.item_key, MIN(r.reviewed_at) AS first_at FROM review_log r
        WHERE r.kind = 'review' AND ${_NOT_ANNULLED}
        GROUP BY r.item_key`, []);
    const firstAt = Object.create(null);
    for (const row of (firsts || [])) if (row && row.item_key) firstAt[String(row.item_key)] = String(row.first_at || "");
    let newWords = 0;
    for (const row of (today || [])) {
      const key = String(row.item_key || "");
      const at = firstAt[key];
      if (!at || at >= since) newWords++;
    }
    return { reviews, newWords };
  } catch (_) { return { reviews: 0, newWords: 0 }; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run smoke:reader-word-status`
Expected: PASS — all five T1 assertions green.

- [ ] **Step 5: Verify no scheduler gate regressed**

Run: `npm run smoke:memory-canon && npm run smoke:fsrs`
Expected: both PASS (79/79 and 30/30 at baseline). If `smoke:memory-canon` reports a `DbUnavailableError`, make sure no other OPFS smoke is running and rerun it alone.

- [ ] **Step 6: Commit**

```bash
git add public/db/local-db.js scripts/premium/reader-word-status-smoke.js
git commit -m "fix(room): drop the lapses total order from the due query and fold today's grades from the log"
```

---

### Task 5: Wire the engine into the cross-text session

**Files:**
- Modify: `public/library.html:3323` (script tag)
- Modify: `public/sw.js:120` (precache list)
- Modify: `public/js/library-ui.js:2648` (`TRAIN_N`), `:2802-2857` (`startDueReview`), `:2959-2963` (`_buildDueSourcedItems` cap)
- Modify: `scripts/premium/train-queue-smoke.js` (static wiring guards)

**Interfaces:**
- Consumes: `TrainQueue.composeSession`, `TrainQueue.DEFAULTS` (Tasks 1–2); `localDb.getAnsweredSince`, `localDb.getDayGradeCounts` (Task 4).
- Produces:
  - `trainPrefs() -> { sessionSize: number, reviewsPerDay: number, newPerDay: number }` in `library-ui.js` — reads `localStorage`, falls back to `TrainQueue.DEFAULTS`.
  - `trainPrefsSet(patch: object) -> void`
  - `_dayStartIso() -> string` — ISO timestamp of local midnight for the current day.
  - `_composeDueSession(due, prefs) -> Promise<{ picked, load, compose }>` — the shared selection step used by `startDueReview`.

The build cap must move *after* selection: today `_buildDueSourcedItems` stops at 24 assembled items taken from the head of the ordered list, which is the truncation that makes the tail unreachable. Selection now runs on the full due list, and only the selected words are assembled.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 8: wiring guards ───────────────────────────────────────────────────
const room = fs.readFileSync(path.join(ROOT, "public/js/library-ui.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/library.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
const db = fs.readFileSync(path.join(ROOT, "public/db/local-db.js"), "utf8");

check(/<script src="\/js\/train-queue\.js"><\/script>/.test(html), "library.html must load train-queue.js");
check(/"\/js\/train-queue\.js"/.test(sw), "sw.js must precache train-queue.js");
check(/ORDER BY w\.srs_due ASC/.test(db) && !/ORDER BY w\.srs_lapses DESC/.test(db),
  "getDueWithSource must no longer be a total order on srs_lapses");
check(/export async function getAnsweredSince\s*\(/.test(db), "local DB exposes getAnsweredSince");
check(/export async function getDayGradeCounts\s*\(/.test(db), "local DB exposes getDayGradeCounts");

const dueBody = (room.match(/async function startDueReview[\s\S]*?\n}\n/) || [""])[0];
check(/TrainQueue\.composeSession/.test(dueBody), "startDueReview must select through TrainQueue.composeSession");
check(!/rankByWeakness\([^)]*\)\.slice\(0, TRAIN_N\)/.test(dueBody),
  "startDueReview must not re-apply the lapses total order after composition");
check(/getAnsweredSince/.test(room), "the Room must exclude words already answered today");

const buildBody = (room.match(/async function _buildDueSourcedItems[\s\S]*?\n}\n/) || [""])[0];
check(!/items\.length >= TRAIN_N \* 2/.test(buildBody),
  "the 24-item prefix cut must be gone — assembly happens after selection, not before it");

check(/function trainPrefs\s*\(/.test(room) && /function trainPrefsSet\s*\(/.test(room),
  "the Room must expose session-size and daily-limit preferences");
check(/function _dayStartIso\s*\(/.test(room), "the Room must compute local midnight for the day fold");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — every Suite 8 check.

- [ ] **Step 3: Register the module**

In `public/library.html`, directly after line 3323 (`<script src="/js/grade-policy.js"></script>`), add:

```html
<script src="/js/train-queue.js"></script>
```

In `public/sw.js`, directly after line 120 (`"/js/grade-policy.js",`), add:

```js
  "/js/train-queue.js",
```

- [ ] **Step 4: Add preferences and the day-start helper**

In `public/js/library-ui.js`, replace line 2648:

```js
const TRAIN_N = 12;
```

with:

```js
// T1: TRAIN_N is now only the fallback default for the open-text path and the plan-section
// entry point. The cross-text session size is a preference (trainPrefs), and the due queue is
// no longer truncated to a prefix of a lapses-ordered list.
const TRAIN_N = 12;
const TRAIN_PREFS_KEY = 'room.trainPrefs.v1';
function trainPrefs() {
  const D = (window.TrainQueue && window.TrainQueue.DEFAULTS) || { sessionSize: 20, reviewsPerDay: 60, newPerDay: 10 };
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(TRAIN_PREFS_KEY) || '{}') || {}; } catch (_) { raw = {}; }
  const clamp = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt; };
  return {
    sessionSize: clamp(raw.sessionSize, 5, 100, D.sessionSize),
    reviewsPerDay: clamp(raw.reviewsPerDay, 5, 500, D.reviewsPerDay),
    newPerDay: clamp(raw.newPerDay, 0, 100, D.newPerDay),
  };
}
function trainPrefsSet(patch) {
  const next = Object.assign(trainPrefs(), patch || {});
  try { localStorage.setItem(TRAIN_PREFS_KEY, JSON.stringify(next)); } catch (_) {}
}
// Local midnight as an ISO instant — the cutoff for the day fold over review_log.
function _dayStartIso(d) {
  const x = d || new Date();
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0).toISOString();
}
```

- [ ] **Step 5: Replace the selection step in `startDueReview`**

In `public/js/library-ui.js`, replace these lines inside `startDueReview`:

```js
  let due = [];
  try { due = (await localDb.getDueWithSource(Date.now())) || []; } catch (_) { due = []; }
  const items = await _buildDueSourcedItems(due, { scanBudget: 12 });
  if (!_studySheet || _studySheet.hidden) return;
  const R = window.ReaderMorph;
  const ranked = (R.rankByWeakness ? R.rankByWeakness(items) : items).slice(0, TRAIN_N);
```

with:

```js
  let due = [];
  try { due = (await localDb.getDueWithSource(Date.now())) || []; } catch (_) { due = []; }
  // T1 — select over the FULL due list, then assemble only what was selected. The previous
  // order (lapses DESC) plus a 24-row prefix cut made the tail of a large backlog unreachable.
  const sel = await _composeDueSession(due, trainPrefs());
  const items = await _buildDueSourcedItems(sel.picked, { scanBudget: 12 });
  if (!_studySheet || _studySheet.hidden) return;
  const ranked = items.slice(0, sel.compose.items.length || TRAIN_N);
```

- [ ] **Step 6: Add the shared selection step**

In `public/js/library-ui.js`, insert immediately before `async function startDueReview(` :

```js
// T1 — the ONE selection step for the cross-text queue: today's spent budgets are folded from
// review_log (no column), the full due list is composed by the pure engine, and the honest load
// figure is computed alongside. Returns the SELECTED due rows (not yet assembled) plus the
// composition report the launch screen and the summary read.
async function _composeDueSession(due, prefs) {
  const TQ = window.TrainQueue;
  const sinceIso = _dayStartIso();
  let answered = [], counts = { reviews: 0, newWords: 0 }, schedule = {}, states = {};
  try { answered = (await localDb.getAnsweredSince(sinceIso)) || []; } catch (_) { answered = []; }
  try { counts = (await localDb.getDayGradeCounts(sinceIso)) || counts; } catch (_) {}
  try { schedule = (await localDb.getSrsSchedule()) || {}; } catch (_) { schedule = {}; }
  try { states = (await localDb.getAllWordStatuses()) || {}; } catch (_) { states = {}; }
  const load = TQ
    ? TQ.queueLoad({ schedule, statusMap: states, nowMs: Date.now(), reviewsPerDay: prefs.reviewsPerDay })
    : { dueNow: due.length, scheduled: due.length, inflowPerDay: 0, requiredPerDay: 0, growing: false };
  if (!TQ) {
    // Honest degradation: without the engine, serve the due list in its neutral order.
    const picked = due.slice(0, prefs.sessionSize);
    return { picked, load, compose: { items: picked, servedNew: 0, servedReview: picked.length, excludedToday: 0, repeatedToday: false, availableDue: due.length, buckets: { learning: 0, overdue: picked.length, known: 0, "new": 0 } }, counts };
  }
  const compose = TQ.composeSession(due, {
    nowMs: Date.now(),
    dayStr: _localDayStr(),
    sessionSize: prefs.sessionSize,
    reviewsRemaining: Math.max(0, prefs.reviewsPerDay - counts.reviews),
    newRemaining: Math.max(0, prefs.newPerDay - counts.newWords),
    excludeKeys: answered,
  });
  return { picked: compose.items, load, compose, counts };
}
```

- [ ] **Step 7: Remove the prefix cut in `_buildDueSourcedItems`**

In `public/js/library-ui.js`, inside `_buildDueSourcedItems`, replace:

```js
    if (items.length >= TRAIN_N * 2) break;   // bound the fetch work; weakness-rank + slice below
```

with:

```js
    // T1: no prefix cut here — the caller already SELECTED this list, so every member must be
    // given a chance to assemble. Bounding assembly before selection is what made the tail of a
    // large backlog unreachable.
```

and replace the two later occurrences of `if (cand.length >= TRAIN_N * 2) break;` and `if (items.length >= TRAIN_N * 2) break;` inside the ladder block with:

```js
    if (cand.length >= due.length) break;
```

and

```js
    if (items.length >= due.length) break;
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run smoke:train-queue && npm run smoke:room-training-premium && npm run smoke:studio-room-srs`
Expected: all three PASS.

- [ ] **Step 9: Commit**

```bash
git add public/js/library-ui.js public/library.html public/sw.js scripts/premium/train-queue-smoke.js
git commit -m "fix(room): select the cross-text session from the whole due queue, not its worst 24"
```

---

### Task 6: Distractors from outside the session

**Files:**
- Modify: `public/js/library-ui.js:2856` (`startDueReview`'s launch call), `:3274` (`pickDistractors` call site)
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `_composeDueSession` (Task 5).
- Produces:
  - `_crossDistractorPool(items, due) -> Array<{ lemmaKey, surface, niqqud, gloss, root, pos, freq }>` in `library-ui.js` — a pool built from scheduled words that are **not** in the current session.

Defect D-A from the spec: `_launchTrainSession(ranked, { cross: true })` passes no `pool`, so `pool: opts.pool || items` makes the twelve session words their own distractor bank.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 9: cross-text distractor pool (defect D-A) ─────────────────────────
check(/function _crossDistractorPool\s*\(/.test(room),
  "the Room must build a distractor pool for cross-text sessions");
const launchCalls = room.match(/_launchTrainSession\([^)]*cross:\s*true[^)]*\)/g) || [];
check(launchCalls.length > 0, "cross-text launches must exist");
check(launchCalls.every((c) => /pool:/.test(c)),
  "every cross-text launch must pass an explicit distractor pool, got " + JSON.stringify(launchCalls));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — `_crossDistractorPool` missing and the launches carry no `pool`.

- [ ] **Step 3: Write minimal implementation**

In `public/js/library-ui.js`, insert immediately after `_composeDueSession`:

```js
// D-A — cross-text distractor pool. Without this the launcher falls back to
// `pool: opts.pool || items`, so the session's own words become its multiple-choice options:
// the learner then recognises the option set, and FSRS books it as word knowledge. The pool is
// built from SCHEDULED words that are not in this session, resolved offline and bounded.
async function _crossDistractorPool(items, due) {
  const R = window.ReaderMorph;
  const inSession = new Set((items || []).map((x) => String(x.lemmaKey)));
  const pool = [];
  if (!R || typeof R.resolveWordLight !== 'function') return pool;
  const POOL_MAX = 40;
  for (const d of (due || [])) {
    if (pool.length >= POOL_MAX) break;
    const key = String(d && d.lemmaKey || '');
    if (!key || inSession.has(key)) continue;
    const surface = d.source && d.source.surface ? R.stripNiqqud(String(d.source.surface)) : '';
    if (!surface) continue;
    let card = null;
    try { card = await R.resolveWordLight(surface, ''); } catch (_) { card = null; }
    // Identity gate: a distractor must be the word it claims to be, or it is not offered.
    if (!card || card.lemmaKey !== key) continue;
    const gloss = String(card.meaning || card.gloss || '');
    if (!gloss) continue;
    pool.push({ lemmaKey: key, surface, niqqud: card.niqqud || '', gloss, root: card.root || '', pos: card.pos || '', freq: 1 });
  }
  return pool;
}
```

In `startDueReview`, replace:

```js
  await _launchTrainSession(ranked, { cross: true });
```

with:

```js
  const crossPool = await _crossDistractorPool(ranked, due);
  await _launchTrainSession(ranked, { cross: true, pool: crossPool.length >= 3 ? ranked.concat(crossPool) : ranked });
```

In the same function, the "continue with words in progress" branch, replace:

```js
          await _launchTrainSession(aheadRanked, { cross: true });
```

with:

```js
          const aheadPool = await _crossDistractorPool(aheadRanked, ahead);
          await _launchTrainSession(aheadRanked, { cross: true, pool: aheadPool.length >= 3 ? aheadRanked.concat(aheadPool) : aheadRanked });
```

In `startPlanSectionTraining`, replace:

```js
  await _launchTrainSession(items.slice(0, TRAIN_N), { cross: true });
```

with:

```js
  const planItems = items.slice(0, TRAIN_N);
  const planPool = await _crossDistractorPool(planItems, rows);
  await _launchTrainSession(planItems, { cross: true, pool: planPool.length >= 3 ? planItems.concat(planPool) : planItems });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run smoke:train-queue && npm run smoke:room-training-premium`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/library-ui.js scripts/premium/train-queue-smoke.js
git commit -m "fix(room): draw cross-text distractors from outside the session"
```

---

### Task 7: Launch screen with session settings and the load figure

**Files:**
- Modify: `public/js/library-ui.js` (render + event handlers in the study-sheet delegate at `:2369-2402`)
- Modify: `public/library.html` (CSS for `.room-train-launch*`)
- Modify: `public/i18n/locales/ru.js`, `public/i18n/locales/en.js`, `public/i18n/locales/he.js`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `_composeDueSession`, `trainPrefs`, `trainPrefsSet` (Task 5); `TrainQueue.queueLoad` (Task 3).
- Produces:
  - `renderTrainLaunch(sel) -> void` — paints the launch screen into `.room-study-body` from a `_composeDueSession` result.
  - `_pendingLaunch: { sel, prefs } | null` — module state holding the composed session between paint and start.

All eleven new keys live under `room.morph.study.*` in every locale.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 10: launch screen + i18n ───────────────────────────────────────────
const LAUNCH_KEYS = [
  "launchStart", "launchSize", "launchReviewsCap", "launchNewCap", "launchDueNow",
  "launchServedToday", "launchLoadOk", "launchLoadGrow", "launchAllDoneToday",
  "launchSettings", "launchSessionPlan"
];
const locales = ["ru", "en", "he"].map((x) => ({
  name: x, src: fs.readFileSync(path.join(ROOT, `public/i18n/locales/${x}.js`), "utf8")
}));
LAUNCH_KEYS.forEach((k) => {
  check(new RegExp("\\b" + k + "\\s*:").test(room), `library-ui must use the ${k} string`);
  locales.forEach((L) => {
    check(new RegExp("\\b" + k + "\\s*:").test(L.src), `locale ${L.name} must define ${k}`);
  });
});
check(/function renderTrainLaunch\s*\(/.test(room), "the Room must render a launch screen");
check(/data-train-launch-start/.test(room), "the launch screen must expose a start control");
check(/data-train-pref/.test(room), "the launch screen must expose the session preferences");
check(/\.room-train-launch/.test(html), "library.html must style the launch screen");
check(/\.room-train-launch[\s\S]{0,400}min-height:\s*44px/.test(html),
  "launch controls must meet the 44px project standard");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — 11 keys × 4 checks plus the five structural checks.

- [ ] **Step 3: Add the locale strings**

In `public/i18n/locales/ru.js`, inside the `study:` object (the block that already contains `dueUnservable` at line 3013), add:

```js
        launchStart: "▶ Начать",
        launchSize: "Слов в сессии",
        launchReviewsCap: "Повторений в день",
        launchNewCap: "Новых слов в день",
        launchDueNow: "К повторению сейчас",
        launchServedToday: "Пройдено сегодня",
        launchSettings: "Настройки сессии",
        launchSessionPlan: "В этой сессии: {n} (повторение {r}, новых {w})",
        launchLoadOk: "Лимита хватает: очередь не растёт.",
        launchLoadGrow: "При {cap} повторениях в день очередь будет расти. Чтобы она не росла, нужно ≈{need} в день.",
        launchAllDoneToday: "Все слова к повторению сегодня уже пройдены. Можно пройти их ещё раз — расписание пересчитается честно.",
```

In `public/i18n/locales/en.js`, in the matching `study:` object:

```js
        launchStart: "▶ Start",
        launchSize: "Words per session",
        launchReviewsCap: "Reviews per day",
        launchNewCap: "New words per day",
        launchDueNow: "Due now",
        launchServedToday: "Done today",
        launchSettings: "Session settings",
        launchSessionPlan: "This session: {n} (reviews {r}, new {w})",
        launchLoadOk: "The limit keeps up: the queue is not growing.",
        launchLoadGrow: "At {cap} reviews a day the queue will grow. It needs about {need} a day to stay level.",
        launchAllDoneToday: "Every word due today has already been reviewed. You can go through them again — the schedule recalculates honestly.",
```

In `public/i18n/locales/he.js`, in the matching `study:` object:

```js
        launchStart: "▶ התחלה",
        launchSize: "מילים בסבב",
        launchReviewsCap: "חזרות ביום",
        launchNewCap: "מילים חדשות ביום",
        launchDueNow: "ממתינות לחזרה",
        launchServedToday: "הושלמו היום",
        launchSettings: "הגדרות הסבב",
        launchSessionPlan: "בסבב הזה: {n} (חזרות {r}, חדשות {w})",
        launchLoadOk: "המגבלה מספיקה: התור אינו גדל.",
        launchLoadGrow: "עם {cap} חזרות ביום התור יגדל. כדי שלא יגדל דרושות כ-{need} ביום.",
        launchAllDoneToday: "כל המילים שממתינות לחזרה היום כבר נבדקו. אפשר לעבור עליהן שוב — לוח הזמנים יחושב מחדש בכנות.",
```

- [ ] **Step 4: Render the launch screen**

In `public/js/library-ui.js`, add next to the other training module state (near `let _trainSession = null;`):

```js
let _pendingLaunch = null;   // T1 — the composed session waiting behind the launch screen
```

Insert immediately before `async function startDueReview(`:

```js
// T1 — launch screen. One tap to start, and the arithmetic stated before the learner commits:
// what is due, what was already done today, how many this session will serve, and — when the
// configured limit cannot keep pace with the inbound flow — the number that would (defect D-B).
function renderTrainLaunch(sel) {
  const body = _studySheet && _studySheet.querySelector('.room-study-body');
  if (!body) return;
  const prefs = trainPrefs();
  _pendingLaunch = { sel, prefs };
  body.innerHTML = '';
  const wrap = el('div', { class: 'room-train-launch', attrs: { dir: uiDirRoom() } });

  const facts = el('div', { class: 'room-train-launch-facts' });
  facts.appendChild(el('div', { class: 'room-train-launch-fact',
    text: tt('room.morph.study.launchDueNow', 'К повторению сейчас') + ': ' + sel.load.dueNow }));
  facts.appendChild(el('div', { class: 'room-train-launch-fact',
    text: tt('room.morph.study.launchServedToday', 'Пройдено сегодня') + ': ' + (sel.counts ? sel.counts.reviews : 0) }));
  facts.appendChild(el('div', { class: 'room-train-launch-fact',
    text: tt('room.morph.study.launchSessionPlan', 'В этой сессии: {n} (повторение {r}, новых {w})')
      .replace('{n}', String(sel.compose.items.length))
      .replace('{r}', String(sel.compose.servedReview))
      .replace('{w}', String(sel.compose.servedNew)) }));
  wrap.appendChild(facts);

  if (sel.compose.repeatedToday) {
    wrap.appendChild(el('div', { class: 'room-train-launch-note',
      text: tt('room.morph.study.launchAllDoneToday', 'Все слова к повторению сегодня уже пройдены. Можно пройти их ещё раз — расписание пересчитается честно.') }));
  }
  wrap.appendChild(el('div', { class: 'room-train-launch-load', attrs: { 'data-grow': sel.load.growing ? '1' : '0' },
    text: sel.load.growing
      ? tt('room.morph.study.launchLoadGrow', 'При {cap} повторениях в день очередь будет расти. Чтобы она не росла, нужно ≈{need} в день.')
          .replace('{cap}', String(prefs.reviewsPerDay)).replace('{need}', String(sel.load.requiredPerDay))
      : tt('room.morph.study.launchLoadOk', 'Лимита хватает: очередь не растёт.') }));

  const start = el('button', { class: 'room-train-launch-start', attrs: { type: 'button', 'data-train-launch-start': '1' },
    i18n: 'room.morph.study.launchStart', text: tt('room.morph.study.launchStart', '▶ Начать') });
  wrap.appendChild(start);

  const settings = wireDismissibleDetails(el('details', { class: 'room-train-launch-settings' }));
  settings.appendChild(el('summary', { i18n: 'room.morph.study.launchSettings', text: tt('room.morph.study.launchSettings', 'Настройки сессии') }));
  const rows = [
    { pref: 'sessionSize', label: tt('room.morph.study.launchSize', 'Слов в сессии'), min: 5, max: 100, step: 5 },
    { pref: 'reviewsPerDay', label: tt('room.morph.study.launchReviewsCap', 'Повторений в день'), min: 5, max: 500, step: 5 },
    { pref: 'newPerDay', label: tt('room.morph.study.launchNewCap', 'Новых слов в день'), min: 0, max: 100, step: 1 },
  ];
  for (const row of rows) {
    const line = el('label', { class: 'room-train-launch-pref' });
    line.appendChild(el('span', { text: row.label }));
    const input = el('input', { attrs: { type: 'number', 'data-train-pref': row.pref,
      min: String(row.min), max: String(row.max), step: String(row.step), value: String(prefs[row.pref]),
      inputmode: 'numeric', 'aria-label': row.label } });
    line.appendChild(input);
    settings.appendChild(line);
  }
  wrap.appendChild(settings);
  body.appendChild(wrap);
  try { window.applyI18n && window.applyI18n(); } catch (_) {}
  try { start.focus(); } catch (_) {}
}
```

- [ ] **Step 5: Paint the launch screen instead of starting immediately**

In `startDueReview`, replace the two lines added in Task 5 Step 5:

```js
  const sel = await _composeDueSession(due, trainPrefs());
  const items = await _buildDueSourcedItems(sel.picked, { scanBudget: 12 });
```

with:

```js
  const sel = await _composeDueSession(due, trainPrefs());
  if (!_studySheet || _studySheet.hidden) return;
  if (sel.compose.items.length && !(_pendingLaunch && _pendingLaunch.confirmed)) {
    renderTrainLaunch(sel);
    return;
  }
  _pendingLaunch = null;
  const items = await _buildDueSourcedItems(sel.picked, { scanBudget: 12 });
```

- [ ] **Step 6: Wire the launch controls**

In the study-sheet click delegate (`public/js/library-ui.js`, the block that begins `const opt = t.closest('[data-train-opt]');`), add before that line:

```js
    if (t.closest('[data-train-launch-start]')) {
      _pendingLaunch = Object.assign(_pendingLaunch || {}, { confirmed: true });
      startDueReview();
      return;
    }
```

Add a `change` listener next to the existing `keydown` listener on the sheet:

```js
  sheet.addEventListener('change', (e) => {
    const pref = e.target && e.target.closest && e.target.closest('[data-train-pref]');
    if (!pref) return;
    const name = pref.getAttribute('data-train-pref');
    trainPrefsSet({ [name]: pref.value });
    _pendingLaunch = null;      // recompose against the new limits before starting
    startDueReview();
  });
```

- [ ] **Step 7: Style the launch screen**

In `public/library.html`, next to the existing `.room-train-*` rules, add:

```css
.room-train-launch { display: flex; flex-direction: column; gap: 12px; }
.room-train-launch-facts { display: flex; flex-direction: column; gap: 4px; }
.room-train-launch-fact { font-size: 14px; opacity: .85; }
.room-train-launch-note,
.room-train-launch-load { font-size: 13px; line-height: 1.45; opacity: .8; }
.room-train-launch-load[data-grow="1"] { color: var(--warn, #b45309); opacity: 1; }
.room-train-launch-start { width: auto; min-height: 44px; padding: 0 20px; align-self: flex-start; font-size: 16px; }
.room-train-launch-settings summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
.room-train-launch-pref { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; }
.room-train-launch-pref input { width: 88px; min-height: 44px; text-align: center; }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run smoke:train-queue && npm run smoke:i18n`
Expected: both PASS. `smoke:i18n` will report the locale hash drift — that is expected and is fixed in Task 10.

- [ ] **Step 9: Commit**

```bash
git add public/js/library-ui.js public/library.html public/i18n/locales/ru.js public/i18n/locales/en.js public/i18n/locales/he.js scripts/premium/train-queue-smoke.js
git commit -m "feat(room): add a launch screen with session limits and honest queue arithmetic"
```

---

### Task 8: Align the streak goal with the configured limit

**Files:**
- Modify: `public/js/library-ui.js:2266`, `:3671`
- Modify: `scripts/premium/train-queue-smoke.js`

**Interfaces:**
- Consumes: `trainPrefs` (Task 5).
- Produces: nothing new — `streakView(rows, cap, todayStr)` already takes `cap` as its second argument (`public/js/reader-morph.js:2486`).

The constant `STREAK_GOAL_CAP = 10` stays exactly as it is, so `scripts/premium/reader-morph-smoke.js:1155` (`STREAK_GOAL_CAP must be 10`) keeps passing. Only the *argument* at the two Room call sites changes, from the constant to the learner's configured daily limit.

- [ ] **Step 1: Write the failing test**

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 11: streak goal follows the configured limit ───────────────────────
const streakCalls = room.match(/streakView\([^;]*?\)/g) || [];
check(streakCalls.length >= 2, "the Room must fold the streak in both the badge and the summary");
check(streakCalls.every((c) => /trainPrefs\(\)\.reviewsPerDay/.test(c)),
  "streakView must use the configured daily limit as the goal cap, got " + JSON.stringify(streakCalls));
const morph = fs.readFileSync(path.join(ROOT, "public/js/reader-morph.js"), "utf8");
check(/var STREAK_GOAL_CAP = 10;/.test(morph),
  "STREAK_GOAL_CAP must remain 10 as the engine default (reader-morph-smoke pins it)");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — the call sites still pass `window.ReaderMorph.STREAK_GOAL_CAP`.

- [ ] **Step 3: Write minimal implementation**

In `public/js/library-ui.js` line 2266, replace:

```js
    try { _streakView = window.ReaderMorph.streakView(await _allSurfaceStudyDays(), window.ReaderMorph.STREAK_GOAL_CAP, _localDayStr()); }   // R3.3 all-surface
```

with:

```js
    // T1 — the daily goal follows the learner's configured review limit; the engine constant
    // stays the default the pure fold falls back to (streakView(rows, cap, today)).
    try { _streakView = window.ReaderMorph.streakView(await _allSurfaceStudyDays(), trainPrefs().reviewsPerDay, _localDayStr()); }   // R3.3 all-surface
```

At line 3671, replace:

```js
      const sv = window.ReaderMorph.streakView(await _allSurfaceStudyDays(), window.ReaderMorph.STREAK_GOAL_CAP, _localDayStr());   // R3.3 all-surface
```

with:

```js
      const sv = window.ReaderMorph.streakView(await _allSurfaceStudyDays(), trainPrefs().reviewsPerDay, _localDayStr());   // R3.3 all-surface
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run smoke:train-queue && npm run smoke:reader-morph`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/library-ui.js scripts/premium/train-queue-smoke.js
git commit -m "fix(room): tie the daily streak goal to the configured review limit"
```

---

### Task 9: Audit harness and recorded evidence

**Files:**
- Create: `scripts/premium/train-queue-audit.js`
- Create: `docs/research/room-trainer-maturity/2026-09-02/README.md`
- Create: `docs/research/room-trainer-maturity/2026-09-02/t1-baseline-vs-composed.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `TrainQueue.composeSession` (Task 2).
- Produces: `npm run audit:train-queue` — prints and writes the before/after coverage report.

The audit carries its **own** copy of the pre-T1 rule (`lapses DESC, due ASC` → 24-row prefix → weakness rank → 12) so that the comparison is an independent oracle, not production code grading itself.

- [ ] **Step 1: Write the failing test**

Add to `package.json` `scripts`, directly after `"smoke:train-queue"`:

```json
    "audit:train-queue": "node scripts/premium/train-queue-audit.js",
```

Append to `scripts/premium/train-queue-smoke.js` before the final failure block:

```js
// ── Suite 12: the audit harness exists and its evidence is recorded ──────────
check(fs.existsSync(path.join(ROOT, "scripts/premium/train-queue-audit.js")),
  "the T1 audit harness must exist");
const evidence = path.join(ROOT, "docs/research/room-trainer-maturity/2026-09-02/t1-baseline-vs-composed.json");
check(fs.existsSync(evidence), "the recorded T1 audit evidence must be committed");
if (fs.existsSync(evidence)) {
  const ev = JSON.parse(fs.readFileSync(evidence, "utf8"));
  check(ev.baseline && ev.composed, "the evidence must carry both the baseline and the composed run");
  check(ev.composed.uniqueServed >= 2 * ev.baseline.uniqueServed,
    "acceptance §12.1: the composed run must serve at least twice the baseline's unique lemmas, got "
    + ev.composed.uniqueServed + " vs " + ev.baseline.uniqueServed);
  check(ev.composed.maxDayShare <= 0.25 + 1e-9,
    "acceptance §12.1: no lemma may be served on more than 25% of days, got " + ev.composed.maxDayShare);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run smoke:train-queue`
Expected: FAIL — the harness and the evidence file do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/premium/train-queue-audit.js`:

```js
#!/usr/bin/env node
"use strict";
// audit:train-queue — T1 coverage measurement (spec §5.5, acceptance §12.1).
//
// The simulation MUST model scheduling feedback and failures. Measured while building Task 2:
// a static backlog re-served every day makes both rules look identical at 100% coverage, and a
// success-only feedback model does too. The owner's actual loop closes through FAILURE — a wrong
// answer sets interval 0, which sets due = now, which under `lapses DESC` pins the word to the
// top of the queue for ever. An audit that never fails a word cannot see the defect it exists to
// measure.
//
// Simulates DAYS consecutive daily sessions over a synthetic backlog shaped like the owner's
// recorded profile (208 due / 290 scheduled, predecessor packet §9) and compares:
//   baseline — the PRE-T1 rule, reimplemented here so the comparison is an independent oracle:
//              ORDER BY lapses DESC, due ASC → 24-row prefix → weakness rank → 12
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

// Synthetic backlog: 208 due words, a realistic lapse tail, mixed intervals.
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
        reviewedAt: NOW - (interval + 1 + (i % 11)) * DAY_MS
      }
    });
  }
  return out;
}

// The PRE-T1 rule, reimplemented independently.
function baselineSession(candidates) {
  const ordered = candidates.slice().sort((a, b) => {
    const la = a._srs.lapses || 0, lb = b._srs.lapses || 0;
    if (lb !== la) return lb - la;
    return (a._srs.due || 0) - (b._srs.due || 0);
  });
  const built = ordered.slice(0, 24);                       // TRAIN_N * 2 prefix cut
  const ranked = built.slice().sort((a, b) => (b._srs.lapses || 0) - (a._srs.lapses || 0));
  return ranked.slice(0, 12);                               // TRAIN_N
}

// Deterministic difficulty: a word the learner keeps failing keeps failing. This is what
// closes the loop — a failure sets interval 0, which sets due = now, which under the baseline's
// `lapses DESC` order pins the word to the head of the queue permanently.
function answersWrong(item, day) {
  const lapses = item._srs.lapses || 0;
  if (lapses >= 5) return true;                       // the entrenched leeches
  if (lapses >= 1) return (day + item.lemmaKey.length) % 3 === 0;
  return false;
}

function run(pick, label) {
  const backlog = buildBacklog();
  const served = new Map();
  const perDay = [];
  for (let d = 0; d < DAYS; d++) {
    const now = NOW + d * DAY_MS;
    const dayStr = new Date(now).toISOString().slice(0, 10);
    const dueList = backlog.filter((x) => x._srs.due <= now);
    const items = pick(dueList, dayStr, now);
    perDay.push(items.length);
    items.forEach((x) => {
      served.set(x.lemmaKey, (served.get(x.lemmaKey) || 0) + 1);
      x._srs.reviewedAt = now;
      if (answersWrong(x, d)) {
        x._srs.lapses = (x._srs.lapses || 0) + 1;
        x._srs.interval = 0;                          // fsrs-core: grade 1 → due now
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
  return {
    label,
    days: DAYS,
    backlogSize: backlog.length,
    uniqueServed: served.size,
    coverage: Number((served.size / backlog.length).toFixed(4)),
    maxDayShare: Number((maxCount / DAYS).toFixed(4)),
    meanSession: Number((perDay.reduce((a, b) => a + b, 0) / DAYS).toFixed(2))
  };
}

const baseline = run((dueList) => baselineSession(dueList), "baseline (pre-T1)");
const composed = run((dueList, dayStr, now) => TQ.composeSession(dueList, {
  nowMs: now, dayStr, sessionSize: TQ.DEFAULTS.sessionSize,
  reviewsRemaining: TQ.DEFAULTS.reviewsPerDay, newRemaining: TQ.DEFAULTS.newPerDay
}).items, "composed (T1)");

const schedule = {};
buildBacklog().forEach((x) => { schedule[x.lemmaKey] = { due: x._srs.due, interval: x._srs.interval }; });
const load = TQ.queueLoad({ schedule, statusMap: null, nowMs: NOW, reviewsPerDay: 12 });

const report = {
  generatedFor: "docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md §5.5",
  engine: TQ.ENGINE_VERSION,
  days: DAYS,
  baseline,
  composed,
  loadAtOldSessionSize: load
};

console.log(JSON.stringify(report, null, 2));

if (WRITE) {
  const dir = path.join(ROOT, "docs/research/room-trainer-maturity/2026-09-02");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "t1-baseline-vs-composed.json"), JSON.stringify(report, null, 2) + "\n");
  console.error("written: docs/research/room-trainer-maturity/2026-09-02/t1-baseline-vs-composed.json");
}
```

- [ ] **Step 4: Generate the evidence**

Run: `npm run audit:train-queue -- --write`
Expected: a JSON report on stdout and the evidence file written. Read the printed `baseline.uniqueServed` and `composed.uniqueServed` — the composed figure must be at least double the baseline. If it is not, the composition weights in Task 2 are wrong; fix them before continuing rather than relaxing the assertion.

- [ ] **Step 5: Write the evidence README**

Create `docs/research/room-trainer-maturity/2026-09-02/README.md`:

```markdown
# Room Trainer T1 — serving-order audit

**What this is.** Measured evidence for wave T1 of
`docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md` (§5.5, acceptance §12.1):
how many distinct words the review queue actually reaches over 20 consecutive daily
sessions, before and after the T1 selection change.

**How it was generated.**

```
npm run audit:train-queue -- --write
```

Source: `scripts/premium/train-queue-audit.js`. The harness is deterministic — a fixed
synthetic backlog of 208 due words shaped like the owner's recorded profile (208 due /
290 scheduled, predecessor packet §9), a fixed start date, no randomness.

**What is compared.** The audit carries its own reimplementation of the pre-T1 rule
(`ORDER BY srs_lapses DESC, srs_due ASC` → 24-row prefix cut → weakness rank → 12 items),
so the baseline is an independent oracle and not the production code grading itself.

**Files.**

- `t1-baseline-vs-composed.json` — the recorded report. Scored output; regenerate with the
  command above, do not hand-edit.
- `README.md` — this file.

**How to read it.** `uniqueServed` is the headline: distinct lemmas reached in 20 sessions.
`maxDayShare` is the fraction of days on which the single most-repeated word appeared —
the direct measure of the "same words keep coming back" complaint. `coverage` is
`uniqueServed / backlogSize`.
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run smoke:train-queue`
Expected: PASS, Suite 12 green.

- [ ] **Step 7: Commit**

```bash
git add scripts/premium/train-queue-audit.js docs/research/room-trainer-maturity package.json scripts/premium/train-queue-smoke.js
git commit -m "test(room): measure due-queue coverage before and after the T1 selection change"
```

---

### Task 10: Release — version lockstep and the full gate sweep

**Files:**
- Modify: `public/index.html:13532` (`window.APP_VERSION`)
- Modify: `public/sw.js:31` (`CACHE_VERSION`)
- Modify: `public/index.html:13351-13353` **and** `public/library.html:3302-3304` (locale `<script ?v=>` tags)
- Modify: `tests/i18n.locale-version.lock.json`

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: a deployable revision.

Memory note `feedback_version_lockstep_bump`: `CACHE_VERSION`, `APP_VERSION` and the locale `?v=` must move together, or the stale-tab guard blocks every tab.

- [ ] **Step 1: Bump the runtime version**

In `public/index.html` line 13532, change `window.APP_VERSION = "3.11.456";` to the next patch: `window.APP_VERSION = "3.11.457";`

In `public/sw.js` line 31, change `const CACHE_VERSION = "v3.11.456";` to `const CACHE_VERSION = "v3.11.457";`

- [ ] **Step 2: Bump the locale cache-bust in EVERY HTML shell**

`tests/i18n.smoke.js` Suite 10 asserts that all HTML shells share one `?v=` number, so both files must move together. Increment `?v=` from `190` to `191` in `public/index.html:13351-13353` **and** in `public/library.html:3302-3304`:

```html
<script src="/i18n/locales/ru.js?v=191"></script>
<script src="/i18n/locales/en.js?v=191"></script>
<script src="/i18n/locales/he.js?v=191"></script>
```

Then regenerate the lock:

Run: `node tests/i18n.smoke.js --write-lock`
Expected: `tests/i18n.locale-version.lock.json` updated with `"version": "191"` and a new `sha256`.

Run: `npm run smoke:i18n`
Expected: PASS, including the "locale `<script>` tags in every HTML shell share one `?v=` number" assertion. If it fails naming one shell, that shell was missed above.

- [ ] **Step 3: Run the full gate sweep**

Run each and confirm PASS:

```bash
npm run smoke:train-queue
npm run smoke:i18n
npm run smoke:fsrs
npm run smoke:grade-policy
npm run smoke:memory-canon
npm run smoke:room-training-premium
npm run smoke:studio-room-srs
npm run smoke:reader-word-status
npm run smoke:reader-morph
npm run smoke:reader-parity
npm run smoke:room
npm run smoke:room-study
npm run smoke:canon-version
git diff --check
```

Expected: every command exits 0. Run the OPFS smokes (`memory-canon`, `reader-word-status`) one at a time — two overlapping copies produce a spurious `DbUnavailableError`.

- [ ] **Step 4: Take the mandatory UI screenshots**

Per `CLAUDE.md`, no UI commit ships without a 380px screenshot. Capture the launch screen and the first question at 380×844 in RU and in HE/RTL, plus 1280 RU, and look at each one before committing. Save them to `docs/research/room-trainer-maturity/2026-09-02/screenshots/`.

- [ ] **Step 5: Commit and push**

```bash
git add public/index.html public/library.html public/sw.js tests/i18n.locale-version.lock.json docs/research/room-trainer-maturity
git commit -m "release(room): T1 serving order, session limits and honest queue arithmetic (3.11.457)"
git push origin main
```

- [ ] **Step 6: Verify the deployed revision**

After the Coolify build completes, confirm the served runtime reports `3.11.457` in `/api/client-config`, in `window.APP_VERSION` of the served index and in `CACHE_VERSION` of the served service worker, and that `/healthz` reports application, DB and migrations ready. Do not grade any word on the owner's profile during verification.

---

## Self-Review

**Spec coverage (§5 of the program spec):**

| Spec requirement | Task |
|---|---|
| §5.1 remove the 24-item prefix cut | 5 (Step 7) |
| §5.1 exclude words answered today | 4 (`getAnsweredSince`), 5 (`_composeDueSession`) |
| §5.1 bucket learning/overdue/known/new | 2 (`bucketOf`) |
| §5.1 day-seeded permutation within a bucket | 1 (`dayPermute`), 2 (`composeSession`) |
| §5.1 bounded weakness quota | 2 (`composeSession`, `weaknessShare`) |
| §5.2 daily limits folded from `review_log` | 4 (`getDayGradeCounts`), 5, 7 |
| §5.2 configurable session size | 5 (`trainPrefs`), 7 (launch screen) |
| §5.2 `STREAK_GOAL_CAP` alignment | 8 |
| §5.3 distractor pool from outside the session | 6 |
| §5.4 honest load arithmetic | 3 (`queueLoad`), 7 (launch screen) |
| §5.5 audit harness and recorded evidence | 9 |
| §5.6 new `smoke:train-queue` gate | 1–9 (grown per task) |
| §5.6 existing gates stay green | 4 (Step 5), 10 (Step 3) |
| D-C known refresh in the cross-text session | 2 (`knownShare`), verified in Suite 6 |
| Global: no schema change | no task touches `public/db/migrations.js` |
| Global: three locales + version lockstep | 7, 10 |

No spec requirement in §5 is unassigned.

**Placeholder scan:** every code step carries the literal code to write; no "add error handling", no "similar to Task N", no TBD. The one deliberately deferred value is the audit's measured numbers, which are produced by running the harness in Task 9 Step 4, not guessed in the plan.

**Type consistency:** `composeSession` returns `{ items, buckets, servedNew, servedReview, excludedToday, repeatedToday, availableDue }` in Task 2 and is read with exactly those names in Tasks 5, 7 and 9. `queueLoad` returns `{ dueNow, scheduled, inflowPerDay, requiredPerDay, growing }` in Task 3 and is read with exactly those names in Task 7. `_composeDueSession` returns `{ picked, load, compose, counts }` in Task 5 and is read with exactly those names in Tasks 6 and 7. `trainPrefs()` returns `{ sessionSize, reviewsPerDay, newPerDay }` in Task 5 and is read with exactly those names in Tasks 7 and 8. `getAnsweredSince` returns `string[]` and `getDayGradeCounts` returns `{ reviews, newWords }` in Task 4, consumed with those shapes in Task 5.
