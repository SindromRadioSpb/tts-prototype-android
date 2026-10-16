// Д10 measurement (context disambiguation) — runs IN the learner's tab, read-only. Evaluate the whole file; the result
// lands on window.__ctxAudit and is offered as a download (identity-context-2026-10-16.json) via a button #__ctxDl.
// For every word whose form fits ≥ 2 Pealim entries (a «likely» reading with alternatives, or an unparsed form whose
// pointed form is a cell of several entries): (A) the sentence's stored Dicta parse — the ONE candidate whose exact part of
// speech and lemma (its citation forms) are Dicta's; (Б, one text) the word layer's in-context AI translation — the ONE
// candidate whose Russian meaning shares a word stem with it. Counts for all texts; every decision of the probe text and a
// seeded sample of A's key changes elsewhere, with the sentence, for a blind examiner.
(function () {
  "use strict";
  var PROBE = "b873a3f8-cfe3-4b56-8cd3-7a7937f9d694";   // «Путь от Осло до 7 октября», AI layer «в контексте»
  var SEED = 20261020, SAMPLE = 150;
  if (window.__ctxAudit && window.__ctxAudit.state === "run") return "already running";
  var A = window.__ctxAudit = { state: "run", started: new Date().toISOString(), texts: 0, done: 0, tokens: 0,
    amb: 0, ambWithMorph: 0, aDecides: 0, aChanges: 0, aPosOnly: 0, byKind: {}, sample: [], probe: [], errors: [] };
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = mulberry32(SEED), seen = 0;
  var nativeST = window.setTimeout, mc = new MessageChannel(), q = [];
  mc.port1.onmessage = function () { var f = q.shift(); if (f) f(); };
  window.setTimeout = function (fn, ms) { if (!ms && typeof fn === "function") { var args = Array.prototype.slice.call(arguments, 2); q.push(function () { fn.apply(null, args); }); mc.port2.postMessage(0); return 0; } return nativeST.apply(window, arguments); };
  var R = window.ReaderMorph, NA = window.NotesAutoGen;
  var strip = function (s) { return R.stripNiqqud(String(s || "")); };
  var FIN = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  var loose = function (s) { var k = strip(s).replace(/[^א-ת]/g, "").replace(/[ךםןףץ]/g, function (c) { return FIN[c]; }); return k.length > 1 ? k[0] + k.slice(1).replace(/[וי]/g, "") : k; };
  function citations(p) {
    var out = [p.lemma, p.lemma_niqqud];
    ["PERF-3ms", "INF-L", "s", "ms-a"].forEach(function (k) { if (p.cells && p.cells[k] && p.cells[k].he) out.push(p.cells[k].he); });
    return out.filter(Boolean).map(loose);
  }
  function candidates(eng, card, niqqud) {
    var pids = [];
    if (card && card.pealim_id) pids.push(String(card.pealim_id));
    (card && card.alts || []).forEach(function (a) { if (a && a.pealim_id && pids.indexOf(String(a.pealim_id)) < 0) pids.push(String(a.pealim_id)); });
    if (niqqud && /[ְ-ּ]/.test(niqqud) && eng.maps && eng.maps.formIdx) {
      NA.unitFormVariants({ pos: "", binyan: "", lemma: "", stem: "", root: null, niqqud: niqqud, sampleWord: strip(niqqud), kind: null }).forEach(function (v) {
        (eng.maps.formIdx.get(v) || []).forEach(function (x) { if (x.pealim_id && pids.indexOf(String(x.pealim_id)) < 0) pids.push(String(x.pealim_id)); });
      });
    }
    return pids;
  }
  function dictaPick(eng, pids, t) {
    if (!t || !t.posDicta) return { pick: "", posOnly: "" };
    var L = loose(t.lemma || ""), byPos = pids.filter(function (pid) { var p = eng.pidMap.get(pid); return p && p.pos === t.posDicta; });
    var both = byPos.filter(function (pid) { return L && citations(eng.pidMap.get(pid)).indexOf(L) >= 0; });
    return { pick: both.length === 1 ? both[0] : "", posOnly: byPos.length === 1 ? byPos[0] : "" };
  }
  var RU = function (s) { return String(s || "").toLowerCase().replace(/ё/g, "е").match(/[а-я]{3,}/g) || []; };
  var STOP = { "что": 1, "это": 1, "как": 1, "для": 1, "его": 1, "она": 1, "они": 1, "так": 1, "или": 1, "при": 1, "чем": 1, "без": 1 };
  function aiPick(eng, pids, gloss) {
    var g = RU(gloss).filter(function (w) { return !STOP[w]; }).map(function (w) { return w.slice(0, 5); });
    if (!g.length) return "";
    var best = "", bestN = 0, tie = false;
    pids.forEach(function (pid) {
      var m = RU((eng.pidMap.get(pid) || {}).meaning).map(function (w) { return w.slice(0, 5); });
      var n = g.filter(function (w) { return m.indexOf(w) >= 0; }).length;
      if (n > bestN) { best = pid; bestN = n; tie = false; } else if (n && n === bestN) tie = true;
    });
    return bestN && !tie ? best : "";
  }
  (async function () {
    try {
      var url = performance.getEntriesByType("resource").map(function (e) { return e.name; }).find(function (n) { return /\/db\/local-db\.js/.test(n); });
      var db = await import(url), eng = await R.ensureEngine();
      if (window.TextKeyScan) await window.TextKeyScan.ensureLexicon(db);
      var texts = await db.dbQuery("SELECT id, title FROM texts ORDER BY id", []);
      A.texts = texts.length;
      for (var ti = 0; ti < texts.length; ti++) {
        var tx = texts[ti], rows = await db.getSentences(String(tx.id)), probe = String(tx.id) === PROBE;
        var morph = new Map();
        ((await db.dbQuery("SELECT sentence_id, tokens_json FROM sentence_morph WHERE text_id = ?", [String(tx.id)])) || []).forEach(function (m) { try { morph.set(String(m.sentence_id), JSON.parse(m.tokens_json || "[]")); } catch (_) {} });
        for (var ri = 0; ri < rows.length; ri++) {
          var row = rows[ri], plain = String(row.he_plain != null ? row.he_plain : row.he || ""), vocal = String(row.he_niqqud || ""), toks, pairs;
          if (plain) { var al = R.alignSurfaceNiqqud(plain, vocal), w = 0; toks = R.tokenize(plain); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { var a = al[w++] || {}; return [a.surface || x.text, a.niqqud || ""]; }); }
          else { toks = R.tokenize(vocal); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { return [strip(x.text), x.text]; }); }
          var units = (R.joinSplitWords(toks, pairs) || []).filter(function (u) { return !u.fragment; });
          var mt = morph.get(String(row.id)) || null, di = 0;
          for (var k = 0; k < units.length; k++) {
            var un = units[k]; A.tokens++;
            // Dicta's token at this place (walk both sequences by bare letters)
            var dt = null;
            if (mt) { var ours = strip(un.surface); var j = di; while (j < mt.length && strip(mt[j].word) !== ours) j++; if (j < mt.length) { dt = mt[j]; di = j + 1; } }
            var card = await R.resolveCore(eng, un.surface, un.niqqud);
            if (!card || card.functionWord || card.label === "function" || card.label === "exact") continue;
            var pids = candidates(eng, card, un.niqqud);
            if (pids.length < 2) continue;
            var kind = card.label === "likely" ? "likely" : card.label === "dicta" ? "dicta" : "unparsed";
            A.amb++; A.byKind[kind] = (A.byKind[kind] || 0) + 1;
            var key = R.statusKeyForCard(NA, card, un.niqqud, un.surface);
            var dp = dt ? dictaPick(eng, pids, dt) : { pick: "", posOnly: "" };
            if (dt) A.ambWithMorph++;
            if (dp.pick) { A.aDecides++; if ("pid:" + dp.pick !== key) A.aChanges++; } else if (dp.posOnly) A.aPosOnly++;
            var rec = null;
            var mk = function () {
              return { text_id: String(tx.id), title: String(tx.title || "").slice(0, 60), sentence_id: String(row.id), offset: un.off, surface: un.surface, niqqud: un.niqqud,
                tokens: units.map(function (u) { return u.niqqud || u.surface; }), index: k, kind: kind, key: key,
                cands: pids.map(function (pid) { var p = eng.pidMap.get(pid) || {}; return { pid: pid, lemma: p.lemma, pos: p.pos, meaning: String(p.meaning || "").slice(0, 60) }; }),
                dicta: dt ? { lemma: dt.lemma, pos: dt.posDicta, niqqud: dt.niqqud } : null, aPick: dp.pick, aPosOnly: dp.posOnly };
            };
            if (probe) {
              rec = mk();
              var g = null; try { g = window.WordGlossAI ? await window.WordGlossAI.wordAtData(row, un.off) : null; } catch (_) { g = null; }
              rec.ai = g ? (g.aiGloss || g.gloss || "") : ""; rec.bPick = rec.ai ? aiPick(eng, pids, rec.ai) : "";
              A.probe.push(rec);
            } else if (dp.pick && "pid:" + dp.pick !== key) {
              seen++;
              if (A.sample.length < SAMPLE) A.sample.push(mk()); else { var jj = Math.floor(rnd() * seen); if (jj < SAMPLE) A.sample[jj] = mk(); }
            }
          }
        }
        A.done++;
      }
      A.state = "done";
    } catch (e) { A.state = "error"; A.errors.push(String(e && e.stack || e)); }
    finally {
      window.setTimeout = nativeST; A.finished = new Date().toISOString();
      try {
        var a = document.createElement("a"); a.id = "__ctxDl"; a.download = "identity-context-2026-10-16.json"; a.textContent = "ctx";
        a.href = URL.createObjectURL(new Blob([JSON.stringify(A)], { type: "application/json" }));
        a.style.cssText = "position:fixed;top:0;left:0;z-index:99999;padding:8px;background:#fff"; document.body.appendChild(a);
      } catch (_) {}
    }
  })();
  return "started";
})();
