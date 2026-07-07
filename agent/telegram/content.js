"use strict";

// agent/telegram/content.js — CLG-P7.1b производитель read-only контента (спека v2 §2 + адъюдикация).
// Импортируется server.js (у него write-path уже есть) — НЕ роутером: транзитивный read-only
// ассерт router.js цел. Производит контент из ГОТОВЫХ контуров (agentRuntime.plan/
// listExplanations/constructsSummary + learnerGraphRepo.getDue) ВНЕ webhook-транзакции.
//
// ДВА consent-барьера (критика wf_72c44361):
//   • /explain гейтит контент ЖИВЫМ agent_read_texts (класс C = предложения пользователя;
//     telegram_delivery НЕ авторизует вынос текста) — off → без sentence_he/text, независимо
//     от успеха purge (fail-closed);
//   • delivery-point recheck ПОСЛЕ produce, перед возвратом частей: active link + свежий
//     telegram_delivery (+ agent_read_texts для /explain) + tg_user/chat совпадают — закрывает
//     окно многосекундного LLM-вызова /plan (revoke во время генерации → части НЕ отдаются).
//
// «read-only» = w.r.t. учебной памяти (review_log нетронут). /plan несёт ТЕ ЖЕ ledger/task
// side-effects, что веб-/plan (консистентно; per-command cap + best-effort-200 у вызывателя).

const path = require("path");
const agentRuntime = require(path.join(__dirname, "..", "runtime"));
const learnerGraphRepo = require(path.join(__dirname, "..", "..", "db", "learnerGraphRepo"));
const keyingService = require(path.join(__dirname, "..", "..", "db", "keyingService"));
const agentSentenceRepo = require(path.join(__dirname, "..", "..", "db", "agentSentenceRepo"));
const agentRepo = require(path.join(__dirname, "..", "..", "db", "agentRepo"));
const channelLinkRepo = require(path.join(__dirname, "..", "..", "db", "channelLinkRepo"));
const agentChallengeRepo = require(path.join(__dirname, "..", "..", "db", "agentChallengeRepo"));
const format = require(path.join(__dirname, "format"));

// авторитетная перепроверка в точке доставки (после produce)
async function stillAuthorized(command, userId, tgUserId, chatId) {
  const link = await channelLinkRepo.getActiveLinkByUser(userId);
  if (!link) return false;
  if (String(link.telegram_user_id) !== String(tgUserId)) return false;
  if (String(link.telegram_chat_id) !== String(chatId)) return false;
  if (!(await channelLinkRepo.telegramConsentActive(null, userId))) return false;
  if (command === "explain" && !(await agentSentenceRepo.hasAgentReadConsent(userId))) return false;
  return true;
}

// serve → { parts: [text...], served }. Вызыватель отправляет parts (или refusal).
async function serve({ command, userId, tgUserId, chatId }) {
  let lang = "ru";
  try { const p = await agentRepo.getProfile(userId); lang = (p && p.language) || "ru"; } catch (_) {}

  let text;
  let dueItems = null;   // P7.2a cooldown: item_keys, реально показанные в /due (для exposure)
  if (command === "plan") {
    const r = await agentRuntime.plan({ userId, deviceId: null });
    text = format.formatPlan(r, lang);
  } else if (command === "due") {
    const items = await learnerGraphRepo.getDue(userId, { limit: 20 });
    for (const it of (items || [])) {
      try { it.lemma = await keyingService.displayForItemKey(it.item_key); } catch (_) { it.lemma = null; }
    }
    dueItems = items || [];
    text = format.formatDue(items, lang);
  } else if (command === "summary") {
    const r = await agentRuntime.constructsSummary({ userId });
    text = format.formatSummary(r, lang);
  } else if (command === "explain") {
    // класс-C гейт: контент только при ЖИВОМ agent_read_texts (fail-closed, не по purge)
    const readAllowed = await agentSentenceRepo.hasAgentReadConsent(userId);
    const r = await agentRuntime.listExplanations({ userId }, { limit: 5 });
    text = format.formatExplain(r, lang, readAllowed);
  } else {
    return { parts: [], served: false };
  }

  // delivery-point recheck: revoke во время produce (в т.ч. секундного LLM /plan) → не отдаём
  if (!(await stillAuthorized(command, userId, tgUserId, chatId))) {
    return { parts: [format.refusedText(lang)], served: false };
  }
  // P7.2a cooldown (§решение-7): /due РЕАЛЬНО показывает HE-форму (=ожидаемый ответ reverse:tg) →
  // пишем exposure ('due_form') для каждой показанной леммы → selectReverseChallenge не выберет
  // её следующие 30 мин (иначе «производство» только что увиденного = ложный production-успех).
  if (command === "due" && dueItems) {
    for (const it of dueItems) {
      if (it && it.item_key) { try { await agentChallengeRepo.recordExposure(userId, it.item_key, "due_form"); } catch (_) {} }
    }
  }
  return { parts: format.splitMessage(text), served: true };
}

module.exports = { serve, stillAuthorized };
