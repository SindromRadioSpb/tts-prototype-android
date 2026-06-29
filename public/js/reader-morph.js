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
        // ktiv male/chaser: the vocalized form is spelled defectively (חֵרִשִׁי → חרשי) while the
        // plain text is plene (חרישי), so the stripped forms never match. When the remaining token
        // counts still line up 1:1, this IS the same word — pair it positionally. Otherwise the word
        // loses its vowels (no niqqud fade) AND its colour/status surface-key splits between columns.
        else if (j < nq.length && (he.length - i) === (nq.length - j)) { paired = nq[j]; j++; }
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
    // R1-tail L2: large numbers + missing ordinals/tens flagged as false-exact «точно» noun.
    // (מאת excluded — homograph with the preposition «от».)
    "אלף": "тысяча", "אלפים": "тысячи", "אלפיים": "две тысячи",
    "מאה": "сто", "מאות": "сотни", "מאתיים": "двести",
    "שני": "второй; два (сопряж.)", "שנייה": "вторая; секунда",
    "שביעי": "седьмой", "שמיני": "восьмой", "תשיעי": "девятый", "עשירי": "десятый",
    "עשרים": "двадцать", "שלושים": "тридцать", "ארבעים": "сорок", "חמישים": "пятьдесят",
    "שישים": "шестьдесят", "שבעים": "семьдесят", "שמונים": "восемьдесят", "תשעים": "девяносто",
  };
  // Numerals that are ALSO common nouns (מֵאָה «век», אֶלֶף «вождь/алеф») → keep them gating in
  // the BARE counting form, but do NOT let the definite ה+X path read them as numerals
  // (הַמֵּאָה = «век», not «сотня» — gold-verified regression guard, R1-tail L2).
  var NUM_NOUN_HOMOGRAPH = { "מאה": 1, "מאות": 1, "אלף": 1 };
  // Proper-name gazetteer — UNAMBIGUOUS personal/place names that are NOT common Hebrew words,
  // so asserting «имя собственное» (honest-empty, morphology suppressed) never over-triggers a
  // real word. Built in two passes:
  //   • L5 SEED (R1-tail): ~40 hand-seeded high-frequency names.
  //   • R2 (2026-06-26): Wikidata he-labels ∩ baked-corpus skeletons, homograph-split via the LIVE
  //     resolver, then conservatively curated (hspell common-word veto + drop construct/homograph
  //     forms, recover clear toponyms + theophoric/compound classical names). +293 names.
  //     Producer: scripts/premium/build-name-gazetteer.js · record: docs/research/name-gazetteer/.
  // HOMOGRAPH names that are ALSO common words (שלום «мир», הלל «хвала», דוד «дядя», יום, אור…) are
  // DEFERRED to Tier-3 context (R2.1 owner decision): a static demotion would over-hedge «точно» on
  // the most common Hebrew words. Context-org names (הָעוֹבֵד-газета) likewise → Tier-3 / L4-demotion.
  var NAME_PROPER = {
    "אירופה": 1, "ירושלים": 1, "ישראל": 1, "מצרים": 1, "בבל": 1, "אשור": 1, "רומא": 1, "ציון": 1,
    "כנען": 1, "סיני": 1, "אמריקה": 1, "אסיה": 1, "אפריקה": 1, "מוסקבה": 1, "פריז": 1, "ברלין": 1,
    "יעקב": 1, "יצחק": 1, "אברהם": 1, "משה": 1, "אהרן": 1, "יוסף": 1, "יהושע": 1, "שמואל": 1,
    "מרדכי": 1, "אסתר": 1, "רבקה": 1, "רחל": 1, "לאה": 1, "מרים": 1, "גדעון": 1, "שמשון": 1,
    "שלמה": 1, "בנימין": 1, "אפרים": 1, "ירמיהו": 1, "ישעיהו": 1, "יחזקאל": 1, "מנשה": 1, "ראובן": 1,
    // ── R2 batch (curated Wikidata ∩ corpus) ──
    "אביגדור": 1, "אביגיל": 1, "אביתר": 1, "אבנר": 1, "אבשלום": 1, "אדגר": 1, "אדוניס": 1, "אדית": 1,
    "אהוד": 1, "אהרון": 1, "אויגן": 1, "אולגה": 1, "אוסטריה": 1, "אוסטרליה": 1, "אופיר": 1, "אוראל": 1,
    "אוריאל": 1, "אוריה": 1, "אחמד": 1, "איברהים": 1, "איוואן": 1, "איטליה": 1, "איילון": 1, "אילנה": 1,
    "אינגריד": 1, "אלדוס": 1, "אלזה": 1, "אלחנן": 1, "אליהו": 1, "אלימלך": 1, "אליעזר": 1, "אליקים": 1,
    "אלכסנדר": 1, "אלכסנדרה": 1, "אלכסנדריה": 1, "אלעזר": 1, "אלפרד": 1, "אמוץ": 1, "אמיל": 1, "אמיתי": 1,
    "אמנון": 1, "אנגליה": 1, "אנדרה": 1, "אנדריי": 1, "אפרת": 1, "אריין": 1, "אריך": 1, "ארם": 1,
    "ארנון": 1, "ארנסט": 1, "באסל": 1, "באסם": 1, "בולגריה": 1, "בטינה": 1, "ביאליסטוק": 1, "ביל": 1,
    "בצלאל": 1, "ברוס": 1, "ברוריה": 1, "ברטולד": 1, "בשאר": 1, "בתיה": 1, "גבריאל": 1, "גדרה": 1,
    "גוטפריד": 1, "גולן": 1, "גורדון": 1, "גיורא": 1, "גלעד": 1, "גרטה": 1, "גריידי": 1, "גרמניה": 1,
    "גרשום": 1, "דון": 1, "דורין": 1, "דילון": 1, "דינה": 1, "דמיאן": 1, "דמשק": 1, "דניאל": 1, "הארדי": 1,
    "הארי": 1, "הדסה": 1, "הוגו": 1, "הולנד": 1, "הונגריה": 1, "הורסט": 1, "היינריך": 1, "הנרי": 1,
    "הנרייטה": 1, "העי": 1, "הרברט": 1, "הרמן": 1, "הרצליה": 1, "וולין": 1, "ויטל": 1, "וילהלם": 1,
    "וילנה": 1, "וילסון": 1, "וינקלר": 1, "וסילי": 1, "ורה": 1, "ורשה": 1, "זבולון": 1, "זויה": 1,
    "זיגמונד": 1, "זכריה": 1, "זלמן": 1, "זרובבל": 1, "זרקא": 1, "חברון": 1, "חגי": 1, "חדרה": 1,
    "חוסיין": 1, "חיפה": 1, "חנוך": 1, "חניתה": 1, "חננאל": 1, "חנקין": 1, "חסן": 1, "חרמון": 1,
    "טבריה": 1, "טוביה": 1, "טרומן": 1, "יאן": 1, "יגאל": 1, "יהונתן": 1, "יהושפט": 1, "יואל": 1,
    "יוון": 1, "יוזף": 1, "יוחאי": 1, "יוחנן": 1, "יונג": 1, "יוסוף": 1, "יורם": 1, "יורק": 1, "יחיאל": 1,
    "ינון": 1, "יסמין": 1, "יפו": 1, "יקותיאל": 1, "ירדן": 1, "ירון": 1, "ירוסלב": 1, "יריחו": 1,
    "ירמיה": 1, "יששכר": 1, "כנרת": 1, "כרמל": 1, "כרמלה": 1, "לאנס": 1, "לבנון": 1, "להסה": 1, "לואיס": 1,
    "לובלין": 1, "לוד": 1, "לויד": 1, "לוין": 1, "לונדון": 1, "לטביה": 1, "לטיף": 1, "ליובה": 1, "ליטא": 1,
    "לייפציג": 1, "לימה": 1, "לין": 1, "מאמי": 1, "מארי": 1, "מארק": 1, "מוריה": 1, "מחמוד": 1, "מטולה": 1,
    "מיטל": 1, "מיכאל": 1, "מיכה": 1, "מילאנו": 1, "מישאל": 1, "מישה": 1, "מכמש": 1, "מלאכי": 1, "מלטה": 1,
    "מליה": 1, "מלכיצדק": 1, "מנדל": 1, "מקס": 1, "מרון": 1, "מרטין": 1, "מריה": 1, "מרקס": 1, "משולם": 1,
    "מתתיהו": 1, "נדב": 1, "נחום": 1, "נחמיה": 1, "נחמן": 1, "ניל": 1, "ניסן": 1, "ניצן": 1, "נסרין": 1,
    "נפוליאון": 1, "נפתלי": 1, "נצרת": 1, "נתיבות": 1, "נתנאל": 1, "סאשה": 1, "סובאלק": 1, "סולומון": 1,
    "סוניה": 1, "סוריה": 1, "סטניסלב": 1, "סטפן": 1, "סיון": 1, "סימון": 1, "סלובקיה": 1, "סלמאן": 1,
    "סלמה": 1, "סקוט": 1, "סרגיי": 1, "עבדול": 1, "עדן": 1, "עזרא": 1, "עזריאל": 1, "עכו": 1, "עמנואל": 1,
    "עמרם": 1, "ענת": 1, "עפולה": 1, "עקיבא": 1, "ערד": 1, "ערן": 1, "עשהאל": 1, "פאריס": 1, "פולין": 1,
    "פורד": 1, "פיודור": 1, "פייפר": 1, "פייר": 1, "פינחס": 1, "פינלנד": 1, "פלטיאל": 1, "פנחס": 1,
    "פרימו": 1, "פריץ": 1, "פרנץ": 1, "פרנק": 1, "פרץ": 1, "פשמישל": 1, "צפת": 1, "קאן": 1, "קארו": 1,
    "קארל": 1, "קובנה": 1, "קוניגונדה": 1, "קופנהגן": 1, "קוצק": 1, "קטיה": 1, "קיסריה": 1, "קלבדיה": 1,
    "קלמן": 1, "קלמנס": 1, "קלר": 1, "קמרון": 1, "קנטרברי": 1, "קסטן": 1, "קפריסין": 1, "קרל": 1,
    "רובין": 1, "רובן": 1, "רוברט": 1, "רוז": 1, "רוזה": 1, "רומן": 1, "רומניה": 1, "רון": 1, "רוסיה": 1,
    "רושדי": 1, "רחביה": 1, "רמלה": 1, "רעננה": 1, "רפאל": 1, "שיין": 1, "שילה": 1, "שלומית": 1,
    "שמעון": 1, "שמעיה": 1, "שמריהו": 1, "שניר": 1, "שפרינצה": 1, "שרון": 1, "תיאודור": 1, "תימן": 1,
    "תנחום": 1,
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
    if (w.length > 2 && w.charAt(0) === "ה" && Object.prototype.hasOwnProperty.call(NUM_GLOSS, w.slice(1)) && !NUM_NOUN_HOMOGRAPH[w.slice(1)])
      return { isFunc: true, via: "art+num", gloss: NUM_GLOSS[w.slice(1)], pos: "numeral" };
    // R1-tail L5: proper name (optionally behind one proclitic ב/ל/מ/כ/ה/ו/ש, e.g. בְּאֵירוֹפָּה).
    // gloss="" → honest-empty / «unknown» label (R1 invariant: no fabricated meaning for a name);
    // pos=propernoun still flows so the card/scoring know it is a name, morphology suppressed.
    if (Object.prototype.hasOwnProperty.call(NAME_PROPER, w))
      return { isFunc: true, via: "name", gloss: "", pos: "propernoun" };
    if (w.length >= 4 && /^[ובלמכהש]/.test(w) && Object.prototype.hasOwnProperty.call(NAME_PROPER, w.slice(1)))
      return { isFunc: true, via: "name", gloss: "", pos: "propernoun" };
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
    // R1-tail L3 — more high-frequency adverb homographs the gold pass flagged.
    "שוב": "снова, опять", "לערך": "примерно, приблизительно", "מהרבה": "много",
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
    // (A) content homograph: accept the context-niqqud reading only when the OFFLINE reading is
    // NOT already decisive, the context reading IS decisive, Dicta's content POS matches, and it
    // differs from offline. R11 source-precedence / do-no-harm: a corpus-niqqud-grounded «exact»
    // reading is what the reader SEES in the niqqud column; a live single-sentence Dicta
    // re-vocalization (unreliable on the archaic corpus) must NEVER override it — בֹּקֶר «утро»
    // was being flipped to בָּקָר «крупный рогатый скот» (Dicta picks the high-freq homograph on
    // bare archaic text). Context still helps where offline genuinely FAILED (non-exact).
    if (offlineCard.label !== "exact" &&
      ctxCard && (ctxCard.label === "exact" || ctxCard.label === "likely") && ctxCard.meaning &&
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
  // R1-tail L4: is the matched form a DEFINITE participle (beinoni behind the article ה)? The
  // article substantivizes the participle (הַמַּדְרִיךְ «гид», הָעוֹלִים «репатрианты», הַמַּקִּיף) —
  // a nominal use the «точно» verb badge over-claims. Bare beinoni (כּוֹתֵב «пишет») is left
  // verbal. Matches the article-stripped consonantal form against the paradigm's active/passive
  // participle (AP-*) cells. Returns false when not definite or the paradigm has no participle.
  function isDefiniteParticiple(par, niqqud) {
    if (!par || !par.cells) return false;
    var stripped = articleStrippedForm(niqqud);
    if (!stripped) return false;                       // only fires on the article ה
    var target = stripNiqqud(stripped);
    var keys = Object.keys(par.cells);
    for (var i = 0; i < keys.length; i++) {
      if (!/(^|-)AP-/.test(keys[i])) continue;         // AP-ms/fs/mp/fp + passive-AP-*
      var c = par.cells[keys[i]];
      if (c && c.he && stripNiqqud(c.he) === target) return true;
    }
    return false;
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
    var label = gatedLabel || provenanceLabel(r, pos);
    var ambiguous = fg.isFunc ? false : !!r.ambiguous;
    var alts = fg.isFunc ? [] : (r.alts || []);
    // R1-tail L3: OFFLINE homograph-adverb demotion. CONTEXT_GLOSS skeletons have a
    // high-frequency adverbial/function reading the offline path can't confirm (only Tier-3/Dicta
    // can — see the type-B note above). When form-first asserts a CONTENT «точно» on one, demote
    // off «точно» and surface the adverb reading as «возможно также», so the card is honest (not
    // a false «точно», not an over-asserted adverb). Tier-3 upgrades it when Dicta confirms POS.
    var advKey = stripNiqqud(n0) || surfaceOrig || "";
    if (!fg.isFunc && label === "exact" && _isContentPos(pos) &&
        Object.prototype.hasOwnProperty.call(CONTEXT_GLOSS, advKey)) {
      label = "likely"; ambiguous = true;
      alts = alts.concat([{ pos: "adverb", meaning: CONTEXT_GLOSS[advKey], root: null }]);
    }
    // R1-tail L4: substantivized (definite) participle — drop «точно», surface the nominal use
    // as «возможно также». The verb reading stays primary (the lexeme is right); only the
    // certainty is hedged. Bare verbal beinoni keeps «точно». Tier-3 refines on context.
    if (!fg.isFunc && label === "exact" && pos === "verb" && isDefiniteParticiple(par, n0)) {
      label = "likely"; ambiguous = true;
      alts = alts.concat([{ pos: "noun", meaning: "(причастие как сущ./прил.)", root: root }]);
    }
    return {
      word: surfaceOrig || stripNiqqud(n0), niqqud: n0,
      root: root, binyan: binyan, pos: pos, meaning: meaning, lemma: lemma,
      pealim_id: pealim_id, pealim_url: pealim_url, paradigm: par || null,
      channel: fg.isFunc ? "function-gate" : r.channel, confidence: r.confidence, status: r.status,
      functionWord: fg.isFunc, gateVia: gateVia,
      ambiguous: ambiguous, alts: alts,
      label: label,
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
        // Epic-3a — dedup by pealim_id (not stripped lemma): keep distinct homographs of the same
        // surface as SEPARATE chips (POS/gloss disambiguates them), instead of collapsing to one.
        var dk = pp.pealim_id != null ? ("p" + pp.pealim_id) : ("k" + kk);
        var seen = false; for (var s2 = 0; s2 < arr.length; s2++) { if (arr[s2]._dk === dk) { seen = true; break; } }
        if (!seen) arr.push({ disp: disp, key: kk, pid: pp.pealim_id != null ? String(pp.pealim_id) : "", pos: pp.pos || "", meaning: pp.meaning || "", _dk: dk });
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
  // The colour/status key must be stable across BOTH table columns and across the tapped column.
  // The plain text (ktiv male, e.g. חרישי) and the niqqud-stripped vocalized form (ktiv chaser,
  // e.g. חרשי) can differ — which would split an UNCONFIDENT word's surface-key, so a manual
  // status set on one form fails to colour the other column / occurrences. Derive the key surface
  // from the vocalization when present (identical for both columns) so every occurrence matches.
  // Confident words key by pid/lemma (this value is ignored by NA.lemmaKey), so only unconfident
  // surface-keys are normalized. Resolver (resolveCore), card.word, display + notes are untouched.
  function _statusKeyWord(card, niqqud, surface) {
    if (niqqud && /[֑-ׇ]/.test(niqqud)) return stripNiqqud(niqqud);
    return (card && card.word) || surface || "";
  }
  // The status/colour key's pealim_id must also match between the card (save) and decorateWords
  // (paint). resolveWordLight enriches a FUNCTION word with a Pealim id via PealimFunctionLinks
  // (for the «открыть на Pealim» link) → its key becomes pid:N. decorateWords resolves with
  // resolveCore ONLY (no function-link enrichment) → it would key by surface#pos and never match,
  // so a manually-marked function word (גם→pid:3304, לא→pid:2943) wouldn't colour. Mirror the same
  // function-link lookup here so both paths agree. Resolver/notes/card display untouched.
  function _statusPid(card, surface) {
    if (card && card.pealim_id) return String(card.pealim_id);
    try {
      if (typeof window !== "undefined" && window.PealimFunctionLinks && surface) {
        var fl = window.PealimFunctionLinks.lookup(surface, (card && card.pos) || "", { lemma: surface });
        if (fl && fl.id != null) return String(fl.id);
      }
    } catch (_) {}
    return "";
  }
  // THE single canonical status/colour key for a resolved card. Every save+paint path derives the
  // key here (decorateWords paint · resolveWordLight save · showStatusPopover · collectNewWords), so
  // the save-key can never drift from the paint-key — the #1 class of Epic-4 bugs. Mirrors
  // setWordStatus/getKnownWordStates exactly: niqqud-derived surface (ktiv male/chaser parity) +
  // function-link pid. NA = NotesAutoGen; returns "" when NA/lemmaKey is unavailable.
  function statusKeyForCard(NA, card, niqqud, surface) {
    if (!NA || !NA.lemmaKey) return "";
    var ks = _statusKeyWord(card, niqqud, surface);
    try { return NA.lemmaKey({ pealim_id: _statusPid(card, ks), lemma: card.lemma, word: ks, pos: card.pos }) || ""; }
    catch (_) { return ""; }
  }
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
    // Epic-3a — colour each family chip by the learner's saved status (known/learning/new), so
    // the family shows what you already know (LingQ-quality). Reuses the wired single-flight
    // word-states cache; offline-cheap, best-effort (no states wired → chips render uncoloured).
    if (card.rootFamily.length && typeof _attachOpts.getWordStates === "function" && eng.NA && eng.NA.lemmaKey) {
      try {
        var states = await _attachOpts.getWordStates();
        if (states) {
          for (var fi = 0; fi < card.rootFamily.length; fi++) {
            var fx = card.rootFamily[fi];
            var lk = eng.NA.lemmaKey({ pealim_id: fx.pid, lemma: fx.key, word: fx.key, pos: fx.pos });
            fx.state = (lk && states[lk]) || "";
          }
        }
      } catch (_) {}
    }
    // Epic 4 — canonical lemma key (aligned with getKnownWordStates) + the RAW manual status, so
    // the card's one-tap level selector highlights what the user explicitly set (vs SRS-derived).
    card.lemmaKey = statusKeyForCard(eng.NA, card, niqqud, surface);
    card.manualStatus = "";
    if (card.lemmaKey && typeof _attachOpts.getWordStatus === "function") {
      try { card.manualStatus = (await _attachOpts.getWordStatus(card.lemmaKey)) || ""; } catch (_) {}
    }
    // T-b — out-of-dict word with no offline gloss: re-surface the learner's OWN saved
    // translation (word_study note, meaning_source=user) so re-opening shows it + «ваш».
    // Only fills an honest-empty gloss; a machine reading (incl. Tier-3) always wins.
    card.meaningSource = "";
    if (!card.meaning && typeof _attachOpts.lookupUserMeaning === "function") {
      try {
        var um = await _attachOpts.lookupUserMeaning(card);
        if (um) { card.meaning = um; card.meaningSource = "user"; }
      } catch (_) {}
    }
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
  // Epic-2 #1 — confidence-taxonomy legend (one-line meaning per badge, behind a «?»). The
  // badge NAMES reuse LABEL_TEXT; these are the explanations. Ordered decisive → least.
  var LEGEND_DESC = {
    exact: ["room.morph.legend.exact", "офлайн-словарь распознал слово однозначно"],
    likely: ["room.morph.legend.likely", "наиболее вероятное чтение; возможны другие"],
    context: ["room.morph.legend.context", "значение выбрано по контексту (Dicta, машина)"],
    "function": ["room.morph.legend.function", "служебное слово — показываем роль, не парадигму"],
    guessed: ["room.morph.legend.guessed", "приблизительно — по родственному слову"],
    unknown: ["room.morph.legend.unknown", "офлайн не определено — уточни по ссылке"],
  };
  var LEGEND_ORDER = ["exact", "likely", "context", "function", "guessed", "unknown"];
  // UI text direction (rtl for the he locale) — the legend/niqqud-prov copy is UI-localized,
  // so it must follow the locale, not the card's dir="rtl" (which is for the Hebrew headword).
  function uiDir() { try { return (document.documentElement && document.documentElement.getAttribute("dir")) || "ltr"; } catch (_) { return "ltr"; } }
  function legendHtml() {
    var rows = LEGEND_ORDER.map(function (k) {
      var nm = LABEL_TEXT[k], d = LEGEND_DESC[k];
      return '<li class="rm-legend-row"><span class="rm-prov rm-prov-' + k + '">' + escapeHtml(tt(nm[0], nm[1])) + "</span>" +
        '<span class="rm-legend-desc">' + escapeHtml(tt(d[0], d[1])) + "</span></li>";
    }).join("");
    rows += '<li class="rm-legend-row"><span class="rm-legend-altk">' + escapeHtml(tt("room.morph.altReadings", "возможно также")) + "</span>" +
      '<span class="rm-legend-desc">' + escapeHtml(tt("room.morph.legend.alts", "другие возможные чтения этого слова")) + "</span></li>";
    return '<ul class="rm-legend" data-rm-legend-panel dir="' + uiDir() + '" hidden>' + rows + "</ul>";
  }
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
  // Epic-3a — root-family chip status colour (mirrors the in-text word-status palette).
  var FAM_STATE = { known: "rm-fam-known", learning: "rm-fam-learning", weak: "rm-fam-learning", stale: "rm-fam-learning", "new": "rm-fam-new", l1: "rm-fam-l1", l2: "rm-fam-l2", l3: "rm-fam-l3", l4: "rm-fam-l4", ignore: "rm-fam-ignore" };
  // Epic 4 — manual status one-tap level selector (LingQ-style new/1-4/known/ignore).
  var STATUS_OPTS = [
    ["new", ["room.morph.status.new", "новое"]], ["l1", null], ["l2", null], ["l3", null], ["l4", null],
    ["known", ["room.morph.status.known", "знаю"]], ["ignore", ["room.morph.status.ignore", "игнор"]],
  ];
  var _activeCard = null, _activeOcc = null, _attachOpts = {};
  // Epic-2 #2 — context needed to RE-resolve the active word with Tier-3 (per-card refine):
  // the stripped surface, its niqqud, and the sentence to send to Dicta. null on root-family
  // chip cards (no sentence) so the refine button never offers an outbound it can't make.
  var _activeWordCtx = null;
  // Root-family drill back-stack — tapping a «Слова от этого корня» chip pushes the current card
  // here, so «‹ Назад» can step back sequentially through however many drills (instead of forcing
  // the user to close + re-tap). Reset on a fresh word tap (onActivate) and on close.
  var _cardStack = [];
  var _cardReturnFocus = null;   // Epic 8b — element to restore focus to when the card closes (WCAG 2.4.3)

  function ensureSheet() {
    if (_sheet) return _sheet;
    var el = document.createElement("div");
    el.className = "rm-sheet";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");   // Epic 8b — WCAG: a backdrop-dimming sheet is modal
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
      if (t && t.closest && t.closest("[data-rm-back]")) { onCardBack(); return; }
      var sbtn = t && t.closest ? t.closest("[data-rm-status]") : null;
      if (sbtn) { onStatusSet(sbtn.getAttribute("data-rm-status")); return; }
      if (t && t.closest && t.closest("[data-rm-speak]")) { onSpeak(); return; }
      if (t && t.closest && t.closest("[data-rm-legend]")) { onLegendToggle(); return; }
      if (t && t.closest && t.closest("[data-rm-refine-go]")) { onRefine(false); return; }
      if (t && t.closest && t.closest("[data-rm-refine-all]")) { onRefine(true); return; }
      if (t && t.closest && t.closest("[data-rm-refine]")) { onRefinePrompt(); return; }
      if (t && t.closest && t.closest("[data-rm-meaning-save]")) { onMeaningSave(); return; }
      if (t && t.closest && t.closest("[data-rm-meaning-cancel]")) { onMeaningEditToggle(false); return; }
      if (t && t.closest && (t.closest("[data-rm-meaning-add]") || t.closest("[data-rm-meaning-edit]"))) { onMeaningEditToggle(true); return; }
      if (t && t.closest && t.closest(".rm-save")) { onSaveClick(); return; }
      var chip = t && t.closest ? t.closest(".rm-rootfam-chip") : null;
      if (chip) { onChipClick(chip); return; }
      // conjugation cells voice themselves via inline onclick → window.v3ConjSpeak.
    });
    // T-b — Enter inside the translation input saves; Esc cancels (mobile-keyboard friendly).
    el.addEventListener("keydown", function (e) {
      var t = e.target;
      if (!(t && t.closest && t.closest("[data-rm-meaning-input]"))) return;
      if (e.key === "Enter") { e.preventDefault(); onMeaningSave(); }
      else if (e.key === "Escape") { e.preventDefault(); onMeaningEditToggle(false); }
    });
    _sheet = el;
    return el;
  }

  function closeSheet() {
    if (_sheet) { _sheet.hidden = true; _sheet.classList.remove("rm-open"); }
    if (_activeSpan) { _activeSpan.classList.remove("rm-w-active"); _activeSpan = null; }
    _cardStack = [];   // drilling history dies with the sheet
    try { if (_cardReturnFocus && _cardReturnFocus.focus) _cardReturnFocus.focus(); } catch (_) {}   // WCAG 2.4.3 — restore focus
    _cardReturnFocus = null;
  }
  // Root-family «‹ Назад» — pop the previous card and re-render it (sequential, multi-level).
  function onCardBack() {
    var prev = _cardStack.pop();
    if (prev) openCard(prev.card, prev.occ);
  }

  // Epic 4 — one-tap manual status selector (new/1/2/3/4/known/ignore). Shown when a setWordStatus
  // handler is wired + we have a canonical lemmaKey. The active value is highlighted; re-tapping it
  // clears to «new». LingQ-style: known→clears the highlight, ignore→excluded from i+1.
  function statusSelectorHtml(card) {
    if (!card || !card.lemmaKey || typeof _attachOpts.setWordStatus !== "function") return "";
    // Highlight the EFFECTIVE status: an explicit manual status, else «new» ONLY for a confident
    // word (which auto-shows the purple «new wall»); an unconfident word with no status highlights
    // nothing (it's plain until the user marks it), so the toggle reads honestly.
    var cur = card.manualStatus || ((card.label === "exact" || card.label === "likely") ? "new" : "");
    var btns = STATUS_OPTS.map(function (o) {
      var val = o[0];
      var lab = o[1] ? escapeHtml(tt(o[1][0], o[1][1])) : val.replace("l", "");
      return '<button type="button" class="rm-status-btn rm-status-' + val + (cur === val ? " rm-status-active" : "") + '" data-rm-status="' + val + '">' + lab + "</button>";
    }).join("");
    return '<div class="rm-status" dir="' + uiDir() + '"><span class="rm-status-k">' + escapeHtml(tt("room.morph.status.title", "Мой статус")) + ":</span>" + btns + "</div>";
  }
  async function onStatusSet(value) {
    if (!_activeCard || !_activeCard.lemmaKey || typeof _attachOpts.setWordStatus !== "function") return;
    // Toggle on the ACTUAL stored status (not «new», which is now a real storable status): re-tap
    // the stored value → clear; otherwise store the tapped value (incl. «new» → purple).
    var st = (_activeCard.manualStatus === value) ? "" : value;
    try { await _attachOpts.setWordStatus(_activeCard.lemmaKey, st); } catch (_) {}
    _activeCard.manualStatus = st;
    var isConf = _activeCard.label === "exact" || _activeCard.label === "likely";
    var active = st || (isConf ? "new" : "");
    var sel = _sheet && _sheet.querySelectorAll(".rm-status-btn");
    if (sel) for (var i = 0; i < sel.length; i++) sel[i].classList.toggle("rm-status-active", sel[i].getAttribute("data-rm-status") === active);
  }

  // Epic 4.2 — in-text quick-status popover (long-press a word → set its level without opening the
  // full card). A floating singleton anchored near the word; reuses STATUS_OPTS + setWordStatus.
  var _statpop = null, _statpopKey = "", _statpopCur = "";
  function ensureStatPop() {
    if (_statpop) return _statpop;
    var el = document.createElement("div");
    el.className = "rm-statpop"; el.hidden = true;
    el.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-rm-statpop]") : null;
      if (b) { e.stopPropagation(); onStatPopSet(b.getAttribute("data-rm-statpop")); }
    });
    document.body.appendChild(el);
    return (_statpop = el);
  }
  function openStatPop(span, lemmaKey, cur, isConf) {
    var el = ensureStatPop();
    _statpopKey = lemmaKey;
    _statpopCur = cur || "";   // the ACTUAL stored status — drives the toggle (clear on re-tap)
    var active = _statpopCur || (isConf ? "new" : "");   // effective highlight (confident default = new)
    var btns = STATUS_OPTS.map(function (o) {
      var val = o[0], lab = o[1] ? escapeHtml(tt(o[1][0], o[1][1])) : val.replace("l", "");
      return '<button type="button" class="rm-status-btn rm-status-' + val + (active === val ? " rm-status-active" : "") + '" data-rm-statpop="' + val + '">' + lab + "</button>";
    }).join("");
    el.innerHTML = '<div class="rm-statpop-inner" dir="' + uiDir() + '">' + btns + "</div>";
    el.hidden = false;
    try {
      var r = span.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight, vw = window.innerWidth;
      var left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), vw - pw - 8);
      var top = r.top - ph - 8; if (top < 8) top = r.bottom + 8;   // flip below if no room above
      el.style.left = left + "px"; el.style.top = top + "px";
    } catch (_) {}
  }
  async function onStatPopSet(value) {
    if (!_statpopKey || typeof _attachOpts.setWordStatus !== "function") { closeStatPop(); return; }
    // Toggle on the ACTUAL stored status: re-tap the stored value → clear; else store it (incl. «new»).
    var st = (_statpopCur === value) ? "" : value;
    try { await _attachOpts.setWordStatus(_statpopKey, st); } catch (_) {}
    closeStatPop();
  }
  function closeStatPop() { if (_statpop) _statpop.hidden = true; _statpopKey = ""; _statpopCur = ""; }
  // Resolve the long-pressed word → lemmaKey + current status → show the popover. Falls back to the
  // full card when the word can't be confidently keyed (so a long-press is never a dead end).
  async function showStatusPopover(span) {
    if (typeof _attachOpts.setWordStatus !== "function") return false;
    try { window.getSelection().removeAllRanges(); } catch (_) {}
    var surface = span.getAttribute("data-surface") || span.textContent || "";
    var niqqud = span.getAttribute("data-niqqud") || "";
    var lk = "", cur = "", isConf = false;
    try {
      var eng = await ensureEngine();
      var card = await resolveCore(eng, stripNiqqud(niqqud) || surface, niqqud);
      // Key IDENTICALLY to the card (resolveWordLight) + decorateWords via the shared keyer, so a
      // long-press status lands on the same key the paint looks up.
      lk = statusKeyForCard(eng.NA, card, niqqud, stripNiqqud(niqqud) || surface);
      isConf = card.label === "exact" || card.label === "likely";
    } catch (_) { lk = ""; }
    if (!lk) return false;   // caller falls back to opening the card
    if (typeof _attachOpts.getWordStatus === "function") { try { cur = (await _attachOpts.getWordStatus(lk)) || ""; } catch (_) {} }
    openStatPop(span, lk, cur, isConf);
    return true;
  }

  // Epic-3a — pronounce the active card's headword (vocalized form). Prefers the wired GCP→browser
  // speakWord; falls back to the in-card browser TTS (v3ConjSpeak) used by the conjugation cells.
  function onSpeak() {
    if (!_activeCard) return;
    var he = _activeCard.niqqud || _activeCard.word || "";
    if (!he) return;
    if (typeof _attachOpts.speakWord === "function") { try { _attachOpts.speakWord(he); return; } catch (_) {} }
    try { if (typeof window !== "undefined" && window.v3ConjSpeak) window.v3ConjSpeak(he); } catch (_) {}
  }

  // Epic-2 #1 — toggle the confidence-taxonomy legend under the «?» badge-helper.
  function onLegendToggle() {
    if (!_sheet) return;
    var panel = _sheet.querySelector("[data-rm-legend-panel]");
    var btn = _sheet.querySelector("[data-rm-legend]");
    if (!panel) return;
    var show = panel.hidden;
    panel.hidden = !show;
    if (btn) btn.setAttribute("aria-expanded", show ? "true" : "false");
  }

  // Epic-2 #2 — per-card refine. The button reveals a one-line consent confirm (R5: the
  // outbound is explicit, per card, never silent). «Уточнить разово» does a single Dicta call
  // for THIS word without touching the global auto-mode; «Включить для всех слов» grants the
  // global consent first. Either way we re-resolve the word with context and re-render.
  function onRefinePrompt() {
    if (!_sheet) return;
    var btn = _sheet.querySelector("[data-rm-refine]");
    var panel = _sheet.querySelector("[data-rm-refine-confirm]");
    if (btn) { btn.hidden = true; btn.setAttribute("aria-expanded", "true"); }
    if (panel) panel.hidden = false;
  }
  async function onRefine(grantAll) {
    if (typeof _attachOpts.refineContext !== "function" || !_activeWordCtx || !_activeWordCtx.sentence) return;
    if (grantAll && typeof _attachOpts.grantContextConsent === "function") { try { _attachOpts.grantContextConsent(); } catch (_) {} }
    var box = _sheet && _sheet.querySelector(".rm-refine");
    if (box) box.innerHTML = '<div class="rm-refine-busy">' + escapeHtml(tt("room.morph.refining", "Уточняю в контексте…")) + "</div>";
    var wc = _activeWordCtx;
    var ctx = null;
    try { ctx = await _attachOpts.refineContext(wc.sentence, wc.surface); } catch (_) { ctx = null; }
    try {
      var card = await resolveWordLight(wc.surface, wc.niqqud, ctx);
      if (card) { card.refineTried = true; if (_activeWordCtx === wc) openCard(card, _activeOcc); }
    } catch (_) { /* keep the (now busy-cleared) card; a re-tap retries */ }
  }

  function renderCardHtml(card) {
    if (!card) return '<div class="rm-card-empty">' + escapeHtml(tt("room.morph.empty", "Слово не распознано.")) + "</div>";
    var label = LABEL_TEXT[card.label] || LABEL_TEXT.unknown;
    var rows = "";
    var add = function (k, v, he) { if (v) rows += '<div class="rm-row"><span class="rm-k">' + escapeHtml(k) + '</span><span class="rm-v"' + (he ? ' lang="he"' : "") + ">" + escapeHtml(v) + "</span></div>"; };
    add(tt("room.morph.root", "корень"), card.root, true);
    if (card.binyan) add(tt("room.morph.binyan", "биньян"), card.binyan, false);
    if (card.pos) { var pt = POS_TEXT[card.pos]; add(tt("room.morph.posLabel", "часть речи"), pt ? tt(pt[0], pt[1]) : card.pos, false); }
    // Epic-3a — pronounce the headword (🔊): GCP-when-keyed → keyless browser. Shown whenever a
    // speak handler is wired (or browser TTS is available); voices the vocalized form.
    var speakBtn = (_attachOpts.speakWord || (typeof window !== "undefined" && window.v3ConjSpeak))
      ? '<button type="button" class="rm-speak" data-rm-speak aria-label="' + escapeHtml(tt("room.morph.pronounce", "Произнести")) + '">🔊</button>'
      : "";
    var head =
      '<div class="rm-head">' +
      '<span class="rm-word-wrap"><span class="rm-word" lang="he">' + escapeHtml(card.niqqud || card.word) + "</span>" + speakBtn + "</span>" +
      '<span class="rm-badges">' +
      '<span class="rm-prov-line">' +
      '<span class="rm-prov rm-prov-' + escapeHtml(card.label) + '">' + escapeHtml(tt(label[0], label[1])) + "</span>" +
      '<button type="button" class="rm-prov-help" data-rm-legend aria-expanded="false" aria-label="' + escapeHtml(tt("room.morph.legend.title", "Что значат бейджи уверенности?")) + '">?</button>' +
      "</span>" +
      '<span class="rm-life" data-rm-life hidden></span>' +
      "</span>" +
      "</div>";
    // Epic-2 #3 — niqqud honesty (R9 derived-as-asserted): the vocalization shown is machine-made
    // (Dicta/Gemini), not native — say so when the headword actually carries niqqud points.
    var niqMark = (card.niqqud && /[֑-ׇ]/.test(card.niqqud))
      ? '<div class="rm-niqqud-prov" dir="' + uiDir() + '"><span class="rm-niqqud-prov-ic" aria-hidden="true">ⓜ</span> ' + escapeHtml(tt("room.morph.niqqudMachine", "огласовка — машинная (Dicta)")) + "</div>"
      : "";
    // T-b — manual translation: when the resolver has no offline gloss, let the learner add
    // their OWN (a real word_study note, Anki-synced). A user-asserted meaning is tagged «ваш»
    // (R9 provenance ≠ machine) and stays editable; the inline editor is hidden until invoked.
    var canEditMeaning = typeof _attachOpts.saveUserMeaning === "function";
    var meaning;
    if (card.meaning) {
      var provBadge = card.meaningSource === "user"
        ? ' <span class="rm-meaning-mine" title="' + escapeHtml(tt("room.morph.yourMeaningHint", "ваш перевод, не машинный")) + '">' + escapeHtml(tt("room.morph.yourMeaning", "ваш")) + "</span>"
        : "";
      var editIc = canEditMeaning
        ? ' <button type="button" class="rm-meaning-edit" data-rm-meaning-edit aria-label="' + escapeHtml(tt("room.morph.editMeaning", "Изменить перевод")) + '">✎</button>'
        : "";
      meaning = '<div class="rm-meaning" dir="ltr">' + escapeHtml(card.meaning) + provBadge + editIc + "</div>";
    } else {
      var addBtn = canEditMeaning
        ? ' <button type="button" class="rm-meaning-add" data-rm-meaning-add>' + escapeHtml(tt("room.morph.addMeaning", "＋ Добавить перевод")) + "</button>"
        : "";
      meaning = '<div class="rm-meaning rm-meaning-empty" dir="ltr">' + escapeHtml(tt("room.morph.noGloss", "Перевод не найден офлайн.")) + addBtn + "</div>";
    }
    var meaningEditor = canEditMeaning
      ? '<div class="rm-meaning-editor" data-rm-meaning-editor dir="' + uiDir() + '" hidden>' +
          '<input type="text" class="rm-meaning-input" data-rm-meaning-input dir="ltr" maxlength="120" ' +
            'placeholder="' + escapeHtml(tt("room.morph.meaningPlaceholder", "перевод / значение")) + '" ' +
            'value="' + escapeHtml(card.meaningSource === "user" ? (card.meaning || "") : "") + '" />' +
          '<button type="button" class="rm-meaning-save" data-rm-meaning-save>' + escapeHtml(tt("room.morph.saveMeaning", "Сохранить")) + "</button>" +
          '<button type="button" class="rm-meaning-cancel" data-rm-meaning-cancel>' + escapeHtml(tt("room.morph.cancel", "Отмена")) + "</button>" +
        "</div>"
      : "";
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
    // Epic-3a — root-family chips are no longer dead Hebrew: each shows the vocalized form + its
    // POS + gloss + the learner's status colour (known/learning/new). Homographs are kept as
    // separate chips (deduped by pealim_id upstream). Tapping a chip opens its own honest card.
    var fam = (card.rootFamily && card.rootFamily.length && !card.ambiguous)
      ? '<details class="rm-acc"><summary class="rm-acc-sum">' + escapeHtml(tt("room.morph.rootFamily", "Слова от этого корня")) + "</summary>" +
        '<div class="rm-rootfam">' + card.rootFamily.map(function (x) {
          var stCls = x.state && FAM_STATE[x.state] ? " " + FAM_STATE[x.state] : "";
          var pt = x.pos && POS_TEXT[x.pos];
          var posL = pt ? tt(pt[0], pt[1]) : "";
          var meta = (posL || x.meaning)
            ? '<span class="rm-fam-meta">' + (posL ? '<span class="rm-fam-pos">' + escapeHtml(posL) + "</span>" : "") +
              (x.meaning ? '<span class="rm-fam-gloss" dir="ltr">' + escapeHtml(x.meaning) + "</span>" : "") + "</span>"
            : "";
          return '<button type="button" class="rm-rootfam-chip' + stCls + '" data-w="' + escapeHtml(x.disp) + '">' +
            '<span class="rm-fam-he" dir="rtl" lang="he">' + escapeHtml(x.disp) + "</span>" + meta + "</button>";
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
    // Epic-2 #2 — per-card one-off Tier-3 refine. Offered ONLY when the offline reading is
    // non-decisive (not «точно», not a closed-class function word) AND not already context-used,
    // we have the sentence, a refine provider is wired, and canRefine() is true — which the app
    // sets to (online && global auto-mode OFF). Granted users already auto-refine every tap, so
    // the button would be redundant; offline it is hidden (R5 privacy: no silent outbound).
    var refineWired = card && typeof _attachOpts.refineContext === "function" && _activeWordCtx && _activeWordCtx.sentence;
    var refineEligible = refineWired && !card.contextUsed && card.label !== "exact" && card.label !== "function" &&
      (typeof _attachOpts.canRefine !== "function" || _attachOpts.canRefine());
    var refineHtml = "";
    if (card && card.refineTried && !card.contextUsed) {
      refineHtml = '<div class="rm-refine"><div class="rm-refine-miss">' + escapeHtml(tt("room.morph.refineMiss", "Контекст не дал уточнения.")) + "</div></div>";
    } else if (refineEligible) {
      refineHtml =
        '<div class="rm-refine">' +
        '<button type="button" class="rm-refine-btn" data-rm-refine aria-expanded="false">' + escapeHtml(tt("room.morph.refine", "🎯 Уточнить в контексте")) + "</button>" +
        '<div class="rm-refine-confirm" data-rm-refine-confirm dir="' + uiDir() + '" hidden>' +
        '<div class="rm-refine-note">' + escapeHtml(tt("room.morph.refineNote", "Разово отправит это предложение в облако Dicta, чтобы выбрать значение по контексту. Машинный разбор, не носитель.")) + "</div>" +
        '<div class="rm-refine-actions">' +
        '<button type="button" class="rm-refine-go" data-rm-refine-go>' + escapeHtml(tt("room.morph.refineGo", "Уточнить разово")) + "</button>" +
        '<button type="button" class="rm-refine-all" data-rm-refine-all>' + escapeHtml(tt("room.morph.refineAll", "Включить для всех слов")) + "</button>" +
        "</div></div></div>";
    }
    // Root-family drill — «‹ Назад» row when we've drilled in from a chip (sequential pop).
    var backRow = _cardStack.length
      ? '<button type="button" class="rm-back" data-rm-back>‹ ' + escapeHtml(tt("room.morph.back", "Назад")) + "</button>"
      : "";
    return backRow + head + legendHtml() + niqMark + meaning + meaningEditor + altLine + ctxPosLine + statusSelectorHtml(card) + '<div class="rm-rows">' + rows + "</div>" + '<div class="rm-actions">' + saveBtn + link + "</div>" + refineHtml + fam + conj;
  }

  function openCardLoading() {
    var el = ensureSheet();
    if (el.hidden) { try { _cardReturnFocus = document.activeElement; } catch (_) { _cardReturnFocus = null; } }   // fresh open → remember trigger
    el.querySelector(".rm-sheet-body").innerHTML = '<div class="rm-loading">' + escapeHtml(tt("room.morph.loading", "Анализ…")) + "</div>";
    el.hidden = false; el.classList.add("rm-open");
    try { var x = el.querySelector(".rm-sheet-x"); if (x) x.focus(); } catch (_) {}   // WCAG 2.4.3 — focus into the dialog
  }
  function openCard(card, occ) {
    _activeCard = card; _activeOcc = occ || null;
    var el = ensureSheet();
    el.querySelector(".rm-sheet-body").innerHTML = renderCardHtml(card);
    el.hidden = false; el.classList.add("rm-open");
    if (card) refreshCardMeta(card);
  }
  // Epic 4.3a+ — open the SAME rich tap-card for an arbitrary word (e.g. a «📚 Учить» study row),
  // so a study word expands to its FORM-level analysis (present-tense כּוֹתֵב → verb/paal +
  // conjugation table with the met form highlighted + root family), not just the lemma gloss.
  // Reuses resolveWordLight + openCard verbatim (R11: no parallel morphology view). No sentence
  // context → no per-card refine (like a root-family chip card). _attachOpts (status/save/speak)
  // is whatever the reader wired via attach(); the card degrades gracefully if unwired.
  async function openWordCard(surface, niqqud) {
    _activeWordCtx = null; _cardStack = [];
    openCardLoading();
    try { var card = await resolveWordLight(stripNiqqud(surface) || surface, niqqud); openCard(card, null); }
    catch (_) { openCard(null, null); }
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
  // T-b — translation editor (out-of-dict words). Toggle reveals an inline input; save persists
  // the learner's own meaning into the canonical word_study note (caller's saveUserMeaning) and
  // re-renders the card so it shows the meaning + «ваш» + flips the lifecycle badge.
  function onMeaningEditToggle(open) {
    if (!_sheet) return;
    var box = _sheet.querySelector("[data-rm-meaning-editor]");
    if (!box) return;
    box.hidden = !open;
    if (open) {
      var input = _sheet.querySelector("[data-rm-meaning-input]");
      if (input) { try { input.focus(); input.select(); } catch (_) {} }
    }
  }
  async function onMeaningSave() {
    if (!_activeCard || typeof _attachOpts.saveUserMeaning !== "function") return;
    var input = _sheet && _sheet.querySelector("[data-rm-meaning-input]");
    var val = input ? String(input.value || "").trim() : "";
    if (!val) { if (input) { try { input.focus(); } catch (_) {} } return; }
    var btn = _sheet && _sheet.querySelector(".rm-meaning-save");
    if (btn) btn.disabled = true;
    try {
      await _attachOpts.saveUserMeaning(_activeCard, _activeOcc, val);
      _activeCard.meaning = val; _activeCard.meaningSource = "user";
      openCard(_activeCard, _activeOcc);   // re-render → meaning + «ваш» + «✓ В заметках»
    } catch (_) { if (btn) btn.disabled = false; }
  }
  // Tap a root-family chip → open that related word's card (no occurrence context).
  async function onChipClick(chip) {
    var disp = chip.getAttribute("data-w") || "";
    var surface = stripNiqqud(disp);
    if (!surface) return;
    if (_activeCard) _cardStack.push({ card: _activeCard, occ: _activeOcc });   // drill → remember where we came from
    _activeWordCtx = null;   // chip card has no sentence → no per-card refine offered
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
        // The sentence (for any Tier-3 reach) + the word's resolve inputs, stashed so the
        // per-card refine can RE-resolve this exact word later (Epic-2 #2).
        var tr = span.closest("tr[data-row-idx]");
        var rowIdx = tr ? Number(tr.getAttribute("data-row-idx")) : NaN;
        var row = Number.isFinite(rowIdx) ? getRow(rowIdx) : null;
        var sentence = row ? (String(row.he || "") || stripNiqqud(String(row.he_niqqud || ""))) : "";
        _activeWordCtx = { surface: stripNiqqud(surface), niqqud: niqqud, sentence: sentence };
        _cardStack = [];   // a fresh word tap starts a new drill history
        // Tier-3 «точный режим» (opt-in, GLOBAL auto): when a contextProvider is wired it
        // gates on the user's standing consent and returns the context reading (or null when
        // declined/undecided/offline); degrade silently to offline on any miss.
        var ctx = null;
        if (typeof _attachOpts.contextProvider === "function" && sentence) {
          try { ctx = await _attachOpts.contextProvider(sentence, stripNiqqud(surface)); } catch (_) { ctx = null; }
        }
        var card = await resolveWordLight(surface, niqqud, ctx);
        if (_activeSpan === span) openCard(card, occ);
      } catch (e) { if (_activeSpan === span) openCard(null, occ); }
    };

    // Epic 4.2 — long-press a word → quick-status popover (set level without opening the card).
    // A short press is a normal tap (→ card); a long press shows the popover AND suppresses the
    // click that follows, so the two gestures never both fire. Movement/scroll cancels (it's a drag).
    var LP_MS = 480, LP_MOVE = 10, _lpTimer = null, _lpSpan = null, _lpXY = null, _suppressClick = false;
    var cancelLP = function () { if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; } _lpSpan = null; };
    var onPointerDown = function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (!span || !mount.contains(span)) return;
      _lpSpan = span; _lpXY = { x: e.clientX, y: e.clientY };
      if (_lpTimer) clearTimeout(_lpTimer);
      _lpTimer = setTimeout(function () {
        _lpTimer = null;
        if (_lpSpan !== span) return;
        showStatusPopover(span).then(function (ok) { if (ok) _suppressClick = true; });
      }, LP_MS);
    };
    var onPointerMove = function (e) {
      if (!_lpTimer || !_lpXY) return;
      if (Math.abs(e.clientX - _lpXY.x) > LP_MOVE || Math.abs(e.clientY - _lpXY.y) > LP_MOVE) cancelLP();
    };
    var onPointerUp = function () { cancelLP(); };

    var onClick = function (e) {
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (span && mount.contains(span)) {
        e.preventDefault(); e.stopPropagation();
        if (_suppressClick) { _suppressClick = false; return; }   // long-press already handled this word
        onActivate(span);
      }
    };
    var onKey = function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (span && mount.contains(span)) { e.preventDefault(); e.stopPropagation(); onActivate(span); }
    };
    var onDocKey = function (e) { if (e.key === "Escape") { closeStatPop(); closeSheet(); } };
    var onDocDown = function (e) { if (_statpop && !_statpop.hidden && e.target && e.target.closest && !e.target.closest(".rm-statpop")) closeStatPop(); };
    var onScroll = function () { closeStatPop(); };

    // Capture phase so a word tap is handled BEFORE reader-core's row-audio delegate.
    mount.addEventListener("click", onClick, true);
    mount.addEventListener("keydown", onKey);
    mount.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onDocKey);
    window.addEventListener("scroll", onScroll, true);

    return {
      refresh: refresh,
      detach: function () {
        mount.removeEventListener("click", onClick, true);
        mount.removeEventListener("keydown", onKey);
        mount.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        document.removeEventListener("pointerdown", onDocDown, true);
        document.removeEventListener("keydown", onDocKey);
        window.removeEventListener("scroll", onScroll, true);
        cancelLP(); closeStatPop(); closeSheet();
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
  // Epic 4 — manual LingQ-style levels (l1..l4) + known/ignore join the SRS-derived states.
  // Palette (cross-competitor standard): new=blue · l1..l4=amber gradient · known=NO tint (the
  // wall clears) · ignore=plain (faint dotted). The class is applied; the colour lives in CSS.
  var STATE_CLASS = { known: "rm-w-known", learning: "rm-w-learning", weak: "rm-w-learning", stale: "rm-w-learning", "new": "rm-w-new", l1: "rm-w-l1", l2: "rm-w-l2", l3: "rm-w-l3", l4: "rm-w-l4", ignore: "rm-w-ignore" };
  var _RM_W_CLASSES = ["rm-w-known", "rm-w-learning", "rm-w-new", "rm-w-l1", "rm-w-l2", "rm-w-l3", "rm-w-l4", "rm-w-ignore"];
  // "familiar" mirrors corpus-vocab CFG.KNOWN_STATES (saved=familiar; §7 — owner's saved vocab
  // sits in 'new'/Anki, so familiar = any engaged word, not just mastered). Manual levels + ignore
  // are engaged too → familiar (niqqud may fade on them).
  var FAMILIAR = { known: 1, learning: 1, weak: 1, stale: 1, "new": 1, l1: 1, l2: 1, l3: 1, l4: 1, ignore: 1 };

  // PURE (Node-testable): does the niqqud cell show the PLAIN surface or the vocalized form?
  // Fade only in 'adaptive' mode, only for confidently-resolved familiar words. Everything else
  // (full mode, off mode, unconfident, unknown) keeps the niqqud.
  function fadeDecision(state, label, mode) {
    if (mode !== "adaptive") return "niqqud";
    var confident = (label === "exact" || label === "likely");
    if (confident && state && FAMILIAR[state]) return "plain";
    return "niqqud";
  }

  // W5 (Epic 5 niqqud-fade-graduation) — has the reader genuinely learned enough words that the adaptive
  // niqqud fade is worth OFFERING? Counts GENUINELY-LEARNED states (known + SRS learning/weak/stale + manual
  // levels l1–l4); deliberately EXCLUDES 'new' (tracked-but-unknown) and 'ignore' (skipped, e.g. names) —
  // those de-vocalize in adaptive but are NOT a "you're making progress" signal. Pure (Node-testable);
  // the offer is one-time + opt-in (the USER, not this fn, flips the mode — fadeDecision is unchanged).
  var GENUINELY_LEARNED = { known: 1, learning: 1, weak: 1, stale: 1, l1: 1, l2: 1, l3: 1, l4: 1 };
  var FADE_GRADUATION_MIN = 40;
  function fadeGraduationReady(statesMap, min) {
    if (!statesMap) return false;
    var need = (typeof min === "number" && min > 0) ? min : FADE_GRADUATION_MIN, n = 0;
    for (var k in statesMap) { if (GENUINELY_LEARNED[statesMap[k]]) { n++; if (n >= need) return true; } }
    return false;
  }

  function _colOf(span) { var td = span && span.closest ? span.closest("td[data-col]") : null; return td ? td.getAttribute("data-col") : null; }

  // Remove all decorations: colour classes + restore any de-vocalized niqqud spans. Cheap, no resolve.
  function clearDecorations(mount) {
    if (!mount) return;
    var painted = mount.querySelectorAll("." + _RM_W_CLASSES.join(", ."));
    for (var i = 0; i < painted.length; i++) painted[i].classList.remove.apply(painted[i].classList, _RM_W_CLASSES);
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
    // The status key of a FUNCTION word depends on its PealimFunctionLinks id (_statusPid). The map
    // is lazy; if it isn't loaded yet the paint would key by surface#pos while the saved status is
    // pid:N → a brief miss until the next repaint. Await readiness so the very first paint already
    // keys function words by pid (consistent with resolveWordLight). Idempotent + offline-cheap.
    try { if (window.PealimFunctionLinks && window.PealimFunctionLinks.ensureReady) await window.PealimFunctionLinks.ensureReady(); } catch (_) {}
    var spans = Array.prototype.slice.call(mount.querySelectorAll(".rm-w"));
    var i = 0;
    while (i < spans.length) {
      var end = Math.min(i + 60, spans.length);
      for (; i < end; i++) {
        var span = spans[i];
        span.classList.remove.apply(span.classList, _RM_W_CLASSES);
        var isNiqqud = _colOf(span) === "niqqud";
        var surface = span.getAttribute("data-surface") || "";
        var niqqud = span.getAttribute("data-niqqud") || "";
        var card; try { card = await resolveCore(eng, surface, niqqud); }
        catch (_) { if (isNiqqud && niqqud != null) span.textContent = niqqud; continue; }   // unconfident → keep niqqud
        var confident = !!(card && (card.label === "exact" || card.label === "likely"));   // gate (R1/R10)
        // T-a — key EVERY word (pid:/lemma#pos for confident · surface#pos / surface# for unconfident)
        // via the shared keyer, byte-identical to setWordStatus/getKnownWordStates, so a MANUAL status
        // on a function/unknown word (which the resolver can't confidently ID) still colours by surface.
        var lk = statusKeyForCard(NA, card, niqqud, surface);
        var raw = lk ? states[lk] : undefined;
        if (color) {
          // Confident → defaults to 'new' (the unseen «blue wall»). UNCONFIDENT → coloured ONLY when the
          // user explicitly engaged it (manual status OR saved note → a states entry); NEVER defaulted to
          // 'new' (honest: we don't fabricate a status for a word we can't identify). R11 precedence: a
          // confident word uses its lemma-key, so a surface-status never leaks onto a confident homograph.
          var st = confident ? (raw || "new") : (raw || "");
          var cls = st ? STATE_CLASS[st] : "";
          if (cls) span.classList.add(cls);
        }
        if (isNiqqud) span.textContent = (fadeDecision(confident ? raw : undefined, card ? card.label : null, fadeMode) === "plain") ? surface : niqqud;
      }
      if (i < spans.length) await new Promise(function (r) { setTimeout(r, 0); });
    }
  }

  // ── Epic 4.3a+ — frontier-study collection (R2/R8 i+1) ──────────────────────
  // Gather the learner's NEXT words from the painted reader: confidently-resolved content words
  // (label exact|likely → a real root/gloss, R1-honest) whose status is still new/unset, ranked by
  // in-text frequency (most-frequent first = best next words, mirrors corpus-vocab's frontier rank).
  // Keyed THROUGH statusKeyForCard — byte-identical to decorateWords' paint key — so a word collected
  // here is the SAME word the text colours, and marking it from the study sheet repaints the exact
  // occurrences (save-key == paint-key). statesMap = getKnownWordStates() (note-derived + manual).
  // opts: { topN?  → omit for the FULL frontier (caller paginates) · rowFrom?/rowTo? → restrict the
  // scan to a row range (scope «дальше по тексту») }. Returns [{ lemmaKey, surface, niqqud, gloss,
  // root, pos, freq, nameSuspect }] (freq-desc, deterministic tie-break on first appearance — no
  // Math.random). Pure-engine + DOM-read; the caller (library-ui) owns the sheet + persistence.
  // Chunked like decorateWords so a long text never blocks the UI.
  //
  // NAME_HINT (R10·R6·R1) — common Hebrew given-names that are DICTIONARY HOMOGRAPHS (resolve
  // confidently as a content word): in prose/plays they top the frequency list as character names
  // mis-glossed as vocabulary (יהודית→«еврейский», צבי→«газель», עליזה→«весёлый»). This ONLY sets a
  // SOFT `nameSuspect` flag for the study list (a «возможно имя» hint + an opt-in «hide names»
  // filter); it NEVER changes resolveCore/colour/notes (≠ NAME_PROPER, which suppresses morphology)
  // — R11/R1-safe. Keyed on the niqqud-stripped skeleton. Clear non-homograph names already fall out
  // via the resolver's NAME_PROPER gazetteer (label≠confident → excluded from the frontier entirely).
  var NAME_HINT = {
    "יהודית":1,"צבי":1,"עליזה":1,"ורד":1,"יעל":1,"תמר":1,"שושנה":1,"אילה":1,"נעמי":1,"רחל":1,
    "שרה":1,"ברק":1,"שחר":1,"ניר":1,"עומר":1,"עמר":1,"שירה":1,"רון":1,"גיל":1,"נועם":1,
    "איתן":1,"עוז":1,"דרור":1,"כרמל":1,"רות":1,"אביב":1,"אלון":1,"ארז":1,"תומר":1,"רימון":1,
    "גפן":1,"מרגלית":1,"פנינה":1,"כוכבה":1,"לבנה":1,"נחמה":1,"מנוחה":1,"מזל":1,"אורה":1,"חמדה":1,
    "נורית":1,"סיגל":1,"רעות":1,"זהבה":1,
  };
  function _studyWordSpans(mount) {
    // Count each word ONCE: prefer the he column (its spans carry the aligned vocalized form), then
    // the niqqud column, then any .rm-w. Scanning BOTH columns would double every word's frequency.
    var he = mount.querySelectorAll('#proTable tbody td[data-col="he"] .rm-w');
    if (he.length) return Array.prototype.slice.call(he);
    var nq = mount.querySelectorAll('#proTable tbody td[data-col="niqqud"] .rm-w');
    if (nq.length) return Array.prototype.slice.call(nq);
    return Array.prototype.slice.call(mount.querySelectorAll(".rm-w"));
  }
  // Shared scan — ONE chunked pass over the painted he-spans → Map(lemmaKey → {surface, niqqud,
  // gloss, root, pos, freq, nameSuspect, occ:[{rowIdx,wordOffset}], _i}). Only confident content
  // words (exact|likely). Keyed via statusKeyForCard (collect==save==paint parity). collectNewWords
  // (frontier) + collectReviewItems (4.3b recall) both build on this — single source, no drift.
  async function _scanWords(mount, opts) {
    opts = opts || {};
    var rowFrom = (opts.rowFrom != null) ? Number(opts.rowFrom) : null;
    var rowTo = (opts.rowTo != null) ? Number(opts.rowTo) : null;
    var group = new Map();
    if (!mount) return group;
    var NA = window.NotesAutoGen;
    var eng; try { eng = await ensureEngine(); } catch (_) { return group; }
    try { if (window.PealimFunctionLinks && window.PealimFunctionLinks.ensureReady) await window.PealimFunctionLinks.ensureReady(); } catch (_) {}
    var spans = _studyWordSpans(mount);
    var i = 0;
    while (i < spans.length) {
      var end = Math.min(i + 60, spans.length);
      for (; i < end; i++) {
        var span = spans[i];
        var tr = span.closest ? span.closest("tr[data-row-idx]") : null;
        var ri = tr ? Number(tr.getAttribute("data-row-idx")) : NaN;
        if (rowFrom != null || rowTo != null) {   // scope (B): «дальше по тексту»
          if (Number.isFinite(ri)) {
            if (rowFrom != null && ri < rowFrom) continue;
            if (rowTo != null && ri > rowTo) continue;
          }
        }
        var surface = span.getAttribute("data-surface") || "";
        var niqqud = span.getAttribute("data-niqqud") || "";
        var card; try { card = await resolveCore(eng, surface, niqqud); } catch (_) { continue; }
        // Only confidently-resolved content words (a real root/gloss). Function/unknown → excluded.
        if (!card || (card.label !== "exact" && card.label !== "likely")) continue;
        var lk = statusKeyForCard(NA, card, niqqud, surface);
        if (!lk) continue;
        var g = group.get(lk);
        if (!g) {
          var skel = stripNiqqud(card.word || surface);
          g = { lemmaKey: lk, surface: card.word || surface, niqqud: card.niqqud || niqqud, gloss: card.meaning || "", root: card.root || "", pos: card.pos || "", freq: 0, nameSuspect: !!NAME_HINT[skel], occ: [], _i: i };
          group.set(lk, g);
        }
        g.freq++;
        var off = Number(span.getAttribute("data-w-offset"));
        if (Number.isFinite(ri) && Number.isFinite(off) && g.occ.length < 12) g.occ.push({ rowIdx: ri, wordOffset: off });
      }
      if (i < spans.length) await new Promise(function (r) { setTimeout(r, 0); });
    }
    return group;
  }
  async function collectNewWords(mount, statesMap, opts) {
    opts = opts || {};
    var topN = (opts.topN != null) ? Number(opts.topN) : null;   // omit → FULL frontier (caller paginates)
    var states = statesMap || {};
    var group = await _scanWords(mount, opts);
    var arr = [];
    group.forEach(function (g) { var st = states[g.lemmaKey]; if (st === undefined || st === "new") arr.push(g); });
    arr.sort(function (a, b) { return b.freq - a.freq || a._i - b._i; });
    if (topN != null && topN >= 0) arr = arr.slice(0, topN);
    return arr.map(function (g) {
      return { lemmaKey: g.lemmaKey, surface: g.surface, niqqud: g.niqqud, gloss: g.gloss, root: g.root, pos: g.pos, freq: g.freq, nameSuspect: g.nameSuspect };
    });
  }
  // ── Epic 4.3b — recall items (cloze training) ───────────────────────────────
  // ALL confident lemmas of the (scoped) text + effective status (states[lk]||'new' — untouched
  // confident = the «new» frontier) + occurrences (rowIdx+wordOffset, so the caller builds a cloze
  // from the REAL sentence) + freq. Returns the whole set: library-ui filters the SESSION by status
  // (l1–l4 + new + capped known-refresh) AND uses the full list as the morpho-honest distractor pool.
  async function collectReviewItems(mount, statesMap, opts) {
    var states = statesMap || {};
    var group = await _scanWords(mount, opts);
    var arr = Array.from(group.values());
    arr.sort(function (a, b) { return b.freq - a.freq || a._i - b._i; });
    return arr.map(function (g) {
      return { lemmaKey: g.lemmaKey, surface: g.surface, niqqud: g.niqqud, gloss: g.gloss, root: g.root, pos: g.pos, freq: g.freq, nameSuspect: g.nameSuspect, status: (states[g.lemmaKey] || "new"), occ: g.occ.slice(0, 8) };
    });
  }
  // ── Epic 4.3b — pure recall helpers (Node-testable) ─────────────────────────
  // buildCloze: blank the wordOffset-th WORD token of a tokenized sentence, keeping separators.
  // tokens = tokenize(sentence). Returns { answer, before, after } or null (offset out of range).
  function buildCloze(tokens, wordOffset) {
    if (!Array.isArray(tokens)) return null;
    var w = -1, ti = -1;
    for (var i = 0; i < tokens.length; i++) { if (tokens[i] && tokens[i].isWord) { w++; if (w === wordOffset) { ti = i; break; } } }
    if (ti < 0) return null;
    var before = "", after = "";
    for (var j = 0; j < tokens.length; j++) { if (j < ti) before += tokens[j].text; else if (j > ti) after += tokens[j].text; }
    return { answer: tokens[ti].text, before: before, after: after };
  }
  // Epic 4.3b Phase A (A1+A2) — blank EVERY word token whose niqqud-stripped skeleton === targetSkel.
  // Keying by skeleton (not a HE-column index) fixes offset drift between he and he_niqqud tokenizations,
  // and blanking all matches kills the repeated-target leak (a twin of the answer staying visible).
  // Returns { answer (first matched token's vocalized text), segments:[{t}|{blank}], count } or null
  // when NO token matches (→ caller treats the occurrence as unusable, never a wrong/leaky question).
  function buildClozeForTarget(tokens, targetSkel) {
    if (!Array.isArray(tokens) || !targetSkel) return null;
    var idx = {}, answer = "", count = 0;
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk && tk.isWord && stripNiqqud(tk.text) === targetSkel) { idx[i] = 1; if (!answer) answer = tk.text; count++; }
    }
    if (!count) return null;
    var segments = [];
    for (var j = 0; j < tokens.length; j++) segments.push(idx[j] ? { blank: true } : { t: tokens[j].text });
    return { answer: answer, segments: segments, count: count };
  }
  // nextLevel: gentle do-no-harm SRS-lite (owner decision 3). correct → +1 (…→known); wrong → −1
  // with floors (new stays, l1 floors at l1, known→l4 — one miss never nukes a known word to «new»).
  var _LV_UP = { "new": "l1", l1: "l2", l2: "l3", l3: "l4", l4: "known", known: "known" };
  var _LV_DOWN = { "new": "new", l1: "l1", l2: "l1", l3: "l2", l4: "l3", known: "l4" };
  function nextLevel(status, correct) {
    var s = status || "new";
    return (correct ? _LV_UP : _LV_DOWN)[s] || s;
  }
  // Epic 4.3b Phase C2 — SM2-lite time-based schedule (PURE, Node-testable; nowMs passed in so it's
  // deterministic/replayable). prev = { interval(days), reps, lapses } (0/0/0 if never recall-tested).
  // correct → reps++ and the interval grows (1d → 3d → ×2.3, capped 365d); wrong → reps reset, lapse++,
  // interval 0 (due now = re-test next session). Returns { interval, reps, lapses, due(ms) }.
  function nextSrs(prev, correct, nowMs) {
    var p = prev || {}, reps = p.reps || 0, lapses = p.lapses || 0, interval = p.interval || 0;
    if (correct) {
      reps += 1;
      interval = reps <= 1 ? 1 : (reps === 2 ? 3 : Math.min(365, Math.round(interval * 2.3)));
    } else {
      lapses += 1; reps = 0; interval = 0;
    }
    return { interval: interval, reps: reps, lapses: lapses, due: (Number(nowMs) || 0) + interval * 86400000 };
  }
  // Epic 4.3b Phase D3 — visible due-counter. PURE counts (deterministic; nowMs injected) over the
  // GLOBAL status map + the per-lemma SRS schedule, so the badge needs NO morph scan:
  //   inProgress = words actively being learned (status l1–l4) — the breadth of your current study;
  //   dueNow     = SCHEDULED words whose review time has ARRIVED (due<=now), excluding «ignore» — the
  //                true spaced-repetition return signal (never-tested «new» words are NOT counted here,
  //                they surface as «new»/in-progress; the badge must not over-claim — R11/R2);
  //   nextDue    = soonest FUTURE due (ms) or null → «next review in …» when nothing is due yet.
  // statusMap = { lemmaKey: status }; schedule = getSrsSchedule() shape { lemmaKey: { due, ... } }.
  var _INPROG = { l1: 1, l2: 1, l3: 1, l4: 1 };
  function dueCounts(statusMap, schedule, nowMs) {
    var now = Number(nowMs) || 0, inProgress = 0, dueNow = 0, nextDue = null;
    if (statusMap) for (var k in statusMap) { if (_INPROG[statusMap[k]]) inProgress++; }
    if (schedule) for (var lk in schedule) {
      var e = schedule[lk]; if (!e) continue;
      if (statusMap && statusMap[lk] === "ignore") continue;   // ignored words are not «to review» (badge==trainer)
      var due = Number(e.due) || 0;
      if (due <= now) dueNow++;                                 // overdue / due-now scheduled word
      else if (nextDue === null || due < nextDue) nextDue = due;
    }
    return { inProgress: inProgress, dueNow: dueNow, nextDue: nextDue };
  }
  // Epic 4.3b Phase D4 — weakness-weighting (R2 difficulty): STABLE reorder of a due candidate list so
  // words you fail more often (srs lapses) come first → effort goes where memory is weakest (Quizlet/FSRS
  // difficulty), not flat coverage. Reads item._srs.lapses (attached by the trainer). PURE + deterministic:
  // ties keep the INPUT order (so the existing learning-before-fresh + freq ranking is the tie-break), and
  // an all-zero-lapse list is returned UNCHANGED — a no-op until misses accrue, never a regression. Note
  // (R2): a missed «new» word floors at «new» yet still increments lapses, so weighting the WHOLE due pool
  // (not just l1–l4) is required to surface weak fresh words too.
  function rankByWeakness(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map(function (x, i) { return { x: x, i: i, lp: (x && x._srs && Number(x._srs.lapses)) || 0 }; })
      .sort(function (a, b) { return (b.lp - a.lp) || (a.i - b.i); })
      .map(function (o) { return o.x; });
  }
  // Epic 4.3b Phase D7 — soft gamification (streak + adaptive daily goal). PURE + deterministic: the
  // streak is FOLDED from the study_day ledger (one { day, recalls, available } row per LOCAL day) and the
  // TODAY day-string is INJECTED — no Date.now()/argless Date in the engine (invariant #5; Date.UTC /
  // new Date(number) are pure). Honest by construction (R2/R11/R5):
  //   • a day's goal = min(cap, available) GENUINE recalls; available===0 (engaged, nothing trainable) =
  //     REST-CREDIT (qualified) so the SRS doing its job never breaks the streak;
  //   • a gap is bridged by banked grace (earn +1 per 7 qualified days, cap GRACE_MAX), else the CURRENT
  //     streak SOFT-PAUSES to 0 — best is NEVER erased (no punitive reset — «soft, no dark patterns»);
  //   • skips/teach-views are not recalls → they never reach this ledger (recall≠show; reuses D5).
  var STREAK_GOAL_CAP = 10;   // small capped daily goal (R2 ~5–10 min / R5 ~8–10) — reachable almost every day
  var STREAK_GRACE_MAX = 2;   // auto-banked grace days, +1 per 7 qualified (UPenn/UCLA «slack» > rigid rules)
  function _dayNum(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  }
  function _dayStr(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function _dayQualifies(row, cap) {
    var avail = Math.max(0, Number(row && row.available) || 0);
    var rec = Math.max(0, Number(row && row.recalls) || 0);
    if (avail === 0) return true;                    // rest-credit: engaged, nothing trainable today
    return rec >= Math.min(cap, avail) && rec >= 1;  // did the day's small (capped) goal
  }
  // Fold the ledger → { cur, best, lastDay, grace } as of the LAST qualified day. Deterministic.
  function streakFromDays(rows, cap) {
    cap = cap || STREAK_GOAL_CAP;
    var seen = {}, qDays = [];
    if (Array.isArray(rows)) for (var i = 0; i < rows.length; i++) {
      var dn = _dayNum(rows[i] && rows[i].day); if (dn === null) continue;
      if (_dayQualifies(rows[i], cap) && !seen[dn]) { seen[dn] = 1; qDays.push(dn); }
    }
    qDays.sort(function (a, b) { return a - b; });
    if (!qDays.length) return { cur: 0, best: 0, lastDay: null, grace: 0 };
    var cur = 0, best = 0, grace = 0, prev = null;
    for (var j = 0; j < qDays.length; j++) {
      var d = qDays[j];
      if (prev === null) cur = 1;
      else {
        var gap = d - prev;
        if (gap === 1) cur += 1;
        else {
          var missed = gap - 1;
          if (grace >= missed) { grace -= missed; cur += 1; }   // bridge the gap with banked grace
          else { cur = 1; grace = 0; }                          // soft-pause: current resets, best KEPT
        }
      }
      if (cur > 0 && cur % 7 === 0 && grace < STREAK_GRACE_MAX) grace += 1;   // earn grace by consistency
      if (cur > best) best = cur;
      prev = d;
    }
    return { cur: cur, best: best, lastDay: _dayStr(qDays[qDays.length - 1]), grace: grace };
  }
  // Display view (mutation-free): folds the ledger, then applies the gap-to-TODAY for liveness — a streak
  // standing from yesterday is still ALIVE today (doing today's goal extends it); only a gap beyond grace
  // lapses it. Surfaces today's raw progress for the «сегодня k/цель» line. todayStr injected (local date).
  function streakView(rows, cap, todayStr) {
    cap = cap || STREAK_GOAL_CAP;
    var td = _dayNum(todayStr), todayRow = null;
    // Ignore any row dated AFTER today (a forward device-clock must NOT inflate the streak — R11 do-no-harm).
    var past = Array.isArray(rows) ? rows.filter(function (r) { var n = _dayNum(r && r.day); return n !== null && (td === null || n <= td); }) : [];
    var fold = streakFromDays(past, cap);
    if (Array.isArray(rows)) for (var i = 0; i < rows.length; i++) { if (rows[i] && rows[i].day === todayStr) { todayRow = rows[i]; break; } }
    var todayRecalls = Math.max(0, Number(todayRow && todayRow.recalls) || 0);
    var todayAvail = Math.max(0, Number(todayRow && todayRow.available) || 0);
    var todayRest = !!todayRow && todayAvail === 0;
    var todayGoal = todayAvail > 0 ? Math.min(cap, todayAvail) : 0;
    var todayQualified = todayRow ? _dayQualifies(todayRow, cap) : false;
    var lastDay = fold.lastDay ? _dayNum(fold.lastDay) : null;
    var alive = false, cur = 0;
    if (lastDay !== null && td !== null) {
      var gapToday = td - lastDay;
      if (gapToday <= 0) { alive = true; cur = fold.cur; }            // qualified today (or future-dated edge)
      else if ((gapToday - 1) <= fold.grace) { alive = true; cur = fold.cur; }   // today in progress, grace covers the gap
      else { alive = false; cur = 0; }                               // lapsed → soft-paused (best kept)
    }
    return { cur: cur, best: fold.best, grace: fold.grace, alive: alive, cap: cap,
      todayRecalls: todayRecalls, todayGoal: todayGoal, todayRest: todayRest, todayQualified: todayQualified };
  }
  // Epic 4.3b Phase D6 — extraction-channel availability (R10 honest degradation). The SAME word can be
  // tested via different prompts: read (HE sentence shown), reverse (RU→HE, no audio), listen (hear the
  // sentence), dictate (hear the isolated word → write). read + reverse need NO audio → always offered.
  // listen needs PLAYABLE sentence audio = a baked/cached asset (keyless) OR a BYOK GCP key OR a browser
  // Hebrew voice. dictate has NO per-word baked audio → needs a key OR a browser Hebrew voice. A channel
  // must NEVER be offered when its audio can't play (a broken feature is an R5/R10 red flag). PURE.
  function availableChannels(caps) {
    var c = caps || {};
    var key = !!c.hasGcpKey, voice = !!c.hasHeVoice, baked = !!c.rowHasBakedAudio;
    return { read: true, reverse: true, listen: (baked || key || voice), dictate: (key || voice) };
  }
  // MC mode by maturity (escalate, owner decision 1): new/l1/l2 → recognition (MC); l3/l4/known → typed.
  function isMcLevel(status) { var s = status || "new"; return s === "new" || s === "l1" || s === "l2"; }
  // pickDistractors (R10 moat): morpho-honest, deterministic. Score: same root ≫ same POS+near length >
  // same POS > other; tie-break freq desc then lemmaKey. Drawn from the SAME text's confident lemmas.
  function _surfLen(s) { return stripNiqqud(s || "").length; }
  function pickDistractors(answer, pool, n) {
    n = n || 3;
    if (!answer || !Array.isArray(pool)) return [];
    var aLen = _surfLen(answer.surface || answer.niqqud), aPos = answer.pos || "", aRoot = answer.root || "";
    // Epic 4.3b Phase A (A4): never offer an option whose DISPLAYED skeleton equals the answer's (or a
    // twin of another option) — dedupe by displayed form, not just lemmaKey, so no two buttons look the
    // same and no distractor is secretly a correct answer.
    var aDisp = stripNiqqud(answer.niqqud || answer.surface || "");
    var seen = {}, seenDisp = {}, uniq = [];
    for (var i = 0; i < pool.length; i++) {
      var c = pool[i];
      if (!c || c.lemmaKey === answer.lemmaKey || !(c.niqqud || c.surface)) continue;
      if (seen[c.lemmaKey]) continue;
      var disp = stripNiqqud(c.niqqud || c.surface || "");
      if (!disp || disp === aDisp || seenDisp[disp]) continue;
      seen[c.lemmaKey] = 1; seenDisp[disp] = 1; uniq.push(c);
    }
    function score(c) {
      var s = 0;
      if (aRoot && c.root && c.root === aRoot) s += 100;
      if (aPos && c.pos === aPos) { s += 10; if (Math.abs(_surfLen(c.surface || c.niqqud) - aLen) <= 2) s += 5; }
      // B1: prefer VOCALIZED distractors so an option never renders bare-consonant next to a pointed
      // answer (a niqqud-presence tell). Tie-level bonus only — keeps the pool from starving.
      if (c.niqqud && /[֑-ׇ]/.test(c.niqqud)) s += 2;
      return s;
    }
    uniq.sort(function (a, b) {
      var sa = score(a), sb = score(b); if (sb !== sa) return sb - sa;
      if ((b.freq || 0) !== (a.freq || 0)) return (b.freq || 0) - (a.freq || 0);
      return String(a.lemmaKey).localeCompare(String(b.lemmaKey));
    });
    return uniq.slice(0, n);
  }

  // ── Epic 4.3b Phase D1 — slot-inflected distractors (R10 moat) ─────────────────────
  // findSlot: PURE — locate the grammatical SLOT (cells key, e.g. "PERF-3ms"/"AP-ms"/"s") of a vocalized
  // form within its (pinned) paradigm, tolerant to a LEADING PROCLITIC (ו/ה/ב/כ/ל/ש/מ — measured: 61% of
  // tokens carry one, and proclitic-stripping recovers 90% of the dominant "no cell match" loss; the
  // article ה also geminates the next consonant with a dagesh, but stripNiqqud drops it so a skeleton
  // compare handles it). Compares niqqud-stripped + final-letter-normalized skeletons. Returns
  // { slot, count }: slot = the deterministic (lexicographically-smallest) matching cell key; count =
  // cells matching that stem (count>1 = syncretism, still usable — any matching slot is a valid reading).
  // { slot:null } when no stem matches → caller falls back (R11 no-regress).
  var _FINMAP = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  function _skel(s) { return stripNiqqud(String(s || "")).replace(/[ךםןףץ]/g, function (c) { return _FINMAP[c] || c; }).trim(); }
  var _PROCLITIC = { "ו": 1, "ה": 1, "ב": 1, "כ": 1, "ל": 1, "ש": 1, "מ": 1 };
  function _normNq(s) { return String(s || "").replace(/[ךםןףץ]/g, function (c) { return _FINMAP[c] || c; }); }
  // Drop a leading proclitic LETTER + its combining marks (niqqud-level), so an exact-vocalized compare
  // can run on the bare stem (e.g. וְאָמַר → אָמַר). Conservative: only when the first letter is a proclitic.
  function _dropProcliticNq(s) {
    s = String(s || ""); if (!s || !_PROCLITIC[_skel(s[0])]) return s;
    var i = 1; while (i < s.length && s.charCodeAt(i) >= 0x0591 && s.charCodeAt(i) <= 0x05c7) i++;
    return s.slice(i);
  }
  function findSlot(paradigm, niqqud) {
    if (!paradigm || !paradigm.cells) return { slot: null, count: 0 };
    var sk = _skel(niqqud);
    if (!sk) return { slot: null, count: 0 };
    // each stem = { skeleton, vocalized } — prefer matching the ACTUAL vocalized form (disambiguates
    // a SYNCRETIC skeleton, e.g. אמר = past אָמַר vs imperative אֱמֹר → pick the slot the reader saw),
    // falling back to the lexicographically-smallest skeleton match when no cell's niqqud matches.
    var stems = [{ sk: sk, nq: _normNq(niqqud) }];
    if (sk.length > 2 && _PROCLITIC[sk[0]]) {
      var s1 = _dropProcliticNq(niqqud); stems.push({ sk: sk.slice(1), nq: _normNq(s1) });
      if (sk.length > 3 && _PROCLITIC[sk[1]]) stems.push({ sk: sk.slice(2), nq: _normNq(_dropProcliticNq(s1)) });
    }
    for (var si = 0; si < stems.length; si++) {
      var stem = stems[si].sk, wantNq = stems[si].nq, exact = null, lexi = null, count = 0;
      for (var k in paradigm.cells) {
        var c = paradigm.cells[k];
        if (!c || !c.he || _skel(c.he) !== stem) continue;
        count++;
        if (lexi === null || k < lexi) lexi = k;
        if (wantNq && _normNq(c.he) === wantNq && (exact === null || k < exact)) exact = k;
      }
      if (exact !== null) return { slot: exact, count: count };
      if (lexi !== null) return { slot: lexi, count: count };
    }
    return { slot: null, count: 0 };
  }
  // L4 — semantic-field proximity via significant RU-gloss tokens (drop short/stop words).
  var _RU_STOP = { "и": 1, "в": 1, "на": 1, "с": 1, "к": 1, "по": 1, "не": 1, "что": 1, "то": 1, "или": 1, "the": 1, "to": 1, "of": 1 };
  function _glossTokens(s) {
    var out = {}, parts = String(s || "").toLowerCase().split(/[^a-zа-яё]+/);
    for (var i = 0; i < parts.length; i++) { var t = parts[i]; if (t && t.length >= 3 && !_RU_STOP[t]) out[t] = 1; }
    return out;
  }
  function _glossOverlap(aTok, bGloss) { var b = _glossTokens(bGloss); for (var t in aTok) if (b[t]) return true; return false; }
  var _posIndex = null;
  function _ensurePosIndex(pidMap) {
    if (_posIndex) return _posIndex;
    var idx = {}; pidMap.forEach(function (p) { if (!p || !p.cells) return; var pos = p.pos || "?"; (idx[pos] || (idx[pos] = [])).push(p); });
    _posIndex = idx; return idx;
  }
  // buildMcSlotOptions: ASYNC — the answer's bare slot form + n morpho-honest, slot-INFLECTED,
  // semantically-near distractor forms. Bank = same-POS paradigms (engine pidMap) that HAVE the answer's
  // slot; ranked by same-root-family ≫ RU-gloss-field overlap > deterministic pid. All forms come straight
  // from Pealim cells (R1 — nothing fabricated; proclitics NOT re-pointed → every option is a BARE form,
  // so no proclitic/niqqud tell). Dedup by displayed skeleton, never == the answer. Returns
  // { correctHe, options:[he…], slot } or null (→ caller falls back to B1; R11 no-regress). Deterministic.
  async function buildMcSlotOptions(answerCard, n) {
    n = n || 3;
    if (!answerCard) return null;
    var eng; try { eng = await ensureEngine(); } catch (_) { return null; }
    var par = (answerCard.paradigm && answerCard.paradigm.cells) ? answerCard.paradigm
      : (answerCard.pealim_id != null ? eng.pidMap.get(String(answerCard.pealim_id)) : null);
    if (!par || !par.cells) return null;
    var info = findSlot(par, answerCard.niqqud || answerCard.surface);
    if (!info.slot) return null;
    var slot = info.slot, correctCell = par.cells[slot], correctHe = correctCell && correctCell.he;
    if (!correctHe) return null;
    var correctSkel = _skel(correctHe);
    var aPid = String(answerCard.pealim_id != null ? answerCard.pealim_id : (par.pealim_id || ""));
    var aRoot = answerCard.root || par.root || "";
    var aTok = _glossTokens(answerCard.gloss || answerCard.meaning || par.meaning);
    var bank = _ensurePosIndex(eng.pidMap)[answerCard.pos || par.pos || "?"] || [];
    var cands = [];
    for (var i = 0; i < bank.length; i++) {
      var c = bank[i]; if (!c || String(c.pealim_id || "") === aPid) continue;
      var cell = c.cells[slot], he = cell && cell.he; if (!he) continue;
      var sk = _skel(he); if (!sk || sk === correctSkel) continue;
      var score = 0; if (aRoot && c.root === aRoot) score += 100; if (_glossOverlap(aTok, c.meaning)) score += 10;
      cands.push({ he: he, sk: sk, score: score, pid: String(c.pealim_id || "") });
    }
    cands.sort(function (a, b) { return (b.score - a.score) || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0); });
    var options = [], seen = {}; seen[correctSkel] = 1;
    for (var j = 0; j < cands.length && options.length < n; j++) { if (seen[cands[j].sk]) continue; seen[cands[j].sk] = 1; options.push(cands[j].he); }
    if (options.length < n) return null;
    return { correctHe: correctHe, options: options, slot: slot };
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
    fadeGraduationReady: fadeGraduationReady, FADE_GRADUATION_MIN: FADE_GRADUATION_MIN,
    // browser
    ensureEngine: ensureEngine, resolveWordLight: resolveWordLight, attach: attach,
    closeSheet: closeSheet, paintLearningStatus: paintLearningStatus, clearLearningStatus: clearLearningStatus,
    decorateWords: decorateWords, clearDecorations: clearDecorations, collectNewWords: collectNewWords,
    openWordCard: openWordCard,
    // Epic 4.3b — recall-loop / cloze
    collectReviewItems: collectReviewItems, buildCloze: buildCloze, buildClozeForTarget: buildClozeForTarget,
    nextLevel: nextLevel, isMcLevel: isMcLevel, pickDistractors: pickDistractors, nextSrs: nextSrs,
    dueCounts: dueCounts, rankByWeakness: rankByWeakness,
    findSlot: findSlot, buildMcSlotOptions: buildMcSlotOptions,
    streakFromDays: streakFromDays, streakView: streakView,
    STREAK_GOAL_CAP: STREAK_GOAL_CAP, STREAK_GRACE_MAX: STREAK_GRACE_MAX,
    availableChannels: availableChannels,
  };

  if (typeof window !== "undefined") window.ReaderMorph = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
