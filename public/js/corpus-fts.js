// corpus-fts.js — BRR-P2-001 full-text search ("поиск внутри текстов") for the Reading Room.
//
// A custom Hebrew-morphology-aware INVERTED INDEX queried in pure JS (FTS5 is not
// compiled into our wa-sqlite; off-the-shelf JS engines load the whole index into RAM,
// which 26K works cannot afford). Sefaria's proven DUAL-FIELD shape:
//   • exact  — the consonantal skeleton (niqqud stripped, finals folded): literal matches.
//   • lemma  — the Pealim pid (via the same offline dict the i+1 engine uses): collapses
//              inflections/proclitics, the Dicta-class recall lever.
// Both fields are normalised by the SAME functions at index time (build-corpus-fts.js
// require()s this module) and at query time — byte-parity is the whole game (gate
// smoke:corpus-fts-parity). The index is sharded by the skeleton's first Hebrew letter
// and lazy-loaded (a query touches 1-2 shards), so mobile never downloads everything.
//
// UMD dual-export: window.CorpusFTS (browser) + module.exports (Node build + gates).
(function () {
  'use strict';

  var NIQQUD_RE = /[֑-ׇ]/g;                 // same range as corpusNrm / build-corpus-vocab
  var HEB_LETTER = /[א-ת]/;
  // final → medial fold (only inside the normalised key, never in display)
  var FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  // token splitter: anything that is not a Hebrew letter or niqqud mark breaks a token
  var SPLIT_RE = /[^א-ת֑-ׇ]+/;

  function stripNiqqud(s) { return String(s == null ? '' : s).replace(NIQQUD_RE, ''); }
  function foldFinals(s) { var o = ''; for (var i = 0; i < s.length; i++) { var c = s[i]; o += (FINALS[c] || c); } return o; }

  // normalizeToken(raw) → the EXACT-field skeleton (consonantal, finals folded, lowercased).
  // '' when the token carries no Hebrew letter. IDENTICAL at index + query time.
  function normalizeToken(raw) {
    var c = stripNiqqud(raw).trim();
    if (!c || !HEB_LETTER.test(c)) return '';
    return foldFinals(c).toLowerCase();
  }

  // tokenizeText(text) → raw Hebrew tokens (niqqud preserved so the lemma resolver can use it).
  function tokenizeText(text) {
    var out = [];
    var parts = String(text == null ? '' : text).split(SPLIT_RE);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p && HEB_LETTER.test(stripNiqqud(p))) out.push(p);
    }
    return out;
  }

  // bucketOf(skeleton) → the shard key = first Hebrew letter of the skeleton.
  function bucketOf(skeleton) {
    for (var i = 0; i < skeleton.length; i++) { if (HEB_LETTER.test(skeleton[i])) return skeleton[i]; }
    return '';
  }

  // decodePositions(flat) → [{w, pos:[offsets]}] from the POSITIONAL encoding (BRR-P2-006,
  // schema 2): per work `[w, n, off0, dΔ1, dΔ2, …]` — w delta-encoded across works, n = #offsets,
  // offsets delta-encoded WITHIN the work (first delta absolute). The offset = a word's 0-based
  // index in the body token-stream; consecutive body words have consecutive offsets, which is what
  // makes phrase (adjacency) matching possible. count (tf) is subsumed = pos.length.
  function decodePositions(flat) {
    var out = [], w = 0, i = 0;
    if (!flat) return out;
    while (i + 1 < flat.length) {
      w += flat[i++]; var n = flat[i++];
      var pos = [], o = 0;
      for (var k = 0; k < n && i < flat.length; k++) { o += flat[i++]; pos.push(o); }
      out.push({ w: w, pos: pos });
    }
    return out;
  }

  // decodePostings(flat) → [{w, c}] from the COUNT encoding `[w0,c0,dw1,c1,…]` (w delta-encoded).
  // The lemma field is count-only (small + always-loaded); the exact field is positional (above).
  function decodePostings(flat) {
    var out = [], w = 0;
    if (!flat) return out;
    for (var i = 0; i + 1 < flat.length; i += 2) { w += flat[i]; out.push({ w: w, c: flat[i + 1] }); }
    return out;
  }

  // _mergePos(map, list) — merge a posting list [{w,pos}] into Map(w → sorted-unique offsets).
  // A body word lives in exactly ONE field (lemma pid if it has one, else exact skeleton), but the
  // SAME query skeleton can resolve via BOTH (a name in one work, content in another) — so the
  // phrase engine unions positions across fields before checking adjacency.
  function _mergePos(map, list) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], cur = map.get(e.w);
      if (!cur) { map.set(e.w, e.pos.slice()); continue; }
      var merged = cur.concat(e.pos).sort(function (a, b) { return a - b; });
      var dedup = []; for (var j = 0; j < merged.length; j++) if (j === 0 || merged[j] !== merged[j - 1]) dedup.push(merged[j]);
      map.set(e.w, dedup);
    }
  }

  // phraseHit(posLists, slop) → { hit, start } — pure adjacency check (gate-tested). posLists is one
  // ascending-sorted offset array per query token IN ORDER. A phrase matches when there exist offsets
  // o0<o1<…<o(k-1), one per token, with every gap (o_i − o_{i-1}) in [1, 1+slop]. slop=0 ⇒ strictly
  // consecutive words. `start` = the smallest matching o0 (for deterministic drill-in).
  function phraseHit(posLists, slop) {
    slop = slop || 0;
    if (!posLists || !posLists.length) return { hit: false, start: -1 };
    for (var t = 0; t < posLists.length; t++) { if (!posLists[t] || !posLists[t].length) return { hit: false, start: -1 }; }
    // reach = chains alive at token ti: {end: last offset used, start: the chain's first offset}
    var reach = []; for (var s = 0; s < posLists[0].length; s++) reach.push({ end: posLists[0][s], start: posLists[0][s] });
    for (var ti = 1; ti < posLists.length; ti++) {
      var list = posLists[ti], next = [];
      for (var ri = 0; ri < reach.length; ri++) {
        var e = reach[ri].end, st = reach[ri].start;
        for (var pi = 0; pi < list.length; pi++) {
          var p = list[pi];
          if (p < e + 1) continue;
          if (p > e + 1 + slop) break;       // list ascending → no further candidate
          next.push({ end: p, start: st });
        }
      }
      if (!next.length) return { hit: false, start: -1 };
      reach = next;
    }
    var best = reach[0].start;
    for (var z = 1; z < reach.length; z++) if (reach[z].start < best) best = reach[z].start;
    return { hit: true, start: best };
  }

  // scoreHits(tokens, lookups) → ranked [{w, score, exact, lemma}] for an AND query.
  //   tokens: normalised query tokens (skeletons).
  //   lookups: { exact: skel→[{w,c}], lemma: skel→[{w,c}] } already-resolved posting lists.
  // A term is satisfied by exact OR lemma; the query ANDs across terms (every term must hit
  // the work). Score = Σ tf, with exact matches weighted above lemma-only (exactBoost).
  function scoreHits(tokens, lookups) {
    var EXACT_BOOST = 3;
    if (!tokens.length) return [];
    var perWork = new Map();          // w → { score, exact, lemma, termHits:Set }
    tokens.forEach(function (tok, ti) {
      var seen = new Set();
      var ex = (lookups.exact && lookups.exact[tok]) || [];
      for (var i = 0; i < ex.length; i++) {
        var e = ex[i], ec = (e.pos ? e.pos.length : e.c) || 0; seen.add(e.w);
        var rec = perWork.get(e.w) || { score: 0, exact: 0, lemma: 0, terms: new Set() };
        rec.score += ec * EXACT_BOOST; rec.exact += ec; rec.terms.add(ti); perWork.set(e.w, rec);
      }
      var lm = (lookups.lemma && lookups.lemma[tok]) || [];
      for (var j = 0; j < lm.length; j++) {
        var l = lm[j]; if (seen.has(l.w)) continue;     // already counted as exact for this term
        var lc = (l.pos ? l.pos.length : l.c) || 0;
        var r2 = perWork.get(l.w) || { score: 0, exact: 0, lemma: 0, terms: new Set() };
        r2.score += lc; r2.lemma += lc; r2.terms.add(ti); perWork.set(l.w, r2);
      }
    });
    var out = [];
    perWork.forEach(function (rec, w) {
      if (rec.terms.size !== tokens.length) return;     // AND: every term must hit this work
      out.push({ w: w, score: rec.score, exact: rec.exact, lemma: rec.lemma });
    });
    out.sort(function (a, b) { return b.score - a.score || a.w - b.w; });
    return out;
  }

  // ── client lazy loader (browser only) ───────────────────────────────────────
  var _cfg = { version: null, dataRev: 0, base: '/data/benyehuda/' };
  var _manifest = null, _manifestLoading = null;
  var _bucketCache = new Map();     // bucket letter → { skel:[postings] } (decoded)
  var _lemma = null, _lemmaLoading = null;     // pid → [postings] (decoded)
  var _lemmaMap = null;             // skeleton → pid

  function configure(o) { if (o) { for (var k in o) if (o.hasOwnProperty(k)) _cfg[k] = o[k]; } }

  function _url(file) { return _cfg.base + file + '?v=' + _cfg.version + '.' + _cfg.dataRev; }
  function _fetchJson(file) { return fetch(_url(file), { cache: 'force-cache' }).then(function (r) { if (!r.ok) throw new Error('fts ' + r.status + ' ' + file); return r.json(); }); }

  function ensureManifest() {
    if (_manifest) return Promise.resolve(_manifest);
    if (_manifestLoading) return _manifestLoading;
    _manifestLoading = _fetchJson('corpus-fts-v' + _cfg.version + '.json').then(function (m) { _manifest = m; return m; })
      .finally(function () { _manifestLoading = null; });
    return _manifestLoading;
  }

  // exact buckets are POSITIONAL → decode to [{w,pos}]. scoreHits derives tf from pos.length; the
  // phrase engine uses pos directly. One decode per shard load, reused by both query paths.
  function _decodeIndex(obj) { var out = {}; for (var k in obj) if (obj.hasOwnProperty(k)) out[k] = decodePositions(obj[k]); return out; }

  // A letter's positional exact index is split into raw-size sub-shards (bucket_files[letter]); load
  // every sub-shard for the letter and merge. Back-compat: a manifest without bucket_files falls back
  // to the single ex-<letter> file. The merged decode is cached so a phrase reusing the letter is free.
  function ensureBucket(letter) {
    if (_bucketCache.has(letter)) return Promise.resolve(_bucketCache.get(letter));
    return ensureManifest().then(function (m) {
      var files = (m.bucket_files && m.bucket_files[letter])
        || ((m.buckets && m.buckets.indexOf(letter) !== -1) ? ['fts/ex-' + letter + '-v' + _cfg.version + '.json'] : []);
      if (!files.length) { _bucketCache.set(letter, {}); return {}; }
      return Promise.all(files.map(function (f) {
        return _fetchJson(f).then(function (raw) { return _decodeIndex(raw); }).catch(function () { return {}; });
      })).then(function (decs) {
        var merged = {};
        decs.forEach(function (d) { for (var k in d) if (d.hasOwnProperty(k)) merged[k] = d[k]; });
        _bucketCache.set(letter, merged); return merged;
      });
    });
  }

  function ensureLemma() {
    if (_lemma) return Promise.resolve({ lemma: _lemma, map: _lemmaMap });
    if (_lemmaLoading) return _lemmaLoading;
    _lemmaLoading = ensureManifest().then(function (m) {
      // lemma index is sharded by size (lemma_files[]); load all + merge. Back-compat: a single
      // lemma_file is still honoured. lemmamap (skeleton→pid) loads alongside.
      var lemmaList = m.lemma_files || (m.lemma_file ? [m.lemma_file] : []);
      return Promise.all([
        Promise.all(lemmaList.map(function (f) { return _fetchJson(f).catch(function () { return {}; }); })),
        m.lemmamap_file ? _fetchJson(m.lemmamap_file).catch(function () { return {}; }) : Promise.resolve({}),
      ]).then(function (r) {
        _lemma = {};
        r[0].forEach(function (obj) { for (var k in obj) if (obj.hasOwnProperty(k)) _lemma[k] = decodePostings(obj[k]); });
        _lemmaMap = r[1] || {};
        return { lemma: _lemma, map: _lemmaMap };
      });
    }).finally(function () { _lemmaLoading = null; });
    return _lemmaLoading;
  }

  // search(query) → Promise<[{w, score, exact, lemma}]> (w = ordinal into the works/search array).
  function search(query) {
    var raw = tokenizeText(query);
    var toks = []; for (var i = 0; i < raw.length; i++) { var s = normalizeToken(raw[i]); if (s) toks.push(s); }
    // de-dupe query terms (repeating a word should not require it twice)
    toks = toks.filter(function (t, i) { return toks.indexOf(t) === i; });
    if (!toks.length) return Promise.resolve([]);
    var buckets = {}; toks.forEach(function (t) { buckets[bucketOf(t)] = 1; });
    var jobs = [ensureLemma()];
    Object.keys(buckets).forEach(function (b) { if (b) jobs.push(ensureBucket(b)); });
    return Promise.all(jobs).then(function (res) {
      var lem = res[0];
      var exact = {}, lemma = {};
      toks.forEach(function (t) {
        var b = bucketOf(t);
        var shard = _bucketCache.get(b) || {};
        if (shard[t]) exact[t] = shard[t];
        var pid = lem.map[t];
        if (pid != null && lem.lemma[pid]) lemma[t] = lem.lemma[pid];
      });
      return scoreHits(toks, { exact: exact, lemma: lemma });
    });
  }

  // BRR-P2-005 — firstMatchRow(rows, query) → index of the FIRST reader row whose Hebrew contains
  // a query match (exact skeleton OR lemma pid via the loaded lemmamap), or -1. Uses the SAME
  // normaliser/tokeniser as the index, so the row that made the work a hit is located
  // deterministically — the search-hit opens AT that line. lemmamap is loaded after a search();
  // if absent, exact-skeleton matching still works. _setLemmaMapForTest injects it for the gate.
  function firstMatchRow(rows, query) {
    if (!rows || !rows.length) return -1;
    var qToks = tokenizeText(query).map(normalizeToken).filter(Boolean);
    if (!qToks.length) return -1;
    var qPid = {};
    if (_lemmaMap) qToks.forEach(function (t) { var p = _lemmaMap[t]; if (p != null) qPid[String(p)] = 1; });
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (!r) continue;
      var heb = r.he_niqqud || r.he || r.hebrew_niqqud || r.hebrew_plain || '';
      if (!heb) continue;
      // SUBSTRING (niqqud-stripped + finals-folded, like the corpus title-search): covers a whole
      // token, a proclitic form (בית∈בבית), AND a substring-of-word match (שחר∈שחרור) — so a
      // title-substring hit still lands on the line where the term appears.
      var rowNorm = foldFinals(stripNiqqud(heb)).toLowerCase();
      for (var k = 0; k < qToks.length; k++) { if (rowNorm.indexOf(qToks[k]) >= 0) return i; }
      // LEMMA: a row token whose pid matches the query's pid (catches truly different inflections).
      if (_lemmaMap) {
        var toks = tokenizeText(heb);
        for (var j = 0; j < toks.length; j++) {
          var s = normalizeToken(toks[j]); if (!s) continue;
          var p2 = _lemmaMap[s]; if (p2 != null && qPid[String(p2)]) return i;
        }
      }
    }
    return -1;
  }

  // _resolveQueryTokens(query) → ordered normalised skeletons (duplicates kept — order/repeats
  // matter for a phrase). Returns [] for a non-Hebrew query.
  function _resolveQueryTokens(query) {
    var raw = tokenizeText(query), toks = [];
    for (var i = 0; i < raw.length; i++) { var s = normalizeToken(raw[i]); if (s) toks.push(s); }
    return toks;
  }

  // phraseSearch(query, {slop}) → Promise<{tokens, multiToken, results:[{w,score,exact,lemma,phrase,phraseStart}]}>.
  // The superset of search(): same word-AND hit set + score, PLUS a per-work phrase flag for
  // multi-token queries (positions in the index, schema 2). Phrase hits sort FIRST. For a single
  // token (or an index without positions) phrase is false everywhere — caller renders one group.
  function phraseSearch(query, opts) {
    opts = opts || {};
    var slop = opts.slop || 0;
    var ordered = _resolveQueryTokens(query);
    if (!ordered.length) return Promise.resolve({ tokens: [], multiToken: false, results: [] });
    var distinct = ordered.filter(function (t, i) { return ordered.indexOf(t) === i; });
    var buckets = {}; distinct.forEach(function (t) { buckets[bucketOf(t)] = 1; });
    var jobs = [ensureLemma()];
    Object.keys(buckets).forEach(function (b) { if (b) jobs.push(ensureBucket(b)); });
    return Promise.all(jobs).then(function (res) {
      var lem = res[0];
      // word-AND scoring (unchanged recall): resolve each distinct token's posting lists.
      var exact = {}, lemma = {};
      distinct.forEach(function (t) {
        var shard = _bucketCache.get(bucketOf(t)) || {};
        if (shard[t]) exact[t] = shard[t];
        var pid = lem.map[t];
        if (pid != null && lem.lemma[pid]) lemma[t] = lem.lemma[pid];
      });
      var hits = scoreHits(distinct, { exact: exact, lemma: lemma });

      var multiToken = ordered.length >= 2;
      var positional = !!(_manifest && (_manifest.positions || _manifest.schema >= 2));
      if (!multiToken || !positional) {
        return { tokens: distinct, multiToken: multiToken && positional, results: hits.map(function (h) { return { w: h.w, score: h.score, exact: h.exact, lemma: h.lemma, phrase: false, phraseStart: -1 }; }) };
      }
      // positions per query POSITION (ordered, dup-aware) come from the EXACT field only: it is
      // positional + skeleton-keyed (every token), which is exactly what an «точная фраза» needs.
      // (lemma is count-only, so phrase adjacency is consonantal-exact, not inflection-collapsed —
      // the scattered «слова» group above still carries inflection-tolerant recall.)
      var posMaps = ordered.map(function (t) {
        var map = new Map();
        var shard = _bucketCache.get(bucketOf(t));
        _mergePos(map, shard && shard[t]);
        return map;
      });
      var results = hits.map(function (h) {
        var posLists = posMaps.map(function (m) { return m.get(h.w) || []; });
        var ph = phraseHit(posLists, slop);
        return { w: h.w, score: h.score, exact: h.exact, lemma: h.lemma, phrase: ph.hit, phraseStart: ph.start };
      });
      results.sort(function (a, b) { return (b.phrase - a.phrase) || (b.score - a.score) || (a.w - b.w); });
      return { tokens: distinct, multiToken: true, results: results };
    });
  }

  // firstPhraseRow(rows, query, {slop}) → index of the first reader row that contains the query
  // as a PHRASE (consecutive query tokens within the row, matched by skeleton OR lemma pid), or -1.
  // Precise drill-in for a phrase hit; caller falls back to firstMatchRow (any token) when -1.
  function firstPhraseRow(rows, query, opts) {
    if (!rows || !rows.length) return -1;
    var slop = (opts && opts.slop) || 0;
    var qToks = _resolveQueryTokens(query);
    if (qToks.length < 2) return -1;
    var qPid = qToks.map(function (t) { return _lemmaMap ? _lemmaMap[t] : null; });
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (!r) continue;
      var heb = r.he_niqqud || r.he || r.hebrew_niqqud || r.hebrew_plain || '';
      if (!heb) continue;
      var rowToks = tokenizeText(heb).map(normalizeToken);
      // per query position: offsets in the row whose token matches by skeleton OR shared pid
      var posLists = qToks.map(function (qt, qi) {
        var list = [];
        for (var j = 0; j < rowToks.length; j++) {
          var rt = rowToks[j]; if (!rt) continue;
          if (rt === qt) { list.push(j); continue; }
          if (_lemmaMap && qPid[qi] != null && _lemmaMap[rt] === qPid[qi]) list.push(j);
        }
        return list;
      });
      if (phraseHit(posLists, slop).hit) return i;
    }
    return -1;
  }

  function _setLemmaMapForTest(m) { _lemmaMap = m || null; }
  function _setManifestForTest(m) { _manifest = m || null; }
  function _resetForTest() { _manifest = null; _bucketCache = new Map(); _lemma = null; _lemmaMap = null; }

  var API = {
    normalizeToken: normalizeToken, tokenizeText: tokenizeText, bucketOf: bucketOf,
    decodePostings: decodePostings, decodePositions: decodePositions, phraseHit: phraseHit,
    scoreHits: scoreHits, firstMatchRow: firstMatchRow, firstPhraseRow: firstPhraseRow,
    FINALS: FINALS,
    configure: configure, search: search, phraseSearch: phraseSearch, ensureManifest: ensureManifest,
    _resetForTest: _resetForTest, _setLemmaMapForTest: _setLemmaMapForTest, _setManifestForTest: _setManifestForTest,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.CorpusFTS = API;
})();
