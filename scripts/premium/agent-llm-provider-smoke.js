#!/usr/bin/env node
"use strict";
// smoke:agent-llm-provider — гейт для agent/llm.js provider-абстракции (§13.3
// gemini|openrouter|claude|mock; AI_MENTOR_RECON §9). Никаких реальных сетевых вызовов —
// @google/generative-ai мокается через require.cache, OpenRouter — через global.fetch.
// Покрывает: honest NO_API_KEY per-provider · kill-switch (до сетевого вызова) ·
// retry РОВНО один раз на 503/429, БЕЗ retry на постоянные ошибки (403) · честный парсинг
// ответа (gemini SDK-объект / OpenRouter OpenAI-совместимый JSON) · key_source отражает
// АКТИВНОГО провайдера · stdout-гигиена (prompt-контент не в error-сообщении).
// Run: node scripts/premium/agent-llm-provider-smoke.js [--gate]

const Module = require("module");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
const LLM_PATH = path.join(REPO, "agent", "llm.js");

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

function freshLlm() {
  delete require.cache[require.resolve(LLM_PATH)];
  return require(LLM_PATH);
}
function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  return Promise.resolve().then(fn).finally(() => {
    for (const k of Object.keys(prev)) { if (prev[k] == null) delete process.env[k]; else process.env[k] = prev[k]; }
  });
}
function mockGoogleGenerativeAI(sequence) {
  // sequence: array of () => result|throw, consumed one per generateContent() call
  let i = 0;
  const origLoad = Module._load;
  Module._load = function (request, ...args) {
    if (request === "@google/generative-ai") {
      return {
        GoogleGenerativeAI: class {
          constructor() {}
          getGenerativeModel() {
            return {
              generateContent: async () => {
                const step = sequence[Math.min(i, sequence.length - 1)]; i++;
                if (typeof step === "function") return step();
                throw step;
              },
            };
          }
        },
      };
    }
    return origLoad.apply(this, [request, ...args]);
  };
  return () => { Module._load = origLoad; };
}
function mockFetch(sequence) {
  // Each step is EITHER a resolved value/factory (plain object, or a function returning one)
  // OR an Error instance to throw (network-level failure) — only Errors are thrown.
  let i = 0;
  const orig = global.fetch;
  global.fetch = async () => {
    const step = sequence[Math.min(i, sequence.length - 1)]; i++;
    if (step instanceof Error) throw step;
    if (typeof step === "function") return step();
    return step;
  };
  return () => { global.fetch = orig; };
}
const okGeminiResp = (text, tokens) => ({ response: { text: () => text, usageMetadata: { candidatesTokenCount: tokens } } });
const okOpenRouterResp = (text, tokens) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }], usage: { completion_tokens: tokens } }) });
const errStatus = (status) => { const e = new Error("boom"); e.status = status; return e; };

