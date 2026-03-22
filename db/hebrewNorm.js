/**
 * db/hebrewNorm.js
 * Hebrew text normalization for search
 * PATCH-04: Hebrew normalization module
 */

"use strict";

/**
 * Hebrew niqqud (vowel points) Unicode range: U+0591 to U+05C7
 * These are diacritical marks that should be stripped for search
 */
const NIQQUD_REGEX = /[\u0591-\u05C7]/g;

/**
 * Hebrew final letter forms → regular forms mapping
 * Final forms appear at end of words in Hebrew
 */
const FINAL_TO_REGULAR = {
  '\u05DA': '\u05DB', // final kaf → kaf
  '\u05DD': '\u05DE', // final mem → mem
  '\u05DF': '\u05E0', // final nun → nun
  '\u05E3': '\u05E4', // final pe → pe
  '\u05E5': '\u05E6', // final tsadi → tsadi
};

const FINAL_FORMS_REGEX = /[\u05DA\u05DD\u05DF\u05E3\u05E5]/g;

/**
 * Normalize Hebrew text for search
 * - Strip niqqud (vowel points)
 * - Convert final forms to regular forms
 * - Trim whitespace
 * - Collapse multiple spaces
 * 
 * @param {string} text - Hebrew text (may contain niqqud)
 * @returns {string} Normalized text
 */
function normalizeHebrew(text) {
  if (!text || typeof text !== "string") return "";
  
  let result = text;
  
  // 1. Strip niqqud
  result = result.replace(NIQQUD_REGEX, "");
  
  // 2. Convert final forms to regular
  result = result.replace(FINAL_FORMS_REGEX, (ch) => FINAL_TO_REGULAR[ch] || ch);
  
  // 3. Normalize whitespace
  result = result.trim().replace(/\s+/g, " ");
  
  return result;
}

/**
 * Normalize search query (same normalization as stored text)
 * @param {string} query
 * @returns {string}
 */
function normalizeQuery(query) {
  return normalizeHebrew(query);
}

/**
 * Check if text contains Hebrew characters
 * @param {string} text
 * @returns {boolean}
 */
function containsHebrew(text) {
  if (!text || typeof text !== "string") return false;
  // Hebrew Unicode range: U+0590 to U+05FF
  return /[\u0590-\u05FF]/.test(text);
}

module.exports = {
  normalizeHebrew,
  normalizeQuery,
  containsHebrew,
  // Export for testing
  NIQQUD_REGEX,
  FINAL_TO_REGULAR
};
