"use strict";

// Repo for translation_doc_cache + translation_segment_cache.
// Both tables are keyed by `cache_key` (pipeline-version-aware sha256).
// On read we also bump hit_count + last_hit_at so GC can do LRU-style eviction.

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

// ---------- document cache ----------

async function getDocByKey(cacheKey) {
  const db = getDb();
  if (!db) return null;
  const row = await dbGet(
    db,
    `SELECT cache_key, source_hash, provider, target_lang, segmenter_version,
            nikud_version, translit_profile, translator_version, result_json,
            segments_count, bytes_size, hit_count, last_hit_at, created_at
       FROM translation_doc_cache WHERE cache_key = ?`,
    [cacheKey]
  );
  if (!row) return null;
  await dbRun(
    db,
    `UPDATE translation_doc_cache
        SET hit_count = hit_count + 1, last_hit_at = ?
      WHERE cache_key = ?`,
    [nowIso(), cacheKey]
  ).catch(() => {});
  let rows = [];
  try { rows = JSON.parse(row.result_json); } catch { rows = []; }
  return { ...row, rows };
}

async function putDoc({
  cacheKey,
  sourceHash,
  provider,
  targetLang,
  segmenterVersion,
  nikudVersion,
  translitProfile,
  translatorVersion,
  rows,
}) {
  const db = getDb();
  if (!db) return null;
  const resultJson = JSON.stringify(rows);
  const bytesSize = Buffer.byteLength(resultJson, "utf8");
  await dbRun(
    db,
    `INSERT OR REPLACE INTO translation_doc_cache
       (cache_key, source_hash, provider, target_lang, segmenter_version,
        nikud_version, translit_profile, translator_version, result_json,
        segments_count, bytes_size, hit_count, last_hit_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT hit_count FROM translation_doc_cache WHERE cache_key = ?), 0),
             COALESCE((SELECT last_hit_at FROM translation_doc_cache WHERE cache_key = ?), NULL),
             COALESCE((SELECT created_at FROM translation_doc_cache WHERE cache_key = ?), ?))`,
    [
      cacheKey, sourceHash, provider, targetLang, segmenterVersion,
      nikudVersion, translitProfile, translatorVersion, resultJson,
      rows.length, bytesSize,
      cacheKey, cacheKey, cacheKey, nowIso(),
    ]
  );
  return { cacheKey, bytesSize };
}

// ---------- segment cache ----------

async function getSegments(cacheKeys) {
  const db = getDb();
  if (!db || !cacheKeys.length) return new Map();
  const placeholders = cacheKeys.map(() => "?").join(",");
  const rows = await dbAll(
    db,
    `SELECT cache_key, he, he_niqqud, translit, ru
       FROM translation_segment_cache
      WHERE cache_key IN (${placeholders})`,
    cacheKeys
  );
  const map = new Map();
  for (const r of rows) map.set(r.cache_key, r);
  // Fire-and-forget hit bump.
  if (rows.length) {
    const ts = nowIso();
    const hitPlaceholders = rows.map(() => "?").join(",");
    dbRun(
      db,
      `UPDATE translation_segment_cache
          SET hit_count = hit_count + 1, last_hit_at = ?
        WHERE cache_key IN (${hitPlaceholders})`,
      [ts, ...rows.map((r) => r.cache_key)]
    ).catch(() => {});
  }
  return map;
}

async function putSegment({
  cacheKey,
  heHash,
  he,
  heNiqqud,
  translit,
  ru,
  provider,
  targetLang,
  nikudVersion,
  translitProfile,
  translatorVersion,
}) {
  const db = getDb();
  if (!db) return null;
  await dbRun(
    db,
    `INSERT OR REPLACE INTO translation_segment_cache
       (cache_key, he_hash, he, he_niqqud, translit, ru,
        provider, target_lang, nikud_version, translit_profile, translator_version,
        hit_count, last_hit_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE((SELECT hit_count FROM translation_segment_cache WHERE cache_key = ?), 0),
             COALESCE((SELECT last_hit_at FROM translation_segment_cache WHERE cache_key = ?), NULL),
             COALESCE((SELECT created_at FROM translation_segment_cache WHERE cache_key = ?), ?))`,
    [
      cacheKey, heHash, he, heNiqqud || null, translit || null, ru || null,
      provider, targetLang, nikudVersion, translitProfile, translatorVersion,
      cacheKey, cacheKey, cacheKey, nowIso(),
    ]
  );
  return { cacheKey };
}

module.exports = {
  getDocByKey,
  putDoc,
  getSegments,
  putSegment,
};
