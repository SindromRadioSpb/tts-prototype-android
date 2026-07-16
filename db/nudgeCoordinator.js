"use strict";

// Wave 2 N1 — one deterministic channel selector BEFORE the one existing
// (user_id, local_day) atomic claim. Push/Telegram are delivery adapters only.
// Policy version: nudge-channel-selector-v1.

const { getDb } = require("./sqlite");
const LT = require("./localtime");
const prefsRepo = require("./notificationPrefsRepo");
const ledgerRepo = require("./nudgeLedgerRepo");
const learnerGraphRepo = require("./learnerGraphRepo");
const pushRepo = require("./pushRepo");
const telegramRepo = require("./nudgeRepo");
const { selectChannel } = require("./nudgeChannelSelector");
const cp0 = require("../agent/controlPlane/observer");

const POLICY_VERSION = "nudge-channel-selector-v1";

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))));
}

function flagOn() {
  const raw = String(process.env.NUDGE_CHANNEL_SELECTOR_ENABLED || "true").trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "off");
}

async function listCandidateUsers() {
  const db = getDb(); if (!db) throw new Error("DB_NOT_AVAILABLE");
  const rows = await dbAll(db, `
    SELECT user_id FROM push_subscriptions
    UNION
    SELECT user_id FROM channel_links WHERE channel='telegram' AND status='active'
    ORDER BY user_id ASC`);
  return rows.map((r) => String(r.user_id));
}

function defaultDeps() {
  return {
    listCandidateUsers,
    getPrefs: (userId) => prefsRepo.getPrefs(userId),
    localParts: (tz, now) => LT.localParts(tz, now),
    windowOpen: (hour, window, start, end) => LT.windowOpen(hour, window, start, end),
    claimedToday: (userId, day) => ledgerRepo.claimedToday(userId, day),
    lastClaimedChannel: (userId) => ledgerRepo.lastClaimedChannel(userId),
    claimDay: (userId, day, channel, reason) => ledgerRepo.claimDay(userId, day, channel, reason),
    getDue: (userId, now) => learnerGraphRepo.getDue(userId, { nowMs: now, limit: 500 }),
    getPushSubscriptions: (userId) => pushRepo.getNudgeSubscriptions(userId),
    telegramEligibility: (userId, prefs, options) => telegramRepo.evaluateTelegramEligibility(userId, prefs, options),
    prepareTelegram: (userId, due, eligibility, options) => telegramRepo.prepareTelegramDelivery(userId, due, eligibility, options),
    deliverPush: (userId, dueCount, options) => pushRepo.deliverNudge(userId, dueCount, options),
    deliverTelegram: (userId, prepared, options) => telegramRepo.deliverPreparedTelegram(userId, prepared, options),
  };
}

function createCoordinator(overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  let sweeping = false;

  async function run({ nowMs, force } = {}) {
    if (sweeping) return { ok: true, policy: POLICY_VERSION, skipped: "in_flight" };
    sweeping = true;
    const now = Number(nowMs) || Date.now();
    const nowIso = new Date(now).toISOString();
    const agg = {
      examined: 0, disabled: 0, muted: 0, outside_window: 0, budget: 0,
      nothing_due: 0, no_channel: 0, telegram_backoff: 0, no_consent: 0,
      push_only: 0, telegram_only: 0, both: 0,
      selected_push: 0, selected_telegram: 0, claim_lost: 0,
      delivered: 0, delivery_failed: 0, errors: 0,
    };
    try {
      const userIds = await deps.listCandidateUsers();
      for (const userIdRaw of userIds) {
        const userId = String(userIdRaw);
        agg.examined++;
        await cp0.observe({ userId, surface: "background" },
          { scenarioId: "notification.nudge", surface: "background" }, async () => {
            try {
              let prefs;
              try { prefs = await deps.getPrefs(userId); } catch (_) { agg.errors++; return; }
              if (!prefs || !prefs.enabled) { agg.disabled++; return; }
              if (prefs.muted_until && nowIso < prefs.muted_until) { agg.muted++; return; }
              const parts = deps.localParts(prefs.timezone, now);
              if (!deps.windowOpen(parts.hour, prefs.window, prefs.quiet_start_local, prefs.quiet_end_local)) {
                agg.outside_window++; return;
              }
              if (await deps.claimedToday(userId, parts.day)) { agg.budget++; return; }

              const pushSubs = await deps.getPushSubscriptions(userId);
              const pushEligible = Array.isArray(pushSubs) && pushSubs.length > 0;
              let telegram = { eligible: false, skip: prefs.telegram_enabled ? "no_consent" : "disabled" };
              try { telegram = await deps.telegramEligibility(userId, prefs, { nowMs: now, force: !!force }); }
              catch (_) { telegram = { eligible: false, skip: "error" }; agg.errors++; }
              const telegramEligible = !!telegram.eligible;
              if (!telegramEligible && telegram.skip === "backoff") agg.telegram_backoff++;
              if (!telegramEligible && telegram.skip === "no_consent") agg.no_consent++;
              if (!pushEligible && !telegramEligible) { agg.no_channel++; return; }

              const due = await deps.getDue(userId, now);
              if (!Array.isArray(due) || !due.length) { agg.nothing_due++; return; }
              const last = await deps.lastClaimedChannel(userId);
              const decision = selectChannel({ pushEligible, telegramEligible, lastClaimedChannel: last });
              if (pushEligible && telegramEligible) agg.both++;
              else if (pushEligible) agg.push_only++;
              else agg.telegram_only++;

              let claimReason = "DUE_READY";
              let prepared = null;
              if (decision.selected === "telegram") {
                prepared = await deps.prepareTelegram(userId, due, telegram, { nowMs: now });
                if (!prepared || !prepared.ok) {
                  if (prepared && prepared.skip === "no_consent") agg.no_consent++;
                  else agg.errors++;
                  return;
                }
                claimReason = prepared.reason;
              }

              const claim = await deps.claimDay(userId, parts.day, decision.selected, claimReason);
              if (!claim || !claim.claimed) { agg.claim_lost++; return; }
              cp0.noteCapability("repo:nudge_claim");
              if (decision.selected === "push") agg.selected_push++;
              else agg.selected_telegram++;

              let result;
              try {
                result = decision.selected === "push"
                  ? await deps.deliverPush(userId, due.length, { nowMs: now, selectionReason: decision.reason })
                  : await deps.deliverTelegram(userId, prepared, { nowMs: now, selectionReason: decision.reason });
              } catch (_) {
                result = { delivered: false, deliveryCount: 0, failureCode: "ADAPTER_THROW" };
              }
              cp0.noteDelivery("daily_claim", decision.selected, result && result.delivered ? "DELIVERED" : "FAILED");
              if (result && result.delivered) agg.delivered++;
              else agg.delivery_failed++;
            } catch (_) { agg.errors++; }
          });
      }
      return { ok: true, policy: POLICY_VERSION, local_now: nowIso, ...agg };
    } finally {
      sweeping = false;
    }
  }

  return { run };
}

const singleton = createCoordinator();
async function runUnifiedSweep(options) {
  if (!flagOn()) return { ok: true, policy: POLICY_VERSION, skipped: "disabled_flag" };
  return singleton.run(options);
}

module.exports = { POLICY_VERSION, flagOn, selectChannel, createCoordinator, runUnifiedSweep };
