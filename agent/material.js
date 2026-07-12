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

const corpusSentenceRepo = require(path.join(__dirname, "..", "db", "corpusSentenceRepo"));

const CATEGORY = "создать материал";   // R17-A: одна из 5 канонических категорий
const KIND = "study_summary";
const LEARNER_ITEMS_MAX = 30;
const DRAFT_KIND = "draft_retell";
const DRAFT_LINES_MIN = 3;
const DRAFT_LINES_MAX = 8;
const DRAFT_LINE_CHARS_MAX = 200;
const DRAFT_HEBREW_RATIO_MIN = 0.7;

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

// ── PAS-B3: «Упрощённый пересказ» → в Студию ──────────────────────────────────
// Producer: LLM пересказывает окно ≤5 предложений простым ивритом (алеф+/бет)
// С ru-глоссом каждой строки В ТОМ ЖЕ вызове (критика wf_7f300c39 MAJOR: пустая
// ru-таблица в Студии = тупик; глосс сразу = нулевая доп. цена).
// Источники: корпус (public domain, без consent-классов) И — записанное решение
// владельца 2026-07-12 (фидбэк слайса B) — ЛИЧНЫЕ тексты через тот же физический
// scope sentence_window_5 (двойной consent fail-closed в репо; consent-копия
// window_5 обновлена: «проверка понимания, пересказ»).
// Драфт ПЕРСИСТИТСЯ (kind='draft_retell'; corpus-строки переживают revoke по
// exclusion-list, personal-строки [facts[0].kind='user_window'] тумбстоунятся —
// by construction) → same-day dedupe, повторный тап не жжёт квоту. Материал в
// Студию попадает ТОЛЬКО по явному тапу (R17).

