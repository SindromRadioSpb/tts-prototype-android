"use strict";

// agent/planner.js — CLG-P6 сценарий №1: /plan (§9 «принятый план» 4.6). READ-ONLY по
// отношению к учебной памяти: НЕ пишет grade, НЕ трогает review_log (MNAR-совместим по
// построению — R17-гейт 6), создаёт только agent_task kind='plan' (идентификаторы).
//
// Архитектура R16 «LLM-less полезность»: план строится ДЕТЕРМИНИРОВАННО из инструментов
// (get_learner_context / get_due_words / get_weak_words + D1 channel_stats), LLM — только
// опциональная финальная формулировка. Лимит исчерпан / kill-switch / нет ключа →
// шаблонный текст, план тот же (degraded_reason честно в ответе).
//
// R17-A: каждый пункт плана несёт category из 5 канонических категорий действия (§2.3) —
// agent-message gate проверяем механически. R11: счётчики плана == счётчикам Learner
// Graph API (гейт сверяет с /api/learner/due|weak).
//
// STDOUT-ГИГИЕНА: prompt/context не логируются (гейт: sentinel-ключи не появляются в
// stdout сервера).

const path = require("path");
const tools = require(path.join(__dirname, "tools"));
const llm = require(path.join(__dirname, "llm"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));

const CATEGORIES = ["объяснить", "тренировать", "вернуть к чтению", "создать материал", "обновить learner profile"];

function limits() {
  return {
    perUserDaily: Number(process.env.AGENT_LLM_DAILY_PER_USER) || 50,
    globalDaily: Number(process.env.AGENT_LLM_DAILY_GLOBAL) || 200,
  };
}

// D1-диагностика «судьбы слова»: рецептивно знает, production проваливает →
// рекомендованный канал = диктант/reverse (иначе обычная тренировка).
function productionImbalance(cs) {
  if (!cs || !cs.receptive || !cs.production) return false;
  const r = cs.receptive, p = cs.production;
  return (Number(r.good) || 0) >= 2 && ((Number(p.reps) || 0) === 0 || (Number(p.again) || 0) > (Number(p.good) || 0));
}

const lemmaOf = (itemKey) => String(itemKey || "").split("#")[0];

// Детерминированное ядро плана. ctx = { userId } из принципала.
async function buildPlanCore(ctx) {
  const ctxRes = await tools.callTool(ctx, "get_learner_context", {});
  if (!ctxRes.ok) throw new Error("CONTEXT_FAILED");
  const dueRes = await tools.callTool(ctx, "get_due_words", { limit: 100 });
  const weakRes = await tools.callTool(ctx, "get_weak_words", { limit: 20 });
  const due = dueRes.ok ? dueRes.result : [];
  const weak = weakRes.ok ? weakRes.result : [];
  const learner = ctxRes.result;

  const sections = [];
  // 1) D1-дисбаланс каналов СНАЧАЛА («судьба слова»: узнаёт при чтении — проваливает
  //    письмо): такое слово сегодня тренируется диктантом, а не общим повторением,
  //    поэтому оно вынимается из due-среза, даже если просрочено.
  const imbalanced = weak.filter((w) => productionImbalance(w.channel_stats)).slice(0, 3);
  const gapKeys = new Set(imbalanced.map((w) => w.item_key));
  if (imbalanced.length) {
    sections.push({
      id: "production_gap", category: "тренировать",
      title_ru: "Слова, которые узнаёшь при чтении, но проваливаешь в письме — сегодня диктант",
      title_en: "Words you recognize but fail to produce — dictation today",
      recommended_channel: "dictate",
      items: imbalanced.map((w) => ({ item_key: w.item_key, lemma: lemmaOf(w.item_key), lapses: w.lapses })),
    });
  }
  // 2) просроченные слова (lapses-first — порядок /due), без уже взятых в диктант.
  const dueSlice = due.filter((w) => !gapKeys.has(w.item_key)).slice(0, 5);
  if (dueSlice.length) {
    sections.push({
      id: "due", category: "тренировать",
      title_ru: "Повторить просроченные слова", title_en: "Review overdue words",
      count_total: learner.counts.due_now, count_now: dueSlice.length,
      items: dueSlice.map((w) => ({ item_key: w.item_key, lemma: lemmaOf(w.item_key), lapses: w.lapses })),
    });
  }
  // 3) вернуться в живое чтение (моат; контекст-first — R17-гейт 8 адресуется Залом).
  sections.push({
    id: "read", category: "вернуть к чтению",
    title_ru: "Открыть Зал и прочитать один абзац", title_en: "Open the Reading Room and read one paragraph",
    link: "/library.html",
  });

  const wordCount = sections.reduce((n, s) => n + ((s.items && s.items.length) || 0), 0);
  const estMinutes = Math.max(3, Math.round(wordCount * 0.5 + 3));
  return {
    generated_for: { due_now: learner.counts.due_now, scheduled: learner.counts.scheduled, last_review_at: learner.last_review_at },
    est_minutes: estMinutes,
    sections,
  };
}

