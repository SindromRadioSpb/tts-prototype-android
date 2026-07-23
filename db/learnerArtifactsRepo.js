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

// P1 (§6.7) — версия consent-карты cloud_texts: ЕДИНСТВЕННЫЙ источник = клиентский UMD-модуль
// (config-string-match-by-construction; вторая копия строки запрещена). Bump = новая карта =
// re-consent: sync-поверхность (list/get/put) требует ТОЧНОГО равенства версии; delete/restore
// и иерархические пре-чеки агент-путей остаются any-granted (right-to-delete и уже-согласованные
// ОТДЕЛЬНЫМИ ключами agent_read_texts* чтения не запираются за новой картой синка).
const REQUIRED_CONSENT_VERSION = require("../public/js/cloud-sync.js").CLOUD_TEXTS_CONSENT_VERSION;

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

// Any-version грант (иерархические пре-чеки агент-путей + delete/restore). Семантика НЕ менялась.
async function hasConsent(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db,
    `SELECT granted FROM consent_records WHERE user_id = ? AND consent_key = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`, [userId, CONSENT_KEY]);
  return !!(row && Number(row.granted) === 1);
}

// P1 — sync-поверхность (list/get/put): granted И точная версия карты. Возвращает
// {ok, reconsent} — 403-ответ различает «нет согласия» и «карта обновлена, подтвердите заново».
async function hasConsentVersioned(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db,
    `SELECT granted, consent_version FROM consent_records WHERE user_id = ? AND consent_key = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`, [userId, CONSENT_KEY]);
  const granted = !!(row && Number(row.granted) === 1);
  if (!granted) return { ok: false, reconsent: false };
  const ok = String(row.consent_version || "") === REQUIRED_CONSENT_VERSION;
  return { ok, reconsent: !ok };
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
    `SELECT artifact_key, updated_at, ingested_at, payload_json FROM learner_artifacts
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
  // Разбор нужен и для валидации, и для sidecar-меты (S1 §1.1) — один парс на оба.
  let parsedPayload = null;
  try { parsedPayload = JSON.parse(payloadStr); } catch (_) { return { ok: false, error: "BAD_JSON" }; }
  const existing = await dbGet(db, `SELECT updated_at FROM learner_artifacts WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, k, key]);
  if (existing) {
    const exMs = Date.parse(existing.updated_at), atMs = Date.parse(at);
    // replace_equal принимает ТОЛЬКО строгое равенство ts (миграция формата/merge-back);
    // строго-новее серверного всё так же неперетираемо — LWW без исключений.
    if (exMs > atMs || (exMs === atMs && !replace_equal)) {
      return { ok: true, stored: false, reason: "OLDER_OR_EQUAL", server_updated_at: existing.updated_at };
    }
  }
  // P2 §6.4 — tombstone-LWW: PUT новее deleted_at воскрешает (снимает tombstone — «правка
  // воскрешает», в т.ч. пере-импорт с undelete-интентом); PUT старше — DELETED_NEWER, клиент
  // применяет удаление локально (стейл-девайс не ресурректит удалённое своим UP'ом).
  const tomb = await dbGet(db, `SELECT deleted_at FROM artifact_tombstones WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, k, key]);
  if (tomb) {
    if (Date.parse(at) > Date.parse(tomb.deleted_at)) {
      await dbRun(db, `DELETE FROM artifact_tombstones WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, k, key]);
    } else {
      return { ok: true, stored: false, reason: "DELETED_NEWER", deleted_at: tomb.deleted_at };
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
  // S1 §1.1 — sidecar-мета: ТОЛЬКО после успешного store (иначе мета отвергнутого payload'а),
  // ТОЛЬКО text_bundle, best-effort (провал экстракции НЕ роняет первопартийный sync-путь;
  // стейл лечит reconcileArtifactMeta в ops-sweep по built_at<ingested_at). Порядок artifact-
  // first обязателен (FK меты смотрит на артефакт). Решение владельца §0.1-5: экстракция
  // происходит ДО каких-либо агентских согласий; наружу — только под AA-scope.
  if (k === KIND) {
    try { await _upsertMeta(db, userId, k, key, parsedPayload); } catch (_) {}
  }
  const out = { ok: true, stored: true };
  if (bytes > cap * 0.75) { out.warn = "NEAR_CAP"; out.bytes = bytes; out.cap = cap; }
  return out;
}

