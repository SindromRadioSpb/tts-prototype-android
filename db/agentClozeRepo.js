"use strict";

// db/agentClozeRepo.js — CLG-P7.2b cloze:tg: bounded-scan синхронизированных предложений
// пользователя → первое с формой due-леммы → context-cloze. ЧИТАТЕЛЬ (не писатель памяти), но
// читает КЛАСС C (собственные тексты) → двойной consent fail-closed на КАЖДЫЙ вызов (cloud_texts +
// agent_read_texts), как agentSentenceRepo. Ошибка/не-найдено → null (честный fallback на reverse/
// Зал, НЕ «тихий 0»). STDOUT-ГИГИЕНА: предложение пользователя НИКОГДА в console/throw (класс D).
//
// FORWARD-МАТЧ по ОГЛАСОВАННОЙ форме (замер 2026-07-07: resolveWord НЕ ключует голые поверхности без
// Dicta; критика wf_cd5d049a: консонантный skeleton, уникальный в датасете, ≠ контекстно-однозначен —
// в классическом тексте это может быть другое слово/имя/архаизм). Матч: due-лемма → её ВОКАЛИЗОВАННЫЕ
// формы (clozeFormsForItemKey) → искать ТОЧНОЕ огласованное совпадение в тексте пользователя. niqqud
// различает омографы. Дополнительно: (1) требуем реальную огласовку у токена (иначе не различить →
// skip); (2) functionGate — служебные слова/имена не кредитуем; (3) только unambiguous voc-формы
// (глобально один pid). expected = ПОВЕРХНОСТЬ вхождения. count===1. Дёшево (voc-lookup) + cap.

const path = require("path");
const keyingService = require(path.join(__dirname, "keyingService"));
const learnerArtifactsRepo = require(path.join(__dirname, "learnerArtifactsRepo"));
const agentSentenceRepo = require(path.join(__dirname, "agentSentenceRepo"));
const RM = require(path.join(__dirname, "..", "public", "js", "reader-morph.js"));

const MAX_ARTIFACTS_SCAN = 25;      // сколько текстов максимум открываем за один /review
const MAX_SENTENCES_SCAN = 800;     // глобальный потолок предложений на скан
const MAX_WORDS_PER_SENT = 40;      // одно слово / гигант — не cloze
// P8.3 §2-v2: собственного окна у builder'а БОЛЬШЕ НЕТ — dueItems приходит УЖЕ обрезанным
// snapshot'ом (REVIEW_DUE_WINDOW=50, agent/reviewSession.js) — одно окно у селектора и builder'а
// (§2.3-проба: независимый кап 40 терял 4 якорных слова при пуле 50). map/collide — одни на весь
// список (кросс-«чанковые» vocForm-коллизии ловятся by construction). TIME_BUDGET_MS остаётся
// cost-guard'ом. MAX_DUE_FORMS сохранён в экспорте как исторический маркер (не режет).
const MAX_DUE_FORMS = null;
const TIME_BUDGET_MS = 2500;        // мягкий бюджет; исчерпан → честный null (не виснем)
const BLANK = "―――――";   // ───── визуальный пропуск

// rows[] предложения из payload-артефакта (canonical + защитный C-shape, как agentSentenceRepo)
function _rowsOf(text) {
  const rows = Array.isArray(text && text.rows) ? text.rows : (Array.isArray(text && text.sentences) ? text.sentences : []);
  return rows.map((r) => ({
    order_index: Number(r.order_index),
    he_niqqud: String(r.hebrew_niqqud != null ? r.hebrew_niqqud : (r.he_niqqud || "")),
    he_plain: String(r.hebrew_plain != null ? r.hebrew_plain : (r.he_plain != null ? r.he_plain : (r.he || ""))),
    ru: String(r.russian != null ? r.russian : (r.ru || "")),
  }));
}

// собрать blanked-строку из segments (пропуски → BLANK)
function _renderBlanked(segments) {
  let out = "";
  for (const s of segments || []) out += s && s.blank ? BLANK : (s && s.t != null ? s.t : "");
  return out.trim();
}

