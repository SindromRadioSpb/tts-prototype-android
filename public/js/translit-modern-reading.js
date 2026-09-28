// Modern Israeli reading of pointed Hebrew before transliteration (O-033d, 2026-09-28).
//
// The transliteration library follows classical (Tiberian) rules: every word-initial sheva and
// every sheva after a long vowel is vocal, a quiescent aleph is a consonant, and the doubled
// consonant letters of full spelling (מצווה, שוויץ, אייל) are two letters. Learners hear modern
// speech, so the learner and Russian profiles read the pointed text through this pass first:
//   - a sheva the modern speaker pronounces becomes hataf segol ("e"), every other sheva stays
//     a sheva, which those profiles render as nothing;
//   - an aleph without a vowel of its own is dropped (hu, lo, yotse, Maya);
//   - a bare vav or yod right after a pointed one of the same letter is a spelling letter and
//     is dropped (mitsva, Shvayts, Eyal). This last rule is orthography, so SBL uses it too;
//   - a geresh after ג ז צ (ג'ינס, ז'ורנל, צ'יפס, מסאז') is moved in front of its letter as ׳, where
//     the library keeps it next to that letter's transliteration; the profile then reads the pair
//     as j/zh/ch. Also orthography, so every profile gets it.
// Only Hebrew words change; the text shown in the niqqud column is never touched.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TranslitModernReading = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SHEVA = "ְ", HATAF_SEGOL = "ֱ", DAGESH = "ּ";
  var GERESH = "׳";
  var WORD_RE = /[א-ת֑-ׇ׳]+/g;
  // ASCII apostrophe, right single quote or the Hebrew geresh, with points on either side.
  var GERESH_RE = /([גזצץ])([֑-ׇ]*)['’׳]([֑-ׇ]*)/g;
  var LETTER_RE = /[א-ת]/;
  // Full vowels (not sheva): hatafs, hiriq, tsere, segol, patah, qamats, holam, qubuts, qamats qatan.
  var VOWEL_RE = /[ֱ-ׇֻ]/;
  var PREFIX_LETTERS = "ובכלמשה";
  // Word-initial sheva under these is spoken: lesibuv, metuka, yeladim, nevu'a, re'uyim.
  var SPOKEN_FIRST = "ילמנרו";
  // ...and before these: pe'amim, behafta'a, beyakhad.
  var SPOKEN_BEFORE = "אהעי";
  var FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

  function base(letter) { return FINAL[letter] || letter; }
  // Neighbours a speaker cannot run together without a vowel: the same letter, b/v before v
  // (בְּוַעֲדַת beva'adat), a dental before a dental or sibilant (תְּצַיְּרִי tetsayri, דְּצֶמְבֶּר).
  var DENTAL = "תטד", DENTAL_NEXT = "תטדצסז";
  function alike(a, b) {
    a = base(a); b = base(b);
    return a === b || (a === "ב" && b === "ו") || (DENTAL.indexOf(a) >= 0 && DENTAL_NEXT.indexOf(b) >= 0);
  }

  function parse(word) {
    var out = [];
    Array.from(word.normalize("NFD")).forEach(function (ch) {
      // The geresh marker is its own unit so no rule attaches it to, or drops it with, a letter.
      if (LETTER_RE.test(ch) || ch === GERESH || !out.length) out.push({ ch: ch, marks: "" });
      else out[out.length - 1].marks += ch;
    });
    return out;
  }

  function join(letters) {
    return letters.map(function (l) { return l.ch + l.marks; }).join("").normalize("NFC");
  }

  function hasVowel(l) { return VOWEL_RE.test(l.marks); }
  function isBare(l) { return !/[֑-ׇ]/.test(l.marks); }

  // מִצְוָוה, שְׁוַויְיץ, אֱיָיל: the second, unpointed letter only marks the consonant in full spelling.
  function collapseDoubled(letters) {
    return letters.filter(function (l, i) {
      var prev = letters[i - 1];
      if (!prev || i === letters.length - 1 || !isBare(l) || (l.ch !== "ו" && l.ch !== "י") || prev.ch !== l.ch) return true;
      // After a yod with hiriq the bare yod is that vowel's mater (חַיִּים, הָיִיתִי), not a doubling.
      var vowels = l.ch === "י" ? /[ֱ-ֳֵ-ָֻ]/ : /[ֱ-ָֻ]/;
      var consonantal = prev.marks.indexOf(SHEVA) >= 0 || vowels.test(prev.marks);
      return !consonantal;
    });
  }

  // An aleph with no vowel of its own is not pronounced, except as the onset of a vowel vav (לְאוֹר).
  function dropQuiescentAleph(letters) {
    return letters.filter(function (l, i) {
      if (l.ch !== "א" || i === 0 || !isBare(l)) return true;
      var next = letters[i + 1];
      var vowelVav = next && next.ch === "ו" && /^[ֹּ]+$/.test(next.marks);
      return !!vowelVav;
    });
  }

  // Where the word itself begins: after proclitics that took a full vowel and doubled the next
  // letter (the article and its partners: הַקְּ, לַקְּ, שֶׁלְּ, מֵהַ...).
  function stemStart(letters) {
    var s = 0;
    while (s < letters.length - 2 && s < 3) {
      var l = letters[s], next = letters[s + 1];
      if (PREFIX_LETTERS.indexOf(l.ch) < 0 || !hasVowel(l)) break;
      var doubled = next.marks.indexOf(DAGESH) >= 0 && next.ch !== "ו";
      var article = next.ch === "ה" && /[ַָ]/.test(next.marks);
      if (!doubled && !article) break;
      s++;
    }
    return s;
  }

  // Loanwords whose doubled letter is one long consonant, not two with a vowel between (yalla,
  // not yalela). Keyed by the bare consonants; grows only from reviewed words.
  var GEMINATE_LOANS = { "יאללה": 1, "וואללה": 1, "ואללה": 1, "אללה": 1 };

  function modernSheva(letters, consonants) {
    // A word with no full vowel at all is an interjection (שְׁשְׁשׁ): leave it as the library reads it.
    var voiced = letters.some(function (l) { return hasVowel(l) || (l.ch === "ו" && /[ֹּ]/.test(l.marks)); });
    if (!voiced) return letters;
    var n = letters.length, s = stemStart(letters), spokenPrev = null;
    var geminateLoan = GEMINATE_LOANS[consonants] === 1;
    return letters.map(function (l, i) {
      if (l.marks.indexOf(SHEVA) < 0) { spokenPrev = null; return l; }
      var next = letters[i + 1];
      var spoken = false;
      if (next && i < n - 1) {
        if (i === s && (SPOKEN_FIRST.indexOf(l.ch) >= 0 || SPOKEN_BEFORE.indexOf(next.ch) >= 0 || alike(l.ch, next.ch))) spoken = true;
        else if (spokenPrev === false) spoken = true; // the second of two shevas
        else if (base(next.ch) === base(l.ch) && !geminateLoan) spoken = true; // שׁוּחְרְרוּ, before the same letter
      }
      spokenPrev = spoken;
      return spoken ? { ch: l.ch, marks: l.marks.replace(SHEVA, HATAF_SEGOL) } : l;
    });
  }

  function prepareWord(word, opts) {
    var letters = parse(word);
    var consonants = letters.map(function (l) { return l.ch; }).join("");
    if (opts.doubled !== false) letters = collapseDoubled(letters);
    if (opts.aleph) letters = dropQuiescentAleph(letters);
    if (opts.sheva) letters = modernSheva(letters, consonants);
    return join(letters);
  }

  // opts: { sheva, aleph } for modern learner/Russian reading; doubled letters always collapse
  // unless opts.doubled === false.
  // Gershayim inside an abbreviation (צה״ל, צה"ל) is spelling, not a sound: the word is read whole.
  var GERSHAYIM_RE = /([א-ת][֑-ׇ]*)[״"]([א-ת])/g;

  function markGeresh(text) {
    return text.replace(GERESH_RE, function (_whole, letter, before, after) { return GERESH + letter + before + after; })
      .replace(GERSHAYIM_RE, "$1$2");
  }

  function prepare(text, options) {
    var opts = options || {};
    return markGeresh(String(text == null ? "" : text).normalize("NFD")).normalize("NFC").replace(WORD_RE, function (word) { return prepareWord(word, opts); });
  }

  return { prepare: prepare, GERESH: GERESH, VERSION: "modern-reading-v2" };
});
