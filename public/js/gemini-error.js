// public/js/gemini-error.js
// Классификация ошибок Gemini BYOK-вызова в стабильный {status, error_code},
// чтобы клиент показал ПРЕМИАЛЬНОЕ, действенное сообщение вместо «попробуйте ещё раз».
//
// Причина: @google/generative-ai бросает Error с человекочитаемым .message вида
//   "... [400 Bad Request] API key not valid ... reason":"API_KEY_INVALID" ...".
// Раньше extract-file сваливал ВСЕ такие ошибки в GEMINI_FAILED → generic-текст,
// что скрывало от пользователя реальную причину (чаще всего — недействительный ключ,
// где «повторить» бесполезно). Диагноз по прод-логам 2026-07-26: API_KEY_INVALID.
//
// W2-S4: переезд в public/js для клиентского ASR-пути (браузер→Google напрямую);
// сервер продолжает require через ingest/geminiError.js (тонкий re-export) — один источник.
(function () {
  "use strict";

  // Наиболее специфичное совпадение выигрывает; порядок значим.
  function classifyGeminiError(err) {
    const status = err && typeof err.status === "number" ? err.status : null;
    const msg = (err && typeof err.message === "string" ? err.message : "").toUpperCase();

    const hit = (re) => re.test(msg);

    // Ключ пользователя отвергнут Google (auth-уровень): недействительный или без прав.
    if (status === 400 && hit(/API[_ ]KEY[_ ]INVALID|API KEY NOT VALID/)) {
      return { status: 400, error_code: "GEMINI_KEY_REJECTED", error: "Gemini API key rejected by Google" };
    }
    if (status === 401 || status === 403 || hit(/API[_ ]KEY[_ ]INVALID|API KEY NOT VALID|PERMISSION[_ ]DENIED|UNAUTHENTICATED/)) {
      return { status: 400, error_code: "GEMINI_KEY_REJECTED", error: "Gemini API key rejected by Google" };
    }
    // Лимит/квота — «повторить позже» осмысленно.
    if (status === 429 || hit(/\[429\b|RESOURCE[_ ]EXHAUSTED|TOO MANY REQUESTS|QUOTA/)) {
      return { status: 429, error_code: "GEMINI_QUOTA", error: "Gemini quota/rate limit reached" };
    }
    // Перегрузка/недоступность модели — «попробуйте через минуту».
    if (status === 503 || status === 500 || hit(/\[503\b|\[500\b|OVERLOADED|UNAVAILABLE|HIGH DEMAND|INTERNAL ERROR/)) {
      return { status: 503, error_code: "GEMINI_OVERLOADED", error: "Gemini temporarily overloaded" };
    }
    return { status: 502, error_code: "GEMINI_FAILED", error: "Gemini could not process the file" };
  }

  var API = { classifyGeminiError: classifyGeminiError };
  if (typeof window !== "undefined") window.GeminiError = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
