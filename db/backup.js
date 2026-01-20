"use strict";

// --------------------------------------------------------
// Backup/Restore utilities for SQLite DB.
// - Creates timestamped backups before migrations and large imports
// - Copies WAL/SHM files if they exist
// - Auto-cleanup keeps only N most recent backups
// --------------------------------------------------------

const fs = require("fs");
const path = require("path");

// IMPORTANT: default dirs must point to persistent storage (Railway Volume)
const { DB_PATH, BACKUPS_DIR } = require("../storage");

const DEFAULT_BACKUPS_DIR = BACKUPS_DIR; // was: path.join(__dirname, "..", "data", "backups")
const DEFAULT_MAX_BACKUPS = 10;

/**
 * Ensure backups directory exists.
 * @param {string} [backupsDir]
 * @returns {string} The backups directory path
 */
function ensureBackupsDir(backupsDir = DEFAULT_BACKUPS_DIR) {
  fs.mkdirSync(backupsDir, { recursive: true });
  return backupsDir;
}

/**
 * Generate ISO-like timestamp for filenames.
 * @returns {string} e.g. "2026-01-18T12-30-45"
 */
function timestamp() {
  return new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
}

/**
 * Create a backup of the database.
 * @param {string} dbPath - Path to source database
 * @param {Object} [options]
 * @param {string} [options.label="backup"] - Label for backup file (e.g. "pre-migrate")
 * @param {string} [options.backupsDir] - Custom backups directory
 * @returns {{ ok: boolean, backupPath?: string, error?: string, walCopied?: boolean, shmCopied?: boolean }}
 */
function createBackup(dbPath, options = {}) {
  const label = options.label || "backup";
  const backupsDir = ensureBackupsDir(options.backupsDir || DEFAULT_BACKUPS_DIR);

  try {
    // Check source exists
    if (!fs.existsSync(dbPath)) {
      return { ok: false, error: `Source DB not found: ${dbPath}` };
    }

    const ts = timestamp();
    const baseName = path.basename(dbPath, path.extname(dbPath));
    const backupName = `${baseName}.${ts}.${label}.db`;
    const backupPath = path.join(backupsDir, backupName);

    // Copy main DB file
    fs.copyFileSync(dbPath, backupPath);

    // Copy WAL and SHM files if they exist (for WAL mode)
    let walCopied = false;
    let shmCopied = false;

    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";

    if (fs.existsSync(walPath)) {
      fs.copyFileSync(walPath, backupPath + "-wal");
      walCopied = true;
    }

    if (fs.existsSync(shmPath)) {
      fs.copyFileSync(shmPath, backupPath + "-shm");
      shmCopied = true;
    }

    return { ok: true, backupPath, walCopied, shmCopied };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * List all backups in the backups directory.
 * @param {string} [backupsDir]
 * @returns {{ ok: boolean, backups?: Array<{name: string, path: string, size: number, mtime: Date}>, error?: string }}
 */
function listBackups(backupsDir = DEFAULT_BACKUPS_DIR) {
  try {
    if (!fs.existsSync(backupsDir)) {
      return { ok: true, backups: [] };
    }

    const files = fs.readdirSync(backupsDir);
    const backups = files
      .filter((f) => f.endsWith(".db") && !f.endsWith("-wal") && !f.endsWith("-shm"))
      .map((name) => {
        const filePath = path.join(backupsDir, name);
        const stat = fs.statSync(filePath);
        return {
          name,
          path: filePath,
          size: stat.size,
          mtime: stat.mtime,
        };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first

    return { ok: true, backups };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * Cleanup old backups, keeping only the N most recent.
 * @param {number} [keepCount=DEFAULT_MAX_BACKUPS]
 * @param {string} [backupsDir]
 * @returns {{ ok: boolean, deleted?: number, error?: string }}
 */
function cleanupBackups(keepCount = DEFAULT_MAX_BACKUPS, backupsDir = DEFAULT_BACKUPS_DIR) {
  try {
    const listResult = listBackups(backupsDir);
    if (!listResult.ok) {
      return { ok: false, error: listResult.error };
    }

    const backups = listResult.backups || [];
    if (backups.length <= keepCount) {
      return { ok: true, deleted: 0 };
    }

    // Delete oldest backups (beyond keepCount)
    const toDelete = backups.slice(keepCount);
    let deleted = 0;

    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.path);
        deleted++;

        // Also delete WAL/SHM if they exist
        const walPath = backup.path + "-wal";
        const shmPath = backup.path + "-shm";
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      } catch (e) {
        // Log but continue
        console.warn(`Failed to delete backup ${backup.name}:`, e.message);
      }
    }

    return { ok: true, deleted };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * Restore database from a backup.
 * Creates a pre-restore backup first for safety.
 * @param {string} backupPath - Path to backup file
 * @param {string} targetDbPath - Path to target database
 * @param {Object} [options]
 * @param {boolean} [options.skipPreBackup=false] - Skip creating pre-restore backup
 * @returns {{ ok: boolean, preRestoreBackup?: string, error?: string }}
 */
function restoreBackup(backupPath, targetDbPath, options = {}) {
  try {
    // Validate backup exists
    if (!fs.existsSync(backupPath)) {
      return { ok: false, error: `Backup not found: ${backupPath}` };
    }

    // Create pre-restore backup (unless skipped)
    let preRestoreBackup = null;
    if (!options.skipPreBackup && fs.existsSync(targetDbPath)) {
      const preResult = createBackup(targetDbPath, { label: "pre-restore" });
      if (preResult.ok) {
        preRestoreBackup = preResult.backupPath;
      } else {
        console.warn("Pre-restore backup failed:", preResult.error);
      }
    }

    // Remove existing WAL/SHM files at target (they may be stale)
    const targetWal = targetDbPath + "-wal";
    const targetShm = targetDbPath + "-shm";
    if (fs.existsSync(targetWal)) fs.unlinkSync(targetWal);
    if (fs.existsSync(targetShm)) fs.unlinkSync(targetShm);

    // Copy backup to target
    fs.copyFileSync(backupPath, targetDbPath);

    // Copy WAL/SHM from backup if they exist
    const backupWal = backupPath + "-wal";
    const backupShm = backupPath + "-shm";
    if (fs.existsSync(backupWal)) fs.copyFileSync(backupWal, targetWal);
    if (fs.existsSync(backupShm)) fs.copyFileSync(backupShm, targetShm);

    return { ok: true, preRestoreBackup };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * Get the default DB path.
 * @returns {string}
 */
function getDefaultDbPath() {
  return DB_PATH;
}

/**
 * Get the default backups directory.
 * @returns {string}
 */
function getDefaultBackupsDir() {
  return DEFAULT_BACKUPS_DIR;
}

module.exports = {
  createBackup,
  listBackups,
  cleanupBackups,
  restoreBackup,
  ensureBackupsDir,
  getDefaultDbPath,
  getDefaultBackupsDir,
  DEFAULT_MAX_BACKUPS,
};
