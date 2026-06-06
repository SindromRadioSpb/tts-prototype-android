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

// ── P0-1: single-owner multi-tab coordination ──────────────────────────────
// OPFS FileSystemSyncAccessHandle is exclusive per-origin. If two tabs each
// open the SQLite DB, the second corrupts the shared WASM heap → raw
// "memory access out of bounds". We elect a single owner tab via the Web
// Locks API; follower tabs do NOT open the DB and fail every query fast with
// a typed, recoverable error instead of crashing.
export class DbUnavailableError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'DbUnavailableError';
    this.code = code; // DB_OWNED_BY_OTHER_TAB | DB_WORKER_CRASHED | DB_INIT_FAILED
  }
}

const _DB_OWNER_LOCK = 'linguistpro-opfs-db-owner-v1';
let _ownerState = 'unknown';      // 'owner' | 'follower' | 'unknown'
let _followerMode = false;
let _workerCrashed = false;
let _ownershipPromise = null;
let _releaseOwnerLock = null;     // call to voluntarily yield the owner lock
let _failoverArmed = false;
let _ownerHooksInstalled = false;

function _crashRegex(msg) {
  return /memory access out of bounds|RuntimeError|abort\(|table index is out of bounds|null function or function signature mismatch/i
    .test(String(msg || ''));
}

// Pure, side-effect-free classifier — exported so the worker-error wrapping
// logic is unit-testable in node without a browser/Worker. Returns the
// DbUnavailableError code for WASM-crash signatures, else null.
export function classifyWorkerError(msg) {
  return _crashRegex(msg) ? 'DB_WORKER_CRASHED' : null;
}

export function getOwnershipState() { return _ownerState; }
export function isFollower() { return _followerMode; }
export function getDbError() {
  if (_workerCrashed) return new DbUnavailableError('DB_WORKER_CRASHED', 'Local database is temporarily unavailable.');
  if (_followerMode) return new DbUnavailableError('DB_OWNED_BY_OTHER_TAB', 'Database is in use by another tab.');
  return null;
}

function _wrapWorkerError(rawMsg) {
  const msg = String(rawMsg || 'Worker error');
  if (_crashRegex(msg)) {
    _workerCrashed = true;
    try {
      if (typeof window !== 'undefined' && typeof window.v3OpfsTelemetryPush === 'function') {
        window.v3OpfsTelemetryPush({ kind: 'db.crash', detail: msg.slice(0, 200) });
      }
    } catch (_) {}
    return new DbUnavailableError('DB_WORKER_CRASHED', 'Local database is temporarily unavailable.');
  }
  return new Error(msg);
}

function _installOwnerReleaseHooks() {
  if (_ownerHooksInstalled || typeof window === 'undefined') return;
  _ownerHooksInstalled = true;
  const rel = () => {
    try { if (_releaseOwnerLock) { _releaseOwnerLock(); _releaseOwnerLock = null; } } catch (_) {}
  };
  window.addEventListener('pagehide', rel);
  window.addEventListener('beforeunload', rel);
}

// Follower tabs queue a (non-ifAvailable) lock request. When the current
// owner closes/crashes (Web Locks auto-releases) or voluntarily yields, this
// callback fires → this tab becomes the owner. Cold-reload to init cleanly.
function _armFailover() {
  if (_failoverArmed || typeof navigator === 'undefined' || !navigator.locks) return;
  _failoverArmed = true;
  navigator.locks.request(_DB_OWNER_LOCK, () => {
    _ownerState = 'owner';
    _followerMode = false;
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('localdb:became-owner')); } catch (_) {}
      // Cleanest path to a healthy owner: cold reload to fresh-init the DB.
      try { window.location.reload(); } catch (_) {}
    }
    // Hold the lock until reload tears us down.
    return new Promise(() => {});
  }).catch(() => {});
}

export async function acquireDbOwnership() {
  if (_ownershipPromise) return _ownershipPromise;
  _ownershipPromise = (async () => {
    if (typeof navigator === 'undefined' || !navigator.locks || typeof navigator.locks.request !== 'function') {
      // No Web Locks (old browsers / node test env): preserve legacy
      // single-owner-assumed behaviour, no regression.
      _ownerState = 'owner';
      return;
    }
    const becameOwner = await new Promise((resolveOwner) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolveOwner(v); } };
      navigator.locks.request(_DB_OWNER_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) { done(false); return; }   // someone else owns it
        done(true);
        return new Promise((releaseLock) => { _releaseOwnerLock = releaseLock; });
      }).catch(() => done(false));
    });
    if (becameOwner) {
      _ownerState = 'owner';
      _installOwnerReleaseHooks();
    } else {
      _ownerState = 'follower';
      _followerMode = true;
      if (typeof window !== 'undefined') window.__localDBFollower = true;
      _armFailover();
    }
  })();
  return _ownershipPromise;
}

// Voluntarily yield ownership so a follower that requested takeover can
// become owner. Tears down our worker to fully release the OPFS handle.
export function releaseDbOwnership() {
  try { if (_releaseOwnerLock) { _releaseOwnerLock(); _releaseOwnerLock = null; } } catch (_) {}
  try { if (_worker) { _worker.terminate(); _worker = null; } } catch (_) {}
  _initialized = false;
  _ownerState = 'follower';
  _followerMode = true;
  if (typeof window !== 'undefined') window.__localDBFollower = true;
}

// Recovery entry point for the "Retry" affordance (P0-2 / P1-6). Re-spawns
// the worker and re-inits if we own the DB; followers must reload instead.
export async function recoverLocalDB() {
  if (_followerMode) {
    throw new DbUnavailableError('DB_OWNED_BY_OTHER_TAB', 'Database is in use by another tab.');
  }
  _workerCrashed = false;
  _initialized = false;
  try { if (_worker) { _worker.terminate(); _worker = null; } } catch (_) {}
  await initLocalDB();
}

