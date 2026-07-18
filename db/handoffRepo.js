"use strict";

// CLG-P8.5 — reading-handoff tokens (SECURITY_SPEC §9): opaque capability «открыть текст на
// предложении». raw-токен живёт ТОЛЬКО в ссылке (в БД sha256 — паттерн channel_pairing_tokens);
// single-use через условный UPDATE (race-safe); TTL короткий. Redeem НЕ требует PWA-сессии
// (токен = capability), но отдаёт ТОЛЬКО указатели {text_key, order_index} — контент текста
// живёт в OPFS устройства и сервером не раскрывается.

const crypto = require("crypto");
const { getDb } = require("./sqlite");

const TOKEN_TTL_MS = 5 * 60 * 1000;   // 5 мин: тап «Открыть в Зале» → переход — секунды

function dbRun(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); })); }
function dbGet(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r))); }
const sha256 = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

async function mint(userId, { textKey, orderIndex, action, workId } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  // Guard the String() coercion trap: a skipped resolver would otherwise store
  // the literal "undefined" and satisfy NOT NULL silently (R14 critique).
  if (typeof textKey !== "string" || !textKey) throw new Error("HANDOFF_TEXT_KEY_REQUIRED");
  const raw = crypto.randomBytes(24).toString("base64url");
  await dbRun(db,
    `INSERT INTO handoff_tokens (token_hash, user_id, text_key, order_index, action, work_id, expires_at)
     VALUES (?,?,?,?,?,?,?)`,
    [sha256(raw), userId, textKey, orderIndex != null ? Number(orderIndex) : null,
     String(action || "open_reader"), workId != null ? String(workId) : null,
     new Date(Date.now() + TOKEN_TTL_MS).toISOString()]);
  return { raw, expiresInMs: TOKEN_TTL_MS };
}

// AA3: live (unredeemed, unexpired) tokens for a user — the agent-mint cap.
// Counts the shared table, so the cap is deliberately generous vs the miniapp's
// own churn; expired/used rows never count (pruneOld keeps a 1h grace).
async function countActive(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db,
    `SELECT COUNT(*) c FROM handoff_tokens WHERE user_id=? AND used_at IS NULL AND expires_at > ?`,
    [userId, new Date().toISOString()]);
  return Number(row && row.c) || 0;
}

// single-use: условный UPDATE помечает used_at ПЕРВЫМ; только выигравший читает указатели.
async function redeem(rawToken) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const h = sha256(rawToken || "");
  const r = await dbRun(db,
    `UPDATE handoff_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at > ?`,
    [new Date().toISOString(), h, new Date().toISOString()]);
  if (r.changes !== 1) return null;                          // нет/повтор/протух — одинаково честный null
  const row = await dbGet(db, `SELECT text_key, order_index, action, work_id FROM handoff_tokens WHERE token_hash=?`, [h]);
  return row ? { text_key: row.text_key, order_index: row.order_index, action: row.action, work_id: row.work_id } : null;
}

// TTL-гигиена (зовётся вместе с challenge-prune)
async function pruneOld() {
  const db = getDb(); if (!db) return;
  try { await dbRun(db, `DELETE FROM handoff_tokens WHERE expires_at <= ?`, [new Date(Date.now() - 3600e3).toISOString()]); } catch (_) {}
}

module.exports = { mint, redeem, countActive, pruneOld, TOKEN_TTL_MS };
