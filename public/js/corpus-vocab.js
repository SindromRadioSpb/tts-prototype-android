// public/js/corpus-vocab.js — BRR-P1-007 «Следующий для тебя» (i+1) · SLICE 2 client engine.
//
// Pure, DOM-free coverage engine for the per-work vocab sidecar (corpus-vocab-v<V>.json,
// produced by scripts/premium/build-corpus-vocab.js). Computes i+1 coverage CLIENT-SIDE
// against the LIVE reader profile (local-db.getKnownWordStates()) — the sidecar ships
// INGREDIENTS (lemma-id sets + token counts + reading-load aggregates), never a frozen %.
//
// TWO-CHANNEL honesty (DESIGN §4 D2 — the matched-only number alone would over-flatter
// reading ease on name/archaism-heavy works):
//   • matchedDrillCov — token-weighted coverage over the MATCHED (learnable / pid-bearing)
//     vocab. Drives the i+1 zone + the «≈87% по твоим словам» soft-estimate badge + ranking.
//   • totalCov + loadFlag — known-matched tokens over ALL tokens, and a reading-LOAD flag
//     when the proper-noun/archaic (fallback) share is high. Keeps the badge honest.
//
// JOIN: dict holds pid strings; key = "pid:"+pid is byte-identical to NotesAutoGen.lemmaKey
// and getKnownWordStates (local-db.js:2114). "known" = known+learning (a word mid-acquisition
// is comprehensible-in-context, Krashen/R2). The i+1 zone band + thresholds are CONFIG
// (recalibratable — the band is a hypothesis pending real-profile validation, DESIGN §3b/§7).
//
// Dual export: window.CorpusVocab (browser) + module.exports (Node smoke).

