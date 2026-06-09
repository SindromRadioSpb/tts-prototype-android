"use strict";

// BRR-P0-006 · Unit tests for the pure work-ledger (resume / daily-quota / tiering).

const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../scripts/premium/lib/corpusLedger");

test("seed adds pending entries, never downgrades a done work (resume-safe)", () => {
  const led = L.emptyLedger();
  assert.equal(L.seedLedger(led, [{ id: "1", tier: "known" }, { id: "2", tier: "rest" }]), 2);
  L.markDone(led, "1", { segments: 10, reqs: 1 }, "2026-06-09");
  // re-seed (next-day run): existing ids are not reset
  assert.equal(L.seedLedger(led, [{ id: "1" }, { id: "2" }, { id: "3" }]), 1); // only 3 is new
  assert.equal(led.works["1"].status, "done");
  assert.equal(led.works["2"].status, "pending");
  assert.equal(led.works["3"].status, "pending");
});

test("pendingWorks honors order, excludes done/skipped, retries failed by default", () => {
  const led = L.emptyLedger();
  L.seedLedger(led, [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
  L.markDone(led, "b", {}, "d1");
  L.markFailed(led, "c", "boom", "d1");
  L.markSkipped(led, "d", {}, "d1");
  // order = c,a,b,d → pending should be c (failed→retry), a; b done & d skipped excluded
  assert.deepEqual(L.pendingWorks(led, ["c", "a", "b", "d"]), ["c", "a"]);
  // includeFailed:false drops the failed retry
  assert.deepEqual(L.pendingWorks(led, ["c", "a", "b", "d"], { includeFailed: false }), ["a"]);
});

test("deferred-giant excluded from normal pass, included only on the giant pass", () => {
  const led = L.emptyLedger();
  L.seedLedger(led, [{ id: "x" }, { id: "g" }]);
  L.markDeferredGiant(led, "g", { segments: 18000 }, "d1");
  assert.deepEqual(L.pendingWorks(led, ["x", "g"]), ["x"]);
  assert.deepEqual(L.pendingWorks(led, ["x", "g"], { includeGiant: true }), ["x", "g"]);
});

test("daily quota accounting accumulates per UTC day and bounds remaining", () => {
  const led = L.emptyLedger();
  assert.equal(L.dayReqsUsed(led, "2026-06-09"), 0);
  assert.equal(L.recordReqs(led, "2026-06-09", 400), 400);
  assert.equal(L.recordReqs(led, "2026-06-09", 1100), 1500);
  assert.equal(L.dayQuotaRemaining(led, "2026-06-09", 1500), 0);
  assert.equal(L.dayQuotaRemaining(led, "2026-06-09", 2000), 500);
  // a different day is a fresh budget
  assert.equal(L.dayQuotaRemaining(led, "2026-06-10", 1500), 1500);
});

test("markDone records info fields and stats aggregates them", () => {
  const led = L.emptyLedger();
  L.seedLedger(led, [{ id: "1" }, { id: "2" }, { id: "3" }]);
  L.markDone(led, "1", { segments: 40, reqs: 1, niqqud: 15, ru_filled: 40, content_hash: "abc" }, "d1");
  L.markDone(led, "2", { segments: 60, reqs: 2, niqqud: 20, ru_filled: 58 }, "d1");
  L.markFailed(led, "3", "net", "d1");
  const s = L.stats(led);
  assert.equal(s.total, 3);
  assert.equal(s.done, 2);
  assert.equal(s.failed, 1);
  assert.equal(s.segments, 100);
  assert.equal(s.reqs, 3);
  assert.equal(s.ru_filled, 98);
  assert.equal(led.works["1"].content_hash, "abc");
});

test("loadLedger returns a fresh empty ledger on a missing/garbage path (never throws)", () => {
  const led = L.loadLedger("E:/__definitely_not_a_real_path__/ledger.json");
  assert.equal(led.version, L.LEDGER_VERSION);
  assert.deepEqual(led.works, {});
  assert.deepEqual(led.daily, {});
});
