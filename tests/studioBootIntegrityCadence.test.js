"use strict";
// Perf 2026-09-27: PRAGMA integrity_check on a 548 MB owner profile took 7–35 s on every
// Studio boot. It runs in the single DB worker, so the review counts and the Library list
// queued behind it (review counts appeared at 38.6 s). The automatic check now runs at most
// once per 7 days, late and idle; a failed or transient result is retried on the next boot.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const start = html.indexOf("// D3: idle-time integrity_check");
const block = html.slice(start, html.indexOf("// Phase 9.4.A", start));

test("the automatic integrity check is skipped while the last clean run is recent", () => {
  assert.ok(start > 0);
  assert.match(block, /V3_INTEGRITY_CADENCE_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  const guard = block.indexOf("V3_INTEGRITY_LAST_OK_KEY");
  const run = block.indexOf("_ldb.integrityCheck()");
  assert.ok(guard > 0 && guard < run, "cadence guard must precede the PRAGMA");
});

test("only a clean result records the run; failures retry on the next boot", () => {
  const record = block.search(/if \(r\.ok\)[^\n]*localStorage\.setItem\(V3_INTEGRITY_LAST_OK_KEY/);
  assert.ok(record > 0, "last-ok timestamp must be written only when r.ok");
});

test("the check never starts during the boot window", () => {
  assert.match(block, /V3_INTEGRITY_BOOT_DELAY_MS = 120 \* 1000/);
  assert.match(block, /setTimeout\(\(\) => \{[\s\S]{0,200}requestIdleCallback\(_runICheck/);
  assert.doesNotMatch(block, /requestIdleCallback\(_runICheck, \{ timeout: 5000 \}\)/);
});
