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

  // FNV-1a over (dayStr + '@' + lemmaKey) → uint32. Deterministic, dependency-free.
  //
  // The day MUST come first. FNV-1a folds left to right, so putting the day last leaves
  // consecutive days differing only in their final byte: '2' vs '3' differ in one bit, and
  // the closing multiply by 16777619 then shifts EVERY key's hash by the same constant.
  // A constant offset is almost order-preserving, so the permutation barely changed and the
  // same words were served day after day — the very defect this engine exists to fix.
  // Leading with the day diffuses that difference through every later multiply.
  function dayHash(lemmaKey, dayStr) {
    var s = String(dayStr == null ? "" : dayStr) + "@" + String(lemmaKey == null ? "" : lemmaKey);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    // Avalanche finalizer (murmur3 fmix32). FNV alone leaves the day-to-day DELTA structured:
    // its multiply is linear, so two days' hashes for the same key differ by a value that
    // depends mostly on key length, not key content. Measured before this step: 16 distinct
    // deltas across 40 keys. The finalizer diffuses every input bit across all 32 output bits,
    // so consecutive days produce genuinely unrelated orders rather than a near-rotation.
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
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
    if (!all.length) {
      return {
        items: [], buckets: { learning: 0, overdue: 0, known: 0, "new": 0 },
        servedNew: 0, servedReview: 0, excludedToday: 0, repeatedToday: false, availableDue: 0
      };
    }

    var excl = {};
    var exKeys = Array.isArray(opts.excludeKeys) ? opts.excludeKeys : [];
    for (var e = 0; e < exKeys.length; e++) excl[String(exKeys[e])] = 1;

    var fresh = all.filter(function (x) { return !excl[String(x.lemmaKey)]; });
    var excludedToday = all.length - fresh.length;
    // Everything due was already answered today: repeat rather than show an empty screen,
    // and say so — an extra retrieval is honest, a blank screen is not.
    var repeatedToday = fresh.length === 0;
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

    // Weakness quota: the weakest tier first, but the order INSIDE a tier is day-seeded.
    //
    // Ranking the quota strictly by (lapses, overdueness) rebuilds the very defect this engine
    // removes, one scale down: with six words at nine lapses and a five-slot quota, the same
    // five are served every single day. Measured on the 208-word backlog before this change the
    // composed run reached 159 distinct words yet still had a maxDayShare of 1.00. Lapse count
    // decides WHICH TIER gets the quota; the day decides who inside that tier is served today.
    var weakRanked = reviewPool
      .map(function (x, ix) {
        return {
          x: x, ix: ix,
          lp: (x._srs && Number(x._srs.lapses)) || 0,
          ro: relativeOverdueness(x, nowMs),
          h: dayHash(x.lemmaKey, dayStr)
        };
      })
      .sort(function (a, b) {
        if (b.lp !== a.lp) return b.lp - a.lp;   // weaker tier first (pedagogy)
        if (a.h !== b.h) return a.h - b.h;       // inside a tier, rotate by day (variety)
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

  // T2 — context rotation. Serving the SAME sentence on every review measures sentence memory,
  // not word knowledge (R2, encoding specificity). The caller supplies the bank in its stable
  // (source_class, text_key, order_index) order, so consecutive reviews walk to a different
  // text without storing any extra state — the word's own review count is the cursor.
  function pickContext(contexts, reps) {
    if (!Array.isArray(contexts) || !contexts.length) return null;
    var n = contexts.length;
    var i = Math.floor(Number(reps) || 0) % n;
    if (i < 0) i += n;
    return contexts[i];
  }

  return {
    pickContext: pickContext,
    ENGINE_VERSION: ENGINE_VERSION,
    DAY_MS: DAY_MS,
    DEFAULTS: DEFAULTS,
    dayHash: dayHash,
    dayPermute: dayPermute,
    bucketOf: bucketOf,
    relativeOverdueness: relativeOverdueness,
    composeSession: composeSession,
    queueLoad: queueLoad
  };
});
