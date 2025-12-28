"use strict";

const crypto = require("crypto");
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

async function listTexts({ limit = 15, includeArchived = false }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const lim = Math.max(1, Math.min(200, Number(limit) || 15));
  const where = includeArchived ? "1=1" : "is_archived = 0";

  return dbAll(
    db,
    `
    SELECT
      id, text_key, title, level, tags_json,
      source, topic, is_pinned, pin_order,
      is_archived, created_at, updated_at, last_opened_at
    FROM texts
    WHERE ${where}
    ORDER BY COALESCE(last_opened_at, updated_at) DESC, updated_at DESC
    LIMIT ?;
    `,
    [lim]
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
  listTexts,
  getTextById,
  getSentencesByTextId,
  touchTextOpened,
  archiveTextById,
  deleteTextById,

  // Week9 dashboard meta
  updateTextMeta,
};

