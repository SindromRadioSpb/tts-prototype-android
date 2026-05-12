// scripts/morph/normalize.mjs — Hebrew word normalization (build-time).
// MUST stay byte-for-byte equivalent to public/js/morph-normalize.js (the
// browser-runtime counterpart). The shared invariant is requirement #15
// of docs/MORPHOLOGY_REQUIREMENTS_v3_2.md.
//
// Pipeline:
//   1. Unicode NFC
//   2. Strip combining niqqud marks       (U+05B0..U+05BC + U+05BD..U+05C7)
//   3. Strip cantillation marks           (U+0591..U+05AF)
//   4. Strip ZWJ/ZWNJ/RLM/LRM             (U+200B..U+200F, U+202A..U+202E, U+2066..U+2069)
//   5. Map final-letter forms             (ך→כ ם→מ ן→נ ף→פ ץ→צ)
//   6. Trim whitespace
//
// Hebrew has no case, so no case folding is applied.

const NIQQUD_RE = /[֑-ׇֽֿׁׂׅׄ]/g;
const FORMAT_RE = /[​-‏‪-‮⁦-⁩﻿]/g;
const FINAL_MAP = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const FINAL_RE = /[ךםןףץ]/g;

export function normalizeHebrew(input) {
  if (input == null) return '';
  let s = String(input);
  if (!s) return '';
  s = s.normalize('NFC');
  s = s.replace(NIQQUD_RE, '');
  s = s.replace(FORMAT_RE, '');
  s = s.replace(FINAL_RE, (ch) => FINAL_MAP[ch] || ch);
  s = s.trim();
  return s;
}

export default { normalizeHebrew };
