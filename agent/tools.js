"use strict";

// agent/tools.js — CLG-P6 tool router (§7 + §9 «принятый план» 4.3): ЗАКРЫТЫЙ реестр
// инструментов агента. Разрешённая модель: LLM → tool router → инструменты →
// Learner Graph API / artifacts / keying / review ingest. LLM никогда не получает
// прямой доступ к БД и никогда сам не решает, что пользователь знает.
//
// R14/B2: user_id НЕ параметр инструмента — только ctx из authenticated principal;
// user_id в аргументах = жёсткий reject (даже совпадающий с принципалом).
//
// §13.4-шов: обработчики зовут серверные репозитории (main-процесс = единственный
// писатель SQLite). При выделении agent-сервиса в отдельный контейнер обработчики
// заменяются HTTP-клиентами Cloud API — сигнатуры инструментов не меняются.
//
// Стадирование (§9-план 4.8): гейты record_review_answer ПРОЙДЕНЫ (deterministic-first ·
// D1 · провенанс · gold · annul · MNAR · down-sync = P7.0a/b/c) — инструмент включается
// feature-флагом AGENT_REVIEW_WRITE=1 (прод: OFF до решения владельца; reason
// FEATURE_FLAG_OFF честно отличим от прежнего GATED_UNTIL_GRADER_GATES).
// synthesize_audio — SKELETON до TTS-лимитов.

const path = require("path");
const learnerGraphRepo = require(path.join(__dirname, "..", "db", "learnerGraphRepo"));
const learnerArtifactsRepo = require(path.join(__dirname, "..", "db", "learnerArtifactsRepo"));
const agentSentenceRepo = require(path.join(__dirname, "..", "db", "agentSentenceRepo"));
const corpusSentenceRepo = require(path.join(__dirname, "..", "db", "corpusSentenceRepo"));
const keyingService = require(path.join(__dirname, "..", "db", "keyingService"));
const agentRepo = require(path.join(__dirname, "..", "db", "agentRepo"));
const reviewer = require(path.join(__dirname, "reviewer"));

