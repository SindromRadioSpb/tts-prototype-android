"use strict";

// db/agentSentenceRepo.js — CLG-P6 слайс 2 (/explain sentence): ЕДИНСТВЕННОЕ место, где
// сервер читает СОДЕРЖИМОЕ учебного артефакта класса B. Решение владельца 2026-07-06
// (AI_MENTOR_RECON §15.9): learnerArtifactsRepo остаётся принципиально opaque; новая
// способность «парсить payload_json» живёт в ОТДЕЛЬНОМ модуле за ДВОЙНЫМ consent-гейтом:
//
//   cloud_texts       — «хранить/синхронизировать мои тексты» (класс B, CLG-P5.5)
//   agent_read_texts  — «разрешить наставнику читать текст и отправлять фрагмент LLM»
//                       (по духу класса C §5: «разрешить агенту видеть полный текст»)
//
// Оба согласия проверяются на КАЖДЫЙ вызов (fail-closed), не кэшируются.
//
// SCOPE-КОНТРАКТ: /explain остаётся scope_level='sentence_only' — getSentenceContext
// ФИЗИЧЕСКИ возвращает одну строку по (text_key, order_index).
// РАСШИРЕНИЕ (решение владельца 2026-07-12, PAS-A3 на «Мои тексты»): ОТДЕЛЬНЫЙ метод
// getSentenceWindow со scope_level='sentence_window_5' — ТОЛЬКО для проверки понимания,
// физический cap 5 строк, тот же двойной consent; consent-копия/first-use раскрытие
// обновлены («до 5 предложений»). /explain через окно НЕ ходит by construction.
//
// STDOUT-ГИГИЕНА: контент предложения никогда не попадает в console/throw-message (класс D).

const { getDb } = require("./sqlite");
const learnerArtifactsRepo = require("./learnerArtifactsRepo");

const CONSENT_KEY_AGENT = "agent_read_texts";
const SCOPE_SENTENCE_ONLY = "sentence_only";

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
}

// Та же семантика, что learnerArtifactsRepo.hasConsent: истина = ПОСЛЕДНЯЯ consent-строка.
async function hasAgentReadConsent(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db,
    `SELECT granted FROM consent_records WHERE user_id = ? AND consent_key = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`, [userId, CONSENT_KEY_AGENT]);
  return !!(row && Number(row.granted) === 1);
}

// Достаёт РОВНО ОДНО предложение из exportBundle-пейлоада артефакта.
// Канонический shape аплоада (cloud-sync → exportBundle): texts[].rows[] с
// { order_index, hebrew_plain, hebrew_niqqud, translit, russian }; защитно принимаем и
// importBundle-shape C (sentences[] с he_plain/ru) — фикстуры/старые бандлы.
function _pickSentenceRow(payload, textKey, orderIndex, rowId) {
  const texts = payload && Array.isArray(payload.texts) ? payload.texts : null;
  if (!texts || !texts.length) return null;
  const t = texts.find((x) => x && String(x.text_key) === String(textKey)) || texts[0];
  const rows = Array.isArray(t.rows) ? t.rows : (Array.isArray(t.sentences) ? t.sentences : []);
  // PAS-B1 (критика wf_7f300c39): row_id-матч ПРИОРИТЕТНЕЕ order_index — клиентский
  // кэш индекса протухает при реордере, а bundle-ряды несут стабильный row_id=s.id;
  // без row_id (Зал, старые клиенты) поведение прежнее (backward-compatible).
  let row = null;
  if (rowId) row = rows.find((r) => r && String(r.row_id || r.id || "") === String(rowId)) || null;
  if (!row) row = rows.find((r) => r && Number(r.order_index) === Number(orderIndex));
  if (!row) return null;
  return {
    he: String(row.hebrew_plain != null ? row.hebrew_plain : (row.he_plain != null ? row.he_plain : (row.he || ""))),
    he_niqqud: String(row.hebrew_niqqud != null ? row.hebrew_niqqud : (row.he_niqqud || "")),
    translit: String(row.translit || ""),
    ru: String(row.russian != null ? row.russian : (row.ru || "")),
    text_title: String(t.title || ""),
    order_index: Number(row.order_index),
  };
}

