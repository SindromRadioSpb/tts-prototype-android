"use strict";

// agent/constructs.js — P6.4 misconception construct-id substrate (owner brief 2026-07-06).
// construct_id = СТАБИЛЬНЫЙ идентификатор педагогической конструкции — будущий ключ для
// объяснений/планов/упражнений/misconception-трекинга/грейдера/аналитики.
//
// ЖЕЛЕЗНОЕ ПРАВИЛО: construct_id назначает СЕРВЕР (этот реестр + детерминированная
// детекция) — НИКОГДА не LLM. LLM получает только человекочитаемые titles и может
// объяснить конструкцию, но не может создать/выбрать идентификатор: ids собираются в
// facts_used ДО вызова LLM и валидируются isKnown() перед персистом.
//
// R9/R11-честность: не утверждаем гранулярность тоньше данных. Channel-gap уточняется до
// dictation/reverse ТОЛЬКО по реальным событиям review_log (какой production-канал
// фактически проваливался); без событий — честный fallback receptive_to_production
// (production-компетенция не доказана, канал неизвестен). Binyan-конструкция
// назначается ТОЛЬКО когда резолвер реально утверждает биньян (bare-surface серверный
// резолв его часто не даёт — это норма, не дефект); неизвестное имя биньяна → null,
// не догадка.
//
// Pure-модуль: без БД и IO — детекция принимает уже добытые данные (события лога,
// morphology-строки резолвера).

const REGISTRY = {
  // ── channel-gap (источник: D1 channel_stats + каналы review_log) ────────────
  "construct:hebrew.channel_gap.reading_to_dictation": {
    kind: "channel_gap",
    title_ru: "Узнаёшь при чтении, но проваливаешь диктант — орфография из знакомой леммы",
    title_en: "Recognized in reading but fails dictation — spelling from a known lemma",
  },
  "construct:hebrew.channel_gap.reading_to_reverse": {
    kind: "channel_gap",
    title_ru: "Узнаёшь при чтении, но не производишь RU→HE — активное припоминание",
    title_en: "Recognized in reading but not produced RU→HE — active recall",
  },
  "construct:hebrew.channel_gap.receptive_to_production": {
    kind: "channel_gap",
    title_ru: "Рецептивно знакомо, но production-навык не доказан",
    title_en: "Receptively known but production skill unproven",
  },
  // ── morphology (источник: резолвер; recognition — контекст чтения) ──────────
  "construct:hebrew.binyan.paal.recognition": { kind: "morphology", title_ru: "Биньян пааль — узнавание формы", title_en: "Binyan pa'al — form recognition" },
  "construct:hebrew.binyan.nifal.recognition": { kind: "morphology", title_ru: "Биньян нифаль — узнавание формы", title_en: "Binyan nif'al — form recognition" },
  "construct:hebrew.binyan.piel.recognition": { kind: "morphology", title_ru: "Биньян пиэль — узнавание формы", title_en: "Binyan pi'el — form recognition" },
  "construct:hebrew.binyan.pual.recognition": { kind: "morphology", title_ru: "Биньян пуаль — узнавание формы", title_en: "Binyan pu'al — form recognition" },
  "construct:hebrew.binyan.hifil.recognition": { kind: "morphology", title_ru: "Биньян хифъиль — узнавание формы", title_en: "Binyan hif'il — form recognition" },
  "construct:hebrew.binyan.hufal.recognition": { kind: "morphology", title_ru: "Биньян хуфъаль — узнавание формы", title_en: "Binyan huf'al — form recognition" },
  "construct:hebrew.binyan.hitpael.recognition": { kind: "morphology", title_ru: "Биньян хитпаэль — узнавание формы", title_en: "Binyan hitpa'el — form recognition" },
};

