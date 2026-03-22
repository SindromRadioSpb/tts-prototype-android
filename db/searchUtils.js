/**
 * db/searchUtils.js
 * PATCH-05: Search utilities - snippet extraction and highlight calculation
 *
 * The challenge: matching is done on normalized text (he_norm),
 * but snippets and highlights need to be on raw text.
 *
 * Strategy:
 * - For snippet: find match in normalized text, map position back to raw text
 * - For highlights: calculate positions in raw text based on normalized match
 */

"use strict";

const { normalizeHebrew, normalizeQuery, containsHebrew } = require("./hebrewNorm");

/**
 * Default snippet configuration
 */
const SNIPPET_CONFIG = {
  minLength: 60,
  maxLength: 160,
  contextChars: 40, // chars before and after match
};

/**
 * Find all match positions of query in text (case-insensitive)
 * @param {string} text - Text to search in
 * @param {string} query - Query to find
 * @returns {Array<{start: number, end: number}>} Match positions
 */
function findMatchPositions(text, query) {
  if (!text || !query) return [];

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  const positions = [];

  let pos = 0;
  while (pos < textLower.length) {
    const idx = textLower.indexOf(queryLower, pos);
    if (idx === -1) break;

    positions.push({
      start: idx,
      end: idx + query.length
    });

    pos = idx + 1; // Allow overlapping matches
  }

  return positions;
}

/**
 * Build a character mapping between raw and normalized text
 * Maps each position in normalized text to corresponding position in raw text
 * @param {string} rawText
 * @param {string} normText
 * @returns {number[]} Array where index is norm position, value is raw position
 */
function buildNormToRawMap(rawText, normText) {
  // This is a simplified approach - build mapping by comparing characters
  // For more complex normalization, you'd need to track transformations
  const map = [];
  let rawIdx = 0;

  for (let normIdx = 0; normIdx < normText.length; normIdx++) {
    // Skip raw characters that were removed in normalization (niqqud, etc.)
    while (rawIdx < rawText.length) {
      const rawChar = rawText[rawIdx];
      const normChar = normText[normIdx];

      // Check if this raw char maps to current norm char
      // Account for: niqqud removal, final form conversion, space collapse
      const rawNorm = normalizeHebrew(rawChar);

      if (rawNorm === normChar || rawNorm.toLowerCase() === normChar.toLowerCase()) {
        map.push(rawIdx);
        rawIdx++;
        break;
      } else if (rawNorm === '' || rawNorm === ' ') {
        // This char was removed/collapsed in normalization, skip it
        rawIdx++;
      } else {
        // Mismatch - just advance (fallback)
        map.push(rawIdx);
        rawIdx++;
        break;
      }
    }

    // Safety: if we ran out of raw text
    if (rawIdx >= rawText.length && map.length <= normIdx) {
      map.push(rawText.length - 1);
    }
  }

  return map;
}

/**
 * Map a position from normalized text back to raw text
 * @param {number} normPos - Position in normalized text
 * @param {number[]} normToRawMap - Mapping array
 * @param {number} rawLength - Length of raw text
 * @returns {number} Position in raw text
 */
function mapNormPosToRaw(normPos, normToRawMap, rawLength) {
  if (normPos < 0) return 0;
  if (normPos >= normToRawMap.length) return rawLength;
  return normToRawMap[normPos] || 0;
}

/**
 * Generate snippet and highlights for a search result
 * @param {string} rawText - Original text (what user sees)
 * @param {string} query - Search query (may need normalization)
 * @param {Object} options - Options { useHebrewNorm: boolean, snippetConfig: object }
 * @returns {{ snippet: string, highlights: Array<{start: number, end: number}>, snippetOffset: number }}
 */