// ── S1 — sidecar bounded-метаданных (мигр. 050; derived-at-put, rebuildable) ────────────────
// Правило усечения title ЕДИНОЕ с SQL-backfill по построению: char-slice(0,128) == substr(1,128).
// rows_count: только массив rows (канонический путь $.texts[0] единственного парсера); иное → NULL.
function _extractMeta(parsed) {
  try {
    const t = parsed && Array.isArray(parsed.texts) ? parsed.texts[0] : null;
    if (!t || typeof t !== "object") return { title: null, rows_count: null };
    const title = t.title != null ? String(t.title).slice(0, 128) : null;
    const rows = Array.isArray(t.rows) ? t.rows.length : null;
    return { title, rows_count: rows };
  } catch (_) { return { title: null, rows_count: null }; }
}
async function _upsertMeta(db, userId, kind, key, parsed) {
  const m = _extractMeta(parsed);
  await dbRun(db,
    `INSERT OR REPLACE INTO learner_artifact_meta (user_id, kind, artifact_key, title, rows_count)
     VALUES (?,?,?,?,?)`,
    [userId, kind, key, m.title, m.rows_count]);
}

// Каталог для list_personal_texts: артефакты + мета (LEFT JOIN — отсутствие меты = честный
// NULL-title, НЕ отказ всего списка; урок silent-batch-partial-failure).
async function listWithMeta(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT a.artifact_key, a.updated_at, a.ingested_at, length(a.payload_json) AS bytes,
            m.title, m.rows_count
       FROM learner_artifacts a
       LEFT JOIN learner_artifact_meta m
         ON m.user_id = a.user_id AND m.kind = a.kind AND m.artifact_key = a.artifact_key
      WHERE a.user_id = ? AND a.kind = ?
      ORDER BY a.artifact_key`, [userId, KIND]);
  return rows || [];
}

function _normalizedHebrewBody(value) {
  return String(value || "").normalize("NFKC").replace(/[\u0591-\u05C7\u200e\u200f]/g, "").replace(/\s+/g, " ").trim();
}
// H2.3 import dedupe: compare normalized Hebrew bodies inside the owner's
// already-consented cloud replica. Nothing is returned except the matching key.
async function findTextKeyByNormalizedBody(userId, body) {
  const wanted = _normalizedHebrewBody(body); if (!wanted) return null;
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db, `SELECT artifact_key,payload_json FROM learner_artifacts WHERE user_id=? AND kind=? ORDER BY artifact_key LIMIT 500`, [userId, KIND]);
  for (const row of rows || []) {
    let payload; try { payload = JSON.parse(row.payload_json); } catch (_) { continue; }
    for (const t of (payload && Array.isArray(payload.texts) ? payload.texts : [])) {
      const source = String(t.source_text || t.sourceText || "").trim() || (Array.isArray(t.rows) ? t.rows.map((x) => x.hebrew_niqqud || x.hebrew_plain || x.he_niqqud || x.he_plain || x.he || "").join("\n") : "");
      if (_normalizedHebrewBody(source) === wanted) return String(t.text_key || row.artifact_key);
    }
  }
  return null;
}

// ops-sweep: production-rebuild derived-слоя (краш-окно между artifact- и meta-upsert'ом,
// пропуски backfill'а) — «следующий put лечит» ЛОЖЕН (OLDER_OR_EQUAL до меты не доходит).
async function reconcileArtifactMeta(limit = 200) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT a.user_id, a.kind, a.artifact_key, a.payload_json
       FROM learner_artifacts a
       LEFT JOIN learner_artifact_meta m
         ON m.user_id = a.user_id AND m.kind = a.kind AND m.artifact_key = a.artifact_key
      WHERE a.kind = ? AND (m.artifact_key IS NULL OR m.built_at < a.ingested_at)
      LIMIT ?`, [KIND, Math.max(1, Number(limit) || 200)]);
  let rebuilt = 0;
  for (const row of (rows || [])) {
    let parsed = null;
    try { parsed = JSON.parse(row.payload_json); } catch (_) {}
    try { await _upsertMeta(db, row.user_id, row.kind, row.artifact_key, parsed); rebuilt++; } catch (_) {}
  }
  return { rebuilt };
}

