"use strict";

const crypto = require("crypto");

const { getDb } = require("./sqlite");

const DEFAULT_TEMPLATE_CODE = "ru_to_he";

function uuidv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
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

function nowIso() {
  return new Date().toISOString();
}

function todayIsoDate() {
  return nowIso().slice(0, 10);
}

function addDaysIsoDate(isoDate, days) {
  const base = String(isoDate || todayIsoDate()).slice(0, 10);
  const dt = new Date(`${base}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.ceil(Number(days) || 0)));
  return dt.toISOString().slice(0, 10);
}

function clampEase(value) {
  return Math.max(1.3, Number((Number(value) || 0).toFixed(2)));
}

function roundInterval(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function normalizeTemplateCode(templateCode) {
  const code = String(templateCode || DEFAULT_TEMPLATE_CODE).trim();
  return code || DEFAULT_TEMPLATE_CODE;
}

function parseJsonSafe(value, fallback = {}) {
  if (value == null || value === "") return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function mapTemplateRow(row) {
  if (!row) return null;
  return {
    id: row.templateId,
    code: row.templateCode,
    label: row.templateLabel,
    cardKind: row.cardKind,
    promptLang: row.promptLang || null,
    answerLang: row.answerLang || null,
    answerMode: row.answerMode || "reveal",
    isActive: !!Number(row.templateIsActive || 0),
    sortOrder: Number(row.templateSortOrder || 0),
    frontSchema: parseJsonSafe(row.frontSchemaJson, {}),
    backSchema: parseJsonSafe(row.backSchemaJson, {}),
  };
}

function mapSnapshotRow(row) {
  if (!row) return null;
  return {
    sentence: {
      sentenceId: row.sentenceId,
      textId: row.textId,
      orderIndex: row.orderIndex,
      hePlain: row.hePlain || "",
      heNiqqud: row.heNiqqud || "",
      translit: row.translit || "",
      ru: row.ru || "",
      textTitle: row.textTitle || "",
      audioAssetKey: row.audioAssetKey || "",
    },
    card: row.cardId
      ? {
          id: row.cardId,
          entityType: row.entityType,
          entityId: row.entityId,
          templateId: row.templateId,
          sourceSentenceId: row.sourceSentenceId || row.sentenceId,
          sourceNoteId: row.sourceNoteId || null,
          state: row.state,
          dueDate: row.dueDate,
          intervalDays: Number(row.intervalDays || 0),
          easeFactor: Number(row.easeFactor || 0),
          lapses: Number(row.lapses || 0),
          reps: Number(row.reps || 0),
          createdAt: row.cardCreatedAt || null,
          updatedAt: row.cardUpdatedAt || null,
          lastReviewAt: row.lastReviewAt || null,
          isDue: !!row.isDue,
          meta: parseJsonSafe(row.metaJson, {}),
          template: mapTemplateRow(row),
        }
      : null,
  };
}

async function getTemplateByCode(db, templateCode, { includeInactive = false } = {}) {
  const row = await dbGet(
    db,
    `
    SELECT
      id AS templateId,
      code AS templateCode,
      label AS templateLabel,
      card_kind AS cardKind,
      prompt_lang AS promptLang,
      answer_lang AS answerLang,
      front_schema_json AS frontSchemaJson,
      back_schema_json AS backSchemaJson,
      answer_mode AS answerMode,
      is_active AS templateIsActive,
      sort_order AS templateSortOrder
    FROM srs_card_templates
    WHERE code = ?
      ${includeInactive ? "" : "AND is_active = 1"}
    LIMIT 1;
    `,
    [normalizeTemplateCode(templateCode)]
  );
  return mapTemplateRow(row);
}

async function getTemplateById(db, templateId, { includeInactive = false } = {}) {
  const row = await dbGet(
    db,
    `
    SELECT
      id AS templateId,
      code AS templateCode,
      label AS templateLabel,
      card_kind AS cardKind,
      prompt_lang AS promptLang,
      answer_lang AS answerLang,
      front_schema_json AS frontSchemaJson,
      back_schema_json AS backSchemaJson,
      answer_mode AS answerMode,
      is_active AS templateIsActive,
      sort_order AS templateSortOrder
    FROM srs_card_templates
    WHERE id = ?
      ${includeInactive ? "" : "AND is_active = 1"}
    LIMIT 1;
    `,
    [String(templateId || "")]
  );
  return mapTemplateRow(row);
}

async function listTemplates({ includeInactive = false } = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const rows = await dbAll(
    db,
    `
    SELECT
      id AS templateId,
      code AS templateCode,
      label AS templateLabel,
      card_kind AS cardKind,
      prompt_lang AS promptLang,
      answer_lang AS answerLang,
      front_schema_json AS frontSchemaJson,
      back_schema_json AS backSchemaJson,
      answer_mode AS answerMode,
      is_active AS templateIsActive,
      sort_order AS templateSortOrder
    FROM srs_card_templates
    ${includeInactive ? "" : "WHERE is_active = 1"}
    ORDER BY sort_order ASC, code ASC;
    `
  );

  return rows.map(mapTemplateRow);
}

async function resolveTemplate(db, templateCode, templateId) {
  if (templateId) {
    const template = await getTemplateById(db, templateId, { includeInactive: true });
    if (!template) throw new Error("BAD_TEMPLATE");
    return template;
  }
  const template = await getTemplateByCode(db, templateCode, { includeInactive: true });
  if (!template) throw new Error("BAD_TEMPLATE");
  return template;
}

function snapshotBaseSql(whereClause) {
  return `
    SELECT
      s.id            AS sentenceId,
      s.text_id       AS textId,
      s.order_index   AS orderIndex,
      s.he_plain      AS hePlain,
      s.he_niqqud     AS heNiqqud,
      s.translit      AS translit,
      s.ru            AS ru,
      t.title         AS textTitle,
      (
        SELECT aa.asset_key
        FROM sentence_audio sa
        JOIN audio_assets aa ON aa.id = sa.audio_id
        WHERE sa.sentence_id = s.id
        ORDER BY sa.is_default DESC, aa.last_used_at DESC, aa.created_at DESC, sa.rowid DESC
        LIMIT 1
      )               AS audioAssetKey,
      c.id            AS cardId,
      c.entity_type   AS entityType,
      c.entity_id     AS entityId,
      c.template_id   AS templateId,
      c.source_sentence_id AS sourceSentenceId,
      c.source_note_id AS sourceNoteId,
      c.meta_json     AS metaJson,
      c.state         AS state,
      c.due_date      AS dueDate,
      c.interval_days AS intervalDays,
      c.ease_factor   AS easeFactor,
      c.lapses        AS lapses,
      c.reps          AS reps,
      c.created_at    AS cardCreatedAt,
      c.updated_at    AS cardUpdatedAt,
      c.last_review_at AS lastReviewAt,
      tpl.id          AS templateId,
      tpl.code        AS templateCode,
      tpl.label       AS templateLabel,
      tpl.card_kind   AS cardKind,
      tpl.prompt_lang AS promptLang,
      tpl.answer_lang AS answerLang,
      tpl.front_schema_json AS frontSchemaJson,
      tpl.back_schema_json AS backSchemaJson,
      tpl.answer_mode AS answerMode,
      tpl.is_active   AS templateIsActive,
      tpl.sort_order  AS templateSortOrder,
      CASE
        WHEN c.id IS NOT NULL
         AND c.state <> 'suspended'
         AND COALESCE(c.due_date, '9999-12-31') <= ?
        THEN 1 ELSE 0
      END AS isDue
    FROM sentences s
    JOIN texts t ON t.id = s.text_id
    LEFT JOIN srs_cards c ON ${whereClause}
    LEFT JOIN srs_card_templates tpl ON tpl.id = c.template_id
    WHERE s.id = ?
    LIMIT 1;
  `;
}

async function getSentenceCardSnapshot(sentenceId, { templateCode = DEFAULT_TEMPLATE_CODE, templateId = null } = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const sid = String(sentenceId || "").trim();
  if (!sid) throw new Error("BAD_SENTENCE_ID");

  const template = await resolveTemplate(db, templateCode, templateId);
  const row = await dbGet(
    db,
    snapshotBaseSql("c.entity_type = 'sentence' AND c.entity_id = s.id AND c.template_id = ?"),
    [todayIsoDate(), template.id, sid]
  );
  return mapSnapshotRow(row);
}

async function getCardSnapshotById(cardId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const id = String(cardId || "").trim();
  if (!id) throw new Error("BAD_CARD_ID");

  const row = await dbGet(
    db,
    `
    SELECT
      s.id            AS sentenceId,
      s.text_id       AS textId,
      s.order_index   AS orderIndex,
      s.he_plain      AS hePlain,
      s.he_niqqud     AS heNiqqud,
      s.translit      AS translit,
      s.ru            AS ru,
      t.title         AS textTitle,
      (
        SELECT aa.asset_key
        FROM sentence_audio sa
        JOIN audio_assets aa ON aa.id = sa.audio_id
        WHERE sa.sentence_id = s.id
        ORDER BY sa.is_default DESC, aa.last_used_at DESC, aa.created_at DESC, sa.rowid DESC
        LIMIT 1
      )               AS audioAssetKey,
      c.id            AS cardId,
      c.entity_type   AS entityType,
      c.entity_id     AS entityId,
      c.template_id   AS templateId,
      c.source_sentence_id AS sourceSentenceId,
      c.source_note_id AS sourceNoteId,
      c.meta_json     AS metaJson,
      c.state         AS state,
      c.due_date      AS dueDate,
      c.interval_days AS intervalDays,
      c.ease_factor   AS easeFactor,
      c.lapses        AS lapses,
      c.reps          AS reps,
      c.created_at    AS cardCreatedAt,
      c.updated_at    AS cardUpdatedAt,
      c.last_review_at AS lastReviewAt,
      tpl.id          AS templateId,
      tpl.code        AS templateCode,
      tpl.label       AS templateLabel,
      tpl.card_kind   AS cardKind,
      tpl.prompt_lang AS promptLang,
      tpl.answer_lang AS answerLang,
      tpl.front_schema_json AS frontSchemaJson,
      tpl.back_schema_json AS backSchemaJson,
      tpl.answer_mode AS answerMode,
      tpl.is_active   AS templateIsActive,
      tpl.sort_order  AS templateSortOrder,
      CASE
        WHEN c.id IS NOT NULL
         AND c.state <> 'suspended'
         AND COALESCE(c.due_date, '9999-12-31') <= ?
        THEN 1 ELSE 0
      END AS isDue
    FROM srs_cards c
    JOIN sentences s ON s.id = c.entity_id
    JOIN texts t ON t.id = s.text_id
    JOIN srs_card_templates tpl ON tpl.id = c.template_id
    WHERE c.id = ?
    LIMIT 1;
    `,
    [todayIsoDate(), id]
  );

  return mapSnapshotRow(row);
}

async function listSentenceCardSnapshots(sentenceId) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const sid = String(sentenceId || "").trim();
  if (!sid) throw new Error("BAD_SENTENCE_ID");

  const templates = await listTemplates();
  const results = [];
  for (const template of templates) {
    const snapshot = await getSentenceCardSnapshot(sid, { templateId: template.id });
    if (snapshot) results.push(snapshot);
  }
  return results;
}

async function createSentenceCard({ sentenceId, templateCode = DEFAULT_TEMPLATE_CODE, templateId = null }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const sid = String(sentenceId || "").trim();
  if (!sid) throw new Error("BAD_SENTENCE_ID");

  await dbRun(db, "BEGIN IMMEDIATE;");
  try {
    const template = await resolveTemplate(db, templateCode, templateId);
    const existing = await getSentenceCardSnapshot(sid, { templateId: template.id });
    if (!existing) throw new Error("SENTENCE_NOT_FOUND");
    if (existing.card) {
      await dbRun(db, "COMMIT;");
      return existing;
    }

    const today = todayIsoDate();
    const ts = nowIso();
    await dbRun(
      db,
      `
      INSERT INTO srs_cards (
        id, entity_type, entity_id, template_id, source_sentence_id, source_note_id, meta_json,
        state, due_date, interval_days, ease_factor, lapses, reps,
        created_at, updated_at, last_review_at
      ) VALUES (?, 'sentence', ?, ?, ?, NULL, '{}', 'new', ?, 0, 2.5, 0, 0, ?, ?, NULL);
      `,
      [uuidv4(), sid, template.id, sid, today, ts, ts]
    );

    await dbRun(db, "COMMIT;");
    return await getSentenceCardSnapshot(sid, { templateId: template.id });
  } catch (error) {
    await dbRun(db, "ROLLBACK;").catch(() => {});
    throw error;
  }
}

async function generateSentenceCards({ sentenceId, templateCodes = [] }) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const sid = String(sentenceId || "").trim();
  if (!sid) throw new Error("BAD_SENTENCE_ID");

  const codes = Array.isArray(templateCodes) && templateCodes.length
    ? templateCodes.map(normalizeTemplateCode)
    : [DEFAULT_TEMPLATE_CODE];

  const created = [];
  for (const templateCode of codes) {
    created.push(await createSentenceCard({ sentenceId: sid, templateCode }));
  }
  return created;
}

async function insertSentenceCard(db, { sentenceId, templateId }) {
  const sid = String(sentenceId || "").trim();
  const today = todayIsoDate();
  const ts = nowIso();
  const cardId = uuidv4();
  await dbRun(
    db,
    `
    INSERT INTO srs_cards (
      id, entity_type, entity_id, template_id, source_sentence_id, source_note_id, meta_json,
      state, due_date, interval_days, ease_factor, lapses, reps,
      created_at, updated_at, last_review_at
    ) VALUES (?, 'sentence', ?, ?, ?, NULL, '{}', 'new', ?, 0, 2.5, 0, 0, ?, ?, NULL);
    `,
    [cardId, sid, templateId, sid, today, ts, ts]
  );
  return cardId;
}

function computeNextCardState(card, rating) {
  const today = todayIsoDate();
  const beforeInterval = Number(card.intervalDays || 0);
  const beforeEase = Number(card.easeFactor || 2.5);
  const beforeState = String(card.state || "new");

  let state = beforeState;
  let intervalDays = beforeInterval;
  let easeFactor = beforeEase;
  let lapses = Number(card.lapses || 0);

  if (rating === 1) {
    state = beforeState === "review" ? "relearning" : "learning";
    intervalDays = 0;
    lapses += 1;
  } else if (rating === 2) {
    state = "review";
    intervalDays = beforeInterval > 0 ? Math.max(1, roundInterval(beforeInterval * 1.2)) : 1;
    easeFactor = clampEase(beforeEase - 0.15);
  } else if (rating === 3) {
    state = "review";
    intervalDays = beforeInterval > 0 ? Math.max(1, roundInterval(beforeInterval * beforeEase)) : 1;
  } else if (rating === 4) {
    state = "review";
    intervalDays = beforeInterval > 0 ? Math.max(2, roundInterval(beforeInterval * (beforeEase + 0.15))) : 2;
    easeFactor = roundInterval(beforeEase + 0.1);
  } else {
    throw new Error("BAD_RATING");
  }

  return {
    state,
    dueDate: intervalDays <= 0 ? today : addDaysIsoDate(today, intervalDays),
    intervalDays,
    easeFactor,
    lapses,
    reps: Number(card.reps || 0) + 1,
  };
}

async function loadCardForReview(db, { sentenceId, cardId, templateCode, templateId }) {
  if (cardId) {
    const snapshot = await getCardSnapshotById(cardId);
    if (!snapshot || !snapshot.card) throw new Error("CARD_NOT_FOUND");
    return snapshot;
  }

  const sid = String(sentenceId || "").trim();
  if (!sid) throw new Error("BAD_SENTENCE_ID");

  const template = await resolveTemplate(db, templateCode, templateId);
  const snapshot = await getSentenceCardSnapshot(sid, { templateId: template.id });
  if (!snapshot) throw new Error("SENTENCE_NOT_FOUND");
  if (snapshot.card) return snapshot;
  await insertSentenceCard(db, { sentenceId: sid, templateId: template.id });
  return getSentenceCardSnapshot(sid, { templateId: template.id });
}

async function reviewSentenceCard({
  sentenceId,
  cardId = null,
  templateCode = DEFAULT_TEMPLATE_CODE,
  templateId = null,
  rating,
  reviewTimeMs = null,
}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const ratingNum = Number(rating);
  if (![1, 2, 3, 4].includes(ratingNum)) throw new Error("BAD_RATING");

  await dbRun(db, "BEGIN IMMEDIATE;");
  try {
    let snapshot = await loadCardForReview(db, { sentenceId, cardId, templateCode, templateId });
    if (!snapshot || !snapshot.card || !snapshot.sentence) throw new Error("CARD_NOT_FOUND");

    const card = snapshot.card;
    const next = computeNextCardState(card, ratingNum);
    const ts = nowIso();

    await dbRun(
      db,
      `
      UPDATE srs_cards
      SET state = ?,
          due_date = ?,
          interval_days = ?,
          ease_factor = ?,
          lapses = ?,
          reps = ?,
          updated_at = ?,
          last_review_at = ?
      WHERE id = ?;
      `,
      [
        next.state,
        next.dueDate,
        next.intervalDays,
        next.easeFactor,
        next.lapses,
        next.reps,
        ts,
        ts,
        card.id,
      ]
    );

    await dbRun(
      db,
      `
      INSERT INTO srs_review_events (
        id, card_id, rating, interval_before, interval_after,
        ease_before, ease_after, review_time_ms, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        uuidv4(),
        card.id,
        ratingNum,
        Number(card.intervalDays || 0),
        next.intervalDays,
        Number(card.easeFactor || 2.5),
        next.easeFactor,
        reviewTimeMs == null ? null : Math.max(0, Number(reviewTimeMs) || 0),
        ts,
      ]
    );

    await dbRun(db, "COMMIT;");
    return await getCardSnapshotById(card.id);
  } catch (error) {
    await dbRun(db, "ROLLBACK;").catch(() => {});
    throw error;
  }
}

