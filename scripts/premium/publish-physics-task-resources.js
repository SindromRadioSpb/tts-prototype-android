"use strict";

// Controlled owner batch for PHYSICS-SOLUTION-DOCUMENTS-R2.
// Default is an inventory-only dry run. --apply additionally requires the exact
// rights/PII attestation fields below and delegates every write to the one repo.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { createPhysicsTaskResourceRepo } = require("../../db/physicsTaskResourceRepo");
const { sensitiveFingerprint } = require("./publication-migration-rehearsal");

const SLUG = "physics-year1-problems";
const EXPECTED_COUNTS = Object.freeze({ 1: 10, 2: 3, 3: 8, 4: 14, 5: 3, 6: 12, 7: 8, 8: 5, 9: 11 });
const EXPECTED_TOTAL = Object.values(EXPECTED_COUNTS).reduce((sum, value) => sum + value, 0);
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const open = file => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(resolve));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

function parseArgs(argv) {
  const out = { apply: false, publicRead: null, agentRead: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--apply") out.apply = true;
    else if (key === "--db-path") out.dbPath = argv[++index];
    else if (key === "--data-dir") out.dataDir = argv[++index];
    else if (key === "--solutions-dir") out.solutionsDir = argv[++index];
    else if (key === "--conditions-dir") out.conditionsDir = argv[++index];
    else if (key === "--owner-user-id") out.ownerUserId = argv[++index];
    else if (key === "--rights-basis") out.rightsBasis = argv[++index];
    else if (key === "--rights-asserted-at") out.rightsAssertedAt = argv[++index];
    else if (key === "--i-have-rights") out.haveRights = argv[++index];
    else if (key === "--pii-review") out.piiReview = argv[++index];
    else if (key === "--public-read") out.publicRead = argv[++index];
    else if (key === "--agent-read") out.agentRead = argv[++index];
    else if (key === "--quality-1-10") out.quality110 = argv[++index];
    else throw new Error("UNKNOWN_ARG:" + key);
  }
  for (const key of ["dbPath", "dataDir", "solutionsDir", "conditionsDir"]) if (!out[key]) throw new Error("MISSING_OPTION:" + key);
  if (out.apply) {
    for (const key of ["ownerUserId", "rightsBasis", "rightsAssertedAt", "haveRights", "piiReview", "publicRead", "agentRead", "quality110"])
      if (!out[key]) throw new Error("ATTESTATION_FIELD_REQUIRED:" + key);
    if (out.haveRights !== "YES" || out.piiReview !== "PASS" || out.publicRead !== "YES" || !["YES", "NO"].includes(out.agentRead)
      || !["ACCEPT", "RESCAN"].includes(out.quality110) || !/^\d{4}-\d{2}-\d{2}$/.test(out.rightsAssertedAt)) throw new Error("ATTESTATION_INVALID");
    if (out.quality110 === "RESCAN") throw new Error("QUALITY_EXCEPTION_1_10_RESCAN_REQUIRED");
  }
  return out;
}

function expectedTaskNumbers() {
  return Object.entries(EXPECTED_COUNTS).flatMap(([chapter, count]) => Array.from({ length: count }, (_, index) => `${chapter}.${index + 1}`));
}

function inventoryFolder(directory, contentKind) {
  const root = path.resolve(directory);
  const names = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return names.map(name => {
    const match = /^(\d+\.\d+)\.pdf$/i.exec(name);
    if (!match) throw new Error("UNEXPECTED_SOURCE_FILENAME:" + name);
    const sourcePath = path.join(root, name); const body = fs.readFileSync(sourcePath);
    if (body.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("SOURCE_PDF_INVALID:" + name);
    if (body.length < 1 || body.length > 25 * 1024 * 1024) throw new Error("SOURCE_PDF_SIZE_INVALID:" + name);
    return { task_number: match[1], source_path: sourcePath, source_filename: name, content_kind: contentKind, bytes: body.length, sha256: sha256(body) };
  });
}

function buildInventory(options) {
  const files = inventoryFolder(options.solutionsDir, "CONDITION_AND_SOLUTION").concat(inventoryFolder(options.conditionsDir, "CONDITION_ONLY"));
  const numbers = files.map(file => file.task_number);
  const duplicates = [...new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index))];
  const expected = expectedTaskNumbers();
  const missing = expected.filter(number => !numbers.includes(number));
  const unexpected = numbers.filter(number => !expected.includes(number));
  if (files.length !== EXPECTED_TOTAL || duplicates.length || missing.length || unexpected.length) throw new Error("SOURCE_BATCH_COVERAGE_INVALID:" + JSON.stringify({ count: files.length, duplicates, missing, unexpected }));
  const solutionCount = files.filter(file => file.content_kind === "CONDITION_AND_SOLUTION").length;
  const conditionCount = files.filter(file => file.content_kind === "CONDITION_ONLY").length;
  if (solutionCount !== 32 || conditionCount !== 42) throw new Error("SOURCE_BATCH_KIND_COUNTS_INVALID");
  return files.sort((a, b) => expected.indexOf(a.task_number) - expected.indexOf(b.task_number));
}

