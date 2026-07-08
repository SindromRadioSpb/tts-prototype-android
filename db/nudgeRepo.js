"use strict";

// db/nudgeRepo.js — CLG-P7.3a проактивный Telegram-нудж (sweep). За флагом AGENT_NUDGE_ENABLED (деф.
// OFF). Детерминированная политика (§2 RECON): для каждого active-link юзера — prefs(fail-closed) →
// authorizeForSweep(link+consent+chatId) → local-окно+quiet (tz, DST-safe) → честная причина (due>0) →
// claim-BEFORE-send в ЕДИНЫЙ кросс-канальный ledger → re-check consent → send → verb-only лог.
// Инварианты: single-flight (setInterval+admin-force не входят одновременно) · per-user try/catch
// (битый профиль → skip, не падение всего sweep) · класс A (нудж без слов/форм/ответов/id) · honest
// count == due-кольцу · at-most-once (claim persists при send-fail — потерянный нудж честнее дубля).
// ЕДИНСТВЕННЫЙ писатель nudge_ledger (engaged/ignored = derived из review_log в P7.3c).

const { getDb } = require("./sqlite");
const LT = require("./localtime");
const prefsRepo = require("./notificationPrefsRepo");
const ledgerRepo = require("./nudgeLedgerRepo");
const channelLinkRepo = require("./channelLinkRepo");
const learnerGraphRepo = require("./learnerGraphRepo");
const agentRepo = require("./agentRepo");
const api = require("../agent/telegram/api");
const format = require("../agent/telegram/format");

function dbAll(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || [])))); }

function flagOn() { return process.env.AGENT_NUDGE_ENABLED === "1"; }

let _sweeping = false;   // single-flight guard (in-process)

async function lang(userId) {
  try { const p = await agentRepo.getProfile(userId); return (p && p.language) || "ru"; } catch (_) { return "ru"; }
}

// sweep-специфичная авторизация: НЕТ входящего update → identity-cross-check тавтологичен; проверяем
// link active + telegram_delivery consent (tg-v1) + ненулевой chatId. chatId IS NULL → skip (не слать
// в null). Свежий (вне txn) снимок — авторитетная перепроверка в точке доставки (критика R14).
async function authorizeForSweep(userId) {
  const link = await channelLinkRepo.getActiveLinkByUser(userId);
  if (!link || link.telegram_chat_id == null) return { ok: false };
  if (!(await channelLinkRepo.telegramConsentActive(null, userId))) return { ok: false };
  return { ok: true, chatId: link.telegram_chat_id };
}

// nowMs инъектируем (гейт/детерминизм). force игнорирует флаг (admin/гейт), НЕ игнорирует consent/
// окно/бюджет (это не «force-spam», а «force-tick»).
async function runNudgeSweep({ nowMs, force } = {}) {
  if (!flagOn() && !force) return { ok: true, skipped: "disabled_flag" };
  if (_sweeping) return { ok: true, skipped: "in_flight" };
  _sweeping = true;
  const agg = { examined: 0, sent: 0, disabled: 0, no_consent: 0, outside_window: 0, budget: 0, nothing_due: 0, errors: 0 };
  try {
    const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
    const now = Number(nowMs) || Date.now();
    const links = await dbAll(db,
      `SELECT user_id FROM channel_links WHERE channel='telegram' AND status='active'`);
    for (const link of links) {
      agg.examined++;
      const userId = link.user_id;
      try {
        // 1) prefs — FAIL-CLOSED (DB-ошибка → пробрасывается → skip этого юзера как error, не send)
        let prefs;
        try { prefs = await prefsRepo.getPrefs(userId); }
        catch (_) { agg.errors++; continue; }
        if (!prefs.enabled || !prefs.telegram_enabled) { agg.disabled++; continue; }

        // 2) authorize (link active + consent + chatId)
        const auth = await authorizeForSweep(userId);
        if (!auth.ok) { agg.no_consent++; continue; }

        // 3) local-окно + quiet (tz DST-safe, окно [start,end))
        const parts = LT.localParts(prefs.timezone, now);
        if (!LT.windowOpen(parts.hour, prefs.window, prefs.quiet_start_local, prefs.quiet_end_local)) { agg.outside_window++; continue; }

        // 4) дешёвый короткозамыкатель: день уже занят (push/бот)? → skip ДО дорогого getDue (R16)
        if (await ledgerRepo.claimedToday(userId, parts.day)) { agg.budget++; continue; }

        // 5) честная причина: due>0 (honest count == due-кольцо)
        const due = await learnerGraphRepo.getDue(userId, { nowMs: now, limit: 500 });
        if (!due.length) { agg.nothing_due++; continue; }

        // 6) re-check consent НЕПОСРЕДСТВЕННО перед claim+send (revoke mid-sweep → не слать И НЕ занимать
        //    день, иначе аборт сжёг бы кросс-канальный бюджет и push тоже молчал бы — критика wf_858259da).
        const auth2 = await authorizeForSweep(userId);
        if (!auth2.ok) { agg.no_consent++; continue; }

        // 7) claim-BEFORE-send в ЕДИНЫЙ кросс-канальный ledger по local_day (атомарный арбитр). Send-fail
        //    ПОСЛЕ claim → claim остаётся (at-most-once: потерянный нудж честнее дубля; слово due завтра).
        const claim = await ledgerRepo.claimDay(userId, parts.day, "telegram", "DUE_READY");
        if (!claim.claimed) { agg.budget++; continue; }
        const lng = await lang(userId);
        const res = await api.sendMessage(auth2.chatId, format.formatDueNudge(due.length, lng));
        if (res && res.sent) {
          agg.sent++;
          try { await channelLinkRepo.logBotAction(db, { userId, chatId: auth2.chatId, command: "nudge", status: "ok" }); } catch (_) {}
        } else {
          agg.errors++;   // send-fail: claim остаётся (at-most-once, не дубль)
          try { await channelLinkRepo.logBotAction(db, { userId, chatId: auth2.chatId, command: "nudge", status: "error", errorCode: (res && res.degraded) || "SEND_FAILED" }); } catch (_) {}
        }
      } catch (_) { agg.errors++; }   // per-user изоляция (silent_batch_partial_failure)
    }
    return { ok: true, ...agg };
  } finally { _sweeping = false; }
}

module.exports = { runNudgeSweep, authorizeForSweep };