async function listTodayCards({ limit = 25, templateCode = "" } = {}) {
  const db = getDb();
  if (!db) throw new Error("DB_NOT_AVAILABLE");

  const lim = Math.max(1, Math.min(200, Number(limit) || 25));
  const today = todayIsoDate();
  const normalizedTemplateCode = String(templateCode || "").trim();
  const templateFilterSql = normalizedTemplateCode ? "AND tpl.code = ?" : "";
  const params = normalizedTemplateCode ? [today, normalizedTemplateCode, lim] : [today, lim];
  const rows = await dbAll(
    db,
    `
    SELECT
      s.id            AS sentenceId,
      s.text_id       AS textId,
      s.order_index   AS orderIndex,
      s.he_plain      AS hePlain,
      s.he_niqqud     AS heNiqqud,
      s.translit      AS translit,
      s.ru            AS ru,
      t.title         AS textTitle,
      (
        SELECT aa.asset_key
        FROM sentence_audio sa
        JOIN audio_assets aa ON aa.id = sa.audio_id
        WHERE sa.sentence_id = s.id
        ORDER BY sa.is_default DESC, aa.last_used_at DESC, aa.created_at DESC, sa.rowid DESC
        LIMIT 1
      )               AS audioAssetKey,
      c.id            AS cardId,
      c.entity_type   AS entityType,
      c.entity_id     AS entityId,
      c.template_id   AS templateId,
      c.source_sentence_id AS sourceSentenceId,
      c.source_note_id AS sourceNoteId,
      c.meta_json     AS metaJson,
      c.state         AS state,
      c.due_date      AS dueDate,
      c.interval_days AS intervalDays,
      c.ease_factor   AS easeFactor,
      c.lapses        AS lapses,
      c.reps          AS reps,
      c.created_at    AS cardCreatedAt,
      c.updated_at    AS cardUpdatedAt,
      c.last_review_at AS lastReviewAt,
      tpl.id          AS templateId,
      tpl.code        AS templateCode,
      tpl.label       AS templateLabel,
      tpl.card_kind   AS cardKind,
      tpl.prompt_lang AS promptLang,
      tpl.answer_lang AS answerLang,
      tpl.front_schema_json AS frontSchemaJson,
      tpl.back_schema_json AS backSchemaJson,
      tpl.answer_mode AS answerMode,
      tpl.is_active   AS templateIsActive,
      tpl.sort_order  AS templateSortOrder,
      1               AS isDue
    FROM srs_cards c
    JOIN sentences s ON s.id = c.entity_id
    JOIN texts t ON t.id = s.text_id
    JOIN srs_card_templates tpl ON tpl.id = c.template_id
    WHERE c.entity_type = 'sentence'
      AND c.state <> 'suspended'
      AND tpl.is_active = 1
      AND COALESCE(c.due_date, '9999-12-31') <= ?
      ${templateFilterSql}
    ORDER BY
      c.due_date ASC,
      CASE c.state WHEN 'learning' THEN 0 WHEN 'relearning' THEN 1 ELSE 2 END ASC,
      COALESCE(c.last_review_at, c.created_at) ASC,
      tpl.sort_order ASC
    LIMIT ?;
    `,
    params
  );

  return rows.map(mapSnapshotRow);
}

module.exports = {
  DEFAULT_TEMPLATE_CODE,
  listTemplates,
  getSentenceCardSnapshot,
  getCardSnapshotById,
  listSentenceCardSnapshots,
  createSentenceCard,
  generateSentenceCards,
  reviewSentenceCard,
  listTodayCards,
  listTodaySentenceCards: listTodayCards,
};
