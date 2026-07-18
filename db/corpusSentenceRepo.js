"use strict";

// db/corpusSentenceRepo.js — PAS-A1 (PAS_SLICE_A_SPEC v2 §A1): чтение ОДНОГО предложения
// ОБЩЕГО артефакта (корпус Бен-Иегуды, public domain) для агент-объяснений. Consent-гейта
// нет by-design — содержимое не является данными пользователя; learner-раскрытие живёт
// в first-use confirm клиента (спека A1.6).
//
// Якорь ОБЯЗАН нести text_key (критика wf_35f46603 BLOCKER: многоглавные canon-работы
// делят один byehuda_id на несколько текстов) — выбор элемента texts[] СТРОГО по text_key,
// БЕЗ фолбэка на texts[0]; промах = честный CORPUS_SENTENCE_NOT_FOUND.
//
// Реальная форма works-файла: { library: { texts: [ { text_key(sha256), rows:[
// { order_index, hebrew_plain, hebrew_niqqud, translit, russian } ] } ] } } (+_reniqqud).
// payload.texts принимается только как legacy-фолбэк. Ряд ищется по ЗНАЧЕНИЮ
// rows[].order_index (не по позиции) — инвариант позиция==значение держит publish-гейт.
//
// STDOUT-ГИГИЕНА: контент никогда не попадает в console/throw (класс D по пути к LLM).

const fs = require("fs");
const path = require("path");

const MAX_BYTES = 8 * 1024 * 1024;       // реальный максимум works-файла сегодня ~1.3MB
const LRU_MAX = 8;                        // критика: parse до 8MB на каждый вызов — кэшируем
const WORK_ID_RE = /^\d{1,8}$/;           // анти-traversal: только цифры
const TEXT_KEY_RE = /^[a-f0-9]{16,64}$/;  // sha256-подобный ключ текста
const LESSON_SCOPE_ROWS_MAX = 2000;

const _lru = new Map();                   // `${workId}:${mtimeMs}` → texts[]

function _lruGet(key) {
  if (!_lru.has(key)) return null;
  const v = _lru.get(key);
  _lru.delete(key); _lru.set(key, v);     // refresh recency
  return v;
}
function _lruSet(key, v) {
  _lru.set(key, v);
  while (_lru.size > LRU_MAX) _lru.delete(_lru.keys().next().value);
}

function _worksDirs() {
  const dirs = [];
  const dd = process.env.DATA_DIR;
  if (dd) dirs.push(path.join(dd, "benyehuda", "works"));
  // dev-фолбэк на git-копию — ТОЛЬКО за явным флагом (в гейтах выключен, чтобы
  // hermetic-404-зубы не резолвились из репо — критика wf_35f46603 MINOR).
  if (process.env.CORPUS_WORKS_DEV_FALLBACK === "1") {
    dirs.push(path.join(__dirname, "..", "public", "data", "benyehuda", "works"));
  }
  return dirs;
}

function _loadTexts(workId) {
  for (const dir of _worksDirs()) {
    const p = path.join(dir, workId + ".json");
    let st;
    try { st = fs.statSync(p); } catch (_) { continue; }
    if (!st.isFile()) continue;
    if (st.size > MAX_BYTES) return { ok: false, error: "CORPUS_WORK_TOO_LARGE" };
    const cacheKey = workId + ":" + st.mtimeMs;
    const hit = _lruGet(cacheKey);
    if (hit) return { ok: true, texts: hit, cached: true };
    let payload;
    try { payload = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) {
      return { ok: false, error: "CORPUS_WORK_UNREADABLE" };
    }
    const texts = payload && payload.library && Array.isArray(payload.library.texts)
      ? payload.library.texts
      : (payload && Array.isArray(payload.texts) ? payload.texts : null);
    if (!texts || !texts.length) return { ok: false, error: "CORPUS_WORK_UNREADABLE" };
    _lruSet(cacheKey, texts);
    return { ok: true, texts };
  }
  return { ok: false, error: "CORPUS_WORK_NOT_FOUND" };
}

