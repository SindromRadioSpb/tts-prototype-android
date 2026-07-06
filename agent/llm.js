"use strict";

// agent/llm.js — CLG-P6 LLM provider abstraction (§13.3: gemini first, обязательная
// абстракция gemini|claude|mock; §11 kill-switch). БД не трогает; лимиты enforce-ит
// ВЫЗЫВАЮЩИЙ через agentRepo.reserveLlmCall ДО generate() (pre-call reserve).
//
// STDOUT-ГИГИЕНА (гейт CLG-P6, §9): этот модуль НИКОГДА не логирует prompt/context
// payload — ни в console, ни в throw-message. Класс D не персистится и не печатается.
//
// Провайдеры:
//   mock       — детерминированный, для гейтов/офлайна (AGENT_LLM_PROVIDER=mock);
//   gemini     — AGENT_GEMINI_API_KEY (§13.3 первый провайдер);
//   openrouter — AGENT_OPENROUTER_API_KEY, доп. free-тарифный провайдер (owner
//                2026-07-06 — хедж от 503-перегрузки Gemini free-tier); деф. модель
//                nvidia/nemotron-3-super-120b-a12b:free (проверено live 2026-07-06:
//                12B активных параметров из 120B MoE — быстрее Ultra/55B на простой
//                задаче переформулировки; в отличие от Poolside Laguna M.1 карточка
//                модели НЕ содержит оговорки «train on free-tier inputs» — R15).
//                Свободный тариф OpenRouter аккаунт-wide: 50 запросов/день, 20/мин
//                без пополнения баланса (не per-модель) — ниже нашего собственного
//                суточного лимита, так что реальный потолок сегодня — провайдерский.
//   claude     — третий провайдер по §13.3, НЕ блокер P6: честный NOT_IMPLEMENTED до
//                подключения (adversarial-eval придёт отдельным слайсом).
// Kill-switch: AGENT_LLM_DISABLED=1 → каждый вызов честно отказывает (KILL_SWITCH),
// сценарии обязаны деградировать в детерминированный режим (R16).

const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function providerName() {
  const p = String(process.env.AGENT_LLM_PROVIDER || "").trim().toLowerCase();
  if (p === "mock" || p === "gemini" || p === "openrouter" || p === "claude") return p;
  return "gemini";
}
function killSwitchOn() {
  return String(process.env.AGENT_LLM_DISABLED || "") === "1";
}

