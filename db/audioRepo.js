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

async function setSentenceDefaultAudio(sentenceId, audioId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const sId = String(sentenceId);
  const aId = String(audioId);

  await dbRun(db, "BEGIN IMMEDIATE TRANSACTION;");
  try {
    // Ensure a single default per sentence
    await dbRun(db, `UPDATE sentence_audio SET is_default = 0 WHERE sentence_id = ?;`, [sId]);

    await dbRun(
      db,
      `
      INSERT INTO sentence_audio (sentence_id, audio_id, is_default)
      VALUES (?, ?, 1)
      ON CONFLICT(sentence_id, audio_id) DO UPDATE SET
        is_default = 1;
      `,
      [sId, aId]
    );

    await dbRun(db, "COMMIT;");
  } catch (e) {
    try { await dbRun(db, "ROLLBACK;"); } catch (_) {}
    throw e;
  }
}

async function setTextDefaultAudio(textId, audioId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = String(textId);
  const aId = String(audioId);

  await dbRun(db, "BEGIN IMMEDIATE TRANSACTION;");
  try {
    // Ensure a single default per text
    await dbRun(db, `UPDATE text_audio SET is_default = 0 WHERE text_id = ?;`, [tId]);

    await dbRun(
      db,
      `
      INSERT INTO text_audio (text_id, audio_id, is_default)
      VALUES (?, ?, 1)
      ON CONFLICT(text_id, audio_id) DO UPDATE SET
        is_default = 1;
      `,
      [tId, aId]
    );

    await dbRun(db, "COMMIT;");
  } catch (e) {
    try { await dbRun(db, "ROLLBACK;"); } catch (_) {}
    throw e;
  }
}

async function getDefaultSentenceAudioMap(sentenceIds) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ids = Array.isArray(sentenceIds) ? sentenceIds.map((s) => String(s)).filter(Boolean) : [];
  const out = new Map();
  if (!ids.length) return out;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await dbAll(
    db,
    `
    SELECT
      sa.sentence_id AS sentence_id,
      sa.audio_id AS audio_id,
      a.asset_key AS asset_key,
      a.relative_path AS relative_path,
      a.tts_profile_json AS tts_profile_json,
      a.last_used_at AS last_used_at,
      a.created_at AS created_at
    FROM sentence_audio sa
    JOIN audio_assets a ON a.id = sa.audio_id
    WHERE sa.is_default = 1
      AND sa.sentence_id IN (${placeholders})
    ORDER BY sa.sentence_id ASC, a.last_used_at DESC, a.created_at DESC;
    `,
    ids
  );

  for (const r of (rows || [])) {
    const sid = String(r.sentence_id || "");
    if (!sid || out.has(sid)) continue;
    out.set(sid, {
      sentenceId: sid,
      audioId: String(r.audio_id || ""),
      assetKey: String(r.asset_key || ""),
      relativePath: String(r.relative_path || ""),
      ttsProfileJson: (r.tts_profile_json == null ? null : String(r.tts_profile_json)),
    });
  }

  return out;
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

  // link / defaults
  linkSentenceAudio,
  linkTextAudio,
  setSentenceDefaultAudio,
  setTextDefaultAudio,

  // read
  getSentenceAudio,
  getTextAudio,
  getDefaultSentenceAudioMap,
};
