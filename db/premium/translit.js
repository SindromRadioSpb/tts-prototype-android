"use strict";

// STUB — Phase 1.7 will wire `hebrew-transliteration` (SBL Academic profile).
// The contract below is what 1.7 must preserve:
//
//   transliterate(heWithNiqqud) -> string
//   - Input: single segment of Hebrew with full niqqud markers
//   - Output: Latin transliteration per the configured TRANSLIT_PROFILE
//   - Returns "" if input is empty

function transliterate(_heWithNiqqud) {
  // Intentional blank until Phase 1.7.
  return "";
}

module.exports = { transliterate };
