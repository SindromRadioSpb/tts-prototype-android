/* Atlas P4 — the word layer of the engineering atlas (plan ENGINEERING_ATLAS_P4_WORD_LAYER_PLAN_2026_11_02.md).
 * W1: where a block's term links («term#sense», reviewed by the supplier) sit among the words the Room's word card
 * wraps. Offsets are the card's own: the n-th word token of the cell text (ReaderMorph.tokenize), so a span maps
 * onto data-w-offset of the wrapped spans in the plain and in the pointed line alike.
 * Honest rule: only a WHOLE term in the text is a place. Part of a term («גזירה» for «מאמץ גזירה») or a term the
 * text does not contain stays a loose link of the block — never a guessed place.
 * Same code in Node (tests) and the browser. */
(function (root) {
  "use strict";
  var F =
    typeof module === "object" && module.exports
      ? require("./corpus-fts.js")
      : root.CorpusFTS;

  var NIQQUD = /[֑-ׇ]/g;
  var PROCLITIC = /^[ושהבלמכ]+$/;   // ו ש ה ב ל מ כ
  var ENDING = /(ים|ות|יות|ת|ה|י)$/;   // ים ות יות ת ה י

  function skeleton(word) {
    var plain = String(word || "").replace(NIQQUD, "");
    return (F && F.normalizeToken ? F.normalizeToken(plain) : plain) || "";
  }
  function wordsOf(text, RM) {
    if (!text || !RM || typeof RM.tokenize !== "function") return [];
    return RM.tokenize(String(text)).filter(function (t) { return t.isWord; }).map(function (t) { return skeleton(t.text); });
  }
  // the word without up to 3 leading proclitic letters; every word of a term may carry one
  // (a definite construct puts ה on its second word: «מחבר המסמרות»)
  function bare(w) {
    var out = [w];
    for (var i = 1; i <= 3 && i < w.length - 1; i++) if (PROCLITIC.test(w.slice(0, i))) out.push(w.slice(i));
    return out;
  }
  function base(w) { return w.replace(ENDING, ""); }
  function same(textWord, termWord) {
    if (!textWord || !termWord) return false;
    var forms = bare(textWord), b = base(termWord);
    for (var i = 0; i < forms.length; i++) {
      if (forms[i] === termWord) return true;
      if (b.length >= 2 && base(forms[i]) === b) return true;
    }
    return false;
  }
  function parseRef(ref) {
    var s = String(ref || ""), at = s.indexOf("#");
    return at < 0 ? { id: s, sense: "" } : { id: s.slice(0, at), sense: s.slice(at + 1) };
  }

  // → { spans: [{from, to, id, sense}] sorted by from, loose: [{id, sense}] }
  function locateTerms(text, refs, terms, RM) {
    var out = { spans: [], loose: [] };
    if (!Array.isArray(refs) || !refs.length || !terms) return out;
    var words = wordsOf(text, RM), taken = [];
    var list = [], seen = {};
    refs.forEach(function (ref) {
      var r = parseRef(ref), t = terms[r.id];
      if (!t || seen[r.id + "#" + r.sense]) return;
      seen[r.id + "#" + r.sense] = true;
      var lemma = wordsOf(t.lemma_he || t.niqqud, RM);
      if (lemma.length) list.push({ id: r.id, sense: r.sense, lemma: lemma });
    });
    // a longer term first: «מחבר מסמרות» keeps its words from the shorter «מחבר»
    list.sort(function (a, b) { return b.lemma.length - a.lemma.length; });
    list.forEach(function (t) {
      var found = false, n = t.lemma.length;
      for (var i = 0; i + n <= words.length; i++) {
        var ok = true;
        for (var k = 0; k < n && ok; k++) ok = !taken[i + k] && same(words[i + k], t.lemma[k]);
        if (!ok) continue;
        for (k = 0; k < n; k++) taken[i + k] = true;
        out.spans.push({ from: i, to: i + n - 1, id: t.id, sense: t.sense });
        found = true;
        i += n - 1;
      }
      if (!found) out.loose.push({ id: t.id, sense: t.sense });
    });
    out.spans.sort(function (a, b) { return a.from - b.from; });
    return out;
  }
  // A block: places are found in the plain line and carried to the pointed line by word number — the pointed line
  // spells without matres («חִבּוּר» for «חיבור»), its words are the same words. Only when the two lines have a
  // different number of words is the pointed line searched on its own.
  // → { he: {spans}, niqqud: {spans}, loose: [{id, sense}] }
  function locateBlock(item, terms, RM) {
    var refs = item && item.terms, he = locateTerms(item && item.he, refs, terms, RM);
    var niqqud = { spans: [] };
    if (item && item.he_niqqud) {
      niqqud = wordsOf(item.he_niqqud, RM).length === wordsOf(item.he, RM).length
        ? { spans: he.spans } : { spans: locateTerms(item.he_niqqud, refs, terms, RM).spans };
    }
    return { he: { spans: he.spans }, niqqud: niqqud, loose: he.loose };
  }
  function termAt(spans, offset) {
    for (var i = 0; i < (spans || []).length; i++) if (offset >= spans[i].from && offset <= spans[i].to) return spans[i];
    return null;
  }

  var api = { locateTerms: locateTerms, locateBlock: locateBlock, termAt: termAt, skeleton: skeleton };
  root.AtlasWords = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
