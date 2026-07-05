"use strict";

// Regression for the owner's iPhone repro 2026-07-05 (Room↔Studio hard-nav → raw SQLITE_CANTOPEN
// "unable to open database file", then the Room re-showed 0 texts). Root cause: the sticky-VFS
// preference (persisted as the REAL vfs.name, e.g. 'tts-opfs-idb') was compared against a
// DIFFERENT set of generic internal labels that never matched it, so the reorder was a silent
// no-op — every boot retried AccessHandlePoolVFS first regardless of which VFS actually held the
// user's data. Deterministic, no browser/Worker needed.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modUrl = pathToFileURL(
  path.join(__dirname, "..", "public", "db", "vfs-order.js")
).href;

test("no preference (first-ever boot) → default order, AccessHandlePool first", async () => {
  const { computeVfsOrder } = await import(modUrl);
  assert.deepEqual(computeVfsOrder(null), ["AccessHandlePool", "IDBBatchAtomic"]);
});

test("sticky preference 'tts-opfs-idb' (the REAL IDBBatchAtomicVFS.name) puts IDB first", async () => {
  const { computeVfsOrder } = await import(modUrl);
  assert.deepEqual(computeVfsOrder("tts-opfs-idb"), ["IDBBatchAtomic", "AccessHandlePool"]);
});

test("sticky preference 'AccessHandlePool' keeps the default order", async () => {
  const { computeVfsOrder } = await import(modUrl);
  assert.deepEqual(computeVfsOrder("AccessHandlePool"), ["AccessHandlePool", "IDBBatchAtomic"]);
});

test("unknown/stale preference value falls back to default order (no throw)", async () => {
  const { computeVfsOrder } = await import(modUrl);
  assert.deepEqual(computeVfsOrder("some-unknown-vfs"), ["AccessHandlePool", "IDBBatchAtomic"]);
});
