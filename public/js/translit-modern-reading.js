// Modern Israeli reading of pointed Hebrew before transliteration (O-033d, 2026-09-28).
//
// The transliteration library follows classical (Tiberian) rules: every word-initial sheva and
// every sheva after a long vowel is vocal, a quiescent aleph is a consonant, and the doubled
// consonant letters of full spelling (מצווה, שוויץ, אייל) are two letters. Learners hear modern
// speech, so the learner and Russian profiles read the pointed text through this pass first:
//   - a sheva the modern speaker pronounces becomes hataf segol ("e"), every other sheva stays
//     a sheva, which those profiles render as nothing. A ב/כ with sheva at the start of the word
//     is the prefix (bemahalakh) unless Pealim reads the word with that letter in a cluster
//     (bgadim, kvar: translit-cluster-words.js); an unknown word counts as prefixed;
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
  // An internal marker must not collide with a real Hebrew apostrophe/quotation.
  var GERESH = "\uE001";
  var WORD_RE = /[א-ת\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\uE001]+/g;
  // ASCII apostrophe, right single quote or the Hebrew geresh, with points on either side.
  var GERESH_RE = /([גזצץ])([\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]*)['’׳]([\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]*)/g;
  var LETTER_RE = /[א-ת]/;
  // Full vowels (not sheva): hatafs, hiriq, tsere, segol, patah, qamats, holam, qubuts, qamats qatan.
  var VOWEL_RE = /[ֱ-ׇֻ]/;
  var PREFIX_LETTERS = "ובכלמשה";
  // Word-initial sheva under these is spoken: lesibuv, metuka, yeladim, nevu'a, re'uyim.
  var SPOKEN_FIRST = "ילמנרו";
  // ...and before these: pe'amim, behafta'a, beyakhad.
  var SPOKEN_BEFORE = "אהעי";
  var FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  var CLUSTER_WORDS = {};
  (function () {
    var list = null;
    try { list = typeof require === "function" ? require("./translit-cluster-words.js") : null; } catch (_) { list = null; }
    if (!list && typeof globalThis !== "undefined") list = globalThis.TranslitClusterWords;
    (list || []).forEach(function (w) { CLUSTER_WORDS[w] = 1; });
  })();

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
  function isBare(l) { return !/[ְ-ׇּׁׂ]/.test(l.marks); }

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

  // Where the word itself begins: after the conjunction וּ and after proclitics that took a full
  // vowel and doubled the next letter (the article and its partners: הַקְּ, לַקְּ, שֶׁלְּ, מֵהַ...).
  // `prepositional`: the stem may still open with the prepositions ב/כ — nothing before it but וּ
  // and שֶׁ; after the article (הַבְּגָדִים) the ב/כ can only be a root letter.
  function stemStart(letters) {
    var s = 0, prepositional = true;
    if (letters.length > 2 && letters[0].ch === "ו" &&
        (letters[0].marks === DAGESH || letters[0].marks.indexOf(SHEVA) >= 0)) s = 1;
    var limit = s + 3;
    while (s < letters.length - 2 && s < limit) {
      var l = letters[s], next = letters[s + 1];
      if (PREFIX_LETTERS.indexOf(l.ch) < 0 || !hasVowel(l)) break;
      var doubled = next.marks.indexOf(DAGESH) >= 0 && next.ch !== "ו";
      var article = next.ch === "ה" && /[ַָ]/.test(next.marks);
      if (!doubled && !article) break;
      if (l.ch !== "ש") prepositional = false;
      s++;
    }
    return { s: s, prepositional: prepositional };
  }

  function skeleton(letters) {
    return letters.filter(function (l) { return LETTER_RE.test(l.ch); }).map(function (l) { return base(l.ch); }).join("")
      .replace(/וו/g, "ו").replace(/יי/g, "י");
  }

  // Is the ב/כ with sheva opening the stem a preposition (bemahalakh), not a root letter (bgadim)?
  // Read from the word as written, before letters are dropped. כְּשֶׁ is the conjunction "kshe".
  function prefixAtStem(letters) {
    var st = stemStart(letters), l = letters[st.s], next = letters[st.s + 1];
    if (!st.prepositional || !next || (l.ch !== "ב" && l.ch !== "כ") || l.marks.indexOf(SHEVA) < 0) return false;
    if (l.ch === "כ" && next.ch === "ש" && next.marks.indexOf("ֶ") >= 0) return false;
    return CLUSTER_WORDS[skeleton(letters.slice(st.s))] !== 1;
  }

  // Loanwords whose doubled letter is one long consonant, not two with a vowel between (yalla,
  // not yalela). Keyed by the bare consonants; grows only from reviewed words.
  var GEMINATE_LOANS = { "יאללה": 1, "וואללה": 1, "ואללה": 1, "אללה": 1 };

  function modernSheva(letters, consonants, prefixed) {
    // A word with no full vowel at all is an interjection (שְׁשְׁשׁ): leave it as the library reads it.
    var voiced = letters.some(function (l) { return hasVowel(l) || (l.ch === "ו" && /[ֹּ]/.test(l.marks)); });
    if (!voiced) return letters;
    var n = letters.length, s = stemStart(letters).s, spokenPrev = null;
    var geminateLoan = GEMINATE_LOANS[consonants] === 1;
    // של + a pronominal suffix is a single possessive form, not שֶ + a new stem.
    // Keep this morphology distinct from the article rule (הַלְּ..., שֶׁלְּמַ...).
    var possessive = /^(?:ו)?של(?:ך|כם|כן|הם|הן)$/.test(consonants);
    return letters.map(function (l, i) {
      if (l.marks.indexOf(SHEVA) < 0) { spokenPrev = null; return l; }
      var next = letters[i + 1];
      var spoken = false;
      if (next && i < n - 1) {
        if (l.shevaReading != null) spoken = l.shevaReading;
        else if (l.ch === "ו" && i === 0) spoken = true;
        else if (possessive && l.ch === "ל" && letters[i - 1] && letters[i - 1].ch === "ש" && letters[i - 1].marks.indexOf("ֶ") >= 0) spoken = false;
        else if (i === s && (prefixed || SPOKEN_FIRST.indexOf(l.ch) >= 0 || SPOKEN_BEFORE.indexOf(next.ch) >= 0 || alike(l.ch, next.ch))) spoken = true;
        else if (spokenPrev === false) spoken = true; // the second of two shevas
        else if (base(next.ch) === base(l.ch) && !geminateLoan) spoken = true; // שׁוּחְרְרוּ, before the same letter
      }
      spokenPrev = spoken;
      return spoken ? { ch: l.ch, marks: l.marks.replace(SHEVA, HATAF_SEGOL) } : l;
    });
  }

  function prepareWord(word, opts) {
    var letters = parse(word);
    if (opts.wordReading) {
      opts.wordReading(word).forEach(function (d) {
        if (letters[d[0]] && (d[1] === "e" || d[1] === "s")) letters[d[0]].shevaReading = d[1] === "e";
      });
    }
    var consonants = letters.map(function (l) { return l.ch; }).join("");
    var prefixed = !!opts.sheva && prefixAtStem(letters);
    if (opts.doubled !== false) letters = collapseDoubled(letters);
    if (opts.aleph) letters = dropQuiescentAleph(letters);
    if (opts.sheva) letters = modernSheva(letters, consonants, prefixed);
    return join(letters);
  }

  // opts: { sheva, aleph } for modern learner/Russian reading; doubled letters always collapse
  // unless opts.doubled === false.
  // Gershayim inside an abbreviation (צה״ל, צה"ל) is spelling, not a sound: the word is read whole.
  var GERSHAYIM_RE = /([א-ת][\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]*)[״"]([א-ת])/g;

  function markGeresh(text) {
    return text.replace(GERESH_RE, function (_whole, letter, before, after) { return GERESH + letter + before + after; })
      .replace(GERSHAYIM_RE, "$1$2");
  }

  function prepare(text, options) {
    var opts = options || {};
    return markGeresh(String(text == null ? "" : text).normalize("NFD")).normalize("NFC").replace(WORD_RE, function (word) { return prepareWord(word, opts); });
  }

  return { prepare: prepare, GERESH: GERESH, VERSION: "modern-reading-v4-boundaries" };
});
