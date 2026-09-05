/*
 * LinguistPro -> Obsidian premium study projection (v3, read-only).
 *
 * Pure projection over an existing scoped/full exportBundle payload. It neither
 * opens OPFS nor writes files. Canonical token -> unit and lemma-key behaviour is
 * delegated to notes-autogen.js so the preview cannot invent a second morphology
 * or identity dialect.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./notes-autogen.js"), require("./inflection-render.js"));
  } else {
    root.ObsidianLexicalPreview = factory(root.NotesAutoGen, root.InflectionRender);
  }
})(typeof self !== "undefined" ? self : this, function (NA, InflectionRender) {
  "use strict";

  if (!NA || typeof NA.dictaTokenToUnit !== "function" || typeof NA.dedupKey !== "function") {
    throw new Error("ObsidianLexicalPreview requires NotesAutoGen");
  }
  if (!InflectionRender || typeof InflectionRender.projectStudyForms !== "function") {
    throw new Error("ObsidianLexicalPreview requires InflectionRender");
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
  function coreStudyForm(studyForms, slot) {
    return ((studyForms && studyForms.core) || []).find(function (form) { return form && form.slot === slot && str(form.he); }) || null;
  }
  function learnerHeadword(studyForms, analysisLemma, pos, rootValue) {
    var exact = "";
    if (studyForms) {
      var dictionaryLabel = str(studyForms.lemma_niqqud || studyForms.lemma);
      if (pos === "verb") {
        exact = str(coreStudyForm(studyForms, "INF-L") && coreStudyForm(studyForms, "INF-L").he);
        if (!exact && stripNiqqud(dictionaryLabel).charAt(0) === "ל") exact = dictionaryLabel;
      } else if (pos === "noun") {
        exact = str(coreStudyForm(studyForms, "s") && coreStudyForm(studyForms, "s").he) || dictionaryLabel;
      } else if (pos === "adjective" || pos === "participle") {
        exact = str(coreStudyForm(studyForms, "ms-a") && coreStudyForm(studyForms, "ms-a").he) || dictionaryLabel;
      } else {
        exact = dictionaryLabel;
      }
    }
    if (exact) return { value: exact, unpointed: stripNiqqud(exact), source: "pealim-exact" };

    var fallback = str(analysisLemma);
    var unpointed = stripNiqqud(fallback);
    var root = stripNiqqud(rootValue);
    // A Hebrew verbal citation form is an infinitive and therefore begins
    // with ל. A bare verbal root or a provider stem is analysis evidence, not
    // a learner headword; never silently relabel it as the initial form.
    if (pos === "verb" && (!unpointed || unpointed.charAt(0) !== "ל" || (root && unpointed === root))) {
      return { value: "", unpointed: "", source: "absent" };
    }
    if (!fallback) return { value: "", unpointed: "", source: "absent" };
    return { value: fallback, unpointed: unpointed, source: "morphology-lemma" };
  }
  function surfaceForms(occurrences) {
    var seen = new Set(), out = [];
    (occurrences || []).forEach(function (occ) {
      var value = str(occ && (occ.niqqud || occ.surface));
      if (!value || seen.has(value)) return;
      seen.add(value); out.push(value);
    });
    return out;
  }
  function learnerLabel(lexeme, occurrence) {
    var surface = str(occurrence && (occurrence.niqqud || occurrence.surface));
    var headword = str(lexeme && lexeme.headword);
    if (!surface) return headword || str(lexeme && (lexeme.analysis_lemma || lexeme.lp_lexeme_id));
    return headword && stripNiqqud(headword) !== stripNiqqud(surface)
      ? surface + " (" + headword + ")"
      : surface;
  }
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
  function paradigmPos(paradigm) {
    var raw = normalizePos(paradigm && paradigm.pos, paradigm && paradigm.kind);
    var cells = paradigm && paradigm.cells ? paradigm.cells : {};
    // The shipped Pealim snapshot labels a number of genuine preposition
    // paradigms as nouns. Direct P-* slots (not nominal s-P-* possessives) are
    // structural evidence for pronominal preposition inflection.
    var directPronounSlots = Object.keys(cells).filter(function (key) { return /^P-/.test(key); }).length;
    if (raw === "noun" && directPronounSlots >= 6) {
      return { pos: "preposition", source: "paradigm-pronominal-preposition" };
    }
    return { pos: raw, source: "" };
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
  function htmlEscape(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function markdownInline(v) {
    return str(v).replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/([`*_\[\]<>|])/g, "\\$1");
  }
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
  function occurrenceId(textId, rowId, wordOffset) {
    return "lpro:" + str(textId) + ":" + str(rowId) + ":" + String(wordOffset);
  }
  function candidateIdentity(value) {
    value = value && typeof value === "object" ? value : {};
    var pid = str(value.pealim_id || value.id || value.pid);
    var lemma = stripNiqqud(value.lemma || value.word || value.infinitive);
    var pos = normalizePos(value.pos || value.part_of_speech, value.kind);
    if (!pid && !lemma && pos === "unknown") return "";
    return [pid, lemma, pos].join("#");
  }
  function uniqueObjects(values) {
    var byJson = new Map();
    (values || []).forEach(function (value) {
      if (!value || typeof value !== "object") return;
      var ordered = {};
      Object.keys(value).sort().forEach(function (key) { ordered[key] = value[key]; });
      var key = JSON.stringify(ordered);
      if (!byJson.has(key)) byJson.set(key, ordered);
    });
    return Array.from(byJson.values());
  }
  function buildResolutionQueue(textId, lexemes, skippedItems) {
    var items = (skippedItems || []).slice();
    lexemes.forEach(function (lexeme) {
      lexeme.occurrences.forEach(function (occ) {
        var reasons = [];
        if (occ.ambiguity) reasons.push("ambiguous");
        if (occ.identity_guard_reason) reasons.push("identity_guarded");
        if (occ.lp_pos === "unknown") reasons.push("unknown_pos");
        if (!occ.headword && CONTENT_POS.has(occ.lp_pos)) reasons.push("headword_missing");
        if (lexeme.conflicts.length) reasons.push("collision");
        if (!reasons.length) return;
        items.push({
          lp_occurrence_id: occurrenceId(textId, occ.row_id, occ.word_offset),
          status: "unresolved",
          reasons: reasons,
          lp_lexeme_id: lexeme.lp_lexeme_id,
          surface: occ.surface,
          niqqud: occ.niqqud,
          lemma: occ.lemma,
          lp_pos: occ.lp_pos,
          provider_pos: occ.provider_pos,
          root: occ.root,
          binyan: occ.binyan,
          meaning_ru: occ.meaning_ru,
          pealim_id: occ.pealim_id,
          resolution_channel: occ.resolution_channel,
          confidence: occ.confidence,
          alternatives: (occ.alternatives || []).slice(),
          candidate_evidence: (occ.candidate_evidence || []).slice(),
          identity_guard_reason: occ.identity_guard_reason,
          conflicts: lexeme.conflicts.slice(),
          text_id: textId,
          row_id: occ.row_id,
          order_index: occ.order_index,
          word_offset: occ.word_offset,
          morph_model_version: occ.morph_model_version,
          sentence_he: occ.sentence_he,
          sentence_he_niqqud: occ.sentence_he_niqqud,
          sentence_ru: occ.sentence_ru
        });
      });
    });
    items.sort(function (a, b) {
      return (a.order_index == null ? Number.MAX_SAFE_INTEGER : a.order_index) -
        (b.order_index == null ? Number.MAX_SAFE_INTEGER : b.order_index) ||
        a.word_offset - b.word_offset || a.lp_occurrence_id.localeCompare(b.lp_occurrence_id);
    });

    var reasonCounts = {};
    var clusterMap = new Map();
    items.forEach(function (item) {
      item.reasons.forEach(function (reason) { reasonCounts[reason] = (reasonCounts[reason] || 0) + 1; });
      var candidates = (item.alternatives || []).concat(item.candidate_evidence || [])
        .map(candidateIdentity).filter(Boolean).sort();
      var signature = JSON.stringify({
        text_id: textId,
        reasons: item.reasons.slice().sort(),
        form: str(item.niqqud || item.surface),
        lemma: stripNiqqud(item.lemma),
        pos: item.lp_pos,
        candidates: candidates,
        conflicts: item.conflicts.slice().sort()
      });
      var cluster = clusterMap.get(signature);
      if (!cluster) {
        cluster = {
          lp_resolution_cluster_id: "lprc:" + fnv1a(signature),
          cluster_signature: signature,
          status: "unresolved",
          reasons: item.reasons.slice(),
          surface: item.surface,
          niqqud: item.niqqud,
          lemma: item.lemma,
          lp_pos: item.lp_pos,
          alternatives: [],
          candidate_evidence: [],
          occurrence_ids: [],
          occurrences: [],
          batch_review_eligible: false,
          auto_apply_allowed: false
        };
        clusterMap.set(signature, cluster);
      }
      cluster.alternatives = uniqueObjects(cluster.alternatives.concat(item.alternatives || []));
      cluster.candidate_evidence = uniqueObjects(cluster.candidate_evidence.concat(item.candidate_evidence || []));
      cluster.occurrence_ids.push(item.lp_occurrence_id);
      cluster.occurrences.push(item);
    });
    var clusters = Array.from(clusterMap.values()).map(function (cluster) {
      cluster.occurrence_count = cluster.occurrence_ids.length;
      cluster.batch_review_eligible = cluster.occurrence_count > 1 &&
        !cluster.reasons.some(function (reason) { return reason === "collision" || reason === "unknown_pos" || reason === "skipped_token"; });
      return cluster;
    }).sort(function (a, b) {
      return b.occurrence_count - a.occurrence_count || a.lp_resolution_cluster_id.localeCompare(b.lp_resolution_cluster_id);
    });

    var clusteredIds = new Set();
    clusters.forEach(function (cluster) { cluster.occurrence_ids.forEach(function (id) { clusteredIds.add(id); }); });
    if (clusteredIds.size !== items.length || items.some(function (item) { return !clusteredIds.has(item.lp_occurrence_id); })) {
      throw new Error("Resolution queue conservation invariant failed");
    }
    return {
      schema: "linguistpro-lexical-resolution-queue-v1",
      status: "unresolved",
      uncertain_occurrences: items.length,
      queued_uncertain_occurrences: clusteredIds.size,
      coverage_pct: items.length ? pct(clusteredIds.size, items.length) : 100,
      reason_counts: Object.keys(reasonCounts).sort().reduce(function (out, key) { out[key] = reasonCounts[key]; return out; }, {}),
      items: items,
      clusters: clusters
    };
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
  function posLabel(pos) {
    var raw = lower(pos);
    if (!raw || raw === "unknown") return "не определена";
    return ({
      verb: "глагол", noun: "существительное", adjective: "прилагательное",
      participle: "причастие", propernoun: "имя собственное", numeral: "числительное",
      pronoun: "местоимение", adverb: "наречие", preposition: "предлог",
      conjunction: "союз", particle: "частица", interjection: "междометие",
      other: "другое", unknown: "не определена"
    })[normalizePos(raw, "")] || "не определена";
  }
  function reasonLabel(reason) {
    return ({
      ambiguous: "несколько возможных разборов",
      identity_guarded: "нужно подтвердить словарное значение",
      unknown_pos: "не определена часть речи",
      headword_missing: "не подтверждена начальная форма",
      collision: "противоречивые словарные данные",
      skipped_token: "токен не удалось разобрать"
    })[str(reason)] || str(reason);
  }
  function pealimUrl(id) {
    id = str(id).match(/[0-9]+/);
    return id ? "https://www.pealim.com/ru/dict/" + id[0] + "/" : "";
  }
  var CORE_FIELD_BY_SLOT = {
    "INF-L": "form_infinitive", "AP-ms": "form_present_ms", "AP-fs": "form_present_fs",
    "AP-mp": "form_present_mp", "AP-fp": "form_present_fp",
    s: "form_singular", p: "form_plural", sc: "form_construct_singular", pc: "form_construct_plural",
    "ms-a": "form_ms", "fs-a": "form_fs", "mp-a": "form_mp", "fp-a": "form_fp"
  };
  function coreFormFields(studyForms) {
    var out = {};
    if (!studyForms || !Array.isArray(studyForms.core)) return out;
    studyForms.core.forEach(function (form) {
      var field = CORE_FIELD_BY_SLOT[form.slot];
      if (field && !out[field]) out[field] = str(form.he);
    });
    return out;
  }
  function appendCoreFormYaml(lines, studyForms) {
    var fields = coreFormFields(studyForms);
    Object.keys(CORE_FIELD_BY_SLOT).map(function (slot) { return CORE_FIELD_BY_SLOT[slot]; })
      .filter(function (field, index, all) { return all.indexOf(field) === index; })
      .forEach(function (field) { lines.push(field + ": " + yaml(fields[field] || "")); });
  }
  function studySlotLabelRu(slot) {
    var direct = {
      "AP-ms": "наст., м. ед.", "AP-fs": "наст., ж. ед.", "AP-mp": "наст., м. мн.", "AP-fp": "наст., ж. мн.",
      "INF-L": "инфинитив", s: "ед. число", p: "мн. число", sc: "смихут, ед.", pc: "смихут, мн.",
      "ms-a": "м. ед.", "fs-a": "ж. ед.", "mp-a": "м. мн.", "fp-a": "ж. мн."
    };
    if (direct[slot]) return direct[slot];
    var person = { "1s": "я", "2ms": "ты (м)", "2fs": "ты (ж)", "3ms": "он", "3fs": "она", "1p": "мы", "2mp": "вы (м)", "2fp": "вы (ж)", "3mp": "они (м)", "3fp": "они (ж)", "3p": "они" };
    var match = str(slot).match(/(?:PERF|IMPF|IMP|P)-(.+)$/);
    if (match && person[match[1]]) return person[match[1]];
    var possessive = str(slot).match(/^[sp]-P-(.+)$/);
    if (possessive && person[possessive[1]]) return person[possessive[1]];
    return str(slot);
  }
  function studyGroupLabelRu(key) {
    var passive = /^passive_(.+)$/.exec(str(key));
    var raw = passive ? passive[1] : str(key);
    var label = ({ present: "Настоящее время", past: "Прошедшее время", future: "Будущее время", imperative: "Повелительное наклонение", infinitive: "Инфинитив", absolute: "Абсолютное состояние", construct: "Смихут", possessive_sg: "Притяжательные формы от ед. числа", possessive_pl: "Притяжательные формы от мн. числа", adj: "Род и число", prep: "Формы с местоименными окончаниями", invariant: "Неизменяемая форма", other: "Другие засвидетельствованные формы" })[raw] || raw;
    return passive ? "Страдательный залог · " + label : label;
  }
  function markdownFormsTable(forms, prefix) {
    prefix = prefix || "";
    var lines = [prefix + "| Форма | Иврит | Транслитерация |", prefix + "|---|---:|---|"];
    (forms || []).forEach(function (form) {
      lines.push(prefix + "| " + markdownInline(studySlotLabelRu(form.slot)) + " | <span dir=\"rtl\" class=\"lp-form\">" + htmlEscape(form.he).replace(/\|/g, "&#124;") + "</span> | " + (markdownInline(form.translit) || "—") + " |");
    });
    return lines;
  }
  function renderStudyForms(studyForms) {
    if (!studyForms || !Array.isArray(studyForms.core) || !studyForms.core.length) return [];
    var lines = ["## Учебные формы", "", "> [!tip] Сначала запомните", "> Эти формы покрывают минимальный продуктивный каркас. Произносите каждую вслух и находите её в контексте.", ">"];
    lines = lines.concat(markdownFormsTable(studyForms.core, "> "));
    lines.push("", "> [!abstract]- Полная парадигма из локального снимка Pealim", "> Формы ниже показаны для справки и раскрываются по необходимости. Отсутствующие клетки не додумываются.");
    (studyForms.groups || []).forEach(function (group) {
      lines.push(">", "> ### " + studyGroupLabelRu(group.key), ">");
      lines = lines.concat(markdownFormsTable(group.forms, "> "));
    });
    return lines;
  }
  function safeAudioFileName(assetKey) {
    var raw = str(assetKey);
    var slug = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 72);
    if (!slug) slug = "audio";
    return slug + "-" + fnv1a(raw) + ".mp3";
  }
  function audioPath(assetKey) { return "_LinguistPro/media/audio/" + safeAudioFileName(assetKey); }
  function buildAudioPlan(report, audioResults) {
    var resultByKey = new Map();
    (Array.isArray(audioResults) ? audioResults : []).forEach(function (result) {
      var key = str(result && result.asset_key);
      if (key) resultByKey.set(key, result);
    });
    var metaByKey = new Map((report.audio_assets || []).map(function (asset) { return [str(asset.asset_key), asset]; }));
    var keys = Array.from(new Set((report.text.rows || []).map(function (row) { return str(row.audio_asset_key); }).filter(Boolean))).sort();
    var assets = keys.map(function (key) {
      var result = resultByKey.get(key) || {};
      var meta = metaByKey.get(key) || {};
      var status = result.status === "included" ? "included" : result.status === "missing" ? "missing" : "pending";
      return {
        asset_key: key, path: audioPath(key), status: status,
        mime_type: str(meta.mime_type || "audio/mpeg"), language: str(meta.language || "he-IL"),
        size_bytes: status === "included" ? Math.max(0, Number(result.size_bytes) || 0) : null,
        reason: status === "missing" ? str(result.reason || "AUDIO_UNAVAILABLE") : ""
      };
    });
    return {
      schema: "linguistpro-obsidian-audio-plan-v1",
      expected_count: assets.length,
      included_count: assets.filter(function (asset) { return asset.status === "included"; }).length,
      missing_count: assets.filter(function (asset) { return asset.status === "missing"; }).length,
      pending_count: assets.filter(function (asset) { return asset.status === "pending"; }).length,
      assets: assets
    };
  }
  function phraseNumber(value) {
    var n = finiteNumber(value && value.order_index);
    return n == null ? null : Math.max(1, Math.trunc(n) + 1);
  }
  function paddedPhraseNumber(value) { return String(value).padStart(3, "0"); }
  function phraseBlockId(textId, rowId) { return "lp-phrase-" + fnv1a(str(textId) + ":" + str(rowId)); }
  function phraseLink(occ, phrasePathByRowId) {
    var n = phraseNumber(occ);
    var label = "Фраза " + (n == null ? "—" : n);
    var target = phrasePathByRowId && phrasePathByRowId.get(str(occ && occ.row_id));
    return target ? "[[" + target + "|" + label + "]]" : label;
  }
  function renderBase(report) {
    var textId = yaml(report.text.text_id);
    var lines = [
      "filters:",
      "  and:",
      "    - 'note.type == \"lp-text-lexeme\"'",
      "    - 'note.lp_text_id == " + textId + "'",
      "formulas:",
      "  surface_link: 'file.asLink(note.primary_surface)'",
      "  headword_link: 'if(note.headword, file.asLink(note.headword), \"—\")'",
      "  pealim_link: 'if(note.pealim_url, link(note.pealim_url, \"Pealim ↗\"), \"\")'",
      "properties:",
      "  formula.surface_link:",
      "    displayName: Форма в тексте",
      "  note.surface_forms:",
      "    displayName: Формы в тексте",
      "  formula.headword_link:",
      "    displayName: Начальная форма",
      "  note.lp_pos_label:",
      "    displayName: Часть речи",
      "  note.lexical_pos:",
      "    displayName: Словарный класс",
      "  note.context_role:",
      "    displayName: Роль в контексте",
      "  note.meaning_ru:",
      "    displayName: Значение",
      "  note.occurrence_count:",
      "    displayName: Вхождений",
      "  note.form_infinitive:",
      "    displayName: Инфинитив",
      "  note.form_present_ms:",
      "    displayName: Наст. м. ед.",
      "  note.form_present_fs:",
      "    displayName: Наст. ж. ед.",
      "  note.form_present_mp:",
      "    displayName: Наст. м. мн.",
      "  note.form_present_fp:",
      "    displayName: Наст. ж. мн.",
      "  note.form_singular:",
      "    displayName: Единственное",
      "  note.form_plural:",
      "    displayName: Множественное",
      "  note.form_construct_singular:",
      "    displayName: Смихут ед.",
      "  note.form_construct_plural:",
      "    displayName: Смихут мн.",
      "  note.form_ms:",
      "    displayName: М. ед.",
      "  note.form_fs:",
      "    displayName: Ж. ед.",
      "  note.form_mp:",
      "    displayName: М. мн.",
      "  note.form_fp:",
      "    displayName: Ж. мн.",
      "  formula.pealim_link:",
      "    displayName: Словарь",
      "views:"
    ];
    function view(name, filter, order) {
      lines.push("  - type: table", "    name: " + yaml(name));
      if (filter) lines.push("    filters:", "      and:", "        - '" + filter + "'");
      lines.push("    order:");
      (order || ["formula.surface_link", "formula.headword_link", "note.meaning_ru", "note.lp_pos_label", "note.occurrence_count", "formula.pealim_link"])
        .forEach(function (field) { lines.push("      - " + field); });
    }
    view("Все слова", "note.lp_pos != \"unknown\"");
    view("Глаголы", "note.lp_pos == \"verb\"", ["formula.surface_link", "note.surface_forms", "formula.headword_link", "note.form_present_ms", "note.form_present_fs", "note.form_present_mp", "note.form_present_fp", "note.meaning_ru", "formula.pealim_link"]);
    view("Существительные", "note.lp_pos == \"noun\"", ["formula.surface_link", "note.surface_forms", "formula.headword_link", "note.form_plural", "note.form_construct_singular", "note.form_construct_plural", "note.meaning_ru", "formula.pealim_link"]);
    view("Прилагательные", "note.lp_pos == \"adjective\"", ["formula.surface_link", "note.surface_forms", "formula.headword_link", "note.form_fs", "note.form_mp", "note.form_fp", "note.meaning_ru", "formula.pealim_link"]);
    POS_ORDER.filter(function (pos) { return pos !== "verb" && pos !== "noun" && pos !== "adjective"; })
      .forEach(function (pos) { view(posViewName(pos), "note.lp_pos == " + yaml(pos)); });
    view("Неоднозначные", "note.ambiguity == true");
    view("Конфликты", "note.conflict_count > 0");
    return lines.join("\n") + "\n";
  }
  function renderResolutionBase(report) {
    var textId = yaml(report.text.text_id);
    return [
      "filters:",
      "  and:",
      "    - 'note.type == \"lp-resolution-cluster\"'",
      "    - 'list(note.lp_text_ids).contains(" + textId + ")'",
      "formulas:",
      "  cluster_link: 'file.asLink(note.surface)'",
      "properties:",
      "  formula.cluster_link:",
      "    displayName: Форма",
      "  note.lp_pos_label:",
      "    displayName: Часть речи",
      "  note.reason_labels:",
      "    displayName: Почему нужно проверить",
      "  note.occurrence_count:",
      "    displayName: Вхождений",
      "  note.status:",
      "    displayName: Статус",
      "views:",
      "  - type: table",
      "    name: \"Требуют решения\"",
      "    filters:",
      "      and:",
      "        - 'note.status == \"unresolved\"'",
      "    order:",
      "      - formula.cluster_link",
      "      - note.lp_pos_label",
      "      - note.reason_labels",
      "      - note.occurrence_count",
      "      - note.status",
      "  - type: table",
      "    name: \"Пакетная проверка\"",
      "    filters:",
      "      and:",
      "        - 'note.batch_review_eligible == true'",
      "    order:",
      "      - formula.cluster_link",
      "      - note.occurrence_count",
      "      - note.reason_labels"
    ].join("\n") + "\n";
  }
  function renderLexemeReferenceMarkdown(lexeme) {
    var url = pealimUrl(lexeme.pealim_id);
    var study = lexeme.study_forms;
    var dictionaryLabel = str(study && (study.lemma_niqqud || study.lemma));
    var headword = str(lexeme.headword);
    var title = headword || dictionaryLabel || lexeme.analysis_lemma || lexeme.lp_lexeme_id;
    var lines = [
      "---",
      "type: lp-lexeme-reference",
      "lp_schema: 3",
      "cssclasses: [linguistpro-study]",
      "lp_lexeme_id: " + yaml(lexeme.lp_lexeme_id),
      "lemma: " + yaml(headword),
      "lemma_unpointed: " + yaml(lexeme.headword_unpointed),
      "headword: " + yaml(headword),
      "headword_unpointed: " + yaml(lexeme.headword_unpointed),
      "headword_source: " + yaml(lexeme.headword_source),
      "dictionary_entry_label: " + yaml(dictionaryLabel),
      "lexical_pos: " + yaml(study && study.pos),
      "root: " + yaml(study && study.root),
      "binyan: " + yaml(study && study.binyan),
      "meaning_ru: " + yaml(study && study.meaning),
      "pealim_id: " + yaml(lexeme.pealim_id),
      "pealim_url: " + yaml(url),
      "inflection_source: pealim",
      "inflection_model: " + yaml(study && study.model_version),
      "managed_by: linguistpro"
    ];
    appendCoreFormYaml(lines, study);
    lines.push(
      "---", "", "# " + markdownInline(title), "",
      "**Значение:** " + (markdownInline(study && study.meaning) || "—"), "",
      "**Словарный класс:** " + posLabel(study && study.pos)
    );
    if (study && study.root) lines.push("", "**Корень:** " + markdownInline(study.root));
    if (study && study.binyan) lines.push("", "**Биньян:** " + markdownInline(study.binyan));
    if (url) lines.push("", "[Открыть в Pealim ↗](" + url + ")");
    if (!headword && lexeme.lp_pos === "verb") lines.push("", "> [!warning] Инфинитив не засвидетельствован", "> В точной карточке Pealim нет формы инфинитива. Название словарной статьи показано для навигации, но не выдано за начальную форму глагола.");
    lines.push("", "> [!info] Происхождение данных", "> Формы взяты из локального проверяемого снимка Pealim " + str(study && study.model_version) + ". LinguistPro не достраивает отсутствующие клетки.", "");
    lines = lines.concat(renderStudyForms(study));
    return lines.join("\n") + "\n";
  }
  function renderTextLexemeMarkdown(report, lexeme, phrasePathByRowId, referencePath) {
    var url = pealimUrl(lexeme.pealim_id);
    var formsInText = surfaceForms(lexeme.occurrences);
    var primarySurface = formsInText[0] || lexeme.headword || lexeme.analysis_lemma || "";
    var title = lexeme.headword || primarySurface || lexeme.lp_lexeme_id;
    var lines = [
      "---",
      "type: lp-text-lexeme",
      "lp_schema: 3",
      "cssclasses: [linguistpro-study]",
      "lp_text_id: " + yaml(report.text.text_id),
      "lp_lexeme_id: " + yaml(lexeme.lp_lexeme_id),
      "lemma: " + yaml(lexeme.headword),
      "lemma_unpointed: " + yaml(lexeme.headword_unpointed),
      "analysis_lemma: " + yaml(lexeme.analysis_lemma),
      "headword: " + yaml(lexeme.headword),
      "headword_unpointed: " + yaml(lexeme.headword_unpointed),
      "headword_source: " + yaml(lexeme.headword_source),
      "primary_surface: " + yaml(primarySurface),
      "surface_forms: " + yaml(formsInText),
      "lp_pos: " + yaml(lexeme.lp_pos),
      "lp_pos_label: " + yaml(posLabel(lexeme.lp_pos)),
      "lexical_pos: " + yaml(lexeme.lexical_pos),
      "context_role: " + yaml(lexeme.context_role),
      "provider_pos: " + yaml(lexeme.provider_pos),
      "root: " + yaml(lexeme.root),
      "binyan: " + yaml(lexeme.binyan),
      "meaning_ru: " + yaml(lexeme.meaning_ru),
      "pealim_id: " + yaml(lexeme.pealim_id),
      "pealim_url: " + yaml(url),
      "confidence_min: " + (lexeme.confidence_min == null ? "null" : lexeme.confidence_min),
      "confidence_max: " + (lexeme.confidence_max == null ? "null" : lexeme.confidence_max),
      "ambiguity: " + (lexeme.ambiguity ? "true" : "false"),
      "conflict_count: " + lexeme.conflicts.length,
      "verification_state: generated",
      "occurrence_count: " + lexeme.occurrence_count,
      "managed_by: linguistpro",
    ];
    appendCoreFormYaml(lines, lexeme.study_forms);
    lines.push(
      "---",
      "",
      "# " + markdownInline(title),
      "",
      "**Формы в этом тексте:** " + (formsInText.map(markdownInline).join(", ") || "—"),
      "",
      "**Начальная форма:** " + (markdownInline(lexeme.headword) || "не подтверждена"),
      "",
      lexeme.meaning_ru ? "**Значение в этом тексте:** " + markdownInline(lexeme.meaning_ru) : "**Значение в этом тексте:** —",
      "",
      "**Роль в контексте:** " + posLabel(lexeme.lp_pos)
    );
    if (lexeme.root) lines.push("", "**Корень:** " + markdownInline(lexeme.root));
    if (lexeme.binyan) lines.push("", "**Биньян:** " + markdownInline(lexeme.binyan));
    if (url) lines.push("", "[Открыть в Pealim ↗](" + url + ")");
    if (referencePath) {
      var refTarget = "../../../" + referencePath.replace(/^_LinguistPro\//, "").replace(/\.md$/, "");
      lines.push("", "## Словарная карточка", "", "![[" + refTarget + "#Учебные формы]]", "", "[[" + refTarget + "|Открыть полную словарную карточку]]");
    }
    if (!lexeme.headword) lines.push("", "> [!warning] Начальная форма не подтверждена", "> Показана только реальная форма из текста. LinguistPro не превращает корень или машинную основу в словарное слово без надёжного источника.");
    lines.push("", "## Активное воспроизведение", "", "> [!question] Проверьте себя", "> По значению **" + (markdownInline(lexeme.meaning_ru) || "—") + "** назовите начальную форму" + (lexeme.headword ? " **" + markdownInline(lexeme.headword) + "**" : "") + ", затем восстановите одну форму из текста и произнесите пример целиком.");
    lines.push(
      "",
      "## Примеры из текста",
      ""
    );
    lexeme.occurrences.forEach(function (occ) {
      lines.push("- " + phraseLink(occ, phrasePathByRowId) + " · **" + markdownInline(occ.niqqud || occ.surface || "—") + "**");
      if (occ.sentence_he_niqqud || occ.sentence_he) lines.push("  - " + markdownInline(occ.sentence_he_niqqud || occ.sentence_he));
      if (occ.sentence_ru) lines.push("  - _" + markdownInline(occ.sentence_ru) + "_");
      lines.push("  <!-- lp_occurrence: " + occurrenceId(report.text.text_id, occ.row_id, occ.word_offset) + " -->");
    });
    if (lexeme.conflicts.length) {
      lines.push("", "> [!warning] Требует проверки", "> Конфликтующие поля: " + lexeme.conflicts.join(", ") + ".");
    }
    return lines.join("\n") + "\n";
  }
  function renderTextHub(report, audioPlan) {
    return [
      "---",
      "type: lp-text",
      "lp_schema: 3",
      "cssclasses: [linguistpro-study]",
      "lp_text_id: " + yaml(report.text.text_id),
      "lp_text_key: " + yaml(report.text.text_key),
      "title: " + yaml(report.text.title),
      "phrase_count: " + report.text.rows_total,
      "lexeme_count: " + report.counts.unique_lexemes,
      "unresolved_count: " + report.counts.uncertain_occurrences,
      "audio_included: " + (audioPlan ? audioPlan.included_count : 0),
      "audio_expected: " + (audioPlan ? audioPlan.expected_count : 0),
      "managed_by: linguistpro",
      "---",
      "",
      "# " + markdownInline(report.text.title),
      "",
      "> [!info] Два инструмента — две роли",
      "> Obsidian хранит переносимый учебный конспект и связи. LinguistPro остаётся единственным местом интервальных повторений, статусов слов и исправления морфологии.",
      "",
      "## Навигация",
      "",
      "- [[Учебный маршрут|Пошаговый учебный маршрут]]",
      "- [[Фокус на лексику|Лексика для активной работы]]",
      "- [[Фразы|Все фразы с переводом]]",
      "- [[Лексика — переносимый снимок|Лексика по частям речи]]",
      "- [[Очередь разбора|Что ещё нужно проверить]]",
      "",
      "## Четыре прохода по тексту",
      "",
      "1. **Первый проход: смысл на слух.** Прослушайте фрагмент в LinguistPro без текста и зафиксируйте, что поняли.",
      "2. **Второй проход: звук + иврит.** Сверьте границы слов и повторяйте фразы вслед за диктором.",
      "3. **Третий проход: точность.** Откройте перевод и карточки только у слов, которые мешают пониманию.",
      "4. **Четвёртый проход: воспроизведение.** Перескажите фрагмент и вернитесь к FSRS-повторам в LinguistPro.",
      "",
      "## Лексика",
      "",
      "![[Лексика.base]]",
      "",
      "## Требуют решения",
      "",
      report.counts.uncertain_occurrences + " вхождений в " + report.counts.resolution_clusters + " кластерах; покрытие очередью " + report.counts.resolution_queue_coverage_pct + "%.",
      "",
      "![[Разбор.base]]",
      ""
    ].join("\n");
  }
  function renderLearningRoute(report) {
    return [
      "---", "type: lp-learning-route", "lp_schema: 3", "cssclasses: [linguistpro-study]", "lp_text_id: " + yaml(report.text.text_id), "managed_by: linguistpro", "---", "",
      "# Учебный маршрут", "",
      "> [!important] Это маршрут, а не второй планировщик повторений",
      "> Не отмечайте здесь долговременный прогресс: generated-файл заменяется при следующем экспорте. Личные наблюдения ведите вне служебной папки, а интервалы повторения — в LinguistPro.", "",
      "## Занятие 1 · Понимание", "",
      "1. Прослушайте выбранный фрагмент целиком в LinguistPro.",
      "2. Запишите в личной заметке 3–5 фактов, которые поняли без перевода.",
      "3. Откройте соответствующий раздел [[Фразы]] и проверьте гипотезы.", "",
      "## Занятие 2 · Произношение", "",
      "1. Возьмите 8–12 фраз, а не весь текст.",
      "2. Для каждой: слушайте → повторяйте вместе → повторяйте после паузы → произносите без аудио.",
      "3. Сравнивайте ритм и ударение, не только отдельные звуки.", "",
      "## Занятие 3 · Лексика в контексте", "",
      "1. Начните с [[Фокус на лексику|фокусного списка]].",
      "2. Сначала восстановите слово по русскому значению, затем откройте карточку.",
      "3. Для глагола проговорите инфинитив и четыре формы настоящего времени; полную парадигму раскрывайте по необходимости.", "",
      "## Занятие 4 · Грамматика через преобразование", "",
      "Выберите 5 фраз и измените один параметр: лицо, род, число, время или определённость. Сверяйте формы только с проверенной таблицей Pealim.", "",
      "## Занятие 5 · Выход в речь", "",
      "Перескажите фрагмент своими словами, затем запишите голосом краткое резюме. Ошибки перенесите в личный журнал и исправьте канонический разбор в LinguistPro.", "",
      "## Завершение цикла", "",
      "Запустите назначенные FSRS-повторы в LinguistPro. Obsidian не создаёт параллельное расписание и не меняет статусы слов.", ""
    ].join("\n");
  }
  function renderLexicalFocus(report, textPathById) {
    var unresolved = new Set((report.resolution_queue.items || []).map(function (item) { return item.lp_lexeme_id; }).filter(Boolean));
    var content = new Set(["verb", "noun", "adjective", "participle", "propernoun"]);
    var sorted = (report.lexemes || []).filter(function (lexeme) {
      return lexeme.lp_pos !== "unknown" && !unresolved.has(lexeme.lp_lexeme_id);
    }).slice().sort(function (a, b) {
      var ap = content.has(a.lp_pos) ? 0 : 1, bp = content.has(b.lp_pos) ? 0 : 1;
      return ap - bp || b.occurrence_count - a.occurrence_count || a.lemma_unpointed.localeCompare(b.lemma_unpointed, "he");
    });
    var selected = sorted.slice(0, 20);
    var lines = [
      "---", "type: lp-lexical-focus", "lp_schema: 3", "cssclasses: [linguistpro-study]", "lp_text_id: " + yaml(report.text.text_id), "managed_by: linguistpro", "---", "",
      "# Фокус на лексику", "",
      "> [!tip] Как использовать список",
      "> Работайте блоками по 8–12 слов. Сначала попытайтесь восстановить иврит по значению, затем откройте карточку и произнесите один контекст. Список приоритетов строится по роли слова и частоте в этом тексте; это не оценка знания.", "",
      "Отобрано: **" + selected.length + "** из " + report.lexemes.length + " лексем. Неоднозначные случаи исключены до решения в LinguistPro.", ""
    ];
    selected.forEach(function (lexeme, index) {
      var path = textPathById.get(lexeme.lp_lexeme_id);
      var target = path ? "Лексемы/" + path.split("/").pop().replace(/\.md$/, "") : "";
      var forms = surfaceForms(lexeme.occurrences);
      var label = lexeme.headword || forms[0] || lexeme.analysis_lemma;
      lines.push((index + 1) + ". [[" + target + "|" + markdownInline(label) + "]] — " + (markdownInline(lexeme.meaning_ru) || "значение нужно уточнить") +
        " · в тексте: " + (forms.map(markdownInline).join(", ") || "—") + " · " + posLabel(lexeme.lp_pos) + " · " + lexeme.occurrence_count + " вх.");
    });
    return lines.join("\n") + "\n";
  }
  function renderResolutionClusterMarkdown(report, cluster, phrasePathByRowId) {
    var first = cluster.occurrences[0] || {};
    var lines = [
      "---",
      "type: lp-resolution-cluster",
      "lp_schema: 1",
      "cssclasses: [linguistpro-study]",
      "lp_resolution_cluster_id: " + yaml(cluster.lp_resolution_cluster_id),
      "status: unresolved",
      "surface: " + yaml(cluster.niqqud || cluster.surface),
      "lemma: " + yaml(cluster.lemma),
      "lp_pos: " + yaml(cluster.lp_pos),
      "lp_pos_label: " + yaml(posLabel(cluster.lp_pos)),
      "reasons: " + yaml(cluster.reasons),
      "reason_labels: " + yaml(cluster.reasons.map(reasonLabel)),
      "occurrence_count: " + cluster.occurrence_count,
      "batch_review_eligible: " + (cluster.batch_review_eligible ? "true" : "false"),
      "auto_apply_allowed: false",
      "lp_text_ids: " + yaml([report.text.text_id]),
      "managed_by: linguistpro",
      "---",
      "",
      "# Разбор: " + markdownInline(cluster.niqqud || cluster.surface || cluster.lp_resolution_cluster_id),
      "",
      "> [!warning] Решение не принято",
      "> Это видимая проекция очереди. Подтверждать или исправлять разбор нужно в LinguistPro; редактирование этого generated-файла не меняет канон.",
      "",
      "- Почему нужна проверка: " + cluster.reasons.map(reasonLabel).join("; "),
      "- Предполагаемая часть речи: " + posLabel(cluster.lp_pos),
      "- Текущая лемма: " + (markdownInline(cluster.lemma) || "—"),
      "- Вхождений: " + cluster.occurrence_count,
      "- Выбор примеров: " + (cluster.batch_review_eligible ? "можно выбрать всю группу или отдельные примеры" : "автовыбор всей группы отключён; одинаковые примеры можно отметить вручную"),
      ""
    ];
    var candidates = uniqueObjects(cluster.alternatives.concat(cluster.candidate_evidence));
    lines.push("## Кандидаты", "");
    if (!candidates.length) lines.push("Кандидаты отсутствуют — требуется ручной разбор.", "");
    candidates.forEach(function (candidate, index) {
      var pid = str(candidate.pealim_id || candidate.id || candidate.pid);
      var parts = [];
      var candidatePos = normalizePos(candidate.lp_pos || candidate.pos || candidate.part_of_speech, candidate.kind);
      if (candidatePos !== "unknown") parts.push(posLabel(candidatePos));
      if (candidate.meaning_ru || candidate.meaning) parts.push(markdownInline(candidate.meaning_ru || candidate.meaning));
      if (pid) parts.push("[Pealim ↗](" + pealimUrl(pid) + ")");
      lines.push((index + 1) + ". **" + markdownInline(candidate.lemma || candidate.word || "Вариант " + (index + 1)) + "**" + (parts.length ? " — " + parts.join(" · ") : ""));
      lines.push("   <!-- lp_candidate: " + candidateIdentity(candidate) + " -->");
    });
    lines.push("", "## Контексты", "");
    cluster.occurrences.forEach(function (occ) {
      lines.push("- " + phraseLink(occ, phrasePathByRowId) + " · **" + markdownInline(occ.niqqud || occ.surface || "—") + "**");
      if (occ.sentence_he_niqqud || occ.sentence_he) lines.push("  - " + markdownInline(occ.sentence_he_niqqud || occ.sentence_he));
      if (occ.sentence_ru) lines.push("  - _" + markdownInline(occ.sentence_ru) + "_");
      lines.push("  <!-- lp_occurrence: " + occurrenceId(report.text.text_id, occ.row_id, occ.word_offset) + " -->");
    });
    if (first.morph_model_version) lines.push("", "Модель морфологии: `" + first.morph_model_version + "`.");
    return lines.join("\n") + "\n";
  }
  function renderResolutionQueueIndex(report, pathByClusterId) {
    var activeCount = report.counts.active_resolution_occurrences != null
      ? report.counts.active_resolution_occurrences
      : report.counts.uncertain_occurrences;
    var lines = [
      "# Очередь морфологического разбора",
      "",
      "> Generated snapshot. Канонические решения принимаются в LinguistPro.",
      "",
      "- Активных вхождений: " + activeCount,
      "- В очереди: " + report.counts.queued_uncertain_occurrences,
      "- Покрытие: " + report.counts.resolution_queue_coverage_pct + "%",
      "- Кластеров: " + report.counts.resolution_clusters,
      ""
    ];
    report.resolution_queue.clusters.forEach(function (cluster) {
      var clusterPath = pathByClusterId.get(cluster.lp_resolution_cluster_id);
      var textPrefix = "_LinguistPro/texts/" + report.text.text_id + "/";
      var target = (clusterPath.indexOf(textPrefix) === 0 ? clusterPath.slice(textPrefix.length) : clusterPath)
        .replace(/\.md$/, "");
      lines.push("- [[" + target + "|" + markdownInline(cluster.niqqud || cluster.surface || cluster.lp_resolution_cluster_id) + "]] — " +
        cluster.occurrence_count + "; " + cluster.reasons.map(reasonLabel).join("; "));
    });
    return lines.join("\n") + "\n";
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
        var forms = surfaceForms(lexeme.occurrences);
        var label = lexeme.headword || forms[0] || lexeme.analysis_lemma || lexeme.lp_lexeme_id;
        var url = pealimUrl(lexeme.pealim_id);
        var lexemePath = pathById.get(lexeme.lp_lexeme_id);
        var textPrefix = "_LinguistPro/texts/" + report.text.text_id + "/";
        var target = (lexemePath.indexOf(textPrefix) === 0 ? lexemePath.slice(textPrefix.length) : lexemePath)
          .replace(/\.md$/, "");
        lines.push("- " + (forms.length ? forms.map(markdownInline).join(", ") + " → " : "") + "[[" + target + "|" + markdownInline(label) + "]]" +
          (lexeme.meaning_ru ? " — " + markdownInline(lexeme.meaning_ru) : "") + (url ? " · [Pealim ↗](" + url + ")" : ""));
      });
      lines.push("");
    });
    return lines.join("\n");
  }
  function phraseRows(report) {
    if (Array.isArray(report.text.rows) && report.text.rows.length) return report.text.rows.slice();
    // Backward-compatible reprojection of a v1 receipt/projection: recover the
    // sentence catalogue from occurrence evidence without exposing its IDs.
    var byId = new Map();
    (report.lexemes || []).forEach(function (lexeme) {
      (lexeme.occurrences || []).forEach(function (occ) {
        var rowId = str(occ.row_id);
        if (!rowId || byId.has(rowId)) return;
        byId.set(rowId, {
          row_id: rowId, order_index: occ.order_index,
          hebrew_plain: occ.sentence_he, hebrew_niqqud: occ.sentence_he_niqqud,
          transliteration: "", transliteration_ru: "", russian: occ.sentence_ru
        });
      });
    });
    return Array.from(byId.values());
  }
  function phraseChunks(report, rootPath) {
    var rows = phraseRows(report);
    rows.sort(function (a, b) {
      return (finiteNumber(a.order_index) == null ? Number.MAX_SAFE_INTEGER : Number(a.order_index)) -
        (finiteNumber(b.order_index) == null ? Number.MAX_SAFE_INTEGER : Number(b.order_index)) || str(a.row_id).localeCompare(str(b.row_id));
    });
    var chunks = [], pathByRowId = new Map();
    for (var i = 0; i < rows.length; i += 20) {
      var group = rows.slice(i, i + 20);
      var from = phraseNumber(group[0]) || i + 1;
      var to = phraseNumber(group[group.length - 1]) || i + group.length;
      var name = paddedPhraseNumber(from) + "–" + paddedPhraseNumber(to) + ".md";
      var path = rootPath + "Фразы/" + name;
      group.forEach(function (row) {
        pathByRowId.set(str(row.row_id), "../Фразы/" + name.replace(/\.md$/, "") +
          "#^" + phraseBlockId(report.text.text_id, row.row_id));
      });
      chunks.push({ from: from, to: to, path: path, rows: group });
    }
    return { chunks: chunks, pathByRowId: pathByRowId };
  }
  function renderPhrasesIndex(report, chunks) {
    var phraseCount = chunks.reduce(function (sum, chunk) { return sum + chunk.rows.length; }, 0);
    var lines = [
      "---",
      "type: lp-phrase-index",
      "lp_schema: 2",
      "cssclasses: [linguistpro-study]",
      "lp_text_id: " + yaml(report.text.text_id),
      "managed_by: linguistpro",
      "---",
      "",
      "# Фразы текста",
      "",
      "> [!tip] Учебный блокнот",
      "> Каждую фразу можно открыть по ссылке или встроить в собственную заметку через `![[...#^lp-phrase-...]]`. Технические идентификаторы скрыты в generated-слое.",
      "",
      "Всего фраз: **" + phraseCount + "**.",
      "",
      "## Разделы",
      ""
    ];
    chunks.forEach(function (chunk) {
      var target = "Фразы/" + chunk.path.split("/").pop().replace(/\.md$/, "");
      lines.push("- [[" + target + "|Фразы " + chunk.from + "–" + chunk.to + "]]");
    });
    return lines.join("\n") + "\n";
  }
  function lexemesByRow(report) {
    var out = new Map();
    (report.lexemes || []).forEach(function (lexeme) {
      (lexeme.occurrences || []).forEach(function (occ) {
        var key = str(occ.row_id);
        if (!out.has(key)) out.set(key, []);
        var occurrenceKey = lexeme.lp_lexeme_id + "\u0000" + str(occ.niqqud || occ.surface);
        if (!out.get(key).some(function (item) { return item.occurrence_key === occurrenceKey; })) {
          out.get(key).push({ lexeme: lexeme, occurrence: occ, occurrence_key: occurrenceKey });
        }
      });
    });
    out.forEach(function (items) {
      items.sort(function (a, b) { return Number(a.occurrence.word_offset || 0) - Number(b.occurrence.word_offset || 0); });
    });
    return out;
  }
  function renderPhraseChunk(report, chunk, audioByKey, textPathById, byRow) {
    var lines = [
      "---",
      "type: lp-phrase-chunk",
      "lp_schema: 2",
      "cssclasses: [linguistpro-study]",
      "lp_text_id: " + yaml(report.text.text_id),
      "range_from: " + chunk.from,
      "range_to: " + chunk.to,
      "managed_by: linguistpro",
      "---",
      "",
      "# Фразы " + chunk.from + "–" + chunk.to,
      "",
      "[[../Фразы|← К оглавлению фраз]]",
      "",
      "> [!tip] Как заниматься",
      "> 1. Сначала прослушайте фразу, не открывая перевод.",
      "> 2. Повторите за диктором дважды, сохраняя ритм.",
      "> 3. Прочитайте иврит и назовите смысл своими словами.",
      "> 4. Раскройте перевод, проверьте себя и воспроизведите фразу ещё раз.",
      ""
    ];
    chunk.rows.forEach(function (row, index) {
      var n = phraseNumber(row) || chunk.from + index;
      var vocalized = str(row.hebrew_niqqud || row.he_niqqud);
      var plain = str(row.hebrew_plain || row.he_plain);
      var translit = str(row.transliteration || row.translit);
      var translitRu = str(row.transliteration_ru || row.translit_ru);
      var russian = str(row.russian || row.ru);
      var audio = audioByKey && audioByKey.get(str(row.audio_asset_key));
      lines.push("## Фраза " + n, "", audio ? "**Сначала прослушайте, не глядя на перевод.**" : "**Сначала прочитайте, не глядя на перевод.**", "");
      if (audio) lines.push("![[" + "../../../" + audio.path.replace(/^_LinguistPro\//, "") + "]]", "");
      if (vocalized) lines.push("**Иврит с огласовками**", "", "<div class=\"lp-hebrew\" dir=\"rtl\">" + htmlEscape(vocalized) + "</div>", "");
      if (plain && plain !== vocalized) lines.push("**Без огласовок:**", "", "<div class=\"lp-hebrew\" dir=\"rtl\">" + htmlEscape(plain) + "</div>", "");
      var rowLexemes = byRow && byRow.get(str(row.row_id)) || [];
      if (rowLexemes.length) {
        var links = rowLexemes.map(function (entry) {
          var lexeme = entry.lexeme;
          var target = textPathById.get(lexeme.lp_lexeme_id).split("/").pop().replace(/\.md$/, "");
          return "[[../Лексемы/" + target + "|" + markdownInline(learnerLabel(lexeme, entry.occurrence)) + "]]";
        });
        lines.push("**Слова этой фразы:** " + links.join(" · "), "");
      }
      lines.push("> [!answer]- Перевод и опоры");
      if (russian) lines.push("> **Перевод:** " + markdownInline(russian));
      if (translit) lines.push("> **Транслитерация (латиница):** " + markdownInline(translit));
      if (translitRu) lines.push("> **Транскрипция (русскими буквами):** " + markdownInline(translitRu));
      lines.push(">", "> [!check]- Самопроверка", "> Скажите фразу вслух без подсказки. Затем измените одно лицо, число или время там, где это возможно.", "");
      lines.push("<!-- lp_sentence_id: " + str(row.row_id) + " -->", "^" + phraseBlockId(report.text.text_id, row.row_id), "", "---", "");
    });
    return lines.join("\n") + "\n";
  }
  function renderOccurrencesTsv(report) {
    var rows = [["lp_lexeme_id", "lp_pos", "lexical_pos", "context_role", "analysis_lemma", "row_id", "order_index", "word_offset", "surface", "surface_niqqud", "headword", "headword_unpointed", "headword_source", "root", "meaning_ru", "sentence_he", "sentence_ru"]];
    function cell(v) { return str(v).replace(/\t/g, " ").replace(/[\r\n]+/g, " "); }
    report.lexemes.forEach(function (lexeme) {
      lexeme.occurrences.forEach(function (occ) {
        rows.push([lexeme.lp_lexeme_id, lexeme.lp_pos, lexeme.lexical_pos, lexeme.context_role, lexeme.analysis_lemma, occ.row_id, occ.order_index, occ.word_offset, occ.surface, occ.niqqud, lexeme.headword, lexeme.headword_unpointed, lexeme.headword_source, lexeme.root, lexeme.meaning_ru, occ.sentence_he_niqqud || occ.sentence_he, occ.sentence_ru]);
      });
    });
    return rows.map(function (row) { return row.map(cell).join("\t"); }).join("\n") + "\n";
  }
  function renderResolutionOccurrencesTsv(report) {
    var rows = [["lp_occurrence_id", "status", "reasons", "cluster_id", "row_id", "order_index", "word_offset", "surface", "niqqud", "lemma", "lp_pos", "candidate_pealim_ids", "sentence_he", "sentence_ru"]];
    var clusterByOccurrence = new Map();
    report.resolution_queue.clusters.forEach(function (cluster) {
      cluster.occurrence_ids.forEach(function (id) { clusterByOccurrence.set(id, cluster.lp_resolution_cluster_id); });
    });
    function cell(v) { return str(v).replace(/\t/g, " ").replace(/[\r\n]+/g, " "); }
    report.resolution_queue.items.forEach(function (item) {
      var pids = item.alternatives.concat(item.candidate_evidence).map(function (x) { return str(x && (x.pealim_id || x.id || x.pid)); }).filter(Boolean);
      rows.push([item.lp_occurrence_id, item.status, item.reasons.join("|"), clusterByOccurrence.get(item.lp_occurrence_id), item.row_id, item.order_index, item.word_offset, item.surface, item.niqqud, item.lemma, item.lp_pos, Array.from(new Set(pids)).sort().join("|"), item.sentence_he_niqqud || item.sentence_he, item.sentence_ru]);
    });
    return rows.map(function (row) { return row.map(cell).join("\t"); }).join("\n") + "\n";
  }
  function resolutionAuditOf(report) {
    if (report.resolution_audit && Array.isArray(report.resolution_audit.items)) return report.resolution_audit;
    var items = report.resolution_queue.items.map(function (item) {
      return Object.assign({}, item, { resolution_state: item.resolution_state || "unresolved", resolution_event_id: item.resolution_event_id || "" });
    });
    var stateCounts = { unresolved: items.length, resolved: 0, deferred: 0, rejected_all: 0, stale: 0 };
    return { schema: "linguistpro-lexical-resolution-audit-v1", state_counts: stateCounts, items: items };
  }
  function resolutionSnapshot(audit) {
    var out = {};
    audit.items.forEach(function (item) { out[item.lp_occurrence_id] = item.resolution_state || "unresolved"; });
    return out;
  }
  function resolutionTransitions(previousReceipt, snapshot) {
    var previous = previousReceipt && previousReceipt.resolution_snapshot || {};
    return Object.keys(snapshot).sort().filter(function (id) {
      return Object.prototype.hasOwnProperty.call(previous, id) && previous[id] !== snapshot[id];
    }).map(function (id) { return { lp_occurrence_id: id, from: previous[id], to: snapshot[id] }; });
  }
  function renderLibraryBase() {
    return [
      "filters:", "  and:", "    - 'note.type == \"lp-text\"'",
      "formulas:", "  text_link: 'file.asLink(note.title)'",
      "properties:", "  formula.text_link:", "    displayName: Текст",
      "  note.phrase_count:", "    displayName: Фраз",
      "  note.lexeme_count:", "    displayName: Лексем",
      "  note.unresolved_count:", "    displayName: Требуют проверки",
      "  note.audio_included:", "    displayName: Аудио в пакете",
      "views:", "  - type: table", "    name: \"Все учебные тексты\"",
      "    order:", "      - formula.text_link", "      - note.phrase_count", "      - note.lexeme_count", "      - note.unresolved_count", "      - note.audio_included"
    ].join("\n") + "\n";
  }
  function renderVaultGuide() {
    return [
      "---", "type: lp-vault-guide", "lp_schema: 3", "cssclasses: [linguistpro-study]", "managed_by: linguistpro", "---", "",
      "# LinguistPro · учебное хранилище", "",
      "> [!success] С чего начать",
      "> Выберите текст в таблице ниже. Внутри него откройте «Учебный маршрут», затем занимайтесь небольшими блоками фраз.", "",
      "![[Библиотека.base]]", "",
      "## Где что хранится", "",
      "- **texts** — независимые учебные пространства текстов: фразы, локальные значения, очередь проверки.",
      "- **reference/lexemes** — общий справочник проверенных словарных парадигм; один Pealim ID — один переиспользуемый файл.",
      "- **media/audio** — общий дедуплированный аудиокэш.",
      "- **Личные заметки** создавайте вне служебной папки LinguistPro, чтобы повторный экспорт их не заменил.", "",
      "## Канонические роли", "",
      "Морфологию, значение в карточке и FSRS меняйте в LinguistPro. Obsidian служит для чтения, связей, конспектов и собственного журнала ошибок.", ""
    ].join("\n");
  }
  function renderSetupGuide() {
    return [
      "---", "type: lp-setup-guide", "lp_schema: 3", "cssclasses: [linguistpro-study]", "managed_by: linguistpro", "---", "",
      "# Настройка отображения", "",
      "Пакет работает на стандартных возможностях Obsidian: Markdown, свойства, Bases, вложения и сворачиваемые callout-блоки.", "",
      "Для улучшенного RTL и более крупного иврита включите CSS snippet **linguistpro-study-v3**:",
      "1. Откройте Settings → Appearance → CSS snippets.",
      "2. Нажмите Reload snippets.",
      "3. Включите linguistpro-study-v3.", "",
      "Без snippet все данные и ссылки остаются работоспособными.", ""
    ].join("\n");
  }
  function renderStudyCss() {
    return [
      ".linguistpro-study { --lp-accent: #0f766e; --lp-paper: color-mix(in srgb, var(--background-primary) 94%, #0f766e 6%); }",
      ".linguistpro-study .lp-hebrew { direction: rtl; text-align: right; font-size: 1.45em; line-height: 1.85; font-family: \"Noto Sans Hebrew\", \"Arial Hebrew\", sans-serif; }",
      ".linguistpro-study .lp-form { direction: rtl; unicode-bidi: isolate; font-size: 1.15em; font-weight: 650; }",
      ".linguistpro-study .metadata-container { display: none; }",
      ".linguistpro-study table { width: 100%; }",
      ".linguistpro-study .callout[data-callout=\"tip\"] { --callout-color: 15, 118, 110; }",
      ".linguistpro-study .callout[data-callout=\"answer\"] { --callout-color: 37, 99, 235; }",
      ".linguistpro-study audio { width: min(100%, 34rem); }"
    ].join("\n") + "\n";
  }
  function planObsidianPackage(report, opts) {
    opts = opts || {};
    if (!report || report.schema !== "linguistpro-obsidian-lexical-preview-v1") throw new Error("A lexical preview report is required");
    var root = "_LinguistPro/texts/" + report.text.text_id + "/";
    var pathById = new Map(), referencePathById = new Map(), pathByClusterId = new Map(), usedPaths = new Set();
    var audioPlan = buildAudioPlan(report, opts.audioResults);
    var includedAudioByKey = new Map(audioPlan.assets.filter(function (asset) { return asset.status === "included"; })
      .map(function (asset) { return [asset.asset_key, asset]; }));
    var phrases = phraseChunks(report, root);
    report.lexemes.forEach(function (lexeme) {
      var name = safeLexemeFileName(lexeme.lp_lexeme_id, lexeme.headword_unpointed || stripNiqqud((lexeme.surface_forms || [])[0]) || lexeme.analysis_lemma);
      var path = root + "Лексемы/" + name;
      if (usedPaths.has(path)) throw new Error("Lexeme path collision: " + path);
      usedPaths.add(path); pathById.set(lexeme.lp_lexeme_id, path);
      if (lexeme.pealim_id && lexeme.study_forms) {
        var referencePath = "_LinguistPro/reference/lexemes/" + name;
        if (usedPaths.has(referencePath)) throw new Error("Lexeme reference path collision: " + referencePath);
        usedPaths.add(referencePath); referencePathById.set(lexeme.lp_lexeme_id, referencePath);
      }
    });
    report.resolution_queue.clusters.forEach(function (cluster) {
      var path = root + "Разбор/cluster-" + fnv1a(cluster.cluster_signature) + ".md";
      if (usedPaths.has(path)) throw new Error("Resolution path collision: " + path);
      usedPaths.add(path); pathByClusterId.set(cluster.lp_resolution_cluster_id, path);
    });
    var files = [];
    function add(path, content, kind) { files.push({ path: path, kind: kind, bytes: utf8Bytes(content), content: content }); }
    add("_LinguistPro/Путеводитель.md", renderVaultGuide(), "vault-guide");
    add("_LinguistPro/Библиотека.base", renderLibraryBase(), "library-base");
    add("_LinguistPro/Настройка отображения.md", renderSetupGuide(), "setup-guide");
    add(".obsidian/snippets/linguistpro-study-v3.css", renderStudyCss(), "obsidian-css");
    report.lexemes.forEach(function (lexeme) {
      var referencePath = referencePathById.get(lexeme.lp_lexeme_id);
      if (referencePath) add(referencePath, renderLexemeReferenceMarkdown(lexeme), "lexeme-reference");
      add(pathById.get(lexeme.lp_lexeme_id), renderTextLexemeMarkdown(report, lexeme, phrases.pathByRowId, referencePath), "text-lexeme");
    });
    report.resolution_queue.clusters.forEach(function (cluster) {
      add(pathByClusterId.get(cluster.lp_resolution_cluster_id), renderResolutionClusterMarkdown(report, cluster, phrases.pathByRowId), "resolution-cluster");
    });
    var base = renderBase(report);
    var resolutionBase = renderResolutionBase(report);
    add(root + "Текст.md", renderTextHub(report, audioPlan), "text");
    add(root + "Учебный маршрут.md", renderLearningRoute(report), "learning-route");
    add(root + "Фокус на лексику.md", renderLexicalFocus(report, pathById), "lexical-focus");
    add(root + "Лексика.base", base, "base");
    add(root + "Разбор.base", resolutionBase, "resolution-base");
    add(root + "Лексика — переносимый снимок.md", renderSnapshot(report, pathById), "snapshot");
    add(root + "Очередь разбора.md", renderResolutionQueueIndex(report, pathByClusterId), "resolution-index");
    add(root + "Фразы.md", renderPhrasesIndex(report, phrases.chunks), "phrases-index");
    var byRow = lexemesByRow(report);
    phrases.chunks.forEach(function (chunk) { add(chunk.path, renderPhraseChunk(report, chunk, includedAudioByKey, pathById, byRow), "phrases-chunk"); });
    add(root + "occurrences.tsv", renderOccurrencesTsv(report), "occurrences");
    add(root + "resolution-occurrences.tsv", renderResolutionOccurrencesTsv(report), "resolution-occurrences");
    var audit = resolutionAuditOf(report);
    add(root + "resolution-audit.json", JSON.stringify(audit, null, 2) + "\n", "resolution-audit");
    add(root + "projection.json", JSON.stringify(report, null, 2) + "\n", "projection");
    var beforeReceiptBytes = files.reduce(function (sum, file) { return sum + file.bytes; }, 0);
    var receipt = {
      schema: "linguistpro-obsidian-receipt-v2", read_only_preview: true,
      lexical_presentation_contract: report.lexical_presentation_contract || "surface-headword-root-v1",
      text_id: report.text.text_id, would_create_files: files.length + 1 + audioPlan.included_count,
      would_write_bytes_before_receipt: beforeReceiptBytes,
      source_counts: report.counts,
      resolution_state_counts: audit.state_counts,
      active_resolution_occurrences: audit.items.filter(function (item) { return item.resolution_state !== "resolved"; }).length,
      resolved_resolution_occurrences: audit.items.filter(function (item) { return item.resolution_state === "resolved"; }).length,
      resolution_snapshot: resolutionSnapshot(audit),
      audio: {
        expected_count: audioPlan.expected_count,
        included_count: audioPlan.included_count,
        missing_count: audioPlan.missing_count,
        pending_count: audioPlan.pending_count,
        included_bytes: audioPlan.assets.filter(function (asset) { return asset.status === "included"; })
          .reduce(function (sum, asset) { return sum + (asset.size_bytes || 0); }, 0),
        missing: audioPlan.assets.filter(function (asset) { return asset.status === "missing"; })
          .map(function (asset) { return { asset_key: asset.asset_key, reason: asset.reason }; })
      }
    };
    receipt.resolution_transitions = resolutionTransitions(opts.previousReceipt, receipt.resolution_snapshot);
    add(root + "receipt.json", JSON.stringify(receipt, null, 2) + "\n", "receipt");
    files.sort(function (a, b) { return a.path.localeCompare(b.path); });
    var byKind = {};
    files.forEach(function (file) { byKind[file.kind] = (byKind[file.kind] || 0) + 1; });
    if (audioPlan.included_count) byKind.audio = audioPlan.included_count;
    var externalFiles = audioPlan.assets.filter(function (asset) { return asset.status === "included"; })
      .map(function (asset) { return { kind: "audio", asset_key: asset.asset_key, path: asset.path, size_bytes: asset.size_bytes, mime_type: asset.mime_type }; });
    return {
      schema: "linguistpro-obsidian-package-plan-v2", read_only: true,
      text_id: report.text.text_id,
      would_create_files: files.length + externalFiles.length,
      would_write_bytes: files.reduce(function (sum, file) { return sum + file.bytes; }, 0) + receipt.audio.included_bytes,
      files_by_kind: byKind,
      receipt: receipt,
      audio_plan: audioPlan,
      external_files: externalFiles,
      base_preview: base,
      resolution_base_preview: resolutionBase,
      files: files
    };
  }

  function analyzeBundle(payload, opts) {
    opts = opts || {};
    var library = payload && payload.library ? payload.library : (payload || {});
    var advanced = payload && (payload.notes_advanced || payload.advanced) || {};
    var texts = Array.isArray(library.texts) ? library.texts : [];
    var audioAssets = Array.isArray(library.audio_assets) ? library.audio_assets : [];
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
    var verifiedPealimIdentityOccurrences = 0;
    var pealimIdentitySources = {};
    var canonicalPealimMetadataRepairs = 0;
    var unknownOccurrences = 0, linkedOccurrences = 0;
    var skippedResolutionItems = [];

    morphRows.forEach(function (sm) {
      var sid = str(sm.sentence_id);
      var row = rowById.get(sid) || {};
      var tokens = Array.isArray(sm.tokens) ? sm.tokens : [];
      totalTokens += tokens.length;
      tokens.forEach(function (token, offset) {
        var unit = NA.dictaTokenToUnit(token);
        if (!unit) {
          skippedTokens++;
          skippedResolutionItems.push({
            lp_occurrence_id: occurrenceId(textId, sid, offset),
            status: "unresolved",
            reasons: ["skipped_token"],
            lp_lexeme_id: "",
            surface: str(token && (token.word || token.surface || token.text)),
            niqqud: str(token && token.niqqud),
            lemma: "",
            lp_pos: "unknown",
            provider_pos: str(token && (token.posDicta || token.pos)),
            root: "", binyan: "", meaning_ru: "", pealim_id: "",
            resolution_channel: "unparsed",
            confidence: finiteNumber(token && token.confidence),
            alternatives: [], candidate_evidence: [], identity_guard_reason: "", conflicts: [],
            text_id: textId,
            row_id: sid,
            order_index: row.order_index == null ? null : Number(row.order_index),
            word_offset: offset,
            morph_model_version: str(sm.model_version),
            sentence_he: str(row.hebrew_plain || row.he_plain),
            sentence_he_niqqud: str(row.hebrew_niqqud || row.he_niqqud),
            sentence_ru: str(row.russian || row.ru)
          });
          return;
        }
        analyzedOccurrences++;

        var occKey = sid + "\u0000" + String(offset);
        var linked = bestLinkedNote(occurrenceNoteIds.get(occKey) || [], noteById);
        var body = linked ? parseJson(linked.body_json || linked.body) : {};
        if (linked) linkedOccurrences++;

        var providerPos = str(token.posDicta || token.pos || unit.pos);
        var notePos = str(body.pos || body.part_of_speech);
        var pos = contextualPos(notePos, providerPos, token.kind || unit.kind);
        var lemma = str(body.lemma || unit.lemma || unit.stem || unit.sampleWord);
        // The sentence morphology token is the authority for what the learner
        // actually encountered. A linked note can be older or normalized and
        // must never overwrite the surface form in this occurrence.
        var word = str(token.word || token.surface || token.text || unit.sampleWord || body.word);
        var niqqud = str(unit.niqqud || token.niqqud || body.niqqud_variant);
        var root = str(body.root || "");
        var sourceRoot = root;
        var binyan = str(body.binyan || unit.binyan || "");
        var meaning = str(body.meaning);
        var contextMeaning = "";
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
        var verifiedPealimIdentity = null;
        if (typeof opts.pealimIdentityResolver === "function") {
          try {
            verifiedPealimIdentity = opts.pealimIdentityResolver({
              pealim_id: pealimId,
              surface: word,
              niqqud: niqqud,
              lemma: lemma,
              note_pos: notePos,
              context_pos: pos,
              paradigm: pealimEvidence
            }) || null;
          } catch (_) { verifiedPealimIdentity = null; }
        }
        var verifiedPealimId = str(verifiedPealimIdentity && (verifiedPealimIdentity.pealim_id || verifiedPealimIdentity.id));
        var acceptsExactIdentity = !!(pealimId && verifiedPealimId === pealimId);
        var acceptsSurfaceIdentity = !!(!pealimId && verifiedPealimId && verifiedPealimIdentity && verifiedPealimIdentity.allow_surface_identity === true);
        if (acceptsSurfaceIdentity) {
          pealimId = verifiedPealimId;
          lemma = str(verifiedPealimIdentity.lemma || lemma);
          var curatedContextPos = normalizePos(verifiedPealimIdentity.context_pos || verifiedPealimIdentity.lp_pos || verifiedPealimIdentity.pos, verifiedPealimIdentity.kind);
          if (curatedContextPos !== "unknown") pos = curatedContextPos;
          contextMeaning = str(verifiedPealimIdentity.role);
          meaning = str((pealimEvidence && pealimEvidence.meaning) || verifiedPealimIdentity.meaning_ru || verifiedPealimIdentity.meaning || meaning);
          channel = str(verifiedPealimIdentity.provenance || verifiedPealimIdentity.source || "verified-surface-identity");
          if (typeof opts.pealimResolver === "function") {
            try { pealimEvidence = opts.pealimResolver(pealimId) || null; } catch (_) { pealimEvidence = null; }
          }
          if (pealimEvidence && pealimEvidence.meaning) meaning = str(pealimEvidence.meaning);
        }
        if (pealimEvidence && Object.prototype.hasOwnProperty.call(pealimEvidence, "root")) {
          var canonicalRoot = str(pealimEvidence.root);
          if (root !== canonicalRoot) { root = canonicalRoot; canonicalPealimMetadataRepairs++; }
        }
        var rawPealimPos = str(pealimEvidence && pealimEvidence.pos);
        var structuralPealim = paradigmPos(pealimEvidence);
        var resolverPealimId = str(resolverResult && (resolverResult.pealim_id || resolverResult.id));
        var exactFormIdentity = !!(pealimId && resolverPealimId === pealimId && resolverResult && !resolverResult.ambiguous);
        if ((pos === "unknown" || pos === "other") && exactFormIdentity &&
            (structuralPealim.pos === "verb" || structuralPealim.pos === "adjective" || structuralPealim.pos === "preposition")) {
          pos = structuralPealim.pos;
        }
        var verifiedPealimPos = acceptsExactIdentity || acceptsSurfaceIdentity
          ? normalizePos(verifiedPealimIdentity && (verifiedPealimIdentity.context_pos || verifiedPealimIdentity.lp_pos || verifiedPealimIdentity.pos), verifiedPealimIdentity && verifiedPealimIdentity.kind)
          : "unknown";
        var effectivePealimPos = verifiedPealimPos !== "unknown" && verifiedPealimPos !== "other" ? verifiedPealimPos : structuralPealim.pos;
        var pealimIdentitySource = verifiedPealimPos !== "unknown" && verifiedPealimPos !== "other"
          ? str(verifiedPealimIdentity.provenance || verifiedPealimIdentity.source || "verified-pealim-identity")
          : structuralPealim.source;
        if (pealimIdentitySource) {
          verifiedPealimIdentityOccurrences++;
          pealimIdentitySources[pealimIdentitySource] = (pealimIdentitySources[pealimIdentitySource] || 0) + 1;
        }
        var guardReason = identityGuardReason(notePos, pos, effectivePealimPos);
        var lexicalPos = normalizePos(verifiedPealimIdentity && verifiedPealimIdentity.lexical_pos, "");
        if (lexicalPos === "unknown" || lexicalPos === "other") lexicalPos = structuralPealim.pos;
        var contextRole = str(verifiedPealimIdentity && verifiedPealimIdentity.context_role);
        var candidateEvidence = guardReason ? {
          lemma: str(body.lemma || body.word || lemma),
          lp_pos: normalizePos(notePos, body.kind),
          pealim_id: pealimId, root: root, meaning: meaning, note_pos: notePos,
          pealim_pos: rawPealimPos,
          verified_pealim_pos: pealimIdentitySource ? effectivePealimPos : "",
          pealim_identity_source: pealimIdentitySource,
          source_root: sourceRoot !== root ? sourceRoot : "",
          note_dedup_key: str(linked && linked.gen_dedup_key)
        } : null;
        if (guardReason) {
          identityGuardedOccurrences++;
          identityGuardReasons[guardReason] = (identityGuardReasons[guardReason] || 0) + 1;
          lemma = str(unit.lemma || unit.stem || unit.sampleWord);
          root = ""; binyan = ""; meaning = ""; pealimId = "";
        }
        var evidencePealimId = str(pealimEvidence && (pealimEvidence.pealim_id || pealimEvidence.id));
        var studyForms = pealimId && evidencePealimId === pealimId
          ? InflectionRender.projectStudyForms(pealimEvidence)
          : null;
        if (studyForms && structuralPealim.pos !== "unknown" && structuralPealim.pos !== "other") studyForms.pos = structuralPealim.pos;
        var projectedHeadword = learnerHeadword(studyForms, lemma, pos, root);

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
            analysis_lemma: lemma,
            headword: projectedHeadword.value,
            headword_unpointed: projectedHeadword.unpointed,
            headword_source: projectedHeadword.source,
            lp_pos: pos,
            provider_pos: new Set(),
            root: root,
            binyan: binyan,
            meaning_ru: meaning,
            pealim_id: pealimId,
            study_forms: studyForms,
            lexical_pos: lexicalPos,
            context_role: contextRole,
            context_meaning: contextMeaning,
            confidence_min: confidence,
            confidence_max: confidence,
            ambiguity: ambiguous,
            alternatives: alternatives.slice(0, 5),
            resolution_channels: new Set(),
            identity_guard_reasons: new Set(),
            evidence: { lemmas: new Set(), roots: new Set(), meanings: new Set(), pealim_ids: new Set(), pos: new Set(), lexical_pos: new Set(), context_roles: new Set(), note_dedup_keys: new Set() },
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
        addSet(item.evidence, "lexical_pos", lexicalPos);
        addSet(item.evidence, "context_roles", contextRole);
        addSet(item.evidence, "note_dedup_keys", linked && linked.gen_dedup_key);
        if (candidateEvidence) item.candidate_evidence.push(candidateEvidence);
        if (!item.study_forms && studyForms) {
          item.study_forms = studyForms;
          item.headword = projectedHeadword.value;
          item.headword_unpointed = projectedHeadword.unpointed;
          item.headword_source = projectedHeadword.source;
        }
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
          lemma: lemma,
          headword: projectedHeadword.value,
          headword_unpointed: projectedHeadword.unpointed,
          headword_source: projectedHeadword.source,
          lp_pos: pos,
          provider_pos: providerPos,
          root: root,
          binyan: binyan,
          meaning_ru: meaning,
          pealim_id: pealimId,
          lexical_pos: lexicalPos,
          context_role: contextRole,
          context_meaning: contextMeaning,
          pealim_pos_raw: rawPealimPos,
          pealim_pos_effective: effectivePealimPos,
          pealim_identity_source: pealimIdentitySource,
          resolution_channel: channel,
          morph_model_version: str(sm.model_version),
          confidence: confidence,
          ambiguity: ambiguous,
          alternatives: alternatives.slice(0, 5),
          candidate_evidence: candidateEvidence ? [candidateEvidence] : [],
          identity_guard_reason: guardReason
        });
      });
    });

    var lexemes = Array.from(lexemeMap.values()).map(function (item) {
      var conflicts = [];
      ["pealim_ids", "roots", "meanings"].forEach(function (field) {
        if (item.evidence[field] && item.evidence[field].size > 1) conflicts.push(field);
      });
      var identityPosEvidence = item.evidence.lexical_pos && item.evidence.lexical_pos.size ? item.evidence.lexical_pos : item.evidence.pos;
      var posFamilies = new Set(Array.from(identityPosEvidence || []).map(identityFamily).filter(function (x) { return x !== "unknown"; }));
      if (posFamilies.size > 1) conflicts.push("pos_identity_family");
      return {
        lp_lexeme_id: item.lp_lexeme_id,
        lemma: item.headword,
        lemma_unpointed: item.headword_unpointed,
        analysis_lemma: item.analysis_lemma,
        headword: item.headword,
        headword_unpointed: item.headword_unpointed,
        headword_source: item.headword_source,
        lp_pos: item.lp_pos,
        provider_pos: Array.from(item.provider_pos).sort(),
        root: item.root,
        binyan: item.binyan,
        meaning_ru: item.meaning_ru,
        pealim_id: item.pealim_id,
        study_forms: item.study_forms || null,
        lexical_pos: item.lexical_pos,
        context_role: item.context_role,
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
        surface_forms: surfaceForms(item.occurrences),
        occurrences: item.occurrences.sort(function (a, b) {
          return (a.order_index == null ? Number.MAX_SAFE_INTEGER : a.order_index) -
            (b.order_index == null ? Number.MAX_SAFE_INTEGER : b.order_index) || a.word_offset - b.word_offset;
        })
      };
    }).sort(function (a, b) {
      return POS_ORDER.indexOf(a.lp_pos) - POS_ORDER.indexOf(b.lp_pos) ||
        (a.headword_unpointed || stripNiqqud((a.surface_forms || [])[0])).localeCompare(
          b.headword_unpointed || stripNiqqud((b.surface_forms || [])[0]), "he") ||
        a.lp_lexeme_id.localeCompare(b.lp_lexeme_id);
    });

    var lexemePos = {};
    lexemes.forEach(function (x) { lexemePos[x.lp_pos] = (lexemePos[x.lp_pos] || 0) + 1; });
    var headwordSourceCounts = lexemes.reduce(function (out, lexeme) {
      var source = lexeme.headword_source || "absent";
      out[source] = (out[source] || 0) + 1;
      return out;
    }, {});
    var collisionLexemes = lexemes.filter(function (x) { return x.conflicts.length; });
    var collisionSamples = collisionLexemes.slice(0, 20)
      .map(function (x) { return { lp_lexeme_id: x.lp_lexeme_id, conflicts: x.conflicts, evidence: x.evidence }; });
    var resolutionQueue = buildResolutionQueue(textId, lexemes, skippedResolutionItems);

    var rates = {};
    Object.keys(completeness).forEach(function (field) { rates[field] = pct(completeness[field], analyzedOccurrences); });
    rates.root_applicable = pct(completeness.root, applicable.root);
    rates.binyan_applicable = pct(completeness.binyan, applicable.binyan);

    return {
      schema: "linguistpro-obsidian-lexical-preview-v1",
      lexical_presentation_contract: "surface-headword-root-v1",
      read_only: true,
      text: {
        text_id: textId,
        text_key: str(text.text_key),
        title: str(text.title),
        updated_at: str(text.updated_at),
        rows_total: rows.length,
        rows_with_morph: morphBySentence.size,
        row_morph_coverage_pct: pct(morphBySentence.size, rows.length),
        rows: rows.map(function (row, index) {
          return {
            row_id: str(row.row_id || row.id),
            order_index: row.order_index == null ? index : Number(row.order_index),
            hebrew_plain: str(row.hebrew_plain || row.he_plain || row.he),
            hebrew_niqqud: str(row.hebrew_niqqud || row.he_niqqud),
            transliteration: str(row.transliteration || row.translit),
            transliteration_ru: str(row.transliteration_ru || row.translit_ru),
            russian: str(row.russian || row.ru),
            audio_asset_key: str(row.audio_asset_key || row.audioAssetKey)
          };
        })
      },
      audio_assets: audioAssets.map(function (asset) {
        return {
          asset_key: str(asset.asset_key || asset.assetKey),
          mime_type: str(asset.mime_type || asset.mime || "audio/mpeg"),
          language: str(asset.language || "he-IL"),
          provider_id: str(asset.provider_id),
          voice_name: str(asset.voice_name),
          duration_ms: finiteNumber(asset.duration_ms),
          size_bytes: finiteNumber(asset.size_bytes)
        };
      }).filter(function (asset) { return asset.asset_key; }).sort(function (a, b) { return a.asset_key.localeCompare(b.asset_key); }),
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
        verified_pealim_identity_occurrences: verifiedPealimIdentityOccurrences,
        canonical_pealim_metadata_repairs: canonicalPealimMetadataRepairs,
        unknown_pos_occurrences: unknownOccurrences,
        headwords_pealim_exact: headwordSourceCounts["pealim-exact"] || 0,
        headwords_morphology_lemma: headwordSourceCounts["morphology-lemma"] || 0,
        headwords_absent: headwordSourceCounts.absent || 0,
        collision_keys: collisionLexemes.length,
        uncertain_occurrences: resolutionQueue.uncertain_occurrences,
        queued_uncertain_occurrences: resolutionQueue.queued_uncertain_occurrences,
        resolution_queue_coverage_pct: resolutionQueue.coverage_pct,
        resolution_clusters: resolutionQueue.clusters.length
      },
      lexemes_by_pos: sortedObject(lexemePos),
      occurrences_by_pos: sortedObject(occurrencePos),
      completeness_counts: completeness,
      completeness_pct: rates,
      confidence_bands: confidenceBands,
      resolution_channels: Object.keys(resolutionChannels).sort().reduce(function (out, key) { out[key] = resolutionChannels[key]; return out; }, {}),
      identity_guard_reasons: Object.keys(identityGuardReasons).sort().reduce(function (out, key) { out[key] = identityGuardReasons[key]; return out; }, {}),
      pealim_identity_sources: Object.keys(pealimIdentitySources).sort().reduce(function (out, key) { out[key] = pealimIdentitySources[key]; return out; }, {}),
      headword_sources: Object.keys(headwordSourceCounts).sort().reduce(function (out, key) { out[key] = headwordSourceCounts[key]; return out; }, {}),
      provider_pos_values: serialiseSetMap(providerPosValues),
      collision_samples: collisionSamples,
      resolution_queue: resolutionQueue,
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
