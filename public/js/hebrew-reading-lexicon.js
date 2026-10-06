// Reviewed lexical vowel quality. Applied to a derived reading, never to stored niqqud.
// Qamats qatan is not decidable from unaccented spelling alone; keep evidence here,
// before profile rendering, rather than replacing fragments of Latin/Cyrillic output.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HebrewReadingLexicon = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  let DATA = {};
  try { DATA = typeof require === "function" ? require("./hebrew-reading-data.js") : {}; } catch (_) {}
  if (!Object.keys(DATA).length && typeof globalThis !== "undefined") DATA = globalThis.HebrewReadingData || {};
  const WORD_RE = /[א-ת][א-ת\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]*/g;
  // Reviewed in the physics corpus: אָפְקִי (horizontal) has qamats qatan.
  // Also cover its inflectional suffixes and pointed proclitics; require all
  // stem vowels, so an unpointed homograph cannot silently acquire a reading.
  const PREFIX = /^(?:(?:ו[ְּ]|שֶׁ|[בכל][ְִַּ]{1,2}|ה[ַָ]|מִּ))*$/u;
  function key(word) {
    return word.normalize("NFD").replace(/[\u0591-\u05af\u05bd\u05bf\u05c4\u05c5]/g, "").replace(/ׇ/g, "ָ").normalize("NFC");
  }
  function decisions(word) {
    const k = key(word);
    if (Object.prototype.hasOwnProperty.call(DATA, k)) return DATA[k];
    // Productive conjunctions retain the underlying word's lexical reading.
    const lead = k.normalize("NFD").match(/^(?:ו[ְּ]|שֶׁ)/u);
    if (!lead) return [];
    return decisions(k.normalize("NFD").slice(lead[0].length)).map(([i,v]) => [i+1,v]);
  }
  function prepare(text, profile) {
    const modern = profile === "learner-latin" || profile === "ru-phonetic";
    return String(text || "").normalize("NFD").replace(WORD_RE, function (word) {
      const qatan = word.match(/א[ָׇ]פְקִ(?:י(?:ת|ים|וֹת)?|יּוֹת)$/u);
      if (qatan && PREFIX.test(word.slice(0, qatan.index))) {
        return word.slice(0, qatan.index) + qatan[0].replace("ָ", "ׇ");
      }
      // Approved modern syncope of אוֹפַנּוֹעַ. Both phonetic profiles must
      // hear the same word; academic SBL continues to represent the written patah.
      const syncope = modern && word.match(/אוֹפַנּ?וֹעַ$/u);
      if (syncope && PREFIX.test(word.slice(0, syncope.index))) return word.replace(/פַ/, "פְ");
      return word;
    }).normalize("NFC");
  }
  return { prepare: prepare, decisions: decisions, VERSION: "hebrew-reading-lexicon-v1" };
});
