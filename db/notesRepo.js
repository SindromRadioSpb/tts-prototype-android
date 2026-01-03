"use strict";

const crypto = require("crypto");
const { getDb } = require("./sqlite");

function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

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

function makeErr(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

async function assertDbReady() {
  const db = getDb();
  if (!db) throw makeErr("DB_NOT_AVAILABLE", "DB_NOT_AVAILABLE");
  return db;
}

async function assertSentenceBelongsToText(db, textId, sentenceId) {
  const row = await dbGet(
    db,
    `SELECT 1 AS ok
       FROM sentences
      WHERE id = ? AND text_id = ?
      LIMIT 1;`,
    [sentenceId, textId]
  );
  if (!row) throw makeErr("SENTENCE_NOT_IN_TEXT", "SENTENCE_NOT_IN_TEXT");
}

// -----------------------------
// Public API (Wave A)
// -----------------------------

// Optional helper (not required by server.js, but useful)
async function getNoteBySentenceId(sentenceId) {
  const db = await assertDbReady();
  const row = await dbGet(
    db,
    `SELECT id, text_id, sentence_id, note, created_at, updated_at
       FROM sentence_notes
      WHERE sentence_id = ?
      LIMIT 1;`,
    [String(sentenceId)]
  );
  return row || null;
}

// server.js-compatible + object-style compatible
async function getNote(textIdOrObj, sentenceIdMaybe) {
  let textId = null;
  let sentenceId = null;

  if (textIdOrObj && typeof textIdOrObj === "object") {
    textId = String(textIdOrObj.textId || textIdOrObj.text_id || "");
    sentenceId = String(textIdOrObj.sentenceId || textIdOrObj.sentence_id || "");
  } else {
    textId = String(textIdOrObj || "");
    sentenceId = String(sentenceIdMaybe || "");
  }

  const db = await assertDbReady();
  const row = await dbGet(
    db,
    `SELECT id, text_id, sentence_id, note, created_at, updated_at
       FROM sentence_notes
      WHERE text_id = ? AND sentence_id = ?
      LIMIT 1;`,
    [textId, sentenceId]
  );
  return row || null;
}

async function upsertNote(arg1, arg2, arg3) {
  let textId = null;
  let sentenceId = null;
  let note = null;

  if (arg1 && typeof arg1 === "object") {
    textId = String(arg1.textId || arg1.text_id || "");
    sentenceId = String(arg1.sentenceId || arg1.sentence_id || "");
    note = String(arg1.note ?? "");
  } else {
    textId = String(arg1 || "");
    sentenceId = String(arg2 || "");
    note = String(arg3 ?? "");
  }

  const db = await assertDbReady();

  // hard guard: 404 должен быть возможен на уровне API (sentence не принадлежит text)
  await assertSentenceBelongsToText(db, textId, sentenceId);

  const id = uuidv4();
  const now = nowIso();

  await dbRun(
    db,
    `
    INSERT INTO sentence_notes (id, text_id, sentence_id, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(text_id, sentence_id) DO UPDATE SET
      note = excluded.note,
      updated_at = excluded.updated_at;
    `,
    [id, textId, sentenceId, note, now, now]
  );

  // возвращаем актуальную строку
  return await getNote(textId, sentenceId);
}

async function deleteNote(arg1, arg2) {
  let textId = null;
  let sentenceId = null;

  if (arg1 && typeof arg1 === "object") {
    textId = String(arg1.textId || arg1.text_id || "");
    sentenceId = String(arg1.sentenceId || arg1.sentence_id || "");
  } else {
    textId = String(arg1 || "");
    sentenceId = String(arg2 || "");
  }

  const db = await assertDbReady();

  // 404 semantics: sentenceId не принадлежит textId
  await assertSentenceBelongsToText(db, textId, sentenceId);

  await dbRun(
    db,
    `DELETE FROM sentence_notes WHERE text_id = ? AND sentence_id = ?;`,
    [textId, sentenceId]
  );

  return { ok: true };
}

async function listNotesByTextId(textId) {
  const db = await assertDbReady();

  // Важно: join через sentences, чтобы гарантировать принадлежность sentence -> text
  const rows = await dbAll(
    db,
    `
    SELECT
      n.sentence_id AS sentence_id,
      n.note AS note,
      n.updated_at AS updated_at
    FROM sentences s
    JOIN sentence_notes n
      ON n.sentence_id = s.id
     AND n.text_id = s.text_id
    WHERE s.text_id = ?
    ORDER BY (s.order_index) ASC;
    `,
    [String(textId)]
  );

  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  listNotesByTextId,
  getNote,
  upsertNote,
  deleteNote,
  getNoteBySentenceId,
};