// R16/R15 — СТРОГО выделенный ключ агента, НИКАКИХ фолбэков на другие env-ключи
// (уточнение владельца 2026-07-05). Архитектура ключей проекта:
//   • пользовательские пайплайны (Gemini-перевод / GCP Translate / TTS) = BYOK:
//     AIza-ключи живут в localStorage браузера и передаются per-request, сервер их
//     НЕ хранит (docs/BYOK_SETUP.md); service-account ФАЙЛЫ (GCP Translate/TTS) —
//     на томе /app/data (владельческие, для прибейка/аудио-кэша);
//   • серверного GEMINI_API_KEY на проде НЕТ намеренно;
//   • агент платит ТОЛЬКО через AGENT_GEMINI_API_KEY — молчаливое заимствование
//     бюджета другой подсистемы = красный флаг R16 «неучтённый фоновый расход».
// Нет ключа → честный NO_API_KEY → сценарии деградируют в детерминированный режим.
function geminiKey() {
  return process.env.AGENT_GEMINI_API_KEY || "";
}
function openrouterKey() {
  return process.env.AGENT_OPENROUTER_API_KEY || "";
}
// key_source отражает АКТИВНОГО провайдера (§11 status): agent = его выделенный ключ
// задан, none = не задан (mock всегда "agent" — денег не тратит, но не "none"-деградация).
function keySource() {
  const p = providerName();
  if (p === "mock") return "agent";
  if (p === "openrouter") return openrouterKey() ? "agent" : "none";
  return geminiKey() ? "agent" : "none";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Транзитные HTTP-коды free-tier Gemini (перегрузка модели / per-minute rate limit) —
// Google сам рекомендует backoff-retry именно на них; НЕ ретраим 400/401/403/404 (постоянная
// ошибка ключа/запроса — повтор не поможет, только тратит латентность). Один повтор: ledger
// уже держит РОВНО один reserved-слот на вызов независимо от числа внутренних HTTP-попыток —
// ретрай бесплатен для дневного бюджета (§11), платится только за реально доставленный ответ.
const RETRYABLE_STATUS = new Set([503, 429]);
const RETRY_BACKOFF_MS = 700;

async function generateGemini({ system, prompt, maxOutputTokens }) {
  const key = geminiKey();
  if (!key) return { ok: false, error: "NO_API_KEY" };
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const modelName = process.env.AGENT_LLM_MODEL || DEFAULT_GEMINI_MODEL;
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(system ? { systemInstruction: system } : {}),
    generationConfig: { maxOutputTokens: Math.max(64, Math.min(2048, Number(maxOutputTokens) || 512)) },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result && result.response && typeof result.response.text === "function" ? result.response.text() : "";
      if (!text || !String(text).trim()) return { ok: false, error: "EMPTY_RESPONSE" };
      let outTokens = null;
      try { outTokens = result.response.usageMetadata ? Number(result.response.usageMetadata.candidatesTokenCount) || null : null; } catch (_) {}
      return { ok: true, text: String(text).trim(), provider: "gemini", model: modelName, output_tokens: outTokens };
    } catch (e) {
      const status = e && e.status;
      if (attempt === 0 && RETRYABLE_STATUS.has(status)) { await sleep(RETRY_BACKOFF_MS); continue; }
      // Никакого prompt-контента в сообщении об ошибке (stdout-гигиена).
      const code = status || (e && e.code) || "GEMINI_ERROR";
      return { ok: false, error: String(code).slice(0, 60) };
    }
  }
}

// OpenAI-совместимый chat/completions (проверено live 2026-07-06 через официальный
// quickstart): messages=[{role:'system'|'user', content}], ответ choices[0].message.content,
// usage.completion_tokens. HTTP-Referer/X-Title — опциональны (app-атрибуция), не критичны.
async function generateOpenRouter({ system, prompt, maxOutputTokens }) {
  const key = openrouterKey();
  if (!key) return { ok: false, error: "NO_API_KEY" };
  const modelName = process.env.AGENT_OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const body = JSON.stringify({
    model: modelName, messages,
    max_tokens: Math.max(64, Math.min(2048, Number(maxOutputTokens) || 512)),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://linguistpro.kolosei.com",
          "X-Title": "LinguistPro Mentor",
        },
        body,
      });
      if (!res.ok) {
        if (attempt === 0 && RETRYABLE_STATUS.has(res.status)) { await sleep(RETRY_BACKOFF_MS); continue; }
        return { ok: false, error: String(res.status).slice(0, 60) };   // никакого тела ответа в error (stdout-гигиена)
      }
      const json = await res.json();
      const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!text || !String(text).trim()) return { ok: false, error: "EMPTY_RESPONSE" };
      const outTokens = (json.usage && Number(json.usage.completion_tokens)) || null;
      return { ok: true, text: String(text).trim(), provider: "openrouter", model: modelName, output_tokens: outTokens };
    } catch (e) {
      if (attempt === 0) { await sleep(RETRY_BACKOFF_MS); continue; }   // сетевой сбой — тоже транзиент, один повтор
      return { ok: false, error: "OPENROUTER_NETWORK_ERROR" };
    }
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
  if (p === "openrouter") return generateOpenRouter(opts || {});
  if (p === "claude") return { ok: false, error: "PROVIDER_NOT_IMPLEMENTED" };   // §13.3: третий провайдер — не блокер P6
  return { ok: false, error: "UNKNOWN_PROVIDER" };
}

module.exports = { generate, providerName, killSwitchOn, keySource };
