"use strict";

// CLG-P5.5 — Artifact Sync repo (класс B, AI_MENTOR_RECON §5/§9). The server treats each own-text
// bundle as an OPAQUE consented blob: no parsing of learner content beyond size/JSON-validity
// caps. Consent is enforced SERVER-side on every write/read of class-B data (§5 — «хранится при
// включённом cloud sync»): the LAST consent_records row for key 'cloud_texts' must be granted.
// LWW by the text's updated_at — an older payload never clobbers a newer one (no exceptions).

const { getDb } = require("./sqlite");

const KIND = "text_bundle";
const CONSENT_KEY = "cloud_texts";
// 8MB: замер на реальном профиле владельца дал до ~1MB/текст, но негабаритный текст не должен
// рубить синк (глобальный bodyParser = 10MB — конверт влезает). Один текст > cap теперь честно
// падает в failed[] движка per-text best-effort, не абортя остальные.
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACTS_PER_USER = 2000;

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { (e ? reject(e) : resolve(this)); }));
}

async function hasConsent(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db,
    `SELECT granted FROM consent_records WHERE user_id = ? AND consent_key = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`, [userId, CONSENT_KEY]);
  return !!(row && Number(row.granted) === 1);
}

async function list(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT artifact_key, updated_at, length(payload_json) AS bytes, ingested_at
       FROM learner_artifacts WHERE user_id = ? AND kind = ? ORDER BY artifact_key`, [userId, KIND]);
  return rows || [];
}

async function get(userId, artifactKey) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  return await dbGet(db,
    `SELECT artifact_key, updated_at, payload_json FROM learner_artifacts
      WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, KIND, String(artifactKey || "")]);
}

// LWW upsert: refuses (ok:false, reason) rather than silently clobbering a newer server copy.
async function put(userId, deviceId, { artifact_key, updated_at, payload } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const key = String(artifact_key || "").trim();
  const at = String(updated_at || "").trim();
  if (!key || key.length > 200) return { ok: false, error: "BAD_KEY" };
  if (!at || !Number.isFinite(Date.parse(at))) return { ok: false, error: "BAD_UPDATED_AT" };
  let payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload || null);
  if (!payloadStr || payloadStr === "null") return { ok: false, error: "EMPTY_PAYLOAD" };
  if (Buffer.byteLength(payloadStr, "utf8") > MAX_PAYLOAD_BYTES) return { ok: false, error: "PAYLOAD_TOO_BIG" };
  try { JSON.parse(payloadStr); } catch (_) { return { ok: false, error: "BAD_JSON" }; }
  const existing = await dbGet(db, `SELECT updated_at FROM learner_artifacts WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, KIND, key]);
  if (existing && Date.parse(existing.updated_at) >= Date.parse(at)) {
    return { ok: true, stored: false, reason: "OLDER_OR_EQUAL", server_updated_at: existing.updated_at };
  }
  if (!existing) {
    const n = await dbGet(db, `SELECT COUNT(*) c FROM learner_artifacts WHERE user_id = ? AND kind = ?`, [userId, KIND]);
    if (Number(n && n.c) >= MAX_ARTIFACTS_PER_USER) return { ok: false, error: "TOO_MANY_ARTIFACTS" };
  }
  await dbRun(db,
    `INSERT INTO learner_artifacts (user_id, kind, artifact_key, updated_at, payload_json, device_id)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id, kind, artifact_key) DO UPDATE SET
       updated_at = excluded.updated_at, payload_json = excluded.payload_json,
       device_id = excluded.device_id, ingested_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [userId, KIND, key, at, payloadStr, deviceId || null]);
  return { ok: true, stored: true };
}

module.exports = { hasConsent, list, get, put, CONSENT_KEY, KIND, MAX_PAYLOAD_BYTES };
