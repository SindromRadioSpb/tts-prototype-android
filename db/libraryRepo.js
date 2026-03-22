"use strict";

const crypto = require("crypto");

function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

const { getDb } = require("./sqlite");
const { normalizeHebrew, normalizeQuery, containsHebrew } = require("./hebrewNorm");
const { generateSnippetForFields } = require("./searchUtils");

function dbExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
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

function normalizeSourceText(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function stableJson(x) {
  // детерминированная сериализация для ключей
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x, Object.keys(x).sort());
  } catch {
    return String(x);
  }
}

function computeTextKey({ sourceText, ttsProfile, tableModelMeta }) {
  const payload = {
    v: 1,
    sourceText: normalizeSourceText(sourceText),
    ttsProfile: ttsProfile || null,
    tableModelMeta: tableModelMeta || null,
  };
  const raw = JSON.stringify(payload);
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function guessTitle(sourceText) {
  const t = normalizeSourceText(sourceText);
  if (!t) return "Untitled";
  const firstLine = t.split("\n").map((s) => s.trim()).find(Boolean) || t;
  const sliced = firstLine.slice(0, 80);
  return sliced || "Untitled";
}

// ------------------------------
// W9-TAGS-API-01: tags_json helpers
// Canon: tags_json is always JSON array string, never NULL.
// DTO: always exposes tags: string[]
// ------------------------------
function parseTagsJson(input) {
  if (input == null) return [];

  let arr = null;

  if (Array.isArray(input)) {
    arr = input;
  } else {
    const s0 = String(input || "").trim();
    if (!s0) return [];

    // Prefer JSON array if it looks like one
    if (s0[0] === "[") {
      try {
        const x = JSON.parse(s0);
        if (Array.isArray(x)) arr = x;
      } catch (_) {}
    }

    // Sometimes could be a JSON string or other legacy
    if (!arr) {
      try {
        const x = JSON.parse(s0);
        if (Array.isArray(x)) arr = x;
        else if (typeof x === "string") arr = [x];
      } catch (_) {}
    }

    // Fallback: treat as CSV if it contains comma, else as a single tag
    if (!arr) {
      arr = s0.includes(",") ? s0.split(",") : [s0];
    }
  }

  // Normalize: trim, truncate<=48, dedupe by lower-case key, limit<=50
  const out = [];
  const seen = new Set();

  for (const it of arr) {
    let t = String(it || "").trim();
    if (!t) continue;

    if (t.length > 48) t = t.slice(0, 48).trim();
    if (!t) continue;

    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);

    out.push(t);
    if (out.length >= 50) break;
  }

  return out;
}

function canonicalTagsJson(input) {
  return JSON.stringify(parseTagsJson(input));
}

function withTagsDto(row) {
  if (!row) return row;
  const tags = parseTagsJson(row.tags_json);
  // Back-compat hygiene: ensure tags_json is never null in DTO
  const tags_json = JSON.stringify(tags);
  return { ...row, tags, tags_json };
}

