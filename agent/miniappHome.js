"use strict";

// CLG-P8.2 — Mini App home payload (TELEGRAM_MINI_APP_P8_RECON §5.2/§12/§20 IA).
// Channel-neutral application service: the BFF route (server.js) and the gate
// (smoke:miniapp-home) call THIS function — one home of the payload truth.
//
// Invariants:
//   • READ-ONLY / MNAR: opening the home is not a learning event — builds from
//     projections/log/selector reads, writes NOTHING (no review_log, no exposure).
//   • Privacy (class A surface): the recommendation carries ONLY {kind,
//     select_reason, explain} — never item_key / word / sentence / audio. The
//     deterministic selector picks; the static explanation string comes from the
//     SAME table the bot uses (format.selectExplanation — config-string match by
//     construction, no duplicated copy).
//   • "Done today" boundary = USER-LOCAL midnight via db/localtime.startOfLocalDay
//     with the notification_preferences timezone — the same day-truth the nudge
//     budget uses (no window drift between surfaces).
//   • Honest counts: due_now/scheduled reuse getAgentContext (ignore-excluded, the
//     same rule /api/learner/due serves); annulled reviews do not count as done.

const path = require("path");
const learnerGraphRepo = require(path.join(__dirname, "..", "db", "learnerGraphRepo"));
const notificationPrefsRepo = require(path.join(__dirname, "..", "db", "notificationPrefsRepo"));
const LT = require(path.join(__dirname, "..", "db", "localtime"));
const reviewer = require(path.join(__dirname, "reviewer"));
const reviewSession = require(path.join(__dirname, "reviewSession"));   // P8.3: канонический дом селектора
const format = require(path.join(__dirname, "telegram", "format"));

const KIND_TO_CHANNEL_LABEL = { cloze: "cloze", dictate: "dictate", reverse: "reverse" };

async function buildHomePayload(userId, { lang, nowMs } = {}) {
  const lng = lang === "en" ? "en" : "ru";
  const now = Number(nowMs) || Date.now();

  // honest counts (ignore-excluded, same rule as /api/learner/due) + last review
  const ctx = await learnerGraphRepo.getAgentContext(userId, { nowMs: now });

  // "done today" from the user-local day start (same tz source as the nudge system)
  let tz = LT.DEFAULT_TZ;
  try { tz = (await notificationPrefsRepo.getPrefs(userId)).timezone || LT.DEFAULT_TZ; } catch (_) {}
  const sinceIso = LT.startOfLocalDay(tz, now, 0);
  const today = await learnerGraphRepo.getTodayActivity(userId, { sinceIso });

  // deterministic recommendation — ONE selector for bot + Mini App (§20.1). Honest:
  // when the review write-path is flag-off, the bot's /review is unavailable too, so
  // advertising a training would over-claim → null. Selector is read-only.
  let recommendation = null;
  if (reviewer.flagOn()) {
    let pick = null;
    try { pick = await reviewSession.selectEligible(userId, { nowMs: now }); } catch (_) { pick = null; }
    if (pick && pick.kind) {
      recommendation = {
        kind: KIND_TO_CHANNEL_LABEL[pick.kind] || String(pick.kind),
        select_reason: String(pick.select_reason || ""),
        explain: format.selectExplanation(pick.select_reason, pick.kind, lng),   // "" for default_* reasons
      };
    }
  }

  // R3.2 (ROOM_DUE_CONTINUITY, owner 2026-07-11) — counter typology parity with the Зал badge:
  // «В работе» = words with a manual level (l1–l4), the same definition the Room strip shows, so
  // the two surfaces list the SAME four counters (К повторению · Сделано · В работе · В расписании).
  const inProgress = ["l1", "l2", "l3", "l4"].reduce((a, s) => a + (Number(ctx.manual && ctx.manual[s]) || 0), 0);

  // Closed payload shape — nothing beyond these keys ever ships to the shell.
  return {
    counts: { due_now: ctx.counts.due_now, scheduled: ctx.counts.scheduled, in_progress: inProgress },
    today: { completed: today.completed, by_type: today.by_type },
    last_review_at: ctx.last_review_at || null,
    recommendation,
  };
}

module.exports = { buildHomePayload };
