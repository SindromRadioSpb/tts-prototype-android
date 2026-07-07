"use strict";

// db/agentChallengeRepo.js — CLG-P7.2a challenge-binding state (TELEGRAM_P7_2_REVIEW_SPEC v3).
// Единственный писатель agent_challenges / tg_stimulus_exposure. Инварианты:
//   • single-use через recoverable processing-состояние (owner §решение-8): txnLock НЕРЕЕНТРАНТЕН
//     (ingestBatch держит свой withTxnLock), поэтому «claim+ingest в одной txn» = дедлок → вместо
//     этого атомарный single-statement claim active→processing (резерв против конкурентного
//     ответа), затем ingest (своя txn, детерминированный id 'chrev:' идемпотентен), затем
//     processing→completed. MNAR/синоним/ktiv → release processing→active (не сжигает challenge —
//     owner «claim только на write-ветке»). Крэш в processing → восстановим (id детерминирован);
//     'completed' ставится ТОЛЬКО после успешного ingest → completed невозможен без review.
//   • claimed_attempt_id связывает production-unlock с КОНКРЕТНЫМ ответом (reviewer сверяет).
//   • partial-unique (user_id) WHERE status IN active/processing — один незакрытый challenge.
//   • сырой ответ пользователя ЗДЕСЬ не хранится (privacy=A) — только item_key/глосс/провенанс.

const crypto = require("crypto");
const { getDb } = require("./sqlite");

function dbGet(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbAll(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbRun(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { (e ? rej(e) : res(this)); })); }

function nowIso() { return new Date().toISOString(); }
function rndId(prefix, bytes = 16) { return prefix + crypto.randomBytes(bytes).toString("hex"); }

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const EXPOSURE_COOLDOWN_MS = 30 * 60 * 1000;
const EXPOSURE_TTL_MS = 45 * 60 * 1000;

