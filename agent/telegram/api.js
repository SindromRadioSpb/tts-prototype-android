"use strict";

// agent/telegram/api.js — CLG-P7.1a outbound Telegram (TELEGRAM_P7_1_PAIRING_SPEC v2 §5).
// ЕДИНСТВЕННЫЙ внешний вызов канала: sendMessage(chat_id, text) через fetch к TELEGRAM_API_BASE.
// TELEGRAM_API_BASE (деф. https://api.telegram.org) — гейт указывает на локальный stub (мок
// sendMessage: Module-require-шим не ловит глобальный fetch, поэтому шов = env base). Пишет
// call-log (AGENT_TG_CALLLOG: только chat_id-хэш + статус, НЕ текст) — гейт наблюдает вызовы,
// иначе ассерт «sendMessage 0/1» тавтологичен (критика харнесса).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fileCacheRepo = require(path.join(__dirname, "..", "..", "db", "telegramFileCacheRepo"));

function apiBase() { return String(process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, ""); }
function botToken() { return process.env.TELEGRAM_BOT_TOKEN || ""; }
// bot_id = префикс токена до ':' (Telegram-контракт <bot_id>:<hash>) — ключ file_id-кеша (класс A).
function botIdOf(token) { return String(token || "").split(":")[0] || "unknown"; }

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

// ── P7.2c dictate:tg — sendAudio (аудио-диктант) ───────────────────────────────────────────────
// Внутренний POST sendAudio → { sent, messageId?, fileId?, status?, invalidFileId? }. audio = URL
// (Telegram фетчит keyless-раздачу) ИЛИ file_id (reuse). invalidFileId = Telegram 400 «wrong file
// identifier»/«expired»/«reuse» → вызыватель инвалидирует кеш + retry через URL.
async function _postAudio(token, chatId, { audio, caption, replyMarkup }) {
  const body = { chat_id: chatId, audio };
  if (caption) body.caption = String(caption).slice(0, 1024);
  if (replyMarkup) body.reply_markup = replyMarkup;
  try {
    const res = await fetch(`${apiBase()}/bot${token}/sendAudio`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.status === 200) {
      let messageId = null, fileId = null;
      try { const j = await res.json(); messageId = (j && j.result && j.result.message_id) != null ? j.result.message_id : null;
        fileId = (j && j.result && j.result.audio && j.result.audio.file_id) || null; } catch (_) {}
      return { sent: true, messageId, fileId };
    }
    let desc = "";
    try { const j = await res.json(); desc = String((j && j.description) || ""); } catch (_) {}
    // ТОЛЬКО file-identifier-специфичные фразы (критика wf_596df7f6): бле «not found» ловил бы «chat
    // not found» (per-chat ошибка) → снёс бы валидный bot-общий кеш-ряд. Оставляем только про file_id.
    const invalidFileId = res.status === 400 && /file[_ ]?id|file identifier|wrong file|reuse|expired|temporarily unavailable/i.test(desc);
    return { sent: false, status: res.status, invalidFileId };
  } catch (_) {
    return { sent: false, status: null };
  }
}

// sendAudio(chatId, { assetKey, url?, fileId?, caption?, replyMarkup? }) → { sent, messageId?, fileId? }.
// file_id-кеш hit (по assetKey+botId) → sendAudio с file_id (без загрузки). Miss/битый → sendAudio с
// URL (Telegram фетчит keyless-раздачу) → кешируем result.audio.file_id. Битый file_id → invalidate +
// retry через URL. Возврат fileId — для наблюдаемости; messageId — для reply-binding.
async function sendAudio(chatId, opts) {
  const o = opts || {};
  const token = botToken();
  if (!token) { recordCall(chatId, "no_token"); return { sent: false, degraded: "BOT_TOKEN_MISSING" }; }
  if (chatId == null) { recordCall(chatId, "empty"); return { sent: false, degraded: "EMPTY" }; }
  const botId = botIdOf(token);
  const assetKey = o.assetKey ? String(o.assetKey) : null;
  const caption = o.caption, replyMarkup = o.replyMarkup;

  // 1) file_id (явный или из кеша) → отправка без загрузки
  let fileId = o.fileId || null;
  if (!fileId && assetKey) { try { fileId = await fileCacheRepo.get(assetKey, botId); } catch (_) {} }
  if (fileId) {
    const r = await _postAudio(token, chatId, { audio: fileId, caption, replyMarkup });
    if (r.sent) { recordCall(chatId, "ok_fileid"); return { sent: true, messageId: r.messageId, fileId: r.fileId || fileId }; }
    if (r.invalidFileId && assetKey) { try { await fileCacheRepo.invalidate(assetKey, botId); } catch (_) {} }
    // иначе (не invalid, просто сбой) — падаем на URL как фолбэк
  }

  // 2) URL (Telegram фетчит keyless-раздачу) → закешировать выданный file_id
  if (!o.url) { recordCall(chatId, "no_url"); return { sent: false, degraded: "NO_AUDIO_SOURCE" }; }
  const r = await _postAudio(token, chatId, { audio: String(o.url), caption, replyMarkup });
  if (!r.sent) { recordCall(chatId, r.status ? "http_" + r.status : "error"); return { sent: false, degraded: "SEND_FAILED", status: r.status }; }
  recordCall(chatId, "ok_url");
  if (assetKey && r.fileId) { try { await fileCacheRepo.put(assetKey, botId, r.fileId); } catch (_) {} }
  return { sent: true, messageId: r.messageId, fileId: r.fileId || null };
}

module.exports = { sendMessage, sendAudio, apiBase, botToken };
