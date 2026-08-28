#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");
const { createPublicationAgentRightsRepo } = require("../../db/publicationAgentRightsRepo");
const { loadManifest, resolveLearningSupport } = require("../../physics/physicsYear1LearningSupport");

const SLUG = "physics-year1-problems";
const BASIS = "OWNER_APPROVAL_PHYSICS_YEAR1_R12_2026_08_28";
const ASSERTED_AT = "2026-08-28";

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
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(out.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_INVALID");
  return out;
}

const open = (file, mode) => new Promise((resolve, reject) => { const db = new sqlite3.Database(file, mode, error => error ? reject(error) : resolve(db)); });
const close = db => new Promise(resolve => db.close(() => resolve()));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null)));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || [])));

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const manifest = loadManifest();
  if (manifest.edition.edition_id !== options.editionId || manifest.edition.manifest_sha256 !== options.manifestSha256)
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
      || Number(edition.edition_number) !== Number(manifest.edition.edition_number) || Number(edition.item_count) !== 74)
      throw new Error("CURRENT_EDITION_EXACT_MATCH_REQUIRED");
    const scopeSql = (await get(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_connection_grants'"))?.sql || "";
    if (!scopeSql.includes("reading.publication.derivative.read")) throw new Error("MIGRATION_066_REQUIRED");
    const rows = await all(db, `SELECT edition_item_id,public_work_id,snapshot_sha256,snapshot_json FROM published_corpus_edition_items
      WHERE edition_id=? AND public_read_allowed=1 ORDER BY position_no,edition_item_id`, [options.editionId]);
    if (rows.length !== 74) throw new Error("PHYSICS_EDITION_ITEM_COUNT_MISMATCH");
    const byId = new Map(rows.map(row => [row.edition_item_id, row]));
    for (const entry of manifest.tasks) {
      const row = byId.get(entry.edition_item_id);
      if (!row || row.public_work_id !== entry.public_work_id || row.snapshot_sha256 !== entry.snapshot_sha256)
        throw new Error(`PHYSICS_SUPPORT_ANCHOR_MISMATCH:${entry.task_number}`);
      resolveLearningSupport({ slug: SLUG, editionId: edition.edition_id, editionNumber: edition.edition_number,
        editionManifestSha256: edition.manifest_sha256, editionItemId: row.edition_item_id, publicWorkId: row.public_work_id,
        snapshotSha256: row.snapshot_sha256, snapshot: row.snapshot_json });
    }
    const facts = manifest.tasks.map(entry => ({ targetKind: "EDITION_ITEM", targetId: entry.edition_item_id,
      useClass: "DERIVATIVE_TEXT", allowed: true, basis: BASIS, assertedAt: ASSERTED_AT }));
    const planSha256 = crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    const report = { ok: true, mode: options.apply ? "APPLY" : "DRY_RUN", corpus_slug: SLUG,
      edition_id: edition.edition_id, manifest_sha256: edition.manifest_sha256, items: rows.length,
      planned_facts: facts.length, plan_sha256: planSha256, derivative_text_allowed: true,
      support_files_verified: manifest.tasks.length, applied_facts: 0 };
    if (options.apply) {
      const receipt = await createPublicationAgentRightsRepo({ db }).applyFacts({ id: owner.id, role: owner.role },
        { editionId: edition.edition_id, facts }, { idempotencyKey: options.idempotencyKey });
      report.applied_facts = receipt.applied;
      const allowed = await get(db, `SELECT COUNT(*) n FROM published_corpus_edition_items i WHERE i.edition_id=? AND
        COALESCE((SELECT f.allowed FROM published_corpus_agent_rights_facts f WHERE f.edition_id=i.edition_id
          AND f.target_kind='EDITION_ITEM' AND f.target_id=i.edition_item_id AND f.use_class='DERIVATIVE_TEXT'
          ORDER BY f.fact_seq DESC LIMIT 1),0)=1`, [edition.edition_id]);
      if (Number(allowed.n) !== 74) throw new Error("DERIVATIVE_RIGHTS_READBACK_MISMATCH");
    }
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report;
  } finally { await close(db); }
}

if (require.main === module) main().catch(error => { process.stderr.write(`apply-physics-learning-support-agent-rights: ${error.message}\n`); process.exitCode = 1; });
module.exports = { main, parseArgs, BASIS, ASSERTED_AT };