(async () => {
  // ── providerName defaults + allowlist ────────────────────────────────────
  await withEnv({ AGENT_LLM_PROVIDER: null }, () => {
    const llm = freshLlm();
    eq(llm.providerName() === "gemini", "default provider must be gemini");
  });
  await withEnv({ AGENT_LLM_PROVIDER: "bogus" }, () => {
    const llm = freshLlm();
    eq(llm.providerName() === "gemini", "unknown provider value must fall back to gemini");
  });
  await withEnv({ AGENT_LLM_PROVIDER: "openrouter" }, () => {
    const llm = freshLlm();
    eq(llm.providerName() === "openrouter", "openrouter must be a recognized provider");
  });

  // ── kill-switch short-circuits BEFORE any network/SDK access ─────────────
  await withEnv({ AGENT_LLM_DISABLED: "1", AGENT_LLM_PROVIDER: "openrouter", AGENT_OPENROUTER_API_KEY: "k" }, async () => {
    const llm = freshLlm();
    const undo = mockFetch([() => { throw new Error("must not be called"); }]);
    const out = await llm.generate({ system: "s", prompt: "p" });
    undo();
    eq(out.ok === false && out.error === "KILL_SWITCH", "kill-switch must short-circuit before any fetch, got " + JSON.stringify(out));
  });

  // ── NO_API_KEY per provider ────────────────────────────────────────────────
  await withEnv({ AGENT_LLM_PROVIDER: "gemini", AGENT_GEMINI_API_KEY: null }, async () => {
    const llm = freshLlm();
    const out = await llm.generate({ system: "s", prompt: "p" });
    eq(out.ok === false && out.error === "NO_API_KEY", "gemini without key must be NO_API_KEY, got " + JSON.stringify(out));
  });
  await withEnv({ AGENT_LLM_PROVIDER: "openrouter", AGENT_OPENROUTER_API_KEY: null }, async () => {
    const llm = freshLlm();
    const out = await llm.generate({ system: "s", prompt: "p" });
    eq(out.ok === false && out.error === "NO_API_KEY", "openrouter without key must be NO_API_KEY, got " + JSON.stringify(out));
  });

  // ── claude stub ─────────────────────────────────────────────────────────
  await withEnv({ AGENT_LLM_PROVIDER: "claude" }, async () => {
    const llm = freshLlm();
    const out = await llm.generate({ system: "s", prompt: "p" });
    eq(out.ok === false && out.error === "PROVIDER_NOT_IMPLEMENTED", "claude must be an honest stub, got " + JSON.stringify(out));
  });

  // ── gemini: retry once on 503 then succeed; 403 must NOT retry ───────────
  await withEnv({ AGENT_LLM_PROVIDER: "gemini", AGENT_GEMINI_API_KEY: "k" }, async () => {
    const llm = freshLlm();
    let undo = mockGoogleGenerativeAI([errStatus(503), () => okGeminiResp("Тёплый план.", 9)]);
    const t0 = Date.now();
    const out = await llm.generate({ system: "s", prompt: "p" });
    undo();
    eq(out.ok === true && out.text === "Тёплый план." && out.provider === "gemini" && out.output_tokens === 9,
      "gemini must retry once on 503 and return the second attempt's text, got " + JSON.stringify(out));
    eq(Date.now() - t0 >= 650, "gemini retry must actually back off (~700ms), elapsed=" + (Date.now() - t0));

    undo = mockGoogleGenerativeAI([errStatus(403)]);
    const out2 = await llm.generate({ system: "s", prompt: "p" });
    undo();
    eq(out2.ok === false && out2.error === "403", "gemini permanent 403 must NOT retry and must surface the code, got " + JSON.stringify(out2));
  });

  // ── openrouter: retry once on 429 then succeed; 403 must NOT retry ───────
  await withEnv({ AGENT_LLM_PROVIDER: "openrouter", AGENT_OPENROUTER_API_KEY: "k" }, async () => {
    const llm = freshLlm();
    let undo = mockFetch([{ ok: false, status: 429 }, () => okOpenRouterResp("Nemotron plan.", 14)]);
    const out = await llm.generate({ system: "s", prompt: "p" });
    undo();
    eq(out.ok === true && out.text === "Nemotron plan." && out.provider === "openrouter" && out.model === "nvidia/nemotron-3-super-120b-a12b:free" && out.output_tokens === 14,
      "openrouter must retry once on 429 and return the second attempt's parsed text, got " + JSON.stringify(out));

    undo = mockFetch([{ ok: false, status: 403 }]);
    const out2 = await llm.generate({ system: "s", prompt: "p" });
    undo();
    eq(out2.ok === false && out2.error === "403", "openrouter permanent 403 must NOT retry, got " + JSON.stringify(out2));

    // custom model override via env
    undo = mockFetch([() => okOpenRouterResp("ok", 1)]);
    process.env.AGENT_OPENROUTER_MODEL = "some/other-model:free";
    const out3 = await llm.generate({ system: "s", prompt: "p" });
    delete process.env.AGENT_OPENROUTER_MODEL;
    undo();
    eq(out3.model === "some/other-model:free", "AGENT_OPENROUTER_MODEL override must be honored, got " + out3.model);

    // reasoning:{enabled:false} обязателен в теле — регресс-guard на находку 2026-07-06
    // (nemotron reasoning-моделей без него льёт chain-of-thought вместо ответа, §11 waste)
    let capturedBody = null;
    const origFetch = global.fetch;
    global.fetch = async (url, opts) => { capturedBody = JSON.parse(opts.body); return okOpenRouterResp("ok", 1); };
    await llm.generate({ system: "s", prompt: "p" });
    global.fetch = origFetch;
    eq(!!capturedBody && capturedBody.reasoning && capturedBody.reasoning.enabled === false,
      "openrouter request body must set reasoning:{enabled:false}, got " + JSON.stringify(capturedBody && capturedBody.reasoning));

    // stdout hygiene: error path must not leak prompt content
    undo = mockFetch([{ ok: false, status: 500 }]);
    const sentinel = "SENTINEL_PROMPT_CONTENT_9f3a";
    const out4 = await llm.generate({ system: "s", prompt: sentinel });
    undo();
    eq(!JSON.stringify(out4).includes(sentinel), "error result must never echo prompt content, got " + JSON.stringify(out4));
  });

  // ── key_source reflects the ACTIVE provider ──────────────────────────────
  await withEnv({ AGENT_LLM_PROVIDER: "mock" }, () => {
    const llm = freshLlm();
    eq(llm.keySource() === "agent", "mock provider key_source must be 'agent' (no cost, not a degradation)");
  });
  await withEnv({ AGENT_LLM_PROVIDER: "gemini", AGENT_GEMINI_API_KEY: null, AGENT_OPENROUTER_API_KEY: "k" }, () => {
    const llm = freshLlm();
    eq(llm.keySource() === "none", "gemini active + only openrouter key set must be 'none' (no cross-provider fallback, R16)");
  });
  await withEnv({ AGENT_LLM_PROVIDER: "openrouter", AGENT_OPENROUTER_API_KEY: "k", AGENT_GEMINI_API_KEY: null }, () => {
    const llm = freshLlm();
    eq(llm.keySource() === "agent", "openrouter active + its own key set must be 'agent'");
  });

  // ── mock provider unaffected (existing behavior byte-stable) ─────────────
  await withEnv({ AGENT_LLM_PROVIDER: "mock" }, async () => {
    const llm = freshLlm();
    const out = await llm.generate({ prompt: "1234567890" });
    eq(out.ok === true && out.provider === "mock" && /ctx=10 chars/.test(out.text), "mock provider text must stay byte-stable, got " + JSON.stringify(out));
  });

  const TOTAL = 18;
  if (failures.length) {
    console.error(`smoke:agent-llm-provider FAIL (${TOTAL - failures.length}/${TOTAL})`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exitCode = 1;
  } else {
    console.log(`smoke:agent-llm-provider OK (${TOTAL}/${TOTAL}) — providerName allowlist/fallback · kill-switch pre-network · NO_API_KEY per provider · claude stub · gemini/openrouter retry-once-on-transient (503/429) без retry на 403 · openrouter model-override · openrouter reasoning:false в теле · stdout-гигиена · key_source per активный провайдер · mock byte-stable`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
