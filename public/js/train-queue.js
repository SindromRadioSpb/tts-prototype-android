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

  return {
    ENGINE_VERSION: ENGINE_VERSION,
    DAY_MS: DAY_MS,
    DEFAULTS: DEFAULTS,
    dayHash: dayHash,
    dayPermute: dayPermute
  };
});
