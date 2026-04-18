"use strict";

// STUB — Phase 1.6 will replace this with the protector/splitter/restorer
// regex pipeline and a Hebrew abbreviation whitelist. The shape and contract
// below are what 1.6 must preserve.
//
// Contract:
//   segment(normalizedSource) -> Array<{ index: number, he: string }>
//   - `index` is 1-based, monotonic, dense
//   - `he` is each segment's display-normalized Hebrew
//   - Empty/whitespace-only segments are dropped

// Placeholder: split on blank lines first, then on sentence-final punctuation
// followed by whitespace. Deliberately simple — 1.6 will replace entirely.
function segment(source) {
  if (!source) return [];
  const paragraphs = source.split(/\n{2,}/);
  const out = [];
  for (const para of paragraphs) {
    const pieces = para.split(/(?<=[.!?׃])\s+/);
    for (const p of pieces) {
      const t = p.trim();
      if (t) out.push(t);
    }
  }
  return out.map((he, i) => ({ index: i + 1, he }));
}

module.exports = { segment };
