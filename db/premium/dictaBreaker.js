"use strict";

// One circuit-breaker for every server call to Dicta's Nakdan endpoint (morphology, niqqud, on-demand niqqud).
// Dicta answers a sustained load with HTTP 503/429 to EVERY caller of this server's IP — a ban is per IP, not per
// task, so a bulk niqqud must pause morphology too and vice versa (O-090). After a refusal nobody calls Dicta until
// the cooldown ends (2 min, doubling on each repeated refusal up to 15 min); the first call after it is the probe,
// and a success resets the doubling.

const COOLDOWN_MIN_MS = 120000, COOLDOWN_MAX_MS = 900000;
const state = { until: 0, ms: 0 };

function _now() { return state.clock ? state.clock() : Date.now(); }
function openUntil() { return state.until > _now() ? state.until : 0; }
function retryAfterMs() { return Math.max(0, state.until - _now()); }
function isRefusal(status) { return status === 503 || status === 429; }

// Returns true when the status is a refusal (the breaker is then open). Parallel requests refused by the same ban
// count once: a refusal while the breaker is already open does not double the cooldown again.
function noteRefusal(status, who) {
  if (!isRefusal(status)) return false;
  if (openUntil()) return true;
  state.ms = Math.min(COOLDOWN_MAX_MS, state.ms ? state.ms * 2 : COOLDOWN_MIN_MS);
  state.until = _now() + state.ms;
  console.warn(`[dicta] ${who || "call"}: HTTP ${status}, pausing every Dicta call for ${Math.round(state.ms / 1000)} s`);
  return true;
}

function noteSuccess() { state.ms = 0; }

// Д8-К4 v2 · К4.5 — one gate for the whole server: at most GATE.max Dicta calls at once from this process, a minimum
// gap between their starts, a bounded queue. Before, each HTTP request limited itself (2 at once), so N learners parsing
// in the background meant 2N calls — the load that got the IP banned (O-090). A caller that cannot get a slot in time
// (queue full, wait too long, or the breaker opened while it waited) gets an error with gateBusy and retryAfterMs —
// a «come back later», never a refusal from Dicta (it does not open the breaker).
const GATE = { max: 2, gapMs: 250, queueMax: 64, waitMaxMs: 30000, busyRetryMs: 15000 };
const gate = { active: 0, lastStart: 0, queue: [], timer: null };
function _busy(why) {
  const e = new Error("Dicta gate: " + why);
  e.gateBusy = true; e.reason = why;
  e.retryAfterMs = openUntil() ? retryAfterMs() : GATE.busyRetryMs;
  return e;
}
function _pump() {
  while (gate.active < GATE.max && gate.queue.length) {
    const wait = gate.lastStart + GATE.gapMs - Date.now();   // real pacing, not the breaker's test clock
    if (wait > 0) { if (!gate.timer) gate.timer = setTimeout(() => { gate.timer = null; _pump(); }, wait); return; }
    const w = gate.queue.shift();
    clearTimeout(w.timeout);
    gate.active++; gate.lastStart = Date.now();
    w.resolve();
  }
}
async function withSlot(fn) {
  if (openUntil()) throw _busy("rate_limited");
  if (gate.queue.length >= GATE.queueMax) throw _busy("busy");
  await new Promise((resolve, reject) => {
    const w = { resolve };
    w.timeout = setTimeout(() => { const i = gate.queue.indexOf(w); if (i >= 0) gate.queue.splice(i, 1); reject(_busy("busy")); }, GATE.waitMaxMs);
    gate.queue.push(w);
    _pump();
  });
  try {
    if (openUntil()) throw _busy("rate_limited");      // Dicta refused someone while this call waited
    return await fn();
  } finally { gate.active--; _pump(); }
}
function gateStats() { return { active: gate.active, queued: gate.queue.length }; }

module.exports = { openUntil, retryAfterMs, isRefusal, noteRefusal, noteSuccess, withSlot, gateStats, COOLDOWN_MIN_MS, COOLDOWN_MAX_MS,
  GATE, _state: state, _gate: gate };
