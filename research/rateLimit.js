// research/rateLimit.js — in-memory daily rate limiter for /api/research/v1/metrics.
//
// Per RESEARCH_METRICS_SCHEMA.md §14: > 10 uploads per day per student_id → 429.
// In-process Map (sufficient for diploma scale, single-instance Railway deploy).
// Counters reset automatically when the day key changes.

const DEFAULT_DAILY_LIMIT = 10;

const counters = new Map(); // key = "<cohort>|<student_id>|<YYYY-MM-DD>" -> count

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function makeKey(cohortCode, studentId, dateStr) {
  return `${cohortCode}|${studentId}|${dateStr}`;
}

// Returns { allowed: bool, count: int, remaining: int, limit: int }.
// On allowed=true the call has been counted (atomic check-and-increment).
function checkAndIncrement(cohortCode, studentId, { limit = DEFAULT_DAILY_LIMIT, dateStr = null } = {}) {
  const day = dateStr || todayUtc();
  const key = makeKey(cohortCode, studentId, day);
  const current = counters.get(key) || 0;
  if (current >= limit) {
    return { allowed: false, count: current, remaining: 0, limit };
  }
  const next = current + 1;
  counters.set(key, next);
  return { allowed: true, count: next, remaining: limit - next, limit };
}

// Test/maintenance helpers.
function _reset() {
  counters.clear();
}

function _peek(cohortCode, studentId, dateStr = null) {
  const day = dateStr || todayUtc();
  return counters.get(makeKey(cohortCode, studentId, day)) || 0;
}

module.exports = {
  DEFAULT_DAILY_LIMIT,
  checkAndIncrement,
  _reset,
  _peek,
};
