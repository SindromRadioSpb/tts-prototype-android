// Pointings no Hebrew word can have (O-033 tail, 2026-09-28). The subtitle vocalizer sometimes
// writes them (תְּנְגֵּב, בְּקְרָאטָה, לְסִּיבּוּב, אַפְרְסְקִים). The rules only say "look again": a
// loanword may legitimately open with two shevas (שְׁטְרוּדֶל) or carry three in a row
// (טִלְגְּרְפוּ). Measured on 209,476 reviewed Pealim forms: the doubling rule never fired, the
// initial double sheva once, the triple sheva 26 times (all telegraph loans).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NiqqudPlausibility = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SHEVA = "ְ", DAGESH = "ּ";
  var BEGADKEFAT = "בגדכפת";

  function letters(word) {
    var out = [];
    Array.from(String(word || "").normalize("NFD")).forEach(function (ch) {
      if (/[א-ת]/.test(ch)) out.push({ ch: ch, marks: "" });
      else if (/[֑-ׇ]/.test(ch) && out.length) out[out.length - 1].marks += ch;
    });
    return out;
  }

  function hasSheva(l) { return l.marks.indexOf(SHEVA) >= 0; }

  // Reasons, in the order a reader would notice them.
  function wordFaults(word) {
    var L = letters(word), reasons = [];
    if (L.length >= 3 && hasSheva(L[0]) && hasSheva(L[1])) reasons.push("INITIAL_DOUBLE_SHEVA");
    for (var i = 1; i < L.length; i++) {
      var c = L[i];
      if (c.marks.indexOf(DAGESH) < 0 || !hasSheva(L[i - 1])) continue;
      // A dagesh there can only be the plosive of בגדכפת, a shuruq, or a final he's mappiq.
      if (BEGADKEFAT.indexOf(c.ch) >= 0 || c.ch === "ו" || (c.ch === "ה" && i === L.length - 1)) continue;
      reasons.push("DAGESH_AFTER_SHEVA");
      break;
    }
    // A final letter's sheva is silent spelling (עַצְמְךְ, אַתְּ) and does not count.
    for (var j = 0, run = 0; j < L.length - 1; j++) {
      run = hasSheva(L[j]) ? run + 1 : 0;
      if (run === 3) { reasons.push("TRIPLE_SHEVA"); break; }
    }
    return reasons;
  }

  // Word positions follow the whitespace split the vocalizer projects onto, so index k names the
  // same word in the source, the local model's pointing and a second opinion.
  function words(text) {
    return String(text || "").split(/(\s+)/).filter(function (part) { return part && !/^\s+$/.test(part); });
  }

  function scan(text) {
    var found = [];
    words(text).forEach(function (word, index) {
      if (!/[ְ-ׇ]/.test(word)) return;
      var reasons = wordFaults(word);
      if (reasons.length) found.push({ index: index, word: word.normalize("NFC"), reasons: reasons });
    });
    return found;
  }

  // rows → [{ rowIndex, words: scan(he_niqqud) }] for rows with at least one suspect word.
  function scanRows(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row, rowIndex) {
      var found = scan(row && row.he_niqqud);
      if (found.length) out.push({ rowIndex: rowIndex, words: found });
    });
    return out;
  }

  return { VERSION: "niqqud-plausibility-v1", wordFaults: wordFaults, scan: scan, scanRows: scanRows, words: words };
});
