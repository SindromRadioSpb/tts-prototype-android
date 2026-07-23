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
const LC = require("../public/js/lemma-canon");
const FC = require("../public/js/fsrs-core");

const COVERAGE_PROJECTION_VERSION = `review-log-keyer-v${LC.KEYER_VERSION}+${FC.ENGINE_VERSION}`;

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

// AA2-C4-PRE — bounded aggregate for external read-only projections. This is
// deliberately separate from getAgentContext(): the latter's historical
// `scheduled` counter includes manual `ignore`, while Agent Access must use the
// same ignore-excluded predicate as getDue for every count. Malformed mark JSON
// is authority corruption here and therefore fails closed instead of becoming
// an invented empty/manual state.
async function getAgentAccessReviewAggregates(userId, { nowMs } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs);
  if (!Number.isFinite(now)) throw new Error("AA_REVIEW_AGGREGATE_TIME_INVALID");
  const generatedAt = new Date(now);
  if (!Number.isFinite(generatedAt.getTime())) throw new Error("AA_REVIEW_AGGREGATE_TIME_INVALID");

  const marks = await dbAll(db,
    `SELECT item_key, meta_json FROM review_log
      WHERE user_id = ? AND kind = 'mark' ORDER BY reviewed_at ASC, id ASC`, [userId]);
  const manual = {};
  for (const row of marks || []) {
    let meta;
    try { meta = JSON.parse(row.meta_json || "{}"); }
    catch (_) { throw new Error("AA_REVIEW_AGGREGATE_MARK_JSON_INVALID"); }
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("AA_REVIEW_AGGREGATE_MARK_JSON_INVALID");
    if (meta.status != null) manual[String(row.item_key)] = String(meta.status);
  }
  for (const key of Object.keys(manual)) if (manual[key] === "") delete manual[key];

  const rows = await dbAll(db,
    `SELECT item_key, due FROM srs_projections WHERE user_id = ? AND due IS NOT NULL`, [userId]);
  let scheduled = 0, due = 0, urgent = 0;
  const urgentBoundary = now - 24 * 60 * 60 * 1000;
  for (const row of rows || []) {
    if ((manual[row.item_key] || "") === "ignore") continue;
    const dueMs = Date.parse(String(row.due || ""));
    if (!Number.isFinite(dueMs)) throw new Error("AA_REVIEW_AGGREGATE_DUE_INVALID");
    scheduled += 1;
    if (scheduled > 100000) throw new Error("AA_REVIEW_AGGREGATE_OVERFLOW");
    if (dueMs <= now) {
      due += 1;
      if (dueMs <= urgentBoundary) urgent += 1;
    }
  }
  if (urgent > due || due > scheduled) throw new Error("AA_REVIEW_AGGREGATE_INVALID");
  return Object.freeze({ scheduled_total: scheduled, due_total: due, urgent_total: urgent });
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

// H2.2 — one deterministic projection snapshot for text coverage. This is a
// read-only fold over the two existing authorities: last mark in review_log and
// the replay-derived srs_projections cache. It neither creates a third state
// store nor exposes raw FSRS fields to the agent.
async function getCoverageProjection(userId, { nowMs } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs);
  if (!Number.isFinite(now)) throw new Error("AA_COVERAGE_PROJECTION_TIME_INVALID");
  const marks = await dbAll(db,
    `SELECT item_key, meta_json FROM review_log
      WHERE user_id = ? AND kind = 'mark' ORDER BY reviewed_at ASC, id ASC`, [userId]);
  const manual = {};
  for (const row of marks || []) {
    let meta;
    try { meta = JSON.parse(row.meta_json || "{}"); } catch (_) { throw new Error("AA_COVERAGE_PROJECTION_INVALID"); }
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("AA_COVERAGE_PROJECTION_INVALID");
    if (meta.status != null) {
      const status = String(meta.status);
      if (status.length > 32) throw new Error("AA_COVERAGE_PROJECTION_INVALID");
      manual[String(row.item_key)] = status;
    }
  }
  for (const key of Object.keys(manual)) if (manual[key] === "") delete manual[key];

  const rows = await dbAll(db,
    `SELECT item_key, due, engine FROM srs_projections WHERE user_id = ? ORDER BY item_key`, [userId]);
  if ((rows || []).length > 100000) throw new Error("AA_COVERAGE_PROJECTION_OVERFLOW");
  const scheduled = [];
  for (const row of rows || []) {
    if (row.engine && String(row.engine) !== String(FC.ENGINE_VERSION)) throw new Error("AA_COVERAGE_PROJECTION_STALE");
    const dueMs = row.due == null ? null : Date.parse(String(row.due));
    if (row.due != null && !Number.isFinite(dueMs)) throw new Error("AA_COVERAGE_PROJECTION_INVALID");
    scheduled.push(Object.freeze({ item_key: String(row.item_key), due_ms: dueMs }));
  }
  return Object.freeze({
    version: COVERAGE_PROJECTION_VERSION,
    generated_at_ms: now,
    manual: Object.freeze({ ...manual }),
    scheduled: Object.freeze(scheduled),
  });
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

// Room-continuity 2026-07-11 (owner-директива, паритет с Залом): пул «в работе» — слова с
// расписанием В БУДУЩЕМ (due > now), earliest-first, ignore-исключён тем же manual-правилом,
// что getDue. Для ahead-режима Mini App (ранний повтор; FSRS считает elapsed нативно).
async function getUpcoming(userId, { nowMs, limit } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs) || Date.now();
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const manual = await manualStatusMap(userId);
  const rows = await dbAll(db,
    `SELECT item_key, due, interval_days, reps, lapses, stability, difficulty, reviewed_at
       FROM srs_projections WHERE user_id = ? AND due IS NOT NULL AND due > ?
      ORDER BY due ASC, item_key ASC`, [userId, new Date(now).toISOString()]);
  const out = [];
  for (const r of (rows || [])) {
    if ((manual[r.item_key] || "") === "ignore") continue;
    out.push({ item_key: r.item_key, due: r.due, lapses: r.lapses, stability: r.stability });
    if (out.length >= lim) break;
  }
  return out;
}

