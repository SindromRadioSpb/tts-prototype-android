"use strict";

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

/**
 * Пишем событие в history_events (аудит).
 * Ожидаемые поля таблицы (по вашему Week9 плану):
 * - id TEXT PK
 * - event_type TEXT
 * - text_id TEXT
 * - sentence_id TEXT
 * - asset_key TEXT NULL
 * - created_at TEXT/TS
 */
async function insertHistoryEvent({ id, eventType, textId, sentenceId, assetKey }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ts = nowIso();
  await dbRun(
    db,
    `
    INSERT INTO history_events (id, event_type, text_id, sentence_id, asset_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?);
    `,
    [
      String(id),
      String(eventType || "row_tts"),
      String(textId),
      String(sentenceId),
      assetKey == null ? null : String(assetKey),
      ts,
    ]
  );

  return { ok: true };
}

/**
 * Upsert в recent_rows: ключ (text_id, sentence_id)
 * Ожидаемые поля:
 * - text_id TEXT
 * - sentence_id TEXT
 * - last_seen_at TEXT
 * - seen_count INTEGER
 * - last_asset_key TEXT NULL
 */
async function touchRecentRow({ textId, sentenceId, assetKey }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ts = nowIso();
  await dbRun(
    db,
    `
    INSERT INTO recent_rows (text_id, sentence_id, last_seen_at, seen_count, last_asset_key)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(text_id, sentence_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      seen_count = COALESCE(recent_rows.seen_count, 0) + 1,
      last_asset_key = COALESCE(excluded.last_asset_key, recent_rows.last_asset_key);
    `,
    [
      String(textId),
      String(sentenceId),
      ts,
      assetKey == null ? null : String(assetKey),
    ]
  );
}

/**
 * Upsert в recent_texts: ключ (text_id)
 * Ожидаемые поля:
 * - text_id TEXT
 * - last_seen_at TEXT
 * - seen_count INTEGER
 * - last_sentence_id TEXT
 * - last_asset_key TEXT NULL
 */
async function touchRecentText({ textId, sentenceId, assetKey }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ts = nowIso();
  await dbRun(
    db,
    `
    INSERT INTO recent_texts (text_id, last_seen_at, seen_count, last_sentence_id, last_asset_key)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(text_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      seen_count = COALESCE(recent_texts.seen_count, 0) + 1,
      last_sentence_id = excluded.last_sentence_id,
      last_asset_key = COALESCE(excluded.last_asset_key, recent_texts.last_asset_key);
    `,
    [
      String(textId),
      ts,
      String(sentenceId),
      assetKey == null ? null : String(assetKey),
    ]
  );
}

/**
 * Главная точка: событие "проиграли строку" => history_events + recent_rows + recent_texts
 */
async function recordRowTtsEvent({ id, eventType, textId, sentenceId, assetKey }) {
  await insertHistoryEvent({ id, eventType, textId, sentenceId, assetKey });
  await touchRecentRow({ textId, sentenceId, assetKey });
  await touchRecentText({ textId, sentenceId, assetKey });
  return { ok: true };
}

/**
 * Список последних текстов для Dashboard (join texts).
 */
async function listRecentTexts({ limit = 30, includeArchived = false }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const lim = Math.max(1, Math.min(200, Number(limit) || 30));
  const where = includeArchived ? "1=1" : "t.is_archived = 0";

  return dbAll(
    db,
    `
    SELECT
      rt.text_id,
      rt.last_seen_at,
      rt.seen_count,
      rt.last_sentence_id,
      rt.last_asset_key,

      t.id,
      t.text_key,
      t.title,
      t.level,
      t.tags_json,
      t.source,
      t.topic,
      t.is_pinned,
      t.pin_order,
      t.is_archived,
      t.created_at,
      t.updated_at,
      t.last_opened_at
    FROM recent_texts rt
    JOIN texts t ON t.id = rt.text_id
    WHERE ${where}
    ORDER BY rt.last_seen_at DESC
    LIMIT ?;
    `,
    [lim]
  );
}

/**
 * Последние строки внутри одного текста.
 * (для "продолжить" / "история по тексту")
 */
async function listRecentRowsByText({ textId, limit = 100 }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const lim = Math.max(1, Math.min(500, Number(limit) || 100));

  return dbAll(
    db,
    `
    SELECT
      rr.text_id,
      rr.sentence_id,
      rr.last_seen_at,
      rr.seen_count,
      rr.last_asset_key,

      s.order_index,
      s.he_plain,
      s.he_niqqud,
      s.translit,
      s.ru
    FROM recent_rows rr
    JOIN sentences s ON s.id = rr.sentence_id
    WHERE rr.text_id = ?
    ORDER BY rr.last_seen_at DESC
    LIMIT ?;
    `,
    [String(textId), lim]
  );
}

module.exports = {
  recordRowTtsEvent,
  listRecentTexts,
  listRecentRowsByText,
};
