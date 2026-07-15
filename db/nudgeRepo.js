"use strict";

// db/nudgeRepo.js — CLG-P7.3a/c проактивный Telegram-нудж (sweep). За флагом AGENT_NUDGE_ENABLED.
// Детерминированная политика: prefs(fail-closed) → authorize(link+consent+chatId) → muted? → local-
// окно+quiet → claimedToday(общий бюджет) → BACKOFF(nudge_state) → due>0(honest) → auth2 → claim-BEFORE-
// send → send → верб-лог + persist nudge_state.
//
// P7.3c adaptive backoff (критика wf_e9b7e615): backoff-состояние в ОТДЕЛЬНОЙ nudge_state (sweep-
// единственный писатель, мутируется каждый tick — reset не теряется), НЕ в общем кросс-канальном ledger.
// engagement CROSS-SURFACE (review_log+learner_events по СЕРВЕРНОМУ ingested_at, не клиентскому reviewed_at
// → нет clock-skew ложного ignore; чтение в Зале СЧИТАЕТСЯ активностью) ИЛИ /mute//notoday-interaction.
// Лестница {1,2,4,7} дней (тюнинг-константа). engaged → сброс к 0 (ежедневно). RETURN_AFTER_GAP (copy-
// swap, guilt-free, БЕЗ count) если тишина ≥7дн. backoff = TELEGRAM-only (push остаётся ежедневным).
// Инварианты: single-flight · per-user try/catch · at-most-once · класс A · backoff ТОЛЬКО удлиняет.

const { getDb } = require("./sqlite");
const LT = require("./localtime");
const prefsRepo = require("./notificationPrefsRepo");
const ledgerRepo = require("./nudgeLedgerRepo");
const stateRepo = require("./nudgeStateRepo");
const channelLinkRepo = require("./channelLinkRepo");
const learnerGraphRepo = require("./learnerGraphRepo");
const learnerLogRepo = require("./learnerLogRepo");
const agentRepo = require("./agentRepo");
const api = require("../agent/telegram/api");
const format = require("../agent/telegram/format");

function dbAll(db, sql, p = []) { return new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || [])))); }

function flagOn() { return process.env.AGENT_NUDGE_ENABLED === "1"; }

const LADDER = [1, 2, 4, 7];              // delay-дни между нуджами по min(consecutive_ignored, 3)
const RETURN_GAP_MS = 7 * 24 * 3600 * 1000;   // ≥7 дней тишины → RETURN_AFTER_GAP (guilt-free, без count)

let _sweeping = false;                    // single-flight guard (in-process)

async function lang(userId) {
  try { const p = await agentRepo.getProfile(userId); return (p && p.language) || "ru"; } catch (_) { return "ru"; }
}

async function authorizeForSweep(userId) {
  const link = await channelLinkRepo.getActiveLinkByUser(userId);
  if (!link || link.telegram_chat_id == null) return { ok: false };
  if (!(await channelLinkRepo.telegramConsentActive(null, userId))) return { ok: false };
  return { ok: true, chatId: link.telegram_chat_id };
}

// local-дней между since(ISO) и now(ms) в зоне tz (для backoff-задержки — календарные local-дни).
function localDaysSince(tz, sinceIso, nowMs) {
  const a = Date.parse(LT.localDay(tz, Date.parse(sinceIso)));
  const b = Date.parse(LT.localDay(tz, nowMs));
  return Math.round((b - a) / 86400000);
}

// N1 policy helper: resolves Telegram-only gates AFTER the coordinator has
// applied shared enabled/mute/window/day gates. It does not claim or send.
async function evaluateTelegramEligibility(userId, prefs, { nowMs, force } = {}) {
  if (!flagOn() && !force) return { eligible: false, skip: "disabled_flag" };
  if (!prefs || !prefs.telegram_enabled) return { eligible: false, skip: "disabled" };
  const auth = await authorizeForSweep(userId);
  if (!auth.ok) return { eligible: false, skip: "no_consent" };
  const now = Number(nowMs) || Date.now();
  const nowIso = new Date(now).toISOString();
  const state = await stateRepo.getState(userId);
  const since = state.last_nudge_at;
  let engaged = false;
  if (since) {
    engaged = await learnerLogRepo.engagedSince(userId, since);
    if (engaged && state.consecutive_ignored > 0) {
      await stateRepo.upsertState(userId, { consecutive_ignored: 0, last_engaged_at: nowIso });
      state.consecutive_ignored = 0;
    }
  }
  if (state.consecutive_ignored >= 1) {
    const delay = LADDER[Math.min(state.consecutive_ignored, LADDER.length - 1)];
    if (localDaysSince(prefs.timezone, since, now) < delay) {
      return { eligible: false, skip: "backoff", auth, state, since, engaged };
    }
  }
  return { eligible: true, auth, state, since, engaged };
}

// N1 prepares deterministic reason/copy and performs the action-time consent
// recheck BEFORE the shared claim. It still has no claim authority.
async function prepareTelegramDelivery(userId, due, eligibility, { nowMs } = {}) {
  const now = Number(nowMs) || Date.now();
  const rows = Array.isArray(due) ? due : [];
  if (!rows.length || !eligibility || !eligibility.eligible) return { ok: false, skip: "not_eligible" };
  const recentlyActive = await learnerLogRepo.engagedSince(userId, new Date(now - RETURN_GAP_MS).toISOString());
  let reason = "DUE_READY";
  if (!recentlyActive) reason = "RETURN_AFTER_GAP";
  else {
    try {
      const reviewSession = require("../agent/reviewSession");
      if (await reviewSession.firstFlagshipDictate(userId, { nowMs: now })) reason = "SKILL_GAP_AVAILABLE";
    } catch (_) {}
  }
  const auth = await authorizeForSweep(userId);
  if (!auth.ok) return { ok: false, skip: "no_consent" };
  const lng = await lang(userId);
  const text = reason === "RETURN_AFTER_GAP" ? format.formatReturnNudge(lng)
    : reason === "SKILL_GAP_AVAILABLE" ? format.formatSkillGapNudge(rows.length, lng)
    : format.formatDueNudge(rows.length, lng);
  return { ok: true, reason, text, auth, state: eligibility.state, since: eligibility.since,
    engaged: eligibility.engaged };
}