function taskMeta(snapshotJson) {
  const snapshot = JSON.parse(snapshotJson); const text = snapshot && snapshot.library && snapshot.library.texts && snapshot.library.texts[0];
  const meta = text && text.source_meta && text.source_meta.physics_task;
  if (!meta || !/^\d+\.\d+$/.test(String(meta.task_number || ""))) throw new Error("PUBLISHED_TASK_METADATA_INVALID");
  return meta;
}

async function ownerActor(db, ownerId) {
  const row = await get(db, "SELECT id,role FROM users WHERE id=? AND lower(role)='owner'", [String(ownerId || "")]);
  if (!row) throw new Error("OWNER_USER_NOT_FOUND");
  return row;
}

async function currentPhysicsEdition(db) {
  const corpus = await get(db, `SELECT corpus_id,current_edition_id FROM published_corpora WHERE slug=? AND status='PUBLISHED'`, [SLUG]);
  if (!corpus || !corpus.current_edition_id) throw new Error("PHYSICS_PUBLIC_EDITION_NOT_FOUND");
  const rows = await all(db, `SELECT public_work_id,snapshot_sha256,snapshot_json FROM published_corpus_edition_items WHERE edition_id=? AND public_read_allowed=1 ORDER BY position_no`, [corpus.current_edition_id]);
  if (rows.length !== EXPECTED_TOTAL) throw new Error("PHYSICS_PUBLIC_EDITION_COUNT_INVALID");
  const byTask = new Map(rows.map(row => [String(taskMeta(row.snapshot_json).task_number), row]));
  if (byTask.size !== EXPECTED_TOTAL) throw new Error("PHYSICS_PUBLIC_EDITION_TASK_MAP_INVALID");
  return { ...corpus, byTask };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const inventory = buildInventory(options);
  const db = await open(path.resolve(options.dbPath));
  try {
    const edition = await currentPhysicsEdition(db);
    const summary = {
      mode: options.apply ? "APPLY" : "DRY_RUN",
      slug: SLUG,
      corpus_id: edition.corpus_id,
      edition_id: edition.current_edition_id,
      files: inventory.length,
      solution_files: inventory.filter(file => file.content_kind === "CONDITION_AND_SOLUTION").length,
      condition_only_files: inventory.filter(file => file.content_kind === "CONDITION_ONLY").length,
      bytes: inventory.reduce((sum, file) => sum + file.bytes, 0),
      originals_preserved: true,
      quality_exception_1_10: options.quality110 || "UNATTESTED",
      public_read: options.publicRead || "UNATTESTED",
      agent_read: options.agentRead || "UNATTESTED",
    };
    if (!options.apply) { process.stdout.write(JSON.stringify(summary, null, 2) + "\n"); return summary; }
    const migration = await get(db, "SELECT 1 ok FROM schema_migrations WHERE version='064_physics_task_resources'");
    if (!migration) throw new Error("PHYSICS_RESOURCE_MIGRATION_NOT_APPLIED");
    const actor = await ownerActor(db, options.ownerUserId);
    const before = await sensitiveFingerprint(db);
    const repo = createPhysicsTaskResourceRepo({ db, dataDir: path.resolve(options.dataDir) });
    const receipts = [];
    for (const file of inventory) {
      const work = edition.byTask.get(file.task_number);
      receipts.push(await repo.publishPdf(actor, {
        corpusId: edition.corpus_id, editionId: edition.current_edition_id, publicWorkId: work.public_work_id,
        workSnapshotSha256: work.snapshot_sha256, logicalKey: "owner-scan", contentKind: file.content_kind,
        title: file.content_kind === "CONDITION_AND_SOLUTION" ? `Условие и решение ${file.task_number}` : `Оригинал условия ${file.task_number}`,
        language: "MULTI", sourcePath: file.source_path, expectedSha256: file.sha256, expectedBytes: file.bytes,
        qualityStatus: file.task_number === "1.10" ? "QUALITY_LIMITED" : "ORIGINAL", rightsBasis: options.rightsBasis,
        rightsAssertedAt: options.rightsAssertedAt, publicReadAllowed: true, agentReadAllowed: options.agentRead === "YES",
      }, { idempotencyKey: `physics-task-resource-20260826-${file.task_number}-${file.sha256.slice(0, 16)}` }));
    }
    const after = await sensitiveFingerprint(db);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("LEARNER_PRIVATE_REVIEW_CHANGED");
    const result = { ok: true, ...summary, published: receipts.length, learner_private_review_unchanged: true,
      aggregate_sha256: sha256(Buffer.from(receipts.map(row => row.sha256).join("\n"), "utf8")) };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n"); return result;
  } finally { await close(db); }
}

if (require.main === module) main().catch(error => { process.stderr.write("publish-physics-task-resources: " + error.message + "\n"); process.exitCode = 1; });
module.exports = { SLUG, EXPECTED_COUNTS, EXPECTED_TOTAL, parseArgs, expectedTaskNumbers, inventoryFolder, buildInventory, main };
