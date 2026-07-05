"use strict";

// db/agentRepo.js — CLG-P6: хранилище агента (мигр. 026) + cost ledger с pre-call
// check-and-reserve (§11). ЕДИНСТВЕННОЕ место, где agent runtime касается SQLite —
// сами модули agent/* БД не требуют (§13.4-шов: при выделении agent-сервиса в отдельный
// контейнер agent/tools.js меняет этот репо на HTTP-клиент Cloud API, main-сервер
// остаётся единственным писателем).
//
// Инварианты: все запросы user-scoped (user_id из принципала, не из аргументов);
// agent_tasks/explanations несут только идентификаторы классов A/B; ledger-резерв
// атомарен через withTxnLock (урок BLOCKER-а конкурентных ingest, CLG-P3.2).

const crypto = require("crypto");
const { getDb } = require("./sqlite");
const { withTxnLock } = require("./txnLock");

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}

const nowIso = () => new Date().toISOString();
// Суточное окно лимитов — UTC-день СЕРВЕРА: это аудит/cost-семантика (§6 разрешает
// серверное время вне учебной математики).
const dayUtc = () => new Date().toISOString().slice(0, 10);

// ── профиль агента ────────────────────────────────────────────────────────────
async function getProfile(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db, `SELECT * FROM agent_profiles WHERE user_id = ?`, [userId]);
  if (row) return row;
  await dbRun(db, `INSERT OR IGNORE INTO agent_profiles (user_id) VALUES (?)`, [userId]);
  return (await dbGet(db, `SELECT * FROM agent_profiles WHERE user_id = ?`, [userId]));
}

async function updateProfile(userId, { mode, language, goals } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  await getProfile(userId);
  const MODES = new Set(["silent", "coach", "intensive"]);
  const sets = [], params = [];
  if (mode != null && MODES.has(String(mode))) { sets.push("mode = ?"); params.push(String(mode)); }
  if (language != null) { sets.push("language = ?"); params.push(String(language).slice(0, 8)); }
  if (goals !== undefined) { sets.push("goals_json = ?"); params.push(goals == null ? null : JSON.stringify(goals)); }
  if (!sets.length) return getProfile(userId);
  sets.push("updated_at = ?"); params.push(nowIso()); params.push(userId);
  await dbRun(db, `UPDATE agent_profiles SET ${sets.join(", ")} WHERE user_id = ?`, params);
  return getProfile(userId);
}

// ── agent_tasks ───────────────────────────────────────────────────────────────
async function createTask(userId, { kind, payload } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const k = String(kind || "").trim();
  if (!k || k.length > 40) throw new Error("BAD_TASK_KIND");
  const id = "at_" + crypto.randomUUID();
  await dbRun(db,
    `INSERT INTO agent_tasks (id, user_id, kind, status, payload_json) VALUES (?,?,?,'open',?)`,
    [id, userId, k, JSON.stringify(payload || {})]);
  return { id, kind: k, status: "open" };
}

async function listTasks(userId, { status, limit } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = status
    ? await dbAll(db, `SELECT * FROM agent_tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?`, [userId, String(status), lim])
    : await dbAll(db, `SELECT * FROM agent_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`, [userId, lim]);
  return rows || [];
}

async function setTaskStatus(userId, taskId, status) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const ST = new Set(["open", "done", "dismissed"]);
  if (!ST.has(String(status))) throw new Error("BAD_TASK_STATUS");
  const r = await dbRun(db,
    `UPDATE agent_tasks SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?`,
    [String(status), status === "open" ? null : nowIso(), String(taskId), userId]);
  return { updated: r.changes > 0 };
}

// ── agent_explanations (§7 провенанс) ────────────────────────────────────────
async function createExplanation(userId, { sentence_id, item_key, facts_used, llm_model, body } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  if (!Array.isArray(facts_used)) throw new Error("FACTS_USED_REQUIRED");   // факт без провенанса — красный флаг §7
  const id = "ae_" + crypto.randomUUID();
  await dbRun(db,
    `INSERT INTO agent_explanations (id, user_id, sentence_id, item_key, facts_used_json, llm_model, body_json)
     VALUES (?,?,?,?,?,?,?)`,
    [id, userId, sentence_id != null ? String(sentence_id) : null, item_key != null ? String(item_key) : null,
     JSON.stringify(facts_used), llm_model != null ? String(llm_model) : null, JSON.stringify(body || {})]);
  return { id };
}

