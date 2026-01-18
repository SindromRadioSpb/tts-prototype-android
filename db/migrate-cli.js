"use strict";

const fs = require("fs");
const path = require("path");
const { initDb, getDbHealth, closeDb } = require("./sqlite");
const { runMigrations, getMigrationsHealth } = require("./migrate");
const { createBackup, cleanupBackups, DEFAULT_MAX_BACKUPS } = require("./backup");

async function main() {
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
  const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, "..", "migrations");
  const NO_BACKUP = process.env.NO_BACKUP === "1" || process.env.NO_BACKUP === "true";

  // Pre-migration backup (if DB exists)
  if (!NO_BACKUP && fs.existsSync(DB_PATH)) {
    console.log("[migrate] Creating pre-migration backup...");
    const backupResult = createBackup(DB_PATH, { label: "pre-migrate" });
    if (backupResult.ok) {
      console.log(`[migrate] Backup created: ${backupResult.backupPath}`);
      // Cleanup old backups
      const cleanupResult = cleanupBackups(DEFAULT_MAX_BACKUPS);
      if (cleanupResult.ok && cleanupResult.deleted > 0) {
        console.log(`[migrate] Cleaned up ${cleanupResult.deleted} old backup(s)`);
      }
    } else {
      console.warn(`[migrate] Backup failed (continuing): ${backupResult.error}`);
    }
  }

  await initDb(DB_PATH);
  const dbHealth = getDbHealth();
  if (!dbHealth.ok) {
    console.error("DB init failed:", dbHealth);
    process.exitCode = 1;
    return;
  }

  await runMigrations({ migrationsDir: MIGRATIONS_DIR });
  const migHealth = getMigrationsHealth();
  if (!migHealth.ok) {
    console.error("Migrations failed:", migHealth);
    process.exitCode = 1;
  } else {
    console.log("Migrations OK:", migHealth);
  }

  await closeDb();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exitCode = 1;
});
