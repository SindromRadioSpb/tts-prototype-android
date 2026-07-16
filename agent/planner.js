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
const llmGate = require(path.join(__dirname, "llmGate"));
const { managedLimits } = require(path.join(__dirname, "llmLimits"));
const constructs = require(path.join(__dirname, "constructs"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));
const keyingService = require(path.join(__dirname, "..", "db", "keyingService"));

const CATEGORIES = ["объяснить", "тренировать", "вернуть к чтению", "создать материал", "обновить learner profile"];

// Дисплейная форма для списка item_key: делегирует keyingService.displayForItemKey (§7 —
// ОДИН источник резолва слова во всём agent runtime, тот же датасет, что и /keying/resolve;
// '<lemma>#<pos>' — дёшево прямо из ключа, 'pid:<N>' — лемма из paradigms[].lemma, 1:1 с
// pealim_id, огласована). Честный фолбэк — сырой ключ, форму не выдумываем (R1).
async function displayItems(rows) {
  return Promise.all(rows.map(async (w) => ({ item_key: w.item_key, lemma: await keyingService.displayForItemKey(w.item_key), lapses: w.lapses })));
}

// LLM обязан писать прозу по-русски/английски, не эхо JSON-payload'а. Наблюдение
// владельца 2026-07-05 (первый живой Gemini-вызов): модель оборвалась на «Estimated
// minutes: 6 (`est_minutes":6» — частичное эхо ключей промпта вместо предложения.
// Дешёвый пост-фильтр перед показом пользователю; неудача = честная деградация
// (вызов уже потрачен из лимита — quality-провал не бесплатен для бюджета, R16).
function isCleanProse(text) {
  const t = String(text || "").trim();
  if (t.length < 10) return false;
  if (/[`{}]/.test(t)) return false;            // backtick/фигурные скобки — запах JSON-эха
  if (/"[a-zA-Z_]+"\s*:/.test(t)) return false;  // буквальное '"key":'
  if (/\best_minutes\b/i.test(t)) return false;  // протёкшее имя поля промпта
  return true;
}

function limits() {
  return managedLimits(llm.providerName());
}

// D1-диагностика «судьбы слова»: рецептивно знает, production проваливает →
// рекомендованный канал = диктант/reverse (иначе обычная тренировка).
// ВАЖНО (пойман статически при подготовке live-verify P6.4): D1-политика НАМЕРЕННО
// пишет production-провал рецептивно-сильного слова как Hard(2), не Again(1) —
// поэтому провал production = again+HARD, иначе честно проваленный диктант
// ВЫКИДЫВАЛ слово из gap-секции вместо добавления.
function productionImbalance(cs) {
  if (!cs || !cs.receptive || !cs.production) return false;
  const r = cs.receptive, p = cs.production;
  const prodFails = (Number(p.again) || 0) + (Number(p.hard) || 0);
  return (Number(r.good) || 0) >= 2 && ((Number(p.reps) || 0) === 0 || prodFails > (Number(p.good) || 0));
}


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
  // 0) СЕГОДНЯШНИЕ ПРОВАЛЫ — ПЕРВОЙ строкой (owner live-verify 2026-07-06, кейс טוב:
  //    слово, проваленное сегодня в чтении И диктанте, не попадало НИКУДА — production_gap
  //    честно требует рецептивной силы, а lapses-first top-5 due-среза на большом профиле
  //    хоронит свежие провалы под годами накопленных lapses). Наставник обязан признать
  //    сегодняшнюю борьбу раньше бэклога (R2/R17). Канал — по факту провалов: были
  //    production-провалы → диктант, иначе обычное повторение.
  const strugRes = await tools.callTool(ctx, "get_recent_struggles", { limit: 4 });
  const struggles = strugRes.ok ? strugRes.result : [];
  const struggleKeys = new Set(struggles.map((s) => s.item_key));
  if (struggles.length) {
    const items = await displayItems(struggles.map((s) => ({ item_key: s.item_key, lapses: s.fails })));
    for (let i = 0; i < struggles.length; i++) {
      items[i].fails_24h = struggles[i].fails;
      items[i].prod_fails_24h = struggles[i].prod_fails;
    }
    sections.push({
      id: "fresh_struggles", category: "тренировать",
      title_ru: "Сегодня не далось — вернёмся к этим словам прямо сейчас",
      title_en: "Struggled today — let's revisit these words right now",
      recommended_channel: struggles.some((s) => s.prod_fails > 0) ? "dictate" : "read",
      items,
    });
  }
  // 1) D1-дисбаланс каналов («судьба слова»: узнаёт при чтении — проваливает
  //    письмо): такое слово сегодня тренируется диктантом, а не общим повторением,
  //    поэтому оно вынимается из due-среза, даже если просрочено.
  const imbalanced = weak.filter((w) => productionImbalance(w.channel_stats) && !struggleKeys.has(w.item_key)).slice(0, 3);
  const gapKeys = new Set(imbalanced.map((w) => w.item_key));
  for (const k of struggleKeys) gapKeys.add(k);   // провалы дня не дублируются и в due-срезе
  if (imbalanced.length) {
    // P6.4 construct-субстрат: каждый gap-пункт несёт construct_id, назначенный СЕРВЕРОМ
    // по реальным каналам review_log слова (реестр agent/constructs.js; LLM ids не видит).
    const gapItems = await displayItems(imbalanced);
    const sectionConstructs = [];
    for (let i = 0; i < imbalanced.length; i++) {
      const lc = await tools.callTool(ctx, "get_word_lifecycle", { item_key: imbalanced[i].item_key });
      const cid = constructs.channelGapConstruct(lc.ok && lc.result ? lc.result.events : []);
      if (cid && constructs.isKnown(cid)) {
        gapItems[i].construct_id = cid;
        if (!sectionConstructs.includes(cid)) sectionConstructs.push(cid);
      }
    }
    sections.push({
      id: "production_gap", category: "тренировать",
      title_ru: "Слова, которые узнаёшь при чтении, но проваливаешь в письме — сегодня диктант",
      title_en: "Words you recognize but fail to produce — dictation today",
      recommended_channel: "dictate",
      construct_ids: sectionConstructs,
      // титулы — для UI (клиент реестра не дублирует; id → title мапит сервер)
      constructs: sectionConstructs.map((id) => ({ id, title_ru: constructs.title(id, "ru"), title_en: constructs.title(id, "en") })),
      items: gapItems,
    });
  }
  // 2) просроченные слова (lapses-first — порядок /due), без уже взятых в диктант.
  const dueSlice = due.filter((w) => !gapKeys.has(w.item_key)).slice(0, 5);
  if (dueSlice.length) {
    sections.push({
      id: "due", category: "тренировать",
      title_ru: "Повторить просроченные слова", title_en: "Review overdue words",
      count_total: learner.counts.due_now, count_now: dueSlice.length,
      items: await displayItems(dueSlice),
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
// PAS-D4: глубина плана — ЗАМЕНА length-клаузы system константой по enum (см. explainer.DEPTH_LEN;
// brief = байт-в-байт прежняя строка).
const PLAN_LEN = {
  brief: { en: "2-4 short, warm sentences in English", ru: "2–4 короткими тёплыми фразами по-русски" },
  detailed: { en: "4-7 unhurried, thorough sentences in English", ru: "4–7 обстоятельными подробными фразами по-русски" },
};
function _depthOf(profile) {
  try {
    const g = JSON.parse((profile && profile.goals_json) || "{}");
    return g && g.depth === "detailed" ? "detailed" : "brief";
  } catch (_) { return "brief"; }
}

async function plan(ctx) {
  const profile = await agentRepo.getProfile(ctx.userId);
  const language = (profile && profile.language) || "ru";
  const depth = _depthOf(profile);
  const core = await buildPlanCore(ctx);

  // PAS-F1: единый гейт (llmGate); degradable — план всегда полезен детерминированно (R16).
  let text = null, llmUsed = false, degradedReason = null, provider = null, model = null, keySource = null;
  // Класс D: prompt собирается, отправляется и НЕ персистится/НЕ логируется.
  const promptPayload = {
    language, est_minutes: core.est_minutes,
    sections: core.sections.map((s) => ({
      category: s.category, title: language === "en" ? s.title_en : s.title_ru,
      lemmas: (s.items || []).map((x) => x.lemma), recommended_channel: s.recommended_channel || null,
    })),
  };
  const g = await llmGate.gatedGenerate(ctx, {
    scenario: "plan",
    system: (language === "en"
      ? "You are the LinguistPro Hebrew mentor. Rewrite the given study plan as " + PLAN_LEN[depth].en + ". Use ONLY the facts in the JSON. Do not invent words, counts or grammar facts. No greetings, no emoji spam. Output PLAIN PROSE ONLY: no backticks, no braces, no JSON, no field names (never write est_minutes/category/sections) — just natural sentences."
      : "Ты — наставник LinguistPro по ивриту. Сформулируй данный план занятий " + PLAN_LEN[depth].ru + ". Используй ТОЛЬКО факты из JSON. Не выдумывай слова, числа и грамматические факты. Без приветствий. Пиши ТОЛЬКО обычным текстом: без обратных кавычек, без фигурных скобок, без JSON и имён полей (никогда не пиши est_minutes/category/sections) — только естественные предложения."),
    prompt: JSON.stringify(promptPayload),
    maxOutputTokens: 320,
  });
  if (g.phase === "ok") {
    if (isCleanProse(g.out.text)) { text = g.out.text; llmUsed = true; provider = g.out.provider; model = g.out.model; keySource = g.key_source; }
    else degradedReason = "LLM_OUTPUT_INVALID";   // вызов потрачен, но ответ не прошёл quality-фильтр
  } else if (g.phase === "byok") degradedReason = "BYOK_FAILED";
  else degradedReason = g.reason;   // KILL_SWITCH | USER_LIMIT | GLOBAL_LIMIT | provider error
  if (!text) text = fallbackText(core, language);

  const task = await agentRepo.createTask(ctx.userId, {
    kind: "plan",
    payload: {
      est_minutes: core.est_minutes,
      // construct_ids — вход агрегата P9 /api/agent/constructs/summary (класс A,
      // ids уже отфильтрованы реестром при сборке секции — сервер-назначенные P6.4)
      sections: core.sections.map((s) => ({
        id: s.id, category: s.category, item_keys: (s.items || []).map((x) => x.item_key),
        ...(s.construct_ids && s.construct_ids.length ? { construct_ids: s.construct_ids } : {}),
      })),
    },
  });

  return {
    ok: true,
    plan: core,
    text,
    language,
    llm_used: llmUsed,
    ...(provider ? { provider, model } : {}),
    ...(keySource === "byok" ? { key_source: "byok" } : {}),
    ...(degradedReason ? { degraded_reason: degradedReason } : {}),
    task_id: task.id,
    categories: CATEGORIES,   // канон 5 категорий — самоописание для R17-гейта
  };
}

module.exports = { plan, buildPlanCore, productionImbalance, isCleanProse, limits, CATEGORIES };
