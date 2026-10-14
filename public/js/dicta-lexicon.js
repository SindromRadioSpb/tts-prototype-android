// public/js/dicta-lexicon.js — Ф4 · Д8-К: the device's Dicta lexicon.
//
// Spec: docs/planning/word-layer/F4_D8K_ROLE_CRITIQUE_2026_10_14.md («Архитектура реализации»).
// The identity of a word Pealim does not read comes from Dicta's parse of the learner's own texts
// (sentence_morph): spelling → { Dicta lemma, part of speech, class }. Context-free on purpose — the Room's paint,
// a tap, the trainers and «Мой словарь» key a word through the same resolveCore, so they agree by construction.
// Append-only: the first reading of a spelling is its key for good; a later different reading only marks the
// entry ambiguous (a key that changed with every new text would detach the learner's marks).
// Pure; dual export (window.DictaLexicon + module.exports).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DictaLexicon = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NIQQUD_RE = /[֑-ׇ]/g;
  var FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  // closed-class lemmas (measured on two owner texts 2026-10-14: Dicta gives these no part of speech)
  var FUNCTION_LEMMA = { "איזה": 1, "זה": 1, "זאת": 1, "כל": 1, "מה": 1, "מי": 1, "יש": 1, "אין": 1, "הוא": 1, "היא": 1, "הם": 1, "הן": 1, "אני": 1, "אתה": 1, "את": 1, "אנחנו": 1, "של": 1, "עם": 1, "על": 1, "גם": 1, "כן": 1, "לא": 1 };
  var FUNCTION_POS = { pronoun: 1, preposition: 1, conjunction: 1, negation: 1, interrogative: 1, particle: 1, determiner: 1, quantifier: 1 };

  function str(v) { return v == null ? "" : String(v); }
  function strip(s) { return str(s).replace(NIQQUD_RE, "").trim(); }
  // the lookup form of a spelling: Hebrew letters only, finals folded (geresh, apostrophe, dots, maqaf dropped)
  function skeleton(s) { return strip(s).replace(/[^א-ת]/g, "").replace(/[ךםןףץ]/g, function (c) { return FINALS[c]; }); }
  function classOf(pos) {
    pos = str(pos);
    if (pos === "propernoun") return "name";
    if (FUNCTION_POS[pos]) return "function";
    return "content";
  }
  // the same word? — class, and for a word its lemma and part of speech
  function sameReading(e, lemma, pos, cls) {
    if (e.cls !== cls) return false;
    if (cls !== "content") return true;
    return e.lemma === lemma && e.pos === pos;
  }
  // tokens: Dicta's per-word records of one or more sentences ({ word, lemma, posDicta, prefix, niqqud }).
  // → the skeletons whose entry changed (new, count, ambiguity).
  function observe(lex, tokens) {
    var changed = [];
    (tokens || []).forEach(function (t) {
      if (!t) return;
      var sk = skeleton(t.word);
      var pos = str(t.posDicta || t.pos), cls = classOf(pos || null);
      // Dicta leaves some closed-class forms without a part of speech (אֵיזֶשֶׁהוּ, אֵיזוֹשֶׁהִי): their lemma decides
      if (!pos && FUNCTION_LEMMA[strip(t.lemma)]) cls = "function";
      // Dicta gives no lemma for a word it does not know (פּוֹדְקַאסְט, רַבְשַׁ"ץ) but still its stem: the stem stands in,
      // marked (noLemma) — never for a function word
      var lemma = strip(t.lemma), noLemma = false;
      if (!lemma && cls !== "function" && strip(t.stem)) { lemma = strip(t.stem).replace(/['׳"״]/g, ""); noLemma = true; }
      if (sk.length < 2 || !lemma) return;
      var e = lex.get(sk);
      if (!e) {
        e = { sk: sk, lemma: lemma, pos: pos, cls: cls, prefix: strip(t.prefix), nq: str(t.niqqud), n: 1, altN: 0, amb: false, noLemma: noLemma };
        lex.set(sk, e); changed.push(sk); return;
      }
      e.n++;
      if (!sameReading(e, lemma, pos, cls)) { e.altN++; e.amb = true; }
      changed.push(sk);
    });
    return changed;
  }
  // the dictionary key of an entry: only a word (class content) has one; it never collides with Pealim's pid:/lemma#pos
  function keyOf(e) {
    if (!e || e.cls !== "content" || !e.lemma) return "";
    return "dl:" + e.lemma + "#" + str(e.pos);
  }
  function isDictaKey(k) { return /^dl:/.test(str(k)); }
  function parseKey(k) {
    k = str(k); if (!isDictaKey(k)) return null;
    var body = k.slice(3), i = body.lastIndexOf("#");
    return i >= 0 ? { lemma: body.slice(0, i), pos: body.slice(i + 1) } : { lemma: body, pos: "" };
  }
  function lookup(lex, surface) { return lex ? lex.get(skeleton(surface)) || null : null; }
  // the stored row (dicta_lexicon) ↔ the entry
  function toRow(e) { return { skeleton: e.sk, lemma: e.lemma, pos: e.pos, cls: e.cls, prefix: e.prefix, niqqud: e.nq, n: e.n, alt_n: e.altN, no_lemma: e.noLemma ? 1 : 0 }; }
  function fromRows(rows) {
    var lex = new Map();
    (rows || []).forEach(function (r) {
      if (!r || !r.skeleton) return;
      lex.set(String(r.skeleton), { sk: String(r.skeleton), lemma: str(r.lemma), pos: str(r.pos), cls: str(r.cls) || "content", prefix: str(r.prefix),
        nq: str(r.niqqud), n: Number(r.n) || 0, altN: Number(r.alt_n) || 0, amb: (Number(r.alt_n) || 0) > 0, noLemma: !!Number(r.no_lemma) });
    });
    return lex;
  }
  // Fold the sentence_morph rows not folded yet into the stored lexicon, a page at a time; → the lexicon (Map).
  // ldb: { getDictaLexiconRows, getDictaLexiconState, listSentenceMorphSince, saveDictaLexicon } (local-db).
  // A page is parsed and saved before the next is read — one sentence's JSON at a time (the 3.11.760 iPhone lesson).
  var PAGE = 1500;
  async function refresh(ldb, opts) {
    opts = opts || {};
    var lex = fromRows(await ldb.getDictaLexiconRows());
    var last = ((await ldb.getDictaLexiconState()) || {}).lastRowid || 0;
    for (;;) {
      var page = await ldb.listSentenceMorphSince(last, PAGE);
      if (!page || !page.length) break;
      var changed = new Set();
      for (var i = 0; i < page.length; i++) {
        var toks; try { toks = JSON.parse(page[i].tokens_json || "[]"); } catch (_) { toks = []; }
        observe(lex, toks).forEach(function (sk) { changed.add(sk); });
        last = Math.max(last, Number(page[i].rid) || 0);
      }
      await ldb.saveDictaLexicon(Array.from(changed).map(function (sk) { return toRow(lex.get(sk)); }), last);
      if (typeof opts.onPage === "function") { try { await opts.onPage(last); } catch (_) {} }
      if (page.length < PAGE) break;
    }
    return lex;
  }
  return { skeleton: skeleton, classOf: classOf, observe: observe, keyOf: keyOf, isDictaKey: isDictaKey, parseKey: parseKey,
    lookup: lookup, toRow: toRow, fromRows: fromRows, refresh: refresh };
});
