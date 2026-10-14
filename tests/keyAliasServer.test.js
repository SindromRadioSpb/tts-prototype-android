"use strict";
// Ф4 · Д8-К3 on the mentor's server: an alias event is accepted, the old key's projection is removed, the new key's
// projection is the replay of both histories, and an undo restores the two projections.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite = require("../db/sqlite");
const { ingestBatch } = require("../db/learnerLogRepo");
const PR = require("../db/learnerProjectionRepo");
const KA = require("../public/js/key-alias-core.js");

const rv = (id, key, at, grade) => ({ id, item_key: key, kind: "review", grade, source: "room-recall", reviewed_at: at });

test("alias: one history per word on the server; undo restores both", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-alias-"));
  t.after(async () => { await sqlite.closeDb(); fs.rmSync(root, { recursive: true, force: true }); });
  await sqlite.initDb(path.join(root, "app.db"));
  const db = sqlite.getDb();
  await sqlite._exec(db, "CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('u');");
  for (const m of ["021_cloud_event_log.sql", "022_srs_projections.sql", "025_channel_stats.sql"]) {
    await sqlite._exec(db, fs.readFileSync(path.join(__dirname, "../migrations", m), "utf8"));
  }
  const r1 = await ingestBatch("u", "dev", { idempotency_key: "b1", review_log: [
    rv("r1", "אביו#", "2026-10-01T10:00:00.000Z", 3), rv("r2", "אביו#", "2026-10-03T10:00:00.000Z", 3),
    rv("r3", "pid:7", "2026-10-02T10:00:00.000Z", 1)] });
  await PR.recomputeForKeys("u", r1.new_item_keys);
  const before = await PR.listProjections("u", {});
  assert.deepEqual(before.map((p) => p.item_key).sort(), ["pid:7", "אביו#"]);

  const alias = KA.aliasRow("אביו#", "pid:7", "2026-10-05T10:00:00.000Z", "d8k3");
  const r2 = await ingestBatch("u", "dev", { idempotency_key: "b2", review_log: [alias] });
  assert.equal(r2.review_log.new, 1, JSON.stringify(r2));
  assert.deepEqual(r2.new_item_keys.sort(), ["pid:7", "אביו#"]);
  await PR.recomputeForKeys("u", r2.new_item_keys);
  const after = await PR.listProjections("u", {});
  assert.deepEqual(after.map((p) => p.item_key), ["pid:7"], "the old key's projection is gone");
  assert.equal(Number(after[0].reps), 3, "the new key folds all three reviews");
  assert.deepEqual(await PR.distinctItemKeys("u"), ["pid:7"]);
  const oracle = await PR.oracle("u", {});
  assert.equal(oracle.mismatched, 0); assert.equal(oracle.missing, 0);

  // a bad alias is refused
  const bad = await ingestBatch("u", "dev", { idempotency_key: "b3", review_log: [{ ...alias, id: "bad", meta_json: "{}" }] });
  assert.equal(bad.review_log.rejected, 1);

  // undo = alias to itself, later
  const undo = KA.aliasRow("אביו#", "אביו#", "2026-10-06T10:00:00.000Z");
  const r4 = await ingestBatch("u", "dev", { idempotency_key: "b4", review_log: [undo] });
  assert.deepEqual(r4.new_item_keys.sort(), ["pid:7", "אביו#"], "the undo recomputes the word it belonged to");
  await PR.recomputeForKeys("u", r4.new_item_keys);
  const undone = await PR.listProjections("u", {});
  assert.deepEqual(undone.map((p) => p.item_key).sort(), ["pid:7", "אביו#"]);
  assert.equal(Number(undone.find((p) => p.item_key === "pid:7").reps), 1);
  assert.equal(Number(undone.find((p) => p.item_key === "אביו#").reps), 2, "alias events are never memory");
});
