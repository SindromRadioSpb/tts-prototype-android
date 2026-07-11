"use strict";

// agent/explainer.js — CLG-P6 сценарий №2: /explain sentence (§9 «принятый план» 4.6-2,
// решение владельца 2026-07-06). Пользователь читает СВОЙ текст → «объясни это
// предложение» → объяснение с учётом его слабых мест.
//
// Приватность (решение ДО кода, §15.9): доступ к содержимому — ТОЛЬКО через tool
// get_sentence_context_if_available (двойной consent cloud_texts+agent_read_texts,
// fail-closed в db/agentSentenceRepo); scope_level='sentence_only' — в LLM уходит ОДНО
// якорное предложение + факты, уже раскрываемые в /plan (леммы, channel_stats). Соседние
// предложения/абзац/название текста НЕ отправляются.
//
// R1: морфологию УТВЕРЖДАЕТ резолвер (keyingService, те же pure-модули, что браузер) —
// LLM только формулирует объяснение поверх детерминированного пакета и НЕ имеет права
// перерешать root/binyan/pos. R17-A: категория действия — «объяснить». R9: каждый факт
// в facts_used несёт источник и asserted/derived-статус.
//
// MNAR/R17-гейт: сценарий НЕ пишет в review_log (просмотр объяснения — не учебное
// событие); единственная запись — agent_explanations через инструмент create_explanation.
//
// R16: LLM-less fallback — без ключа/лимита/kill-switch объяснение остаётся полезным
// (перевод + морфология + слабые места), деградация подписывается честно.
//
// STDOUT-ГИГИЕНА: prompt/предложение не логируются и не попадают в throw-message (класс D).

const path = require("path");
const tools = require(path.join(__dirname, "tools"));
const llm = require(path.join(__dirname, "llm"));
const planner = require(path.join(__dirname, "planner"));
const constructs = require(path.join(__dirname, "constructs"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));

const SCOPE_SENTENCE_ONLY = "sentence_only";
const CATEGORY = "объяснить";   // R17-A: одна из 5 канонических категорий действия

