'use strict';
// One normalization for the news index and the query (docs/superpowers/specs/2026-11-21-news-findability-design.md §2 п.3, §4):
// no niqqud, final letters as regular, geresh/gershayim and apostrophes dropped inside a word (so
// צ'ילה and צ׳ילה are one word for the FTS tokenizer), maqaf as a space; proclitics ו ה ב ל מ ש כ
// stripped into a separate «stems» column. The query is built from words only — never raw user syntax.
const { normalizeHebrew } = require('../db/hebrewNorm');

const PROCLITICS = 'והבלמשכ';
const MAX_WORDS = 12;

function normHe(text) {
  if (!text || typeof text !== 'string') return '';
  const s = text.replace(/[־‐-―-]/g, ' ') // maqaf and dashes separate words
    .replace(/([א-ת])['׳’`"״“”]+(?=[א-ת])/g, '$1') // geresh / gershayim inside a word
    .replace(/([א-ת])['׳’`]+(?=\s|$)/g, '$1'); // trailing geresh (ג׳ at the end)
  return normalizeHebrew(s);
}

// One proclitic off while 3+ letters stay, two off while 4+ stay: בית keeps no «ית», ממשלה no «שלה» (review W2 I1).
function stemsOf(word) {
  const out = [];
  if (word.length >= 4 && PROCLITICS.includes(word[0])) {
    out.push(word.slice(1));
    if (word.length >= 6 && PROCLITICS.includes(word[1])) out.push(word.slice(2));
  }
  return out;
}
function stemsHe(norm) {
  const out = new Set();
  for (const w of String(norm || '').split(/\s+/)) for (const s of stemsOf(w)) out.add(s);
  return [...out].join(' ');
}

function normRu(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

const HEB = /[א-ת]/;
// q → an FTS5 MATCH string, or null when nothing searchable is left. Every word is a prefix term; all words must match.
function ftsQuery(q) {
  const words = normHe(normRu(String(q || '').slice(0, 200))).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, MAX_WORDS);
  if (!words.length) return null;
  const term = w => '"' + w + '"*';
  return words.map(w => {
    // The word itself as a prefix; its forms without proclitics only as whole words.
    if (HEB.test(w)) return '{he stems} : (' + [term(w), ...stemsOf(w).map(x => '"' + x + '"')].join(' OR ') + ')';
    if (/[а-я]/.test(w)) return '{ru} : (' + term(w) + ')';
    return term(w);
  }).join(' AND ');
}

// The forms of a query word to look for: itself, then without proclitics.
const formsOf = w => [w, ...(HEB.test(w) ? stemsOf(w) : [])];

module.exports = { normHe, stemsHe, normRu, ftsQuery, formsOf };
