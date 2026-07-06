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
// SCOPE-КОНТРАКТ (решение владельца): scope_level = 'sentence_only' — модуль ФИЗИЧЕСКИ
// возвращает одну строку по (text_key, order_index); соседние предложения/абзац не
// извлекаются вовсе (расширение до sentence_plus_neighbors — отдельное решение + consent-копия).
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
function _pickSentenceRow(payload, textKey, orderIndex) {
  const texts = payload && Array.isArray(payload.texts) ? payload.texts : null;
  if (!texts || !texts.length) return null;
  const t = texts.find((x) => x && String(x.text_key) === String(textKey)) || texts[0];
  const rows = Array.isArray(t.rows) ? t.rows : (Array.isArray(t.sentences) ? t.sentences : []);
  const row = rows.find((r) => r && Number(r.order_index) === Number(orderIndex));
  if (!row) return null;
  return {
    he: String(row.hebrew_plain != null ? row.hebrew_plain : (row.he_plain != null ? row.he_plain : (row.he || ""))),
    he_niqqud: String(row.hebrew_niqqud != null ? row.hebrew_niqqud : (row.he_niqqud || "")),
    translit: String(row.translit || ""),
    ru: String(row.russian != null ? row.russian : (row.ru || "")),
    text_title: String(t.title || ""),
  };
}

// Единая точка доступа агента к содержимому предложения. Возвращает структурированный
// результат (endpoint мапит на 403/404) — НИКОГДА не бросает контент в исключения.
async function getSentenceContext(userId, { text_key, order_index } = {}) {
  const textKey = String(text_key || "").trim();
  const orderIndex = Number(order_index);
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
  const row = _pickSentenceRow(payload, textKey, orderIndex);
  if (!row || !row.he) return { ok: false, error: "SENTENCE_NOT_FOUND" };

  return {
    ok: true,
    scope_level: SCOPE_SENTENCE_ONLY,
    anchor: { text_key: textKey, order_index: orderIndex },
    sentence: { he: row.he, he_niqqud: row.he_niqqud, translit: row.translit, ru: row.ru },
    text_title: row.text_title || null,
    artifact_updated_at: art.updated_at,
  };
}

module.exports = { hasAgentReadConsent, getSentenceContext, CONSENT_KEY_AGENT, SCOPE_SENTENCE_ONLY };
