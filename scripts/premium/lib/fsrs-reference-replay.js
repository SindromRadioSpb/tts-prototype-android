"use strict";

// CLG-P4 — INDEPENDENT reference replay-over-log (AI_MENTOR_RECON §1.3-2 / §9 CLG-P4 gate).
// Deliberately does NOT import fsrs-core.js: the heavy DSR math comes from the pinned
// ts-fsrs@5.4.1 reference, and the thin product contracts are re-implemented here FROM THE SPEC
// (recon §4.1 + fsrs-core header), so a shared fsrs-core bug cannot agree with itself
// (feedback_independent_oracle_gate). Dev-only: used by the fixture generator and the
// smoke:server-replay gate; never shipped to the client or server runtime.
//
// Spec being implemented:
//   • rows ordered by (epoch(reviewed_at), id);
//   • watermark = EARLIEST seed row (D3 earliest-wins); rows before it and later seeds skipped;
//   • kind 'mark' — neutral; kind 'annul' — P7.0a (TELEGRAM_P7_DECISION): its meta.annul_of
//     EXCLUDES the target review/skip row from the fold (two-pass — collection over the WHOLE
//     list, annul position/time irrelevant; Set semantics → double-annul idempotent; seed/mark/
//     annul targets ignored — un-annul unsupported); the annul row itself never changes state;
//   • seed: interval>0 → S=clamp(interval, 1e-3, 36500), D=D0(Good); interval=0 → init(Again);
//     reps/lapses carried from the snapshot; seeding does NOT produce a due;
//   • review/skip: grade 1..4 (skip folds like its grade); Δt = integer UTC calendar-day diff,
//     clamped ≥0 (M10); first-ever Again is not a lapse; long-term regime (no learning steps);
//   • product projection: interval = min(max(1, round(S · IM)), 36500), due = last + interval·day,
//     where IM = (0.9^(1/DECAY) − 1)/FACTOR, FACTOR = e^(ln 0.9 / DECAY) − 1, DECAY = −w20.

const tsfsrs = require("ts-fsrs");

const PARAMS = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: false,
  learning_steps: [],
  relearning_steps: [],
  w: tsfsrs.default_w,
};
const F = tsfsrs.fsrs(tsfsrs.generatorParameters(PARAMS));
const DAY_MS = 86400000;
const W = tsfsrs.default_w;
const DECAY = -W[20];
const FACTOR = round8(Math.exp(Math.pow(DECAY, -1) * Math.log(0.9)) - 1);
const INTERVAL_MODIFIER = round8((Math.pow(0.9, 1 / DECAY) - 1) / FACTOR);

function round8(x) { return Math.round(x * 1e8) / 1e8; }

function productInterval(stability) {
  return Math.min(Math.max(1, Math.round(stability * INTERVAL_MODIFIER)), 36500);
}

function utcMidnightClampDiffDays(lastMs, nowMs) {
  const l = new Date(lastMs), n = new Date(nowMs);
  const u1 = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
  const u2 = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  return Math.max(0, Math.floor((u2 - u1) / DAY_MS));
}

// ts-fsrs computes elapsed from card.last_review internally with the same calendar-day
// semantics; to enforce the M10 clamp we feed a review date never earlier than last_review.
function foldReview(mem, lastMs, tsMs, grade) {
  const at = Math.max(tsMs, lastMs != null ? lastMs : tsMs);
  if (!mem) {
    const c = tsfsrs.createEmptyCard(new Date(at));
    const n = F.next(c, new Date(at), grade).card;
    return { stability: n.stability, difficulty: n.difficulty };
  }
  const card = {
    due: new Date(at), stability: mem.stability, difficulty: mem.difficulty,
    elapsed_days: 0, scheduled_days: 0, learning_steps: 0,
    reps: 1, lapses: 0, state: tsfsrs.State.Review,
    last_review: new Date(lastMs),
  };
  const n = F.next(card, new Date(at), grade).card;
  return { stability: n.stability, difficulty: n.difficulty };
}

function d0Good() {
  const c = tsfsrs.createEmptyCard(new Date(0));
  return F.next(c, new Date(0), 3).card.difficulty;
}
function initAgain(tsMs) {
  const c = tsfsrs.createEmptyCard(new Date(tsMs));
  const n = F.next(c, new Date(tsMs), 1).card;
  return { stability: n.stability, difficulty: n.difficulty };
}

function referenceReplay(rows) {
  const list = (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
    const ta = Date.parse(a.reviewed_at) || 0, tb = Date.parse(b.reviewed_at) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });
  // P7.0a pass 1 — spec re-implementation, NOT the fsrs-core helper (oracle independence):
  // collect meta.annul_of over the whole list; only review/skip targets are excludable.
  const annulled = new Set();
  for (const row of list) {
    if (!row || row.kind !== "annul") continue;
    let meta = {};
    try { meta = typeof row.meta_json === "string" ? JSON.parse(row.meta_json || "{}") : (row.meta || {}); } catch (_) {}
    if (meta && meta.annul_of != null && String(meta.annul_of)) annulled.add(String(meta.annul_of));
  }
  let start = -1;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].kind === "seed") { start = i; break; }
  let mem = null, lastMs = null, reps = 0, lapses = 0;
  for (let j = (start >= 0 ? start : 0); j < list.length; j++) {
    const row = list[j];
    if (!row) continue;
    if (row.kind === "seed") {
      if (j !== start) continue;   // D3 earliest-wins
      let meta = {};
      try { meta = typeof row.meta_json === "string" ? JSON.parse(row.meta_json || "{}") : (row.meta || {}); } catch (_) {}
      const interval = Number(meta.interval) || 0;
      reps = Number(meta.reps) || 0;
      lapses = Number(meta.lapses) || 0;
      const ts = Date.parse(row.reviewed_at) || 0;
      if (interval > 0) mem = { stability: Math.min(Math.max(interval, 1e-3), 36500), difficulty: d0Good() };
      else mem = initAgain(ts);
      lastMs = ts;
      continue;
    }
    if (row.kind === "annul" || row.kind === "mark") continue;
    if ((row.kind === "review" || row.kind === "skip") && annulled.has(String(row.id))) continue;   // P7.0a
    const g = Math.min(4, Math.max(1, Math.round(Number(row.grade) || 1)));
    const ts = Date.parse(row.reviewed_at) || 0;
    const hadMem = !!mem;
    mem = foldReview(mem, lastMs, ts, g);
    reps += 1;
    if (g === 1 && hadMem) lapses += 1;
    lastMs = Math.max(ts, lastMs != null ? lastMs : ts);
  }
  if (!mem || !(mem.stability > 0)) return null;
  const interval = productInterval(mem.stability);
  return {
    stability: mem.stability, difficulty: mem.difficulty, reps, lapses,
    intervalDays: interval,
    dueMs: lastMs != null ? lastMs + interval * DAY_MS : null,
    lastReviewedAt: lastMs,
  };
}

module.exports = { referenceReplay, productInterval, PARAMS };
