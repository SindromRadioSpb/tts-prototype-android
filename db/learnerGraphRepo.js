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

// P7.0a — цели ВСЕХ annul-строк пользователя (TELEGRAM_P7_DECISION; критика wf_1bf34023
// M-6/M-59): per-user и БЕЗ временнОго окна — annul-строка легально несёт reviewed_at
// раньше цели (кросс-девайс clock skew) и потому может стоять ВНЕ любого since-окна,
// продолжая гасить цель ВНУТРИ него. Для SQL-агрегатов этого репо.
async function annulledIdSet(db, userId) {
  const rows = await dbAll(db,
    `SELECT meta_json FROM review_log WHERE user_id = ? AND kind = 'annul'`, [userId]);
  const out = new Set();
  for (const r of rows || []) {
    try {
      const m = JSON.parse(r.meta_json || "{}");
      if (m && m.annul_of != null && String(m.annul_of)) out.add(String(m.annul_of));
    } catch (_) {}
  }
  return out;
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
async function getDue(userId, { nowMs, limit, withChannelStats } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs) || Date.now();
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const manual = await manualStatusMap(userId);
  // P7.2d: item_key ASC — ТОТАЛЬНЫЙ порядок (детерминизм селектора; иначе (lapses,due)-ties SQLite-
  // произвольны → нестабильный выбор модальности между рансами). channel_stats_json прикрепляется к
  // строке ТОЛЬКО при opts.withChannelStats (селектор) → НЕ течёт в HTTP /api/learner/due и LLM-tool
  // (gate-consumers-sweep: getDue зовут ещё /api/learner/due, tools.js, pushRepo, content.js — форма их
  // ответа/контекста не меняется без флага).
  const rows = await dbAll(db,
    `SELECT item_key, due, interval_days, reps, lapses, stability, difficulty, reviewed_at, channel_stats_json
       FROM srs_projections WHERE user_id = ? AND due IS NOT NULL AND due <= ?
      ORDER BY lapses DESC, due ASC, item_key ASC`, [userId, new Date(now).toISOString()]);
  const out = [];
  for (const r of (rows || [])) {
    const st = manual[r.item_key] || "";
    if (st === "ignore") continue;
    const item = { item_key: r.item_key, status: st, due: r.due, interval_days: r.interval_days,
      reps: r.reps, lapses: r.lapses, stability: r.stability, difficulty: r.difficulty, reviewed_at: r.reviewed_at };
    if (withChannelStats) {
      let cs = null; try { cs = r.channel_stats_json ? JSON.parse(r.channel_stats_json) : null; } catch (_) {}
      item.channel_stats = cs;
    }
    out.push(item);
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

// P6.4-followup (owner live-verify 2026-07-06, кейс טוב): «сегодняшние провалы» — слова
// с ≥minFails провалами (grade≤2, kind='review') за окно sinceMs по УЧЕБНОМУ времени
// reviewed_at. Это сигнал «горит сейчас», который lapses-first /due-срез на большом
// профиле хоронит (свежие 3-4 провала < годами накопленных lapses старых слов), а
// production_gap честно не берёт (тот требует рецептивной силы — слово, провальное
// ВЕЗДЕ, не «канальный разрыв»). prod_fails отделены — план рекомендует канал честно.
async function getRecentStruggles(userId, { sinceMs, minFails, limit } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const lim = Math.max(1, Math.min(20, Number(limit) || 4));
  const min = Math.max(1, Number(minFails) || 2);
  const since = new Date(Number(sinceMs) || (Date.now() - 24 * 3600 * 1000)).toISOString();
  const manual = await manualStatusMap(userId);
  // P7.0a: агрегация в JS — исключение аннулированных провалов требует id строк
  // (annul_of живёт в meta_json, SQL GROUP BY его не видит). Аннулированный провал
  // не «горит сейчас» — иначе /plan повторно тычет пользователя отменённым событием.
  const annulled = await annulledIdSet(db, userId);
  const failRows = await dbAll(db,
    `SELECT id, item_key, channel, reviewed_at FROM review_log
      WHERE user_id = ? AND kind = 'review' AND grade IS NOT NULL AND grade <= 2 AND reviewed_at >= ?`,
    [userId, since]);
  const agg = new Map();
  for (const r of failRows || []) {
    if (annulled.has(String(r.id))) continue;
    let a = agg.get(r.item_key);
    if (!a) { a = { fails: 0, prod_fails: 0, last_fail_at: null }; agg.set(r.item_key, a); }
    a.fails++;
    const ch = String(r.channel || "");
    if (ch.indexOf("dictate") === 0 || ch.indexOf("reverse") === 0) a.prod_fails++;
    if (!a.last_fail_at || String(r.reviewed_at) > String(a.last_fail_at)) a.last_fail_at = r.reviewed_at;
  }
  return [...agg.entries()]
    .filter(([k, a]) => a.fails >= min && (manual[k] || "") !== "ignore")
    .sort((x, y) => y[1].fails - x[1].fails || String(y[1].last_fail_at).localeCompare(String(x[1].last_fail_at)))
    .slice(0, lim)
    .map(([k, a]) => ({ item_key: k, fails: a.fails, prod_fails: a.prod_fails, last_fail_at: a.last_fail_at }));
}

// P7.2d — ПОЛНЫЙ Set item_key'ов с ≥minFails провалами (grade≤2, kind='review', минус
// аннулированные) за окно sinceMs по учебному времени reviewed_at. В отличие от getRecentStruggles
// (ranked top-N, cap 20 — для ПОКАЗА в /plan), это МНОЖЕСТВО-ПРИНАДЛЕЖНОСТЬ для селектора: критика
// wf_58b7c1d6 (R2/R11 MAJOR) — усечённый top-N молча теряет горящие due-слова за пределами cap →
// ложная flagship-промоция самой сложной модальностью. БЕЗ cap; ignore-исключён как везде.
async function recentStruggleKeySet(userId, { sinceMs, minFails } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const min = Math.max(1, Number(minFails) || 2);
  const since = new Date(Number(sinceMs) || (Date.now() - 24 * 3600 * 1000)).toISOString();
  const manual = await manualStatusMap(userId);
  const annulled = await annulledIdSet(db, userId);   // annul_of в meta_json → агрегируем в JS (как getRecentStruggles)
  const failRows = await dbAll(db,
    `SELECT id, item_key FROM review_log
      WHERE user_id = ? AND kind = 'review' AND grade IS NOT NULL AND grade <= 2 AND reviewed_at >= ?`,
    [userId, since]);
  const counts = new Map();
  for (const r of failRows || []) {
    if (annulled.has(String(r.id))) continue;
    counts.set(r.item_key, (counts.get(r.item_key) || 0) + 1);
  }
  const set = new Set();
  for (const [k, n] of counts) if (n >= min && (manual[k] || "") !== "ignore") set.add(k);
  return set;
}

// Compact agent-facing summary (the getAgentContext primitive; grows in CLG-P6).
async function getAgentContext(userId, { nowMs } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs) || Date.now();
  const manual = await manualStatusMap(userId);
  const counts = await dbGet(db,
    `SELECT (SELECT COUNT(*) FROM review_log WHERE user_id = ?) AS log_rows,
            (SELECT COUNT(DISTINCT item_key) FROM review_log WHERE user_id = ?) AS items,
            (SELECT COUNT(*) FROM srs_projections WHERE user_id = ?) AS scheduled`,
    [userId, userId, userId]);
  // P7.0a: last_review_at не считает аннулированные события — «занимался сегодня»
  // по отменённому мис-тапу было бы ложью контекста агента (критика wf_1bf34023).
  // log_rows/items честно включают ВСЁ (это аудит-счётчики лога, не учебные факты).
  {
    const annulled = await annulledIdSet(db, userId);
    const lastRows = await dbAll(db,
      `SELECT id, reviewed_at FROM review_log WHERE user_id = ? AND kind IN ('review','skip')
        ORDER BY reviewed_at DESC, id DESC LIMIT ?`, [userId, Math.max(50, annulled.size + 1)]);
    counts.last_review_at = null;
    for (const r of lastRows || []) {
      if (!annulled.has(String(r.id))) { counts.last_review_at = r.reviewed_at; break; }
    }
  }
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

module.exports = { manualStatusMap, getDue, getKnownWords, getWeakWords, getRecentStruggles, recentStruggleKeySet, getAgentContext };