const REGISTRY = {
  // ── read-only: Learner Graph (CLG-P5) ──────────────────────────────────────
  get_due_words: {
    readOnly: true,
    run: (ctx, a) => learnerGraphRepo.getDue(ctx.userId, { limit: a && a.limit, nowMs: a && a.now_ms }),
  },
  get_known_words: {
    readOnly: true,
    run: (ctx) => learnerGraphRepo.getKnownWords(ctx.userId),
  },
  get_weak_words: {
    readOnly: true,
    run: (ctx, a) => learnerGraphRepo.getWeakWords(ctx.userId, { limit: a && a.limit }),
  },
  get_learner_context: {
    readOnly: true,
    run: (ctx, a) => learnerGraphRepo.getAgentContext(ctx.userId, { nowMs: a && a.now_ms }),
  },
  get_word_lifecycle: {
    readOnly: true,
    run: (ctx, a) => agentRepo.wordLifecycle(ctx.userId, a && a.item_key),
  },
  // P6.4-followup (кейс טוב): свежие провалы за 24ч — сигнал «горит сейчас», который
  // lapses-first срезы хоронят на большом профиле.
  get_recent_struggles: {
    readOnly: true,
    run: (ctx, a) => learnerGraphRepo.getRecentStruggles(ctx.userId, { limit: a && a.limit, minFails: a && a.min_fails }),
  },

  // ── keying (пре-условие №2): минт новых item_key ТОЛЬКО здесь (§7) ─────────
  resolve_item_key: {
    readOnly: true,
    run: (ctx, a) => keyingService.resolveWords((a && (a.words || (a.surface ? [a] : null))) || []),
  },

  // ── артефакты класса B: только при живом consent, только МЕТАДАННЫЕ ────────
  get_user_texts_if_consented: {
    readOnly: true,
    run: async (ctx) => {
      let consented = false;
      try { consented = await learnerArtifactsRepo.hasConsent(ctx.userId); } catch (_) {}
      if (!consented) return { consented: false, texts: [] };
      const rows = await learnerArtifactsRepo.list(ctx.userId);
      // Метаданные, не контент: сервер хранит opaque-бандлы; тела текстов агенту
      // в этом слайсе не отдаются (контент — материал /explain-слайса).
      return { consented: true, texts: (rows || []).map((r) => ({ artifact_key: r.artifact_key, kind: r.kind, updated_at: r.updated_at })) };
    },
  },
  // Решение владельца 2026-07-06 (приватность ДО кода, §15.9): парсинг содержимого
  // артефакта разрешён ТОЛЬКО в db/agentSentenceRepo за ДВОЙНЫМ consent-гейтом
  // (cloud_texts + agent_read_texts, fail-closed на каждый вызов) и ТОЛЬКО в объёме
  // scope_level='sentence_only' — одна строка по якорю, соседи не извлекаются.
  get_sentence_context_if_available: {
    readOnly: true,
    run: (ctx, a) => agentSentenceRepo.getSentenceContext(ctx.userId, {
      text_key: a && a.text_key, order_index: a && a.order_index,
    }),
  },
  // PAS-A3 (решение владельца 2026-07-12): окно ≤5 строк ЛИЧНОГО текста — ТОЛЬКО для
  // проверки понимания; scope sentence_window_5, тот же двойной consent в репо (fail-closed).
  get_sentence_window_if_available: {
    readOnly: true,
    run: (ctx, a) => agentSentenceRepo.getSentenceWindow(ctx.userId, {
      text_key: a && a.text_key, order_index: a && a.order_index, window: a && a.window,
    }),
  },
  // ── ОБЩИЙ артефакт (PAS-A1): предложение public-domain корпуса — consent-гейта нет
  // by-design (содержимое не является данными пользователя; learner-раскрытие — в
  // first-use confirm клиента). Якорь несёт text_key: многоглавные работы делят один
  // work_id, выбор текста строго по ключу (спека v2 после критики wf_35f46603).
  get_corpus_sentence_context: {
    readOnly: true,
    run: (ctx, a) => corpusSentenceRepo.getCorpusSentenceContext({
      corpus: a && a.corpus, work_id: a && a.work_id,
      text_key: a && a.text_key, order_index: a && a.order_index,
    }),
  },

  // ── writeback: только идентификаторы классов A/B, никогда контент C ────────
  create_agent_task: {
    readOnly: false,
    run: (ctx, a) => agentRepo.createTask(ctx.userId, { kind: a && a.kind, payload: a && a.payload }),
  },
  create_explanation: {
    readOnly: false,
    run: (ctx, a) => agentRepo.createExplanation(ctx.userId, a || {}),
  },

  // ── writeback в review_log (P7.0c): единственный писатель памяти из агента ──
  // Флаг проверяется ПРИ КАЖДОМ вызове (не при require) — гейт бутит on/off-матрицу.
  record_review_answer: {
    readOnly: false,
    disabled: () => (reviewer.flagOn() ? null : "FEATURE_FLAG_OFF"),
    run: (ctx, a) => reviewer.record(ctx, a),
  },
  // ── SKELETON (§9-план 4.8): активация по гейтам, не в этом слайсе ──────────
  synthesize_audio: {
    disabled: "GATED_UNTIL_TTS_LIMITS",     // §7 max TTS chars/day + ledger kind='tts_chars'
  },
};

// disabled может быть строкой (статический skeleton) или функцией (feature-flag).
function _disabledReason(t) {
  return typeof t.disabled === "function" ? t.disabled() : (t.disabled || null);
}

function listTools() {
  return Object.keys(REGISTRY).map((name) => {
    const reason = _disabledReason(REGISTRY[name]);
    return { name, enabled: !reason, ...(reason ? { disabled_reason: reason } : {}) };
  });
}

// Единственная точка вызова инструмента. ctx = { userId, deviceId } из принципала.
async function callTool(ctx, name, args) {
  if (!ctx || !ctx.userId) throw new Error("NO_PRINCIPAL");
  if (args && typeof args === "object" && ("user_id" in args || "userId" in args)) {
    // B2: даже СОВПАДАЮЩИЙ user_id в аргументах — reject, не молчаливый remap.
    return { ok: false, error: "USER_ID_IN_ARGS" };
  }
  const t = REGISTRY[name];
  if (!t) return { ok: false, error: "UNKNOWN_TOOL" };
  const disabledReason = _disabledReason(t);
  if (disabledReason) return { ok: false, error: "TOOL_DISABLED", reason: disabledReason };
  try {
    return { ok: true, result: await t.run(ctx, args || {}) };
  } catch (e) {
    return { ok: false, error: "TOOL_FAILED", message: String((e && e.message) || e).slice(0, 120) };
  }
}

module.exports = { callTool, listTools };
