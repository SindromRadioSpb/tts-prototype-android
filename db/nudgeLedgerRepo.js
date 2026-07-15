"use strict";

// db/nudgeLedgerRepo.js — CLG-P7.3a единый кросс-канальный дневной бюджет + claim-before-send.
// ЕДИНСТВЕННЫЙ арбитр «нудж сегодня» для ОБОИХ каналов (Telegram-бот + web-push): кто первый занял
// (user_id, local_day) — тот шлёт, второй skip:budget. Ключ = ЛОКАЛЬНЫЙ день пользователя (по его tz),
// один для обоих каналов (критика wf_f60b0e58 BLOCKER: push=UTC-day и бот=local-day несовместимы).
//
// claim-BEFORE-send (критика BLOCKER): INSERT OR IGNORE атомарен по PK(user_id, local_day) → changes===1
// ⇒ разрешено слать; иначе занято. at-most-once (потерянный нудж при сбое send честнее дубля для
// премиум-канала — owner). Single INSERT самодостаточно атомарен (SQLite сериализует писателей) —
// TOCTOU двух sweep'ов закрыт по построению. ЕДИНСТВЕННЫЙ писатель = sweep (engaged/ignored выводится
// из review_log, не пишется webhook'ом → нет two-writer гонки).

const { getDb } = require("./sqlite");

function dbGet(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbRun(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { (e ? rej(e) : res(this)); })); }

// Занять (user_id, local_day) для канала. changes===1 ⇒ claimed (можно слать); 0 ⇒ уже занято
// (другим каналом ИЛИ этим же ранее сегодня) → skip:budget.
async function claimDay(userId, localDay, channel, reason) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db,
    `INSERT OR IGNORE INTO nudge_ledger (user_id, local_day, channel, reason) VALUES (?,?,?,?)`,
    [String(userId), String(localDay), String(channel || ""), reason != null ? String(reason) : null]);
  return { claimed: r.changes === 1 };
}

// день уже занят? дешёвый PK-SELECT — sweep короткозамыкает ДО дорогого getDue после того, как юзер
// уже нуджнут сегодня (критика wf_858259da R16: иначе ~50 лишних getDue/день на нуджнутого юзера).
async function claimedToday(userId, localDay) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbGet(db, `SELECT 1 x FROM nudge_ledger WHERE user_id=? AND local_day=?`, [String(userId), String(localDay)]);
  return !!r;
}

// последний нудж пользователя (для derived-engagement/backoff P7.3c). null если не было.
async function lastNudge(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db,
    `SELECT local_day, channel, reason, last_nudge_at FROM nudge_ledger WHERE user_id=? ORDER BY last_nudge_at DESC LIMIT 1`,
    [String(userId)])) || null;
}

// N1 fairness anchor: the latest RESERVED channel, not a delivery guess. A failed
// send deliberately remains the alternation fact (claim-before-send/at-most-once).
// local_day is ISO and user-scoped, so lexical DESC is deterministic; timestamp is
// retained as a defensive tie-break for imported/legacy rows.
async function lastClaimedChannel(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db,
    `SELECT channel FROM nudge_ledger
      WHERE user_id=? AND channel IN ('push','telegram')
      ORDER BY local_day DESC, last_nudge_at DESC, channel ASC LIMIT 1`,
    [String(userId)]);
  return row && (row.channel === "push" || row.channel === "telegram") ? row.channel : null;
}
// revoke/unlink чистит ledger юзера ИНЛАЙН в revoke-txn channelLinkRepo (DELETE FROM nudge_ledger) —
// backoff не переживает re-pair. Отдельный clearForUser убран как дублирующий (критика: одна точка).

module.exports = { claimDay, claimedToday, lastNudge, lastClaimedChannel };
