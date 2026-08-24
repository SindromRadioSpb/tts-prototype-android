(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TableNiqqudNormalizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const HEBREW_MARKS_RE = /[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g;
  const HEBREW_TOKEN_RE = /[א-ת\u0591-\u05c7]+/g;
  const VERSION = "table-niqqud-normalizer-v1";

  // Audited terms only. Exact prefixed forms are deliberate: proclitic vowels
  // are context-sensitive, so this table grows from reviewed evidence rather
  // than guessing arbitrary Hebrew prefixes.
  const CANONICAL = new Map([
    ["אופנוע", { term: "אופנוע", plain: "אופנוע", value: "אוֹפַנּוֹעַ" }],
    ["האופנוע", { term: "האופנוע", plain: "האופנוע", value: "הָאוֹפַנּוֹעַ" }],
    ["כשהאופנוע", { term: "כשהאופנוע", plain: "כשהאופנוע", value: "כְּשֶׁהָאוֹפַנּוֹעַ" }],
    ["אפקי", { term: "אופקי", plain: "אופקי", value: "אָפְקִי" }],
    ["אופקי", { term: "אופקי", plain: "אופקי", value: "אָפְקִי" }],
    ["ואפקי", { term: "אופקי", plain: "ואופקי", value: "וְאָפְקִי" }],
    ["ואופקי", { term: "אופקי", plain: "ואופקי", value: "וְאָפְקִי" }],
  ]);

  function stripHebrewMarks(value) {
    return String(value || "").normalize("NFD").replace(HEBREW_MARKS_RE, "").normalize("NFC");
  }

  function normalizeLearnerLatinTranslit(value) {
    return String(value || "")
      .replace(/Evofano'a/g, "Ofno'a")
      .replace(/evofano'a/g, "ofno'a")
      .replace(/Ofano'a/g, "Ofno'a")
      .replace(/ofano'a/g, "ofno'a")
      .replace(/Afki\b/g, "Ofki")
      .replace(/afki\b/g, "ofki");
  }

  function normalizeRows(rows) {
    const corrections = [];
    const normalizedRows = (Array.isArray(rows) ? rows : []).map(function (row, rowIndex) {
      const next = { ...(row || {}) };
      const plain = String(next.he != null ? next.he : (next.he_plain || ""));
      const plainTokens = new Set(plain.match(/[א-ת]+/g) || []);
      const beforeNiqqud = String(next.he_niqqud || "");
      next.he_niqqud = beforeNiqqud.replace(HEBREW_TOKEN_RE, function (token) {
        const canonical = CANONICAL.get(stripHebrewMarks(token));
        if (!canonical || !plainTokens.has(canonical.plain) || canonical.value === token) return token;
        corrections.push({ rowIndex, field: "he_niqqud", term: canonical.term, from: token, to: canonical.value });
        return canonical.value;
      });

      const beforeTranslit = String(next.translit || "");
      const afterTranslit = normalizeLearnerLatinTranslit(beforeTranslit);
      if (afterTranslit !== beforeTranslit) {
        next.translit = afterTranslit;
        corrections.push({ rowIndex, field: "translit", term: "learner-latin", from: beforeTranslit, to: afterTranslit });
      }
      return next;
    });
    return { rows: normalizedRows, corrections, version: VERSION };
  }

  return { VERSION, normalizeRows, normalizeLearnerLatinTranslit, stripHebrewMarks };
});