// ── P2 — delete-семантика (§3.1/§6.4) ────────────────────────────────────────────────────────

async function listTombstones(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT artifact_key, deleted_at FROM artifact_tombstones WHERE user_id = ? AND kind = ? ORDER BY artifact_key`,
    [userId, KIND]);
  return rows || [];
}

// Физическое удаление артефакта + tombstone. LWW-guard (критика F1-4): удаление СТАРШЕ
// серверной копии не уничтожает более новый артефакт (DELETED_OLDER — клиент дропает интент,
// следующий DOWN принесёт новую версию). Tombstone ставится ВСЕГДА (кроме DELETED_OLDER) —
// live-инцидент 2026-07-18: drain интента попал в окно после revoke-purge (артефакт отсутствовал)
// → прежнее правило «tombstone только при changes>0» дало no-op → re-upload другого устройства
// ВОСКРЕСИЛ удалённый текст. Анти-мусор от фантомных ключей (F2-8) — кап на пользователя с
// прюнингом старейших, не existence-требование. Идемпотентно.
const MAX_TOMBSTONES_PER_USER = 2000;
async function deleteArtifact(userId, { artifact_key, deleted_at, kind = KIND } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const k = String(kind || KIND);
  if (!KINDS.has(k)) return { ok: false, error: "BAD_KIND" };
  const key = String(artifact_key || "").trim();
  if (!key || key.length > 200) return { ok: false, error: "BAD_KEY" };
  let delAt = String(deleted_at || "").trim();
  if (!delAt || !Number.isFinite(Date.parse(delAt))) delAt = new Date().toISOString();
  // future-clamp (удаление — интент пользователя, не блокируем, но не даём отравить LWW-ось)
  if (Date.parse(delAt) > Date.now() + MAX_FUTURE_SKEW_MS) delAt = new Date().toISOString();
  const existing = await dbGet(db, `SELECT updated_at FROM learner_artifacts WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, k, key]);
  if (existing && Date.parse(existing.updated_at) > Date.parse(delAt)) {
    return { ok: true, deleted: false, reason: "DELETED_OLDER", server_updated_at: existing.updated_at };
  }
  const r = await dbRun(db, `DELETE FROM learner_artifacts WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, k, key]);
  const n = await dbGet(db, `SELECT COUNT(*) c FROM artifact_tombstones WHERE user_id = ?`, [userId]);
  if (Number(n && n.c) >= MAX_TOMBSTONES_PER_USER) {
    await dbRun(db,
      `DELETE FROM artifact_tombstones WHERE user_id = ? AND rowid IN
         (SELECT rowid FROM artifact_tombstones WHERE user_id = ? ORDER BY created_at ASC LIMIT ?)`,
      [userId, userId, Math.max(1, Number(n.c) - MAX_TOMBSTONES_PER_USER + 1)]);
  }
  await dbRun(db,
    `INSERT INTO artifact_tombstones (user_id, kind, artifact_key, deleted_at) VALUES (?,?,?,?)
     ON CONFLICT(user_id, kind, artifact_key) DO UPDATE SET
       deleted_at = CASE WHEN excluded.deleted_at > deleted_at THEN excluded.deleted_at ELSE deleted_at END`,
    [userId, k, key, delAt]);
  return { ok: true, deleted: !!(r && r.changes > 0), tombstoned: true };
}

// Снятие tombstone без PUT (пере-импорт текста пользователем: undelete-интент клиента).
async function restoreArtifact(userId, { artifact_key, kind = KIND } = {}) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const k = String(kind || KIND);
  if (!KINDS.has(k)) return { ok: false, error: "BAD_KIND" };
  const key = String(artifact_key || "").trim();
  if (!key || key.length > 200) return { ok: false, error: "BAD_KEY" };
  const r = await dbRun(db, `DELETE FROM artifact_tombstones WHERE user_id = ? AND kind = ? AND artifact_key = ?`, [userId, k, key]);
  return { ok: true, restored: !!(r && r.changes > 0) };
}

// Отзыв cloud_texts → deletion-семантика класса C (§3.1/§6.8): purge ВСЕХ артефактов (оба kind)
// + tombstones. Возвращает счётчики для audit; провал — вверх (роут отвечает 500 PURGE_FAILED).
async function purgeAllForUser(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const a = await dbRun(db, `DELETE FROM learner_artifacts WHERE user_id = ?`, [userId]);
  const t = await dbRun(db, `DELETE FROM artifact_tombstones WHERE user_id = ?`, [userId]);
  return { artifacts: (a && a.changes) || 0, tombstones: (t && t.changes) || 0 };
}

// ops-sweep: прюнинг tombstones старше N дней (к этому моменту все девайсы синканы; TTL заявлен
// в consent-карте) + кап на пользователя как belt (критика F2-8).
async function pruneTombstones(maxAgeDays = 180) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
  const r = await dbRun(db, `DELETE FROM artifact_tombstones WHERE created_at < ?`, [cutoff]);
  return { pruned: (r && r.changes) || 0 };
}

// Штамп «purge выполнен» на КОНКРЕТНОЙ revoke-строке (id из recordConsent — критика F2-11:
// код отбрасывал возвращаемый id, и purged_at было некуда ставить).
async function markConsentPurged(consentRowId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  await dbRun(db, `UPDATE consent_records SET purged_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [String(consentRowId || "")]);
}

