// local-db.js — API shim поверх db-worker.js.
// Интерфейс максимально близок к серверным REST endpoints,
// чтобы минимизировать правки в index.html.
//
// Экспорт:
//   initLocalDB()   — вызвать один раз при старте приложения
//   listTexts()     — GET /api/library/texts
//   getTextById()   — GET /api/library/texts/:id
//   createText()    — POST /api/library/texts
//   updateText()    — PUT /api/library/texts/:id
//   deleteText()    — DELETE /api/library/texts/:id
//   archiveText()   — POST /api/library/texts/:id/archive
//   updateTextMeta() — PATCH /api/library/texts/:id/meta
//   touchOpened()   — POST /api/library/texts/:id/opened
//   getSentences()  — GET /api/library/texts/:id/sentences
//   addSentence()   — POST /api/library/texts/:id/sentences
//   updateSentence() — PATCH /api/library/texts/:id/sentences/:sid
//   deleteSentence() — DELETE /api/library/texts/:id/sentences/:sid
//   resetSentence()  — POST /api/library/texts/:id/sentences/:sid/reset
//   reorderSentences() — PATCH /api/library/texts/:id/sentences/reorder
//   listNotes()     — GET /api/library/texts/:id/notes
//   upsertNote()    — PUT /api/library/texts/:id/notes/:sid
//   deleteNote()    — DELETE /api/library/texts/:id/notes/:sid
//   searchSentences() — GET /api/sentences/search
//   searchNotes()   — GET /api/notes/search
//   searchTexts()   — GET /api/library/texts?q=
//   resolveSentence() — GET /api/nav/resolve?type=sentence
//   resolveNote()   — GET /api/nav/resolve?type=note
//   getProgress()   — GET /api/progress/:textId
//   setProgress()   — POST /api/progress/:textId
//   recordEvent()   — POST /api/history/event
//   recentActivity() — GET /api/history/recent-activity
//   upsertAudioAsset() — saves audio metadata after TTS
//   linkSentenceAudio() — links audio to sentence
//   getDefaultAudioMap() — gets default audio keys for sentences
//   exportBundle()  — GET /api/library/export/bundle
//   importBundle()  — POST /api/library/import/bundle

// ── worker bridge ──────────────────────────────────────────────────────────

let _worker = null;
let _initialized = false;
let _seq    = 0;
const _pending = new Map();

function _call(type, sql, params, opts) {
  return new Promise((resolve, reject) => {
    if (!_worker) {
      reject(new Error('local-db: worker not started (call initLocalDB() first)'));
      return;
    }
    const id = ++_seq;
    _pending.set(id, { resolve, reject });
    try {
      _worker.postMessage({ id, type, sql, params, ...(opts || {}) });
    } catch (e) {
      _pending.delete(id);
      reject(e);
    }
  });
}

// Sticky VFS preference: once a VFS has successfully opened the DB, remember
// it. On reload, that VFS is tried FIRST so existing data isn't orphaned
// when the browser later gains capability for a faster VFS (e.g. iOS user
// upgrades from 16 → 17 — their IDB data stays where it is unless they
// explicitly migrate).
const _VFS_PREF_KEY = 'opfsVfsPreference_v1';

// Shorthand helpers used throughout this module
const q = (sql, p) => _call('query', sql, p);
const r = (sql, p) => _call('run',   sql, p);
const x = (sql)    => _call('exec',  sql);

// Raw exec for app-level operations that don't fit a CRUD shape (e.g.
// wipe-all that DELETEs from multiple non-FK-cascading tables).
// Only intended for internal/admin use — regular app code should stay on
// the typed helpers above.
export async function execRaw(sql) {
  return _call('exec', sql);
}

// Tracks which VFS the worker actually picked. Reported back in the init
// response so callers can show provenance ('storage: OPFS sync' vs
// 'storage: IndexedDB'). NOT used for control-flow.
let _vfs = null;
let _vfsKind = null;
export function getVfsInfo() {
  return { name: _vfs, kind: _vfsKind };
}

// Pre-init feature gate. Cheap shape-check only — actual VFS capability
// detection happens inside the worker's fallback chain
// (AccessHandlePoolVFS → IDBBatchAtomicVFS). The probe used to be on the
// main thread which produced false negatives because
// FileSystemSyncAccessHandle is only exposed in workers per spec.
async function _preflightSupport() {
  if (typeof Worker !== 'function') {
    throw new Error('Local DB requires Web Workers (this browser does not support them).');
  }
  // IndexedDB is the universal fallback floor — if absent, no VFS works.
  if (typeof indexedDB === 'undefined') {
    throw new Error('Local DB requires IndexedDB (this browser does not support it).');
  }
}

export async function initLocalDB() {
  if (_initialized) return; // idempotent on success
  await _preflightSupport();
  if (!_worker) {
    _worker = new Worker('/db/db-worker.js', { type: 'module' });
    _worker.onmessage = ({ data }) => {
      const h = _pending.get(data.id);
      if (!h) return;
      _pending.delete(data.id);
      if (data.ok) {
        if (data.vfs) _vfs = data.vfs;
        if (data.vfsKind) _vfsKind = data.vfsKind;
        h.resolve(data.rows ?? data.changes ?? data);
      } else {
        h.reject(new Error(data.error || 'Worker error'));
      }
    };
    _worker.onerror = (e) => {
      for (const h of _pending.values()) h.reject(new Error('Worker crashed: ' + (e && e.message ? e.message : 'unknown')));
      _pending.clear();
    };
  }
  let preferVfs = null;
  try {
    if (typeof localStorage !== 'undefined') preferVfs = localStorage.getItem(_VFS_PREF_KEY);
  } catch (_) {}
  await _call('init', null, null, preferVfs ? { preferVfs } : null);
  _initialized = true;
  // Remember the VFS that actually worked, so a later browser upgrade
  // doesn't silently switch storage backends and orphan the user's data.
  try {
    if (typeof localStorage !== 'undefined' && _vfs) {
      localStorage.setItem(_VFS_PREF_KEY, _vfs);
    }
  } catch (_) {}
}

export function isReady() {
  return _initialized;
}

// ── texts ──────────────────────────────────────────────────────────────────

