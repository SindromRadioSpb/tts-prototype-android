"use strict";

// db/channelLinkRepo.js — CLG-P7.1a Telegram channel state (TELEGRAM_P7_1_PAIRING_SPEC v2).
// Единственный писатель channel_links / channel_pairing_tokens / telegram_updates /
// bot_action_log. Инварианты, которыми владеет этот модуль (адъюдикация критики wf_a67874c5):
//   • многооператорная запись — ТОЛЬКО под withTxnLock (общий sqlite-коннект: иначе nested BEGIN
//     + 500 под конкурентным ingest; identityRepo/learnerLogRepo — тот же паттерн);
//   • двусторонний confirm: deep-link redeem создаёт лишь PENDING; active — только после
//     telegram-side confirmLink (закрывает confused-deputy);
//   • анти-hijack на confirm через partial-unique (active-only) + graceful catch → user-reply;
//   • токен: sha256 хранится, single-use атомарным UPDATE ... WHERE consumed_at IS NULL, TTL;
//   • dedup update_id и его эффект — в ОДНОЙ транзакции (at-least-once честен: сбой → rollback
//     dedup → Telegram переигрывает);
//   • command в лог = ТОЛЬКО глагол (сырой токен никогда); user_id никогда из тела апдейта.

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");

function dbGet(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbAll(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbRun(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { (e ? rej(e) : res(this)); })); }

function nowIso() { return new Date().toISOString(); }
function sha256Hex(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }
function rndId(prefix, bytes = 16) { return prefix + crypto.randomBytes(bytes).toString("hex"); }

const TOKEN_TTL_MS = 15 * 60 * 1000;
const UPDATES_TTL_MS = 48 * 3600 * 1000;
const BOTLOG_TTL_MS = 30 * 24 * 3600 * 1000;

// СЕРВЕРНАЯ версия telegram-consent (критика: клиентская version самоутверждаема). Бамп =
// новое раскрытие → требует re-consent (pair fail-closed на несовпадении, инвалидация связок).
const TELEGRAM_CONSENT_VERSION = "tg-v1";
const TELEGRAM_CONSENT_KEY = "telegram_delivery";

// ── pairing token (web-минт) ──────────────────────────────────────────────────
// Возвращает СЫРОЙ токен вызывателю (для deep-link) — в БД только sha256. Пре-минт
// гасит прежние невыкупленные токены user (одна живая попытка).
async function mintPairingToken(userId, sessionId, channel = "telegram") {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const raw = crypto.randomBytes(24).toString("hex");   // 192 бита
  const tokenHash = sha256Hex(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await withTxnLock(async () => {
    await dbRun(db, `BEGIN IMMEDIATE`);
    try {
      await dbRun(db, `UPDATE channel_pairing_tokens SET consumed_at = ? WHERE user_id = ? AND channel = ? AND consumed_at IS NULL`,
        [nowIso(), userId, channel]);
      await dbRun(db, `INSERT INTO channel_pairing_tokens (token_hash, user_id, channel, session_id, expires_at) VALUES (?,?,?,?,?)`,
        [tokenHash, userId, channel, sessionId || null, expiresAt]);
      await dbRun(db, `COMMIT`);
    } catch (e) { try { await dbRun(db, `ROLLBACK`); } catch (_) {} throw e; }
  });
  return { raw, expiresAt };
}

// ── dedup + redeem (webhook, под ОДНОЙ транзакцией) ───────────────────────────
// dedupUpdate возвращает true если update НОВЫЙ (продолжаем обработку), false если уже виден.
// ВАЖНО: dedup вставляется в ТОЙ ЖЕ транзакции, что и эффект (см. processInTxn) — иначе сбой
// эффекта после отдельного dedup-INSERT потерял бы операцию навсегда (at-most-once).

// Единая транзакция вебхука: dedup + эффект(fn) + bot_action_log. fn получает db и обязан
// бросить при неудаче (→ ROLLBACK, включая dedup-строку). Возвращает { duplicate, result }.
async function processUpdateTxn(updateId, fn) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return await withTxnLock(async () => {
    await dbRun(db, `BEGIN IMMEDIATE`);
    try {
      let duplicate = false;
      if (updateId != null) {
        const r = await dbRun(db, `INSERT OR IGNORE INTO telegram_updates (update_id) VALUES (?)`, [Number(updateId)]);
        if (r.changes === 0) duplicate = true;
      }
      let result = null;
      if (!duplicate) result = await fn(db);
      await dbRun(db, `COMMIT`);
      return { duplicate, result };
    } catch (e) { try { await dbRun(db, `ROLLBACK`); } catch (_) {} throw e; }
  });
}