// CLG-P8.2 — honest "done today" for the Mini App home (§12 progress MVP): explicit
// review attempts (kind='review') since sinceIso (caller passes the USER-LOCAL day start
// via db/localtime.startOfLocalDay — one truth with the nudge system), EXCLUDING annulled
// rows (annul-исключение живёт в этом модуле — тот же паттерн, что getRecentStruggles).
// by_type = channel prefix before ':' (read/dictate/cloze/reverse/...). Read-only.
async function getTodayActivity(userId, { sinceIso } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const since = String(sinceIso || new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString());
  const annulled = await annulledIdSet(db, userId);
  const rows = await dbAll(db,
    `SELECT id, channel FROM review_log
      WHERE user_id = ? AND kind = 'review' AND reviewed_at >= ?`, [userId, since]);
  let completed = 0; const byType = {};
  for (const r of rows || []) {
    if (annulled.has(String(r.id))) continue;
    completed++;
    const ch = String(r.channel || "");
    const i = ch.indexOf(":");
    const prefix = (i > 0 ? ch.slice(0, i) : ch) || "other";
    byType[prefix] = (byType[prefix] || 0) + 1;
  }
  return { completed, by_type: byType, since };
}

// AA4 slice 4a — activity delta over review_log for get_progress_delta.
// PURE ACTIVITY read (R17): no grades, no accuracy, no struggle bands, no raw
// FSRS. Adversarial-review decisions baked in:
// - ONE row fetch + JS fold AFTER the annulled-id filter (annul rows legally sit
//   outside the window while gating targets inside it — the getTodayActivity /
//   getRecentStruggles pattern; SQL aggregates cannot honor annul);
// - top items count kind='review' ONLY (per-item skip counts would leak an
//   MNAR avoidance signal; skips stay aggregate-only);
// - new_items_scheduled = DISTINCT item_key among in-window seeds (seed ids are
//   content-hashed and re-seeds are legal — a raw row count would over-claim);
// - active_days folds USER-LOCAL days via db/localtime + the nudge timezone
//   (one truth with the in-app heatmap/streak; a UTC slice would contradict it);
// - deterministic order: top by (times DESC, item_key ASC), channels by
//   (count DESC, name ASC); overflow guard mirrors the aggregates fail-closed.
const CHANNEL_RE = /^[a-z0-9_-]{1,16}$/;
async function getActivityDelta(userId, { sinceIso, nowMs } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const now = Number(nowMs) || Date.now();
  const since = String(sinceIso);
  const nowIso = new Date(now).toISOString();
  let tz = null;
  try { tz = (await require("./notificationPrefsRepo").getPrefs(userId)).timezone; } catch (_) { tz = null; }
  const LT = require("./localtime");
  const rows = await dbAll(db,
    `SELECT id, item_key, kind, reviewed_at, channel FROM review_log
      WHERE user_id = ? AND kind IN ('review','skip','seed') AND reviewed_at >= ? AND reviewed_at <= ?
      ORDER BY reviewed_at ASC, id ASC`, [userId, since, nowIso]);
  if ((rows || []).length > 100000) { const e = new Error("AA_ACTIVITY_LOG_OVERFLOW"); e.code = "AA_ACTIVITY_LOG_OVERFLOW"; throw e; }
  const annulled = await annulledIdSet(db, userId);
  let reviews = 0, skips = 0;
  const items = new Set(), seeded = new Set(), days = new Set(), byChannel = new Map(), perItem = new Map();
  for (const r of rows || []) {
    if (annulled.has(String(r.id))) continue;
    if (r.kind === "seed") { seeded.add(String(r.item_key)); continue; }
    if (r.kind === "skip") { skips++; continue; }
    reviews++;
    items.add(String(r.item_key));
    try { days.add(LT.localDay(tz, Date.parse(r.reviewed_at))); } catch (_) {}
    const ch = String(r.channel || "");
    const i = ch.indexOf(":");
    let prefix = (i > 0 ? ch.slice(0, i) : ch) || "other";
    if (!CHANNEL_RE.test(prefix)) prefix = "other";
    byChannel.set(prefix, (byChannel.get(prefix) || 0) + 1);
    perItem.set(String(r.item_key), (perItem.get(String(r.item_key)) || 0) + 1);
  }
  const channels = [...byChannel.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  const channelsOut = channels.slice(0, 7).map(([channel, count]) => ({ channel, count }));
  const rest = channels.slice(7).reduce((n, [, c]) => n + c, 0);
  if (rest > 0) {
    // Lump the tail into 'other' WITHOUT duplicating an existing 'other' entry
    // (the output schema requires unique channel names).
    const existing = channelsOut.find((c) => c.channel === "other");
    if (existing) existing.count += rest; else channelsOut.push({ channel: "other", count: rest });
  }
  const top = [...perItem.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([item_key, times]) => ({ item_key, times }));
  return {
    reviews_total: reviews, skips_total: skips,
    distinct_items: items.size, new_items_scheduled: seeded.size,
    active_days: days.size, by_channel: channelsOut, top,
  };
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

module.exports = { manualStatusMap, getAgentAccessReviewAggregates, getDue, getUpcoming, getKnownWords,
  getCoverageProjection, getWeakWords, getRecentStruggles, recentStruggleKeySet, getTodayActivity,
  getActivityDelta, getAgentContext, COVERAGE_PROJECTION_VERSION };
