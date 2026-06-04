// pealim-function-links.js — tiny lazy loader for the function-word → Pealim dict
// page map (built offline by scripts/premium/build-function-links.js). Lets the word
// card deep-link an uninflected function word (adverb/pronoun/…) straight to ITS
// Pealim entry instead of a search. The file is small (~11 KB) so it's safe to keep
// resident. Fully optional: any failure leaves the existing search fallback intact.
(function () {
  "use strict";
  var URL = "/data/inflection/pealim-function-links.v1.json";
  var NIQQUD_RE = /[֑-ׇ]/g;
  function sp(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim(); }

  var _map = null;       // plain word → { id, pos }
  var _forms = null;     // pealim_id → { he, tr, pos } — invariant single-form profile
  var _loading = null;

  function ensureReady() {
    if (_map) return Promise.resolve(_map);
    if (_loading) return _loading;
    _loading = fetch(URL, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { _map = (d && d.links) ? d.links : {}; _forms = (d && d.forms) ? d.forms : {}; return _map; })
      .catch(function () { _map = {}; _forms = {}; return _map; });
    return _loading;
  }

  // The invariant single-form profile for a Pealim id (vocalized form + stressed
  // translit + POS), so the card renders the premium profile for a function word
  // without reloading the heavy dict. Returns null until ensureReady has resolved.
  function getForm(id) {
    if (!_forms || id == null) return null;
    return _forms[String(id)] || null;
  }

  // Synchronous lookup (returns null until ensureReady has resolved). Prefer an
  // entry whose POS matches the requested one; else any. Tries the surface word, the
  // Dicta stem, and the lemma (all niqqud-stripped).
  function lookup(word, pos, extra) {
    if (!_map) return null;
    var keys = [sp(word), sp(extra && extra.stem), sp(extra && extra.lemma)];
    var fallback = null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i]; if (!k) continue;
      var e = _map[k]; if (!e) continue;
      if (!pos || !e.pos || e.pos === pos) return e;     // POS-matched (or unknown) → best
      if (!fallback) fallback = e;
    }
    return fallback;                                      // POS-mismatched same-spelling entry, last resort
  }

  window.PealimFunctionLinks = { ensureReady: ensureReady, lookup: lookup, getForm: getForm, isReady: function () { return !!_map; } };
})();