// ── word lifecycle (read-only срез для инструмента get_word_lifecycle) ───────
async function wordLifecycle(userId, itemKey) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const key = String(itemKey || "").trim();
  if (!key) throw new Error("ITEM_KEY_REQUIRED");
  const rows = await dbAll(db,
    `SELECT kind, reviewed_at, grade, source, channel FROM review_log
      WHERE user_id = ? AND item_key = ? ORDER BY reviewed_at ASC, id ASC`, [userId, key]);
  const proj = await dbGet(db, `SELECT * FROM srs_projections WHERE user_id = ? AND item_key = ?`, [userId, key]);
  let channelStats = null;
  try { channelStats = proj && proj.channel_stats_json ? JSON.parse(proj.channel_stats_json) : null; } catch (_) {}
  return { item_key: key, events: rows || [], projection: proj || null, channel_stats: channelStats };
}

// ── §11 cost ledger: атомарный pre-call check-and-reserve ────────────────────
// Возвращает { ok:true, reserveId } либо { ok:false, reason:'USER_LIMIT'|'GLOBAL_LIMIT' }.
// reserved И final считаются занятыми (failed освобождает бюджет). Атомарность —
// process-wide txnLock: конкурентные вызовы не пере-подписывают последний кредит.
async function reserveLlmCall(userId, { scenario, provider, perUserDaily, globalDaily } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const day = dayUtc();
  const userMax = Math.max(0, Number(perUserDaily) || 0);
  const globalMax = Math.max(0, Number(globalDaily) || 0);
  return withTxnLock(async () => {
    const u = await dbGet(db,
      `SELECT COUNT(*) c FROM llm_usage_ledger WHERE user_id = ? AND day_utc = ? AND kind = 'llm_call' AND status IN ('reserved','final')`,
      [userId, day]);
    if (userMax > 0 && Number(u.c) >= userMax) return { ok: false, reason: "USER_LIMIT", used: Number(u.c), max: userMax };
    const g = await dbGet(db,
      `SELECT COUNT(*) c FROM llm_usage_ledger WHERE day_utc = ? AND kind = 'llm_call' AND status IN ('reserved','final')`,
      [day]);
    if (globalMax > 0 && Number(g.c) >= globalMax) return { ok: false, reason: "GLOBAL_LIMIT", used: Number(g.c), max: globalMax };
    const id = "lu_" + crypto.randomUUID();
    await dbRun(db,
      `INSERT INTO llm_usage_ledger (id, user_id, day_utc, kind, scenario, provider) VALUES (?,?,?,'llm_call',?,?)`,
      [id, userId, day, scenario != null ? String(scenario) : null, provider != null ? String(provider) : null]);
    return { ok: true, reserveId: id };
  });
}

async function finalizeLlmCall(reserveId, { ok, actualUnits } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  await dbRun(db,
    `UPDATE llm_usage_ledger SET status = ?, actual_units = ?, finalized_at = ? WHERE id = ?`,
    [ok ? "final" : "failed", actualUnits != null ? Number(actualUnits) : null, nowIso(), String(reserveId)]);
}

async function usageToday(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const day = dayUtc();
  const u = await dbGet(db,
    `SELECT COUNT(*) c FROM llm_usage_ledger WHERE user_id = ? AND day_utc = ? AND kind = 'llm_call' AND status IN ('reserved','final')`,
    [userId, day]);
  const g = await dbGet(db,
    `SELECT COUNT(*) c FROM llm_usage_ledger WHERE day_utc = ? AND kind = 'llm_call' AND status IN ('reserved','final')`,
    [day]);
  return { day_utc: day, user_llm_calls: Number(u.c) || 0, global_llm_calls: Number(g.c) || 0 };
}

module.exports = {
  getProfile, updateProfile,
  createTask, listTasks, setTaskStatus,
  createExplanation,
  wordLifecycle,
  reserveLlmCall, finalizeLlmCall, usageToday,
};
