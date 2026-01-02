"use strict";

const { v4: uuidv4 } = require("uuid");
const { getDb } = require("./sqlite");

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
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

async function listNotesByTextId(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = String(textId);

  const rows = await dbAll(
    db,
    `
    SELECT
      text_id,
      sentence_id,
      note,
      created_at,
      updated_at
    FROM sentence_notes
    WHERE text_id = ?
    ORDER BY updated_at DESC, sentence_id ASC;
    `,
    [tId]
  );

  return rows || [];
}

async function getNote(textId, sentenceId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = String(textId);
  const sId = String(sentenceId);

  const row = await dbGet(
    db,
    `
    SELECT
      text_id,
      sentence_id,
      note,
      created_at,
      updated_at
    FROM sentence_notes
    WHERE text_id = ? AND sentence_id = ?
    LIMIT 1;
    `,
    [tId, sId]
  );

  return row || null;
}

async function upsertNote({ textId, sentenceId, note }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = String(textId);
  const sId = String(sentenceId);
  const n = (note == null) ? "" : String(note);

  const id = uuidv4();
  const now = nowIso();

  await dbRun(
    db,
    `
    INSERT INTO sentence_notes (
      id, text_id, sentence_id, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(text_id, sentence_id) DO UPDATE SET
      note = excluded.note,
      updated_at = excluded.updated_at;
    `,
    [id, tId, sId, n, now, now]
  );

  return getNote(tId, sId);
}

async function deleteNote(textId, sentenceId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = String(textId);
  const sId = String(sentenceId);

  await dbRun(
    db,
    `DELETE FROM sentence_notes WHERE text_id = ? AND sentence_id = ?;`,
    [tId, sId]
  );

  return { ok: true };
}

module.exports = {
  listNotesByTextId,
  getNote,
  upsertNote,
  deleteNote,
};
