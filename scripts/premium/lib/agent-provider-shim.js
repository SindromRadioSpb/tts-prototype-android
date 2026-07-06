"use strict";

// agent-provider-shim.js — preload-мок @google/generative-ai для burst-гейта
// smoke:agent-explain-burst (P6.3). Подключается в СПАВНУТЫЙ сервер через
// NODE_OPTIONS="--require <этот файл>", чтобы гейт бил по РЕАЛЬНОМУ пути
// agent/llm.js:generateGemini (retry/санитизация ошибок/лимиты), а не по mock-провайдеру.
//
// Контракт (env):
//   AGENT_SMOKE_CALLLOG     — файл; одна строка JSON на каждый generateContent-вызов
//                             (записывается ТОЛЬКО длина промпта, не контент);
//   AGENT_SMOKE_FAIL_MARKER — если prompt содержит маркер → throw со status=403, а в
//                             error.message НАРОЧНО вшиты полный prompt + API-ключ:
//                             адверсариальная проверка, что сервер санитизирует ошибку
//                             провайдера (ни prompt, ни ключ не должны попасть в
//                             stdout/ответ — llm.js обязан вернуть только код);
//   AGENT_SMOKE_DELAY_MS    — задержка на вызов (реалистичная гонка burst), деф. 250.
//
// Вне smoke-запуска (без AGENT_SMOKE_CALLLOG) шим — прозрачный no-op.

const fs = require("fs");
const Module = require("module");

const LOG = process.env.AGENT_SMOKE_CALLLOG;
if (LOG) {
  const MARKER = process.env.AGENT_SMOKE_FAIL_MARKER || "";
  const DELAY = Number(process.env.AGENT_SMOKE_DELAY_MS) || 250;
  const origLoad = Module._load;
  Module._load = function (request, ...args) {
    if (request === "@google/generative-ai") {
      return {
        GoogleGenerativeAI: class {
          constructor() {}
          getGenerativeModel() {
            return {
              generateContent: async (prompt) => {
                const p = String(prompt || "");
                fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), promptLen: p.length }) + "\n");
                await new Promise((r) => setTimeout(r, DELAY));
                if (MARKER && p.includes(MARKER)) {
                  const e = new Error("PROVIDER SAYS: prompt was [" + p + "] key was [" + (process.env.AGENT_GEMINI_API_KEY || "") + "]");
                  e.status = 403;   // постоянная ошибка — llm.js не должен ретраить
                  throw e;
                }
                return {
                  response: {
                    text: () => "Тёплое объяснение от провайдера смока. Обратите внимание на слабое слово и повторите его сегодня.",
                    usageMetadata: { candidatesTokenCount: 21 },
                  },
                };
              },
            };
          }
        },
      };
    }
    return origLoad.apply(this, [request, ...args]);
  };
}
