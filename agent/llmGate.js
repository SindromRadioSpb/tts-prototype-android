"use strict";

// agent/llmGate.js — PAS-F1: ЕДИНАЯ точка LLM-вызова агента (спека
// PAS_F1_BYOK_EXTENSION_HANDOFF_2026_07_12 v2 после критики wf_59ca6197).
//
// Гейт владеет ТОЛЬКО цепочкой killSwitch → (reserve | byok) → generate →
// (finalize | recordByok). Всё сценарио-специфичное ОСТАЁТСЯ в вызывающих
// байт-идентично (критика R11-6): дедупы, scenario-cap'ы, валидаторы
// (isCleanProse/validateTurn/validateDraft/validateComprehension),
// LLM_OUTPUT_INVALID, ремапы кодов, персист/bump-side-effects, форма ответа.
//
// BYOK-ветка (гибрид PAS-F1, решение владельца): ctx.byok = {provider, key}
// (провалидирован endpoint-хелпером _agentByokCtx — сюда попадает только
// целиком-валидный объект) → СЕРВЕРНАЯ КВОТА НЕ РЕЗЕРВИРУЕТСЯ, вызов идёт на
// ключе пользователя; телеметрия recordByokCall (kind='llm_call_byok', вне
// квоты по построению) — best-effort: сбой INSERT не роняет оплаченный
// пользователем ответ. Фейл BYOK-вызова = честный BYOK_FAILED — НИКОГДА не
// фолбэк на серверный ключ (молчаливое заимствование запрещено в обе стороны,
// чартер §7.5). Ключ не логируется, не персистится, не попадает в throw.
//
// Возврат (phase-контракт — вызывающий маппит на своё поведение 1:1):
//   { phase:'kill',     reason:'KILL_SWITCH',            key_source:'agent' }
//   { phase:'reserve',  reason:'USER_LIMIT'|'GLOBAL_LIMIT', key_source:'agent' }
//   { phase:'byok',     reason:'BYOK_FAILED', provider_error, key_source:'byok' }
//   { phase:'generate', reason:<код провайдера>,         key_source:'agent' }  // вызов сгорел (finalize failed)
//   { phase:'ok',       out:{text,provider,model,output_tokens}, key_source:'agent'|'byok' }

const path = require("path");
const llm = require(path.join(__dirname, "llm"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));

function _limits() {
  // env-чтение = planner.limits() (lazy — planner require'ит llmGate-потребителей; без циклов)
  return {
    perUserDaily: Number(process.env.AGENT_LLM_DAILY_PER_USER) || 50,
    globalDaily: Number(process.env.AGENT_LLM_DAILY_GLOBAL) || 200,
  };
}

async function gatedGenerate(ctx, { scenario, system, prompt, maxOutputTokens, json, jsonSchema, fixture } = {}) {
  const requestedSchemaMode = jsonSchema ? "provider_json_schema" : "prompt_json";
  const started = Date.now();
  if (llm.killSwitchOn()) return { phase: "kill", reason: "KILL_SWITCH", key_source: "agent",
    provider: llm.providerName(), schema_mode: requestedSchemaMode, latency_ms: Date.now() - started, output_size_bytes: 0 };

  const byok = ctx && ctx.byok && ctx.byok.key && ctx.byok.provider ? ctx.byok : null;
  if (byok) {
    const out = await llm.generate({
      system, prompt, maxOutputTokens, json, jsonSchema, fixture,
      byokProvider: byok.provider, byokKey: byok.key,
    });
    try {
      await agentRepo.recordByokCall(ctx.userId, {
        scenario, provider: byok.provider, ok: out.ok,
        actualUnits: out.ok ? (out.output_tokens || 1) : null,
      });
    } catch (_) {
      // телеметрия best-effort: ответ пользователя (оплаченный ЕГО ключом) важнее строки учёта
      try { console.log("[llm-gate] byok telemetry insert failed (answer delivered)"); } catch (_) {}
    }
    const meta = { provider: byok.provider, schema_mode: out.schema_mode || requestedSchemaMode,
      latency_ms: Date.now() - started, output_size_bytes: out.ok ? Buffer.byteLength(String(out.text || ""), "utf8") : 0 };
    if (!out.ok) return { phase: "byok", reason: "BYOK_FAILED", provider_error: String(out.error || "").slice(0, 60), key_source: "byok", ...meta };
    return { phase: "ok", out, key_source: "byok", ...meta };
  }

  const lim = _limits();
  const reserve = await agentRepo.reserveLlmCall(ctx.userId, {
    scenario, provider: llm.providerName(), perUserDaily: lim.perUserDaily, globalDaily: lim.globalDaily,
  });
  if (!reserve.ok) return { phase: "reserve", reason: reserve.reason, key_source: "agent", provider: llm.providerName(),
    schema_mode: requestedSchemaMode, latency_ms: Date.now() - started, output_size_bytes: 0 };
  const out = await llm.generate({ system, prompt, maxOutputTokens, json, jsonSchema, fixture });
  await agentRepo.finalizeLlmCall(reserve.reserveId, { ok: out.ok, actualUnits: out.ok ? (out.output_tokens || 1) : null });
  const meta = { provider: llm.providerName(), schema_mode: out.schema_mode || requestedSchemaMode,
    latency_ms: Date.now() - started, output_size_bytes: out.ok ? Buffer.byteLength(String(out.text || ""), "utf8") : 0 };
  if (!out.ok) return { phase: "generate", reason: out.error, key_source: "agent", ...meta };
  return { phase: "ok", out, key_source: "agent", ...meta };
}

module.exports = { gatedGenerate };
