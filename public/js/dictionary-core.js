// public/js/dictionary-core.js — «Мой словарь» (Ф4 · Д1), чистое ядро (Node-тестируемое).
// Спека: docs/planning/word-layer/F4_D1_DICTIONARY_SPEC_2026_10_12.md.
//
// Запись словаря = лемма по канон-ключу lemma-canon (как word_status / review_log). Ни одного нового
// хранилища: запись СОБИРАЕТСЯ из статусов, расписания FSRS, канонических заметок «мои слова»,
// журнала повторений и банка контекстов. Разбор слова (огласовка, значение, часть речи…) — производный,
// его кладёт браузерный слой после проверки личности (lemmaKey резолвера === ключ записи, R11).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DictionaryCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STATUSES = ["new", "l1", "l2", "l3", "l4", "known", "ignore"];
  var LEVEL = { l1: 1, l2: 2, l3: 3, l4: 4, known: 5, "new": 0, ignore: -1 };
  var DAY = 86400000;

  function str(v) { return v == null ? "" : String(v); }
  function ms(v) { if (v == null || v === "") return 0; var n = typeof v === "number" ? v : Date.parse(v); return Number.isFinite(n) ? n : 0; }
  function minPos(a, b) { return !a ? b : !b ? a : Math.min(a, b); }

  // '<skeleton>#pos' / '<skeleton>#' keys carry their own surface; 'pid:N' and lemma keys do not.
  function keySurface(key) {
    var k = str(key);
    if (!k || /^pid:/.test(k)) return "";
    if (/^dl:/.test(k)) k = k.slice(3);   // Д8-К: dl:<Dicta lemma>#<pos> — the lemma is the key's surface
    var i = k.indexOf("#");
    var s = i >= 0 ? k.slice(0, i) : k;
    return /[א-ת]/.test(s) ? s : "";
  }

  // Hebrew search form: no niqqud/cantillation, no maqaf/geresh, final letters folded.
  var FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  function normHe(s) {
    return str(s).replace(/[֑-ׇ]/g, "").replace(/[־׳״'"\-\s]/g, "")
      .replace(/[ךםןףץ]/g, function (c) { return FINALS[c]; });
  }
  function normRu(s) { return str(s).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim(); }

  // One entry per key, from every source. Each source is optional.
  //   statuses: { key: status } · statusTimes: { key: iso } · schedule: { key: {due, reps, lapses, stability, reviewedAt} }
  //   notes: [{ key, id, word, niqqud, meaning, userMeaning, pos, root, binyan, pid, created, occ, lastOcc }]
  //   logAgg: [{ key, n, first, last, fails, surface }] · contexts: [{ key, occ, texts, surface }]
  //   marks: [{ key, surface, textKey, order }] — the occurrence stored when a status was set in a text
  function mergeSources(src) {
    src = src || {};
    var map = new Map();
    function entry(key) {
      key = str(key).trim();
      if (!key) return null;
      var e = map.get(key);
      if (!e) {
        e = { key: key, status: "", srs: null, note: null, log: null, ctx: null, surfaces: [], added: 0, lastSeen: 0, sources: [] };
        map.set(key, e);
      }
      return e;
    }
    function addSurface(e, s, why) { s = str(s).trim(); if (s && !e.surfaces.some(function (x) { return x.s === s; })) e.surfaces.push({ s: s, from: why }); }
    var st = src.statuses || {}, stT = src.statusTimes || {};
    Object.keys(st).forEach(function (k) {
      var e = entry(k); if (!e) return;
      e.status = str(st[k]); e.sources.push("status");
      e.added = minPos(e.added, ms(stT[k])); e.lastSeen = Math.max(e.lastSeen, ms(stT[k]));
    });
    var sc = src.schedule || {};
    Object.keys(sc).forEach(function (k) {
      var e = entry(k); if (!e) return;
      e.srs = sc[k]; if (e.sources.indexOf("srs") < 0) e.sources.push("srs");
    });
    (src.notes || []).forEach(function (n) {
      var e = entry(n && n.key); if (!e) return;
      e.note = n; e.sources.push("note");
      addSurface(e, n.niqqud || n.word, "note");
      e.added = minPos(e.added, ms(n.created)); e.lastSeen = Math.max(e.lastSeen, ms(n.lastOcc), ms(n.created));
    });
    (src.logAgg || []).forEach(function (l) {
      var e = entry(l && l.key); if (!e) return;
      e.log = l; e.sources.push("log");
      addSurface(e, l.surface, "log");
      e.added = minPos(e.added, ms(l.first)); e.lastSeen = Math.max(e.lastSeen, ms(l.last));
    });
    (src.contexts || []).forEach(function (c) {
      var e = entry(c && c.key); if (!e) return;
      e.ctx = c; e.sources.push("context");
      addSurface(e, c.surface, "context");
    });
    (src.marks || []).forEach(function (m) {
      var e = map.get(str(m && m.key).trim()); if (!e) return;   // a mark never creates an entry on its own
      addSurface(e, m.surface, "mark");
      if (m.textKey && m.order != null) e.mark = { textKey: m.textKey, order: Number(m.order), surface: str(m.surface) };
    });
    map.forEach(function (e) { addSurface(e, keySurface(e.key), "key"); });
    return map;
  }

  // FSRS retrievability R(t) = (1 + t / (9·S))^-1 (FSRS-4.5+/6 power curve, S in days).
  function memory(e, now) {
    now = now || Date.now();
    var s = e && e.srs;
    if (!s || !(s.due > 0)) return { state: e && e.status === "ignore" ? "ignored" : "unscheduled", dueIn: null, strength: null, lapses: 0, reps: 0 };
    var stab = Number(s.stability), last = Number(s.reviewedAt) || 0, strength = null;
    if (stab > 0 && last > 0) strength = Math.pow(1 + Math.max(0, now - last) / DAY / (9 * stab), -1);
    var dueIn = (s.due - now) / DAY;
    var state = dueIn <= -1 ? "overdue" : dueIn <= 0 ? "due" : "scheduled";
    return { state: state, dueIn: dueIn, strength: strength, lapses: Number(s.lapses) || 0, reps: Number(s.reps) || 0 };
  }

  function meaningOf(e) {
    var n = e.note || {}, r = e.reading || {};
    if (n.userMeaning) return { text: n.userMeaning, from: "user" };
    if (r.meaning) return { text: r.meaning, from: r.label === "exact" ? "dictionary" : r.label === "dicta" ? "text" : "likely" };
    if (n.meaning) return { text: n.meaning, from: "note" };
    return { text: "", from: "" };
  }
  function displayOf(e) {
    var r = e.reading || {}, n = e.note || {};
    return { he: r.niqqud || n.niqqud || (e.surfaces[0] && e.surfaces[0].s) || "", lemma: r.lemma || n.word || "",
      pos: r.pos || n.pos || "", binyan: r.binyan || n.binyan || "", root: r.root || n.root || "" };
  }
  function occurrences(e) {
    var a = (e.note && Number(e.note.occ)) || 0, b = (e.ctx && Number(e.ctx.occ)) || 0, m = (e.met && Number(e.met.occ)) || 0;
    return Math.max(a + b, m);
  }

  // the status a list shows: in the text lens — the word's LIVE status as painted in the text ('none' = not marked);
  // elsewhere — the dictionary status («новое» is the default of a word of mine)
  function statusOf(e, scope) {
    if (scope === "text") return e.textStatus || "none";
    return e.status || (e.metOnly ? "" : "new");
  }
  // Д5.3 «Частота»: the number the list row shows — in the text lens the occurrences in the text (or the set of texts),
  // elsewhere «встреч: N» (recorded places; the full count of my texts in «все встреченные»). Bands = the Room's «Мои слова».
  var FREQ_BANDS = ["4plus", "2to3", "rare", "zero"];
  function freqCount(e, scope) { return scope === "text" ? ((e.inText && Number(e.inText.freq)) || 0) : occurrences(e); }
  function freqBandOf(n) { return n >= 4 ? "4plus" : n >= 2 ? "2to3" : n === 1 ? "rare" : "zero"; }

  // Д5.1 a set of texts = a collection / a topic of my Mediatheque: the ordered member keys (MediathequeCore.refKey form:
  // 'my/<textKey>' | 'public/<slug>/<workId>/<hash>'). A topic = its items, its sub-topics' items and the items of the
  // collections inside (the rule of the Mediatheque's own topic filter).
  function mediathequeMembers(d, kind, id) {
    if (!d || !id) return [];
    var cats = Array.isArray(d.categories) ? d.categories : [], cols = Array.isArray(d.collections) ? d.collections : [];
    var out = [], seen = {};
    var push = function (xs) { (xs || []).forEach(function (k) { if (typeof k === "string" && !seen[k]) { seen[k] = 1; out.push(k); } }); };
    if (kind === "col") { cols.forEach(function (c) { if (c && c.id === id) push(c.items); }); return out; }
    if (kind !== "cat" || !cats.some(function (c) { return c && c.id === id; })) return [];
    var children = {};
    cats.forEach(function (c) { if (!c) return; var p = c.parentId == null ? "" : c.parentId; (children[p] = children[p] || []).push(c.id); });
    var queue = [id], found = {};
    for (var i = 0; i < queue.length; i++) { var x = queue[i]; if (found[x]) continue; found[x] = 1; queue.push.apply(queue, children[x] || []); }
    queue.forEach(function (cid) {
      cats.forEach(function (c) { if (c && c.id === cid) push(c.items); });
      cols.forEach(function (c) { if (c && c.categoryId === cid) push(c.items); });
    });
    return out;
  }
  // 'my/<textKey>' → { kind:'personal', textKey }; 'public/<slug>/<workId>/<hash>' → { kind:'public', slug, workId }
  function parseRefKey(k) {
    var s = str(k), dec = function (x) { try { return decodeURIComponent(x); } catch (_) { return x; } };
    if (s.indexOf("my/") === 0) return { kind: "personal", textKey: dec(s.slice(3)) };
    var m = /^public\/([^/]+)\/([^/]+)\/[^/]+$/.exec(s);
    return m ? { kind: "public", slug: m[1], workId: dec(m[2]) } : null;
  }

  // filters = { q, statuses:[], memory:'due'|'overdue'|'hard'|'never'|'', pos:[], binyan:[], root:'', hasMine:bool,
  //             hasAi:bool, addedDays:n, freq:[band], scope:'mine'|'met'|'text', hideNames:bool }
  function matches(e, f, now) {
    f = f || {};
    if (f.scope === "text") { if (!e.inText) return false; if (f.hideNames && e.inText.nameSuspect) return false; }
    else if (f.scope !== "met" && e.metOnly) return false;
    var d = displayOf(e);
    if (f.statuses && f.statuses.length && f.statuses.indexOf(statusOf(e, f.scope)) < 0) return false;
    if (f.memory) {
      var m = memory(e, now);
      if (f.memory === "due" && !(m.state === "due" || m.state === "overdue")) return false;
      if (f.memory === "overdue" && m.state !== "overdue") return false;
      if (f.memory === "hard" && !(m.lapses >= 3)) return false;
      if (f.memory === "never" && m.reps > 0) return false;
    }
    if (f.keys && f.keys.length && f.keys.indexOf(e.key) < 0) return false;
    // where the word was met (my texts / Ben-Yehuda / public / group): any of its places in a chosen class
    if (f.sources && f.sources.length && !(e.srcClasses && f.sources.some(function (c) { return e.srcClasses.has(c); }))) return false;   // a chosen set (the text's glossary)
    if (f.pos && f.pos.length && f.pos.indexOf(d.pos || "?") < 0) return false;
    if (f.binyan && f.binyan.length && f.binyan.indexOf(d.binyan || "?") < 0) return false;
    if (f.root && normHe(d.root) !== normHe(f.root)) return false;
    if (f.hasMine && !(e.note && e.note.userMeaning)) return false;
    if (f.hasAi && !(e.aiCount > 0)) return false;
    if (f.freq && f.freq.length && f.freq.indexOf(freqBandOf(freqCount(e, f.scope))) < 0) return false;
    if (f.addedDays && !(e.added && e.added >= (now || Date.now()) - f.addedDays * DAY)) return false;
    if (f.q) {
      var q = str(f.q).trim();
      if (/[֐-׿]/.test(q)) {
        var nq = normHe(q);
        // any form of the word's table finds it (שמעתי → לשמוע), plus every form met in a text.
        // Normalised once per reading (a keystroke over 1000 entries must not re-normalise every table).
        if (e._hayFor !== e.reading || e._hayN !== e.surfaces.length) {
          e._hay = [d.he, d.lemma, d.root].concat(e.surfaces.map(function (x) { return x.s; }), e.forms || []).map(normHe).filter(Boolean);
          e._hayFor = e.reading; e._hayN = e.surfaces.length;
        }
        var hay = e._hay;
        if (!hay.some(function (h) { return h.indexOf(nq) >= 0; })) return false;
      } else {
        var rq = normRu(q);
        var mean = normRu(meaningOf(e).text + " " + ((e.note && e.note.meaning) || "") + " " + ((e.reading && e.reading.meaning) || ""));
        if (mean.indexOf(rq) < 0) return false;
      }
    }
    return true;
  }

  var SORTS = ["alpha", "added", "due", "weak", "freq", "seen", "root", "textOrder", "textFreq"];
  function sortEntries(list, by, now) {
    now = now || Date.now();
    var alphaKey = function (e) { return normHe(displayOf(e).lemma || displayOf(e).he); };
    var cmpAlpha = function (a, b) { var x = alphaKey(a), y = alphaKey(b); return x < y ? -1 : x > y ? 1 : 0; };
    var cmp = {
      alpha: cmpAlpha,
      added: function (a, b) { return (b.added || 0) - (a.added || 0) || cmpAlpha(a, b); },
      due: function (a, b) {
        var da = a.srs && a.srs.due > 0 ? a.srs.due : Infinity, db = b.srs && b.srs.due > 0 ? b.srs.due : Infinity;
        return da === db ? cmpAlpha(a, b) : da - db;
      },
      weak: function (a, b) {
        var ma = memory(a, now), mb = memory(b, now);
        var sa = ma.strength == null ? 2 : ma.strength, sb = mb.strength == null ? 2 : mb.strength;
        return sa - sb || mb.lapses - ma.lapses || cmpAlpha(a, b);
      },
      freq: function (a, b) { return occurrences(b) - occurrences(a) || cmpAlpha(a, b); },
      seen: function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0) || cmpAlpha(a, b); },
      // the text lens: order of first appearance / frequency in THIS text
      textOrder: function (a, b) { return ((a.inText && a.inText.first) || 0) - ((b.inText && b.inText.first) || 0); },
      textFreq: function (a, b) { return ((b.inText && b.inText.freq) || 0) - ((a.inText && a.inText.freq) || 0) || ((a.inText && a.inText.first) || 0) - ((b.inText && b.inText.first) || 0); },
      root: function (a, b) {
        var ra = normHe(displayOf(a).root) || "￿", rb = normHe(displayOf(b).root) || "￿";
        return ra < rb ? -1 : ra > rb ? 1 : cmpAlpha(a, b);
      },
    }[SORTS.indexOf(by) >= 0 ? by : "added"];
    return list.slice().sort(cmp);
  }

  // counts per status for the header chips (scope-aware: the text lens counts every lemma of the text by its live status)
  function statusCounts(list, scope) {
    var out = { total: 0, none: 0 };
    STATUSES.forEach(function (s) { out[s] = 0; });
    list.forEach(function (e) {
      if (scope === "text") { if (!e.inText) return; } else if (e.metOnly) return;
      out.total++; var s = statusOf(e, scope); if (out[s] != null) out[s]++;
    });
    return out;
  }

  return { STATUSES: STATUSES, LEVEL: LEVEL, SORTS: SORTS, keySurface: keySurface, normHe: normHe, normRu: normRu,
    mergeSources: mergeSources, memory: memory, meaningOf: meaningOf, displayOf: displayOf, occurrences: occurrences,
    matches: matches, sortEntries: sortEntries, statusCounts: statusCounts, statusOf: statusOf,
    FREQ_BANDS: FREQ_BANDS, freqCount: freqCount, freqBandOf: freqBandOf, mediathequeMembers: mediathequeMembers, parseRefKey: parseRefKey };
});
