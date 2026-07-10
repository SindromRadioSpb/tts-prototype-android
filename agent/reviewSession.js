"use strict";

// CLG-P8.3 — channel-neutral review-session service (TELEGRAM_MINI_APP_P8_3_SPEC §3, §8-v2).
// Шаг 1 extraction: селектор selectEligible ПЕРЕНЕСЁН СЮДА из agent/telegram/review.js
// (чистый перенос, parity-гейт = telegram-selector/review/cloze/dictate зелёные), бот
// делегирует. Шаг 2 (в этом же доме): единый due-snapshot —
//   • REVIEW_DUE_WINDOW=50 — ОДНА константа окна (была: selector limit:50 в review.js:92
//     И НЕЗАВИСИМЫЙ MAX_DUE_FORMS=40 в agentClozeRepo → доказанная §2.3-пробой потеря 4
//     якорных слов при пуле 50; builder теперь получает ТО ЖЕ окно);
//   • exposure МАТЕРИАЛИЗОВАН одним запросом на одном nowMs (recentlyExposedSet) —
//     selector и cloze-скан видят один exposure-мир, per-item дрейф времени исключён;
//   • struggleSet уже был одноразовым снимком — сохранён.
// start/answer/skip/annul/hint появляются следующими шагами P8.3/P8.4 (§9-адъюдикация).

const path = require("path");
const agentChallengeRepo = require(path.join(__dirname, "..", "db", "agentChallengeRepo"));
const agentClozeRepo = require(path.join(__dirname, "..", "db", "agentClozeRepo"));
const keyingService = require(path.join(__dirname, "..", "db", "keyingService"));
const learnerGraphRepo = require(path.join(__dirname, "..", "db", "learnerGraphRepo"));
const learnerLogRepo = require(path.join(__dirname, "..", "db", "learnerLogRepo"));
const GP = require(path.join(__dirname, "..", "public", "js", "grade-policy"));
const FC = require(path.join(__dirname, "..", "public", "js", "fsrs-core"));
const audioRepo = require(path.join(__dirname, "..", "db", "audioRepo"));
const { computeDictateAssetKey } = require(path.join(__dirname, "..", "db", "premium", "ttsAssetKey"));

// §2-v2: одно окно для селектора И builder'а. Расширение 40→50 для cloze — НАМЕРЕННОЕ
// исправление (§9 п.11): выбор cloze остаётся sentence-scan-order-first ВНУТРИ окна.
const REVIEW_DUE_WINDOW = 50;

// dictate keyless-раздача: аудио отдаётся Telegram'у по публичному https-URL (Telegram сам фетчит
// keyless /api/audio/:key). БЕЗ валидного https base диктант НЕ eligible (fail-closed, НЕ тихо —
// селектор логирует и падает на reverse). Серверного TTS-ключа нет (owner-инвариант): синтез офлайн.
function publicBaseUrl() {
  const b = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s]+$/.test(b) ? b : null;
}
function audioUrlFor(assetKey) {
  const base = publicBaseUrl();
  return base ? base + "/api/audio/" + String(assetKey) : null;
}

