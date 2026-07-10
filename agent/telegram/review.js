"use strict";

// agent/telegram/review.js — CLG-P7.2a пользовательский review-поток (TELEGRAM_P7_2_REVIEW_SPEC
// v3/v4, owner-вариант A: строгий reverse:tg на однозначных словах). Импортируется server.js
// (webhook-trusted путь) — НЕ роутером (транзитивный read-only ассерт router.js цел; здесь
// пишущая ветка). Два действия:
//   • startReview  — флаг+consent → выбрать strict-safe due-item → создать challenge → отправить
//     prompt (ForceReply) → сохранить message_id → записать exposure. Crash-safe: send упал →
//     challenge отменён; message_id не сохранён → следующий /review восстановит (re-send).
//   • submitAnswer — reply-binding (ответ ТОЛЬКО reply на конкретный prompt) → «не сейчас»/
//     «не знаю»/иврит → grader через ЕДИНСТВЕННЫЙ challenge-bound reviewer.record → verdict.
//
// Reply-binding — ОДИН механизм (критика: ForceReply+inline несовместимы, callback не обрабатыв.):
// ForceReply делает ответ reply_to prompt для ЛЮБОГО текста; «не знаю»/«не сейчас» = стабильные
// токены в тексте reply. Свободное сообщение (не reply на prompt) → НЕ review (challenge жив).
// Сырой ответ передаётся grader'у, но НИГДЕ не персистится (privacy=A).

const path = require("path");
const crypto = require("crypto");
const agentChallengeRepo = require(path.join(__dirname, "..", "..", "db", "agentChallengeRepo"));
const agentClozeRepo = require(path.join(__dirname, "..", "..", "db", "agentClozeRepo"));
const keyingService = require(path.join(__dirname, "..", "..", "db", "keyingService"));
const learnerGraphRepo = require(path.join(__dirname, "..", "..", "db", "learnerGraphRepo"));
const learnerLogRepo = require(path.join(__dirname, "..", "..", "db", "learnerLogRepo"));
const GP = require(path.join(__dirname, "..", "..", "public", "js", "grade-policy"));
const FC = require(path.join(__dirname, "..", "..", "public", "js", "fsrs-core"));
const learnerArtifactsRepo = require(path.join(__dirname, "..", "..", "db", "learnerArtifactsRepo"));
const agentSentenceRepo = require(path.join(__dirname, "..", "..", "db", "agentSentenceRepo"));
const channelLinkRepo = require(path.join(__dirname, "..", "..", "db", "channelLinkRepo"));
const agentRepo = require(path.join(__dirname, "..", "..", "db", "agentRepo"));
const audioRepo = require(path.join(__dirname, "..", "..", "db", "audioRepo"));
const { computeDictateAssetKey } = require(path.join(__dirname, "..", "..", "db", "premium", "ttsAssetKey"));
const reviewer = require(path.join(__dirname, "..", "reviewer"));
const api = require(path.join(__dirname, "api"));
const format = require(path.join(__dirname, "format"));

const REVERSE_CHANNEL = "reverse:tg";
const CLOZE_CHANNEL = "cloze:tg";
const DICTATE_CHANNEL = "dictate:tg";
const STIMULUS_SOURCE = "pealim-infl";
const STIMULUS_VERSION = "v12";

function flagOn() { return process.env.AGENT_REVIEW_WRITE === "1"; }
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }

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

// стабильные токены управляющих ответов (нормализация: lower, ё→е, схлопнуть пробелы/пункт)
function normToken(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я\s]/gi, " ").replace(/\s+/g, " ").trim();
}
const DONT_KNOW = new Set(["не знаю", "незнаю", "я не знаю", "хз", "dont know", "dunno"]);
const NOT_NOW = new Set(["не сейчас", "позже", "потом", "not now", "later"]);

