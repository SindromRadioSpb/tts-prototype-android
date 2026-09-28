"use strict";

// Pipeline version constants. These participate in every cache key, so bumping
// any one of them invalidates the affected rows on the next write without
// deleting existing data (old keys simply become unreachable and are GC'd).

// v2 (K2, 2026-07-30): rows now carry `source_line_index` (segmenter line_index).
// The bump is REQUIRED, not cosmetic: SEGMENTER_VERSION is part of the DOC key only
// (buildDocKey), so bumping makes every doc-cache entry written before the field
// unreachable — otherwise a doc-cache hit would keep serving field-less rows and the
// karaoke fix would never reach anyone whose text is already cached (the owner's
// 117-min interview among them). The SEGMENT key does NOT include it, so a re-run
// reassembles from the segment cache: no nikud, no translation, no upstream cost.
// Sentence boundaries themselves are unchanged (byte-parity corpus check).
const SEGMENTER_VERSION = "regex-v2-lineidx";
const NIKUD_VERSION     = "dictabert-large-char-menaked@dicta-il";
const TRANSLIT_PROFILE  = "sbl-v7-geresh"; // default; also the cache-key string for profile "sbl"

// Stable cache-key strings per profile. Bump when the corresponding schema changes.
const TRANSLIT_PROFILE_VERSIONS = {
  // v6 / v2 / v3 (O-033d, 2026-09-28): translit-modern-reading.js — full-spelling doubled ו/י read
  // once in every profile; learner and Russian read modern sheva and a silent aleph.
  // v7 / v3 / v4 (O-033 tails, 2026-09-28): geresh ג' ז' צ' → j/zh/ch in every profile; Arabic
  // loans with a doubled letter (יאללה) keep one long consonant in learner and Russian.
  "sbl":         "sbl-v7-geresh",
  "ru-phonetic": "ru-phonetic-v3-geresh",
  "learner-latin": "learner-latin-v4-geresh",
};

function translitProfileVersion(profile) {
  return TRANSLIT_PROFILE_VERSIONS[profile] || TRANSLIT_PROFILE;
}

// Per-provider translator versions. The key only uses the one that matches the
// call's provider, so switching providers produces disjoint cache namespaces.
const TRANSLATOR_VERSIONS = {
  madlad:          "madlad-400-10b-ct2-int8f16",
  gcp:             "gcp-translate-v3-nmt",
  "google-free":   "google-free-gtx-v1",
  "legacy-gemini": "gemini-flash-latest",
  manual:          "manual-v1",
};

function translatorVersion(provider) {
  return TRANSLATOR_VERSIONS[provider] || provider;
}

module.exports = {
  SEGMENTER_VERSION,
  NIKUD_VERSION,
  TRANSLIT_PROFILE,
  TRANSLIT_PROFILE_VERSIONS,
  translitProfileVersion,
  TRANSLATOR_VERSIONS,
  translatorVersion,
};