function _normVoc(f) { return String(f == null ? "" : f).replace(/\s+/g, "").trim(); }

// vocForm(огласованная) → item_key из UNAMBIGUOUS форм due-лемм (офлайн). Коллизия vocForm между
// разными due → исключаем. Возврат { vocMap: Map(vocForm→item_key) }.
async function _dueVocMap(dueItems) {
  const map = new Map(), collide = new Set();
  for (const itemKey of dueItems) {
    let cf = null;
    try { cf = await keyingService.clozeFormsForItemKey(itemKey); } catch (_) { cf = null; }
    if (!cf || !cf.forms) continue;
    for (const f of cf.forms) {
      if (!f.unambiguous) continue;                       // омограф глобально → мис-атрибуция → пропуск
      const v = f.voc;
      if (collide.has(v)) continue;
      if (map.has(v) && map.get(v) !== itemKey) { map.delete(v); collide.add(v); continue; }
      map.set(v, itemKey);
    }
  }
  return map;
}

// scan → { item_key, surface, blanked_he, sentence_ru, text_key, order_index }
//        | { none: 'no-consent'|'no-due-forms'|'no-artifacts'|'budget'|'no-match' }.
// Дискриминированный результат (критика: budget-timeout ≠ definitively-empty; caller не должен
// рендерить «нечего» на таймаут). dueItems: item_key[] из getDue (порядок=приоритет).
async function selectClozeChallenge(userId, dueItems, isExposed) {
  const items = Array.isArray(dueItems) ? dueItems : [];
  if (!items.length) return { none: "no-due-forms" };
  // двойной consent — fail-closed (без него класс-C читать нельзя → fallback на reverse)
  if (!(await learnerArtifactsRepo.hasConsent(userId))) return { none: "no-consent" };
  if (!(await agentSentenceRepo.hasAgentReadConsent(userId))) return { none: "no-consent" };

  const vocMap = await _dueVocMap(items);
  if (vocMap.size === 0) return { none: "no-due-forms" };

  const started = Date.now();
  let artifacts;
  try { artifacts = await learnerArtifactsRepo.list(userId); } catch (_) { return { none: "no-artifacts" }; }
  if (!artifacts || !artifacts.length) return { none: "no-artifacts" };

  let sentencesSeen = 0, budgetHit = false;
  for (const meta of artifacts.slice(0, MAX_ARTIFACTS_SCAN)) {
    if (Date.now() - started > TIME_BUDGET_MS || sentencesSeen >= MAX_SENTENCES_SCAN) { budgetHit = true; break; }
    let art;
    try { art = await learnerArtifactsRepo.get(userId, meta.artifact_key); } catch (_) { continue; }
    if (!art) continue;
    let payload;
    try { payload = JSON.parse(art.payload_json); } catch (_) { continue; }   // без контента в ошибке
    const texts = Array.isArray(payload && payload.texts) ? payload.texts : [];
    for (const text of texts) {
      const textKey = String(text && text.text_key || meta.artifact_key);
      for (const row of _rowsOf(text)) {
        if (Date.now() - started > TIME_BUDGET_MS || sentencesSeen >= MAX_SENTENCES_SCAN) { budgetHit = true; break; }
        const he = row.he_niqqud;
        if (!he || !Number.isFinite(row.order_index)) continue;   // без огласовки нельзя различить омограф → пропуск
        sentencesSeen++;
        const tokens = RM.tokenize(he);
        const wordToks = tokens.filter((t) => t.isWord);
        if (wordToks.length < 2 || wordToks.length > MAX_WORDS_PER_SENT) continue;
        for (const tk of wordToks) {
          const voc = _normVoc(tk.text);
          const sk = RM.stripNiqqud(voc);
          if (sk === voc) continue;                          // токен БЕЗ огласовки → не различить → пропуск
          const itemKey = vocMap.get(voc);
          if (!itemKey) continue;                            // не due-форма (по огласованному совпадению)
          const fg = RM.functionGate(sk);
          if (fg && fg.isFunc) continue;                     // служебное/имя — не кредитуем
          if (isExposed && (await isExposed(itemKey))) continue;
          const cz = RM.buildClozeForTarget(tokens, sk);
          if (!cz || cz.count !== 1) continue;               // 0 или >1 пропуска — двусмысленно
          return {
            item_key: itemKey, surface: cz.answer, blanked_he: _renderBlanked(cz.segments),
            sentence_ru: row.ru || "", text_key: textKey, order_index: row.order_index,
          };
        }
      }
    }
  }
  return { none: budgetHit ? "budget" : "no-match" };
}

