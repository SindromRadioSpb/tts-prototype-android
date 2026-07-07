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
const keyingService = require(path.join(__dirname, "..", "..", "db", "keyingService"));
const learnerGraphRepo = require(path.join(__dirname, "..", "..", "db", "learnerGraphRepo"));
const channelLinkRepo = require(path.join(__dirname, "..", "..", "db", "channelLinkRepo"));
const agentRepo = require(path.join(__dirname, "..", "..", "db", "agentRepo"));
const reviewer = require(path.join(__dirname, "..", "reviewer"));
const api = require(path.join(__dirname, "api"));
const format = require(path.join(__dirname, "format"));

const REVERSE_CHANNEL = "reverse:tg";
const STIMULUS_SOURCE = "pealim-infl";
const STIMULUS_VERSION = "v12";

function flagOn() { return process.env.AGENT_REVIEW_WRITE === "1"; }
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }

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

// eligibility (§2 вариант A): первый due-item, который strictSafe И не показан недавно (cooldown).
async function selectEligible(userId) {
  const items = await learnerGraphRepo.getDue(userId, { limit: 50 });
  for (const it of items || []) {
    let g = null;
    try { g = await keyingService.glossForItemKey(it.item_key); } catch (_) { g = null; }
    if (!g || !g.strictSafe) continue;
    if (await agentChallengeRepo.recentlyExposed(userId, it.item_key)) continue;
    return { item_key: it.item_key, gloss: g.gloss, expected: g.expected, sense_id: g.sense_id };
  }
  return null;
}

// отправить prompt + сохранить message_id + записать exposure. send упал → отменить challenge
// (не оставлять active без доставленного prompt — crash-window точка 1).
async function _deliverPrompt(userId, chal, lng) {
  const promptText = format.formatReversePrompt(chal.shown_stimulus, lng);
  const replyMarkup = { force_reply: true, input_field_placeholder: format.reversePlaceholder(lng) };
  const res = await api.sendMessage(chal.telegram_chat_id, promptText, { replyMarkup });
  if (!res || !res.sent) {
    await agentChallengeRepo.cancelOpenForUser(userId);   // не оставлять challenge без prompt
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

  const caps = {
    userId, tgUserId, tgChatId: chatId, item_key: pick.item_key, review_mode: REVERSE_CHANNEL,
    prompt_kind: "reverse", evidence_scope: "lexeme", expected_form_id: pick.item_key,
    sense_id: pick.sense_id, shown_stimulus: pick.gloss, stimulus_source: STIMULUS_SOURCE,
    stimulus_source_version: STIMULUS_VERSION, stimulus_privacy_class: "A",
    stimulus_hash: sha1(pick.gloss).slice(0, 16), accepted_alts: [],
  };
  const { challenge } = await agentChallengeRepo.createChallenge(caps);
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

  // expected display для verdict «Не засчитано. Ожидалось …» (обучающая ОС; не item_key/id).
  let expected = null;
  try { expected = await keyingService.displayForItemKey(chal.item_key); } catch (_) {}
  return { served: true, note: format.verdictFromResult(r, { expected, isDontKnow, lang: lng }) };
}

module.exports = { startReview, submitAnswer };
