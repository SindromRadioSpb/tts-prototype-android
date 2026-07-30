const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const sqlite = require("../db/sqlite");

test("SQLite startup bounds the persistent WAL high-water mark", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-sqlite-wal-policy-"));
  const dbPath = path.join(tmpDir, "app.db");

  try {
    await sqlite.initDb(dbPath);
    const db = sqlite.getDb();
    const journalMode = await sqlite._get(db, "PRAGMA journal_mode;");
    const autocheckpoint = await sqlite._get(db, "PRAGMA wal_autocheckpoint;");
    const sizeLimit = await sqlite._get(db, "PRAGMA journal_size_limit;");

    assert.equal(journalMode.journal_mode, "wal");
    assert.equal(autocheckpoint.wal_autocheckpoint, 1000);
    assert.equal(sizeLimit.journal_size_limit, sqlite.WAL_JOURNAL_SIZE_LIMIT_BYTES);

    // Exercise the policy rather than only checking its configured value: make
    // a WAL larger than the limit, reset it with a non-TRUNCATE checkpoint, and
    // verify SQLite applies journal_size_limit to the retained file.
    await sqlite._exec(db, "PRAGMA wal_autocheckpoint = 0;");
    await sqlite._exec(db, "CREATE TABLE wal_growth (payload BLOB);");
    await sqlite._exec(db, "BEGIN IMMEDIATE;");
    try {
      for (let i = 0; i < 20; i += 1) {
        await sqlite._exec(db, "INSERT INTO wal_growth(payload) VALUES (zeroblob(1048576));");
      }
      await sqlite._exec(db, "COMMIT;");
    } catch (error) {
      await sqlite._exec(db, "ROLLBACK;").catch(() => {});
      throw error;
    }

    const walPath = dbPath + "-wal";
    assert.ok(fs.statSync(walPath).size > sqlite.WAL_JOURNAL_SIZE_LIMIT_BYTES);
    const checkpoint = await sqlite._get(db, "PRAGMA wal_checkpoint(RESTART);");
    assert.equal(checkpoint.busy, 0);
    assert.equal(checkpoint.log, checkpoint.checkpointed);

    // RESTART makes the next writer rewind the WAL; the size policy is applied
    // on that next write cycle rather than synchronously in the checkpoint call.
    await sqlite._exec(db, "INSERT INTO wal_growth(payload) VALUES (zeroblob(1));");
    assert.ok(fs.statSync(walPath).size <= sqlite.WAL_JOURNAL_SIZE_LIMIT_BYTES);
  } finally {
    await sqlite.closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
