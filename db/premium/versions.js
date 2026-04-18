"use strict";

// Pipeline version constants. These participate in every cache key, so bumping
// any one of them invalidates the affected rows on the next write without
// deleting existing data (old keys simply become unreachable and are GC'd).

const SEGMENTER_VERSION = "regex-v1";
const NIKUD_VERSION     = "dictabert-large-char-menaked@dicta-il";
const TRANSLIT_PROFILE  = "sbl-v1";

// Per-provider translator versions. The key only uses the one that matches the
// call's provider, so switching providers produces disjoint cache namespaces.
const TRANSLATOR_VERSIONS = {
  madlad:          "madlad-400-10b-ct2-int8f16",
  gcp:             "gcp-translate-v3-nmt",
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
  TRANSLATOR_VERSIONS,
  translatorVersion,
};
