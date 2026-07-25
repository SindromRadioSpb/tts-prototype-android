// Единый валидатор формата Gemini API-ключа для всех BYOK-эндпоинтов.
// Два живых формата консолей Google: классический "AIza…" (Google AI Studio)
// и новый "AQ.…" (см. память reference_google_api_key_consoles) — оба валидны.
"use strict";

function isPlausibleGeminiKey(key) {
  if (typeof key !== "string") return false;
  const k = key.trim();
  if (/^AIza/.test(k)) return k.length >= 20;
  if (/^AQ\./.test(k)) return k.length >= 10;
  return false;
}

module.exports = { isPlausibleGeminiKey };