export async function listTexts({ query = '', limit = 500, archived = false } = {}) {
  const arch = archived ? 1 : 0;
  if (query && query.trim()) {
    const like = `%${query.trim()}%`;
    return q(
      `SELECT * FROM texts WHERE is_archived = ? AND (title LIKE ? OR source_text LIKE ? OR source LIKE ? OR topic LIKE ?)
       ORDER BY is_pinned DESC, pin_order ASC, last_opened_at DESC NULLS LAST, updated_at DESC LIMIT ?`,
      [arch, like, like, like, like, limit]
    );
  }
  return q(
    `SELECT * FROM texts WHERE is_archived = ?
     ORDER BY is_pinned DESC, pin_order ASC, last_opened_at DESC NULLS LAST, updated_at DESC LIMIT ?`,
    [arch, limit]
  );
}

export async function getTextById(id) {
  const rows = await q('SELECT * FROM texts WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function createText(data) {
  const { id, text_key, title, source_text, level, tags_json, source, topic, tts_profile_json, source_meta_json } = data;
  if (!id) throw new Error('createText: id is required');
  if (!text_key) throw new Error('createText: text_key is required');
  // texts.title and texts.source_text are NOT NULL in the schema; coerce nulls to ''.
  const safeTitle = title == null ? '' : String(title);
  const safeSource = source_text == null ? '' : String(source_text);
  const now = new Date().toISOString();
  await r(
    `INSERT INTO texts (id, text_key, title, source_text, level, tags_json, source, topic,
       tts_profile_json, source_meta_json, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, text_key, safeTitle, safeSource,
     level ?? null, tags_json ?? '[]', source ?? null, topic ?? null,
     tts_profile_json ?? null, source_meta_json ?? null, now, now]
  );
  return getTextById(id);
}

export async function updateText(id, fields) {
  const allowed = ['title', 'level', 'tags_json', 'source', 'topic', 'tts_profile_json',
                   'is_archived', 'is_pinned', 'pin_order', 'table_model_meta_json', 'source_meta_json'];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const vals = entries.map(([, v]) => v);
  await r(`UPDATE texts SET ${sets}, updated_at = ? WHERE id = ?`,
    [...vals, new Date().toISOString(), id]);
}

export async function deleteText(id) {
  await r('DELETE FROM texts WHERE id = ?', [id]);
}

export async function archiveText(id) {
  await r("UPDATE texts SET is_archived = 1, updated_at = ? WHERE id = ?",
    [new Date().toISOString(), id]);
}

export async function updateTextMeta(id, fields) {
  return updateText(id, fields);
}

export async function touchOpened(id) {
  await r("UPDATE texts SET last_opened_at = ? WHERE id = ?", [new Date().toISOString(), id]);
}

// ── sentences ──────────────────────────────────────────────────────────────

export async function getSentences(textId) {
  // Join the default audio asset (if any) so callers see audio_asset_key /
  // audio_tts_profile_json side-by-side with sentence text — matches the
  // shape that the server-side /api/library/texts/:id/sentences returns.
  return q(
    `SELECT s.*,
            aa.asset_key  AS audio_asset_key,
            aa.tts_profile_json AS audio_tts_profile_json
       FROM sentences s
  LEFT JOIN sentence_audio sa ON sa.sentence_id = s.id AND sa.is_default = 1
  LEFT JOIN audio_assets   aa ON aa.id = sa.audio_id
      WHERE s.text_id = ?
   ORDER BY s.order_index`,
    [textId]
  );
}

export async function addSentence(textId, data) {
  if (!textId) throw new Error('addSentence: textId is required');
  if (!data || !data.id) throw new Error('addSentence: data.id is required');
  const { id, he_plain, he_niqqud, translit, translit_ru, ru, meta_json, edit_meta_json } = data;
  const toStr = (v) => (v == null ? '' : String(v));
  const toJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (_) { return null; }
  };
  const maxRow = await q(
    'SELECT COALESCE(MAX(order_index), -1) AS m FROM sentences WHERE text_id = ?', [textId]);
  const order = (maxRow[0]?.m ?? -1) + 1;
  const now = new Date().toISOString();
  await r(
    `INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud, translit, translit_ru,
       ru, meta_json, edit_meta_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, textId, order,
     toStr(he_plain), toStr(he_niqqud), toStr(translit),
     translit_ru == null ? null : String(translit_ru),
     toStr(ru), toJson(meta_json), toJson(edit_meta_json), now]
  );
}

export async function updateSentence(textId, sentenceId, fields) {
  const allowed = ['he_plain', 'he_niqqud', 'translit', 'translit_ru', 'ru',
                   'meta_json', 'edit_meta_json', 'translation_provider', 'translation_meta_json'];
  const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(', ');
  const vals = entries.map(([, v]) => v);
  await r(`UPDATE sentences SET ${sets} WHERE id = ? AND text_id = ?`,
    [...vals, sentenceId, textId]);
}

export async function deleteSentence(textId, sentenceId) {
  await r('DELETE FROM sentences WHERE id = ? AND text_id = ?', [sentenceId, textId]);
}

export async function resetSentence(textId, sentenceId) {
  // Reset: clear edit_meta_json so original values from meta_json are used
  await r(`UPDATE sentences SET edit_meta_json = NULL WHERE id = ? AND text_id = ?`,
    [sentenceId, textId]);
}

export async function reorderSentences(textId, orderedIds) {
  // sentences has UNIQUE(text_id, order_index) — naive sequential updates
  // cause UNIQUE conflicts mid-loop (e.g. row A→2 collides with row B already at 2).
  // Two-pass solution: first push every row of this text into a non-conflicting
  // negative range, then assign final positions. Both passes run in one transaction.
  await x('BEGIN;');
  try {
    // Pass 1: park all current rows at -(order_index + 1) → guaranteed negative & unique
    // (assuming current order_indexes are >= 0, which our schema enforces in practice).
    await r(
      'UPDATE sentences SET order_index = -(order_index + 1) WHERE text_id = ?',
      [textId]
    );
    // Pass 2: assign final positions 0..N-1.
    for (let i = 0; i < orderedIds.length; i++) {
      await r(
        'UPDATE sentences SET order_index = ? WHERE id = ? AND text_id = ?',
        [i, orderedIds[i], textId]
      );
    }
    await x('COMMIT;');
  } catch (e) {
    await x('ROLLBACK;').catch(() => {});
    throw e;
  }
}