(function () {
  "use strict";

  var CFG = {
    ZONE_LO: 0.80, ZONE_HI: 0.95,                    // i+1 drill-coverage band (recalibratable)
    LOAD_FALLBACK_HI: 0.18, LOAD_MATCHED_LO: 0.50,   // reading-load flag thresholds
    KNOWN_STATES: { known: true, learning: true },   // "known" = known+learning (D2)
    MIN_RAIL: 3, RAIL_TOP: 12, AUTHOR_CAP: 2,        // S4 «Следующий для тебя» gating/size
  };

  // delta-encoded ascending ids → absolute ids (prefix-sum; mirror of the producer)
  function reconstructIds(delta) {
    var out = new Array(delta.length), p = 0;
    for (var i = 0; i < delta.length; i++) { p += delta[i]; out[i] = p; }
    return out;
  }

  // workEntry = { ids:[delta], tok:[counts], m, n } · dict = [pidStr...] · knownMap = { lemmaKey: state }
  // Returns the two-channel coverage object, or null on malformed input (honest empty, no throw).
  function coverageForWork(workEntry, dict, knownMap, cfg) {
    cfg = cfg || CFG;
    if (!workEntry || !Array.isArray(workEntry.ids) || !Array.isArray(workEntry.tok) || !Array.isArray(dict)) return null;
    var ids = reconstructIds(workEntry.ids), tok = workEntry.tok;
    var m = Number(workEntry.m) || 0, n = Number(workEntry.n) || 0;
    var knownTok = 0, knownDistinct = 0, frontier = [];
    for (var i = 0; i < ids.length; i++) {
      var absId = ids[i];
      if (absId < 0 || absId >= dict.length) return null;   // corrupt id-space (caught by gate; honest null)
      var pid = dict[absId], key = "pid:" + pid, c = tok[i] || 0;
      var st = knownMap ? knownMap[key] : null;
      if (st && cfg.KNOWN_STATES[st]) { knownTok += c; knownDistinct++; }
      else frontier.push({ id: absId, pid: pid, tok: c });
    }
    var matchedDrillCov = m ? knownTok / m : 0;   // token-weighted over learnable vocab (the drill question)
    var totalCov = n ? knownTok / n : 0;          // known-matched tokens / ALL tokens (reading-aware)
    var matchedShare = n ? m / n : 0;
    var fallbackShare = n ? 1 - matchedShare : 0;
    var loadFlag = (fallbackShare > cfg.LOAD_FALLBACK_HI) || (matchedShare < cfg.LOAD_MATCHED_LO);
    frontier.sort(function (a, b) { return b.tok - a.tok; });   // most-frequent unknowns first = best next words
    return {
      matchedDrillCov: matchedDrillCov, totalCov: totalCov,
      fallbackShare: fallbackShare, matchedShare: matchedShare,
      m: m, n: n, matchedDistinct: ids.length, knownDistinct: knownDistinct,
      frontierCount: frontier.length, frontier: frontier,
      loadFlag: loadFlag, zone: classifyZone(matchedDrillCov, cfg),
    };
  }

  function classifyZone(cov, cfg) {
    cfg = cfg || CFG;
    if (cov >= cfg.ZONE_HI) return "easy";   // ≥95% — outgrown, route to next challenge
    if (cov >= cfg.ZONE_LO) return "in";     // 80–95% — the i+1 sweet spot
    return "hard";                           // <80% — too many unknowns for comfortable reading
  }

  // S4 «Следующий для тебя» — PURE rail decision over scored ready works (DOM-free, unit-tested).
  // scored: [{ id, author, cov }] where cov is a coverageForWork() result. Returns
  // { kind:'next'|'challenge', ids:[…] } or null. The honest gating (DESIGN D3/R8): a single i+1
  // rail is EMPTY at both ends of the growth curve, so —
  //   • ≥MIN_RAIL works in the 80–95% zone → 'next' (the sweet spot), ranked gentlest-first
  //     (coverage desc = most comprehensible i+1 first, R8 on-ramp);
  //   • else if the reader has OUTGROWN it (≥MIN_RAIL mastered/'easy' AND <MIN_RAIL in-zone AND
  //     ≥MIN_RAIL still-'hard') → 'challenge': the hardest-but-closest-to-tractable stretch picks
  //     (coverage desc among 'hard'), honestly framed as a challenge, never as "для тебя";
  //   • else (too-new: little mastered, little in-zone) → null → cold-start «С чего начать» owns L1.
  // Author-capped (one prolific writer can't fill the rail) + hard size gate (never a thin list).
  function pickPersonalRail(scored, cfg) {
    cfg = cfg || CFG;
    var MIN = cfg.MIN_RAIL || 3, TOP = cfg.RAIL_TOP || 12, CAP = cfg.AUTHOR_CAP || 2;
    var inZone = [], easy = 0, hard = [];
    for (var i = 0; i < (scored || []).length; i++) {
      var x = scored[i], z = x && x.cov && x.cov.zone;
      if (z === "in") inZone.push(x);
      else if (z === "easy") easy++;
      else if (z === "hard") hard.push(x);
    }
    var pool, kind;
    if (inZone.length >= MIN) {
      inZone.sort(function (a, b) { return b.cov.matchedDrillCov - a.cov.matchedDrillCov; });
      pool = inZone; kind = "next";
    } else if (easy >= MIN && hard.length >= MIN) {
      hard.sort(function (a, b) { return b.cov.matchedDrillCov - a.cov.matchedDrillCov; });
      pool = hard; kind = "challenge";
    } else {
      return null;
    }
    var per = {}, ids = [];
    for (var j = 0; j < pool.length; j++) {
      var a = pool[j].author || "?";
      if ((per[a] || 0) >= CAP) continue;
      per[a] = (per[a] || 0) + 1; ids.push(pool[j].id);
      if (ids.length >= TOP) break;
    }
    if (ids.length < MIN) return null;   // hard gate — never a thin «для тебя» list
    return { kind: kind, ids: ids };
  }

  // ── thin browser loader (single-flight, lazy, NOT precached) — mirror of loadCorpusSearch ──
  var _vocab = null, _loading = null;
  function ensureVocab(opts) {
    opts = opts || {};
    if (_vocab) return Promise.resolve(_vocab);
    if (_loading) return _loading;
    var V = opts.version;
    var url = opts.url || ("/data/benyehuda/corpus-vocab-v" + V + ".json?v=" + V);
    var f = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return Promise.reject(new Error("no fetch"));
    _loading = (async function () {
      var res = await f(url, { cache: "force-cache" });
      if (!res.ok) throw new Error("corpus-vocab " + res.status);
      _vocab = await res.json();
      return _vocab;
    })();
    var done = function () { _loading = null; };
    _loading.then(done, done);
    return _loading;
  }
  function getLoaded() { return _vocab; }
  function _setForTest(s) { _vocab = s; _loading = null; }

  var API = {
    reconstructIds: reconstructIds, coverageForWork: coverageForWork, classifyZone: classifyZone,
    pickPersonalRail: pickPersonalRail,
    ensureVocab: ensureVocab, getLoaded: getLoaded, CFG: CFG, _setForTest: _setForTest,
  };
  if (typeof window !== "undefined") window.CorpusVocab = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
