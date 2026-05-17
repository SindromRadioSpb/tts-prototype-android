"use strict";

// P0-1 regression unit: the worker-error classifier must wrap WASM-crash
// signatures (the "memory access out of bounds" multi-tab bug) into the
// typed DB_WORKER_CRASHED code, and must NOT swallow ordinary errors.
// Deterministic, no browser/Worker needed.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modUrl = pathToFileURL(
  path.join(__dirname, "..", "public", "db", "local-db.js")
).href;

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