export async function searchSentences(queryStr, limit = 20) {
  if (!queryStr || !queryStr.trim()) return [];
  const like = `%${queryStr.trim()}%`;
  return q(
    `SELECT s.*, t.title AS text_title FROM sentences s
     JOIN texts t ON s.text_id = t.id
     WHERE t.is_archived = 0 AND (s.he_plain LIKE ? OR s.he_niqqud LIKE ? OR s.ru LIKE ? OR s.translit LIKE ?)
     ORDER BY t.last_opened_at DESC NULLS LAST LIMIT ?`,
    [like, like, like, like, limit]
  );
}

// ── notes ──────────────────────────────────────────────────────────────────

export async function listNotes(textId) {
  return q('SELECT * FROM sentence_notes WHERE text_id = ? ORDER BY updated_at DESC', [textId]);
}

export async function upsertNote(textId, sentenceId, note) {
  const id  = crypto.randomUUID();
  const now = new Date().toISOString();
  await r(
    `INSERT INTO sentence_notes (id, text_id, sentence_id, note, created_at, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(text_id, sentence_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    [id, textId, sentenceId, note, now, now]
  );
  const rows = await q(
    'SELECT * FROM sentence_notes WHERE text_id = ? AND sentence_id = ?', [textId, sentenceId]);
  return rows[0] ?? null;
}

export async function deleteNote(textId, sentenceId) {
  await r('DELETE FROM sentence_notes WHERE text_id = ? AND sentence_id = ?', [textId, sentenceId]);
}

export async function searchNotes(queryStr, limit = 20) {
  if (!queryStr || !queryStr.trim()) return [];
  const like = `%${queryStr.trim()}%`;
  return q(
    `SELECT n.*, t.title AS text_title, s.he_plain, s.ru FROM sentence_notes n
     JOIN texts t ON n.text_id = t.id
     JOIN sentences s ON n.sentence_id = s.id
     WHERE n.note LIKE ? ORDER BY n.updated_at DESC LIMIT ?`,
    [like, limit]
  );
}

// ── progress ───────────────────────────────────────────────────────────────

export async function getProgress(textId) {
  const rows = await q('SELECT * FROM text_progress WHERE text_id = ?', [textId]);
  return rows[0] ?? null;
}

export async function setProgress(textId, { last_row_idx, last_step_id }) {
  const now = new Date().toISOString();
  await r(
    `INSERT INTO text_progress (text_id, last_row_idx, last_step_id, updated_at)
     VALUES (?,?,?,?)
     ON CONFLICT(text_id) DO UPDATE SET
       last_row_idx  = excluded.last_row_idx,
       last_step_id  = excluded.last_step_id,
       updated_at    = excluded.updated_at`,
    [textId, last_row_idx ?? null, last_step_id ?? null, now]
  );
}

// ── nav / resolve ──────────────────────────────────────────────────────────

export async function resolveSentence(id) {
  const rows = await q(
    `SELECT s.*, t.title AS text_title FROM sentences s
     JOIN texts t ON s.text_id = t.id WHERE s.id = ?`, [id]);
  return rows[0] ?? null;
}

export async function resolveNote(id) {
  const rows = await q(
    `SELECT n.*, t.title AS text_title, s.he_plain FROM sentence_notes n
     JOIN texts t ON n.text_id = t.id
     JOIN sentences s ON n.sentence_id = s.id WHERE n.id = ?`, [id]);
  return rows[0] ?? null;
}

// ── events / history ───────────────────────────────────────────────────────

export async function recordEvent(payload) {
  const id  = crypto.randomUUID();
  const now = new Date().toISOString();
  await r(
    `INSERT INTO events (id, ts, event_type, entity_type, entity_id, session_id,
       text_id, sentence_id, note_id, card_id, source, payload_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, now,
     payload.event_type     ?? 'unknown',
     payload.entity_type    ?? null,
     payload.entity_id      ?? null,
     payload.session_id     ?? null,
     payload.text_id        ?? null,
     payload.sentence_id    ?? null,
     payload.note_id        ?? null,
     payload.card_id        ?? null,
     payload.source         ?? null,
     JSON.stringify(payload.payload_json ?? {})]
  );
}

export async function recentActivity(limit = 30) {
  // Dashboard activity feed expects per-row enrichment:
  //   title, level, he_plain, he_niqqud, translit, ru, last_asset_key,
  //   last_seen_at, seen_count.
  // Without these, items render as "(без названия) (пусто) прослушано: 0".
  // We aggregate per (text_id, sentence_id) so a sentence played 5 times
  // shows up once with seen_count = 5 and the latest last_seen_at + asset.
  return q(
    `SELECT
       MAX(e.ts)                                                             AS last_seen_at,
       MAX(e.ts)                                                             AS ts,
       e.text_id                                                             AS text_id,
       e.sentence_id                                                         AS sentence_id,
       COALESCE(t.title, '')                                                 AS title,
       COALESCE(t.title, '')                                                 AS text_title,
       COALESCE(t.level, '')                                                 AS level,
       COALESCE(s.he_plain, '')                                              AS he_plain,
       COALESCE(s.he_niqqud, '')                                             AS he_niqqud,
       COALESCE(s.translit, '')                                              AS translit,
       COALESCE(s.translit_ru, '')                                           AS translit_ru,
       COALESCE(s.ru, '')                                                    AS ru,
       (
         SELECT e2.source FROM events e2
         WHERE e2.text_id = e.text_id AND e2.sentence_id = e.sentence_id
           AND e2.source IS NOT NULL AND e2.source != ''
         ORDER BY e2.ts DESC LIMIT 1
       )                                                                     AS last_asset_key,
       COUNT(*)                                                              AS seen_count,
       MAX(e.event_type)                                                     AS event_type
     FROM events e
     LEFT JOIN texts t      ON e.text_id = t.id
     LEFT JOIN sentences s  ON e.sentence_id = s.id
     WHERE e.text_id IS NOT NULL
     GROUP BY e.text_id, e.sentence_id
     ORDER BY last_seen_at DESC
     LIMIT ?`,
    [limit]
  );
}

