"use strict";

// agent/reviewer.js — P7.0c: активация record_review_answer (роль reviewer из §9-скелета;
// спека v2 = TELEGRAM_P7_DECISION_2026_07_06.md §P7.0c после adversarial-критики
// wf_28ac3c6e). ПЕРВЫЙ пишущий инструмент агента в review_log — append-only истину
// о памяти слов. Инварианты, которыми владеет этот модуль:
//
//   • грейд/провенанс — ТОЛЬКО из agent/grader.js (детерминированный судья; LLM здесь
//     структурно недостижим — тот же гейт-ассерт по исходнику, что у grader);
//   • MNAR: empty/unsupported → НИЧЕГО не пишется; + write-gate v1 на
//     reason='ktiv-candidate' — expected сервера = хасер display-форма, честный
//     ktiv-male ввод грейдился бы ложным lapse НАВСЕГДА (Зал в этой ситуации принимает
//     male-поверхность вхождения, которой у сервера v1 нет) → честное воздержание;
//   • channel v1 = ТОЛЬКО рецептивные семьи (read/listen): v1-упражнение = продукция
//     display-леммы, которую /plan сам отдаёт вызывателю — запись dictate/reverse-успеха
//     включала бы hasProductionSuccess НАВСЕГДА (lemma-echo, закрытый P7.0b);
//     production-каналы разблокирует P7.2 challenge-binding (shown-vs-graded);
//   • идемпотентность попытки: ОБЯЗАТЕЛЬНЫЙ attempt_id → idempotency_key
//     'agentrev:'+attempt_id (ретрай/redelivery реплеит результат, не вторую строку);
//   • annul-минтер (контракт P7.0a 1-бис): цель резолвится сервером по (user_id,
//     annul_of); annul.item_key = item_key ЦЕЛИ; id = LemmaCanon.annulId; ТОЛЬКО
//     собственные agent:-строки, ТОЛЬКО review/skip, НЕ sent:, окно 24ч, reason
//     обязателен (безлимитный ластик без причины = селективная инфляция памяти);
//   • запись через ШТАТНЫЙ ingest (learnerLogRepo.ingestBatch, trustedAgentSource) +
//     БЕЗУСЛОВНЫЙ recomputeForKeys — и на live-, и на replayed-ветке (new_item_keys
//     не персистится в batch-результате: крэш между COMMIT и recompute + ретрай
//     навсегда оставлял бы stale-проекцию);
//   • «тихий 0» невозможен: recorded:true только при new==1 / dup==1 / replayed;
//   • контрактные реджекты ВОЗВРАЩАЮТСЯ {ok:false,error} (не бросаются — callTool
//     сплющил бы коды в TOOL_FAILED); сырой ответ НЕ персистится и НЕ логируется.
//
// Прямого SQLite нет — только db/learnerLogRepo + db/learnerProjectionRepo +
// db/keyingService (шов §13.4 сохранён).

const path = require("path");
const grader = require(path.join(__dirname, "grader"));
const learnerLogRepo = require(path.join(__dirname, "..", "db", "learnerLogRepo"));
const learnerProjectionRepo = require(path.join(__dirname, "..", "db", "learnerProjectionRepo"));
const keyingService = require(path.join(__dirname, "..", "db", "keyingService"));
const agentChallengeRepo = require(path.join(__dirname, "..", "db", "agentChallengeRepo"));
const LC = require(path.join(__dirname, "..", "public", "js", "lemma-canon.js"));

const HEB_ANY_RE = /[֐-׿]/;
const CHANNEL_RE = /^(read|listen):[a-z0-9_-]{1,20}$/;
const PRODUCTION_RE = /^(dictate|reverse)(:|$)/;
// P7.2a: production-канал(ы), которые challenge-binding РАЗБЛОКИРУЕТ (только reverse:tg в MVP).
const CHALLENGE_CHANNEL_RE = /^reverse:tg$/;
const MAX_ANSWER_CHARS = 400;
const ANNUL_WINDOW_MS = 24 * 3600 * 1000;

// challenge_id разблокирует production ТОЛЬКО на webhook-trusted пути (ctx.viaTelegramReview);
// HTTP /api/agent/review его стрипает/реджектит (BLOCKER-3) — production там остаётся locked.
const GRADE_ARGS = new Set(["item_key", "answer", "skipped", "channel", "attempt_id", "challenge_id"]);
const ANNUL_ARGS = new Set(["annul_of", "reason"]);

