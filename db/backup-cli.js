"use strict";

// --------------------------------------------------------
// CLI for database backup operations.
// Usage:
//   node db/backup-cli.js           # create backup
//   node db/backup-cli.js list      # list backups
//   node db/backup-cli.js cleanup   # cleanup old backups
// --------------------------------------------------------

const path = require("path");
const {
  createBackup,
  listBackups,
  cleanupBackups,
  getDefaultDbPath,
  getDefaultBackupsDir,
  DEFAULT_MAX_BACKUPS,
} = require("./backup");

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(date) {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

async function cmdCreate() {
  const dbPath = process.env.DB_PATH || getDefaultDbPath();
  const label = process.argv[3] || "manual";

  console.log(`Creating backup of: ${dbPath}`);

  const result = createBackup(dbPath, { label });

  if (result.ok) {
    console.log(`Backup created: ${result.backupPath}`);
    if (result.walCopied) console.log("  (WAL file also copied)");
    if (result.shmCopied) console.log("  (SHM file also copied)");

    // Auto-cleanup
    const cleanupResult = cleanupBackups(DEFAULT_MAX_BACKUPS);
    if (cleanupResult.ok && cleanupResult.deleted > 0) {
      console.log(`Cleaned up ${cleanupResult.deleted} old backup(s)`);
    }

    process.exitCode = 0;
  } else {
    console.error(`Backup failed: ${result.error}`);
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
  console.log("  Date                     Size       Name");
  console.log("  " + "-".repeat(70));

  for (const b of backups) {
    const dateStr = formatDate(b.mtime);
    const sizeStr = formatSize(b.size).padStart(10);
    console.log(`  ${dateStr}  ${sizeStr}  ${b.name}`);
  }

  console.log("\n  (Most recent first)");
}

async function cmdCleanup() {
  const keepCount = parseInt(process.argv[3], 10) || DEFAULT_MAX_BACKUPS;

  console.log(`Cleaning up backups (keeping ${keepCount} most recent)...`);

  const result = cleanupBackups(keepCount);

  if (result.ok) {
    if (result.deleted > 0) {
      console.log(`Deleted ${result.deleted} old backup(s).`);
    } else {
      console.log("No backups to clean up.");
    }
  } else {
    console.error(`Cleanup failed: ${result.error}`);
    process.exitCode = 1;
  }
}

async function main() {
  const cmd = process.argv[2] || "create";

  switch (cmd) {
    case "create":
    case "":
      await cmdCreate();
      break;
    case "list":
    case "ls":
      await cmdList();
      break;
    case "cleanup":
    case "clean":
      await cmdCleanup();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(`
Database Backup CLI

Usage:
  node db/backup-cli.js [command] [options]

Commands:
  create [label]   Create a backup (default command)
                   label: optional suffix, e.g. "pre-deploy" (default: "manual")

  list             List all backups

  cleanup [n]      Delete old backups, keeping n most recent
                   n: number to keep (default: ${DEFAULT_MAX_BACKUPS})

Environment:
  DB_PATH          Path to database (default: data/app.db)
  BACKUPS_DIR      Path to backups directory (default: data/backups/)

Examples:
  node db/backup-cli.js                    # create backup
  node db/backup-cli.js create pre-deploy  # create labeled backup
  node db/backup-cli.js list               # list backups
  node db/backup-cli.js cleanup 5          # keep only 5 backups
`);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.log('Run "node db/backup-cli.js help" for usage.');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exitCode = 1;
});
