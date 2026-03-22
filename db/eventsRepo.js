"use strict";

const crypto = require("crypto");

const { getDb } = require("./sqlite");

function genId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeString(value, maxLen = 160) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function sanitizePayload(value, depth = 0) {
  if (value == null) return null;
  if (typeof value === "string") return sanitizeString(value, 200);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth >= 2) return value.slice(0, 8).map((item) => sanitizeString(item, 80));
    return value.slice(0, 16).map((item) => sanitizePayload(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    const keys = Object.keys(value).slice(0, 16);
    for (const key of keys) {
      out[sanitizeString(key, 64)] = sanitizePayload(value[key], depth + 1);
    }
    return out;
  }
  return sanitizeString(value, 120);
}

function serializePayload(payload) {
  const clean = sanitizePayload(payload && typeof payload === "object" ? payload : {});
  let json = JSON.stringify(clean == null ? {} : clean);
  if (json.length <= 2048) return json;
  return JSON.stringify({
    truncated: true,
    keys: Object.keys(clean || {}).slice(0, 16),
  });
}

async function recordEvent({
  eventType,
  entityType = null,
  entityId = null,
  sessionId = null,
  textId = null,
  sentenceId = null,
  noteId = null,
  cardId = null,
  source = null,
  payload = {},
  ts = null,
} = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const type = sanitizeString(eventType, 64);
  if (!type) throw new Error("BAD_EVENT_TYPE");

  const id = genId();
  const createdAt = ts || nowIso();

  await dbRun(
    db,
    `
    INSERT INTO events (
      id, ts, event_type, entity_type, entity_id, session_id,
      text_id, sentence_id, note_id, card_id, source, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      id,
      createdAt,
      type,
      entityType ? sanitizeString(entityType, 48) : null,
      entityId ? sanitizeString(entityId, 80) : null,
      sessionId ? sanitizeString(sessionId, 80) : null,
      textId ? sanitizeString(textId, 80) : null,
      sentenceId ? sanitizeString(sentenceId, 80) : null,
      noteId ? sanitizeString(noteId, 80) : null,
      cardId ? sanitizeString(cardId, 80) : null,
      source ? sanitizeString(source, 48) : null,
      serializePayload(payload),
    ]
  );

  return { id, ts: createdAt };
}

async function countEventsByType({ days = 7 } = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const daysNum = Number.isFinite(Number(days))
    ? Math.max(0, Math.min(3650, Number(days)))
    : 7;
  const cutoffIso = daysNum > 0 ? new Date(Date.now() - daysNum * 86400 * 1000).toISOString() : null;
  const whereSql = cutoffIso ? "WHERE ts >= ?" : "";
  const params = cutoffIso ? [cutoffIso] : [];

  const rows = await dbAll(
    db,
    `
    SELECT event_type, COUNT(*) AS count
    FROM events
    ${whereSql}
    GROUP BY event_type
    ORDER BY event_type ASC;
    `,
    params
  );

  const counts = {};
  for (const row of rows) {
    counts[String(row.event_type || "")] = Number(row.count || 0);
  }
  return counts;
}

module.exports = {
  recordEvent,
  countEventsByType,
};
