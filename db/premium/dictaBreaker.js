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

module.exports = { openUntil, retryAfterMs, isRefusal, noteRefusal, noteSuccess, COOLDOWN_MIN_MS, COOLDOWN_MAX_MS, _state: state };
