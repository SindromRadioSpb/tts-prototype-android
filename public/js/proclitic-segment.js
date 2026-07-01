// public/js/proclitic-segment.js — BRR Phase-2/3 · proclitic SEGMENTATION on tap.
//
// The question: a tapped Hebrew word that begins with a proclitic letter (ה ו ב ל כ מ ש)
// — is that letter a live prefix (בַּבַּיִת = ב+ה+בית «in the house») or a ROOT/lexical letter
// (בַּיִת «house», מֹשֶׁה «Moses», בְּיִחוּד «especially»)? This is morphological SEGMENTATION,
// not homograph disambiguation. A wrong split is a do-no-harm (R11) + fabrication (R1)
// violation, so the detector is tuned for PRECISION and ABSTAINS when unsure.
//
// ── Two tiers (ship TOGETHER) ───────────────────────────────────────────────
//   Tier-1 OFFLINE (always, deterministic, no network): a curated fossil/lexeme guard +
//     an ordered FSA peel `ו? → {לכש|כש|מש|ש}? → {ב|ל|כ|מ}? → ה?` with residual-must-be-content
//     and ABSTAIN-on-doubt. Measured existence-precision ≈95% on the frozen R1 gold — HONEST
//     but NOT do-no-harm (≥99). So offline alone NEVER claims confidence — it only HEDGES.
//   Tier-2 OVERLAY (authoritative, bake-time Dicta per-work asset): a `{skeleton → entry}`
//     map precomputed by running Dicta over each baked work (build-proclitic-overlay.js).
//     Dicta's pipe-segmentation + proper-noun POS is authoritative → it kills the offline
//     name/participle false-positives and lifts precision to the ≥99 bar → CONFIDENT.
//
// Precedence inside detect():  fossil-guard ▸ overlay ▸ offline-lexeme-guard ▸ offline-FSA ▸ abstain.
// The fossil guard wins even over the overlay (a lexicalized adverb בֶּאֱמֶת is one word even
// though Dicta mechanically splits ב+אמת — gold says «-»).
//
// ── Additive invariant (byte-parity gate) ───────────────────────────────────
// This module NEVER changes the stem analysis (root/binyan/pos/gloss/status/paint-key). It
// only ADDS a secondary "Приставки" surface. reader-morph.js renders the stem reading exactly
// as before; the proclitic chip-row is layered after it. smoke:reader-proclitic asserts this.
//
// ── Frozen ktiv-skeleton rule (lock-step with build-proclitic-gold.js) ───────
//   skeleton(s) = niqqud-strip → finals-normalized (ך→כ ם→מ ן→נ ף→פ ץ→צ) → doubled-mater
//   collapsed (וו→ו, יי→י). Membership / comparison ONLY, never for display.
//
// Dual export: window.ProcliticSegment (browser) + module.exports (Node gate/producer). PURE —
// no DOM / window / network. The lexicon sets are built once (buildLexicon) and passed in, so
// the SAME detect() runs in the browser render and the Node gate (lock-step → "diffs = bugs").

