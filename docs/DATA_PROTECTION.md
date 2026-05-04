# Data Protection System (DATA-PROTECT-01)

This document describes the backup, recovery, and integrity checking mechanisms for the Local Workspace SQLite database.

## Overview

The data protection system provides:

1. **Automatic Backups** - Before migrations and large imports
2. **WAL Mode** - Better crash recovery and concurrent access
3. **Integrity Checks** - Startup verification of database health
4. **CLI Tools** - Manual backup, restore, and integrity operations
5. **Bundle Export/Import** - User-facing transfer path for library, notes, audio files, and metadata

## Automatic Backups

### Pre-Migration Backups

Every time `npm run db:migrate` runs, a backup is automatically created:
- Location: `DATA_DIR/backups/app.<timestamp>.pre-migrate.db`
- Includes WAL/SHM files if present
- Old backups auto-cleaned (keeps last 10)

To skip backup (not recommended):
```bash
NO_BACKUP=1 npm run db:migrate
```

### Pre-Import Backups

When importing >10 texts via `/api/library/import` or large bundle import, a backup is created:
- Location: `DATA_DIR/backups/app.<timestamp>.pre-import*.db`
- Non-blocking: import continues even if backup fails

## WAL Mode

SQLite is configured with Write-Ahead Logging (WAL) mode, which provides:
- Better crash recovery (WAL survives crashes)
- Concurrent read access
- Faster writes

WAL creates additional files alongside the database:
- `DATA_DIR/app.db-wal` - Write-ahead log
- `DATA_DIR/app.db-shm` - Shared memory file

**Important:** These files are part of the database. Do not delete them while the server is running.

## CLI Commands

### Create Backup
```bash
npm run db:backup               # Create manual backup
npm run db:backup -- pre-deploy # Create labeled backup
```

### List Backups
```bash
npm run db:backup:list
```

### Cleanup Old Backups
```bash
npm run db:backup:cleanup       # Keep last 10
npm run db:backup:cleanup -- 5  # Keep last 5
```

### Restore from Backup
```bash
# List available backups first
npm run db:restore list

# Restore (requires --force)
npm run db:restore -- "data/backups/app.2026-01-18T12-00-00.pre-migrate.db" --force
```

**Note:** Restore automatically creates a pre-restore backup for safety.

### Check Integrity
```bash
npm run db:integrity
```

This checks:
1. SQLite integrity (PRAGMA integrity_check)
2. Core tables exist (v3_bootstrap, texts, sentences, text_progress)
3. Optional tables exist
4. Database statistics (text/sentence/note counts)

## Recovery Procedures

### Scenario 1: Migration Failed

1. Check the error message
2. List available backups:
   ```bash
   npm run db:backup:list
   ```
3. Restore the pre-migrate backup:
   ```bash
   npm run db:restore -- "data/backups/app.<timestamp>.pre-migrate.db" --force
   ```
4. Fix the migration issue and retry

### Scenario 2: Data Corruption Suspected

1. Stop the server
2. Run integrity check:
   ```bash
   npm run db:integrity
   ```
3. If issues found, restore from the most recent clean backup:
   ```bash
   npm run db:backup:list
   npm run db:restore -- "<backup-path>" --force
   ```

### Scenario 3: Accidental Data Loss (Bad Import)

1. Immediately create a backup of current state:
   ```bash
   npm run db:backup -- post-incident
   ```
2. List pre-import backups:
   ```bash
   npm run db:backup:list
   ```
3. Restore the pre-import backup:
   ```bash
   npm run db:restore -- "data/backups/app.<timestamp>.pre-import.db" --force
   ```

### Scenario 4: Complete Recovery (Fresh Start)

1. Stop the server
2. Remove the database:
   ```bash
   rm data/app.db data/app.db-wal data/app.db-shm
   ```
3. Run migrations to create fresh schema:
   ```bash
   npm run db:migrate
   ```
4. If you have a backup to restore:
   ```bash
   npm run db:restore -- "<backup-path>" --force
   ```

## File Locations

| File | Purpose |
|------|---------|
| `DATA_DIR/app.db` | Main database file |
| `DATA_DIR/app.db-wal` | WAL file (auto-created) |
| `DATA_DIR/app.db-shm` | Shared memory file (auto-created) |
| `DATA_DIR/audio-cache/*.mp3` | Local TTS audio payloads |
| `DATA_DIR/*.json` | Local settings, usage counters, quotas, and uploaded service keys |
| `DATA_DIR/backups/*.db` | Backup files |
| `DATA_DIR/backups/*.db-wal` | Backup WAL files |
| `DATA_DIR/backups/*.db-shm` | Backup SHM files |

## Best Practices

1. **Before Major Changes**
   ```bash
   npm run db:backup -- pre-<description>
   ```

2. **Regular Health Checks**
   ```bash
   npm run db:integrity
   ```

3. **Monitor Backup Directory**
   - Backups are auto-cleaned to 10 most recent
   - For critical data, copy backups to external storage

4. **Don't Delete WAL Files**
   - Let SQLite manage them
   - Server must be stopped for clean backup/restore

## Troubleshooting

### "Database is locked"
- Another process is using the database
- Stop the server and try again

### "WAL files missing after restore"
- This is normal if the backup didn't have WAL files
- SQLite will recreate them on next write

### "Integrity check failed"
- Database may be corrupted
- Restore from the most recent clean backup
- If no backup available, may need to start fresh

### "Backup failed: permission denied"
- Check write permissions on `data/backups/`
- On Windows, ensure no file locks

## Architecture Notes

- All backup operations are synchronous (fs.copyFileSync)
- Backup failures are non-blocking (logged but don't stop operations)
- WAL mode is enabled once in `initDb()` and persists
- Integrity checks run at startup but don't block the server
