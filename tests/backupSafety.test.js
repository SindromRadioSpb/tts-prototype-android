"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBackup, restoreBackup } = require("../db/backup");

test("successive backups preserve both snapshots even within the same clock tick", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-backup-safety-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.timers.enable({ apis: ["Date"], now: 1788652800000 });
  const db = path.join(root, "app.db");
  const backupsDir = path.join(root, "backups");
  fs.writeFileSync(db, "first snapshot");
  const first = createBackup(db, { backupsDir });
  fs.writeFileSync(db, "second snapshot");
  const second = createBackup(db, { backupsDir });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.backupPath, second.backupPath);
  assert.equal(fs.readFileSync(first.backupPath, "utf8"), "first snapshot");
  assert.equal(fs.readFileSync(second.backupPath, "utf8"), "second snapshot");
});

test("restore refuses its own target before removing WAL files", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lp-restore-safety-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const db = path.join(root, "app.db");
  fs.writeFileSync(db, "database");
  fs.writeFileSync(db + "-wal", "uncheckpointed changes");
  const result = restoreBackup(db, db, { backupsDir: path.join(root, "backups") });
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(db + "-wal", "utf8"), "uncheckpointed changes");
});
