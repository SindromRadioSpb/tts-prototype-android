// public/js/reader-morph.js — BRR-P1-011 · Reading-Room light morphology-on-tap.
//
// The learner layer for the Reading Room (library.html): tap a Hebrew word in the
// embedded reader -> a LIGHT card with root . binyan . POS . Russian gloss . HONEST
// provenance . direct Pealim link. The #1 project moat (deep morphology inside
// reading) finally lands in the Room — offline-first, no Studio chrome dragged in.
//
// ── Parity-safe ────────────────────────────────────────────────────────────
// reader-core.buildBilingualTableHtml is byte-parity-gated (smoke:reader-parity).
// This module NEVER touches that builder: word-wrapping is a Room-only POST-render
// DOM transform applied AFTER reader-core.openText paints the table. The pure HTML
// builder stays byte-identical -> the parity golden is untouched.
//
// ── Offline resolver spine (validated against the real 9279-paradigm dataset) ──
// The honesty-graded resolver (NotesAutoGen.resolveContentUnit) keys on the VOCALIZED
// form via formFirstResolve/formIdx — the decisive homograph signal — and works with
// an empty-POS unit. Baked corpus rows carry he_niqqud, so the spine is:
//   tokenize(he)+align(he_niqqud) -> {surface, niqqud}
//   -> pickBaseParadigm + resolveContentUnit  (against InflectionDict's 9279 paradigms)
//   -> enrich binyan/pos/url from the pealim_id->paradigm map.
// No Dicta and no MorphProvider in v1 (they are opt-in upgrades). R1: form-first never
// fabricates — ambiguous/unknown -> honest "подобрано" / "не определено офлайн".
//
// Dual export: window.ReaderMorph (browser) + module.exports (Node tests). The pure
// core (tokenize / alignSurfaceNiqqud / resolveCore / provenanceLabel) has NO DOM /
// window / network deps so tests/premium/readerMorph.test.js can run it in Node
// against the shipped dataset.

