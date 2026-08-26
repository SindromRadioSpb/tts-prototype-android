#!/usr/bin/env node
"use strict";

// Rehearses migration 065 on a SQLite backup copy. The source database is
// opened read-only and is never migrated. No paths are emitted unless the
// operator explicitly asks to keep the temporary copy.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");

const ROOT = path.resolve(__dirname, "..", "..");
const UP = path.join(ROOT, "migrations", "065_publication_agent_access.sql");
const DOWN = path.join(ROOT, "migrations", "down", "065_publication_agent_access.sql");
const PROTECTED_TABLES = [
  "agent_connection_grants", "published_corpora", "published_corpus_editions",
  "published_corpus_edition_items", "published_corpus_assets",
  "physics_task_resources", "physics_task_resource_revisions", "physics_task_resource_rights_facts",
  "review_log", "learner_events", "learner_artifacts", "reading_lists", "reading_list_items",
  "bookmarks", "notes", "word_status", "group_corpora", "group_corpus_works",
  "reading_groups", "reading_group_members",
];

function parseArgs(argv) {
  const out = { keepCopy: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db-path") out.dbPath = argv[++index];
    else if (arg === "--work-dir") out.workDir = argv[++index];
    else if (arg === "--keep-copy") out.keepCopy = true;
    else throw new Error(`UNKNOWN_ARG:${arg}`);
  }
  if (!out.dbPath) throw new Error("MISSING_OPTION:db-path");
  return out;
}

const open = (file, mode) => new Promise((resolve, reject) => {
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

async function tableDigest(db, table) {
  if (!await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?", [table])) return null;
  const columns = (await all(db, `PRAGMA table_info("${table}")`)).map(row => row.name);
  const order = columns.map(name => `"${name.replace(/"/g, '""')}"`).join(",");
  const rows = await all(db, `SELECT * FROM "${table}" ORDER BY ${order}`);
  return { rows: rows.length, sha256: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
async function protectedFingerprint(db) {
  const result = {};
  for (const table of PROTECTED_TABLES) {
    const value = await tableDigest(db, table);
    if (value) result[table] = value;
  }
  return result;
}
async function has065(db) {
  return !!await get(db, "SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='published_corpus_agent_rights_facts'");
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const sourcePath = path.resolve(options.dbPath);
  const workDir = options.workDir ? path.resolve(options.workDir) : fs.mkdtempSync(path.join(os.tmpdir(), "lp-publication-agent-rehearsal-"));
  fs.mkdirSync(workDir, { recursive: true });
  const copyPath = path.join(workDir, "production-like.db");
  await consistentCopy(sourcePath, copyPath);
  const copy = await open(copyPath, sqlite3.OPEN_READWRITE);
  try {
    await exec(copy, "PRAGMA foreign_keys=ON");
    if (await has065(copy)) {
      const facts = Number((await get(copy, "SELECT COUNT(*) n FROM published_corpus_agent_rights_facts")).n);
      const grants = Number((await get(copy, `SELECT COUNT(*) n FROM agent_connection_grants WHERE scope IN
        ('reading.publication.catalog.read','reading.publication.item.read','reading.publication.resource.read')`)).n);
      if (facts || grants) throw new Error("SOURCE_COPY_HAS_065_DATA_DOWN_FORBIDDEN");
      await exec(copy, fs.readFileSync(DOWN, "utf8"));
    }
    const integrityBefore = await get(copy, "PRAGMA integrity_check");
    const before = await protectedFingerprint(copy);
    await exec(copy, fs.readFileSync(UP, "utf8"));
    const afterUp = await protectedFingerprint(copy);
    await exec(copy, fs.readFileSync(DOWN, "utf8"));
    const afterDown = await protectedFingerprint(copy);
    await exec(copy, fs.readFileSync(UP, "utf8"));
    const afterReapply = await protectedFingerprint(copy);
    const integrityAfter = await get(copy, "PRAGMA integrity_check");
    if (integrityBefore.integrity_check !== "ok" || integrityAfter.integrity_check !== "ok") throw new Error("INTEGRITY_CHECK_FAILED");
    const baseline = JSON.stringify(before);
    if ([afterUp, afterDown, afterReapply].some(value => JSON.stringify(value) !== baseline)) throw new Error("PROTECTED_FINGERPRINT_CHANGED");
    const report = {
      ok: true,
      source_open_mode: "READ_ONLY",
      source_bytes: fs.statSync(sourcePath).size,
      protected_tables: Object.keys(before).length,
      protected_rows: Object.values(before).reduce((sum, value) => sum + value.rows, 0),
      cycles: ["UP", "DOWN", "UP"],
      integrity: { before: integrityBefore.integrity_check, after: integrityAfter.integrity_check },
      rights_facts_created: 0,
      owner_data_writes: 0,
      copy_path: options.keepCopy ? copyPath : null,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally {
    await close(copy);
    if (!options.keepCopy && !options.workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch(error => { process.stderr.write(`publication-agent-access-migration-rehearsal: ${error.message}\n`); process.exitCode = 1; });
module.exports = { main, parseArgs, protectedFingerprint };