// P7.2d premium selector — выбор модальности SCORE-BASED по состоянию навыка + провенанс причины
// (select_reason). ДЕТЕРМИНИРОВАН из состояния (R17: LLM не выбирает — объяснение статично по коду).
// Порядок сложности (критика wf_58b7c1d6): cloze (context-cued) < dictate (audio-cued) < reverse
// (uncued gloss→word, САМАЯ тяжёлая). Тир-лестница (по убыванию приоритета):
//   1) FLAGSHIP reading→dictation gap: слово НЕТТО-сильное в чтении, НИКОГДА не диктованное,
//      не горящее, dictate-eligible → dictate (единственное место, где gap перебивает cloze-first);
//   2) cloze (мягчайший, context-cued) — struggle? cued-объяснение;
//   3) dictate (любой готовый ассет; audio-cued — средняя сложность);
//   4) reverse strictSafe (uncued — последним);
//   5) ничего. Cooldown/анти-старвация сохранены; dictate-eligibility мемоизирована (один дорогой
//   вызов на item; критика R11 cost — flagship дёшево пре-фильтрует до дорогого скана).
// dictateProven НЕ берём из channel_stats.production (полосуется клиентскими reverse/cloze без
// evidence_scope — критика R17 ВЕРИФИЦИРОВАНА library-ui.js) → history ТОЛЬКО из itemRows +
// grade-policy channelPrefix-сегментации.
async function selectEligible(userId, { nowMs } = {}) {
  const now = Number(nowMs) || Date.now();
  const items = await learnerGraphRepo.getDue(userId, { nowMs: now, limit: REVIEW_DUE_WINDOW, withChannelStats: true });
  const dueKeys = (items || []).map((it) => it.item_key);
  // §9 п.9: exposure — материализованный снимок на ОДНОМ nowMs (selector и builder видят одно).
  const exposedSet = await agentChallengeRepo.recentlyExposedSet(userId, dueKeys, now);
  const isExposed = (k) => exposedSet.has(String(k));
  // ПОЛНЫЙ struggle-Set (не ranked top-N — критика R2/R11): горящее due-слово за пределами cap не должно
  // молча flagship-промотиться. 24ч, ≥2 провала.
  const struggleSet = await learnerGraphRepo.recentStruggleKeySet(userId, { minFails: 2 });

  const base = publicBaseUrl();
  if (!base) {
    // fail-closed ГРОМКО (критика wf_596df7f6): без https base диктант выключен — оператор видит ПРИЧИНУ.
    console.log("[tg-review] dictate off: PUBLIC_BASE_URL unset/not-https (audio review disabled)");
  }

  // мемоизированная dictate-eligibility (дорого: dictateFormForItemKey O(N) + hasAsset). null = не
  // eligible (омофон/неоднозначно/нет ассета/exposed/2-букв). Один вызов на item_key — переиспользуется
  // шагами 1/3 (тот же !isExposed-фильтр во всех проходах → нет дрейфа).
  const dictCache = new Map();
  let dNoAsset = 0;
  async function dictateEligible(itemKey) {
    if (dictCache.has(itemKey)) return dictCache.get(itemKey);
    let out = null;
    if (base && !isExposed(itemKey)) {
      let d = null;
      try { d = await keyingService.dictateFormForItemKey(itemKey); } catch (_) { d = null; }
      if (d) {
        const assetKey = computeDictateAssetKey(d.vocalized);
        let ready = false;
        try { ready = await audioRepo.hasAsset(assetKey); } catch (_) { ready = false; }
        if (ready) out = { kind: "dictate", item_key: itemKey, vocalized: d.vocalized, written: d.written,
                           assetKey, url: audioUrlFor(assetKey), sense_id: d.pid };
        else dNoAsset++;   // dictate-безопасно, но ассет не запечён → ops-сигнал ниже
      }
    }
    dictCache.set(itemKey, out);
    return out;
  }

  // readingStrong (дёшево, из channel_stats.receptive — рецептив НЕ полосуется production'ом). Слово
  // ВЫБИРАЕТСЯ потому что DUE (частично забыто) → одиночный старый good не «знаком при чтении» (критика
  // diff wf_8cd4658d MAJOR, converged 3 линзы). НЕТТО-сильно И недавно-успешно: good≥2 · good перевешивает
  // ВСЕ трудности (again+hard, не только again) · последний рецептив-грейд успешен (≥3 — channel_stats
  // кумулятивен, last_grade даёт свежесть, консистентно с тем, что слово due).
  function readingStrong(it) {
    const r = it && it.channel_stats && it.channel_stats.receptive;
    return !!(r && r.good >= 2 && r.good > (r.again || 0) + (r.hard || 0) && Number(r.last_grade) >= 3);
  }
  // когда-либо диктовал это слово (audio→написание)? modality-сегментировано (channelPrefix==='dictate'
  // ловит и dictate:tg, и клиентский Studio 'dictate'; НЕ reverse/cloze). context-supported исключаем.
  // Аннулированные review — НЕ свидетельство (системный инвариант, как channelStats/recentStruggleKeySet/
  // replay; критика diff wf_8cd4658d: иначе слово с ЕДИНСТВЕННЫМ аннулированным диктантом навсегда лишалось
  // бы flagship-gap). collectAnnulled по ТЕМ ЖЕ per-item строкам, что channelStats.
  async function hasDictateHistory(itemKey) {
    let rows = [];
    try { rows = await learnerLogRepo.itemRows(userId, itemKey); } catch (_) { rows = []; }
    const annulled = FC.collectAnnulled ? FC.collectAnnulled(rows) : {};
    return (rows || []).some((r) => r && r.kind === "review" && !annulled[String(r.id)] &&
      GP.channelPrefix(r.channel) === "dictate" && !GP.isContextSupportedRow(r));
  }

  // 1) FLAGSHIP — reading→dictation gap. Дёшево пре-фильтруем (readingStrong && !struggle), дорогой
  //    dictate-скан + itemRows ТОЛЬКО для выживших.
  if (base) {
    for (const it of items || []) {
      if (!readingStrong(it) || struggleSet.has(it.item_key)) continue;
      const d = await dictateEligible(it.item_key);
      if (!d) continue;
      if (await hasDictateHistory(it.item_key)) continue;   // уже диктовал → не «gap» (и не dictate-loop)
      return { ...d, select_reason: "reading_strong_close_dictation_gap" };
    }
  }

  // 2) cloze (мягчайший, context-cued; двойной consent внутри). struggle → cued-объяснение.
  //    Builder получает ТО ЖЕ due-окно (полный snapshot, §2-v2) и ТОТ ЖЕ exposure-снимок.
  const cz = await agentClozeRepo.selectClozeChallenge(userId, dueKeys, isExposed);
  if (cz && cz.item_key) {
    const reason = struggleSet.has(cz.item_key) ? "recent_struggle_prefer_cued" : "default_context";
    return { kind: "cloze", ...cz, select_reason: reason };
  }

  // 3) dictate baseline (любой готовый ассет; audio-cued средняя сложность — анти-старвация: due-слово,
  //    годное только для диктанта, не теряется = нет тихого 0).
  if (base) {
    for (const it of items || []) {
      const d = await dictateEligible(it.item_key);
      if (d) return { ...d, select_reason: "default_dictation" };
    }
    if (dNoAsset) console.log("[tg-review] dictate: " + dNoAsset + " due candidate(s) без ассета → run bake-dictate-audio");
  }

  // 4) reverse strictSafe (uncued — самая тяжёлая, последней)
  for (const it of items || []) {
    let g = null;
    try { g = await keyingService.glossForItemKey(it.item_key); } catch (_) { g = null; }
    if (!g || !g.strictSafe) continue;
    if (isExposed(it.item_key)) continue;
    return { kind: "reverse", item_key: it.item_key, gloss: g.gloss, expected: g.expected,
             sense_id: g.sense_id, select_reason: "default_recall" };
  }
  return null;
}

module.exports = { selectEligible, publicBaseUrl, audioUrlFor, REVIEW_DUE_WINDOW };
