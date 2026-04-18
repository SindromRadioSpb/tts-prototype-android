"use strict";

// Hebrew-aware sentence segmenter.
//
// Pipeline: protect → split → restore.
//   1. Protect spans that look like sentence enders but aren't: URLs, emails,
//      ellipses, decimals, dates, times, single-letter initials, and a
//      whitelist of Hebrew / English abbreviations.
//   2. Split on paragraph breaks (\n\n+), then single newlines, then on
//      sentence-final punctuation followed by whitespace.
//   3. Restore protected spans into the split output.
//
// Contract:
//   segment(text) -> Array<{ index: number, he: string }>
//     - `index` is 1-based, monotonic, dense.
//     - Empty/whitespace-only segments are dropped.
//     - Input is assumed to already be display-normalized (NFKC, CRLF→LF).

// Control chars unlikely to appear in user text; used as placeholder frames.
const PROTECT_OPEN = "\u0001";
const PROTECT_CLOSE = "\u0002";

// Hebrew abbreviations (with both gershayim U+05F4 ״ and ASCII ", and both
// geresh U+05F3 ׳ and ASCII '). Keep both variants so paste-from-anywhere works.
const HEBREW_ABBREVS = [
  // Titles / honorifics
  "ד״ר", 'ד"ר',
  "דר׳", "דר'",
  "גב׳", "גב'",
  "מר׳", "מר'",
  "עו״ד", 'עו"ד',
  "רו״ח", 'רו"ח',
  "פרופ׳", "פרופ'",
  "ר׳", "ר'",
  "ח״כ", 'ח"כ',
  "ר״ל", 'ר"ל',
  "ר״ה", 'ר"ה',
  "ד״ש", 'ד"ש',
  "ב״ה", 'ב"ה',
  "אע״פ", 'אע"פ',
  "עפ״י", 'עפ"י',
  "עפי״ר", 'עפי"ר',

  // Places
  "ת״א", 'ת"א',       // Tel Aviv
  "ב״ש", 'ב"ש',       // Beersheba
  "ארה״ב", 'ארה"ב',   // USA
  "ברה״מ", 'ברה"מ',   // USSR
  "ירו׳",

  // Units and common shortenings
  "וכו׳", "וכו'",
  "וכד׳", "וכד'",
  "כד׳", "כד'",
  "ש״ח", 'ש"ח',
  "ק״ג", 'ק"ג',
  "ק״מ", 'ק"מ',
  "מ״מ", 'מ"מ',
  "מ״ר", 'מ"ר',
  "ס״מ", 'ס"מ',
  "מ״ק", 'מ"ק',
  "מס׳", "מס'",
  "עמ׳", "עמ'",
  "ע״פ", 'ע"פ',
  "ע״י", 'ע"י',
  "ע״מ", 'ע"מ',
  "ת״ד", 'ת"ד',
  "בע״מ", 'בע"מ',
  "נ״ב", 'נ"ב',
  "ש״ס", 'ש"ס',
];

