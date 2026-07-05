"use strict";

// CLG-P5 — Learner Graph API repo (AI_MENTOR_RECON_2026_07_04.md §9 CLG-P5).
// READ-ONLY views over the two server projections:
//   • memory axis  = srs_projections (CLG-P4, replay-derived, oracle-gated);
//   • manual axis  = fold of kind='mark' rows (§4.7 LWW: last mark per item_key by
//     (reviewed_at, id) — the SAME rule the client's lastMarkStatus applies).
// Honesty contract (R9 derived≠asserted): the server exposes ONLY what it actually holds —
// review_log + marks. Note-derived overlay states (word_study notes, srs_cards) live in the
// browser until CLG-P5.5+ artifacts; no endpoint here fabricates them. The agent operates on
// existing item_keys only (§7 — серверный keying-стек до CLG-P6 не создаёт новых ключей).

const { getDb } = require("./sqlite");

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}

// §4.7 LWW fold, server-side: last mark per item_key. One indexed scan; ~1 row per marked word.
async function manualStatusMap(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT item_key, meta_json FROM review_log
      WHERE user_id = ? AND kind = 'mark' ORDER BY reviewed_at ASC, id ASC`, [userId]);
  const out = {};
  for (const r of (rows || [])) {
    try {
      const m = JSON.parse(r.meta_json || "{}");
      if (m.status != null) out[String(r.item_key)] = String(m.status);   // later rows overwrite = LWW
    } catch (_) {}
  }
  for (const k of Object.keys(out)) if (out[k] === "") delete out[k];      // '' = cleared
  return out;
}

// Due-now items: schedule from projections, 'ignore' excluded by the manual axis — the same
// rule the Room's cross-text due queue applies (getDueWithSource: srs_due<=now AND status!='ignore').
async function getDue(userId, { nowMs, limit } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs) || Date.now();
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const manual = await manualStatusMap(userId);
  const rows = await dbAll(db,
    `SELECT item_key, due, interval_days, reps, lapses, stability, difficulty, reviewed_at
       FROM srs_projections WHERE user_id = ? AND due IS NOT NULL AND due <= ?
      ORDER BY lapses DESC, due ASC`, [userId, new Date(now).toISOString()]);
  const out = [];
  for (const r of (rows || [])) {
    const st = manual[r.item_key] || "";
    if (st === "ignore") continue;
    out.push({ item_key: r.item_key, status: st, due: r.due, interval_days: r.interval_days,
      reps: r.reps, lapses: r.lapses, stability: r.stability, difficulty: r.difficulty, reviewed_at: r.reviewed_at });
    if (out.length >= lim) break;
  }
  return out;
}

// The manual axis + schedule summary — the server's HONEST known-word view (§4.7 marks only;
// note-derived states remain a browser overlay until artifacts sync).
async function getKnownWords(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const manual = await manualStatusMap(userId);
  const proj = await dbAll(db,
    `SELECT item_key, due, stability, reps, lapses FROM srs_projections WHERE user_id = ?`, [userId]);
  const scheduled = new Map((proj || []).map((r) => [String(r.item_key), r]));
  const words = {};
  for (const [k, st] of Object.entries(manual)) {
    const p = scheduled.get(k);
    words[k] = { status: st, scheduled: !!p, due: p ? p.due : null, stability: p ? p.stability : null };
  }
  for (const [k, p] of scheduled) {
    if (!words[k]) words[k] = { status: "", scheduled: true, due: p.due, stability: p.stability };
  }
  return words;
}

// Weakest scheduled items (lapses-heavy, then fragile stability). NOT "weak patterns": the
// construct-id substrate (misconception map) is CLG-P6 material (§7) — до него сервер честно
// отдаёт слабые СЛОВА, не диагнозы.
async function getWeakWords(userId, { limit } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const lim = Math.max(1, Math.min(200, Number(limit) || 20));
  const manual = await manualStatusMap(userId);
  const rows = await dbAll(db,
    `SELECT item_key, due, interval_days, reps, lapses, stability, channel_stats_json FROM srs_projections
      WHERE user_id = ? ORDER BY lapses DESC, stability ASC LIMIT ?`, [userId, lim * 2]);
  return (rows || []).filter((r) => (manual[r.item_key] || "") !== "ignore").slice(0, lim)
    .map((r) => {
      // D1 — диагностика «судьбы слова» для агента: рецептивные vs production счётчики
      // (узнаёт при чтении, ошибается в письме → агенту виден дисбаланс каналов).
      let cs = null; try { cs = r.channel_stats_json ? JSON.parse(r.channel_stats_json) : null; } catch (_) {}
      return { item_key: r.item_key, status: manual[r.item_key] || "", lapses: r.lapses,
        stability: r.stability, reps: r.reps, due: r.due, channel_stats: cs };
    });
}

// Compact agent-facing summary (the getAgentContext primitive; grows in CLG-P6).
async function getAgentContext(userId, { nowMs } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs) || Date.now();
  const manual = await manualStatusMap(userId);
  const counts = await dbGet(db,
    `SELECT (SELECT COUNT(*) FROM review_log WHERE user_id = ?) AS log_rows,
            (SELECT COUNT(DISTINCT item_key) FROM review_log WHERE user_id = ?) AS items,
            (SELECT COUNT(*) FROM srs_projections WHERE user_id = ?) AS scheduled,
            (SELECT MAX(reviewed_at) FROM review_log WHERE user_id = ? AND kind IN ('review','skip')) AS last_review_at`,
    [userId, userId, userId, userId]);
  const manualCounts = {};
  for (const st of Object.values(manual)) manualCounts[st] = (manualCounts[st] || 0) + 1;
  // due_now under the SAME rule as getDue (ignore-excluded) — the context must never
  // over-claim vs what the due endpoint would actually serve (R11 honest count).
  const dueKeys = await dbAll(db,
    `SELECT item_key FROM srs_projections WHERE user_id = ? AND due IS NOT NULL AND due <= ?`,
    [userId, new Date(now).toISOString()]);
  const dueNow = (dueKeys || []).filter((r) => (manual[r.item_key] || "") !== "ignore").length;
  const due = await getDue(userId, { nowMs: now, limit: 10 });
  const weak = await getWeakWords(userId, { limit: 5 });
  return {
    counts: {
      log_rows: Number(counts.log_rows) || 0, items: Number(counts.items) || 0,
      scheduled: Number(counts.scheduled) || 0, due_now: dueNow,
    },
    manual: manualCounts,
    last_review_at: counts.last_review_at || null,
    due_sample: due,
    weak_sample: weak,
  };
}

module.exports = { manualStatusMap, getDue, getKnownWords, getWeakWords, getAgentContext };
