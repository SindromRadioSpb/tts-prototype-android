// public/js/inflection-render.js — BRR-P1-009 Stage 2.
//
// Faithful PORT of the Studio's pure inflection-table renderer (index.html
// v3RenderInflectionParadigm + v3RenderPronounSet + v3ConjSpeak + their constants/
// helpers) so the Reading-Room word-card shows the SAME «Спряжение / Склонение» table
// 1:1 (vocalized forms + transliteration per cell, tap-to-hear). index.html keeps its
// own copy (UNTOUCHED, like reader-core vs renderTable); this is the Room's shared copy.
//
// Pure HTML-string builder — no DOM reads. Per-form audio = browser speechSynthesis of
// the cell's vocalized form (R1: the FORMS are from Pealim; the VOICE is TTS, not a
// recording). Reuses window.NotesAutoGen (normVowels/formVariants/stripNiqqud) when
// present. Russian labels are baked in (the Studio's display language); window.t
// overrides per-key when the Room i18n carries notes.card.conj.* keys.
//
// Dual export: window.InflectionRender + window.v3ConjSpeak (for inline onclick parity).

(function () {
  "use strict";

  var _NA = (typeof window !== "undefined" && window.NotesAutoGen) ? window.NotesAutoGen
    : (typeof module !== "undefined" && module.exports ? (function () { try { return require("./notes-autogen.js"); } catch (_) { return null; } })() : null);
  var NIQQUD_RE = /[֑-ׇ]/g;
  function _stripNiqqud(s) {
    if (_NA && _NA.stripNiqqud) return _NA.stripNiqqud(s);
    return String(s == null ? "" : s).replace(NIQQUD_RE, "").trim();
  }
  function _normVowels(s) {
    if (_NA && _NA.normVowels) return _NA.normVowels(s);
    return String(s == null ? "" : s).normalize("NFC").replace(/[֑-֯]/g, "").replace(/ֽ/g, "").trim();
  }
  function _formVariants(s) {
    if (_NA && _NA.formVariants) return _NA.formVariants(s);
    var a = _normVowels(s);
    var b = _normVowels(String(s == null ? "" : s).replace(/^[והשכלבמ][֑-ׇ]*/, ""));
    return b && b !== a ? [a, b] : (a ? [a] : []);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function t(key, fb) { try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fb; }

  // Pealim links (= v3WordCardPealim*).
  function pealimDictUrl(id) { return "https://www.pealim.com/ru/dict/" + encodeURIComponent(id) + "/"; }
  function pealimSearchUrl(lemma) { return "https://www.pealim.com/ru/search/?q=" + encodeURIComponent(_stripNiqqud(lemma)); }
  function pealimLinkLabel(hasPid) { return hasPid ? t("notes.card.conj.pageLink", "страница Pealim") : t("notes.card.conj.searchLink", "поиск Pealim"); }

  var POS_LABEL = {
    verb: ["notes.tpl.word_study.posVerb", "глагол"], noun: ["notes.tpl.word_study.posNoun", "существительное"],
    adjective: ["notes.tpl.word_study.posAdjective", "прилагательное"], preposition: ["notes.tpl.word_study.posPreposition", "предлог"],
    adverb: ["notes.tpl.word_study.posAdverb", "наречие"], pronoun: ["notes.tpl.word_study.posPronoun", "местоимение"],
    conjunction: ["notes.tpl.word_study.posConjunction", "союз"], numeral: ["notes.tpl.word_study.posNumeral", "числительное"],
    interjection: ["notes.tpl.word_study.posInterjection", "междометие"], particle: ["notes.tpl.word_study.posParticle", "частица"],
    negation: ["notes.tpl.word_study.posNegation", "отрицание"],
  };
  function posLabel(pos) { var p = POS_LABEL[pos]; return p ? t(p[0], p[1]) : ""; }
  var BINYAN_LABEL = { paal: "пааль", piel: "пиэль", hifil: "hифъиль", hitpael: "hитпаэль", nifal: "нифъаль", pual: "пуаль", hufal: "hуфъаль" };
  function binLabel(b) { return (b && BINYAN_LABEL[b]) ? " · " + BINYAN_LABEL[b] : ""; }

  // ── slot grouping (= V3_CONJ_GROUPS_*) ──────────────────────────────────────
  var GROUPS_VERB = [
    { key: "present", slots: ["AP-ms", "AP-fs", "AP-mp", "AP-fp"] },
    { key: "past", slots: ["PERF-1s", "PERF-2ms", "PERF-2fs", "PERF-3ms", "PERF-3fs", "PERF-1p", "PERF-2mp", "PERF-2fp", "PERF-3mp", "PERF-3fp", "PERF-3p"] },
    { key: "future", slots: ["IMPF-1s", "IMPF-2ms", "IMPF-2fs", "IMPF-3ms", "IMPF-3fs", "IMPF-1p", "IMPF-2mp", "IMPF-2fp", "IMPF-3mp", "IMPF-3fp", "IMPF-3p"] },
    { key: "imperative", slots: ["IMP-2ms", "IMP-2fs", "IMP-2mp", "IMP-2fp"] },
    { key: "infinitive", slots: ["INF-L"] },
  ];
  var GROUPS_PASSIVE = [
    { key: "present", slots: ["passive-AP-ms", "passive-AP-fs", "passive-AP-mp", "passive-AP-fp"] },
    { key: "past", slots: ["passive-PERF-1s", "passive-PERF-2ms", "passive-PERF-2fs", "passive-PERF-3ms", "passive-PERF-3fs", "passive-PERF-1p", "passive-PERF-2mp", "passive-PERF-2fp", "passive-PERF-3mp", "passive-PERF-3fp", "passive-PERF-3p"] },
    { key: "future", slots: ["passive-IMPF-1s", "passive-IMPF-2ms", "passive-IMPF-2fs", "passive-IMPF-3ms", "passive-IMPF-3fs", "passive-IMPF-1p", "passive-IMPF-2mp", "passive-IMPF-2fp", "passive-IMPF-3mp", "passive-IMPF-3fp", "passive-IMPF-3p"] },
  ];
  var PASSIVE_BINYAN = { piel: "pual", hifil: "hufal" };
  var GROUPS_NOUN = [
    { key: "absolute", slots: ["s", "p"] },
    { key: "construct", slots: ["sc", "pc"] },
    { key: "possessive_sg", slots: ["s-P-1s", "s-P-2ms", "s-P-2fs", "s-P-3ms", "s-P-3fs", "s-P-1p", "s-P-2mp", "s-P-2fp", "s-P-3mp", "s-P-3fp"] },
    { key: "possessive_pl", slots: ["p-P-1s", "p-P-2ms", "p-P-2fs", "p-P-3ms", "p-P-3fs", "p-P-1p", "p-P-2mp", "p-P-2fp", "p-P-3mp", "p-P-3fp"] },
  ];
  var GROUPS_ADJ = [{ key: "adj", slots: ["ms-a", "fs-a", "mp-a", "fp-a"] }];
  var GROUPS_PREP = [{ key: "prep", slots: ["P-1s", "P-2ms", "P-2fs", "P-3ms", "P-3fs", "P-1p", "P-2mp", "P-2fp", "P-3mp", "P-3fp"] }];

  var PRONOUN_PERSONAL = [
    { slot: "1s", he: "אֲנִי", tr: "ани", alt: ["אנכי"] },
    { slot: "2ms", he: "אַתָּה", tr: "ата" },
    { slot: "2fs", he: "אַתְּ", tr: "ат" },
    { slot: "3ms", he: "הוּא", tr: "hу" },
    { slot: "3fs", he: "הִיא", tr: "hи" },
    { slot: "1p", he: "אֲנַחְנוּ", tr: "анахну", alt: ["אנו"] },
    { slot: "2mp", he: "אַתֶּם", tr: "атэм" },
    { slot: "2fp", he: "אַתֶּן", tr: "атэн" },
    { slot: "3mp", he: "הֵם", tr: "hэм", alt: ["המה"] },
    { slot: "3fp", he: "הֵן", tr: "hэн", alt: ["הנה"] },
  ];
  function pronounStrip(s) { return String(s == null ? "" : s).replace(/[֑-ׇ]/g, "").replace(/[‌-‏]/g, "").trim(); }
  var PRONOUN_INDEX = (function () { var m = new Map(); for (var i = 0; i < PRONOUN_PERSONAL.length; i++) { var r = PRONOUN_PERSONAL[i]; m.set(pronounStrip(r.he), r.slot); (r.alt || []).forEach(function (a) { m.set(pronounStrip(a), r.slot); }); } return m; })();
  function lookupPronounParadigm(word) { var k = pronounStrip(word); if (!k || !PRONOUN_INDEX.has(k)) return null; return { kind: "pronoun", highlight: k }; }
  function posInflects(pos) { var p = String(pos || ""); return p === "" || p === "verb" || p === "noun" || p === "adjective" || p === "preposition"; }

  // ── labels (= V3_CONJ_*_FB + v3ConjSlotLabel/v3ConjGroupLabel) ───────────────
  var SLOT_FB = {
    "AP-ms": "м.р, ед", "AP-fs": "ж.р, ед", "AP-mp": "м.р, мн", "AP-fp": "ж.р, мн",
    "PERF-1s": "я", "PERF-2ms": "ты (м)", "PERF-2fs": "ты (ж)", "PERF-3ms": "он", "PERF-3fs": "она", "PERF-1p": "мы", "PERF-2mp": "вы (м)", "PERF-2fp": "вы (ж)", "PERF-3mp": "они (м)", "PERF-3fp": "они (ж)",
    "IMPF-1s": "я", "IMPF-2ms": "ты (м)", "IMPF-2fs": "ты (ж)", "IMPF-3ms": "он", "IMPF-3fs": "она", "IMPF-1p": "мы", "IMPF-2mp": "вы (м)", "IMPF-2fp": "вы (ж)", "IMPF-3mp": "они (м)", "IMPF-3fp": "они (ж)",
    "IMP-2ms": "ты (м)", "IMP-2fs": "ты (ж)", "IMP-2mp": "вы (м)", "IMP-2fp": "вы (ж)",
    "PERF-3p": "они", "IMPF-3p": "они",
    "INF-L": "инфинитив", "s": "ед", "p": "мн", "sc": "ед, сопр.", "pc": "мн, сопр.",
    "ms-a": "м.р, ед", "fs-a": "ж.р, ед", "mp-a": "м.р, мн", "fp-a": "ж.р, мн",
  };
  var POSS_FB = { "1s": "мой", "2ms": "твой (м)", "2fs": "твоя (ж)", "3ms": "его", "3fs": "её", "1p": "наш", "2mp": "ваш (м)", "2fp": "ваш (ж)", "3mp": "их (м)", "3fp": "их (ж)" };
  var PERSON_FB = { "1s": "я", "2ms": "ты (м)", "2fs": "ты (ж)", "3ms": "он", "3fs": "она", "1p": "мы", "2mp": "вы (м)", "2fp": "вы (ж)", "3mp": "они (м)", "3fp": "они (ж)" };
  var GROUP_FB = { present: "Настоящее", past: "Прошедшее", future: "Будущее", imperative: "Повелительное", infinitive: "Инфинитив", absolute: "Абсолютное состояние", construct: "Сопряжённое (смихут)", possessive_sg: "Притяжательные (ед.)", possessive_pl: "Притяжательные (мн.)", adj: "Формы", prep: "С местоимениями", other: "Другие формы" };
  function slotLabel(slot) {
    var pass = String(slot).match(/^passive-(.+)$/i); if (pass) return slotLabel(pass[1]);
    var pm = String(slot).match(/^[sp]-P-(.+)$/); if (pm) return t("notes.card.conj.poss." + pm[1], POSS_FB[pm[1]] || pm[1]);
    var pr = String(slot).match(/^P-(.+)$/); if (pr) return t("notes.card.conj.person." + pr[1], PERSON_FB[pr[1]] || pr[1]);
    return t("notes.card.conj.slot." + String(slot).replace(/-/g, "_"), SLOT_FB[slot] || slot);
  }
  function groupLabel(k) { return t("notes.card.conj.group." + k, GROUP_FB[k] || k); }

  // ── per-form audio (= v3ConjSpeak): browser TTS of the cell's vocalized form ─
  function speakForm(el) {
    try {
      var he = el && el.getAttribute ? el.getAttribute("data-he") : (typeof el === "string" ? el : "");
      if (!he || !window.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance(he);
      u.lang = "he-IL"; u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // ── renderers (= v3RenderInflectionParadigm + v3RenderPronounSet) ────────────
  function renderPronounSet(highlight) {
    var lab = function (slot) { return t("notes.card.conj.person." + slot, PERSON_FB[slot] || slot); };
    var cell = function (r) {
      var hl = (pronounStrip(r.he) === highlight) ? " v3-conj-cell-hl" : "";
      return '<button type="button" class="v3-conj-cell' + hl + '" dir="rtl" data-he="' + esc(r.he) + '" onclick="v3ConjSpeak(this)" title="' + esc(lab(r.slot)) + '">' +
        '<span class="v3-conj-he">' + esc(r.he) + "</span>" +
        '<span class="v3-conj-lab">' + esc(lab(r.slot)) + "</span>" +
        (r.tr ? '<span class="v3-conj-tr">' + esc(r.tr) + "</span>" : "") + "</button>";
    };
    var grid = PRONOUN_PERSONAL.map(cell).join("");
    var title = t("notes.card.conj.pronoun.personal", "Личные местоимения");
    var badge = '<span class="v3-conj-badge">' + esc(t("notes.card.conj.pronounRef", "Справочный набор")) + "</span>";
    var note = t("notes.card.conj.pronounNote", "Местоимения — закрытый класс: формы заданы, а не выводятся.");
    return '<div class="v3-conj-wrap"><div class="v3-conj-meta">' + badge + "</div>" +
      '<div class="v3-conj-group"><div class="v3-conj-group-h">' + esc(title) + '</div><div class="v3-conj-grid">' + grid + "</div></div>" +
      '<div class="v3-conj-note">' + esc(note) + "</div></div>";
  }

  function renderParadigm(p, opts) {
    var highlightForms = (opts && opts.highlightForm) ? _formVariants(opts.highlightForm) : [];
    if (!p) return '<div class="v3-conj-empty">' + esc(t("notes.card.conj.noTable", "Таблица не найдена.")) + "</div>";
    if (p.kind === "pronoun") return renderPronounSet(p.highlight);
    if (!p.cells) return '<div class="v3-conj-empty">' + esc(t("notes.card.conj.noTable", "Таблица не найдена.")) + "</div>";
    var badge = '<span class="v3-conj-badge">' + esc(t("notes.card.conj.sourcePealim", "Источник: Pealim")) + "</span>";
    var recheckUrl = p.pealim_id ? pealimDictUrl(p.pealim_id) : pealimSearchUrl(p.lemma || "");
    var recheck = '<a class="v3-conj-recheck" href="' + esc(recheckUrl) + '" target="_blank" rel="noopener">' + esc(pealimLinkLabel(!!p.pealim_id)) + " ↗</a>";
    if (p.kind === "invariant") {
      var f = p.form || {};
      var trInv = f.translit_html || (f.translit ? esc(f.translit) : "");
      var posL = posLabel(p.pos);
      var cellInv = f.he ? '<button type="button" class="v3-conj-cell v3-conj-cell-lg" dir="rtl" data-he="' + esc(f.he) + '" onclick="v3ConjSpeak(this)" title="' + esc(posL || "") + '">' +
        '<span class="v3-conj-he">' + esc(f.he) + "</span>" +
        (posL ? '<span class="v3-conj-lab">' + esc(posL) + "</span>" : "") +
        (trInv ? '<span class="v3-conj-tr">' + trInv + "</span>" : "") + "</button>" : "";
      return '<div class="v3-conj-wrap"><div class="v3-conj-meta">' + badge + recheck + "</div>" +
        '<div class="v3-conj-grid v3-conj-invariant">' + cellInv + "</div>" +
        '<div class="v3-conj-note">' + esc(t("notes.card.conj.notInflected", "Это слово не изменяется по формам.")) + "</div></div>";
    }
    var cells = p.cells;
    var groups = (p.kind === "verb") ? GROUPS_VERB
      : (p.pos === "adjective") ? GROUPS_ADJ
      : (cells["P-1s"] || cells["P-3ms"]) ? GROUPS_PREP
      : GROUPS_NOUN;
    var cell = function (slot) {
      var c = cells[slot];
      if (!c || !c.he) return "";
      var trInner = c.translit_html || (c.translit ? esc(c.translit) : "");
      var tr = trInner ? '<span class="v3-conj-tr">' + trInner + "</span>" : "";
      var isHit = highlightForms.length && highlightForms.indexOf(_normVowels(c.he)) >= 0;
      var cls = "v3-conj-cell" + (isHit ? " v3-conj-cell-hl" : "");
      var title = isHit ? t("notes.card.conj.formInText", "форма из вашего текста") : slotLabel(slot);
      return '<button type="button" class="' + cls + '" dir="rtl" data-he="' + esc(c.he) + '" onclick="v3ConjSpeak(this)" title="' + esc(title) + '">' +
        '<span class="v3-conj-he">' + esc(c.he) + "</span>" +
        '<span class="v3-conj-lab">' + esc(slotLabel(slot)) + "</span>" + tr + "</button>";
    };
    var renderGroup = function (label, slots) {
      var inner = slots.map(cell).filter(Boolean).join("");
      if (!inner) return "";
      return '<div class="v3-conj-group"><div class="v3-conj-group-h">' + esc(label) + '</div><div class="v3-conj-grid">' + inner + "</div></div>";
    };
    var renderSet = function (gs) { return gs.map(function (g) { return renderGroup(groupLabel(g.key), g.slots); }).filter(Boolean).join(""); };
    var voiceH = function (txt) { return '<div class="v3-conj-voice-h">' + esc(txt) + "</div>"; };
    var hasPassive = (p.kind === "verb") && Object.keys(cells).some(function (k) { return /^passive-/i.test(k); });
    var fullGroups, covered;
    if (hasPassive) {
      fullGroups = voiceH(t("notes.card.conj.voiceActive", "Действительный залог") + binLabel(p.binyan)) + renderSet(GROUPS_VERB) +
        voiceH(t("notes.card.conj.voicePassive", "Страдательный залог") + binLabel(PASSIVE_BINYAN[p.binyan])) + renderSet(GROUPS_PASSIVE);
      covered = new Set([].concat.apply([], GROUPS_VERB.concat(GROUPS_PASSIVE).map(function (g) { return g.slots; })));
    } else {
      fullGroups = renderSet(groups);
      covered = new Set([].concat.apply([], groups.map(function (g) { return g.slots; })));
    }
    var leftover = Object.keys(cells).filter(function (k) { return !covered.has(k) && cells[k] && cells[k].he; });
    if (leftover.length) fullGroups += renderGroup(groupLabel("other"), leftover);
    var rootStr = p.root ? String(p.root).split("").join(" - ") : "";
    var rootHtml = rootStr ? '<span class="v3-conj-rootlabel">' + esc(t("notes.card.rootTitle", "Корень")) + ': <span dir="rtl">' + esc(rootStr) + "</span></span>" : "";
    var gizra = p.gizra_note ? '<div class="v3-conj-gizra">' + esc(p.gizra_note) + "</div>" : "";
    var beso = p.disambig === "best-effort" ? '<div class="v3-conj-besteffort">⚠ ' + esc(t("notes.card.conj.bestEffort", "Подобрано по совпадению — сверьтесь по ссылке")) + "</div>" : "";
    return '<div class="v3-conj-wrap"><div class="v3-conj-meta">' + badge + rootHtml + recheck + "</div>" + gizra + beso + fullGroups + "</div>";
  }

  var API = {
    renderParadigm: renderParadigm, renderPronounSet: renderPronounSet,
    lookupPronounParadigm: lookupPronounParadigm, posInflects: posInflects,
    slotLabel: slotLabel, groupLabel: groupLabel, speakForm: speakForm,
  };
  if (typeof window !== "undefined") { window.InflectionRender = API; if (!window.v3ConjSpeak) window.v3ConjSpeak = speakForm; }
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