function generateSnippetAndHighlights(rawText, query, options = {}) {
  const config = { ...SNIPPET_CONFIG, ...options.snippetConfig };
  const result = {
    snippet: "",
    highlights: [],
    snippetOffset: 0, // offset of snippet start in raw text
  };

  if (!rawText || !query) {
    result.snippet = rawText ? rawText.slice(0, config.maxLength) : "";
    return result;
  }

  const useHebrewNorm = options.useHebrewNorm !== false && containsHebrew(query);

  let matchPositions = [];

  if (useHebrewNorm) {
    // Normalize both text and query for matching
    const normText = normalizeHebrew(rawText);
    const normQuery = normalizeQuery(query);

    // Find matches in normalized text
    const normPositions = findMatchPositions(normText, normQuery);

    if (normPositions.length > 0) {
      // Build mapping from normalized to raw positions
      const normToRawMap = buildNormToRawMap(rawText, normText);

      // Map positions back to raw text
      matchPositions = normPositions.map(np => ({
        start: mapNormPosToRaw(np.start, normToRawMap, rawText.length),
        end: mapNormPosToRaw(np.end - 1, normToRawMap, rawText.length) + 1
      }));
    }
  } else {
    // Direct matching without normalization
    matchPositions = findMatchPositions(rawText, query);
  }

  // If no matches found, return beginning of text as snippet
  if (matchPositions.length === 0) {
    result.snippet = rawText.slice(0, config.maxLength);
    if (rawText.length > config.maxLength) {
      result.snippet = result.snippet.trim() + "...";
    }
    return result;
  }

  // Use first match for snippet positioning
  const firstMatch = matchPositions[0];

  // Calculate snippet window around first match
  let snippetStart = Math.max(0, firstMatch.start - config.contextChars);
  let snippetEnd = Math.min(rawText.length, firstMatch.end + config.contextChars);

  // Ensure minimum length
  if (snippetEnd - snippetStart < config.minLength) {
    const needed = config.minLength - (snippetEnd - snippetStart);
    const expandBefore = Math.floor(needed / 2);
    const expandAfter = needed - expandBefore;
    snippetStart = Math.max(0, snippetStart - expandBefore);
    snippetEnd = Math.min(rawText.length, snippetEnd + expandAfter);
  }

  // Ensure maximum length
  if (snippetEnd - snippetStart > config.maxLength) {
    snippetEnd = snippetStart + config.maxLength;
  }

  // Try to start/end at word boundaries
  if (snippetStart > 0) {
    const spaceIdx = rawText.lastIndexOf(' ', snippetStart + 5);
    if (spaceIdx > snippetStart - 10 && spaceIdx > 0) {
      snippetStart = spaceIdx + 1;
    }
  }
  if (snippetEnd < rawText.length) {
    const spaceIdx = rawText.indexOf(' ', snippetEnd - 5);
    if (spaceIdx > 0 && spaceIdx < snippetEnd + 10) {
      snippetEnd = spaceIdx;
    }
  }

  // Extract snippet
  let snippet = rawText.slice(snippetStart, snippetEnd);
  if (snippetStart > 0) snippet = "..." + snippet;
  if (snippetEnd < rawText.length) snippet = snippet + "...";

  result.snippet = snippet;
  result.snippetOffset = snippetStart;

  // Calculate highlights relative to raw text (not snippet)
  result.highlights = matchPositions.filter(mp =>
    mp.start < rawText.length && mp.end > 0
  ).map(mp => ({
    start: Math.max(0, mp.start),
    end: Math.min(rawText.length, mp.end)
  }));

  return result;
}

/**
 * Generate snippet and highlights for multiple text fields
 * Returns snippet from the first field that has a match
 * @param {Object} fields - { fieldName: fieldValue, ... }
 * @param {string} query - Search query
 * @param {Object} options - Options
 * @returns {{ snippet: string, snippetField: string, highlights: Object<string, Array> }}
 */
function generateSnippetForFields(fields, query, options = {}) {
  const result = {
    snippet: "",
    snippetField: null,
    highlights: {},
  };

  // Priority order for fields (Hebrew first, then others)
  const fieldPriority = ["he_plain", "he_niqqud", "hePlain", "heNiqqud", "ru", "translit", "note"];

  const orderedFields = Object.keys(fields).sort((a, b) => {
    const ai = fieldPriority.indexOf(a);
    const bi = fieldPriority.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  for (const fieldName of orderedFields) {
    const fieldValue = fields[fieldName];
    if (!fieldValue) continue;

    const fieldResult = generateSnippetAndHighlights(fieldValue, query, options);

    // Store highlights for this field
    if (fieldResult.highlights.length > 0) {
      result.highlights[fieldName] = fieldResult.highlights;
    }

    // Use snippet from first field with matches
    if (!result.snippetField && fieldResult.highlights.length > 0) {
      result.snippet = fieldResult.snippet;
      result.snippetField = fieldName;
    }
  }

  // Fallback: if no matches found, use first non-empty field
  if (!result.snippet) {
    for (const fieldName of orderedFields) {
      if (fields[fieldName]) {
        const text = String(fields[fieldName]);
        result.snippet = text.slice(0, SNIPPET_CONFIG.maxLength);
        if (text.length > SNIPPET_CONFIG.maxLength) {
          result.snippet += "...";
        }
        result.snippetField = fieldName;
        break;
      }
    }
  }

  return result;
}

module.exports = {
  generateSnippetAndHighlights,
  generateSnippetForFields,
  findMatchPositions,
  SNIPPET_CONFIG,
};