async function createTextWithSentences({
  id,
  textKey,
  title,
  level,
  tagsJson,
  sourceText,
  sourceMetaJson,
  ttsProfileJson,
  tableModelMetaJson,

  // Week9 dashboard meta (optional)
  source,
  topic,
  isPinned,
  pinOrder,

  rows,
}) {

  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = id;
  const now = nowIso();

  await dbExec(db, "BEGIN IMMEDIATE;");
  try {
    await dbRun(
      db,
         `
      INSERT INTO texts (
        id, text_key, title, level, tags_json,
        source_text, source_meta_json,
        tts_profile_json, table_model_meta_json,

        source, topic, is_pinned, pin_order,

        is_archived, created_at, updated_at, last_opened_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL);
      `,
      [
        tId,
        textKey,
        title,
        level || null,
        canonicalTagsJson(tagsJson),
        sourceText,
        sourceMetaJson || null,
        ttsProfileJson || null,
        tableModelMetaJson || null,

        (source == null ? null : String(source)),
        (topic == null ? null : String(topic)),
        isPinned ? 1 : 0,
        (pinOrder == null ? null : Number(pinOrder)),

        now,
        now,
      ]
    );

    const insertSentenceSql = `
      INSERT INTO sentences (
        id, text_id, order_index,
        he_plain, he_niqqud, translit, ru,
        row_hash, meta_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const sId = r.id;
      await dbRun(db, insertSentenceSql, [
        sId,
        tId,
        i,
        r.he_plain || "",
        r.he_niqqud || "",
        r.translit || "",
        r.ru || "",
        r.row_hash || null,
        r.meta_json || null,
        now,
      ]);
    }

    await dbExec(db, "COMMIT;");
  } catch (err) {
    try {
      await dbExec(db, "ROLLBACK;");
    } catch (_) {}
    throw err;
  }

  return getTextById(tId);
}

async function updateTextWithSentences({
  // Back-compat: server may pass `id` (preferred), older code may pass `textId`
  id,
  textId,

  textKey,
  title,
  level,
  tagsJson,
  sourceText,
  sourceMetaJson,
  ttsProfileJson,
  tableModelMetaJson,

  // Week9 dashboard meta
  source,
  topic,

  rows,
}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const tId = id || textId;
  if (!tId) {
    const err = new Error("NOT_FOUND");
    err.code = "NOT_FOUND";
    throw err;
  }

  // Ensure text exists
  const existingText = await getTextById(tId);
  if (!existingText) {
    const err = new Error("NOT_FOUND");
    err.code = "NOT_FOUND";
    throw err;
  }

  const now = nowIso();

  // Load existing sentences to preserve ids when possible (critical for sentence_audio / Notes)
  const existingSentences = await dbAll(
    db,
    `
      SELECT id, row_hash, order_index
        FROM sentences
       WHERE text_id = ?
       ORDER BY order_index ASC;
    `,
    [tId]
  );

  const existingIds = [];
  const hashQueues = new Map(); // row_hash -> queue of ids (handles duplicates by preserving multiplicity)
  let existingWithHash = 0;

  for (const s of existingSentences || []) {
    existingIds.push(s.id);

    const h = String(s.row_hash || "").trim();
    if (!h) continue; // legacy rows may have NULL/empty hashes
    existingWithHash++;

    if (!hashQueues.has(h)) hashQueues.set(h, []);
    hashQueues.get(h).push(s.id);
  }

  // Heuristic: if most existing sentences have no hash, prefer index-based reuse
  const preferIndexReuse = (existingIds.length > 0)
    ? (existingWithHash < Math.floor(existingIds.length * 0.6))
    : false;

  const usedIds = new Set();

  // Plan: reuse ids where possible (hash first, then index fallback)
  const planned = (rows || []).map((r, idx) => {
    const row_hash = String(r && r.row_hash ? r.row_hash : "").trim();

    let reuseId = null;

    if (row_hash) {
      const q = hashQueues.get(row_hash);
      const cand = (q && q.length) ? q.shift() : null;
      if (cand && !usedIds.has(cand)) reuseId = cand;
    }

    if (!reuseId && preferIndexReuse && (existingSentences && idx < existingSentences.length)) {
      const cand = existingSentences[idx] ? existingSentences[idx].id : null;
      if (cand && !usedIds.has(cand)) reuseId = cand;
    }

    if (reuseId) usedIds.add(reuseId);

    const providedId = (r && r.id) ? String(r.id) : null;

    return {
      reuseId,
      newId: reuseId ? null : (providedId || uuidv4()),
      order_index: idx,
      he_plain: String(r && r.he_plain ? r.he_plain : ""),
      he_niqqud: String(r && r.he_niqqud ? r.he_niqqud : ""),
      translit: String(r && r.translit ? r.translit : ""),
      ru: String(r && r.ru ? r.ru : ""),
      row_hash: row_hash || null,
      meta_json: (r && r.meta_json != null) ? String(r.meta_json) : null,
    };
  });

  await dbExec(db, "BEGIN IMMEDIATE;");
  try {
    // Update text row (do not touch pin/archive fields)
    await dbRun(
      db,
      `
        UPDATE texts
           SET text_key = ?,
               title = ?,
               level = ?,
               tags_json = ?,
               source_text = ?,
               source_meta_json = ?,
               tts_profile_json = ?,
               table_model_meta_json = ?,
               source = ?,
               topic = ?,
               updated_at = ?
         WHERE id = ?;
      `,
      [
        textKey,
        title,
        level || null,
        canonicalTagsJson(tagsJson),
        sourceText,
        sourceMetaJson || null,
        ttsProfileJson || null,
        tableModelMetaJson || null,
        (source == null ? null : String(source)),
        (topic == null ? null : String(topic)),
        now,
        tId,
      ]
    );

	// Avoid UNIQUE(text_id, order_index) collisions while reordering/upserting sentences.
// We preserve sentence IDs (for sentence_audio and future Notes/SRS), so we cannot do wholesale delete+reinsert.
// Strategy: temporarily shift all existing order_index values out of the 0..N range, then write final indices.
const SHIFT = 1000000;
await dbRun(db, `UPDATE sentences SET order_index = order_index + ? WHERE text_id = ?;`, [SHIFT, tId]);
	
    // Update reused sentences / insert new sentences
    for (const r of planned) {
      if (r.reuseId) {
        await dbRun(
          db,
          `
            UPDATE sentences
               SET order_index = ?,
                   he_plain = ?,
                   he_niqqud = ?,
                   translit = ?,
                   ru = ?,
                   row_hash = ?,
                   meta_json = ?
             WHERE id = ?
               AND text_id = ?;
          `,
          [
            r.order_index,
            r.he_plain,
            r.he_niqqud,
            r.translit,
            r.ru,
            r.row_hash,
            r.meta_json,
            r.reuseId,
            tId,
          ]
        );
      } else {
        await dbRun(
          db,
          `
            INSERT INTO sentences (
              id, text_id, order_index,
              he_plain, he_niqqud, translit, ru,
              row_hash, meta_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            r.newId,
            tId,
            r.order_index,
            r.he_plain,
            r.he_niqqud,
            r.translit,
            r.ru,
            r.row_hash,
            r.meta_json,
            now,
          ]
        );
      }
    }

    // Delete only sentences that are no longer present
    if (existingIds.length > 0) {
      const keepSet = usedIds; // reused sentence ids
      const toDelete = existingIds.filter((sid) => !keepSet.has(sid));

            if (toDelete.length > 0) {
        const ph = toDelete.map(() => "?").join(",");

        // Optional table: sentence_audio (present only in some branches).
        // If it does not exist, ignore the error.
        try {
          await dbRun(
            db,
            `DELETE FROM sentence_audio WHERE sentence_id IN (${ph});`,
            [...toDelete]
          );
        } catch (e) {
          const msg = String((e && e.message) ? e.message : "");
          const msgLc = msg.toLowerCase();
          if (!(msgLc.includes("no such table") && msgLc.includes("sentence_audio"))) {
            throw e;
          }
        }

        // W10-NOTES-01: Optional table sentence_notes (ignore if not migrated yet).
        // Delete notes BEFORE deleting sentences to avoid orphans even if FK cascades are off.
        try {
          await dbRun(
            db,
            `DELETE FROM sentence_notes WHERE sentence_id IN (${ph});`,
            [...toDelete]
          );
        } catch (e) {
          const msg = String((e && e.message) ? e.message : "");
          const msgLc = msg.toLowerCase();
          if (!(msgLc.includes("no such table") && msgLc.includes("sentence_notes"))) {
            throw e;
          }
        }

        await dbRun(
          db,
          `
            DELETE FROM sentences
             WHERE text_id = ?
               AND id IN (${ph});
          `,
          [tId, ...toDelete]
        );
      }
    }

    await dbExec(db, "COMMIT;");
  } catch (err) {
    try { await dbExec(db, "ROLLBACK;"); } catch (_) {}
    throw err;
  }

  return getTextById(tId);
}