// ops-sweep reconcile (§6.8): отзыв записан, а purge упал/прерван → артефакты висят
// 403-замороженными вопреки обещанию карты и НИКТО не ретраит. Находим пользователей, чья
// ПОСЛЕДНЯЯ cloud_texts-строка = revoke без purged_at при живых артефактах/tombstones — допурж.
async function reconcileRevokedPurges() {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db,
    `SELECT c.user_id, c.id AS cid FROM consent_records c
      WHERE c.consent_key = ? AND c.granted = 0 AND c.purged_at IS NULL
        AND c.id = (SELECT c2.id FROM consent_records c2
                     WHERE c2.user_id = c.user_id AND c2.consent_key = ?
                     ORDER BY c2.created_at DESC, c2.id DESC LIMIT 1)
        AND (EXISTS (SELECT 1 FROM learner_artifacts a WHERE a.user_id = c.user_id)
          OR EXISTS (SELECT 1 FROM artifact_tombstones t WHERE t.user_id = c.user_id))`,
    [CONSENT_KEY, CONSENT_KEY]);
  let users = 0, artifacts = 0;
  for (const row of (rows || [])) {
    const p = await purgeAllForUser(row.user_id);
    await markConsentPurged(row.cid);
    users++; artifacts += p.artifacts;
  }
  return { users, artifacts };
}

module.exports = { hasConsent, hasConsentVersioned, list, listWithMeta, findTextKeyByNormalizedBody, get, getMeta, put, deleteArtifact, restoreArtifact, listTombstones, purgeAllForUser, pruneTombstones, markConsentPurged, reconcileRevokedPurges, reconcileArtifactMeta, CONSENT_KEY, REQUIRED_CONSENT_VERSION, KIND, STATE_KIND, KINDS, MAX_PAYLOAD_BYTES, MAX_STATE_PAYLOAD_BYTES };
