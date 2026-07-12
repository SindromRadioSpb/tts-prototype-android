"use strict";

// agent/material.js — PAS-B2: «Сделай из текста материал», LLM-часть — advisory-резюме
// «что стоит выучить из этого текста» (category R17 «создать материал»).
//
// Детерминированные движки материала (autogen ②-заметки, frontier-квиз) живут НА КЛИЕНТЕ
// (OPFS, офлайн, R1-чистые) — сервер оркеструет ТОЛЬКО LLM-советника поверх дайджеста.
//
// Инварианты:
//   R1  — LLM не утверждает морфологию (system-guard как в explain); резюме — advisory.
//   R16 — reserveLlmCall scenario='study_summary'; kill-switch наследуется; usage в ответе.
//   R17 — advisory: НИКОГДА не пишет review_log; «кто учит — не сертифицирует».
//   Privacy — digest-tool с ТРОЙНЫМ consent fail-closed (agent_read_texts_digest — новый
//   durable-ключ, критика wf_7f300c39 BLOCKER ×3); same-day dedupe СТРОГО ПОСЛЕ tool'а
//   (иначе revoke+failed-purge отдал бы контент из истории); purge-предикат agentRepo НЕ
//   меняется — exclusion-list тумбстоунит user_text_digest by construction.
//   Класс D — prompt не персистится/не логируется; в facts_used уходит СЧЁТ строк и якорь,
//   не содержимое дайджеста (контент и так восстановим из артефакта по якорю).

const path = require("path");
const tools = require(path.join(__dirname, "tools"));
const llm = require(path.join(__dirname, "llm"));
const planner = require(path.join(__dirname, "planner"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));
const agentSentenceRepo = require(path.join(__dirname, "..", "db", "agentSentenceRepo"));

const CATEGORY = "создать материал";   // R17-A: одна из 5 канонических категорий
const KIND = "study_summary";
const LEARNER_ITEMS_MAX = 30;

async function _usage(userId) {
  try {
    const u = await agentRepo.usageToday(userId);
    return { user_llm_calls: u.user_llm_calls, limit: planner.limits().perUserDaily };
  } catch (_) { return null; }
}

// PURE (unit-гейт кэпов напрямую, паттерн buildFollowupPayload из PAS-A2): дайджест уже
// капнут репо (≤40×200), learner-идентификаторы капятся здесь; system байт-стабилен.
function buildSummaryPayload(digest, learner, language) {
  const due = (learner && learner.due || []).slice(0, LEARNER_ITEMS_MAX);
  const weakBudget = Math.max(0, LEARNER_ITEMS_MAX - due.length);
  const weak = (learner && learner.weak || []).filter((k) => !due.includes(k)).slice(0, weakBudget);
  const system = language === "en"
    ? "You are the LinguistPro Hebrew mentor. The learner asks: what is worth learning from this text? Using ONLY the given rows (Hebrew + translation) and the learner's due/weak word identifiers, write 4-8 short, warm English sentences: which words/expressions from THIS text deserve attention first and why (frequency in the text, overlap with the learner's due/weak words, useful everyday value). NEVER assert morphology (roots, binyanim, parts of speech) — that is the resolver's job, not yours; speak about words and meanings only. This is advice, not an assessment. Output PLAIN PROSE ONLY: no backticks, no braces, no JSON, no field names."
    : "Ты — наставник LinguistPro по ивриту. Ученик спрашивает: что стоит выучить из этого текста? Опираясь ТОЛЬКО на данные строки (иврит + перевод) и идентификаторы просроченных/слабых слов ученика, напиши 4–8 коротких тёплых фраз по-русски: какие слова/обороты ИЗ ЭТОГО текста заслуживают внимания в первую очередь и почему (частота в тексте, пересечение с due/weak-словами ученика, бытовая полезность). НИКОГДА не утверждай морфологию (корни, биньяны, части речи) — это дело резолвера, не твоё; говори о словах и значениях. Это совет, не оценка. Пиши ТОЛЬКО обычным текстом: без обратных кавычек, фигурных скобок, JSON и имён полей.";
  const prompt = JSON.stringify({
    language,
    title: digest.title || null,
    rows_total: digest.rows_total,
    rows: digest.rows,
    learner: { due_item_keys: due, weak_item_keys: weak },
  });
  return { system, prompt, due, weak };
}

// Честная деградация без LLM: детерминированный дайджест (advisory, без морфо-утверждений).
function fallbackText(digest, due, weak, language) {
  const items = [...new Set([...due, ...weak])].slice(0, 10);
  if (language === "en") {
    let t = "Mentor offline — deterministic digest: the text has " + digest.rows_total + " row(s).";
    if (items.length) t += " Your due/weak words to watch for while reading: " + items.join(", ") + ".";
    else t += " No due/weak words tracked yet — read and tap words to start tracking.";
    return t;
  }
  let t = "Наставник офлайн — детерминированный дайджест: в тексте " + digest.rows_total + " стр.";
  if (items.length) t += " Ваши просроченные/слабые слова — ищите их при чтении: " + items.join(", ") + ".";
  else t += " Просроченных/слабых слов пока нет — читайте и отмечайте слова, чтобы начать отслеживание.";
  return t;
}