// redeem внутри processUpdateTxn.fn: атомарно consume токен (single-use) → создать/переписать
// PENDING связку (НЕ active — двусторонность). Возвращает { ok, code?, userId? }.
async function redeemToPending(db, tokenRaw, tgUserId, tgChatId, channel = "telegram") {
  const tokenHash = sha256Hex(tokenRaw);
  // атомарный single-use consume: только если ещё не consumed и не истёк
  const upd = await dbRun(db,
    `UPDATE channel_pairing_tokens SET consumed_at = ?, consumed_by_tg = ?
       WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
    [nowIso(), String(tgUserId), tokenHash, nowIso()]);
  if (upd.changes !== 1) return { ok: false, code: "TOKEN_INVALID" };
  const tok = await dbGet(db, `SELECT user_id FROM channel_pairing_tokens WHERE token_hash = ?`, [tokenHash]);
  const userId = tok && tok.user_id;
  if (!userId) return { ok: false, code: "TOKEN_INVALID" };
  // одна pending на (channel, tg_user): переписываем прежнюю pending этого telegram
  await dbRun(db, `DELETE FROM channel_links WHERE channel = ? AND telegram_user_id = ? AND status = 'pending'`,
    [channel, String(tgUserId)]);
  await dbRun(db,
    `INSERT INTO channel_links (id, user_id, channel, telegram_user_id, telegram_chat_id, status)
     VALUES (?,?,?,?,?,'pending')`,
    [rndId("cl_"), userId, channel, String(tgUserId), tgChatId != null ? String(tgChatId) : null]);
  return { ok: true, userId };
}

// confirmLink внутри processUpdateTxn.fn: telegram-side /confirm → анти-hijack → active.
async function confirmPending(db, tgUserId, consentVersion, channel = "telegram") {
  const pend = await dbGet(db,
    `SELECT id, user_id FROM channel_links WHERE channel = ? AND telegram_user_id = ? AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`, [channel, String(tgUserId)]);
  if (!pend) return { ok: false, code: "NO_PENDING" };
  // анти-hijack (partial-unique active-only ловит гонку, но проверим явно для чистого reply)
  const tgActive = await dbGet(db,
    `SELECT 1 x FROM channel_links WHERE channel = ? AND telegram_user_id = ? AND status = 'active'`,
    [channel, String(tgUserId)]);
  if (tgActive) return { ok: false, code: "TG_ALREADY_LINKED" };
  const userActive = await dbGet(db,
    `SELECT 1 x FROM channel_links WHERE channel = ? AND user_id = ? AND status = 'active'`,
    [channel, pend.user_id]);
  if (userActive) return { ok: false, code: "USER_ALREADY_LINKED" };
  try {
    await dbRun(db,
      `UPDATE channel_links SET status = 'active', confirmed_at = ?, consent_version = ? WHERE id = ?`,
      [nowIso(), consentVersion || null, pend.id]);
  } catch (e) {
    // SQLITE_CONSTRAINT от partial-unique (конкурентный confirm) → graceful, не 500
    if (String(e && e.message).includes("UNIQUE")) return { ok: false, code: "TG_ALREADY_LINKED" };
    throw e;
  }
  return { ok: true, userId: pend.user_id };
}

async function cancelPending(db, tgUserId, channel = "telegram") {
  const r = await dbRun(db, `DELETE FROM channel_links WHERE channel = ? AND telegram_user_id = ? AND status = 'pending'`,
    [channel, String(tgUserId)]);
  return { ok: true, removed: r.changes };
}

// bot-side /unlink: revoke активной связки этого telegram.
async function unlinkByTg(db, tgUserId, channel = "telegram") {
  const r = await dbRun(db,
    `UPDATE channel_links SET status = 'revoked', revoked_at = ? WHERE channel = ? AND telegram_user_id = ? AND status = 'active'`,
    [nowIso(), channel, String(tgUserId)]);
  return { ok: true, revoked: r.changes };
}

async function logBotAction(db, { userId, updateId, chatId, command, status, errorCode, channel = "telegram" }) {
  await dbRun(db,
    `INSERT INTO bot_action_log (user_id, channel, telegram_update_id, telegram_chat_id, command, status, error_code)
     VALUES (?,?,?,?,?,?,?)`,
    [userId || null, channel, updateId != null ? Number(updateId) : null, chatId != null ? String(chatId) : null,
     command || null, status || null, errorCode || null]);
  if (userId && updateId != null) {
    await dbRun(db, `UPDATE channel_links SET last_update_id = ? WHERE user_id = ? AND channel = ? AND status = 'active'`,
      [Number(updateId), userId, channel]);
  }
}

// ── read helpers (не под транзакцией — single SELECT) ─────────────────────────
async function getActiveLinkByTg(tgUserId, channel = "telegram") {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db,
    `SELECT * FROM channel_links WHERE channel = ? AND telegram_user_id = ? AND status = 'active'`,
    [channel, String(tgUserId)])) || null;
}
async function getLinkForUser(userId, channel = "telegram") {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db,
    `SELECT * FROM channel_links WHERE user_id = ? AND channel = ? AND status IN ('active','pending')
     ORDER BY (status='active') DESC, created_at DESC LIMIT 1`, [userId, channel])) || null;
}

// ── web-side unlink (session) ────────────────────────────────────────────────
async function unlinkByUser(userId, channel = "telegram") {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return await withTxnLock(async () => {
    await dbRun(db, `BEGIN IMMEDIATE`);
    try {
      const r = await dbRun(db,
        `UPDATE channel_links SET status='revoked', revoked_at=? WHERE user_id=? AND channel=? AND status IN ('active','pending')`,
        [nowIso(), userId, channel]);
      await dbRun(db, `COMMIT`);
      return { ok: true, revoked: r.changes };
    } catch (e) { try { await dbRun(db, `ROLLBACK`); } catch (_) {} throw e; }
  });
}

// ── consent-revoke атомарный каскад (одна транзакция: связки + токены) ─────────
// Вызывается consent-эндпоинтом ПОД тем же логическим revoke. Провал → бросок → revoke НЕ
// подтверждается (honest-fail, fix fail-open «связка переживает revoke»).
async function revokeTelegramCascade(userId, channel = "telegram") {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return await withTxnLock(async () => {
    await dbRun(db, `BEGIN IMMEDIATE`);
    try {
      const links = await dbRun(db,
        `UPDATE channel_links SET status='revoked', revoked_at=? WHERE user_id=? AND channel=? AND status IN ('active','pending')`,
        [nowIso(), userId, channel]);
      const toks = await dbRun(db,
        `UPDATE channel_pairing_tokens SET consumed_at=? WHERE user_id=? AND channel=? AND consumed_at IS NULL`,
        [nowIso(), userId, channel]);
      await dbRun(db, `COMMIT`);
      return { ok: true, links: links.changes, tokens: toks.changes };
    } catch (e) { try { await dbRun(db, `ROLLBACK`); } catch (_) {} throw e; }
  });
}

// ── delete-completeness (вызывается ДО user_id-sweep identityRepo, в ЕГО транзакции нельзя —
// поэтому отдельный вызов ДО deleteUserData): собирает telegram_chat_id связок и чистит
// NULL-user bot_action_log с этими chat_id (иначе PII непривязанного чата пережила бы delete).
async function purgeTelegramTraceForUser(userId, channel = "telegram") {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT DISTINCT telegram_chat_id FROM channel_links WHERE user_id=? AND telegram_chat_id IS NOT NULL`, [userId]);
  const chatIds = (rows || []).map((r) => String(r.telegram_chat_id)).filter(Boolean);
  if (!chatIds.length) return { purged: 0 };
  const placeholders = chatIds.map(() => "?").join(",");
  const r = await dbRun(db, `DELETE FROM bot_action_log WHERE telegram_chat_id IN (${placeholders})`, chatIds);
  return { purged: r.changes };
}

