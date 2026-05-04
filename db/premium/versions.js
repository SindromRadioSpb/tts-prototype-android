"use strict";

// Pipeline version constants. These participate in every cache key, so bumping
// any one of them invalidates the affected rows on the next write without
// deleting existing data (old keys simply become unreachable and are GC'd).

const SEGMENTER_VERSION = "regex-v1";
const NIKUD_VERSION     = "dictabert-large-char-menaked@dicta-il";
const TRANSLIT_PROFILE  = "sbl-v5-dagesh"; // default; also the cache-key string for profile "sbl"

// Stable cache-key strings per profile. Bump when the corresponding schema changes.
const TRANSLIT_PROFILE_VERSIONS = {
  "sbl":         "sbl-v5-dagesh",     // v5: DAGESH_CHAZAQ enabled (gemination)
  "ru-phonetic": "ru-phonetic-v1",
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
