"use strict";

// S-пакет S2 — standing-грант «агент читает тела личных текстов» (мигр. 051; DESIGN §2.1/§2.2/§2.5).
// Один живой грант на пользователя by construction (issue отзывает прежние). Read-предикат
// активности НЕ пишет (lazy-expire); защита от «revoke подключения = status-флип» — JOIN на
// agent_connections со статусом ACTIVE/SCOPE_REDUCED на КАЖДЫЙ чек (паттерн agentProposalsRepo).
// R17-канал: выдача гранта в роуте ОБЯЗАНА идти в порядке INSERT → cancelOpenForUser (TOCTOU:
// challenge, созданный до cancel — погашен; после — селектор уже видит грант).

const crypto = require("crypto");
const { getDb } = require("./sqlite");

const LIVE_CONN = `c.status IN ('ACTIVE','SCOPE_REDUCED')`;

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}
const nowIso = () => new Date().toISOString();

// Живой грант ИЛИ типизированная причина отсутствия: {state:'ACTIVE',grant} |
// {state:'EXPIRED'} | {state:'NONE'} — хендлер различает NOT_GRANTED / EXPIRED честно.
async function activeGrant(userId, at = nowIso()) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT g.grant_id, g.connection_id, g.granted_at, g.expires_at
       FROM agent_text_grants g
       JOIN agent_connections c ON c.connection_id = g.connection_id AND c.user_id = g.user_id
      WHERE g.user_id = ? AND g.revoked_at IS NULL AND ${LIVE_CONN}
      ORDER BY g.granted_at DESC`, [String(userId || "")]);
  if (!rows.length) return { state: "NONE" };
  const live = rows.find((g) => !g.expires_at || String(g.expires_at) > String(at));
  if (live) return { state: "ACTIVE", grant: live };
  return { state: "EXPIRED" };
}

// Выдача из панели (session+CSRF): ttlDays null = PERSISTENT. Прежние живые гранты пользователя
// отзываются (один грант by construction — карта в панели однозначна).
async function issueGrant(userId, connectionId, { ttlDays = null } = {}, at = nowIso()) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const conn = await dbGet(db,
    `SELECT connection_id FROM agent_connections c WHERE c.user_id = ? AND c.connection_id = ? AND ${LIVE_CONN}`,
    [String(userId), String(connectionId)]);
  if (!conn) return { ok: false, error: "CONNECTION_NOT_LIVE" };
  const ttl = ttlDays == null ? null : Number(ttlDays);
  if (ttl != null && (!Number.isFinite(ttl) || ttl < 1 || ttl > 365)) return { ok: false, error: "BAD_TTL" };
  await dbRun(db, `UPDATE agent_text_grants SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [at, String(userId)]);
  const grantId = "atg_" + crypto.randomBytes(12).toString("hex");
  const expiresAt = ttl == null ? null : new Date(Date.parse(at) + ttl * 86400000).toISOString();
  await dbRun(db,
    `INSERT INTO agent_text_grants (grant_id, user_id, connection_id, text_key, granted_at, expires_at)
     VALUES (?,?,?,'*',?,?)`,
    [grantId, String(userId), String(connectionId), at, expiresAt]);
  return { ok: true, grant_id: grantId, expires_at: expiresAt };
}

async function revokeGrant(userId, grantId, at = nowIso()) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db,
    `UPDATE agent_text_grants SET revoked_at = ? WHERE user_id = ? AND grant_id = ? AND revoked_at IS NULL`,
    [at, String(userId), String(grantId || "")]);
  return { ok: true, revoked: !!(r && r.changes > 0) };
}

// Каскад отзыва cloud_texts (server.js consent-роут): синк отозван → агентский доступ к телам
// не переживает («воскресающий доступ» при повторном включении синка запрещён — критика FE4).
async function revokeAllForUser(userId, at = nowIso()) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db, `UPDATE agent_text_grants SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [at, String(userId)]);
  return { revoked: (r && r.changes) || 0 };
}

// Каскад revoke/delete подключения (status-флип — FK CASCADE не срабатывает).
async function revokeForConnection(userId, connectionId, at = nowIso()) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const r = await dbRun(db,
    `UPDATE agent_text_grants SET revoked_at = ? WHERE user_id = ? AND connection_id = ? AND revoked_at IS NULL`,
    [at, String(userId), String(connectionId)]);
  return { revoked: (r && r.changes) || 0 };
}

// Панель: полный список (живые и отозванные последних 90 дней — история видима владельцу).
async function listGrants(userId, at = nowIso()) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const cutoff = new Date(Date.parse(at) - 90 * 86400000).toISOString();
  return await dbAll(db,
    `SELECT g.grant_id, g.connection_id, g.granted_at, g.expires_at, g.revoked_at,
            c.display_label, c.status AS connection_status
       FROM agent_text_grants g
       LEFT JOIN agent_connections c ON c.connection_id = g.connection_id AND c.user_id = g.user_id
      WHERE g.user_id = ? AND (g.revoked_at IS NULL OR g.revoked_at > ?)
      ORDER BY g.granted_at DESC LIMIT 20`, [String(userId), cutoff]);
}

module.exports = { activeGrant, issueGrant, revokeGrant, revokeAllForUser, revokeForConnection, listGrants };