// Aggregate analytics over the events table — same shape as the server's
// /api/history/analytics endpoint, so v3DashboardRenderMetrics can render
// without conditional code.
//   { ok, period: { plays, unique_rows, unique_texts, time_ms },
//          all:    { plays, unique_rows, unique_texts, time_ms } }
// "plays" counts ROW_TTS / row_tts events. time_ms is approximate (we don't
// store playback duration, so we assume an average of 4s per play; this is
// an upper bound on idle-time accuracy until we add explicit duration tracking).
export async function getAnalytics({ days = 7, includeArchived = false } = {}) {
  const sinceMs = Date.now() - Math.max(1, days) * 86400000;
  const sinceIso = new Date(sinceMs).toISOString();
  const archCondition = includeArchived
    ? ''
    : ' AND (t.is_archived IS NULL OR t.is_archived = 0)';
  const baseFrom =
    `FROM events e
     LEFT JOIN texts t ON e.text_id = t.id
     WHERE LOWER(e.event_type) IN ('row_tts','tts_play','play')` + archCondition;

  // Aggregate one window at a time. Single passes are fine for typical
  // event counts (< 100k rows per user).
  async function agg(extraWhere, params) {
    const rows = await q(
      `SELECT
         COUNT(*)                                AS plays,
         COUNT(DISTINCT e.sentence_id)           AS unique_rows,
         COUNT(DISTINCT e.text_id)               AS unique_texts
       ${baseFrom}${extraWhere}`,
      params
    );
    const r = rows[0] || {};
    const plays = Number(r.plays || 0);
    return {
      plays,
      unique_rows: Number(r.unique_rows || 0),
      unique_texts: Number(r.unique_texts || 0),
      time_ms: plays * 4000, // 4s/play estimate; tightens to real values once duration is tracked
    };
  }
  const period = await agg(' AND e.ts >= ?', [sinceIso]);
  const all    = await agg('', []);
  return { ok: true, period, all };
}

// ── audio assets ───────────────────────────────────────────────────────────

export async function upsertAudioAsset({ id, asset_key, asset_type, relative_path, mime, duration_ms, size_bytes, tts_profile_json }) {
  const now = new Date().toISOString();
  await r(
    `INSERT INTO audio_assets (id, asset_key, asset_type, relative_path, mime, duration_ms, size_bytes, tts_profile_json, created_at, last_used_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(asset_key) DO UPDATE SET last_used_at = excluded.last_used_at`,
    [id, asset_key, asset_type ?? 'row', relative_path ?? `audio-cache/${asset_key}.mp3`,
     mime ?? 'audio/mpeg', duration_ms ?? null, size_bytes ?? null,
     tts_profile_json ?? null, now, now]
  );
  const rows = await q('SELECT * FROM audio_assets WHERE asset_key = ?', [asset_key]);
  return rows[0] ?? null;
}

export async function linkSentenceAudio(sentenceId, audioId, isDefault = 1) {
  await r(
    `INSERT OR IGNORE INTO sentence_audio (sentence_id, audio_id, is_default) VALUES (?,?,?)`,
    [sentenceId, audioId, isDefault]
  );
  if (isDefault) {
    await r('UPDATE sentence_audio SET is_default = 0 WHERE sentence_id = ? AND audio_id != ?',
      [sentenceId, audioId]);
  }
}

export async function getDefaultAudioMap(textId) {
  const rows = await q(
    `SELECT sa.sentence_id, aa.asset_key FROM sentence_audio sa
     JOIN audio_assets aa ON sa.audio_id = aa.id
     JOIN sentences s ON sa.sentence_id = s.id
     WHERE s.text_id = ? AND sa.is_default = 1`,
    [textId]
  );
  const map = {};
  for (const row of rows) map[row.sentence_id] = row.asset_key;
  return map;
}

// ── SRS (карточки, сессии) ─────────────────────────────────────────────────

