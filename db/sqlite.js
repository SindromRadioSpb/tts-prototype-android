"use strict";

// --------------------------------------------------------
// SQLite foundation (single-user).
// Goals:
// - Safe init: DB failures must NOT crash the process.
// - DB is the source of truth for Library/Progress.
// - Minimal API: initDb(), getDb(), getDbHealth().
// --------------------------------------------------------

const fs = require("fs");
const path = require("path");

let sqlite3;
try {
  // Lazy require: allows the process to boot even if dependency missing during early setup.
  // In normal operation, sqlite3 MUST be installed.
  sqlite3 = require("sqlite3");
} catch (e) {
  sqlite3 = null;
}

/** @type {import('sqlite3').Database | null} */
let _db = null;

const _state = {
  ok: false,
  ready: false,
  dbPath: null,
  error: null,
};

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function openDb(dbPath) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) {
      reject(new Error("sqlite3 dependency is not installed"));
      return;
    }
    const db = new sqlite3.Database(
      dbPath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      (err) => {
        if (err) reject(err);
        else resolve(db);
      }
    );
  });
}

function exec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initDb(dbPath) {
  // idempotent
  if (_state.ready) return;

  _state.dbPath = dbPath;
  _state.error = null;
  _state.ok = false;
  _state.ready = false;

  try {
    ensureDirForFile(dbPath);
    _db = await openDb(dbPath);

    // Enforce FK constraints.
    await exec(_db, "PRAGMA foreign_keys = ON;");

    // Minimal ping.
    await get(_db, "SELECT 1 AS one;");

    _state.ok = true;
    _state.ready = true;
  } catch (err) {
    _db = null;
    _state.ok = false;
    _state.ready = true; // we attempted init; do not keep retrying automatically
    _state.error = String(err && err.message ? err.message : err);
  }
}

function getDb() {
  if (!_db) throw new Error("DB not initialized. Call initDb(dbPath) first.");
  return _db;
}

function getDbHealth() {
  return {
    ok: !!_state.ok,
    ready: !!_state.ready,
    dbPath: _state.dbPath,
    error: _state.error,
  };
}

async function closeDb() {
  const db = _db;
  _db = null;
  if (!db) return;

  await new Promise((resolve) => {
    db.close(() => resolve());
  });
}

module.exports = {
  initDb,
  getDb,
  getDbHealth,
  // helpers exposed for future repos/migrations
  _exec: exec,
  _get: get,
  closeDb,
};
