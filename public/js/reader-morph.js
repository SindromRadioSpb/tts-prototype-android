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

  // Apply a human decision only after the host has validated this exact
  // occurrence anchor. This is a derived view: the resolver card and the
  // append-only decision remain separate sources of truth.
  function applyLexicalResolution(card, projection) {
    if (!card || !projection || projection.state !== "resolved" || !projection.analysis) return card;
    var a = projection.analysis, next = Object.assign({}, card);
    next.lemma = String(a.lemma || "").trim();
    next.pos = String(a.lp_pos || "").trim();
    next.root = String(a.root || "").trim();
    next.binyan = String(a.binyan || "").trim();
    next.meaning = String(a.meaning_ru || "").trim();
    next.meaningSource = projection.actor_kind === "teacher" ? "teacher" : "owner";
    next.label = next.meaningSource;
    next.ambiguous = false;
    next.selectionRequired = false;
    next.dictaKey = "";
    next.alts = (next.alts || []).filter(function (x) { return String(x.pealim_id || "") !== String(a.pealim_id || ""); });
    next.placeDecided = projection.actor_kind || "owner";
    next.contextPos = "";
    next.contextUsed = false;
    next.rootFamily = [];
    next.usage = null;
    next.paradigm = card.paradigm && String(card.paradigm.pealim_id || '') === String(a.pealim_id || '') && card.paradigm.pos === next.pos ? card.paradigm : null;
    next.pealim_id = String(a.pealim_id || "").trim();
    next.pealim_direct = !!next.pealim_id;
    next.pealim_url = next.pealim_id
      ? "https://www.pealim.com/ru/dict/" + encodeURIComponent(next.pealim_id) + "/"
      : "https://www.pealim.com/ru/search/?q=" + encodeURIComponent(next.word || "");
    next.resolutionEventId = String(projection.event_id || "");
    next.identityVia = next.meaningSource;
    next.channel = next.pos === 'propernoun' ? 'owner-name' : 'reviewed-analysis';
    return next;
  }

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

  // ── Context-overlay shared primitives (producer + runtime lock-step; recon §10) ──
  // RESOLVER_REV: hand-bump on ANY resolver-behavior change that affects context-overlay
  // SELECTION (pickContextReading paths, formFirstResolve semantics, functionGate scope,
  // CONTEXT_GLOSS growth). Sidecars stamped with an older rev degrade their authoritative
  // misses to soft misses at runtime (B4: a resolver improvement must never leave a baked
  // work silently worse than an un-baked one).
  var RESOLVER_REV = "ctx-r3";   // preserve all lexical candidates; form match does not settle homographs
  // The ONE sentence-key normalization both the bake and the tap-time lookup use (B1/R10#8:
  // two independent implementations WILL drift on maqaf/bidi rows). Plain text is already
  // bare of niqqud — stripNiqqud here is defensive symmetry.
  function normSent(s) { return stripNiqqud(String(s == null ? "" : s)).replace(/\s+/g, " ").trim(); }
  // FNV-1a 32-bit over UTF-16 code units. Math.imul — a plain multiply overflows 2^53 and
  // silently corrupts high-entropy hashes.
  function fnv1a(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  // B3 segmentation-consistency guard (R1: «segmentation marriage» — a path-A promotion married
  // Dicta's context POS to the lemma of a DIFFERENT segmentation: offline stripped a proclitic
  // Dicta did not see, בעלות «владение» → cell עלות «затрата»). A promotion is allowed only when
  // the promoted paradigm inflects to the very segment Dicta identified: the whole word when
  // Dicta read it whole, its stem when Dicta segmented. Fail-closed: an unverifiable paradigm
  // never promotes (do-no-harm beats coverage).
  function _parHasSkeleton(par, sk) {
    if (!par || !sk) return false;
    if (stripNiqqud(par.lemma || "") === sk || stripNiqqud(par.form || "") === sk || stripNiqqud(par.lemma_niqqud || "") === sk) return true;
    var cells = par.cells || {}, keys = Object.keys(cells);
    for (var i = 0; i < keys.length; i++) { var c = cells[keys[i]]; if (c && c.he && stripNiqqud(c.he) === sk) return true; }
    return false;
  }
  function contextPromotionGuard(eng, surface, dictaStem, ctxCard) {
    var s = stripNiqqud(surface || "");
    if (!s || !ctxCard || ctxCard.pealim_id == null || ctxCard.pealim_id === "") return true;   // nothing promoted → nothing to guard
    var st = stripNiqqud(String(dictaStem || ""));
    var target = (st && st !== s) ? st : s;
    var par = (eng && eng.pidMap) ? eng.pidMap.get(String(ctxCard.pealim_id)) : null;
    if (!par) return false;
    return _parHasSkeleton(par, target);
  }
  // Runtime lookup over a loaded context sidecar (pure, Node-testable; recon §3.3/§10 B2/B4).
  // Returns:
  //   { ctx }                — a provider-shaped baked fact on a key hit (offline, zero network);
  //   { authoritative: true }— the sentence was FULLY evaluated at bake and no improvement was
  //                            found → the offline reading stands (no live fallback needed);
  //   null                   — unknown sentence / stale resolver / no overlay → the caller falls
  //                            back to the live path (un-baked semantics).
  function overlayContext(ov, sentence, surface) {
    if (!ov || !ov.ctx) return null;
    // B4: a sidecar baked under an OLDER resolver may under-select — its misses lose authority
    // (entries — plain Dicta facts — would still be safe, but a uniform soft-miss is simpler
    // and the re-bake to the current rev is cheap and local).
    if (ov._meta && ov._meta.resolver && ov._meta.resolver !== RESOLVER_REV) return null;
    var h = fnv1a(normSent(sentence));
    var bucket = ov.ctx[h] || null;
    var e = bucket ? bucket[stripNiqqud(surface || "")] : null;
    if (e && (e.nq || e.pos)) {
      return { ctx: { niqqud: e.nq || "", posDicta: e.pos || null, st: e.st || "", source: "baked", made: (ov._meta && ov._meta.made) || "" } };
    }
    if (!ov._sents) { try { ov._sents = new Set(ov.sents || []); } catch (_) { ov._sents = new Set(); } }
    return ov._sents.has(h) ? { authoritative: true } : null;
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
  // Relative-particle variant (word layer Ф1, docs/planning/word-layer/F1_SPEC_2026_10_11.md):
  // שֶׁ geminates the next consonant just like the article (שֶׁשָּׁמַעְתִּי), so the bare form missed
  // its cell (שָׁמַעְתִּי) and the word fell to «нет данных». Fires ONLY on the particle's own
  // signature — ש with segol AND a dagesh on the next consonant — so שֶׁמֶשׁ «солнце» / שֶׁקֶט
  // (no gemination) never enter. בגדכפת keep the dagesh: in the bare word it is the word-initial
  // dagesh lene (שֶׁבָּא → בָּא). Used as one more candidate under the same «strictly more decisive»
  // rule as the article variant — it can only upgrade a reading, never override a confident one.
  function relativeStrippedForm(niqqud) {
    var s = String(niqqud || "");
    if (s.charCodeAt(0) !== 0x05e9) return "";              // must start with ש
    var i = 1, marks = "";
    while (i < s.length && s.charCodeAt(i) >= 0x0591 && s.charCodeAt(i) <= 0x05c7) { marks += s.charAt(i); i++; }
    if (marks.indexOf("ֶ") < 0 || marks.indexOf("ׂ") >= 0) return "";   // segol; not sin
    if (i >= s.length) return "";
    var m = /^([א-ת])([֑-ׇ]*)/.exec(s.slice(i));
    if (!m || m[2].indexOf("ּ") < 0) return "";        // no gemination → not the particle
    var head = /[בגדכפת]/.test(m[1]) ? m[1] + m[2] : m[1] + m[2].replace(/ּ/, "");
    var rest = head + s.slice(i + m[0].length);
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
  // Ф4 · Д7.1 (docs/planning/word-layer/F4_D7_FORM_IDENTITY_SPEC_2026_10_14.md, owner 2026-10-14): the identity of a
  // word. When the offline reading is not sure (unknown / guessed) but its vocalized form is a cell of exactly ONE
  // Pealim paradigm (enrichReading step 3, channel form-canonical — יַלְדֵי = construct plural of ילד), that IS the
  // reading: «likely», never «exact». One place — so the paint, the long-press, the card, the Room's and the
  // dictionary's lists and the Studio key the word identically. Closed-class / adverb glosses (steps 1–2) stay display.
  // ── Ф4 · Д10 the word at its PLACE (spec docs/planning/word-layer/F4_D10_PLACE_CONTEXT_SPEC_2026_10_16.md) ──────────
  // A homograph is read by its sentence: (В) the learner's own decision for this exact place («Проверить морфологию»,
  // lexical_resolution_events — a Pealim entry or «это имя») beats (А) the sentence's STORED Dicta parse (sentence_morph:
  // the one candidate entry whose exact part of speech and lemma are Dicta's), which beats the spelling's reading.
  // One store, one rule: the paint, the tap and its saved key, the lists and the trainers read the same place.
  // Only stored data decides the key (a live Dicta request of the card is display — it is not there on every surface).
  // Store: sentence id → { sk: [bare letters per word offset], at: Map(offset → Dicta token), dec: Map(offset → {pid}|{name}) }.
  var _places = new Map(), _placeLoader = null, _placeGen = 0;
  function setPlaceLoader(fn) { _placeLoader = typeof fn === "function" ? fn : null; _places.clear(); _placeGen++; }
  function invalidatePlaces(sids) {
    if (!sids) _places.clear(); else (Array.isArray(sids) ? sids : [sids]).forEach(function (s) { _places.delete(String(s)); });
    _placeGen++;
  }
  function placeGeneration() { return _placeGen; }
  // opts.wait — ms the loader may wait for the work's stored parse to arrive (a tap, O-091); the paint never waits
  async function ensurePlaces(sids, opts) {
    if (!_placeLoader || !sids) return;
    // A sentence occurs once per word span (and again in the second Hebrew column).
    // Keep first-seen order without rescanning the growing list for every occurrence.
    var need = [], seen = new Set();
    (Array.isArray(sids) ? sids : Array.from(sids)).forEach(function (s) {
      s = String(s || "");
      if (s && !_places.has(s) && !seen.has(s)) { seen.add(s); need.push(s); }
    });
    if (!need.length) return;
    // a bounded store (the iPhone memory lesson, 3.11.760): a whole-library pass must not keep every sentence resident
    if (_places.size + need.length > 6000) _places.clear();
    var got = null; try { got = await _placeLoader(need, opts || {}); } catch (_) { got = null; }
    need.forEach(function (s) { _places.set(s, (got && got.get && got.get(s)) || null); });
  }
  function placeOfSpan(span) {
    if (!span || !span.closest) return null;
    var tr = span.closest("tr"); if (!tr) return null;
    var sid = tr.getAttribute("data-sentence-id");
    if (!sid) { var holder = tr.querySelector("[data-sentence-id]"); sid = holder ? holder.getAttribute("data-sentence-id") : ""; }
    var off = Number(span.getAttribute("data-w-offset"));
    return sid && Number.isFinite(off) ? { sid: String(sid), off: off } : null;
  }
  // a loader's helper (pure): the units of a row — the scan's own tokens/joins — and its Dicta tokens aligned to them by
  // bare letters; → { sk, at, cover }
  // O-092: the device cuts an abbreviation at its quote (כ"כ → כ | כ, תרפ"ז → תרפ), Dicta keeps it one word; and a geresh
  // comes as ׳ or '. Letters are compared without quote marks; the pieces of a quoted Dicta word are COVERED (they count
  // as aligned, so the row keeps its facts) but get no token — a fragment never borrows the whole word's parse (R11).
  var _PLACE_QUOTES = /["'`׳״“”‘’]/g;
  function _placeLetters(s) { return stripNiqqud(String(s || "")).replace(_PLACE_QUOTES, ""); }
  function placeUnits(row, dictaTokens) {
    var plain = String(row && (row.he_plain != null ? row.he_plain : row.he) || ""), vocal = String(row && row.he_niqqud || ""), toks, pairs;
    if (plain) { var al = alignSurfaceNiqqud(plain, vocal), w = 0; toks = tokenize(plain); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { var a = al[w++] || {}; return [a.surface || x.text, a.niqqud || ""]; }); }
    else { toks = tokenize(vocal); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { return [stripNiqqud(x.text), x.text]; }); }
    var units = (joinSplitWords(toks, pairs) || []).filter(function (u) { return !u.fragment; });
    var sk = [], at = new Map(), cover = new Set(), dt = Array.isArray(dictaTokens) ? dictaTokens : [], di = 0, rest = null;
    units.forEach(function (u) {
      sk[u.off] = stripNiqqud(u.surface);
      if (!dt.length) return;
      var key = _placeLetters(sk[u.off]);
      if (!key) return;
      // a piece of the quoted Dicta word at the cursor
      var cur = di < dt.length ? String(dt[di] && dt[di].word || "") : "";
      if (rest === null && /["'׳״]/.test(cur) && _placeLetters(cur) !== key) rest = _placeLetters(cur);
      if (rest !== null) {
        var k = rest.indexOf(key);
        if (k >= 0) { cover.add(u.off); rest = rest.slice(k + key.length); if (!rest) { di++; rest = null; } return; }
        if (rest !== _placeLetters(cur)) di++;   // a begun quoted word is over (letters the device dropped stay uncounted)
        rest = null;
      }
      var j = di; while (j < dt.length && _placeLetters(dt[j] && dt[j].word) !== key) j++;
      if (j < dt.length) { at.set(u.off, dt[j]); di = j + 1; }
    });
    return { sk: sk, at: at, cover: cover };
  }
  var _PLACE_POS = { noun: 1, adjective: 1, verb: 1, adverb: 1, numeral: 1 };
  function _placeCandidates(eng, card, niqqud) {
    var pids = [];
    if (card && card.pealim_id) pids.push(String(card.pealim_id));
    (card && card.alts || []).forEach(function (a) { if (a && a.pealim_id && pids.indexOf(String(a.pealim_id)) < 0) pids.push(String(a.pealim_id)); });
    var NA = eng && eng.NA;
    if (niqqud && /[ְ-ּ]/.test(niqqud) && NA && NA.unitFormVariants && eng.maps && eng.maps.formIdx) {
      NA.unitFormVariants({ pos: "", binyan: "", lemma: "", stem: "", root: null, niqqud: niqqud, sampleWord: stripNiqqud(niqqud), kind: null }).forEach(function (v) {
        (eng.maps.formIdx.get(v) || []).forEach(function (x) { if (x.pealim_id && pids.indexOf(String(x.pealim_id)) < 0) pids.push(String(x.pealim_id)); });
      });
    }
    return pids;
  }
  function _placeCitations(p) {
    var out = [p.lemma, p.lemma_niqqud];
    ["PERF-3ms", "INF-L", "s", "ms-a"].forEach(function (k) { if (p.cells && p.cells[k] && p.cells[k].he) out.push(p.cells[k].he); });
    return out.filter(Boolean).map(_d8Loose);
  }
  // Dicta's lemmatization conventions that are not context (Д8-К4 v2 blind examiner, archaic stratum: 9 of 14 errors):
  // Dicta lemmatizes אֱלֹהִים «Бог» as אלוה — the place keeps Pealim's אלוהים. Loose forms (no niqqud, no ו/י); the word
  // ends with the stem (a proclitic before it is fine).
  var _DICTA_LEMMA_CONVENTIONS = [{ lemma: "אלה", stem: "אלהמ", to: "אלהמ" }];
  function _dictaLemmaAt(L, skel) {
    var w = _d8Loose(skel);
    for (var i = 0; i < _DICTA_LEMMA_CONVENTIONS.length; i++) {
      var c = _DICTA_LEMMA_CONVENTIONS[i];
      if (L === c.lemma && w.length >= c.stem.length && w.slice(-c.stem.length) === c.stem) return c.to;
    }
    return L;
  }
  function _atPlace(eng, card, surfaceOrig, niqqudOrig, place) {
    var p = place ? _places.get(String(place.sid)) : null;
    if (!p || !card) return card;
    // the place must still be this word (the row may have been edited since the data was stored)
    if (p.sk[place.off] !== stripNiqqud(surfaceOrig || niqqudOrig)) return card;
    var dec = p.dec && p.dec.get(place.off);
    if (dec && dec.projection) {
      var chosen = applyLexicalResolution(card, dec.projection), paradigm = eng.pidMap && eng.pidMap.get(chosen.pealim_id);
      if (paradigm && paradigm.pos === chosen.pos) chosen.paradigm = paradigm;
      return chosen;
    }
    if (dec && dec.name) return Object.assign({}, card, { label: "unknown", functionWord: false, pos: "propernoun", pealim_id: "", lemma: "", meaning: "", identityVia: "owner-name", placeDecided: "owner" });
    if (dec && dec.pid && eng.pidMap && eng.pidMap.get(String(dec.pid))) {
      return String(dec.pid) === String(card.pealim_id) ? Object.assign({}, card, { placeDecided: "owner" })
        : Object.assign(_cardForPid(eng, card, dec.pid, "owner"), { placeDecided: "owner" });
    }
    // А — the sentence's stored Dicta parse; never over a decisive offline reading or a function word (R11)
    var dt = p.at && p.at.get(place.off);
    if (!dt || !dt.posDicta || !_PLACE_POS[dt.posDicta] || card.label === "exact" || card.label === "function" || card.functionWord) return card;
    var pids = _placeCandidates(eng, card, niqqudOrig);
    if (!pids.length || (card.label === "likely" && pids.length < 2)) return card;
    var L = _dictaLemmaAt(_d8Loose(dt.lemma || ""), p.sk[place.off]);
    var hit = pids.filter(function (pid) {
      var par = eng.pidMap.get(pid); if (!par || (par.pos || "") !== dt.posDicta) return false;
      return L && _placeCitations(par).indexOf(L) >= 0;
    });
    if (hit.length !== 1) return card;
    if (hit[0] === String(card.pealim_id)) return Object.assign({}, card, { placeDecided: "dicta" });
    return Object.assign(_cardForPid(eng, Object.assign({}, card, { functionWord: false }), hit[0], "dicta-context"), { placeDecided: "dicta" });
  }
  // opts.noD9 — the reading BEFORE the Д9 rules (the Д9.2 mark migration's «before»; never for display)
  // opts.place — { sid, off }: the word's place (Д10); without it the spelling's reading
  async function resolveCore(eng, surfaceOrig, niqqudOrig, opts) {
    var card0 = await _resolveCoreSpelling(eng, surfaceOrig, niqqudOrig, opts);
    card0 = withAnalysisCandidates(eng, card0, surfaceOrig, niqqudOrig);
    var effective = opts && opts.place ? _atPlace(eng, card0, surfaceOrig, niqqudOrig, opts.place) : card0;
    if (effective.placeDecided === "owner" || effective.placeDecided === "teacher") effective.selectionRequired = false;
    return effective;
  }

  // Candidate existence is independent of a resolver's preferred reading. Include citation
  // entries without inflection cells; the same bounded index serves tap, paint and decisions.
  function candidateForm(s) {
    return String(s || "").normalize("NFD").replace(/ו\u05b9/g, "\u05b9")
      .replace(/[\u0591-\u05af\u05bc\u05bd\u05bf]/g, "").replace(/[־-]$/g, "");
  }
  function wordGlossApi() {
    if (typeof window !== 'undefined' && window.WordGloss) return window.WordGloss;
    try { if (typeof module !== 'undefined' && module.exports) return require('./word-gloss.js'); } catch (_) {}
    return null;
  }
  function analysisCandidates(eng, surface, niqqud, bareOnly) {
    if (!eng || !eng.pidMap) return [];
    if (!eng._analysisIndex) {
      var index = new Map();
      eng.pidMap.forEach(function (p, pid) {
        if (!p) return;
        var forms = [p.lemma, p.lemma_niqqud, p.form && p.form.he].filter(Boolean);
        var keys = forms.map(stripNiqqud).concat(forms.map(function (f) { return stripNiqqud(candidateForm(f)); }));
        Array.from(new Set(keys)).forEach(function (key) {
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(String(pid));
        });
      });
      eng._analysisIndex = index; eng._analysisForms = new Map();
    }
    var sk = stripNiqqud(surface || niqqud), vocal = niqqud && /[ְ-ׇ]/.test(niqqud), form = candidateForm(niqqud);
    var pids = [], shortSk = stripNiqqud(form);
    [sk,shortSk].forEach(function (key) {
      pids = pids.concat(eng._analysisIndex.get(key) || []);
      ((eng.maps && eng.maps.cell && eng.maps.cell.get(key)) || []).forEach(function (x) { if (x.pealim_id) pids.push(String(x.pealim_id)); });
    });
    if (vocal && eng.NA && eng.NA.unitFormVariants && eng.maps && eng.maps.formIdx) {
      eng.NA.unitFormVariants({niqqud:niqqud,stem:'',pos:''}).forEach(function (v) {
        (eng.maps.formIdx.get(v) || []).forEach(function (x) { if (x.pealim_id) pids.push(String(x.pealim_id)); });
      });
    }
    var out = [];
    Array.from(new Set(pids)).forEach(function (pid) {
      var p = eng.pidMap.get(pid); if (!p) return;
      if (!eng._analysisForms.has(pid)) {
        var forms = [p.lemma_niqqud,p.form && p.form.he].concat(Object.keys(p.cells || {}).map(function (k) { return p.cells[k] && p.cells[k].he; })).filter(Boolean);
        eng._analysisForms.set(pid,forms.map(candidateForm));
      }
      if (vocal && eng._analysisForms.get(pid).indexOf(form) < 0) return;
      out.push({ pealim_id:pid,lemma:p.lemma || '',lp_pos:p.pos || '',meaning_ru:p.meaning || '',root:p.root || '',binyan:p.binyan || '' });
    });
    // Whole-word evidence wins. Only a missing whole reading may reuse the
    // existing vocalized proclitic splits and the form gloss's grammatical guard.
    // Candidate production must be identical in the card, host and place loader.
    if (!out.length && vocal && !bareOnly) {
      var WG = wordGlossApi(), splits = _procliticSplits(niqqud);
      for (var i = 0; WG && WG.matchCell && i < splits.length && !out.length; i++) {
        out = analysisCandidates(eng, stripNiqqud(splits[i].rest), splits[i].rest, true).filter(function (a) {
          var hit = WG.matchCell(eng.pidMap.get(a.pealim_id), niqqud);
          return hit && !hit.impossible && hit.prefix === splits[i].prefix;
        });
      }
    }
    return out.sort(function (a,b) { return a.pealim_id.localeCompare(b.pealim_id); });
  }
  function withAnalysisCandidates(eng, card, surface, niqqud) {
    if (!card) return card;
    var candidates = analysisCandidates(eng, surface, niqqud);
    var selected = card.placeDecided === "owner" || card.placeDecided === "teacher" || card.meaningSource === "owner" || card.meaningSource === "teacher";
    var conflict = candidates.length > 1 || (candidates.length === 1 && card.pos && candidates[0].lp_pos !== card.pos && !card.functionWord);
    var next = Object.assign({}, card, { analysisCandidates: candidates, selectionRequired: !selected && conflict });
    if (conflict && !selected) {
      next.ambiguous = true;
      if (next.label === "exact") next.label = "likely";
      var ids = new Set((next.alts || []).map(function (a) { return String(a.pealim_id || ""); }));
      next.alts = (next.alts || []).concat(candidates.filter(function (a) { return a.pealim_id !== String(card.pealim_id || "") && !ids.has(a.pealim_id); }).map(function (a) {
        return { pealim_id:a.pealim_id, pos:a.lp_pos, meaning:a.meaning_ru, root:a.root };
      }));
    }
    return next;
  }
  async function _resolveCoreSpelling(eng, surfaceOrig, niqqudOrig, opts) {
    var d9 = !(opts && opts.noD9);
    var card = await _resolveBase(eng, surfaceOrig, niqqudOrig, opts);
    if (!card || (card.label !== "unknown" && card.label !== "guessed")) return card;
    // Д9-B: תָּ׳דּוֹר = אֶת הַ+דּוֹר — the word after a ת׳ / ש׳ contraction is the word
    var rest = d9 ? _contractionRest(niqqudOrig || surfaceOrig) : null;
    if (rest) {
      var rc = null; try { rc = await _resolveBase(eng, stripNiqqud(rest), rest, opts); } catch (_) { rc = null; }
      if (rc && (rc.label === "exact" || rc.label === "likely") && !rc.functionWord)
        return Object.assign({}, rc, { word: surfaceOrig || stripNiqqud(niqqudOrig), niqqud: String(niqqudOrig || ""), label: "likely", identityVia: "contraction" });
    }
    if (!eng || !eng.dictaLex) return card;
    // Ф4 · Д8-К: a word the offline dictionary does not read takes its identity from the device's Dicta lexicon
    // (Dicta's parse of the learner's own texts, context-free, append-only — the same answer on every surface).
    // Pealim still wins where it agrees: the TEXT's pointing of Dicta's stem resolves to Dicta's own lemma (Д8-1).
    var DLX = (typeof window !== "undefined" && window.DictaLexicon) || _DictaLexiconNode;
    var e = DLX ? DLX.lookup(eng.dictaLex, surfaceOrig || niqqudOrig) : null;
    // the offline gazetteer's name (הָלְאָה «дальше» ≠ Leah) or a preposition+suffix split read off the bare letters
    // (עָלָה «поднялся» ≠ על+ה) yields to Dicta's word, marked disputed; any other function reading stays
    var gateOverride = card.gateVia === "name" || card.gateVia === "prep+suf";
    if (!e || e.cls !== "content" || (card.functionWord && !gateOverride)) return card;
    // Д9-B: an acronym Dicta lemmatized to its BARE letters (פַתַ״ח → פתח «вход») is not that word — left unparsed, with
    // the names; an acronym Dicta keeps as an acronym (צה״ל, שב״כ, ממ״ד) is its own word and stays one
    if (d9 && _ACRONYM_RE.test(String(surfaceOrig || niqqudOrig || "")) && !/["״]/.test(String(e.lemma || ""))) return card;
    // a closed-class word behind proclitics (וְגַם, בְּכָל, וְיֵשׁ) stays a function word whatever Dicta calls it (adverb, no
    // class); only a LEXICAL adverb (עַכְשָׁו, בְּדִיּוּק, סְתָם) becomes a word of the dictionary
    try { var fnr = enrichReading(eng, card, surfaceOrig, String(niqqudOrig || "")); if (fnr && fnr.label === "function" && !/adverb/.test(fnr.gateVia || "")) return card; } catch (_) {}
    var conf = null;
    try { conf = await _dictaConfirmed(eng, surfaceOrig, niqqudOrig, { prefix: e.prefix, lemma: e.lemma, lemmas: [], posDicta: e.pos || null, niqqud: e.nq }, opts); } catch (_) { conf = null; }
    if (conf) return Object.assign({}, conf.card, { word: surfaceOrig || stripNiqqud(niqqudOrig), niqqud: String(niqqudOrig || ""), identityVia: "dicta-confirmed" });
    // Д9-B: Dicta's reading whose bare letters are one Pealim entry's cell — that entry (בֵּדוּאִים → בדואי)
    var bySk = d9 ? _pealimBySkeleton(eng, e, surfaceOrig || stripNiqqud(niqqudOrig), niqqudOrig) : "";
    if (bySk) return _cardForPid(eng, card, bySk, "dicta-pealim");
    return Object.assign({}, card, {
      label: "dicta", channel: "dicta-lexicon", identityVia: "dicta-lexicon", dictaKey: DLX.keyOf(e),
      lemma: e.lemma, pos: e.pos, meaning: "", root: null, binyan: "", paradigm: null, pealim_id: "", pealim_url: "",
      ambiguous: !!e.amb || gateOverride, alts: [], functionWord: false, gateVia: "", dictaNoLemma: !!e.noLemma,
    });
  }
  var _DictaLexiconNode = null;
  try { if (typeof module !== "undefined" && module.exports && typeof require === "function") _DictaLexiconNode = require("./dicta-lexicon.js"); } catch (_) { _DictaLexiconNode = null; }
  // the device's Dicta lexicon (Map skeleton → entry), set by the host after reading local-db; null = off
  function setDictaLexicon(lex) {
    var eng = _eng; if (eng) eng.dictaLex = lex || null;
    _pendingDictaLex = lex || null;
    try { _glossMemo.clear(); } catch (_) {}
  }
  var _pendingDictaLex = null;
  // ── Ф4 · Д9 (independent identity audit 2026-10-16, docs/research/my-dictionary-identity-audit/2026-10-16/RESULTS.md):
  // a «likely» reading took another paradigm's CELL where the form has its OWN Pealim entry (מַכּוֹת → «бить», not
  // מכה «удар»; נָחוּשׁ → «чувствовать», not «непреклонный»; שְׁנִיָּה → «второй», not «секунда»; הַיּוֹם → «день», not
  // «сегодня») — 16 % false keys on that path. Two rules, offline, in this one place (paint, tap, lists agree):
  //  A1 the paradigm whose CITATION form (its lemma, the singular / masculine singular cell) IS the text's vocalized
  //     form wins over a cell of another paradigm — the headword is the word;
  //  A2 an honest homograph (a verb's present-tense cell = a noun's / adjective's cell: מַכּוֹת, מַדְהִימִים) is decided
  //     by the device's Dicta lexicon (Dicta's reading of this spelling in the learner's own texts), when exactly one
  //     candidate agrees with its part of speech and lemma; otherwise the reading stays as it was.
  var _CITATION_CELLS = ["s", "ms-a"];
  function _nv(s) { var NA = (typeof window !== "undefined" && window.NotesAutoGen) || null; return NA && NA.normVowels ? NA.normVowels(String(s || "")) : String(s || "").normalize("NFC"); }
  function _citationForms(par) {
    var out = [];
    if (!par) return out;
    if (par.lemma_niqqud) out.push(_nv(par.lemma_niqqud));
    for (var i = 0; i < _CITATION_CELLS.length; i++) { var c = par.cells && par.cells[_CITATION_CELLS[i]]; if (c && c.he) out.push(_nv(c.he)); }
    return out;
  }
  // paradigms without cells (adverbs such as הַיּוֹם «сегодня») are in no form index: their citation form, once per engine
  function _cellLessIndex(eng) {
    if (eng._cellLess) return eng._cellLess;
    var m = new Map();
    if (eng.pidMap) eng.pidMap.forEach(function (p, pid) {
      if (!p || (p.cells && Object.keys(p.cells).length) || !p.lemma_niqqud) return;
      var k = _nv(p.lemma_niqqud); if (!m.has(k)) m.set(k, []); m.get(k).push(pid);
    });
    eng._cellLess = m;
    return m;
  }
  function _cardForPid(eng, card, pid, via) {
    var par = eng.pidMap && eng.pidMap.get(String(pid));
    if (!par) return card;
    var prev = card.pealim_id ? [{ pealim_id: String(card.pealim_id), pos: card.pos || "", meaning: card.meaning || "", root: card.root || null }] : [];
    return Object.assign({}, card, {
      pealim_id: String(pid), lemma: par.lemma || "", pos: par.pos || "", meaning: par.meaning || "", root: par.root || null,
      binyan: par.binyan || "", paradigm: par, pealim_url: par.pealim_url || "", label: "likely", identityVia: via, functionWord: false,
      ambiguous: true, alts: prev.concat((card.alts || []).filter(function (a) { return String(a && a.pealim_id || "") !== String(pid); })),
    });
  }
  var _D9_POS = { noun: "noun", adjective: "adjective", verb: "verb", adverb: "adverb", numeral: "numeral" };
  function _posKin(a, b) { return a === b || ((a === "noun" || a === "adjective") && (b === "noun" || b === "adjective")); }
  function _preferOwnEntry(eng, card, surfaceOrig, niqqudOrig) {
    if (!card || card.label !== "likely" || card.functionWord || !card.pealim_id || !eng || !eng.pidMap) return card;
    var form = _nv(niqqudOrig);
    if (!form || !/[ְ-ּ]/.test(form)) return card;
    var pids = [String(card.pealim_id)];
    (card.alts || []).forEach(function (a) { if (a && a.pealim_id && pids.indexOf(String(a.pealim_id)) < 0) pids.push(String(a.pealim_id)); });
    (_cellLessIndex(eng).get(form) || []).forEach(function (pid) { if (pids.indexOf(pid) < 0) pids.push(pid); });
    var DLX = (typeof window !== "undefined" && window.DictaLexicon) || _DictaLexiconNode;
    var e = (DLX && eng.dictaLex) ? DLX.lookup(eng.dictaLex, surfaceOrig || niqqudOrig) : null;
    // Dicta's reading of the spelling counts where it DOMINATES (בָּא: verb 157 of 158 — one stray reading is not «ambiguous»);
    // where Dicta itself is split (טוֹבָה: «хорошая» / «одолжение», 53 other readings of 58) the spelling is a true homograph
    // and no Д9 rule decides it
    if (e && e.cls !== "content") e = null;
    var eLemma = e ? _d8Loose(e.lemma) : "";   // Dicta's first lemma — read even where it is split (see A1)
    if (e && (Number(e.altN) || 0) > 0.2 * (Number(e.n) || 1)) e = null;
    var dLemma = e ? _d8Loose(e.lemma) : "";
    var dictaReads = function (par) {   // does Dicta's reading fit this paradigm? (part of speech, else the lemma)
      if (!e || !par) return false;
      if (e.pos && _D9_POS[e.pos]) return _posKin(par.pos || "", e.pos);
      return [par.lemma, par.lemma_niqqud].filter(Boolean).map(_d8Loose).indexOf(dLemma) >= 0;
    };
    // A2 first where it is decisive: Dicta's dominant reading names exactly ONE candidate by its EXACT part of speech and
    // lemma (טוֹבָה → טוב «хороший», not the headword טובה «одолжение»; מַכּוֹת → מכה «удар»)
    var dictaPick = function () {
      if (!e || !e.pos || !_D9_POS[e.pos] || pids.length < 2) return "";
      var hit = pids.filter(function (pid) {
        var p = eng.pidMap.get(pid); if (!p || (p.pos || "") !== e.pos) return false;
        return [p.lemma, p.lemma_niqqud].filter(Boolean).map(_d8Loose).indexOf(dLemma) >= 0;
      });
      return hit.length === 1 ? hit[0] : "";
    };
    var dp = dictaPick();
    if (dp) return dp === String(card.pealim_id) ? card : _cardForPid(eng, card, dp, "dicta-tiebreak");
    // A1 — with Dicta's veto: where the device's Dicta lexicon reads this spelling as the current reading and not as the
    // headword (בָּא «пришёл», not «следующий»; צְרִיכָה «нужна», not «потребление»), the reading stays
    var own = pids.filter(function (pid) { return _citationForms(eng.pidMap.get(pid)).indexOf(form) >= 0; });
    // the headword vs an INFLECTED form of a sibling Dicta lemmatizes to (טוֹבָה: noun טובה «одолжение» vs the feminine of
    // טוב «хороший»; Dicta: lemma טוב) — Dicta's lemma decides, even where its readings are split
    if (own.length === 1 && eLemma) {
      var ownPos = (eng.pidMap.get(own[0]) || {}).pos || "";
      var sib = pids.filter(function (pid) {
        if (pid === own[0]) return false;
        var p = eng.pidMap.get(pid) || {};
        // one family only (noun ~ adjective): הַיּוֹם «сегодня» (adverb) is not ה+יוֹם «день» because Dicta segments it so
        if (!_posKin(p.pos || "", ownPos) || ownPos === "adverb") return false;
        return [p.lemma, p.lemma_niqqud].filter(Boolean).map(_d8Loose).indexOf(eLemma) >= 0;
      });
      var ownLemmaIsDicta = [(eng.pidMap.get(own[0]) || {}).lemma].filter(Boolean).map(_d8Loose).indexOf(eLemma) >= 0;
      if (sib.length === 1 && !ownLemmaIsDicta) return sib[0] === String(card.pealim_id) ? card : _cardForPid(eng, card, sib[0], "dicta-tiebreak");
    }
    // a present participle of piel / hifil / hitpael / pual / hufal (מְנַהֵל «руководит», מְעַנְיֵן «интересует», מַצְחִיק) is
    // more often the verb than the headword it lexicalized into (מנהל «начальник») — measured on the owner's corpus
    // (fresh sample: 7 of 9 participle errors); A1 leaves it to Dicta's reading (A2 above) or as it was
    var curPar = eng.pidMap.get(String(card.pealim_id)) || {};
    var derivedParticiple = curPar.pos === "verb" && /^(piel|hifil|hitpael|pual|hufal)$/.test(String(curPar.binyan || "")) &&
      Object.keys(curPar.cells || {}).some(function (k) { return /^AP-/.test(k) && curPar.cells[k] && _nv(curPar.cells[k].he) === form; });
    if (own.length === 1 && own[0] !== String(card.pealim_id) && !derivedParticiple) {
      var veto = dictaReads(eng.pidMap.get(String(card.pealim_id)) || card) && !dictaReads(eng.pidMap.get(own[0]));
      if (!veto) return _cardForPid(eng, card, own[0], "own-entry");
      return card;
    }
    if (own.length === 1) return card;
    return card;
  }
  // Д9-B: the Dicta lexicon must not turn into a word (measured S4: 16 % false keys)
  //  · an acronym with gershayim Pealim does not read (פַתַ״ח → «вход», צה״ל) — a name / organization, left unparsed;
  //  · a colloquial ת׳ / ש׳ contraction (תָּ׳דּוֹר = אֶת הַ+דּוֹר): the word after the geresh is the word;
  //  · a Dicta reading whose bare letters (after Dicta's prefix) are the cell of exactly one Pealim entry of a kindred part
  //    of speech (בֵּדוּאִים, pointed with tsere where Pealim has segol → Dicta's plural «lemma») — the Pealim entry.
  var _ACRONYM_RE = /[א-ת](["״])[א-ת]/;
  var _CONTRACTION_RE = /^([תש])[׳'](?=[א-ת])/;
  function _contractionRest(s) {
    var m = _CONTRACTION_RE.exec(stripNiqqud(String(s || "")));
    if (!m) return null;
    var nq = String(s || "").normalize("NFC"), i = nq.search(/[׳']/);
    return i >= 0 ? nq.slice(i + 1) : null;
  }
  // the vowel class of each consonant of a vocalized word: a (patah/qamats/hataf-patah), e (tsere/segol/hataf-segol),
  // i, o (holam, holam male), u (qubuts, shuruk); sheva/dagesh/dots ignored, matres (וֹ וּ, a bare יו) give their vowel to the
  // consonant before. בֵּדוּאִים ≡ בֶּדוּאִים (tsere ~ segol), צִיּוֹן ≠ צִיּוּן (Zion ≠ «отметка»).
  var _VCLASS = { "ַ": "a", "ָ": "a", "ֲ": "a", "ֵ": "e", "ֶ": "e", "ֱ": "e", "ִ": "i", "ֹ": "o", "ֺ": "o", "ֳ": "o", "ֻ": "u" };
  function _vowelClasses(nq) {
    var cl = _clusters(String(nq || "").normalize("NFC")), out = [];
    for (var i = 0; i < cl.length; i++) {
      var letter = cl[i].charAt(0), marks = cl[i].slice(1);
      if (!/[א-ת]/.test(letter)) continue;
      var v = ""; for (var j = 0; j < marks.length; j++) if (_VCLASS[marks.charAt(j)]) v = _VCLASS[marks.charAt(j)];
      if (letter === "ו" && out.length && (marks === "ֹ" || marks === "ּ")) { out[out.length - 1] = marks === "ֹ" ? "o" : "u"; continue; }
      if ((letter === "י" || letter === "ו") && !v && !/ּ/.test(marks) && out.length) continue;   // a bare mater
      out.push(v);
    }
    return out.join(",");
  }
  function _pealimBySkeleton(eng, e, surface, niqqud) {
    var maps = eng && eng.maps; if (!maps || !maps.cell || !eng.pidMap) return "";
    // the vowels decide; an unpointed place reads Dicta's own pointing of this spelling (the lexicon keeps it) — so הָעָם
    // and an unpointed העם get ONE key, never two entries of one word
    if (!/[ְ-ּ]/.test(String(niqqud || ""))) niqqud = e.nq || "";
    if (!/[ְ-ּ]/.test(String(niqqud || ""))) return "";
    // maps.cell keys keep final letters (בדואים) — no final folding here
    var sk = stripNiqqud(String(surface || "")).replace(/[^א-ת]/g, ""), pre = stripNiqqud(String(e.prefix || "")).replace(/[^א-ת]/g, "");
    if (pre && (sk.indexOf(pre) !== 0 || sk.length - pre.length < 2)) pre = "";
    sk = sk.slice(pre.length);
    var hits = maps.cell.get(sk) || [];
    var pids = [];
    hits.forEach(function (h) { if (h && h.pealim_id && _posKin(h.pos || "", e.pos || "") && pids.indexOf(String(h.pealim_id)) < 0) pids.push(String(h.pealim_id)); });
    if (pids.length !== 1) return "";
    var par = eng.pidMap.get(pids[0]) || {};
    // a noun of Dicta's becomes a Pealim adjective only where Pealim itself gives the noun use (בדואי «бедуин (как
    // существительное)»); חַיִּים «жизнь» is not חי «живой»
    if (e.pos === "noun" && par.pos === "adjective" && !/существительн/.test(String(par.meaning || ""))) return "";
    if (e.pos === "adjective" && par.pos === "noun") return "";
    // R11: only a KINDRED lemma replaces Dicta's (בדואים ~ בדואי) — a chance letter match with another word never does
    var pl = _d8Loose(par.lemma), dl = _d8Loose(e.lemma);
    // Dicta's lemma that only echoes the form (בדואים for בֵּדוּאִים) is no lemma — the kindred Pealim lemma may stand in
    var echo = e.noLemma || dl === _d8Loose(sk);
    if (!(pl && dl && (dl === pl || (echo && dl.indexOf(pl) === 0)))) return "";
    // …and the text's own vowels are that cell's (by class): עֲרָבִי «араб» is not עַרְבֵי «вечера», צִיּוֹן not צִיּוּן
    // a TEXT letter left unpointed (a partly pointed word: קוֹדם) matches any vowel; the cell's sheva is a real vowel (עַרְבִּי)
    var textV = _vowelClasses(niqqud).split(",").slice(pre.length);
    var sameV = function (cellV) {
      if (cellV.length !== textV.length) return false;
      for (var i = 0; i < cellV.length; i++) if (textV[i] && cellV[i] !== textV[i]) return false;
      return true;
    };
    var match = Object.keys(par.cells || {}).some(function (k) {
      var c = par.cells[k]; return c && c.he && stripNiqqud(c.he) === sk && sameV(_vowelClasses(c.he).split(","));
    });
    return match ? pids[0] : "";
  }
  async function _resolveBase(eng, surfaceOrig, niqqudOrig, opts) {
    var card = await _resolveOffline(eng, surfaceOrig, niqqudOrig);
    if (!(opts && opts.noD9)) card = _preferOwnEntry(eng, card, surfaceOrig, niqqudOrig);
    if (!card || (card.label !== "unknown" && card.label !== "guessed")) return card;
    var up = null;
    try { up = enrichReading(eng, card, surfaceOrig, String(niqqudOrig || "")); } catch (_) { up = null; }
    return up && up.channel === "form-canonical" && up.pealim_id ? Object.assign({}, up, { identityVia: "form-canonical" }) : card;
  }
  async function _resolveOffline(eng, surfaceOrig, niqqudOrig) {
    var pidMap = eng.pidMap;
    var n0 = String(niqqudOrig || "");
    var cands = [{ surface: stripNiqqud(n0) || surfaceOrig, niqqud: n0 }];
    var alt = articleStrippedForm(n0);
    if (alt) cands.push({ surface: stripNiqqud(alt), niqqud: alt });
    var rel = relativeStrippedForm(n0);
    if (rel) cands.push({ surface: stripNiqqud(rel), niqqud: rel });
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
  // Phase-3 — the current work's Dicta proclitic overlay { skeleton → {pre,pn,conf} }, set by the
  // Room when a work opens (library-ui fetches /data/benyehuda/proclitic/<id>.json). null → the
  // detector runs offline-only (hedged). Reset on every work open so it never leaks across works.
  var _procOverlay = null;
  function setProcliticOverlay(map) { _procOverlay = (map && typeof map === "object") ? map : null; }

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
      // Word layer Ф2: Russian form translations (≈200 KB gz) load alongside the dataset; a
      // failure only means no translations in the card/gloss, never a broken engine.
      var ruReady = window.RuForms ? window.RuForms.ensureReady().catch(function () { return null; }) : null;
      var ds = await ID.ensureReady();
      if (ruReady) await ruReady;
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
      // warm function-word links + usage store (small, optional, graceful)
      try { if (window.PealimFunctionLinks) window.PealimFunctionLinks.ensureReady(); } catch (_) {}
      try { if (window.FunctionUsage) window.FunctionUsage.ensureReady(); } catch (_) {}
      // Phase-3 proclitic detector lexicon (built once from the SAME gazetteers as the resolver
      // → lock-step, no drift) + the corpus-attested-words vocab (Dicta-whole words → widens the
      // residual-stop lexicon for higher confident recall, do-no-harm-safe). Both graceful: absent
      // module/vocab → the detector still works (baseline lexicon).
      var procLex = null;
      try {
        if (window.ProcliticSegment) {
          var attested = null;
          try {
            var ar = await fetch("/data/inflection/corpus-attested-words-v1.json.gz", { cache: "no-cache" });   // revalidate: the vocab grows as the corpus is re-baked (same filename)
            if (ar && ar.ok) {
              if (typeof DecompressionStream === "function" && ar.body) attested = JSON.parse(await new Response(ar.body.pipeThrough(new DecompressionStream("gzip"))).text());
              else attested = await ar.json();
            }
          } catch (_) { attested = null; }
          procLex = window.ProcliticSegment.buildLexicon(paradigms, {
            names: Object.keys(NAME_PROPER), func: Object.keys(FUNCTION_GLOSS),
            attested: attested ? { content: attested.content, nominal: attested.nominal } : null,
          });
        }
      } catch (_) { procLex = null; }
      _eng = { NA: NA, maps: maps, pidMap: pidMap, lookup: lookup, rootIndex: rootIndex, procLex: procLex, dictaLex: _pendingDictaLex };
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
    // Retention P0 (recon B1): delegate to the single exported canon keyer (lemma-canon.js) so
    // every OTHER write path (Studio P3, Anki ingest P4, review_log) shares these exact bytes.
    // The inline fallback below is kept byte-equal for load-order robustness; smoke:memory-canon
    // asserts delegate == fallback on shared fixtures, so they cannot drift silently.
    try {
      if (typeof window !== "undefined" && window.LemmaCanon && card) {
        return window.LemmaCanon.canonKey(NA, card, niqqud, surface) || "";
      }
    } catch (_) {}
    if (!NA || !NA.lemmaKey) return "";
    if (card && card.label === "dicta" && /^dl:/.test(String(card.dictaKey || ""))) return String(card.dictaKey);   // == LemmaCanon.canonKey
    var ks = _statusKeyWord(card, niqqud, surface);
    try { return NA.lemmaKey({ pealim_id: _statusPid(card, ks), lemma: card.lemma, word: ks, pos: card.pos }) || ""; }
    catch (_) { return ""; }
  }
  // Word layer Ф1 (docs/planning/word-layer/F1_SPEC_2026_10_11.md): the OFFLINE reading of a table
  // word — byte-for-byte the resolveCore call decorateWords paints with — memoized per
  // (surface, niqqud) because a text repeats its words. The tap card stays the authority for
  // context refinement; this never calls the network and never writes learner state.
  // ── Word layer step 1 (docs/planning/word-layer/QUALITY_GAP_ANALYSIS_2026_10_11.md) ─────────
  // Offline ENRICHMENT of an undecided reading (unknown / guessed / likely). It never touches
  // resolveCore: the status/colour key stays the offline card's (preCtxCard), so a learner's saved
  // marks never detach. Three deterministic sources, each measured on the Shura card:
  //   1. closed-class word behind proclitics (וְאָז, שֶׁזֶּה, בְּכָל) — FUNCTION_GLOSS + a vowel guard on
  //      the prefix and an allow-list for 2-letter remainders (בָּאךְ «Бах» ≠ ב+אך, וּמַכָּה ≠ ו+מ+כה);
  //   2. lexicalised adverbs keyed by VOCALIZED form (בֶּאֱמֶת «действительно», עֲדַיִן ≠ עָדִין «нежный»);
  //   3. matres-insensitive vocalized form lookup (Pealim עַכְשָׁיו = text עַכְשָׁו; הָמוֹן/הֲמוֹן is not
  //      matched, ktiv male/haser is): accepted ONLY when it points to ONE paradigm.
  // Shura: +~11% of words glossed, manual sample ≈93% correct (vs 78% for a Dicta-lemma join).
  // The matres-insensitive reading is labelled «likely», never «exact»: on the archaic human gold
  // (reader-morph-gold --regold) an «exact» label here cut honest-degradation recall 81.8% → 62%.
  var _MATRES_FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  function canonForm(s) {
    s = String(s || "").normalize("NFC").replace(/[֑-ֽ֯‌-‏‪-‮]/g, "").replace(/[־\-]$/, "");
    s = s.replace(/וּ(?![ְ-ׇֻ])/g, "ֻ")      // shuruk → qubuts (needs its dagesh)
      .replace(/[ּֿ]/g, "")                                     // dagesh/rafe: sources disagree
      .replace(/וֹ/g, "ֹ")                                  // holam male → holam
      .replace(/ֹו(?![ְ-ׇֻ])/g, "ֹ")
      .replace(/([ִֵֶ][ׁׂ]?)י(?![ְ-ׇֻ])/g, "$1")   // yod mater after i/e
      .replace(/(ָ[ׁׂ]?)י(?![ְ-ׇֻ])ו/g, "$1ו")   // -ָיו: עַכְשָׁיו ~ עַכְשָׁו
      .replace(/ׇ/g, "ָ")
      .replace(/[ךםןףץ]/g, function (c) { return _MATRES_FINAL[c]; });
    return s.normalize("NFC");
  }
  // Display-only glosses of lexicalised adverbs, keyed by canonForm of the VOCALIZED word.
  var DISPLAY_GLOSS_VOC = {
    "בֶּאֱמֶת": "действительно", "כְּאִלּוּ": "как будто", "הֲמוֹן": "много, масса", "יַחַד": "вместе",
    "בְּיַחַד": "вместе", "עֲדַיִן": "ещё, пока", "קֹדֶם": "сначала; раньше", "תּוֹךְ": "в течение; внутри",
    "מְעַט": "немного", "הַרְבֵּה": "много", "בַּסּוֹף": "в конце концов", "כָּזֶה": "такой", "כָּזֹאת": "такая",
    "כָּאֵלֶּה": "такие", "כָּאֵלּוּ": "такие", "אֵיזֶשֶׁהוּ": "какой-то", "אֵיזוֹשֶׁהִי": "какая-то",
    "מִתַּחַת": "под, снизу", "לְפָחוֹת": "по крайней мере", "בְּדִיּוּק": "точно, именно", "כִּמְעַט": "почти",
    "שׁוּב": "снова", "עַכְשָׁו": "сейчас", "אָכֵן": "действительно", "הָלְאָה": "дальше", "בְּעִקָּר": "в основном",
    "מֵאֵיפֹה": "откуда", "לְאַט": "медленно", "פִּתְאֹם": "вдруг", "בְּסֵדֶר": "в порядке", "כָּכָה": "так",
    "אֵיךְ": "как", "לָמָּה": "почему", "בִּגְלַל": "из-за", "סְתָם": "просто так",
  };
  // 2-letter closed-class remainders allowed behind a proclitic (vocalized, canonForm-compared).
  var SHORT_FUNC_VOC = ["זֶה", "זוֹ", "לֹא", "גַּם", "אָז", "כָּךְ", "מָה", "מַה", "מִי", "אִם", "עִם", "עַל", "יֵשׁ", "כָּל",
    "כֹּל", "כֹל", "כָל", "פֹּה", "שָׁם", "כֵּן", "אַף", "אֵין", "אֶת", "אֵת", "הוּא", "הִיא", "הֵם", "הֵן", "אֵל", "אֶל"];
  var _shortFunc = null, _dispGloss = null;
  // proclitic letter → vowels it can carry (sheva ְ, hiriq ִ, tsere ֵ, segol ֶ, patah ַ, qamats ָ, shuruk וּ)
  var _PRE_VOWEL = { "ו": /^(?:[ְִֶַָ]|ּ)$/, "ש": /^[ֶַ]$/, "ב": /^[ְִֵֶַָ]$/,
    "ל": /^[ְִֵֶַָ]$/, "כ": /^[ְִֵֶַָ]$/, "מ": /^[ִֵ]$/, "ה": /^[ֶַָ]$/ };
  function _clusters(s) {
    var out = [], str = String(s || "");
    for (var i = 0; i < str.length; i++) { var ch = str.charAt(i); if (/[֑-ׇ]/.test(ch) && out.length) out[out.length - 1] += ch; else out.push(ch); }
    return out;
  }
  // the proclitic clusters of a vocalized word carry proclitic vowels (no dagesh/dots/meteg noise)
  function _prefixVowelsOk(cls) {
    for (var i = 0; i < cls.length; i++) {
      var letter = cls[i].charAt(0), v = cls[i].slice(1).replace(/[ֽׁׂ֑-֯]/g, "");
      if (letter !== "ו") v = v.replace(/ּ/g, "");
      var re = _PRE_VOWEL[letter];
      if (!re || !re.test(v)) return false;
    }
    return true;
  }
  // → [{ prefix:"<consonants>", rest:"<vocalized remainder>" }] for every valid proclitic split, short → long
  function _procliticSplits(niqqud) {
    var cl = _clusters(String(niqqud || "").normalize("NFC")), out = [];
    for (var n = 1; n <= 3 && n < cl.length - 1; n++) {
      var pre = cl.slice(0, n).map(function (c) { return c.charAt(0); }).join("");
      if (!/^ו?(?:כש|ש|מש)?[בלכמ]?ה?$/.test(pre)) break;
      if (!_prefixVowelsOk(cl.slice(0, n))) break;
      out.push({ prefix: pre, rest: cl.slice(n).join("") });
    }
    return out;
  }
  function _canonIndex(eng) {
    if (eng.canonIdx) return eng.canonIdx;
    var idx = new Map();
    var push = function (k, v) { if (!k) return; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(v); };
    eng.pidMap.forEach(function (p) {
      if (!p || /^Conjugation of/.test(p.lemma || "")) return;
      if (p.lemma_niqqud && !/[A-Za-z]/.test(p.lemma_niqqud)) push(canonForm(p.lemma_niqqud), { p: p, slot: "BASE" });
      var cells = p.cells || {};
      Object.keys(cells).forEach(function (k) { if (cells[k] && cells[k].he) push(canonForm(cells[k].he), { p: p, slot: k }); });
    });
    eng.canonIdx = idx;
    return idx;
  }
  function _uniqueParadigm(hits) {
    var id = null;
    for (var i = 0; i < hits.length; i++) { var x = String(hits[i].p.pealim_id); if (id === null) id = x; else if (id !== x) return null; }
    return hits[0].p;
  }
  var ENRICH_LABELS = { unknown: 1, guessed: 1, likely: 1 };
  function enrichReading(eng, card, surface, niqqud) {
    if (!card || !ENRICH_LABELS[card.label] || card.gateVia === "name" || !niqqud || !/[ְ-ּ]/.test(niqqud)) return card;
    if (!_dispGloss) {
      _dispGloss = new Map(); Object.keys(DISPLAY_GLOSS_VOC).forEach(function (k) { _dispGloss.set(canonForm(k), DISPLAY_GLOSS_VOC[k]); });
      _shortFunc = new Set(SHORT_FUNC_VOC.map(canonForm));
    }
    var fnCard = function (meaning, prefix, via) {
      var c = Object.assign({}, card, { meaning: meaning, label: "function", functionWord: true, gateVia: via, procliticPrefix: prefix || "",
        paradigm: null, pealim_id: "", root: null, binyan: "", lemma: "", ambiguous: false, alts: [], channel: "enrich-" + via });
      return c;
    };
    var whole = canonForm(niqqud);
    if (_dispGloss.has(whole)) return fnCard(_dispGloss.get(whole), "", "adverb");
    var splits = _procliticSplits(niqqud), i, sp, restC, restS;
    // הַאִם «≈разве» must not become ה + אם «если»: the article never precedes a particle (guard
    // below), and a likely reading whose proclitic split lands on the same word keeps its meaning.
    // A likely ADVERB reading is a fused word whose proclitic is part of it (לְכָאן «сюда», מֵאָז
    // «с тех пор», בְּיוֹתֵר «самый», לְמָה «почему»); a pronoun-set cell already reads right (שֶׁהֵן).
    // Re-splitting them made «к + здесь», «из + тогда» — they keep their own reading.
    var pc = (card.paradigm && card.paradigm.cells) || {};
    var keepLikely = card.label === "likely" && (card.pos === "adverb" || !!(pc["1s"] && pc["3ms"] && !pc.s && !pc["P-1s"]));
    for (i = 0; i < splits.length && !keepLikely; i++) {   // 1+2: closed class / adverb behind proclitics
      sp = splits[i]; restC = canonForm(sp.rest); restS = stripNiqqud(sp.rest);
      // the article ה never stands before a particle (הַאִם is the question ה), only before demonstratives
      if (/ה$/.test(sp.prefix) && !/^(?:זה|זאת|זו|אלה|אלו)$/.test(restS)) continue;
      if (_dispGloss.has(restC)) return fnCard(_dispGloss.get(restC), sp.prefix, "proclitic-adverb");
      if (Object.prototype.hasOwnProperty.call(FUNCTION_GLOSS, restS) && FUNCTION_GLOSS[restS] &&
        (restS.length >= 3 || _shortFunc.has(restC))) return fnCard(FUNCTION_GLOSS[restS], sp.prefix, "proclitic-function");
    }
    var idx = _canonIndex(eng), hits = idx.get(whole), pre = "";   // 3: matres-insensitive form
    if (!hits) {
      for (i = 0; i < splits.length && !hits; i++) { if (idx.get(canonForm(splits[i].rest))) { hits = idx.get(canonForm(splits[i].rest)); pre = splits[i].prefix; } }
    }
    if (!hits) return card;
    var p = _uniqueParadigm(hits);
    if (!p) return card;
    if (card.label === "likely" && card.pealim_id && String(card.pealim_id) !== String(p.pealim_id)) return card;   // don't swap a homograph pick
    var slots = hits.map(function (h) { return h.slot; }).filter(function (s) { return s !== "BASE"; });
    return Object.assign({}, card, {
      label: "likely", channel: "form-canonical", meaning: p.meaning || "", paradigm: p, pealim_id: String(p.pealim_id || ""),
      pos: p.pos || "", binyan: p.binyan || "", root: p.root || null, lemma: p.lemma || "", ambiguous: false, alts: [],
      functionWord: false, canon: { slots: slots, prefix: pre },
    });
  }

  var _glossMemo = new Map();
  async function resolveForGloss(surface, niqqud) {
    surface = stripNiqqud(surface);
    if (!surface) return null;
    var key = surface + "|" + (niqqud || "");
    if (_glossMemo.has(key)) return _glossMemo.get(key);
    var eng = await ensureEngine();
    var card = enrichReading(eng, await resolveCore(eng, surface, niqqud || ""), surface, niqqud || "");
    if (_glossMemo.size > 20000) _glossMemo.clear();
    _glossMemo.set(key, card);
    return card;
  }
  // place (Д10) — { sid, off } of the tapped word: its key is the place's (the same as the paint's)
  async function resolveWordLight(surface, niqqud, ctx, place) {
    surface = stripNiqqud(surface);
    if (!surface) return null;
    var eng = await ensureEngine();
    // O-091: the first tap in a corpus work just opened waits (bounded) for the work's baked parse, so the card
    // and the key it saves are the place's from the first tap, not only from the second
    if (place) { try { await ensurePlaces([place.sid], { wait: 4000 }); } catch (_) {} }
    var card = await resolveCore(eng, surface, niqqud, place ? { place: place } : undefined);
    // The learner's status identity is the OFFLINE reading — the same card decorateWords paints
    // with — so the save-key can never split from the paint-key when a context merge swaps or
    // re-glosses the card (recon §10 R11-F3; the ktiv-parity lesson, now for context).
    var preCtxCard = card;
    // Baked overlay facts may be pos-only (legacy cache rows carry no niqqud): paths B/C need
    // only the context POS; path A — and its resolveCore — additionally needs ctx.niqqud
    // (recon §10, the P4 seam contract).
    if (ctx && (ctx.niqqud || ctx.posDicta)) {
      try {
        var ctxCard = ctx.niqqud ? await resolveCore(eng, surface, ctx.niqqud) : null;
        var pick = pickContextReading(card, ctxCard, ctx, surface);
        // B3 segmentation-consistency guard — the SAME call the bake-time replay makes (lock-step):
        // a promotion must land on a paradigm that inflects to the segment Dicta identified.
        if (pick.use === "context" && !contextPromotionGuard(eng, surface, ctx.st || "", ctxCard)) pick = { use: "offline" };
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
        // honest provenance split: precomputed (offline) vs live Dicta (recon §3.4/§10 R11-F7)
        if (card.contextUsed) { card.contextSource = ctx.source || "live"; card.contextMade = ctx.made || ""; }
      } catch (_) { /* ctx hiccup → keep offline card (silent, no dead-end) */ }
    }
    // Word layer step 1: the same offline enrichment the gloss/ribbon use, so a tap shows what the
    // ribbon showed. Display only — the status key below stays the offline preCtxCard's.
    try { card = enrichReading(eng, card, surface, niqqud || ""); } catch (_) {}
    if (!card.pealim_url && window.PealimFunctionLinks) {
      try {
        var fl = window.PealimFunctionLinks.lookup(surface, card.pos || "", { lemma: surface });
        if (fl && fl.id != null && (!card.pos || !fl.pos || fl.pos === card.pos)) {
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
    // Keyed by the PRE-context offline card (stable identity == paint key; §10 R11-F3).
    card.lemmaKey = statusKeyForCard(eng.NA, preCtxCard, niqqud, surface);
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
    // Epic-3b — curated function-word USAGE (role/government/suffix series/collocations/
    // pitfalls/register/examples). HONESTY GATE: attach ONLY to a confident closed-class
    // reading (functionWord = the Epic-1 gate fired), and NOT when Dicta disputes the POS
    // in context (contextPos ≠ pos → e.g. tap עד as «свидетель», not the preposition).
    // The store self-hides any absent field; an unresolved/unloaded store leaves card.usage null.
    card.usage = null;
    if (card.functionWord && !(card.contextPos && card.contextPos !== card.pos) &&
        typeof window !== "undefined" && window.FunctionUsage) {
      try {
        await window.FunctionUsage.ensureReady();
        card.usage = window.FunctionUsage.lookup(card.word || surface, { stem: surface, lemma: card.lemma }) || null;
      } catch (_) { card.usage = null; }
    }
    // Epic-3b fix — the curated usage entry carries the VERIFIED Pealim sense-id, which
    // overrides the niqqud-stripped function-link map (it picked the wrong homograph:
    // אל → 5261 אַל «не» instead of 2682 אֶל «к»). Using the curated id gives the correct
    // dict link AND, for prepositions/existentials that decline, the correct pronominal
    // paradigm — rendered by the SAME table+tap-to-speak machinery as verbs/nouns.
    if (card.usage && card.usage.pealim_id) {
      card.pealim_id = String(card.usage.pealim_id);
      card.pealim_url = card.usage.pealim_url ||
        ("https://www.pealim.com/ru/dict/" + encodeURIComponent(card.pealim_id) + "/");
      card.pealim_direct = true;
      if (card.usage.declension && eng.pidMap) {
        var par = eng.pidMap.get(card.pealim_id);
        if (par && par.cells && Object.keys(par.cells).length) { card.paradigm = par; card.usageParadigm = true; }
      }
    }
    // Phase-3 — proclitic segmentation (ADDITIVE: attaches card.proclitics only; the stem reading
    // above is UNTOUCHED — byte-parity gate). Offline FSA + the current work's Dicta overlay. We
    // surface ONLY the CONFIDENT (overlay-confirmed) tier: measured on real text, the offline-only
    // tier hedges on ~22% of words — far too noisy for a premium surface, and the recon requires
    // the FSA + bake-Dicta overlay to ship TOGETHER (offline alone, ~95%, must NOT surface). So an
    // un-baked work shows nothing; the chip-row activates per-work as overlays are baked+pushed.
    // (card.procliticsRaw keeps the offline hedge for a future opt-in surfacing decision.)
    card.proclitics = null; card.procliticsRaw = null;
    try {
      if (eng.procLex && window.ProcliticSegment) {
        var pk = window.ProcliticSegment.skeleton(surface);
        var ov = (_procOverlay && pk) ? (_procOverlay[pk] || null) : null;
        var pr = window.ProcliticSegment.detect(surface, niqqud || card.niqqud || "", { lex: eng.procLex, overlay: ov });
        if (pr && pr.hasProclitic) { card.procliticsRaw = pr; if (pr.confident) card.proclitics = pr; }
      }
    } catch (_) { card.proclitics = null; }
    return card;
  }

  async function loadLearningTargets(card) {
    if (!card) return;
    var LT = typeof window !== 'undefined' && window.LearningTargets;
    card.learningTargets = LT ? LT.candidates(card,card.niqqud) : [];
    var rows = [];
    if (card.learningTargets.length && typeof _attachOpts.listLearningTargets === 'function') {
      try { rows = await _attachOpts.listLearningTargets(card.lemmaKey); } catch (_) { rows = []; }
    }
    card.learningTargets.forEach(function (target) {
      var row = rows.find(function (r) { return r.lemma_key === target.key; });
      target.enrolled = !!row; target.manualStatus = row && row.status || '';
      target.srsRow = row && row.srs_due ? {due:Date.parse(row.srs_due),interval:row.srs_interval||0,reps:row.srs_reps||0,
        lapses:row.srs_lapses||0,stability:row.srs_stability,difficulty:row.srs_difficulty,
        reviewedAt:row.srs_reviewed_at?Date.parse(row.srs_reviewed_at):null,scheme:row.srs_scheme} : null;
    });
  }
  async function resolveLearningTarget(key, niqqud) {
    var LT = window.LearningTargets, target = LT && LT.parse(key);
    if (!target) return null;
    var eng = await ensureEngine(), par = eng.pidMap.get(target.pid);
    var description = LT.describe(key,par,niqqud);
    if (!description || !description.available) return description ? {target:description,card:null} : null;
    var card = {word:description.word,niqqud:description.niqqud,lemma:par.lemma||'',meaning:par.meaning||'',
      pos:par.pos,root:par.root||'',binyan:par.binyan||'',pealim_id:target.pid,paradigm:par,label:'exact',
      pealim_direct:true,pealim_url:par.pealim_url||'https://www.pealim.com/ru/dict/'+target.pid+'/',
      lemmaKey:target.parentKey,manualStatus:'',selectionRequired:false,ambiguous:false,rootFamily:[]};
    if (_attachOpts.getWordStatus) card.manualStatus = await _attachOpts.getWordStatus(card.lemmaKey) || '';
    await loadLearningTargets(card);
    return {target:description,card:card};
  }

  // G0 Wave 2 — guarded non-strict acceptance for the READING trainer only.
  // Exact normalized forms are accepted immediately. A one-letter proclitic-assisted match is
  // accepted only when resolving the learner's actual answer returns the SAME canonical lemma key
  // as the review item. This keeps useful ספר↔הספר tolerance without the inherited lexical-
  // collision false positive כלב→לב. Resolver failure degrades fail-closed to false.
  // Production channels do not call this helper: reverse/cloze/dictate are strict by owner decision.
  var _ANSWER_FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  var _ANSWER_PROCLITICS = { "ו": 1, "ה": 1, "ב": 1, "כ": 1, "ל": 1, "ש": 1, "מ": 1 };
  function _answerSkeleton(s) {
    return stripNiqqud(String(s == null ? "" : s))
      .replace(/[ךםןףץ]/g, function (c) { return _ANSWER_FINALS[c] || c; })
      .trim().replace(/\s+/g, " ");
  }
  function _dropAnswerProclitic(s) {
    return s && s.length > 2 && _ANSWER_PROCLITICS[s[0]] ? s.slice(1) : s;
  }
  function acceptStrictAnswer(expected, answer) {
    var exp = _answerSkeleton(expected), ans = _answerSkeleton(answer);
    return !!exp && !!ans && exp === ans;
  }
  async function acceptReadAnswer(expectedForms, answer, itemKey) {
    var ans = _answerSkeleton(answer);
    if (!ans) return false;
    var exact = [];
    for (var i = 0; i < (expectedForms || []).length; i++) {
      var raw = String(expectedForms[i] == null ? "" : expectedForms[i]);
      var e = _answerSkeleton(raw);
      if (e && !exact.some(function (x) { return x.skel === e; })) exact.push({ skel: e, raw: raw });
    }
    if (exact.some(function (x) { return x.skel === ans; })) return true;
    // Tolerance is one-way from an ACTUAL target form supplied by the item: the answer may add or
    // swap one leading proclitic around that form. We never manufacture a target by stripping an
    // arbitrary expected word (which is exactly how כלב became the false target לב).
    var ansBare = _dropAnswerProclitic(ans);
    var matched = ansBare !== ans ? exact.find(function (x) { return x.skel === ansBare; }) : null;
    if (!matched || !itemKey) return false;
    try {
      var stemCard = await resolveWordLight(matched.skel, matched.raw);
      // Д10: an item keyed by its place (מַכּוֹת «удары») is the form's alternative reading, still the same word
      var altOk = stemCard && /^pid:/.test(itemKey) && (stemCard.alts || []).some(function (a) { return a && "pid:" + a.pealim_id === itemKey; });
      if (!(stemCard && (stemCard.lemmaKey === itemKey || altOk))) return false;
      // An added leading letter may itself form a confident different lexeme (לב→כלב). Reject that
      // competing identity; an unresolved whole prefixed form may still use the proven stem.
      if (ansBare !== ans) {
        var whole = await resolveWordLight(stripNiqqud(String(answer || "")), String(answer || ""));
        if (whole && (whole.label === "exact" || whole.label === "likely") && whole.lemmaKey && whole.lemmaKey !== itemKey) return false;
      }
      return true;
    } catch (_) { return false; }
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
  function wrapCellHtml(value, niqqudForCell, opts) {
    opts = opts || {};
    var toks = tokenize(value);
    var wIdx = 0, html = "";
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (!tk.isWord) { html += escapeHtml(tk.text); continue; }
      var surface, niqqud;
      if (niqqudForCell) { var pair = niqqudForCell[wIdx] || {}; surface = pair.surface || tk.text; niqqud = pair.niqqud || ""; }
      else { surface = stripNiqqud(tk.text); niqqud = tk.text; }
      var off = wIdx; wIdx++;   // word offset within the row/sentence (for note occurrences)
      var tabIndex = opts.rovingFocus && wIdx > 1 ? "-1" : "0";
      html += '<span class="rm-w" role="button" tabindex="' + tabIndex + '"' +
        (opts.rovingFocus ? ' data-rm-roving="1"' : '') +
        ' data-surface="' + escapeHtml(surface) + '"' +
        ' data-niqqud="' + escapeHtml(niqqud) + '"' +
        ' data-w-offset="' + off + '">' + escapeHtml(tk.text) + "</span>";
    }
    return html;
  }

  function wrapMount(mount, getRow, opts) {
    if (!mount) return;
    opts = opts || {};
    var cellSelector = opts.cellSelector || '#proTable tbody td[data-col="he"], #proTable tbody td[data-col="niqqud"]';
    var cells = mount.querySelectorAll(cellSelector);
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i];
      if (td.getAttribute(WRAP_FLAG)) continue;
      var tr = td.closest(opts.rowSelector || "tr[data-row-idx]");
      var rowIdx = tr ? Number(tr.getAttribute(opts.rowIndexAttribute || "data-row-idx")) : NaN;
      var row = typeof opts.getRowForCell === "function" ? opts.getRowForCell(td, tr) :
        ((typeof getRow === "function" && Number.isFinite(rowIdx)) ? getRow(rowIdx) : null);
      if (!row) continue;
      var col = td.getAttribute("data-col");
      var plain = typeof opts.getPlainText === "function" ? opts.getPlainText(row) : row.he;
      var vocalized = typeof opts.getVocalizedText === "function" ? opts.getVocalizedText(row) : row.he_niqqud;
      var value = col === (opts.plainColumn || "he") ? String(plain || "") : String(vocalized || "");
      if (typeof opts.shouldWrap === "function" && !opts.shouldWrap(row, td, col, value)) continue;
      // Generated controls are not cell text. Media may add its replay button
      // before a distant row is hydrated; keep its node/listener and joining NBSP.
      var preserved = [];
      td.querySelectorAll('.subtitle-speech-badge, .niqqud-suspect-badge, .smk-row-replay').forEach(function (node) {
        var glue = node.previousSibling;
        if (node.classList.contains('smk-row-replay') && glue && glue.nodeType === 3 && glue.textContent === '\u00a0') preserved.push(glue);
        preserved.push(node);
      });
      if (col === (opts.plainColumn || "he")) {
        var aligned = alignSurfaceNiqqud(String(plain || ""), String(vocalized || ""));
        td.innerHTML = wrapCellHtml(String(plain || ""), aligned, opts);
      } else { // niqqud cell — tokens are self-vocalized
        td.innerHTML = wrapCellHtml(String(vocalized || ""), null, opts);
      }
      preserved.forEach(function (node) { td.appendChild(node); });
      td.setAttribute(WRAP_FLAG, "1");
    }
  }

  // ── DOM: bottom-sheet card ─────────────────────────────────────────────────
  var _sheet = null, _activeSpan = null;
  function tt(key, fallback) { try { if (typeof window !== "undefined" && typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fallback; }

  var LABEL_TEXT = {
    owner: ["room.morph.prov.owner", "проверено вами"],
    teacher: ["room.morph.prov.teacher", "проверено преподавателем"],
    exact: ["room.morph.prov.exact", "форма совпадает со словарём"],
    likely: ["room.morph.prov.likely", "вероятно"],
    guessed: ["room.morph.prov.guessed", "подобрано"],
    "function": ["room.morph.prov.function", "служебное слово"],
    context: ["room.morph.prov.context", "контекст (Dicta)"],
    dicta: ["room.morph.prov.dicta", "по разбору Dicta"],
    unknown: ["room.morph.prov.unknown", "не определено офлайн"],
  };
  // Epic-2 #1 — confidence-taxonomy legend (one-line meaning per badge, behind a «?»). The
  // badge NAMES reuse LABEL_TEXT; these are the explanations. Ordered decisive → least.
  var LEGEND_DESC = {
    owner: ["room.morph.legend.owner", "разбор сохранён вами для этого точного места в тексте"],
    teacher: ["room.morph.legend.teacher", "разбор сохранён преподавателем для этого точного места в тексте"],
    exact: ["room.morph.legend.exact", "офлайн-словарь распознал слово однозначно"],
    likely: ["room.morph.legend.likely", "наиболее вероятное чтение; возможны другие"],
    context: ["room.morph.legend.context", "значение выбрано по контексту (Dicta, машина)"],
    "function": ["room.morph.legend.function", "служебное слово — показываем роль, не парадигму"],
    guessed: ["room.morph.legend.guessed", "приблизительно — по родственному слову"],
    dicta: ["room.morph.legend.dicta", "лемма и часть речи из локального разбора Dicta; применимость в этой строке требует проверки"],
    unknown: ["room.morph.legend.unknown", "офлайн не определено — уточни по ссылке"],
  };
  var LEGEND_ORDER = ["owner", "teacher", "exact", "likely", "context", "dicta", "function", "guessed", "unknown"];
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
    participle: ["room.morph.pos.participle", "причастие"], propernoun: ["room.morph.pos.propernoun", "имя собственное"],
    negation: ["room.morph.pos.negation", "отрицание"], other: ["room.morph.pos.other", "другое"],
  };
  // word-note lifecycle (from getWordNoteLifecycle): created/in_anki/learning/known/suspended.
  var LIFECYCLE = {
    created: ["room.morph.life.created", "в моих словах"],
    in_anki: ["room.morph.life.inAnki", "в Anki"],
    learning: ["room.morph.life.learning", "учу"],
    known: ["room.morph.life.known", "знаю"],
    suspended: ["room.morph.life.suspended", "пауза"],
  };
  // Epic-3a — root-family chip status colour (mirrors the in-text word-status palette).
  var FAM_STATE = { known: "rm-fam-known", learning: "rm-fam-learning", weak: "rm-fam-learning", stale: "rm-fam-learning", "new": "rm-fam-new", l1: "rm-fam-l1", l2: "rm-fam-l2", l3: "rm-fam-l3", l4: "rm-fam-l4", ignore: "rm-fam-ignore" };
  // Epic 4 — manual status one-tap level selector (LingQ-style new/1-4/known/ignore).
  var STATUS_OPTS = [
    ["new", ["room.morph.status.new", "новое"]], ["l1", ["room.morph.status.l1", "незнакомо"]], ["l2", ["room.morph.status.l2", "узнаю"]],
    ["l3", ["room.morph.status.l3", "вспоминаю"]], ["l4", ["room.morph.status.l4", "почти знаю"]],
    ["known", ["room.morph.status.known", "знаю"]], ["ignore", ["room.morph.status.ignore", "не учить"]],
  ];
  var _activeCard = null, _activeOcc = null, _activeNoteInfo = null, _attachOpts = {};
  var _learningState = null, _cardRequestEpoch = 0;
  var _learningWrites = new WeakSet();
  function learningView(card) {
    var state = _learningState;
    var target = state && state.card === card && state.targets.find(function (t) { return t.key === state.selected; });
    return target ? Object.assign({},card,{lemmaKey:target.key,parentLemmaKey:card.lemmaKey,learningTarget:target,
      meaning:target.meaning,word:target.word,niqqud:target.niqqud,manualStatus:target.manualStatus,srsRow:target.srsRow}) : card;
  }
  function learningControlsHtml(card) {
    var state = _learningState;
    if (!state || state.card !== card || !state.targets.length || typeof _attachOpts.enrollLearningTarget !== 'function') return '';
    var enrolled = state.targets.filter(function (t) { return t.enrolled; });
    if (!enrolled.length) return '';
    var tabs = '<button type="button" data-rm-target="word" aria-pressed="' + (!state.selected) + '">' + escapeHtml(tt('learningTarget.word','Слово')) + '</button>';
    tabs += enrolled.map(function (t) {
      var label = tt('learningTarget.form','Эта форма') + (enrolled.length > 1 ? ' · ' + t.grammar : '');
      if (t.srsRow && t.srsRow.due <= Date.now()) label += ' ↻';
      return '<button type="button" data-rm-target="' + escapeHtml(t.key) + '" aria-pressed="' + (state.selected === t.key) + '">' + escapeHtml(label) + '</button>';
    }).join('');
    return '<div class="rm-target-tabs" role="group" dir="' + uiDir() + '" aria-label="' + escapeHtml(tt('learningTarget.choose','Учебная цель')) + '">' + tabs + '</div>';
  }
  function learnFormHtml(card) {
    var state = _learningState;
    if (!state || state.card !== card || typeof _attachOpts.enrollLearningTarget !== 'function') return '';
    var targets = state.targets.filter(function (t) { return !t.enrolled; });
    if (!targets.length) return '';
    var button = function (t) {
      return '<button type="button" class="rm-learn-form" data-rm-enroll="' + escapeHtml(t.key) + '">' +
        escapeHtml(targets.length === 1 && state.targets.length === 1 ? tt('learningTarget.learn','Учить эту форму') : t.grammar + ' — ' + t.meaning) + '</button>';
    };
    if (state.targets.length === 1) return button(targets[0]);
    return '<details class="rm-target-choices"><summary>' + escapeHtml(tt('learningTarget.chooseReading','Выбрать форму для изучения')) + '</summary><div>' + targets.map(button).join('') + '</div></details>';
  }
  function learningError(error) {
    var status = _sheet && _sheet.querySelector('[data-rm-target-error]');
    if (status) { status.hidden = false; status.textContent = tt('learningTarget.saveFailed','Не удалось сохранить. Попробуйте ещё раз.'); }
    try { console.warn('[learning-target]',error && error.message || error); } catch (_) {}
  }
  async function enrollLearningTarget(key) {
    var card = _activeCard, state = _learningState, occ = _activeOcc, host = _attachOpts;
    if (!card || !state || state.card !== card || _learningWrites.has(card) || typeof host.enrollLearningTarget !== 'function') return;
    var target = state.targets.find(function (t) { return t.key === key; });
    if (!target || target.enrolled) return;
    _learningWrites.add(card);
    var buttons = _sheet.querySelectorAll('[data-rm-enroll],[data-rm-status],[data-rm-target],[data-rm-practice-target]'); buttons.forEach(function (b) { b.disabled = true; });
    try {
      var result = await host.enrollLearningTarget(card,key,occ);
      if (!result) throw new Error('LEARNING_TARGET_SAVE_FAILED');
      target.enrolled = true; target.manualStatus = result.status || 'new';
      if (_activeCard !== card || _learningState !== state || _attachOpts !== host || !_sheet.classList.contains('rm-open')) return;
      state.selected = key; _markConfirm = null; openCard(card,occ);
    } catch (error) { if (_activeCard === card && _learningState === state) learningError(error); }
    finally { _learningWrites.delete(card); buttons.forEach(function (b) { b.disabled = false; }); }
  }
  function selectLearningTarget(key) {
    var state = _learningState;
    if (!state || state.card !== _activeCard || _learningWrites.has(_activeCard)) return;
    if (key !== 'word' && !state.targets.some(function (t) { return t.key === key && t.enrolled; })) return;
    state.selected = key === 'word' ? null : key; _markConfirm = null; _recallCtx = null;
    openCard(_activeCard,_activeOcc);
  }
  var _cardInteractionEpoch = 0;
  // Epic-2 #2 — context needed to RE-resolve the active word with Tier-3 (per-card refine):
  // the stripped surface, its niqqud, and the sentence to send to Dicta. null on root-family
  // chip cards (no sentence) so the refine button never offers an outbound it can't make.
  var _activeWordCtx = null;
  // Root-family drill back-stack — tapping a «Слова от этого корня» chip pushes the current card
  // here, so «‹ Назад» can step back sequentially through however many drills (instead of forcing
  // the user to close + re-tap). Reset on a fresh word tap (onActivate) and on close.
  var _cardStack = [];
  var _cardReturnFocus = null;   // Epic 8b — element to restore focus to when the card closes (WCAG 2.4.3)
  // Retention P5 (recon §6.2, B7) — reveal-then-grade state for a tapped DUE word:
  // { card, prev (extended schedule row), revealed, graded }. Null = normal card. Keyed by card
  // REFERENCE so a root-family drill renders its own normal card and «‹ Назад» resumes the recall.
  var _recallCtx = null;
  // Retention P5.7 (owner 2026-07-02, Т1) — transient in-card CLOSURE after a level mark:
  // { lemmaKey, dueMs, firstTime }. Renders the «✓ В повторении · вернётся завтра» confirmation
  // (+ a one-time visual-language explainer) so the user SEES that the mark scheduled the word.
  // Cleared on every fresh open / close — never persists across words.
  var _markConfirm = null;

  // R11a: line icons from the shared sprite instead of 🔊 / 🤖 (same-origin, precached).
  var ICON_AUDIO = '<svg class="lp-icon" aria-hidden="true" focusable="false"><use href="/icons/linguistpro-ui.svg#lp-icon-audio"></use></svg>';
  var ICON_MENTOR = '<svg class="lp-icon" aria-hidden="true" focusable="false"><use href="/icons/linguistpro-ui.svg#lp-mark-mentor"></use></svg>';
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
    // Late automatic context must never replace an editor, learner decision,
    // drill or focus target that the learner has already engaged with.
    ["pointerdown", "click", "keydown", "input", "wheel", "touchstart"].forEach(function (type) {
      el.addEventListener(type, function () { _cardInteractionEpoch++; }, true);
    });
    el.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("[data-rm-close]")) { closeSheet(); return; }
      if (t && t.closest && t.closest("[data-rm-back]")) { onCardBack(); return; }
      if (t && t.closest && t.closest("[data-rm-recall-reveal]")) { onRecallReveal(); return; }
      var gbtn = t && t.closest ? t.closest("[data-rm-recall-grade]") : null;
      if (gbtn) { onRecallGrade(gbtn.getAttribute("data-rm-recall-grade")); return; }
      var sbtn = t && t.closest ? t.closest("[data-rm-status]") : null;
      if (sbtn) { onStatusSet(sbtn.getAttribute("data-rm-status")); return; }
      var targetBtn = t && t.closest ? t.closest('[data-rm-target]') : null;
      if (targetBtn) { selectLearningTarget(targetBtn.getAttribute('data-rm-target')); return; }
      var enrollBtn = t && t.closest ? t.closest('[data-rm-enroll]') : null;
      if (enrollBtn) { enrollLearningTarget(enrollBtn.getAttribute('data-rm-enroll')); return; }
      if (t && t.closest && t.closest('[data-rm-practice-target]')) {
        var view = learningView(_activeCard);
        if (view && view.learningTarget && typeof _attachOpts.practiceLearningTarget === 'function') {
          var practice = _attachOpts.practiceLearningTarget, targetKey = view.lemmaKey;
          closeSheet(); practice(targetKey);
        }
        return;
      }
      var candidateBtn = t && t.closest ? t.closest("[data-rm-candidate]") : null;
      if (candidateBtn) { previewAnalysis(candidateBtn); return; }
      if (t && t.closest && t.closest('[data-rm-analysis-name]')) { saveAnalysis(false, 'name'); return; }
      if (t && t.closest && t.closest('[data-rm-analysis-undo]')) { saveAnalysis(false, 'undo'); return; }
      if (t && t.closest && t.closest("[data-rm-analysis-save]")) { saveAnalysis(false); return; }
      if (t && t.closest && t.closest("[data-rm-analysis-clear]")) { saveAnalysis(true); return; }
      if (t && t.closest && t.closest("[data-rm-speak]")) { onSpeak(); return; }
      if (t && t.closest && t.closest("[data-rm-explain]")) { onExplainWord(); return; }   // PAS-A4
      if (t && t.closest && t.closest("[data-rm-legend]")) { onLegendToggle(); return; }
      if (t && t.closest && t.closest("[data-rm-refine-go]")) { onRefine(false); return; }
      if (t && t.closest && t.closest("[data-rm-refine-all]")) { onRefine(true); return; }
      if (t && t.closest && t.closest("[data-rm-refine]")) { onRefinePrompt(); return; }
      if (t && t.closest && t.closest("[data-rm-ai-save]")) { onAiSave(false); return; }
      if (t && t.closest && t.closest("[data-rm-ai-revert]")) { onAiSave(true); return; }
      if (t && t.closest && t.closest("[data-rm-ai-cancel]")) { onAiEditToggle(false); return; }
      if (t && t.closest && t.closest("[data-rm-name-propose]")) { var box = _sheet.querySelector("[data-rm-name-confirm]"); if (box) box.hidden = false; return; }
      if (t && t.closest && t.closest("[data-rm-name-save]")) { onConfirmName(t.closest("[data-rm-name-save]")); return; }
      if (t && t.closest && t.closest("[data-rm-ai-edit]")) { onAiEditToggle(true); return; }
      if (t && t.closest && t.closest("[data-rm-meaning-save]")) { onMeaningSave(); return; }
      if (t && t.closest && t.closest("[data-rm-meaning-cancel]")) { onMeaningEditToggle(false); return; }
      if (t && t.closest && (t.closest("[data-rm-meaning-add]") || t.closest("[data-rm-meaning-edit]"))) { onMeaningEditToggle(true); return; }
      if (t && t.closest && t.closest("[data-rm-note-save]")) { onNoteEditorSave(); return; }
      if (t && t.closest && t.closest("[data-rm-note-cancel]")) { onNoteEditorToggle(false); return; }
      if (t && t.closest && t.closest(".rm-save")) { onSaveClick(); return; }
      var pchip = t && t.closest ? t.closest("[data-rm-proc]") : null;
      if (pchip) { onProcliticChip(pchip.getAttribute("data-rm-proc")); return; }
      var chip = t && t.closest ? t.closest(".rm-rootfam-chip") : null;
      if (chip) { onChipClick(chip); return; }
      // conjugation cells voice themselves via inline onclick → window.v3ConjSpeak.
    });
    // T-b — Enter inside the translation input saves; Esc cancels (mobile-keyboard friendly).
    el.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("[data-rm-ai-input]")) {
        if (e.key === "Enter") { e.preventDefault(); onAiSave(false); }
        else if (e.key === "Escape") { e.preventDefault(); onAiEditToggle(false); }
        return;
      }
      if (!(t && t.closest && t.closest("[data-rm-meaning-input]"))) return;
      if (e.key === "Enter") { e.preventDefault(); onMeaningSave(); }
      else if (e.key === "Escape") { e.preventDefault(); onMeaningEditToggle(false); }
    });
    _sheet = el;
    return el;
  }

  function closeSheet() {
    _cardRequestEpoch++;
    if (_sheet) { _sheet.hidden = true; _sheet.classList.remove("rm-open"); }
    if (_activeSpan) { _activeSpan.classList.remove("rm-w-active"); _activeSpan = null; }
    _cardStack = [];   // drilling history dies with the sheet
    // P5 — closing without a grade writes NOTHING (recon §6.2: abandonment was already tallied at
    // reveal via noteRecallShown; the missing grade is the MNAR signal, never a fabricated row).
    _recallCtx = null;
    _learningState = null;
    _activeWordCtx = null;
    _markConfirm = null;   // P5.7 — the mark confirmation is transient to this word/session
    try { if (_cardReturnFocus && _cardReturnFocus.focus) _cardReturnFocus.focus(); } catch (_) {}   // WCAG 2.4.3 — restore focus
    _cardReturnFocus = null;
  }
  function isSheetOpen() { return !!(_sheet && !_sheet.hidden && _sheet.classList.contains("rm-open")); }
  // Root-family «‹ Назад» — pop the previous card and re-render it (sequential, multi-level).
  function onCardBack() {
    var prev = _cardStack.pop();
    if (prev) openCard(prev.card, prev.occ);
  }

  // Retention P5.6 R-3 — quiet schedule-provenance line (R9: the ring's WHY must be inspectable).
  // A scheduled word says when it returns; an engaged-but-unscheduled word (e.g. a legacy manual
  // «знаю» from before R-2 seeding) honestly says it is not scheduled yet. Untracked words show
  // nothing (no noise). card.srsRow is attached by the tap/openWordCard glue (getDueSchedule).
  function srsLineHtml(card) {
    card = learningView(card);
    if (!card || !card.lemmaKey) return "";
    var row = card.srsRow;
    if (row && row.due) {
      var dueMs = Number(row.due) || 0;
      var txt = dueMs <= Date.now()
        ? tt("room.morph.srs.dueNow", "🔁 Повтор: сегодня")
        : tt("room.morph.srs.dueIn", "🔁 Повтор: через ~{n} дн.").replace("{n}", String(Math.max(1, Math.ceil((dueMs - Date.now()) / 86400000))));
      return '<div class="rm-srs-line" dir="' + uiDir() + '">' + escapeHtml(txt) + "</div>";
    }
    if (card.manualStatus && card.manualStatus !== "ignore" && card.manualStatus !== "new") {
      return '<div class="rm-srs-line rm-srs-none" dir="' + uiDir() + '">' + escapeHtml(tt("room.morph.srs.none", "Пока не в расписании повторов")) + "</div>";
    }
    return "";
  }

  // Epic 4 — one-tap manual status selector (new/1/2/3/4/known/ignore). Shown when a setWordStatus
  // handler is wired + we have a canonical lemmaKey. The active value is highlighted; re-tapping it
  // clears to «new». LingQ-style: known→clears the highlight, ignore→excluded from i+1.
  function statusText(status) { var entry = STATUS_OPTS.find(function (o) { return o[0] === status; }); return entry ? tt(entry[1][0], entry[1][1]) : status; }
  function posText(pos) { var entry = POS_TEXT[pos]; return entry ? tt(entry[0], entry[1]) : (pos || ""); }
  function analysisChoicesHtml(card) {
    if (!_activeOcc || !_activeOcc.sentence_id || typeof _attachOpts.confirmOccurrenceAnalysis !== "function") return "";
    var candidates = card.analysisCandidates || [];
    var reviewed = card.meaningSource === "owner" || card.meaningSource === "teacher";
    var html = '<details class="rm-analysis-choices" dir="' + uiDir() + '"' + (card.selectionRequired || card.resolutionState === 'stale' ? ' open' : '') + '><summary>' + escapeHtml(tt('analysis.refine', 'Исправить разбор в этой строке')) + '</summary><div class="rm-analysis-editor">';
    if (card.resolutionState === 'stale') html += '<p class="rm-analysis-notice">' + escapeHtml(tt("analysis.stale", "Сохранённый выбор устарел: текст или варианты изменились. Проверьте значение снова.")) + '</p>';
    if (candidates.length) html += '<h3>' + escapeHtml(candidates.length > 1 ? tt('analysis.variants', 'Варианты разбора') : tt('analysis.single', 'Найденный разбор')) + '</h3>';
    if (candidates.length) html += '<div class="rm-analysis-options" role="group" aria-label="' + escapeHtml(tt("analysis.variants", "Варианты разбора")) + '">';
    candidates.forEach(function (a) {
      var selected = reviewed && a.pealim_id === String(card.pealim_id || "");
      var p = _eng && _eng.pidMap.get(a.pealim_id), WG = wordGlossApi(), fg = null;
      if (WG && p) try { fg = WG.composeGloss({word:card.word,niqqud:card.niqqud,paradigm:p,meaning:a.meaning_ru,pos:a.lp_pos,label:'exact'}, card.niqqud); } catch (_) {}
      var matched = WG && p && WG.matchCell(p, card.niqqud), grammar = matched && !matched.impossible ? WG.slotsHint(matched.slots) : '';
      html += '<div class="rm-analysis-option"><button type="button" data-rm-candidate="' + escapeHtml(a.pealim_id) + '" aria-pressed="' + selected + '">' +
        '<span class="rm-candidate-form"><bdi lang="he" dir="rtl">' + escapeHtml(card.niqqud || card.word) + '</bdi>' + (fg && fg.form ? ' — ' + escapeHtml(fg.text) : '') + '</span>' +
        (grammar && (!fg || fg.text.indexOf(grammar) < 0) ? '<span class="rm-candidate-grammar">' + escapeHtml(grammar) + '</span>' : '') +
        '<span class="rm-candidate-lemma">' + escapeHtml(tt('analysis.lemma', 'Словарная форма')) + ': <bdi lang="he" dir="rtl">' + escapeHtml(a.lemma) + '</bdi> — ' + escapeHtml(a.meaning_ru || tt("analysis.noMeaning", "значение не указано")) +
        ' · ' + escapeHtml(posText(a.lp_pos)) + '</span></button><a target="_blank" rel="noopener noreferrer" href="https://www.pealim.com/ru/dict/' + encodeURIComponent(a.pealim_id) + '/">Pealim ↗</a></div>';
    });
    if (candidates.length) html += '</div>';
    html += '<p data-rm-analysis-preview role="status">' + escapeHtml(card.selectionRequired ? tt('analysis.choose', 'Выберите разбор для этой строки') : '') + '</p>' +
      '<button type="button" class="rm-analysis-save" data-rm-analysis-save hidden disabled>' + escapeHtml(tt('analysis.useHere', 'Сохранить разбор для этой строки')) + '</button>';
    if (!(reviewed && card.pos === 'propernoun')) html += '<div class="rm-analysis-correction"><button type="button" data-rm-analysis-name>' + escapeHtml(tt('analysis.nameHere', 'Здесь это имя собственное')) + '</button></div>';
    if (reviewed) html += '<button type="button" data-rm-analysis-clear>' + escapeHtml(tt("analysis.clear", "Сбросить мой выбор")) + '</button>';
    return html + '</div></details>';
  }
  function previewAnalysis(button) {
    if (!_activeCard || !_sheet) return;
    _sheet.querySelectorAll('[data-rm-candidate]').forEach(function (b) { b.setAttribute('aria-pressed', b === button ? 'true' : 'false'); });
    var save = _sheet.querySelector('[data-rm-analysis-save]');
    if (save) { save.hidden = false; save.disabled = false; save.dataset.choice = button.getAttribute('data-rm-candidate'); }
    var preview = _sheet.querySelector('[data-rm-analysis-preview]');
    if (preview) preview.textContent = tt("analysis.preview", "Предварительный выбор") + ': ' + (button.innerText || button.textContent).trim();
  }
  var analysisWrites = new WeakSet();
  async function saveAnalysis(clear, directChoice) {
    var card = _activeCard, occ = _activeOcc, span = _activeSpan, host = _attachOpts;
    if (!card || !occ || analysisWrites.has(card) || typeof host.confirmOccurrenceAnalysis !== "function") return;
    var save = _sheet.querySelector('[data-rm-analysis-save]'), choice = directChoice || (save && save.dataset.choice);
    if (!clear && !choice) return;
    analysisWrites.add(card);
    var current = function () { return _activeCard === card && _activeOcc === occ && _activeSpan === span && _attachOpts === host; };
    var controls = Array.from(_sheet.querySelectorAll('.rm-analysis-choices button, [data-rm-analysis-undo]'));
    controls.forEach(function (b) { b.disabled = true; });
    try {
      var Core = window.LexicalResolutionCore;
      var fingerprint = await Core.candidateFingerprint({alternatives:card.analysisCandidates || []});
      // Classification alone never asserts the old dictionary/AI meaning.
      var selection = clear ? {clear:true} : choice === 'name' ? {name:true} : choice === 'undo' ? {undo:card.resolutionEventId} : {pealim_id:choice};
      var projection = await host.confirmOccurrenceAnalysis(occ, selection, {fingerprint:fingerprint,isCurrent:current});
      if (!current()) return;
      var eng = await ensureEngine(), next;
      if (projection.state !== 'resolved') {
        await ensurePlaces([occ.sentence_id]);
        next = await resolveWordLight(occ.surface, occ.niqqud, null, {sid:occ.sentence_id,off:occ.word_offset});
      } else next = applyLexicalResolution(card, projection);
      next.lemmaKey = statusKeyForCard(eng.NA, next, occ.niqqud, occ.surface);
      next.manualStatus = typeof host.getWordStatus === 'function' ? await host.getWordStatus(next.lemmaKey) || '' : '';
      var schedules = typeof host.getDueSchedule === 'function' ? await host.getDueSchedule() || {} : {};
      next.srsRow = schedules[next.lemmaKey] || null;
      var par = next.pealim_id && eng.pidMap.get(String(next.pealim_id));
      if (par && par.pos === next.pos) next.paradigm = par;
      await loadLearningTargets(next);
      if (!current()) return;
      _recallCtx = null; _markConfirm = null;
      openCard(next, occ);
      var focusTarget = _sheet.querySelector('.rm-analysis-reviewed, .rm-current-reading');
      if (focusTarget) { focusTarget.tabIndex = -1; focusTarget.focus(); }
    } catch (_) {
      if (current()) {
        try { console.warn('[lexical-choice]', _.message || String(_)); } catch (_) {}
        var preview = _sheet.querySelector('[data-rm-analysis-preview]');
        if (preview) preview.textContent = /LEXICAL_(SOURCE|CANDIDATE|DECISION)/.test(_.message || '') ? tt("analysis.changed", "Не удалось сохранить выбор. Откройте слово снова и проверьте актуальные варианты.") : tt('analysis.saveFailed', 'Не удалось сохранить. Повторите попытку.');
        var editor = _sheet.querySelector('.rm-analysis-choices'); if (editor) editor.open = true;
        controls.forEach(function (b) { b.disabled = false; });
      }
    } finally { analysisWrites.delete(card); }
  }
  function statusSelectorHtml(card) {
    var base = card, controls = learningControlsHtml(base);
    card = learningView(card);
    var target = [card.learningTarget ? card.niqqud || card.word : card.lemma || card.word, card.meaning, card.learningTarget ? card.learningTarget.grammar : posText(card.pos)].filter(Boolean).join(" — ");
    var title = card.learningTarget ? tt('learningTarget.formStatus','Мой статус формы') : tt('learningTarget.wordStatus','Мой статус слова');
    var scope = controls + '<p class="rm-status-target" data-rm-status-key="' + escapeHtml(card.lemmaKey || '') + '" dir="' + uiDir() + '">' + escapeHtml(title + ": " + target) + '</p>';
    if (card.selectionRequired) return scope + '<p class="rm-analysis-notice" dir="' + uiDir() + '">' +
      escapeHtml(tt("analysis.chooseBeforeStatus", "Выберите значение для этой строки перед отметкой знания")) +
      (card.manualStatus ? ' · ' + escapeHtml(tt("analysis.previousMark", "Ранее сохранённая отметка этого разбора") + ": " + statusText(card.manualStatus)) : '') + '</p>';
    if (!card || !card.lemmaKey || typeof _attachOpts.setWordStatus !== "function") return "";
    // Highlight the EFFECTIVE status: an explicit manual status, else «new» ONLY for a confident
    // word (which auto-shows the purple «new wall»); an unconfident word with no status highlights
    // nothing (it's plain until the user marks it), so the toggle reads honestly.
    var cur = card.manualStatus || ((card.label === "exact" || card.label === "likely") ? "new" : "");
    var btns = STATUS_OPTS.map(function (o) {
      var val = o[0];
      var lab = o[1] ? escapeHtml(tt(o[1][0], o[1][1])) : escapeHtml(val);
      return '<button type="button" class="rm-status-btn rm-status-' + val + (cur === val ? " rm-status-active" : "") + '" data-rm-status="' + val + '">' + lab + "</button>";
    }).join("");
    var practice = card.learningTarget && typeof _attachOpts.practiceLearningTarget === 'function'
      ? '<button type="button" class="rm-learn-form" data-rm-practice-target>' + escapeHtml(tt('learningTarget.practice','Потренировать эту форму')) + '</button>' : '';
    return scope + '<div class="rm-status" dir="' + uiDir() + '"><span class="rm-status-k">' + escapeHtml(tt("room.morph.status.title", "Мой статус")) + ":</span>" + btns + "</div>" + practice +
      '<p data-rm-target-error role="status" hidden></p>';
  }
  async function onStatusSet(value) {
    if (!_activeCard || _activeCard.selectionRequired || !_activeCard.lemmaKey || typeof _attachOpts.setWordStatus !== "function") return;
    // Toggle on the ACTUAL stored status (not «new», which is now a real storable status): re-tap
    // the stored value → clear; otherwise store the tapped value (incl. «new» → purple).
    var card = _activeCard, view = learningView(card), state = _learningState, selected = state && state.selected, host = _attachOpts, occ = _activeOcc;
    if (_learningWrites.has(card)) return;
    _learningWrites.add(card);
    var pendingButtons = _sheet.querySelectorAll('[data-rm-status],[data-rm-target]');
    pendingButtons.forEach(function (b) { b.disabled = true; });
    var st = (view.manualStatus === value) ? "" : value;
    _markConfirm = null;
    // setWordStatus returns {dueMs} when the mark SCHEDULED the word (l1–l4 seed, recon P5.6) —
    // independent of the 🎨 axis, so the closure shows even with colouring off.
    // R1 source-at-mark: pass the tap occurrence as an ADDITIVE 3rd arg — hosts that don't
    // take it (Studio wires no setWordStatus at all) are untouched; the Зал host persists a source.
    var res = null;
    try {
      res = await host.setWordStatus(view.lemmaKey,st,occ);
      if (view.learningTarget && !res) throw new Error('LEARNING_TARGET_SAVE_FAILED');
    } catch (error) { if (_activeCard === card) learningError(error); return; }
    finally { _learningWrites.delete(card); pendingButtons.forEach(function (b) { b.disabled = false; }); }
    if (view.learningTarget) view.learningTarget.manualStatus = st;
    else card.manualStatus = st;
    if (_activeCard !== card || _attachOpts !== host || _learningState !== state || (state && state.selected !== selected)) return;
    // P5.7 Т1 — a level mark scheduled the word → re-render with the in-card closure (confirmation +
    // live schedule line + a one-time «what the colours/ring mean» explainer) + pulse the word.
    if (/^l[1-4]$/.test(st) && res && res.dueMs) {
      if (view.learningTarget) view.learningTarget.srsRow = { due: res.dueMs, scheme: 'fsrs' };
      else card.srsRow = { due: res.dueMs, scheme: "fsrs" };
      var first = false;
      try { first = (typeof localStorage !== "undefined") && localStorage.getItem("room.loopCoach.seen") !== "1"; } catch (_) {}
      _markConfirm = { lemmaKey: view.lemmaKey, dueMs: res.dueMs, firstTime: first };
      if (first) { try { localStorage.setItem("room.loopCoach.seen", "1"); } catch (_) {} }
      if (_activeSpan) { var sp = _activeSpan; try { sp.classList.add("rm-w-pulse"); setTimeout(function () { try { sp.classList.remove("rm-w-pulse"); } catch (_) {} }, 1000); } catch (_) {} }
      openCard(_activeCard, _activeOcc);
      return;
    }
    var isConf = _activeCard.label === "exact" || _activeCard.label === "likely";
    var active = st || (isConf ? "new" : "");
    var sel = _sheet && _sheet.querySelectorAll(".rm-status-btn");
    if (sel) for (var i = 0; i < sel.length; i++) sel[i].classList.toggle("rm-status-active", sel[i].getAttribute("data-rm-status") === active);
  }
  // P5.7 Т1 — the in-card closure banner (rendered in place of the passive srsLine right after a
  // mark). «✓ В повторении · вернётся завтра» + one-time explainer teaching the visual language
  // (colour = tracked, ring = due). firstTime is decided ONCE (localStorage) at mark time.
  function markConfirmHtml(card) {
    card = learningView(card);
    var mc = _markConfirm;
    if (!mc || !card || card.lemmaKey !== mc.lemmaKey) return "";
    var when = mc.dueMs
      ? (mc.dueMs <= Date.now()
          ? tt("room.morph.mark.returnsToday", "вернётся сегодня")
          : tt("room.morph.mark.returnsIn", "вернётся через ~{n} дн.").replace("{n}", String(Math.max(1, Math.ceil((mc.dueMs - Date.now()) / 86400000)))))
      : "";
    var head = '<div class="rm-markok-head">' + escapeHtml(tt("room.morph.mark.scheduled", "✓ В повторении")) + (when ? " · " + escapeHtml(when) : "") + "</div>";
    var explain = mc.firstTime
      ? '<div class="rm-markok-explain">' + escapeHtml(tt("room.morph.mark.explain", "Цветные слова — на учёте. Кольцо появится у слова, когда придёт срок повтора.")) + "</div>"
      : "";
    return '<div class="rm-markok" dir="' + uiDir() + '">' + head + explain + "</div>";
  }

  // Epic 4.2 — in-text quick-status popover (long-press a word → set its level without opening the
  // full card). A floating singleton anchored near the word; reuses STATUS_OPTS + setWordStatus.
  var _statpop = null, _statpopKey = "", _statpopCur = "", _statpopOcc = null;
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
  function openStatPop(span, lemmaKey, cur, isConf, occ) {
    var el = ensureStatPop();
    _statpopKey = lemmaKey;
    _statpopCur = cur || "";   // the ACTUAL stored status — drives the toggle (clear on re-tap)
    _statpopOcc = occ || null; // R1 source-at-mark — the long-press occurrence, forwarded on set
    var active = _statpopCur || (isConf ? "new" : "");   // effective highlight (confident default = new)
    var btns = STATUS_OPTS.map(function (o) {
      var val = o[0], lab = o[1] ? escapeHtml(tt(o[1][0], o[1][1])) : escapeHtml(val);
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
    try { await _attachOpts.setWordStatus(_statpopKey, st, _statpopOcc); } catch (_) {}
    closeStatPop();
  }
  function closeStatPop() { if (_statpop) _statpop.hidden = true; _statpopKey = ""; _statpopCur = ""; _statpopOcc = null; }
  // Resolve the long-pressed word → lemmaKey + current status → show the popover. Falls back to the
  // full card when the word can't be confidently keyed (so a long-press is never a dead end).
  async function showStatusPopover(span, occ) {
    if (typeof _attachOpts.setWordStatus !== "function") return false;
    try { window.getSelection().removeAllRanges(); } catch (_) {}
    var surface = span.getAttribute("data-surface") || span.textContent || "";
    var niqqud = span.getAttribute("data-niqqud") || "";
    var lk = "", cur = "", isConf = false;
    try {
      var eng = await ensureEngine();
      var place = placeOfSpan(span);
      if (place) await ensurePlaces([place.sid]);
      var card = await resolveCore(eng, surface, niqqud, place ? {place:place} : undefined);
      if (card.selectionRequired) return false;
      // Key IDENTICALLY to the card (resolveWordLight) + decorateWords via the shared keyer, so a
      // long-press status lands on the same key the paint looks up.
      lk = statusKeyForCard(eng.NA, card, niqqud, stripNiqqud(niqqud) || surface);
      isConf = card.label === "exact" || card.label === "likely";
    } catch (_) { lk = ""; }
    if (!lk) return false;   // caller falls back to opening the card
    if (typeof _attachOpts.getWordStatus === "function") { try { cur = (await _attachOpts.getWordStatus(lk)) || ""; } catch (_) {} }
    openStatPop(span, lk, cur, isConf, occ);
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

  // PAS-A4 — «🤖 Объяснить (наставник)»: LLM-объяснение слова В ЭТОМ предложении.
  // Отличается от «Уточнить чтение» (Dicta = машинное уточнение чтения): здесь платный
  // наставник-вызов, поэтому явная кнопка + свой in-flight guard. Ответ — СТРОГО
  // textContent; displayed-чтение карточки уходит на сервер как основной факт (спека v2).
  var _explainWordBusy = false;
  function explainWordHtml() {
    if (typeof _attachOpts.explainWord !== "function" || !_activeWordCtx || _activeWordCtx.orderIndex == null) return "";
    return '<div class="rm-explain"><button type="button" class="rm-explain-btn" data-rm-explain aria-expanded="false">' + ICON_MENTOR + ' ' +
      escapeHtml(tt("room.morph.explainWord", "Объяснить (наставник)")) + "</button>" +
      '<div class="rm-explain-out" data-rm-explain-out hidden></div></div>';
  }
  async function onExplainWord() {
    if (_explainWordBusy || typeof _attachOpts.explainWord !== "function" || !_activeWordCtx) return;
    var out = _sheet && _sheet.querySelector("[data-rm-explain-out]");
    var btn = _sheet && _sheet.querySelector("[data-rm-explain]");
    if (!out) return;
    _explainWordBusy = true;
    if (btn) { btn.disabled = true; btn.setAttribute("aria-expanded", "true"); }
    out.hidden = false; out.textContent = tt("room.explain.loading", "Наставник думает…");
    var card = _activeCard || {};
    var payload = {
      surface: _activeWordCtx.surface,
      orderIndex: _activeWordCtx.orderIndex,
      displayed: {
        lemma: card.lemma || null, root: card.root || null, binyan: card.binyan || null,
        pos: card.contextPos || card.pos || null, meaning: card.meaning || null,
        provenance: card.contextPos ? "dicta-context" : "offline",
      },
    };
    var r = null;
    try { r = await _attachOpts.explainWord(payload); } catch (_) { r = null; }
    _explainWordBusy = false;
    if (btn) btn.disabled = false;
    if (!r || !r.ok) { out.textContent = (r && r.message) || tt("room.explain.err", "Не удалось получить объяснение"); return; }
    out.textContent = r.text || "";
    if (r.meta) {
      var m = document.createElement("div");
      m.className = "rm-explain-meta";
      m.textContent = r.meta;
      out.appendChild(m);
    }
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
    if (_activeCard && (_activeCard.meaningSource === "owner" || _activeCard.meaningSource === "teacher")) return;
    if (grantAll && typeof _attachOpts.grantContextConsent === "function") { try { _attachOpts.grantContextConsent(); } catch (_) {} }
    var box = _sheet && _sheet.querySelector(".rm-refine");
    if (box) box.innerHTML = '<div class="rm-refine-busy">' + escapeHtml(tt("room.morph.refining", "Уточняю в контексте…")) + "</div>";
    var wc = _activeWordCtx, before = _activeCard;
    var ctx = null;
    try { ctx = await _attachOpts.refineContext(wc.sentence, wc.surface); } catch (_) { ctx = null; }
    try {
      if (_activeWordCtx !== wc || _activeCard !== before) return;
      var card = await resolveWordLight(wc.surface, wc.niqqud, ctx, placeOfSpan(_activeSpan));
      await loadLearningTargets(card);
      if (card) { card.refineTried = true; if (_activeWordCtx === wc && _activeCard === before) openCard(card, _activeOcc); }
    } catch (_) { /* keep the (now busy-cleared) card; a re-tap retries */ }
  }

  // Epic-3b — curated «Употребление» (function-word usage) section. Shown only when the
  // honesty gate attached card.usage (a confident closed-class reading with a curated entry).
  // Every field self-hides when absent (R9). A "HE — RU" string is split so the Hebrew part
  // renders RTL and the gloss LTR; examples sit in a collapsible <details>.
  function usageHtml(card) {
    var u = card && card.usage;
    if (!u) return "";
    var dir = uiDir();
    var out = '<div class="rm-usage" dir="' + dir + '">';
    out += '<div class="rm-usage-title">' + escapeHtml(tt("room.morph.usage.title", "Употребление")) + "</div>";
    if (u.role) out += '<div class="rm-usage-role">' + escapeHtml(u.role) + "</div>";
    var row = function (k, v) {
      if (!v) return "";
      return '<div class="rm-usage-row"><span class="rm-usage-k">' + escapeHtml(k) + ":</span> <span class=\"rm-usage-v\">" + escapeHtml(v) + "</span></div>";
    };
    out += row(tt("room.morph.usage.governs", "управляет"), u.governs);
    // "HE — RU" → chip with RTL Hebrew + LTR gloss (suffix series + collocations).
    var chips = function (label, arr) {
      if (!arr || !arr.length) return "";
      var cs = arr.map(function (s) {
        var parts = String(s).split(" — ");
        var he = parts.shift() || "", ru = parts.join(" — ");
        return '<span class="rm-u-chip"><b dir="rtl" lang="he">' + escapeHtml(he) + "</b>" +
          (ru ? ' <span dir="ltr">' + escapeHtml(ru) + "</span>" : "") + "</span>";
      }).join("");
      return '<div class="rm-usage-chips"><span class="rm-usage-k">' + escapeHtml(label) + ":</span> " + cs + "</div>";
    };
    if (u.suffix_series && u.suffix_series.examples) out += chips(tt("room.morph.usage.suffix", "склонение"), u.suffix_series.examples);
    out += row(tt("room.morph.usage.position", "позиция"), u.position);
    out += chips(tt("room.morph.usage.collocations", "сочетания"), u.collocations);
    if (u.pitfalls) out += '<div class="rm-usage-pit"><span class="rm-usage-k">⚠ ' + escapeHtml(tt("room.morph.usage.pitfalls", "осторожно")) + ":</span> " + escapeHtml(u.pitfalls) + "</div>";
    if (u.register) out += '<div class="rm-usage-reg">' + escapeHtml(tt("room.morph.usage.register", "регистр")) + ": " + escapeHtml(u.register) + "</div>";
    if (u.examples && u.examples.length) {
      out += '<details class="rm-usage-ex"><summary>' + escapeHtml(tt("room.morph.usage.examples", "Примеры")) + "</summary>";
      out += u.examples.map(function (e) {
        return '<div class="rm-usage-exrow"><span class="rm-u-he" dir="rtl" lang="he">' + escapeHtml(e.he || "") + "</span>" +
          (e.ru ? '<span class="rm-u-ru" dir="ltr">' + escapeHtml(e.ru) + "</span>" : "") + "</div>";
      }).join("");
      out += "</details>";
    }
    out += "</div>";
    return out;
  }

  // Phase-3 — the secondary «Приставки» chip-row (morphological SCAFFOLD, never a gloss line and
  // never next to «Употребление», which would read as «the whole word is a function word»). Each
  // chip = the vocalized proclitic + its role, tappable → its own «Употребление» (3b store reuse).
  // R2/R5 value-inverse-to-frequency: a bare high-frequency proclitic (ה/ל/ב/ו) renders compact/
  // muted; the non-obvious minority (fused article · ש-relative · מ · subordinator · multi-clitic)
  // is emphasised. Confidence gate (R1/R11): overlay-confirmed → «Dicta» tint; offline-only →
  // «возможно · уточнить» hedge — NEVER a confident claim on the ~95% offline tier.
  function procliticHtml(card) {
    var p = card && card.proclitics;
    if (!p || !p.hasProclitic || !(p.segments && p.segments.length)) return "";
    var segs = p.segments;
    var trivial = segs.length === 1 && !segs[0].fused && segs[0].kind !== "conj-narrative" &&
      (segs[0].letter === "ה" || segs[0].letter === "ל" || segs[0].letter === "ב" || segs[0].letter === "ו");
    var FU = (typeof window !== "undefined" && window.FunctionUsage) ? window.FunctionUsage : null;
    var chips = segs.map(function (s) {
      var hasUsage = false; try { hasUsage = !!(FU && FU.lookup(s.letter)); } catch (_) {}
      var he = '<b class="rm-proc-he" dir="rtl" lang="he">' + escapeHtml(s.voc || s.letter) + "</b>";
      var role = s.role ? '<span class="rm-proc-role">' + escapeHtml(s.role) + "</span>" : "";
      var flag = s.fused ? '<span class="rm-proc-flag">' + escapeHtml(tt("room.morph.proc.fused", "восстановлен из огласовки")) + "</span>" : "";
      var inner = he + role + flag;
      var cls = "rm-proc-chip" + (s.fused ? " rm-proc-fused" : "");
      return hasUsage
        ? '<button type="button" class="' + cls + '" data-rm-proc="' + escapeHtml(s.letter) + '">' + inner + "</button>"
        : '<span class="' + cls + '">' + inner + "</span>";
    }).join("");
    var title = tt(segs.length > 1 ? "room.morph.proc.titleN" : "room.morph.proc.title", segs.length > 1 ? "Приставки" : "Приставка");
    var cnt = segs.length > 1 ? ' <span class="rm-proc-count">(' + segs.length + ")</span>" : "";
    var prov = p.confident
      ? '<span class="rm-proc-prov rm-proc-conf">' + escapeHtml(tt("room.morph.proc.dicta", "Dicta")) + "</span>"
      : '<span class="rm-proc-prov rm-proc-hedge">' + escapeHtml(tt("room.morph.proc.maybe", "возможно · уточнить")) + "</span>";
    return '<div class="rm-proclitics' + (trivial ? " rm-proc-trivial" : "") + '" dir="' + uiDir() + '">' +
      '<div class="rm-proc-head"><span class="rm-proc-title">' + escapeHtml(title) + cnt + "</span>" + prov + "</div>" +
      '<div class="rm-proc-chips" dir="rtl">' + chips + "</div></div>";
  }

  // ── Word layer Ф3в (docs/planning/word-layer/F3V_CARD_AI_LINE_SPEC_2026_10_12.md) ─────────────────
  // The contextual (AI) gloss belongs to an OCCURRENCE — this word in this row — not to the lemma, so it
  // is read from the tapped span and shown only on that word's own card (never on a drilled card).
  // A correction is locked (WordGlossAI.setOccurrenceGloss) and keeps the AI original for «вернуть».
  function aiOccurrence() {
    var AI = window.WordGlossAI;
    if (!AI || !_activeSpan || _cardStack.length || !_activeSpan.closest) return null;
    var tr = _activeSpan.closest("tr");
    var k = Number(_activeSpan.getAttribute("data-w-offset"));
    if (!tr || !Number.isFinite(k)) return null;
    var x = null; try { x = AI.wordAt(tr, k); } catch (_) { x = null; }
    return x ? { tr: tr, k: k, x: x } : null;
  }
  function aiOccurrenceHtml() {
    var o = aiOccurrence();
    if (!o) return "";
    var x = o.x;
    var key = x.manual ? tt("room.morph.aiInContextFixed", "в контексте (исправлено)") : tt("room.morph.aiInContext", "в контексте (ИИ)");
    var html = '<div class="rm-ai-line' + (x.manual ? " rm-ai-manual" : "") + '" dir="ltr" data-rm-ai-line>' +
      '<span class="rm-alts-k">' + escapeHtml(key) + ":</span> " + '<span class="rm-ai-gloss">' + escapeHtml(x.gloss) + "</span>" +
      ' <button type="button" class="rm-meaning-edit rm-ai-edit" data-rm-ai-edit aria-label="' + escapeHtml(tt("room.morph.aiEdit", "Исправить перевод в контексте")) + '">✎</button>' +
      "</div>";
    if (x.shared) html += '<div class="rm-alts" dir="' + uiDir() + '">' + escapeHtml(tt("contextLayer.shared", "Перевод из общего слоя одинаковых строк; отдельный контекст не подтверждён")) + "</div>";
    if (x.manual && x.aiGloss && x.aiGloss !== x.gloss) html += '<div class="rm-alts" dir="ltr"><span class="rm-alts-k">' + escapeHtml(tt("room.morph.aiWas", "ИИ предлагал")) + ":</span> " + escapeHtml(x.aiGloss) + "</div>";
    if (x.mwe) html += '<div class="rm-alts" dir="ltr"><span class="rm-alts-k">' + escapeHtml(tt("room.morph.aiMwe", "сочетание")) + ":</span> " + escapeHtml(x.mwe) + "</div>";
    if (x.wrongHint) html += '<div class="rm-alts rm-ai-warn" dir="ltr">' + escapeHtml(tt("room.morph.aiWrongHint", "ИИ: словарное значение выше в этой строке, вероятно, не подходит")) + "</div>";
    html += '<div class="rm-meaning-editor" data-rm-ai-editor dir="' + uiDir() + '" hidden>' +
      '<input type="text" class="rm-meaning-input" data-rm-ai-input dir="ltr" maxlength="120" placeholder="' + escapeHtml(tt("room.morph.aiPlaceholder", "перевод слова в этой строке")) + '" value="' + escapeHtml(x.gloss) + '" />' +
      '<button type="button" class="rm-meaning-save" data-rm-ai-save>' + escapeHtml(tt("room.morph.saveMeaning", "Сохранить")) + "</button>" +
      (x.manual ? '<button type="button" class="rm-meaning-cancel" data-rm-ai-revert>' + escapeHtml(tt("room.morph.aiRevert", "Вернуть перевод ИИ")) + "</button>" : "") +
      '<button type="button" class="rm-meaning-cancel" data-rm-ai-cancel>' + escapeHtml(tt("room.morph.cancel", "Отмена")) + "</button>" +
      "</div>";
    return html;
  }
  function onAiEditToggle(open) {
    var ed = _sheet && _sheet.querySelector("[data-rm-ai-editor]");
    if (!ed) return;
    ed.hidden = !open;
    if (open) { var inp = ed.querySelector("[data-rm-ai-input]"); if (inp) { try { inp.focus(); inp.select(); } catch (_) {} } }
  }
  async function onAiSave(revert) {
    var o = aiOccurrence(), AI = window.WordGlossAI;
    if (!o || !AI || !AI.setOccurrenceGloss) return;
    var inp = _sheet && _sheet.querySelector("[data-rm-ai-input]");
    var val = revert ? "" : String(inp ? inp.value : "").trim();
    if (!revert && !val) { if (inp) { try { inp.focus(); } catch (_) {} } return; }
    try { await AI.setOccurrenceGloss(o.tr, o.k, val); } catch (_) { return; }
    // the ribbon re-reads the row; walk up to whichever mount owns it
    try { for (var el = o.tr; el && window.WordGloss && window.WordGloss.refreshRibbon; el = el.parentElement) window.WordGloss.refreshRibbon(el); } catch (_) {}
    if (_activeCard) openCard(_activeCard, _activeOcc);
  }
  async function onConfirmName(button) {
    var o = aiOccurrence(), occ = _activeOcc, span = _activeSpan;
    if (!o || !occ || typeof _attachOpts.confirmOccurrenceName !== "function") return;
    button.disabled = true;
    try {
      var projection = await _attachOpts.confirmOccurrenceName(occ);
      if (_activeSpan !== span || _activeOcc !== occ || !_activeCard) return;
      var next = applyLexicalResolution(_activeCard, projection), eng = await ensureEngine();
      next.lemmaKey = statusKeyForCard(eng.NA, next, occ.niqqud, occ.surface);
      next.manualStatus = "";
      if (next.lemmaKey && typeof _attachOpts.getWordStatus === "function") next.manualStatus = await _attachOpts.getWordStatus(next.lemmaKey) || "";
      if (_activeSpan !== span || _activeOcc !== occ) return;
      openCard(next, occ);
    } catch (_) {
      if (_activeSpan === span) { button.disabled = false; button.textContent = tt("contextLayer.sourceChanged", "Не удалось сохранить. Откройте слово заново."); }
    }
  }
  function renderCardHtml(card) {
    if (!card) return '<div class="rm-card-empty">' + escapeHtml(tt("room.morph.empty", "Слово не распознано.")) + "</div>";
    var label = LABEL_TEXT[card.label] || LABEL_TEXT.unknown;
    // baked context is OFFLINE + precomputed — it must not wear the live-network badge
    // («контекст (Dicta)» implies an outbound call the baked path never makes; §10 R11-F7)
    if (card.label === "context" && card.contextSource === "baked")
      label = ["room.morph.prov.contextBaked", "контекст (офлайн, предвыч.)"];
    var rows = "";
    var add = function (k, v, he) { if (v) rows += '<div class="rm-row"><span class="rm-k">' + escapeHtml(k) + '</span><span class="rm-v"' + (he ? ' lang="he"' : "") + ">" + escapeHtml(v) + "</span></div>"; };
    add(tt("room.morph.root", "корень"), card.root, true);
    if (card.binyan) add(tt("room.morph.binyan", "биньян"), card.binyan, false);
    if (card.pos) { var pt = POS_TEXT[card.pos]; add(tt("room.morph.posLabel", "часть речи"), pt ? tt(pt[0], pt[1]) : card.pos, false); }
    // Epic-3a — pronounce the headword (🔊): GCP-when-keyed → keyless browser. Shown whenever a
    // speak handler is wired (or browser TTS is available); voices the vocalized form.
    var speakBtn = (_attachOpts.speakWord || (typeof window !== "undefined" && window.v3ConjSpeak))
      ? '<button type="button" class="rm-speak" data-rm-speak aria-label="' + escapeHtml(tt("room.morph.pronounce", "Произнести")) + '">' + ICON_AUDIO + '</button>'
      : "";
    var head =
      '<div class="rm-head">' +
      '<span class="rm-word-wrap"><span class="rm-word" lang="he">' + escapeHtml(card.niqqud || card.word) + "</span>" + speakBtn + "</span>" +
      '<span class="rm-badges">' +
      '<span class="rm-prov-line"' + (_activeOcc ? ' hidden' : '') + '>' +
      '<span class="rm-prov rm-prov-' + escapeHtml(card.label) + '">' + escapeHtml(tt(label[0], label[1])) + "</span>" +
      '<button type="button" class="rm-prov-help" data-rm-legend aria-expanded="false" aria-label="' + escapeHtml(tt("room.morph.legend.title", "Что значат бейджи уверенности?")) + '">?</button>' +
      "</span>" +
      '<span class="rm-life" data-rm-life hidden></span>' +
      "</span>" +
      "</div>";
    // Presence of vowel marks cannot identify their author. Read this field's evidence only.
    var provenanceRow = !_cardStack.length && _activeWordCtx ? _activeWordCtx.row : null;
    if (_activeWordCtx && String(card.niqqud || "").normalize("NFC") !== String(_activeWordCtx.niqqud || "").normalize("NFC")) provenanceRow = null;
    var provenance = window.LearningFieldProvenance;
    var sourceLabel = provenance ? provenance.label(provenanceRow, "he_niqqud", tt) : tt("fieldProvenance.unknown", "источник неизвестен");
    var niqMark = (card.niqqud && /[֑-ׇ]/.test(card.niqqud))
      ? '<div class="rm-niqqud-prov" dir="' + uiDir() + '">' + escapeHtml(tt("fieldProvenance.niqqud", "Огласовка") + ": " + sourceLabel) + "</div>"
      : "";
    // Retention P5 (recon §6.2, B7) — «вспомни» pre-reveal: the ANSWER is hidden (gloss, alt
    // glosses, usage, Pealim link, root family — anything that leaks the meaning); only the word,
    // its provenance and the reveal button show. Grade buttons exist ONLY after reveal —
    // grade-before-reveal measures the illusion of knowing (Koriat & Bjork) and was REJECTED.
    // Closing here writes nothing (R4 no-dead-ends: the ✕/backdrop exits are untouched).
    var recall = (_recallCtx && _recallCtx.card === card) ? _recallCtx : null;
    if (recall && !recall.revealed) {
      return head + niqMark + contextPendingHtml(card) +
        '<div class="rm-recall" dir="' + uiDir() + '">' +
        '<div class="rm-recall-k">' + escapeHtml(tt("room.morph.recall.due", "🔁 К повторению — вспомни перевод")) + "</div>" +
        '<button type="button" class="rm-recall-reveal" data-rm-recall-reveal' + (card.contextPending ? ' disabled data-rm-context-wait' : '') + '>' + escapeHtml(tt("room.morph.recall.reveal", "Показать ответ")) + "</button>" +
        "</div>" +
        '<div class="rm-rows">' + rows + "</div>";
    }
    // Post-reveal: the full card + the grade bar (Знал 3 / Не знал 1) pinned under the gloss.
    // After a grade the bar collapses into a confirmation — double-grade impossible by DOM.
    var recallHtml = "";
    if (recall && recall.revealed) {
      recallHtml = recall.graded
        ? '<div class="rm-recall rm-recall-done" dir="' + uiDir() + '">' + escapeHtml(tt("room.morph.recall.done", "✓ Записано — расписание обновлено")) + "</div>"
        : '<div class="rm-recall rm-recall-grade" dir="' + uiDir() + '">' +
          '<span class="rm-recall-k">' + escapeHtml(tt("room.morph.recall.q", "Вспомнил?")) + "</span>" +
          '<button type="button" class="rm-recall-no" data-rm-recall-grade="1">' + escapeHtml(tt("room.morph.recall.forgot", "✗ Не знал")) + "</button>" +
          '<button type="button" class="rm-recall-yes" data-rm-recall-grade="3">' + escapeHtml(tt("room.morph.recall.knew", "✓ Знал")) + "</button>" +
          "</div>";
    }
    // T-b — manual translation: when the resolver has no offline gloss, let the learner add
    // their OWN (a real word_study note, Anki-synced). A user-asserted meaning is tagged «ваш»
    // (R9 provenance ≠ machine) and stays editable; the inline editor is hidden until invoked.
    var canEditMeaning = !card.selectionRequired && typeof _attachOpts.saveUserMeaning === "function" && card.meaningSource !== "owner" && card.meaningSource !== "teacher";
    var meaning;
    if (card.meaning) {
      var provBadge = card.meaningSource === "user"
        ? ' <span class="rm-meaning-mine" title="' + escapeHtml(tt("room.morph.yourMeaningHint", "ваш перевод, не машинный")) + '">' + escapeHtml(tt("room.morph.yourMeaning", "ваш")) + "</span>"
        : (card.meaningSource === "owner" || card.meaningSource === "teacher")
          ? ' <span class="rm-meaning-mine rm-meaning-reviewed" title="' + escapeHtml(tt(card.meaningSource === "teacher" ? "room.morph.teacherMeaningHint" : "room.morph.ownerMeaningHint", card.meaningSource === "teacher" ? "перевод подтверждён преподавателем для этого места" : "перевод подтверждён вами для этого места")) + '">' + escapeHtml(tt(card.meaningSource === "teacher" ? "room.morph.teacherMeaning" : "room.morph.ownerMeaning", card.meaningSource === "teacher" ? "преподаватель" : "проверено")) + "</span>"
          : "";
      var editIc = canEditMeaning
        ? ' <button type="button" class="rm-meaning-edit" data-rm-meaning-edit aria-label="' + escapeHtml(tt("room.morph.editMeaning", "Изменить перевод")) + '">✎</button>'
        : "";
      meaning = '<div class="rm-meaning" dir="ltr">' + escapeHtml(card.meaning) + provBadge + editIc + "</div>";
    } else {
      var addBtn = canEditMeaning
        ? ' <button type="button" class="rm-meaning-add" data-rm-meaning-add>' + escapeHtml(tt("room.morph.addMeaning", "＋ Добавить перевод")) + "</button>"
        : "";
      meaning = '<div class="rm-meaning rm-meaning-empty" dir="ltr">' + escapeHtml(_activeOcc ? tt("analysis.missingMeaning", "В этом разборе перевод не указан.") : tt("room.morph.noGloss", "Перевод не найден офлайн.")) + addBtn + "</div>";
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
    // Word layer Ф2 — the translation of THIS form («в тексте: что она писала»), the same line the
    // interlinear gloss shows (WordGloss.composeGloss). Not under a learner/owner/teacher meaning:
    // the form is built from the first Pealim sense and must not contradict a vetted gloss (R11).
    var formLine = "";
    if (card.meaning && !card.meaningSource && window.WordGloss && window.WordGloss.composeGloss) {
      var fg = null; try { fg = window.WordGloss.composeGloss(card, card.niqqud); } catch (_) { fg = null; }
      if (fg && fg.form) {
        var fm = window.WordGloss.matchCell(card.paradigm, card.niqqud), grammar = fm && !fm.impossible ? window.WordGloss.slotsHint(fm.slots) : '';
        formLine = '<div class="rm-reading-group rm-form-line" dir="' + uiDir() + '">' +
          '<div class="rm-reading-heading"><span class="rm-alts-k">' + escapeHtml(tt("room.morph.formInText", "в тексте")) + ':</span> ' +
          '<bdi class="rm-reading-he" dir="rtl" lang="he">' + escapeHtml(card.niqqud || card.word) + '</bdi></div>' +
          '<div class="rm-form-meaning" dir="ltr">' + escapeHtml(fg.text) + '</div>' +
          (grammar && fg.text.indexOf(grammar) < 0 ? '<div class="rm-form-grammar">' + escapeHtml(grammar) + '</div>' : '') + learnFormHtml(card) + "</div>";
      }
    }
    if (!formLine) formLine = learnFormHtml(card);
    var aiLine = aiOccurrenceHtml();
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
    var saveBtn = !card.selectionRequired && _attachOpts.saveWord
      ? '<button type="button" class="rm-save" data-rm-save>' + escapeHtml(tt("room.morph.save", "＋ Добавить в мои слова")) + "</button>"
      : "";
    // One canonical word_study object, two densities: the Reader offers the three personal
    // fields that matter mid-reading; Studio remains the full editor (morphology/history/links).
    // The editor stays hidden until lookup confirms that the canonical note exists.
    var noteEditor = (typeof _attachOpts.loadWordNote === "function" && typeof _attachOpts.saveWordPersonal === "function")
      ? '<section class="rm-note-editor" data-rm-note-editor hidden dir="' + uiDir() + '">' +
          '<div class="rm-note-editor-head">' +
            '<div><strong>' + escapeHtml(tt("room.morph.note.title", "Моя заметка о слове")) + '</strong>' +
            '<div class="rm-note-editor-hint">' + escapeHtml(tt("room.morph.note.sameObject", "Это та же запись, которая показывается в «Заметках к строке» в Студии.")) + '</div></div>' +
          '</div>' +
          '<label class="rm-note-field"><span>' + escapeHtml(tt("room.morph.note.meaning", "Моя формулировка значения")) + '</span>' +
            '<input type="text" data-rm-note-meaning maxlength="200" dir="auto" placeholder="' + escapeHtml(tt("room.morph.note.meaningPh", "Как я понимаю это слово")) + '" /></label>' +
          '<div class="rm-note-reference" data-rm-note-reference hidden></div>' +
          '<label class="rm-note-field"><span>' + escapeHtml(tt("room.morph.note.mnemonic", "Мнемоника")) + '</span>' +
            '<textarea data-rm-note-mnemonic maxlength="800" rows="2" dir="auto" placeholder="' + escapeHtml(tt("room.morph.note.mnemonicPh", "Что поможет вспомнить")) + '"></textarea></label>' +
          '<label class="rm-note-field"><span>' + escapeHtml(tt("room.morph.note.example", "Мой пример")) + '</span>' +
            '<textarea data-rm-note-example maxlength="800" rows="2" dir="auto" placeholder="' + escapeHtml(tt("room.morph.note.examplePh", "Фраза, в которой слово понятно")) + '"></textarea></label>' +
          '<div class="rm-note-editor-actions">' +
            '<button type="button" class="rm-note-save" data-rm-note-save>' + escapeHtml(tt("room.morph.note.save", "Сохранить изменения")) + '</button>' +
            '<button type="button" class="rm-note-cancel" data-rm-note-cancel>' + escapeHtml(tt("room.morph.cancel", "Отмена")) + '</button>' +
          '</div>' +
          '<div class="rm-note-status" data-rm-note-status role="status" aria-live="polite"></div>' +
        '</section>'
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
    if (card.paradigm && Object.keys(card.paradigm.cells || {}).length && window.InflectionRender && window.InflectionRender.renderParadigm) {
      // Ф2: mark the same cell(s) the interlinear gloss matched (dagesh-insensitive, after a proclitic)
      var hlSlots = [];
      try {
        var hm = window.WordGloss && window.WordGloss.matchCell ? window.WordGloss.matchCell(card.paradigm, card.niqqud) : null;
        if (hm && !hm.impossible) hlSlots = hm.slots || [];
      } catch (_) { hlSlots = []; }
      var tbl = ""; try { tbl = window.InflectionRender.renderParadigm(card.paradigm, { highlightForm: card.niqqud, highlightSlots: hlSlots }); } catch (_) { tbl = ""; }
      // F5 — when the reading isn't «точно», the table is for the resolver's best guess, not
      // a fact: label it «возможная парадигма» so it isn't read as the authoritative paradigm.
      var conjSure = card.label === "exact" || card.label === "owner" || card.label === "teacher" || card.usageParadigm;
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
    var refineEligible = refineWired && card.meaningSource !== "owner" && card.meaningSource !== "teacher" && !card.contextUsed && card.label !== "exact" && card.label !== "function" &&
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
    var reviewed = card.meaningSource === "owner" || card.meaningSource === "teacher" || card.channel === "owner-name";
    var scopedProvenance = '<div class="rm-analysis-source" dir="' + uiDir() + '">' +
      escapeHtml(tt("analysis.source", "Источник разбора") + ': ' + tt(label[0],label[1])) + '</div>';
    var lemmaMeaning = '<div class="rm-reading-group rm-dictionary-lemma" dir="' + uiDir() + '">' +
      '<div class="rm-reading-heading">' + (_activeOcc ? '<span class="rm-alts-k">' + escapeHtml((card.pos === 'propernoun' ? tt('analysis.name', 'Имя') : tt('analysis.lemma', 'Словарная форма'))) + ':</span> ' : '') + '<bdi class="rm-reading-he" dir="rtl" lang="he">' + escapeHtml(card.lemma || card.word) + '</bdi>' +
      (card.pos ? ' <span class="rm-reading-pos">· ' + escapeHtml(posText(card.pos)) + '</span>' : '') + '</div>' +
      meaning + meaningEditor + '</div>';
    var dictionaryDetails = scopedProvenance + lemmaMeaning + formLine + (_activeOcc ? '' : altLine) + ctxPosLine + usageHtml(card) + '<div class="rm-rows">' + rows + "</div>" + procliticHtml(card) + fam + conj;
    var occurrence = aiOccurrence();
    var contextual = !!(occurrence && !reviewed);
    var nameAction = contextual && ! _attachOpts.confirmOccurrenceAnalysis && _activeOcc && _activeOcc.sentence_id && typeof _attachOpts.confirmOccurrenceName === "function"
      ? '<div class="rm-context-review"><button type="button" class="rm-meaning-add" data-rm-name-propose>' + escapeHtml(tt("contextLayer.nameHere", "Это имя здесь")) + '</button><div data-rm-name-confirm hidden><p>' + escapeHtml(tt("contextLayer.confirmName", "Подтвердить имя только в этом месте? Статусы знания и повторы не изменятся.")) + '</p><button type="button" class="rm-meaning-save" data-rm-name-save>' + escapeHtml(tt("contextLayer.confirm", "Подтвердить")) + '</button></div></div>' : "";
    if (contextual) dictionaryDetails = '<details class="rm-acc rm-dictionary-reading"><summary class="rm-acc-sum">' + escapeHtml(tt("contextLayer.dictionary", "Словарный перевод; применимость здесь не подтверждена")) + '</summary>' + dictionaryDetails + '<div class="rm-actions">' + saveBtn + link + '</div></details>';
    var savedGloss = reviewed && aiLine ? '<details class="rm-acc"><summary class="rm-acc-sum">' + escapeHtml(tt("analysis.savedGloss", "Сохранённый подстрочник")) + '</summary>' + aiLine + '</details>' : aiLine;
    if (_activeOcc) {
      var reviewedLine = reviewed ? '<p class="rm-analysis-reviewed" role="status">' + escapeHtml(card.pos === 'propernoun' && !card.meaning ? tt('analysis.nameSaved', 'В этой строке отмечено как имя собственное') : tt('analysis.confirmed', 'Разбор сохранён для этой строки')) +
        (card.meaning ? ': ' + escapeHtml(card.meaning + ' · ' + posText(card.pos)) : '') +
        (card.pos === 'propernoun' && card.resolutionEventId && card.meaningSource === 'owner' ? ' <button type="button" data-rm-analysis-undo>' + escapeHtml(tt('analysis.undo', 'Отменить')) + '</button>' : '') + '</p>' : '';
      var currentReading = '<section class="rm-current-reading" dir="' + uiDir() + '"><h3>' + escapeHtml(tt('analysis.current', 'Разбор в этой строке')) + '</h3>' + reviewedLine + savedGloss + scopedProvenance + lemmaMeaning + formLine + '</section>';
      return backRow + head + niqMark + contextPendingHtml(card) + currentReading + nameAction + analysisChoicesHtml(card) +
      ctxPosLine + usageHtml(card) + '<div class="rm-rows">' + rows + '</div>' + procliticHtml(card) + fam + conj + recallHtml + statusSelectorHtml(card) +
      ((_markConfirm && learningView(card).lemmaKey === _markConfirm.lemmaKey) ? markConfirmHtml(card) : srsLineHtml(card)) +
      '<div class="rm-actions">' + saveBtn + link + '</div>' + noteEditor + explainWordHtml() + refineHtml;
    }
    var conflict = contextual && occurrence.x.wrongHint ? '<p class="rm-ai-warn">' + escapeHtml(tt("room.morph.aiWrongHint", "ИИ: словарное значение, вероятно, не подходит")) + '</p>' : "";
    if (!contextual) return backRow + head + legendHtml() + niqMark + contextPendingHtml(card) + meaning + formLine + aiLine + recallHtml + meaningEditor + altLine + ctxPosLine + usageHtml(card) + statusSelectorHtml(card) + ((_markConfirm && learningView(card).lemmaKey === _markConfirm.lemmaKey) ? markConfirmHtml(card) : srsLineHtml(card)) + '<div class="rm-rows">' + rows + "</div>" + procliticHtml(card) + '<div class="rm-actions">' + saveBtn + link + "</div>" + noteEditor + explainWordHtml() + refineHtml + fam + conj;
    return backRow + head + legendHtml() + niqMark + contextPendingHtml(card) + (contextual ? aiLine + conflict + nameAction : "") + dictionaryDetails + (!contextual ? aiLine : "") + recallHtml +
      (contextual ? '<p class="rm-dictionary-scope">' + escapeHtml(tt("contextLayer.statusScope", "Статус ниже относится к словарному чтению")) + '</p>' : "") +
      statusSelectorHtml(card) + ((_markConfirm && learningView(card).lemmaKey === _markConfirm.lemmaKey) ? markConfirmHtml(card) : srsLineHtml(card)) +
      (!contextual ? '<div class="rm-actions">' + saveBtn + link + '</div>' : "") + noteEditor + explainWordHtml() + refineHtml;

  }

  function contextPendingHtml(card) {
    return card && card.contextPending ? '<div class="rm-refine-busy" data-rm-context-pending role="status" dir="' + uiDir() + '">' + escapeHtml(tt("room.morph.refining", "Уточняю в контексте…")) + '</div>' : '';
  }

  function clearContextPending(card) {
    card.contextPending = false;
    if (!_sheet || _activeCard !== card) return;
    var pending = _sheet.querySelector('[data-rm-context-pending]');
    if (pending) pending.remove();
    var reveal = _sheet.querySelector('[data-rm-context-wait]');
    if (reveal) { reveal.disabled = false; reveal.removeAttribute('data-rm-context-wait'); }
  }

  // R10: in the Room's desktop split the card is a docked panel beside the table, not a modal.
  function syncSheetModality(el) {
    try { el.setAttribute("aria-modal", document.body.classList.contains("room-word-docked") ? "false" : "true"); } catch (_) {}
  }
  function openCardLoading() {
    _cardRequestEpoch++;
    var el = ensureSheet();
    syncSheetModality(el);
    if (el.hidden) { try { _cardReturnFocus = document.activeElement; } catch (_) { _cardReturnFocus = null; } }   // fresh open → remember trigger
    el.querySelector(".rm-sheet-body").innerHTML = '<div class="rm-loading">' + escapeHtml(tt("room.morph.loading", "Анализ…")) + "</div>";
    el.hidden = false; el.classList.add("rm-open");
    try { var x = el.querySelector(".rm-sheet-x"); if (x) x.focus(); } catch (_) {}   // WCAG 2.4.3 — focus into the dialog
  }
  function openCard(card, occ) {
    _activeCard = card; _activeOcc = occ || null; _activeNoteInfo = null;
    if (!_learningState || _learningState.card !== card) _learningState = {card:card,targets:card && card.learningTargets || [],selected:card && card.selectedLearningTarget || null};
    var el = ensureSheet();
    syncSheetModality(el);
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
  // opts.lemmaKey (Д10): the key the list / trainer item carries — a word read by its place (מַכּוֹת «удары» in that
  // sentence) — the card opens that entry and saves to that key, never the spelling's other word
  async function openWordCard(surface, niqqud, opts) {
    opts = opts || {};
    _activeWordCtx = null; _cardStack = []; _recallCtx = null; _markConfirm = null;   // study-row card is never recall/confirm mode
    // no table occurrence behind this card: a previous tap must not lend it its AI line (Ф3в)
    if (_activeSpan) { _activeSpan.classList.remove("rm-w-active"); _activeSpan = null; }
    openCardLoading();
    var requestEpoch = _cardRequestEpoch;
    try {
      if (window.LearningTargets && window.LearningTargets.isFormKey(opts.lemmaKey)) {
        var resolvedTarget = await resolveLearningTarget(opts.lemmaKey,niqqud);
        if (requestEpoch !== _cardRequestEpoch) return;
        if (!resolvedTarget || !resolvedTarget.card) {
          var targetSheet = ensureSheet();
          targetSheet.querySelector('.rm-sheet-body').innerHTML = '<p>' + escapeHtml(tt('learningTarget.sourceRequired','Для повторения этой формы нужен её пример. Откройте материал, где она встречалась.')) + '</p>';
          return;
        }
        resolvedTarget.card.selectedLearningTarget = opts.lemmaKey;
        openCard(resolvedTarget.card,null); return;
      }
      var card = await resolveWordLight(stripNiqqud(surface) || surface, niqqud);
      var lk = String(opts.lemmaKey || "");
      if (card && lk && lk !== card.lemmaKey) {
        var eng9 = await ensureEngine(), m9 = /^pid:(.+)$/.exec(lk);
        if (m9 && eng9.pidMap && eng9.pidMap.get(m9[1])) card = Object.assign(_cardForPid(eng9, card, m9[1], "list"), { pealim_url: (eng9.pidMap.get(m9[1]) || {}).pealim_url || card.pealim_url });
        card.lemmaKey = lk;
      }
      // P5.6 R-3 — the study-row card carries the same quiet schedule line as a reader tap.
      try {
        if (card && card.lemmaKey && typeof _attachOpts.getDueSchedule === "function") {
          var sAll = await _attachOpts.getDueSchedule();
          card.srsRow = (sAll && sAll[card.lemmaKey]) || null;
        }
      } catch (_) {}
      await loadLearningTargets(card);
      if (requestEpoch !== _cardRequestEpoch) return;
      openCard(card, null);
    }
    catch (_) { if (requestEpoch === _cardRequestEpoch) openCard(null, null); }
  }
  function lifecycleText(status) { var L = LIFECYCLE[status] || LIFECYCLE.created; return tt(L[0], L[1]); }
  // Reflect whether this word is already a saved note (+ its SRS lifecycle) onto the
  // card: a status badge + the save button flips to «✓ В заметках». info = {status} | null.
  function applyLifecycle(info) {
    if (!_sheet) return;
    _activeNoteInfo = info && info.status ? info : null;
    var lifeEl = _sheet.querySelector("[data-rm-life]");
    var saveBtn = _sheet.querySelector(".rm-save");
    var has = !!(info && info.status);
    if (lifeEl) {
      if (has) { lifeEl.textContent = lifecycleText(info.status); lifeEl.className = "rm-life rm-life-" + info.status; lifeEl.hidden = false; }
      else lifeEl.hidden = true;
    }
    if (saveBtn) {
      if (has) {
        saveBtn.textContent = tt("room.morph.saved", "✎ Дополнить заметку");
        saveBtn.classList.add("rm-save-done");
        saveBtn.setAttribute("aria-expanded", "false");
      } else {
        saveBtn.textContent = tt("room.morph.save", "＋ Добавить в мои слова");
        saveBtn.classList.remove("rm-save-done");
        saveBtn.removeAttribute("aria-expanded");
      }
    }
  }
  async function refreshCardMeta(card) {
    if (!_attachOpts.lookupNote) return;
    var info; try { info = await _attachOpts.lookupNote(card); } catch (_) { info = null; }
    if (_activeCard === card) applyLifecycle(info);
  }
  // Retention P5 — reveal the answer: from here the flow is a canonical flashcard
  // (attempt → reveal → grade). The shown-counter feeds the MNAR abandonment gate (recon §6.2:
  // reading-tap enters the P6 calibration only when shown-vs-graded abandonment is below the
  // precommitted threshold), so it is bumped at REVEAL, not at grade.
  function onRecallReveal() {
    if (!_recallCtx || _recallCtx.revealed || _recallCtx.card !== _activeCard) return;
    _recallCtx.revealed = true;
    try { if (typeof _attachOpts.noteRecallShown === "function") _attachOpts.noteRecallShown(); } catch (_) {}
    openCard(_activeCard, _activeOcc);
  }
  // Retention P5 — grade AFTER reveal (B7). The write itself is the Room's glue
  // (opts.gradeReadingTap: review_log source='reading-tap' + FSRS via fsrsStep + schedule
  // projection). D8(a): the manual level is NOT moved — self-report must not retire a word
  // from i+1/sessions/the production tier. Guards make a double-grade impossible.
  async function onRecallGrade(g) {
    var rc = _recallCtx;
    if (!rc || !rc.revealed || rc.graded || rc.card !== _activeCard) return;
    if (typeof _attachOpts.gradeReadingTap !== "function") return;
    rc.graded = true;
    var correct = String(g) === "3";
    try { await _attachOpts.gradeReadingTap(learningView(_activeCard), _activeOcc, correct, rc.prev); }
    catch (error) { if (_recallCtx === rc) { rc.graded = false; learningError(error); } return; }
    if (_recallCtx === rc && _activeCard === rc.card) openCard(_activeCard, _activeOcc);
  }
  async function onSaveClick() {
    if (!_activeCard || _activeCard.selectionRequired || !_attachOpts.saveWord) return;
    var saveBtn = _sheet && _sheet.querySelector(".rm-save");
    if (_activeNoteInfo && _activeNoteInfo.noteId && typeof _attachOpts.loadWordNote === "function") {
      onNoteEditorToggle(true);
      return;
    }
    if (saveBtn) saveBtn.disabled = true;
    try {
      var info = await _attachOpts.saveWord(_activeCard, _activeOcc);
      applyLifecycle(info && info.status ? info : { status: "created" });
    } catch (_) {} finally { if (saveBtn) saveBtn.disabled = false; }
  }
  async function onNoteEditorToggle(open) {
    var box = _sheet && _sheet.querySelector("[data-rm-note-editor]");
    var btn = _sheet && _sheet.querySelector(".rm-save");
    if (!box) return;
    box.hidden = !open;
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;
    var status = box.querySelector("[data-rm-note-status]");
    var controls = box.querySelectorAll("input, textarea, [data-rm-note-save]");
    for (var ci = 0; ci < controls.length; ci++) controls[ci].disabled = true;
    if (status) status.textContent = tt("room.morph.note.loading", "Открываю заметку…");
    try {
      var note = await _attachOpts.loadWordNote(_activeCard);
      if (!note || !note.noteId) throw new Error("NOTE_NOT_FOUND");
      _activeNoteInfo = Object.assign({}, _activeNoteInfo || {}, note);
      var meaningEl = box.querySelector("[data-rm-note-meaning]");
      var mnemonicEl = box.querySelector("[data-rm-note-mnemonic]");
      var exampleEl = box.querySelector("[data-rm-note-example]");
      var referenceEl = box.querySelector("[data-rm-note-reference]");
      if (meaningEl) meaningEl.value = note.meaning || "";
      if (mnemonicEl) mnemonicEl.value = note.mnemonic || "";
      if (exampleEl) exampleEl.value = note.example || "";
      if (referenceEl) {
        referenceEl.textContent = note.referenceMeaning
          ? tt("room.morph.note.reference", "Подсказка приложения") + ": " + note.referenceMeaning
          : "";
        referenceEl.hidden = !note.referenceMeaning;
      }
      if (status) status.textContent = "";
      for (var cj = 0; cj < controls.length; cj++) controls[cj].disabled = false;
      try { (meaningEl || mnemonicEl || exampleEl).focus(); } catch (_) {}
    } catch (_) {
      if (status) status.textContent = tt("room.morph.note.loadFailed", "Не удалось открыть заметку. Закройте карточку и попробуйте ещё раз.");
    }
  }
  async function onNoteEditorSave() {
    if (!_activeCard || typeof _attachOpts.saveWordPersonal !== "function") return;
    var box = _sheet && _sheet.querySelector("[data-rm-note-editor]");
    if (!box) return;
    var save = box.querySelector("[data-rm-note-save]");
    var status = box.querySelector("[data-rm-note-status]");
    var fields = {
      meaning: String((box.querySelector("[data-rm-note-meaning]") || {}).value || "").trim(),
      mnemonic: String((box.querySelector("[data-rm-note-mnemonic]") || {}).value || "").trim(),
      example: String((box.querySelector("[data-rm-note-example]") || {}).value || "").trim(),
    };
    if (save) save.disabled = true;
    if (status) status.textContent = tt("room.morph.note.saving", "Сохраняю…");
    try {
      var info = await _attachOpts.saveWordPersonal(_activeCard, _activeOcc, fields);
      if (!info || !info.noteId) throw new Error("NOTE_SAVE_FAILED");
      if (fields.meaning) { _activeCard.meaning = fields.meaning; _activeCard.meaningSource = "user"; }
      _activeNoteInfo = Object.assign({}, _activeNoteInfo || {}, info);
      if (status) status.textContent = tt("room.morph.note.saved", "Сохранено. Эта же запись обновлена в Студии.");
      setTimeout(function () {
        if (_activeCard) openCard(_activeCard, _activeOcc);
      }, 650);
    } catch (_) {
      if (status) status.textContent = tt("room.morph.note.saveFailed", "Не удалось сохранить изменения.");
      if (save) save.disabled = false;
    }
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
    if (!_activeCard || _activeCard.selectionRequired || typeof _attachOpts.saveUserMeaning !== "function") return;
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
  // Phase-3 — tap a proclitic chip → open its «Употребление» (reuse the 3b function-usage store +
  // the same card renderer). Synthesizes a minimal function-word card so usageHtml + the Pealim
  // link light up; drills onto the stack so «‹ Назад» returns to the content word.
  function onProcliticChip(letter) {
    if (!letter) return;
    var FU = (typeof window !== "undefined" && window.FunctionUsage) ? window.FunctionUsage : null;
    var usage = null; try { usage = FU ? (FU.lookup(letter) || null) : null; } catch (_) { usage = null; }
    var card = {
      word: (usage && usage.word) || letter, niqqud: (usage && usage.niqqud) || letter,
      root: null, binyan: "", pos: (usage && usage.pos) || "particle",
      meaning: (usage && (usage.gloss || usage.meaning)) || "", lemma: "",
      pealim_id: (usage && usage.pealim_id) ? String(usage.pealim_id) : "",
      pealim_url: (usage && usage.pealim_url) || (usage && usage.pealim_id ? "https://www.pealim.com/ru/dict/" + encodeURIComponent(usage.pealim_id) + "/" : ""),
      pealim_direct: !!(usage && usage.pealim_id), functionWord: true, label: "function",
      ambiguous: false, alts: [], usage: usage, rootFamily: [], proclitics: null,
    };
    if (_activeCard) _cardStack.push({ card: _activeCard, occ: _activeOcc });   // drill → «‹ Назад» returns
    _activeWordCtx = null;
    openCard(card, null);
  }
  // Tap a root-family chip → open that related word's card (no occurrence context).
  async function onChipClick(chip) {
    var disp = chip.getAttribute("data-w") || "";
    var surface = stripNiqqud(disp);
    if (!surface) return;
    if (_activeCard) _cardStack.push({ card: _activeCard, occ: _activeOcc });   // drill → remember where we came from
    _activeWordCtx = null;   // chip card has no sentence → no per-card refine offered
    openCardLoading();
    var requestEpoch = _cardRequestEpoch;
    try { var card = await resolveWordLight(surface, disp); await loadLearningTargets(card); if (requestEpoch === _cardRequestEpoch) openCard(card, null); }
    catch (_) { if (requestEpoch === _cardRequestEpoch) openCard(null, null); }
  }

  // ── Public: attach the learner layer to a painted reader mount ──────────────
  //   attach(mount, { getRow })  — getRow(rowIdx) -> row model (he, he_niqqud).
  // Returns { detach, refresh(scope?) }. Idempotent per cell (WRAP_FLAG).
  // deferWrap lets the host hydrate only visible row groups after attaching delegates.
  function attach(mount, opts) {
    opts = opts || {};
    if (!mount) return { detach: function () {}, refresh: function () {} };
    var getRow = typeof opts.getRow === "function" ? opts.getRow : function () { return null; };
    _attachOpts = opts;

    var detached = false;
    var refresh = function (scope) {
      scope = scope || mount;
      if (detached || (scope !== mount && !mount.contains(scope))) return;
      try { wrapMount(scope, getRow, opts); } catch (_) {}
    };
    if (!opts.deferWrap) refresh();

    var rowForSpan = function (span) {
      var tr = span && span.closest ? span.closest(opts.rowSelector || "tr[data-row-idx]") : null;
      var rowIdx = tr ? Number(tr.getAttribute(opts.rowIndexAttribute || "data-row-idx")) : NaN;
      var row = typeof opts.getRowForCell === "function" ? opts.getRowForCell(span.closest("td"), tr) :
        ((Number.isFinite(rowIdx) && typeof getRow === "function") ? getRow(rowIdx) : null);
      return { tr: tr, rowIdx: rowIdx, row: row };
    };

    // Occurrence context for a tapped word: where it appears (text/sentence/offset) so a
    // saved note records a real occurrence. Baked corpus rows carry _v3_textId/_v3_sentenceId.
    var computeOcc = function (span) {
      try {
        var resolved = rowForSpan(span), row = resolved.row, rowIdx = resolved.rowIdx;
        var off = Number(span.getAttribute("data-w-offset"));
        if (typeof opts.buildOccurrence === "function") return opts.buildOccurrence(span, row, rowIdx);
        return {
          text_id: row && row._v3_textId ? String(row._v3_textId) : null,
          sentence_id: row && row._v3_sentenceId ? String(row._v3_sentenceId) : null,
          // R1 source-at-mark (ROOM_DUE_CONTINUITY §3): the sentence position, so a status mark
          // can persist a re-clozeable SOURCE (the host resolves textKey — reader-morph stays host-agnostic).
          order_index: row && row._v3_orderIndex != null ? Number(row._v3_orderIndex) : null,
          word_offset: Number.isFinite(off) ? off : null,
          surface: span.getAttribute("data-surface") || "",
          niqqud: span.getAttribute("data-niqqud") || "",
          text_key: typeof opts.getTextKey === "function" ? String(opts.getTextKey() || "") : "",
          sentence_he: row ? String(row.he || "") : "",
          sentence_he_niqqud: row ? String(row.he_niqqud || "") : "",
          sentence_ru: row ? String(row.ru || "") : "",
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
        var resolved = rowForSpan(span), row = resolved.row;
        var sentence = typeof opts.getSentence === "function" ? String(opts.getSentence(row) || "") :
          (row ? (String(row.he || "") || stripNiqqud(String(row.he_niqqud || ""))) : "");
        _activeWordCtx = { row: row, surface: stripNiqqud(surface), niqqud: niqqud, sentence: sentence,
          orderIndex: occ && occ.order_index != null ? occ.order_index : null };   // PAS-A4 — якорь для explain-word
        if (typeof opts.onOccurrenceActive === "function") { try { opts.onOccurrenceActive(span, row, occ); } catch (_) {} }
        _cardStack = [];   // a fresh word tap starts a new drill history
        // Tier-3 «точный режим» (opt-in, GLOBAL auto): when a contextProvider is wired it
        // gates on the user's standing consent and returns the context reading (or null when
        // declined/undecided/offline); degrade silently to offline on any miss.
        var wordCtx = _activeWordCtx;
        var current = function () { return _activeSpan === span && _activeWordCtx === wordCtx && _attachOpts === opts; };
        var ctxReady = false, ctxValue = null;
        var contextPromise = Promise.resolve().then(function () {
          return typeof opts.contextProvider === "function" && sentence ? opts.contextProvider(sentence, stripNiqqud(surface)) : null;
        }).then(function (ctx) { ctxReady = true; ctxValue = ctx; return ctx; }, function () { ctxReady = true; return null; });
        // Dictionary preparation and cloud context run concurrently. A slow
        // provider never holds the already available offline card hostage.
        await ensureEngine();
        var tapPlace = placeOfSpan(span);
        var prepareCard = async function (ctx) {
          var card = await resolveWordLight(surface, niqqud, ctx, tapPlace);
          if (card && occ && typeof _attachOpts.lookupLexicalResolution === "function") {
            try {
              var projection = await _attachOpts.lookupLexicalResolution(card, occ, row);
              if (projection && projection.state === "stale") card.resolutionState = "stale";
              card = applyLexicalResolution(card, projection);
              if (projection && projection.state === "resolved") {
                var ownerEngine = await ensureEngine();
                card.lemmaKey = statusKeyForCard(ownerEngine.NA, card, niqqud, surface);
                if (card.lemmaKey && typeof _attachOpts.getWordStatus === "function") {
                  try { card.manualStatus = (await _attachOpts.getWordStatus(card.lemmaKey)) || ""; } catch (_) { card.manualStatus = ""; }
                }
              }
            } catch (_) { /* exact projection miss must leave the resolver card unchanged */ }
          }
          // Retention P5 (recon §6.2, D4(b)) — a DUE word opens in «вспомни» mode. Gated exactly
          // like the quiet marker: exact-confident only (a suppressed homograph is never graded —
          // R10 §6.1), «ignore» excluded, a gloss to reveal must exist, and the Room must have wired
          // both the schedule and the grade glue. Everything else opens the normal card unchanged.
          try {
            if (card && card.lemmaKey && typeof _attachOpts.getDueSchedule === "function") {
              var schedAll = await _attachOpts.getDueSchedule();
              // P5.6 R-3 — schedule provenance for the card's quiet «Повтор: …» line (any word).
              card.srsRow = (schedAll && schedAll[card.lemmaKey]) || null;
            }
          } catch (_) {}
          await loadLearningTargets(card);
          return card;
        };
        var setRecall = function (card, allowed) {
          _recallCtx = null;
          if (allowed && card && card.srsRow && (Number(card.srsRow.due) || 0) <= Date.now() &&
              card.meaning && (card.label === "exact" || card.label === "owner" || card.label === "teacher") && !card.ambiguous &&
              card.manualStatus !== "ignore" && typeof opts.gradeReadingTap === "function") {
            _recallCtx = { card: card, prev: card.srsRow, revealed: false, graded: false };
          }
        };
        var initialCtx = ctxReady ? ctxValue : null;
        var card = await prepareCard(initialCtx);
        // A cache/cloud response that finished during local reads can be used
        // before the first render, without a needless intermediate card.
        if (!initialCtx && ctxReady && ctxValue) card = await prepareCard(ctxValue);
        if (!current()) return;
        _markConfirm = null;
        setRecall(card, true);
        if (card) card.contextPending = !ctxReady;
        openCard(card, occ);
        if (ctxReady || !card) return;
        var interactionEpoch = _cardInteractionEpoch;
        contextPromise.then(async function (ctx) {
          if (!current() || _activeCard !== card) return;
          if (!ctx || _cardInteractionEpoch !== interactionEpoch) { clearContextPending(card); return; }
          var refined;
          try { refined = await prepareCard(ctx); } catch (_) { clearContextPending(card); return; }
          if (!current() || _activeCard !== card) return;
          if (_cardInteractionEpoch !== interactionEpoch) { clearContextPending(card); return; }
          // Never start a hidden-answer quiz after a normal card already
          // displayed its meaning. Pending recall cards keep the answer hidden.
          var wasRecall = !!(_recallCtx && _recallCtx.card === card);
          setRecall(refined, wasRecall);
          openCard(refined, occ);
        }).catch(function () { if (current() && _activeCard === card) clearContextPending(card); });
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
        showStatusPopover(span, computeOcc(span)).then(function (ok) { if (ok) _suppressClick = true; });
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
      var span = e.target && e.target.closest ? e.target.closest(".rm-w") : null;
      if (!span || !mount.contains(span)) return;
      if (opts.rovingFocus && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        var cell = span.closest("td"), wordsInCell = cell ? Array.prototype.slice.call(cell.querySelectorAll(".rm-w")) : [];
        var at = wordsInCell.indexOf(span), rtl = cell && String(cell.getAttribute("dir") || "").toLowerCase() === "rtl";
        var delta = e.key === "ArrowLeft" ? (rtl ? 1 : -1) : (rtl ? -1 : 1);
        var next = wordsInCell[at + delta];
        if (next) {
          e.preventDefault(); e.stopPropagation();
          wordsInCell.forEach(function (word) { word.setAttribute("tabindex", word === next ? "0" : "-1"); });
          try { next.focus(); } catch (_) {}
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onActivate(span); }
    };
    var onDocKey = function (e) { if (e.key === "Escape" && isSheetOpen()) { e.preventDefault(); e.stopImmediatePropagation(); closeStatPop(); closeSheet(); } };
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
        if (detached) return;
        detached = true;
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
  // Chunked (60/batch + yields) so a long text never blocks the UI. Absent-from-map is the
  // derived presentation state `unassessed`; it is never fabricated as asserted learner `new`.
  // Epic 4 — manual LingQ-style levels (l1..l4) + known/ignore join the SRS-derived states.
  // Palette (cross-competitor standard): new=blue · l1..l4=amber gradient · known=NO tint (the
  // wall clears) · ignore=plain (faint dotted). The class is applied; the colour lives in CSS.
  var STATE_CLASS = { known: "rm-w-known", learning: "rm-w-learning", weak: "rm-w-learning", stale: "rm-w-learning", "new": "rm-w-new", l1: "rm-w-l1", l2: "rm-w-l2", l3: "rm-w-l3", l4: "rm-w-l4", ignore: "rm-w-ignore" };
  var _RM_W_CLASSES = ["rm-w-known", "rm-w-learning", "rm-w-new", "rm-w-unassessed", "rm-w-l1", "rm-w-l2", "rm-w-l3", "rm-w-l4", "rm-w-ignore", "rm-w-due"];
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
  function clearDueTooltip(span) {
    if (!span.getAttribute("data-rm-due-tip")) return;
    // Contextual glosses can finish before colours; only remove the title we own.
    if (span.getAttribute("title") === tt("room.morph.due.tip", "К повторению — тапни и вспомни перевод")) span.removeAttribute("title");
    span.removeAttribute("data-rm-due-tip");
  }

  // Remove all decorations: colour classes + restore any de-vocalized niqqud spans. Cheap, no resolve.
  function clearDecorations(mount) {
    if (!mount) return;
    var painted = mount.querySelectorAll("." + _RM_W_CLASSES.join(", ."));
    for (var i = 0; i < painted.length; i++) {
      painted[i].classList.remove.apply(painted[i].classList, _RM_W_CLASSES);
      clearDueTooltip(painted[i]);
    }
    var niq = mount.querySelectorAll('#proTable tbody td[data-col="niqqud"] .rm-w');
    for (var j = 0; j < niq.length; j++) { var n = niq[j].getAttribute("data-niqqud"); if (n != null && niq[j].textContent !== n) niq[j].textContent = n; }
  }

  // opts = { color: bool, fadeMode: 'full'|'adaptive'|'off', dueSet: Set<lemmaKey>|null }.
  // statesMap = {lemmaKey: state}. dueSet (Retention P5, recon §6.1) = keys whose review time has
  // arrived (dueSetFromSchedule): an EXACT-confident due word gets the quiet .rm-w-due ring; a due
  // word the resolver can't decisively identify (homograph/likely/function) is SILENTLY skipped
  // and tallied as suppressed — the retention-report's measure of lost recall opportunities (R10).
  async function decorateWords(mount, statesMap, opts) {
    if (!mount) return;
    opts = opts || {};
    var isCurrent = typeof opts.isCurrent === "function" ? opts.isCurrent : function () { return true; };
    if (!isCurrent()) return;
    var color = !!opts.color, fadeMode = opts.fadeMode || "full";
    if (!color && fadeMode !== "adaptive") { clearDecorations(mount); return; }   // nothing to resolve
    var states = statesMap || {};
    var dueSet = (color && opts.dueSet) ? opts.dueSet : null;
    var dueMarked = {}, dueSuppressed = {};   // unique keys per pass (a word repeats in-text)
    var NA = window.NotesAutoGen;
    var eng; try { eng = await ensureEngine(); } catch (_) { return; }
    if (!isCurrent()) return;
    // The status key of a FUNCTION word depends on its PealimFunctionLinks id (_statusPid). The map
    // is lazy; if it isn't loaded yet the paint would key by surface#pos while the saved status is
    // pid:N → a brief miss until the next repaint. Await readiness so the very first paint already
    // keys function words by pid (consistent with resolveWordLight). Idempotent + offline-cheap.
    try { if (window.PealimFunctionLinks && window.PealimFunctionLinks.ensureReady) await window.PealimFunctionLinks.ensureReady(); } catch (_) {}
    if (!isCurrent()) return;
    var spans = Array.prototype.slice.call(mount.querySelectorAll(".rm-w"));
    // Д10: the words' places (the sentence's stored Dicta parse, the learner's decisions) before the paint
    var places = spans.map(placeOfSpan);
    try { await ensurePlaces(places.filter(Boolean).map(function (pl) { return pl.sid; })); } catch (_) {}
    if (!isCurrent()) return;
    var i = 0;
    while (i < spans.length) {
      if (!isCurrent()) return;
      var end = Math.min(i + 60, spans.length);
      for (; i < end; i++) {
        var span = spans[i];
        var isNiqqud = _colOf(span) === "niqqud";
        var surface = span.getAttribute("data-surface") || "";
        var niqqud = span.getAttribute("data-niqqud") || "";
        var card, failed = false;
        try { card = await resolveCore(eng, surface, niqqud, places[i] ? { place: places[i] } : undefined); }
        catch (_) { failed = true; }
        // Resolving can yield while another material or colour pass takes over.
        // Do not even clear the current decorations until this result is still owned.
        if (!isCurrent()) return;
        span.classList.remove.apply(span.classList, _RM_W_CLASSES);
        if (failed) { if (isNiqqud && niqqud != null && span.textContent !== niqqud) span.textContent = niqqud; continue; }   // unconfident → keep niqqud
        var confident = !!(card && (card.label === "exact" || card.label === "likely"));   // gate (R1/R10)
        // T-a — key EVERY word (pid:/lemma#pos for confident · surface#pos / surface# for unconfident)
        // via the shared keyer, byte-identical to setWordStatus/getKnownWordStates, so a MANUAL status
        // on a function/unknown word (which the resolver can't confidently ID) still colours by surface.
        var lk = statusKeyForCard(NA, card, niqqud, surface);
        var raw = lk ? states[lk] : undefined;
        if (color) {
          // A confident word without learner state is only DERIVED `unassessed` (quiet dotted marker).
          // Purple `new` is reserved for an explicit stored learner decision. UNCONFIDENT words are
          // decorated ONLY when the user explicitly engaged them (manual status OR saved note → a states
          // entry); they never receive a derived assessment. R11 precedence: a
          // confident word uses its lemma-key, so a surface-status never leaks onto a confident homograph.
          var st = raw || "";
          var cls = st ? STATE_CLASS[st] : (confident ? "rm-w-unassessed" : "");
          if (cls) span.classList.add(cls);
        }
        // Retention P5 — quiet due marker: a ring, never a background tint (the background IS the
        // manual-status axis). Key parity is free: lk is the SAME statusKeyForCard bytes the due
        // set was built from (save == paint == review). exact-only + unambiguous (R10 honesty).
        clearDueTooltip(span);
        if (dueSet && lk && dueSet.has(lk)) {
          if (card && card.label === "exact" && !card.ambiguous) {
            span.classList.add("rm-w-due"); dueMarked[lk] = 1;
            // P5.6 R-1 — the ring must be self-explaining (discoverability): a desktop hover
            // says what it means; touch users learn it from the recall card + the 🎨 hint.
            if (!span.getAttribute("title")) {
              span.title = tt("room.morph.due.tip", "К повторению — тапни и вспомни перевод");
              span.setAttribute("data-rm-due-tip", "1");
            }
          }
          else dueSuppressed[lk] = 1;
        }
        // Write only a real change: an unchanged write is still a childList mutation, and on a long table the
        // per-word mutations woke every table observer once per word (O-080: 3.7 min of a blocked page).
        if (isNiqqud) { var shown = (fadeDecision(confident ? raw : undefined, card ? card.label : null, fadeMode) === "plain") ? surface : niqqud; if (span.textContent !== shown) span.textContent = shown; }
      }
      if (i < spans.length) await new Promise(function (r) { setTimeout(r, 0); });
    }
    if (isCurrent() && dueSet) _dueMarkStats = { marked: Object.keys(dueMarked).length, suppressed: Object.keys(dueSuppressed).length, at: Date.now() };
  }
  // Retention P5 — last-pass marker tally: how many due words were visibly marked vs honestly
  // suppressed (non-exact) in the current text. Read by the Room (per-day MAX → localStorage)
  // and by the P6 retention-report's live Kapture mode as the «lost recall opportunities» measure.
  var _dueMarkStats = { marked: 0, suppressed: 0, at: 0 };
  function dueMarkStats() { return { marked: _dueMarkStats.marked, suppressed: _dueMarkStats.suppressed, at: _dueMarkStats.at }; }

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
    var places = spans.map(placeOfSpan);   // Д10: the trainers key a word by its place, as the paint does
    try { await ensurePlaces(places.filter(Boolean).map(function (pl) { return pl.sid; })); } catch (_) {}
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
        await _addScannedToken(eng, NA, group, null, span.getAttribute("data-surface") || "", span.getAttribute("data-niqqud") || "",
          ri, Number(span.getAttribute("data-w-offset")), i, null, { place: places[i] });
      }
      if (i < spans.length) await new Promise(function (r) { setTimeout(r, 0); });
    }
    return group;
  }
  // ONE token of a scan (Room DOM spans or plain rows): resolve → only confident content words (a real root/gloss)
  // are grouped by the canonical status key (statusKeyForCard: collect == save == paint). Others, when `unsure`
  // is given, are counted there by skeleton (function words are not learning items and are left out).
  // ── Ф4 · Д8 «Не разобрано» (docs/planning/word-layer/F4_D8_UNPARSED_METHOD_PLAN_2026_10_14.md) ────────────────
  var _DICTA_CONTENT = { noun: 1, verb: 1, adjective: 1, participle: 1 };
  var _D8_FIN = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  function _d8Skel(x) { return stripNiqqud(String(x || "")).replace(/[^א-ת]/g, "").replace(/[ךםןףץ]/g, function (c) { return _D8_FIN[c]; }); }
  function _d8Loose(x) { return _d8Skel(x).replace(/[וי]/g, ""); }   // matres-insensitive: Dicta's lemma spelling vs Pealim's
  // Д8-3: the tokenizer cuts a word at an ASCII apostrophe used as geresh (ג'יהאד → ג + יהאד) and a dotted acronym
  // at its dots (המ.פ. → המ + פ). Re-join them over the token stream (word offsets stay the tokenizer's):
  // → [{ surface, niqqud, off, span, fragment }]; a lone letter left over (no geresh) is a fragment, not a word.
  var _APOS = { "'": 1, "’": 1, "`": 1 };
  function joinSplitWords(toks, pairs) {
    var out = [], w = 0, list = [];
    for (var t = 0; t < (toks || []).length; t++) if (toks[t].isWord) list.push({ tok: t, w: w++ });
    for (var a = 0; a < list.length; a++) {
      var first = list[a], surf = pairs[first.w][0], nq = pairs[first.w][1], span = 1, b = a;
      while (b + 1 < list.length && list[b + 1].tok === list[b].tok + 2) {
        var sep = toks[list[b].tok + 1].text, nxt = list[b + 1];
        var dotted = sep === "." && _d8Skel(pairs[list[b].w][0]).length <= 3 && _d8Skel(pairs[nxt.w][0]).length <= 3
          && (_d8Skel(pairs[list[b].w][0]).length <= 2 || _d8Skel(pairs[nxt.w][0]).length <= 2);
        if (!_APOS[sep] && !dotted) break;
        var j = _APOS[sep] ? "׳" : ".";
        surf += j + pairs[nxt.w][0]; nq = nq && pairs[nxt.w][1] ? nq + j + pairs[nxt.w][1] : ""; span++; b++;
      }
      // a geresh after the last part (סוויץ', א') belongs to the word
      var after = toks[list[b].tok + 1];
      if (after && !after.isWord && _APOS[after.text.charAt(0)] && (after.text.length === 1 || /^\s/.test(after.text.slice(1)))) { surf += "׳"; if (nq) nq += "׳"; }
      var sk = _d8Skel(surf);
      // a lone ו/ב/ל/כ/מ/ש/ה is a real word (ב 7 באוקטובר, ל 30 שנה — a proclitic before a number); any other lone letter
      // left after the joins is a cut-off piece, not a word (measured on the owner's text: none of them was a word)
      out.push({ surface: surf, niqqud: nq, off: first.w, span: span, fragment: sk.length === 1 && span === 1 && surf.indexOf("׳") < 0 && !/[ובלכמשה]/.test(sk) });
      a = b;
    }
    return out;
  }
  // Д8-1: a reading the offline resolver did not make is accepted only when Dicta's parse of the sentence and the
  // resolver agree: Dicta splits off its prefix (or gives its own pointing), the resolver reads the stem, and the
  // paradigm's lemma IS Dicta's lemma. Otherwise null — the word stays in «Не разобрано».
  var _BGDKPT = { "ב": 1, "ג": 1, "ד": 1, "כ": 1, "פ": 1, "ת": 1 };
  async function _dictaConfirmed(eng, surface, niqqud, dt, opts) {
    if (!dt || !_DICTA_CONTENT[String(dt.posDicta || "")] && dt.posDicta) return null;
    var lemmas = [dt.lemma].concat(dt.lemmas || []).filter(Boolean).map(_d8Loose).filter(Boolean);
    if (!lemmas.length) return null;
    var sk = _d8Skel(surface), pre = _d8Skel(dt.prefix || "");
    if (pre && sk.indexOf(pre) !== 0 && /ה$/.test(pre) && sk.indexOf(pre.slice(0, -1)) === 0) pre = pre.slice(0, -1);   // a fused article: בַּסּוֹף = ב(ה)סוף
    if (pre && (sk.indexOf(pre) !== 0 || sk.length - pre.length < 2)) return null;
    var cands = [];
    var stemOf = function (nq) {
      if (!pre) return nq;
      var cl = _clusters(String(nq || "").normalize("NFC")), n = 0, i = 0;
      while (i < cl.length && n < pre.length) { if (/[א-ת]/.test(cl[i].charAt(0))) n++; i++; }
      var rest = cl.slice(i);
      if (rest.length && !_BGDKPT[rest[0].charAt(0)]) rest[0] = rest[0].replace(/ּ/g, "");   // the prefix's gemination dagesh
      return rest.join("");
    };
    var stemPlain = stripNiqqud(surface).replace(/[^א-ת]/g, "").slice(pre.length);
    // the TEXT's pointing (what the learner reads) is read; Dicta's own pointing only where the row has none. Measured on
    // the owner's text: taking Dicta's pointing where it differs (וְהֵקִינוּ vs Dicta's וְהַקִּינוֹ «и гнездо», even «close» vowels:
    // אָבִיבִי «тель-авивский» → «весна») doubled the wrong readings — the owner chose precision (Д8-1)
    if (/[ְ-ּ]/.test(String(niqqud || ""))) cands.push(stemOf(String(niqqud)));
    else if (dt.niqqud) cands.push(stemOf(dt.niqqud));
    for (var c = 0; c < cands.length; c++) {
      if (!cands[c] || !/[ְ-ּ]/.test(cands[c])) continue;
      var card; try { card = await _resolveBase(eng, stemPlain, cands[c], opts); } catch (_) { card = null; }
      if (!card || (card.label !== "exact" && card.label !== "likely") || card.functionWord) continue;
      var par = card.paradigm || {};
      var mine = [card.lemma, par.lemma, par.lemma_niqqud].filter(Boolean).map(_d8Loose);
      if (!mine.some(function (m) { return lemmas.indexOf(m) >= 0; })) continue;
      return { card: Object.assign({}, card, { dictaConfirmed: true, dictaPrefix: pre }), niqqud: cands[c], surface: stemPlain };
    }
    return null;
  }
  async function _addScannedToken(eng, NA, group, unsure, surface, niqqud, ri, off, i, stats, x) {
    x = x || {};
    var card; try { card = await resolveCore(eng, surface, niqqud, x.place ? { place: x.place } : undefined); } catch (_) { card = null; }
    // Д8-К: the device's Dicta lexicon (the same one resolveCore read) gives the class of a word Pealim does not read
    var DLX = (typeof window !== "undefined" && window.DictaLexicon) || _DictaLexiconNode;
    var lx = (unsure && eng && eng.dictaLex && DLX) ? DLX.lookup(eng.dictaLex, surface || niqqud) : null;
    var keyed = !!(card && !card.selectionRequired && (card.label === "exact" || card.label === "likely" || card.label === "dicta" ||
      ((card.label === "owner" || card.label === "teacher") && card.pos !== "propernoun")));
    // Д8-К · К-2: the learner said «это имя (здесь)» for this exact place (lexical_resolution_events, verified by the host)
    if (x.forceName && unsure) { keyed = false; card = Object.assign({}, card || {}, { label: "unknown", functionWord: false, pos: "propernoun" }); lx = { cls: "name" }; }
    if (!keyed) {
      // Д8-2: a closed-class word (וְזֶה, כְּשֶׁאַתָּה, בְּכָל — the shared vowel-guarded enrichment, or Dicta's own class)
      // is a function word like זֶה itself: not a learning item, listed under the «служебные слова» checkbox
      var fn = !x.forceName && card && card.label === "function" ? card : null;
      // the same rule as resolveCore: the vowel-guarded enrichment decides a closed-class word; a lexical adverb it knows
      // is a function word only where the device has no Dicta parse to make it a word
      if (!fn && card && !x.forceName) { try { var en = enrichReading(eng, card, surface, niqqud); if (en && en.label === "function" && (!lx || !/adverb/.test(en.gateVia || ""))) fn = en; } catch (_) {} }
      if (!fn && !x.forceName && lx && lx.cls === "function") fn = { meaning: "", procliticPrefix: lx.prefix || "" };
      if (fn) {
        var fk = stripNiqqud(surface || niqqud);
        if (x.func && fk) { var fw = x.func.get(fk); if (!fw) { fw = { surface: surface || fk, niqqud: niqqud, freq: 0, prefix: fn.procliticPrefix || "", gloss: fn.meaning || "", _i: i }; x.func.set(fk, fw); } fw.freq++; }
        return null;
      }
      if (unsure) {
        var sk = stripNiqqud(surface || niqqud);
        if (sk) {
          var u = unsure.get(sk);
          // Д7.3 the group a learner sees: a name, a guess, or not parsed. Д8-К: Dicta's class decides a name both ways
          // (אֶלְחָנָן a name, מְדִינָה a word) where the device has its parse.
          // Д9-B: an acronym Pealim does not read (פַתַ״ח, צה״ל) sits with the names
          var nameS = !!x.nameHint || _ACRONYM_RE.test(String(surface || niqqud || "")) || (lx ? lx.cls === "name"
            : (!!NAME_HINT[sk] || (card && card.pos) === "propernoun" || (card && card.gateVia) === "name"));
          if (!u) { u = { surface: surface || sk, niqqud: niqqud, freq: 0, label: (card && card.label) || "unknown", pos: (card && card.pos) || "", nameSuspect: nameS, dicta: !!lx, occ: [], _i: i }; unsure.set(sk, u); }
          u.freq++; if (Number.isFinite(ri) && Number.isFinite(off) && u.occ.length < 12) u.occ.push({ rowIdx: ri, wordOffset: off });
          if (stats) { stats.u++; if (u.nameSuspect) stats.n++; }
        }
      }
      return null;
    }
    var lk = statusKeyForCard(NA, card, niqqud, surface);
    if (!lk) return null;
    var g = group.get(lk);
    if (!g) {
      var skel = stripNiqqud(card.word || surface);
      g = { lemmaKey: lk, surface: card.word || surface, niqqud: card.niqqud || niqqud, gloss: card.meaning || "", root: card.root || "", pos: card.pos || "", freq: 0,
        nameSuspect: card.label !== "dicta" && !!NAME_HINT[skel], dicta: card.label === "dicta", lemma: card.lemma || "", ambiguous: !!card.ambiguous,
        via: card.identityVia || "", occ: [], _i: i };
      group.set(lk, g);
    }
    g.freq++;
    if (Number.isFinite(ri) && Number.isFinite(off) && g.occ.length < 12) g.occ.push({ rowIdx: ri, wordOffset: off });
    return lk;
  }
  // The same scan over sentence ROWS (no DOM): the Room's he cell is the plain text with the vocalized form
  // aligned to it (wrapMount → alignSurfaceNiqqud), so the pairs and the keys are the Room's own. rows[i] =
  // { he_plain|he, he_niqqud }; rowIdx = the row's index in `rows`. → { group, unsure, rowKeys } — rowKeys[row][word
  // offset] = the lemma key of that word (null: not a confident content word), for painting a whole text.
  async function scanRows(rows, opts) {
    opts = opts || {};
    var group = new Map(), unsure = new Map(), func = new Map(), rowKeys = [], rowStats = [];
    var NA = window.NotesAutoGen;
    var eng; try { eng = opts.engine || await ensureEngine(); } catch (_) { return { group: group, unsure: unsure, func: func, rowKeys: rowKeys, rowStats: rowStats }; }
    try { if (window.PealimFunctionLinks && window.PealimFunctionLinks.ensureReady) await window.PealimFunctionLinks.ensureReady(); } catch (_) {}
    // Д10: rows with an id read their places (the sentence's stored Dicta parse, the learner's decisions)
    try { await ensurePlaces((rows || []).map(function (r) { return r && r.id; }).filter(Boolean)); } catch (_) {}
    var i = 0, t0 = Date.now();
    for (var ri = 0; ri < (rows || []).length; ri++) {
      var row = rows[ri] || {};
      var plain = String(row.he_plain != null ? row.he_plain : row.he || ""), vocal = String(row.he_niqqud || "");
      var pairs, toks;
      if (plain) {
        var aligned = alignSurfaceNiqqud(plain, vocal), w = 0;
        toks = tokenize(plain);
        pairs = toks.filter(function (tk) { return tk.isWord; }).map(function (tk) { var p = aligned[w++] || {}; return [p.surface || tk.text, p.niqqud || ""]; });
      } else { toks = tokenize(vocal); pairs = toks.filter(function (tk) { return tk.isWord; }).map(function (tk) { return [stripNiqqud(tk.text), tk.text]; }); }
      rowKeys[ri] = []; rowStats[ri] = { u: 0, n: 0 };   // per row: unsure tokens, of them name-like (Д7.4 familiarity)
      // Д8-3: a word the tokenizer cut at an ASCII apostrophe (ג'יהאד, החבר'ה) or a dotted acronym (המ.פ., די.אן.איי)
      // is ONE word: the key goes on its first offset, the other parts are not words. A lone letter left over is not a word.
      var units = joinSplitWords(toks, pairs);
      for (var k = 0; k < units.length; k++) {
        var un = units[k];
        if (un.fragment) { for (var z = 0; z < un.span; z++) rowKeys[ri].push(null); i++; continue; }
        rowKeys[ri].push(await _addScannedToken(eng, NA, group, unsure, un.surface, un.niqqud, ri, un.off, i++, rowStats[ri],
          { func: func, forceName: !!(opts.nameAt && opts.nameAt.has(ri + ":" + un.off)), nameHint: !!(opts.nameHintAt && opts.nameHintAt.has(ri + ":" + un.off)),
            place: row.id ? { sid: String(row.id), off: un.off } : null }));
        for (var z2 = 1; z2 < un.span; z2++) rowKeys[ri].push(null);
      }
      if (Date.now() - t0 > 30) { await new Promise(function (r) { setTimeout(r, 0); }); t0 = Date.now(); if (opts.onProgress) opts.onProgress(ri + 1, rows.length); }
    }
    return { group: group, unsure: unsure, func: func, rowKeys: rowKeys, rowStats: rowStats };
  }
  // ── Ф4 · Д7.2 перенос отметок с ключа-написания на лемму (spec F4_D7_FORM_IDENTITY_SPEC_2026_10_14.md) ─────────
  // Once per device, in the background. A mark on a spelling key moves to the lemma only when EVERY vocalized place of
  // that spelling in my texts that keyed to it before (the offline reading) now keys to the SAME pid (Д7.1). Through the
  // canonical setWordStatus (a mark event in the log); the later mark wins a conflict (owner 2026-10-14); the spelling's
  // mark is cleared. A review schedule is NOT moved — it is the fold of the review log by key (sync and the mentor's
  // server replay it); the word's reviews go on under the old key.
  var MIGRATION_KEY = "lp.identityMigration_v1";
  async function migrateSpellingMarks(ldb, opts) {
    opts = opts || {};
    try { if (!opts.force && typeof localStorage !== "undefined" && localStorage.getItem(MIGRATION_KEY)) return null; } catch (_) {}
    if (!ldb || typeof ldb.dbQuery !== "function" || typeof ldb.setWordStatus !== "function") return null;
    var eng = await ensureEngine(), NA = (typeof window !== "undefined" && window.NotesAutoGen) || eng.NA;
    var rows = await ldb.dbQuery("SELECT lemma_key, status, updated_at FROM word_status WHERE status != '' AND lemma_key NOT LIKE 'pid:%' AND lemma_key NOT LIKE 'note:%' AND lemma_key NOT LIKE 'sent:%' AND lemma_key NOT LIKE 'dl:%'", []);
    var bySk = new Map();
    (rows || []).forEach(function (r) {
      var k = String(r.lemma_key || ""), h = k.indexOf("#"), sk = stripNiqqud(h >= 0 ? k.slice(0, h) : k);
      if (!/[א-ת]/.test(sk)) return;
      if (!bySk.has(sk)) bySk.set(sk, []);
      bySk.get(sk).push(r);
    });
    var sum = { at: new Date().toISOString(), candidates: (rows || []).length, moved: 0, conflictLaterSpelling: 0, conflictLaterLemma: 0, ambiguous: 0, noPlace: 0, unchanged: 0 };
    var backup = [];   // every changed row as it was (reversible): spelling key + its mark, lemma key + its previous mark
    if (bySk.size) {
      // one pass over my texts' rows, a page at a time: the vocalized forms of those spellings
      var forms = new Map(), off = 0, PAGE = 1500;
      for (;;) {
        var part = await ldb.dbQuery("SELECT s.he_plain, s.he_niqqud FROM sentences s JOIN texts t ON t.id = s.text_id WHERE s.he_niqqud IS NOT NULL AND s.he_niqqud != '' ORDER BY s.rowid LIMIT ? OFFSET ?", [PAGE, off]);
        if (!part || !part.length) break;
        for (var pi = 0; pi < part.length; pi++) {
          var plain = String(part[pi].he_plain || ""); if (!plain) continue;
          var al = alignSurfaceNiqqud(plain, String(part[pi].he_niqqud || "")), ws = words(plain);
          for (var wi = 0; wi < ws.length; wi++) {
            var pr = al[wi] || {}, sk2 = stripNiqqud(pr.surface || ws[wi]);
            if (!pr.niqqud || !bySk.has(sk2)) continue;
            if (!forms.has(sk2)) forms.set(sk2, new Set());
            if (forms.get(sk2).size < 12) forms.get(sk2).add(pr.niqqud);
          }
        }
        off += part.length;
        await new Promise(function (r) { setTimeout(r, 0); });
        if (part.length < PAGE) break;
      }
      var entries = Array.from(bySk.entries());
      for (var ei = 0; ei < entries.length; ei++) {
        var sk3 = entries[ei][0], list = entries[ei][1], fs = Array.from(forms.get(sk3) || []);
        for (var ri = 0; ri < list.length; ri++) {
          var row = list[ri], oldK = String(row.lemma_key), targets = new Set(), seen = 0;
          for (var fi = 0; fi < fs.length; fi++) {
            var n = fs[fi], before = await _resolveOffline(eng, sk3, n);
            if (statusKeyForCard(NA, before, n, sk3) !== oldK) continue;   // a place of THIS mark only
            seen++;
            targets.add(statusKeyForCard(NA, await resolveCore(eng, sk3, n), n, sk3));
          }
          if (!seen) { sum.noPlace++; continue; }
          if (targets.size !== 1) { sum.ambiguous++; continue; }
          var newK = Array.from(targets)[0];
          if (!newK || newK === oldK || newK.indexOf("pid:") !== 0) { sum.unchanged++; continue; }
          var cur = ((await ldb.dbQuery("SELECT status, updated_at FROM word_status WHERE lemma_key = ?", [newK])) || [])[0];
          backup.push({ from: oldK, status: row.status, at: row.updated_at, to: newK, toStatus: cur ? cur.status : null, toAt: cur ? cur.updated_at : null });
          if (!cur || !cur.status) { await ldb.setWordStatus(newK, row.status); sum.moved++; }
          else if (String(row.updated_at || "") > String(cur.updated_at || "")) { await ldb.setWordStatus(newK, row.status); sum.moved++; sum.conflictLaterSpelling++; }
          else { sum.moved++; sum.conflictLaterLemma++; }
          await ldb.setWordStatus(oldK, "");
        }
      }
    }
    try { if (typeof localStorage !== "undefined") { if (backup.length) localStorage.setItem(MIGRATION_KEY + ".backup", JSON.stringify(backup)); localStorage.setItem(MIGRATION_KEY, JSON.stringify(sum)); } } catch (_) {}
    try { console.info("[identity] spelling marks → lemma:", JSON.stringify(sum)); } catch (_) {}
    return sum;
  }
  // ── Ф4 · Д9.2 marks follow the word the learner saw (docs/planning/word-layer/F4_D9_OWN_ENTRY_SPEC_2026_10_16.md) ─────
  // Д9 re-keys some places (טוֹב: «быть хорошим» → «хороший»). A mark made on the old key was made SEEING those places:
  // where ≥ 80 % of the old key's places in my texts now key to ONE other key, the mark goes there too (the later mark
  // wins a conflict, as Д7.2); where EVERY place moved, the old key's mark is cleared. Below 80 % (יוֹם → הַיּוֹם 37 %)
  // nothing moves. Review schedules stay (Д7.2's rule). Once per device; a backup of every changed row.
  var MIGRATION_D9_KEY = "lp.identityMigrationD9_v1";
  var D9_SHARE = 0.8;
  // opts.places (Д10.2): the same rule for the PLACE keys — «before» = the spelling's key, «after» = the place's key
  // (the sentence's stored Dicta parse, the learner's decisions); its own once-flag lp.identityMigrationD10_v1
  var MIGRATION_D10_KEY = "lp.identityMigrationD10_v1";
  async function migrateIdentityD9(ldb, opts) {
    opts = opts || {};
    var FLAG = opts.places ? MIGRATION_D10_KEY : MIGRATION_D9_KEY;
    try { if (!opts.force && typeof localStorage !== "undefined" && localStorage.getItem(FLAG)) return null; } catch (_) {}
    if (!ldb || typeof ldb.dbQuery !== "function" || typeof ldb.setWordStatus !== "function") return null;
    var eng = opts.engine || await ensureEngine(), NA = (typeof window !== "undefined" && window.NotesAutoGen) || eng.NA;
    var marks = (await ldb.dbQuery("SELECT lemma_key, status, updated_at FROM word_status WHERE status != '' AND lemma_key NOT LIKE 'note:%' AND lemma_key NOT LIKE 'sent:%'", [])) || [];
    var marked = new Map(marks.map(function (r) { return [String(r.lemma_key), r]; }));
    var sum = { at: new Date().toISOString(), marked: marked.size, keysMoving: 0, copied: 0, cleared: 0, conflictLaterOld: 0, conflictLaterNew: 0, belowShare: 0 };
    var backup = [];
    if (marked.size) {
      var total = new Map(), to = new Map(), memo = new Map(), off = 0, PAGE = 1500;
      for (;;) {
        var part = await ldb.dbQuery("SELECT s.id, s.he_plain, s.he_niqqud FROM sentences s JOIN texts t ON t.id = s.text_id ORDER BY s.rowid LIMIT ? OFFSET ?", [PAGE, off]);
        if (!part || !part.length) break;
        if (opts.places) { try { await ensurePlaces(part.map(function (r) { return r.id; })); } catch (_) {} }
        for (var pi = 0; pi < part.length; pi++) {
          var plain = String(part[pi].he_plain || ""), vocal = String(part[pi].he_niqqud || ""), toks, pairs;
          var pdata = opts.places ? _places.get(String(part[pi].id)) : null;
          if (plain) { var al = alignSurfaceNiqqud(plain, vocal), w = 0; toks = tokenize(plain); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { var a = al[w++] || {}; return [a.surface || x.text, a.niqqud || ""]; }); }
          else { toks = tokenize(vocal); pairs = toks.filter(function (x) { return x.isWord; }).map(function (x) { return [stripNiqqud(x.text), x.text]; }); }
          var units = joinSplitWords(toks, pairs) || [];
          for (var ui = 0; ui < units.length; ui++) {
            var un = units[ui]; if (un.fragment) continue;
            var mk = un.surface + "\u0001" + un.niqqud, m = memo.get(mk);
            if (!m) {
              var ko = opts.places ? statusKeyForCard(NA, await resolveCore(eng, un.surface, un.niqqud), un.niqqud, un.surface)
                : statusKeyForCard(NA, await resolveCore(eng, un.surface, un.niqqud, { noD9: true }), un.niqqud, un.surface);
              m = { ko: ko, kn: !opts.places && marked.has(ko) ? statusKeyForCard(NA, await resolveCore(eng, un.surface, un.niqqud), un.niqqud, un.surface) : ko };
              memo.set(mk, m);
            }
            // Д10.2: a place with stored data keys by its place (only those are read twice; not memoized — per place)
            if (opts.places && pdata && marked.has(m.ko) && ((pdata.at && pdata.at.has(un.off)) || (pdata.dec && pdata.dec.has(un.off)))) {
              m = { ko: m.ko, kn: statusKeyForCard(NA, await resolveCore(eng, un.surface, un.niqqud, { place: { sid: String(part[pi].id), off: un.off } }), un.niqqud, un.surface) };
            }
            if (!m.ko || !marked.has(m.ko)) continue;
            total.set(m.ko, (total.get(m.ko) || 0) + 1);
            if (m.kn !== m.ko) { var tm = to.get(m.ko) || new Map(); tm.set(m.kn, (tm.get(m.kn) || 0) + 1); to.set(m.ko, tm); }
          }
        }
        off += part.length;
        if (opts.places) part.forEach(function (r) { _places.delete(String(r.id)); });   // this page is done
        await new Promise(function (r) { setTimeout(r, 0); });
        if (part.length < PAGE) break;
      }
      var froms = Array.from(to.keys());
      for (var fi = 0; fi < froms.length; fi++) {
        var oldK = froms[fi], tm2 = to.get(oldK), n = total.get(oldK) || 0, best = "", bestN = 0;
        tm2.forEach(function (c, k) { if (k && c > bestN) { best = k; bestN = c; } });
        if (!best || !n) continue;
        sum.keysMoving++;
        if (bestN / n < D9_SHARE) { sum.belowShare++; continue; }
        var row = marked.get(oldK), whole = bestN === n;
        var cur = ((await ldb.dbQuery("SELECT status, updated_at FROM word_status WHERE lemma_key = ?", [best])) || [])[0];
        backup.push({ from: oldK, status: row.status, at: row.updated_at, to: best, toStatus: cur ? cur.status : null, toAt: cur ? cur.updated_at : null, share: bestN / n, whole: whole });
        if (!cur || !cur.status) { await ldb.setWordStatus(best, row.status); sum.copied++; }
        else if (String(row.updated_at || "") > String(cur.updated_at || "")) { await ldb.setWordStatus(best, row.status); sum.copied++; sum.conflictLaterOld++; }
        else sum.conflictLaterNew++;
        if (whole) { await ldb.setWordStatus(oldK, ""); sum.cleared++; }
      }
    }
    try { if (typeof localStorage !== "undefined") { if (backup.length) localStorage.setItem(FLAG + ".backup", JSON.stringify(backup)); localStorage.setItem(FLAG, JSON.stringify(sum)); } } catch (_) {}
    try { console.info("[identity] " + (opts.places ? "Д10" : "Д9") + " marks follow the word:", JSON.stringify(sum)); } catch (_) {}
    return sum;
  }
  // ── Ф4 · Д8-К3 одна история слова (docs/planning/word-layer/F4_D8K3_KEY_ALIAS_DESIGN_2026_10_14.md) ──────────────
  // A key that is not a word key (a spelling key `אביו#`, a function form) with a history (reviews, seeds, marks) gets an
  // alias to the ONE key every place of its spelling in my texts gets now (Д7 + the device's Dicta lexicon). The plan
  // writes nothing (R13 dry-run on the owner's profile); apply appends alias events (the log is never rewritten); undo
  // appends the inverse events.
  var ALIAS_KEY = "lp.keyAlias_v1";
  function _isWordKey(k) { return /^(pid:|dl:|note:|sent:)/.test(k); }
  async function planKeyAliases(ldb, opts) {
    opts = opts || {};
    var eng = await ensureEngine(), NA = (typeof window !== "undefined" && window.NotesAutoGen) || eng.NA;
    var progress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};
    var keyRows = (await ldb.dbQuery("SELECT item_key, COUNT(*) AS n, SUM(kind IN ('review','seed')) AS reviews FROM review_log WHERE kind != 'alias' GROUP BY item_key", [])) || [];
    var stRows = (await ldb.dbQuery("SELECT lemma_key AS item_key, status FROM word_status WHERE status != '' OR srs_due IS NOT NULL", [])) || [];
    var aliasMap = typeof ldb.getAliasMap === "function" ? await ldb.getAliasMap() : new Map();
    var cand = new Map();
    keyRows.concat(stRows).forEach(function (r) {
      var k = String(r.item_key || ""); if (!k || _isWordKey(k) || aliasMap.has(k)) return;
      var c = cand.get(k); if (!c) { c = { key: k, rows: 0, reviews: 0 }; cand.set(k, c); }
      c.rows += Number(r.n) || 0; c.reviews += Number(r.reviews) || 0;
    });
    var bySk = new Map();
    cand.forEach(function (c) {
      var h = c.key.indexOf("#"), sk = stripNiqqud(h >= 0 ? c.key.slice(0, h) : c.key);
      if (!/[א-ת]/.test(sk)) return;
      if (!bySk.has(sk)) bySk.set(sk, []);
      bySk.get(sk).push(c);
    });
    // the pointed forms of those spellings in my texts ('' = a row without pointing — the lexicon still reads it)
    var forms = new Map(), off = 0, PAGE = 1500;
    for (;;) {
      var part = await ldb.dbQuery("SELECT s.he_plain, s.he_niqqud FROM sentences s JOIN texts t ON t.id = s.text_id ORDER BY s.rowid LIMIT ? OFFSET ?", [PAGE, off]);
      if (!part || !part.length) break;
      for (var pi = 0; pi < part.length; pi++) {
        var plain = String(part[pi].he_plain || ""); if (!plain) continue;
        var al = alignSurfaceNiqqud(plain, String(part[pi].he_niqqud || "")), ws = words(plain);
        for (var wi = 0; wi < ws.length; wi++) {
          var pr = al[wi] || {}, sk2 = stripNiqqud(pr.surface || ws[wi]);
          if (!bySk.has(sk2)) continue;
          if (!forms.has(sk2)) forms.set(sk2, new Set());
          if (forms.get(sk2).size < 12) forms.get(sk2).add(pr.niqqud || "");
        }
      }
      off += part.length; progress("scan", off);
      await new Promise(function (r) { setTimeout(r, 0); });
      if (part.length < PAGE) break;
    }
    var plan = [], sum = { at: new Date().toISOString(), candidates: cand.size, aliases: 0, toPealim: 0, toDicta: 0, reviewsJoined: 0, ambiguous: 0, noPlace: 0, unchanged: 0 };
    var entries = Array.from(bySk.entries()), done = 0;
    for (var ei = 0; ei < entries.length; ei++) {
      var sk3 = entries[ei][0], list = entries[ei][1], fs = Array.from(forms.get(sk3) || []);
      for (var ci = 0; ci < list.length; ci++) {
        var c3 = list[ci], targets = new Set(), seen = 0;
        for (var fi = 0; fi < fs.length; fi++) {
          var n = fs[fi], before = await _resolveOffline(eng, sk3, n);
          if (statusKeyForCard(NA, before, n, sk3) !== c3.key) continue;   // a place of THIS key only
          seen++;
          targets.add(statusKeyForCard(NA, await resolveCore(eng, sk3, n), n, sk3));
        }
        if (!seen) { sum.noPlace++; continue; }
        if (targets.size !== 1) { sum.ambiguous++; continue; }
        var to = Array.from(targets)[0];
        if (!to || to === c3.key || !/^(pid:|dl:)/.test(to)) { sum.unchanged++; continue; }
        plan.push({ from: c3.key, to: to, rows: c3.rows, reviews: c3.reviews });
        sum.aliases++; sum.reviewsJoined += c3.reviews; if (/^pid:/.test(to)) sum.toPealim++; else sum.toDicta++;
      }
      if (++done % 200 === 0) { progress("resolve", done, entries.length); await new Promise(function (r) { setTimeout(r, 0); }); }
    }
    plan.sort(function (a, b) { return b.reviews - a.reviews || b.rows - a.rows; });
    return { summary: sum, plan: plan };
  }
  async function applyKeyAliases(ldb, plan) {
    var KA = (typeof window !== "undefined" && window.KeyAliasCore) || null;
    if (!KA || !ldb || typeof ldb.appendReviewLog !== "function" || typeof ldb.applyAliasProjection !== "function") throw new Error("ALIAS_UNSUPPORTED");
    var at = new Date().toISOString();
    var rows = (plan || []).map(function (p) { return KA.aliasRow(p.from, p.to, at, "d8k3"); });
    if (!rows.length) return { applied: 0 };
    var touched = await ldb.aliasTouchedKeys(rows);
    var res = await ldb.appendReviewLog(rows);
    var proj = await ldb.applyAliasProjection(touched);
    try { localStorage.setItem(ALIAS_KEY, JSON.stringify({ at: at, applied: rows.length, plan: plan.map(function (p) { return [p.from, p.to]; }) })); } catch (_) {}
    return { applied: res.accepted, refused: res.refused, touched: touched.length, statuses: proj.statuses };
  }
  // ── Ф4 · Д9.3 audit of the applied aliases with the Д9 resolver (spec F4_D9_OWN_ENTRY_SPEC_2026_10_16.md) ──────────
  // The same algorithm as planKeyAliases, over the ACTIVE aliases: keep (the one key is still the target), retarget (every
  // place now gets ONE other word key), undo (no single word key any more). Dry run — writes nothing.
  async function auditKeyAliases(ldb, opts) {
    opts = opts || {};
    var eng = opts.engine || await ensureEngine(), NA = (typeof window !== "undefined" && window.NotesAutoGen) || eng.NA;
    var aliasMap = typeof ldb.getAliasMap === "function" ? await ldb.getAliasMap() : new Map();
    var bySk = new Map();
    aliasMap.forEach(function (to, from) {
      if (!from || to === from) return;
      var h = from.indexOf("#"), sk = stripNiqqud(h >= 0 ? from.slice(0, h) : from);
      if (!/[א-ת]/.test(sk)) return;
      if (!bySk.has(sk)) bySk.set(sk, []);
      bySk.get(sk).push({ from: from, to: to });
    });
    var forms = new Map(), off = 0, PAGE = 1500;
    for (;;) {
      var part = await ldb.dbQuery("SELECT s.he_plain, s.he_niqqud FROM sentences s JOIN texts t ON t.id = s.text_id ORDER BY s.rowid LIMIT ? OFFSET ?", [PAGE, off]);
      if (!part || !part.length) break;
      for (var pi = 0; pi < part.length; pi++) {
        var plain = String(part[pi].he_plain || ""); if (!plain) continue;
        var al = alignSurfaceNiqqud(plain, String(part[pi].he_niqqud || "")), ws = words(plain);
        for (var wi = 0; wi < ws.length; wi++) {
          var pr = al[wi] || {}, sk2 = stripNiqqud(pr.surface || ws[wi]);
          if (!bySk.has(sk2)) continue;
          if (!forms.has(sk2)) forms.set(sk2, new Set());
          if (forms.get(sk2).size < 12) forms.get(sk2).add(pr.niqqud || "");
        }
      }
      off += part.length;
      await new Promise(function (r) { setTimeout(r, 0); });
      if (part.length < PAGE) break;
    }
    var out = [], sum = { at: new Date().toISOString(), aliases: 0, keep: 0, retarget: 0, undo: 0, noPlace: 0 };
    var entries = Array.from(bySk.entries());
    for (var ei = 0; ei < entries.length; ei++) {
      var sk3 = entries[ei][0], list = entries[ei][1], fs = Array.from(forms.get(sk3) || []);
      for (var li = 0; li < list.length; li++) {
        var a = list[li], targets = new Set(), seen = 0;
        sum.aliases++;
        for (var fi = 0; fi < fs.length; fi++) {
          var n = fs[fi], before = await _resolveOffline(eng, sk3, n);
          if (statusKeyForCard(NA, before, n, sk3) !== a.from) continue;
          seen++;
          var t = statusKeyForCard(NA, await resolveCore(eng, sk3, n), n, sk3);
          targets.add(/^(pid:|dl:)/.test(t) ? t : "");
        }
        var verdict = "keep", now = "";
        if (!seen) sum.noPlace++;
        else if (targets.size === 1 && Array.from(targets)[0] === a.to) verdict = "keep";
        else if (targets.size === 1 && Array.from(targets)[0]) { verdict = "retarget"; now = Array.from(targets)[0]; }
        else verdict = "undo";
        sum[verdict]++;
        if (verdict !== "keep") out.push({ from: a.from, to: a.to, now: now, verdict: verdict });
      }
    }
    return { summary: sum, decisions: out };
  }
  // decisions: [{ from, to, now, verdict: retarget|undo }] → alias events (a new target, or «key → itself» = undone); the
  // log is only appended. A backup of the decisions (with the targets before) for a later reversal.
  async function applyAliasAudit(ldb, decisions) {
    var KA = (typeof window !== "undefined" && window.KeyAliasCore) || null;
    if (!KA || !ldb || typeof ldb.appendReviewLog !== "function" || typeof ldb.applyAliasProjection !== "function") throw new Error("ALIAS_UNSUPPORTED");
    var at = new Date().toISOString();
    var rows = (decisions || []).filter(function (d) { return d && (d.verdict === "undo" || (d.verdict === "retarget" && d.now)); })
      .map(function (d) { return d.verdict === "undo" ? KA.aliasRow(d.from, d.from, at, "d9-undo") : KA.aliasRow(d.from, d.now, at, "d9-retarget"); });
    if (!rows.length) return { applied: 0 };
    var touched = await ldb.aliasTouchedKeys(rows);
    var res = await ldb.appendReviewLog(rows);
    var proj = await ldb.applyAliasProjection(touched, { clearWithoutMark: (decisions || []).map(function (d) { return d.to; }) });
    try { localStorage.setItem("lp.aliasAuditD9_v1", JSON.stringify({ at: at, applied: rows.length, decisions: decisions })); } catch (_) {}
    return { applied: res.accepted, refused: res.refused, touched: touched.length, statuses: proj && proj.statuses };
  }
  async function undoKeyAliases(ldb) {
    var KA = (typeof window !== "undefined" && window.KeyAliasCore) || null, last = null;
    try { last = JSON.parse(localStorage.getItem(ALIAS_KEY) || "null"); } catch (_) { last = null; }
    if (!KA || !last || !last.plan || !last.plan.length) return { undone: 0 };
    var at = new Date().toISOString();
    var rows = last.plan.map(function (p) { return KA.aliasRow(p[0], p[0], at, "d8k3-undo"); });
    var touched = await ldb.aliasTouchedKeys(rows);
    var res = await ldb.appendReviewLog(rows);
    await ldb.applyAliasProjection(touched, { clearWithoutMark: last.plan.map(function (p) { return p[1]; }) });
    try { localStorage.setItem(ALIAS_KEY, JSON.stringify({ at: at, undone: rows.length, undoneOf: last.at })); } catch (_) {}
    return { undone: res.accepted };
  }
  async function collectNewWords(mount, statesMap, opts) {
    opts = opts || {};
    var topN = (opts.topN != null) ? Number(opts.topN) : null;   // omit → FULL frontier (caller paginates)
    var states = statesMap || {};
    var group = await _scanWords(mount, opts);
    var arr = [];
    group.forEach(function (g) {
      var st = states[g.lemmaKey];
      if (st === undefined || st === "" || st === "new") arr.push({ word: g, assessment: st === "new" ? "explicit_new" : "unassessed" });
    });
    arr.sort(function (a, b) { return b.word.freq - a.word.freq || a.word._i - b.word._i; });
    if (topN != null && topN >= 0) arr = arr.slice(0, topN);
    return arr.map(function (entry) {
      var g = entry.word;
      return { lemmaKey: g.lemmaKey, surface: g.surface, niqqud: g.niqqud, gloss: g.gloss, root: g.root, pos: g.pos, freq: g.freq, nameSuspect: g.nameSuspect, assessment: entry.assessment };
    });
  }
  // ── Epic 4.3b — recall items (cloze training) ───────────────────────────────
  // ALL confident lemmas of the (scoped) text + asserted status (null when untouched) + explicit
  // assessment (`unassessed` / `explicit_new` / `asserted`) + occurrences (rowIdx+wordOffset, so the caller builds a cloze
  // from the REAL sentence) + freq. Returns the whole set: library-ui filters the SESSION by status
  // (l1–l4 + new + capped known-refresh) AND uses the full list as the morpho-honest distractor pool.
  async function collectReviewItems(mount, statesMap, opts) {
    var states = statesMap || {};
    var group = await _scanWords(mount, opts);
    var arr = Array.from(group.values());
    arr.sort(function (a, b) { return b.freq - a.freq || a._i - b._i; });
    return arr.map(function (g) {
      var stored = states[g.lemmaKey], unset = stored === undefined || stored === "";
      return { lemmaKey: g.lemmaKey, surface: g.surface, niqqud: g.niqqud, gloss: g.gloss, root: g.root, pos: g.pos, freq: g.freq, nameSuspect: g.nameSuspect, status: unset ? null : stored, assessment: unset ? "unassessed" : (stored === "new" ? "explicit_new" : "asserted"), occ: g.occ.slice(0, 8) };
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
      if ((statusMap && statusMap[lk] === "ignore") || e.status === "ignore") continue;
      var due = Number(e.due) || 0;
      if (due <= now) dueNow++;                                 // overdue / due-now scheduled word
      else if (nextDue === null || due < nextDue) nextDue = due;
    }
    return { inProgress: inProgress, dueNow: dueNow, nextDue: nextDue };
  }
  // Retention P5 (recon §6.1) — the due SET for the quiet in-text marker. PURE + deterministic
  // (nowMs injected; Node-testable): the exact per-key mirror of dueCounts.dueNow — scheduled
  // words whose review time has arrived (due<=now), «ignore» excluded — as a Set of lemma keys.
  // decorateWords marks only the exact-confident members; the badge, the D2 queue and this set
  // therefore can never disagree about WHO is due (they all read the same srs_due).
  function dueSetFromSchedule(schedule, statusMap, nowMs) {
    var now = Number(nowMs) || 0, out = new Set();
    if (schedule) for (var lk in schedule) {
      var e = schedule[lk]; if (!e) continue;
      if (String(lk).indexOf('ft1:') === 0 || (statusMap && statusMap[lk] === "ignore") || e.status === "ignore") continue;
      if ((Number(e.due) || 0) <= now) out.add(lk);
    }
    return out;
  }
  // Retention P5.6 (owner fork R-2(a), 2026-07-02) — manual level mark seeds the schedule so the
  // reading-native loop engages WITHOUT the trainer. PURE mapping only (the Room glue owns the
  // writes): l1..l4 → a synthetic SM2 snapshot {interval:I, reps:0, lapses:0} folded through the
  // SAME seedFromSm2 the engine's replay() uses for seed rows — the stored projection is
  // byte-derivable from the seed row alone, so the independent oracle stays closed with ZERO
  // engine changes. known/ignore/new → null (known = cleared, no ring; per owner: NOT seeded).
  // Intervals (R2): the asserted level IS the learner's claim of strength — first check comes
  // sooner for fresh levels (l1 → tomorrow) and later for strong ones (l4 → a week).
  var _MANUAL_SEED_DAYS = { l1: 1, l2: 2, l3: 4, l4: 7 };
  function manualMarkSeed(FC, status, nowMs) {
    if (!FC || typeof FC.seedFromSm2 !== "function") return null;
    var days = _MANUAL_SEED_DAYS[String(status || "")];
    if (!days) return null;
    var now = Number(nowMs) || 0;
    var seedMeta = { interval: days, reps: 0, lapses: 0, scheme: "manual-mark", level: String(status), seedAlgoVersion: 1 };
    var state = FC.seedFromSm2(seedMeta, now);
    return {
      seedMeta: seedMeta,
      sched: { due: FC.dueAt(state), interval: FC.intervalFor(state), reps: state.reps, lapses: state.lapses,
        stability: state.stability, difficulty: state.difficulty, reviewedAt: now, scheme: "fsrs" },
    };
  }
  // Retention P2 — the ONE SM2-lite→FSRS handover step (recon §4.3, owner go 2026-07-02 after the
  // P1.5 shadow-diff). PURE: FC (FsrsCore) is injected — Node gates pass it explicitly, the browser
  // passes window.FsrsCore. `prev` = the extended getSrsSchedule row (or null for a never-tested
  // word). Behavior:
  //   • prev.scheme==='fsrs' → resume the stored DSR state (no re-seed);
  //   • legacy SM2 row (has a schedule, no scheme) → seedFromSm2 AT the review moment (t=0 —
  //     exactly the variant the approved shadow-diff modeled; the caller writes the returned
  //     seedMeta as a 'seed:<key>' review_log row at nowMs−1 so replay's watermark orders it
  //     strictly before this review);
  //   • prev==null → brand-new word, initState via nextState(null,…).
  // Returns null when FC is unavailable (caller falls back to legacy nextSrs — honest degradation,
  // the row simply stays scheme=sm2-lite until FC loads). sched carries the projections the
  // srs_* consumers keep reading (dueCounts/D2/rankByWeakness/leech — consumers-sweep §3.4).
  // D1 (CLG-P6 prep): `correct` also accepts a NUMERIC grade 1..4 (channel-aware policy —
  // grade-policy.js decides, this step schedules with the SAME grade the log row records, so
  // replay==stored holds by construction). Boolean callers are byte-unchanged (true→3, false→1).
  function fsrsStep(FC, prev, correct, nowMs, opts) {
    if (!FC || typeof FC.nextState !== "function") return null;
    var p = prev || null;
    var state = null, seeded = false, seedMeta = null;
    if (p && p.scheme === "fsrs" && typeof p.stability === "number" && p.stability > 0) {
      state = { stability: p.stability, difficulty: p.difficulty, reps: p.reps || 0, lapses: p.lapses || 0,
        lastReviewedAt: p.reviewedAt != null ? p.reviewedAt : null };
    } else if (p && p.due != null) {
      seedMeta = { interval: p.interval || 0, reps: p.reps || 0, lapses: p.lapses || 0, scheme: "sm2-lite", seedAlgoVersion: 1 };
      state = FC.seedFromSm2(seedMeta, nowMs);
      seeded = true;
    }
    var g = (typeof correct === "number") ? Math.max(1, Math.min(4, Math.round(correct))) : (correct ? 3 : 1);
    // T3 — the fuzz seed. The reference's seed strategy reads reps AFTER the increment (verified
    // by instrumenting it), so the ordinal of THIS review is (pre-review reps + 1). The caller
    // supplies the item key; the same string is what the log row lets a reader rebuild, which is
    // why the applied offset is recorded on the event rather than re-derived at replay time.
    var itemKey = opts && opts.itemKey != null ? String(opts.itemKey) : "";
    var fuzzSeed = itemKey ? (itemKey + "_" + (((state && state.reps) || 0) + 1)) : null;
    var next = FC.nextState(state, g, nowMs, fuzzSeed ? { fuzzSeed: fuzzSeed } : null);
    return {
      seeded: seeded, seedMeta: seedMeta, state: next,
      sched: { due: next.dueMs, interval: next.intervalDays, reps: next.reps, lapses: next.lapses,
        stability: next.stability, difficulty: next.difficulty, reviewedAt: nowMs, scheme: "fsrs" },
    };
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
  // D7.1 — month/contribution heatmap fold over the study_day ledger. PURE + deterministic (today is
  // injected; reuses _dayNum/_dayStr so it matches the streak engine and never reads the clock). Returns
  // the last `days` calendar cells ENDING today, each { day, recalls, available, active, rest, isToday,
  // dow (0=Sun..6=Sat), level 0–3 }, plus summary stats. Future-dated rows are excluded by construction
  // (the window ends at today) — R11 do-no-harm. `rest` = an engaged day with nothing due (honest, not 0).
  function studyHeatmap(rows, todayStr, days) {
    days = days > 0 ? days : 84;
    var byDay = {};
    if (Array.isArray(rows)) for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (r && r.day) byDay[r.day] = { recalls: Math.max(0, Number(r.recalls) || 0), available: Math.max(0, Number(r.available) || 0) };
    }
    var td = _dayNum(todayStr);
    if (td === null) return { cells: [], days: 0, maxRecalls: 0, activeDays: 0, totalRecalls: 0, restDays: 0, firstDay: null, lastDay: null };
    var cells = [], maxRecalls = 0, activeDays = 0, totalRecalls = 0, restDays = 0;
    for (var k = days - 1; k >= 0; k--) {
      var dn = td - k, ds = _dayStr(dn), hit = byDay[ds];
      var rec = hit ? hit.recalls : 0, avail = hit ? hit.available : 0;
      if (rec > maxRecalls) maxRecalls = rec;
      if (rec > 0) { activeDays++; totalRecalls += rec; }
      var rest = !!hit && avail === 0 && rec === 0; if (rest) restDays++;
      cells.push({ day: ds, recalls: rec, available: avail, active: rec > 0, rest: rest, isToday: k === 0, dow: ((dn % 7) + 7 + 4) % 7 });
    }
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      c.level = c.recalls <= 0 ? 0 : (maxRecalls <= 0 ? 1 : (c.recalls >= maxRecalls * 0.66 ? 3 : (c.recalls >= maxRecalls * 0.34 ? 2 : 1)));
    }
    return { cells: cells, days: days, maxRecalls: maxRecalls, activeDays: activeDays, totalRecalls: totalRecalls, restDays: restDays,
      firstDay: cells.length ? cells[0].day : null, lastDay: cells.length ? cells[cells.length - 1].day : null };
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
    tokenize: tokenize, words: words, alignSurfaceNiqqud: alignSurfaceNiqqud, scanRows: scanRows, joinSplitWords: joinSplitWords, setDictaLexicon: setDictaLexicon,
    stripNiqqud: stripNiqqud, provenanceLabel: provenanceLabel, resolveCore: resolveCore, relativeStrippedForm: relativeStrippedForm,
    applyLexicalResolution: applyLexicalResolution,
    functionGate: functionGate, pickContextReading: pickContextReading, CONTEXT_GLOSS: CONTEXT_GLOSS,
    // context-overlay shared primitives (bake + runtime lock-step; recon §10)
    RESOLVER_REV: RESOLVER_REV, normSent: normSent, fnv1a: fnv1a, contextPromotionGuard: contextPromotionGuard,
    overlayContext: overlayContext, analysisCandidates: analysisCandidates,
    // gazetteers (single source of truth — proclitic-segment.buildLexicon reads these so the
    // detector's name/function guard never drifts from the resolver's).
    NAME_PROPER: NAME_PROPER, FUNCTION_GLOSS: FUNCTION_GLOSS,
    wrapCellHtml: wrapCellHtml, isWordChar: isWordChar, fadeDecision: fadeDecision,
    fadeGraduationReady: fadeGraduationReady, FADE_GRADUATION_MIN: FADE_GRADUATION_MIN,
    // browser
    ensureEngine: ensureEngine, resolveWordLight: resolveWordLight, resolveForGloss: resolveForGloss,
    resolveLearningTarget: resolveLearningTarget,
    canonForm: canonForm, enrichReading: enrichReading,
    acceptStrictAnswer: acceptStrictAnswer, acceptReadAnswer: acceptReadAnswer, attach: attach,
    setProcliticOverlay: setProcliticOverlay,
    closeSheet: closeSheet, isSheetOpen: isSheetOpen, paintLearningStatus: paintLearningStatus, clearLearningStatus: clearLearningStatus,
    decorateWords: decorateWords, clearDecorations: clearDecorations, collectNewWords: collectNewWords,
    openWordCard: openWordCard,
    // Epic 4.3b — recall-loop / cloze
    collectReviewItems: collectReviewItems, buildCloze: buildCloze, buildClozeForTarget: buildClozeForTarget,
    nextLevel: nextLevel, isMcLevel: isMcLevel, pickDistractors: pickDistractors, nextSrs: nextSrs, fsrsStep: fsrsStep,
    dueCounts: dueCounts, rankByWeakness: rankByWeakness,
    // Retention P5 — reading-native retrieval (quiet due marker + suppressed-marker tally)
    dueSetFromSchedule: dueSetFromSchedule, dueMarkStats: dueMarkStats,
    // Retention P5.6 — owner fork R-2(a): manual l1–l4 mark seeds the schedule (pure mapping)
    manualMarkSeed: manualMarkSeed,
    findSlot: findSlot, buildMcSlotOptions: buildMcSlotOptions, dropProclitic: _dropProcliticNq,
    streakFromDays: streakFromDays, streakView: streakView, studyHeatmap: studyHeatmap,
    STREAK_GOAL_CAP: STREAK_GOAL_CAP, STREAK_GRACE_MAX: STREAK_GRACE_MAX,
    availableChannels: availableChannels,
    // Retention P0 — exported so smoke:memory-canon can assert the LemmaCanon delegate stays
    // byte-identical to the inline fallback (keyer-conformance gate, recon B1).
    statusKeyForCard: statusKeyForCard, migrateSpellingMarks: migrateSpellingMarks, migrateIdentityD9: migrateIdentityD9, setPlaceLoader: setPlaceLoader, invalidatePlaces: invalidatePlaces, ensurePlaces: ensurePlaces, placeOfSpan: placeOfSpan, placeUnits: placeUnits, placeGeneration: placeGeneration, planKeyAliases: planKeyAliases, applyKeyAliases: applyKeyAliases, undoKeyAliases: undoKeyAliases, auditKeyAliases: auditKeyAliases, applyAliasAudit: applyAliasAudit, resolveOffline: _resolveOffline,   // the pre-Д7.1 reading (migration gate)
  };

  if (typeof window !== "undefined") window.ReaderMorph = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