// ── создание (§2 selectReverseChallenge вызывает после eligibility) ────────────
// caps = { userId, tgUserId, tgChatId, item_key, review_mode, prompt_kind, expected_form_id,
//          sense_id, shown_stimulus, stimulus_source, stimulus_source_version,
//          stimulus_privacy_class, stimulus_hash, accepted_alts (array), evidence_scope }
// partial-unique ловит конкурентный /review → возврат существующего активного (идемпотентно).
async function createChallenge(caps) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const existing = await getOpenForUser(caps.userId);
  if (existing) return { created: false, challenge: existing };
  const id = rndId("ch_");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  try {
    await dbRun(db,
      `INSERT INTO agent_challenges
        (challenge_id, user_id, telegram_user_id, telegram_chat_id, item_key, review_mode,
         prompt_kind, evidence_scope, expected_form_id, sense_id, shown_stimulus, stimulus_source,
         stimulus_source_version, stimulus_privacy_class, stimulus_hash, accepted_alts_json, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, caps.userId, String(caps.tgUserId), String(caps.tgChatId), caps.item_key,
       caps.review_mode, caps.prompt_kind || "reverse", caps.evidence_scope || "lexeme",
       caps.expected_form_id || null, caps.sense_id || null, caps.shown_stimulus || null,
       caps.stimulus_source || null, caps.stimulus_source_version || null,
       caps.stimulus_privacy_class || null, caps.stimulus_hash || null,
       JSON.stringify(caps.accepted_alts || []), expiresAt]);
  } catch (e) {
    // гонка конкурентного /review на partial-unique → вернуть существующий
    if (String(e && e.message).includes("UNIQUE")) {
      const ex = await getOpenForUser(caps.userId);
      if (ex) return { created: false, challenge: ex };
    }
    throw e;
  }
  return { created: true, challenge: await getById(db, id) };
}

async function getById(db, id) {
  return (await dbGet(db, `SELECT * FROM agent_challenges WHERE challenge_id = ?`, [id])) || null;
}
async function getOpenForUser(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db,
    `SELECT * FROM agent_challenges WHERE user_id = ? AND status IN ('active','processing')
     ORDER BY created_at DESC LIMIT 1`, [userId])) || null;
}
// активный challenge по telegram-идентити (для submitAnswer резолва)
async function getActiveForTg(userId, tgUserId, tgChatId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db,
    `SELECT * FROM agent_challenges WHERE user_id = ? AND telegram_user_id = ? AND telegram_chat_id = ?
       AND status IN ('active','processing') ORDER BY created_at DESC LIMIT 1`,
    [userId, String(tgUserId), String(tgChatId)])) || null;
}
// для reviewer (user-scoped по challenge_id)
async function getForReviewer(userId, challengeId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db, `SELECT * FROM agent_challenges WHERE user_id = ? AND challenge_id = ?`,
    [userId, String(challengeId)])) || null;
}

// ── single-use lifecycle (атомарные single-statement UPDATE — без txnLock) ──────
// claim: active/processing → processing (attempt перезаписывается). Разрешаем re-claim ЛЮБОГО
// processing (не только тем же attempt) — крэш phase-2 после claim, до complete, оставляет
// processing; свежий ответ (новый, не задедупленный update) должен доиграть застрявший challenge,
// а не упереться в него до TTL (критика: recovery под phase-1 dedup). Write идемпотентен по
// детерминированному chrev-id, поэтому повторная запись безопасна. single-use держится тем, что
// completed/declined/cancelled/expired СЮДА не попадают → завершённый challenge не пере-захватить.
async function claimForAttempt(userId, challengeId, attemptId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db,
    `UPDATE agent_challenges SET status='processing', claimed_attempt_id=?
       WHERE challenge_id=? AND user_id=? AND expires_at > ? AND status IN ('active','processing')`,
    [attemptId, String(challengeId), userId, nowIso()]);
  return r.changes === 1;
}
async function complete(userId, challengeId, attemptId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db,
    `UPDATE agent_challenges SET status='completed', completed_at=?
       WHERE challenge_id=? AND user_id=? AND status='processing' AND claimed_attempt_id=?`,
    [nowIso(), String(challengeId), userId, attemptId]);
  return r.changes === 1;
}
// MNAR/синоним/ktiv/flag-off → вернуть в active (не сжигать challenge — owner «claim на write-ветке»)
async function release(userId, challengeId, attemptId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  await dbRun(db,
    `UPDATE agent_challenges SET status='active', claimed_attempt_id=NULL
       WHERE challenge_id=? AND user_id=? AND status='processing' AND claimed_attempt_id=?`,
    [String(challengeId), userId, attemptId]);
}
// «Не сейчас» — закрыть без grade
async function decline(userId, challengeId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db,
    `UPDATE agent_challenges SET status='declined', completed_at=? WHERE challenge_id=? AND user_id=?
       AND status IN ('active','processing')`, [nowIso(), String(challengeId), userId]);
  return r.changes === 1;
}
async function setPromptMessageId(challengeId, messageId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  await dbRun(db, `UPDATE agent_challenges SET telegram_prompt_message_id=? WHERE challenge_id=?`,
    [messageId != null ? Number(messageId) : null, String(challengeId)]);
}

// consent revoke / unlink → гасим незакрытые challenges (§8)
async function cancelOpenForUser(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db,
    `UPDATE agent_challenges SET status='cancelled', completed_at=? WHERE user_id=? AND status IN ('active','processing')`,
    [nowIso(), userId]);
  return r.changes;
}

// ── exposure cooldown (§решение-7; БЕЗ сырого текста) ──────────────────────────
async function recordExposure(userId, itemKey, kind) {
  const db = getDb(); if (!db) return;
  try { await dbRun(db, `INSERT INTO tg_stimulus_exposure (user_id, item_key, exposure_kind) VALUES (?,?,?)`,
    [userId, String(itemKey), String(kind)]); } catch (_) {}
}
async function recentlyExposed(userId, itemKey) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const cutoff = new Date(Date.now() - EXPOSURE_COOLDOWN_MS).toISOString();
  const r = await dbGet(db,
    `SELECT 1 x FROM tg_stimulus_exposure WHERE user_id=? AND item_key=? AND shown_at >= ? LIMIT 1`,
    [userId, String(itemKey), cutoff]);
  return !!r;
}

// ── prune (TTL-триггер) ────────────────────────────────────────────────────────
async function pruneOld() {
  const db = getDb(); if (!db) return { challenges: 0, exposure: 0 };
  let challenges = 0, exposure = 0;
  try {
    challenges = (await dbRun(db,
      `UPDATE agent_challenges SET status='expired' WHERE status IN ('active','processing') AND expires_at < ?`,
      [nowIso()])).changes;
  } catch (_) {}
  try {
    exposure = (await dbRun(db, `DELETE FROM tg_stimulus_exposure WHERE shown_at < ?`,
      [new Date(Date.now() - EXPOSURE_TTL_MS).toISOString()])).changes;
  } catch (_) {}
  return { challenges, exposure };
}

module.exports = {
  createChallenge, getOpenForUser, getActiveForTg, getForReviewer,
  claimForAttempt, complete, release, decline, setPromptMessageId, cancelOpenForUser,
  recordExposure, recentlyExposed, pruneOld,
  CHALLENGE_TTL_MS, EXPOSURE_COOLDOWN_MS,
};
