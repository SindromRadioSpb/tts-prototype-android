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

// Вечный спиннер невозможен by construction: LLM-вызов без ответа за LLM_TIMEOUT_MS →
// честный {ok:false, error:'TIMEOUT'} (live-найдено 2026-07-13: перегруженный Gemini
// держал check-запрос минутами — браузер крутил «⏳» без конца).
const LLM_TIMEOUT_MS = 30_000;
function withTimeout(p) {
  let t;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise((resolve) => { t = setTimeout(() => resolve({ __timeout: true }), LLM_TIMEOUT_MS); }),
  ]);
}

async function generateGemini({ system, prompt, maxOutputTokens, json, byokKey }) {
  // PAS-F1: byokKey (ключ ПОЛЬЗОВАТЕЛЯ per-request) переопределяет env-ключ агента;
  // ключ НИКОГДА не попадает в error/логи (ветка и так дисциплинирована: только код).
  const key = byokKey || geminiKey();
  if (!key) return { ok: false, error: "NO_API_KEY" };
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const modelName = process.env.AGENT_LLM_MODEL || DEFAULT_GEMINI_MODEL;
  const genAI = new GoogleGenerativeAI(key);
  // Gemini 2.5 — thinking-модели: без thinkingBudget:0 размышления выжигают весь
  // maxOutputTokens → EMPTY_RESPONSE (live-найдено 2026-07-13 на byok-check; тот же
  // класс, что reasoning:{enabled:false} у Nemotron). На 1.5/2.0 поле дало бы 400 —
  // применяем только thinking-семейству (live-verified SDK v0.19 пробрасывает поле).
  const thinkingFamily = /2\.5|flash-latest|flash-lite-latest|pro-latest/.test(modelName);
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(system ? { systemInstruction: system } : {}),
    generationConfig: {
      maxOutputTokens: Math.max(64, Math.min(2048, Number(maxOutputTokens) || 512)),
      ...(json ? { responseMimeType: "application/json" } : {}),   // PAS-A3 — structured output
      ...(thinkingFamily ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt));
      if (result && result.__timeout) return { ok: false, error: "TIMEOUT" };
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
//
// reasoning:{enabled:false} — ОБЯЗАТЕЛЬНО (найдено live 2026-07-06): деф. модель
// nemotron-3-super — reasoning-модель, без этого флага она льёт сырой английский
// chain-of-thought в message.content и почти всегда обрывается на maxOutputTokens
// ДО финального ответа (finish_reason:"length", reasoning_tokens съедают весь бюджет) —
// isCleanProse честно бракует такой мусор ценой впустую потраченного вызова из лимита.
// С флагом: finish_reason:"stop", reasoning_tokens:0, чистый короткий ответ. Параметр —
// no-op для моделей без reasoning-режима (OpenRouter passthrough), не ломает будущую смену
// AGENT_OPENROUTER_MODEL на нерассуждающую модель.
async function generateOpenRouter({ system, prompt, maxOutputTokens, json, byokKey }) {
  const key = byokKey || openrouterKey();   // PAS-F1: per-request ключ пользователя
  if (!key) return { ok: false, error: "NO_API_KEY" };
  const modelName = process.env.AGENT_OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const body = JSON.stringify({
    model: modelName, messages,
    max_tokens: Math.max(64, Math.min(2048, Number(maxOutputTokens) || 512)),
    reasoning: { enabled: false },
    ...(json ? { response_format: { type: "json_object" } } : {}),   // PAS-A3 — structured output
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
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),   // вечный спиннер невозможен
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
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) return { ok: false, error: "TIMEOUT" };   // 30с вышло — ретрай бессмыслен
      if (attempt === 0) { await sleep(RETRY_BACKOFF_MS); continue; }   // сетевой сбой — тоже транзиент, один повтор
      return { ok: false, error: "OPENROUTER_NETWORK_ERROR" };
    }
  }
}

