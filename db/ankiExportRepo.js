"use strict";

const crypto = require("crypto");

const { getDb } = require("./sqlite");

function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function parseJsonSafe(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function mapExportRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    cardId: row.card_id,
    deckName: row.deck_name || null,
    modelName: row.model_name || null,
    templateCode: row.template_code || null,
    externalNoteId: row.external_note_id || null,
    externalCardIds: parseJsonSafe(row.external_card_ids_json, []),
    exportHash: row.export_hash || "",
    lastSyncStatus: row.last_sync_status || "pending",
    lastError: row.last_error || null,
    exportedAt: row.exported_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function getSrsCardExport(provider, cardId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const row = await dbGet(
    db,
    `
    SELECT *
    FROM srs_card_exports
    WHERE provider = ? AND card_id = ?
    LIMIT 1;
    `,
    [String(provider || "anki"), String(cardId || "")]
  );
  return mapExportRow(row);
}

async function upsertSrsCardExport({
  provider = "anki",
  cardId,
  deckName = null,
  modelName = null,
  templateCode = null,
  externalNoteId = null,
  externalCardIds = [],
  exportHash,
  lastSyncStatus = "ok",
  lastError = null,
  exportedAt = null,
} = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const card = String(cardId || "").trim();
  const hash = String(exportHash || "").trim();
  if (!card) throw new Error("BAD_CARD_ID");
  if (!hash) throw new Error("BAD_EXPORT_HASH");

  const now = new Date().toISOString();
  const existing = await getSrsCardExport(provider, card);
  const id = existing && existing.id ? existing.id : uuidv4();

  await dbRun(
    db,
    `
    INSERT INTO srs_card_exports (
      id, provider, card_id, deck_name, model_name, template_code,
      external_note_id, external_card_ids_json, export_hash,
      last_sync_status, last_error, exported_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, card_id) DO UPDATE SET
      deck_name = excluded.deck_name,
      model_name = excluded.model_name,
      template_code = excluded.template_code,
      external_note_id = excluded.external_note_id,
      external_card_ids_json = excluded.external_card_ids_json,
      export_hash = excluded.export_hash,
      last_sync_status = excluded.last_sync_status,
      last_error = excluded.last_error,
      exported_at = excluded.exported_at,
      updated_at = excluded.updated_at;
    `,
    [
      id,
      String(provider || "anki"),
      card,
      deckName == null ? null : String(deckName),
      modelName == null ? null : String(modelName),
      templateCode == null ? null : String(templateCode),
      externalNoteId == null ? null : String(externalNoteId),
      JSON.stringify(Array.isArray(externalCardIds) ? externalCardIds.map((x) => String(x)) : []),
      hash,
      String(lastSyncStatus || "pending"),
      lastError == null ? null : String(lastError),
      exportedAt == null ? null : String(exportedAt),
      existing && existing.createdAt ? existing.createdAt : now,
      now,
    ]
  );

  return getSrsCardExport(provider, card);
}

function computeSrsExportHash(payload) {
  return sha256(JSON.stringify(payload || {}));
}

module.exports = {
  computeSrsExportHash,
  getSrsCardExport,
  upsertSrsCardExport,
};
