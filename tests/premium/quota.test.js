"use strict";

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Point the quota module at a tmp file so the real one is untouched.
const TMP = path.join(os.tmpdir(), `premium-quota-${process.pid}.json`);
process.env.PREMIUM_QUOTA_FILE = TMP;
process.env.GCP_FREE_TIER_CHARS = "1000";

// Force a fresh require so the module sees our env.
delete require.cache[require.resolve("../../db/premium/quota")];
const quota = require("../../db/premium/quota");

beforeEach(() => {
  try { fs.unlinkSync(TMP); } catch (_) {}
});

test("empty state has 0 chars and current month start", () => {
  const s = quota.getGcpStatus();
  assert.equal(s.chars, 0);
  assert.equal(s.requests, 0);
  assert.equal(s.freeTierLimit, 1000);
  assert.equal(s.remaining, 1000);
  assert.equal(s.near_limit, false);
  assert.match(s.monthStart, /^\d{4}-\d{2}-01T00:00:00\.000Z$/);
});

test("recordGcpUsage accumulates chars across calls", () => {
  quota.recordGcpUsage({ chars: 100 });
  quota.recordGcpUsage({ chars: 250 });
  const s = quota.getGcpStatus();
  assert.equal(s.chars, 350);
  assert.equal(s.requests, 2);
  assert.equal(s.remaining, 650);
});

test("near_limit flips true at >=90% usage", () => {
  quota.recordGcpUsage({ chars: 899 });
  assert.equal(quota.getGcpStatus().near_limit, false);
  quota.recordGcpUsage({ chars: 1 });
  assert.equal(quota.getGcpStatus().near_limit, true);
});

test("error payload is stored as lastError", () => {
  quota.recordGcpUsage({ chars: 0, error: { kind: "quota", at: "2026-04-15T00:00:00.000Z" } });
  const s = quota.getGcpStatus();
  assert.deepEqual(s.lastError, { kind: "quota", at: "2026-04-15T00:00:00.000Z" });
});

test("month rollover resets the counter", () => {
  // Simulate an old-month state by writing it directly.
  const past = new Date(Date.UTC(2020, 0, 1)).toISOString();
  fs.writeFileSync(TMP, JSON.stringify({
    gcp: { monthStart: past, chars: 999, requests: 50, lastError: null },
  }));
  const s = quota.getGcpStatus();
  assert.equal(s.chars, 0);
  assert.equal(s.requests, 0);
  assert.notEqual(s.monthStart, past);
});

test("missing file behaves like empty state", () => {
  const s = quota.getGcpStatus();
  assert.equal(s.chars, 0);
  assert.equal(s.requests, 0);
});

test("malformed file falls back to empty state", () => {
  fs.writeFileSync(TMP, "not json {");
  const s = quota.getGcpStatus();
  assert.equal(s.chars, 0);
});
