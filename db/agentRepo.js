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

// Purge-on-revoke (решение владельца 2026-07-06, §5 v3 «отзыв C-consent → каскад на
// derived»): отзыв agent_read_texts → контентные поля объяснений ЛИЧНЫХ текстов
// зануляются до tombstone (explanation-текст и facts_used цитируют предложение — это
// цитирование пользовательского текста, «пометить и оставить» недостаточно). Остаются
// только технические поля: id/user_id/created_at/llm_model/sentence_id-якорь + причина.
// PAS-A1 (критика wf_35f46603 MAJOR): корпус-объяснения (facts[0].kind='corpus_sentence')
// purge ЩАДИТ — public-domain контент к agent_read_texts не относился; тумбстоунить его
// с purge_reason='consent_revoked' = ложный провенанс (R9).
async function purgeExplanationContent(userId, reason = "consent_revoked") {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db, `SELECT id, body_json, facts_used_json FROM agent_explanations WHERE user_id = ?`, [userId]);
  const purgedAt = nowIso();
  let n = 0;
  for (const r of rows || []) {
    let scope = null;
    try { const b = JSON.parse(r.body_json); if (b && b.purge_reason) continue; scope = b && b.scope_level || null; } catch (_) {}
    try {
      const facts = JSON.parse(r.facts_used_json);
      if (Array.isArray(facts) && facts[0] && facts[0].kind === "corpus_sentence") continue;   // общий артефакт — не трогаем
    } catch (_) {}   // нечитаемый facts_used → консервативно PURGE (fail-closed к приватности)
    const tomb = JSON.stringify({ scope_level: scope, purged_at: purgedAt, purge_reason: String(reason) });
    await dbRun(db, `UPDATE agent_explanations SET facts_used_json = '[]', body_json = ? WHERE id = ? AND user_id = ?`,
      [tomb, r.id, userId]);
    n++;
  }
  return { purged: n };
}

