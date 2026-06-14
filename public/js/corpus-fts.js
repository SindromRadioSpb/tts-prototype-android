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

  // decodePostings(flat) → [{w, c}] from the flat [w0,c0,dw1,c1,...] encoding (w delta-encoded).
  function decodePostings(flat) {
    var out = [], w = 0;
    if (!flat) return out;
    for (var i = 0; i + 1 < flat.length; i += 2) { w += flat[i]; out.push({ w: w, c: flat[i + 1] }); }
    return out;
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
        var e = ex[i]; seen.add(e.w);
        var rec = perWork.get(e.w) || { score: 0, exact: 0, lemma: 0, terms: new Set() };
        rec.score += e.c * EXACT_BOOST; rec.exact += e.c; rec.terms.add(ti); perWork.set(e.w, rec);
      }
      var lm = (lookups.lemma && lookups.lemma[tok]) || [];
      for (var j = 0; j < lm.length; j++) {
        var l = lm[j]; if (seen.has(l.w)) continue;     // already counted as exact for this term
        var r2 = perWork.get(l.w) || { score: 0, exact: 0, lemma: 0, terms: new Set() };
        r2.score += l.c; r2.lemma += l.c; r2.terms.add(ti); perWork.set(l.w, r2);
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

  function _decodeIndex(obj) { var out = {}; for (var k in obj) if (obj.hasOwnProperty(k)) out[k] = decodePostings(obj[k]); return out; }

  function ensureBucket(letter) {
    if (_bucketCache.has(letter)) return Promise.resolve(_bucketCache.get(letter));
    return ensureManifest().then(function (m) {
      if (!m.buckets || m.buckets.indexOf(letter) === -1) { _bucketCache.set(letter, {}); return {}; }
      return _fetchJson('fts/ex-' + letter + '-v' + _cfg.version + '.json').then(function (raw) {
        var dec = _decodeIndex(raw); _bucketCache.set(letter, dec); return dec;
      }).catch(function () { _bucketCache.set(letter, {}); return {}; });
    });
  }

  function ensureLemma() {
    if (_lemma) return Promise.resolve({ lemma: _lemma, map: _lemmaMap });
    if (_lemmaLoading) return _lemmaLoading;
    _lemmaLoading = ensureManifest().then(function (m) {
      return Promise.all([
        m.lemma_file ? _fetchJson(m.lemma_file) : Promise.resolve({}),
        m.lemmamap_file ? _fetchJson(m.lemmamap_file) : Promise.resolve({}),
      ]).then(function (r) { _lemma = _decodeIndex(r[0]); _lemmaMap = r[1] || {}; return { lemma: _lemma, map: _lemmaMap }; });
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

  function _resetForTest() { _manifest = null; _bucketCache = new Map(); _lemma = null; _lemmaMap = null; }

  var API = {
    normalizeToken: normalizeToken, tokenizeText: tokenizeText, bucketOf: bucketOf,
    decodePostings: decodePostings, scoreHits: scoreHits,
    FINALS: FINALS,
    configure: configure, search: search, ensureManifest: ensureManifest, _resetForTest: _resetForTest,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.CorpusFTS = API;
})();
