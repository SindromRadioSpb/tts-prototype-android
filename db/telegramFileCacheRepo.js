"use strict";

// db/telegramFileCacheRepo.js — CLG-P7.2c dictate:tg. Кеш Telegram file_id по (asset_key, bot_id).
// file_id привязан к боту (не к пользователю) — класс A (assetKey = TTS словарной формы, не PII).
// Позволяет повторную отправку того же слова-диктанта без повторной загрузки (sendAudio с file_id).
// Битый/просроченный file_id (ротация токена → другой bot_id; Telegram 400) → invalidate + retry URL.

const { getDb } = require("./sqlite");

function dbGet(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbRun(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { (e ? rej(e) : res(this)); })); }

// get(assetKey, botId) → file_id | null
async function get(assetKey, botId) {
  const db = getDb(); if (!db) return null;
  const r = await dbGet(db,
    `SELECT file_id FROM telegram_file_cache WHERE asset_key = ? AND bot_id = ?`,
    [String(assetKey), String(botId)]);
  return (r && r.file_id) ? String(r.file_id) : null;
}

// put(assetKey, botId, fileId) — upsert (перезаписать file_id, если Telegram выдал новый)
async function put(assetKey, botId, fileId) {
  const db = getDb(); if (!db) return;
  if (!assetKey || !botId || !fileId) return;
  await dbRun(db,
    `INSERT INTO telegram_file_cache (asset_key, bot_id, file_id) VALUES (?,?,?)
     ON CONFLICT(asset_key, bot_id) DO UPDATE SET file_id = excluded.file_id`,
    [String(assetKey), String(botId), String(fileId)]);
}

// invalidate(assetKey, botId) — удалить битый/просроченный file_id (перед retry через URL)
async function invalidate(assetKey, botId) {
  const db = getDb(); if (!db) return;
  await dbRun(db,
    `DELETE FROM telegram_file_cache WHERE asset_key = ? AND bot_id = ?`,
    [String(assetKey), String(botId)]);
}

module.exports = { get, put, invalidate };
