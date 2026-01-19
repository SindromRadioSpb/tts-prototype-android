"use strict";

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { containsHebrew } = require("./hebrewNorm");
const { generateSnippetForFields } = require("./searchUtils");

function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeIsoZ(x) {
  if (!x) return null;
  const s = String(x);
  // already ISO-ish
  if (s.includes("T")) return s;
  // sqlite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
    return s.replace(" ", "T") + "Z";
  }
  return s;
}

function escapeLikeNeedle(s) {
  // Escape LIKE wildcards; use with "... LIKE ? ESCAPE '\\'"
  return String(s || "").replace(/[\\%_]/g, "\\$&");
}

function splitNeedleTokens(q) {
  if (Array.isArray(q)) {
    return q
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 16);
  }
  const s = String(q || "").trim();
  if (!s) return [];
  return s
    .split(/\s+/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 16);
}

// Back-compat with W9 tags canonicalization:
// - DB stores tags_json as JSON array string
// - DTO exposes tags: string[]
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

function makeErr(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

async function assertDbReady() {
  const db = getDb();
  if (!db) throw makeErr("DB_NOT_AVAILABLE", "DB_NOT_AVAILABLE");
  return db;
}

async function assertSentenceBelongsToText(db, textId, sentenceId) {
  const row = await dbGet(
    db,
    `SELECT 1 AS ok
       FROM sentences
      WHERE id = ? AND text_id = ?
      LIMIT 1;`,
    [sentenceId, textId]
  );
  if (!row) throw makeErr("SENTENCE_NOT_IN_TEXT", "SENTENCE_NOT_IN_TEXT");
}

// -----------------------------
// Public API (Wave A)
// -----------------------------

// Optional helper (not required by server.js, but useful)
async function getNoteBySentenceId(sentenceId) {
  const db = await assertDbReady();
  const row = await dbGet(
    db,
    `SELECT id, text_id, sentence_id, note, created_at, updated_at
       FROM sentence_notes
      WHERE sentence_id = ?
      LIMIT 1;`,
    [String(sentenceId)]
  );
  return row || null;
}

// server.js-compatible + object-style compatible
async function getNote(textIdOrObj, sentenceIdMaybe) {
  let textId = null;
  let sentenceId = null;

  if (textIdOrObj && typeof textIdOrObj === "object") {
    textId = String(textIdOrObj.textId || textIdOrObj.text_id || "");
    sentenceId = String(textIdOrObj.sentenceId || textIdOrObj.sentence_id || "");
  } else {
    textId = String(textIdOrObj || "");
    sentenceId = String(sentenceIdMaybe || "");
  }

  const db = await assertDbReady();
  const row = await dbGet(
    db,
    `SELECT id, text_id, sentence_id, note, created_at, updated_at
       FROM sentence_notes
      WHERE text_id = ? AND sentence_id = ?
      LIMIT 1;`,
    [textId, sentenceId]
  );
  return row || null;
}

async function upsertNote(arg1, arg2, arg3) {
  let textId = null;
  let sentenceId = null;
  let note = null;

  if (arg1 && typeof arg1 === "object") {
    textId = String(arg1.textId || arg1.text_id || "");
    sentenceId = String(arg1.sentenceId || arg1.sentence_id || "");
    note = String(arg1.note ?? "");
  } else {
    textId = String(arg1 || "");
    sentenceId = String(arg2 || "");
    note = String(arg3 ?? "");
  }

  const db = await assertDbReady();

  // hard guard: 404 должен быть возможен на уровне API (sentence не принадлежит text)
  await assertSentenceBelongsToText(db, textId, sentenceId);

  const id = uuidv4();
  const now = nowIso();

  await dbRun(
    db,
    `
    INSERT INTO sentence_notes (id, text_id, sentence_id, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(text_id, sentence_id) DO UPDATE SET
      note = excluded.note,
      updated_at = excluded.updated_at;
    `,
    [id, textId, sentenceId, note, now, now]
  );

  // возвращаем актуальную строку
  return await getNote(textId, sentenceId);
}

async function deleteNote(arg1, arg2) {
  let textId = null;
  let sentenceId = null;

  if (arg1 && typeof arg1 === "object") {
    textId = String(arg1.textId || arg1.text_id || "");
    sentenceId = String(arg1.sentenceId || arg1.sentence_id || "");
  } else {
    textId = String(arg1 || "");
    sentenceId = String(arg2 || "");
  }

  const db = await assertDbReady();

  // 404 semantics: sentenceId не принадлежит textId
  await assertSentenceBelongsToText(db, textId, sentenceId);

  await dbRun(
    db,
    `DELETE FROM sentence_notes WHERE text_id = ? AND sentence_id = ?;`,
    [textId, sentenceId]
  );

  return { ok: true };
}

async function listNotesByTextId(textId) {
  const db = await assertDbReady();

  // Важно: join через sentences, чтобы гарантировать принадлежность sentence -> text
  const rows = await dbAll(
    db,
    `
    SELECT
      n.sentence_id AS sentence_id,
      n.note AS note,
      n.updated_at AS updated_at
    FROM sentences s
    JOIN sentence_notes n
      ON n.sentence_id = s.id
     AND n.text_id = s.text_id
    WHERE s.text_id = ?
    ORDER BY (s.order_index) ASC;
    `,
    [String(textId)]
  );

  return Array.isArray(rows) ? rows : [];
}

// --------------------------------------------------------
// Wave D (D1): Search in sentence_notes (LIKE v1)
// - token parsing is handled at API/UI level; repo expects already-extracted filters.
// - returns DTO-ish rows (camelCase + tags[]), ready for /api/notes/search
// --------------------------------------------------------
async function searchNotes({
  q,
  includeArchived = false,
  level = null,
  tagTokens = [],
  tagMode = "all",
  topicNeedle = null,
  limit = 50,
  offset = 0,
} = {}) {
  const db = await assertDbReady();

  const qTokens = splitNeedleTokens(q);
  if (!qTokens.length) return [];

  const lim0 = Number(limit);
  const off0 = Number(offset);
  const lim = Number.isFinite(lim0) ? Math.max(0, Math.min(200, Math.trunc(lim0))) : 50;
  const off = Number.isFinite(off0) ? Math.max(0, Math.trunc(off0)) : 0;

  const lvl = (level == null || String(level).trim() === "") ? null : String(level).trim();
  const topic = (topicNeedle == null || String(topicNeedle).trim() === "") ? null : String(topicNeedle).trim();

  const tagsRaw = Array.isArray(tagTokens) ? tagTokens : [];
  const tags = tagsRaw
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 50);

  const mode = (String(tagMode || "all").toLowerCase() === "any") ? "any" : "all";

  const where = [];
  const params = [];

  // Note match: AND all free-text tokens
  for (const tok of qTokens) {
    const needle = escapeLikeNeedle(tok);
    where.push(`n.note LIKE ? ESCAPE '\\'`);
    params.push(`%${needle}%`);
  }

  if (!includeArchived) {
    where.push(`t.is_archived = 0`);
  }

  if (lvl) {
    where.push(`t.level = ?`);
    params.push(lvl);
  }

  if (topic) {
    where.push(`LOWER(COALESCE(t.topic, '')) LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLikeNeedle(topic.toLowerCase())}%`);
  }

  if (tags.length) {
  const mkNeedles = (tg) => {
    const s = String(tg || "").trim();
    if (!s) return [];

    const base = (s[0] === "#") ? s.slice(1) : s;

    // variants: exact as provided, base without '#', and with '#'
    const variants = [];
    const add = (x) => {
      const v = String(x || "").trim();
      if (!v) return;
      if (!variants.includes(v)) variants.push(v);
    };

    add(s);
    add(base);
    add("#" + base);

    // JSON-array needle form: '"tag"'
    return variants.map((v) => `"${v.replace(/"/g, '\\"')}"`);
  };

  if (mode === "any") {
    const ors = [];
    for (const tg of tags) {
      const needles = mkNeedles(tg);
      if (!needles.length) continue;

      const sub = [];
      for (const jsonNeedle of needles) {
        sub.push(`t.tags_json LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLikeNeedle(jsonNeedle)}%`);
      }
      ors.push(`(${sub.join(" OR ")})`);
    }
    if (ors.length) where.push(`(${ors.join(" OR ")})`);
  } else {
    for (const tg of tags) {
      const needles = mkNeedles(tg);
      if (!needles.length) continue;

      const sub = [];
      for (const jsonNeedle of needles) {
        sub.push(`t.tags_json LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLikeNeedle(jsonNeedle)}%`);
      }
      where.push(`(${sub.join(" OR ")})`);
    }
  }
}

  const sql = `
    SELECT
      t.id          AS text_id,
      s.id          AS sentence_id,
      s.order_index AS order_index,

      n.note        AS note,
      n.updated_at  AS note_updated_at,

      s.he_plain    AS sentence_text,

      t.title       AS title,
      t.level       AS level,
      t.topic       AS topic,
      t.source      AS source,
      t.tags_json   AS tags_json
    FROM sentence_notes n
    JOIN sentences s
      ON s.id = n.sentence_id
     AND s.text_id = n.text_id
    JOIN texts t
      ON t.id = n.text_id
    WHERE ${where.length ? where.join(" AND ") : "1=1"}
    ORDER BY
      n.updated_at DESC,
      t.updated_at DESC,
      s.order_index ASC
    LIMIT ?
    OFFSET ?;
  `;

  const rows = await dbAll(db, sql, [...params, lim, off]);

  // PATCH-05: Reconstruct original query from tokens for snippet generation
  const originalQuery = qTokens.join(" ");
  const queryHasHebrew = containsHebrew(originalQuery);

  return (rows || []).map((r) => {
    const tags2 = parseTagsJson(r.tags_json);

    // PATCH-05: Generate snippet and highlights for note content
    const snippetResult = generateSnippetForFields(
      {
        note: r.note,
        sentenceText: r.sentence_text,
      },
      originalQuery,
      { useHebrewNorm: queryHasHebrew }
    );

    return {
      textId: String(r.text_id || ""),
      sentenceId: String(r.sentence_id || ""),
      orderIndex: Number.isFinite(Number(r.order_index)) ? Number(r.order_index) : null,

      note: String(r.note ?? ""),
      noteUpdatedAt: normalizeIsoZ(r.note_updated_at),

      sentenceText: String(r.sentence_text ?? ""),

      title: String(r.title ?? ""),
      level: (r.level == null ? null : String(r.level)),
      topic: (r.topic == null ? null : String(r.topic)),
      source: (r.source == null ? null : String(r.source)),

      tags: tags2,
      tags_json: JSON.stringify(tags2),

      // PATCH-05: Snippet and highlights
      snippet: snippetResult.snippet,
      snippetField: snippetResult.snippetField,
      highlights: snippetResult.highlights,
    };
  });
}

// --------------------------------------------------------
// PATCH-03: Get note with full context for NAV resolver
// Returns note with textId and sentenceId for deep link resolution
// --------------------------------------------------------
async function getNoteWithContext(noteId) {
  const db = await assertDbReady();

  if (!noteId) return null;

  const row = await dbGet(
    db,
    `
    SELECT
      n.id          AS noteId,
      n.text_id     AS textId,
      n.sentence_id AS sentenceId,
      n.note        AS note,
      n.updated_at  AS updatedAt
    FROM sentence_notes n
    WHERE n.id = ?
    LIMIT 1;
    `,
    [String(noteId)]
  );

  if (!row) return null;

  return {
    noteId: row.noteId,
    textId: row.textId,
    sentenceId: row.sentenceId,
    note: row.note || "",
    updatedAt: row.updatedAt || null,
  };
}

module.exports = {
  listNotesByTextId,
  getNote,
  upsertNote,
  deleteNote,
  getNoteBySentenceId,
  searchNotes,
  getNoteWithContext,
};