// Единая точка доступа агента к содержимому предложения. Возвращает структурированный
// результат (endpoint мапит на 403/404) — НИКОГДА не бросает контент в исключения.
async function getSentenceContext(userId, { text_key, order_index, row_id } = {}) {
  const textKey = String(text_key || "").trim();
  const orderIndex = Number(order_index);
  // row_id — опциональный точный якорь (PAS-B1, Студия); валидация мягкая: строка ≤64
  const rowId = row_id == null ? null : String(row_id).slice(0, 64);
  if (!textKey || !Number.isFinite(orderIndex)) return { ok: false, error: "BAD_ANCHOR" };

  // Двойной consent, fail-closed, в порядке иерархии (без cloud_texts на сервере
  // и читать-то нечего; коды различены — клиент показывает точную причину).
  if (!(await learnerArtifactsRepo.hasConsent(userId))) {
    return { ok: false, error: "CLOUD_TEXTS_CONSENT_REQUIRED", key: learnerArtifactsRepo.CONSENT_KEY };
  }
  if (!(await hasAgentReadConsent(userId))) {
    return { ok: false, error: "AGENT_READ_TEXTS_CONSENT_REQUIRED", key: CONSENT_KEY_AGENT };
  }

  const art = await learnerArtifactsRepo.get(userId, textKey);
  if (!art) return { ok: false, error: "TEXT_NOT_IN_CLOUD" };
  let payload = null;
  try { payload = JSON.parse(art.payload_json); } catch (_) {
    return { ok: false, error: "ARTIFACT_UNREADABLE" };   // без содержимого в ошибке
  }
  const row = _pickSentenceRow(payload, textKey, orderIndex, rowId);
  if (!row || !row.he) return { ok: false, error: "SENTENCE_NOT_FOUND" };

  return {
    ok: true,
    scope_level: SCOPE_SENTENCE_ONLY,
    // anchor несёт order_index СМАТЧЕННОГО ряда (при row_id-матче может отличаться от
    // запрошенного) — sentence_id объяснения остаётся консистентным с бандлом.
    anchor: { text_key: textKey, order_index: Number.isFinite(row.order_index) ? row.order_index : orderIndex },
    sentence: { he: row.he, he_niqqud: row.he_niqqud, translit: row.translit, ru: row.ru },
    text_title: row.text_title || null,
    artifact_updated_at: art.updated_at,
  };
}

// PAS-A3 (решение владельца 2026-07-12): окно ≤5 строк ЛИЧНОГО текста для проверки
// понимания; PAS-B3-фидбэк (решение владельца 2026-07-12, вечер): тем же окном живёт
// «упрощённый пересказ» — consent-копия обновлена («проверка понимания, пересказ»).
// Тот же двойной consent fail-closed на каждый вызов; cap — физический.
const SCOPE_SENTENCE_WINDOW = "sentence_window_5";
const WINDOW_MAX = 5;
async function getSentenceWindow(userId, { text_key, order_index, window } = {}) {
  const textKey = String(text_key || "").trim();
  const orderIndex = Number(order_index);
  if (!textKey || !Number.isFinite(orderIndex)) return { ok: false, error: "BAD_ANCHOR" };
  if (!(await learnerArtifactsRepo.hasConsent(userId))) {
    return { ok: false, error: "CLOUD_TEXTS_CONSENT_REQUIRED", key: learnerArtifactsRepo.CONSENT_KEY };
  }
  if (!(await hasAgentReadConsent(userId))) {
    return { ok: false, error: "AGENT_READ_TEXTS_CONSENT_REQUIRED", key: CONSENT_KEY_AGENT };
  }
  const art = await learnerArtifactsRepo.get(userId, textKey);
  if (!art) return { ok: false, error: "TEXT_NOT_IN_CLOUD" };
  let payload = null;
  try { payload = JSON.parse(art.payload_json); } catch (_) { return { ok: false, error: "ARTIFACT_UNREADABLE" }; }
  const texts = payload && Array.isArray(payload.texts) ? payload.texts : null;
  if (!texts || !texts.length) return { ok: false, error: "SENTENCE_NOT_FOUND" };
  const t = texts.find((x) => x && String(x.text_key) === textKey) || texts[0];
  const win = Math.max(1, Math.min(WINDOW_MAX, Number(window) || WINDOW_MAX));
  const rows = (Array.isArray(t.rows) ? t.rows : [])
    .filter((r) => r && Number(r.order_index) >= orderIndex && Number(r.order_index) < orderIndex + win)
    .sort((a, b) => Number(a.order_index) - Number(b.order_index))
    .map((r) => ({
      order_index: Number(r.order_index),
      he: String(r.hebrew_niqqud || r.hebrew_plain || r.he_niqqud || r.he || "").trim(),
      ru: String(r.russian != null ? r.russian : (r.ru || "")).trim() || null,
    }))
    .filter((r) => r.he);
  if (!rows.length) return { ok: false, error: "SENTENCE_NOT_FOUND" };
  return { ok: true, scope_level: SCOPE_SENTENCE_WINDOW, anchor: { text_key: textKey, order_index: orderIndex }, rows };
}

