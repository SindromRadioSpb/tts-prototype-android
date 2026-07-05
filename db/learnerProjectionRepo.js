"use strict";

// CLG-P4 — Server-side FSRS replay → srs_projections (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P4).
// Parity by construction: this repo requires THE SAME public/js/fsrs-core.js the browser runs
// (UMD, deterministic). Independence is supplied by the GATE, not by this module: the
// smoke:server-replay oracle re-folds the same logs through the pinned ts-fsrs@5.4.1 reference
// (feedback_independent_oracle_gate — a validator must recompute from the raw input with an
// implementation the feature does NOT share).
//
// Projections are a DERIVED cache: state = replay(user's review_log rows for the item, ordered
// by reviewed_at, id — canonical UTC-Z makes lexicographic == chronological). No projection row
// is ever asserted directly; delete + rebuild is always safe.

const path = require("path");
const { getDb } = require("./sqlite");
const FC = require(path.join(__dirname, "..", "public", "js", "fsrs-core.js"));

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}

async function _itemRows(db, userId, itemKey) {
  return await dbAll(db,
    `SELECT id, item_key, kind, reviewed_at, grade, source, channel, meta_json
       FROM review_log WHERE user_id = ? AND item_key = ? ORDER BY reviewed_at ASC, id ASC`,
    [userId, itemKey]);
}

function _projectionOf(state) {
  if (!state || !(state.stability > 0)) return null;
  const dueMs = FC.dueAt(state);
  return {
    due: dueMs != null ? new Date(dueMs).toISOString() : null,
    interval_days: FC.intervalFor(state),
    reps: state.reps || 0, lapses: state.lapses || 0,
    stability: state.stability, difficulty: state.difficulty,
    reviewed_at: state.lastReviewedAt != null ? new Date(state.lastReviewedAt).toISOString() : null,
  };
}

// Recompute the derived projection for each item_key (replay of the merged log). A key whose
// fold yields no memory (e.g. mark-only rows) gets its projection row REMOVED — never a stale one.
async function recomputeForKeys(userId, itemKeys) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const keys = Array.from(new Set((Array.isArray(itemKeys) ? itemKeys : []).map((k) => String(k || "").trim()).filter(Boolean)));
  let recomputed = 0, removed = 0;
  for (const key of keys) {
    const rows = await _itemRows(db, userId, key);
    const state = FC.replay(rows);
    const p = _projectionOf(state);
    if (!p) {
      const r = await dbRun(db, `DELETE FROM srs_projections WHERE user_id = ? AND item_key = ?`, [userId, key]);
      if (r.changes > 0) removed++;
      continue;
    }
    await dbRun(db,
      `INSERT INTO srs_projections (user_id, item_key, due, interval_days, reps, lapses, stability, difficulty, reviewed_at, scheme, engine, computed_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'fsrs', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(user_id, item_key) DO UPDATE SET
         due=excluded.due, interval_days=excluded.interval_days, reps=excluded.reps, lapses=excluded.lapses,
         stability=excluded.stability, difficulty=excluded.difficulty, reviewed_at=excluded.reviewed_at,
         scheme=excluded.scheme, engine=excluded.engine, computed_at=excluded.computed_at`,
      [userId, key, p.due, p.interval_days, p.reps, p.lapses, p.stability, p.difficulty, p.reviewed_at, FC.ENGINE_VERSION]);
    recomputed++;
  }
  return { recomputed, removed };
}

async function distinctItemKeys(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db, `SELECT DISTINCT item_key FROM review_log WHERE user_id = ?`, [userId]);
  return (rows || []).map((r) => String(r.item_key));
}

async function rebuildAll(userId) {
  const keys = await distinctItemKeys(userId);
  const out = await recomputeForKeys(userId, keys);
  return { keys: keys.length, ...out };
}

async function listProjections(userId, { dueBeforeMs, limit } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const lim = Math.max(1, Math.min(2000, Number(limit) || 500));
  const rows = dueBeforeMs
    ? await dbAll(db, `SELECT * FROM srs_projections WHERE user_id = ? AND due IS NOT NULL AND due <= ? ORDER BY due ASC LIMIT ?`,
        [userId, new Date(Number(dueBeforeMs)).toISOString(), lim])
    : await dbAll(db, `SELECT * FROM srs_projections WHERE user_id = ? ORDER BY due ASC LIMIT ?`, [userId, lim]);
  return rows || [];
}

// The LIVE oracle: fresh replay(log) vs the incrementally-maintained stored projection, per key.
// This has teeth precisely because the stored rows were written by the INGEST-TRIGGERED path —
// equality proves the incremental maintenance never diverges from a from-scratch fold (§1.3-2).
async function oracle(userId, { sample } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  let keys = await distinctItemKeys(userId);
  const n = Math.max(1, Math.min(5000, Number(sample) || 1000));
  if (keys.length > n) keys = keys.slice(0, n);   // deterministic prefix — no Math.random in gates
  let checked = 0, missing = 0, mismatched = 0;
  const examples = [];
  for (const key of keys) {
    const rows = await _itemRows(db, userId, key);
    const state = FC.replay(rows);
    const p = _projectionOf(state);
    const stored = await dbGet(db, `SELECT * FROM srs_projections WHERE user_id = ? AND item_key = ?`, [userId, key]);
    checked++;
    if (!p) {
      if (stored) { mismatched++; if (examples.length < 10) examples.push({ key, why: "stored_but_no_memory" }); }
      continue;
    }
    if (!stored) { missing++; if (examples.length < 10) examples.push({ key, why: "missing" }); continue; }
    const close = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-7;
    const ok = close(stored.stability, p.stability) && close(stored.difficulty, p.difficulty) &&
      Number(stored.reps) === p.reps && Number(stored.lapses) === p.lapses && String(stored.due || "") === String(p.due || "");
    if (!ok) { mismatched++; if (examples.length < 10) examples.push({ key, why: "diverged", stored: { s: stored.stability, d: stored.difficulty, reps: stored.reps }, fresh: { s: p.stability, d: p.difficulty, reps: p.reps } }); }
  }
  return { checked, missing, mismatched, totalKeys: (await distinctItemKeys(userId)).length, examples };
}

module.exports = { recomputeForKeys, rebuildAll, listProjections, oracle, distinctItemKeys, ENGINE: FC.ENGINE_VERSION };
