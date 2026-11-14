'use strict';
// Text helpers of the article harvester (docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §16):
// Hebrew punctuation as the format wants it (geresh U+05F3, gershayim U+05F4) and one row = one
// sentence. The words themselves are never changed: the 'OR' version must stay the original.

const HEB = 'א-ת';
const SPACE = /[\s ​‎‏‪-‮⁦-⁩]+/g;

// Whitespace and invisible direction marks → one space; ASCII/typographic marks inside a Hebrew word
// → geresh/gershayim: צ'ילה, ג`ימי, רה"מ, נתב”ג. Quotes around words are left as they are.
function normalizeHebrewPunct(text) {
  return String(text == null ? '' : text).normalize('NFC')
    .replace(SPACE, ' ')
    .replace(new RegExp('([' + HEB + '])(?:\'\'|["”“״])([' + HEB + '])', 'g'), '$1״$2')
    .replace(new RegExp('([' + HEB + '])[\'`’‘׳](?=[' + HEB + ']|[\\s.,:;!?)\\-]|$)', 'g'), '$1׳')
    .trim();
}

const CLOSERS = '"“”„«»״׳\')]';
const ENDERS = '.!?…';
// Names that end in a sentence mark and are not the end of a sentence.
const NOT_AN_END = new Set(['ישר!', 'יאללה!']);
// Splits a paragraph into sentences: after . ! ? … (with the closing quotes that follow) and a space.
// Multi-sentence quotes are split too: a row is one sentence. Not after a single letter or a number
// with a dot (1. / ד.). The rows joined by spaces give back the paragraph exactly.
function splitSentences(paragraph) {
  const s = String(paragraph || '').trim();
  if (!s) return [];
  const out = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!ENDERS.includes(ch)) continue;
    let j = i;
    while (j + 1 < s.length && (ENDERS.includes(s[j + 1]) || CLOSERS.includes(s[j + 1]))) j++;
    if (j + 1 >= s.length || s[j + 1] !== ' ') { i = j; continue; }
    const lastWord = s.slice(start, i + 1).trim().split(' ').pop() || '';
    const bare = lastWord.replace(/^["“”„«»״׳'(\[]+/, '');
    if (NOT_AN_END.has(bare) || (ch === '.' && /^(\d+|[\p{L}])\.$/u.test(bare))) { i = j; continue; }
    out.push(s.slice(start, j + 1).trim());
    start = j + 1; i = j;
  }
  const tail = s.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

module.exports = { normalizeHebrewPunct, splitSentences };