// PURE (unit-гейт): schema+caps+Hebrew-ratio; невалид → null (честный DRAFT_INVALID,
// без ретрай-циклов).
function validateDraft(parsed) {
  if (!parsed || !Array.isArray(parsed.lines)) return null;
  const lines = parsed.lines
    .map((l) => ({ he: String((l && l.he) || "").trim(), ru: String((l && l.ru) || "").trim() }))
    .filter((l) => l.he);
  if (lines.length < DRAFT_LINES_MIN || lines.length > DRAFT_LINES_MAX) return null;
  for (const l of lines) {
    if (l.he.length > DRAFT_LINE_CHARS_MAX || l.ru.length > DRAFT_LINE_CHARS_MAX) return null;
    if (!l.ru) return null;   // ru-глосс обязателен (иначе тупик пустой таблицы вернулся)
  }
  const joined = lines.map((l) => l.he).join("");
  const hebrew = (joined.match(/[א-ת]/g) || []).length;
  const other = (joined.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
  if (hebrew / Math.max(1, hebrew + other) < DRAFT_HEBREW_RATIO_MIN) return null;
  return lines;
}

function buildDraftPayload(rows, work, language) {
  const system = language === "en"
    ? "You are the LinguistPro Hebrew mentor. Retell the given Hebrew passage in SIMPLE Hebrew (beginner level, aleph+/bet): 3-6 short sentences, common everyday words, simple syntax. For EVERY sentence also give its Russian translation. NEVER assert morphology (roots, binyanim, parts of speech). Answer STRICTLY as JSON: {\"lines\":[{\"he\":\"...\",\"ru\":\"...\"}]} — no other fields, no prose outside JSON."
    : "Ты — наставник LinguistPro по ивриту. Перескажи данный ивритский отрывок ПРОСТЫМ ивритом (уровень алеф+/бет): 3–6 коротких предложений, частотные бытовые слова, простой синтаксис. К КАЖДОМУ предложению дай русский перевод. НИКОГДА не утверждай морфологию (корни, биньяны, части речи). Отвечай СТРОГО JSON: {\"lines\":[{\"he\":\"...\",\"ru\":\"...\"}]} — без других полей и текста вне JSON.";
  const prompt = JSON.stringify({
    language,
    work: work ? { title: work.title || null, author: work.author || null } : null,
    passage: rows.map((r) => ({ he: r.he, ru: r.ru })),
  });
  return { system, prompt };
}

async function draftRetell(ctx, { work_id, text_key, order_index } = {}) {
  const workId = String(work_id || "").trim();
  const textKey = String(text_key || "").trim();
  const orderIndex = Number(order_index);
  if (!textKey || !Number.isFinite(orderIndex)) return { ok: false, error: "BAD_ANCHOR" };

  const profile = await agentRepo.getProfile(ctx.userId);
  const language = (profile && profile.language) || "ru";

  // Источник по якорю: work_id → корпус (валидация/traversal в corpusSentenceRepo);
  // без work_id → ЛИЧНЫЙ текст через window-tool (двойной consent fail-closed в репо).
  let win;
  if (workId) {
    win = await corpusSentenceRepo.getCorpusWindow({
      corpus: "benyehuda", work_id: workId, text_key: textKey, order_index: orderIndex, window: 5,
    });
    if (!win.ok) return { ok: false, error: win.error };
  } else {
    const wres = await tools.callTool(ctx, "get_sentence_window_if_available", {
      text_key: textKey, order_index: orderIndex, window: 5,
    });
    if (!wres.ok) return { ok: false, error: wres.error || "TOOL_FAILED" };
    if (!wres.result.ok) return { ok: false, error: wres.result.error, ...(wres.result.key ? { key: wres.result.key } : {}) };
    win = { anchor: wres.result.anchor, work: null, rows: wres.result.rows };
  }

  const sid = textKey + "#" + orderIndex;
  const cached = await agentRepo.getFreshExplanation(ctx.userId, sid, { language, kind: DRAFT_KIND });
  if (cached && Array.isArray(cached.lines) && cached.lines.length) {
    return {
      ok: true, kind: DRAFT_KIND, from_history: true, category: CATEGORY, language,
      anchor: win.anchor, work: win.work, draft: { lines: cached.lines },
      llm_used: cached.llm_used, ...(cached.provider ? { provider: cached.provider, model: cached.model } : {}),
      explanation_id: cached.id, usage: await _usage(ctx.userId),
    };
  }

  // Пересказ без LLM невозможен по природе — честные коды вместо фолбэка (паттерн followup).
  const lim = planner.limits();
  if (llm.killSwitchOn()) return { ok: false, error: "LLM_UNAVAILABLE" };
  const reserve = await agentRepo.reserveLlmCall(ctx.userId, {
    scenario: "draft_retell", provider: llm.providerName(), perUserDaily: lim.perUserDaily, globalDaily: lim.globalDaily,
  });
  if (!reserve.ok) return { ok: false, error: reserve.reason };

  const payload = buildDraftPayload(win.rows, win.work, language);
  const out = await llm.generate({ system: payload.system, prompt: payload.prompt, json: true, maxOutputTokens: 768, fixture: DRAFT_KIND });
  await agentRepo.finalizeLlmCall(reserve.reserveId, { ok: out.ok, actualUnits: out.ok ? (out.output_tokens || 1) : null });
  if (!out.ok) return { ok: false, error: out.error === "KILL_SWITCH" ? "LLM_UNAVAILABLE" : (out.error || "LLM_UNAVAILABLE") };
  let parsed = null;
  try { parsed = JSON.parse(out.text); } catch (_) {}
  const lines = validateDraft(parsed);
  if (!lines) return { ok: false, error: "DRAFT_INVALID" };

  const factsUsed = [
    workId
      ? {
          kind: "corpus_sentence", source: "corpus_artifact", license: "public-domain",
          scope_level: "corpus_window_5", anchor: win.anchor, rows_used: win.rows.length,
        }
      : {
          // personal-derived → тумбстоунится на revoke agent_read_texts (exclusion-list)
          kind: "user_window", source: "consented_artifact",
          scope_level: "sentence_window_5", anchor: win.anchor, rows_used: win.rows.length,
        },
  ];
  const created = await tools.callTool(ctx, "create_explanation", {
    sentence_id: sid,
    facts_used: factsUsed,
    llm_model: out.provider + ":" + out.model,
    body: {
      kind: DRAFT_KIND, category: CATEGORY, language,
      scope_level: "corpus_window_5",
      llm_used: true, provider: out.provider, model: out.model,
      lines,
      text: lines.map((l) => l.he).join("\n"),
    },
  });

  return {
    ok: true, kind: DRAFT_KIND, category: CATEGORY, language,
    anchor: win.anchor, work: win.work,
    draft: { lines },
    llm_used: true, provider: out.provider, model: out.model,
    explanation_id: created.ok && created.result ? created.result.id : null,
    usage: await _usage(ctx.userId),
  };
}

module.exports = { studySummary, buildSummaryPayload, LEARNER_ITEMS_MAX, KIND,
  draftRetell, validateDraft, buildDraftPayload, DRAFT_KIND, DRAFT_LINES_MIN, DRAFT_LINES_MAX };
