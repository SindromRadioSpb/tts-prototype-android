// ingest/retell.js
// W2-S11 graded-пересказ — pure-модуль промта/валидации (без сети, без fs).
// Числа и формулировки промта — из замеров R10:
// docs/research/studio-ingest-graded-retell/2026-07-28/README.md
//   - метка уровня + частотное ограничение работают; явный список лемм — НЕТ;
//   - длина держится только ЧИСЛОМ предложений («⅓» дала 6–22%);
//   - клиентский зеркальный LEVELS — public/js/studio-retell.js (lock-step тест).
"use strict";

const LEVELS = ["A1", "A2", "B1", "B2"];
const RETELL_PROMPT_ID = "retell-he-v1";
const MAX_RETELL_INPUT_CHARS = 100000; // ≈50К токенов — замер long-probe: один вызов ок

const LEVEL_LINE = {
  A1: "רמת השפה: רמה A1 (CEFR) — מתחיל גמור: אוצר מילים בסיסי ביותר, משפטים של 4-6 מילים.",
  A2: "רמת השפה: רמה A2 (CEFR) — מתחיל: אוצר מילים יומיומי פשוט, משפטים קצרים.",
  B1: "רמת השפה: רמה B1 (CEFR) — בינוני: אוצר מילים שכיח, משפטים פשוטים.",
  B2: "רמת השפה: רמה B2 (CEFR) — בינוני-גבוה: מותר אוצר מילים מגוון יותר, אך המשפטים נשארים ברורים.",
};

function estimateSentences(text) {
  const t = String(text || "").trim();
  if (!t) return 1;
  const byEnders = (t.match(/[.!?…]+(\s|$)/g) || []).length;
  const byLines = t.split(/\n+/).filter((l) => l.trim()).length;
  return Math.max(1, byEnders, byLines);
}

function targetSentences(text) {
  return Math.min(80, Math.max(8, Math.round(estimateSentences(text) / 3)));
}

function buildRetellPrompt(text, level) {
  const t = targetSentences(text);
  const hi = Math.round(t * 1.2);
  return [
    "אתה עוזר הוראה של עברית. קרא את הטקסט ובנה ממנו פרפרזה לימודית מקוצרת בעברית פשוטה מודרנית.",
    "חוקים מחייבים:",
    "- שמור על המשמעות והרעיונות המרכזיים של המקור; אל תוסיף עובדות, דעות או פרטים שאינם במקור.",
    "- " + LEVEL_LINE[level],
    "- השתמש רק באוצר מילים שכיח מאוד; מילים נדירות — רק אם הן הכרחיות לתוכן.",
    "- כתוב בין " + t + " ל-" + hi + " משפטים. כסה את כל חלקי המקור, לא רק את ההתחלה.",
    "- אל תמציא מילים או צורות דקדוקיות שאינן קיימות בעברית תקנית.",
    "- כתוב בלי ניקוד.",
    "- הפלט: רק משפטי הפרפרזה, משפט אחד בכל שורה. בלי כותרות, בלי הערות, בלי תרגום.",
    "",
    "הטקסט:",
    String(text || ""),
  ].join("\n");
}

function validateRetellInput(body) {
  const text = body && typeof body.text === "string" ? body.text : "";
  const level = body && body.level;
  if (!LEVELS.includes(level)) return { ok: false, status: 400, error_code: "BAD_LEVEL" };
  if (!text.trim()) return { ok: false, status: 400, error_code: "RETELL_EMPTY" };
  if (text.length > MAX_RETELL_INPUT_CHARS) return { ok: false, status: 400, error_code: "RETELL_TOO_LONG" };
  return { ok: true };
}

function cacheKeyInput(text, level) {
  return RETELL_PROMPT_ID + "|" + level + "||" + String(text || "").trim();
}

module.exports = {
  LEVELS, RETELL_PROMPT_ID, MAX_RETELL_INPUT_CHARS,
  estimateSentences, targetSentences, buildRetellPrompt, validateRetellInput, cacheKeyInput,
};
