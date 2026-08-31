#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const sqlite3 = require("sqlite3");
const { createPublicationAgentRightsRepo } = require("../../db/publicationAgentRightsRepo");
const { loadManifest, resolveLearningSupport } = require("../../materials/materialsPb2LearningSupport");

const SLUG = "materials-science-year1-problem-book-2";
const BASIS = "OWNER_ATTESTATION_MATERIALS_PB2_2026_08_30";
const ASSERTED_AT = "2026-08-30";

function parseArgs(argv) {
  const out = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db-path") out.dbPath = argv[++index];
    else if (arg === "--edition-id") out.editionId = argv[++index];
    else if (arg === "--expected-manifest-sha256") out.manifestSha256 = argv[++index];
    else if (arg === "--owner-id") out.ownerId = argv[++index];
    else if (arg === "--idempotency-key") out.idempotencyKey = argv[++index];
    else if (arg === "--apply") out.apply = true;
    else throw new Error(`UNKNOWN_ARG:${arg}`);
  }
  for (const key of ["dbPath", "editionId", "manifestSha256", "ownerId", "idempotencyKey"])
    if (!out[key]) throw new Error(`MISSING_OPTION:${key}`);
  if (!/^[a-f0-9]{64}$/.test(out.manifestSha256)) throw new Error("MANIFEST_SHA256_INVALID");
  if (!/^[A-Za-z0-9_.:-]{1,140}$/.test(out.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_INVALID");
  return out;
}

function buildFacts(manifest, useClass) {
  if (!new Set(["DISCOVER", "DERIVATIVE_TEXT"]).has(useClass)) throw new Error("USE_CLASS_INVALID");
  return manifest.tasks.map(entry => ({ targetKind: "EDITION_ITEM", targetId: entry.edition_item_id,
    useClass, allowed: true, basis: BASIS, assertedAt: ASSERTED_AT }));
}

const open = (file, mode) => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, mode, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(() => resolve()));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const manifest = loadManifest();
  if (manifest.edition.edition_id !== options.editionId || manifest.edition.manifest_sha256 !== options.manifestSha256
    || manifest.rights?.agent_derivative_text_allowed !== true || manifest.tasks.length !== 60)
    throw new Error("SUPPORT_MANIFEST_EDITION_MISMATCH");
  const db = await open(path.resolve(options.dbPath), options.apply ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY);
  try {
    if (options.apply) await exec(db, "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    const owner = await get(db, "SELECT id,role FROM users WHERE id=?", [options.ownerId]);
    if (!owner || String(owner.role).toLowerCase() !== "owner") throw new Error("OWNER_AUTHORITY_REQUIRED");
    const edition = await get(db, `SELECT c.slug,c.status,c.current_edition_id,e.edition_id,e.edition_number,e.manifest_sha256,e.item_count
      FROM published_corpora c JOIN published_corpus_editions e ON e.edition_id=c.current_edition_id
      WHERE c.slug=? AND c.status='PUBLISHED' AND e.edition_id=?`, [SLUG, options.editionId]);
    if (!edition || edition.current_edition_id !== options.editionId || edition.manifest_sha256 !== options.manifestSha256
      || Number(edition.edition_number) !== Number(manifest.edition.edition_number) || Number(edition.item_count) !== 60)
      throw new Error("CURRENT_EDITION_EXACT_MATCH_REQUIRED");
    const scopeSql = (await get(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_connection_grants'"))?.sql || "";
    if (!scopeSql.includes("reading.publication.derivative.read")) throw new Error("MIGRATION_066_REQUIRED");
    const rows = await all(db, `SELECT edition_item_id,public_work_id,snapshot_sha256,snapshot_json FROM published_corpus_edition_items
      WHERE edition_id=? AND public_read_allowed=1 ORDER BY position_no,edition_item_id`, [options.editionId]);
    if (rows.length !== 60) throw new Error("MATERIALS_EDITION_ITEM_COUNT_MISMATCH");
    const byId = new Map(rows.map(row => [row.edition_item_id, row]));
    for (const entry of manifest.tasks) {
      const row = byId.get(entry.edition_item_id);
      if (!row || row.public_work_id !== entry.public_work_id || row.snapshot_sha256 !== entry.snapshot_sha256)
        throw new Error(`MATERIALS_SUPPORT_ANCHOR_MISMATCH:${entry.task_id}`);
      resolveLearningSupport({ slug: SLUG, editionId: edition.edition_id, editionNumber: edition.edition_number,
        editionManifestSha256: edition.manifest_sha256, editionItemId: row.edition_item_id, publicWorkId: row.public_work_id,
        snapshotSha256: row.snapshot_sha256, snapshot: row.snapshot_json });
    }
    const batches = [
      { suffix: "discover", facts: buildFacts(manifest, "DISCOVER") },
      { suffix: "derivative", facts: buildFacts(manifest, "DERIVATIVE_TEXT") },
    ];
    const planSha256 = crypto.createHash("sha256").update(JSON.stringify(batches.map(batch => batch.facts))).digest("hex");
    const report = { ok: true, mode: options.apply ? "APPLY" : "DRY_RUN", corpus_slug: SLUG,
      edition_id: edition.edition_id, manifest_sha256: edition.manifest_sha256, items: rows.length,
      planned_facts: 120, planned_batches: 2, plan_sha256: planSha256,
      discover_allowed: true, derivative_text_allowed: true, source_text_allowed: false, source_binary_allowed: false,
      support_files_verified: manifest.tasks.length, applied_facts: 0 };
    if (options.apply) {
      const rightsRepo = createPublicationAgentRightsRepo({ db });
      for (const batch of batches) {
        const receipt = await rightsRepo.applyFacts({ id: owner.id, role: owner.role },
          { editionId: edition.edition_id, facts: batch.facts }, { idempotencyKey: `${options.idempotencyKey}-${batch.suffix}` });
        report.applied_facts += receipt.applied;
      }
      const readback = {};
      for (const useClass of ["DISCOVER", "DERIVATIVE_TEXT", "SOURCE_TEXT", "SOURCE_BINARY"]) {
        const row = await get(db, `SELECT COUNT(*) n FROM published_corpus_edition_items i WHERE i.edition_id=? AND
          COALESCE((SELECT f.allowed FROM published_corpus_agent_rights_facts f WHERE f.edition_id=i.edition_id
            AND f.target_kind='EDITION_ITEM' AND f.target_id=i.edition_item_id AND f.use_class=?
            ORDER BY f.fact_seq DESC LIMIT 1),0)=1`, [edition.edition_id, useClass]);
        readback[useClass] = Number(row.n);
      }
      if (readback.DISCOVER !== 60 || readback.DERIVATIVE_TEXT !== 60
        || readback.SOURCE_TEXT !== 0 || readback.SOURCE_BINARY !== 0) throw new Error("AGENT_RIGHTS_READBACK_MISMATCH");
      report.readback = readback;
    }
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally { await close(db); }
}

if (require.main === module) main().catch(error => { process.stderr.write(`apply-materials-pb2-agent-rights: ${error.message}\n`); process.exitCode = 1; });
module.exports = { main, parseArgs, buildFacts, BASIS, ASSERTED_AT };
