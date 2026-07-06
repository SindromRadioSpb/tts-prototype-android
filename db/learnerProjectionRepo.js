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
const learnerLogRepo = require("./learnerLogRepo");
const FC = require(path.join(__dirname, "..", "public", "js", "fsrs-core.js"));
const GP = require(path.join(__dirname, "..", "public", "js", "grade-policy.js"));

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}

// P7.0c: канон per-item среза (replay-ORDER) живёт в learnerLogRepo.itemRows — одна
// точка истины для фолда проекций И rows грейдера (дрейф порядка невозможен).
async function _itemRows(db, userId, itemKey) {
  return await learnerLogRepo.itemRows(userId, itemKey);
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

// D1 (AI_MENTOR_RECON §14, пре-условие CLG-P6 №3) — channel-aware агрегация «судьбы слова»:
// production (dictate/reverse) vs receptive счётчики по review-строкам лога. PURE (тестируется
// без DB); семьи каналов определяет ТОТ ЖЕ grade-policy.js, что решает грейд у писателей —
// classifier и policy не могут разъехаться. skip/seed/annul/mark в метрики не входят
// (skip = отказ, не память — зеркало клиентского исключения из метрик).
function channelStats(rows) {
  const mk = () => ({ reps: 0, again: 0, hard: 0, good: 0, last_at: null, last_grade: null });
  const out = { production: mk(), receptive: mk() };
  let any = false;
  // P7.0a: аннулированный review — не свидетельство (иначе production_gap фантомит от
  // отменённого провала; тот же Set, что у replay — collectAnnulled из fsrs-core).
  const annulled = FC.collectAnnulled ? FC.collectAnnulled(rows) : {};
  for (const r of rows || []) {
    if (!r || r.kind !== "review") continue;
    if (annulled[String(r.id)]) continue;
    const g = Number(r.grade);
    if (!(g >= 1 && g <= 4)) continue;
    const f = GP.isProductionChannel(r.channel) ? out.production : out.receptive;
    f.reps++; any = true;
    if (g === 1) f.again++; else if (g === 2) f.hard++; else f.good++;
    f.last_at = r.reviewed_at || null; f.last_grade = g;
  }
  return any ? out : null;
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
    const cs = channelStats(rows);
    await dbRun(db,
      `INSERT INTO srs_projections (user_id, item_key, due, interval_days, reps, lapses, stability, difficulty, reviewed_at, scheme, engine, channel_stats_json, computed_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'fsrs', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(user_id, item_key) DO UPDATE SET
         due=excluded.due, interval_days=excluded.interval_days, reps=excluded.reps, lapses=excluded.lapses,
         stability=excluded.stability, difficulty=excluded.difficulty, reviewed_at=excluded.reviewed_at,
         scheme=excluded.scheme, engine=excluded.engine, channel_stats_json=excluded.channel_stats_json,
         computed_at=excluded.computed_at`,
      [userId, key, p.due, p.interval_days, p.reps, p.lapses, p.stability, p.difficulty, p.reviewed_at, FC.ENGINE_VERSION, cs ? JSON.stringify(cs) : null]);
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

// P7.0c — prevState для грейдера (D1 hasMemoryState): одна строка derived-кэша.
async function getProjection(userId, itemKey) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return (await dbGet(db, `SELECT * FROM srs_projections WHERE user_id = ? AND item_key = ?`,
    [userId, String(itemKey || "")])) || null;
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
  // P7.0a — наблюдаемость annul: сколько annul-строк в логе (деплой-верифи ожидает 0 до
  // появления писателя P7.0c; не-0 при mismatch → кандидаты на rebuild со сменой семантики).
  const an = await dbGet(db, `SELECT COUNT(*) c FROM review_log WHERE user_id = ? AND kind = 'annul'`, [userId]);
  return { checked, missing, mismatched, totalKeys: (await distinctItemKeys(userId)).length,
           annul_rows: Number(an && an.c) || 0, engine: FC.ENGINE_VERSION, examples };
}

module.exports = { recomputeForKeys, rebuildAll, listProjections, getProjection, oracle, distinctItemKeys, channelStats, ENGINE: FC.ENGINE_VERSION };