// Common English abbreviations that end in a period.
const ENGLISH_ABBREVS = [
  "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.",
  "St.", "Ave.", "Blvd.", "Rd.",
  "Inc.", "Ltd.", "Co.", "Corp.", "Gov.",
  "e.g.", "i.e.", "etc.", "vs.", "viz.", "cf.",
  "a.m.", "p.m.", "A.M.", "P.M.",
  "U.S.", "U.K.", "U.S.A.", "E.U.",
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pre-compile the abbreviation regex: longest alternatives first so that
// longer matches win (e.g. "ארה״ב" beats "ר״ה").
const ABBREV_RE = (() => {
  const all = [...HEBREW_ABBREVS, ...ENGLISH_ABBREVS]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  return new RegExp(all.join("|"), "g");
})();

// Single-letter initials. We must NOT match every Hebrew letter that happens to
// sit at a word's end before a period (e.g. the final mem in "עולם."), so each
// pattern requires:
//   - lookbehind: previous char is not a letter of the same script (so we hit
//     a true initial, not a word-final letter)
//   - lookahead: the next "word" is a multi-letter name, not another initial /
//     end-of-string. "A. Einstein" matches, "A. B." does not.
const LATIN_INITIAL_RE  = /(?<![A-Za-z])[A-Z]\.(?=\s+[A-Z][a-z])/g;
const HEBREW_INITIAL_RE = /(?<![\u05D0-\u05EA])[\u05D0-\u05EA]\.(?=\s+[\u05D0-\u05EA]{2,})/g;

// BIDI marks and BOM are invisible to the user but break naive `[.!?]\s+`
// splitting when they sit between the punctuation and the following space.
// Strip them up-front; they carry no semantic content for segmentation.
const BIDI_RE = /[\u200E\u200F\u202A-\u202E\uFEFF]/g;

// URLs and emails — protect before any punctuation splitting.
const URL_RE = /https?:\/\/\S+|\bwww\.\S+/gi;
// Email: the local-part may contain dots, but the TLD chunk must not end in
// a dot (otherwise we'd swallow the sentence-final period that follows).
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

// Ellipses: ASCII "..." (2+) and Unicode "…".
const ELLIPSIS_RE = /\.{2,}|…/g;

// Decimals, thousand-separator numbers: 3.14, 1,000.50, 1.1.2024, 10,000.
const NUMBER_RE = /\b\d+(?:[.,]\d+)+\b/g;

// Date shapes like 11.12.2024 or 1/1/2024 or 1-1-24.
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g;

// Time like 10:30 or 10:30:45.
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

// Sentence-ending punctuation. Includes Hebrew SOF PASUQ (U+05C3) for Biblical
// texts; modern Hebrew uses the ASCII forms.
// Capture the punctuation run and the following whitespace so we can reattach
// the punctuation to its sentence.
const SPLIT_RE = /([.!?׃]+)([ \t]+|$)/g;

function protectSpans(text) {
  const frames = [];
  const push = (match) => {
    const id = frames.length;
    frames.push(match);
    return `${PROTECT_OPEN}${id}${PROTECT_CLOSE}`;
  };

  // Order matters: URLs/emails first (they contain dots), then ellipses
  // (three dots before decimal), then numbers/dates/times, then abbreviations,
  // then single-letter initials.
  let out = text;
  out = out.replace(URL_RE, push);
  out = out.replace(EMAIL_RE, push);
  out = out.replace(ELLIPSIS_RE, push);
  out = out.replace(DATE_RE, push);
  out = out.replace(TIME_RE, push);
  out = out.replace(NUMBER_RE, push);
  out = out.replace(ABBREV_RE, push);
  out = out.replace(LATIN_INITIAL_RE, push);
  out = out.replace(HEBREW_INITIAL_RE, push);

  return { text: out, frames };
}

function restoreSpans(text, frames) {
  const re = new RegExp(`${PROTECT_OPEN}(\\d+)${PROTECT_CLOSE}`, "g");
  return text.replace(re, (_, id) => frames[Number(id)] ?? "");
}

function splitLineOnPunctuation(line) {
  // Reset RegExp lastIndex on each call since SPLIT_RE has /g.
  SPLIT_RE.lastIndex = 0;
  const parts = line.split(SPLIT_RE);
  // `split` with two capturing groups yields 3-tuples per split, so we step by 3.
  const sentences = [];
  for (let i = 0; i < parts.length; i += 3) {
    const body = parts[i] || "";
    const punct = parts[i + 1] || "";
    const s = (body + punct).trim();
    if (s) sentences.push(s);
  }
  return sentences;
}

function segment(source) {
  if (typeof source !== "string" || !source.trim()) return [];

  // Strip BIDI marks before protect/split — they're invisible and would
  // otherwise sit between sentence-final punctuation and the next space.
  const stripped = source.replace(BIDI_RE, "");
  const { text: protectedText, frames } = protectSpans(stripped);

  // Paragraph → line → sentence.
  const paragraphs = protectedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out = [];
  for (const para of paragraphs) {
    const lines = para
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const sentences = splitLineOnPunctuation(line);
      for (const s of sentences) {
        const restored = restoreSpans(s, frames).trim();
        if (restored) out.push(restored);
      }
    }
  }

  return out.map((he, i) => ({ index: i + 1, he }));
}

module.exports = {
  segment,
  // Exported for testing only.
  _internals: {
    HEBREW_ABBREVS,
    ENGLISH_ABBREVS,
    protectSpans,
    restoreSpans,
    splitLineOnPunctuation,
  },
};
