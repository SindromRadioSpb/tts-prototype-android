"use strict";

// Append-only translation history with restore. A text_id is required so the
// history is scoped to a Library text; ad-hoc translations without a text_id
// don't produce history entries.

const crypto = require("crypto");
const { getDb } = require("./sqlite");

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
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

function nowIso() {
  return new Date().toISOString();
}

async function append({
  textId,
  provider,
  targetLang,
  segmenterVersion,
  nikudVersion,
  translitProfile,
  translatorVersion,
  rows,
  note,
}) {
  const db = getDb();
  if (!db || !textId) return null;
  const id = newId();
  await dbRun(
    db,
    `INSERT INTO translation_history
       (id, text_id, provider, target_lang, segmenter_version, nikud_version,
        translit_profile, translator_version, result_json, segments_count,
        note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, textId, provider, targetLang, segmenterVersion, nikudVersion,
      translitProfile, translatorVersion, JSON.stringify(rows), rows.length,
      note || null, nowIso(),
    ]
  );
  return { id };
}

async function listByText(textId, { limit = 50 } = {}) {
  const db = getDb();
  if (!db) return [];
  return dbAll(
    db,
    `SELECT id, provider, target_lang, translator_version, nikud_version,
            translit_profile, segmenter_version, segments_count, note, created_at
       FROM translation_history
      WHERE text_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [textId, Math.min(Math.max(1, limit | 0), 500)]
  );
}

async function getById(id) {
  const db = getDb();
  if (!db) return null;
  const row = await dbGet(
    db,
    `SELECT id, text_id, provider, target_lang, segmenter_version, nikud_version,
            translit_profile, translator_version, result_json, segments_count,
            note, created_at
       FROM translation_history WHERE id = ?`,
    [id]
  );
  if (!row) return null;
  let rows = [];
  try { rows = JSON.parse(row.result_json); } catch { rows = []; }
  return { ...row, rows };
}

module.exports = {
  append,
  listByText,
  getById,
};
