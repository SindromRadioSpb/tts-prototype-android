#!/usr/bin/env node
"use strict";

// Creates a consistent SQLite backup copy, rehearses 063 up/down/reapply on
// that copy, and proves selected learner/private/group tables stay byte-logical
// identical. The source DB is opened read-only and is never migrated.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_TABLES = [
  "review_log", "learner_events", "learner_artifacts", "learner_artifact_meta",
  "reading_lists", "reading_list_items", "bookmarks", "notes", "word_status",
  "group_corpora", "group_corpus_works", "group_corpus_audio",
  "reading_groups", "reading_group_members",
];

function parseArgs(argv) {
  const out = {
    up: path.join(ROOT, "migrations", "063_publication_domain.sql"),
    down: path.join(ROOT, "migrations", "down", "063_publication_domain.sql"),
    keepCopy: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--db-path") out.dbPath = argv[++i];
    else if (arg === "--up") out.up = argv[++i];
    else if (arg === "--down") out.down = argv[++i];
    else if (arg === "--work-dir") out.workDir = argv[++i];
    else if (arg === "--keep-copy") out.keepCopy = true;
    else throw new Error(`UNKNOWN_ARG:${arg}`);
  }
  if (!out.dbPath) throw new Error("MISSING_OPTION:db-path");
  return out;
}

const open = (file, mode = sqlite3.OPEN_READWRITE) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(file, mode, error => error ? reject(error) : resolve(db));
});
const close = db => new Promise(resolve => db.close(() => resolve()));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

async function consistentCopy(sourcePath, copyPath) {
  const source = await open(sourcePath, sqlite3.OPEN_READONLY);
  try {
    await new Promise((resolve, reject) => {
      const backup = source.backup(copyPath, error => {
        if (error) return reject(error);
        backup.step(-1, stepError => stepError ? reject(stepError) : resolve());
      });
    });
  } finally { await close(source); }
}

async function tableFingerprint(db, table) {
  const exists = await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?", [table]);
  if (!exists) return null;
  const columns = (await all(db, `PRAGMA table_info("${table}")`)).map(column => column.name);
  const expressions = ["COUNT(*) AS rows"];
  for (const raw of columns) {
    const column = `"${raw.replace(/"/g, '""')}"`;
    const alias = raw.replace(/[^A-Za-z0-9_]/g, "_");
    expressions.push(`COALESCE(SUM(length(CAST(${column} AS BLOB))),0) AS "${alias}__bytes"`);
    expressions.push(`COALESCE(SUM(CASE WHEN typeof(${column}) IN ('integer','real') THEN CAST(${column} AS REAL) ELSE 0 END),0) AS "${alias}__numeric_sum"`);
  }
  const metrics = await get(db, `SELECT ${expressions.join(",")} FROM "${table}"`);
  const rows = Number(metrics.rows) || 0;
  return { rows, sha256: crypto.createHash("sha256").update(JSON.stringify(metrics)).digest("hex") };
}

async function sensitiveFingerprint(db) {
  const out = {};
  for (const table of DEFAULT_TABLES) {
    const fact = await tableFingerprint(db, table);
    if (fact) out[table] = fact;
  }
  return out;
}

async function publicationTableCount(db) {
  return Number((await get(db, `SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND
    (name LIKE 'publication_%' OR name LIKE 'published_corp%')`)).n);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const sourcePath = path.resolve(options.dbPath);
  const workDir = options.workDir ? path.resolve(options.workDir) : fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-migration-"));
  fs.mkdirSync(workDir, { recursive: true });
  const copyPath = path.join(workDir, "production-like.db");
  await consistentCopy(sourcePath, copyPath);
  const copy = await open(copyPath);
  const upSql = fs.readFileSync(path.resolve(options.up), "utf8");
  const downSql = fs.readFileSync(path.resolve(options.down), "utf8");
  try {
    await exec(copy, "PRAGMA foreign_keys=ON");
    const integrityBefore = await get(copy, "PRAGMA integrity_check");
    const before = await sensitiveFingerprint(copy);
    await exec(copy, upSql);
    const afterUp = await sensitiveFingerprint(copy);
    const tablesAfterUp = await publicationTableCount(copy);
    await exec(copy, downSql);
    const afterDown = await sensitiveFingerprint(copy);
    const tablesAfterDown = await publicationTableCount(copy);
    await exec(copy, upSql);
    const afterReapply = await sensitiveFingerprint(copy);
    const tablesAfterReapply = await publicationTableCount(copy);
    const integrityAfter = await get(copy, "PRAGMA integrity_check");
    if (integrityBefore.integrity_check !== "ok" || integrityAfter.integrity_check !== "ok") throw new Error("INTEGRITY_CHECK_FAILED");
    if (JSON.stringify(before) !== JSON.stringify(afterUp) || JSON.stringify(before) !== JSON.stringify(afterDown) || JSON.stringify(before) !== JSON.stringify(afterReapply)) throw new Error("SENSITIVE_FINGERPRINT_CHANGED");
    if (tablesAfterUp < 10 || tablesAfterDown !== 0 || tablesAfterReapply !== tablesAfterUp) throw new Error("MIGRATION_TABLE_SET_INVALID");
    const report = {
      ok: true,
      source_bytes: fs.statSync(sourcePath).size,
      copy_bytes: fs.statSync(copyPath).size,
      sensitive: before,
      publication_tables: { after_up: tablesAfterUp, after_down: tablesAfterDown, after_reapply: tablesAfterReapply },
      integrity: { before: integrityBefore.integrity_check, after: integrityAfter.integrity_check },
      copy_path: options.keepCopy ? copyPath : null,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await close(copy);
    if (!options.keepCopy && !options.workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch(error => { process.stderr.write(`publication-migration-rehearsal: ${error.message}\n`); process.exitCode = 1; });
module.exports = { main, parseArgs, sensitiveFingerprint };
