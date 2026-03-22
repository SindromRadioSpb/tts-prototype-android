"use strict";

// --------------------------------------------------------
// CLI for database integrity checks.
// Usage:
//   node db/integrity-cli.js
// --------------------------------------------------------

const path = require("path");
const { initDb, getDb, getDbHealth, closeDb } = require("./sqlite");
const { runFullCheck, CORE_TABLES, OPTIONAL_TABLES } = require("./integrity");

async function main() {
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");

  console.log(`Database Integrity Check`);
  console.log(`========================\n`);
  console.log(`Database: ${DB_PATH}\n`);

  // Initialize DB
  await initDb(DB_PATH);
  const dbHealth = getDbHealth();

  if (!dbHealth.ok) {
    console.error("✗ Failed to open database:", dbHealth.error);
    process.exitCode = 1;
    return;
  }

  const db = getDb();

  // Run full integrity check
  const result = await runFullCheck(db);

  // Report: SQLite integrity
  console.log("1. SQLite Integrity Check");
  console.log("   " + "-".repeat(40));
  if (result.integrity.ok) {
    console.log("   ✓ PASSED");
  } else {
    console.log(`   ✗ FAILED: ${result.integrity.result || result.integrity.error}`);
  }
  console.log();

  // Report: Core tables
  console.log("2. Core Tables");
  console.log("   " + "-".repeat(40));
  console.log(`   Required: ${CORE_TABLES.join(", ")}`);
  if (result.tables.core.ok) {
    console.log("   ✓ All present");
  } else {
    console.log(`   ✗ Missing: ${result.tables.core.missing.join(", ")}`);
  }
  console.log();

  // Report: Optional tables
  console.log("3. Optional Tables");
  console.log("   " + "-".repeat(40));
  const optPresent = result.tables.optional.present || [];
  const optMissing = result.tables.optional.missing || [];
  console.log(`   Present: ${optPresent.length > 0 ? optPresent.join(", ") : "(none)"}`);
  if (optMissing.length > 0) {
    console.log(`   Missing: ${optMissing.join(", ")}`);
  }
  console.log();

  // Report: Stats
  console.log("4. Database Statistics");
  console.log("   " + "-".repeat(40));
  const stats = result.stats || {};
  console.log(`   Texts:     ${stats.texts !== null ? stats.texts : "N/A"}`);
  console.log(`   Sentences: ${stats.sentences !== null ? stats.sentences : "N/A"}`);
  console.log(`   Notes:     ${stats.notes !== null ? stats.notes : "N/A"}`);
  console.log();

  // Summary
  console.log("Summary");
  console.log("=" .repeat(50));
  if (result.ok) {
    console.log("✓ Database integrity: OK");
    process.exitCode = 0;
  } else {
    console.log("✗ Database integrity: ISSUES FOUND");
    console.log();
    console.log("Warnings:");
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
    process.exitCode = 1;
  }

  await closeDb();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exitCode = 1;
});
