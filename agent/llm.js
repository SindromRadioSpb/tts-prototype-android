"use strict";

// agent/llm.js — CLG-P6 LLM provider abstraction (§13.3: gemini first, обязательная
// абстракция gemini|claude|mock; §11 kill-switch). БД не трогает; лимиты enforce-ит
// ВЫЗЫВАЮЩИЙ через agentRepo.reserveLlmCall ДО generate() (pre-call reserve).
//
// STDOUT-ГИГИЕНА (гейт CLG-P6, §9): этот модуль НИКОГДА не логирует prompt/context
// payload — ни в console, ни в throw-message. Класс D не персистится и не печатается.
//
// Провайдеры:
//   mock   — детерминированный, для гейтов/офлайна (AGENT_LLM_PROVIDER=mock);
//   gemini — env GEMINI_API_KEY/GOOGLE_API_KEY (тот же ключ, что перевод в server.js);
//   claude — второй провайдер по §13.3, НЕ блокер P6: честный NOT_IMPLEMENTED до
//            подключения (adversarial-eval придёт отдельным слайсом).
// Kill-switch: AGENT_LLM_DISABLED=1 → каждый вызов честно отказывает (KILL_SWITCH),
// сценарии обязаны деградировать в детерминированный режим (R16).

const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

function providerName() {
  const p = String(process.env.AGENT_LLM_PROVIDER || "").trim().toLowerCase();
  if (p === "mock" || p === "gemini" || p === "claude") return p;
  return "gemini";
}
function killSwitchOn() {
  return String(process.env.AGENT_LLM_DISABLED || "") === "1";
}

async function generateGemini({ system, prompt, maxOutputTokens }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!key) return { ok: false, error: "NO_API_KEY" };
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const modelName = process.env.AGENT_LLM_MODEL || DEFAULT_GEMINI_MODEL;
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: modelName,
      ...(system ? { systemInstruction: system } : {}),
      generationConfig: { maxOutputTokens: Math.max(64, Math.min(2048, Number(maxOutputTokens) || 512)) },
    });
    const result = await model.generateContent(prompt);
    const text = result && result.response && typeof result.response.text === "function" ? result.response.text() : "";
    if (!text || !String(text).trim()) return { ok: false, error: "EMPTY_RESPONSE" };
    let outTokens = null;
    try { outTokens = result.response.usageMetadata ? Number(result.response.usageMetadata.candidatesTokenCount) || null : null; } catch (_) {}
    return { ok: true, text: String(text).trim(), provider: "gemini", model: modelName, output_tokens: outTokens };
  } catch (e) {
    // Никакого prompt-контента в сообщении об ошибке (stdout-гигиена).
    const code = (e && (e.status || e.code)) || "GEMINI_ERROR";
    return { ok: false, error: String(code).slice(0, 60) };
  }
}

function generateMock({ prompt }) {
  // Детерминированно и БЕЗ эха prompt-контента: только длина как «подпись» вызова —
  // гейт проверяет и llm_used-путь, и то, что payload не утёк в ответ/логи.
  const len = String(prompt || "").length;
  return { ok: true, text: "[mock-mentor] план сформулирован (ctx=" + len + " chars).", provider: "mock", model: "mock-1", output_tokens: 8 };
}

// Единая точка генерации. Возвращает { ok, text, provider, model, output_tokens } |
// { ok:false, error } — НИКОГДА не бросает наружу содержимое prompt.
async function generate(opts) {
  if (killSwitchOn()) return { ok: false, error: "KILL_SWITCH" };
  const p = providerName();
  if (p === "mock") return generateMock(opts || {});
  if (p === "gemini") return generateGemini(opts || {});
  if (p === "claude") return { ok: false, error: "PROVIDER_NOT_IMPLEMENTED" };   // §13.3: второй провайдер — не блокер P6
  return { ok: false, error: "UNKNOWN_PROVIDER" };
}

module.exports = { generate, providerName, killSwitchOn };
