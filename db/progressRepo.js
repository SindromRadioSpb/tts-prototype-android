"use strict";

const { getDb } = require("./sqlite");

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function getSentenceCount(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const row = await dbGet(
    db,
    `SELECT COUNT(1) AS c FROM sentences WHERE text_id = ?;`,
    [textId]
  );
  return Number(row && row.c ? row.c : 0);
}

async function getProgressByTextId(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  // Возвращаем прогресс + last_opened_at из texts (удобно для UI).
  const row = await dbGet(
    db,
    `
    SELECT
      t.id AS text_id,
      t.last_opened_at AS last_opened_at,
      p.last_row_idx AS last_row_idx,
      p.last_step_id AS last_step_id,
      p.updated_at AS updated_at
    FROM texts t
    LEFT JOIN text_progress p ON p.text_id = t.id
    WHERE t.id = ?;
    `,
    [textId]
  );

  if (!row) return null;

  return {
    textId: row.text_id,
    lastOpenedAt: row.last_opened_at || null,
    lastRowIdx: (row.last_row_idx === null || row.last_row_idx === undefined) ? null : Number(row.last_row_idx),
    lastStepId: row.last_step_id || null,
    updatedAt: row.updated_at || null,
  };
}

async function setProgress({ textId, lastRowIdx, lastStepId }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ts = nowIso();

  await dbRun(
    db,
    `
    INSERT INTO text_progress (text_id, last_row_idx, last_step_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(text_id) DO UPDATE SET
      last_row_idx = excluded.last_row_idx,
      last_step_id = excluded.last_step_id,
      updated_at = excluded.updated_at;
    `,
    [textId, lastRowIdx, lastStepId || null, ts]
  );

  return getProgressByTextId(textId);
}

async function clearProgress(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  await dbRun(db, `DELETE FROM text_progress WHERE text_id = ?;`, [textId]);
  return getProgressByTextId(textId);
}

module.exports = {
  getSentenceCount,
  getProgressByTextId,
  setProgress,
  clearProgress,
};
