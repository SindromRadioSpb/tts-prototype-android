"use strict";

const crypto = require("crypto");

const { getDb, _exec } = require("./sqlite");

// init-once guard (и защита от параллельных вызовов)
let _schemaReady = false;
let _schemaInitPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function genId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

/**
 * Автосхема History (idempotent):
 * - history_events: полный лог событий проигрывания/прослушивания
 * - recent_texts: последние тексты (агрегация)
 * - recent_rows: последние строки внутри текста (агрегация)
 *
 * Важно: используем "CREATE ... IF NOT EXISTS" чтобы:
 * - не зависеть от миграций в P0
 * - не падать при повторных запусках
 */
async function ensureHistorySchema() {
  if (_schemaReady) return;
  if (_schemaInitPromise) return _schemaInitPromise;

  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  _schemaInitPromise = (async () => {
    await _exec(
      db,
      `
      CREATE TABLE IF NOT EXISTS history_events (
        id          TEXT PRIMARY KEY,
        event_type  TEXT NOT NULL,
        text_id     TEXT NOT NULL,
        sentence_id TEXT NOT NULL,
        asset_key   TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE INDEX IF NOT EXISTS idx_history_events_text_id
        ON history_events(text_id);

      CREATE INDEX IF NOT EXISTS idx_history_events_created_at
        ON history_events(created_at);

      CREATE TABLE IF NOT EXISTS recent_texts (
        text_id          TEXT PRIMARY KEY,
        last_seen_at     TEXT NOT NULL,
        seen_count       INTEGER NOT NULL DEFAULT 0,
        last_sentence_id TEXT,
        last_asset_key   TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_recent_texts_last_seen_at
        ON recent_texts(last_seen_at);

      CREATE TABLE IF NOT EXISTS recent_rows (
        text_id        TEXT NOT NULL,
        sentence_id    TEXT NOT NULL,
        last_seen_at   TEXT NOT NULL,
        seen_count     INTEGER NOT NULL DEFAULT 0,
        last_asset_key TEXT,
        PRIMARY KEY (text_id, sentence_id)
      );

      CREATE INDEX IF NOT EXISTS idx_recent_rows_last_seen_at
        ON recent_rows(last_seen_at);

      CREATE INDEX IF NOT EXISTS idx_recent_rows_text_id
        ON recent_rows(text_id);
      `
    );

    _schemaReady = true;
  })().catch((err) => {
    // чтобы при временной ошибке можно было повторить
    _schemaInitPromise = null;
    throw err;
  });

  return _schemaInitPromise;
}

