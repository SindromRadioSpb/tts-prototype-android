"use strict";

// Two-level text normalization — parallel of ai-local/ai_local/normalization.py.
// Any divergence between the Python side and this file will cause cache misses
// (hash mismatches). If you change one, change the other.

// Display-level: what the user sees and what we return in rows.
//   - Unicode NFKC
//   - CRLF → LF
//   - leading/trailing whitespace stripped
function normalizeForDisplay(text) {
  if (typeof text !== "string") return "";
  return text.normalize("NFKC").replace(/\r\n/g, "\n").trim();
}

// Cache-key level: display + strip direction marks + strip C0/C1 controls.
// We don't want a stray U+200E or zero-width mark to invalidate the key.
const DIRECTION_AND_BOM = /[\u200E\u200F\u202A-\u202E\uFEFF]/g;
// C0 (U+0000–U+001F) excluding LF (U+000A) and Tab (U+0009); C1 (U+0080–U+009F).
const C0_C1_CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

function normalizeForKey(text) {
  const display = normalizeForDisplay(text);
  return display.replace(DIRECTION_AND_BOM, "").replace(C0_C1_CONTROLS, "");
}

module.exports = {
  normalizeForDisplay,
  normalizeForKey,
};
