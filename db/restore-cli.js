"use strict";

// --------------------------------------------------------
// CLI for database restore operations.
// Usage:
//   node db/restore-cli.js <backup-path>
//   node db/restore-cli.js list              # alias for backup-cli list
// --------------------------------------------------------

const path = require("path");
const {
  restoreBackup,
  listBackups,
  getDefaultDbPath,
  getDefaultBackupsDir,
} = require("./backup");

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(date) {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

async function cmdRestore(backupPath) {
  const targetDbPath = process.env.DB_PATH || getDefaultDbPath();

  console.log(`Restoring from: ${backupPath}`);
  console.log(`Target DB:      ${targetDbPath}`);
  console.log();

  // Confirm (in non-interactive mode, require --force)
  if (!process.argv.includes("--force")) {
    console.log("⚠️  This will overwrite the current database!");
    console.log("   A pre-restore backup will be created automatically.");
    console.log();
    console.log("   Add --force to proceed without this warning.");
    console.log();
    process.exitCode = 1;
    return;
  }

  const result = restoreBackup(backupPath, targetDbPath);

  if (result.ok) {
    console.log("✓ Restore completed successfully.");
    if (result.preRestoreBackup) {
      console.log(`  Pre-restore backup: ${result.preRestoreBackup}`);
    }
    console.log();
    console.log("  NOTE: Restart the server to use the restored database.");
  } else {
    console.error(`✗ Restore failed: ${result.error}`);
    process.exitCode = 1;
  }
}

async function cmdList() {
  const backupsDir = process.env.BACKUPS_DIR || getDefaultBackupsDir();

  console.log(`Backups in: ${backupsDir}\n`);

  const result = listBackups(backupsDir);

  if (!result.ok) {
    console.error(`Failed to list backups: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  const backups = result.backups || [];

  if (backups.length === 0) {
    console.log("No backups found.");
    return;
  }

  console.log(`Found ${backups.length} backup(s):\n`);
  console.log("  #   Date                     Size       Name");
  console.log("  " + "-".repeat(70));

  backups.forEach((b, i) => {
    const dateStr = formatDate(b.mtime);
    const sizeStr = formatSize(b.size).padStart(10);
    const idx = String(i + 1).padStart(3);
    console.log(`  ${idx} ${dateStr}  ${sizeStr}  ${b.name}`);
  });

  console.log("\n  To restore, run:");
  console.log(`    node db/restore-cli.js <backup-path> --force`);
  console.log("\n  Example:");
  if (backups.length > 0) {
    console.log(`    node db/restore-cli.js "${backups[0].path}" --force`);
  }
}

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === "help" || arg === "--help" || arg === "-h") {
    console.log(`
Database Restore CLI

Usage:
  node db/restore-cli.js <backup-path> [--force]
  node db/restore-cli.js list

Commands:
  <backup-path>    Restore from the specified backup file
                   Requires --force flag to confirm

  list             List available backups

Options:
  --force          Skip confirmation prompt

Environment:
  DB_PATH          Path to target database (default: data/app.db)
  BACKUPS_DIR      Path to backups directory (default: data/backups/)

Safety:
  - A pre-restore backup is automatically created before overwriting
  - After restore, restart the server to use the new database

Examples:
  node db/restore-cli.js list
  node db/restore-cli.js "data/backups/app.2026-01-18T12-00-00.pre-migrate.db" --force
`);
    return;
  }

  if (arg === "list" || arg === "ls") {
    await cmdList();
    return;
  }

  // Treat arg as backup path
  await cmdRestore(arg);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exitCode = 1;
});
