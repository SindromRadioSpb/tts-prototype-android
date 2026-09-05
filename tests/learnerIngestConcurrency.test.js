"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite = require("../db/sqlite");
const { withTxnLock } = require("../db/txnLock");
const { ingestBatch, readLog } = require("../db/learnerLogRepo");

test("concurrent retry of one review batch commits once and returns the stored receipt", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-ingest-race-"));
  t.after(async () => { await sqlite.closeDb(); fs.rmSync(root, { recursive: true, force: true }); });
  await sqlite.initDb(path.join(root, "app.db"));
  const db = sqlite.getDb();
  await sqlite._exec(db, "CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('learner');");
  await sqlite._exec(db, fs.readFileSync(path.join(__dirname, "../migrations/021_cloud_event_log.sql"), "utf8"));
  // Hold the transaction lane until both requests have read the initial absence.
  let release;
  const held = withTxnLock(() => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const get = db.get;
  let misses = 0;
  t.mock.method(db, "get", function (sql, params, callback) {
    return get.call(this, sql, params, function (error, row) {
      callback(error, row);
      if (sql.includes("SELECT result_json FROM ingest_batches") && !row && ++misses === 2) release();
    });
  });
  const batch = { idempotency_key: "retry", review_log: [{
    id: "review:1", item_key: "שלום#noun", kind: "review", grade: 3,
    source: "room-recall", reviewed_at: "2026-07-02T10:00:00.000Z",
  }] };
  const results = await Promise.allSettled([
    ingestBatch("learner", "device", batch), ingestBatch("learner", "device", batch),
  ]);
  await held;
  for (const result of results) assert.equal(result.status, "fulfilled", String(result.reason));
  const receipts = results.map(result => result.value);
  assert.deepEqual(receipts.map(result => result.replayed).sort(), [false, true]);
  assert.deepEqual(receipts[0].review_log, receipts[1].review_log);
  assert.equal(receipts[0].review_log.new, 1);
  assert.equal(receipts.filter(result => result.new_item_keys?.length).length, 1);
  assert.equal((await sqlite._get(db, "SELECT COUNT(*) n FROM review_log")).n, 1);
  assert.equal((await sqlite._get(db, "SELECT COUNT(*) n FROM ingest_batches")).n, 1);
  assert.equal((await ingestBatch("learner", "device", batch)).replayed, true);
});

test("down-sync cannot publish a review from a transaction that later rolls back", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-sync-rollback-"));
  t.after(async () => { await sqlite.closeDb(); fs.rmSync(root, { recursive: true, force: true }); });
  await sqlite.initDb(path.join(root, "app.db"));
  const db = sqlite.getDb();
  await sqlite._exec(db, "CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('learner');");
  await sqlite._exec(db, fs.readFileSync(path.join(__dirname, "../migrations/021_cloud_event_log.sql"), "utf8"));
  let release, inserted;
  const visible = new Promise(resolve => { inserted = resolve; });
  const write = withTxnLock(async () => {
    await sqlite._exec(db, "BEGIN IMMEDIATE; INSERT INTO review_log(user_id,id,item_key,reviewed_at,source,grade) VALUES ('learner','tentative','שלום#noun','2026-07-02T10:00:00.000Z','room-recall',3);");
    inserted();
    await new Promise(resolve => { release = resolve; });
    await sqlite._exec(db, "ROLLBACK;");
  });
  await visible;
  const pendingRead = readLog("learner");
  // Flush a SQLite operation queued after the read, then roll back. This proves
  // isolation on the shared connection without relying on timer scheduling.
  await sqlite._get(db, "SELECT 1");
  release();
  await write;
  assert.deepEqual(await pendingRead, []);
});
