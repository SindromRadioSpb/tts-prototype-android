"use strict";

// --------------------------------------------------------
// Migrations runner (SQLite).
// Goals:
// - Idempotent: apply each migration exactly once.
// - Safe: migration errors must NOT crash the process.
// - Health: expose status for /healthz.
// --------------------------------------------------------

const fs = require("fs");
const path = require("path");
const { getDb } = require("./sqlite");

const _migState = {
  ok: false,
  ready: false,
  appliedCount: 0,
  applied: [],
  error: null,
};

function dbExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function ensureSchemaMigrationsTable(db) {
  await dbExec(
    db,
    `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `
  );
}

function listMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  const files = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".sql"))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b)); // 001_... < 002_...

  return files.map((name) => ({
    name,
    version: name.replace(/\.sql$/i, ""),
    fullPath: path.join(migrationsDir, name),
  }));
}

async function getAppliedVersions(db) {
  await ensureSchemaMigrationsTable(db);
  const rows = await dbAll(db, `SELECT version FROM schema_migrations ORDER BY version ASC;`);
  return new Set(rows.map((r) => r.version));
}

function validateMigrationSql(sqlText, fileName) {
  // Запрещаем явные транзакции в .sql, т.к. раннер сам управляет BEGIN/COMMIT
  const upper = sqlText.toUpperCase();
  if (upper.includes("BEGIN;") || upper.includes("BEGIN TRANSACTION") || upper.includes("COMMIT;") || upper.includes("ROLLBACK;")) {
    throw new Error(
      `Migration "${fileName}" содержит BEGIN/COMMIT/ROLLBACK. Уберите транзакции из файла миграции — раннер сам оборачивает в транзакцию.`
    );
  }
}

async function applyOneMigration(db, mig) {
  const sqlText = fs.readFileSync(mig.fullPath, "utf-8");
  validateMigrationSql(sqlText, mig.name);

  // Одна миграция = одна транзакция
  await dbExec(db, "BEGIN IMMEDIATE;");
  try {
    await dbExec(db, sqlText);
    await dbRun(
      db,
      `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);`,
      [mig.version, new Date().toISOString()]
    );
    await dbExec(db, "COMMIT;");

    _migState.appliedCount += 1;
    _migState.applied.push(mig.version);
  } catch (err) {
    try {
      await dbExec(db, "ROLLBACK;");
    } catch (_) {
      // ignore rollback failures
    }
    throw err;
  }
}

async function runMigrations({ migrationsDir }) {
  // idempotent-ish: если уже "ready", не гоняем снова автоматически
  if (_migState.ready) return;

  _migState.ok = false;
  _migState.ready = false;
  _migState.appliedCount = 0;
  _migState.applied = [];
  _migState.error = null;

  const db = getDb();
  if (!db) {
    _migState.ready = true;
    _migState.ok = false;
    _migState.error = "DB is not available (initDb failed or not completed)";
    return;
  }

  try {
    await ensureSchemaMigrationsTable(db);

    const appliedSet = await getAppliedVersions(db);
    const migrations = listMigrationFiles(migrationsDir);

    for (const mig of migrations) {
      if (appliedSet.has(mig.version)) continue;
      await applyOneMigration(db, mig);
      appliedSet.add(mig.version);
    }

    _migState.ok = true;
    _migState.ready = true;
  } catch (err) {
    _migState.ok = false;
    _migState.ready = true;
    _migState.error = String(err && err.message ? err.message : err);
  }
}

function getMigrationsHealth() {
  return {
    ok: !!_migState.ok,
    ready: !!_migState.ready,
    appliedCount: _migState.appliedCount,
    applied: _migState.applied.slice(0, 50),
    error: _migState.error,
  };
}

module.exports = {
  runMigrations,
  getMigrationsHealth,
};