function flagOn() { return process.env.AGENT_REVIEW_WRITE === "1"; }

const err = (code, extra) => Object.assign({ ok: false, error: code }, extra || {});

// prevState-адаптер snake→camel (зафиксированный контракт P7.0b→P7.0c): projection-строка
// несёт reviewed_at (ISO), политика/ядро читают lastReviewedAt (ms). stability/difficulty/
// reps/lapses/due совпадают по именам.
function projectionToPrevState(p) {
  if (!p) return null;
  return {
    stability: p.stability != null ? Number(p.stability) : null,
    difficulty: p.difficulty != null ? Number(p.difficulty) : null,
    reps: Number(p.reps) || 0,
    lapses: Number(p.lapses) || 0,
    due: p.due != null ? p.due : null,
    lastReviewedAt: p.reviewed_at != null ? Date.parse(p.reviewed_at) : null,
  };
}

// Один общий шаг записи: штатный ingest (trusted) + безусловный recompute + анти-«тихий 0».
async function _ingestOne(ctx, idemKey, row, itemKey) {
  const out = await learnerLogRepo.ingestBatch(ctx.userId, ctx.deviceId || null, {
    idempotency_key: idemKey, schema_version: 1, keyer_version: 1, review_log: [row],
  }, { trustedAgentSource: true });
  if (!out || out.ok === false) return { fail: err("ROW_REJECTED", { reason: (out && out.error) || "ingest" }) };
  let recomputeFailed = false;
  try { await learnerProjectionRepo.recomputeForKeys(ctx.userId, [itemKey]); }
  catch (e) { recomputeFailed = true; console.error("[agent-review] projections recompute failed:", e && e.message); }
  const rl = out.review_log || {};
  const replayed = out.replayed === true;
  if (!replayed && Number(rl.new) !== 1 && Number(rl.dup) !== 1) {
    const rej = (out.rejected && out.rejected[0]) || {};
    return { fail: err("ROW_REJECTED", { reason: rej.reason || "unknown" }) };
  }
  return { replayed, dup: !replayed && Number(rl.dup) === 1, recomputeFailed };
}

async function record(ctx, args) {
  const a = args && typeof args === "object" ? args : {};
  const keys = Object.keys(a);
  const unknown = keys.filter((k) => !GRADE_ARGS.has(k) && !ANNUL_ARGS.has(k));
  if (unknown.length) return err("UNKNOWN_ARG", { key: unknown[0] });   // закрытый whitelist: expected/grade/… не существуют
  const annulMode = keys.includes("annul_of");
  if (annulMode && keys.some((k) => GRADE_ARGS.has(k))) return err("AMBIGUOUS_MODE");
  if (!annulMode && keys.includes("reason")) return err("AMBIGUOUS_MODE");   // reason — только annul-режим
  return annulMode ? _annul(ctx, a) : _grade(ctx, a);
}

