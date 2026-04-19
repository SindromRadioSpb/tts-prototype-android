"use strict";

// Transliteration dispatch for the premium pipeline.
//
// Two profiles:
//   "sbl"        — SBL Academic with full BeGaDKePhaT spirantization (default).
//   "ru-phonetic" — Russian phonetic: Cyrillic output, no diacritic distinction
//                   between spirantized/non-spirantized BeGaDKePhaT pairs where
//                   Russian has no phoneme contrast (ג/גּ → г, ד/דּ → д, ת/תּ → т).
//                   ה and ח both map to х; א and ע are silent.
//
// transliterate(text)               — SBL profile, backward-compatible shorthand.
// transliterateWithProfile(text, p) — dispatches to the correct schema.
//
// Output is always NFC-normalized. Both functions fall through silently on
// unusual cluster shapes (library can throw; translit is best-effort).
//
// Bump the relevant version string in versions.js TRANSLIT_PROFILE_VERSIONS
// whenever either schema changes, so segment-cache rows are invalidated.

const { transliterate: _lib, Schema } = require("hebrew-transliteration");
const { sblAcademicSpirantization }   = require("hebrew-transliteration/schemas");

// ── SBL Academic (spirantized) ──────────────────────────────────────────────
// Two overrides vs library defaults (which use U+0331 macron-below):
//   GIMEL:     g+U+0304 → ḡ U+1E21  (g+U+0331 does not NFC-compose)
//   PE/FINAL_PE: p+U+0304 → p̄       (SBL standard = macron above, not below)
const SBL_SCHEMA = new Schema({
  ...sblAcademicSpirantization,
  GIMEL:    "g\u0304",
  PE:       "p\u0304",
  FINAL_PE: "p\u0304",
});

// ── Russian Phonetic ────────────────────────────────────────────────────────
// Maps Hebrew phonemes to their nearest Cyrillic equivalents for Russian
// readers. Spirantization pairs that have no Russian phoneme contrast are
// collapsed (e.g. both ד and דּ → д). Matres lectionis produce plain vowels.
const RU_SCHEMA = new Schema({
  // ── Vowels ──
  VOCAL_SHEVA:    "э",
  HATAF_SEGOL:    "э",
  HATAF_PATAH:    "а",
  HATAF_QAMATS:   "о",
  HIRIQ:          "и",
  TSERE:          "е",
  SEGOL:          "э",
  PATAH:          "а",
  QAMATS:         "а",
  HOLAM:          "о",
  HOLAM_HASER:    "о",
  QUBUTS:         "у",
  QAMATS_QATAN:   "о",
  FURTIVE_PATAH:  "а",
  // ── Matres lectionis ──
  HIRIQ_YOD:      "и",
  TSERE_YOD:      "е",
  SEGOL_YOD:      "е",
  SHUREQ:         "у",
  HOLAM_VAV:      "о",
  QAMATS_HE:      "а",
  SEGOL_HE:       "э",
  TSERE_HE:       "е",
  MS_SUFX:        "ав",
  // ── Consonants ──
  ALEF:           "",       // silent
  BET_DAGESH:     "б",
  BET:            "в",
  GIMEL_DAGESH:   "г",
  GIMEL:          "г",      // no spirantization contrast in Russian
  DALET_DAGESH:   "д",
  DALET:          "д",
  HE:             "х",
  VAV:            "в",
  ZAYIN:          "з",
  HET:            "х",      // collapses with ה; Russian has no ħ phoneme
  TET:            "т",
  YOD:            "й",
  KAF_DAGESH:     "к",
  KAF:            "х",
  FINAL_KAF:      "х",
  LAMED:          "л",
  MEM:            "м",
  FINAL_MEM:      "м",
  NUN:            "н",
  FINAL_NUN:      "н",
  SAMEKH:         "с",
  AYIN:           "",       // silent
  PE_DAGESH:      "п",
  PE:             "ф",
  FINAL_PE:       "ф",
  TSADI:          "ц",
  FINAL_TSADI:    "ц",
  QOF:            "к",
  RESH:           "р",
  SHIN:           "ш",
  SIN:            "с",
  TAV_DAGESH:     "т",
  TAV:            "т",
  DIVINE_NAME:    "Яхве",
  // ── Library options ──
  DAGESH:         "",
  DAGESH_CHAZAQ:  false, // no gemination in Russian phonetic — ккк → к
  MAQAF:          "-",
  PASEQ:          "",
  SOF_PASUQ:      "",
  longVowels:     true,
  qametsQatan:    true,
  shevaAfterMeteg: true,
  sqnmlvy:        true,
  wawShureq:      true,
  article:        true,
  allowNoNiqqud:  true,
  strict:         false,
  holemHaser:     "remove",
});

const SCHEMAS = { "sbl": SBL_SCHEMA, "ru-phonetic": RU_SCHEMA };

function _run(text, schema) {
  if (typeof text !== "string") return "";
  const t = text.trim();
  if (!t) return "";
  try {
    return _lib(t, schema).normalize("NFC");
  } catch (_) {
    return "";
  }
}

// Backward-compatible default (SBL profile).
function transliterate(heWithNiqqud) {
  return _run(heWithNiqqud, SBL_SCHEMA);
}

// Profile-aware entry point used by the pipeline.
function transliterateWithProfile(heWithNiqqud, profile) {
  return _run(heWithNiqqud, SCHEMAS[profile] || SBL_SCHEMA);
}

module.exports = { transliterate, transliterateWithProfile };