// Форма ответа зеркалит agentSentenceRepo.getSentenceContext — ядро explainer'а
// source-агностично по построению.
async function getCorpusSentenceContext({ corpus, work_id, text_key, order_index } = {}) {
  if (String(corpus || "benyehuda") !== "benyehuda") return { ok: false, error: "BAD_CORPUS" };
  const workId = String(work_id || "").trim();
  if (!WORK_ID_RE.test(workId)) return { ok: false, error: "BAD_WORK_ID" };
  const textKey = String(text_key || "").trim().toLowerCase();
  if (!TEXT_KEY_RE.test(textKey)) return { ok: false, error: "BAD_TEXT_KEY" };
  const orderIndex = Number(order_index);
  if (!Number.isInteger(orderIndex) || orderIndex < 0) return { ok: false, error: "BAD_ANCHOR" };

  const loaded = _loadTexts(workId);
  if (!loaded.ok) return loaded;
  const text = loaded.texts.find((t) => t && String(t.text_key || "").toLowerCase() === textKey) || null;
  if (!text) return { ok: false, error: "CORPUS_SENTENCE_NOT_FOUND" };
  const rows = Array.isArray(text.rows) ? text.rows : [];
  const row = rows.find((r) => r && Number(r.order_index) === orderIndex) || null;
  if (!row) return { ok: false, error: "CORPUS_SENTENCE_NOT_FOUND" };

  const he = String(row.hebrew_plain != null ? row.hebrew_plain : (row.he || "")).trim();
  const heN = String(row.hebrew_niqqud != null ? row.hebrew_niqqud : (row.he_niqqud || "")).trim();
  if (!he && !heN) return { ok: false, error: "CORPUS_SENTENCE_NOT_FOUND" };
  const cmeta = (text.source_meta && text.source_meta.corpus) || text.corpus || {};

  return {
    ok: true,
    scope_level: "sentence_only",
    anchor: { corpus: "benyehuda", work_id: workId, text_key: textKey, order_index: orderIndex },
    sentence: { he: he || heN, he_niqqud: heN || "", translit: String(row.translit || ""), ru: String(row.russian != null ? row.russian : (row.ru || "")) },
    work: {
      title: String(text.title || "") || null,
      author: (cmeta && cmeta.author) || null,
      era: (cmeta && cmeta.era) || null,
      license: "public-domain",
    },
  };
}

// PAS-A3 — окно ≤5 предложений ТОЛЬКО для корпуса (личный scope-контракт sentence_only
// физически не расширяется — BLOCKER критики wf_35f46603). Те же валидации, что выше.
const WINDOW_MAX = 5;
async function getCorpusWindow({ corpus, work_id, text_key, order_index, window } = {}) {
  const base = await getCorpusSentenceContext({ corpus, work_id, text_key, order_index });
  if (!base.ok) return base;
  const win = Math.max(1, Math.min(WINDOW_MAX, Number(window) || WINDOW_MAX));
  const loaded = _loadTexts(String(work_id).trim());
  if (!loaded.ok) return loaded;
  const text = loaded.texts.find((t) => t && String(t.text_key || "").toLowerCase() === String(text_key).trim().toLowerCase());
  const rows = (Array.isArray(text.rows) ? text.rows : [])
    .filter((r) => r && Number(r.order_index) >= Number(order_index) && Number(r.order_index) < Number(order_index) + win)
    .sort((a, b) => Number(a.order_index) - Number(b.order_index))
    .map((r) => ({
      order_index: Number(r.order_index),
      he: String(r.hebrew_niqqud || r.hebrew_plain || "").trim(),
      ru: String(r.russian || "").trim() || null,
    }))
    .filter((r) => r.he);
  if (!rows.length) return { ok: false, error: "CORPUS_SENTENCE_NOT_FOUND" };
  return { ok: true, anchor: base.anchor, work: base.work, rows };
}

