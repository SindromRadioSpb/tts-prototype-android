"use strict";

// agent/telegram/router.js — CLG-P7.1a команда→ответ (TELEGRAM_P7_1_PAIRING_SPEC v2 §5).
// READ-ONLY СТРУКТУРНО: импортирует ТОЛЬКО db/channelLinkRepo (+ read-only learnerGraphRepo в
// P7.1b). НЕ импортирует agent/runtime, agent/tools, reviewer, llm, planner, explainer —
// транзитивный require дотянулся бы до write-path (record_review_answer) и LLM. Гейт обходит
// require-граф от этого файла и падает, если достижимы write/LLM-модули (адъюдикация критики).
// no-free-chat (R17-гейт 2): неизвестная команда → короткая справка, БЕЗ LLM.
//
// handle(db, ctx) выполняется ВНУТРИ webhook-транзакции (channelLinkRepo.processUpdateTxn):
// эффекты (redeem/confirm/unlink) и dedup атомарны; sendMessage — снаружи, вызывателем.
// Возвращает { chatId, text, userId?, command, status, errorCode? } — chatId берётся из
// ВХОДЯЩЕГО private-чата (webhook уже отфильтровал chat.type==='private'); для активной связки
// доставка на сохранённый chat совпадает by construction (тот же tg-пользователь).

const CL = require("../../db/channelLinkRepo");

// первое слово, lowercase, без '@botname', аргумент отдельно (токен НЕ логируется)
function parse(text) {
  const t = String(text || "").trim();
  const sp = t.indexOf(" ");
  let cmd = (sp >= 0 ? t.slice(0, sp) : t);
  const arg = sp >= 0 ? t.slice(sp + 1).trim() : "";
  const at = cmd.indexOf("@");
  if (at >= 0) cmd = cmd.slice(0, at);
  return { verb: cmd.toLowerCase(), arg };
}

const HELP =
  "Команды LinguistPro:\n" +
  "/plan — план на сегодня\n" +
  "/due — что пора повторить\n" +
  "/review — тренировка: припомни слово\n" +
  "/summary — над чем работаешь\n" +
  "/explain — последние объяснения\n" +
  "/status — связан ли аккаунт\n" +
  "/unlink — отключить Telegram\n" +
  "/help — эта справка";

const CONTENT_CMDS = { "/plan": "plan", "/due": "due", "/summary": "summary", "/explain": "explain" };

// Тест-seam (ТОЛЬКО при AGENT_TG_ALLOW_FAULT=1, гейт): первый вызов '/__faultonce__' бросает
// (проверка «сбой эффекта → ROLLBACK включая dedup → ретрай переигрывает»); последующие — ok.
let _faultConsumed = false;