// N1 Telegram transport adapter: an existing claim is assumed. It may send and
// update Telegram-only backoff/action diagnostics, but cannot select or claim.
async function deliverPreparedTelegram(userId, prepared, { nowMs } = {}) {
  if (!prepared || !prepared.ok) return { delivered: false, deliveryCount: 0, failureCode: "NOT_PREPARED" };
  const now = Number(nowMs) || Date.now();
  const nowIso = new Date(now).toISOString();
  const result = await api.sendMessage(prepared.auth.chatId, prepared.text);
  if (result && result.sent) {
    const state = prepared.state || { consecutive_ignored: 0, last_engaged_at: null };
    const newCount = prepared.engaged ? 0 : (prepared.since ? state.consecutive_ignored + 1 : 0);
    await stateRepo.upsertState(userId, { consecutive_ignored: newCount, last_nudge_at: nowIso,
      last_engaged_at: prepared.engaged ? nowIso : state.last_engaged_at });
    try { await channelLinkRepo.logBotAction(getDb(), { userId, chatId: prepared.auth.chatId,
      command: "nudge", status: "ok" }); } catch (_) {}
    return { delivered: true, deliveryCount: 1, failureCode: null };
  }
  const failureCode = (result && result.degraded) || "SEND_FAILED";
  try { await channelLinkRepo.logBotAction(getDb(), { userId, chatId: prepared.auth.chatId,
    command: "nudge", status: "error", errorCode: failureCode }); } catch (_) {}
  return { delivered: false, deliveryCount: 0, failureCode };
}

async function runNudgeSweep({ nowMs, force } = {}) {
  if (!flagOn() && !force) return { ok: true, skipped: "disabled_flag" };
  if (_sweeping) return { ok: true, skipped: "in_flight" };
  _sweeping = true;
  const agg = { examined: 0, sent: 0, disabled: 0, no_consent: 0, muted: 0, outside_window: 0,
                budget: 0, backoff: 0, nothing_due: 0, errors: 0 };
  try {
    const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
    const now = Number(nowMs) || Date.now();
    const nowIso = new Date(now).toISOString();
    const links = await dbAll(db, `SELECT user_id FROM channel_links WHERE channel='telegram' AND status='active'`);
    for (const link of links) {
      agg.examined++;
      const userId = link.user_id;
      try {
        // 1) prefs — FAIL-CLOSED
        let prefs;
        try { prefs = await prefsRepo.getPrefs(userId); } catch (_) { agg.errors++; continue; }
        if (!prefs.enabled || !prefs.telegram_enabled) { agg.disabled++; continue; }

        // 2) authorize
        const auth = await authorizeForSweep(userId);
        if (!auth.ok) { agg.no_consent++; continue; }

        // 3) muted (/notoday//mute → muted_until в будущем)
        if (prefs.muted_until && nowIso < prefs.muted_until) { agg.muted++; continue; }

        // 4) local-окно + quiet
        const parts = LT.localParts(prefs.timezone, now);
        if (!LT.windowOpen(parts.hour, prefs.window, prefs.quiet_start_local, prefs.quiet_end_local)) { agg.outside_window++; continue; }

        // 5) день уже занят (push/telegram)? — дешёвый short-circuit ДО backoff/getDue
        if (await ledgerRepo.claimedToday(userId, parts.day)) { agg.budget++; continue; }

        // 6) Telegram-only consent/backoff policy (shared with N1 coordinator).
        const eligibility = await evaluateTelegramEligibility(userId, prefs, { nowMs: now, force: true });
        if (!eligibility.eligible) {
          if (eligibility.skip === "backoff") agg.backoff++;
          else if (eligibility.skip === "no_consent") agg.no_consent++;
          else agg.disabled++;
          continue;
        }

        // 7) честная причина: due>0
        const due = await learnerGraphRepo.getDue(userId, { nowMs: now, limit: 500 });
        if (!due.length) { agg.nothing_due++; continue; }

        // 8–9) deterministic reason/copy + action-time consent recheck.
        const prepared = await prepareTelegramDelivery(userId, due, eligibility, { nowMs: now });
        if (!prepared.ok) { agg.no_consent++; continue; }

        // 10) claim-BEFORE-send (общий кросс-канальный ledger; reason == факту)
        const claim = await ledgerRepo.claimDay(userId, parts.day, "telegram", prepared.reason);
        if (!claim.claimed) { agg.budget++; continue; }

        // 11) adapter send; failure retains claim (at-most-once).
        const delivered = await deliverPreparedTelegram(userId, prepared, { nowMs: now });
        if (delivered.delivered) agg.sent++;
        else agg.errors++;
      } catch (_) { agg.errors++; }   // per-user изоляция
    }
    return { ok: true, ...agg };
  } finally { _sweeping = false; }
}

module.exports = { runNudgeSweep, authorizeForSweep, evaluateTelegramEligibility,
  prepareTelegramDelivery, deliverPreparedTelegram, flagOn };