// Wave 2 LB0: larger explicit selection than the five-sentence advisory tools.
// Public-domain source provenance remains work_id+text_key+row locators.
async function getCorpusLessonWindow({ corpus, work_id, text_key, start_order_index, row_count } = {}) {
  if (String(corpus || "benyehuda") !== "benyehuda") return { ok: false, error: "BAD_CORPUS" };
  const workId = String(work_id || "").trim();
  const textKey = String(text_key || "").trim().toLowerCase();
  const start = Number(start_order_index), count = Number(row_count);
  if (!WORK_ID_RE.test(workId)) return { ok: false, error: "BAD_WORK_ID" };
  if (!TEXT_KEY_RE.test(textKey)) return { ok: false, error: "BAD_TEXT_KEY" };
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 || count > LESSON_SCOPE_ROWS_MAX) {
    return { ok: false, error: "BAD_ANCHOR" };
  }
  const loaded = _loadTexts(workId); if (!loaded.ok) return loaded;
  const text = loaded.texts.find((t) => t && String(t.text_key || "").toLowerCase() === textKey) || null;
  if (!text) return { ok: false, error: "CORPUS_SENTENCE_NOT_FOUND" };
  const all = (Array.isArray(text.rows) ? text.rows : []).slice().sort((a, b) => Number(a.order_index) - Number(b.order_index));
  const rows = all.filter((r) => r && Number(r.order_index) >= start).slice(0, count).map((r) => ({
    order_index: Number(r.order_index),
    he: String(r.hebrew_niqqud || r.hebrew_plain || r.he_niqqud || r.he || "").trim(),
    ru: String(r.russian != null ? r.russian : (r.ru || "")).trim() || null,
  })).filter((r) => r.he);
  if (!rows.length) return { ok: false, error: "CORPUS_SENTENCE_NOT_FOUND" };
  const cmeta = (text.source_meta && text.source_meta.corpus) || text.corpus || {};
  return { ok: true, scope_level: "corpus_lesson_scope_2000", anchor: { corpus: "benyehuda", work_id: workId,
    text_key: textKey, start_order_index: rows[0].order_index, row_count: rows.length },
    title: String(text.title || "").slice(0, 200) || null, rows_total: all.length, rows,
    work: { title: String(text.title || "") || null, author: cmeta.author || null,
      era: cmeta.era || null, license: cmeta.license || "public-domain" } };
}

// Metadata-only lister for a work's texts (NO bodies) — resolves work_id -> its
// text_key(s) + valid order-index bounds so a caller that only knows work_id
// (e.g. the public catalog) can pick a text_key + anchor before reading a window.
function listWorkTexts(work_id) {
  const workId = String(work_id || "").trim();
  if (!WORK_ID_RE.test(workId)) return { ok: false, error: "BAD_WORK_ID" };
  const loaded = _loadTexts(workId);
  if (!loaded.ok) return loaded;
  const texts = loaded.texts.map((t) => {
    const rows = Array.isArray(t.rows) ? t.rows : [];
    const orders = rows.map((r) => Number(r.order_index)).filter((n) => Number.isFinite(n));
    const cmeta = (t.source_meta && t.source_meta.corpus) || t.corpus || {};
    return {
      text_key: String(t.text_key || "").toLowerCase(),
      title: String(t.title || "").slice(0, 200) || null,
      rows_total: rows.length,
      first_order_index: orders.length ? Math.min(...orders) : null,
      last_order_index: orders.length ? Math.max(...orders) : null,
      author: cmeta.author || null, era: cmeta.era || null, license: cmeta.license || "public-domain",
    };
  }).filter((t) => TEXT_KEY_RE.test(t.text_key) && Number.isInteger(t.first_order_index));
  if (!texts.length) return { ok: false, error: "CORPUS_WORK_UNREADABLE" };
  return { ok: true, work_id: workId, texts };
}

module.exports = { getCorpusSentenceContext, getCorpusWindow, getCorpusLessonWindow, listWorkTexts, LESSON_SCOPE_ROWS_MAX };