async function _grade(ctx, a) {
  const itemKey = String(a.item_key || "").trim();
  if (itemKey.indexOf("sent:") === 0) return err("SENT_ITEM_UNSUPPORTED");   // state сент-карт вне recompute-пути (P7.0a scope)
  const skipped = a.skipped === true;
  const rawAnswer = a.answer != null ? String(a.answer) : "";
  if (skipped && rawAnswer.trim()) return err("SKIP_WITH_ANSWER");
  const channel = String(a.channel || "");
  const attemptId = String(a.attempt_id || "").trim();
  if (attemptId.length < 8 || attemptId.length > 64) return err("BAD_ATTEMPT_ID");

  // ── P7.2a challenge-binding: единственный мост к production-записи из Telegram ──
  const challengeId = a.challenge_id != null ? String(a.challenge_id).trim() : "";
  let chal = null;
  if (challengeId) {
    // challenge_id разблокирует production ТОЛЬКО на webhook-trusted пути (submitAnswer).
    // HTTP /api/agent/review сюда challenge_id не пускает (стрип + ctx без флага) — BLOCKER-3.
    if (!ctx || ctx.viaTelegramReview !== true) return err("CHALLENGE_NOT_ALLOWED");
    // Flag-off enforcement НА ПИШУЩЕЙ ГРАНИЦЕ (точка 4): challenge выдан при ON, флаг выключили,
    // ответ пришёл → zero-write, challenge НЕ захвачен (остаётся до TTL). callTool-гейт этот путь
    // не покрывает (submitAnswer зовёт reviewer напрямую), поэтому проверяем здесь.
    if (!flagOn()) return err("FEATURE_FLAG_OFF");
    if (!CHALLENGE_CHANNEL_RE.test(channel)) return err("BAD_CHALLENGE_CHANNEL");
    chal = await agentChallengeRepo.getForReviewer(ctx.userId, challengeId);
    if (!chal) return err("CHALLENGE_NOT_FOUND");
    if (chal.item_key !== itemKey || chal.review_mode !== channel) return err("CHALLENGE_MISMATCH");
    if (chal.status === "completed" || chal.status === "declined" || chal.status === "cancelled" || chal.status === "expired") {
      return err("CHALLENGE_CLOSED", { status: chal.status });
    }
    if (Date.parse(chal.expires_at) <= Date.now()) return err("CHALLENGE_EXPIRED");
    // резервируем challenge (active→processing, или re-claim того же attempt после крэша).
    const claimed = await agentChallengeRepo.claimForAttempt(ctx.userId, challengeId, attemptId);
    if (!claimed) return err("CHALLENGE_CLAIM_FAILED", { status: chal.status });
  } else {
    // рецептивный путь P7.0c — production по-прежнему заперт без challenge.
    if (PRODUCTION_RE.test(channel)) return err("PRODUCTION_CHANNEL_LOCKED");
    if (!CHANNEL_RE.test(channel)) return err("BAD_CHANNEL");
  }
  if (rawAnswer.length > MAX_ANSWER_CHARS) { if (chal) await agentChallengeRepo.release(ctx.userId, challengeId, attemptId); return err("ANSWER_TOO_LONG"); }

  // R17-B: агент не минтит новые учебные единицы через грейд — item обязан существовать.
  const rows = itemKey ? await learnerLogRepo.itemRows(ctx.userId, itemKey) : [];
  if (!rows.length) { if (chal) await agentChallengeRepo.release(ctx.userId, challengeId, attemptId); return err("UNKNOWN_ITEM"); }

  // expected — ТОЛЬКО серверной стороны; нерезолвимость проверяем сами (displayForItemKey
  // честно фолбэчит СЫРЫМ ключом). Применяется и к skip: нерезолвимый item не мог быть
  // показан → «не знаю» по нему не факт.
  const display = await keyingService.displayForItemKey(itemKey);
  if (!display || display === itemKey || !HEB_ANY_RE.test(display)) {
    if (chal) await agentChallengeRepo.release(ctx.userId, challengeId, attemptId);
    return err("EXPECTED_UNRESOLVED");
  }

  const prevState = projectionToPrevState(await learnerProjectionRepo.getProjection(ctx.userId, itemKey));
  const verdict = grader.gradeAnswer({
    expected: { form: display, item_key: itemKey },
    answer: rawAnswer, channel, prevState, rows, skipped,
  });

  // MNAR: не-ответ ≠ провал — не пишем ничего; challenge остаётся active (не сжигаем на не-ответ).
  if (verdict.gradable !== true) {
    if (chal) await agentChallengeRepo.release(ctx.userId, challengeId, attemptId);
    return { ok: true, recorded: false, decision: verdict.decision, reason: verdict.provenance.reason,
             provenance: verdict.provenance, feedback: verdict.feedback || null };
  }
  // Write-gate v1 (адъюдикация BLOCKER-критики): ktiv-кандидат не пишется — грейдер НЕ
  // меняется (gold цел), но ложный lapse от честного male-ввода в append-only лог не минтится.
  if (verdict.provenance.reason === "ktiv-candidate") {
    if (chal) await agentChallengeRepo.release(ctx.userId, challengeId, attemptId);
    return { ok: true, recorded: false, decision: verdict.decision, reason: "ktiv-candidate", ktiv_gate: true,
             provenance: verdict.provenance, feedback: verdict.feedback || null };
  }

  const p = verdict.provenance;
  const meta = {
    keyer_version: LC.KEYER_VERSION,
    grader: "deterministic",
    policy_version: p.policy_version,
    normalizer_version: p.normalizer_version,
    resolver_version: p.resolver_version,
    expected_form_id: p.expected_form_id,
    decision: verdict.decision,
    reason: p.reason,
  };
  if (p.matched_variant) meta.matched_variant = p.matched_variant;
  if (verdict.policy && verdict.policy.applied) {
    meta.raw_grade = 1; meta.grade_policy = verdict.policy.grade_policy;
  }
  // challenge-провенанс: evidence_scope='lexeme' (reverse доказывает лемму, не клетку — §решение-5),
  // sense_id, challenge_id (аудит привязки; все в META_ALLOW). reviewed_at детерминирован по
  // challenge.created_at → chrev-id стабилен по построению (совместим с LC.reviewId; точка 2).
  if (chal) {
    meta.evidence_scope = chal.evidence_scope || "lexeme";
    if (chal.sense_id) meta.sense_id = String(chal.sense_id);
    meta.challenge_id = challengeId;
  }
  const row = {
    id: null, item_key: itemKey, kind: verdict.decision === "skip" ? "skip" : "review",
    reviewed_at: chal ? chal.created_at : new Date().toISOString(),
    grade: verdict.grade, source: "agent:review", channel,
    meta_json: JSON.stringify(meta),
  };
  row.id = LC.reviewId(row);

  const w = await _ingestOne(ctx, "agentrev:" + attemptId, row, itemKey);
  if (w.fail) { if (chal) await agentChallengeRepo.release(ctx.userId, challengeId, attemptId); return w.fail; }
  // review записан → завершаем challenge (completed невозможен без review-события: complete()
  // ставится ТОЛЬКО здесь, после успешного ingest). Крэш до complete → challenge в processing,
  // re-claim тем же attempt на ретрае идемпотентен (chrev-id тот же).
  if (chal) await agentChallengeRepo.complete(ctx.userId, challengeId, attemptId);
  return {
    ok: true, recorded: true,
    ...(w.replayed ? { replayed: true } : {}),
    ...(w.dup ? { dup: true } : {}),
    decision: verdict.decision, grade: verdict.grade,
    row_id: w.replayed ? null : row.id, item_key: itemKey,
    ...(chal ? { challenge_completed: true, evidence_scope: meta.evidence_scope } : {}),
    provenance: p, feedback: verdict.feedback || null,
    ...(w.recomputeFailed ? { projections_recompute_failed: true } : {}),
  };
}