async function lang(userId) {
  try { const p = await agentRepo.getProfile(userId); return (p && p.language) || "ru"; } catch (_) { return "ru"; }
}
async function stillAuthorized(userId, tgUserId, chatId) {
  const link = await channelLinkRepo.getActiveLinkByUser(userId);
  if (!link) return false;
  if (String(link.telegram_user_id) !== String(tgUserId)) return false;
  if (String(link.telegram_chat_id) !== String(chatId)) return false;
  if (!(await channelLinkRepo.telegramConsentActive(null, userId))) return false;
  return true;
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
async function selectEligible(userId) {
  const items = await learnerGraphRepo.getDue(userId, { limit: 50, withChannelStats: true });
  const dueKeys = (items || []).map((it) => it.item_key);
  const isExposed = (k) => agentChallengeRepo.recentlyExposed(userId, k);
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
    if (base && !(await isExposed(itemKey))) {
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
    if (await isExposed(it.item_key)) continue;
    return { kind: "reverse", item_key: it.item_key, gloss: g.gloss, expected: g.expected,
             sense_id: g.sense_id, select_reason: "default_recall" };
  }
  return null;
}

// caps для createChallenge из дескриптора selectEligible
function _capsFor(pick, userId, tgUserId, chatId) {
  if (pick.kind === "cloze") {
    // shown_stimulus = ВЕСЬ класс-C блок (bланкнутое предложение + перевод) — единый purgeable unit;
    // recovery-переотправка использует его же. Surface (иврит) в нём отсутствует (blank), ru — кириллица.
    const body = pick.blanked_he + (pick.sentence_ru ? "\n" + pick.sentence_ru : "");
    return {
      userId, tgUserId, tgChatId: chatId, item_key: pick.item_key, review_mode: CLOZE_CHANNEL,
      prompt_kind: "cloze", evidence_scope: "cloze", expected_form_id: pick.item_key,
      expected_surface: pick.surface, anchor_text_key: pick.text_key, anchor_order_index: pick.order_index,
      shown_stimulus: body, stimulus_source: "synced-sentence", stimulus_source_version: null,
      stimulus_privacy_class: "C", stimulus_hash: sha1(body).slice(0, 16), accepted_alts: [],
      select_reason: pick.select_reason || null,   // P7.2d: провенанс выбора (объяснение читает chal.select_reason)
    };
  }
  if (pick.kind === "dictate") {
    // shown_stimulus = assetKey (КЛАСС A — TTS словарной формы, НЕ текст пользователя → не class-C purge).
    // expected_surface = ПИСЬМЕННАЯ (консонантная) форма. evidence_scope='cell' ЛИТЕРАЛ (D-4): dictate =
    // unsupported production → защёлкивает hasProvenProduction для dictate-семьи (не для reverse).
    return {
      userId, tgUserId, tgChatId: chatId, item_key: pick.item_key, review_mode: DICTATE_CHANNEL,
      prompt_kind: "dictate", evidence_scope: "cell", expected_form_id: pick.item_key,
      sense_id: pick.sense_id, expected_surface: pick.written, shown_stimulus: pick.assetKey,
      stimulus_source: "dictate-tts", stimulus_source_version: STIMULUS_VERSION,
      stimulus_privacy_class: "A", stimulus_hash: sha1(pick.assetKey).slice(0, 16), accepted_alts: [],
      select_reason: pick.select_reason || null,   // P7.2d: провенанс выбора (объяснение читает chal.select_reason)
    };
  }
  return {
    userId, tgUserId, tgChatId: chatId, item_key: pick.item_key, review_mode: REVERSE_CHANNEL,
    prompt_kind: "reverse", evidence_scope: "lexeme", expected_form_id: pick.item_key,
    sense_id: pick.sense_id, shown_stimulus: pick.gloss, stimulus_source: STIMULUS_SOURCE,
    stimulus_source_version: STIMULUS_VERSION, stimulus_privacy_class: "A",
    stimulus_hash: sha1(pick.gloss).slice(0, 16), accepted_alts: [],
    select_reason: pick.select_reason || null,   // P7.2d: провенанс выбора (объяснение читает chal.select_reason)
  };
}

// отправить prompt + сохранить message_id + записать exposure. send упал → отменить challenge
// (не оставлять active без доставленного prompt — crash-window точка 1). Для cloze (класс C) —
// double-consent recheck НЕПОСРЕДСТВЕННО перед send (revoke text-consent → cancel+purge, не слать
// предложение пользователя). ruHint — перевод предложения (передаётся при создании; в БД класс C).
// dictate-доставка (класс A): sendAudio по готовому ассету (URL keyless-раздачи → file_id-кеш) +
// ForceReply. НЕТ text-consent recheck (аудио — TTS словаря, не текст пользователя). assetKey хранится
// в chal.shown_stimulus; URL пересобираем из него. Нет URL (нет base) → fail-closed (не тихо).
async function _deliverDictate(userId, chal, lng) {
  const assetKey = chal.shown_stimulus;
  if (!assetKey) return { served: false, degraded: "NO_ASSET_KEY" };
  const url = audioUrlFor(assetKey);
  if (!url) { await agentChallengeRepo.cancelOpenForUser(userId); return { served: false, degraded: "NO_PUBLIC_BASE" }; }
  // P7.2d: объяснение выбора (класс A, статично по chal.select_reason) — префикс caption. Доступно и на
  // recovery (chal.select_reason персистирован в challenge → переотправка консистентна).
  const caption = format.withExplanation(format.formatDictatePrompt(lng), chal.select_reason, "dictate", lng);
  const res = await api.sendAudio(chal.telegram_chat_id, {
    assetKey, url, caption,
    replyMarkup: { force_reply: true, input_field_placeholder: format.dictatePlaceholder(lng) },
  });
  if (!res || !res.sent) {
    await agentChallengeRepo.cancelOpenForUser(userId);   // не оставлять challenge без доставленного prompt
    return { served: false, degraded: (res && res.degraded) || "SEND_FAILED" };
  }
  if (res.messageId != null) await agentChallengeRepo.setPromptMessageId(chal.challenge_id, res.messageId);
  await agentChallengeRepo.recordExposure(userId, chal.item_key, "review_prompt");
  return { served: true };
}

async function _deliverPrompt(userId, chal, lng) {
  if (chal.prompt_kind === "dictate") return await _deliverDictate(userId, chal, lng);
  let promptText, replyMarkup = { force_reply: true };
  if (chal.prompt_kind === "cloze") {
    // fail-closed перед доставкой класса C (revoke text-consent → cancel+purge, не слать)
    if (!(await learnerArtifactsRepo.hasConsent(userId)) || !(await agentSentenceRepo.hasAgentReadConsent(userId))) {
      await agentChallengeRepo.cancelOpenForUser(userId);
      return { served: false, note: format.refusedText(lng) };
    }
    if (!chal.shown_stimulus) return { served: false, note: format.refusedText(lng) };   // class-C purged
    promptText = format.formatClozePrompt(chal.shown_stimulus, lng);
    replyMarkup.input_field_placeholder = format.clozePlaceholder(lng);
  } else {
    promptText = format.formatReversePrompt(chal.shown_stimulus, lng);
    replyMarkup.input_field_placeholder = format.reversePlaceholder(lng);
  }
  // P7.2d: префикс объяснением выбора (класс A по chal.select_reason; только skill-driven причины —
  // default_* пусты). Консистентно на первой доставке И recovery (select_reason персистирован).
  promptText = format.withExplanation(promptText, chal.select_reason, chal.prompt_kind, lng);
  const res = await api.sendMessage(chal.telegram_chat_id, promptText, { replyMarkup });
  if (!res || !res.sent) {
    await agentChallengeRepo.cancelOpenForUser(userId);   // не оставлять challenge без prompt (+ purge class-C)
    return { served: false, degraded: (res && res.degraded) || "SEND_FAILED" };
  }
  if (res.messageId != null) await agentChallengeRepo.setPromptMessageId(chal.challenge_id, res.messageId);
  await agentChallengeRepo.recordExposure(userId, chal.item_key, "review_prompt");
  return { served: true };
}

// startReview → { served, degraded?, note? }. Отправляет prompt сам (нужен message_id).
async function startReview({ userId, tgUserId, chatId }) {
  const lng = await lang(userId);
  if (!flagOn()) return { served: false, note: format.reviewUnavailable(lng) };
  if (!(await stillAuthorized(userId, tgUserId, chatId))) return { served: false, note: format.refusedText(lng) };

  // уже есть открытый challenge → восстановить/переотправить его prompt (recovery message_id).
  const open = await agentChallengeRepo.getOpenForUser(userId);
  if (open) {
    if (String(open.telegram_chat_id) !== String(chatId)) return { served: false, note: format.reviewBusy(lng) };
    return await _deliverPrompt(userId, open, lng);
  }

  const pick = await selectEligible(userId);
  if (!pick) return { served: false, note: format.reviewNothing(lng) };

  const { challenge } = await agentChallengeRepo.createChallenge(_capsFor(pick, userId, tgUserId, chatId));
  if (!challenge) return { served: false, note: format.reviewNothing(lng) };
  return await _deliverPrompt(userId, challenge, lng);
}

// submitAnswer → { served, note } если это был учебный ответ; null если сообщение НЕ относится к
// review (свободный текст / не reply на prompt) — вызыватель тогда идёт обычным роутером.
async function submitAnswer({ userId, tgUserId, chatId, replyToMessageId, text, updateId }) {
  const chal = await agentChallengeRepo.getActiveForTg(userId, tgUserId, chatId);
  if (!chal) return null;                                  // нет активного challenge → не review
  // reply-binding: ответ засчитывается ТОЛЬКО как reply на КОНКРЕТНЫЙ prompt этого challenge.
  if (chal.telegram_prompt_message_id == null) return null; // prompt ещё не доставлен/не сохранён
  if (String(replyToMessageId || "") !== String(chal.telegram_prompt_message_id)) return null; // «спасибо/ок» мимо

  const lng = await lang(userId);
  // consent revoke между prompt и ответом → отменить challenge, не писать.
  if (!(await stillAuthorized(userId, tgUserId, chatId))) {
    await agentChallengeRepo.cancelOpenForUser(userId);
    return { served: false, note: format.refusedText(lng) };
  }

  const tok = normToken(text);
  if (NOT_NOW.has(tok)) {                                  // «Не сейчас» — закрыть без grade
    await agentChallengeRepo.decline(userId, chal.challenge_id);
    return { served: true, note: format.verdictDeclined(lng) };
  }
  const isDontKnow = DONT_KNOW.has(tok);                   // «Не знаю» — skip (D1-путь на production)

  const attemptId = "tg" + sha1(chal.challenge_id + ":" + (updateId != null ? updateId : replyToMessageId)).slice(0, 40);
  const ctx = { userId, deviceId: null, viaTelegramReview: true };
  const r = await reviewer.record(ctx, {
    item_key: chal.item_key, channel: chal.review_mode,
    answer: isDontKnow ? "" : String(text || ""), skipped: isDontKnow,
    attempt_id: attemptId, challenge_id: chal.challenge_id,
  });

  // expected для verdict «Ожидалось …» (обучающая ОС; не item_key/id). cloze → ПОВЕРХНОСТЬ вхождения,
  // dictate → ПИСЬМЕННАЯ форма (обе = chal.expected_surface), reverse → лемма (displayForItemKey).
  let expected = null;
  if (chal.prompt_kind === "cloze" || chal.prompt_kind === "dictate") { expected = chal.expected_surface || null; }
  else { try { expected = await keyingService.displayForItemKey(chal.item_key); } catch (_) {} }
  return { served: true, note: format.verdictFromResult(r, {
    expected, isDontKnow, isCloze: chal.prompt_kind === "cloze", isDictate: chal.prompt_kind === "dictate", lang: lng }) };
}

// selectEligible экспортирован для CLG-P8.2+ (Mini App home «рекомендация» + будущий
// reviewSessionService): ОДИН детерминированный селектор обслуживает обе Telegram-поверхности
// (норма §20.1/§20.4 P8-recon) — второй селектор запрещён каноном P7.2d. Read-only (пишет
// exposure/challenge НЕ селектор, а delivery-путь startReview).
module.exports = { startReview, submitAnswer, selectEligible };
