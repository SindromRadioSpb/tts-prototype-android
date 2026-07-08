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

        // 6) BACKOFF (nudge_state; sweep-единственный писатель, мутируется каждый tick). engagement =
        //    ТОЛЬКО РЕАЛЬНАЯ учёба (review_log/learner_events cross-surface по ingested_at). /mute//notoday
        //    НЕ считаются engagement (критика diff wf_7218a4f4 MAJOR: иначе mute СБРАСЫВАЛ бы backoff →
        //    ЧАЩЕ после mute; backoff ТОЛЬКО удлиняет). engaged → сброс к 0 (persist каждый tick).
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
          if (localDaysSince(prefs.timezone, since, now) < delay) { agg.backoff++; continue; }
        }

        // 7) честная причина: due>0
        const due = await learnerGraphRepo.getDue(userId, { nowMs: now, limit: 500 });
        if (!due.length) { agg.nothing_due++; continue; }

        // 8) reason (RETURN_AFTER_GAP при no-activity ≥7д — copy-swap, guilt-free, БЕЗ count). Вычисляем
        //    ДО claim → ledger.reason == реально отправленному (критика: hardcoded DUE_READY мис-атрибутил
        //    RETURN-нуджи). «Долгое отсутствие» = НЕТ активности за 7д ИЗ review_log/learner_events (honest;
        //    активный owner → DUE_READY count).
        const recentlyActive = await learnerLogRepo.engagedSince(userId, new Date(now - RETURN_GAP_MS).toISOString());
        const reason = recentlyActive ? "DUE_READY" : "RETURN_AFTER_GAP";

        // 9) re-check consent перед claim+send
        const auth2 = await authorizeForSweep(userId);
        if (!auth2.ok) { agg.no_consent++; continue; }

        // 10) claim-BEFORE-send (общий кросс-канальный ledger; reason == факту)
        const claim = await ledgerRepo.claimDay(userId, parts.day, "telegram", reason);
        if (!claim.claimed) { agg.budget++; continue; }
        const newCount = engaged ? 0 : (since ? state.consecutive_ignored + 1 : 0);

        // 11) send (класс A: RETURN_AFTER_GAP без count/guilt; DUE_READY honest count)
        const lng = await lang(userId);
        const text = reason === "RETURN_AFTER_GAP" ? format.formatReturnNudge(lng) : format.formatDueNudge(due.length, lng);
        const res = await api.sendMessage(auth2.chatId, text);
        if (res && res.sent) {
          agg.sent++;
          // last_engaged_at: НЕ выдумываем «engaged now» на non-engaged send (критика: ложный timestamp
          // подавил бы будущий RETURN-путь) — сохраняем прежнее (null остаётся null через COALESCE).
          await stateRepo.upsertState(userId, { consecutive_ignored: newCount, last_nudge_at: nowIso, last_engaged_at: engaged ? nowIso : state.last_engaged_at });
          try { await channelLinkRepo.logBotAction(db, { userId, chatId: auth2.chatId, command: "nudge", status: "ok" }); } catch (_) {}
        } else {
          agg.errors++;   // send-fail: claim остаётся (at-most-once); nudge_state не двигаем (нудж не ушёл)
          try { await channelLinkRepo.logBotAction(db, { userId, chatId: auth2.chatId, command: "nudge", status: "error", errorCode: (res && res.degraded) || "SEND_FAILED" }); } catch (_) {}
        }
      } catch (_) { agg.errors++; }   // per-user изоляция
    }
    return { ok: true, ...agg };
  } finally { _sweeping = false; }
}

module.exports = { runNudgeSweep, authorizeForSweep };