// PAS-B2 (критика wf_7f300c39, BLOCKER ×3 линзы): «что стоит выучить из этого текста»
// читает ВЕСЬ текст (до 40 строк + название) — это раскрытие ЗА ПРЕДЕЛАМИ обещания
// agent_read_texts («уходит только одно предложение — не весь текст») и window_5
// («только для проверки понимания»). Переиспользование старых ключей сделало бы их
// копию ложью → ОТДЕЛЬНЫЙ durable-ключ agent_read_texts_digest со своей честной
// копией; тройная иерархия fail-closed НА КАЖДЫЙ вызов, cap — физический.
const CONSENT_KEY_DIGEST = "agent_read_texts_digest";
const SCOPE_TEXT_DIGEST = "text_digest_40";
const DIGEST_ROWS_MAX = 40;
const DIGEST_CHARS_MAX = 200;
async function hasDigestConsent(userId) {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const row = await dbGet(db,
    `SELECT granted FROM consent_records WHERE user_id = ? AND consent_key = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`, [userId, CONSENT_KEY_DIGEST]);
  return !!(row && Number(row.granted) === 1);
}
async function getTextDigest(userId, { text_key } = {}) {
  const textKey = String(text_key || "").trim();
  if (!textKey) return { ok: false, error: "BAD_ANCHOR" };
  if (!(await learnerArtifactsRepo.hasConsent(userId))) {
    return { ok: false, error: "CLOUD_TEXTS_CONSENT_REQUIRED", key: learnerArtifactsRepo.CONSENT_KEY };
  }
  if (!(await hasAgentReadConsent(userId))) {
    return { ok: false, error: "AGENT_READ_TEXTS_CONSENT_REQUIRED", key: CONSENT_KEY_AGENT };
  }
  if (!(await hasDigestConsent(userId))) {
    return { ok: false, error: "AGENT_READ_TEXTS_DIGEST_CONSENT_REQUIRED", key: CONSENT_KEY_DIGEST };
  }
  const art = await learnerArtifactsRepo.get(userId, textKey);
  if (!art) return { ok: false, error: "TEXT_NOT_IN_CLOUD" };
  let payload = null;
  try { payload = JSON.parse(art.payload_json); } catch (_) { return { ok: false, error: "ARTIFACT_UNREADABLE" }; }
  const texts = payload && Array.isArray(payload.texts) ? payload.texts : null;
  if (!texts || !texts.length) return { ok: false, error: "SENTENCE_NOT_FOUND" };
  const t = texts.find((x) => x && String(x.text_key) === textKey) || texts[0];
  const all = (Array.isArray(t.rows) ? t.rows : (Array.isArray(t.sentences) ? t.sentences : []))
    .slice()
    .sort((a, b) => Number(a.order_index) - Number(b.order_index));
  const rows = all.slice(0, DIGEST_ROWS_MAX).map((r) => ({
    he: String(r.hebrew_niqqud || r.hebrew_plain || r.he_niqqud || r.he_plain || r.he || "").trim().slice(0, DIGEST_CHARS_MAX),
    ru: (String(r.russian != null ? r.russian : (r.ru || "")).trim().slice(0, DIGEST_CHARS_MAX)) || null,
  })).filter((r) => r.he);
  if (!rows.length) return { ok: false, error: "SENTENCE_NOT_FOUND" };
  return {
    ok: true,
    scope_level: SCOPE_TEXT_DIGEST,
    anchor: { text_key: textKey },
    title: String(t.title || "").slice(0, DIGEST_CHARS_MAX) || null,
    rows_total: all.length,
    rows,
  };
}

module.exports = { hasAgentReadConsent, hasDigestConsent, getSentenceContext, getSentenceWindow, getTextDigest,
  CONSENT_KEY_AGENT, CONSENT_KEY_DIGEST, SCOPE_SENTENCE_ONLY, SCOPE_SENTENCE_WINDOW, SCOPE_TEXT_DIGEST, DIGEST_ROWS_MAX };
