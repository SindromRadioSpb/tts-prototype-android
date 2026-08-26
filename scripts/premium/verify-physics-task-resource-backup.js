"use strict";

// Read-only verifier for a coordinated DB + immutable-file backup set. Writers
// must be stopped before the backup is copied. This tool never selects default
// production coordinates: both paths are mandatory.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

const hashFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashJson = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(db)); });
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const close = db => new Promise(resolve => db.close(resolve));

function filesBelow(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) found.push(absolute);
    }
  };
  walk(root); return found.sort();
}

async function inspectBackupSet({ dbPath, dataDir }) {
  const resolvedDb = path.resolve(String(dbPath || ""));
  const resolvedData = path.resolve(String(dataDir || ""));
  if (!path.isAbsolute(resolvedDb) || !path.isAbsolute(resolvedData) || !fs.statSync(resolvedDb).isFile() || !fs.statSync(resolvedData).isDirectory()) {
    throw new Error("BACKUP_COORDINATES_INVALID");
  }
  const db = await open(resolvedDb);
  try {
    const integrity = await get(db, "PRAGMA integrity_check");
    const integrityValue = integrity && Object.values(integrity)[0];
    if (integrityValue !== "ok") throw new Error("BACKUP_DB_INTEGRITY_FAILED");
    const rows = await all(db, `SELECT revision_id,resource_id,edition_id,public_work_id,work_snapshot_sha256,storage_path,bytes,sha256,mime
      FROM physics_task_resource_revisions ORDER BY revision_id`);
    const expected = new Set();
    const revisions = [];
    for (const row of rows) {
      const relative = String(row.storage_path || "").replace(/\\/g, "/");
      if (!relative.startsWith("physics-task-resources/") || relative.includes("../")) throw new Error("BACKUP_STORAGE_PATH_INVALID:" + row.revision_id);
      const absolute = path.resolve(resolvedData, relative);
      if (!absolute.startsWith(resolvedData + path.sep)) throw new Error("BACKUP_STORAGE_PATH_INVALID:" + row.revision_id);
      expected.add(absolute.toLowerCase());
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error("BACKUP_RESOURCE_MISSING:" + row.revision_id);
      const bytes = fs.statSync(absolute).size;
      const digest = hashFile(absolute);
      if (bytes !== Number(row.bytes) || digest !== row.sha256) throw new Error("BACKUP_RESOURCE_READBACK_FAILED:" + row.revision_id);
      revisions.push({ revision_id: row.revision_id, resource_id: row.resource_id, edition_id: row.edition_id, public_work_id: row.public_work_id,
        work_snapshot_sha256: row.work_snapshot_sha256, storage_path: relative, bytes, sha256: digest, mime: row.mime });
    }
    const storageRoot = path.join(resolvedData, "physics-task-resources");
    const orphans = filesBelow(storageRoot).filter(file => !file.includes(path.sep + ".staging" + path.sep) && !expected.has(file.toLowerCase()));
    if (orphans.length) throw new Error("BACKUP_ORPHAN_FILES:" + orphans.length);
    const manifest = { schema_version: "physics_task_resource_backup.1.0.0", db_integrity: "ok", revision_count: revisions.length,
      bytes: revisions.reduce((sum, row) => sum + row.bytes, 0), revisions };
    return { ...manifest, manifest_sha256: hashJson(manifest) };
  } finally { await close(db); }
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
  const dbPath = value("--db"), dataDir = value("--data-dir");
  if (!dbPath || !dataDir) throw new Error("usage: --db <restored-app.db> --data-dir <restored-data-dir>");
  process.stdout.write(JSON.stringify(await inspectBackupSet({ dbPath, dataDir }), null, 2) + "\n");
}

module.exports = { inspectBackupSet };
if (require.main === module) main().catch(error => { process.stderr.write((error.stack || error.message) + "\n"); process.exitCode = 1; });
