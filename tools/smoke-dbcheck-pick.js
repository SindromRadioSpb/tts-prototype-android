"use strict";

const sqlite3 = require("sqlite3").verbose();

const dbPath = process.argv[2];

if (!dbPath) {
  console.error("Usage: node tools/smoke-dbcheck-pick.js <dbPath>");
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("OPEN_DB_ERROR:", err.message);
    process.exit(1);
  }
});

function get(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

(async () => {
  try {
    // Пытаемся найти "хороший" пример: asset_key, связанный с sentence_audio, и (если есть) text_audio.
    // Если данных нет — вернём безопасные дефолты, чтобы step8_2-db-check мог выполниться
    // и хотя бы проверил наличие таблиц/запросов (структурный smoke-check).
    const row = await get(
      `
      SELECT
        a.asset_key AS assetKey,
        sa.sentence_id AS sentenceId,
        COALESCE(ta.text_id, '0') AS textId
      FROM audio_assets a
      JOIN sentence_audio sa ON sa.audio_id = a.id
      LEFT JOIN text_audio ta ON ta.audio_id = a.id
      ORDER BY
        sa.is_default DESC,
        a.last_used_at DESC,
        a.created_at DESC
      LIMIT 1;
      `,
      []
    );

    if (row && row.assetKey && row.sentenceId) {
      process.stdout.write(`${row.assetKey}\t${row.sentenceId}\t${row.textId || "0"}`);
      process.exit(0);
    }

    // Фолбэк: данных нет, но таблицы существуют.
    // Возвращаем значения, которые не сломают запросы.
    process.stdout.write(`__NO_ASSET__\t0\t0`);
    process.exit(0);
  } catch (e) {
    // Если упали из-за отсутствующих таблиц/колонок — это уже реальная проблема схемы, пусть будет non-zero.
    console.error("PICK_ERROR:", e.message);
    process.exit(2);
  } finally {
    db.close();
  }
})();
