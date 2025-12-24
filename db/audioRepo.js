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

async function upsertAudioAsset({
  id,
  assetKey,
  assetType,
  relativePath,
  mime,
  durationMs,
  sizeBytes,
  ttsProfileJson
}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ts = nowIso();

  await dbRun(
    db,
    `
    INSERT INTO audio_assets (
      id, asset_key, asset_type, relative_path, mime, duration_ms, size_bytes, tts_profile_json, created_at, last_used_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(asset_key) DO UPDATE SET
      relative_path = excluded.relative_path,
      mime = excluded.mime,
      duration_ms = COALESCE(excluded.duration_ms, audio_assets.duration_ms),
      size_bytes = COALESCE(excluded.size_bytes, audio_assets.size_bytes),
      tts_profile_json = COALESCE(excluded.tts_profile_json, audio_assets.tts_profile_json),
      last_used_at = excluded.last_used_at;
    `,
    [
      String(id),
      String(assetKey),
      String(assetType),
      String(relativePath),
      String(mime || "audio/mpeg"),
      (durationMs == null ? null : Number(durationMs)),
      (sizeBytes == null ? null : Number(sizeBytes)),
      (ttsProfileJson == null ? null : String(ttsProfileJson)),
      ts
    ]
  );

  return getAudioAssetByKey(assetKey);
}

async function getAudioAssetByKey(assetKey) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const row = await dbGet(
    db,
    `SELECT * FROM audio_assets WHERE asset_key = ?;`,
    [String(assetKey)]
  );
  return row || null;
}

async function touchAudioAsset(assetKey) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ts = nowIso();
  await dbRun(
    db,
    `UPDATE audio_assets SET last_used_at = ? WHERE asset_key = ?;`,
    [ts, String(assetKey)]
  );
}

async function linkSentenceAudio(sentenceId, audioId, isDefault = 1) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const sId = String(sentenceId);
  const aId = String(audioId);
  const def = isDefault ? 1 : 0;

  await dbRun(
    db,
    `
    INSERT INTO sentence_audio (sentence_id, audio_id, is_default)
    VALUES (?, ?, ?)
    ON CONFLICT(sentence_id, audio_id) DO UPDATE SET
      is_default = excluded.is_default;
    `,
    [sId, aId, def]
  );
}

async function linkTextAudio(textId, audioId, isDefault = 1) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = String(textId);
  const aId = String(audioId);
  const def = isDefault ? 1 : 0;

  await dbRun(
    db,
    `
    INSERT INTO text_audio (text_id, audio_id, is_default)
    VALUES (?, ?, ?)
    ON CONFLICT(text_id, audio_id) DO UPDATE SET
      is_default = excluded.is_default;
    `,
    [tId, aId, def]
  );
}

async function getSentenceAudio(sentenceId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const rows = await dbAll(
    db,
    `
    SELECT
      sa.sentence_id,
      sa.is_default,
      a.*
    FROM sentence_audio sa
    JOIN audio_assets a ON a.id = sa.audio_id
    WHERE sa.sentence_id = ?
    ORDER BY sa.is_default DESC, a.last_used_at DESC, a.created_at DESC;
    `,
    [String(sentenceId)]
  );
  return rows || [];
}

async function getTextAudio(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const rows = await dbAll(
    db,
    `
    SELECT
      ta.text_id,
      ta.is_default,
      a.*
    FROM text_audio ta
    JOIN audio_assets a ON a.id = ta.audio_id
    WHERE ta.text_id = ?
    ORDER BY ta.is_default DESC, a.last_used_at DESC, a.created_at DESC;
    `,
    [String(textId)]
  );
  return rows || [];
}

module.exports = {
  upsertAudioAsset,
  getAudioAssetByKey,
  touchAudioAsset,
  linkSentenceAudio,
  linkTextAudio,
  getSentenceAudio,
  getTextAudio,
};
