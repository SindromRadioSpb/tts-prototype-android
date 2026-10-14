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

  // Т4 «словарик к тексту»: which unfamiliar lemmas of a text to learn first and what that does to the text's
  // familiarity — computed by the SAME evaluator the Room shows (evaluate = LearningCompassCore.evaluate…V2) on the
  // same cached ingredients, with the chosen keys added to the learner projection as «learning» (l1).
  // candidates: the keys the learner can act on (the text lens); the frontier is ordered by uses in the text.
  function textPlan(input) {
    input = input || {};
    var ing = input.ingredients, proj = input.projection, evaluate = input.evaluate;
    if (!ing || !proj || typeof evaluate !== "function") return null;
    var base = evaluate({ ingredients: ing, learner_projection: proj });
    if (!base || base.recorded_familiar_pct_lower_bound == null) return { now: null, steps: [], frontier: [] };
    var states = proj.state_by_key || {}, sched = {};
    (proj.scheduled_keys || []).forEach(function (k) { sched[k] = true; });
    var FAM = { known: 1, learning: 1, weak: 1, stale: 1, l1: 1, l2: 1, l3: 1, l4: 1 };
    var allow = input.candidates ? new Set(input.candidates) : null;
    var frontier = (ing.key_frequencies || []).map(function (r) { return Array.isArray(r) ? { key: r[0], n: r[1] } : { key: r.key, n: r.token_count }; })
      .filter(function (r) { var st = states[r.key]; return st !== "ignore" && !FAM[st] && !sched[r.key] && (!allow || allow.has(r.key)); })
      .sort(function (a, b) { return b.n - a.n || (a.key < b.key ? -1 : 1); });
    function pctWith(keys) {
      var st = Object.assign({}, states); keys.forEach(function (k) { st[k] = "l1"; });
      var r = evaluate({ ingredients: ing, learner_projection: Object.assign({}, proj, { state_by_key: st }) });
      return r && r.recorded_familiar_pct_lower_bound;
    }
    var target = input.target || 95, steps = [];
    (input.sizes || [10, 25, 50]).forEach(function (n) {
      if (n >= frontier.length && steps.length && steps[steps.length - 1].n >= frontier.length) return;
      var k = Math.min(n, frontier.length); if (!k) return;
      steps.push({ n: k, pct: pctWith(frontier.slice(0, k).map(function (r) { return r.key; })), keys: frontier.slice(0, k).map(function (r) { return r.key; }) });
    });
    // the smallest prefix that reaches the target (binary search: the familiarity grows with every added key)
    var toTarget = null;
    if (base.recorded_familiar_pct_lower_bound < target && frontier.length) {
      var lo = 1, hi = frontier.length, all = frontier.map(function (r) { return r.key; });
      if (pctWith(all) >= target) {
        while (lo < hi) { var mid = (lo + hi) >> 1; if (pctWith(all.slice(0, mid)) >= target) hi = mid; else lo = mid + 1; }
        toTarget = { n: lo, pct: pctWith(all.slice(0, lo)), keys: all.slice(0, lo) };
      }
    }
    return { now: base.recorded_familiar_pct_lower_bound, steps: steps, toTarget: toTarget, frontier: frontier, target: target };
  }

  // Д5.1 the ingredients of a set of texts = the sum of the texts' ingredients (frequencies per key and the token
  // counters are additive), so the Room's evaluator on the sum gives the token-weighted familiarity of the set.
  // Mixed resolver / schema versions are not summed (null) — a stale text must be rebuilt, not blended in.
  function mergeIngredients(list) {
    var xs = (list || []).filter(Boolean);
    if (!xs.length) return null;
    var head = xs[0], freq = Object.create(null), unresolved = 0, names = 0, total = 0;
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i];
      if (x.resolver_version !== head.resolver_version || (x.schema_version || "") !== (head.schema_version || "")) return null;
      (x.key_frequencies || []).forEach(function (r) {
        var k = Array.isArray(r) ? r[0] : r && r.key, n = Number(Array.isArray(r) ? r[1] : r && r.token_count) || 0;
        if (k && n > 0) freq[k] = (freq[k] || 0) + n;
      });
      unresolved += Number(x.unresolved_token_count) || 0;
      names += Number(x.proper_name_token_count) || 0;
      total += Number(x.total_token_count) || 0;
    }
    return { schema_version: head.schema_version, resolver_version: head.resolver_version,
      lexical_resolver_version: head.lexical_resolver_version, dataset_version: head.dataset_version,
      key_frequencies: Object.keys(freq).sort().map(function (k) { return [k, freq[k]]; }),
      unresolved_token_count: unresolved, proper_name_token_count: names, total_token_count: total, parts: xs.length };
  }

  // Д7.4 the familiarity of a lens on the keys of its LIST (the Room's word scan): rows [from, to) of a scan →
  // ingredients for the same evaluator. Keyed tokens count by their list key; unsure tokens are «unknown»; name-like
  // unsure tokens leave the denominator; closed-class words are not in the list and not here either.
  function scanIngredients(input) {
    // O-083: one implementation — TextKeyScan.listIngredients (the own-text cards use it too)
    var TKS = (typeof globalThis !== "undefined" && globalThis.TextKeyScan) || (typeof require === "function" ? require("./text-key-scan.js") : null);
    return TKS.listIngredients(input);
  }


  return { STATUSES: STATUSES, textPlan: textPlan, mergeIngredients: mergeIngredients, scanIngredients: scanIngredients, statusAt: statusAt, indexMarks: indexMarks, dynamics: dynamics, weekly: weekly,
    weakSpots: weakSpots, tenseOf: tenseOf, formWeakSpots: formWeakSpots };
});