async function insertHistoryEvent({ id, eventType, textId, sentenceId, assetKey, createdAt }) {
  await ensureHistorySchema();
  const db = getDb();

  const eid = id || genId();
  const eType = eventType || "ROW_TTS";
  const ts = createdAt || nowIso();

  await dbRun(
    db,
    `INSERT INTO history_events (id, event_type, text_id, sentence_id, asset_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eid, eType, textId, sentenceId, assetKey || null, ts]
  );

  return { id: eid, createdAt: ts };
}

async function touchRecentText({ textId, sentenceId, assetKey, seenAt }) {
  await ensureHistorySchema();
  const db = getDb();

  await dbRun(
    db,
    `INSERT INTO recent_texts (text_id, last_seen_at, seen_count, last_sentence_id, last_asset_key)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(text_id) DO UPDATE SET
       last_seen_at     = excluded.last_seen_at,
       seen_count       = recent_texts.seen_count + 1,
       last_sentence_id = excluded.last_sentence_id,
       last_asset_key   = COALESCE(excluded.last_asset_key, recent_texts.last_asset_key)`,
    [textId, seenAt, sentenceId, assetKey || null]
  );
}

async function touchRecentRow({ textId, sentenceId, assetKey, seenAt }) {
  await ensureHistorySchema();
  const db = getDb();

  // Основная (новая) схема: last_seen_at + seen_count
  try {
    await dbRun(
      db,
      `INSERT INTO recent_rows (text_id, sentence_id, last_seen_at, seen_count, last_asset_key)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(text_id, sentence_id) DO UPDATE SET
         last_seen_at   = excluded.last_seen_at,
         seen_count     = recent_rows.seen_count + 1,
         last_asset_key = COALESCE(excluded.last_asset_key, recent_rows.last_asset_key)`,
      [textId, sentenceId, seenAt, assetKey || null]
    );
    return;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const isSchemaMismatch = msg.includes("no such column") || msg.includes("has no column named");
    if (!isSchemaMismatch) throw err;

    // Legacy-схема (если таблица была создана старой версией): last_event_at + play_count
    await dbRun(
      db,
      `INSERT INTO recent_rows (text_id, sentence_id, last_event_at, play_count, last_asset_key)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(text_id, sentence_id) DO UPDATE SET
         last_event_at  = excluded.last_event_at,
         play_count     = recent_rows.play_count + 1,
         last_asset_key = COALESCE(excluded.last_asset_key, recent_rows.last_asset_key)`,
      [textId, sentenceId, seenAt, assetKey || null]
    );
  }
}

/**
 * Главная точка для Day2:
 * фиксируем событие (обычно PLAY),
 * апдейтим recent_texts и recent_rows.
 */
async function recordRowTtsEvent({ id, eventType, textId, sentenceId, assetKey }) {
  await ensureHistorySchema();
  const db = getDb();

  const eid = id || genId();
  const eType = eventType || "ROW_TTS";
  const createdAt = nowIso();

  // Важно: транзакция, чтобы recent_texts и recent_rows не расходились.
  await dbRun(db, "BEGIN IMMEDIATE;");
  try {
    await insertHistoryEvent({
      id: eid,
      eventType: eType,
      textId,
      sentenceId,
      assetKey,
      createdAt,
    });

    await touchRecentText({
      textId,
      sentenceId,
      assetKey,
      seenAt: createdAt,
    });

    await touchRecentRow({
      textId,
      sentenceId,
      assetKey,
      seenAt: createdAt,
    });

    await dbRun(db, "COMMIT;");
  } catch (err) {
    try {
      await dbRun(db, "ROLLBACK;");
    } catch (_) {}
    throw err;
  }

  return { ok: true, id: eid, createdAt };
}

/**
 * Список последних текстов по активности.
 * includeArchived позволяет включать/исключать архивные.
 */
async function listRecentTexts({ limit = 20, includeArchived = true } = {}) {
  await ensureHistorySchema();
  const db = getDb();

  const lim = Math.max(1, Math.min(200, Number(limit) || 20));

  // Важно: ожидается таблица texts (v3 library)
  const rows = await dbAll(
    db,
    `SELECT
       rt.text_id,
       rt.last_seen_at,
       rt.seen_count,
       rt.last_sentence_id,
       rt.last_asset_key,
       t.title,
       t.is_archived,
       t.is_pinned,
       t.last_opened_at
     FROM recent_texts rt
     JOIN texts t ON t.id = rt.text_id
     WHERE (? = 1) OR (t.is_archived = 0)
     ORDER BY rt.last_seen_at DESC
     LIMIT ?`,
    [includeArchived ? 1 : 0, lim]
  );

  return rows || [];
}

async function listRecentRowsByText({ textId, limit = 25 } = {}) {
  await ensureHistorySchema();
  const db = getDb();

  const lim = Math.max(1, Math.min(200, Number(limit) || 25));

  // Основная (новая) схема
  try {
    const rows = await dbAll(
      db,
      `SELECT
         text_id,
         sentence_id,
         last_seen_at,
         seen_count,
         last_asset_key
       FROM recent_rows
       WHERE text_id = ?
       ORDER BY last_seen_at DESC
       LIMIT ?`,
      [textId, lim]
    );
    return rows || [];
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    const isSchemaMismatch = msg.includes("no such column") || msg.includes("has no column named");
    if (!isSchemaMismatch) throw err;

    // Legacy-схема: last_event_at + play_count
    const rows = await dbAll(
      db,
      `SELECT
         text_id,
         sentence_id,
         last_event_at AS last_seen_at,
         play_count    AS seen_count,
         last_asset_key
       FROM recent_rows
       WHERE text_id = ?
       ORDER BY last_event_at DESC
       LIMIT ?`,
      [textId, lim]
    );

    return rows || [];
  }
}

module.exports = {
  recordRowTtsEvent,
  listRecentTexts,
  listRecentRowsByText,

  // экспортируем и «внутренние», если где-то уже использовались
  insertHistoryEvent,
  touchRecentText,
  touchRecentRow,

  // на будущее — для тестов/диагностики
  ensureHistorySchema,
};
