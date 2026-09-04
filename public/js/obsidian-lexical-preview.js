/*
 * LinguistPro -> Obsidian lexical preview (P0, read-only).
 *
 * Pure projection over an existing scoped/full exportBundle payload. It neither
 * opens OPFS nor writes files. Canonical token -> unit and lemma-key behaviour is
 * delegated to notes-autogen.js so the preview cannot invent a second morphology
 * or identity dialect.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./notes-autogen.js"));
  } else {
    root.ObsidianLexicalPreview = factory(root.NotesAutoGen);
  }
})(typeof self !== "undefined" ? self : this, function (NA) {
  "use strict";

  if (!NA || typeof NA.dictaTokenToUnit !== "function" || typeof NA.dedupKey !== "function") {
    throw new Error("ObsidianLexicalPreview requires NotesAutoGen");
  }

  var POS_ORDER = [
    "verb", "noun", "adjective", "participle", "propernoun", "numeral",
    "pronoun", "adverb", "preposition", "conjunction", "particle",
    "interjection", "other", "unknown"
  ];

  var POS_ALIASES = {
    verb: "verb", vb: "verb", auxiliary: "verb", aux: "verb",
    noun: "noun", nn: "noun",
    adjective: "adjective", adj: "adjective",
    participle: "participle", beinoni: "participle",
    propernoun: "propernoun", "proper-noun": "propernoun", propn: "propernoun",
    numeral: "numeral", number: "numeral", num: "numeral",
    pronoun: "pronoun", pron: "pronoun",
    adverb: "adverb", adv: "adverb",
    preposition: "preposition", prep: "preposition", adp: "preposition",
    conjunction: "conjunction", conj: "conjunction", cconj: "conjunction", sconj: "conjunction",
    particle: "particle", part: "particle", det: "particle", article: "particle",
    interrogative: "particle", negation: "particle", relativizer: "particle",
    interjection: "interjection", intj: "interjection",
    other: "other", foreign: "other", x: "other"
  };

  function str(v) { return v == null ? "" : String(v).trim(); }
  function lower(v) { return str(v).toLowerCase().replace(/[ _]+/g, "-"); }
  function stripNiqqud(v) { return str(v).replace(/[\u0591-\u05C7]/g, ""); }
  function finiteNumber(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function parseJson(v) {
    if (!v) return {};
    if (typeof v === "object") return v;
    try { return JSON.parse(String(v)); } catch (_) { return {}; }
  }
  function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
  function sortedObject(counts) {
    var out = {};
    for (var i = 0; i < POS_ORDER.length; i++) out[POS_ORDER[i]] = counts[POS_ORDER[i]] || 0;
    return out;
  }
  function normalizePos(providerPos, kind) {
    if (lower(kind) === "propernoun" || lower(kind) === "proper-noun") return "propernoun";
    var key = lower(providerPos);
    if (!key) return "unknown";
    return POS_ALIASES[key] || "other";
  }
  function contextualPos(notePos, providerPos, kind) {
    var fromProvider = normalizePos(providerPos, kind);
    var fromNote = normalizePos(notePos, kind);
    // sentence_morph is the context evidence. It must retain precise function,
    // numeral and proper-name classes when an older word note only says
    // "function", "noun", or another coarse class.
    if (fromProvider !== "unknown" && fromProvider !== "other") return fromProvider;
    if (fromNote !== "unknown" && fromNote !== "other") return fromNote;
    return fromProvider === "other" || fromNote === "other" ? "other" : "unknown";
  }
  var CONTENT_POS = new Set(["verb", "noun", "adjective", "participle"]);
  var FUNCTION_POS = new Set(["pronoun", "adverb", "preposition", "conjunction", "particle", "interjection"]);
  function identityFamily(pos) {
    if (CONTENT_POS.has(pos)) return "content";
    if (FUNCTION_POS.has(pos)) return "function";
    if (pos === "propernoun") return "propernoun";
    if (pos === "numeral") return "numeral";
    return "unknown";
  }
  function identityGuardReason(notePos, contextPos, paradigmPos) {
    var noteClass = normalizePos(notePos, "");
    var paradigmClass = normalizePos(paradigmPos, "");
    if (contextPos === "propernoun" && noteClass !== "propernoun") return "propernoun-vs-dictionary-sense";
    if (contextPos === "numeral" && noteClass !== "numeral" && noteClass !== "unknown" && noteClass !== "other") return "numeral-vs-other-sense";
    if (FUNCTION_POS.has(contextPos) && CONTENT_POS.has(noteClass)) return "function-vs-content-sense";
    if (CONTENT_POS.has(contextPos) && FUNCTION_POS.has(noteClass)) return "content-vs-function-sense";
    if (identityFamily(contextPos) !== "unknown" &&
        paradigmClass !== "unknown" && paradigmClass !== "other" &&
        identityFamily(paradigmClass) !== identityFamily(contextPos)) {
      return "context-vs-pealim-pos";
    }
    return "";
  }
  function pickText(texts, opts) {
    opts = opts || {};
    var byId = str(opts.textId);
    var byTitle = str(opts.title).toLocaleLowerCase();
    if (byId) return texts.find(function (t) { return str(t.text_id || t.id) === byId; }) || null;
    if (byTitle) return texts.find(function (t) { return str(t.title).toLocaleLowerCase().includes(byTitle); }) || null;
    if (texts.length === 1) return texts[0];
    return null;
  }
  function confidenceBand(value) {
    if (value == null) return "missing";
    if (value >= 0.9) return ">=0.9";
    if (value >= 0.8) return "0.8-0.9";
    if (value >= 0.6) return "0.6-0.8";
    return "<0.6";
  }
  function bestLinkedNote(noteIds, noteById) {
    var rows = noteIds.map(function (id) { return noteById.get(str(id)); }).filter(Boolean);
    rows.sort(function (a, b) {
      var ac = a.gen_dedup_key ? 1 : 0, bc = b.gen_dedup_key ? 1 : 0;
      if (ac !== bc) return bc - ac;
      var aw = a.note_type === "word_study" ? 1 : 0, bw = b.note_type === "word_study" ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return str(a.id).localeCompare(str(b.id));
    });
    return rows[0] || null;
  }
  function addSet(map, key, value) {
    value = str(value);
    if (!value) return;
    if (!map[key]) map[key] = new Set();
    map[key].add(value);
  }
  function serialiseSetMap(map) {
    var out = {};
    Object.keys(map).sort().forEach(function (key) { out[key] = Array.from(map[key]).sort(); });
    return out;
  }
  function yaml(v) { return JSON.stringify(v == null ? "" : v); }
  function fnv1a(value) {
    var h = 0x811c9dc5;
    var s = str(value);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  function safeLexemeFileName(id, lemma) {
    var pid = str(id).match(/^pid:([0-9]+)$/);
    if (pid) return "pid-" + pid[1] + ".md";
    var slug = stripNiqqud(lemma).replace(/[\\/:*?"<>|#\[\]]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^[ .-]+|[ .-]+$/g, "").slice(0, 32);
    if (!slug) slug = "lexeme";
    return slug + "-" + fnv1a(id) + ".md";
  }
  function utf8Bytes(value) {
    var s = String(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }
  function posViewName(pos) {
    return ({
      verb: "Глаголы", noun: "Существительные", adjective: "Прилагательные",
      participle: "Причастия", propernoun: "Имена собственные", numeral: "Числительные",
      pronoun: "Местоимения", adverb: "Наречия", preposition: "Предлоги",
      conjunction: "Союзы", particle: "Частицы", interjection: "Междометия",
      other: "Другое", unknown: "Требуют разбора"
    })[pos] || pos;
  }
  function renderBase(report) {
    var textId = yaml(report.text.text_id);
    var lines = [
      "filters:",
      "  and:",
      "    - file.inFolder(\"_LinguistPro/lexemes\")",
      "    - note.lp_text_ids.contains(" + textId + ")",
      "properties:",
      "  note.lemma:",
      "    displayName: Лемма",
      "  note.lp_pos:",
      "    displayName: Часть речи",
      "  note.meaning_ru:",
      "    displayName: Значение",
      "  note.occurrence_count:",
      "    displayName: Вхождений",
      "views:"
    ];
    function view(name, filter) {
      lines.push("  - type: table", "    name: " + yaml(name));
      if (filter) lines.push("    filters:", "      and:", "        - " + filter);
      lines.push("    order:", "      - note.lemma", "      - note.meaning_ru", "      - note.occurrence_count", "      - note.confidence_min");
    }
    view("Все слова", "note.lp_pos != \"unknown\"");
    POS_ORDER.forEach(function (pos) { view(posViewName(pos), "note.lp_pos == " + yaml(pos)); });
    view("Неоднозначные", "note.ambiguity == true");
    view("Конфликты", "note.conflict_count > 0");
    return lines.join("\n") + "\n";
  }
  function renderLexemeMarkdown(report, lexeme) {
    var lines = [
      "---",
      "type: lp-lexeme",
      "lp_schema: 1",
      "lp_lexeme_id: " + yaml(lexeme.lp_lexeme_id),
      "lemma: " + yaml(lexeme.lemma),
      "lemma_unpointed: " + yaml(lexeme.lemma_unpointed),
      "lp_pos: " + yaml(lexeme.lp_pos),
      "provider_pos: " + yaml(lexeme.provider_pos),
      "root: " + yaml(lexeme.root),
      "binyan: " + yaml(lexeme.binyan),
      "meaning_ru: " + yaml(lexeme.meaning_ru),
      "pealim_id: " + yaml(lexeme.pealim_id),
      "confidence_min: " + (lexeme.confidence_min == null ? "null" : lexeme.confidence_min),
      "confidence_max: " + (lexeme.confidence_max == null ? "null" : lexeme.confidence_max),
      "ambiguity: " + (lexeme.ambiguity ? "true" : "false"),
      "conflict_count: " + lexeme.conflicts.length,
      "verification_state: generated",
      "lp_text_ids: " + yaml([report.text.text_id]),
      "occurrence_count: " + lexeme.occurrence_count,
      "managed_by: linguistpro",
      "---",
      "",
      "# " + (lexeme.lemma || lexeme.lemma_unpointed || lexeme.lp_lexeme_id),
      "",
      lexeme.meaning_ru ? "**Значение:** " + lexeme.meaning_ru : "**Значение:** —",
      "",
      "## В этом тексте",
      ""
    ];
    lexeme.occurrences.forEach(function (occ) {
      lines.push("- `" + occ.row_id + ":" + occ.word_offset + "` " + (occ.niqqud || occ.surface) + " — " + (occ.sentence_he_niqqud || occ.sentence_he || "") + (occ.sentence_ru ? " — " + occ.sentence_ru : ""));
    });
    if (lexeme.conflicts.length) {
      lines.push("", "> [!warning] Требует проверки", "> Конфликтующие поля: " + lexeme.conflicts.join(", ") + ".");
    }
    return lines.join("\n") + "\n";
  }
  function renderTextHub(report) {
    return [
      "---",
      "type: lp-text",
      "lp_schema: 1",
      "lp_text_id: " + yaml(report.text.text_id),
      "lp_text_key: " + yaml(report.text.text_key),
      "title: " + yaml(report.text.title),
      "managed_by: linguistpro",
      "---",
      "",
      "# " + report.text.title,
      "",
      "![[Лексика.base]]",
      ""
    ].join("\n");
  }
  function renderSnapshot(report, pathById) {
    var byPos = {};
    POS_ORDER.forEach(function (pos) { byPos[pos] = []; });
    report.lexemes.forEach(function (lexeme) { byPos[lexeme.lp_pos].push(lexeme); });
    var lines = ["# Лексика — переносимый снимок", "", "> Generated reference index. Редактировать исходные lp-lexeme файлы вручную не следует.", ""];
    POS_ORDER.forEach(function (pos) {
      if (!byPos[pos].length) return;
      lines.push("## " + posViewName(pos), "");
      byPos[pos].forEach(function (lexeme) {
        var label = lexeme.lemma || lexeme.lemma_unpointed || lexeme.lp_lexeme_id;
        lines.push("- [[" + pathById.get(lexeme.lp_lexeme_id).replace(/\.md$/, "") + "|" + label + "]]" + (lexeme.meaning_ru ? " — " + lexeme.meaning_ru : ""));
      });
      lines.push("");
    });
    return lines.join("\n");
  }
  function renderOccurrencesTsv(report) {
    var rows = [["lp_lexeme_id", "lp_pos", "lemma", "row_id", "order_index", "word_offset", "surface", "niqqud", "sentence_he", "sentence_ru"]];
    function cell(v) { return str(v).replace(/\t/g, " ").replace(/[\r\n]+/g, " "); }
    report.lexemes.forEach(function (lexeme) {
      lexeme.occurrences.forEach(function (occ) {
        rows.push([lexeme.lp_lexeme_id, lexeme.lp_pos, lexeme.lemma, occ.row_id, occ.order_index, occ.word_offset, occ.surface, occ.niqqud, occ.sentence_he_niqqud || occ.sentence_he, occ.sentence_ru]);
      });
    });
    return rows.map(function (row) { return row.map(cell).join("\t"); }).join("\n") + "\n";
  }
  function planObsidianPackage(report) {
    if (!report || report.schema !== "linguistpro-obsidian-lexical-preview-v1") throw new Error("A lexical preview report is required");
    var root = "_LinguistPro/texts/" + report.text.text_id + "/";
    var pathById = new Map(), usedPaths = new Set();
    report.lexemes.forEach(function (lexeme) {
      var name = safeLexemeFileName(lexeme.lp_lexeme_id, lexeme.lemma_unpointed || lexeme.lemma);
      var path = "_LinguistPro/lexemes/" + name;
      if (usedPaths.has(path)) throw new Error("Lexeme path collision: " + path);
      usedPaths.add(path); pathById.set(lexeme.lp_lexeme_id, path);
    });
    var files = [];
    function add(path, content, kind) { files.push({ path: path, kind: kind, bytes: utf8Bytes(content), content: content }); }
    report.lexemes.forEach(function (lexeme) { add(pathById.get(lexeme.lp_lexeme_id), renderLexemeMarkdown(report, lexeme), "lexeme"); });
    var base = renderBase(report);
    add(root + "Текст.md", renderTextHub(report), "text");
    add(root + "Лексика.base", base, "base");
    add(root + "Лексика — переносимый снимок.md", renderSnapshot(report, pathById), "snapshot");
    add(root + "occurrences.tsv", renderOccurrencesTsv(report), "occurrences");
    add(root + "projection.json", JSON.stringify(report, null, 2) + "\n", "projection");
    var beforeReceiptBytes = files.reduce(function (sum, file) { return sum + file.bytes; }, 0);
    var receipt = {
      schema: "linguistpro-obsidian-receipt-v1", read_only_preview: true,
      text_id: report.text.text_id, would_create_files: files.length + 1,
      would_write_bytes_before_receipt: beforeReceiptBytes,
      source_counts: report.counts
    };
    add(root + "receipt.json", JSON.stringify(receipt, null, 2) + "\n", "receipt");
    files.sort(function (a, b) { return a.path.localeCompare(b.path); });
    var byKind = {};
    files.forEach(function (file) { byKind[file.kind] = (byKind[file.kind] || 0) + 1; });
    return {
      schema: "linguistpro-obsidian-package-plan-v1", read_only: true,
      text_id: report.text.text_id,
      would_create_files: files.length,
      would_write_bytes: files.reduce(function (sum, file) { return sum + file.bytes; }, 0),
      files_by_kind: byKind,
      base_preview: base,
      files: files
    };
  }

  function analyzeBundle(payload, opts) {
    opts = opts || {};
    var library = payload && payload.library ? payload.library : (payload || {});
    var advanced = payload && (payload.notes_advanced || payload.advanced) || {};
    var texts = Array.isArray(library.texts) ? library.texts : [];
    var text = pickText(texts, opts);
    if (!text) {
      throw new Error(texts.length > 1
        ? "Select exactly one text with textId or title"
        : "No matching text in bundle");
    }

    var textId = str(text.text_id || text.id);
    var rows = Array.isArray(text.rows) ? text.rows : [];
    var rowById = new Map();
    rows.forEach(function (row) { rowById.set(str(row.row_id || row.id), row); });

    var notes = Array.isArray(advanced.notes) ? advanced.notes : [];
    var noteById = new Map();
    notes.forEach(function (note) { noteById.set(str(note.id), note); });

    var occurrenceNoteIds = new Map();
    var exportedOccurrences = Array.isArray(advanced.occurrences) ? advanced.occurrences : [];
    exportedOccurrences.forEach(function (occ) {
      if (str(occ.text_id) && str(occ.text_id) !== textId) return;
      var sid = str(occ.sentence_id);
      if (!sid || !rowById.has(sid)) return;
      var key = sid + "\u0000" + str(occ.word_offset);
      if (!occurrenceNoteIds.has(key)) occurrenceNoteIds.set(key, []);
      occurrenceNoteIds.get(key).push(occ.note_id);
    });

    var morphRows = (Array.isArray(advanced.sentence_morph) ? advanced.sentence_morph : [])
      .filter(function (sm) {
        return str(sm.text_id) === textId || (!str(sm.text_id) && rowById.has(str(sm.sentence_id)));
      })
      .sort(function (a, b) { return str(a.sentence_id).localeCompare(str(b.sentence_id)); });

    var morphBySentence = new Map();
    morphRows.forEach(function (sm) { morphBySentence.set(str(sm.sentence_id), sm); });

    var lexemeMap = new Map();
    var providerPosValues = {};
    var resolutionChannels = {};
    var confidenceBands = { ">=0.9": 0, "0.8-0.9": 0, "0.6-0.8": 0, "<0.6": 0, missing: 0 };
    var occurrencePos = {};
    var completeness = { lemma: 0, pos: 0, niqqud: 0, root: 0, binyan: 0, pealim_id: 0 };
    var applicable = { root: 0, binyan: 0 };
    var totalTokens = 0, analyzedOccurrences = 0, skippedTokens = 0;
    var ambiguousOccurrences = 0, ambiguitySignalOccurrences = 0;
    var identityGuardedOccurrences = 0;
    var identityGuardReasons = {};
    var unknownOccurrences = 0, linkedOccurrences = 0;

    morphRows.forEach(function (sm) {
      var sid = str(sm.sentence_id);
      var row = rowById.get(sid) || {};
      var tokens = Array.isArray(sm.tokens) ? sm.tokens : [];
      totalTokens += tokens.length;
      tokens.forEach(function (token, offset) {
        var unit = NA.dictaTokenToUnit(token);
        if (!unit) { skippedTokens++; return; }
        analyzedOccurrences++;

        var occKey = sid + "\u0000" + String(offset);
        var linked = bestLinkedNote(occurrenceNoteIds.get(occKey) || [], noteById);
        var body = linked ? parseJson(linked.body_json || linked.body) : {};
        if (linked) linkedOccurrences++;

        var providerPos = str(token.posDicta || token.pos || unit.pos);
        var notePos = str(body.pos || body.part_of_speech);
        var pos = contextualPos(notePos, providerPos, token.kind || unit.kind);
        var lemma = str(body.lemma || unit.lemma || unit.stem || unit.sampleWord);
        var word = str(body.word || unit.sampleWord);
        var niqqud = str(body.niqqud_variant || unit.niqqud || token.niqqud);
        var root = str(body.root || "");
        var binyan = str(body.binyan || unit.binyan || "");
        var meaning = str(body.meaning);
        var pealimId = str(body.pealim_id || "");
        var confidence = finiteNumber(linked && linked.confidence != null ? linked.confidence : token.confidence);
        var bodyHasAmbiguity = Object.prototype.hasOwnProperty.call(body, "ambiguous") || Array.isArray(body.alts);
        var tokenHasAmbiguity = Object.prototype.hasOwnProperty.call(token, "ambiguous") || Array.isArray(token.alts);
        var resolverResult = null, resolverEvaluated = false;
        if (typeof opts.ambiguityResolver === "function") {
          resolverEvaluated = true;
          try { resolverResult = opts.ambiguityResolver(unit) || null; } catch (_) { resolverResult = null; }
        }
        var hasAmbiguitySignal = bodyHasAmbiguity || tokenHasAmbiguity || resolverEvaluated;
        var alternatives = Array.isArray(body.alts) ? body.alts : (Array.isArray(token.alts) ? token.alts : []);
        if (!alternatives.length && resolverResult && Array.isArray(resolverResult.alts)) alternatives = resolverResult.alts;
        var ambiguous = hasAmbiguitySignal && !!(body.ambiguous || token.ambiguous || alternatives.length || (resolverResult && resolverResult.ambiguous));
        var channel = str(body.resolution_channel || body.channel || (linked && linked.source) || "raw-morph");

        // A dictionary note can be correct for its own sense and still be wrong
        // for this context (נטע person vs נטע plant; דרך preposition vs noun).
        // Fail closed: preserve the candidate in evidence, but do not export its
        // Pealim/root/meaning as the contextual lexeme identity.
        var pealimEvidence = null;
        if (pealimId && typeof opts.pealimResolver === "function") {
          try { pealimEvidence = opts.pealimResolver(pealimId) || null; } catch (_) { pealimEvidence = null; }
        }
        var guardReason = identityGuardReason(notePos, pos, pealimEvidence && pealimEvidence.pos);
        var candidateEvidence = guardReason ? {
          pealim_id: pealimId, root: root, meaning: meaning, note_pos: notePos,
          pealim_pos: str(pealimEvidence && pealimEvidence.pos),
          note_dedup_key: str(linked && linked.gen_dedup_key)
        } : null;
        if (guardReason) {
          identityGuardedOccurrences++;
          identityGuardReasons[guardReason] = (identityGuardReasons[guardReason] || 0) + 1;
          lemma = str(unit.lemma || unit.stem || unit.sampleWord);
          root = ""; binyan = ""; meaning = ""; pealimId = "";
        }

        // Reference export is per sense-lemma even when the stored note was
        // deliberately generated per surface form (ff:*). Use the shared
        // downstream lemmaKey, never copy the per-form note identity as the
        // Obsidian lexeme identity.
        var keyBody = { word: word, lemma: lemma, pos: pos, part_of_speech: pos };
        if (pealimId) keyBody.pealim_id = pealimId;
        var key = pos === "propernoun" ? "name:" + stripNiqqud(lemma || word)
          : (guardReason ? "ctx:" + stripNiqqud(lemma || word) + "#" + pos : NA.lemmaKey(keyBody));
        if (!key || key === "#" || key === "#unknown") key = "unknown:" + sid + ":" + offset;

        occurrencePos[pos] = (occurrencePos[pos] || 0) + 1;
        addSet(providerPosValues, pos, providerPos || "(missing)");
        resolutionChannels[channel] = (resolutionChannels[channel] || 0) + 1;
        confidenceBands[confidenceBand(confidence)]++;
        if (lemma) completeness.lemma++;
        if (pos !== "unknown") completeness.pos++; else unknownOccurrences++;
        if (niqqud) completeness.niqqud++;
        if (root) completeness.root++;
        if (binyan) completeness.binyan++;
        if (pealimId) completeness.pealim_id++;
        if (pos === "verb" || pos === "noun" || pos === "adjective" || pos === "participle") applicable.root++;
        if (pos === "verb") applicable.binyan++;
        if (hasAmbiguitySignal) ambiguitySignalOccurrences++;
        if (ambiguous) ambiguousOccurrences++;

        var item = lexemeMap.get(key);
        if (!item) {
          item = {
            lp_lexeme_id: key,
            lemma: lemma,
            lemma_unpointed: stripNiqqud(lemma || word),
            lp_pos: pos,
            provider_pos: new Set(),
            root: root,
            binyan: binyan,
            meaning_ru: meaning,
            pealim_id: pealimId,
            confidence_min: confidence,
            confidence_max: confidence,
            ambiguity: ambiguous,
            alternatives: alternatives.slice(0, 5),
            resolution_channels: new Set(),
            identity_guard_reasons: new Set(),
            evidence: { lemmas: new Set(), roots: new Set(), meanings: new Set(), pealim_ids: new Set(), pos: new Set(), note_dedup_keys: new Set() },
            candidate_evidence: [],
            occurrences: []
          };
          lexemeMap.set(key, item);
        }
        addSet(item, "provider_pos", providerPos);
        addSet(item, "resolution_channels", channel);
        addSet(item, "identity_guard_reasons", guardReason);
        addSet(item.evidence, "lemmas", lemma);
        addSet(item.evidence, "roots", root);
        addSet(item.evidence, "meanings", meaning);
        addSet(item.evidence, "pealim_ids", pealimId);
        addSet(item.evidence, "pos", pos);
        addSet(item.evidence, "note_dedup_keys", linked && linked.gen_dedup_key);
        if (candidateEvidence) item.candidate_evidence.push(candidateEvidence);
        if (confidence != null) {
          item.confidence_min = item.confidence_min == null ? confidence : Math.min(item.confidence_min, confidence);
          item.confidence_max = item.confidence_max == null ? confidence : Math.max(item.confidence_max, confidence);
        }
        item.ambiguity = item.ambiguity || ambiguous;
        item.occurrences.push({
          text_id: textId,
          row_id: sid,
          order_index: row.order_index == null ? null : Number(row.order_index),
          word_offset: offset,
          surface: word,
          niqqud: niqqud,
          sentence_he: str(row.hebrew_plain || row.he_plain),
          sentence_he_niqqud: str(row.hebrew_niqqud || row.he_niqqud),
          sentence_ru: str(row.russian || row.ru),
          confidence: confidence,
          ambiguity: ambiguous,
          identity_guard_reason: guardReason
        });
      });
    });

    var lexemes = Array.from(lexemeMap.values()).map(function (item) {
      var conflicts = [];
      ["pealim_ids", "roots", "meanings"].forEach(function (field) {
        if (item.evidence[field] && item.evidence[field].size > 1) conflicts.push(field);
      });
      var posFamilies = new Set(Array.from(item.evidence.pos || []).map(identityFamily).filter(function (x) { return x !== "unknown"; }));
      if (posFamilies.size > 1) conflicts.push("pos_identity_family");
      return {
        lp_lexeme_id: item.lp_lexeme_id,
        lemma: item.lemma,
        lemma_unpointed: item.lemma_unpointed,
        lp_pos: item.lp_pos,
        provider_pos: Array.from(item.provider_pos).sort(),
        root: item.root,
        binyan: item.binyan,
        meaning_ru: item.meaning_ru,
        pealim_id: item.pealim_id,
        confidence_min: item.confidence_min,
        confidence_max: item.confidence_max,
        ambiguity: item.ambiguity,
        alternatives: item.alternatives,
        resolution_channels: Array.from(item.resolution_channels).sort(),
        identity_guard_reasons: Array.from(item.identity_guard_reasons).sort(),
        candidate_evidence: item.candidate_evidence,
        conflicts: conflicts,
        evidence: serialiseSetMap(item.evidence),
        occurrence_count: item.occurrences.length,
        occurrences: item.occurrences.sort(function (a, b) {
          return (a.order_index == null ? Number.MAX_SAFE_INTEGER : a.order_index) -
            (b.order_index == null ? Number.MAX_SAFE_INTEGER : b.order_index) || a.word_offset - b.word_offset;
        })
      };
    }).sort(function (a, b) {
      return POS_ORDER.indexOf(a.lp_pos) - POS_ORDER.indexOf(b.lp_pos) ||
        a.lemma_unpointed.localeCompare(b.lemma_unpointed, "he") ||
        a.lp_lexeme_id.localeCompare(b.lp_lexeme_id);
    });

    var lexemePos = {};
    lexemes.forEach(function (x) { lexemePos[x.lp_pos] = (lexemePos[x.lp_pos] || 0) + 1; });
    var collisionLexemes = lexemes.filter(function (x) { return x.conflicts.length; });
    var collisionSamples = collisionLexemes.slice(0, 20)
      .map(function (x) { return { lp_lexeme_id: x.lp_lexeme_id, conflicts: x.conflicts, evidence: x.evidence }; });

    var rates = {};
    Object.keys(completeness).forEach(function (field) { rates[field] = pct(completeness[field], analyzedOccurrences); });
    rates.root_applicable = pct(completeness.root, applicable.root);
    rates.binyan_applicable = pct(completeness.binyan, applicable.binyan);

    return {
      schema: "linguistpro-obsidian-lexical-preview-v1",
      read_only: true,
      text: {
        text_id: textId,
        text_key: str(text.text_key),
        title: str(text.title),
        updated_at: str(text.updated_at),
        rows_total: rows.length,
        rows_with_morph: morphBySentence.size,
        row_morph_coverage_pct: pct(morphBySentence.size, rows.length)
      },
      counts: {
        tokens_total: totalTokens,
        analyzed_occurrences: analyzedOccurrences,
        skipped_tokens: skippedTokens,
        unique_lexemes: lexemes.length,
        duplicate_occurrences_collapsed: Math.max(0, analyzedOccurrences - lexemes.length),
        occurrences_linked_to_notes: linkedOccurrences,
        ambiguous_occurrences: ambiguousOccurrences,
        ambiguity_signal_occurrences: ambiguitySignalOccurrences,
        ambiguity_signal_coverage_pct: pct(ambiguitySignalOccurrences, analyzedOccurrences),
        context_identity_guarded_occurrences: identityGuardedOccurrences,
        unknown_pos_occurrences: unknownOccurrences,
        collision_keys: collisionLexemes.length
      },
      lexemes_by_pos: sortedObject(lexemePos),
      occurrences_by_pos: sortedObject(occurrencePos),
      completeness_counts: completeness,
      completeness_pct: rates,
      confidence_bands: confidenceBands,
      resolution_channels: Object.keys(resolutionChannels).sort().reduce(function (out, key) { out[key] = resolutionChannels[key]; return out; }, {}),
      identity_guard_reasons: Object.keys(identityGuardReasons).sort().reduce(function (out, key) { out[key] = identityGuardReasons[key]; return out; }, {}),
      provider_pos_values: serialiseSetMap(providerPosValues),
      collision_samples: collisionSamples,
      lexemes: lexemes
    };
  }

  return {
    POS_ORDER: POS_ORDER.slice(),
    normalizePos: normalizePos,
    analyzeBundle: analyzeBundle,
    planObsidianPackage: planObsidianPackage
  };
});
