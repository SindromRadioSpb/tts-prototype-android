"use strict";

// agent/telegram/api.js — CLG-P7.1a outbound Telegram (TELEGRAM_P7_1_PAIRING_SPEC v2 §5).
// ЕДИНСТВЕННЫЙ внешний вызов канала: sendMessage(chat_id, text) через fetch к TELEGRAM_API_BASE.
// TELEGRAM_API_BASE (деф. https://api.telegram.org) — гейт указывает на локальный stub (мок
// sendMessage: Module-require-шим не ловит глобальный fetch, поэтому шов = env base). Пишет
// call-log (AGENT_TG_CALLLOG: только chat_id-хэш + статус, НЕ текст) — гейт наблюдает вызовы,
// иначе ассерт «sendMessage 0/1» тавтологичен (критика харнесса).

const fs = require("fs");
const crypto = require("crypto");

function apiBase() { return String(process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, ""); }
function botToken() { return process.env.TELEGRAM_BOT_TOKEN || ""; }

function recordCall(chatId, status) {
  const p = process.env.AGENT_TG_CALLLOG;
  if (!p) return;
  try {
    const hash = crypto.createHash("sha256").update(String(chatId)).digest("hex").slice(0, 12);
    fs.appendFileSync(p, JSON.stringify({ chat: hash, status }) + "\n");
  } catch (_) {}
}

// Возвращает { sent, degraded?, status?, messageId? } — токена нет → честный BOT_TOKEN_MISSING.
async function sendMessage(chatId, text, opts) {
  const token = botToken();
  if (!token) { recordCall(chatId, "no_token"); return { sent: false, degraded: "BOT_TOKEN_MISSING" }; }
  if (chatId == null || !String(text || "").trim()) { recordCall(chatId, "empty"); return { sent: false, degraded: "EMPTY" }; }
  // opts.replyMarkup — Telegram reply_markup (ReplyKeyboardMarkup/ForceReply/remove); опционально.
  // Возвращаем result.message_id — БЕЗ него нельзя доказать reply-binding ответа к конкретному prompt.
  const body = { chat_id: chatId, text: String(text).slice(0, 4096), disable_web_page_preview: true };
  if (opts && opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  try {
    const res = await fetch(`${apiBase()}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ok = res.status === 200;
    recordCall(chatId, ok ? "ok" : "http_" + res.status);
    let messageId = null;
    if (ok) { try { const j = await res.json(); messageId = j && j.result && j.result.message_id; } catch (_) {} }
    return { sent: ok, status: res.status, messageId: messageId != null ? messageId : null };
  } catch (e) {
    recordCall(chatId, "error");
    return { sent: false, degraded: "SEND_FAILED" };
  }
}

module.exports = { sendMessage, apiBase, botToken };
