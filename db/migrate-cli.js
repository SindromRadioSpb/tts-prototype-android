"use strict";

const path = require("path");
const { initDb, getDbHealth, closeDb } = require("./sqlite");
const { runMigrations, getMigrationsHealth } = require("./migrate");

async function main() {
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
  const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, "..", "migrations");

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