(function () {
  "use strict";

  // ── Hebrew tokenization ────────────────────────────────────────────────────
  // Word char = Hebrew letter incl. final forms (U+05D0..05EA) + niqqud/accents
  // (U+0591..05BD, 05BF, 05C1, 05C2, 05C4, 05C5, 05C7) + geresh/gershayim (U+05F3,
  // 05F4, intra-word in acronyms). DELIBERATELY EXCLUDED as separators: maqaf U+05BE,
  // paseq U+05C0, sof-pasuq U+05C3, nun-hafukha U+05C6 — so each member of a compound
  // is its own tappable token. Numeric check (not a regex range) so maqaf can't sneak in.
  function isWordChar(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x05d0 && c <= 0x05ea) ||   // letters
           (c >= 0x0591 && c <= 0x05bd) ||   // accents + niqqud (excl. maqaf 0x05BE)
           c === 0x05bf ||                    // rafe
           c === 0x05c1 || c === 0x05c2 ||    // shin/sin dot (excl. paseq 0x05C0)
           c === 0x05c4 || c === 0x05c5 ||    // upper/lower dot (excl. sof-pasuq 0x05C3)
           c === 0x05c7 ||                    // qamats qatan (excl. nun-hafukha 0x05C6)
           c === 0x05f3 || c === 0x05f4;      // geresh / gershayim
  }
  // Skeleton stripper — IDENTICAL range to notes-autogen.stripNiqqud (U+0591..05C7) so
  // surface skeletons match the resolver's formIdx / alias keys exactly.
  var NIQQUD_RE = /[֑-ׇ]/g;

  function stripNiqqud(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim(); }

  // -> [{ text, start, end, isWord }] spanning the WHOLE string (words + separators),
  // so a caller can rebuild innerHTML losslessly (wrap words, keep separators verbatim).
  function tokenize(str) {
    str = String(str == null ? "" : str);
    var toks = [], i = 0, n = str.length;
    while (i < n) {
      var isW = isWordChar(str[i]);
      var j = i + 1;
      while (j < n && isWordChar(str[j]) === isW) j++;
      toks.push({ text: str.slice(i, j), start: i, end: j, isWord: isW });
      i = j;
    }
    return toks;
  }

  // Just the word strings (skeleton tokenization), in order.
  function words(str) {
    var out = [];
    var toks = tokenize(str);
    for (var i = 0; i < toks.length; i++) if (toks[i].isWord) out.push(toks[i].text);
    return out;
  }

  // Pair each consonantal HE word with its vocalized form from he_niqqud. Same words,
  // same order; align by index, with a small look-ahead recovery (<=3) keyed on the
  // consonantal skeleton when niqqud tokenization drifts. Missing niqqud -> "" (the
  // resolver degrades to surface-alias lookup, honestly lower-confidence).
  function alignSurfaceNiqqud(heStr, niqqudStr) {
    var he = words(heStr);
    var nq = words(niqqudStr);
    var out = [], j = 0;
    for (var i = 0; i < he.length; i++) {
      var s = he[i], paired = "";
      if (j < nq.length && stripNiqqud(nq[j]) === s) { paired = nq[j]; j++; }
      else {
        var k = j;
        while (k < nq.length && k < j + 3 && stripNiqqud(nq[k]) !== s) k++;
        if (k < nq.length && k < j + 3 && stripNiqqud(nq[k]) === s) { paired = nq[k]; j = k + 1; }
      }
      out.push({ surface: s, niqqud: paired });
    }
    return out;
  }

  // ── Provenance label (R1 honesty) ──────────────────────────────────────────
  // Maps the resolver's channel/confidence/status to one of a SMALL set of honest
  // buckets. The card renders the bucket as a badge; "exact" is the only one that
  // claims certainty, and it is reserved for the decisive form-first / formHit cases.
  //   exact     — vocalized form IS a paradigm cell (form-first) or paradigm+formHit
  //   likely    — paradigm hit with a real gloss but no decisive form match
  //   guessed   — heuristic gloss-fallback (real gloss, but could be a homograph)
  //   function  — closed-class / function word (no triliteral root by design)
  //   unknown   — not resolved offline (honest empty; offer online refine)
  function _functionPos() {
    try { if (typeof window !== "undefined" && window.NotesAutoGen) return window.NotesAutoGen.FUNCTION_POS; } catch (_) {}
    try { if (typeof module !== "undefined" && module.exports) return require("./notes-autogen.js").FUNCTION_POS; } catch (_) {}
    return null;
  }

  // ── R10 honest-gloss gate (offline, deterministic) ─────────────────────────
  // Closed-class & segmentable function forms are HOMOGRAPH TRAPS for an isolated
  // form-first resolver: עלינו→«лист» (עלה), אין→«уничтожить», לנו→«ночевать» (לון).
  // When a tapped word is a function form we assert ONLY an honest closed-class
  // reading and suppress the wrong content paradigm/gloss/direct-link. Measured on
  // real text (work 34704): this recovers 77% of the function-word error budget vs
  // 46% for the flat stoplist alone, at <1% false-positive. Lists are consonantal
  // (niqqud-stripped); every curated gloss is hand-verified (R1 — no fabrication).
  var FUNCTION_GLOSS = {
    // closed-class singles (incl. homograph traps)
    "אין": "нет, не имеется", "יש": "есть, имеется", "את": "(винит. падеж); ты (ж.р.)",
    "של": "(принадлежность), род. падеж", "על": "на, о", "אל": "к", "עם": "с",
    "כי": "потому что; что", "אם": "если", "אשר": "который", "גם": "также", "רק": "только",
    "כל": "каждый, весь", "אך": "но, лишь", "אבל": "но", "או": "или", "לא": "не", "כן": "да",
    "כך": "так", "אז": "тогда", "עוד": "ещё", "כבר": "уже", "מאוד": "очень", "אצל": "у",
    "בין": "между", "עד": "до", "אלא": "а, но (после отрицания)", "כמו": "как",
    "טרם": "ещё не; прежде", "בלי": "без", "בעד": "за", "נגד": "против", "תחת": "под",
    "למען": "ради", "זה": "это, этот", "זאת": "это, эта", "זו": "эта", "אלה": "эти",
    "אלו": "эти", "מה": "что", "מי": "кто", "הוא": "он", "היא": "она", "הם": "они (м.р.)",
    "הן": "они (ж.р.); ведь", "אני": "я", "אתה": "ты (м.р.)", "אתם": "вы (м.р.)",
    "אתן": "вы (ж.р.)", "אנחנו": "мы", "אנו": "мы", "פה": "здесь", "כאן": "здесь",
    "שם": "там", "אף": "также не; даже; нос", "אולם": "однако; зал", "כדי": "чтобы",
    "מפני": "из-за; перед", "כנגד": "против; напротив", "לפני": "перед, до",
    "אחרי": "после", "בתוך": "внутри", "בקרב": "среди", "מתוך": "из", "לבין": "между",
    "הרי": "ведь, вот", "כלל": "вовсе; вообще", "יותר": "больше, более", "פחות": "меньше",
    "כגון": "как например", "זולת": "кроме", "ליד": "рядом с", "בלעדי": "без",
    "זהו": "это; это он", "זוהי": "это; это она", "שבו": "в котором", "שבה": "в которой",
    "שבהם": "в которых (м.)", "שבהן": "в которых (ж.)", "מישהו": "кто-то", "משהו": "что-то",
    "כלשהו": "какой-либо", "איזה": "какой", "כמה": "сколько; несколько", "הכל": "всё",
    "הכול": "всё", "אינו": "не (он)", "אינה": "не (она)", "אינם": "не (они м.)",
    "אינן": "не (они ж.)", "איני": "я не", "כלפי": "по отношению к",
    "מן": "от, из", "כה": "так, столь", "במקום": "вместо; на месте", "היטב": "хорошо, как следует",
    "בהחלט": "совершенно, безусловно", "לכאורה": "на первый взгляд, якобы", "ביחוד": "в особенности",
    "הלא": "разве не; ведь", "כלומר": "то есть", "אילו": "если бы; которые", "בעצם": "по сути",
    "בכלל": "вообще", "ממש": "прямо, действительно", "אגב": "кстати; попутно",
    "בפרט": "в частности", "לחלוטין": "совершенно", "היינו": "то есть, а именно",
    "אפילו": "даже", "אפלו": "даже", "בלבד": "только, исключительно",
    "דווקא": "именно; как раз", "דוקא": "именно; как раз", "מאד": "очень",
    "כמובן": "конечно", "למשל": "например", "אולי": "может быть", "כנראה": "по-видимому",
    "בוודאי": "конечно, наверняка", "לפיכך": "поэтому", "אמנם": "хотя; правда",
    "היות": "поскольку", "משום": "из-за; потому что", "הללו": "эти", "האלו": "эти",
    "האלה": "эти", "הזה": "этот", "הזאת": "эта", "הזו": "эта",
    // preposition + pronominal suffix (frequent, hand-verified)
    "עלי": "на меня", "עליך": "на тебя", "עליו": "на него", "עליה": "на неё",
    "עלינו": "на нас", "עליכם": "на вас", "עליהם": "на них (м.)", "עליהן": "на них (ж.)",
    "אלי": "ко мне", "אליך": "к тебе", "אליו": "к нему", "אליה": "к ней", "אלינו": "к нам",
    "אליהם": "к ним (м.)", "אליהן": "к ним (ж.)",
    "שלי": "мой", "שלך": "твой", "שלו": "его", "שלה": "её", "שלנו": "наш",
    "שלכם": "ваш (м.)", "שלכן": "ваш (ж.)", "שלהם": "их (м.)", "שלהן": "их (ж.)",
    "לי": "мне", "לך": "тебе", "לו": "ему; если бы", "לה": "ей", "לנו": "нам",
    "לכם": "вам (м.)", "לכן": "вам (ж.); поэтому", "להם": "им (м.)", "להן": "им (ж.)",
    "בו": "в нём", "בה": "в ней", "בהם": "в них (м.)", "בהן": "в них (ж.)", "בנו": "в нас",
    "בכם": "в вас", "בי": "во мне",
    "אצלי": "у меня", "אצלו": "у него", "אצלה": "у неё", "אצלנו": "у нас",
    "אצלם": "у них", "אצלכם": "у вас",
    "ממני": "от меня", "ממך": "от тебя", "ממנו": "от него; от нас", "ממנה": "от неё",
    "מהם": "от них (м.)", "מהן": "от них (ж.)", "מכם": "от вас",
    "אותי": "меня", "אותך": "тебя", "אותו": "его; тот", "אותה": "её; та", "אותנו": "нас",
    "אותם": "их (м.); те", "אותן": "их (ж.); те", "אתכם": "вас (м.)",
    "ביניהם": "между ними (м.)", "ביניהן": "между ними (ж.)", "בינינו": "между нами",
    "כמוני": "как я", "כמוך": "как ты", "כמוהו": "как он", "כמונו": "как мы",
    "נגדו": "против него", "נגדם": "против них", "כנגדו": "против него",
    // R1-tail L1: «над/вокруг X» — yod plural-construct prep forms, distinct from the nouns
    // מַעֲלָה «ступень» / סְבִיבָה «среда» (which lack the yod / take ה) → no over-trigger.
    "מעליו": "над ним", "מעליה": "над ней", "מעליך": "над тобой", "מעליהם": "над ними (м.)",
    "מעליהן": "над ними (ж.)", "מעלינו": "над нами", "מעליכם": "над вами",
    "סביבי": "вокруг меня", "סביבו": "вокруг него", "סביבך": "вокруг тебя", "סביבם": "вокруг них (м.)",
    "סביבן": "вокруг них (ж.)", "סביבנו": "вокруг нас", "סביבכם": "вокруг вас",
    // reflexive עצם + suffix
    "עצמי": "сам, себя", "עצמך": "сам, себя", "עצמו": "сам, себя", "עצמה": "сама, себя",
    "עצמנו": "мы сами", "עצמם": "они сами (м.)", "עצמן": "они сами (ж.)", "עצמכם": "вы сами",
    "לעצמו": "себе, для себя", "לעצמה": "себе, для себя", "לעצמם": "себе, для себя",
  };
  var NUM_GLOSS = {
    "אחד": "один", "אחת": "одна", "שתי": "две (сопряж.)", "שתיים": "две", "שניים": "два",
    "שלוש": "три", "שלושה": "три", "ארבע": "четыре", "ארבעה": "четыре",
    "חמש": "пять", "חמישה": "пять", "שש": "шесть", "שישה": "шесть", "שבע": "семь",
    "שבעה": "семь", "שמונה": "восемь", "תשע": "девять", "תשעה": "девять", "עשר": "десять",
    "עשרה": "десять", "ראשון": "первый", "ראשונה": "первая", "ראשונים": "первые",
    "ראשונות": "первые", "שלישי": "третий", "רביעי": "четвёртый", "חמישי": "пятый",
  };
  // Preposition/reflexive bases (consonantal, length ≥ 2) that take pronominal suffixes.
  // Single-letter bases (ב/כ/ל/מ) are EXCLUDED — they collide with word-initial letters
  // (לִבֵּנוּ = «наше сердце», NOT a preposition). Their suffixed forms are listed verbatim
  // in FUNCTION_GLOSS instead (לי/לו/בו/…), so precision stays high.
  var PREP_SUF_BASE = ["על", "אל", "של", "אצל", "בין", "כמו", "נגד", "כנגד", "תחת",
    "בעד", "לפני", "אחרי", "מפני", "בתוך", "בקרב", "למען", "בלעדי", "זולת", "לעצמ", "עצמ", "כלפי",
    // R1-tail L1: inflected prepositions the gold pass flagged as false-exact «точно» (noun).
    // ONLY bases with no common noun-homograph via a short suffix. (סביב→סביבה «среда»,
    // בפני→בפנים «внутри», מעל→מעלה «ступень» over-trigger → handled as flat forms below, not here.)
    "לקראת", "בשביל"];
  var PRON_SUF = ["נו", "כם", "כן", "הם", "הן", "יו", "יה", "יהם", "יהן", "ינו", "יכם",
    "ני", "הו", "יך", "י", "ך", "ו", "ה", "ם", "ן"];

  // Normalize Hebrew final-form letters to medial so a base stored in final form (בְּתוֹך) still
  // prefix-matches its suffixed form, where the letter turns medial (בְּתוֹכוֹ). Without this the
  // prep+suf gate missed every final-letter base → false-exact «точно» (R1-tail L1).
  function finalToMedial(s) {
    return String(s || "").replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ");
  }
  // Classify a (niqqud-stripped) surface as a function form. Returns {isFunc, via, gloss, pos}.
  // Deterministic: a flat-map hit, a numeral, or a base(≥2)+pronominal-suffix segmentation
  // (optionally after stripping ONE leading proclitic ו/ש/ה/כ/ל from a ≥5-letter word).
  function functionGate(stripped) {
    var w = String(stripped || "");
    if (!w) return { isFunc: false };
    if (Object.prototype.hasOwnProperty.call(FUNCTION_GLOSS, w))
      return { isFunc: true, via: "flat", gloss: FUNCTION_GLOSS[w], pos: "particle" };
    if (Object.prototype.hasOwnProperty.call(NUM_GLOSS, w))
      return { isFunc: true, via: "numeral", gloss: NUM_GLOSS[w], pos: "numeral" };
    // definite article ה + numeral (הָאֶחָד, הָרִאשׁוֹנָה) — ה+numeral is reliably a definite
    // numeral (NUM-only keeps this safe: ה+content-noun never enters the closed numeral list).
    if (w.length > 2 && w.charAt(0) === "ה" && Object.prototype.hasOwnProperty.call(NUM_GLOSS, w.slice(1)))
      return { isFunc: true, via: "art+num", gloss: NUM_GLOSS[w.slice(1)], pos: "numeral" };
    var cands = [w];
    // strip ONE leading proclitic, then retest. Only ו/ש (and/that) — the safest: rarely
    // content-initial. ל/כ/ה are NOT stripped here: ל+gerund forms a content infinitive
    // (לִהְיוֹת=«быть», not «поскольку»), ה+noun a content noun (הַשֵּׁם=«имя»). Requires ≥4 letters.
    if (/^[וש]/.test(w) && w.length >= 4) cands.push(w.slice(1));
    for (var ci = 0; ci < cands.length; ci++) {
      var c = cands[ci];
      if (ci > 0 && Object.prototype.hasOwnProperty.call(FUNCTION_GLOSS, c))
        return { isFunc: true, via: "proclitic", gloss: FUNCTION_GLOSS[c], pos: "particle" };
      for (var bi = 0; bi < PREP_SUF_BASE.length; bi++) {
        var base = PREP_SUF_BASE[bi];
        if (c.length <= base.length || finalToMedial(c.slice(0, base.length)) !== finalToMedial(base)) continue;
        var rest = c.slice(base.length);
        for (var si = 0; si < PRON_SUF.length; si++) {
          if (rest === PRON_SUF[si]) {
            var isRefl = base === "עצמ" || base === "לעצמ";
            return { isFunc: true, via: isRefl ? "reflexive" : "prep+suf", gloss: "",
              pos: isRefl ? "pronoun" : "preposition" };
          }
        }
      }
    }
    return { isFunc: false };
  }

  // ── Tier-3 context disambiguation (opt-in «точный режим») ───────────────────
  // The offline form-first resolver reads a word in isolation. Some homographs need
  // SENTENCE context: (A) genuine vocalization homographs whose niqqud differs
  // (סֵפֶר «book» vs סִפֵּר «told», שֵׁנִי «second» vs שָׁנִי «crimson») — feeding the
  // context niqqud picks the right paradigm; (B) same-niqqud / POS-only readings whose
  // contextual sense has NO offline Pealim entry (הַיּוֹם «day»→«today», מְעַט «to diminish»→
  // «little») — niqqud can't help, only Dicta's POS can. Measured (.tmp/context-mode-verify):
  // naive niqqud-feeding fixes type-A but can REGRESS type-B (היום «сегодня»→«день»). So we
  // (1) feed niqqud only when Dicta's CONTENT POS agrees with the resulting paradigm, and
  // (2) for adverbial/function readings supply a small curated context-gloss. R1: shown only
  // when Dicta context confirms the POS; badge «контекст (Dicta)» — machine, not native.
  // Curated context glosses (R1-honest): used ONLY when Dicta confirms a function POS in
  // context, so these never override a legitimate content reading of the same skeleton
  // (עד «свидетель» noun stays a noun unless Dicta says it's the preposition here).
  var CONTEXT_GLOSS = {
    "היום": "сегодня", "מעט": "мало, немного", "מספיק": "достаточно", "הרבה": "много",
    "פעם": "однажды; раз", "כמעט": "почти", "ממש": "прямо, действительно", "דווקא": "именно",
    // Epic-1 tail — high-frequency adverbial/function homographs (Dicta-POS-gated).
    "עד": "до, вплоть до", "באמת": "действительно, в самом деле", "להפך": "наоборот, напротив",
    "בדיוק": "точно, как раз", "לפחות": "по крайней мере", "בכלל": "вообще", "אמנם": "правда, хотя",
    "בעצם": "по сути, собственно", "לגמרי": "совершенно, полностью", "כבר": "уже",
  };
  function _isContentPos(p) { return p === "noun" || p === "verb" || p === "adjective"; }
  function _isFuncPos(p) {
    return p === "adverb" || p === "preposition" || p === "conjunction" || p === "pronoun" ||
      p === "negation" || p === "interjection" || p === "particle" || p === "numeral" || p === "interrogative";
  }
  // Pure decision (Node-testable): given the OFFLINE card (corpus niqqud), the CONTEXT card
  // (resolved with Dicta's context niqqud), the Dicta token, and the stripped surface →
  // choose. Returns {use:"offline"|"context"|"gloss", gloss?, pos?}. R10: never regress —
  // accept context only when STRICTLY more decisive AND Dicta's POS agrees with the reading.
  function pickContextReading(offlineCard, ctxCard, ctx, surface) {
    var pos = (ctx && ctx.posDicta) || "";
    var s = stripNiqqud(surface || "");
    // (B) Dicta says this is a FUNCTION word in context. Take the function reading when we
    // either have a curated gloss for it OR the offline resolver asserted a CONTENT reading
    // (an homograph trap: וְעַד noun→prep, בֶּאֱמֶת noun→adverb). Trusting the context POS we
    // suppress the wrong content gloss/root/table; gloss is curated when known, else POS-only
    // (never a fabricated content gloss). R1: shown under the «контекст (Dicta)» machine badge.
    if (_isFuncPos(pos) && (Object.prototype.hasOwnProperty.call(CONTEXT_GLOSS, s) || _isContentPos(offlineCard.pos || "")))
      return { use: "gloss", gloss: CONTEXT_GLOSS[s] || "", pos: pos };
    // (A) content homograph: accept the context-niqqud reading only if it is decisive,
    // Dicta's content POS matches the resolved POS, and it actually differs from offline.
    if (ctxCard && (ctxCard.label === "exact" || ctxCard.label === "likely") && ctxCard.meaning &&
      _isContentPos(pos) && pos === (ctxCard.pos || "") &&
      String(ctxCard.pealim_id || "") !== String(offlineCard.pealim_id || ""))
      return { use: "context" };
    // (C) Dicta's CONTENT POS disagrees with the offline content reading on the verb↔nominal
    // axis (a participle↔noun homograph: הַמֵּת/הוֹרָה/הָעוֹלִים — offline form-matches the verb,
    // Dicta reads a noun). We can't produce the noun's gloss offline, so we keep the (related)
    // offline reading but SOFTEN it — «точно» becomes «вероятно» (no more false certainty).
    if (_isContentPos(pos) && _isContentPos(offlineCard.pos || "") &&
      (pos === "verb") !== ((offlineCard.pos || "") === "verb"))
      return { use: "soften", pos: pos };
    return { use: "offline" };   // no confident improvement → keep offline (no regression)
  }

  function provenanceLabel(r, pos) {
    if (!r) return "unknown";
    // «точно» only for a DECISIVE form-first cell. A multi-id (ambiguous) cell is a guess
    // among homographs → it falls through to «вероятно» (+ «возможно также» in the card).
    if (r.channel === "form-first" && !r.ambiguous) return "exact";
    if (r.channel === "paradigm" && r.confidence >= 0.85) return "exact";
    var FN = _functionPos();
    if (FN && pos && FN.has(pos) && !r.meaning) return "function";
    if (r.meaning && r.confidence >= 0.65 && r.status === "ok") return "likely";
    if (r.meaning) return "guessed";
    return "unknown";
  }

  // ── Pure resolver core (Node-testable) ─────────────────────────────────────
  // eng = { NA, maps, lookup, pidMap }. NA = NotesAutoGen API; maps = buildResolverMaps
  // output; lookup(key,binyan) = InflectionDict.lookup-equivalent; pidMap = pealim_id ->
  // paradigm. Returns the light-card payload. R1: meaning/root are honest-empty when
  // the resolver can't decide.
  // Definite-article variant: a Hebrew word's most common proclitic is the definite
  // article ה (U+05D4), which geminates the next consonant with a dagesh (הַשַּׁחַר).
  // The resolver's own proclitic-strip keeps that dagesh, so the bare form misses the
  // paradigm cell. This strips ה + its vowels AND drops the gemination dagesh on the
  // first remaining consonant (הַשַּׁחַר -> שַׁחַר) so form-first can match. Returns "" when
  // the word does not begin with ה. (ו/ב/כ/ל proclitics are already handled by the
  // resolver's own strip; ה is the one needing dagesh removal.)
  function articleStrippedForm(niqqud) {
    var s = String(niqqud || "");
    if (s.charCodeAt(0) !== 0x05d4) return "";              // must start with ה
    var i = 1;
    while (i < s.length && s.charCodeAt(i) >= 0x0591 && s.charCodeAt(i) <= 0x05c7) i++;
    if (i >= s.length) return "";
    var rest = s.slice(i).replace(/^([א-ת])([֑-ׇ]*)/, function (_, cons, marks) {
      return cons + marks.replace(/ּ/, "");           // drop the article's gemination dagesh
    });
    return rest && rest !== s ? rest : "";
  }
  function _channelRank(ch) { return ch === "form-first" ? 3 : ch === "paradigm" ? 2 : ch === "meaning-fallback" ? 1 : 0; }

  async function _resolveVariant(eng, surface, niqqud) {
    var u = { pos: "", binyan: "", lemma: "", stem: "", root: null, niqqud: niqqud || "", sampleWord: surface, kind: null };
    var base = await eng.NA.pickBaseParadigm(u, eng.lookup);  // may be null for empty-POS units
    var r = eng.NA.resolveContentUnit(eng.maps, u, base);
    return { r: r, base: base };
  }

  // Resolve the tapped word. Tries the surface form and (for ה-prefixed words) an
  // article-stripped variant, keeping whichever resolves MOST decisively (form-first >
  // paradigm > meaning-fallback). The CARD still shows the original tapped form; only
  // root/gloss/binyan/pos come from the winning variant. R1: a variant is preferred
  // ONLY when it is strictly more decisive, so it can upgrade precision (e.g. correctly
  // read "the dawn"), never fabricate or override a confident base reading.
  async function resolveCore(eng, surfaceOrig, niqqudOrig) {
    var pidMap = eng.pidMap;
    var n0 = String(niqqudOrig || "");
    var cands = [{ surface: stripNiqqud(n0) || surfaceOrig, niqqud: n0 }];
    var alt = articleStrippedForm(n0);
    if (alt) cands.push({ surface: stripNiqqud(alt), niqqud: alt });
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var got = await _resolveVariant(eng, cands[i].surface, cands[i].niqqud);
      if (!best) { best = got; continue; }
      var ra = _channelRank(got.r.channel), rb = _channelRank(best.r.channel);
      if (ra > rb || (ra === rb && got.r.confidence > best.r.confidence)) best = got;
    }
    var r = best.r, base = best.base;
    var par = (r.pealim_id && pidMap) ? pidMap.get(String(r.pealim_id)) : null;
    par = par || base || null;
    var root = r.trueRoot || (par && par.root) || null;
    var binyan = (par && par.binyan) || (base && base.binyan) || "";
    var pos = (par && par.pos) || (base && base.pos) || "";
    var meaning = r.meaning || (par && par.meaning) || "";
    var pealim_id = r.pealim_id || (par && par.pealim_id ? String(par.pealim_id) : "");
    var pealim_url = (par && par.pealim_url) || "";
    var lemma = (par && par.lemma) || "";       // for the no-pid lemmaKey join (status colouring)
    // R10 honest-gloss gate: when the tapped word is a closed-class / segmentable
    // function form, an isolated form-first OR meaning-fallback content reading is a
    // homograph trap (עלינו→«лист», אין→«уничтожить»). Assert only the honest function
    // reading and suppress the wrong content paradigm/gloss/direct-link; the link then
    // falls through to PealimFunctionLinks / honest search in resolveWordLight.
    var gatedLabel = null, gateVia = "";
    var fg = functionGate(stripNiqqud(n0) || surfaceOrig || "");
    if (fg.isFunc) {
      gateVia = fg.via || "";
      meaning = fg.gloss || "";          // curated honest gloss, or "" → "уточните по ссылке"
      root = null; binyan = ""; par = null;   // no leaf-noun table for עלינו; no "destroy" for אין
      pos = fg.pos || "";
      pealim_id = ""; pealim_url = ""; lemma = "";
      gatedLabel = fg.gloss ? "function" : "unknown";
    }
    return {
      word: surfaceOrig || stripNiqqud(n0), niqqud: n0,
      root: root, binyan: binyan, pos: pos, meaning: meaning, lemma: lemma,
      pealim_id: pealim_id, pealim_url: pealim_url, paradigm: par || null,
      channel: fg.isFunc ? "function-gate" : r.channel, confidence: r.confidence, status: r.status,
      functionWord: fg.isFunc, gateVia: gateVia,
      ambiguous: fg.isFunc ? false : !!r.ambiguous, alts: fg.isFunc ? [] : (r.alts || []),
      label: gatedLabel || provenanceLabel(r, pos),
    };
  }

  // ── Browser engine (lazy) ──────────────────────────────────────────────────
  var _eng = null, _engPromise = null;

  // First-tap init: load + decompress the offline Pealim dataset (3.3 MB gz) ONCE,
  // build the resolver maps + pealim_id index, expose a sync paradigm lookup. Kept
  // resident for the session (NOT ensureImported — that releases the in-memory
  // paradigms the maps need). Heavy but one-time; the card shows a loading state.
  function ensureEngine() {
    if (_eng) return Promise.resolve(_eng);
    if (_engPromise) return _engPromise;
    _engPromise = (async function () {
      var NA = window.NotesAutoGen, ID = window.InflectionDict;
      if (!NA || !ID) throw new Error("morph engine scripts not loaded");
      var ds = await ID.ensureReady();
      if (!ds || !Array.isArray(ds.paradigms) || !ds.index) throw new Error("inflection dataset unavailable");
      var maps = NA.buildResolverMaps(ds.paradigms);
      var pidMap = new Map();
      for (var i = 0; i < ds.paradigms.length; i++) {
        var p = ds.paradigms[i];
        if (p && p.pealim_id != null && !pidMap.has(String(p.pealim_id))) pidMap.set(String(p.pealim_id), p);
      }
      // root → lemmas index (for the «Слова от этого корня» chips; dictionary-derived,
      // self-contained — no corpus/CrossText dependency).
      var rootIndex = new Map();
      for (var j = 0; j < ds.paradigms.length; j++) {
        var pp = ds.paradigms[j];
        if (!pp || !pp.root) continue;
        var disp = pp.lemma_niqqud || pp.lemma || "";
        var kk = stripNiqqud(pp.lemma || "");
        if (!disp || !kk) continue;
        var rk = String(pp.root);
        if (!rootIndex.has(rk)) rootIndex.set(rk, []);
        var arr = rootIndex.get(rk);
        var seen = false; for (var s2 = 0; s2 < arr.length; s2++) { if (arr[s2].key === kk) { seen = true; break; } }
        if (!seen) arr.push({ disp: disp, key: kk, pid: pp.pealim_id != null ? String(pp.pealim_id) : "", pos: pp.pos || "" });
      }
      var index = ds.index, paradigms = ds.paradigms;
      var lookup = function (k, b) { var ix = index[String(k) + " " + String(b || "")]; return (ix != null && paradigms[ix]) ? paradigms[ix] : null; };
      // warm function-word links (small, optional, graceful)
      try { if (window.PealimFunctionLinks) window.PealimFunctionLinks.ensureReady(); } catch (_) {}
      _eng = { NA: NA, maps: maps, pidMap: pidMap, lookup: lookup, rootIndex: rootIndex };
      return _eng;
    })().catch(function (e) { _engPromise = null; throw e; });
    return _engPromise;
  }

  // Browser resolve: ensureEngine -> resolveCore -> function-word enrichment (R1 premium
  // profile + direct dict link for closed-class words, layered AFTER the parity core).
  // ctx (optional, Tier-3 context mode) = { niqqud, posDicta, lemma } from window.ReaderDicta,
  // or null. When present, the sentence-context reading is applied via pickContextReading
  // BEFORE enrichment — so the card surfaces the contextually-correct homograph.
  async function resolveWordLight(surface, niqqud, ctx) {
    surface = stripNiqqud(surface);
    if (!surface) return null;
    var eng = await ensureEngine();
    var card = await resolveCore(eng, surface, niqqud);
    if (ctx && ctx.niqqud) {
      try {
        var ctxCard = await resolveCore(eng, surface, ctx.niqqud);
        var pick = pickContextReading(card, ctxCard, ctx, surface);
        if (pick.use === "context") { ctxCard.label = "context"; ctxCard.contextUsed = true; card = ctxCard; }
        else if (pick.use === "gloss") {
          card.meaning = pick.gloss; card.pos = pick.pos || card.pos;
          card.root = null; card.binyan = ""; card.paradigm = null; card.lemma = "";
          card.pealim_id = ""; card.pealim_url = ""; card.label = "context"; card.contextUsed = true;
        }
        else if (pick.use === "soften") {
          // Dicta disputes the content POS but we have no offline gloss for its reading: keep
          // the related offline reading, drop the «точно» claim. ambiguous=true engages the
          // enrichment gate (search link / «возможная парадигма» / family hidden).
          if (card.label === "exact") card.label = "likely";
          card.ambiguous = true; card.contextUsed = true; card.contextPos = pick.pos || "";
        }
      } catch (_) { /* Dicta hiccup → keep offline card (silent, no dead-end) */ }
    }
    if (!card.pealim_url && window.PealimFunctionLinks) {
      try {
        var fl = window.PealimFunctionLinks.lookup(surface, card.pos || "", { lemma: surface });
        if (fl && fl.id != null) {
          card.pealim_id = String(fl.id);
          card.pealim_url = "https://www.pealim.com/ru/dict/" + encodeURIComponent(fl.id) + "/";
          if (fl.pos && (!card.pos || card.label === "unknown")) { card.pos = fl.pos; card.label = "function"; }
        }
      } catch (_) {}
    }
    card.pealim_direct = !!card.pealim_url;
    if (!card.pealim_url) {
      // honest search fallback — labelled as search, never a fake direct page.
      card.pealim_url = "https://www.pealim.com/ru/search/?q=" + encodeURIComponent(surface);
      card.pealim_direct = false;
    }
    // F5 enrichment gate: an ambiguous (homograph) reading must not present a SPECIFIC
    // Pealim page as authoritative — downgrade to a search so the user disambiguates.
    if (card.ambiguous && card.pealim_direct) {
      card.pealim_url = "https://www.pealim.com/ru/search/?q=" + encodeURIComponent(surface);
      card.pealim_direct = false;
    }
    // rich-card data (Stage 2): paradigm for the inflection table (+ pronoun fallback)
    // and the dictionary root family.
    if (!card.paradigm && window.InflectionRender && window.InflectionRender.lookupPronounParadigm) {
      try { card.paradigm = window.InflectionRender.lookupPronounParadigm(surface); } catch (_) {}
    }
    card.rootFamily = [];
    try {
      if (eng.rootIndex && card.root) {
        var selfKey = stripNiqqud(card.lemma || card.word || "");
        card.rootFamily = (eng.rootIndex.get(String(card.root)) || []).filter(function (x) {
          if (card.pealim_id && x.pid === String(card.pealim_id)) return false;
          return x.key !== selfKey;
        }).slice(0, 16);
      }
    } catch (_) {}
    return card;
  }

  // ── DOM: post-render word-wrap (Room-only; builder untouched) ───────────────
  var WRAP_FLAG = "data-rm-wrapped";

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // Rebuild a cell's innerHTML wrapping each word token in a tappable span, keeping
  // separators verbatim. data-surface/data-niqqud make spans self-contained (no
  // per-row state). value is taken from the DATA MODEL so display text is exact.
  // niqqudForCell: aligned [{surface,niqqud}] for a he cell, or null for a niqqud cell
  // (whose own tokens already carry the vowels).
  function wrapCellHtml(value, niqqudForCell) {
    var toks = tokenize(value);
    var wIdx = 0, html = "";
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (!tk.isWord) { html += escapeHtml(tk.text); continue; }
      var surface, niqqud;
      if (niqqudForCell) { var pair = niqqudForCell[wIdx] || {}; surface = pair.surface || tk.text; niqqud = pair.niqqud || ""; }
      else { surface = stripNiqqud(tk.text); niqqud = tk.text; }
      var off = wIdx; wIdx++;   // word offset within the row/sentence (for note occurrences)
      html += '<span class="rm-w" role="button" tabindex="0"' +
        ' data-surface="' + escapeHtml(surface) + '"' +
        ' data-niqqud="' + escapeHtml(niqqud) + '"' +
        ' data-w-offset="' + off + '">' + escapeHtml(tk.text) + "</span>";
    }
    return html;
  }

  function wrapMount(mount, getRow) {
    if (!mount) return;
    var cells = mount.querySelectorAll('#proTable tbody td[data-col="he"], #proTable tbody td[data-col="niqqud"]');
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i];
      if (td.getAttribute(WRAP_FLAG)) continue;
      var tr = td.closest("tr[data-row-idx]");
      var rowIdx = tr ? Number(tr.getAttribute("data-row-idx")) : NaN;
      var row = (typeof getRow === "function" && Number.isFinite(rowIdx)) ? getRow(rowIdx) : null;
      if (!row) continue;
      var col = td.getAttribute("data-col");
      if (col === "he") {
        var aligned = alignSurfaceNiqqud(String(row.he || ""), String(row.he_niqqud || ""));
        td.innerHTML = wrapCellHtml(String(row.he || ""), aligned);
      } else { // niqqud cell — tokens are self-vocalized
        td.innerHTML = wrapCellHtml(String(row.he_niqqud || ""), null);
      }
      td.setAttribute(WRAP_FLAG, "1");
    }
  }

  // ── DOM: bottom-sheet card ─────────────────────────────────────────────────
  var _sheet = null, _activeSpan = null;
  function tt(key, fallback) { try { if (typeof window !== "undefined" && typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fallback; }

  var LABEL_TEXT = {
    exact: ["room.morph.prov.exact", "точно"],
    likely: ["room.morph.prov.likely", "вероятно"],
    guessed: ["room.morph.prov.guessed", "подобрано"],
    "function": ["room.morph.prov.function", "служебное слово"],
    context: ["room.morph.prov.context", "контекст (Dicta)"],
    unknown: ["room.morph.prov.unknown", "не определено офлайн"],
  };
  var POS_TEXT = {
    verb: ["room.morph.pos.verb", "глагол"], noun: ["room.morph.pos.noun", "существительное"],
    adjective: ["room.morph.pos.adjective", "прилагательное"], preposition: ["room.morph.pos.preposition", "предлог"],
    adverb: ["room.morph.pos.adverb", "наречие"], pronoun: ["room.morph.pos.pronoun", "местоимение"],
    conjunction: ["room.morph.pos.conjunction", "союз"], numeral: ["room.morph.pos.numeral", "числительное"],
    interjection: ["room.morph.pos.interjection", "междометие"], particle: ["room.morph.pos.particle", "частица"],
    negation: ["room.morph.pos.negation", "отрицание"],
  };
  // word-note lifecycle (from getWordNoteLifecycle): created/in_anki/learning/known/suspended.
  var LIFECYCLE = {
    created: ["room.morph.life.created", "🆕 в заметках"],
    in_anki: ["room.morph.life.inAnki", "📤 в Anki"],
    learning: ["room.morph.life.learning", "🔄 учу"],
    known: ["room.morph.life.known", "✅ знаю"],
    suspended: ["room.morph.life.suspended", "⏸ пауза"],
  };
  var _activeCard = null, _activeOcc = null, _attachOpts = {};

  function ensureSheet() {
    if (_sheet) return _sheet;
    var el = document.createElement("div");
    el.className = "rm-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "false");
    el.hidden = true;
    el.innerHTML =
      '<div class="rm-sheet-backdrop" data-rm-close="1"></div>' +
      '<div class="rm-sheet-card" dir="rtl">' +
      '  <button type="button" class="rm-sheet-x" data-rm-close="1" aria-label="' + escapeHtml(tt("room.morph.close", "Закрыть")) + '">✕</button>' +
      '  <div class="rm-sheet-body"></div>' +
      "</div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("[data-rm-close]")) { closeSheet(); return; }
      if (t && t.closest && t.closest(".rm-save")) { onSaveClick(); return; }
      var chip = t && t.closest ? t.closest(".rm-rootfam-chip") : null;
      if (chip) { onChipClick(chip); return; }
      // conjugation cells voice themselves via inline onclick → window.v3ConjSpeak.
    });
    _sheet = el;
    return el;
  }

  function closeSheet() {
    if (_sheet) { _sheet.hidden = true; _sheet.classList.remove("rm-open"); }
    if (_activeSpan) { _activeSpan.classList.remove("rm-w-active"); _activeSpan = null; }
  }

  function renderCardHtml(card) {
    if (!card) return '<div class="rm-card-empty">' + escapeHtml(tt("room.morph.empty", "Слово не распознано.")) + "</div>";
    var label = LABEL_TEXT[card.label] || LABEL_TEXT.unknown;
    var rows = "";
    var add = function (k, v, he) { if (v) rows += '<div class="rm-row"><span class="rm-k">' + escapeHtml(k) + '</span><span class="rm-v"' + (he ? ' lang="he"' : "") + ">" + escapeHtml(v) + "</span></div>"; };
    add(tt("room.morph.root", "корень"), card.root, true);
    if (card.binyan) add(tt("room.morph.binyan", "биньян"), card.binyan, false);
    if (card.pos) { var pt = POS_TEXT[card.pos]; add(tt("room.morph.posLabel", "часть речи"), pt ? tt(pt[0], pt[1]) : card.pos, false); }
    var head =
      '<div class="rm-head">' +
      '<span class="rm-word" lang="he">' + escapeHtml(card.niqqud || card.word) + "</span>" +
      '<span class="rm-badges">' +
      '<span class="rm-prov rm-prov-' + escapeHtml(card.label) + '">' + escapeHtml(tt(label[0], label[1])) + "</span>" +
      '<span class="rm-life" data-rm-life hidden></span>' +
      "</span>" +
      "</div>";
    var meaning = card.meaning
      ? '<div class="rm-meaning" dir="ltr">' + escapeHtml(card.meaning) + "</div>"
      : '<div class="rm-meaning rm-meaning-empty" dir="ltr">' + escapeHtml(tt("room.morph.noGloss", "Перевод не найден офлайн.")) + "</div>";
    // F4 — homograph honesty: surface the rival readings of an ambiguous cell so the gloss
    // above reads as one possibility, not a verdict. «возможно также: год; …»
    var altGlosses = (card.alts || []).map(function (a) { return a && a.meaning; }).filter(Boolean);
    var altLine = altGlosses.length
      ? '<div class="rm-alts" dir="ltr"><span class="rm-alts-k">' + escapeHtml(tt("room.morph.altReadings", "возможно также")) + ":</span> " + escapeHtml(altGlosses.slice(0, 3).join("; ")) + "</div>"
      : "";
    // Participle-soften hint: Dicta read a different content POS in context (verb↔noun) — name it.
    var cpt = card.contextPos && card.contextPos !== card.pos && POS_TEXT[card.contextPos];
    var ctxPosLine = cpt
      ? '<div class="rm-alts" dir="ltr"><span class="rm-alts-k">' + escapeHtml(tt("room.morph.contextSuggests", "по контексту, возможно")) + ":</span> " + escapeHtml(tt(cpt[0], cpt[1])) + "</div>"
      : "";
    var linkLabel = card.pealim_direct ? tt("room.morph.pealimPage", "Открыть на Pealim") : tt("room.morph.pealimSearch", "Искать на Pealim");
    var link = card.pealim_url
      ? '<a class="rm-link" href="' + escapeHtml(card.pealim_url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(linkLabel) + " ↗</a>"
      : "";
    // «Сохранить» — frictionless capture: turns the word into a word_study note (the
    // prerequisite for status colouring + Anki + i+1). The glue (DB persist) is the
    // caller's opts.saveWord; the button is shown whenever a save handler is wired.
    var saveBtn = _attachOpts.saveWord
      ? '<button type="button" class="rm-save" data-rm-save>' + escapeHtml(tt("room.morph.save", "＋ Сохранить")) + "</button>"
      : "";
    // Stage 2 — rich content (progressive disclosure, collapsed by default):
    // «Слова от этого корня» (dict root family) + «Спряжение / Склонение» (Pealim table,
    // 1:1 with the Studio via InflectionRender; tap a form → speak it).
    // F5 — root uncertain on a homograph guess → hide the «слова от этого корня» family
    // (it would be the family of a rival lemma, not necessarily this word's).
    var fam = (card.rootFamily && card.rootFamily.length && !card.ambiguous)
      ? '<details class="rm-acc"><summary class="rm-acc-sum">' + escapeHtml(tt("room.morph.rootFamily", "Слова от этого корня")) + "</summary>" +
        '<div class="rm-rootfam">' + card.rootFamily.map(function (x) {
          return '<button type="button" class="rm-rootfam-chip" dir="rtl" data-w="' + escapeHtml(x.disp) + '">' + escapeHtml(x.disp) + "</button>";
        }).join("") + "</div></details>"
      : "";
    var conj = "";
    if (card.paradigm && window.InflectionRender && window.InflectionRender.renderParadigm) {
      var tbl = ""; try { tbl = window.InflectionRender.renderParadigm(card.paradigm, { highlightForm: card.niqqud }); } catch (_) { tbl = ""; }
      // F5 — when the reading isn't «точно», the table is for the resolver's best guess, not
      // a fact: label it «возможная парадигма» so it isn't read as the authoritative paradigm.
      var conjSure = card.label === "exact";
      var conjLabel = conjSure ? tt("room.morph.conj", "Спряжение / Склонение") : tt("room.morph.possibleParadigm", "возможная парадигма");
      if (tbl) conj = '<details class="rm-acc rm-acc-conj' + (conjSure ? "" : " rm-acc-uncertain") + '"><summary class="rm-acc-sum">' + escapeHtml(conjLabel) + "</summary>" +
        '<div class="rm-conj-body">' + tbl + "</div></details>";
    }
    return head + meaning + altLine + ctxPosLine + '<div class="rm-rows">' + rows + "</div>" + '<div class="rm-actions">' + saveBtn + link + "</div>" + fam + conj;
  }

  function openCardLoading() {
    var el = ensureSheet();
    el.querySelector(".rm-sheet-body").innerHTML = '<div class="rm-loading">' + escapeHtml(tt("room.morph.loading", "Анализ…")) + "</div>";
    el.hidden = false; el.classList.add("rm-open");
  }
  function openCard(card, occ) {
    _activeCard = card; _activeOcc = occ || null;
    var el = ensureSheet();
    el.querySelector(".rm-sheet-body").innerHTML = renderCardHtml(card);
    el.hidden = false; el.classList.add("rm-open");
    if (card) refreshCardMeta(card);
  }
  function lifecycleText(status) { var L = LIFECYCLE[status] || LIFECYCLE.created; return tt(L[0], L[1]); }
  // Reflect whether this word is already a saved note (+ its SRS lifecycle) onto the
  // card: a status badge + the save button flips to «✓ В заметках». info = {status} | null.
  function applyLifecycle(info) {
    if (!_sheet) return;
    var lifeEl = _sheet.querySelector("[data-rm-life]");
    var saveBtn = _sheet.querySelector(".rm-save");
    var has = !!(info && info.status);
    if (lifeEl) {
      if (has) { lifeEl.textContent = lifecycleText(info.status); lifeEl.className = "rm-life rm-life-" + info.status; lifeEl.hidden = false; }
      else lifeEl.hidden = true;
    }
    if (saveBtn) {
      if (has) { saveBtn.textContent = tt("room.morph.saved", "✓ В заметках"); saveBtn.classList.add("rm-save-done"); }
      else { saveBtn.textContent = tt("room.morph.save", "＋ Сохранить"); saveBtn.classList.remove("rm-save-done"); }
    }
  }
  async function refreshCardMeta(card) {
    if (!_attachOpts.lookupNote) return;
    var info; try { info = await _attachOpts.lookupNote(card); } catch (_) { info = null; }
    if (_activeCard === card) applyLifecycle(info);
  }
  async function onSaveClick() {
    if (!_activeCard || !_attachOpts.saveWord) return;
    var saveBtn = _sheet && _sheet.querySelector(".rm-save");
    if (saveBtn) saveBtn.disabled = true;
    try {
      var info = await _attachOpts.saveWord(_activeCard, _activeOcc);
      applyLifecycle(info && info.status ? info : { status: "created" });
    } catch (_) {} finally { if (saveBtn) saveBtn.disabled = false; }
  }
  // Tap a root-family chip → open that related word's card (no occurrence context).
  async function onChipClick(chip) {
    var disp = chip.getAttribute("data-w") || "";
    var surface = stripNiqqud(disp);
    if (!surface) return;
    openCardLoading();
    try { var card = await resolveWordLight(surface, disp); openCard(card, null); }
    catch (_) { openCard(null, null); }
  }

  // ── Public: attach the learner layer to a painted reader mount ──────────────
  //   attach(mount, { getRow })  — getRow(rowIdx) -> row model (he, he_niqqud).
  // Returns { detach, refresh }. Idempotent per cell (WRAP_FLAG).
  function attach(mount, opts) {
    opts = opts || {};
    if (!mount) return { detach: function () {}, refresh: function () {} };
    var getRow = typeof opts.getRow === "function" ? opts.getRow : function () { return null; };
    _attachOpts = opts;

    var refresh = function () { try { wrapMount(mount, getRow); } catch (_) {} };
    refresh();

    // Occurrence context for a tapped word: where it appears (text/sentence/offset) so a
    // saved note records a real occurrence. Baked corpus rows carry _v3_textId/_v3_sentenceId.
    var computeOcc = function (span) {
      try {
        var tr = span.closest("tr[data-row-idx]");
        var rowIdx = tr ? Number(tr.getAttribute("data-row-idx")) : NaN;
        var row = Number.isFinite(rowIdx) ? getRow(rowIdx) : null;
        var off = Number(span.getAttribute("data-w-offset"));
        return {
          text_id: row && row._v3_textId ? String(row._v3_textId) : null,
          sentence_id: row && row._v3_sentenceId ? String(row._v3_sentenceId) : null,
          word_offset: Number.isFinite(off) ? off : null,
          surface: span.getAttribute("data-surface") || "",
        };
      } catch (_) { return null; }
    };

    var onActivate = async function (span) {
      if (_activeSpan) _activeSpan.classList.remove("rm-w-active");
      _activeSpan = span; span.classList.add("rm-w-active");
      var surface = span.getAttribute("data-surface") || span.textContent || "";
      var niqqud = span.getAttribute("data-niqqud") || "";
      var occ = computeOcc(span);
      openCardLoading();
      try {
        // Tier-3 «точный режим» (opt-in): if a contextProvider is wired, fetch the
        // sentence-context reading for this word; degrade silently to offline on any miss.
        var ctx = null;
        if (typeof _attachOpts.contextProvider === "function") {
          var tr = span.closest("tr[data-row-idx]");
          var rowIdx = tr ? Number(tr.getAttribute("data-row-idx")) : NaN;
          var row = Number.isFinite(rowIdx) ? getRow(rowIdx) : null;
          var sentence = row ? (String(row.he || "") || stripNiqqud(String(row.he_niqqud || ""))) : "";
          if (sentence) { try { ctx = await _attachOpts.contextProvider(sentence, stripNiqqud(surface)); } catch (_) { ctx = null; } }
        }
        var card = await resolveWordLight(surface, niqqud, ctx);
        if (_activeSpan === span) openCard(card, occ);
      } catch (e) { if (_activeSpan === span) openCard(null, occ); }
    };

    var onClick = function (e) {
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (span && mount.contains(span)) { e.preventDefault(); e.stopPropagation(); onActivate(span); }
    };
    var onKey = function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (span && mount.contains(span)) { e.preventDefault(); e.stopPropagation(); onActivate(span); }
    };
    var onDocKey = function (e) { if (e.key === "Escape") closeSheet(); };

    // Capture phase so a word tap is handled BEFORE reader-core's row-audio delegate.
    mount.addEventListener("click", onClick, true);
    mount.addEventListener("keydown", onKey);
    document.addEventListener("keydown", onDocKey);

    return {
      refresh: refresh,
      detach: function () {
        mount.removeEventListener("click", onClick, true);
        mount.removeEventListener("keydown", onKey);
        document.removeEventListener("keydown", onDocKey);
        closeSheet();
      },
    };
  }

  // ── BRR-P1-009 colour + BRR-P1-006 adaptive niqqud fade — ONE confidence-gated pass ──
  // Resolves each wrapped .rm-w word ONCE, then (a) colours it by learning state and/or
  // (b) in adaptive niqqud mode de-vocalizes FAMILIAR+confident words so the niqqud
  // concentrates exactly on the new/archaic. R1/R10: ONLY decisively-resolved words
  // (label exact|likely) are touched — ambiguous / unvocalized words stay neutral AND keep
  // their niqqud (honest degradation: never hide help on a word we can't confidently identify).
  // Chunked (60/batch + yields) so a long text never blocks the UI. Absent-from-map ⇒ 'new'.
  var STATE_CLASS = { known: "rm-w-known", learning: "rm-w-learning", weak: "rm-w-learning", stale: "rm-w-learning", "new": "rm-w-new" };
  // "familiar" mirrors corpus-vocab CFG.KNOWN_STATES (saved=familiar; §7 — owner's saved vocab
  // sits in 'new'/Anki, so familiar = any engaged word, not just mastered).
  var FAMILIAR = { known: 1, learning: 1, weak: 1, stale: 1, "new": 1 };

  // PURE (Node-testable): does the niqqud cell show the PLAIN surface or the vocalized form?
  // Fade only in 'adaptive' mode, only for confidently-resolved familiar words. Everything else
  // (full mode, off mode, unconfident, unknown) keeps the niqqud.
  function fadeDecision(state, label, mode) {
    if (mode !== "adaptive") return "niqqud";
    var confident = (label === "exact" || label === "likely");
    if (confident && state && FAMILIAR[state]) return "plain";
    return "niqqud";
  }

  function _colOf(span) { var td = span && span.closest ? span.closest("td[data-col]") : null; return td ? td.getAttribute("data-col") : null; }

  // Remove all decorations: colour classes + restore any de-vocalized niqqud spans. Cheap, no resolve.
  function clearDecorations(mount) {
    if (!mount) return;
    var painted = mount.querySelectorAll(".rm-w-known, .rm-w-learning, .rm-w-new");
    for (var i = 0; i < painted.length; i++) painted[i].classList.remove("rm-w-known", "rm-w-learning", "rm-w-new");
    var niq = mount.querySelectorAll('#proTable tbody td[data-col="niqqud"] .rm-w');
    for (var j = 0; j < niq.length; j++) { var n = niq[j].getAttribute("data-niqqud"); if (n != null) niq[j].textContent = n; }
  }

  // opts = { color: bool, fadeMode: 'full'|'adaptive'|'off' }. statesMap = {lemmaKey: state}.
  async function decorateWords(mount, statesMap, opts) {
    if (!mount) return;
    opts = opts || {};
    var color = !!opts.color, fadeMode = opts.fadeMode || "full";
    if (!color && fadeMode !== "adaptive") { clearDecorations(mount); return; }   // nothing to resolve
    var states = statesMap || {};
    var NA = window.NotesAutoGen;
    var eng; try { eng = await ensureEngine(); } catch (_) { return; }
    var spans = Array.prototype.slice.call(mount.querySelectorAll(".rm-w"));
    var i = 0;
    while (i < spans.length) {
      var end = Math.min(i + 60, spans.length);
      for (; i < end; i++) {
        var span = spans[i];
        span.classList.remove("rm-w-known", "rm-w-learning", "rm-w-new");
        var isNiqqud = _colOf(span) === "niqqud";
        var surface = span.getAttribute("data-surface") || "";
        var niqqud = span.getAttribute("data-niqqud") || "";
        var card; try { card = await resolveCore(eng, surface, niqqud); }
        catch (_) { if (isNiqqud && niqqud != null) span.textContent = niqqud; continue; }   // unconfident → keep niqqud
        var confident = !!(card && (card.label === "exact" || card.label === "likely"));   // gate (R1/R10)
        var raw = undefined;   // the learner's SAVED state for this lemma; undefined = UNSEEN (never "familiar" → keeps niqqud)
        if (confident) {
          var lk = (NA && NA.lemmaKey) ? NA.lemmaKey({ pealim_id: card.pealim_id, lemma: card.lemma, word: card.word, pos: card.pos }) : "";
          raw = states[lk];
        }
        if (color && confident) { var cls = STATE_CLASS[raw || "new"]; if (cls) span.classList.add(cls); }   // unseen ⇒ 'new' (blue)
        if (isNiqqud) span.textContent = (fadeDecision(raw, card ? card.label : null, fadeMode) === "plain") ? surface : niqqud;
      }
      if (i < spans.length) await new Promise(function (r) { setTimeout(r, 0); });
    }
  }

  // Back-compat thin wrappers (existing callers / smoke).
  function clearLearningStatus(mount) { clearDecorations(mount); }
  async function paintLearningStatus(mount, statesMap) { return decorateWords(mount, statesMap, { color: true, fadeMode: "full" }); }

  var API = {
    // pure core (Node-testable)
    tokenize: tokenize, words: words, alignSurfaceNiqqud: alignSurfaceNiqqud,
    stripNiqqud: stripNiqqud, provenanceLabel: provenanceLabel, resolveCore: resolveCore,
    functionGate: functionGate, pickContextReading: pickContextReading, CONTEXT_GLOSS: CONTEXT_GLOSS,
    wrapCellHtml: wrapCellHtml, isWordChar: isWordChar, fadeDecision: fadeDecision,
    // browser
    ensureEngine: ensureEngine, resolveWordLight: resolveWordLight, attach: attach,
    closeSheet: closeSheet, paintLearningStatus: paintLearningStatus, clearLearningStatus: clearLearningStatus,
    decorateWords: decorateWords, clearDecorations: clearDecorations,
  };

  if (typeof window !== "undefined") window.ReaderMorph = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