// P8.4a §10 п.6 — LIVE-резолюция якоря для dictate/reverse hint/reveal (якорь НЕ персистится:
// нет create-латентности, нет class-C-указателей на классе A, нет purge-дельты). Те же honesty-
// гейты, что скан выше: двойной consent fail-closed, voc-forward-match unambiguous-форм,
// function-gate, бюджет. Возврат { text_key, order_index, sentence_he, sentence_ru, masked_he } |
// null (нет якоря/consent/бюджет — вызывающий деградирует честно: hint/reveal без предложения).
// masked_he: target замаскирован (buildClozeForTarget count===1), иначе null (полное предложение
// до вердикта НЕ отдаём — masked-only для hint; reveal после вердикта использует sentence_he).
async function resolveAnchorLive(userId, itemKey) {
  if (!(await learnerArtifactsRepo.hasConsent(userId))) return null;
  if (!(await agentSentenceRepo.hasAgentReadConsent(userId))) return null;
  let cf = null;
  try { cf = await keyingService.clozeFormsForItemKey(itemKey); } catch (_) { cf = null; }
  if (!cf || !cf.forms) return null;
  const vocSet = new Set();
  for (const f of cf.forms) if (f.unambiguous) vocSet.add(f.voc);
  if (!vocSet.size) return null;

  const started = Date.now();
  let artifacts;
  try { artifacts = await learnerArtifactsRepo.list(userId); } catch (_) { return null; }
  let sentencesSeen = 0;
  for (const meta of (artifacts || []).slice(0, MAX_ARTIFACTS_SCAN)) {
    if (Date.now() - started > TIME_BUDGET_MS || sentencesSeen >= MAX_SENTENCES_SCAN) return null;
    let art;
    try { art = await learnerArtifactsRepo.get(userId, meta.artifact_key); } catch (_) { continue; }
    if (!art) continue;
    let payload;
    try { payload = JSON.parse(art.payload_json); } catch (_) { continue; }
    for (const text of (Array.isArray(payload && payload.texts) ? payload.texts : [])) {
      const textKey = String(text && text.text_key || meta.artifact_key);
      for (const row of _rowsOf(text)) {
        if (Date.now() - started > TIME_BUDGET_MS || sentencesSeen >= MAX_SENTENCES_SCAN) return null;
        const he = row.he_niqqud;
        if (!he || !Number.isFinite(row.order_index)) continue;
        sentencesSeen++;
        const tokens = RM.tokenize(he);
        const wordToks = tokens.filter((t) => t.isWord);
        if (wordToks.length < 2 || wordToks.length > MAX_WORDS_PER_SENT) continue;
        for (const tk of wordToks) {
          const voc = _normVoc(tk.text);
          if (!vocSet.has(voc)) continue;
          const sk = RM.stripNiqqud(voc);
          const fg = RM.functionGate(sk);
          if (fg && fg.isFunc) continue;
          const cz = RM.buildClozeForTarget(tokens, sk);
          return {
            text_key: textKey, order_index: row.order_index,
            sentence_he: he.trim(), sentence_ru: row.ru || "",
            masked_he: cz && cz.count === 1 ? _renderBlanked(cz.segments) : null,
          };
        }
      }
    }
  }
  return null;
}

module.exports = { selectClozeChallenge, resolveAnchorLive, MAX_ARTIFACTS_SCAN, MAX_SENTENCES_SCAN, TIME_BUDGET_MS, BLANK };
