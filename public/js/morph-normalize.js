// public/js/morph-normalize.js — Hebrew word normalization (runtime).
// MUST stay byte-for-byte equivalent to scripts/morph/normalize.mjs (the
// build-time counterpart). The shared invariant is requirement #15 of
// docs/MORPHOLOGY_REQUIREMENTS_v3_2.md — same canonicalisation in build
// and runtime, otherwise lookup is non-deterministic.
//
// Loaded as a classic <script> from index.html OR imported dynamically.
// Exposes window.MorphNormalize.normalizeHebrew.

(function () {
  var NIQQUD_RE = /[֑-ׇֽֿׁׂׅׄ]/g;
  var FORMAT_RE = /[​-‏‪-‮⁦-⁩﻿]/g;
  var FINAL_MAP = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  var FINAL_RE = /[ךםןףץ]/g;

  function normalizeHebrew(input) {
    if (input == null) return '';
    var s = String(input);
    if (!s) return '';
    s = s.normalize('NFC');
    s = s.replace(NIQQUD_RE, '');
    s = s.replace(FORMAT_RE, '');
    s = s.replace(FINAL_RE, function (ch) { return FINAL_MAP[ch] || ch; });
    s = s.trim();
    return s;
  }

  window.MorphNormalize = window.MorphNormalize || {};
  window.MorphNormalize.normalizeHebrew = normalizeHebrew;
})();
