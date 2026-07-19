"use strict";

// Exposure-леджер (мигр. 053) — точечная провенанс-разметка вместо ковровой. Пишет ТОЛЬКО
// метаданные окна (text_key, диапазон order_index, время) — контент не хранится (класс D
// в AA-слое отсутствует by construction). Единственный писатель — aaGetPersonalTextWindow.
// Читатели: createChallenge (mint-метка класс-C) и agent/reviewer (grade-time OR-проверка).

const { getDb } = require("./sqlite");

const EXPOSURE_WINDOW_DAYS = 30;   // «агент видел» = чтение за последние N дней
const PRUNE_AFTER_DAYS = 45;       // TTL строк (заявлен в consent-карте гранта)

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}

async function record(userId, textKey, fromIdx, toIdx) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const f = Number(fromIdx), t = Number(toIdx);
  if (!userId || !textKey || !Number.isInteger(f) || !Number.isInteger(t) || t < f) return { ok: false };
  await dbRun(db, `INSERT INTO agent_text_exposures (user_id, text_key, from_idx, to_idx) VALUES (?,?,?,?)`,
    [String(userId), String(textKey), f, t]);
  return { ok: true };
}

// Стимул (text_key, order_index) ∈ какое-либо прочитанное окно за EXPOSURE_WINDOW_DAYS?
async function wasExposed(userId, textKey, orderIndex, days = EXPOSURE_WINDOW_DAYS) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const oi = Number(orderIndex);
  if (!userId || !textKey || !Number.isFinite(oi)) return false;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const row = await dbGet(db,
    `SELECT 1 x FROM agent_text_exposures
      WHERE user_id = ? AND text_key = ? AND from_idx <= ? AND to_idx >= ? AND read_at > ?
      LIMIT 1`, [String(userId), String(textKey), oi, oi, cutoff]);
  return !!row;
}

async function prune(days = PRUNE_AFTER_DAYS) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const r = await dbRun(db, `DELETE FROM agent_text_exposures WHERE read_at < ?`, [cutoff]);
  return { pruned: (r && r.changes) || 0 };
}

module.exports = { record, wasExposed, prune, EXPOSURE_WINDOW_DAYS, PRUNE_AFTER_DAYS };