(function () {
  "use strict";

  // ── skeleton / vowel helpers ────────────────────────────────────────────────
  var NIQQUD_RE = /[֑-ׇ]/g;
  var FINAL = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  function stripNiqqud(s) { return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim(); }
  function finalsToMedial(s) { return String(s || "").split("").map(function (c) { return FINAL[c] || c; }).join(""); }
  function skeleton(s) { return finalsToMedial(stripNiqqud(s)).replace(/וו/g, "ו").replace(/יי/g, "י"); }

  var HE_CONS = /[א-ת]/;
  var PATACH = "ַ", QAMATZ = "ָ", HATAF_PATACH = "ֲ";   // הֲ (hataf-patach) marks the interrogative he, never the article
  // Split a vocalized string into consonant units, each carrying its trailing marks, so the
  // prep consonant's vowel can license a FUSED (unwritten) definite article (בַּ patach → +ה).
  function vowelUnits(nq) {
    var u = [], s = String(nq == null ? "" : nq);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (HE_CONS.test(ch)) u.push({ c: ch, m: "" });
      else if (u.length) u[u.length - 1].m += ch;
    }
    return u;
  }

  // ── proclitic grammar ───────────────────────────────────────────────────────
  // Outer→inner legal order: ו (conj) ▸ subordinator ▸ ONE preposition ▸ article ה.
  var SUBORD = ["לכש", "כש", "מש", "ש"];          // longest-first; lexical units, NOT ל+כ
  var PREP = { "ב": 1, "ל": 1, "כ": 1, "מ": 1 };
  var PROCLITIC_LETTERS = { "ו": 1, "ש": 1, "כ": 1, "ל": 1, "ב": 1, "מ": 1, "ה": 1 };
  function allProclitic(s) { for (var i = 0; i < s.length; i++) if (!PROCLITIC_LETTERS[s[i]]) return false; return s.length > 0; }

  // Russian role label per segment kind (R1-honest, sense-general — POS-specific sense is the
  // 3b «Употребление» store's job; here we name the morpheme, never assert one meaning).
  var SEG_KIND_RU = {
    conj: "союз «и»", "conj-narrative": "повеств. вав (не «и»)",
    subord: "относит./подчинит. ש", prep: "предлог", article: "опред. артикль ה",
    interrog: "вопросит. ה (ли)",
  };

  // Curated FOSSIL stoplist (R1): synchronically single words whose leading letter LOOKS like a
  // proclitic but is lexicalized — suppress live segmentation (gold marks these «-»). These are
  // NOT in the Pealim content lexicon (adverbs/preps), so the lexeme guard alone would miss them.
  var FOSSIL_LIST = [
    "באמת", "ביחוד", "בעיקר", "בעצם", "בכלל", "בערך", "בגלל", "בודאי", "בוודאי", "בהחלט",
    "כמו", "כדי", "כך", "ככה", "כאשר", "כאילו", "כיצד", "כביכול", "כלל", "כמעט", "כנגד", "כעבר",
    "לפי", "לכן", "לכאורה", "למשל", "למען", "לעומת", "לרוב",
    "מפני", "מלבד", "מאחר", "מאד", "מאוד", "מחמת", "מאחורי", "מתוך",
    "בלי", "בלעדי", "בעבור", "בעד", "בתוך", "בפרט", "בפועל",   // NB: «בקרב» dropped — skeleton-collides with productive בִּקְרַב «in combat» (gold id122 = ב+קרב)
    "אבל", "אולם", "אילו",  // ל/א-initial lexicalized — not really proclitic-initial but guarded for safety
  ];

  // ── lexicon (built once from the shipped dataset + the reader-morph gazetteers) ──
  // lemmas: every paradigm lemma skeleton (whole-word guard).
  // content: noun/verb/adjective lemma + cell skeletons (a legal FSA residual must be content).
  // names:   propernoun lemma skeletons ∪ the reader-morph NAME_PROPER gazetteer.
  // cellVA:  verb/adjective inflected-cell skeletons — catches מ-mishkal / ה-binyan whole words
  //          (מוֹרֶה «teacher», הֻרְגַּלְנוּ Hophal) that a bare-lemma guard would miss.
  // func:    the reader-morph FUNCTION_GLOSS closed-class skeletons.
  function buildLexicon(paradigms, opts) {
    opts = opts || {};
    var lemmas = Object.create(null), content = Object.create(null),
      names = Object.create(null), cellVA = Object.create(null), func = Object.create(null), fossil = Object.create(null),
      nominal = Object.create(null);
    var arr = paradigms || [];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i]; if (!p) continue;
      var isContent = p.pos === "noun" || p.pos === "verb" || p.pos === "adjective";
      var isVA = p.pos === "verb" || p.pos === "adjective";
      var isNom = p.pos === "noun" || p.pos === "adjective";
      var ks = [p.lemma_niqqud, p.lemma];
      for (var k = 0; k < ks.length; k++) { var s = skeleton(ks[k]); if (s) { lemmas[s] = 1; if (isContent) content[s] = 1; if (isNom) nominal[s] = 1; } }
      if (p.cells) {
        var cellKeys = Object.keys(p.cells);
        for (var c = 0; c < cellKeys.length; c++) {
          var cell = p.cells[cellKeys[c]]; if (!cell || !cell.he) continue;
          var cs = skeleton(cell.he); if (!cs) continue;
          if (isContent) content[cs] = 1;
          if (isVA) cellVA[cs] = 1;
          if (isNom) nominal[cs] = 1;
        }
      }
      if (p.pos === "propernoun") { var ns = skeleton(p.lemma_niqqud || p.lemma); if (ns) names[ns] = 1; }
    }
    var addAll = function (target, list) { if (list) for (var j = 0; j < list.length; j++) { var v = skeleton(list[j]); if (v) target[v] = 1; } };
    addAll(names, opts.names);
    addAll(func, opts.func);
    addAll(fossil, FOSSIL_LIST);
    addAll(fossil, opts.fossil);
    return { lemmas: lemmas, content: content, nominal: nominal, names: names, cellVA: cellVA, func: func, fossil: fossil };
  }

  function isLexeme(sk, lex) { return !!(lex && (lex.lemmas[sk] || lex.names[sk] || lex.func[sk] || lex.cellVA[sk])); }
  function isContent(sk, lex) { return !!(lex && lex.content[sk]); }
  // nominal = noun/adjective (NOT verb, NOT function). The definite article attaches to nominals
  // only, so this gates the fused-article reconstruction: לַעֲשׂוֹת (ל+infinitive, verb residual) and
  // כָּזֶה (כ+demonstrative, func residual) must NOT reconstruct a ה, but בַּבַּיִת (ב+noun) may.
  function isNominal(sk, lex) { return !!(lex && lex.nominal[sk]); }

  // ── parse enumeration (shared by the offline chooser and the overlay) ────────
  // Enumerate every LEGAL proclitic parse of a skeleton under `ו? subord? prep? ה?`. Each parse
  // = {prefixLen, residual, segments[{letter,kind,start}], hadWrittenArticle}. The caller decides
  // which residual is a real word — offline by lexicon (pick the LONGEST known residual = minimal
  // segmentation, abstain on none); overlay by Dicta's authoritative stem. NOT greedy: greedy
  // over-segments ובאמת→וב and שבין→שב (the stem is already a complete word: a fossil / a
  // function word). Enumerate-then-choose-longest-known-residual fixes that (design §4).
  function enumerateParses(sk) {
    var out = [];
    var vavOpts = sk[0] === "ו" ? ["ו", ""] : [""];
    for (var vi = 0; vi < vavOpts.length; vi++) {
      var vav = vavOpts[vi], r1 = sk.slice(vav.length), i1 = vav.length;
      var subOpts = [""];
      for (var s = 0; s < SUBORD.length; s++) if (r1.length > SUBORD[s].length && r1.slice(0, SUBORD[s].length) === SUBORD[s]) subOpts.push(SUBORD[s]);
      for (var si = 0; si < subOpts.length; si++) {
        var sub = subOpts[si], r2 = r1.slice(sub.length), i2 = i1 + sub.length;
        var prepOpts = (r2.length > 1 && PREP[r2[0]]) ? ["", r2[0]] : [""];
        for (var pi = 0; pi < prepOpts.length; pi++) {
          var prep = prepOpts[pi], r3 = r2.slice(prep.length), i3 = i2 + prep.length;
          var artOpts = (r3.length > 1 && r3[0] === "ה") ? ["", "ה"] : [""];
          for (var ai = 0; ai < artOpts.length; ai++) {
            var art = artOpts[ai], residual = r3.slice(art.length);
            var prefixLen = vav.length + sub.length + prep.length + art.length;
            if (prefixLen === 0 || residual.length < 2) continue;
            var segs = [];
            if (vav) segs.push({ letter: "ו", kind: "conj", start: 0, fused: false });
            if (sub) segs.push({ letter: sub, kind: "subord", start: i1, fused: false });
            if (prep) segs.push({ letter: prep, kind: "prep", start: i2, fused: false });
            if (art) segs.push({ letter: "ה", kind: "article", start: i3, fused: false });
            out.push({ prefixLen: prefixLen, residual: residual, segments: segs, hadWrittenArticle: !!art });
          }
        }
      }
    }
    return out;
  }
  // Is a residual a legitimate STOPPING word (peel no further)? It must be a known lexeme or
  // fossil — EXCEPT a definite-article form: `ה`+(known content) is overwhelmingly «the X» (peel
  // the article), even though `ה`+X may coincidentally be a verb cell (הַמְלֵךְ imperative ↔ הַמֶּלֶךְ
  // «the king»). So an article-over-content residual is NOT a stop → the chooser peels the ה.
  function residualIsStop(R, lex) {
    if (!(isLexeme(R, lex) || (lex && lex.fossil[R]))) return false;
    if (R.length > 3 && R[0] === "ה" && isContent(R.slice(1), lex)) return false;  // «the X» → peel the article
    return true;
  }
  // Offline chooser: among parses whose residual is a stopping word, the LONGEST residual (= minimal
  // peel). So ובאמת stops at the fossil באמת («ו»), שבין at the function word בין («ש»), but
  // ולכשהמלך peels the article to land on מלך («ולכשה»). `bound` (optional) = Dicta's authoritative
  // prefix: the written verdict may only be a PREFIX of it (⊆) — the offline tier can under-claim
  // vs Dicta but NEVER over-peel past its pipe-boundary (do-no-harm: ומסורק stays ⊆ «ו», not «ומ»).
  function chooseOffline(parses, lex, bound) {
    var best = null;
    for (var i = 0; i < parses.length; i++) {
      var p = parses[i];
      if (!residualIsStop(p.residual, lex)) continue;
      if (bound != null) { var w = p.segments.map(function (s) { return s.letter; }).join(""); if (bound.indexOf(w) !== 0) continue; }
      if (!best || p.residual.length > best.residual.length) best = p;
    }
    return best;
  }

  // Reconstruct a FUSED (unwritten) definite article: a preposition vocalized with patach/qamatz
  // (בַּ, לַ, כַּ) carries the swallowed article ה. Adds an `article` segment flagged fused. Done in
  // ONE place so offline + overlay agree (gold encodes it: בבית → «בה»). GUARD (R1 do-no-harm):
  // patach/qamatz on a prep is NOT always article fusion — כָּזֶה (כ+demonstrative) and לַעֲשׂוֹת
  // (ל+infinitive) carry it for other reasons and have NO ה morpheme. The definite article attaches
  // to NOMINALS only, so reconstruct ONLY when the stem residual is a noun/adjective — never a
  // pronoun/demonstrative (func) or a verb/infinitive.
  function reconstructFusedArticle(parsed, units, lex) {
    if (parsed.hadWrittenArticle) return;
    // demonstratives/pronouns that are ALSO noun homographs (אֵלֶּה «these» ↔ אֵלָה «oak») pass the
    // nominal test yet take NO article — exclude any function-word residual first.
    if (lex && lex.func[parsed.residual]) return;
    if (!isNominal(parsed.residual, lex)) return;   // the definite article attaches to nominals only
    var prepSeg = null;
    for (var i = 0; i < parsed.segments.length; i++) if (parsed.segments[i].kind === "prep") prepSeg = parsed.segments[i];
    if (!prepSeg) return;
    var unit = units[prepSeg.start];
    var m = (unit && unit.m) || "";
    if (m.indexOf(PATACH) >= 0 || m.indexOf(QAMATZ) >= 0) {
      parsed.segments.push({ letter: "ה", kind: "article", start: prepSeg.start, fused: true });
    }
  }

  // Narrative vav-consecutive: וַ (vav + patach) on a verb is the wayyiqtol marker, NOT the
  // conjunction «and». We can't prove "verb" offline, so this only RE-LABELS the kind when the
  // niqqud shows וַ; the overlay (Dicta posDicta=verb) confirms it. Render shows «повеств. вав».
  // Needs authoritative VERB evidence — patach on the vav alone is ambiguous (the plain conjunction
  // is וַ before a hataf-patach syllable: וַעֲבוֹדָה «and work», a noun). Fires ONLY when the overlay
  // says the stem is a verb; offline keeps the neutral «союз и» (never a confidently-wrong «не и»).
  function markNarrativeVav(segments, units, isVerb) {
    if (!isVerb || !segments.length || segments[0].kind !== "conj") return;
    var u = units[0]; if (u && (u.m || "").indexOf(PATACH) >= 0) segments[0].kind = "conj-narrative";
  }
  // Interrogative he הֲ (hataf-patach) vs definite article הַ/הָ: the article attaches to nominals and
  // geminates; the interrogative fronts a question (incl. on verbs — הֲיָדַעְתָּ «did you know?», where
  // an article is impossible). enumerateParses labels every leading ה «article» by skeleton; relabel
  // to «interrog» when the niqqud shows hataf-patach (the article never takes it). Niqqud-licensed.
  function markInterrogative(segments, units) {
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i];
      if (s.kind !== "article" || s.fused) continue;
      var u = units[s.start];
      if (u && (u.m || "").indexOf(HATAF_PATACH) >= 0) s.kind = "interrog";
    }
  }

  function verdictOf(segments) {
    // surface order, fused article appended after its prep (peelGrammar pushes prep before the
    // fused ה, so insertion order already matches gold's «בה»/«ולכשה»). Letters only.
    return segments.map(function (s) { return s.letter; }).join("");
  }
  function decorate(segments, niqqud) {
    var units = vowelUnits(niqqud), out = [];
    for (var i = 0; i < segments.length; i++) {
      var s = segments[i];
      // vocalized form for display: the niqqud consonant units the segment spans (skeleton index ===
      // consonant index in the prefix region — no doubled maters before the stem). A FUSED article
      // has no written glyph → show the bare ה. Falls back to the bare letter when niqqud is absent.
      var voc = s.letter;
      if (!s.fused && units.length > s.start) {
        var acc = "";
        for (var k = 0; k < s.letter.length; k++) { var u = units[s.start + k]; if (!u) break; acc += u.c + (u.m || ""); }
        if (acc) voc = acc;
      }
      out.push({ letter: s.letter, voc: voc, kind: s.kind, fused: !!s.fused, role: SEG_KIND_RU[s.kind] || "" });
    }
    return out;
  }

  function NONE(reason, confident) { return { verdict: "-", hasProclitic: false, segments: [], confident: !!confident, source: reason }; }
  function HIT(segments, niqqud, source, confident) {
    return { verdict: verdictOf(segments), hasProclitic: segments.length > 0, segments: decorate(segments, niqqud), confident: !!confident, source: source };
  }

  // ── the detector ─────────────────────────────────────────────────────────────
  // detect(surface, niqqud, { lex, overlay }) → result.
  //   result.verdict        : proclitic letter string ("בה", "ולכשה") or "-" (none/abstain).
  //   result.hasProclitic   : verdict !== "-".
  //   result.segments       : [{ letter, kind, fused, role }] (outer→inner).
  //   result.confident      : true ONLY for an authoritative overlay hit (render tint gate).
  //   result.source         : fossil | overlay-name | overlay-nonseg | overlay | lexeme | offline | abstain | short.
  // overlay (optional, authoritative): { pn?:bool, stem?:string, nonSeg?:bool }. stem is Dicta's
  // base (skeleton or vocalized — skeletonized here). Absent overlay → offline-only (hedged).
  function detect(surface, niqqud, opts) {
    opts = opts || {};
    var lex = opts.lex, overlay = opts.overlay || null;
    var sk = skeleton(surface || niqqud);
    var units = vowelUnits(niqqud);
    if (sk.length < 2) return NONE("short", false);
    if (!PROCLITIC_LETTERS[sk[0]]) return NONE("no-initial", overlay ? true : false);

    // 1) FOSSIL guard — authoritative over everything (incl. the overlay). Lexicalized adverb.
    if ((lex && lex.fossil[sk]) || FOSSIL_LIST.indexOf(stripNiqqud(surface)) >= 0 || FOSSIL_LIST.indexOf(sk) >= 0)
      return NONE("fossil", true);

    // 2) offline WHOLE-WORD guard — a known single morpheme (lemma / verb-adj cell / name /
    // function word) is NEVER a proclitic+stem, even if Dicta mechanically splits it. This beats
    // the overlay so a Dicta mis-segmentation of a real word (שֶׁלְּךָ «yours» → ש+לך) can't surface
    // a false prefix. (A fused-article word like בַּבַּיִת is NOT a whole lexeme → it falls through.)
    if (isLexeme(sk, lex)) return NONE("lexeme", false);

    // 3) OVERLAY (Dicta) — SUPPRESS (whole-word / proper-noun) freely + CONFIRM a KNOWN-stem
    // segmentation (→ confident). It does NOT assert an UNKNOWN-stem split on its own: Dicta drifts
    // on archaic Ben-Yehuda (בִּקַּשְׁתִּיהָ → ב+קשתיה) — those fall through to the hedged offline tier
    // (do-no-harm > recall). Proper-noun suppression fires ONLY when the word is NOT segmented:
    // Dicta tags a token propernoun by its STEM, so בְּאֵירוֹפָּה (ב + name) is propernoun-tagged yet
    // the ב is a LIVE proclitic — suppressing on pn alone would drop every proclitic-before-a-name.
    if (overlay && overlay.pre != null) {
      var pre = skeleton(overlay.pre);   // Dicta's EXPLICIT proclitic prefix (pipe-segmentation), authoritative
      if (pre === "") return NONE("overlay-nonseg", true);        // Dicta: no proclitic → whole word (suppress the offline FP)
      // Dicta stripped `pre`. Confirm ONLY when it matches a legal parse landing on a KNOWN stem —
      // Dicta drifts on archaic Ben-Yehuda (בִּקַּשְׁתִּיהָ → ב+קשתיה), so an unknown stem is NOT asserted;
      // it falls through to the hedged offline tier (do-no-harm > recall).
      if (allProclitic(pre) && sk.length > pre.length && sk.slice(0, pre.length) === pre) {
        var oParses = enumerateParses(sk), oPick = null;
        for (var oi = 0; oi < oParses.length; oi++) {
          if (verdictOf(oParses[oi].segments) === pre && residualIsStop(oParses[oi].residual, lex)) { oPick = oParses[oi]; break; }
        }
        if (oPick) {
          reconstructFusedArticle(oPick, units, lex);
          markInterrogative(oPick.segments, units);
          markNarrativeVav(oPick.segments, units, !!overlay.v);   // narrative vav only on Dicta-verb evidence
          return HIT(oPick.segments, niqqud, "overlay", true);
        }
      }
      // pre present but stem unknown / grouping mismatch → fall through to the hedged offline tier.
    }

    // 4) offline parse — longest known-word residual; abstain otherwise (do-no-harm > recall). When
    // a Dicta pre bounds it (confirm above just failed on an OOV stem), never over-peel past it.
    var bound = (overlay && overlay.pre) ? skeleton(overlay.pre) : null;
    var parsed = chooseOffline(enumerateParses(sk), lex, bound);
    if (parsed) {
      reconstructFusedArticle(parsed, units, lex);
      markInterrogative(parsed.segments, units);
      markNarrativeVav(parsed.segments, units, overlay ? !!overlay.v : false);
      return HIT(parsed.segments, niqqud, "offline", false);   // hedged — NOT confident (≈95%)
    }
    return NONE("abstain", false);
  }

  var API = {
    skeleton: skeleton, stripNiqqud: stripNiqqud, vowelUnits: vowelUnits,
    buildLexicon: buildLexicon, detect: detect,
    enumerateParses: enumerateParses, chooseOffline: chooseOffline, verdictOf: verdictOf,
    SUBORD: SUBORD, PREP: PREP, PROCLITIC_LETTERS: PROCLITIC_LETTERS, FOSSIL_LIST: FOSSIL_LIST,
    SEG_KIND_RU: SEG_KIND_RU,
  };
  if (typeof window !== "undefined") window.ProcliticSegment = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
