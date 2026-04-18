"use strict";

// SBL Academic Hebrew transliteration via the `hebrew-transliteration` package.
// The output uses macrons + diacritics (e.g. שָׁלוֹם → "šālôm") which is the
// scholarly standard. If the user later wants a popular profile (e.g. plain
// "shalom"), bump TRANSLIT_PROFILE in versions.js so existing cache rows
// invalidate gracefully.
//
// The library throws on empty or whitespace-only input ("Cannot set properties
// of undefined (setting 'siblings')"), so we guard at the boundary. Hebrew
// without niqqud is passed through unchanged — that's the library's default,
// and we treat it as a soft no-op rather than an error.

const { transliterate: sblTransliterate } = require("hebrew-transliteration");

function transliterate(heWithNiqqud) {
  if (typeof heWithNiqqud !== "string") return "";
  const trimmed = heWithNiqqud.trim();
  if (!trimmed) return "";
  try {
    return sblTransliterate(trimmed);
  } catch (_) {
    // Library can throw on certain unusual cluster shapes; fall through silently
    // since transliteration is a best-effort field and the row is still usable.
    return "";
  }
}

module.exports = { transliterate };
