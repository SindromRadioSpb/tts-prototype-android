'use strict';
// Fingerprints of the original (docs/superpowers/specs/2026-11-15-news-editions-design.md §4.4, §5.5):
// the title and EACH paragraph hashed after a normalization that ignores spacing, quotes, geresh,
// punctuation and vowels — so a later re-check can say which paragraphs the outlet added or changed,
// and minor edits make no change at all.
const crypto = require('node:crypto');

function normalizeForPrint(text) {
  return String(text || '').normalize('NFC')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳״'"`´‘’“”„«»״׳]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
const h16 = s => crypto.createHash('sha256').update(normalizeForPrint(s)).digest('hex').slice(0, 16);

function fingerprintOf(titleHe, paragraphs) {
  return { title_hash: h16(titleHe), para_hashes: (paragraphs || []).filter(p => normalizeForPrint(p)).map(h16) };
}
// The original's paragraphs from the OR rows: rows of one paragraph joined by a space give it back exactly.
function paragraphsOfRows(rows) {
  const by = new Map();
  for (const r of rows || []) { const k = r.p; if (!by.has(k)) by.set(k, []); by.get(k).push(r.he_plain); }
  return [...by.values()].map(x => x.join(' '));
}
function diffPrints(old, now) {
  const count = list => { const m = new Map(); for (const x of list) m.set(x, (m.get(x) || 0) + 1); return m; };
  const a = count(old.para_hashes), b = count(now.para_hashes);
  let oldOnly = 0, newOnly = 0;
  for (const [k, n] of a) oldOnly += Math.max(0, n - (b.get(k) || 0));
  for (const [k, n] of b) newOnly += Math.max(0, n - (a.get(k) || 0));
  const changed = Math.min(oldOnly, newOnly), added = newOnly - changed, removed = oldOnly - changed, title_changed = old.title_hash !== now.title_hash;
  return { added, changed, removed, title_changed, significant: title_changed || added + changed >= 1 };
}

module.exports = { normalizeForPrint, fingerprintOf, paragraphsOfRows, diffPrints };
