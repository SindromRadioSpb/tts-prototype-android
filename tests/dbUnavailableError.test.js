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

test("back/forward cache terminates the DB worker instead of queueing close behind frozen work", () => {
  const start = localDbSource.indexOf("function _installDbLifecycle()");
  const end = localDbSource.indexOf("export async function releaseDbOwnership", start);
  const lifecycle = localDbSource.slice(start, end);
  // Owner iPhone report 3.11.544: a queued close never ran before WebKit froze
  // the cached document's worker, which kept the library lock.
  assert.match(lifecycle, /addEventListener\('pagehide', event => \{ if \(event\.persisted\) _suspendForPageCache\(\); \}, \{ capture: true \}\)/);
  assert.match(lifecycle, /addEventListener\('pageshow', event => \{ if \(event\.persisted\) _resumeFromPageCache\(\); \}, \{ capture: true \}\)/);
  assert.match(lifecycle, /_worker\.terminate\(\)/);
  assert.match(lifecycle, /if \(event\.persisted \|\| !_worker \|\| !_initialized\) return;\s*_call\('close'\)/,
    "a normal unload keeps the cooperative close");
});

test("Retry cannot terminate a live worker based on a historical lock timeout", () => {
  const start = localDbSource.indexOf("export async function recoverLocalDB()");
  const end = localDbSource.indexOf("function _call(", start);
  const recovery = localDbSource.slice(start, end);
  assert.doesNotMatch(recovery, /replaceTimedOutWaiter/);
  assert.match(recovery, /if \(_workerCrashed\) \{/);
  assert.match(recovery, /_worker\?\.terminate\(\)/);
  assert.ok(recovery.indexOf("_worker?.terminate()") < recovery.indexOf("await closeLocalDB()"));
  assert.match(recovery, /await closeLocalDB\(\);\s*_initialized = false;\s*await initLocalDB\(\)/);
});

test("O-038: a statement's SQLite error is returned to its caller, not remembered as a DB outage", () => {
  const vm = require("node:vm");
  const start = localDbSource.indexOf("function _wrapWorkerError(");
  const end = localDbSource.indexOf("\n}\n", start) + 3;
  const context = vm.createContext({ _workerCrashed: false, _lastDbError: null,
    _crashRegex: (m) => /memory access out of bounds/.test(m),
    DbUnavailableError: class extends Error { constructor(code, m) { super(m); this.name = "DbUnavailableError"; this.code = code; } } });
  vm.runInContext(localDbSource.slice(start, end), context);
  const sql = context._wrapWorkerError("no such table: missing_table", 1);
  assert.equal(sql.name, "Error");
  assert.equal(sql.code, 1, "the SQLite code stays readable for the caller");
  assert.equal(context._lastDbError, null, "ensureLocalDB() keeps working");
  const plain = context._wrapWorkerError("Unknown type: x", null);
  assert.equal(context._lastDbError, null);
  assert.equal(plain.code, undefined);
  const lock = context._wrapWorkerError("lock wait timed out", "DB_LOCK_WAIT_TIMEOUT");
  assert.equal(lock.name, "DbUnavailableError");
  assert.equal(context._lastDbError, lock, "a typed DB failure is still sticky");
  context._lastDbError = null;
  const crash = context._wrapWorkerError("RuntimeError: memory access out of bounds", 1);
  assert.equal(crash.code, "DB_WORKER_CRASHED");
  assert.equal(context._lastDbError, crash);
});