// ── prune (TTL-триггер из setInterval) ────────────────────────────────────────
async function pruneOld() {
  const db = getDb(); if (!db) return { updates: 0, botlog: 0 };
  const upCutoff = new Date(Date.now() - UPDATES_TTL_MS).toISOString();
  const logCutoff = new Date(Date.now() - BOTLOG_TTL_MS).toISOString();
  let updates = 0, botlog = 0;
  try { updates = (await dbRun(db, `DELETE FROM telegram_updates WHERE received_at < ?`, [upCutoff])).changes; } catch (_) {}
  // только непривязанные (user_id NULL) старые строки — привязанные держим до delete аккаунта
  try { botlog = (await dbRun(db, `DELETE FROM bot_action_log WHERE user_id IS NULL AND created_at < ?`, [logCutoff])).changes; } catch (_) {}
  return { updates, botlog };
}

// db-параметрический lookup (для чтения ВНУТРИ webhook-транзакции — видит uncommitted писанину
// той же связки; тот же коннект, отдельный SELECT не нестит BEGIN).
async function displayNameForUser(db, userId) {
  const u = await dbGet(db, `SELECT display_name, id FROM users WHERE id = ?`, [userId]);
  if (!u) return "аккаунт";
  return String(u.display_name || ("аккаунт " + String(u.id).slice(0, 10) + "…"));
}
async function activeLinkByTgTxn(db, tgUserId, channel = "telegram") {
  return (await dbGet(db, `SELECT * FROM channel_links WHERE channel=? AND telegram_user_id=? AND status='active'`,
    [channel, String(tgUserId)])) || null;
}

module.exports = {
  mintPairingToken, processUpdateTxn, redeemToPending, confirmPending, cancelPending,
  unlinkByTg, unlinkByUser, logBotAction, getActiveLinkByTg, getLinkForUser,
  activeLinkByTgTxn, displayNameForUser,
  revokeTelegramCascade, purgeTelegramTraceForUser, pruneOld, sha256Hex,
  TOKEN_TTL_MS, TELEGRAM_CONSENT_VERSION, TELEGRAM_CONSENT_KEY,
};
