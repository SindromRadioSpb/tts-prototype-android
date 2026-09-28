// What the Studio table shows in the transliteration column for the selected profile (O-033, 2026-09-28).
//
// A row stores one Latin transliteration (`translit`, built with the profile chosen at build time)
// and optionally `translit_ru`. Since the Gemini path started computing only the chosen profile,
// switching the profile re-rendered the same stored text under a new header: learner Latin shown
// as "SBL", nothing at all for "Russian phonetics". Transliteration is a deterministic function of
// the pointed text, so the column is derived from `he_niqqud` for the selected profile, locally and
// for free. A cell the person edited by hand is theirs and is shown as stored.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TranslitDisplay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PROFILES = ["learner-latin", "sbl", "ru-phonetic"];
  var CACHE_LIMIT = 20000;

  function editedFields(row) {
    var meta = row && row.edit_meta_json;
    if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch (_) { meta = null; } }
    return (meta && meta.edited && typeof meta.edited === "object") ? meta.edited : {};
  }

  function createDisplay(transliterate) {
    var cache = new Map();
    function derive(niqqud, profile) {
      var key = profile + "\u0001" + niqqud;
      if (cache.has(key)) return cache.get(key);
      var value = "";
      try { value = String(transliterate(niqqud, profile) || ""); } catch (_) { value = ""; }
      if (cache.size >= CACHE_LIMIT) cache.clear();
      cache.set(key, value);
      return value;
    }
    return function display(row, profile) {
      var chosen = PROFILES.indexOf(profile) >= 0 ? profile : "learner-latin";
      var ru = chosen === "ru-phonetic";
      var stored = ru ? String(row && (row.translit_ru || row.translit) || "") : String(row && row.translit || "");
      var edited = editedFields(row);
      if (edited[ru ? "translit_ru" : "translit"]) return stored;
      var niqqud = String(row && row.he_niqqud || "").trim();
      if (!niqqud || typeof transliterate !== "function") return stored;
      return derive(niqqud, chosen) || stored;
    };
  }

  return { createDisplay: createDisplay, PROFILES: PROFILES };
});
