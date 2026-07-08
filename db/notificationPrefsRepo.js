"use strict";

// db/notificationPrefsRepo.js — CLG-P7.3a единый центр настроек уведомлений наставника (push + бот).
// Отсутствие строки = каноническое поведение по умолчанию (pairing-consent уже покрывает
// «напоминания» → enabled). opt-out = ЯВНЫЙ durable enabled=false / telegram_enabled=false (/stop).
// getPrefs НИКОГДА не бросает при отсутствии строки (→ defaults); при DB-ошибке — бросает, вызыватель
// (sweep) обязан трактовать как FAIL-CLOSED (skip, не слать) — критика wf_f60b0e58.

const { getDb } = require("./sqlite");
const LT = require("./localtime");

function dbGet(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbRun(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { (e ? rej(e) : res(this)); })); }

// Дефолты для юзера БЕЗ строки (не opt-out): всё включено, tz Asia/Jerusalem, утро, тишина 22–8.
function defaults() {
  return {
    enabled: 1, telegram_enabled: 1, timezone: LT.DEFAULT_TZ, window: "morning",
    quiet_start_local: 22, quiet_end_local: 8, _row: false,
  };
}

// Нормализация строки БД в булевы/числа + fallback tz на дефолт (валидация невалидного IANA).
function normalize(row) {
  if (!row) return defaults();
  return {
    enabled: row.enabled == null ? 1 : Number(row.enabled),
    telegram_enabled: row.telegram_enabled == null ? 1 : Number(row.telegram_enabled),
    timezone: LT.safeTz(row.timezone),
    window: row.window === "evening" ? "evening" : "morning",
    quiet_start_local: Number(row.quiet_start_local),
    quiet_end_local: Number(row.quiet_end_local),
    _row: true,
  };
}

// Чтение с дефолтами. DB-ошибка ПРОБРАСЫВАЕТСЯ (fail-closed у sweep). Missing row → defaults (не бросок).
async function getPrefs(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db, `SELECT * FROM notification_preferences WHERE user_id=?`, [String(userId)]);
  return normalize(row);
}

// UPSERT telegram_enabled в ПЕРЕДАННОЙ txn (/stop → 0, /resume → 1). Пишется ВНУТРИ webhook-txn (phase-1)
// → атомарно с dedup: сбой → rollback → Telegram переиграет → opt-out не теряется молча (критика
// wf_858259da MAJOR: phase-2 best-effort глотал бы durable opt-out). db обязателен (in-txn).
async function setTelegramEnabledTxn(db, userId, enabled) {
  if (!db) throw new Error("DB_NOT_AVAILABLE");
  const v = enabled ? 1 : 0;
  await dbRun(db,
    `INSERT INTO notification_preferences (user_id, telegram_enabled, updated_at)
       VALUES (?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(user_id) DO UPDATE SET telegram_enabled=excluded.telegram_enabled, updated_at=excluded.updated_at`,
    [String(userId), v]);
  return { ok: true, telegram_enabled: v };
}

module.exports = { getPrefs, setTelegramEnabledTxn, defaults, normalize };
