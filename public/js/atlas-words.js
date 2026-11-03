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
  // personal places that do not overlap the atlas's own (an atlas term keeps its words)
  function addPersonal(loc, item, terms, refs, RM) {
    function merge(spans, text) {
      if (!text) return spans;
      var taken = [];
      spans.forEach(function (sp) { for (var k = sp.from; k <= sp.to; k++) taken[k] = true; });
      var extra = locateTerms(text, refs, terms, RM).spans.filter(function (sp) {
        for (var k = sp.from; k <= sp.to; k++) if (taken[k]) return false;
        return true;
      });
      return extra.length ? spans.concat(extra).sort(function (a, b) { return a.from - b.from; }) : spans;
    }
    var heSpans = merge(loc.he.spans, item.he);
    var same = item.he_niqqud && wordsOf(item.he_niqqud, RM).length === wordsOf(item.he, RM).length;
    loc.he = { spans: heSpans };
    loc.niqqud = { spans: same || !item.he_niqqud ? heSpans : merge(loc.niqqud.spans, item.he_niqqud) };
  }
  function termAt(spans, offset) {
    for (var i = 0; i < (spans || []).length; i++) if (offset >= spans[i].from && offset <= spans[i].to) return spans[i];
    return null;
  }

  // ---- the verified external place of a word (owner decision E2, 2026-11-02) ----
  // Like the Physics solutions (`reviewed_solution`): the Room's word card keeps a mark's source without writing the
  // atlas into the device's database. The place is the edition of the section + the block + the word; it verifies
  // only against the same loaded edition, so a source never points at a text that has changed.
  var SOURCE_KIND = "atlas_block";
  function sectionContext(atlasId, section, RM) {
    var items = new Map(), order = new Map(), located = new Map(), n = 0, personalRefs = [];
    ((section && section.pages) || []).forEach(function (p) {
      (p.items || []).forEach(function (it) {
        if (!it || !it.id || !String(it.he || "").trim()) return;
        items.set(String(it.id), it); order.set(String(it.id), n++);
      });
    });
    return {
      atlasId: String(atlasId || ""), sectionId: String(section && section.id || ""), RM: RM,
      textKey: "atlas-block-v1:" + atlasId + ":" + (section && section.id) + ":" + String(section && section.content_pack_sha256 || ""),
      terms: (section && section.terms) || {}, items: items, order: order,
      located: function (id) {
        id = String(id);
        if (!located.has(id)) {
          var loc = items.has(id) ? locateBlock(items.get(id), this.terms, RM) : null;
          if (loc && personalRefs.length) addPersonal(loc, items.get(id), this.terms, personalRefs, RM);
          located.set(id, loc);
        }
        return located.get(id);
      },
      // P5 G2 — the learner's own terms (AtlasTrain.mergeTerms): their places are found in every block, they never
      // become a loose «terms of this paragraph» line; a change of the list re-finds the places.
      setPersonal: function (merged) {
        var base = (section && section.terms) || {}, all = Object.assign({}, base);
        personalRefs = [];
        Object.keys(merged || {}).forEach(function (tid) {
          var t = merged[tid];
          if (!t || base[tid]) return;
          all[tid] = t;
          (t.senses || []).forEach(function (sn) { if (sn && sn.sense) personalRefs.push(tid + "#" + sn.sense); });
        });
        this.terms = all;
        located.clear();
      },
    };
  }
  function bareWord(w) { return String(w || "").replace(NIQQUD, "").trim(); }
  function plainWordsOf(text, RM) {
    if (!text || !RM) return [];
    return RM.tokenize(String(text)).filter(function (t) { return t.isWord; }).map(function (t) { return bareWord(t.text); });
  }
  // col: "he" (the plain line) or "niqqud" (the pointed line) — the cell the tapped word belongs to
  function occurrence(ctx, blockId, wordOffset, surface, col) {
    if (!ctx || !ctx.items.has(String(blockId))) return null;
    var it = ctx.items.get(String(blockId)), off = Number(wordOffset), loc = ctx.located(blockId);
    var term = loc && Number.isInteger(off) ? termAt(col === "niqqud" ? loc.niqqud.spans : loc.he.spans, off) : null;
    return Object.freeze({
      source_kind: SOURCE_KIND, atlas_id: ctx.atlasId, section_id: ctx.sectionId,
      text_key: ctx.textKey, text_id: ctx.textKey, sentence_id: String(it.id), order_index: ctx.order.get(String(it.id)),
      word_offset: Number.isInteger(off) ? off : null, col: col === "niqqud" ? "niqqud" : "he", surface: bareWord(surface),
      sentence_he: String(it.he || ""), sentence_he_niqqud: String(it.he_niqqud || ""), sentence_ru: String(it.ru || ""),
      atlas_term: term ? { id: term.id, sense: term.sense } : null,
    });
  }
  // → { textKey, sentenceId, orderIndex, surface } (the source a mark keeps) or null
  function verifyOccurrence(occ, ctx) {
    if (!occ || occ.source_kind !== SOURCE_KIND || !ctx) return null;
    if (occ.text_key !== ctx.textKey || occ.text_id !== ctx.textKey) return null;
    var it = ctx.items.get(String(occ.sentence_id));
    if (!it || ctx.order.get(String(it.id)) !== Number(occ.order_index)) return null;
    var off = Number(occ.word_offset), surface = bareWord(occ.surface);
    if (!Number.isInteger(off) || off < 0 || !surface) return null;
    var plain = plainWordsOf(it.he, ctx.RM)[off], pointed = plainWordsOf(it.he_niqqud, ctx.RM)[off];
    if (surface !== plain && surface !== pointed) return null;
    return { textKey: ctx.textKey, sentenceId: String(it.id), orderIndex: Number(occ.order_index), surface: surface };
  }
  // The reviewed term above the card's dictionary reading → { kicker, title, subtitle, lines } or null (plain text)
  function cardTop(occ, ctx, labels) {
    labels = labels || {};
    var ref = occ && occ.atlas_term, term = ref && ctx && ctx.terms[ref.id];
    if (!term) return null;
    var senses = Array.isArray(term.senses) ? term.senses : [];
    var sense = senses.filter(function (s) { return s && s.sense === ref.sense; })[0] || senses[0] || {};
    var others = senses.filter(function (s) { return s && s !== sense && s.ru; }).map(function (s) { return s.ru; });
    var lines = [sense.ru || ""];
    if (others.length) lines.push((labels.other || "") + (labels.other ? ": " : "") + others.join("; "));
    return { kicker: (term.personal ? labels.mine : labels.kicker) || labels.kicker || "", personal: !!term.personal, title: term.niqqud || term.lemma_he || "",
      subtitle: (labels.script === "cyr" ? term.translit_ru : term.translit) || "", lines: lines.filter(Boolean) };
  }
  // After the card wrapped a row: words of a whole term get .atlas-term; the block's links without a place get one
  // line «Термины абзаца: …» under the translation. Repeating it changes nothing.
  function decorateRow(row, ctx, labels) {
    if (!row || !ctx) return;
    var id = row.getAttribute("data-ref"), loc = id ? ctx.located(id) : null;
    if (!loc) return;
    row.querySelectorAll("[data-col]").forEach(function (cell) {
      var spans = cell.getAttribute("data-col") === "niqqud" ? loc.niqqud.spans : loc.he.spans;
      if (!spans.length) return;
      cell.querySelectorAll(".rm-w[data-w-offset]").forEach(function (w) {
        var t = termAt(spans, Number(w.getAttribute("data-w-offset")));
        if (t) { w.classList.add("atlas-term"); w.setAttribute("data-term", t.id); }
      });
    });
    if (!loc.loose.length || row.querySelector(".atlas-row-terms")) return;
    var doc = row.ownerDocument, line = doc.createElement("div");
    line.className = "atlas-row-terms";
    var label = doc.createElement("span");
    label.className = "atlas-row-terms-label";
    label.textContent = ((labels && labels.terms) || "") + ": ";
    line.appendChild(label);
    loc.loose.forEach(function (ref, i) {
      var term = ctx.terms[ref.id] || {}, senses = term.senses || [];
      var sense = senses.filter(function (s) { return s && s.sense === ref.sense; })[0] || senses[0] || {};
      if (i) line.appendChild(doc.createTextNode(" · "));
      var he = doc.createElement("bdi");
      he.setAttribute("lang", "he"); he.setAttribute("dir", "rtl");
      he.textContent = term.niqqud || term.lemma_he || "";
      line.appendChild(he);
      if (sense.ru) line.appendChild(doc.createTextNode(" — " + sense.ru));
    });
    row.appendChild(line);
  }

  // ---- «В контексте (ИИ)» (owner decision E5): the existing word-gloss-ai-layer-v1, one row per Hebrew block ----
  // The export writes these rows and the reader binds the same rows, so the key an agent echoes back is the key the
  // reader computes (WordGlossAI.rowPayloadFromData: pointed words + translation). Identity = the block id.
  function glossRows(ctx) {
    var out = [];
    if (!ctx) return out;
    ctx.items.forEach(function (it, id) {
      out.push({ id: id, he: String(it.he || ""), he_niqqud: String(it.he_niqqud || ""), ru: String(it.ru || ""), order_index: ctx.order.get(id) });
    });
    return out;
  }
  function bindGlossRow(row, ctx) {
    if (!row || !ctx) return;
    var id = row.getAttribute("data-ref"), it = id && ctx.items.get(id);
    if (!it) return;
    row.__lpLearningRow = { id: id, he: String(it.he || ""), he_niqqud: String(it.he_niqqud || ""), ru: String(it.ru || ""), order_index: ctx.order.get(id) };
    row.setAttribute("data-wg-row", "1");
    row.removeAttribute("data-wg-ai-key"); row.removeAttribute("data-wg-occurrence-key");
  }

  var api = { glossRows: glossRows, bindGlossRow: bindGlossRow, locateTerms: locateTerms, locateBlock: locateBlock, termAt: termAt, skeleton: skeleton, SOURCE_KIND: SOURCE_KIND,
    sectionContext: sectionContext, occurrence: occurrence, verifyOccurrence: verifyOccurrence, cardTop: cardTop, decorateRow: decorateRow };
  root.AtlasWords = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