function generateMock({ prompt, json, fixture, byokKey }) {
  // Детерминированно и БЕЗ эха prompt-контента: только длина как «подпись» вызова —
  // гейт проверяет и llm_used-путь, и то, что payload не утёк в ответ/логи.
  // PAS-F1 (критика R11-3): in-band фейл-триггер — byokKey /^BYOKFAIL/ ломает ТОЛЬКО
  // byok-вызов (same-boot с happy-кейсом; env заморожен после старта child-процесса).
  if (byokKey && /^BYOKFAIL/.test(String(byokKey))) return { ok: false, error: "MOCK_BYOK_FAIL" };
  const len = String(prompt || "").length;
  if (json) {
    // PAS-B3 — mock различает json-сценарии по opts.fixture (реальные провайдеры
    // это поле игнорируют); без хинта — comprehension-фикстура (PAS-A3, дефолт).
    // PAS-C1 — гейт «ход не тратится при невалидном ответе»: AGENT_MOCK_BREAK=<fixture>
    // заставляет mock отдать невалидный (не-JSON) ответ ровно для этого сценария.
    if (fixture && String(process.env.AGENT_MOCK_BREAK || "") === String(fixture)) {
      return { ok: true, provider: "mock", model: "mock-1", output_tokens: 4, text: "BROKEN mock output (ctx=" + len + ")" };
    }
    if (fixture === "roleplay") {
      return { ok: true, provider: "mock", model: "mock-1", output_tokens: 16,
        text: JSON.stringify({ he: "אני מבין אותך. מה עוד קרה בקטע?", ru: "Понимаю вас. Что ещё произошло в отрывке? (mock ctx=" + len + ")" }) };
    }
    if (fixture === "draft_retell") {
      return { ok: true, provider: "mock", model: "mock-1", output_tokens: 32,
        text: JSON.stringify({ lines: [
          { he: "הילד קורא ספר.", ru: "Мальчик читает книгу." },
          { he: "הספר גדול ויפה.", ru: "Книга большая и красивая." },
          { he: "הילד שמח מאוד.", ru: "Мальчик очень рад. (mock ctx=" + len + ")" },
        ] }) };
    }
    // PAS-A3 — валидный фикстурный JSON (критика: mock без json-режима блокировал happy-path гейта)
    return { ok: true, provider: "mock", model: "mock-1", output_tokens: 24,
      text: JSON.stringify({ questions: [
        { question: "О чём говорится в отрывке? (mock ctx=" + len + ")", options: ["вариант А", "вариант Б", "вариант В", "вариант Г"], correct_index: 0 },
        { question: "Что делает герой? (mock)", options: ["читает", "пишет", "идёт", "спит"], correct_index: 1 },
      ] }) };
  }
  // PAS-F1 (критика R11-1): [mock-byok]-маркер ТОЛЬКО в prose-режиме — json-сценарии
  // ломались бы на JSON.parse; их byok-зуб = key_source + ledger-строка kind='llm_call_byok'.
  const byokMark = byokKey ? "[mock-byok] " : "";
  return { ok: true, text: byokMark + "[mock-mentor] план сформулирован (ctx=" + len + " chars).", provider: "mock", model: "mock-1", output_tokens: 8 };
}

// Единая точка генерации. Возвращает { ok, text, provider, model, output_tokens } |
// { ok:false, error } — НИКОГДА не бросает наружу содержимое prompt.
// PAS-F1 диспатч-прецеденс (критика R16-02/R11-2): mock ВСЕГДА выигрывает (герметичность
// гейтов — sentinel-ключ не должен уходить в реальную сеть); byokProvider переключает
// ТОЛЬКО между реальными провайдерами (пользователь с Gemini-ключом работает при
// серверном openrouter и наоборот); прод mock не достигает (env gemini/openrouter).
async function generate(opts) {
  if (killSwitchOn()) return { ok: false, error: "KILL_SWITCH" };
  const o = opts || {};
  const p = providerName();
  if (p === "mock") return generateMock(o);
  if (o.byokProvider === "gemini") return generateGemini(o);
  if (o.byokProvider === "openrouter") return generateOpenRouter(o);
  if (p === "gemini") return generateGemini(o);
  if (p === "openrouter") return generateOpenRouter(o);
  if (p === "claude") return { ok: false, error: "PROVIDER_NOT_IMPLEMENTED" };   // §13.3: третий провайдер — не блокер P6
  return { ok: false, error: "UNKNOWN_PROVIDER" };
}

module.exports = { generate, providerName, killSwitchOn, keySource };
