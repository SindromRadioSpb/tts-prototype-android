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

async function mint(userId, { textKey, orderIndex, action } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const raw = crypto.randomBytes(24).toString("base64url");
  await dbRun(db,
    `INSERT INTO handoff_tokens (token_hash, user_id, text_key, order_index, action, expires_at)
     VALUES (?,?,?,?,?,?)`,
    [sha256(raw), userId, String(textKey), orderIndex != null ? Number(orderIndex) : null,
     String(action || "open_reader"), new Date(Date.now() + TOKEN_TTL_MS).toISOString()]);
  return { raw, expiresInMs: TOKEN_TTL_MS };
}

// single-use: условный UPDATE помечает used_at ПЕРВЫМ; только выигравший читает указатели.
async function redeem(rawToken) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const h = sha256(rawToken || "");
  const r = await dbRun(db,
    `UPDATE handoff_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at > ?`,
    [new Date().toISOString(), h, new Date().toISOString()]);
  if (r.changes !== 1) return null;                          // нет/повтор/протух — одинаково честный null
  const row = await dbGet(db, `SELECT text_key, order_index, action FROM handoff_tokens WHERE token_hash=?`, [h]);
  return row ? { text_key: row.text_key, order_index: row.order_index, action: row.action } : null;
}

// TTL-гигиена (зовётся вместе с challenge-prune)
async function pruneOld() {
  const db = getDb(); if (!db) return;
  try { await dbRun(db, `DELETE FROM handoff_tokens WHERE expires_at <= ?`, [new Date(Date.now() - 3600e3).toISOString()]); } catch (_) {}
}

module.exports = { mint, redeem, pruneOld, TOKEN_TTL_MS };