function fallbackText(plan, language) {
  const en = language === "en";
  const lines = [];
  lines.push(en ? `Today ≈ ${plan.est_minutes} min:` : `Сегодня ≈ ${plan.est_minutes} мин:`);
  let i = 1;
  for (const s of plan.sections) {
    const title = en ? s.title_en : s.title_ru;
    const n = (s.items && s.items.length) || 0;
    lines.push(`${i}. ${title}${n ? ` (${n})` : ""}.`);
    i++;
  }
  return lines.join("\n");
}

// Полный сценарий /plan: ядро → (опц.) LLM-формулировка под pre-call reserve → agent_task.
async function plan(ctx) {
  const profile = await agentRepo.getProfile(ctx.userId);
  const language = (profile && profile.language) || "ru";
  const core = await buildPlanCore(ctx);

  let text = null, llmUsed = false, degradedReason = null, provider = null, model = null;
  const lim = limits();
  // Kill-switch — ДО резерва: выключенный LLM не должен жечь ledger-бюджет (§11).
  const reserve = llm.killSwitchOn()
    ? { ok: false, reason: "KILL_SWITCH" }
    : await agentRepo.reserveLlmCall(ctx.userId, {
        scenario: "plan", provider: llm.providerName(), perUserDaily: lim.perUserDaily, globalDaily: lim.globalDaily,
      });
  if (!reserve.ok) {
    degradedReason = reserve.reason;   // KILL_SWITCH | USER_LIMIT | GLOBAL_LIMIT — план всё равно полезен (R16)
  } else {
    // Класс D: prompt собирается, отправляется и НЕ персистится/НЕ логируется.
    const promptPayload = {
      language, est_minutes: core.est_minutes,
      sections: core.sections.map((s) => ({
        category: s.category, title: language === "en" ? s.title_en : s.title_ru,
        lemmas: (s.items || []).map((x) => x.lemma), recommended_channel: s.recommended_channel || null,
      })),
    };
    const out = await llm.generate({
      system: (language === "en"
        ? "You are the LinguistPro Hebrew mentor. Rewrite the given study plan as 2-4 short, warm sentences in English. Use ONLY the facts in the JSON. Do not invent words, counts or grammar facts. No greetings, no emoji spam."
        : "Ты — наставник LinguistPro по ивриту. Сформулируй данный план занятий 2–4 короткими тёплыми фразами по-русски. Используй ТОЛЬКО факты из JSON. Не выдумывай слова, числа и грамматические факты. Без приветствий."),
      prompt: JSON.stringify(promptPayload),
      maxOutputTokens: 256,
    });
    await agentRepo.finalizeLlmCall(reserve.reserveId, { ok: out.ok, actualUnits: out.ok ? (out.output_tokens || 1) : null });
    if (out.ok) { text = out.text; llmUsed = true; provider = out.provider; model = out.model; }
    else degradedReason = out.error;   // KILL_SWITCH | NO_API_KEY | provider error → деградация
  }
  if (!text) text = fallbackText(core, language);

  const task = await agentRepo.createTask(ctx.userId, {
    kind: "plan",
    payload: {
      est_minutes: core.est_minutes,
      sections: core.sections.map((s) => ({ id: s.id, category: s.category, item_keys: (s.items || []).map((x) => x.item_key) })),
    },
  });

  return {
    ok: true,
    plan: core,
    text,
    language,
    llm_used: llmUsed,
    ...(provider ? { provider, model } : {}),
    ...(degradedReason ? { degraded_reason: degradedReason } : {}),
    task_id: task.id,
    categories: CATEGORIES,   // канон 5 категорий — самоописание для R17-гейта
  };
}

module.exports = { plan, buildPlanCore, productionImbalance, CATEGORIES };
