"use strict";

// CLG-P3.2 — ONE process-wide transaction lock for explicit BEGIN..COMMIT sections on the shared
// sqlite3 connection. node-sqlite3 serializes individual statements, but an ASYNC transaction
// (await between BEGIN and COMMIT) interleaves with other requests' statements — a second
// concurrent BEGIN throws "cannot start a transaction within a transaction" (500). Found by the
// cloud-sync gate: two devices ingesting at once. Every explicit-transaction writer (learner
// ingest, account delete) MUST run through this lock; plain single-statement writes need not.
let _chain = Promise.resolve();
function withTxnLock(fn) {
  const run = _chain.then(fn, fn);
  _chain = run.catch(() => {});   // the lock survives a failed transaction
  return run;
}
module.exports = { withTxnLock };
