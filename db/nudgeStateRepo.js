"use strict";

// db/nudgeStateRepo.js — CLG-P7.3c telegram backoff-состояние. ЕДИНСТВЕННЫЙ писатель = sweep (nudgeRepo);
// мутируется на КАЖДОМ tick (не только на send → reset не теряется в дни без нуджа). Отдельно от общего
// кросс-канального nudge_ledger (критика wf_e9b7e615 BLOCKER: push/notoday-строки чужого канала через
// lastNudge сбрасывали бы telegram-backoff). consecutive_ignored ведёт лестницу {1,2,4,7}.

const { getDb } = require("./sqlite");

function dbGet(db, sql, p = []) { return new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r)))); }
function dbRun(db, sql, p = []) { return new Promise((res, rej) => db.run(sql, p, function (e) { (e ? rej(e) : res(this)); })); }

// { consecutive_ignored, last_nudge_at, last_engaged_at } — дефолт для юзера без строки.
async function getState(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbGet(db, `SELECT consecutive_ignored, last_nudge_at, last_engaged_at FROM nudge_state WHERE user_id=?`, [String(userId)]);
  if (!r) return { consecutive_ignored: 0, last_nudge_at: null, last_engaged_at: null, _row: false };
  return { consecutive_ignored: Number(r.consecutive_ignored) || 0, last_nudge_at: r.last_nudge_at || null,
           last_engaged_at: r.last_engaged_at || null, _row: true };
}

// UPSERT — пишет ТОЛЬКО переданные поля (остальные сохраняются). sweep — единственный вызыватель.
async function upsertState(userId, fields) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const f = fields || {};
  await dbRun(db,
    `INSERT INTO nudge_state (user_id, consecutive_ignored, last_nudge_at, last_engaged_at, updated_at)
       VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(user_id) DO UPDATE SET
       consecutive_ignored = COALESCE(excluded.consecutive_ignored, nudge_state.consecutive_ignored),
       last_nudge_at = COALESCE(excluded.last_nudge_at, nudge_state.last_nudge_at),
       last_engaged_at = COALESCE(excluded.last_engaged_at, nudge_state.last_engaged_at),
       updated_at = excluded.updated_at`,
    [String(userId),
     f.consecutive_ignored != null ? Number(f.consecutive_ignored) : null,
     f.last_nudge_at != null ? String(f.last_nudge_at) : null,
     f.last_engaged_at != null ? String(f.last_engaged_at) : null]);
  return { ok: true };
}

module.exports = { getState, upsertState };