function isKnown(id) { return Object.prototype.hasOwnProperty.call(REGISTRY, String(id || "")); }
function get(id) { return isKnown(id) ? { id: String(id), ...REGISTRY[id] } : null; }
function list() { return Object.keys(REGISTRY); }
function title(id, language) {
  const c = REGISTRY[String(id || "")];
  if (!c) return null;
  return language === "en" ? c.title_en : c.title_ru;
}

// ── детекция: channel-gap ─────────────────────────────────────────────────────
// events = review_log-события слова [{ kind, grade, channel }] (порядок хронологический).
// Правило (детерминированное, зеркалит семейную классификацию D1): production-канал =
// dictate*/reverse*. Последнее ПРОВАЛЬНОЕ production-событие определяет уточнение;
// production-событий нет вовсе → receptive_to_production (gap по отсутствию).
function isProductionChannel(ch) {
  const c = String(ch || "");
  return c.startsWith("dictate") || c.startsWith("reverse") || c.startsWith("cloze");
}
function channelGapConstruct(events) {
  // P7.0a: аннулированные события (флаг annulled из wordLifecycle) — не свидетельство:
  // аннулированный последний провал уступает предыдущему / гасит конструкцию.
  const prod = (events || []).filter((e) => e && e.kind === "review" && !e.annulled && isProductionChannel(e.channel));
  if (!prod.length) return "construct:hebrew.channel_gap.receptive_to_production";
  // провал = grade ≤ 2 (Again/Hard; D1-политика пишет production-провал как Hard(2))
  const fails = prod.filter((e) => e.grade != null && Number(e.grade) <= 2);
  if (!fails.length) return null;   // production есть и не провален → gap-конструкции нет
  const last = fails[fails.length - 1];
  if (String(last.channel || "").startsWith("dictate")) return "construct:hebrew.channel_gap.reading_to_dictation";
  if (String(last.channel || "").startsWith("reverse")) return "construct:hebrew.channel_gap.reading_to_reverse";
  return "construct:hebrew.channel_gap.receptive_to_production";
}

// ── детекция: binyan (только когда резолвер его УТВЕРДИЛ) ────────────────────
// Имена в датасетах встречаются и латиницей, и ивритом С ОГЛАСОВКАМИ. Огласовки НЕ
// срезаем до сопоставления: без никуда פעל/פועל коллапсируют (paal/pual/piel
// неразличимы) — совпадение только точной формой, иначе null (не выдумываем).
const BINYAN_NORM = {
  "paal": "paal", "pa'al": "paal", "פָּעַל": "paal", "קל": "paal", "קַל": "paal",
  "nifal": "nifal", "nif'al": "nifal", "נִפְעַל": "nifal",
  "piel": "piel", "pi'el": "piel", "פִּעֵל": "piel", "פיעל": "piel",
  "pual": "pual", "pu'al": "pual", "פֻּעַל": "pual",
  "hifil": "hifil", "hif'il": "hifil", "הִפְעִיל": "hifil", "הפעיל": "hifil",
  "hufal": "hufal", "huf'al": "hufal", "הֻפְעַל": "hufal", "הופעל": "hufal",
  "hitpael": "hitpael", "hitpa'el": "hitpael", "הִתְפַּעֵל": "hitpael", "התפעל": "hitpael",
};
function binyanConstruct(binyanRaw) {
  const raw = String(binyanRaw || "").trim();
  if (!raw) return null;
  const norm = BINYAN_NORM[raw] || BINYAN_NORM[raw.toLowerCase()];
  return norm ? "construct:hebrew.binyan." + norm + ".recognition" : null;
}

// Санитайзер перед персистом/ответом: пропускает ТОЛЬКО известные реестру ids —
// структурная гарантия «LLM (или баг) не изобретает construct_id».
function filterKnown(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids || []) {
    if (isKnown(id) && !seen.has(id)) { seen.add(id); out.push(String(id)); }
  }
  return out;
}

module.exports = { isKnown, get, list, title, channelGapConstruct, binyanConstruct, filterKnown, isProductionChannel };