async function handle(db, ctx) {
  const { tgUserId, tgChatId, text, updateId } = ctx;
  const { verb, arg } = parse(text);
  if (verb === "/__faultonce__" && process.env.AGENT_TG_ALLOW_FAULT === "1") {
    if (!_faultConsumed) { _faultConsumed = true; throw new Error("injected fault (test seam)"); }
    // второй раз: обычная справка (dedup первого прохода должен был откатиться)
    await CL.logBotAction(db, { userId: null, updateId, chatId: tgChatId, command: "faultonce", status: "ok" });
    return { chatId: tgChatId, text: "ok", command: "faultonce", status: "ok" };
  }
  const reply = (textOut, extra) => Object.assign({ chatId: tgChatId, text: textOut, command: (verb || "").replace(/^\//, "") }, extra || {});

  let out;
  switch (verb) {
    case "/start":
    case "/link": {
      if (!arg) {
        out = reply("Привет! Я бот LinguistPro. Чтобы связать аккаунт, нажмите «Подключить Telegram» на сайте и откройте выданную ссылку.", { status: "ignored" });
        break;
      }
      const r = await CL.redeemToPending(db, arg, tgUserId, tgChatId);
      if (!r.ok) { out = reply("Ссылка недействительна или устарела. Сгенерируйте новую на сайте.", { status: "rejected", errorCode: r.code }); break; }
      const name = await CL.displayNameForUser(db, r.userId);
      out = reply(`Запрос на привязку к «${name}». Подтвердите: отправьте /confirm, чтобы связать этот Telegram, или /cancel для отмены.`,
        { userId: r.userId, status: "pending" });
      break;
    }
    case "/confirm": {
      const r = await CL.confirmPending(db, tgUserId, CL.TELEGRAM_CONSENT_VERSION);
      if (!r.ok) {
        const msg = r.code === "NO_PENDING" ? "Нет ожидающего запроса. Начните привязку на сайте."
          : r.code === "TG_ALREADY_LINKED" ? "Этот Telegram уже связан с аккаунтом. Сначала /unlink."
          : r.code === "USER_ALREADY_LINKED" ? "К аккаунту уже привязан другой Telegram. Отключите его в настройках сайта."
          : "Не удалось подтвердить.";
        out = reply(msg, { status: "rejected", errorCode: r.code });
        break;
      }
      out = reply("Готово — Telegram связан с вашим аккаунтом LinguistPro. Отключить в любой момент: /unlink.", { userId: r.userId, status: "ok" });
      break;
    }
    case "/cancel": {
      await CL.cancelPending(db, tgUserId);
      out = reply("Привязка отменена.", { status: "ok" });
      break;
    }
    case "/unlink": {
      const r = await CL.unlinkByTg(db, tgUserId);
      out = reply(r.revoked ? "Telegram отключён от аккаунта LinguistPro." : "Активной связки нет.", { status: "unlinked" });
      break;
    }
    case "/status": {
      const link = await CL.activeLinkByTgTxn(db, tgUserId);
      if (!link) { out = reply("Не связано. Нажмите «Подключить Telegram» на сайте.", { status: "ok" }); break; }
      const name = await CL.displayNameForUser(db, link.user_id);
      out = reply(`Связано с «${name}». Согласие на доставку: активно (${link.consent_version || "tg-v1"}).`, { userId: link.user_id, status: "ok" });
      break;
    }
    case "/help": {
      out = reply(HELP, { status: "ok" });
      break;
    }
    // P7.2a /review — гейт link+consent в txn → дескриптор review-start (produce вне txn: eligibility
    // читает датасет/getDue, sendMessage внешний; НЕ импортим reviewer/agentChallengeRepo — write-path).
    case "/review": {
      const link = await CL.activeLinkByTgTxn(db, tgUserId);
      if (!link) { out = reply("Не связано. Подключите Telegram на сайте.", { status: "rejected", errorCode: "NOT_LINKED" }); break; }
      if (!(await CL.telegramConsentActive(db, link.user_id))) { out = reply("Канал отключён. Подключите Telegram заново на сайте.", { status: "rejected", errorCode: "CONSENT_OFF" }); break; }
      out = { kind: "review-start", command: "review", userId: link.user_id, tgUserId, chatId: tgChatId, status: "ok" };
      break;
    }
    default: {
      // P7.1b content-команды: ГЕЙТ в txn (link + telegram_delivery consent), затем ДЕФЕР —
      // производство контента вне txn (server.js), т.к. /plan зовёт LLM (секунды) + пишет
      // ledger/task через СВОЙ txnLock (внутри этой txn = дедлок). Роутер контент НЕ производит
      // → transitive-read-only цел (не импортит runtime/tools/llm).
      if (CONTENT_CMDS[verb]) {
        const link = await CL.activeLinkByTgTxn(db, tgUserId);
        if (!link) { out = reply("Не связано. Подключите Telegram на сайте — «Подключить Telegram» в доме наставника.", { status: "rejected", errorCode: "NOT_LINKED" }); break; }
        if (!(await CL.telegramConsentActive(db, link.user_id))) { out = reply("Канал отключён. Подключите Telegram заново на сайте.", { status: "rejected", errorCode: "CONSENT_OFF" }); break; }
        // гейт пройден → дескриптор для server.js (produce вне txn); logBotAction ниже (in-txn)
        out = { kind: "content", command: CONTENT_CMDS[verb], userId: link.user_id, tgUserId, chatId: tgChatId, status: "ok" };
        break;
      }
      // P7.2a: сообщение-ОТВЕТ (reply на prompt) → дескриптор review-answer. Challenge-lookup/
      // reply-binding — в server.js phase-2 (submitAnswer), НЕ здесь (agent_challenges = write-path,
      // роутер transitive-read-only). Privacy: command='review-answer' — ФИКС-метка, сырой ответ
      // (verb=первое слово текста) в bot_action_log НЕ пишется.
      if (ctx.isReply) {
        const link = await CL.activeLinkByTgTxn(db, tgUserId);
        if (link && (await CL.telegramConsentActive(db, link.user_id))) {
          out = { kind: "review-answer", command: "review-answer", userId: link.user_id, tgUserId, chatId: tgChatId,
                  replyToMessageId: ctx.replyToMessageId, updateId, status: "ok" };
          break;
        }
        // reply без связки/согласия → не review; лог фикс-меткой (не сырой текст)
        out = { chatId: tgChatId, text: HELP, command: "free-text", status: "ignored" };
        break;
      }
      // неизвестное НЕ-reply → справка, БЕЗ LLM (no-free-chat); лог фикс-меткой 'free-text'
      out = { chatId: tgChatId, text: HELP, command: "free-text", status: "ignored" };
    }
  }

  // журнал в ТОЙ ЖЕ транзакции (verb-only command; сырой токен-arg сюда не попадает)
  await CL.logBotAction(db, {
    userId: out.userId || null, updateId, chatId: tgChatId,
    command: out.command, status: out.status, errorCode: out.errorCode,
  });
  return out;
}

module.exports = { handle, parse };
