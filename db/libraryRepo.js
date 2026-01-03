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
        tagsJson || null,
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
        tagsJson || null,
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

  return dbAll(
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
}

async function getTextById(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  return dbGet(
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
}

async function getSentencesByTextId(textId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  return dbAll(
    db,
    `
    SELECT
      id, text_id, order_index,
      he_plain, he_niqqud, translit, ru,
      row_hash, meta_json, created_at
    FROM sentences
    WHERE text_id = ?
    ORDER BY order_index ASC;
    `,
    [textId]
  );
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
  if (Object.prototype.hasOwnProperty.call(p, "tagsJson")) {
    const v = (p.tagsJson == null) ? null : String(p.tagsJson).trim();
    fields.push("tags_json = ?");
    params.push(v === "" ? null : v);
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
  touchTextOpened,
  archiveTextById,
  deleteTextById,

  // Week9 dashboard meta
  updateTextMeta,
};