async function listTexts({ limit = 15, includeArchived = false, q = null, level = null, tags = null } = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const lim = Math.max(1, Math.min(200, Number(limit) || 15));

  const whereParts = [];
  const params = [];

  if (!includeArchived) whereParts.push("is_archived = 0");
  else whereParts.push("1=1");

  // Optional strict level filter (case-insensitive)
  if (level != null && String(level).trim()) {
    whereParts.push("LOWER(COALESCE(level,'')) = LOWER(?)");
    params.push(String(level).trim());
  }

  // Optional tags filter: tags can be "a,b,c" OR ["a","b"] OR "a" (repeatable query param).
  let tagArr = [];
  if (Array.isArray(tags)) tagArr = tags;
  else if (typeof tags === "string") tagArr = tags.split(",");
  else if (tags != null) tagArr = [String(tags)];

  const tagNorm = [];
  const seen = new Set();
  for (let i = 0; i < tagArr.length; i++) {
    const raw = String(tagArr[i] || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tagNorm.push(raw);
    if (tagNorm.length >= 25) break;
  }

  // Every tag is required (AND), match via JSON quoted token: %"tag"%.
  for (let i = 0; i < tagNorm.length; i++) {
    const t = tagNorm[i];
    whereParts.push("COALESCE(tags_json,'') LIKE ?");
    params.push("%" + JSON.stringify(t) + "%");
  }

  // Optional free-text query across title/source/topic/level/tags_json (case-insensitive).
  const qRaw = (q == null) ? "" : String(q).trim();
  if (qRaw) {
    const pat = "%" + qRaw.toLowerCase() + "%";
    whereParts.push(`(
      LOWER(COALESCE(title,'')) LIKE ?
      OR LOWER(COALESCE(source,'')) LIKE ?
      OR LOWER(COALESCE(topic,'')) LIKE ?
      OR LOWER(COALESCE(level,'')) LIKE ?
      OR LOWER(COALESCE(tags_json,'')) LIKE ?
    )`);
    params.push(pat, pat, pat, pat, pat);
  }

  const whereSql = whereParts.length ? whereParts.join(" AND ") : "1=1";

  params.push(lim);

    const rows = await dbAll(
    db,
    `
    SELECT
      id, text_key, title, level, tags_json,
      source, topic, is_pinned, pin_order,
      is_archived, created_at, updated_at, last_opened_at
    FROM texts
    WHERE ${whereSql}
    ORDER BY COALESCE(last_opened_at, updated_at) DESC, updated_at DESC
    LIMIT ?;
    `,
    params
  );

  return (rows || []).map(withTagsDto);
}

async function getTextById(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

    const row = await dbGet(
    db,
    `
    SELECT
      id, text_key, title, level, tags_json,
      source_text, source_meta_json,
      tts_profile_json, table_model_meta_json,

      source, topic, is_pinned, pin_order,

      is_archived, created_at, updated_at, last_opened_at
    FROM texts
    WHERE id = ?;
    `,
    [textId]
  );

  return withTagsDto(row);
}

async function getSentencesByTextId(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  // PRO: avoid duplicates even if legacy data had multiple is_default=1 rows.
  // Use correlated subqueries with LIMIT 1 to pick a single "best" default audio.
  return dbAll(
    db,
    `
    SELECT
      s.id         AS id,
      s.text_id    AS text_id,
      s.order_index AS order_index,
      s.he_plain   AS he_plain,
      s.he_niqqud  AS he_niqqud,
      s.translit   AS translit,
      s.ru         AS ru,
      s.row_hash   AS row_hash,
      s.meta_json  AS meta_json,
      s.created_at AS created_at,

      COALESCE((
        SELECT a.asset_key
        FROM sentence_audio sa
        JOIN audio_assets a ON a.id = sa.audio_id
        WHERE sa.sentence_id = s.id
          AND sa.is_default = 1
        ORDER BY a.last_used_at DESC, a.created_at DESC
        LIMIT 1
      ), '') AS audio_asset_key,

      COALESCE((
        SELECT a.tts_profile_json
        FROM sentence_audio sa
        JOIN audio_assets a ON a.id = sa.audio_id
        WHERE sa.sentence_id = s.id
          AND sa.is_default = 1
        ORDER BY a.last_used_at DESC, a.created_at DESC
        LIMIT 1
      ), '') AS audio_tts_profile_json

    FROM sentences s
    WHERE s.text_id = ?
    ORDER BY s.order_index ASC;
    `,
    [String(textId)]
  );
}

// --------------------------------------------------------
// Wave D (Premium PRO): Rows Search (E1.1) — LIKE v1
// --------------------------------------------------------
async function searchSentences({
  q,
  includeArchived = false,
  level = null,
  tagTokens = null,
  tagMode = "all",
  topicNeedle = null,
  limit = 50,
  offset = 0,
} = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const qRaw = (q == null) ? "" : String(q).trim();

  // Guard: do not scan all rows
  if (!qRaw) return [];
  if (qRaw.length < 2) return [];

  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const off = Math.max(0, Math.min(5000, Number(offset) || 0));

  const whereParts = [];
  const params = [];

  if (!includeArchived) whereParts.push("t.is_archived = 0");
  else whereParts.push("1=1");

  // Optional strict level filter (case-insensitive)
  if (level != null && String(level).trim()) {
    whereParts.push("LOWER(COALESCE(t.level,'')) = LOWER(?)");
    params.push(String(level).trim());
  }

  // Optional topic filter (substring, case-insensitive)
  if (topicNeedle != null && String(topicNeedle).trim()) {
    const patTopic = "%" + String(topicNeedle).trim().toLowerCase() + "%";
    whereParts.push("LOWER(COALESCE(t.topic,'')) LIKE ?");
    params.push(patTopic);
  }

  // Tags filter (ALL/ANY), supports both "materials" and "#materials" stored forms
  let tagArr = [];
  if (Array.isArray(tagTokens)) tagArr = tagTokens;
  else if (typeof tagTokens === "string") tagArr = tagTokens.split(",");
  else if (tagTokens != null) tagArr = [String(tagTokens)];

  const tagNorm = [];
  const seen = new Set();
  for (let i = 0; i < tagArr.length; i++) {
    let raw = String(tagArr[i] || "").trim();
    if (!raw) continue;
    if (raw[0] === "#") raw = raw.slice(1).trim();
    if (!raw) continue;

    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    tagNorm.push(raw);
    if (tagNorm.length >= 25) break;
  }

  function pushTagGroup(base) {
    const variants = [base, "#" + base];
    const parts = [];
    for (let k = 0; k < variants.length; k++) {
      parts.push("COALESCE(t.tags_json,'') LIKE ?");
      params.push("%" + JSON.stringify(variants[k]) + "%");
    }
    return "(" + parts.join(" OR ") + ")";
  }

  const mode = String(tagMode || "all").trim().toLowerCase();
  if (tagNorm.length) {
    if (mode === "any") {
      const orGroups = [];
      for (let i = 0; i < tagNorm.length; i++) {
        orGroups.push(pushTagGroup(tagNorm[i]));
      }
      whereParts.push("(" + orGroups.join(" OR ") + ")");
    } else {
      // default: ALL
      for (let i = 0; i < tagNorm.length; i++) {
        whereParts.push(pushTagGroup(tagNorm[i]));
      }
    }
  }

  // PATCH-05: Check if query contains Hebrew for normalization
  const queryHasHebrew = containsHebrew(qRaw);
  const queryNorm = queryHasHebrew ? normalizeQuery(qRaw) : qRaw.toLowerCase();

  // Main query across sentence fields (case-insensitive)
  // PATCH-05: Also search he_norm column when query contains Hebrew
  const pat = "%" + qRaw.toLowerCase() + "%";
  const patNorm = "%" + queryNorm + "%";

  if (queryHasHebrew) {
    // When searching Hebrew, prioritize normalized matching
    whereParts.push(`(
      LOWER(COALESCE(s.he_norm,'')) LIKE ?
      OR LOWER(COALESCE(s.he_plain,''))  LIKE ?
      OR LOWER(COALESCE(s.he_niqqud,'')) LIKE ?
      OR LOWER(COALESCE(s.translit,'')) LIKE ?
      OR LOWER(COALESCE(s.ru,''))       LIKE ?
    )`);
    params.push(patNorm, pat, pat, pat, pat);
  } else {
    whereParts.push(`(
      LOWER(COALESCE(s.he_plain,''))  LIKE ?
      OR LOWER(COALESCE(s.he_niqqud,'')) LIKE ?
      OR LOWER(COALESCE(s.translit,'')) LIKE ?
      OR LOWER(COALESCE(s.ru,''))       LIKE ?
    )`);
    params.push(pat, pat, pat, pat);
  }

  const whereSql = whereParts.length ? whereParts.join(" AND ") : "1=1";

  const rows = await dbAll(
    db,
    `
    SELECT
      s.id          AS sentenceId,
      s.text_id     AS textId,
      s.order_index AS orderIndex,

      s.he_plain    AS he_plain,
      s.he_niqqud   AS he_niqqud,
      s.he_norm     AS he_norm,
      s.translit    AS translit,
      s.ru          AS ru,

      t.title       AS title,
      t.level       AS level,
      t.topic       AS topic,
      t.source      AS source,
      t.tags_json   AS tags_json,

      t.is_archived AS is_archived,
      t.created_at  AS created_at,
      t.updated_at  AS updated_at,
      t.last_opened_at AS last_opened_at

    FROM sentences s
    JOIN texts t ON t.id = s.text_id
    WHERE ${whereSql}
    ORDER BY COALESCE(t.last_opened_at, t.updated_at, t.created_at) DESC,
             t.id ASC,
             s.order_index ASC
    LIMIT ? OFFSET ?;
    `,
    [...params, lim, off]
  );

  // PATCH-05: Generate snippet and highlights for each result
  return rows.map(row => {
    const baseDto = withTagsDto(row);

    // Generate snippet and highlights
    const snippetResult = generateSnippetForFields(
      {
        he_plain: row.he_plain,
        he_niqqud: row.he_niqqud,
        ru: row.ru,
        translit: row.translit,
      },
      qRaw,
      { useHebrewNorm: queryHasHebrew }
    );

    return {
      ...baseDto,
      snippet: snippetResult.snippet,
      snippetField: snippetResult.snippetField,
      highlights: snippetResult.highlights,
    };
  });
}

async function getExportRowsByTextId(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  // Export join:
  // sentences + optional notes + optional default sentence audio (asset_key)
  const rows = await dbAll(
    db,
     `
    SELECT
      s.id          AS sentence_id,
      s.order_index AS order_index,
      s.he_plain    AS he_plain,
      s.he_niqqud   AS he_niqqud,
      s.translit    AS translit,
      s.ru          AS ru,
      COALESCE(n.note, '') AS note,

      COALESCE((
        SELECT a.asset_key
        FROM sentence_audio sa
        JOIN audio_assets a ON a.id = sa.audio_id
        WHERE sa.sentence_id = s.id
          AND sa.is_default = 1
        ORDER BY a.last_used_at DESC, a.created_at DESC
        LIMIT 1
      ), '') AS audio_asset_key,

      COALESCE((
        SELECT a.tts_profile_json
        FROM sentence_audio sa
        JOIN audio_assets a ON a.id = sa.audio_id
        WHERE sa.sentence_id = s.id
          AND sa.is_default = 1
        ORDER BY a.last_used_at DESC, a.created_at DESC
        LIMIT 1
      ), '') AS audio_tts_profile_json

    FROM sentences s
    LEFT JOIN sentence_notes n
      ON n.sentence_id = s.id
     AND n.text_id     = s.text_id
    WHERE s.text_id = ?
    ORDER BY s.order_index ASC, s.id ASC;
    `,
    [String(textId)]
  );

  return Array.isArray(rows) ? rows : [];
}

async function touchTextOpened(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const now = nowIso();
  await dbRun(
    db,
    `UPDATE texts SET last_opened_at = ?, updated_at = ? WHERE id = ?;`,
    [now, now, textId]
  );
  return getTextById(textId);
}

async function archiveTextById(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const now = nowIso();
  await dbRun(
    db,
    `UPDATE texts SET is_archived = 1, updated_at = ? WHERE id = ?;`,
    [now, textId]
  );
  return getTextById(textId);
}

async function deleteTextById(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  // CASCADE удалит sentences
  await dbRun(db, `DELETE FROM texts WHERE id = ?;`, [textId]);
  return { ok: true };
}

// --------------------------------------------------------
// PATCH-03: Get sentence by ID for NAV resolver
// Returns sentence with textId for deep link resolution
// --------------------------------------------------------
async function getSentenceById(sentenceId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  if (!sentenceId) return null;

  const row = await dbGet(
    db,
    `
    SELECT
      s.id          AS sentenceId,
      s.text_id     AS textId,
      s.order_index AS orderIndex,
      s.he_plain    AS hePlain,
      s.he_niqqud   AS heNiqqud,
      s.translit    AS translit,
      s.ru          AS ru
    FROM sentences s
    WHERE s.id = ?
    LIMIT 1;
    `,
    [String(sentenceId)]
  );

  if (!row) return null;

  return {
    sentenceId: row.sentenceId,
    textId: row.textId,
    orderIndex: row.orderIndex,
    hePlain: row.hePlain || "",
    heNiqqud: row.heNiqqud || "",
    translit: row.translit || "",
    ru: row.ru || "",
  };
}

async function updateTextMeta(textId, patch) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const p = patch || {};
  const fields = [];
  const params = [];

  // различаем undefined (не трогаем) и null (очистить поле)
  if (Object.prototype.hasOwnProperty.call(p, "title")) {
    const v = (p.title == null) ? null : String(p.title).trim();
    fields.push("title = ?");
    params.push(v === "" ? null : v);
  }

  if (Object.prototype.hasOwnProperty.call(p, "level")) {
    const v = (p.level == null) ? null : String(p.level).trim();
    fields.push("level = ?");
    params.push(v === "" ? null : v);
  }

  // NEW: tags_json
 // NEW: tags_json (canonical: always JSON array string, never NULL)
if (Object.prototype.hasOwnProperty.call(p, "tagsJson")) {
  fields.push("tags_json = ?");
  params.push(canonicalTagsJson(p.tagsJson));
}

  if (Object.prototype.hasOwnProperty.call(p, "source")) {
    const v = (p.source == null) ? null : String(p.source).trim();
    fields.push("source = ?");
    params.push(v === "" ? null : v);
  }

  if (Object.prototype.hasOwnProperty.call(p, "topic")) {
    const v = (p.topic == null) ? null : String(p.topic).trim();
    fields.push("topic = ?");
    params.push(v === "" ? null : v);
  }

  if (Object.prototype.hasOwnProperty.call(p, "isPinned")) {
    const v = p.isPinned;
    const isPinned = (v === true || v === 1 || v === "1");
    fields.push("is_pinned = ?");
    params.push(isPinned ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(p, "pinOrder")) {
    const raw = p.pinOrder;
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      fields.push("pin_order = ?");
      params.push(null);
    } else {
      const n = Number(raw);
      fields.push("pin_order = ?");
      params.push(Number.isFinite(n) ? Math.trunc(n) : null);
    }
  }

  if (fields.length === 0) {
    return getTextById(textId);
  }

  const now = nowIso();
  fields.push("updated_at = ?");
  params.push(now);

  params.push(String(textId));
  await dbRun(db, `UPDATE texts SET ${fields.join(", ")} WHERE id = ?;`, params);

  return getTextById(textId);
}

module.exports = {
  computeTextKey,
  guessTitle,
  createTextWithSentences,
  updateTextWithSentences,
  listTexts,
  getTextById,
  getSentencesByTextId,
  getSentenceById,
  searchSentences,
  getExportRowsByTextId,
  touchTextOpened,
  archiveTextById,
  deleteTextById,

  // Week9 dashboard meta
  updateTextMeta,
};
