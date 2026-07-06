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
const LC = require(path.join(__dirname, "..", "public", "js", "lemma-canon.js"));

const HEB_ANY_RE = /[֐-׿]/;
const CHANNEL_RE = /^(read|listen):[a-z0-9_-]{1,20}$/;
const PRODUCTION_RE = /^(dictate|reverse)(:|$)/;
const MAX_ANSWER_CHARS = 400;
const ANNUL_WINDOW_MS = 24 * 3600 * 1000;

const GRADE_ARGS = new Set(["item_key", "answer", "skipped", "channel", "attempt_id"]);
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
  if (PRODUCTION_RE.test(channel)) return err("PRODUCTION_CHANNEL_LOCKED");  // до P7.2 shown-vs-graded (спека v2 п.3)
  if (!CHANNEL_RE.test(channel)) return err("BAD_CHANNEL");
  if (rawAnswer.length > MAX_ANSWER_CHARS) return err("ANSWER_TOO_LONG");
  const attemptId = String(a.attempt_id || "").trim();
  if (attemptId.length < 8 || attemptId.length > 64) return err("BAD_ATTEMPT_ID");

  // R17-B: агент не минтит новые учебные единицы через грейд — item обязан существовать.
  const rows = itemKey ? await learnerLogRepo.itemRows(ctx.userId, itemKey) : [];
  if (!rows.length) return err("UNKNOWN_ITEM");

  // expected — ТОЛЬКО серверной стороны; нерезолвимость проверяем сами (displayForItemKey
  // честно фолбэчит СЫРЫМ ключом). Применяется и к skip: нерезолвимый item не мог быть
  // показан → «не знаю» по нему не факт.
  const display = await keyingService.displayForItemKey(itemKey);
  if (!display || display === itemKey || !HEB_ANY_RE.test(display)) return err("EXPECTED_UNRESOLVED");

  const prevState = projectionToPrevState(await learnerProjectionRepo.getProjection(ctx.userId, itemKey));
  const verdict = grader.gradeAnswer({
    expected: { form: display, item_key: itemKey },
    answer: rawAnswer, channel, prevState, rows, skipped,
  });

  // MNAR: не-ответ ≠ провал — не пишем ничего; вердикт/фидбек уходят вызывателю.
  if (verdict.gradable !== true) {
    return { ok: true, recorded: false, decision: verdict.decision, reason: verdict.provenance.reason,
             provenance: verdict.provenance, feedback: verdict.feedback || null };
  }
  // Write-gate v1 (адъюдикация BLOCKER-критики): ktiv-кандидат не пишется — грейдер НЕ
  // меняется (gold цел), но ложный lapse от честного male-ввода в append-only лог не минтится.
  if (verdict.provenance.reason === "ktiv-candidate") {
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
  const row = {
    id: null, item_key: itemKey, kind: verdict.decision === "skip" ? "skip" : "review",
    reviewed_at: new Date().toISOString(),   // учебное время = момент грейда; клиентскому не доверяем
    grade: verdict.grade, source: "agent:review", channel,
    meta_json: JSON.stringify(meta),
  };
  row.id = LC.reviewId(row);

  const w = await _ingestOne(ctx, "agentrev:" + attemptId, row, itemKey);
  if (w.fail) return w.fail;
  return {
    ok: true, recorded: true,
    ...(w.replayed ? { replayed: true } : {}),
    ...(w.dup ? { dup: true } : {}),
    decision: verdict.decision, grade: verdict.grade,
    row_id: w.replayed ? null : row.id, item_key: itemKey,
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
