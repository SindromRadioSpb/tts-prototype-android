"use strict";

// Tiny JSON-backed quota counter for the premium pipeline. Lives in its own
// file under DATA_DIR so it doesn't race with server.js's usage.json.
//
// Stored shape:
//   {
//     gcp: {
//       monthStart: "2026-04-01T00:00:00.000Z",
//       chars: 1234,
//       requests: 7,
//       lastError: null,
//     }
//   }
//
// Resets at the start of each calendar month (UTC). GCP's free tier is 500k
// chars/month per project — we surface chars-used + percentage so the UI can
// warn before the hard 402 hits.

const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../../storage");

const QUOTA_FILE = process.env.PREMIUM_QUOTA_FILE || path.join(DATA_DIR, "premium-quota.json");
const GCP_FREE_TIER_CHARS = Number(process.env.GCP_FREE_TIER_CHARS || 500000);

function nowMonthStartIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function emptyState() {
  return {
    gcp: {
      monthStart: nowMonthStartIso(),
      chars: 0,
      requests: 0,
      lastError: null,
    },
  };
}

function load() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return emptyState();
    const raw = fs.readFileSync(QUOTA_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || !data.gcp) return emptyState();
    // Roll over if month changed.
    const currentStart = nowMonthStartIso();
    if (data.gcp.monthStart !== currentStart) {
      data.gcp.monthStart = currentStart;
      data.gcp.chars = 0;
      data.gcp.requests = 0;
      data.gcp.lastError = null;
    }
    return data;
  } catch (e) {
    console.error("[premium-quota] load failed:", e.message);
    return emptyState();
  }
}

function save(state) {
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("[premium-quota] save failed:", e.message);
  }
}

function recordGcpUsage({ chars, error = null }) {
  const state = load();
  state.gcp.chars += Math.max(0, Number(chars) || 0);
  state.gcp.requests += 1;
  state.gcp.lastError = error;
  save(state);
  return state.gcp;
}

function getGcpStatus() {
  const s = load().gcp;
  const remaining = Math.max(0, GCP_FREE_TIER_CHARS - s.chars);
  const ratio = GCP_FREE_TIER_CHARS > 0 ? Math.min(1, s.chars / GCP_FREE_TIER_CHARS) : 0;
  return {
    monthStart: s.monthStart,
    chars: s.chars,
    requests: s.requests,
    freeTierLimit: GCP_FREE_TIER_CHARS,
    remaining,
    used_ratio: Number(ratio.toFixed(4)),
    near_limit: ratio >= 0.9,
    lastError: s.lastError,
  };
}

module.exports = {
  recordGcpUsage,
  getGcpStatus,
  // for tests
  _resetForTest() {
    try { fs.unlinkSync(QUOTA_FILE); } catch (_) {}
  },
};
