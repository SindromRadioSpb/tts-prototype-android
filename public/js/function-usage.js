// function-usage.js — tiny lazy loader for the curated function-word USAGE store
// (Epic-3b; built/owned editorially in public/data/usage/function-usage.v1.json).
// Lets the reader-morph tap card show a premium «Употребление» section (role,
// government, suffix series, collocations, pitfalls, register, examples) for a
// confidently-resolved function word. Small (~40 KB) so it's safe to keep resident.
// Fully optional: any fetch failure leaves the card unchanged (the section self-hides).
(function () {
  "use strict";
  // ?rev busts the sidecar cache when content changes within a schema version
  // (mirrors CORPUS_*_DATA_REV — keep offline-available yet fresh on a content edit).
  var URL = "/data/usage/function-usage.v1.json?rev=4";
  var NIQQUD_RE = /[֑-ׇ]/g;
  function sp(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim(); }

  var _map = null;        // niqqud-stripped lemma → usage entry
  var _byPealimId = null; // verified Pealim sense id → one curated usage entry
  var _loading = null;

  function indexByPealimId(map) {
    var out = {};
    Object.keys(map || {}).sort().forEach(function (key) {
      var entry = map[key] || {};
      var id = entry.pealim_id == null ? "" : String(entry.pealim_id).trim();
      if (!id) return;
      // A duplicated id would make the editorial identity ambiguous. Fail closed
      // instead of letting object iteration order choose a meaning.
      out[id] = Object.prototype.hasOwnProperty.call(out, id) ? null : entry;
    });
    return out;
  }

  function ensureReady() {
    if (_map) return Promise.resolve(_map);
    if (_loading) return _loading;
    _loading = fetch(URL, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { _map = (d && d.usage) ? d.usage : {}; _byPealimId = indexByPealimId(_map); return _map; })
      .catch(function () { _map = {}; _byPealimId = {}; return _map; });
    return _loading;
  }

  // Synchronous lookup (null until ensureReady resolves). Tries the surface word, the
  // resolver stem, and the lemma — all niqqud-stripped, like PealimFunctionLinks.
  function lookup(word, extra) {
    if (!_map) return null;
    var keys = [sp(word), sp(extra && extra.stem), sp(extra && extra.lemma)];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i]; if (!k) continue;
      var e = _map[k]; if (e) return e;
    }
    return null;
  }

  // Exact sense lookup for consumers that already hold a Pealim id. This is
  // intentionally stricter than the surface lookup: it lets a curated function-
  // word identity correct bad POS metadata in the old offline paradigm without
  // weakening homograph guards for any other id.
  function lookupByPealimId(id) {
    if (!_byPealimId || id == null) return null;
    return _byPealimId[String(id)] || null;
  }

  window.FunctionUsage = { ensureReady: ensureReady, lookup: lookup, lookupByPealimId: lookupByPealimId, isReady: function () { return !!_map; } };
})();
