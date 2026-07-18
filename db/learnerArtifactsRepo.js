"use strict";

// CLG-P5.5 — Artifact Sync repo (класс C — постановление 2026-07-18, BRIDGE_RECON §2.5: тела
// личных текстов = класс C; прежняя маркировка «B» — дрейф ярлыка). The server treats each
// artifact as an OPAQUE consented blob: no parsing of learner content beyond size/JSON-validity
// caps. Consent is enforced SERVER-side on every write/read: the LAST consent_records row for
// key 'cloud_texts' must be granted. LWW by updated_at — an older payload never clobbers a
// newer one; `replace_equal` accepts a STRICTLY-EQUAL timestamp (same content moment, new
// format) — нужен одноразовой миграции fat→slim (SYNC_HARDENING_P0P2_DESIGN §1.5).
//
// Sync-hardening P0: два kind'а. 'text_bundle' — slim per-text (кап 8 МБ, как был);
// 'state_bundle' — ОДИН артефакт text-независимого состояния (кап 24 МБ; сам путь /put
// выведен из-под глобального 10mb-парсера — см. server.js). NEAR_CAP-warn при >75% капа —
// тикающий отказ синка (замер §3.4: 92% капа у всех артефактов) больше не бывает молчаливым.

const { getDb } = require("./sqlite");

const KIND = "text_bundle";
const STATE_KIND = "state_bundle";
const KINDS = new Set([KIND, STATE_KIND]);
const CONSENT_KEY = "cloud_texts";
// 8MB per-text: после P0 slim-бандл ~десятки КБ; кап оставлен прежним (откат slim = fat-бандлы
// должны продолжать влезать). Негабарит падает в failed[] per-text best-effort, не абортя остальные.
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
// 24MB state: ~5 МБ сегодня (10,3K заметок §3.4) — годы запаса; warn с 18 МБ.
const MAX_STATE_PAYLOAD_BYTES = 24 * 1024 * 1024;
const MAX_ARTIFACTS_PER_USER = 2000;
// Skew-guard (§6 F-риски): client-claimed updated_at из будущего дальше часа — отказ typed
// (видимый в failed[]), не тихая LWW-блокада чужих честных правок.
const MAX_FUTURE_SKEW_MS = 3600 * 1000;

const capFor = (kind) => (kind === STATE_KIND ? MAX_STATE_PAYLOAD_BYTES : MAX_PAYLOAD_BYTES);

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

// Метаданные одного артефакта БЕЗ payload (list-ответу нужен state-ts, не 5-МБ блоб).
async function getMeta(userId, artifactKey, kind = KIND) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  if (!KINDS.has(kind)) return null;
  const row = await dbGet(db,
    `SELECT artifact_key, updated_at, length(payload_json) AS bytes, ingested_at
       FROM learner_artifacts WHERE user_id = ? AND kind = ? AND artifact_key = ?`,
    [userId, kind, String(artifactKey || "")]);
  return row || null;
}

async function get(userId, artifactKey, kind = KIND) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  if (!KINDS.has(kind)) return null;
  return await dbGet(db,
    `SELECT artifact_key, updated_at, payload_json FROM learner_artifacts
      WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, kind, String(artifactKey || "")]);
}

// LWW upsert: refuses (ok:false, reason) rather than silently clobbering a newer server copy.
async function put(userId, deviceId, { artifact_key, updated_at, payload, kind = KIND, replace_equal = false } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const k = String(kind || KIND);
  if (!KINDS.has(k)) return { ok: false, error: "BAD_KIND" };
  const key = String(artifact_key || "").trim();
  const at = String(updated_at || "").trim();
  if (!key || key.length > 200) return { ok: false, error: "BAD_KEY" };
  if (!at || !Number.isFinite(Date.parse(at))) return { ok: false, error: "BAD_UPDATED_AT" };
  if (Date.parse(at) > Date.now() + MAX_FUTURE_SKEW_MS) return { ok: false, error: "FUTURE_UPDATED_AT" };
  let payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload || null);
  if (!payloadStr || payloadStr === "null") return { ok: false, error: "EMPTY_PAYLOAD" };
  const cap = capFor(k);
  const bytes = Buffer.byteLength(payloadStr, "utf8");
  if (bytes > cap) return { ok: false, error: "PAYLOAD_TOO_BIG" };
  try { JSON.parse(payloadStr); } catch (_) { return { ok: false, error: "BAD_JSON" }; }
  const existing = await dbGet(db, `SELECT updated_at FROM learner_artifacts WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, k, key]);
  if (existing) {
    const exMs = Date.parse(existing.updated_at), atMs = Date.parse(at);
    // replace_equal принимает ТОЛЬКО строгое равенство ts (миграция формата/merge-back);
    // строго-новее серверного всё так же неперетираемо — LWW без исключений.
    if (exMs > atMs || (exMs === atMs && !replace_equal)) {
      return { ok: true, stored: false, reason: "OLDER_OR_EQUAL", server_updated_at: existing.updated_at };
    }
  }
  if (!existing && k === KIND) {
    const n = await dbGet(db, `SELECT COUNT(*) c FROM learner_artifacts WHERE user_id = ? AND kind = ?`, [userId, k]);
    if (Number(n && n.c) >= MAX_ARTIFACTS_PER_USER) return { ok: false, error: "TOO_MANY_ARTIFACTS" };
  }
  await dbRun(db,
    `INSERT INTO learner_artifacts (user_id, kind, artifact_key, updated_at, payload_json, device_id)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id, kind, artifact_key) DO UPDATE SET
       updated_at = excluded.updated_at, payload_json = excluded.payload_json,
       device_id = excluded.device_id, ingested_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [userId, k, key, at, payloadStr, deviceId || null]);
  const out = { ok: true, stored: true };
  if (bytes > cap * 0.75) { out.warn = "NEAR_CAP"; out.bytes = bytes; out.cap = cap; }
  return out;
}

module.exports = { hasConsent, list, get, getMeta, put, CONSENT_KEY, KIND, STATE_KIND, KINDS, MAX_PAYLOAD_BYTES, MAX_STATE_PAYLOAD_BYTES };
