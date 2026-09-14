"use strict";

// P0-1 regression unit: the worker-error classifier must wrap WASM-crash
// signatures (the "memory access out of bounds" multi-tab bug) into the
// typed DB_WORKER_CRASHED code, and must NOT swallow ordinary errors.
// Deterministic, no browser/Worker needed.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const modUrl = pathToFileURL(
  path.join(__dirname, "..", "public", "db", "local-db.js")
).href;
const localDbSource = fs.readFileSync(path.join(__dirname, "..", "public", "db", "local-db.js"), "utf8");

test("DbUnavailableError carries a code", async () => {
  const { DbUnavailableError } = await import(modUrl);
  const e = new DbUnavailableError("DB_OWNED_BY_OTHER_TAB", "msg");
  assert.equal(e.name, "DbUnavailableError");
  assert.equal(e.code, "DB_OWNED_BY_OTHER_TAB");
  assert.ok(e instanceof Error);
});

test("classifyWorkerError wraps WASM-crash signatures", async () => {
  const { classifyWorkerError } = await import(modUrl);
  for (const msg of [
    "memory access out of bounds",
    "RuntimeError: memory access out of bounds",
    "abort(undefined)",
    "table index is out of bounds",
    "null function or function signature mismatch",
  ]) {
    assert.equal(classifyWorkerError(msg), "DB_WORKER_CRASHED", msg);
  }
});

test("classifyWorkerError does NOT wrap ordinary errors", async () => {
  const { classifyWorkerError } = await import(modUrl);
  for (const msg of [
    "SQLITE_CONSTRAINT: UNIQUE constraint failed",
    "no such table: texts",
    "Worker error",
    "",
    null,
    undefined,
  ]) {
    assert.equal(classifyWorkerError(msg), null, String(msg));
  }
});

test("pagehide queues physical DB closure before a BFCache document can freeze", () => {
  const start = localDbSource.indexOf("function _installDbLifecycle()");
  const end = localDbSource.indexOf("export async function releaseDbOwnership", start);
  const lifecycle = localDbSource.slice(start, end);
  assert.match(lifecycle, /addEventListener\('pagehide',[\s\S]*_call\('close'\)/);
  assert.doesNotMatch(lifecycle, /\.terminate\(\)/,
    "BFCache cleanup must preserve the page worker and only release physical DB resources");
});

test("Retry replaces a timed-out waiter instead of queueing another close timeout", () => {
  const start = localDbSource.indexOf("export async function recoverLocalDB()");
  const end = localDbSource.indexOf("function _call(", start);
  const recovery = localDbSource.slice(start, end);
  assert.match(recovery, /DB_LOCK_WAIT_TIMEOUT/);
  assert.match(recovery, /_worker\?\.terminate\(\)/);
  assert.ok(recovery.indexOf("_worker?.terminate()") < recovery.indexOf("await closeLocalDB()"));
});
