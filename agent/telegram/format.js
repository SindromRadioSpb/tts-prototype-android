"use strict";

// agent/telegram/format.js — CLG-P7.1b Telegram-safe форматирование (спека v2 §3 + адъюдикация).
// Инварианты (критика wf_72c44361):
//   • plain-text, БЕЗ parse_mode (api.sendMessage не ставит) → Telegram не рендерит Markdown/HTML
//     → экранирование не требуется структурно;
//   • splitMessage ЖЁСТКО режет любой сегмент >LIMIT по символьной границе (не только по \n) —
//     иначе одна длинная строка молча трункируется api.slice (критика: content-loss);
//   • форматтеры строят текст ТОЛЬКО из белого списка user-facing полей — НИКОГДА JSON.stringify
//     объекта; сырые id (item_key/pid:/text_key/sentence_id/'ae_'/'at_'/provider/model/construct-id)
//     в вывод не попадают by construction (лемма/титул/счётчик — да);
//   • displayForItemKey-результат, совпадающий с item_key ИЛИ матчащий /^pid:/, = «скрыть»
//     (сырой ключ никогда);
//   • ru/en по языку профиля (критика: смешанный язык).

const LIMIT = 4096;

// Разбиение: сначала по \n\n/\n границам ≤LIMIT; любой сегмент, всё ещё >LIMIT (одна длинная
// строка без переносов), режется по символам. Конкатенация частей == источнику (ничего не теряем).
function splitMessage(text, limit = LIMIT) {
  const s = String(text == null ? "" : text);
  if (s.length <= limit) return s.length ? [s] : [];
  const parts = [];
  let buf = "";
  for (const line of s.split("\n")) {
    const piece = buf ? buf + "\n" + line : line;
    if (piece.length <= limit) { buf = piece; continue; }
    if (buf) { parts.push(buf); buf = ""; }
    if (line.length <= limit) { buf = line; continue; }
    // одна строка длиннее лимита → жёсткая символьная нарезка
    for (let i = 0; i < line.length; i += limit) parts.push(line.slice(i, i + limit));
  }
  if (buf) parts.push(buf);
  return parts;
}

const STR = {
  ru: {
    planEmpty: "На сегодня план пуст — загляни в читальный зал.",
    planMin: "мин", due: "К повторению", dueEmpty: "Сейчас повторять нечего — всё в графике.",
    summaryTitle: "Над чем работаешь", summaryEmpty: "Пока не накоплено — конструкции появятся из планов и объяснений.",
    explainEmpty: "Объяснений пока нет.", explainPurged: "(очищено по отзыву согласия)",
    explainNoAccess: "Объяснения недоступны: доступ наставника к текстам отключён. Включи его на сайте.",
    refused: "Канал отключён. Подключи Telegram заново на сайте.",
    times: "раз",
  },
  en: {
    planEmpty: "Nothing planned today — open the reading room.",
    planMin: "min", due: "To review", dueEmpty: "Nothing to review right now — all on schedule.",
    summaryTitle: "What you’re working on", summaryEmpty: "Nothing yet — constructions come from plans and explanations.",
    explainEmpty: "No explanations yet.", explainPurged: "(cleared after consent withdrawal)",
    explainNoAccess: "Explanations unavailable: mentor’s text access is off. Turn it on the website.",
    refused: "Channel disconnected. Reconnect Telegram on the website.",
    times: "×",
  },
};
function L(lang) { return STR[lang === "en" ? "en" : "ru"]; }

// лемма для показа: скрыть, если резолвер вернул сырой ключ (item_key) или 'pid:N'
function showLemma(lemma, itemKey) {
  const s = String(lemma == null ? "" : lemma).trim();
  if (!s) return null;
  if (s === String(itemKey || "")) return null;
  if (/^pid:/.test(s)) return null;
  if (/#/.test(s) && s === String(itemKey || "")) return null;
  return s;
}

// ── /plan: секции title + леммы + est_minutes (+ LLM-проза если была) ─────────
function formatPlan(planResult, lang) {
  const t = L(lang);
  const plan = (planResult && planResult.plan) || {};
  const useRu = lang !== "en";
  const lines = [];
  if (planResult && planResult.llm_used && planResult.text) lines.push(String(planResult.text).trim());
  const sections = Array.isArray(plan.sections) ? plan.sections : [];
  for (const s of sections) {
    const title = useRu ? (s.title_ru || s.title_en) : (s.title_en || s.title_ru);
    if (!title) continue;
    const lemmas = (Array.isArray(s.items) ? s.items : [])
      .map((x) => showLemma(x && x.lemma, x && x.item_key)).filter(Boolean);
    lines.push("• " + String(title) + (lemmas.length ? ": " + lemmas.join(" · ") : ""));
    for (const c of (Array.isArray(s.constructs) ? s.constructs : [])) {
      const ct = useRu ? (c.title_ru || c.title_en) : (c.title_en || c.title_ru);
      if (ct) lines.push("  ⚙ " + String(ct));
    }
  }
  if (plan.est_minutes) lines.push("≈ " + plan.est_minutes + " " + t.planMin);
  const body = lines.join("\n").trim();
  return body || t.planEmpty;
}

// ── /due: «К повторению: N» + леммы (displayForItemKey уже резолвлен вызывателем) ─
function formatDue(items, lang) {
  const t = L(lang);
  const list = (Array.isArray(items) ? items : [])
    .map((x) => showLemma(x && x.lemma, x && x.item_key)).filter(Boolean);
  if (!list.length) return t.dueEmpty;
  return t.due + ": " + list.length + "\n" + list.map((w) => "• " + w).join("\n");
}

// ── /summary: титулы конструкций + счётчики (реестровые титулы, класс A) ───────
function formatSummary(summary, lang) {
  const t = L(lang);
  const useRu = lang !== "en";
  const cons = (summary && Array.isArray(summary.constructs)) ? summary.constructs : [];
  if (!cons.length) return t.summaryEmpty;
  const lines = [t.summaryTitle + ":"];
  for (const c of cons) {
    const title = useRu ? (c.title_ru || c.title_en) : (c.title_en || c.title_ru);
    if (!title) continue;
    lines.push("• " + String(title) + " (" + (Number(c.count) || 0) + " " + t.times + ")");
  }
  return lines.join("\n");
}

// ── /explain: лента объяснений (purge-aware; agent_read_texts гейтит контент) ──
// readAllowed=false → НИКАКОГО текста/предложения, только «доступ отключён» (fail-closed,
// независимо от purge). Никогда не выводим anchor.text_key/sentence_id (сырые id).
function formatExplain(listResult, lang, readAllowed) {
  const t = L(lang);
  if (!readAllowed) return t.explainNoAccess;
  const items = (listResult && Array.isArray(listResult.explanations)) ? listResult.explanations : [];
  if (!items.length) return t.explainEmpty;
  const lines = [];
  for (const x of items) {
    if (x.purged) { lines.push("• " + t.explainPurged); continue; }
    const he = x.sentence_he ? String(x.sentence_he).trim() : null;
    const body = x.text ? String(x.text).trim() : null;
    if (he) lines.push("• " + he);
    if (body) lines.push(he ? "  " + body : "• " + body);
  }
  return lines.length ? lines.join("\n") : t.explainEmpty;
}

module.exports = { splitMessage, formatPlan, formatDue, formatSummary, formatExplain, showLemma, refusedText: (lang) => L(lang).refused, LIMIT };