// Полный сценарий: digest-tool (тройной consent) → dedupe → reserve → LLM → persist.
async function studySummary(ctx, { text_key } = {}) {
  const textKey = String(text_key || "").trim();
  if (!textKey) return { ok: false, error: "BAD_ANCHOR" };

  const profile = await agentRepo.getProfile(ctx.userId);
  const language = (profile && profile.language) || "ru";

  const dres = await tools.callTool(ctx, "get_text_digest_if_available", { text_key: textKey });
  if (!dres.ok) return { ok: false, error: dres.error || "TOOL_FAILED" };
  if (!dres.result.ok) return { ok: false, error: dres.result.error, ...(dres.result.key ? { key: dres.result.key } : {}) };
  const digest = dres.result;

  // Same-day dedupe — СТРОГО после consent-гейта tool'а (критика: dedupe до гейта отдал бы
  // контент из истории после revoke при провале purge). kind-дискриминация: sid '#summary'
  // не пересекается с sentence/word-объяснениями.
  const sid = textKey + "#summary";
  const cached = await agentRepo.getFreshExplanation(ctx.userId, sid, { language, kind: KIND });
  if (cached) {
    return {
      ok: true, kind: KIND, from_history: true, category: CATEGORY, language,
      anchor: { text_key: textKey }, text: cached.text, llm_used: cached.llm_used,
      ...(cached.provider ? { provider: cached.provider, model: cached.model } : {}),
      explanation_id: cached.id, usage: await _usage(ctx.userId),
    };
  }

  // Learner-факты — те же read-tools, что /plan (идентификаторы класса A).
  const dueRes = await tools.callTool(ctx, "get_due_words", { limit: 100 });
  const weakRes = await tools.callTool(ctx, "get_weak_words", { limit: 20 });
  const learner = {
    due: (dueRes.ok ? dueRes.result : []).map((w) => w.item_key),
    weak: (weakRes.ok ? weakRes.result : []).map((w) => w.item_key),
  };
  const payload = buildSummaryPayload(digest, learner, language);

  let text = null, llmUsed = false, degradedReason = null, provider = null, model = null;
  const lim = planner.limits();
  const reserve = llm.killSwitchOn()
    ? { ok: false, reason: "KILL_SWITCH" }
    : await agentRepo.reserveLlmCall(ctx.userId, {
        scenario: "study_summary", provider: llm.providerName(), perUserDaily: lim.perUserDaily, globalDaily: lim.globalDaily,
      });
  if (!reserve.ok) {
    degradedReason = reserve.reason;
  } else {
    const out = await llm.generate({ system: payload.system, prompt: payload.prompt, maxOutputTokens: 512 });
    await agentRepo.finalizeLlmCall(reserve.reserveId, { ok: out.ok, actualUnits: out.ok ? (out.output_tokens || 1) : null });
    if (out.ok && planner.isCleanProse(out.text)) { text = out.text; llmUsed = true; provider = out.provider; model = out.model; }
    else if (out.ok) degradedReason = "LLM_OUTPUT_INVALID";
    else degradedReason = out.error;
  }
  if (!text) text = fallbackText(digest, payload.due, payload.weak, language);

  // §7 provenance: якорь+счёт, НЕ содержимое дайджеста (replay — из артефакта по якорю).
  const factsUsed = [
    {
      kind: "user_text_digest", source: "learner_artifact", scope_level: agentSentenceRepo.SCOPE_TEXT_DIGEST,
      anchor: { text_key: textKey }, title: digest.title, rows_total: digest.rows_total, rows_sent: digest.rows.length,
    },
    { kind: "learner_state", source: "learner_graph", due_item_keys: payload.due, weak_item_keys: payload.weak },
  ];
  const created = await tools.callTool(ctx, "create_explanation", {
    sentence_id: sid,
    facts_used: factsUsed,
    llm_model: llmUsed ? (provider + ":" + model) : null,
    body: {
      kind: KIND, category: CATEGORY, language,
      scope_level: agentSentenceRepo.SCOPE_TEXT_DIGEST,
      llm_used: llmUsed, ...(provider ? { provider, model } : {}),
      ...(degradedReason ? { degraded_reason: degradedReason } : {}),
      text,
    },
  });

  return {
    ok: true, kind: KIND, category: CATEGORY, language,
    anchor: { text_key: textKey },
    text, llm_used: llmUsed,
    ...(provider ? { provider, model } : {}),
    ...(degradedReason ? { degraded_reason: degradedReason } : {}),
    explanation_id: created.ok && created.result ? created.result.id : null,
    usage: await _usage(ctx.userId),
  };
}

module.exports = { studySummary, buildSummaryPayload, LEARNER_ITEMS_MAX, KIND };
