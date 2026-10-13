// public/js/dictionary-progress-core.js — «Мой словарь» Д2.3 «Прогресс словаря» (чистое ядро, Node-тестируемое).
// Спека: docs/planning/word-layer/F4_D2_LEARNING_SPEC_2026_10_12.md (раздел Д2.3).
//
// Ни одного нового хранилища. Статус слова на момент T восстанавливается из журнала отметок
// (review_log kind='mark', статус в meta — та же истина, по которой синхронизация сводит устройства).
// Слабые места — доля срывов в повторениях (оценка ≤1) по части речи / биньяну, и доля ошибок в
// тренировке форм по биньяну / времени. Малая выборка не показывается как вывод.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DictionaryProgress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAY = 86400000;
  var STATUSES = ["new", "l1", "l2", "l3", "l4", "known", "ignore"];
  var LEVEL = { "new": 0, l1: 1, l2: 2, l3: 3, l4: 4, known: 5 };
  function ms(v) { if (v == null || v === "") return 0; var n = typeof v === "number" ? v : Date.parse(v); return Number.isFinite(n) ? n : 0; }

  // marks: [{ key, at, status }] (any order) → key → [{at, status}] sorted by time
  function indexMarks(marks) {
    var by = new Map();
    (marks || []).forEach(function (m) {
      if (!m || !m.key) return;
      var a = by.get(m.key); if (!a) { a = []; by.set(m.key, a); }
      a.push({ at: ms(m.at), status: String(m.status || "") });
    });
    by.forEach(function (a) { a.sort(function (x, y) { return x.at - y.at; }); });
    return by;
  }
  // status of one word at T: the last mark ≤ T. A word with marks only after T did not have a status yet
  // («new» if it was already in the dictionary, absent otherwise). A word with NO marks keeps its current
  // status from the day it was added (its history is unknown — the page says so).
  function statusAt(entry, marksOfKey, T) {
    var added = ms(entry.added);
    if (!marksOfKey || !marksOfKey.length) return added && added <= T ? (entry.status || "new") : null;
    var st = null;
    for (var i = 0; i < marksOfKey.length && marksOfKey[i].at <= T; i++) st = marksOfKey[i].status;
    if (st == null) return added && added <= T ? "new" : null;
    return st || "new";   // a cleared status is the default state
  }
  function countsAt(entries, idx, T) {
    var c = { total: 0 }; STATUSES.forEach(function (s) { c[s] = 0; });
    entries.forEach(function (e) { var s = statusAt(e, idx.get(e.key), T); if (s == null) return; c.total++; if (c[s] != null) c[s]++; });
    return c;
  }
  // entries: [{ key, status, added }] — my words (Д1 rule). Returns the counts now / a week / a month ago and
  // what moved: «стало „знаю“», «поднялись по шкале» (level up, ignore excluded), «новых слов».
  function dynamics(entries, marks, now) {
    now = now || Date.now();
    var idx = indexMarks(marks), list = entries || [];
    var out = { now: countsAt(list, idx, now), noHistory: 0, periods: {} };
    list.forEach(function (e) { if (!idx.get(e.key)) out.noHistory++; });
    [["week", 7], ["month", 30]].forEach(function (p) {
      var T = now - p[1] * DAY, then = countsAt(list, idx, T), known = 0, up = 0, added = 0;
      list.forEach(function (e) {
        var a = statusAt(e, idx.get(e.key), T), b = statusAt(e, idx.get(e.key), now);
        if (a == null && b != null) added++;
        if (b === "known" && a !== "known") known++;
        if (a != null && LEVEL[a] != null && LEVEL[b] != null && LEVEL[b] > LEVEL[a]) up++;
      });
      out.periods[p[0]] = { then: then, known: known, up: up, added: added };
    });
    return out;
  }

  // days: [{ day:'YYYY-MM-DD', n, fails }] of kind='review' → `weeks` rolling 7-day windows ending today (oldest first)
  function weekly(days, now, weeks) {
    now = now || Date.now(); weeks = weeks || 8;
    var end = new Date(now); end.setHours(23, 59, 59, 999);
    var out = [];
    for (var w = weeks - 1; w >= 0; w--) {
      var to = end.getTime() - w * 7 * DAY, from = to - 7 * DAY;
      out.push({ from: from + 1, to: to, n: 0, fails: 0 });
    }
    (days || []).forEach(function (d) {
      var t = Date.parse(String(d.day) + "T12:00:00");
      if (!Number.isFinite(t)) return;
      for (var i = 0; i < out.length; i++) if (t >= out[i].from && t <= out[i].to) { out[i].n += Number(d.n) || 0; out[i].fails += Number(d.fails) || 0; break; }
    });
    return out;
  }

  // Weak spots of word memory. rows: [{ value (pos or binyan), reviews, fails }] one per word.
  // A group is shown only with enough data (≥ minWords words, ≥ minReviews reviews); it is «weak» when its
  // fail rate is clearly above the overall rate (× 1.2) with at least 3 fails — not a noisy blip.
  function weakSpots(rows, opts) {
    opts = opts || {};
    var minWords = opts.minWords || 3, minReviews = opts.minReviews || 8;
    var all = { reviews: 0, fails: 0 }, g = new Map();
    (rows || []).forEach(function (r) {
      var rv = Number(r.reviews) || 0, f = Number(r.fails) || 0;
      all.reviews += rv; all.fails += f;
      if (!r.value) return;
      var x = g.get(r.value); if (!x) { x = { value: r.value, words: 0, reviews: 0, fails: 0 }; g.set(r.value, x); }
      x.words++; x.reviews += rv; x.fails += f;
    });
    all.rate = all.reviews ? all.fails / all.reviews : 0;
    var groups = Array.from(g.values()).filter(function (x) { return x.words >= minWords && x.reviews >= minReviews; });
    groups.forEach(function (x) { x.rate = x.fails / x.reviews; x.weak = x.fails >= 3 && x.rate > all.rate * 1.2; });
    groups.sort(function (a, b) { return b.rate - a.rate || b.reviews - a.reviews; });
    return { overall: all, groups: groups };
  }

  // tense of a Pealim slot (the same keys as InflectionRender.projectStudyForms groups)
  var TENSE = { AP: "present", PERF: "past", IMPF: "future", IMP: "imperative", INF: "infinitive" };
  function tenseOf(slot) {
    var s = String(slot || ""), passive = /^passive-/.test(s);
    var m = /^([A-Z]+)-/.exec(s.replace(/^passive-/, ""));
    var t = m && TENSE[m[1]];
    return t ? (passive ? "passive_" + t : t) : "";
  }
  // Weak spots of the form drill. records: [{ key, binyan, mem: { slot: {seen, right} } }].
  // By binyan and by tense across words; a group needs ≥ minSeen answers.
  function formWeakSpots(records, opts) {
    opts = opts || {};
    var minSeen = opts.minSeen || 6;
    var all = { seen: 0, wrong: 0 }, byB = new Map(), byT = new Map();
    function add(map, k, seen, wrong, key) {
      if (!k) return;
      var x = map.get(k); if (!x) { x = { value: k, seen: 0, wrong: 0, keys: new Set() }; map.set(k, x); }
      x.seen += seen; x.wrong += wrong; x.keys.add(key);
    }
    (records || []).forEach(function (r) {
      Object.keys(r.mem || {}).forEach(function (slot) {
        var m = r.mem[slot] || {}, seen = Number(m.seen) || 0, wrong = Math.max(0, seen - (Number(m.right) || 0));
        if (!seen) return;
        all.seen += seen; all.wrong += wrong;
        add(byB, r.binyan, seen, wrong, r.key);
        add(byT, tenseOf(slot), seen, wrong, r.key);
      });
    });
    all.rate = all.seen ? all.wrong / all.seen : 0;
    function fin(map) {
      return Array.from(map.values()).filter(function (x) { return x.seen >= minSeen; })
        .map(function (x) { return { value: x.value, seen: x.seen, wrong: x.wrong, rate: x.wrong / x.seen, words: x.keys.size, keys: Array.from(x.keys), weak: x.wrong >= 3 && x.wrong / x.seen > all.rate * 1.2 }; })
        .sort(function (a, b) { return b.rate - a.rate || b.seen - a.seen; });
    }
    return { overall: all, binyan: fin(byB), tense: fin(byT) };
  }

  return { STATUSES: STATUSES, statusAt: statusAt, indexMarks: indexMarks, dynamics: dynamics, weekly: weekly,
    weakSpots: weakSpots, tenseOf: tenseOf, formWeakSpots: formWeakSpots };
});