async function _annul(ctx, a) {
  const annulOf = String(a.annul_of || "").trim();
  if (!annulOf) return err("ANNUL_TARGET_NOT_FOUND");
  const reason = String(a.reason || "").trim();
  if (!reason || reason.length > 40) return err("BAD_ANNUL_REASON");
  const target = await learnerLogRepo.getRowById(ctx.userId, annulOf);
  if (!target) return err("ANNUL_TARGET_NOT_FOUND");
  if (target.kind !== "review" && target.kind !== "skip") return err("ANNUL_TARGET_NOT_ANNULLABLE");
  if (String(target.item_key).indexOf("sent:") === 0) return err("ANNUL_SENT_TARGET");
  if (String(target.source || "").indexOf("agent:") !== 0) return err("ANNUL_FOREIGN_SOURCE");   // v1: только свои грейды
  const age = Date.now() - Date.parse(target.reviewed_at);
  if (!Number.isFinite(age) || age > ANNUL_WINDOW_MS) return err("ANNUL_TARGET_TOO_OLD");

  const row = {
    id: LC.annulId(annulOf),   // reviewId для annul ЗАПРЕЩЁН (P7.0a M-4)
    item_key: target.item_key, // item_key ЦЕЛИ — контракт 1-бис
    kind: "annul", reviewed_at: new Date().toISOString(), grade: null,
    source: "agent:correction", channel: null,
    meta_json: JSON.stringify({ keyer_version: LC.KEYER_VERSION, annul_of: annulOf, reason }),
  };
  const w = await _ingestOne(ctx, "agent:" + row.id, row, target.item_key);
  if (w.fail) return w.fail;
  return {
    ok: true, recorded: true,
    ...(w.replayed ? { replayed: true } : {}),
    ...(w.dup ? { dup: true } : {}),
    annulled: annulOf, row_id: row.id, item_key: target.item_key,
    ...(w.recomputeFailed ? { projections_recompute_failed: true } : {}),
  };
}

module.exports = { record, flagOn, projectionToPrevState, MAX_ANSWER_CHARS, ANNUL_WINDOW_MS };
