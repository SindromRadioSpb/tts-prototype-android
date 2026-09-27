"use strict";
// Perf 2026-09-27: PRAGMA integrity_check on a 548 MB owner profile took 7–35 s on every
// Studio boot. It runs in the single DB worker, so the review counts and the Library list
// queued behind it (review counts appeared at 38.6 s). First fix: at most once per 7 days,
// late and idle. O-024: even weekly, one full check still held the worker 7–35 s, and
// quick_check took 8.5 s. The weekly pass now checks ONE table per idle slot (54 tables: 6.6 s
// in total, the largest 1.9 s) and remembers its place across boots; the pass counts as clean
// only when every table has passed. A failed or transient result is retried on the next boot.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const localDb = fs.readFileSync(path.join(__dirname, "..", "public", "db", "local-db.js"), "utf8");
const start = html.indexOf("// D3: idle-time integrity_check");
const block = html.slice(start, html.indexOf("// Phase 9.4.A", start));

test("the automatic check is skipped while the last clean pass is recent", () => {
  assert.ok(start > 0);
  assert.match(block, /V3_INTEGRITY_CADENCE_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  const guard = block.indexOf("V3_INTEGRITY_LAST_OK_KEY");
  const run = block.indexOf("_ldb.integrityCheck(");
  assert.ok(guard > 0 && guard < run, "cadence guard must precede the PRAGMA");
});

test("each idle slot checks one table and the rotation survives reloads", () => {
  assert.match(block, /_ldb\.listIntegrityTables\(\)/);
  assert.match(block, /_ldb\.integrityCheck\(table\)/);
  assert.doesNotMatch(block, /_ldb\.integrityCheck\(\)/);
  assert.match(block, /V3_INTEGRITY_ROTATION_KEY = 'lp\.integrity\.rotation'/);
});

test("only a completed clean pass records the run", () => {
  const record = block.indexOf("localStorage.setItem(V3_INTEGRITY_LAST_OK_KEY");
  const complete = block.search(/if \(!pending\.length\)/);
  assert.ok(complete > 0 && record > complete, "last-ok is written only once every table passed");
  assert.match(block.slice(block.indexOf("if (!r.ok)")), /return;/);
});

test("the check never starts during the boot window", () => {
  assert.match(block, /V3_INTEGRITY_BOOT_DELAY_MS = 120 \* 1000/);
  assert.match(block, /setTimeout\(\(\) => \{[\s\S]{0,200}requestIdleCallback\(_runICheck/);
});

test("a table name reaches the PRAGMA only after matching sqlite_master", () => {
  const fn = localDb.slice(localDb.indexOf("export async function integrityCheck("), localDb.indexOf("export async function integrityCheck(") + 900);
  assert.match(fn, /export async function integrityCheck\(table\)/);
  assert.match(fn, /SELECT name FROM sqlite_master WHERE type='table' AND name = \?/);
  assert.match(localDb, /export async function listIntegrityTables\(\)/);
});