function _call(type, sql, params, opts) {
  return new Promise((resolve, reject) => {
    if (_followerMode || _workerCrashed) {
      reject(getDbError() || new DbUnavailableError('DB_INIT_FAILED', 'Local database is unavailable.'));
      return;
    }
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

// Direction 9 Phase 9.1.A: parameterized query/run escape hatches —
// exported for browser-side test pages and admin diagnostics. Mirror of
// the internal q()/r() helpers. Regular application code should stay on
// the typed helpers (createText, listTexts, etc.); these are for
// schema introspection (PRAGMA, sqlite_master) and ad-hoc diagnostic
// queries.
export async function dbQuery(sql, params) {
  return q(sql, params);
}
export async function dbRun(sql, params) {
  return r(sql, params);
}

// D3: PRAGMA integrity_check — runs SQLite's built-in self-check across
// the whole DB file. Returns "ok" string list when healthy, or a list of
// human-readable issue descriptions when corrupt. Cheap on small DBs (a
// few hundred MB OPFS), but we avoid running it on every page load — the
// init wrapper in index.html schedules it once per session via
// requestIdleCallback so first-paint isn't delayed.
//
// Returns: { ok: boolean, issues: string[], rawRows: any[] }.
export async function integrityCheck() {
  try {
    const rows = await q('PRAGMA integrity_check');
    // wa-sqlite returns rows as objects keyed by column name. The
    // PRAGMA's first column is named 'integrity_check'.
    const list = (rows || []).map((row) => {
      if (!row || typeof row !== 'object') return String(row);
      const k = Object.keys(row)[0];
      return k ? String(row[k]) : JSON.stringify(row);
    });
    const ok = list.length === 1 && list[0].toLowerCase() === 'ok';
    return { ok, issues: ok ? [] : list, rawRows: rows };
  } catch (e) {
    return { ok: false, issues: ['integrity_check failed: ' + (e && e.message ? e.message : String(e))], rawRows: [] };
  }
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
  // P0-1: elect a single owner tab. Follower tabs must NOT open the DB.
  await acquireDbOwnership();
  if (_followerMode) {
    if (typeof window !== 'undefined') window.__localDBFollower = true;
    return; // resolve without a worker — _call() fails fast & recoverably
  }
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
        h.reject(_wrapWorkerError(data.error));
      }
    };
    _worker.onerror = (e) => {
      const err = _wrapWorkerError(e && e.message ? e.message : 'Worker crashed: unknown');
      for (const h of _pending.values()) h.reject(err);
      _pending.clear();
    };
  }
  let preferVfs = null;
  try {
    if (typeof localStorage !== 'undefined') preferVfs = localStorage.getItem(_VFS_PREF_KEY);
  } catch (_) {}
  try {
    await _call('init', null, null, preferVfs ? { preferVfs } : null);
  } catch (e) {
    if (e instanceof DbUnavailableError) throw e;
    throw new DbUnavailableError('DB_INIT_FAILED', e && e.message ? e.message : String(e));
  }
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
  // LEFT JOIN text_progress so each text carries its last_row_idx (used by the
  // Library card "Прогресс: строка №"). text_progress.text_id is unique
  // (ON CONFLICT(text_id) upsert), so the join can't duplicate rows.
  if (query && query.trim()) {
    const like = `%${query.trim()}%`;
    return q(
      `SELECT texts.*, tp.last_row_idx AS last_row_idx
       FROM texts LEFT JOIN text_progress tp ON tp.text_id = texts.id
       WHERE texts.is_archived = ? AND (texts.title LIKE ? OR texts.source_text LIKE ? OR texts.source LIKE ? OR texts.topic LIKE ?)
       ORDER BY texts.is_pinned DESC, texts.pin_order ASC, texts.last_opened_at DESC NULLS LAST, texts.updated_at DESC LIMIT ?`,
      [arch, like, like, like, like, limit]
    );
  }
  return q(
    `SELECT texts.*, tp.last_row_idx AS last_row_idx
     FROM texts LEFT JOIN text_progress tp ON tp.text_id = texts.id
     WHERE texts.is_archived = ?
     ORDER BY texts.is_pinned DESC, texts.pin_order ASC, texts.last_opened_at DESC NULLS LAST, texts.updated_at DESC LIMIT ?`,
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

// ── Phase D — pre-computed context morphology (Dicta) per sentence ────────
// Upsert one sentence's tokens. tokens is an array of per-word records; it is
// JSON-serialized here. model_version lets a Dicta upgrade invalidate/re-run.
export async function saveSentenceMorph(textId, sentenceId, modelVersion, tokens, provider) {
  if (!textId || !sentenceId) throw new Error('saveSentenceMorph: textId + sentenceId required');
  const tokensJson = JSON.stringify(Array.isArray(tokens) ? tokens : []);
  const now = new Date().toISOString();
  await r(
    `INSERT INTO sentence_morph (sentence_id, text_id, model_version, tokens_json, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sentence_id) DO UPDATE SET
       model_version = excluded.model_version,
       tokens_json   = excluded.tokens_json,
       provider      = excluded.provider,
       updated_at    = excluded.updated_at`,
    [String(sentenceId), String(textId), String(modelVersion || ''), tokensJson, provider || null, now, now]
  );
}

// All stored morphology for a text, keyed by sentence_id (tokens parsed).
export async function getSentenceMorphForText(textId) {
  if (!textId) return {};
  const rows = await q(`SELECT sentence_id, model_version, tokens_json FROM sentence_morph WHERE text_id = ?`, [String(textId)]);
  const out = {};
  for (const row of (rows || [])) {
    let tokens = [];
    try { tokens = JSON.parse(row.tokens_json || '[]'); } catch (_) { tokens = []; }
    out[String(row.sentence_id)] = { model_version: row.model_version, tokens };
  }
  return out;
}

// One sentence's stored morphology (parsed tokens) or null.
export async function getSentenceMorph(sentenceId) {
  if (!sentenceId) return null;
  const rows = await q(`SELECT model_version, tokens_json FROM sentence_morph WHERE sentence_id = ?`, [String(sentenceId)]);
  if (!rows || !rows[0]) return null;
  let tokens = [];
  try { tokens = JSON.parse(rows[0].tokens_json || '[]'); } catch (_) { tokens = []; }
  return { model_version: rows[0].model_version, tokens };
}

// Coverage: how many of a text's sentences already have morphology for a model.
export async function getSentenceMorphCoverage(textId, modelVersion) {
  if (!textId) return { total: 0, enriched: 0 };
  const totalRows = await q(`SELECT COUNT(*) AS n FROM sentences WHERE text_id = ?`, [String(textId)]);
  const total = (totalRows && totalRows[0]) ? Number(totalRows[0].n) || 0 : 0;
  const encRows = modelVersion
    ? await q(`SELECT COUNT(*) AS n FROM sentence_morph WHERE text_id = ? AND model_version = ?`, [String(textId), String(modelVersion)])
    : await q(`SELECT COUNT(*) AS n FROM sentence_morph WHERE text_id = ?`, [String(textId)]);
  const enriched = (encRows && encRows[0]) ? Number(encRows[0].n) || 0 : 0;
  return { total, enriched };
}

export async function deleteSentenceMorphForText(textId) {
  if (!textId) return;
  await r(`DELETE FROM sentence_morph WHERE text_id = ?`, [String(textId)]);
}

// Coverage for ALL texts in ONE round-trip (library badge). Returns
// { textId: { total, enriched } }. enriched counts rows for the given model.
export async function getSentenceMorphCoverageBatch(modelVersion) {
  const out = {};
  const totals = await q(`SELECT text_id, COUNT(*) AS n FROM sentences GROUP BY text_id`);
  for (const row of (totals || [])) out[String(row.text_id)] = { total: Number(row.n) || 0, enriched: 0 };
  const enc = modelVersion
    ? await q(`SELECT text_id, COUNT(*) AS n FROM sentence_morph WHERE model_version = ? GROUP BY text_id`, [String(modelVersion)])
    : await q(`SELECT text_id, COUNT(*) AS n FROM sentence_morph GROUP BY text_id`);
  for (const row of (enc || [])) { const k = String(row.text_id); if (!out[k]) out[k] = { total: 0, enriched: 0 }; out[k].enriched = Number(row.n) || 0; }
  return out;
}

// ── ② — Pealim conjugation/declension paradigms, cached per lemma ─────────
// binyan is '' for nominals (PK needs NOT NULL). paradigm is the provider's
// raw slot→form envelope; JSON-serialized here. model_version invalidates on a
// provider/parser upgrade.
export async function saveLemmaInflection(lemma, binyan, pos, kind, modelVersion, paradigm, source, pealimId) {
  if (!lemma) throw new Error('saveLemmaInflection: lemma required');
  const json = JSON.stringify(paradigm || {});
  const now = new Date().toISOString();
  await r(
    `INSERT INTO lemma_inflection (lemma, binyan, model_version, pos, kind, paradigm_json, source, pealim_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(lemma, binyan, model_version) DO UPDATE SET
       pos           = excluded.pos,
       kind          = excluded.kind,
       paradigm_json = excluded.paradigm_json,
       source        = excluded.source,
       pealim_id     = excluded.pealim_id,
       updated_at    = excluded.updated_at`,
    [String(lemma), String(binyan || ''), String(modelVersion || ''), pos || null, kind || null, json, source || null, pealimId || null, now, now]
  );
}

// One lemma's paradigm (parsed) for a model, or null. binyan '' for nominals.
export async function getLemmaInflection(lemma, binyan, modelVersion) {
  if (!lemma) return null;
  const rows = await q(
    `SELECT paradigm_json, pos, kind, source FROM lemma_inflection WHERE lemma = ? AND binyan = ? AND model_version = ?`,
    [String(lemma), String(binyan || ''), String(modelVersion || '')]
  );
  if (!rows || !rows[0]) return null;
  let paradigm = null;
  try { paradigm = JSON.parse(rows[0].paradigm_json || 'null'); } catch (_) { paradigm = null; }
  return paradigm;
}

// Which of the given (lemma, binyan) keys already have a paradigm for a model.
// Returns a Set of "lemma binyan" keys — used to skip already-cached lemmas
// in the batch enrichment pass.
export async function getLemmaInflectionKeys(modelVersion) {
  const rows = await q(`SELECT lemma, binyan FROM lemma_inflection WHERE model_version = ?`, [String(modelVersion || '')]);
  const set = new Set();
  for (const row of (rows || [])) set.add(String(row.lemma) + ' ' + String(row.binyan || ''));
  return set;
}

export async function deleteLemmaInflectionForModel(modelVersion) {
  await r(`DELETE FROM lemma_inflection WHERE model_version = ?`, [String(modelVersion || '')]);
}

// Bulk-insert many paradigms in chunked transactions — for the offline Pealim
// dictionary import (Phase 2). rows: [{ lemma, binyan, modelVersion, pos, kind,
// paradigm, source, pealimId }]. ON CONFLICT upsert (idempotent re-import).
export async function bulkSaveLemmaInflections(rows, opts) {
  const list = Array.isArray(rows) ? rows : [];
  const chunk = (opts && opts.chunk) || 500;
  const now = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < list.length; i += chunk) {
    const slice = list.slice(i, i + chunk);
    await x('BEGIN;');
    try {
      for (const row of slice) {
        if (!row || !row.lemma) continue;
        await r(
          `INSERT INTO lemma_inflection (lemma, binyan, model_version, pos, kind, paradigm_json, source, pealim_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(lemma, binyan, model_version) DO UPDATE SET
             pos=excluded.pos, kind=excluded.kind, paradigm_json=excluded.paradigm_json,
             source=excluded.source, pealim_id=excluded.pealim_id, updated_at=excluded.updated_at`,
          [String(row.lemma), String(row.binyan || ''), String(row.modelVersion || ''), row.pos || null, row.kind || null,
           JSON.stringify(row.paradigm || {}), row.source || null, row.pealimId || null, now, now]
        );
        written++;
      }
      await x('COMMIT;');
    } catch (e) { await x('ROLLBACK;').catch(() => {}); throw e; }
    if (opts && typeof opts.onProgress === 'function') { try { opts.onProgress(Math.min(i + chunk, list.length), list.length); } catch (_) {} }
  }
  return written;
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

// Niqqud/diacritic-insensitive search normalization: strip Hebrew niqqud +
// cantillation + bidi/format marks so a VOCALIZED query (שֶׁלְּהַחֲלִים) matches the
// niqqud-free stored forms (sentences.he_plain, notes_v2 body_json.word). Latin/
// Cyrillic pass through unchanged (no niqqud to strip).
function _searchNrm(s) {
  return String(s == null ? "" : s).normalize("NFC")
    .replace(/[֑-ׇ]/g, "").replace(/[‌-‏‪-‮⁦-⁩﻿]/g, "").trim();
}

export async function searchSentences(queryStr, limit = 20) {
  const norm = _searchNrm(queryStr);
  if (!norm) return [];
  const like = `%${norm}%`;
  // Match against the niqqud-free he_plain (+ ru/translit); the stripped query
  // makes a vocalized Hebrew search hit too (he_niqqud match is now redundant).
  return q(
    `SELECT s.*, t.title AS text_title FROM sentences s
     JOIN texts t ON s.text_id = t.id
     WHERE t.is_archived = 0 AND (s.he_plain LIKE ? OR s.ru LIKE ? OR s.translit LIKE ?)
     ORDER BY t.last_opened_at DESC NULLS LAST LIMIT ?`,
    [like, like, like, limit]
  );
}

// ── notes ──────────────────────────────────────────────────────────────────
//
// Direction 9 Phase 9.1.B: notes API rewritten to operate against the
// new polymorphic notes_v2 table (migrations 021–025). Backwards-compat
// signatures preserved — `upsertNote(textId, sentenceId, note)`,
// `listNotes(textId)`, `deleteNote(textId, sentenceId)`, `searchNotes(q)`
// continue to work as before for callers that haven't been updated to
// the polymorphic API. Sentence-bound free notes are the most common
// case (and the only kind that survives ZIP-bundle export to Android v2),
// so the legacy contract is the default flow.
//
// New callers (Phase 9.1.C UI revamp, Phase 9.2 audio anchoring, etc.)
// should prefer the polymorphic helpers below: createNote / updateNote /
// listNotesByTarget / etc.

const _NOTE_TYPES = new Set([
  'free', 'word_study', 'grammar_rule', 'translation_discrepancy', 'pronunciation_note'
]);
const _TARGET_KINDS = new Set([
  'sentence', 'word', 'root', 'binyan', 'text', 'note', 'free'
]);

function _validateNoteType(t) {
  if (!_NOTE_TYPES.has(t)) throw new Error('invalid note_type: ' + t);
}
function _validateTargetKind(k) {
  if (!_TARGET_KINDS.has(k)) throw new Error('invalid target_kind: ' + k);
}

// Body builder — given a note_type + raw content (string for free notes,
// object for templated notes), return the JSON-encoded body_json that
// satisfies the migration 021 CHECK constraint.
function _buildBodyJson(noteType, content) {
  if (noteType === 'free') {
    // Legacy + default. Content is plaintext markdown.
    return JSON.stringify({ markdown: typeof content === 'string' ? content : String(content ?? '') });
  }
  // Templated notes (word_study, grammar_rule, etc.) — content must be
  // a typed object matching the template schema. Validation lives in
  // the UI / template layer; here we just JSON-encode.
  if (typeof content === 'string') {
    // Caller passed pre-encoded JSON — accept verbatim if it parses.
    try {
      JSON.parse(content);
      return content;
    } catch (_) {
      throw new Error('templated note content must be a JSON-encoded object');
    }
  }
  if (typeof content !== 'object' || content === null) {
    throw new Error('templated note content must be an object');
  }
  return JSON.stringify(content);
}

// ── Backwards-compat API (sentence-bound free notes) ─────────────────────

// Returns the legacy shape via the sentence_notes VIEW so any caller that
// expects {id, text_id, sentence_id, note, created_at, updated_at}
// continues to work. Polymorphic-aware callers should use
// listNotesByTarget / listAllNotesForText below.
export async function listNotes(textId) {
  // Direct query against notes_v2 (not the legacy sentence_notes VIEW) so
  // Phase 9.2 audio_anchor_ms reaches the caller. Same legacy column shape
  // otherwise (id / text_id / sentence_id / note / created_at / updated_at).
  return q(
    `SELECT id,
            text_id,
            target_id AS sentence_id,
            COALESCE(json_extract(body_json, '$.markdown'), '') AS note,
            audio_anchor_ms,
            created_at,
            updated_at
       FROM notes_v2
      WHERE text_id = ? AND target_kind = 'sentence' AND note_type = 'free'
      ORDER BY updated_at DESC`,
    [textId]
  );
}

// Upsert a sentence-bound free note. Same legacy semantics: one note per
// (text_id, sentence_id) pair; passing a new body replaces the old.
// Returns the row in the legacy {id, text_id, sentence_id, note, ...} shape.
export async function upsertNote(textId, sentenceId, note) {
  const now = new Date().toISOString();
  const proposed = _buildBodyJson('free', note);
  // Find existing sentence-bound free note for this (text_id, sentence_id).
  const existing = await q(
    `SELECT id, body_json FROM notes_v2
      WHERE text_id = ? AND target_kind = 'sentence'
        AND target_id = ? AND note_type = 'free'`,
    [textId, sentenceId]
  );

  if (existing.length > 0) {
    // UPDATE — preserves note id + created_at; refreshes body + updated_at.
    const existingId = existing[0].id;
    const prevBody = existing[0].body_json;
    const changed = proposed !== prevBody;
    await r(
      `UPDATE notes_v2
          SET body_json = ?, updated_at = ?
        WHERE id = ?`,
      [proposed, now, existingId]
    );
    if (changed) {
      // Snapshot new body as v_{MAX+1} — same semantics as updateNote().
      try {
        const nextVer = await _appendNoteVersion(existingId, proposed);
        await _trimNoteVersions(existingId, 50);
        await _stampVersionDiffSummary(existingId, nextVer, prevBody, proposed);
      } catch (_) { /* non-fatal */ }
    }
  } else {
    // INSERT — new sentence-bound free note.
    const id = crypto.randomUUID();
    await r(
      `INSERT INTO notes_v2 (id, target_kind, target_id, text_id, note_type,
                              title, body_json, created_at, updated_at)
       VALUES (?, 'sentence', ?, ?, 'free', '', ?, ?, ?)`,
      [id, sentenceId, textId, proposed, now, now]
    );
    // Seed v1 = body at first save.
    try {
      await _appendNoteVersion(id, proposed);
      await _stampVersionDiffSummary(id, 1, '', proposed);
    } catch (_) { /* non-fatal */ }
  }

  // Read back via the VIEW so the caller gets the legacy shape.
  const rows = await q(
    `SELECT * FROM sentence_notes WHERE text_id = ? AND sentence_id = ?`,
    [textId, sentenceId]
  );
  return rows[0] ?? null;
}

export async function deleteNote(textId, sentenceId) {
  // Delete the sentence-bound free note specifically — leave any other
  // polymorphic notes about this sentence (e.g. pronunciation_note) intact.
  await r(
    `DELETE FROM notes_v2
      WHERE text_id = ? AND target_kind = 'sentence'
        AND target_id = ? AND note_type = 'free'`,
    [textId, sentenceId]
  );
}

// Backwards-compat: searches sentence-bound free notes (the legacy domain).
// New polymorphic search lives in searchAllNotes() below.
export async function searchNotes(queryStr, limit = 20) {
  if (!queryStr || !queryStr.trim()) return [];
  const like = `%${queryStr.trim()}%`;
  return q(
    `SELECT n.*, t.title AS text_title, s.he_plain, s.ru
       FROM sentence_notes n
       JOIN texts t      ON n.text_id = t.id
       JOIN sentences s  ON n.sentence_id = s.id
      WHERE n.note LIKE ?
      ORDER BY n.updated_at DESC
      LIMIT ?`,
    [like, limit]
  );
}

// ── Polymorphic notes API (Phase 9.1.B) ──────────────────────────────────

// Insert a new note with arbitrary target_kind + note_type + body.
// Returns the inserted row from notes_v2.
//
// Caller passes:
//   { target_kind, target_id?, text_id?, note_type, title?, body,
//     audio_anchor_ms?, audio_asset_key? }
// where `body` is a string (free) or object (templated) — see _buildBodyJson.
//
// `target_id` semantics by kind:
//   sentence → sentence row id
//   word     → "<sentence_id>:<word_offset>" (or just sentence_id with
//              word offset in body_json — application convention)
//   root     → 3-letter Hebrew root string ('שלם')
//   binyan   → one of the 7 patterns
//   text     → text id (mirrors text_id)
//   note     → another note's id
//   free     → null
export async function createNote(opts) {
  const o = opts || {};
  _validateTargetKind(o.target_kind);
  _validateNoteType(o.note_type || 'free');

  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  const targetKind = o.target_kind;
  const noteType   = o.note_type || 'free';
  const targetId   = (targetKind === 'free') ? null : (o.target_id ?? null);
  // text_id: explicit when given, else derive from sentence target if FK
  // makes sense, else null (root/binyan/free are not bound to a text).
  let textId = o.text_id ?? null;
  if (!textId && targetKind === 'sentence' && targetId) {
    const ref = await q('SELECT text_id FROM sentences WHERE id = ?', [targetId]);
    textId = (ref[0] && ref[0].text_id) || null;
  }
  if (!textId && targetKind === 'text' && targetId) {
    textId = targetId;
  }

  const bodyJson = _buildBodyJson(noteType, o.body ?? '');
  const title    = String(o.title || '');

  await r(
    `INSERT INTO notes_v2
       (id, target_kind, target_id, text_id, note_type, title, body_json,
        audio_anchor_ms, audio_asset_key, srs_card_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, targetKind, targetId, textId, noteType, title, bodyJson,
      Number.isFinite(o.audio_anchor_ms) ? Math.max(0, Math.round(o.audio_anchor_ms)) : null,
      o.audio_asset_key ?? null,
      o.srs_card_id ?? null,
      now, now,
    ]
  );

  // Seed v1 = body at creation so the history sidebar shows a meaningful
  // entry on the very first save (matches user mental model: vN = body
  // after N-th save).
  try {
    await _appendNoteVersion(id, bodyJson);
    await _stampVersionDiffSummary(id, 1, '', bodyJson);
  } catch (_) { /* non-fatal — history will pick up on next save */ }

  const rows = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  return rows[0] ?? null;
}

// Update an existing polymorphic note. Only mutates the fields explicitly
// provided in `patch`; others are preserved. Body changes also create a
// note_versions row (versioning M5) before the update so history is kept.
//
// Retention: keep the most recent 50 versions per note (D6, FIFO).
export async function updateNote(id, patch) {
  if (!id) throw new Error('updateNote: id is required');
  const p = patch || {};
  const existing = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  const cur = existing[0];
  if (!cur) throw new Error('updateNote: note not found ' + id);

  // If body is being changed, snapshot the previous body_json into
  // note_versions before the update fires. Skip if body is unchanged or
  // not provided.
  let nextBodyJson = cur.body_json;
  if (Object.prototype.hasOwnProperty.call(p, 'body')) {
    const proposed = _buildBodyJson(p.note_type || cur.note_type, p.body);
    if (proposed !== cur.body_json) {
      // Snapshot the NEW body — v_N = body after N-th save.
      const nextVer = await _appendNoteVersion(id, proposed);
      nextBodyJson = proposed;
      await _trimNoteVersions(id, 50);
      await _stampVersionDiffSummary(id, nextVer, cur.body_json, proposed);
    }
  }

  // Build dynamic UPDATE — only the fields the caller provided.
  const fields = [];
  const values = [];
  function set(col, val) { fields.push(col + ' = ?'); values.push(val); }
  if (Object.prototype.hasOwnProperty.call(p, 'title'))           set('title', String(p.title || ''));
  if (Object.prototype.hasOwnProperty.call(p, 'note_type')) {
    _validateNoteType(p.note_type);
    set('note_type', p.note_type);
  }
  if (Object.prototype.hasOwnProperty.call(p, 'target_kind')) {
    _validateTargetKind(p.target_kind);
    set('target_kind', p.target_kind);
  }
  if (Object.prototype.hasOwnProperty.call(p, 'target_id'))       set('target_id', p.target_id ?? null);
  if (Object.prototype.hasOwnProperty.call(p, 'text_id'))         set('text_id', p.text_id ?? null);
  if (Object.prototype.hasOwnProperty.call(p, 'audio_anchor_ms')) set('audio_anchor_ms',
    Number.isFinite(p.audio_anchor_ms) ? Math.max(0, Math.round(p.audio_anchor_ms)) : null);
  if (Object.prototype.hasOwnProperty.call(p, 'audio_asset_key')) set('audio_asset_key', p.audio_asset_key ?? null);
  if (Object.prototype.hasOwnProperty.call(p, 'srs_card_id'))     set('srs_card_id', p.srs_card_id ?? null);
  // Provenance (Stage 3 / Concept A): a user-initiated BODY edit marks the note
  // as touched so regeneration (refreshCanonicalNoteBody) never clobbers it — the
  // R1 invariant «правки не затираются» — and the provenance badge flips from
  // «✨ авто» to the user's own. Metadata-only updates (audio anchor, srs link)
  // do NOT flip it (body unchanged). An explicit patch.user_touched wins.
  // refreshCanonicalNoteBody uses raw SQL (not updateNote) so autogen never trips this.
  if (Object.prototype.hasOwnProperty.call(p, 'user_touched')) {
    set('user_touched', p.user_touched ? 1 : 0);
  } else if (nextBodyJson !== cur.body_json) {
    set('user_touched', 1);
  }
  // body_json change always lands last so the trigger sees a real update.
  if (nextBodyJson !== cur.body_json) set('body_json', nextBodyJson);
  // Always bump updated_at — the trigger handles it but explicit avoids
  // depending on trigger semantics for callers that want a known value.
  set('updated_at', new Date().toISOString());
  values.push(id);

  if (fields.length === 1) {
    // Only updated_at would change — caller asked for nothing meaningful.
    return cur;
  }
  await r(
    `UPDATE notes_v2 SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  const rows = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  return rows[0] ?? null;
}

// Phase 9.3.5 R3 — explicit note-type conversion. The UI never silently
// flips note_type; it always routes through this entry point. We snapshot
// the current body_json as a new note_versions row so the pre-convert
// shape is preserved in history, then write a blank body for the new
// type (free → empty markdown; templated → empty body object). target_*
// stays the same — convert changes content shape, not anchoring.
//
// SRS card linkage (srs_card_id) is intentionally preserved: the card
// stays back-pointable but the UI surfaces a warn banner so the user
// can re-create it manually if the new type warrants a different card
// shape (R3 spec — never destructive auto-action).
export async function convertNoteType(id, newType) {
  if (!id) throw new Error('convertNoteType: id is required');
  _validateNoteType(newType);
  const existing = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  const cur = existing[0];
  if (!cur) throw new Error('convertNoteType: note not found ' + id);
  if (cur.note_type === newType) return cur; // no-op

  const nextVer = await _appendNoteVersion(id, cur.body_json);
  await _trimNoteVersions(id, 50);
  try { await _stampVersionDiffSummary(id, nextVer, null, cur.body_json); } catch (_) {}

  const blank = newType === 'free'
    ? JSON.stringify({ kind: 'free', markdown: '' })
    : JSON.stringify({ kind: newType });

  // R2.2 — drop the linked SRS card if present. Earlier R3 behavior kept
  // the card linked and showed a warn banner, but in practice the card
  // rendered as "Prompt: No prompt available" because its template_id
  // (e.g. tpl_note_word_study) no longer matched the note's body shape.
  // Cleaner UX: the warn banner now promises removal, and the user can
  // re-create a fresh card matching the new type via "🎴 Сделать карточкой".
  let droppedCardId = null;
  if (cur.srs_card_id) {
    droppedCardId = String(cur.srs_card_id);
    try { await r('DELETE FROM srs_reviews WHERE card_id = ?', [droppedCardId]); } catch (_) {}
    try { await r('DELETE FROM srs_cards WHERE id = ?', [droppedCardId]); } catch (_) {}
  }

  await r(
    `UPDATE notes_v2 SET note_type = ?, body_json = ?, srs_card_id = NULL, updated_at = ? WHERE id = ?`,
    [newType, blank, new Date().toISOString(), id]
  );
  const rows = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  const updated = rows[0] ?? null;
  if (updated) updated._droppedCardId = droppedCardId;
  return updated;
}

// Delete a polymorphic note by id. Cascades to note_versions + note_links
// via FK. Returns { ok: true, deleted: 1 } or { ok: true, deleted: 0 }.
export async function deleteNoteById(id) {
  if (!id) return { ok: true, deleted: 0 };
  const before = await q('SELECT 1 FROM notes_v2 WHERE id = ?', [id]);
  if (!before.length) return { ok: true, deleted: 0 };
  await r('DELETE FROM notes_v2 WHERE id = ?', [id]);
  return { ok: true, deleted: 1 };
}

// List notes by target (e.g. all notes whose target is a specific root).
export async function listNotesByTarget(targetKind, targetId) {
  _validateTargetKind(targetKind);
  if (targetKind === 'free') {
    return q(
      `SELECT * FROM notes_v2 WHERE target_kind = 'free' ORDER BY updated_at DESC`,
      []
    );
  }
  return q(
    `SELECT * FROM notes_v2 WHERE target_kind = ? AND target_id = ? ORDER BY updated_at DESC`,
    [targetKind, targetId]
  );
}

// All notes attached to (or related via text_id to) a specific text — for
// the Notes panel inside an open text. Includes polymorphic notes whose
// target is another part of the text (word, sentence, text-level, etc.).
export async function listAllNotesForText(textId) {
  return q(
    `SELECT * FROM notes_v2 WHERE text_id = ? ORDER BY updated_at DESC`,
    [textId]
  );
}

// ── ②-note autogen: canonical-lemma notes + occurrences (migration 052) ─────
// A canonical note is ONE word_study note per sense-lemma across the whole base,
// keyed by gen_dedup_key (pid:<id> | norm(lemma)#pos). It is NOT bound to a single
// text: text_id stays NULL (so deleting one text can't cascade-delete a note shared
// by others) and every surface position lives in note_occurrences. target_kind
// reuses 'word' (the CHECK enum has no 'lemma'); target_id = gen_dedup_key.

// The existing canonical note for a dedup key, or null.
export async function findNoteByDedupKey(dedupKey) {
  if (!dedupKey) return null;
  const rows = await q('SELECT * FROM notes_v2 WHERE gen_dedup_key = ?', [String(dedupKey)]);
  return rows[0] || null;
}

// R-3.6 — is there a «✍ Ваши» word-note already covering this exact position?
// Inline word notes use target_id '<sentenceId>:<offset>'; «Ваши» = source='user'
// OR user_touched=1 (matches the reading-view section split). Used by the autogen
// guard so an «✨ Авто» occurrence is never stacked on top of a user note (the
// reported duplicate). text_id is accepted for signature symmetry but the
// composite target_id is already globally unique (sentence ids are UUIDs).
export async function findUserWordNoteAt(textId, sentenceId, wordOffset) {
  if (!sentenceId) return null;
  const tid = String(sentenceId) + ':' + String(wordOffset);
  const rows = await q(
    `SELECT id FROM notes_v2
      WHERE target_kind='word' AND target_id=? AND (source='user' OR user_touched=1)
      LIMIT 1`, [tid]);
  return rows[0] || null;
}

// R-3.6 — one-time cleanup sweep for the «✍ Ваши» + «✨ Авто» duplicate: a word
// that has BOTH a user inline note AND a canonical auto note at the SAME position.
// Per the owner's rule, KEEP the auto note, REMOVE the duplicate user note.
// dryRun → { ok, dryRun:true, pairs, removed:0, byText } (counts only, no delete).
// Real run deletes the user notes and returns removed count. No-op (pairs:0) when
// no such pairs exist. Idempotent. Destructive on a real run — gate behind an
// explicit user action + dry-run review.
export async function dedupeUserAutoNotes(opts) {
  const dryRun = !!(opts && opts.dryRun);
  let rows = [];
  try {
    rows = await q(
      `SELECT DISTINCT n.id AS user_note_id, n.text_id AS text_id
         FROM note_occurrences o
         JOIN notes_v2 c ON c.id = o.note_id AND c.text_id IS NULL AND c.gen_dedup_key IS NOT NULL
         JOIN notes_v2 n ON n.target_kind = 'word'
                        AND n.target_id = (o.sentence_id || ':' || o.word_offset)
                        AND (n.source = 'user' OR n.user_touched = 1)`, []);
  } catch (_) { return { ok: false, pairs: 0, removed: 0, byText: {} }; }
  const byText = {};
  for (const r0 of rows) { const t = String(r0.text_id || '(canonical)'); byText[t] = (byText[t] || 0) + 1; }
  if (dryRun) return { ok: true, dryRun: true, pairs: rows.length, removed: 0, byText };
  let removed = 0;
  for (const r0 of rows) {
    try { await deleteNoteById(r0.user_note_id); removed++; } catch (_) {}
  }
  return { ok: true, dryRun: false, pairs: rows.length, removed, byText };
}

// Create a canonical word_study note with provenance. source ∈ {auto, curated};
// user_touched starts 0 (regeneration may refresh it until the user edits → then 1,
// set by updateNote callers, never by autogen). Returns the inserted row.
export async function createCanonicalNote(opts) {
  const o = opts || {};
  const dedupKey = String(o.gen_dedup_key || '');
  if (!dedupKey) throw new Error('createCanonicalNote: gen_dedup_key is required');
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  const bodyJson = _buildBodyJson('word_study', o.body ?? {});
  const source = String(o.source || 'auto');
  await r(
    `INSERT INTO notes_v2
       (id, target_kind, target_id, text_id, note_type, title, body_json,
        audio_anchor_ms, audio_asset_key, srs_card_id,
        source, confidence, model_version, user_touched, gen_dedup_key,
        created_at, updated_at)
     VALUES (?, 'word', ?, NULL, 'word_study', ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, dedupKey, String(o.title || ''), bodyJson,
      source,
      Number.isFinite(o.confidence) ? o.confidence : null,
      o.model_version != null ? String(o.model_version) : null,
      o.user_touched ? 1 : 0,
      dedupKey,
      now, now,
    ]
  );
  // Seed v1 = body at creation (mirrors createNote — meaningful first history entry).
  try { await _appendNoteVersion(id, bodyJson); await _stampVersionDiffSummary(id, 1, '', bodyJson); } catch (_) {}
  const rows = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  return rows[0] || null;
}

// Refresh an auto/curated canonical note's body — but NEVER when the user has
// touched it (user_touched=1 → their edits are sacrosanct under regeneration).
// Returns true if updated, false if skipped (user-touched / not found).
export async function refreshCanonicalNoteBody(noteId, opts) {
  if (!noteId) return false;
  const o = opts || {};
  const cur = (await q('SELECT user_touched, body_json FROM notes_v2 WHERE id = ?', [String(noteId)]))[0];
  if (!cur || Number(cur.user_touched) === 1) return false;
  const bodyJson = _buildBodyJson('word_study', o.body ?? {});
  if (bodyJson === cur.body_json && o.confidence == null && o.source == null) return false;
  const now = new Date().toISOString();
  await r(
    `UPDATE notes_v2 SET body_json = ?,
       source = COALESCE(?, source),
       confidence = COALESCE(?, confidence),
       model_version = COALESCE(?, model_version),
       updated_at = ?
     WHERE id = ? AND user_touched = 0`,
    [bodyJson, o.source != null ? String(o.source) : null,
     Number.isFinite(o.confidence) ? o.confidence : null,
     o.model_version != null ? String(o.model_version) : null,
     now, String(noteId)]
  );
  return true;
}

// Record one surface occurrence of a canonical note (idempotent via ux_note_occ).
export async function addNoteOccurrence(noteId, occ) {
  if (!noteId || !occ) return;
  await r(
    `INSERT OR IGNORE INTO note_occurrences (note_id, text_id, sentence_id, word_offset, surface)
     VALUES (?, ?, ?, ?, ?)`,
    [
      String(noteId),
      occ.text_id != null ? String(occ.text_id) : null,
      occ.sentence_id != null ? String(occ.sentence_id) : null,
      Number.isInteger(occ.word_offset) ? occ.word_offset : null,
      occ.surface != null ? String(occ.surface) : null,
    ]
  );
}

// Remove ONE surface occurrence of a canonical note (Stage-5 collect undo).
// Matches the exact (note_id, text_id, sentence_id, word_offset) tuple the
// occurrence was inserted with — uses IS so a NULL text_id (cross-text canonical)
// also matches. Idempotent: deleting a non-existent row is a no-op.
export async function removeNoteOccurrence(noteId, occ) {
  if (!noteId || !occ) return { ok: true };
  await r(
    `DELETE FROM note_occurrences
       WHERE note_id = ? AND text_id IS ? AND sentence_id IS ? AND word_offset IS ?`,
    [
      String(noteId),
      occ.text_id != null ? String(occ.text_id) : null,
      occ.sentence_id != null ? String(occ.sentence_id) : null,
      Number.isInteger(occ.word_offset) ? occ.word_offset : null,
    ]
  );
  return { ok: true };
}

// All occurrences of a canonical note (reading-view index / growth analytics).
export async function listNoteOccurrences(noteId) {
  if (!noteId) return [];
  return q('SELECT * FROM note_occurrences WHERE note_id = ? ORDER BY id', [String(noteId)]);
}

// Phase 9.3.5.B — all notes belonging to a single row's learning context.
// Returns sentence-target notes (target_kind='sentence' AND target_id=sid)
// PLUS word-target notes whose target_id is scoped to this sentence
// (Phase 9.3.5.F format `'<sentence_id>:<word_offset>'` or legacy bare-lemma).
// Phase 9.3.5 R2.1 bug-fix — sort by **created_at ASC** instead of
// updated_at DESC. Why: user expectation is "notes appear in the order I
// made them"; updated_at DESC pushed the first-created free note to the
// bottom of the list (Bug 2026-05-12 dogfood report) and made users think
// it was missing.
export async function listNotesForRow(textId, sentenceId) {
  if (!textId || !sentenceId) return [];
  return q(
    `SELECT * FROM notes_v2
       WHERE text_id = ?
         AND (
           (target_kind = 'sentence' AND target_id = ?)
           OR (target_kind = 'word' AND target_id LIKE ? || ':%')
         )
       ORDER BY created_at ASC`,
    [String(textId), String(sentenceId), String(sentenceId)]
  );
}

// Phase 9.3.5 R2.1 — fast per-text per-row note count, primed on text load
// so the row-button "📝 N" count badge survives a page refresh. Returns
// `Array<{ sentence_id, count }>` covering all sentences in the text with
// at least one row-bound note (sentence-target OR word-target whose target_id
// starts with that sentence's id).
export async function getRowNoteCounts(textId) {
  if (!textId) return [];
  return q(
    `SELECT sentence_id, COUNT(*) AS count FROM (
       SELECT target_id AS sentence_id
         FROM notes_v2
        WHERE text_id = ? AND target_kind = 'sentence'
       UNION ALL
       SELECT substr(target_id, 1, instr(target_id, ':') - 1) AS sentence_id
         FROM notes_v2
        WHERE text_id = ? AND target_kind = 'word'
          AND instr(target_id, ':') > 0
     )
     WHERE sentence_id IS NOT NULL AND sentence_id != ''
     GROUP BY sentence_id`,
    [String(textId), String(textId)]
  );
}

// Get a single polymorphic note by id (returns null if not found).
export async function getNoteById(id) {
  const rows = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  return rows[0] ?? null;
}

// Polymorphic search — searches body_json text via LIKE on the JSON-
// encoded form (good enough for v3.2; FTS5 upgrade is C-series backlog).
// Returns rows enriched with text title where applicable.
export async function searchAllNotes(queryStr, limit = 50) {
  if (!queryStr || !queryStr.trim()) return [];
  const like = `%${queryStr.trim()}%`;
  return q(
    `SELECT n.*, t.title AS text_title
       FROM notes_v2 n
       LEFT JOIN texts t ON n.text_id = t.id
      WHERE (n.body_json LIKE ? OR n.title LIKE ?)
        AND (t.is_archived IS NULL OR t.is_archived = 0)
      ORDER BY n.updated_at DESC
      LIMIT ?`,
    [like, like, limit]
  );
}

// notes_v2 search for the library/dashboard «заметки» scope — the polymorphic
// table the UI actually writes word_study notes to (the legacy searchNotes only
// sees the old sentence_notes free-text table, so word notes were unfindable).
// Niqqud-insensitive (body_json.word is stored niqqud-free); JOINs the sentence
// via the composite target_id "<sentenceId>:<offset>" so hits render with the
// row + snippet and can jump back. Returns the shape v3NotesRender expects.
export async function searchWordNotes(queryStr, limit = 50) {
  const norm = _searchNrm(queryStr);
  if (!norm) return [];
  const like = `%${norm}%`;
  return q(
    `SELECT n.id, n.text_id, n.target_kind, n.target_id, n.note_type, n.title,
            n.updated_at, t.title AS text_title,
            json_extract(n.body_json, '$.word')           AS j_word,
            json_extract(n.body_json, '$.niqqud_variant') AS j_niqqud,
            json_extract(n.body_json, '$.meaning')         AS j_meaning,
            json_extract(n.body_json, '$.markdown')        AS j_markdown,
            (CASE WHEN instr(n.target_id, ':') > 0
                  THEN substr(n.target_id, 1, instr(n.target_id, ':') - 1)
                  ELSE n.target_id END) AS sentence_id,
            s.he_plain, s.order_index
       FROM notes_v2 n
       LEFT JOIN texts t ON n.text_id = t.id
       LEFT JOIN sentences s ON s.id = (CASE WHEN instr(n.target_id, ':') > 0
                  THEN substr(n.target_id, 1, instr(n.target_id, ':') - 1)
                  ELSE n.target_id END)
      WHERE (n.body_json LIKE ? OR n.title LIKE ?)
        AND (t.is_archived IS NULL OR t.is_archived = 0)
      ORDER BY n.updated_at DESC
      LIMIT ?`,
    [like, like, limit]
  );
}

// ── Canonical-note surfacing (Stage 2 / FORK 1) ──────────────────────────
// Canonical autogen notes live with text_id=NULL and their reading positions
// in note_occurrences (one note → many texts). The legacy reading-view queries
// filter notes_v2 by text_id, so they can't see canonical notes. These additive
// variants UNION the legacy result with an occurrence-JOIN so a built note is
// visible exactly where the user reads (R4 «без тупиков»). Legacy `sid:offset`
// word notes keep working unchanged.

// Per-row count badge, canonical-aware. Counts each note once per sentence even
// if it occurs at several offsets in that sentence (GROUP BY note_id,sentence_id).
export async function getRowNoteCountsWithCanonical(textId) {
  if (!textId) return [];
  return q(
    `SELECT sentence_id, COUNT(*) AS count FROM (
       SELECT target_id AS sentence_id
         FROM notes_v2
        WHERE text_id = ? AND target_kind = 'sentence'
       UNION ALL
       SELECT substr(target_id, 1, instr(target_id, ':') - 1) AS sentence_id
         FROM notes_v2
        WHERE text_id = ? AND target_kind = 'word'
          AND instr(target_id, ':') > 0
       UNION ALL
       SELECT o.sentence_id AS sentence_id
         FROM note_occurrences o
         JOIN notes_v2 n ON n.id = o.note_id
        WHERE n.text_id IS NULL AND o.text_id = ?
        GROUP BY o.note_id, o.sentence_id
     )
     WHERE sentence_id IS NOT NULL AND sentence_id != ''
     GROUP BY sentence_id`,
    [String(textId), String(textId), String(textId)]
  );
}

// Per-row note list, canonical-aware. UNION (not UNION ALL) dedups a canonical
// note that occurs more than once in the same sentence to a single row.
export async function listNotesForRowWithCanonical(textId, sentenceId) {
  if (!textId || !sentenceId) return [];
  return q(
    `SELECT * FROM (
       SELECT * FROM notes_v2
         WHERE text_id = ?
           AND (
             (target_kind = 'sentence' AND target_id = ?)
             OR (target_kind = 'word' AND target_id LIKE ? || ':%')
           )
       UNION
       SELECT n.* FROM notes_v2 n
         JOIN note_occurrences o ON o.note_id = n.id
        WHERE n.text_id IS NULL AND o.sentence_id = ?
     )
     ORDER BY created_at ASC`,
    [String(textId), String(sentenceId), String(sentenceId), String(sentenceId)]
  );
}

// Editor open-by-position fallback: resolve a tapped (sentence,offset) to the
// canonical note recorded at that occurrence. Returns the note row or null.
// (Legacy positional notes are found by `sid:offset` target_id elsewhere; this
// covers the canonical model where positions live in note_occurrences.)
export async function getNoteByOccurrence(sentenceId, wordOffset) {
  if (!sentenceId || !Number.isInteger(wordOffset)) return null;
  const rows = await q(
    `SELECT note_id FROM note_occurrences
       WHERE sentence_id = ? AND word_offset = ?
       ORDER BY id LIMIT 1`,
    [String(sentenceId), wordOffset]
  );
  if (!rows[0]) return null;
  return getNoteById(rows[0].note_id);
}

// searchWordNotes, canonical-aware: same shape as searchWordNotes, plus canonical
// notes surfaced via a representative occurrence (MIN(id)) so the hit can render
// the row + snippet and jump back. Niqqud-insensitive (body stored niqqud-free).
export async function searchWordNotesWithCanonical(queryStr, limit = 50) {
  const norm = _searchNrm(queryStr);
  if (!norm) return [];
  const like = `%${norm}%`;
  return q(
    `SELECT * FROM (
       SELECT n.id, n.text_id, n.target_kind, n.target_id, n.note_type, n.title,
              n.updated_at, t.title AS text_title,
              json_extract(n.body_json, '$.word')           AS j_word,
              json_extract(n.body_json, '$.niqqud_variant') AS j_niqqud,
              json_extract(n.body_json, '$.meaning')         AS j_meaning,
              json_extract(n.body_json, '$.markdown')        AS j_markdown,
              (CASE WHEN instr(n.target_id, ':') > 0
                    THEN substr(n.target_id, 1, instr(n.target_id, ':') - 1)
                    ELSE n.target_id END) AS sentence_id,
              s.he_plain, s.order_index
         FROM notes_v2 n
         LEFT JOIN texts t ON n.text_id = t.id
         LEFT JOIN sentences s ON s.id = (CASE WHEN instr(n.target_id, ':') > 0
                    THEN substr(n.target_id, 1, instr(n.target_id, ':') - 1)
                    ELSE n.target_id END)
        WHERE n.text_id IS NOT NULL
          AND (n.body_json LIKE ? OR n.title LIKE ?)
          AND (t.is_archived IS NULL OR t.is_archived = 0)
       UNION ALL
       SELECT n.id, o.text_id AS text_id, n.target_kind, n.target_id, n.note_type, n.title,
              n.updated_at, t.title AS text_title,
              json_extract(n.body_json, '$.word')           AS j_word,
              json_extract(n.body_json, '$.niqqud_variant') AS j_niqqud,
              json_extract(n.body_json, '$.meaning')         AS j_meaning,
              json_extract(n.body_json, '$.markdown')        AS j_markdown,
              o.sentence_id AS sentence_id,
              s.he_plain, s.order_index
         FROM notes_v2 n
         JOIN note_occurrences o ON o.note_id = n.id
              AND o.id = (SELECT MIN(o2.id) FROM note_occurrences o2 WHERE o2.note_id = n.id)
         LEFT JOIN texts t ON t.id = o.text_id
         LEFT JOIN sentences s ON s.id = o.sentence_id
        WHERE n.text_id IS NULL
          AND (n.body_json LIKE ? OR n.title LIKE ?)
          AND (t.is_archived IS NULL OR t.is_archived = 0)
     )
     ORDER BY updated_at DESC
     LIMIT ?`,
    [like, like, like, like, limit]
  );
}

// ── Versioning (M5) ──────────────────────────────────────────────────────

// Snapshot semantics (post-9.1.E hardening): v_N stores the body AFTER the
// N-th save. createNote produces v1; each updateNote/upsertNote body change
// produces v_{MAX+1}; restoreNoteVersion produces a new version with the
// restored body. v_MAX always equals the current notes_v2.body_json.
async function _appendNoteVersion(noteId, snapshotBody) {
  // H1 hardening: SELECT MAX → INSERT is race-prone under concurrent saves.
  // (note_id, version) PRIMARY KEY rejects the loser; we retry-on-conflict.
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const maxRow = await q(
      'SELECT COALESCE(MAX(version), 0) AS m FROM note_versions WHERE note_id = ?',
      [noteId]
    );
    const nextVer = Number((maxRow[0] && maxRow[0].m) || 0) + 1;
    try {
      await r(
        `INSERT INTO note_versions (note_id, version, body_json, edited_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        [noteId, nextVer, snapshotBody]
      );
      return nextVer;
    } catch (e) {
      const msg = (e && e.message ? String(e.message) : String(e)).toLowerCase();
      const isConstraint = msg.indexOf('constraint') !== -1 || msg.indexOf('unique') !== -1;
      if (!isConstraint || attempt === MAX_RETRIES - 1) throw e;
    }
  }
  throw new Error('_appendNoteVersion: exhausted retries for note ' + noteId);
}

// Compute and stamp a human-friendly diff summary on the version row that
// was just inserted (for history sidebar). +N -M chars.
async function _stampVersionDiffSummary(noteId, version, oldBody, newBody) {
  try {
    const oldText = _extractMarkdown(oldBody);
    const newText = _extractMarkdown(newBody);
    const added   = Math.max(0, newText.length - oldText.length);
    const removed = Math.max(0, oldText.length - newText.length);
    const summary = `+${added} / -${removed}`;
    await r(
      `UPDATE note_versions SET diff_summary = ? WHERE note_id = ? AND version = ?`,
      [summary, noteId, version]
    );
  } catch (_) { /* best-effort */ }
}

function _extractMarkdown(bodyJson) {
  try {
    const parsed = JSON.parse(bodyJson || '{}');
    if (typeof parsed.markdown === 'string') return parsed.markdown;
    // Templated notes — just stringify everything; rough but works for delta.
    return JSON.stringify(parsed);
  } catch (_) { return ''; }
}

// FIFO retention — keep most recent `keep` versions per note. Older
// versions are deleted. D6 default keep=50.
async function _trimNoteVersions(noteId, keep) {
  const total = await q(
    'SELECT COUNT(*) AS c FROM note_versions WHERE note_id = ?',
    [noteId]
  );
  const count = Number((total[0] && total[0].c) || 0);
  if (count <= keep) return;
  // Delete oldest excess. SQLite doesn't support LIMIT in DELETE without
  // compile-time flag, so use a sub-select.
  await r(
    `DELETE FROM note_versions
       WHERE note_id = ?
         AND version IN (
           SELECT version FROM note_versions
            WHERE note_id = ?
            ORDER BY version ASC
            LIMIT ?
         )`,
    [noteId, noteId, count - keep]
  );
}

export async function listNoteVersions(noteId) {
  return q(
    `SELECT note_id, version, body_json, diff_summary, edited_at
       FROM note_versions
      WHERE note_id = ?
      ORDER BY version DESC`,
    [noteId]
  );
}

// Restore a note to a previous version. Creates a new version (the current
// state) before reverting, so restore is itself an undoable operation.
export async function restoreNoteVersion(noteId, version) {
  const verRows = await q(
    'SELECT body_json FROM note_versions WHERE note_id = ? AND version = ?',
    [noteId, version]
  );
  if (!verRows.length) throw new Error('restoreNoteVersion: version not found');
  const targetBody = verRows[0].body_json;
  const cur = await q('SELECT body_json FROM notes_v2 WHERE id = ?', [noteId]);
  if (!cur.length) throw new Error('restoreNoteVersion: note not found');
  const prevBody = cur[0].body_json;
  // Apply restore.
  await r(
    `UPDATE notes_v2 SET body_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    [targetBody, noteId]
  );
  // Snapshot restored body as new version (v_N = body after N-th save).
  // Skip if body actually didn't change (restoring to current state is a
  // no-op for history).
  if (targetBody !== prevBody) {
    const nextVer = await _appendNoteVersion(noteId, targetBody);
    await _stampVersionDiffSummary(noteId, nextVer, prevBody, targetBody);
    await _trimNoteVersions(noteId, 50);
  }
  const rows = await q('SELECT * FROM notes_v2 WHERE id = ?', [noteId]);
  return rows[0] ?? null;
}

// ── Links (M4) ───────────────────────────────────────────────────────────

// Replace all outgoing links from a note with the given list. Idempotent.
// links: Array<{to_kind, to_id, link_alias?}>
export async function setNoteLinks(noteId, links) {
  if (!noteId) throw new Error('setNoteLinks: noteId is required');
  await r('DELETE FROM note_links WHERE from_note_id = ?', [noteId]);
  for (const l of (Array.isArray(links) ? links : [])) {
    if (!l || !l.to_kind || !l.to_id) continue;
    try {
      await r(
        `INSERT OR IGNORE INTO note_links (from_note_id, to_kind, to_id, link_alias)
         VALUES (?, ?, ?, ?)`,
        [noteId, l.to_kind, String(l.to_id), l.link_alias ?? null]
      );
    } catch (_) { /* CHECK fail or other issue — skip this link */ }
  }
}

// Phase 9.3.B — atomic single-edge helpers for the modal Links panel.
// Avoids the wasteful "fetch all + filter + setNoteLinks" pattern. INSERT
// OR IGNORE keeps the operation idempotent (re-adding the same edge is
// a no-op, not an error).
export async function addNoteLink(noteId, { to_kind, to_id, link_alias } = {}) {
  if (!noteId) throw new Error('addNoteLink: noteId is required');
  if (!to_kind || to_id == null || to_id === '') {
    throw new Error('addNoteLink: to_kind + to_id required');
  }
  await r(
    `INSERT OR IGNORE INTO note_links (from_note_id, to_kind, to_id, link_alias)
     VALUES (?, ?, ?, ?)`,
    [noteId, String(to_kind), String(to_id), (link_alias != null ? String(link_alias) : null)]
  );
}

export async function removeNoteLink(noteId, toKind, toId) {
  if (!noteId) throw new Error('removeNoteLink: noteId is required');
  await r(
    `DELETE FROM note_links WHERE from_note_id = ? AND to_kind = ? AND to_id = ?`,
    [noteId, String(toKind), String(toId)]
  );
}

export async function listOutgoingLinks(noteId) {
  return q(
    `SELECT from_note_id, to_kind, to_id, link_alias, created_at
       FROM note_links WHERE from_note_id = ?`,
    [noteId]
  );
}

// "What links to this thing?" — used for the backlinks panel in the
// Notes editor + for "where is this root referenced?" cross-text discovery.
export async function listBacklinks(toKind, toId) {
  _validateTargetKind(toKind);
  return q(
    `SELECT l.from_note_id, l.to_kind, l.to_id, l.link_alias,
            n.title AS note_title, n.text_id AS note_text_id,
            n.note_type AS note_type, n.updated_at AS note_updated_at
       FROM note_links l
       JOIN notes_v2 n ON n.id = l.from_note_id
      WHERE l.to_kind = ? AND l.to_id = ?
      ORDER BY n.updated_at DESC`,
    [toKind, String(toId)]
  );
}

// ── v3.6 Smart Learning Graph — note_link_suggestions CRUD (Phase 4) ──────
// Durable learner decisions on auto-suggested A2 connections. Separate
// from note_links: confirming ALSO writes a real note_links row (via
// addNoteLink, idempotent) — this table only records the lifecycle so
// the generator's suppression contract can hide decided candidates.
// No telemetry, no network, local only. PK (from,to_kind,to_id,reason).

// Upsert a decision (idempotent on the PK). `state` ∈
// pending|confirmed|rejected|later. decided_at defaults to now for a
// terminal state; pending leaves it NULL.
export async function upsertSuggestion(s = {}) {
  const from = String(s.from || s.from_note_id || '');
  const toKind = String(s.to_kind || 'note');
  const toId = String(s.to != null ? s.to : (s.to_id != null ? s.to_id : ''));
  const reason = String(s.reason_code || '');
  if (!from || !toId || !reason) {
    throw new Error('upsertSuggestion: from + to + reason_code required');
  }
  const state = String(s.state || 'pending');
  const decidedAt = (state === 'pending')
    ? null
    : (s.decided_at ? String(s.decided_at) : new Date().toISOString());
  await r(
    `INSERT INTO note_link_suggestions
       (from_note_id, to_kind, to_id, reason_code, evidence, score, state, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(from_note_id, to_kind, to_id, reason_code)
     DO UPDATE SET evidence = excluded.evidence,
                   score    = excluded.score,
                   state    = excluded.state,
                   decided_at = excluded.decided_at`,
    [from, toKind, toId, reason,
     (s.evidence != null ? String(s.evidence) : null),
     Number.isFinite(s.score) ? s.score : 0,
     state, decidedAt]
  );
}

// Convenience: set just the state of one (already-known) candidate.
export async function setSuggestionState(from, toKind, toId, reasonCode, state, opts = {}) {
  return upsertSuggestion({
    from, to_kind: toKind, to: toId, reason_code: reasonCode,
    state, evidence: opts.evidence, score: opts.score,
    decided_at: opts.decided_at,
  });
}

// Raw rows for a note (debug / future export).
export async function listSuggestions(noteId) {
  if (!noteId) return [];
  return q(
    `SELECT from_note_id, to_kind, to_id, reason_code, evidence,
            score, state, created_at, decided_at
       FROM note_link_suggestions
      WHERE from_note_id = ?`,
    [String(noteId)]
  );
}

// Decisions in the exact shape the generator's suppression contract
// expects ({from,to,to_kind,reason_code,state,decided_at}). Only
// terminal decisions matter for suppression; pending rows are noise.
export async function listSuggestionDecisions(noteId) {
  if (!noteId) return [];
  const rows = await q(
    `SELECT from_note_id, to_kind, to_id, reason_code, state, decided_at
       FROM note_link_suggestions
      WHERE from_note_id = ? AND state IN ('confirmed','rejected','later')`,
    [String(noteId)]
  );
  return (rows || []).map((d) => ({
    from: d.from_note_id, to: d.to_id, to_kind: d.to_kind,
    reason_code: d.reason_code, state: d.state, decided_at: d.decided_at,
  }));
}

// ── v3.6 Phase 7 (A5) — learning-state overlay (read-only) ───────────────
// Per-note learning state derived from srs_cards (linked via
// source_note_id) + srs_attempts accuracy. Read-only aggregate; one
// query; tolerant of missing tables → {} (overlay simply absent).
// State salience: weak > stale > learning > new > known (the most
// attention-worthy state wins when a note has several cards).
export async function getLearningStateOverlay() {
  let rows;
  try {
    rows = await q(
      `SELECT c.source_note_id AS note_id,
              c.state          AS card_state,
              c.lapses         AS lapses,
              c.reps           AS reps,
              c.due_date       AS due_date,
              COUNT(a.id)      AS attempts,
              SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM srs_cards c
         LEFT JOIN srs_attempts a ON a.card_id = c.id
        WHERE c.source_note_id IS NOT NULL
        GROUP BY c.id`, []);
  } catch (_) { return {}; }              // srs_* absent → no overlay

  const RANK = { weak: 0, stale: 1, learning: 2, new: 3, known: 4 };
  const now = Date.now();
  const OVERDUE_MS = 7 * 24 * 60 * 60 * 1000;
  const out = {};
  for (const r0 of (rows || [])) {
    const id = String(r0.note_id || "");
    if (!id) continue;
    const attempts = Number(r0.attempts) || 0;
    const correct = Number(r0.correct) || 0;
    const lapses = Number(r0.lapses) || 0;
    const reps = Number(r0.reps) || 0;
    const cs = String(r0.card_state || "new").toLowerCase();
    let state;
    // A card studied in Anki (R-3.2 sync) has NO in-app srs_attempts, so the
    // card's own `state`/`reps` — not attempt count — is the authority on whether
    // it's been studied. `reps` advances on every review (in-app OR Anki-synced);
    // a truly-unstudied card has reps 0 AND attempts 0.
    if (cs === "suspended") {
      // Deliberately set aside in Anki — engaged but NOT mastered (never "known").
      state = "learning";
    } else if ((attempts >= 3 && (correct / attempts) < 0.5) || lapses >= 2) {
      // "weak" = needs work: poor accuracy over enough attempts, OR ≥2 lapses.
      state = "weak";
    } else if (r0.due_date && Date.parse(r0.due_date) < (now - OVERDUE_MS)) {
      state = "stale";
    } else if (cs === "new" || (attempts === 0 && reps === 0)) {
      state = "new";
    } else if (cs === "learning" || cs === "relearning") {
      state = "learning";
    } else {
      state = "known";
    }
    // keep the most attention-worthy state per note
    if (out[id] == null || RANK[state] < RANK[out[id]]) out[id] = state;
  }
  return out;
}

// ── ②-autogen Stage 4 (Concept D) — per-text learning coverage + i+1 frontier ──
// Read-only. For a text's canonical word_study notes (positions in note_occurrences,
// canonical notes have text_id IS NULL), bucket each by its SRS learning state
// (getLearningStateOverlay; uncarded ⇒ 'new') and compute the i+1 FRONTIER: an
// uncarded note whose root family is already ENGAGED (has a non-'new' sibling
// somewhere in the base — you've started this root, here's the next sense). Cold-
// start roots (every member still 'new') are excluded — that avoids an SRS flood
// and honours «употребление > формы» (R2). The frontier list feeds the explicit
// SRS seed (v3NotesSeedFrontierToSrs → createCardFromNote). NO writes, NO migration.
export async function getTextLearningCoverage(textId) {
  if (!textId) return { ok: false };
  let occ, allWordNotes, overlay;
  try {
    occ = await q(`SELECT DISTINCT note_id FROM note_occurrences WHERE text_id = ?`, [String(textId)]);
    allWordNotes = await q(
      `SELECT id, json_extract(body_json,'$.root') AS root, srs_card_id
         FROM notes_v2 WHERE note_type = 'word_study'`, []);
    overlay = await getLearningStateOverlay();
  } catch (_) { return { ok: false }; }
  const textIds = new Set((occ || []).map((r0) => String(r0.note_id)));
  // root → engaged? (any member note in a non-'new' state = the learner has touched it)
  const rootEngaged = new Map();
  for (const n of (allWordNotes || [])) {
    const root = String(n.root || "").trim();
    if (!root) continue;
    const st = overlay[String(n.id)] || "new";
    if (st !== "new") rootEngaged.set(root, true);
    else if (!rootEngaged.has(root)) rootEngaged.set(root, false);
  }
  let total = 0, known = 0, learning = 0, weak = 0, neu = 0, i1 = 0;
  const frontier = [];
  for (const n of (allWordNotes || [])) {
    if (!textIds.has(String(n.id))) continue;
    total++;
    const root = String(n.root || "").trim();
    const st = overlay[String(n.id)] || "new";
    if (st === "known") known++;
    else if (st === "learning") learning++;
    else if (st === "weak" || st === "stale") weak++;
    else neu++;
    const engaged = !!root && rootEngaged.get(root) === true;
    if (engaged) i1++;
    if (engaged && !n.srs_card_id && st === "new") frontier.push(String(n.id));
  }
  const i1_ratio = total ? Math.round((100 * i1) / total) : 0;
  return { ok: true, total, known, learning, weak, new: neu, i1_ratio, frontier };
}

// ── R-3.2 Anki Connect sync — apply Anki review state to local srs_cards ──────
// Anki is the authoritative review layer (docs/SRS_STRATEGY_v3_2.md), so we
// mirror its scheduler fields into srs_cards → getLearningStateOverlay /
// getTextLearningCoverage now reflect REAL mastery (was: in-app SM2 stub only),
// and the i+1 frontier is seeded from real data. `states` come from the read
// path v3AnkiFetchWordReviewStates (each already mapped + tied to a CANONICAL
// note via the lp_note_<id> tag). Behaviour:
//   • Note already has a card → overwrite its SM2 fields with Anki's.
//   • Note has NO card but was GENUINELY reviewed in Anki (reps>0 AND
//     (type!==0 OR interval>0)) → materialize one (createCardFromNote) then
//     overwrite. Words merely exported but never studied are SKIPPED — no SRS
//     flood (R2: употребление > формы); the forgotten/reset case (type 0 &
//     ivl 0) is excluded so a reset card never resurrects as "known".
//   • Every touched card is stamped meta_json.anki_managed=true (+ a raw Anki
//     snapshot for provenance/diffing) and is EXCLUDED from the in-app due queue
//     (listTodayCards) — review lives in Anki, no double-review.
//   • Conflict guard: Anki wins UNLESS the local card was reviewed in-app strictly
//     more recently than Anki's last-modified (rare) — then keep the fresh local
//     SM2 numbers but still mark it managed; the next Anki review reasserts Anki.
// Idempotent: re-running converges (last-writer-wins keyed on note id). No writes
// to notes_v2 beyond the createCardFromNote backlink. No migration (meta_json +
// free-text state already exist).
export async function applyAnkiReviewStates(states) {
  const res = { materialized: 0, updated: 0, conflictKeptLocal: 0, skippedNotReviewed: 0, missingNote: 0, suspended: 0 };
  const nowIso = () => new Date().toISOString();
  for (const s of (Array.isArray(states) ? states : [])) {
    const localNoteId = s && s.localNoteId;
    const st = s && s.stat;
    if (!localNoteId || !st) continue;

    const noteRows = await q('SELECT id, srs_card_id FROM notes_v2 WHERE id = ?', [String(localNoteId)]);
    const note = noteRows[0];
    if (!note) { res.missingNote++; continue; }     // exported from another device/profile

    let cardId = note.srs_card_id;
    let materializing = false;
    if (!cardId) {
      const reviewed = (Number(st.reps) || 0) > 0 && (Number(st.anki_type) !== 0 || (Number(st.interval_days) || 0) > 0);
      if (!reviewed) { res.skippedNotReviewed++; continue; }
      try {
        const card = await srs.createCardFromNote(String(localNoteId));
        cardId = card && card.id;
      } catch (_) { cardId = null; }               // free note / no template → skip
      if (!cardId) { res.skippedNotReviewed++; continue; }
      materializing = true;
    }

    const cardRows = await q('SELECT * FROM srs_cards WHERE id = ?', [cardId]);
    const card = cardRows[0];
    if (!card) continue;

    if (st.state === 'suspended') res.suspended++;

    // Conflict guard — strictly-newer in-app review keeps its local SM2 numbers.
    const ankiModMs = (Number(st.anki_mod) || 0) * 1000;
    const localMs = card.last_review_at ? Date.parse(card.last_review_at) : 0;
    const keepLocal = !materializing && localMs && ankiModMs && localMs > ankiModMs;

    // Merge meta_json: preserve existing keys, stamp Anki provenance.
    let meta = {};
    try { meta = card.meta_json ? JSON.parse(card.meta_json) : {}; } catch (_) { meta = {}; }
    meta.anki_managed = true;
    meta.anki = {
      cardId: (Array.isArray(s.cardIds) && s.cardIds.length) ? s.cardIds[0] : null,
      noteId: s.ankiNoteId != null ? s.ankiNoteId : null,
      mod: Number(st.anki_mod) || 0, queue: Number(st.anki_queue), type: Number(st.anki_type),
      syncedFrom: 'ankiconnect',
    };

    if (keepLocal) {
      await r('UPDATE srs_cards SET meta_json = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(meta), nowIso(), cardId]);
      res.conflictKeptLocal++;
      continue;
    }

    const lastReview = ankiModMs ? new Date(ankiModMs).toISOString() : nowIso();
    await r(
      `UPDATE srs_cards SET state = ?, interval_days = ?, ease_factor = ?, reps = ?, lapses = ?,
         due_date = ?, meta_json = ?, updated_at = ?, last_review_at = ?
       WHERE id = ?`,
      [String(st.state), Number(st.interval_days) || 0, Number(st.ease_factor) || 2.5,
       Number(st.reps) || 0, Number(st.lapses) || 0, st.due_date || null,
       JSON.stringify(meta), nowIso(), lastReview, cardId]
    );
    if (materializing) res.materialized++; else res.updated++;
  }
  return res;
}

// ── R-3.3 Anki Connect sync — persist imported Anki reviews for research ─────
// The retention metric is computed client-side (in-memory) from getReviewsOfCards
// each sync, but we ALSO durably record each review as an `events` row with
// source='anki' so the research-mode layer (which aggregates events.source) can
// chart % Good+ per cohort week over time. Idempotent BY CONSTRUCTION: the event
// id is deterministic (`anki:<ankiReviewId>` — Anki review ids are unique epoch-ms
// timestamps) + INSERT OR IGNORE, so re-syncing the same history never
// double-counts (no fragile high-water mark needed). Best-effort per row.
// `rows`: [{ ankiReviewId, localNoteId, ankiCardId, ts, ease, ivl, lastIvl, type }].
export async function recordAnkiReviews(rows) {
  let attempted = 0;
  for (const rv of (Array.isArray(rows) ? rows : [])) {
    if (!rv || rv.ankiReviewId == null) continue;
    attempted++;
    const id = 'anki:' + String(rv.ankiReviewId);
    const ts = rv.ts || new Date().toISOString();
    try {
      await r(
        `INSERT OR IGNORE INTO events
           (id, ts, event_type, entity_type, entity_id, session_id,
            text_id, sentence_id, note_id, card_id, source, payload_json)
         VALUES (?, ?, 'srs_review', 'note', ?, NULL, NULL, NULL, ?, NULL, 'anki', ?)`,
        [id, ts, rv.localNoteId || null, rv.localNoteId || null,
         JSON.stringify({ grade: Number(rv.ease) || 0, ivl: rv.ivl, last_ivl: rv.lastIvl,
                          type: Number(rv.type), anki_review_id: rv.ankiReviewId,
                          anki_card_id: rv.ankiCardId != null ? rv.ankiCardId : null })]
      );
    } catch (_) { /* best-effort — one bad row can't abort the import */ }
  }
  return { attempted };
}

// ── R-3.5 Anki word-export markers + per-word lifecycle status ───────────────
// Stable, dependency-free 36-radix hash of a string (djb2). Used to detect when
// a note's body changed AFTER it was exported to Anki (the Anki card is stale).
function _djb2(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Record that word_study notes were exported to an Anki deck (R-3.5). Called by
// the export path on success so the UI can show «📤 В Anki» immediately, before
// any sync. `rows`: [{ note_id, deck_name, model_name, body_json }] — we hash
// body_json HERE so the stale-export check in getWordNoteLifecycle uses the same
// algorithm on the same input. INSERT OR REPLACE → re-export refreshes the
// marker (new hash/timestamp clears the stale flag). Best-effort per row.
export async function recordAnkiWordExports(rows) {
  let recorded = 0;
  const now = new Date().toISOString();
  for (const rv of (Array.isArray(rows) ? rows : [])) {
    if (!rv || !rv.note_id) continue;
    recorded++;
    try {
      await r(
        `INSERT OR REPLACE INTO anki_word_exports
           (note_id, deck_name, model_name, body_hash, exported_at, updated_at)
         VALUES (?,?,?,?,?,?)`,
        [String(rv.note_id), rv.deck_name || null, rv.model_name || null,
         _djb2(rv.body_json || ''), now, now]
      );
    } catch (_) { /* best-effort — never block the export */ }
  }
  return { recorded };
}

// Per-word Anki SRS lifecycle status for a batch of note ids (R-3.5). Composes:
//   • notes_v2 ⋈ srs_cards (state/reps/meta) — was the word reviewed anywhere?
//   • getLearningStateOverlay() (reuse; one query) — known vs learning/needs-work
//   • anki_word_exports — exported to Anki? (the only pre-sync signal)
//   • most-recent events{source:'anki'} grade — last Анки оценка (1–4)
// Status priority: suspended → known/learning (reps>0) → in_anki (exported) →
// created. Read-only; tolerant of missing tables. Returns:
//   { [noteId]: { status, needsWork, grade, gradeAt, exported, exportedAt, deck,
//                 staleExport, reps, lastReviewAt } }
export async function getWordNoteLifecycle(noteIds) {
  const ids = (Array.isArray(noteIds) ? noteIds : []).map(String).filter(Boolean);
  const out = {};
  if (!ids.length) return out;
  const ph = ids.map(() => '?').join(',');

  let noteRows = [];
  try {
    noteRows = await q(
      `SELECT n.id AS note_id, n.body_json AS body_json,
              c.state AS card_state, c.reps AS reps, c.meta_json AS meta_json,
              c.last_review_at AS last_review_at
         FROM notes_v2 n
         LEFT JOIN srs_cards c ON c.id = n.srs_card_id
        WHERE n.id IN (${ph})`, ids);
  } catch (_) { return out; }

  const exp = {};
  try {
    for (const r0 of (await q(`SELECT note_id, deck_name, body_hash, exported_at FROM anki_word_exports WHERE note_id IN (${ph})`, ids) || [])) {
      exp[String(r0.note_id)] = r0;
    }
  } catch (_) {}

  const grade = {};
  try {
    // One bare-column + a single MAX(ts) → SQLite returns the grade from the row
    // with the latest ts (ISO strings sort chronologically). Latest Anki grade.
    for (const r0 of (await q(
      `SELECT note_id, json_extract(payload_json,'$.grade') AS grade, MAX(ts) AS ts
         FROM events
        WHERE source='anki' AND event_type='srs_review' AND note_id IN (${ph})
        GROUP BY note_id`, ids) || [])) {
      grade[String(r0.note_id)] = { grade: Number(r0.grade) || null, ts: r0.ts || null };
    }
  } catch (_) {}

  let overlay = {};
  try { overlay = await getLearningStateOverlay(); } catch (_) {}

  for (const nr of (noteRows || [])) {
    const id = String(nr.note_id);
    const reps = Number(nr.reps) || 0;
    const cs = String(nr.card_state || '').toLowerCase();
    const ex = exp[id];
    const g = grade[id];
    const ov = overlay[id];                      // weak|stale|learning|new|known (carded)
    let staleExport = false;
    if (ex && ex.body_hash) { try { staleExport = _djb2(String(nr.body_json || '')) !== String(ex.body_hash); } catch (_) {} }

    let status;
    if (cs === 'suspended') status = 'suspended';
    else if (reps > 0) status = (ov === 'known' || (!ov && cs === 'review')) ? 'known' : 'learning';
    else if (ex) status = 'in_anki';
    else status = 'created';

    out[id] = {
      status,
      needsWork: ov === 'weak' || ov === 'stale',
      grade: g ? g.grade : null,
      gradeAt: g ? g.ts : null,
      exported: !!ex,
      exportedAt: ex ? ex.exported_at : null,
      deck: ex ? ex.deck_name : null,
      staleExport,
      reps,
      lastReviewAt: nr.last_review_at || null,
    };
  }
  return out;
}

// ── R-1 Anki word-cards — a text's canonical word_study knowledge base ────
// Read-only. Returns every word_study note that OCCURS in this text (positions
// live in note_occurrences; canonical autogen notes have text_id IS NULL), with
// its full body_json plus a representative EXAMPLE = the note's first occurrence
// IN THIS TEXT joined to its sentence (he_niqqud — ru). Real usage from the
// learner's own text is the best pedagogy (R2). The first-occurrence join mirrors
// searchWordNotesWithCanonical (MIN(id) per note, scoped to text_id). NO writes.
export async function getCanonicalWordNotesForText(textId) {
  if (!textId) return [];
  // example_audio_key: the example sentence's existing default audio (same join
  // getSentences uses) — so R-1.5 Anki word-card audio reuses the learner's own
  // sentence audio for free, no re-synthesis (R3/R5).
  const rows = await q(
    `SELECT n.id, n.body_json,
            s.he_niqqud AS example_he, s.he_plain AS example_he_plain, s.ru AS example_ru,
            aa.asset_key AS example_audio_key
       FROM notes_v2 n
       JOIN note_occurrences o
         ON o.note_id = n.id
        AND o.id = (SELECT MIN(o2.id) FROM note_occurrences o2
                     WHERE o2.note_id = n.id AND o2.text_id = ?)
       LEFT JOIN sentences s ON s.id = o.sentence_id
       LEFT JOIN sentence_audio sa ON sa.sentence_id = s.id AND sa.is_default = 1
       LEFT JOIN audio_assets aa ON aa.id = sa.audio_id
      WHERE n.note_type = 'word_study'
      ORDER BY o.id ASC`,
    [String(textId)]
  );
  return (rows || []).map((r0) => {
    const he = String(r0.example_he || r0.example_he_plain || '').trim();
    const ru = String(r0.example_ru || '').trim();
    const example = he ? (ru ? he + ' — ' + ru : he) : '';
    return {
      id: r0.id, body_json: r0.body_json,
      example_he: he, example_ru: ru, example,
      example_audio_key: r0.example_audio_key ? String(r0.example_audio_key) : '',
    };
  });
}

// ── Roots reference table ────────────────────────────────────────────────

// Idempotent seed — inserts roots from the provided array if they're not
// already present. Phase 9.4 will load HEBREW_COMMON_ROOTS_SEED.json and
// call this. For now, exists so app can pre-populate at any time.
export async function seedRoots(entries) {
  for (const e of (Array.isArray(entries) ? entries : [])) {
    if (!e || !e.root_3letter) continue;
    try {
      await r(
        `INSERT OR IGNORE INTO roots (root_3letter, gloss) VALUES (?, ?)`,
        [String(e.root_3letter), e.gloss ?? null]
      );
    } catch (_) { /* skip malformed */ }
  }
}

// Autocomplete for word_study template root field. UNIONs:
//   • seeded roots (no my_note_id needed)
//   • user-noted roots (those with my_note_id set OR appearing as
//     target_kind='root' / target_id in notes_v2)
// Returns up to `limit` matches sorted alphabetically.
export async function searchRootsAutocomplete(prefix, limit = 12) {
  const trimmed = String(prefix || '').trim();
  if (!trimmed) {
    // Empty prefix → return top N user-noted roots first, then most-common
    // seeded roots.
    return q(
      `SELECT root_3letter, gloss, my_note_id IS NOT NULL AS is_user
         FROM roots
        ORDER BY (my_note_id IS NOT NULL) DESC, root_3letter ASC
        LIMIT ?`,
      [limit]
    );
  }
  const like = trimmed + '%';
  return q(
    `SELECT root_3letter, gloss, my_note_id IS NOT NULL AS is_user
       FROM roots
      WHERE root_3letter LIKE ?
      ORDER BY (my_note_id IS NOT NULL) DESC, root_3letter ASC
      LIMIT ?`,
    [like, limit]
  );
}

// ── Cross-text smart-collections (M7) ────────────────────────────────────

// Aggregate counts of notes per smart-collection for a given filter set.
// Returns counts so smart-chips can show numbers/badges:
//   { withNote, audioNoted, srsNoted, byBinyan, byRoot, templated }
export async function getNotesSmartCollectionsSummary() {
  const rows = await q(
    `SELECT
       SUM(CASE WHEN target_kind='sentence' AND note_type='free'                            THEN 1 ELSE 0 END) AS sentenceFree,
       SUM(CASE WHEN audio_anchor_ms IS NOT NULL                                            THEN 1 ELSE 0 END) AS audioNoted,
       SUM(CASE WHEN srs_card_id IS NOT NULL                                                 THEN 1 ELSE 0 END) AS srsNoted,
       SUM(CASE WHEN note_type IN ('word_study','grammar_rule','translation_discrepancy','pronunciation_note') THEN 1 ELSE 0 END) AS templated,
       SUM(CASE WHEN target_kind='root'                                                      THEN 1 ELSE 0 END) AS rootTargeted,
       SUM(CASE WHEN target_kind='binyan'                                                    THEN 1 ELSE 0 END) AS binyanTargeted,
       COUNT(*) AS total
       FROM notes_v2`
  );
  const r0 = rows[0] || {};
  return {
    sentenceFree: Number(r0.sentenceFree || 0),
    audioNoted:   Number(r0.audioNoted   || 0),
    srsNoted:     Number(r0.srsNoted     || 0),
    templated:    Number(r0.templated    || 0),
    rootTargeted: Number(r0.rootTargeted || 0),
    binyanTargeted: Number(r0.binyanTargeted || 0),
    total:        Number(r0.total        || 0),
  };
}

// For each smart-chip, return the matching list of texts for Library
// filter dropdown (ids only, sorted by last_opened_at). Application
// code zips with the list of texts to render filtered Library.
export async function getTextIdsForNotesSmartChip(kind) {
  switch (kind) {
    case 'with-note':
      return (await q(
        `SELECT DISTINCT text_id FROM notes_v2 WHERE text_id IS NOT NULL`
      )).map(r => r.text_id);
    case 'audio-noted':
      return (await q(
        `SELECT DISTINCT text_id FROM notes_v2 WHERE audio_anchor_ms IS NOT NULL AND text_id IS NOT NULL`
      )).map(r => r.text_id);
    case 'srs-noted':
      return (await q(
        `SELECT DISTINCT text_id FROM notes_v2 WHERE srs_card_id IS NOT NULL AND text_id IS NOT NULL`
      )).map(r => r.text_id);
    case 'templated':
      return (await q(
        `SELECT DISTINCT text_id FROM notes_v2
           WHERE note_type IN ('word_study','grammar_rule','translation_discrepancy','pronunciation_note')
             AND text_id IS NOT NULL`
      )).map(r => r.text_id);
    default:
      return [];
  }
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
  // Direction 9 Phase 9.1.B: resolve polymorphic notes_v2 row.
  // Returns the legacy sentence-shaped row for sentence-bound free notes
  // (callers like deep-link handlers expect that shape); for polymorphic
  // notes that don't have a single sentence, returns the raw notes_v2 row
  // with text_title and a synthesized he_plain when the target is a sentence.
  const noteRows = await q('SELECT * FROM notes_v2 WHERE id = ?', [id]);
  const note = noteRows[0];
  if (!note) return null;

  // Default — start with the polymorphic row enriched with the text title.
  let textTitle = '';
  if (note.text_id) {
    const t = await q('SELECT title FROM texts WHERE id = ?', [note.text_id]);
    textTitle = (t[0] && t[0].title) || '';
  }

  // Sentence-bound free notes (legacy default) — also return he_plain +
  // sentence_id + the legacy `note` plaintext alias so existing callers
  // (e.g. nav-stack deep-link handler in index.html line 12754) get the
  // shape they expect.
  if (note.target_kind === 'sentence' && note.target_id) {
    const sRows = await q('SELECT he_plain FROM sentences WHERE id = ?', [note.target_id]);
    const hePlain = (sRows[0] && sRows[0].he_plain) || '';
    let plainText = '';
    try {
      const parsed = JSON.parse(note.body_json || '{}');
      plainText = (typeof parsed.markdown === 'string') ? parsed.markdown : '';
    } catch (_) {}
    return {
      ...note,
      text_title: textTitle,
      sentence_id: note.target_id,
      he_plain: hePlain,
      note: plainText,
    };
  }

  return { ...note, text_title: textTitle, sentence_id: null, he_plain: '' };
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
//   { ok, period: { plays, unique_rows, unique_texts, time_ms, active_ms_real },
//          all:    { plays, unique_rows, unique_texts, time_ms, active_ms_real } }
//
// Phase 11.1: `active_ms_real` is heartbeat-derived (real time spent
// active + visible, idle-pruned). `time_ms` legacy field stays as a
// plays × 4000 estimate for backwards-compat with v3.1 dashboards;
// callers should prefer active_ms_real когда оно > 0.
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
      time_ms: plays * 4000, // legacy estimate; preserved for backwards-compat
    };
  }
  const period = await agg(' AND e.ts >= ?', [sinceIso]);
  const all    = await agg('', []);

  // Phase 11.1: enrich both windows with heartbeat-derived active time.
  try {
    period.active_ms_real = await getActiveMsReal({ sinceIso });
    all.active_ms_real    = await getActiveMsReal({});
  } catch (_) {
    period.active_ms_real = 0;
    all.active_ms_real    = 0;
  }

  return { ok: true, period, all };
}

// Phase 11.1: heartbeat-derived "real" active milliseconds.
//
// Aggregation rule (v1):
//   For each session:
//     • If session_end exists with payload_json.duration_ms → use it
//       (this captures the precise duration; min(duration_ms, MAX_SESSION_MS)).
//     • Else (orphan session — closed via crash/forced-quit/no end):
//       count session_heartbeat × 30s + 30s baseline for session_start.
//
// Implementation: we approximate by counting all heartbeats × 30000 plus
// session_start × 30000 (initial bit before first heartbeat fires) — this
// is a slight underestimate (misses last 0-30s of unfinished sessions)
// but never overestimates, which is the correct bias for time-spent
// metrics. For sessions that did emit session_end, we replace with their
// payload_json.duration_ms via a second pass.
//
// To keep SQL readable in vanilla SQLite (no JSON window functions), we
// run two queries and combine in JS.
export async function getActiveMsReal({ sinceIso = null } = {}) {
  const HEARTBEAT_MS = 30 * 1000;
  const sinceClause = sinceIso ? ' AND ts >= ?' : '';
  const params = sinceIso ? [sinceIso] : [];

  // Count heartbeats + starts → baseline approximation
  const baselineRows = await q(
    `SELECT
       SUM(CASE WHEN event_type = 'session_heartbeat' THEN 1 ELSE 0 END) AS hb,
       SUM(CASE WHEN event_type = 'session_start'     THEN 1 ELSE 0 END) AS st
     FROM events
     WHERE event_type IN ('session_heartbeat', 'session_start')${sinceClause}`,
    params
  );
  const hbCount = Number((baselineRows[0] || {}).hb || 0);
  const stCount = Number((baselineRows[0] || {}).st || 0);
  let approxMs = (hbCount + stCount) * HEARTBEAT_MS;

  // Replace approximation with precise duration_ms for sessions that
  // emitted session_end. Strategy: for each session_end event, the precise
  // duration_ms supersedes (heartbeats × 30s + start × 30s) for that session.
  // So delta = duration_ms - (hb_in_session + 1) × 30000.
  // We compute via JOIN of session_end with heartbeat counts per session_id.
  const endsRows = await q(
    `SELECT
       e_end.session_id                              AS session_id,
       e_end.payload_json                            AS payload_json,
       (SELECT COUNT(*) FROM events e_hb
         WHERE e_hb.event_type = 'session_heartbeat'
           AND e_hb.session_id = e_end.session_id)   AS hb_in_session
     FROM events e_end
     WHERE e_end.event_type = 'session_end'${sinceClause.replace(/ts/g, 'e_end.ts')}`,
    params
  );

  let delta = 0;
  for (const row of endsRows) {
    let dur = 0;
    try {
      const obj = JSON.parse(row.payload_json || '{}');
      dur = Math.max(0, Math.min(60 * 60 * 1000, Number(obj.duration_ms) || 0));
    } catch (_) {}
    const approxForThisSession = (Number(row.hb_in_session) + 1) * HEARTBEAT_MS;
    delta += (dur - approxForThisSession);
  }

  return Math.max(0, approxMs + delta);
}

// Phase 11.1: per-day active minutes (for future heatmap variant + research
// mode time-of-day distribution). Returns array sorted oldest→newest with
// zero-fill for days без активности.
export async function getActiveMinutesByDay({ days = 30 } = {}) {
  const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
  const sinceMs = Date.now() - safeDays * 86400000;
  const sinceIso = new Date(sinceMs).toISOString();
  const HEARTBEAT_MS = 30 * 1000;

  // Group heartbeats + starts by date; we'll layer session_end precision
  // similar to getActiveMsReal but per-day.
  const baseline = await q(
    `SELECT substr(ts, 1, 10) AS day,
            SUM(CASE WHEN event_type = 'session_heartbeat' THEN 1 ELSE 0 END) AS hb,
            SUM(CASE WHEN event_type = 'session_start'     THEN 1 ELSE 0 END) AS st
     FROM events
     WHERE event_type IN ('session_heartbeat', 'session_start')
       AND ts >= ?
     GROUP BY substr(ts, 1, 10)`,
    [sinceIso]
  );
  const dayMap = new Map();
  for (const row of baseline) {
    const ms = (Number(row.hb || 0) + Number(row.st || 0)) * HEARTBEAT_MS;
    dayMap.set(String(row.day), { ms, day: String(row.day) });
  }

  // Apply session_end precision deltas, attributed to the day session_end
  // fired (since heartbeats spread before that day if session crossed midnight,
  // we accept this small inaccuracy — sessions rarely cross midnight in practice).
  const ends = await q(
    `SELECT substr(e_end.ts, 1, 10) AS day,
            e_end.payload_json AS payload_json,
            (SELECT COUNT(*) FROM events e_hb
              WHERE e_hb.event_type = 'session_heartbeat'
                AND e_hb.session_id = e_end.session_id) AS hb_in_session
     FROM events e_end
     WHERE e_end.event_type = 'session_end'
       AND e_end.ts >= ?`,
    [sinceIso]
  );
  for (const row of ends) {
    let dur = 0;
    try {
      const obj = JSON.parse(row.payload_json || '{}');
      dur = Math.max(0, Math.min(60 * 60 * 1000, Number(obj.duration_ms) || 0));
    } catch (_) {}
    const approxForThisSession = (Number(row.hb_in_session) + 1) * HEARTBEAT_MS;
    const deltaMs = dur - approxForThisSession;
    const day = String(row.day);
    const existing = dayMap.get(day) || { ms: 0, day };
    existing.ms = Math.max(0, existing.ms + deltaMs);
    dayMap.set(day, existing);
  }

  // Zero-fill all days in the window for continuous calendar grids.
  const out = [];
  const today = new Date();
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = dayMap.get(key);
    out.push({
      date: key,
      active_minutes: Math.round(((entry && entry.ms) || 0) / 60000),
      active_ms: (entry && entry.ms) || 0,
    });
  }
  return out;
}

// Phase 11.1: session-level metrics (for research-mode aggregation in 11B
// and as future Dashboard surface). Returns counts + totals, no per-session
// list.
export async function getSessionMetrics({ days = 7 } = {}) {
  const sinceMs = Date.now() - Math.max(1, days) * 86400000;
  const sinceIso = new Date(sinceMs).toISOString();

  const rows = await q(
    `SELECT
       SUM(CASE WHEN event_type = 'session_start'     THEN 1 ELSE 0 END) AS sessions,
       SUM(CASE WHEN event_type = 'session_heartbeat' THEN 1 ELSE 0 END) AS heartbeats,
       SUM(CASE WHEN event_type = 'session_end'       THEN 1 ELSE 0 END) AS ends,
       COUNT(DISTINCT substr(ts, 1, 10))                                  AS active_days
     FROM events
     WHERE event_type IN ('session_start', 'session_heartbeat', 'session_end')
       AND ts >= ?`,
    [sinceIso]
  );
  const r = rows[0] || {};
  return {
    sessions_count: Number(r.sessions || 0),
    heartbeats_count: Number(r.heartbeats || 0),
    sessions_completed: Number(r.ends || 0),
    sessions_orphaned: Math.max(0, Number(r.sessions || 0) - Number(r.ends || 0)),
    active_days_count: Number(r.active_days || 0),
    active_ms_real: await getActiveMsReal({ sinceIso }),
  };
}

// ── V3 (CVP): Construct-Validity Pluralism — supplementary engagement metrics
//
// Pre-registered as supplementary exploratory analyses on OSF deviation
// log §9.4 (to be added). These two functions provide alternate operational
// definitions of "engagement" alongside `getActiveMsReal()`, enabling a
// multitrait-multimethod (Campbell & Fiske 1959) report in thesis §6.7:
//
//   - `getActiveMsReal()`        — interactive engagement (existing primary)
//   - `getAudioExposureMs()`     — passive listening exposure (this fn)
//   - `getTextExposureMs()`      — passive reading exposure   (this fn)
//
// `active_minutes_real` definition is INTENTIONALLY UNCHANGED. The V3 design
// adds two new derived metrics emitted by the daily aggregator, NOT a
// retrofit of the primary engagement construct. This preserves the OSF-
// locked H1 primary test definition and avoids mid-study construct drift.
//
// Privacy: both functions read pre-existing event types already collected
// under the current consent envelope. No new event types; derivation is
// cosmetic per RESEARCH_CONSENT_RULE §3 — no CONSENT_VERSION bump.

// Sum of audio playback durations from `play_audio` events (milliseconds).
// Captures passive listening that `getActiveMsReal()` deliberately excludes.
export async function getAudioExposureMs({ sinceIso = null } = {}) {
  const cutoff = sinceIso ?? new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await q(
    `SELECT payload_json FROM events
       WHERE event_type = 'play_audio' AND ts >= ?`,
    [cutoff]
  );
  let totalMs = 0;
  for (const r of rows) {
    try {
      const obj = JSON.parse(r.payload_json || '{}');
      totalMs += Math.max(0, Number(obj.duration_ms) || 0);
    } catch (_) {}
  }
  return totalMs;
}

// Sum of text-open dwell time from `text_open`/`text_close` event pairs
// (milliseconds). Captures passive reading exposure. Orphan opens (without
// a matching close) get a 5-minute imputation matching the idle-gate
// constant. Documented caveat in thesis §6.7.
const TEXT_EXPOSURE_DEFAULT_DWELL_MS = 5 * 60 * 1000;
export async function getTextExposureMs({ sinceIso = null } = {}) {
  const cutoff = sinceIso ?? new Date(Date.now() - 7 * 86400000).toISOString();
  const closeRows = await q(
    `SELECT payload_json FROM events
       WHERE event_type = 'text_close' AND ts >= ?`,
    [cutoff]
  );
  let closedDwellMs = 0;
  for (const r of closeRows) {
    try {
      const obj = JSON.parse(r.payload_json || '{}');
      closedDwellMs += Math.max(0, Number(obj.duration_ms) || 0);
    } catch (_) {}
  }
  const openCountRow = await q(
    `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'text_open' AND ts >= ?`,
    [cutoff]
  );
  const closeCountRow = await q(
    `SELECT COUNT(*) AS n FROM events
       WHERE event_type = 'text_close' AND ts >= ?`,
    [cutoff]
  );
  const openCount  = Number((openCountRow[0]  || {}).n || 0);
  const closeCount = Number((closeCountRow[0] || {}).n || 0);
  const orphanOpens = Math.max(0, openCount - closeCount);
  const imputedDwellMs = orphanOpens * TEXT_EXPOSURE_DEFAULT_DWELL_MS;
  return closedDwellMs + imputedDwellMs;
}

// ── Direction 5: Activity heatmap (Premium Release v3.1.0) ────────────
// GitHub-contributions-style heatmap of daily play activity over the
// last N days. Returns an array of { date: 'YYYY-MM-DD', count } in
// chronological order (oldest first). Days with zero events are still
// included so the calendar grid stays continuous.
export async function getActivityHeatmap({ days = 30 } = {}) {
  const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
  const sinceMs = Date.now() - safeDays * 86400000;
  const sinceIso = new Date(sinceMs).toISOString();

  // Group events by date string (YYYY-MM-DD). SQLite supports
  // substr(ts, 1, 10) since `ts` is stored as ISO8601.
  const rows = await q(
    `SELECT substr(ts, 1, 10) AS day, COUNT(*) AS count
       FROM events
      WHERE LOWER(event_type) IN ('row_tts','tts_play','play')
        AND ts >= ?
      GROUP BY day
      ORDER BY day ASC`,
    [sinceIso]
  );
  const map = new Map();
  for (const r of rows) map.set(String(r.day), Number(r.count) || 0);

  // Materialize a continuous date grid so empty days show in the heatmap.
  const out = [];
  const now = new Date();
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    out.push({ date: key, count: map.get(key) || 0 });
  }
  return out;
}

// ── Direction 5: Smart-sort helpers (Library filter chips) ────────────
// Foundation queries for the new Library filters. Each returns a list
// of text_id strings that match the criterion. Library UI wires these
// into chips ("Recently opened" already exists; these are new).

// "Struggling" — texts where ≥ 30% of SRS reviews resulted in 'again'
// (the worst grade). Threshold stays generous so we surface texts that
// genuinely need more practice without flooding the filter.
//
// PREMIUM ENHANCEMENT (migration 020): result merged with manually-
// tagged texts so users can override the SRS-derived classification.
// Manual-tagged-as-mastered EXCLUDES from struggling even if SRS data
// would have included it — explicit user intent wins.
export async function getStrugglingTexts({ minReviews = 5, errorThreshold = 0.3 } = {}) {
  const auto = await q(
    `SELECT s.text_id AS text_id,
            COUNT(*) AS reviews,
            SUM(CASE WHEN re.rating = 'again' THEN 1 ELSE 0 END) AS errors
       FROM srs_review_events re
       JOIN srs_cards c ON re.card_id = c.id
       JOIN sentences s ON c.source_sentence_id = s.id
      GROUP BY s.text_id
     HAVING reviews >= ?
        AND CAST(errors AS REAL) / reviews >= ?`,
    [minReviews, errorThreshold]
  );
  const manualStruggling = await q(`SELECT id FROM texts WHERE manual_smart_tag = 'struggling'`);
  const manualMastered   = await q(`SELECT id FROM texts WHERE manual_smart_tag = 'mastered'`);
  const out = new Set();
  for (const r of auto) out.add(String(r.text_id));
  for (const r of manualStruggling) out.add(String(r.id));
  // Explicit "mastered" override removes from struggling.
  for (const r of manualMastered) out.delete(String(r.id));
  return Array.from(out);
}

// "Mastered" — texts where every linked SRS card has reached the
// "review" stage (no longer in 'new' or 'learning'). Inversion of
// the Anki "learning" set.
//
// PREMIUM ENHANCEMENT (migration 020): merged with manual override.
export async function getMasteredTexts() {
  const auto = await q(
    `SELECT s.text_id AS text_id,
            COUNT(c.id) AS total,
            SUM(CASE WHEN c.state = 'review' THEN 1 ELSE 0 END) AS mastered
       FROM srs_cards c
       JOIN sentences s ON c.source_sentence_id = s.id
      GROUP BY s.text_id
     HAVING total > 0 AND total = mastered`
  );
  const manualMastered = await q(`SELECT id FROM texts WHERE manual_smart_tag = 'mastered'`);
  const manualStruggling = await q(`SELECT id FROM texts WHERE manual_smart_tag = 'struggling'`);
  const out = new Set();
  for (const r of auto) out.add(String(r.text_id));
  for (const r of manualMastered) out.add(String(r.id));
  // Explicit "struggling" override removes from mastered.
  for (const r of manualStruggling) out.delete(String(r.id));
  return Array.from(out);
}

// PREMIUM Direction 5 enhancement: manual smart-tag setter/getter.
// Tag values: null (auto), 'struggling', 'mastered'. Anything else
// is normalised to null.
export async function setManualSmartTag(textId, tag) {
  const safe = (tag === 'struggling' || tag === 'mastered') ? tag : null;
  const now = new Date().toISOString();
  await r(
    `UPDATE texts SET manual_smart_tag = ?, updated_at = ? WHERE id = ?`,
    [safe, now, String(textId)]
  );
  return { ok: true, tag: safe };
}
export async function getManualSmartTag(textId) {
  const rows = await q(`SELECT manual_smart_tag FROM texts WHERE id = ? LIMIT 1`, [String(textId)]);
  return rows.length ? (rows[0].manual_smart_tag || null) : null;
}

// "New since last visit" — texts created since localStorage marker.
// Caller passes the marker; helper just filters texts.
export async function getTextsCreatedAfter(sinceIso) {
  if (!sinceIso) return [];
  const rows = await q(
    `SELECT id FROM texts
      WHERE created_at >= ?
      ORDER BY created_at DESC`,
    [String(sinceIso)]
  );
  return rows.map((r) => String(r.id));
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

  // Phase 9.3.C — create an SRS card from a templated note. Picks the
  // matching note-card template by code (`note_<note_type>` per migration
  // 026), inserts srs_cards with entity_type='note', sets the back-pointer
  // on notes_v2.srs_card_id, and returns the new card row. If the note
  // already has srs_card_id pointing at an existing card, return that card
  // unchanged (re-conversion is a no-op in v3.2 — multi-card-per-note is a
  // v3.3 epic). For 'free' notes, throws — free notes don't have a natural
  // front/back mapping.
  async createCardFromNote(noteId) {
    if (!noteId) throw new Error('createCardFromNote: noteId required');
    const noteRows = await q('SELECT * FROM notes_v2 WHERE id = ?', [noteId]);
    const note = noteRows[0];
    if (!note) throw new Error('createCardFromNote: note not found');
    const nt = String(note.note_type || 'free');
    if (nt === 'free') {
      throw new Error('createCardFromNote: free notes cannot be converted (no template)');
    }
    // Already converted — return existing card.
    if (note.srs_card_id) {
      const existing = await q('SELECT * FROM srs_cards WHERE id = ?', [note.srs_card_id]);
      if (existing.length) return existing[0];
    }
    const tplCode = 'note_' + nt;
    const tplRows = await q('SELECT id FROM srs_card_templates WHERE code = ? LIMIT 1', [tplCode]);
    if (!tplRows.length) throw new Error('createCardFromNote: template not found for code=' + tplCode);
    const cardId = crypto.randomUUID();
    const now = new Date().toISOString();
    await r(
      `INSERT INTO srs_cards (id, entity_type, entity_id, template_id, source_note_id, created_at, updated_at)
       VALUES (?, 'note', ?, ?, ?, ?, ?)`,
      [cardId, noteId, tplRows[0].id, noteId, now, now]
    );
    // Link back from note.
    await r(
      `UPDATE notes_v2 SET srs_card_id = ?, updated_at = ? WHERE id = ?`,
      [cardId, now, noteId]
    );
    const cardRows = await q('SELECT * FROM srs_cards WHERE id = ?', [cardId]);
    return cardRows[0] ?? null;
  },

  // R2.2 — sweep srs_cards whose template_id no longer matches the linked
  // note's current note_type. Such cards exist in databases where a note
  // was type-converted before the R2.2 convertNoteType behavior drop-on-
  // convert landed; they render as "Prompt: No prompt available" in the
  // trainer because the new body shape doesn't fill the template schema.
  // Idempotent; safe to call on every trainer open.
  async cleanupOrphanedNoteCards() {
    try {
      const orphaned = await q(
        `SELECT c.id AS card_id, n.id AS note_id, c.template_id, n.note_type
           FROM srs_cards c
           JOIN notes_v2 n ON n.id = c.source_note_id
           JOIN srs_card_templates t ON t.id = c.template_id
          WHERE c.entity_type = 'note'
            AND t.code != ('note_' || n.note_type)`,
        []
      );
      let dropped = 0;
      for (const row of orphaned) {
        try { await r('DELETE FROM srs_reviews WHERE card_id = ?', [row.card_id]); } catch (_) {}
        try { await r('DELETE FROM srs_cards WHERE id = ?', [row.card_id]); } catch (_) {}
        try { await r('UPDATE notes_v2 SET srs_card_id = NULL WHERE id = ? AND srs_card_id = ?', [row.note_id, row.card_id]); } catch (_) {}
        dropped++;
      }
      return { dropped };
    } catch (e) {
      console.warn('cleanupOrphanedNoteCards failed:', e && e.message ? e.message : e);
      return { dropped: 0, error: String(e && e.message ? e.message : e) };
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
         -- R-3.2: Anki-managed cards are reviewed in Anki (the authoritative
         -- review layer) → keep them out of the in-app queue (no double-review).
         AND COALESCE(json_extract(c.meta_json,'$.anki_managed'), 0) <> 1
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
    // Include text_id via sentence FK so we can attribute the srs_review
    // event to a specific text without a follow-up query (Phase 11.0).
    const rows = await q(
      `SELECT c.*, s.text_id AS sentence_text_id
       FROM srs_cards c
       LEFT JOIN sentences s ON c.source_sentence_id = s.id
       WHERE c.id = ?`,
      [cardId]
    );
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

    // Phase 11.0: emit srs_review into the unified events table for
    // analytics + research-mode aggregation. Best-effort — never blocks
    // the review flow. UI side increments v3CurrentSrsSessionReviewCount
    // when an SRS Trainer session is active so srs_session_finished can
    // compute cards_reviewed delta accurately.
    try {
      await recordEvent({
        event_type: 'srs_review',
        card_id: cardId,
        text_id: card.sentence_text_id || null,
        sentence_id: card.source_sentence_id || null,
        session_id: (typeof window !== 'undefined' && window.v3CurrentSrsSessionId) || null,
        payload_json: {
          grade: rating,                        // 1=again, 2=hard, 3=good, 4=easy
          interval_before_days: card.interval_days,
          interval_after_days: newInterval,
          state_before: card.state,
          state_after: newState,
          ease_before: card.ease_factor,
          ease_after: newEase,
        },
      });
      // If a trainer session is active, bump the in-memory counter so
      // srs_session_finished reports the correct cards_reviewed delta.
      if (typeof window !== 'undefined' && window.v3CurrentSrsSessionId) {
        if (typeof window.v3CurrentSrsSessionReviewCount === 'number') {
          window.v3CurrentSrsSessionReviewCount = (window.v3CurrentSrsSessionReviewCount || 0) + 1;
        }
      }
    } catch (_) { /* best-effort */ }

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
export async function exportBundle({ includeArchived = false, textIds = null } = {}) {
  let exportList;
  if (Array.isArray(textIds) && textIds.length) {
    // Targeted export — used by B3 undo-delete to snapshot a specific text
    // before destructive ops. Pulls each by id directly so we don't rely
    // on listTexts ordering.
    const collected = [];
    for (const id of textIds) {
      const t = await getTextById(id);
      if (t) collected.push(t);
    }
    exportList = collected;
  } else {
    const active   = await listTexts({ archived: false, limit: 10000 });
    const archived = includeArchived ? await listTexts({ archived: true, limit: 10000 }) : [];
    exportList = [...active, ...archived];
  }
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

  // ── Phase 9.1.D: advanced notes payload (web-only) ─────────────────────
  // notes_v2 + note_versions + note_links + roots — everything that can't
  // live inline on `row.note` (which is the Android-v2-compatible
  // surface). This bundle.json layer is web-only — Android v2 ignores
  // unknown ZIP entries, so adding library/notes_advanced.json is safe
  // and preserves library.json schema_version=1 (no Android update
  // needed). Web → web roundtrip preserves everything; web → Android
  // → web degrades to only sentence-bound free notes (those that ride
  // inline on row.note). Documented in PREMIUM_NOTES_PLAN_v3_2.md § 5.
  const notesAdvanced = await _buildAdvancedNotesPayload(exportList.map((t) => t.id));

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
    // Phase 9.1.D: presence advertised so importers can plan ahead.
    notes_advanced_path: 'library/notes_advanced.json',
    notes_advanced_present: !!(notesAdvanced &&
      ((notesAdvanced.notes || []).length ||
       (notesAdvanced.versions || []).length ||
       (notesAdvanced.links || []).length ||
       (notesAdvanced.roots || []).length ||
       (notesAdvanced.sentence_morph || []).length)),
  };
  const library = { schema_version: 1, texts, audio_assets: audioAssets };
  // Backwards-compat: also expose `texts` at the top of the returned object so
  // callers that iterate `bundle.texts` directly (importBundle round-trip,
  // older tests) keep working without changes. Phase 9.1.D adds
  // `notes_advanced` at the top level too — the ZIP packager will write it
  // to library/notes_advanced.json.
  return { manifest, library, texts, audio_assets: audioAssets, notes_advanced: notesAdvanced };
}

// Phase 9.1.D: gather notes_v2 + note_versions + note_links + roots into a
// portable payload. Scoped to a set of text_ids when given; otherwise
// includes all rows. Output shape is intentionally similar to the existing
// library.json patterns — JSON-serializable, no FK rewiring needed at this
// stage (caller decides whether to remap during import).
//
// `textIds` is the list of OPFS text ids in this export. We use it for the
// final filter on text-bound notes — but we INTENTIONALLY include
// text-independent notes (root / binyan / free) regardless, since they're
// per-user, not per-text.
async function _buildAdvancedNotesPayload(textIds) {
  const TEXT_BOUND_KINDS = new Set(['sentence', 'word', 'text']);
  const _filterByText = (rows, key) => {
    if (!Array.isArray(textIds) || !textIds.length) return rows;
    const allowed = new Set(textIds.map(String));
    return rows.filter((r) => {
      const tk = String(r.target_kind || r[key === 'note' ? 'target_kind' : '_irrelevant'] || '');
      // For notes_v2 rows: include text-bound notes only when their text_id
      // is in the export set; include text-independent notes always.
      if (key === 'note') {
        // Canonical notes are text-INDEPENDENT (target_kind='word' but text_id
        // IS NULL — positioned via note_occurrences); they must be included in a
        // scoped export too, else a targeted backup loses them (R-3.6).
        if (TEXT_BOUND_KINDS.has(tk) && r.text_id) {
          return allowed.has(String(r.text_id));
        }
        return true; // text-independent: root/binyan/note/free OR canonical (text_id NULL)
      }
      return true;
    });
  };

  // 1) notes_v2 — all polymorphic note rows. The library.json inline
  //    `row.note` field carries sentence-bound free notes for Android-v2
  //    compat; on web-to-web roundtrip the inline path runs first
  //    (importBundle main loop calls upsertNote per row.note), then this
  //    advanced-notes path runs and would re-create the same sentence-
  //    bound free note. To avoid duplicates, importer detects existing
  //    sentence-bound free notes by (text_id, sentence_id) and merges
  //    versions/links onto them instead of inserting a new row.
  const allNotes = await q('SELECT * FROM notes_v2 ORDER BY created_at ASC');
  const notes = _filterByText(allNotes, 'note');

  // 2) note_versions — every snapshot we have. FIFO retention already
  //    capped at 50 per note at write time.
  const noteIds = notes.map((n) => n.id);
  const versions = noteIds.length
    ? (await q(
        `SELECT note_id, version, body_json, diff_summary, edited_at
           FROM note_versions
          WHERE note_id IN (${noteIds.map(() => '?').join(',')})
          ORDER BY note_id, version ASC`,
        noteIds
      ))
    : [];

  // 3) note_links — only outgoing edges from the included notes. Broken
  //    inbound links from notes NOT in the export are silently dropped
  //    (they wouldn't resolve on the receiver side either).
  const links = noteIds.length
    ? (await q(
        `SELECT from_note_id, to_kind, to_id, link_alias, created_at
           FROM note_links
          WHERE from_note_id IN (${noteIds.map(() => '?').join(',')})`,
        noteIds
      ))
    : [];

  // 4) roots — include ONLY user-customized rows (those with my_note_id
  //    pointing to a note in the export). Seed roots are not portable
  //    user data and are re-seeded from public/data/HEBREW_COMMON_
  //    ROOTS_SEED.json on import via seedRoots() at runtime.
  const noteIdSet = new Set(noteIds);
  const allRoots = await q('SELECT root_3letter, gloss, my_note_id FROM roots');
  const roots = allRoots.filter((r) => r.my_note_id && noteIdSet.has(r.my_note_id));

  // 5) sentence_morph — stored Dicta per-sentence morphology (offline auto-fill
  //    of POS / root-hint in the word_study editor). Portable reference data;
  //    re-imported under remapped sentence ids. Keyed by old sentence id (row_id).
  const sentenceMorph = [];
  for (const tid of (Array.isArray(textIds) ? textIds : [])) {
    try {
      const m = await getSentenceMorphForText(tid);
      for (const sid in m) {
        if (!Object.prototype.hasOwnProperty.call(m, sid)) continue;
        sentenceMorph.push({ sentence_id: String(sid), text_id: String(tid), model_version: m[sid].model_version || '', provider: 'dicta-morph', tokens: m[sid].tokens || [] });
      }
    } catch (_) {}
  }

  // 6) note_occurrences — WHERE each note appears (text/sentence/word_offset).
  //    Canonical autogen notes (text_id IS NULL) are positioned ONLY via this
  //    table; without exporting it, an imported canonical note loses every
  //    position and vanishes from the reading view. Keyed by old ids; remapped
  //    on import. Additive field — older importers ignore it.
  const occurrences = noteIds.length
    ? (await q(
        `SELECT note_id, text_id, sentence_id, word_offset, surface
           FROM note_occurrences
          WHERE note_id IN (${noteIds.map(() => '?').join(',')})`,
        noteIds
      ))
    : [];

  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    app_id: 'linguist-pro-web',
    format: 'linguistpro-notes-advanced-v1',
    notes,
    versions,
    links,
    roots,
    sentence_morph: sentenceMorph,
    occurrences,
  };
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

  // Phase 9.1.D: build oldId → newId remaps as we go so the advanced
  // notes payload (notes_advanced.json) can rewire its FKs after the
  // main loop completes. Maps populate even when a text is skipped via
  // mode='skip' — in that case we look up the EXISTING text/sentence
  // id by text_key + order_index and register that as the "new" id so
  // advanced notes referencing skipped texts still resolve.
  const oldToNewTextId = new Map();
  const oldToNewSentenceId = new Map();
  // Also track which sentence-bound free notes were inserted via the
  // inline upsertNote path — so advanced-notes import can MERGE rather
  // than duplicate.
  const inlineFreeNoteIdByTargetKey = new Map(); // key: newTextId + ':' + newSentenceId

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
          // Phase 9.2 — preserve the export-side sentence id (`row_id` per
          // Android v2 spec) so the main importBundle loop can register
          // oldSid → newSid in oldToNewSentenceId. Without this, sentence-
          // targeted polymorphic notes from notes_advanced.json fail to
          // remap and get silently dropped during import.
          row_id: r.row_id || r.id || null,
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
      if (existing.length > 0 && mode === 'skip') {
        // Phase 9.1.D: even on skip, remember the existing text id so
        // notes_advanced can attach to it. Note: sentence-level remap is
        // only available for newly-inserted texts (we'd need an order_index
        // scan of the existing sentences here to map skipped texts too,
        // which is more expensive than the v3.2 baseline warrants — for
        // skip mode, sentence-targeted advanced notes for that text are
        // dropped). Documented in 9_1_D_BUNDLE_COMPAT_REPORT.md.
        const _oldTid = String(textData.id || '');
        if (_oldTid) oldToNewTextId.set(_oldTid, String(existing[0].id));
        result.skipped++;
        continue;
      }

      newTextId = crypto.randomUUID();
      const _oldTid = String(textData.id || '');
      if (_oldTid) oldToNewTextId.set(_oldTid, newTextId);
      await createText({ ...textData, text_key, id: newTextId });

      const sentences = textData.sentences ?? textData.rows ?? [];
      for (const s of sentences) {
        const newSentenceId = crypto.randomUUID();
        const _oldSid = String(s.row_id || s.id || '');
        if (_oldSid) oldToNewSentenceId.set(_oldSid, newSentenceId);
        await addSentence(newTextId, { ...s, id: newSentenceId });
        if (s.note && s.note.trim()) {
          const _inlineRow = await upsertNote(newTextId, newSentenceId, s.note);
          if (_inlineRow && _inlineRow.id) {
            inlineFreeNoteIdByTargetKey.set(newTextId + ':' + newSentenceId, String(_inlineRow.id));
          }
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

  // ── Phase 9.1.D: advanced notes payload (web-only) ─────────────────────
  // After the main library.json import loop has populated text + sentence
  // id remaps, apply the notes_advanced.json payload (when present) with
  // FK rewiring. See _applyAdvancedNotesPayload for collision handling.
  const advanced = (bundleObj && bundleObj.notes_advanced) || null;
  if (advanced && typeof advanced === 'object') {
    try {
      const advResult = await _applyAdvancedNotesPayload(advanced, {
        oldToNewTextId,
        oldToNewSentenceId,
        inlineFreeNoteIdByTargetKey,
      });
      result.notes_advanced = advResult;
    } catch (e) {
      result.errors.push({ stage: 'notes_advanced', error: e && e.message ? e.message : String(e) });
    }
  }

  return result;
}

// Phase 9.1.D: Apply notes_advanced.json payload to OPFS with FK rewiring.
// Handles three classes of remap:
//   1. Note ids — every imported note gets a fresh UUID; old → new map is
//      built as we iterate so versions + links can resolve.
//   2. target_id for kind ∈ {sentence, text, note} — looked up via the
//      respective remap. For kind ∈ {root, binyan, free, word}, target_id
//      is opaque user data (root_3letter / binyan name / free=null) and
//      is preserved verbatim.
//   3. text_id (the denormalized FK for partition) — looked up via
//      oldToNewTextId. If the text wasn't imported (mode='skip' on a
//      collision), text-bound notes for it are silently dropped.
//
// Special case: sentence-bound free notes are also created inline via
// upsertNote() in the main loop (riding on `row.note`). To avoid duplicate
// rows, we MERGE the advanced-notes entry into the inline row (same id),
// rather than create a fresh one. Versions + links are then attached to
// that pre-existing inline note id.
//
// Returns { notes: { inserted, merged, dropped }, versions: { inserted, dropped },
//           links: { inserted, dropped }, roots: { inserted } }.
async function _applyAdvancedNotesPayload(payload, ctx) {
  const out = {
    notes:    { inserted: 0, merged: 0, dropped: 0 },
    versions: { inserted: 0, dropped: 0 },
    links:    { inserted: 0, dropped: 0 },
    roots:    { inserted: 0 },
  };
  const oldToNewTextId = (ctx && ctx.oldToNewTextId) || new Map();
  const oldToNewSentenceId = (ctx && ctx.oldToNewSentenceId) || new Map();
  const inlineFreeNoteIdByTargetKey = (ctx && ctx.inlineFreeNoteIdByTargetKey) || new Map();

  const _remap = (map, oldId) => {
    const k = oldId == null ? '' : String(oldId);
    if (!k) return null;
    return map.has(k) ? map.get(k) : null;
  };

  const oldToNewNoteId = new Map();

  // Pass 1 — notes_v2. Build the note id remap.
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  for (const n of notes) {
    if (!n || typeof n !== 'object') { out.notes.dropped++; continue; }
    const oldId = String(n.id || '');
    if (!oldId) { out.notes.dropped++; continue; }
    const tk = String(n.target_kind || 'sentence');
    if (!_TARGET_KINDS.has(tk)) { out.notes.dropped++; continue; }
    const nt = String(n.note_type || 'free');
    if (!_NOTE_TYPES.has(nt)) { out.notes.dropped++; continue; }

    // Remap text_id
    const oldTextId = n.text_id ? String(n.text_id) : null;
    let newTextId = null;
    if (oldTextId) {
      newTextId = _remap(oldToNewTextId, oldTextId);
      if (!newTextId) { out.notes.dropped++; continue; } // text wasn't imported
    }

    // Remap target_id by target_kind
    let newTargetId = null;
    if (tk === 'sentence') {
      newTargetId = _remap(oldToNewSentenceId, n.target_id);
      if (!newTargetId) { out.notes.dropped++; continue; }
    } else if (tk === 'text') {
      newTargetId = _remap(oldToNewTextId, n.target_id);
      if (!newTargetId) { out.notes.dropped++; continue; }
    } else if (tk === 'note') {
      // Forward reference to another note in this same payload — resolved
      // in pass 1b below (after all note ids are known).
      newTargetId = '__pending_note_remap__:' + String(n.target_id || '');
    } else if (tk === 'word') {
      // Word notes carry a COMPOSITE target_id "<sentenceId>:<wordOffset>" — the
      // sentence part is an FK that must be rewired like a sentence note's, else
      // the note imports but listNotesForRow / getRowNoteCounts (which match on the
      // CURRENT sentence id prefix) never find it → orphaned per-row (no panel
      // entry, no 📝 count). Remap the sentence component; keep the offset. A
      // legacy bare-lemma target_id (no ":") is kept verbatim. If the sentence
      // wasn't imported, drop (can't anchor) — same as the sentence-note branch.
      const raw = n.target_id != null ? String(n.target_id) : '';
      const ci = raw.indexOf(':');
      if (ci > 0) {
        const newSid = _remap(oldToNewSentenceId, raw.slice(0, ci));
        if (!newSid) { out.notes.dropped++; continue; }
        newTargetId = newSid + raw.slice(ci);          // "<newSid>:<offset>"
      } else {
        newTargetId = raw || null;
      }
    } else {
      // root / binyan / free: target_id is opaque user data.
      newTargetId = n.target_id != null ? String(n.target_id) : null;
    }

    // Sentence-bound free note duplicate-merge: re-use the inline-path id.
    let newNoteId = null;
    let didMerge = false;
    if (tk === 'sentence' && nt === 'free' && newTextId && newTargetId) {
      const inlineKey = newTextId + ':' + newTargetId;
      if (inlineFreeNoteIdByTargetKey.has(inlineKey)) {
        newNoteId = inlineFreeNoteIdByTargetKey.get(inlineKey);
        didMerge = true;
      }
    }
    // Canonical-note dedup-key merge: a note carrying a gen_dedup_key that
    // already exists (merge into a non-empty library, or a re-import) must NOT
    // be inserted again — the ux_notes_v2_dedup UNIQUE index would reject it and
    // the note would be dropped. Reuse the existing canonical note so versions/
    // occurrences attach to it (mirrors the inline-free merge above).
    if (!newNoteId && n.gen_dedup_key) {
      try {
        const existingCanon = await findNoteByDedupKey(String(n.gen_dedup_key));
        if (existingCanon && existingCanon.id) { newNoteId = String(existingCanon.id); didMerge = true; }
      } catch (_) {}
    }
    if (!newNoteId) {
      newNoteId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : ('n-imp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    }
    oldToNewNoteId.set(oldId, newNoteId);

    if (didMerge) {
      // Body already inserted via inline upsertNote — leave it alone, but
      // update the row's note_type / audio_anchor_ms etc. if the bundle
      // carries richer metadata. body_json stays inline-set value.
      try {
        const fields = [];
        const values = [];
        if (n.title != null) { fields.push('title = ?');                    values.push(String(n.title || '')); }
        if (n.audio_anchor_ms != null) { fields.push('audio_anchor_ms = ?'); values.push(Number(n.audio_anchor_ms) || null); }
        if (n.audio_asset_key != null) { fields.push('audio_asset_key = ?'); values.push(String(n.audio_asset_key)); }
        if (n.srs_card_id != null)     { fields.push('srs_card_id = ?');     values.push(String(n.srs_card_id)); }
        if (fields.length > 0) {
          values.push(newNoteId);
          await r(`UPDATE notes_v2 SET ${fields.join(', ')} WHERE id = ?`, values);
        }
      } catch (_) {}
      out.notes.merged++;
    } else {
      // Fresh insert.
      const bodyJson = (typeof n.body_json === 'string') ? n.body_json : JSON.stringify({});
      // body_json validation guard — schema CHECK will reject invalid; we
      // pre-validate here to drop gracefully rather than throw.
      try { JSON.parse(bodyJson); } catch (_) { out.notes.dropped++; continue; }
      // The 'note' target_kind needs deferred resolution; insert with NULL
      // and patch in pass 1b.
      const insertTargetId = (tk === 'note') ? null : newTargetId;
      try {
        await r(
          `INSERT INTO notes_v2
             (id, target_kind, target_id, text_id, note_type, title, body_json,
              audio_anchor_ms, audio_asset_key, srs_card_id,
              source, confidence, model_version, user_touched, gen_dedup_key,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newNoteId, tk, insertTargetId, newTextId, nt,
            String(n.title || ''), bodyJson,
            Number.isFinite(n.audio_anchor_ms) ? Math.max(0, Math.round(n.audio_anchor_ms)) : null,
            n.audio_asset_key != null ? String(n.audio_asset_key) : null,
            n.srs_card_id     != null ? String(n.srs_card_id)     : null,
            // R-3.6 — preserve note provenance so canonical/auto notes survive the
            // round-trip (was dropped → everything became source='user'). Old
            // bundles lack these fields → same defaults as before (user/1/null).
            (n.source != null ? String(n.source) : 'user'),
            (Number.isFinite(n.confidence) ? n.confidence : null),
            (n.model_version != null ? String(n.model_version) : null),
            (n.user_touched != null ? (n.user_touched ? 1 : 0) : 1),
            (n.gen_dedup_key != null ? String(n.gen_dedup_key) : null),
            n.created_at || new Date().toISOString(),
            n.updated_at || new Date().toISOString(),
          ]
        );
        // For target_kind='note', mark for deferred resolution.
        if (tk === 'note') {
          n.__pending_target_id = String(n.target_id || '');
        }
        out.notes.inserted++;
      } catch (e) {
        out.notes.dropped++;
      }
    }
  }

  // Pass 1b — deferred target_id resolution for target_kind='note'.
  for (const n of notes) {
    if (String(n.target_kind || '') !== 'note') continue;
    if (!n.__pending_target_id) continue;
    const oldId = String(n.id || '');
    const newFromId = oldToNewNoteId.get(oldId);
    const newTargetNoteId = oldToNewNoteId.get(n.__pending_target_id);
    if (!newFromId) continue;
    if (newTargetNoteId) {
      try {
        await r('UPDATE notes_v2 SET target_id = ? WHERE id = ?', [newTargetNoteId, newFromId]);
      } catch (_) {}
    } else {
      // Target wasn't in the payload (or failed to insert) — leave target_id
      // NULL; backlinks panel will tolerate this as a broken-link.
    }
  }

  // Pass 2 — note_versions. note_id remap; (note_id, version) unique so
  // accept whatever versions came in (could be < 50 per note).
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  for (const v of versions) {
    if (!v || typeof v !== 'object') { out.versions.dropped++; continue; }
    const newNoteId = oldToNewNoteId.get(String(v.note_id || ''));
    if (!newNoteId) { out.versions.dropped++; continue; }
    const bodyJson = (typeof v.body_json === 'string') ? v.body_json : JSON.stringify({});
    try { JSON.parse(bodyJson); } catch (_) { out.versions.dropped++; continue; }
    try {
      await r(
        `INSERT OR IGNORE INTO note_versions
           (note_id, version, body_json, diff_summary, edited_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          newNoteId,
          Math.max(1, Number(v.version) || 1),
          bodyJson,
          v.diff_summary ?? null,
          v.edited_at || new Date().toISOString(),
        ]
      );
      out.versions.inserted++;
    } catch (_) {
      out.versions.dropped++;
    }
  }

  // Pass 3 — note_links. from_note_id remap + to_id remap when to_kind
  // points to a note/text/sentence we control.
  const links = Array.isArray(payload.links) ? payload.links : [];
  for (const l of links) {
    if (!l || typeof l !== 'object') { out.links.dropped++; continue; }
    const newFromId = oldToNewNoteId.get(String(l.from_note_id || ''));
    if (!newFromId) { out.links.dropped++; continue; }
    const toKind = String(l.to_kind || '');
    let newToId = null;
    if (toKind === 'note') {
      newToId = oldToNewNoteId.get(String(l.to_id || '')) || null;
    } else if (toKind === 'sentence') {
      newToId = _remap(oldToNewSentenceId, l.to_id);
    } else if (toKind === 'text') {
      newToId = _remap(oldToNewTextId, l.to_id);
    } else {
      // root / binyan / word — opaque user data
      newToId = l.to_id != null ? String(l.to_id) : null;
    }
    if (!newToId) { out.links.dropped++; continue; }
    try {
      await r(
        `INSERT OR IGNORE INTO note_links
           (from_note_id, to_kind, to_id, link_alias, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [newFromId, toKind, newToId, l.link_alias ?? null, l.created_at || new Date().toISOString()]
      );
      out.links.inserted++;
    } catch (_) {
      out.links.dropped++;
    }
  }

  // Pass 4 — roots. Always INSERT OR IGNORE; user-customized rows merge
  // with the seed dictionary. my_note_id remaps via oldToNewNoteId.
  const roots = Array.isArray(payload.roots) ? payload.roots : [];
  for (const root of roots) {
    if (!root || !root.root_3letter) continue;
    const newMyNoteId = root.my_note_id ? oldToNewNoteId.get(String(root.my_note_id)) : null;
    try {
      await r(
        `INSERT OR IGNORE INTO roots (root_3letter, gloss, my_note_id) VALUES (?, ?, ?)`,
        [String(root.root_3letter), root.gloss ?? null, newMyNoteId ?? null]
      );
      out.roots.inserted++;
    } catch (_) { /* skip */ }
  }

  // Pass 5 — sentence_morph (stored Dicta morphology). Remap text_id +
  // sentence_id like word-note FKs, then saveSentenceMorph so the word_study
  // editor auto-fills POS / root-hint OFFLINE (no live Dicta call needed).
  out.sentence_morph = { inserted: 0, dropped: 0 };
  const sentMorph = Array.isArray(payload.sentence_morph) ? payload.sentence_morph : [];
  for (const e of sentMorph) {
    if (!e || typeof e !== 'object') { out.sentence_morph.dropped++; continue; }
    const newTid = _remap(oldToNewTextId, e.text_id);
    const newSid = _remap(oldToNewSentenceId, e.sentence_id);
    if (!newTid || !newSid || !Array.isArray(e.tokens) || !e.tokens.length) { out.sentence_morph.dropped++; continue; }
    try { await saveSentenceMorph(newTid, newSid, e.model_version || '', e.tokens, e.provider || 'dicta-morph'); out.sentence_morph.inserted++; }
    catch (_) { out.sentence_morph.dropped++; }
  }

  // Pass 6 — note_occurrences (R-3.6). Restore WHERE each note appears so
  // canonical autogen notes (text_id NULL) regain their reading-view positions
  // after import (was dropped entirely before). Remap note/text/sentence ids;
  // INSERT OR IGNORE is idempotent via ux_note_occ (note_id,sentence_id,offset).
  out.occurrences = { inserted: 0, dropped: 0 };
  const occ = Array.isArray(payload.occurrences) ? payload.occurrences : [];
  for (const o of occ) {
    if (!o || typeof o !== 'object') { out.occurrences.dropped++; continue; }
    const newNoteId = oldToNewNoteId.get(String(o.note_id || ''));
    if (!newNoteId) { out.occurrences.dropped++; continue; }     // note wasn't imported
    const newSid = o.sentence_id ? _remap(oldToNewSentenceId, o.sentence_id) : null;
    const newTid = o.text_id ? _remap(oldToNewTextId, o.text_id) : null;
    if (!newSid) { out.occurrences.dropped++; continue; }         // can't anchor without a sentence
    try {
      await r(
        `INSERT OR IGNORE INTO note_occurrences (note_id, text_id, sentence_id, word_offset, surface)
         VALUES (?, ?, ?, ?, ?)`,
        [newNoteId, newTid, newSid,
         Number.isFinite(o.word_offset) ? o.word_offset : null,
         o.surface != null ? String(o.surface) : null]
      );
      out.occurrences.inserted++;
    } catch (_) { out.occurrences.dropped++; }
  }

  return out;
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
  // sentence_notes is now a VIEW over notes_v2 (Phase 9.1.A migration 025)
  // — counting via the VIEW gives the legacy "sentence-bound free notes"
  // total. notes_v2 is the underlying table for all polymorphic notes
  // including audio-anchored, templated, and link targets.
  const tables = ['texts', 'sentences', 'sentence_notes', 'notes_v2',
                  'note_versions', 'note_links', 'roots',
                  'audio_assets', 'srs_cards', 'text_progress',
                  'events', 'schema_migrations'];
  const counts = {};
  for (const t of tables) {
    try {
      const rows = await q(`SELECT COUNT(*) AS n FROM ${t}`);
      counts[t]  = rows[0]?.n ?? 0;
    } catch (e) {
      // Table may not exist on older snapshots that haven't run all
      // migrations yet (defense-in-depth for diagnostic mode).
      counts[t] = `error: ${e && e.message ? e.message : e}`;
    }
  }
  return counts;
}
