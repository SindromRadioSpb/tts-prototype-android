/* retention-report.js — Room Trainer T4 analytics (UMD, pure).
 *
 * Plan: docs/superpowers/plans/2026-09-03-room-trainer-t4-retention-analytics.md
 * Spec: docs/planning/ROOM_TRAINER_MATURITY_PROGRAM_2026_09_02.md §8
 *
 * The trainer had no instrument: nothing was computed over review_log, so no claim about the
 * scheduler — including the ones this program already shipped — could be checked by the learner.
 * This module folds the raw log and the schedule map into reports.
 *
 * INDEPENDENT FOLD (R17 — whoever teaches does not certify). It never calls the selection or
 * scheduling path. Where it overlaps the scheduler's own load arithmetic it RE-DERIVES the
 * numbers and the gate asserts the two agree: a report that echoed the scheduler could not
 * contradict it, and a metric that cannot contradict is not evidence.
 *
 * Read-only and deterministic: nowMs is injected, nothing is written, no randomness.
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
  // disappearing — a backlog you cannot see is exactly what let this one grow unnoticed.
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
    var out = [];
    for (var h = 0; h < HIST_BUCKETS.length; h++) {
      out.push({ label: HIST_BUCKETS[h].label, min: HIST_BUCKETS[h].min, max: HIST_BUCKETS[h].max, count: 0 });
    }
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
    // How long today's debt takes to clear at the configured pace, once the inbound flow is paid
    // for. Infinity when the pace cannot even cover the inflow — the honest answer is "never at
    // this limit", not a large finite number that implies progress.
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