// Токенизация иврита для резолвера: последовательности еврейских букв (+внутренние
// гершаим/апострофы/макаф как в аббревиатурах צה"ל). Дедуп по поверхности — резолвер
// один раз на форму; порядок первого вхождения сохраняется.
function hebrewTokens(text) {
  const m = String(text || "").match(/[א-ת][א-ת'"׳״־-]*[א-ת]|[א-ת]/g) || [];
  const seen = new Set(), out = [];
  for (const t of m) { if (!seen.has(t)) { seen.add(t); out.push(t); } }
  return out;
}

// Детерминированное ядро: предложение (личное — consent-gated; корпус — общий артефакт,
// PAS-A1) + резолвер-морфология + пересечение с учебным состоянием. Всё, что уйдёт в
// LLM/facts_used, собирается ЗДЕСЬ; всё ниже первой ступени — source-агностично.
async function buildExplainCore(ctx, { text_key, order_index, source, work_id } = {}) {
  const isCorpus = source === "corpus";
  const sres = isCorpus
    ? await tools.callTool(ctx, "get_corpus_sentence_context", { corpus: "benyehuda", work_id, text_key, order_index })
    : await tools.callTool(ctx, "get_sentence_context_if_available", { text_key, order_index });
  if (!sres.ok) return { ok: false, error: sres.error || "TOOL_FAILED" };
  if (!sres.result.ok) return { ok: false, error: sres.result.error, ...(sres.result.key ? { key: sres.result.key } : {}) };
  const sctx = sres.result;

  const tokens = hebrewTokens(sctx.sentence.he).slice(0, 40);
  const kres = await tools.callTool(ctx, "resolve_item_key", { words: tokens.map((s) => ({ surface: s })) });
  const keyed = kres.ok && kres.result ? kres.result : { results: [], resolver: null, model_version: null };

  // Морфология для LLM/пользователя — только keyable-строки; неключуемое честно
  // опускается (R1: не выдумываем форм). Гомограф → ambiguous-флаг, глосс = ОДНА из
  // возможностей, не вердикт.
  const morphology = (keyed.results || [])
    .filter((r) => r && r.keyable && r.body)
    .map((r) => ({
      surface: r.surface,
      item_key: r.item_key,
      lemma: r.body.word || null,
      niqqud: r.body.niqqud || null,
      root: r.body.root || null,
      binyan: r.body.binyan || null,
      pos: r.body.pos || null,
      meaning: r.body.meaning || null,
      ambiguous: !!r.ambiguous,
      confidence: r.confidence != null ? r.confidence : null,
    }));
  const keyInSentence = new Set(morphology.map((m) => m.item_key));

  // Учебное состояние (те же инструменты, что /plan): что из ЭТОГО предложения due/weak,
  // где production-провал (D1). Идентификаторы класса A — уже раскрываемая LLM плоскость.
  const dueRes = await tools.callTool(ctx, "get_due_words", { limit: 100 });
  const weakRes = await tools.callTool(ctx, "get_weak_words", { limit: 20 });
  const due = (dueRes.ok ? dueRes.result : []).filter((w) => keyInSentence.has(w.item_key));
  const weak = (weakRes.ok ? weakRes.result : []).filter((w) => keyInSentence.has(w.item_key));
  const productionGap = weak.filter((w) => planner.productionImbalance(w.channel_stats));

  // P6.4 construct-субстрат: ids назначает СЕРВЕР (реестр + детерминированная детекция),
  // ДО вызова LLM. Channel-gap уточняется по РЕАЛЬНЫМ каналам review_log слова
  // (get_word_lifecycle); binyan — только когда резолвер его утверждает. 1–3 конструкции.
  const constructEvidence = new Map();   // id → [item_key]
  const addConstruct = (id, itemKey) => {
    if (!id || !constructs.isKnown(id)) return;   // неизвестный id не существует by construction
    if (!constructEvidence.has(id)) constructEvidence.set(id, []);
    if (itemKey && !constructEvidence.get(id).includes(itemKey)) constructEvidence.get(id).push(itemKey);
  };
  for (const w of productionGap.slice(0, 3)) {
    const lc = await tools.callTool(ctx, "get_word_lifecycle", { item_key: w.item_key });
    const events = lc.ok && lc.result ? lc.result.events : [];
    addConstruct(constructs.channelGapConstruct(events), w.item_key);
  }
  const weakOrDue = new Set([...due.map((w) => w.item_key), ...weak.map((w) => w.item_key)]);
  for (const m of morphology) {
    if (m.item_key && weakOrDue.has(m.item_key)) addConstruct(constructs.binyanConstruct(m.binyan), m.item_key);
  }
  const constructList = [...constructEvidence.keys()].slice(0, 3).map((id) => ({
    id, kind: constructs.get(id).kind, evidence_item_keys: constructEvidence.get(id),
  }));

  return {
    ok: true,
    scope_level: SCOPE_SENTENCE_ONLY,
    source: isCorpus ? "corpus" : "personal",
    work: isCorpus ? (sctx.work || null) : null,
    anchor: sctx.anchor,
    sentence: sctx.sentence,
    morphology,
    resolver: { id: keyed.resolver || null, model_version: keyed.model_version || null, keyer_version: keyed.keyer_version || null },
    learner: {
      due_in_sentence: due.map((w) => w.item_key),
      weak_in_sentence: weak.map((w) => ({ item_key: w.item_key, lapses: w.lapses })),
      production_gap: productionGap.map((w) => w.item_key),
    },
    constructs: constructList,
  };
}

// LLM-less честный фолбэк: перевод + морфология + слабые места. Без выдумок — только
// детерминированные факты ядра.
function fallbackText(core, language) {
  const en = language === "en";
  const lines = [];
  if (core.sentence.ru) lines.push((en ? "Translation: " : "Перевод: ") + core.sentence.ru);
  const weakSet = new Set(core.learner.weak_in_sentence.map((w) => w.item_key));
  const dueSet = new Set(core.learner.due_in_sentence);
  for (const m of core.morphology.slice(0, 12)) {
    const bits = [];
    if (m.meaning) bits.push(m.meaning);
    if (m.root) bits.push((en ? "root " : "корень ") + m.root);
    if (m.binyan) bits.push((en ? "binyan " : "биньян ") + m.binyan);
    let flag = "";
    if (m.item_key && dueSet.has(m.item_key)) flag = en ? " — due for review" : " — пора повторить";
    else if (m.item_key && weakSet.has(m.item_key)) flag = en ? " — weak word" : " — слабое слово";
    if (bits.length || flag) lines.push("• " + (m.niqqud || m.surface) + (bits.length ? ": " + bits.join(", ") : "") + flag);
  }
  for (const c of core.constructs || []) {
    const t = constructs.title(c.id, language);
    if (t) lines.push((en ? "Construct: " : "Конструкция: ") + t);
  }
  if (!lines.length) lines.push(en ? "No offline facts found for this sentence." : "Офлайн-фактов по этому предложению не нашлось.");
  return lines.join("\n");
}

// R16-видимость квоты в точке трат (критика wf_35f46603): usage в каждом ответе.
async function _usage(userId) {
  try {
    const u = await agentRepo.usageToday(userId);
    return { user_llm_calls: u.user_llm_calls, limit: planner.limits().perUserDaily };
  } catch (_) { return null; }
}

// Полный сценарий: ядро → (опц.) LLM-формулировка под pre-call reserve → persist в
// agent_explanations (facts_used-провенанс ОБЯЗАТЕЛЕН — объяснение без провенанса
// не создаётся вовсе, §7).
async function explain(ctx, { text_key, order_index, source, work_id } = {}) {
  const profile = await agentRepo.getProfile(ctx.userId);
  const language = (profile && profile.language) || "ru";

  const core = await buildExplainCore(ctx, { text_key, order_index, source, work_id });
  if (!core.ok) return core;   // consent/anchor-ошибки наружу — endpoint мапит на 403/404

  // PAS-A1 same-day dedupe (ТОЛЬКО корпус — личный путь не трогаем, его гейты держат
  // прежний контракт): повторный тап того же предложения сегодня = ответ из истории,
  // БЕЗ нового reserve (R16 — критика: re-tap в потоке чтения жёг вызов). Проверяется
  // ПОСЛЕ ядра: якорь провалидирован реальным путём (иначе кэш-хит маскировал бы
  // traversal/404 — поймано гейтом), а LLM-reserve всё равно не тратится.
  if (core.source === "corpus") {
    const cached = await agentRepo.getFreshExplanation(ctx.userId,
      core.anchor.text_key + "#" + core.anchor.order_index, { language });
    if (cached) {
      return {
        ok: true, from_history: true, scope_level: SCOPE_SENTENCE_ONLY, category: CATEGORY,
        source: "corpus", ...(core.work ? { work: core.work } : {}), language,
        anchor: core.anchor, sentence: core.sentence,
        text: cached.text, llm_used: cached.llm_used,
        ...(cached.provider ? { provider: cached.provider, model: cached.model } : {}),
        explanation_id: cached.id,
        usage: await _usage(ctx.userId),
      };
    }
  }

  let text = null, llmUsed = false, degradedReason = null, provider = null, model = null;
  const lim = planner.limits();
  const reserve = llm.killSwitchOn()
    ? { ok: false, reason: "KILL_SWITCH" }
    : await agentRepo.reserveLlmCall(ctx.userId, {
        scenario: "explain", provider: llm.providerName(), perUserDaily: lim.perUserDaily, globalDaily: lim.globalDaily,
      });
  if (!reserve.ok) {
    degradedReason = reserve.reason;
  } else {
    // Класс D: prompt собирается, отправляется и НЕ персистится/НЕ логируется.
    // В пакет уходит РОВНО scope sentence_only: одно предложение + перевод + резолвер-
    // морфология + идентификаторы слабостей. Названия текста в пакете НЕТ.
    const promptPayload = {
      language,
      sentence: core.sentence.he_niqqud || core.sentence.he,
      translation: core.sentence.ru || null,
      morphology: core.morphology.map((m) => ({
        surface: m.surface, lemma: m.lemma, root: m.root, binyan: m.binyan, pos: m.pos,
        meaning: m.meaning, ambiguous: m.ambiguous || undefined,
      })),
      learner: {
        due_lemmas: core.morphology.filter((m) => core.learner.due_in_sentence.includes(m.item_key)).map((m) => m.lemma || m.surface),
        weak_lemmas: core.morphology.filter((m) => core.learner.weak_in_sentence.some((w) => w.item_key === m.item_key)).map((m) => m.lemma || m.surface),
        production_gap_lemmas: core.morphology.filter((m) => core.learner.production_gap.includes(m.item_key)).map((m) => m.lemma || m.surface),
        // P6.4: LLM получает ТОЛЬКО человекочитаемые названия конструкций — не ids
        // (идентификаторы назначены сервером до вызова и никогда не парсятся из ответа LLM).
        constructs: (core.constructs || []).map((c) => constructs.title(c.id, language)).filter(Boolean),
      },
    };
    const out = await llm.generate({
      system: (language === "en"
        ? "You are the LinguistPro Hebrew mentor. Explain the given Hebrew sentence to the learner in 3-6 short, warm English sentences: what it says, how the key words work, and what to pay attention to. Use ONLY the facts in the JSON. The morphology (roots, binyanim, parts of speech) is already asserted by the resolver — never contradict or invent it; if a word is marked ambiguous, present its reading as one possibility. Emphasize the learner's weak/due words if any are present. Output PLAIN PROSE ONLY: no backticks, no braces, no JSON, no field names — just natural sentences."
        : "Ты — наставник LinguistPro по ивриту. Объясни данное ивритское предложение ученику 3–6 короткими тёплыми фразами по-русски: о чём оно, как устроены ключевые слова, на что обратить внимание. Используй ТОЛЬКО факты из JSON. Морфология (корни, биньяны, части речи) уже определена резолвером — не противоречь ей и не выдумывай новой; слово с пометкой ambiguous подавай как одну из возможностей, не как вердикт. Если есть слабые/просроченные слова — сделай акцент на них. Пиши ТОЛЬКО обычным текстом: без обратных кавычек, фигурных скобок, JSON и имён полей — только естественные предложения."),
      prompt: JSON.stringify(promptPayload),
      maxOutputTokens: 512,
    });
    await agentRepo.finalizeLlmCall(reserve.reserveId, { ok: out.ok, actualUnits: out.ok ? (out.output_tokens || 1) : null });
    if (out.ok && planner.isCleanProse(out.text)) { text = out.text; llmUsed = true; provider = out.provider; model = out.model; }
    else if (out.ok) degradedReason = "LLM_OUTPUT_INVALID";
    else degradedReason = out.error;
  }
  if (!text) text = fallbackText(core, language);

  // §7 facts_used — replayable provenance: КАЖДЫЙ факт с источником и asserted/derived-
  // статусом (R9). Первый факт несёт scope_level + якорь — по нему гейт доказывает, что
  // конкретное объяснение не выходило за sentence_only.
  const factsUsed = [
    core.source === "corpus"
      ? {
          // PAS-A1: общий артефакт — provenance различает corpus от личного (R9); purge
          // на revoke agent_read_texts эту строку ЩАДИТ (consent к ней не относился).
          kind: "corpus_sentence", source: "corpus_artifact", license: "public-domain",
          scope_level: SCOPE_SENTENCE_ONLY, anchor: core.anchor, text: core.sentence.he,
        }
      : {
          kind: "user_sentence", source: "consented_artifact", scope_level: SCOPE_SENTENCE_ONLY,
          anchor: core.anchor, text: core.sentence.he,
        },
    ...(core.sentence.ru ? [{ kind: "translation", source: core.source === "corpus" ? "corpus_translation" : "studio_translation", provenance: "derived", text: core.sentence.ru }] : []),
    {
      kind: "morphology", source: "resolver", provenance: "asserted",
      resolver: core.resolver, items: core.morphology,
    },
    {
      kind: "learner_state", source: "learner_graph",
      due_in_sentence: core.learner.due_in_sentence,
      weak_in_sentence: core.learner.weak_in_sentence,
      production_gap: core.learner.production_gap,
    },
    // P6.4: ids строго из реестра (filterKnown — структурная гарантия, что ни LLM,
    // ни баг не запишут выдуманный construct_id в провенанс).
    ...(core.constructs && core.constructs.length ? [{
      kind: "constructs", source: "construct_registry", provenance: "derived",
      items: core.constructs
        .filter((c) => constructs.filterKnown([c.id]).length)
        .map((c) => ({ id: c.id, kind: c.kind, evidence_item_keys: c.evidence_item_keys })),
    }] : []),
  ];
  const created = await tools.callTool(ctx, "create_explanation", {
    sentence_id: core.anchor.text_key + "#" + core.anchor.order_index,
    facts_used: factsUsed,
    llm_model: llmUsed ? (provider + ":" + model) : null,
    body: {
      scope_level: SCOPE_SENTENCE_ONLY, category: CATEGORY, language,
      source: core.source,
      llm_used: llmUsed, ...(provider ? { provider, model } : {}),
      ...(degradedReason ? { degraded_reason: degradedReason } : {}),
      text,
    },
  });

  return {
    ok: true,
    scope_level: SCOPE_SENTENCE_ONLY,
    category: CATEGORY,
    source: core.source,
    ...(core.work ? { work: core.work } : {}),
    usage: await _usage(ctx.userId),
    anchor: core.anchor,
    sentence: core.sentence,
    morphology: core.morphology,
    learner: core.learner,
    constructs: (core.constructs || []).map((c) => ({
      id: c.id, kind: c.kind, title: constructs.title(c.id, language), evidence_item_keys: c.evidence_item_keys,
    })),
    text,
    language,
    llm_used: llmUsed,
    ...(provider ? { provider, model } : {}),
    ...(degradedReason ? { degraded_reason: degradedReason } : {}),
    explanation_id: created.ok && created.result ? created.result.id : null,
  };
}

module.exports = { explain, buildExplainCore, SCOPE_SENTENCE_ONLY };
