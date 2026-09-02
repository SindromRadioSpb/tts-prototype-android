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

  function _bucket() { return { attempts: 0, passed: 0, rate: null }; }
  function _seal(b) { b.rate = b.attempts ? b.passed / b.attempts : null; return b; }

  // Channel family = the prefix before ':' — the trainer writes '<channel>[:<mode>]'.
  function _family(channel) {
    var c = String(channel == null ? "" : channel);
    var i = c.indexOf(":");
    return (i >= 0 ? c.slice(0, i) : c) || "unknown";
  }

  function _meta(row) {
    try { return typeof row.meta_json === "string" ? JSON.parse(row.meta_json) : (row.meta || {}); }
    catch (_) { return {}; }
  }

  // True retention over a window. The honesty rules ARE the feature:
  //   • a skip is an explicit refusal, not a retrieval outcome — excluded from BOTH sides and
  //     reported separately, because folding it either way lies in a different direction;
  //   • annulled rows leave the numbers exactly as they leave the fold;
  //   • mark and seed rows are not retrievals and never count;
  //   • pass is grade > 1 (the reference's own rule: only Again is a failure);
  //   • an empty bucket reports null, not 0% — unknown is not the same as total failure.
  //
  // byScope is the first consumer of meta.evidence_scope, written on every grade event since
  // 2026-08-11 and never read. A high recognition rate beside a low unsupported-production rate
  // is the honest answer to "do I know this word, or do I merely recognise it?" — the question
  // the scaffolding contract deliberately left open.
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
      var am = _meta(ar);
      if (am && am.annul_of != null) annulled[String(am.annul_of)] = 1;
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
      var meta = _meta(r);
      var fam = _family(r.channel);
      var scope = (meta && meta.evidence_scope) ? String(meta.evidence_scope) : "unknown";
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

  // Words the scheduler keeps bringing back. Ordered worst-first (lapses, then a weaker rate),
  // each carrying its OWN retention so the learner can see whether a word fails everywhere or
  // only on one channel — the difference between "hard" and "wrong context", which is what T3's
  // repair path acts on. A leech released in T3 is shown AS released rather than dropped: the
  // learner asserted it is workable, and hiding it would hide the assertion.
  function leechList(schedule, statusMap, rows, threshold, limit) {
    var thr = Math.max(1, Math.round(Number(threshold) || 4));
    var cap = Math.max(1, Math.min(500, Math.round(Number(limit) || 50)));
    var list = Array.isArray(rows) ? rows : [];

    var released = {}, stats = {}, lastFail = {};
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || !r.item_key) continue;
      var key = String(r.item_key);
      var meta = _meta(r);
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

  return {
    ENGINE_VERSION: ENGINE_VERSION,
    forecast: forecast,
    intervalHistogram: intervalHistogram,
    loadBalance: loadBalance,
    trueRetention: trueRetention,
    leechList: leechList
  };
});
