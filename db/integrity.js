"use strict";

// --------------------------------------------------------
// Database integrity check utilities.
// - Verifies SQLite integrity (PRAGMA integrity_check)
// - Checks core tables exist
// - Non-blocking: logs warnings but doesn't crash
// --------------------------------------------------------

const path = require("path");

// Core tables that must exist for the app to function
const CORE_TABLES = [
  "v3_bootstrap",       // Migration tracking
  "texts",              // Library texts
  "sentences",          // Library sentences
  "text_progress",      // Progress tracking
];

// Optional tables (app works without them, but they should exist after migrations)
const OPTIONAL_TABLES = [
  "audio_assets",
  "sentence_audio",
  "text_audio",
  "history_events",
  "recent_rows",
  "recent_texts",
  "sentence_notes",
];

/**
 * Run SQLite's built-in integrity check.
 * @param {import('sqlite3').Database} db
 * @returns {Promise<{ ok: boolean, result?: string, error?: string }>}
 */
async function runIntegrityCheck(db) {
  return new Promise((resolve) => {
    db.get("PRAGMA integrity_check;", [], (err, row) => {
      if (err) {
        resolve({ ok: false, error: String(err.message || err) });
        return;
      }

      const result = row && row.integrity_check ? row.integrity_check : "unknown";
      resolve({
        ok: result === "ok",
        result,
      });
    });
  });
}

/**
 * Check which tables exist in the database.
 * @param {import('sqlite3').Database} db
 * @returns {Promise<{ ok: boolean, tables?: string[], error?: string }>}
 */
async function getExistingTables(db) {
  return new Promise((resolve) => {
    db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
      [],
      (err, rows) => {
        if (err) {
          resolve({ ok: false, error: String(err.message || err) });
          return;
        }

        const tables = (rows || []).map((r) => r.name);
        resolve({ ok: true, tables });
      }
    );
  });
}

/**
 * Check if core tables exist.
 * @param {import('sqlite3').Database} db
 * @returns {Promise<{ ok: boolean, missing?: string[], present?: string[], error?: string }>}
 */
async function checkCoreTables(db) {
  const tablesResult = await getExistingTables(db);
  if (!tablesResult.ok) {
    return { ok: false, error: tablesResult.error };
  }

  const existing = new Set(tablesResult.tables || []);
  const missing = CORE_TABLES.filter((t) => !existing.has(t));
  const present = CORE_TABLES.filter((t) => existing.has(t));

  return {
    ok: missing.length === 0,
    missing,
    present,
  };
}

/**
 * Check optional tables.
 * @param {import('sqlite3').Database} db
 * @returns {Promise<{ missing?: string[], present?: string[], error?: string }>}
 */
async function checkOptionalTables(db) {
  const tablesResult = await getExistingTables(db);
  if (!tablesResult.ok) {
    return { error: tablesResult.error };
  }

  const existing = new Set(tablesResult.tables || []);
  const missing = OPTIONAL_TABLES.filter((t) => !existing.has(t));
  const present = OPTIONAL_TABLES.filter((t) => existing.has(t));

  return { missing, present };
}

/**
 * Get database stats (counts of key entities).
 * @param {import('sqlite3').Database} db
 * @returns {Promise<{ ok: boolean, stats?: Object, error?: string }>}
 */
async function getDatabaseStats(db) {
  return new Promise((resolve) => {
    // Safe queries that won't fail if tables don't exist
    const queries = [
      { name: "texts", sql: "SELECT COUNT(*) as count FROM texts" },
      { name: "sentences", sql: "SELECT COUNT(*) as count FROM sentences" },
      { name: "notes", sql: "SELECT COUNT(*) as count FROM sentence_notes" },
    ];

    const stats = {};
    let completed = 0;
    let hasError = false;

    for (const q of queries) {
      db.get(q.sql, [], (err, row) => {
        completed++;

        if (!err && row) {
          stats[q.name] = row.count;
        } else {
          stats[q.name] = null; // Table may not exist
        }

        if (completed === queries.length && !hasError) {
          resolve({ ok: true, stats });
        }
      });
    }
  });
}

/**
 * Run full integrity check.
 * @param {import('sqlite3').Database} db
 * @returns {Promise<{ ok: boolean, integrity: Object, tables: Object, stats: Object, warnings: string[] }>}
 */
async function runFullCheck(db) {
  const warnings = [];

  // 1. SQLite integrity check
  const integrity = await runIntegrityCheck(db);
  if (!integrity.ok) {
    warnings.push(`SQLite integrity check failed: ${integrity.result || integrity.error}`);
  }

  // 2. Core tables check
  const tables = await checkCoreTables(db);
  if (!tables.ok && tables.missing && tables.missing.length > 0) {
    warnings.push(`Missing core tables: ${tables.missing.join(", ")}`);
  }

  // 3. Optional tables check
  const optionalTables = await checkOptionalTables(db);

  // 4. Stats
  const stats = await getDatabaseStats(db);

  const overallOk = integrity.ok && tables.ok;

  return {
    ok: overallOk,
    integrity,
    tables: {
      core: tables,
      optional: optionalTables,
    },
    stats: stats.stats || {},
    warnings,
  };
}

/**
 * Startup integrity check (non-blocking).
 * Logs warnings but doesn't throw.
 * @param {import('sqlite3').Database} db
 * @returns {Promise<{ ok: boolean, warnings: string[] }>}
 */
async function startupCheck(db) {
  try {
    const result = await runFullCheck(db);

    if (!result.ok) {
      console.warn("[integrity] Database issues detected:");
      for (const w of result.warnings) {
        console.warn(`  - ${w}`);
      }
    } else {
      const stats = result.stats || {};
      console.log(
        `[integrity] DB OK: ${stats.texts || 0} texts, ${stats.sentences || 0} sentences, ${stats.notes || 0} notes`
      );
    }

    return { ok: result.ok, warnings: result.warnings };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    console.warn(`[integrity] Startup check failed: ${msg}`);
    return { ok: false, warnings: [msg] };
  }
}

module.exports = {
  runIntegrityCheck,
  getExistingTables,
  checkCoreTables,
  checkOptionalTables,
  getDatabaseStats,
  runFullCheck,
  startupCheck,
  CORE_TABLES,
  OPTIONAL_TABLES,
};
