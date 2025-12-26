"use strict";

const sqlite3 = require("sqlite3").verbose();

const dbPath = process.argv[2];
const assetKey = process.argv[3];
const sentenceId = process.argv[4];
const textId = process.argv[5];

if (!dbPath || !assetKey || !sentenceId || !textId) {
  console.error("Usage: node tools/step8_2-db-check.js <dbPath> <assetKey> <sentenceId> <textId>");
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("OPEN_DB_ERROR:", err.message);
    process.exit(1);
  }
});

function all(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function get(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

(async () => {
  try {
    console.log("DB:", dbPath);
    console.log("assetKey:", assetKey);
    console.log("sentenceId:", sentenceId);
    console.log("textId:", textId);
    console.log("----");

    // 1) audio_assets exists for assetKey
    const cnt = await get(
      "SELECT COUNT(1) AS cnt FROM audio_assets WHERE asset_key = ?;",
      [assetKey]
    );
    console.log("audio_assets count:", cnt);

    const asset = await get(
      `SELECT id, asset_key, asset_type, relative_path, mime, duration_ms, size_bytes, created_at, last_used_at
       FROM audio_assets
       WHERE asset_key = ?;`,
      [assetKey]
    );
    console.log("audio_assets row:", asset);
    console.log("----");

    // 2) sentence_audio link exists for sentenceId
    const sa = await all(
      "SELECT sentence_id, audio_id, is_default FROM sentence_audio WHERE sentence_id = ? ORDER BY is_default DESC;",
      [sentenceId]
    );
    console.log("sentence_audio rows:", sa);
    console.log("----");

    const saJoin = await all(
      `SELECT sa.sentence_id, sa.audio_id, sa.is_default, a.asset_key, a.relative_path
       FROM sentence_audio sa
       JOIN audio_assets a ON a.id = sa.audio_id
       WHERE sa.sentence_id = ?
       ORDER BY sa.is_default DESC, a.last_used_at DESC, a.created_at DESC;`,
      [sentenceId]
    );
    console.log("sentence_audio JOIN audio_assets:", saJoin);
    console.log("----");

    // 3) text_audio link exists for textId (optional)
    const ta = await all(
      "SELECT text_id, audio_id, is_default FROM text_audio WHERE text_id = ? ORDER BY is_default DESC;",
      [textId]
    );
    console.log("text_audio rows:", ta);
    console.log("----");

    const taJoin = await all(
      `SELECT ta.text_id, ta.audio_id, ta.is_default, a.asset_key, a.relative_path
       FROM text_audio ta
       JOIN audio_assets a ON a.id = ta.audio_id
       WHERE ta.text_id = ?
       ORDER BY ta.is_default DESC, a.last_used_at DESC, a.created_at DESC;`,
      [textId]
    );
    console.log("text_audio JOIN audio_assets:", taJoin);

    const ok1 = (cnt && Number(cnt.cnt) === 1);
    const ok2 = (saJoin && saJoin.some(r => r.asset_key === assetKey));

    console.log("----");
    console.log("PASS criteria:");
    console.log("1) audio_assets count == 1:", ok1);
    console.log("2) sentence_audio join contains assetKey:", ok2);

    process.exit(0);
  } catch (e) {
    console.error("CHECK_ERROR:", e.message);
    process.exit(2);
  } finally {
    db.close();
  }
})();