export const srs = {

  async listTemplates() {
    return q('SELECT * FROM srs_card_templates WHERE is_active = 1 ORDER BY sort_order');
  },

  async listCards({ state, limit = 200 } = {}) {
    if (state) {
      return q('SELECT * FROM srs_cards WHERE state = ? ORDER BY due_date LIMIT ?', [state, limit]);
    }
    return q('SELECT * FROM srs_cards ORDER BY due_date LIMIT ?', [limit]);
  },

  async createCard({ id, entity_type, entity_id, template_id, source_sentence_id, source_note_id }) {
    const now = new Date().toISOString();
    await r(
      `INSERT OR IGNORE INTO srs_cards (id, entity_type, entity_id, template_id, source_sentence_id, source_note_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id ?? crypto.randomUUID(), entity_type, entity_id, template_id,
       source_sentence_id ?? null, source_note_id ?? null, now, now]
    );
  },

  async generateCardsForSentence(sentenceId) {
    const templates = await q("SELECT id FROM srs_card_templates WHERE is_active = 1 AND card_kind = 'sentence'");
    for (const tpl of templates) {
      await srs.createCard({
        id: crypto.randomUUID(),
        entity_type: 'sentence',
        entity_id: sentenceId,
        template_id: tpl.id,
        source_sentence_id: sentenceId,
      });
    }
  },

  async listTodayCards() {
    const today = new Date().toISOString().slice(0, 10);
    return q(
      `SELECT c.*, s.he_plain, s.ru, s.translit, s.he_niqqud, s.translit_ru,
         t.title AS text_title, tpl.code AS template_code, tpl.label AS template_label,
         tpl.front_schema_json, tpl.back_schema_json, tpl.answer_mode
       FROM srs_cards c
       LEFT JOIN sentences s ON c.source_sentence_id = s.id
       LEFT JOIN texts t ON s.text_id = t.id
       JOIN srs_card_templates tpl ON c.template_id = tpl.id
       WHERE c.state IN ('new','learning','review','relearning')
         AND (c.due_date IS NULL OR c.due_date <= ?)
       ORDER BY CASE c.state WHEN 'learning' THEN 0 WHEN 'relearning' THEN 1 WHEN 'review' THEN 2 ELSE 3 END,
                c.due_date ASC
       LIMIT 100`,
      [today]
    );
  },

  async todaySummary() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await q(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) AS new_count,
         SUM(CASE WHEN state IN ('learning','relearning') THEN 1 ELSE 0 END) AS learning_count,
         SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) AS review_count
       FROM srs_cards
       WHERE state != 'suspended' AND (due_date IS NULL OR due_date <= ?)`,
      [today]
    );
    return rows[0] ?? { total: 0, new_count: 0, learning_count: 0, review_count: 0 };
  },

  async reviewCard(cardId, rating) {
    const rows = await q('SELECT * FROM srs_cards WHERE id = ?', [cardId]);
    const card = rows[0];
    if (!card) throw new Error('Card not found: ' + cardId);

    const { newState, newInterval, newEase } = computeSM2(card, rating);
    const now  = new Date().toISOString();
    const due  = new Date(Date.now() + newInterval * 86400000).toISOString().slice(0, 10);

    await r(
      `UPDATE srs_cards SET state = ?, interval_days = ?, ease_factor = ?,
         lapses = lapses + ?, reps = reps + 1, due_date = ?,
         updated_at = ?, last_review_at = ?
       WHERE id = ?`,
      [newState, newInterval, newEase,
       rating === 1 ? 1 : 0,
       newState === 'learning' ? null : due,
       now, now, cardId]
    );

    const eventId = crypto.randomUUID();
    await r(
      `INSERT INTO srs_review_events (id, card_id, rating, interval_before, interval_after,
         ease_before, ease_after, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [eventId, cardId, rating, card.interval_days, newInterval,
       card.ease_factor, newEase, now]
    );

    return { state: newState, interval_days: newInterval, ease_factor: newEase, due_date: due };
  },

  async createSession({ mode = 'today', source } = {}) {
    const cards = await srs.listTodayCards();
    const id    = crypto.randomUUID();
    const now   = new Date().toISOString();
    await r(
      `INSERT INTO srs_session_runs (id, status, mode, source, queue_json, cards_total, started_at)
       VALUES (?,?,?,?,?,?,?)`,
      [id, 'active', mode, source ?? null,
       JSON.stringify(cards.map(c => c.id)), cards.length, now]
    );
    return { id, cards_total: cards.length, cards };
  },

  async getSession(sessionId) {
    const rows = await q('SELECT * FROM srs_session_runs WHERE id = ?', [sessionId]);
    return rows[0] ?? null;
  },

  async getSessionNext(sessionId) {
    const session = await srs.getSession(sessionId);
    if (!session || session.status !== 'active') return null;
    const queue = JSON.parse(session.queue_json || '[]');
    const idx   = session.current_index;
    if (idx >= queue.length) return null;
    const cardId = queue[idx];
    const cardRows = await q(
      `SELECT c.*, s.he_plain, s.ru, s.translit, s.he_niqqud, s.translit_ru,
         t.title AS text_title, tpl.code AS template_code,
         tpl.front_schema_json, tpl.back_schema_json, tpl.answer_mode
       FROM srs_cards c
       LEFT JOIN sentences s ON c.source_sentence_id = s.id
       LEFT JOIN texts t ON s.text_id = t.id
       JOIN srs_card_templates tpl ON c.template_id = tpl.id
       WHERE c.id = ?`, [cardId]
    );
    return { card: cardRows[0] ?? null, index: idx, total: queue.length };
  },

  async reviewSessionNext(sessionId, cardId, rating) {
    const result = await srs.reviewCard(cardId, rating);
    await r(
      `UPDATE srs_session_runs SET current_index = current_index + 1,
         cards_seen = cards_seen + 1, reviews_done = reviews_done + 1
       WHERE id = ?`,
      [sessionId]
    );
    return result;
  },

  async finishSession(sessionId) {
    const now = new Date().toISOString();
    await r(
      "UPDATE srs_session_runs SET status = 'finished', finished_at = ? WHERE id = ?",
      [now, sessionId]
    );
    return srs.getSession(sessionId);
  },
};

// ── SM-2 алгоритм ──────────────────────────────────────────────────────────

function computeSM2(card, rating) {
  const { state, interval_days, ease_factor, lapses } = card;

  let newEase  = ease_factor;
  let newIntvl = interval_days;
  let newState = state;

  if (rating === 1) { // Again
    newState = state === 'new' ? 'learning' : 'relearning';
    newIntvl = 0;
    newEase  = Math.max(1.3, ease_factor - 0.2);
  } else if (rating === 2) { // Hard
    newState = 'review';
    newIntvl = Math.max(1, interval_days * 1.2);
    newEase  = Math.max(1.3, ease_factor - 0.15);
  } else if (rating === 3) { // Good
    newState = 'review';
    newIntvl = state === 'new' || interval_days <= 1 ? 1
      : Math.round(interval_days * ease_factor);
    // ease unchanged
  } else { // Easy (4)
    newState = 'review';
    newIntvl = state === 'new' || interval_days <= 1 ? 4
      : Math.round(interval_days * ease_factor * 1.3);
    newEase  = Math.min(4.0, ease_factor + 0.15);
  }

  return { newState, newInterval: Math.max(0, newIntvl), newEase };
}

// ── export / import (ZIP bundle) ───────────────────────────────────────────

// Emits the unified format documented in
// docs/ANDROID_V2_LIBRARY_EXPORT_SPEC.md so a single ZIP works for both web
// and android-v2 imports.
//
// Returns { manifest, library, audioAssetsMap }:
//   manifest    — the manifest.json content (pre-MP3-fetch counts; caller
//                 may overwrite audio_count / missing_audio_count).
//   library     — { schema_version: 1, texts, audio_assets } content for
//                 library/library.json
//   audioAssetsMap — Map<assetKey, audioAssetMeta> the caller can iterate to
//                 fetch MP3 blobs.
export async function exportBundle({ includeArchived = false } = {}) {
  const active   = await listTexts({ archived: false, limit: 10000 });
  const archived = includeArchived ? await listTexts({ archived: true, limit: 10000 }) : [];
  const exportList = [...active, ...archived];
  const texts = [];
  const audioAssetsMap = new Map();
  let rowCount = 0;

  const safeJsonParse = (s) => {
    if (s == null || s === '') return null;
    if (typeof s !== 'string') return s;
    try { return JSON.parse(s); } catch (_) { return null; }
  };

  // Default fallback timestamp for fields the schema requires as NOT NULL
  // strings on the import side (Android v2's kotlinx.serialization treats
  // String as non-nullable by default — null breaks parsing of the whole
  // library.json with errorCount=1).
  const _exportTs = new Date().toISOString();

  for (const text of exportList) {
    const sentences = await getSentences(text.id);  // already JOIN'ed audio_asset_key + audio_tts_profile_json
    const notes     = await listNotes(text.id);
    const noteMap   = {};
    for (const n of notes) noteMap[n.sentence_id] = n.note;

    const rows = sentences.map((s) => {
      const ak = s.audio_asset_key || null;
      // Track audio asset metadata (one entry per unique asset_key).
      if (ak && !audioAssetsMap.has(ak)) {
        const ttsProfile = safeJsonParse(s.audio_tts_profile_json);
        audioAssetsMap.set(ak, {
          asset_key: ak,
          relative_export_path: 'audio/' + ak + '.mp3',
          mime_type: 'audio/mpeg',
          provider_id: 'unknown',
          // voice_name is nullable in the spec — null is fine.
          voice_name: ttsProfile && ttsProfile.voiceName ? ttsProfile.voiceName : null,
          // language is REQUIRED non-nullable in Android v2 ExportAudioAsset
          // (kotlinx.serialization rejects null). Default to 'he-IL' since
          // this app is Hebrew-focused; real value used when ttsProfile present.
          language: (ttsProfile && ttsProfile.language) ? ttsProfile.language : 'he-IL',
          duration_ms: null,
          size_bytes: null,
          // content_hash is nullable; emit explicitly so the JSON has the
          // key (cleaner than relying on JSON.stringify dropping undefined,
          // which some strict parsers count as "missing required").
          content_hash: null,
          provenance: ttsProfile ? { ttsProfile } : null,
        });
      }
      rowCount++;
      return {
        row_id: s.id,
        order_index: s.order_index ?? 0,
        hebrew_plain: s.he_plain || '',
        hebrew_niqqud: s.he_niqqud || '',
        translit: s.translit || '',
        translit_ru: s.translit_ru || '',
        russian: s.ru || '',
        edit_meta: safeJsonParse(s.edit_meta_json),
        audio_asset_key: ak,
        // Notes attached to row (Android v2 spec doesn't have a top-level
        // notes array — they live inline on the row).
        note: (noteMap[s.id] && String(noteMap[s.id]).trim()) ? String(noteMap[s.id]) : null,
      };
    });

    // Defensive serialisation for fields that Android v2's strict-typed
    // kotlinx.serialization data class rejects when they're the wrong shape
    // or null:
    //   • tags must be List<String> — coerce to array, drop non-strings.
    //   • created_at / updated_at must be non-null Strings — fall back to
    //     export timestamp when OPFS row somehow lacks them.
    const tagsParsed = safeJsonParse(text.tags_json);
    const tagsList = Array.isArray(tagsParsed)
      ? tagsParsed.map((x) => (typeof x === 'string' ? x : String(x))).filter(Boolean)
      : [];

    texts.push({
      text_id: text.id,
      text_key: text.text_key,
      title: text.title || '',
      level: text.level || null,
      tags: tagsList,
      source_label: text.source || null,
      topic: text.topic || null,
      source_text: text.source_text || '',
      source_meta: safeJsonParse(text.source_meta_json),
      table_model_meta: safeJsonParse(text.table_model_meta_json),
      rows,
      text_audio_asset_key: null,
      created_at: text.created_at || _exportTs,
      updated_at: text.updated_at || _exportTs,
      is_archived: !!text.is_archived,
    });
  }

  const audioAssets = Array.from(audioAssetsMap.values());
  const manifest = {
    export_schema_version: 1,
    app_id: 'linguist-pro-web',
    created_at: new Date().toISOString(),
    partial_backup: false,        // overwritten by caller after MP3 fetch
    text_count: texts.length,
    row_count: rowCount,
    audio_count: audioAssets.length,
    missing_audio_count: 0,       // overwritten by caller
    contains_secrets: false,
    library_json_path: 'library/library.json',
    missing_audio_path: 'metadata/missing_audio.json',
  };
  const library = { schema_version: 1, texts, audio_assets: audioAssets };
  // Backwards-compat: also expose `texts` at the top of the returned object so
  // callers that iterate `bundle.texts` directly (importBundle round-trip,
  // older tests) keep working without changes.
  return { manifest, library, texts, audio_assets: audioAssets };
}

export async function importBundle(bundleObj, { mode = 'skip' } = {}) {
  // Accept three bundle shapes:
  //   A) UNIFIED (Android v2 spec, current web export):
  //      { manifest, library: { texts: [{text_id, rows: [{hebrew_plain, ...}], ...}], audio_assets: [...] } }
  //      OR { schema_version: 1, texts: [...], audio_assets: [...] }
  //   B) LEGACY SERVER (/api/library/export wraps each text):
  //      { exportType, exportVersion, texts: [{text: {...}, sentences: [{he_plain, ...}], progress}] }
  //   C) LEGACY WEB FLAT (older OPFS exports):
  //      { manifest, texts: [{id, text_key, title, sentences: [{he_plain, ...}]}] }
  //
  // Detection priority: A wins if `library.texts` or top-level `texts[0].rows`
  // exists; B wins if `texts[0].text` is an object; otherwise C.
  const lib = (bundleObj && bundleObj.library && typeof bundleObj.library === 'object') ? bundleObj.library : bundleObj;
  const texts = (lib && Array.isArray(lib.texts)) ? lib.texts : (Array.isArray(bundleObj) ? bundleObj : []);

  // Pre-index audio_assets by asset_key for provenance recovery.
  const audioAssetsByKey = new Map();
  const aaList = (lib && Array.isArray(lib.audio_assets)) ? lib.audio_assets : [];
  for (const aa of aaList) {
    if (aa && aa.asset_key) audioAssetsByKey.set(String(aa.asset_key), aa);
  }

  const result = { imported: 0, skipped: 0, errors: [], importedIds: [] };

  for (const item of texts) {
    let textData;
    if (item && item.text && typeof item.text === 'object') {
      // Shape B: server-nested.
      textData = { ...item.text, sentences: Array.isArray(item.sentences) ? item.sentences : (item.text.sentences || []) };
    } else if (item && (item.text_id || Array.isArray(item.rows))) {
      // Shape A: unified Android v2 / web v3.
      const tags = item.tags;
      textData = {
        id: item.text_id,
        text_key: item.text_key,
        title: item.title,
        level: item.level,
        tags_json: Array.isArray(tags) ? JSON.stringify(tags) : (typeof tags === 'string' ? tags : '[]'),
        source: item.source_label || item.source || null,
        topic: item.topic || null,
        source_text: item.source_text || '',
        source_meta_json: item.source_meta ? JSON.stringify(item.source_meta) : null,
        table_model_meta_json: item.table_model_meta ? JSON.stringify(item.table_model_meta) : null,
        is_archived: item.is_archived ? 1 : 0,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        sentences: (Array.isArray(item.rows) ? item.rows : []).map((r) => ({
          he_plain: r.hebrew_plain || r.he_plain || '',
          he_niqqud: r.hebrew_niqqud || r.he_niqqud || '',
          translit: r.translit || '',
          translit_ru: r.translit_ru || '',
          ru: r.russian || r.ru || '',
          edit_meta_json: r.edit_meta ? JSON.stringify(r.edit_meta) : (r.edit_meta_json || null),
          audio_asset_key: r.audio_asset_key || r.audioAssetKey || null,
          note: r.note || null,
          order_index: r.order_index ?? null,
        })),
      };
    } else {
      // Shape C: legacy flat — pass through.
      textData = item;
    }

    // Track whether this text's row was successfully INSERTed so we can
    // roll back partial state if any subsequent sentence/note/audio insert
    // throws. ON DELETE CASCADE in the schema cleans up child rows.
    let newTextId = null;
    try {
      // Generate a fresh text_key when the source didn't provide one (defensive).
      const text_key = String(textData.text_key || textData.textKey || '').trim()
        || ('imported-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
      const existing = await q('SELECT id FROM texts WHERE text_key = ?', [text_key]);
      if (existing.length > 0 && mode === 'skip') { result.skipped++; continue; }

      newTextId = crypto.randomUUID();
      await createText({ ...textData, text_key, id: newTextId });

      const sentences = textData.sentences ?? textData.rows ?? [];
      for (const s of sentences) {
        const newSentenceId = crypto.randomUUID();
        await addSentence(newTextId, { ...s, id: newSentenceId });
        if (s.note && s.note.trim()) {
          await upsertNote(newTextId, newSentenceId, s.note);
        }
        // Re-establish audio asset link. If the unified bundle ships an
        // audio_assets[] entry with provenance.ttsProfile, we capture it so
        // the marker can show the imported voice rather than empty profile.
        const ak = String(s.audio_asset_key || s.audioAssetKey || '').trim();
        if (ak) {
          const aaMeta = audioAssetsByKey.get(ak) || null;
          let ttsProfileJson = null;
          if (aaMeta) {
            const prov = aaMeta.provenance && aaMeta.provenance.ttsProfile;
            if (prov && typeof prov === 'object') {
              ttsProfileJson = JSON.stringify(prov);
            } else if (aaMeta.voice_name || aaMeta.language) {
              ttsProfileJson = JSON.stringify({
                language: aaMeta.language || 'he-IL',
                voiceName: aaMeta.voice_name || '',
              });
            }
          }
          const asset = await upsertAudioAsset({
            id: crypto.randomUUID(),
            asset_key: ak,
            asset_type: 'row',
            relative_path: (aaMeta && aaMeta.relative_export_path) || ('audio-cache/' + ak + '.mp3'),
            mime: (aaMeta && aaMeta.mime_type) || 'audio/mpeg',
            duration_ms: (aaMeta && aaMeta.duration_ms) || null,
            size_bytes: (aaMeta && aaMeta.size_bytes) || null,
            tts_profile_json: ttsProfileJson,
          });
          if (asset && asset.id) {
            await linkSentenceAudio(newSentenceId, asset.id, 1);
          }
        }
      }
      result.imported++;
      result.importedIds.push(newTextId);
    } catch (e) {
      result.errors.push({ title: textData.title, error: e && e.message ? e.message : String(e) });
      // B2: per-text atomicity — if createText succeeded but a child insert
      // failed, remove the partial parent row (CASCADE drops orphans).
      if (newTextId) {
        try { await deleteText(newTextId); } catch (_) {}
      }
    }
  }
  return result;
}

// B2: Roll back a list of text IDs imported in a previous migration. Used
// by the Phase 6 first-open prompt's "Undo last migration" UI when the
// user wants to revert to last-known-good state.
export async function rollbackImportedTexts(textIds) {
  const ids = Array.isArray(textIds) ? textIds.filter(Boolean) : [];
  let deleted = 0;
  for (const id of ids) {
    try { await deleteText(id); deleted++; } catch (_) {}
  }
  return { requested: ids.length, deleted };
}

// Reconcile audio links for texts that already exist in OPFS. Useful when
// a user re-imports a bundle that was first imported under an older code
// path (which left the texts intact but failed to populate sentence_audio).
//
// Input: same `bundleObj` shape as importBundle (unified or legacy).
// Strategy:
//   For each text in the bundle:
//     • Find OPFS text by text_key (skip if not found — it'll be a fresh import target).
//     • Match incoming rows to OPFS sentences by ORDER_INDEX (stable ordering
//       in both bundles); fall back to (he_plain, ru) if order_index missing.
//     • For each matched sentence: if the bundle row carries audio_asset_key,
//       upsertAudioAsset + linkSentenceAudio (idempotent — won't duplicate).
//
// Returns: { textsScanned, textsMatched, textsNotFound, linksCreated, linksAlready }.
export async function reconcileAudioLinks(bundleObj) {
  const lib = (bundleObj && bundleObj.library && typeof bundleObj.library === 'object') ? bundleObj.library : bundleObj;
  const texts = (lib && Array.isArray(lib.texts)) ? lib.texts : (Array.isArray(bundleObj) ? bundleObj : []);
  const audioAssetsByKey = new Map();
  const aaList = (lib && Array.isArray(lib.audio_assets)) ? lib.audio_assets : [];
  for (const aa of aaList) {
    if (aa && aa.asset_key) audioAssetsByKey.set(String(aa.asset_key), aa);
  }

  const summary = { textsScanned: 0, textsMatched: 0, textsNotFound: 0, linksCreated: 0, linksAlready: 0, errors: [] };

  for (const item of texts) {
    summary.textsScanned++;
    let textKey, rowsIn;
    if (item && item.text && typeof item.text === 'object') {
      textKey = item.text.text_key;
      rowsIn = Array.isArray(item.sentences) ? item.sentences : [];
    } else if (item && (item.text_id || Array.isArray(item.rows))) {
      textKey = item.text_key;
      rowsIn = (Array.isArray(item.rows) ? item.rows : []).map((r) => ({
        order_index: r.order_index ?? null,
        he_plain: r.hebrew_plain || r.he_plain || '',
        ru: r.russian || r.ru || '',
        audio_asset_key: r.audio_asset_key || r.audioAssetKey || null,
      }));
    } else {
      textKey = item.text_key;
      rowsIn = Array.isArray(item.sentences) ? item.sentences : (Array.isArray(item.rows) ? item.rows : []);
    }
    if (!textKey) continue;

    const tRows = await q('SELECT id FROM texts WHERE text_key = ?', [textKey]);
    if (!tRows.length) { summary.textsNotFound++; continue; }
    summary.textsMatched++;
    const opfsTextId = tRows[0].id;

    const opfsSents = await q(
      'SELECT id, order_index, he_plain, ru FROM sentences WHERE text_id = ? ORDER BY order_index', [opfsTextId]);

    // Build matchers: by (text_id, order_index) primarily; (text_id, he_plain) fallback.
    const byOrder = new Map();
    const byHePlain = new Map();
    for (const s of opfsSents) {
      byOrder.set(Number(s.order_index), s.id);
      if (s.he_plain) byHePlain.set(s.he_plain, s.id);
    }

    for (const ri of rowsIn) {
      const ak = ri.audio_asset_key ? String(ri.audio_asset_key).trim() : '';
      if (!ak) continue;
      let opfsSentenceId = null;
      if (ri.order_index != null) opfsSentenceId = byOrder.get(Number(ri.order_index));
      if (!opfsSentenceId && ri.he_plain) opfsSentenceId = byHePlain.get(String(ri.he_plain));
      if (!opfsSentenceId) continue;

      try {
        const aaMeta = audioAssetsByKey.get(ak) || null;
        let ttsProfileJson = null;
        if (aaMeta && aaMeta.provenance && aaMeta.provenance.ttsProfile) {
          ttsProfileJson = JSON.stringify(aaMeta.provenance.ttsProfile);
        } else if (aaMeta && (aaMeta.voice_name || aaMeta.language)) {
          ttsProfileJson = JSON.stringify({ language: aaMeta.language || 'he-IL', voiceName: aaMeta.voice_name || '' });
        }
        const asset = await upsertAudioAsset({
          id: crypto.randomUUID(),
          asset_key: ak,
          asset_type: 'row',
          relative_path: (aaMeta && aaMeta.relative_export_path) || ('audio-cache/' + ak + '.mp3'),
          mime: (aaMeta && aaMeta.mime_type) || 'audio/mpeg',
          duration_ms: (aaMeta && aaMeta.duration_ms) || null,
          size_bytes: (aaMeta && aaMeta.size_bytes) || null,
          tts_profile_json: ttsProfileJson,
        });
        if (asset && asset.id) {
          // Check if link already exists.
          const existingLink = await q(
            'SELECT 1 AS x FROM sentence_audio WHERE sentence_id = ? AND audio_id = ?',
            [opfsSentenceId, asset.id]);
          if (existingLink.length) summary.linksAlready++;
          else {
            await linkSentenceAudio(opfsSentenceId, asset.id, 1);
            summary.linksCreated++;
          }
        }
      } catch (e) {
        summary.errors.push({ asset_key: ak, error: e && e.message ? e.message : String(e) });
      }
    }
  }
  return summary;
}

// ── diagnostics ────────────────────────────────────────────────────────────

// Detailed audio-link diagnostic. Returns the same shape we'd want in a
// support ticket: per-text counts of rows with audio link + sample of the
// JOIN'ed getSentences output for the first matching text. Use from browser
// DevTools: `await __localDB.audioLinkDiag('Position 6')`.
export async function audioLinkDiag(titleSubstring = '') {
  const titleLike = titleSubstring ? `%${titleSubstring}%` : '%';
  const texts = await q(
    `SELECT id, title FROM texts WHERE title LIKE ? ORDER BY title LIMIT 5`,
    [titleLike]
  );
  const out = {
    matched_texts: texts.length,
    titles: texts.map((t) => t.title),
    counts: { texts_total: 0, sentences_total: 0, sentence_audio_total: 0, audio_assets_total: 0 },
    per_text: [],
    sample_rows_after_join: [],
  };
  // Global counts for context.
  const all = await q(`SELECT
    (SELECT COUNT(*) FROM texts) AS texts_total,
    (SELECT COUNT(*) FROM sentences) AS sentences_total,
    (SELECT COUNT(*) FROM sentence_audio) AS sentence_audio_total,
    (SELECT COUNT(*) FROM audio_assets) AS audio_assets_total`);
  Object.assign(out.counts, all[0] || {});

  for (const t of texts) {
    const sCount = await q('SELECT COUNT(*) AS n FROM sentences WHERE text_id = ?', [t.id]);
    const linkedCount = await q(
      `SELECT COUNT(*) AS n FROM sentences s
       JOIN sentence_audio sa ON sa.sentence_id = s.id AND sa.is_default = 1
       JOIN audio_assets aa ON aa.id = sa.audio_id
       WHERE s.text_id = ?`,
      [t.id]
    );
    out.per_text.push({
      id: t.id,
      title: t.title,
      sentences: Number(sCount[0]?.n || 0),
      sentences_with_audio_link: Number(linkedCount[0]?.n || 0),
    });
  }

  // Sample what getSentences would return for the first matched text.
  if (texts.length) {
    out.sample_rows_after_join = await getSentences(texts[0].id);
    out.sample_rows_after_join = out.sample_rows_after_join.slice(0, 3).map((r) => ({
      id: r.id,
      he_plain: r.he_plain,
      ru: r.ru,
      audio_asset_key: r.audio_asset_key || null,
      audio_tts_profile_json_present: !!r.audio_tts_profile_json,
    }));
  }
  return out;
}

export async function dbDiag() {
  const tables = ['texts', 'sentences', 'sentence_notes', 'audio_assets',
                  'srs_cards', 'text_progress', 'events', 'schema_migrations'];
  const counts = {};
  for (const t of tables) {
    const rows = await q(`SELECT COUNT(*) AS n FROM ${t}`);
    counts[t]  = rows[0]?.n ?? 0;
  }
  return counts;
}