// PAS-A1/A4 same-day dedupe: свежее сегодняшнее объяснение того же якоря/языка/вида.
// kind различает sentence (body.kind отсутствует) и word (kind='word' + матч по слову) —
// иначе word-объяснение того же sentence_id маскировало бы sentence-dedupe и наоборот.
// Возвращает МИНИМУМ для повторного ответа (не факты) либо null.
async function getFreshExplanation(userId, sentenceId, { language, kind, word } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT id, body_json, created_at FROM agent_explanations
      WHERE user_id = ? AND sentence_id = ? ORDER BY rowid DESC LIMIT 10`,
    [userId, String(sentenceId)]);
  const todayUtc = new Date().toISOString().slice(0, 10);
  for (const row of rows || []) {
    let b = null;
    try { b = JSON.parse(row.body_json); } catch (_) { continue; }
    if (!b || b.purge_reason || b.text == null) continue;
    if (language && b.language !== language) continue;
    if ((kind || null) !== (b.kind || null)) continue;
    if (kind === "word" && String(b.word || "") !== String(word || "")) continue;
    if (String(row.created_at || "").slice(0, 10) !== todayUtc) continue;
    return { id: row.id, text: String(b.text), llm_used: b.llm_used === true,
             provider: b.provider || null, model: b.model || null,
             followups: Number(b.followups || 0) };
  }
  return null;
}

// PAS-A2 — follow-up: чтение строки по id (user-scoped) + серверный счётчик ходов в body.
async function getExplanationById(userId, id) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return dbGet(db,
    `SELECT id, sentence_id, item_key, facts_used_json, body_json, created_at
       FROM agent_explanations WHERE user_id = ? AND id = ?`, [userId, String(id)]);
}
async function bumpExplanationFollowups(userId, id) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db, `SELECT body_json FROM agent_explanations WHERE user_id = ? AND id = ?`, [userId, String(id)]);
  if (!row) throw new Error("EXPLANATION_NOT_FOUND");
  let b = {};
  try { b = JSON.parse(row.body_json) || {}; } catch (_) {}
  b.followups = Number(b.followups || 0) + 1;
  await dbRun(db, `UPDATE agent_explanations SET body_json = ? WHERE user_id = ? AND id = ?`,
    [JSON.stringify(b), userId, String(id)]);
  return b.followups;
}

// ── P9 «дом наставника»: история объяснений (list, строго user-scoped) ───────
// Purge-aware: tombstone-строки (body.purge_reason после отзыва agent_read_texts)
// отдаются КАК tombstone — семантику (что показывать) решает runtime, репо не
// фильтрует их молча (R11: «очищено» — честное состояние, не дыра в ленте).
// Курсор — rowid DESC (порядок вставки == порядок created_at; та же механика,
// что ROWID-курсор down-sync P3.3, только вниз по времени).
async function listExplanations(userId, { limit, beforeRid } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  let where = "user_id = ?";
  const params = [userId];
  const rid = Number(beforeRid);
  if (Number.isFinite(rid) && rid > 0) { where += " AND rowid < ?"; params.push(rid); }
  params.push(lim + 1);   // +1 — честный has_more без второго COUNT-запроса
  const rows = await dbAll(db,
    `SELECT rowid AS rid, id, sentence_id, item_key, llm_model, facts_used_json, body_json, created_at
       FROM agent_explanations WHERE ${where} ORDER BY rowid DESC LIMIT ?`, params);
  const hasMore = (rows || []).length > lim;
  return { rows: (rows || []).slice(0, lim), has_more: hasMore };
}

// ── P9 зачаток misconception-блока: сырые вхождения construct_id ─────────────
// Два источника (решение владельца, MENTOR_HOME_P9_DECISION §3.4):
//   1) agent_explanations.facts_used_json — факт kind='constructs' (purge-aware ПО
//      ПОСТРОЕНИЮ: у purged-строк facts_used='[]' → вхождений нет);
//   2) agent_tasks kind='plan' — payload.sections[].construct_ids (класс A, переживает purge).
// Реестр-фильтр (⊆ agent/constructs.js) — в runtime: репо отдаёт сырьё, не семантику.
async function constructOccurrences(userId, { maxRows } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const cap = Math.max(1, Math.min(2000, Number(maxRows) || 500));
  const out = [];
  const expl = await dbAll(db,
    `SELECT facts_used_json, created_at FROM agent_explanations
      WHERE user_id = ? ORDER BY rowid DESC LIMIT ?`, [userId, cap]);
  for (const r of expl || []) {
    try {
      const facts = JSON.parse(r.facts_used_json);
      for (const f of Array.isArray(facts) ? facts : []) {
        if (!f || f.kind !== "constructs") continue;
        for (const it of f.items || []) if (it && it.id) out.push({ id: String(it.id), at: r.created_at, source: "explanation" });
      }
    } catch (_) {}
  }
  const tasks = await dbAll(db,
    `SELECT payload_json, created_at FROM agent_tasks
      WHERE user_id = ? AND kind = 'plan' ORDER BY rowid DESC LIMIT ?`, [userId, cap]);
  for (const r of tasks || []) {
    try {
      const p = JSON.parse(r.payload_json);
      for (const s of (p && p.sections) || []) {
        for (const cid of (s && s.construct_ids) || []) out.push({ id: String(cid), at: r.created_at, source: "plan" });
      }
    } catch (_) {}
  }
  return out;
}

// ── word lifecycle (read-only срез для инструмента get_word_lifecycle) ───────
// P7.0a: события отдаются с флагом annulled («помечать, не прятать» — журнал честен,
// а детекция construct-id/потребители флагнутые строки пропускают). SELECT расширен
// id+meta_json ТОЛЬКО для вычисления флага (критика wf_1bf34023: прежняя выборка без
// id/meta делала флаг невычислимым — тихий пустой Set); наружу meta не отдаётся.
async function wordLifecycle(userId, itemKey) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const key = String(itemKey || "").trim();
  if (!key) throw new Error("ITEM_KEY_REQUIRED");
  const raw = await dbAll(db,
    `SELECT id, kind, reviewed_at, grade, source, channel, meta_json FROM review_log
      WHERE user_id = ? AND item_key = ? ORDER BY reviewed_at ASC, id ASC`, [userId, key]);
  const annulled = new Set();
  for (const r of raw || []) {
    if (!r || r.kind !== "annul") continue;
    try {
      const m = JSON.parse(r.meta_json || "{}");
      if (m && m.annul_of != null && String(m.annul_of)) annulled.add(String(m.annul_of));
    } catch (_) {}
  }
  const rows = (raw || []).map((r) => ({
    kind: r.kind, reviewed_at: r.reviewed_at, grade: r.grade, source: r.source, channel: r.channel,
    ...(annulled.has(String(r.id)) && (r.kind === "review" || r.kind === "skip") ? { annulled: true } : {}),
  }));
  const proj = await dbGet(db, `SELECT * FROM srs_projections WHERE user_id = ? AND item_key = ?`, [userId, key]);
  let channelStats = null;
  try { channelStats = proj && proj.channel_stats_json ? JSON.parse(proj.channel_stats_json) : null; } catch (_) {}
  return { item_key: key, events: rows, projection: proj || null, channel_stats: channelStats };
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
  createExplanation, purgeExplanationContent, getFreshExplanation,
  getExplanationById, bumpExplanationFollowups,
  listExplanations, constructOccurrences,
  wordLifecycle,
  reserveLlmCall, finalizeLlmCall, usageToday,
};
