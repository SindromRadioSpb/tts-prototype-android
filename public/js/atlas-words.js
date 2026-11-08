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
      // Only editor-reviewed aliases, and only on an explicitly referenced block.
      // This handles source spellings and named synonyms without substring guessing.
      [t.lemma_he || t.niqqud].concat(t.aliases_he || []).forEach(function (form) {
        var lemma = wordsOf(form, RM);
        if (lemma.length) list.push({ id: r.id, sense: r.sense, lemma: lemma });
      });
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
    out.loose = out.loose.filter(function (r, i, all) {
      return !out.spans.some(function (sp) { return sp.id === r.id && sp.sense === r.sense; }) &&
        all.findIndex(function (x) { return x.id === r.id && x.sense === r.sense; }) === i;
    });
    out.spans.sort(function (a, b) { return a.from - b.from; });
    return out;
  }
  // A block: places are found in the plain line and carried to the pointed line by word number — the pointed line
  // spells without matres («חִבּוּר» for «חיבור»), its words are the same words. Only when the two lines have a
  // different number of words is the pointed line searched on its own.
  // → { he: {spans}, niqqud: {spans}, loose: [{id, sense}] }
  function locateBlock(item, terms, RM) {
    var refs = item && item.terms || [];
    // A canonical typo correction/expanded abbreviation is a term-to-source
    // relation, not proof that those canonical words were printed at an offset.
    var looseOnly = refs.filter(function (ref) {
      var t = terms && terms[parseRef(ref).id], kind = t && t.authorial_normalization && t.authorial_normalization.type;
      return t && (t.source_word_span_verified === false || ['explicit_typo_correction','explicit_scientific_typo_correction','verified_abbreviation_expansion_for_reading'].includes(kind));
    });
    refs = refs.filter(function(ref){return looseOnly.indexOf(ref)<0;});
    var he = locateTerms(item && item.he, refs, terms, RM);
    var niqqud = { spans: [] };
    if (item && item.he_niqqud) {
      niqqud = wordsOf(item.he_niqqud, RM).length === wordsOf(item.he, RM).length
        ? { spans: he.spans } : { spans: locateTerms(item.he_niqqud, refs, terms, RM).spans };
    }
    return { he: { spans: he.spans }, niqqud: niqqud, loose: he.loose.concat(looseOnly.map(parseRef)) };
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
  function learningItem(item, purpose) {
    if (!item || item.kind === 'editor_note' || item.kind === 'shared_source_context') return false;
    var policy = item.learning_eligibility;
    if (policy) {
      if (policy.schema !== 'atlas97001.learning-eligibility.1') return false;
      var mode = purpose === 'source_find' ? 'source_find' : purpose === 'term_context' ? 'term_context' : 'lexical';
      if (!policy[mode] || policy[mode].allowed !== true) return false;
      // A readable source can support a location question while its uncertain
      // pointing remains excluded from word cards. Explicit scopes never grant
      // permission to quiz the unknown numerical/linguistic fields beside it.
      if (mode === 'source_find') return item.find_training_eligible === true;
      if (mode === 'term_context') return item.term_context_eligible === true;
    }
    return item.training_eligible !== false && !(item.structure && item.structure.training_eligible === false);
  }
  function sourceContext(section, page, item, field, refs) {
    var group = item.structure && (page.legacy_groups || []).find(function (g) { return g.id === item.structure.parent_ref; });
    var original = (group && group.original) || {};
    var context = { atlas_id: section.atlas_id, section_id: section.id, page: page.page,
      object_id: item.id, field: field, scan: page.image || '',
      limits: page.source_limits || [], coverage_notice: page.coverage_notice || null,
      reviewed_terms: (refs || item.terms || []).map(function (ref) {
        var r = parseRef(ref), t = (section.terms || {})[r.id], sense = t && (t.senses || []).find(function (s) { return s.sense === r.sense; });
        return sense ? { id:r.id, sense:r.sense, he:t.lemma_he, ru:sense.ru, context:sense.context || '' } : null;
      }).filter(Boolean),
      scientific_notes: [item.ambiguity_note, item.note].concat((page.editor || []).filter(function (n) { return n.about === 'page' || n.ref === item.id || (item.structure && n.ref === item.structure.parent_ref); }).map(function (n) { return n.text; })).filter(Boolean) };
    var groupNotes = [original.ambiguity_note, original.note].filter(Boolean);
    if (groupNotes.length) {
      context.group_notes = { ref: group.id, notes: groupNotes };
      context.scientific_notes = Array.from(new Set(context.scientific_notes.concat(groupNotes)));
    }
    // Structural provenance participates in the prepared-layer revision, even if
    // the base content-pack hash and an untouched row's learning identity stay put.
    if (section.structure_revision) context.structure_revision = section.structure_revision;
    if (item.structure) context.structure = item.structure;
    return context;
  }
  // Reviewed table/figure references are real learning places, not fabricated prose.
  // Explicit cell refs keep the original source coordinates and do not scan unrelated words.
  function sectionItems(section, purpose) {
    var out = [], inspection = purpose === 'inspection' && section && section.atlas_id === 'a97001rc32';
    function readable(it) { return it && it.kind !== 'editor_note' && it.kind !== 'shared_source_context'; }
    function allowed(it) { return inspection ? readable(it) : learningItem(it, purpose); }
    ((section && section.pages) || []).forEach(function (page) {
      (page.items || []).forEach(function (it) { if (allowed(it) && it.id && String(it.he || '').trim()) out.push(Object.assign({ page: page.page, source_context: sourceContext(section, page, it, 'he') }, it)); });
    });
    // Append new kinds after the complete legacy sequence. Existing block order_index
    // values, gloss keys and occurrence corrections therefore keep their identities.
    ((section && section.pages) || []).forEach(function (page) {
      // Preserve other published books' row ordering and existing context-layer keys.
      if (!section || !['a97001','a97001rc32'].includes(section.atlas_id)) return;
      (page.tables || []).forEach(function (table) {
        if (!allowed(table)) return;
        (table.cells || []).forEach(function (cell) {
          if (!allowed(cell)) return;
          if (Array.isArray(cell.parts) && cell.parts.length) {
            cell.parts.forEach(function (part) { if (allowed(part) && part.id && String(part.he || '').trim()) out.push(Object.assign({page: page.page, source_ref: table.id, source_context: sourceContext(section, page, part, 'he')}, part)); });
            return;
          }
          if (!/[\u05d0-\u05ea]/.test(String(cell.he || ''))) return;
          out.push({ id: cell.id || table.id + ':cell:' + cell.row + ':' + cell.col, page: page.page,
            source_ref: table.id, source_cell: { row: cell.row, col: cell.col }, type: 'table_cell',
            training_eligible: cell.training_eligible, learning_eligibility: cell.learning_eligibility, term_context_eligible: cell.term_context_eligible, term_context_refs: cell.term_context_refs, he: cell.he, he_niqqud: cell.he_niqqud || cell.he, ru: cell.ru || '', translit: cell.translit || '', translit_ru: cell.translit_ru || '', terms: cell.terms || [], source_context: sourceContext(section, page, table, 'cells[' + cell.row + ',' + cell.col + '].he', cell.terms || []) });
        });
        if ((inspection || table.title_training_eligible !== false) && /[\u05d0-\u05ea]/.test(String(table.title_he || ''))) out.push({ id: table.id + ':title', page: page.page,
          source_ref: table.id, type: 'table_title', he: table.title_he, he_niqqud: table.title_he, ru: table.title_ru || '', terms: table.title_terms || [], source_context: sourceContext(section, page, table, 'title_he', table.title_terms || []) });
      });
      (page.figures || []).forEach(function (figure) {
        if (!allowed(figure)) return;
        if (!inspection && (section.context_exclusions || []).some(function (x) { return x.ref === figure.id && x.field === 'caption_he'; })) return;
        if ((inspection || figure.caption_training_eligible !== false) && /[\u05d0-\u05ea]/.test(String(figure.caption_he || ''))) out.push({ id: figure.id + ':caption', source_ref: figure.id, page: page.page,
          type: 'figure_caption', training_eligible: figure.training_eligible, learning_eligibility: figure.learning_eligibility, term_context_refs: figure.term_context_refs, he: figure.caption_he, he_niqqud: figure.caption_he_niqqud || figure.he_niqqud || figure.caption_he, ru: figure.caption_ru || '', translit: figure.translit || '', translit_ru: figure.translit_ru || '', terms: figure.terms || [], source_context: sourceContext(section, page, figure, 'caption_he') });
      });
    });
    if (purpose === 'term_context') return out.map(function (it) {
      var target = Object.assign({}, it);
      target.terms = (it.term_context_refs || it.terms || []).filter(function (ref) { var term = (section.terms || {})[parseRef(ref).id]; return term && term.training_eligible !== false && !(term.projection_hold_reasons || []).length; });
      if (!learningItem(it)) { target.he_niqqud = ''; target.translit = ''; target.translit_ru = ''; target.ru = ''; }
      target.source_context = Object.assign({}, it.source_context || {}, {learning_target:'verified_term_with_plain_source_context', full_sentence_linguistic_certification:learningItem(it), reviewed_terms:((it.source_context || {}).reviewed_terms || []).filter(function (t) { return target.terms.some(function (r) { return parseRef(r).id === t.id; }); })});
      return target;
    });
    return out;
  }
  function sameSource(a, b) {
    return ['he', 'he_niqqud', 'ru'].every(function (field) { return String(a[field] || '') === String(b[field] || ''); });
  }
  function editionKey(atlasId, sectionId, revision) {
    return 'atlas-block-v1:' + atlasId + ':' + sectionId + ':' + String(revision || '');
  }
  function resolveReference(section, ref) {
    ref = String(ref || '');
    var pages = (section && section.pages) || [];
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i], item = (page.items || []).find(function (it) { return it.id === ref; });
      if (item) return { kind: 'item', ref: ref, page: page.page, item: item };
      var group = (page.legacy_groups || []).find(function (g) { return g.id === ref; });
      if (group) return { kind: 'legacy_group', ref: ref, page: page.page, original: group.original,
        children: (group.children || []).slice(), group: group };
    }
    return null;
  }
  function sectionContext(atlasId, section, RM, options) {
    var purpose = options && options.purpose;
    var items = new Map(), order = new Map(), located = new Map(), personalRefs = [], textKeys = new Map();
    var compatibility = (section && section.occurrence_compatibility) || {}, prior = new Map(), reserved = new Set(), used = new Set(), n = 0;
    // A reviewed overlay can add learning places without moving existing saved
    // occurrences. Each purpose has its own source projection and identity map.
    var scoped = compatibility.purposes && compatibility.purposes[purpose || 'lexical'];
    ((scoped || compatibility).rows || []).forEach(function (row) {
      if (!row || !row.id || !Number.isInteger(row.order_index) || row.order_index < 0 || prior.has(String(row.id)) || reserved.has(row.order_index)) {
        throw new Error('Invalid atlas occurrence compatibility');
      }
      prior.set(String(row.id), row); reserved.add(row.order_index); n = Math.max(n, row.order_index + 1);
      if (scoped && (typeof row.text_key !== 'string' || !row.text_key.startsWith(editionKey(atlasId, section.id, '')) || row.text_key === editionKey(atlasId, section.id, ''))) throw new Error('Invalid atlas occurrence identity');
    });
    var revision = String(section && section.content_pack_sha256 || '') +
      (section && section.structure_revision ? ':structure:' + section.structure_revision : '');
    var currentKey = editionKey(atlasId, section && section.id, revision + (purpose === 'term_context' ? ':term-context' : ''));
    var projectedItems = sectionItems(section, purpose);
    var finalItems = scoped && new Map(projectedItems.map(function (it) { return [it.id, it]; }));
    projectedItems.forEach(function (it) {
        if (!it || !it.id || !String(it.he || "").trim()) return;
        // Existing projections use the last semantic representation of an ID
        // (for example a caption also represented by a block). Reserve it once.
        if (scoped) { if (items.has(String(it.id))) return; it = finalItems.get(it.id); }
        var id = String(it.id), old = prior.get(id), requested = it.structure && it.structure.occurrence_order_index;
        if (!Number.isInteger(requested)) requested = it.legacy_order_index;
        var index = old ? old.order_index : Number.isInteger(requested) && requested >= 0 && !reserved.has(requested) && !used.has(requested) ? requested : n;
        while (used.has(index) || (!old && reserved.has(index))) index++;
        used.add(index); n = Math.max(n, index + 1);
        items.set(id, it); order.set(id, index);
        // Reuse an old source identity only on exact content equality, never merely
        // because an ordinal or id was retained. Split parents are not in this map.
        var unchanged = old && sameSource(old, it) && (scoped || compatibility.source_revision && !(it.structure && it.structure.parent_ref));
        textKeys.set(id, unchanged ? scoped ? old.text_key : editionKey(atlasId, section.id, compatibility.source_revision) : currentKey);
    });
    return {
      atlasId: String(atlasId || ""), sectionId: String(section && section.id || ""), RM: RM,
      textKey: currentKey, textKeys: textKeys,
      terms: (section && section.terms) || {}, items: items, order: order, purpose: purpose || 'lexical',
      resolveReference: function (ref) { return resolveReference(section, ref); },
      located: function (id) {
        id = String(id);
        if (!located.has(id)) {
          var loc = items.has(id) ? locateBlock(items.get(id), this.terms, RM) : null;
          if (loc && personalRefs.length && purpose !== 'term_context') addPersonal(loc, items.get(id), this.terms, personalRefs, RM);
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
    if (ctx.purpose === 'term_context' && (!term || (it.terms || []).indexOf(term.id + '#' + term.sense) < 0)) return null;
    return Object.freeze({
      source_kind: SOURCE_KIND, atlas_id: ctx.atlasId, section_id: ctx.sectionId,
      text_key: ctx.textKeys.get(String(it.id)), text_id: ctx.textKeys.get(String(it.id)), sentence_id: String(it.id), order_index: ctx.order.get(String(it.id)),
      word_offset: Number.isInteger(off) ? off : null, col: col === "niqqud" ? "niqqud" : "he", surface: bareWord(surface),
      sentence_he: String(it.he || ""), sentence_he_niqqud: String(it.he_niqqud || ""), sentence_ru: String(it.ru || ""),
      atlas_term: term ? { id: term.id, sense: term.sense } : null,
      source_context: it.source_context || null,
    });
  }
  // → { textKey, sentenceId, orderIndex, surface } (the source a mark keeps) or null
  function verifyOccurrence(occ, ctx) {
    if (!occ || occ.source_kind !== SOURCE_KIND || !ctx) return null;
    var it = ctx.items.get(String(occ.sentence_id));
    if (!it || ctx.order.get(String(it.id)) !== Number(occ.order_index)) return null;
    var key = ctx.textKeys.get(String(it.id));
    if (occ.text_key !== key || occ.text_id !== key) return null;
    if (['he', 'he_niqqud', 'ru'].some(function (field) { return occ['sentence_' + field] != null && String(occ['sentence_' + field]) !== String(it[field] || ''); })) return null;
    var off = Number(occ.word_offset), surface = bareWord(occ.surface);
    if (!Number.isInteger(off) || off < 0 || !surface) return null;
    var plain = plainWordsOf(it.he, ctx.RM)[off], pointed = plainWordsOf(it.he_niqqud, ctx.RM)[off];
    if (surface !== plain && surface !== pointed) return null;
    return { textKey: key, sentenceId: String(it.id), orderIndex: Number(occ.order_index), surface: surface };
  }
  // Read-only historical inspection. This is deliberately NOT verifyOccurrence:
  // a saved parent mark does not prove that any of its new children were learned.
  function historicalOccurrence(occ, ctx) {
    if (!occ || occ.source_kind !== SOURCE_KIND || !ctx) return null;
    var ref = ctx.resolveReference(occ.sentence_id);
    if (!ref || ref.kind !== 'legacy_group' || !ref.original) return null;
    var key = editionKey(ctx.atlasId, ctx.sectionId, ref.group.source_revision), it = ref.original;
    if (!ref.group.source_revision || occ.text_key !== key || occ.text_id !== key || Number(occ.order_index) !== ref.group.legacy_order_index) return null;
    if (!sameSource(it, { he: occ.sentence_he, he_niqqud: occ.sentence_he_niqqud, ru: occ.sentence_ru })) return null;
    var off = Number(occ.word_offset), surface = bareWord(occ.surface);
    if (!Number.isInteger(off) || off < 0 || !surface || (plainWordsOf(it.he, ctx.RM)[off] !== surface && plainWordsOf(it.he_niqqud, ctx.RM)[off] !== surface)) return null;
    return { kind: 'historical_group', ref: ref.ref, page: ref.page, source_revision: ref.group.source_revision,
      original: it, children: ref.children, learning_eligible: false };
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
    if (typeof term.study_note === "string" && term.study_note.trim()) lines.push(term.study_note.trim());
    return { kicker: (term.personal ? labels.mine : labels.kicker) || labels.kicker || "", personal: !!term.personal, title: term.niqqud || term.lemma_he || "",
      subtitle: (labels.script === "cyr" ? term.translit_ru : term.translit) || "", lines: lines.filter(Boolean) };
  }
  // Source/editorial evidence is available without displacing the term and its
  // meaning. Page-wide notes are not definitions of every word on that page.
  function cardSourceDetails(top, occ, ctx, labels) {
    labels = labels || {};
    top = Object.assign({}, top || {title:''});
    if (!occ || !ctx || !['a97001','a97001rc32'].includes(ctx.atlasId) || !occ.source_context) return top;
    const source = occ.source_context, lines = [(labels.page || 'стр.') + ' ' + source.page];
    const status = ctx.contextLayerStatus;
    if (status && status.covered.has(occ.sentence_id)) {
      lines.push((labels.prepared || 'Подготовлено ИИ') + ': ' + status.producer);
      if (status.coverage_mode === 'partial') lines.push(labels.partial || 'Переведено частично');
    }
    if (source.coverage_notice) lines.push(source.coverage_notice.ru, source.coverage_notice.he);
    lines.push(...(source.scientific_notes || []), ...(source.limits || []).map(x=>x.scope));
    top.details = [{summary:labels.source || 'Источник и ограничения',lines:[...new Set(lines.filter(Boolean))],actions:[{id:'show-source',label:labels.showSource || 'Показать в книге'}]}];
    return top;
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
      out.push({ id: id, he: String(it.he || ""), he_niqqud: String(it.he_niqqud || ""), ru: String(it.ru || ""), order_index: ctx.order.get(id), row_type: it.type || 'block', source_context: it.source_context || null });
    });
    return out;
  }
  function bindGlossRow(row, ctx) {
    if (!row || !ctx) return;
    var id = row.getAttribute("data-ref"), it = id && ctx.items.get(id);
    if (!it) return;
    row.__lpLearningRow = { id: id, he: String(it.he || ""), he_niqqud: String(it.he_niqqud || ""), ru: String(it.ru || ""), order_index: ctx.order.get(id), row_type:it.type || 'block', source_context: it.source_context || null };
    if (ctx.atlasId === 'a97001rc32') row.__lpPreparedContextLookup = function (index, column) {
      const prepared = ctx.preparedContext;
      const AI = root.WordGlossAI || root.window?.WordGlossAI;
      if (!AI) return null;
      const own = AI.lookup(row);
      const answer = prepared && prepared.answers.get(id);
      if (!answer) {
        if (column === 'he') {try {root.AtlasContextContract.describe([row.__lpLearningRow],AI);} catch (_) {return null;}}
        const personal=own?.glosses[index];
        return personal?.manual === true ? Object.assign({},personal,{reading_only:true}) : null;
      }
      // Keep genuine personal corrections at their canonical pointed positions.
      const merged = Object.assign({}, answer, {glosses:answer.glosses.map((g,i)=>own?.glosses[i]?.manual === true ? own.glosses[i] : g)});
      const g = prepared.adapter.lookup(row.__lpLearningRow, merged, column, index);
      const m = column === 'niqqud' && (answer.mwe || []).find(m=>index>=m.from&&index<=m.to);
      return Object.assign({}, g, {model:answer.model, imported:true, wrongHint:!!g.wrong_hint && !g.manual, mwe:m?.gloss || g.mwe || '',
        ...(m?.uncertain ? {uncertain:true,reason:[g.reason,m.reason].filter(Boolean).join('\n')} : {})});
    };
    if (['a97001','a97001rc32'].includes(ctx.atlasId)) row.__lpAllowPreparedGloss = function () {
      return !!(ctx.contextLayerStatus && ctx.contextLayerStatus.covered.has(id));
    };
    row.setAttribute("data-wg-row", "1");
    row.removeAttribute("data-wg-ai-key"); row.removeAttribute("data-wg-occurrence-key");
  }

  var api = { glossRows: glossRows, bindGlossRow: bindGlossRow, locateTerms: locateTerms, locateBlock: locateBlock, termAt: termAt, skeleton: skeleton, SOURCE_KIND: SOURCE_KIND,
    sectionContext: sectionContext, sectionItems: sectionItems, occurrence: occurrence, verifyOccurrence: verifyOccurrence, historicalOccurrence: historicalOccurrence,
    resolveReference: resolveReference, learningItem: learningItem, cardTop: cardTop, cardSourceDetails:cardSourceDetails, decorateRow: decorateRow };
  api.editionContract = 'atlas-97001-structure-4';
  root.AtlasWords = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
