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
const { sblAcademicSpirantization, sblSimple } = require("hebrew-transliteration/schemas");
const { normalizeLearnerLatinTranslit } = require("../../public/js/table-niqqud-normalizer.js");

// ── SBL Academic (spirantized) ──────────────────────────────────────────────
// Overrides vs library defaults:
//   GIMEL:       g+U+0304 → ḡ U+1E21  (g+U+0331 does not NFC-compose)
//   PE/FINAL_PE: p+U+0304 → p̄         (SBL standard = macron above, not below)
//   DAGESH_CHAZAQ: true                (preserve gemination — מִכָּאן → mikkāʾn)
const SBL_SCHEMA = new Schema({
  ...sblAcademicSpirantization,
  GIMEL:         "g\u0304",
  PE:            "p\u0304",
  FINAL_PE:      "p\u0304",
  DAGESH_CHAZAQ: true,
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

// ── Learner Latin ──────────────────────────────────────────────────────────
// Plain, keyboard-friendly Israeli-Hebrew transliteration used by the owner's
// existing physics tables: kh/sh/ts, ASCII apostrophe for א/ע, no diacritics.
// A private-use marker lets us render modern spoken sheva consistently:
// prefix וְ- keeps "ve-", a sheva before א/ע is "e", other initial clusters
// are compact (tnu'a, shvat). This stays deterministic and needs no model call.
const LEARNER_SHEVA = "\uE000";
const LEARNER_LATIN_SCHEMA = new Schema({
  ...sblSimple,
  ALEF: "'",
  AYIN: "'",
  QOF: "k",
  HE: "h",
  QAMATS_HE: "a",
  SEGOL_HE: "e",
  TSERE_HE: "e",
  VOCAL_SHEVA: LEARNER_SHEVA,
  DAGESH_CHAZAQ: false,
});

const SCHEMAS = {
  "sbl": SBL_SCHEMA,
  "ru-phonetic": RU_SCHEMA,
  "learner-latin": LEARNER_LATIN_SCHEMA,
};

function _finishLearnerLatin(value) {
  const finished = value
    .replace(new RegExp(`\\bv${LEARNER_SHEVA}`, "g"), "ve")
    .replace(new RegExp(`${LEARNER_SHEVA}(?=')`, "g"), "e")
    .replaceAll(LEARNER_SHEVA, "")
    // A word-initial glottal carrier is silent; internal א/ע stays visible.
    .replace(/(^|[\s([])'(?=[a-z])/g, "$1")
    // The library emits furtive patah before final ע as a'; learner spelling
    // places the separator before the vowel: nose'a, ofno'a, poge'a.
    .replace(/a'(?=$|[\s.,!?;:)\]])/g, "'a")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_match, before, letter) => before + letter.toUpperCase());
  // Academy niqqud writes אוֹפַנּוֹעַ with patah and אָפְקִי with qamats
  // qatan. The shared normalizer keeps the owner's compact modern learner
  // spellings and repairs old browser-cache transliteration identically.
  return normalizeLearnerLatinTranslit(finished);
}

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
  const result = _run(heWithNiqqud, SCHEMAS[profile] || SBL_SCHEMA);
  return profile === "learner-latin" ? _finishLearnerLatin(result) : result;
}

module.exports = { transliterate, transliterateWithProfile };
