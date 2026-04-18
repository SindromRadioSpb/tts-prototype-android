"use strict";

// SBL Academic Hebrew transliteration with BeGaDKePhaT spirantization.
//
// Canonical transliteration function for the whole pipeline. All code paths
// (single word, multi-word phrase, table generation, batch, cached rows) must
// call this function — never a fallback or inline logic.
//
// Schema: sblAcademicSpirantization from `hebrew-transliteration`.
// PE override: the library uses p+U+0331 (macron below) for spirantized פ,
// but the SBL standard and this project use p̄ (p+U+0304, macron above).
// PE and FINAL_PE are overridden accordingly.
//
// Output is NFC-normalized so callers always receive precomposed characters
// (e.g. k+U+0331 → ḵ U+1E35, t+U+0331 → ṯ U+1E6F).
//
// Dagesh detection: delegated entirely to the `hebrew-transliteration` library
// which parses base letter + combining marks (U+05BC = dagesh) per grapheme.
// Do NOT maintain parallel spirantization logic elsewhere in the pipeline.
//
// Bump TRANSLIT_PROFILE in versions.js whenever this schema changes so that
// existing segment-cache rows (which store translit) are invalidated.

const { transliterate: sblTransliterate, Schema } = require("hebrew-transliteration");
const { sblAcademicSpirantization } = require("hebrew-transliteration/schemas");

// Two overrides vs library defaults (which use U+0331 macron-below):
//   PE / FINAL_PE: "p\u0304" → NFC → p̄ (p + macron above, SBL standard for spirantized פ)
//   GIMEL:         "g\u0304" → NFC → ḡ (U+1E21; g+U+0331 does not NFC-compose)
// All other BeGaDKePhaT fricatives (ב ד כ ת) use U+0331 and NFC-compose correctly:
//   b+U+0331 → ḇ U+1E07, d+U+0331 → ḏ U+1E0F, k+U+0331 → ḵ U+1E35, t+U+0331 → ṯ U+1E6F.
const SCHEMA = new Schema({
  ...sblAcademicSpirantization,
  GIMEL:    "g\u0304",
  PE:       "p\u0304",
  FINAL_PE: "p\u0304",
});

function transliterate(heWithNiqqud) {
  if (typeof heWithNiqqud !== "string") return "";
  const trimmed = heWithNiqqud.trim();
  if (!trimmed) return "";
  try {
    return sblTransliterate(trimmed, SCHEMA).normalize("NFC");
  } catch (_) {
    // Library can throw on certain unusual cluster shapes; fall through silently
    // since transliteration is a best-effort field and the row is still usable.
    return "";
  }
}

module.exports = { transliterate };
