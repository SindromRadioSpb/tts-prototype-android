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

test("giantWorks returns only deferred-giant ids, in caller order (Проход-2 list)", () => {
  const led = L.emptyLedger();
  L.seedLedger(led, [{ id: "a" }, { id: "g1" }, { id: "b" }, { id: "g2" }]);
  L.markDeferredGiant(led, "g1", { segments: 5000 }, "d1");
  L.markDeferredGiant(led, "g2", { segments: 9000 }, "d1");
  L.markDone(led, "b", {}, "d1");
  assert.deepEqual(L.giantWorks(led, ["g2", "a", "g1", "b"]), ["g2", "g1"]);
  // unknown ids ignored; pending/done/failed never leak into the giant pass
  L.markFailed(led, "a", "net", "d1");
  assert.deepEqual(L.giantWorks(led, ["zz", "a", "b"]), []);
});

test("giant lifecycle: deferred-giant → done with parts recorded and aggregated", () => {
  const led = L.emptyLedger();
  L.seedLedger(led, [{ id: "g" }]);
  L.markDeferredGiant(led, "g", { segments: 5200 }, "d1");
  // a failed giant attempt keeps DEFERRED status with the error recorded (retry on next giant pass)
  L.markDeferredGiant(led, "g", { segments: 5200, error: "giant:part 2/4: boom" }, "d1");
  assert.equal(led.works["g"].status, "deferred-giant");
  assert.equal(led.works["g"].error, "giant:part 2/4: boom");
  L.markDone(led, "g", { segments: 5180, parts: 4, reqs: 110, ru_filled: 5180 }, "d2");
  assert.equal(led.works["g"].status, "done");
  assert.equal(led.works["g"].parts, 4);
  const s = L.stats(led);
  assert.equal(s.done, 1);
  assert.equal(s.deferredGiant, 0);
  assert.equal(s.parts, 4);
  // a completed giant no longer appears on either work list
  assert.deepEqual(L.giantWorks(led, ["g"]), []);
  assert.deepEqual(L.pendingWorks(led, ["g"]), []);
});

test("loadLedger returns a fresh empty ledger on a missing/garbage path (never throws)", () => {
  const led = L.loadLedger("E:/__definitely_not_a_real_path__/ledger.json");
  assert.equal(led.version, L.LEDGER_VERSION);
  assert.deepEqual(led.works, {});
  assert.deepEqual(led.daily, {});
});
